/**
 * src/engine/ThreeRendererAdapter.ts
 * -----------------------------------------------------------------------------
 * Concrete IRendererAdapter backed by three.js.
 *
 * Maintains an internal `Map<uuid, THREE.Object3D>` so it can cheaply
 * locate and update meshes when the registry emits transform changes.
 *
 * Asset creation is delegated to an injected AssetRegistry — this adapter
 * no longer holds its own asset factory. Adding a new asset type means
 * registering a factory in the AssetRegistry; the adapter and the state
 * manager are untouched.
 *
 * Async asset creation: the registry's `create()` may return a Promise
 * (e.g. for future GLTF loaders). The adapter handles that case by
 * awaiting the mesh in `syncObject` — but since `syncObject` itself is
 * synchronous (per the IRendererAdapter interface), we kick off the
 * await and apply the transform once the mesh resolves. In-flight
 * transforms/metadata changes are queued and applied when the mesh
 * arrives, so order is preserved.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { IRendererAdapter, RendererChange } from './IRendererAdapter.js';
import type { ObjectDefinition, ObjectMetadata, Transform } from '../core/types.js';
import type { AssetRegistry } from '../assets/AssetRegistry.js';
import { logger } from '../utils/Logger.js';

export interface ThreeRendererAdapterOptions {
  /** A pre-existing Three.js scene. If omitted, a new one is created. */
  scene?: THREE.Scene;
  /** Required: registry used to materialise assetType → THREE.Object3D. */
  assetRegistry: AssetRegistry;
}

interface PendingObjectState {
  transform?: Transform;
  metadata?: ObjectMetadata;
}

export class ThreeRendererAdapter implements IRendererAdapter {
  private readonly scene: THREE.Scene;
  private readonly assets: AssetRegistry;
  /** uuid → Object3D. The renderer-side mirror of the registry. */
  private readonly meshes = new Map<string, THREE.Object3D>();
  /** uuid → queued state while an async mesh is loading. */
  private readonly pending = new Map<string, PendingObjectState>();
  /** Set of uuids whose async mesh load is currently in-flight. */
  private readonly loading = new Set<string>();
  private readonly log = logger.child('three');

  constructor(options: ThreeRendererAdapterOptions) {
    if (!options.assetRegistry) {
      throw new Error('[ThreeRendererAdapter] assetRegistry is required');
    }
    this.scene = options.scene ?? new THREE.Scene();
    this.assets = options.assetRegistry;
  }

  /** The underlying three.js scene. Exposed so callers can attach cameras. */
  get threeScene(): THREE.Scene {
    return this.scene;
  }

  getActiveObjectCount(): number {
    return this.meshes.size;
  }

  /** All currently-tracked uuids (mirror of the registry). */
  getActiveUUIDs(): readonly string[] {
    return [...this.meshes.keys()];
  }

  syncObject(change: RendererChange): void {
    switch (change.kind) {
      case 'add':
        this.handleAdd(change.definition);
        break;
      case 'remove':
        this.handleRemove(change.uuid);
        break;
      case 'transform':
        this.handleTransform(change.uuid, change.transform);
        break;
      case 'metadata':
        this.handleMetadata(change.uuid, change.metadata);
        break;
    }
  }

  /**
   * Optional: tear down all meshes, geometries, and materials.
   * Safe to call multiple times.
   */
  dispose(): void {
    for (const [, obj] of this.meshes) {
      this.scene.remove(obj);
      this.disposeObject3D(obj);
    }
    this.meshes.clear();
    this.pending.clear();
    this.loading.clear();
  }

  // -------------------------------------------------- internals ----

