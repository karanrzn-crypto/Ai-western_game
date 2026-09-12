/**
 * src/engine/ThreeRendererAdapter.ts
 * -----------------------------------------------------------------------------
 * Concrete IRendererAdapter backed by three.js.
 *
 * Maintains an internal `Map<uuid, THREE.Object3D>` so it can cheaply
 * locate and update meshes when the registry emits transform changes.
 *
 * Geometry / material choice is driven by `assetType`. The shapes used
 * here are intentionally simple placeholders — swap them out for
 * GLTFLoader-loaded assets in a real production pipeline.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { IRendererAdapter, RendererChange } from './IRendererAdapter.js';
import type { AssetType, ObjectDefinition, Transform } from '../core/types.js';

export interface ThreeRendererAdapterOptions {
  /** A pre-existing Three.js scene. If omitted, a new one is created. */
  scene?: THREE.Scene;
  /** Provide a custom geometry/material per asset type. */
  assetFactory?: AssetFactory;
}

export interface AssetFactory {
  createMesh(assetType: AssetType, definition: ObjectDefinition): THREE.Object3D;
}

/**
 * Default asset factory — uses primitive geometries colored by type.
 * Walls are long boxes, chairs are short boxes, props are cylinders, etc.
 */
export class DefaultAssetFactory implements AssetFactory {
  createMesh(assetType: AssetType, _definition: ObjectDefinition): THREE.Object3D {
    switch (assetType) {
      case 'wall':
        return new THREE.Mesh(
          new THREE.BoxGeometry(4, 2, 0.2),
          new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
        );
      case 'door':
        return new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 2.4, 0.15),
          new THREE.MeshStandardMaterial({ color: 0x5a3a1a }),
        );
      case 'chair':
        return new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.9, 0.6),
          new THREE.MeshStandardMaterial({ color: 0xb58a4b }),
        );
      case 'table':
        return new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.9, 0.9),
          new THREE.MeshStandardMaterial({ color: 0x6b4423 }),
        );
      case 'barrel':
        return new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.5, 1.1, 16),
          new THREE.MeshStandardMaterial({ color: 0x3a2a1a }),
        );
      case 'ground':
        return new THREE.Mesh(
          new THREE.PlaneGeometry(50, 50),
          new THREE.MeshStandardMaterial({ color: 0x6b5530 }),
        );
      case 'cube':
        return new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: 0xc8b67a }),
        );
      case 'light':
        return new THREE.PointLight(0xffeeaa, 1.0, 12);
      case 'npc': {
        const mesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.3, 1.4, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0x884422 }),
        );
        mesh.position.y = 0.7;
        return mesh;
      }
      case 'prop':
      default: {
        return new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8),
          new THREE.MeshStandardMaterial({ color: 0x777777 }),
        );
      }
    }
  }
}

export class ThreeRendererAdapter implements IRendererAdapter {
  private readonly scene: THREE.Scene;
  private readonly factory: AssetFactory;
  /** uuid → Object3D. The renderer-side mirror of the registry. */
  private readonly meshes = new Map<string, THREE.Object3D>();

  constructor(options: ThreeRendererAdapterOptions = {}) {
    this.scene = options.scene ?? new THREE.Scene();
    this.factory = options.assetFactory ?? new DefaultAssetFactory();
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
        // Metadata changes do not require a mesh update in this adapter,
        // but we update the `name` property for debugging visibility.
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
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m.dispose();
        }
      });
    }
    this.meshes.clear();
  }

  // -------------------------------------------------- internals ----

  private handleAdd(def: ObjectDefinition): void {
    if (this.meshes.has(def.uuid)) {
      // Update instead of double-adding.
      this.handleTransform(def.uuid, def.transform);
      return;
    }
    const mesh = this.factory.createMesh(def.assetType, def);
    mesh.uuid = def.uuid; // mirror registry uuid onto the THREE object
    mesh.name = def.metadata.name;
    this.applyTransform(mesh, def.transform);
    this.scene.add(mesh);
    this.meshes.set(def.uuid, mesh);
  }

  private handleRemove(uuid: string): void {
    const mesh = this.meshes.get(uuid);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.traverse((child) => {
      const m = child as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat.dispose();
      }
    });
    this.meshes.delete(uuid);
  }

  private handleTransform(uuid: string, transform: Transform): void {
    const mesh = this.meshes.get(uuid);
    if (!mesh) {
      // Silently ignore — a stale change for an already-removed object.
      return;
    }
    this.applyTransform(mesh, transform);
  }

  private handleMetadata(uuid: string, metadata: ObjectDefinition['metadata']): void {
    const mesh = this.meshes.get(uuid);
    if (mesh) mesh.name = metadata.name;
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
}