  private handleAdd(def: ObjectDefinition): void {
    if (this.meshes.has(def.uuid)) {
      // Already there — just re-sync the transform.
      this.handleTransform(def.uuid, def.transform);
      return;
    }
    // Kick off (possibly async) asset creation.
    let mesh: THREE.Object3D | Promise<THREE.Object3D>;
    try {
      mesh = this.assets.create(def);
    } catch (err) {
      this.log.error('asset create() threw synchronously', {
        uuid: def.uuid,
        assetType: def.assetType,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (mesh instanceof Promise) {
      this.loading.add(def.uuid);
      mesh
        .then((resolved) => {
          // If the object was unregistered while the load was in flight,
          // the resolved mesh is a zombie — dispose it instead of adding it
          // to the scene (registry/renderer must stay in sync).
          if (!this.loading.has(def.uuid)) {
            this.log.warn('async asset resolved after removal — disposing zombie mesh', {
              uuid: def.uuid,
              assetType: def.assetType,
            });
            this.disposeObject3D(resolved);
            resolved.removeFromParent();
            return;
          }
          this.onMeshResolved(def, resolved);
        })
        .catch((err) => {
          this.loading.delete(def.uuid);
          this.pending.delete(def.uuid);
          this.log.error('asset create() promise rejected', {
            uuid: def.uuid,
            assetType: def.assetType,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      // Apply current known transform if already pending.
      if (this.pending.has(def.uuid)) {
        const p = this.pending.get(def.uuid)!;
        if (p.transform) {
          // Transform will be applied post-resolution in onMeshResolved.
        }
      } else {
        // Seed pending with the initial transform so any updates that
        // arrive before resolution are not lost.
        this.pending.set(def.uuid, { transform: def.transform, metadata: def.metadata });
      }
    } else {
      this.onMeshResolved(def, mesh);
    }
  }

  private onMeshResolved(def: ObjectDefinition, mesh: THREE.Object3D): void {
    // Guard against late resolution after removal (belt & braces with the
    // zombie check in handleAdd).
    if (!this.loading.has(def.uuid)) {
      this.disposeObject3D(mesh);
      return;
    }
    // Apply the initial transform.
    this.applyTransform(mesh, def.transform);
    mesh.uuid = def.uuid;
    mesh.name = def.metadata.name;
    this.scene.add(mesh);
    this.meshes.set(def.uuid, mesh);

    // Apply any queued state.
    const pending = this.pending.get(def.uuid);
    if (pending) {
      if (pending.transform) this.applyTransform(mesh, pending.transform);
      if (pending.metadata) mesh.name = pending.metadata.name;
      this.pending.delete(def.uuid);
    }
    this.loading.delete(def.uuid);
  }

  private handleRemove(uuid: string): void {
    // Cancel any in-flight load by clearing pending state.
    this.pending.delete(uuid);
    this.loading.delete(uuid);
    const mesh = this.meshes.get(uuid);
    if (!mesh) return;
    this.scene.remove(mesh);
    this.disposeObject3D(mesh);
    this.meshes.delete(uuid);
  }

  private handleTransform(uuid: string, transform: Transform): void {
    const mesh = this.meshes.get(uuid);
    if (!mesh) {
      // Mesh is still loading — queue the transform.
      if (this.loading.has(uuid)) {
        const p = this.pending.get(uuid) ?? {};
        p.transform = transform;
        this.pending.set(uuid, p);
      }
      return;
    }
    this.applyTransform(mesh, transform);
  }

  private handleMetadata(uuid: string, metadata: ObjectMetadata): void {
    const mesh = this.meshes.get(uuid);
    if (!mesh) {
      if (this.loading.has(uuid)) {
        const p = this.pending.get(uuid) ?? {};
        p.metadata = metadata;
        this.pending.set(uuid, p);
      }
      return;
    }
    mesh.name = metadata.name;
  }

  /**
   * Apply our plain-JS transform onto a THREE.Object3D.
   * Rotation comes in as degrees (per the schema) and is converted to radians.
   */
  private applyTransform(target: THREE.Object3D, t: Transform): void {
    target.position.set(t.position.x, t.position.y, t.position.z);
    target.rotation.set(
      THREE.MathUtils.degToRad(t.rotation.x),
      THREE.MathUtils.degToRad(t.rotation.y),
      THREE.MathUtils.degToRad(t.rotation.z),
    );
    target.scale.set(t.scale.x, t.scale.y, t.scale.z);
  }

  /**
   * Tear down one object's GPU resources. GEOMETRIES ONLY.
   *
   * Disposal contract (weak-laptop perf revision): the asset factories share
   * one process-lifetime material set per building module (see the SHARED
   * MATERIAL CACHE notes in StableMaterials/SaloonMaterials/BankMaterials/
   * SheriffMaterials). Disposing a removed object's materials would therefore
   * shred the cache every other def still renders with — three.js would
   * recompile the programs on next use, hitching the frame. Geometries stay
   * per-object and are disposed here as before; the shared materials live
   * until the process ends (a bounded, tiny set).
   * Safe to call multiple times.
   */
  private disposeObject3D(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
