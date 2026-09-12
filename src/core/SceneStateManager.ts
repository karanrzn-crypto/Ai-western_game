/**
 * src/core/SceneStateManager.ts
 * -----------------------------------------------------------------------------
 * Central state-driven scene registry.
 *
 * Responsibilities:
 *   - Maintain a Map<string, ObjectDefinition> of every object in the scene.
 *   - Be the ONLY mutator of object transforms (updateObjectTransform).
 *   - Notify a connected IRendererAdapter of changes so the engine only
 *     re-renders when state actually changes.
 *   - Provide lookup, filtering, and inspection helpers for callers
 *     (especially AI asset-placement agents).
 *
 * Invariants enforced:
 *   - uuid is unique and non-empty (validated on insert).
 *   - transform fields are always defined and finite numbers.
 *   - metadata.name is always a non-empty string.
 *   - The registry never directly mutates user-supplied input — objects are
 *     deep-cloned on insert so external mutation cannot corrupt state.
 * -----------------------------------------------------------------------------
 */

import type {
  ObjectDefinition,
  ObjectMetadata,
  PartialObjectDefinition,
  PartialTransform,
  Transform,
  AssetType,
} from './types.js';
import { DEFAULT_TRANSFORM } from './types.js';
import { generateUUID, isValidUUID } from '../utils/uuid.js';
import type { IRendererAdapter, RendererChange } from '../engine/IRendererAdapter.js';
import { deepClone, deepFreeze } from './clone.js';
import { mergeTransform, validateTransform } from './validators.js';

export interface SceneStateManagerOptions {
  /** Optional renderer adapter that mirrors registry state to 3D meshes. */
  renderer?: IRendererAdapter;
  /**
   * If true (default), updates call renderer.syncObject only when the
   * serialized transform has actually changed. Set false for debug builds.
   */
  dedupeRenders?: boolean;
}

export interface SceneSnapshot {
  objectCount: number;
  uuids: readonly string[];
  byAssetType: Readonly<Record<string, number>>;
}

/**
 * The state-driven scene manager.
 * Single instance per scene. Multi-scene setups should compose multiple
 * SceneStateManager instances.
 */
export class SceneStateManager {
  /** THE central registry. */
  private readonly registry = new Map<string, Readonly<ObjectDefinition>>();

  private readonly renderer?: IRendererAdapter;
  private readonly dedupeRenders: boolean;

  constructor(options: SceneStateManagerOptions = {}) {
    this.renderer = options.renderer;
    this.dedupeRenders = options.dedupeRenders ?? true;
  }

  // -------------------------------------------------- registration ----

  /**
   * Register a new object in the scene.
   * Accepts a partial definition — uuid, transform.scale, metadata fields
   * are filled in with defaults when omitted.
   * @returns the canonical, fully-populated ObjectDefinition (frozen).
   * @throws if uuid is supplied but already exists or malformed.
   */
  registerObject(input: PartialObjectDefinition & { uuid?: string }): Readonly<ObjectDefinition> {
    const uuid = input.uuid ?? generateUUID();
    if (!isValidUUID(uuid)) {
      throw new Error(`[SceneStateManager] Invalid UUID: "${uuid}"`);
    }
    if (this.registry.has(uuid)) {
      throw new Error(`[SceneStateManager] UUID already registered: ${uuid}`);
    }

    const definition = this.normalize({
      uuid,
      assetType: input.assetType ?? 'prop',
      transform: mergeTransform(DEFAULT_TRANSFORM, input.transform ?? {}),
      metadata: { name: input.metadata?.name ?? 'Unnamed', ...input.metadata },
    });

    this.registry.set(uuid, deepFreeze(deepClone(definition)));
    this.notifyRenderer({ kind: 'add', definition });
    return this.getObject(uuid)!;
  }

  /**
   * Remove an object from the registry and the renderer.
   * No-op (returns false) if the uuid is not registered.
   */
  unregisterObject(uuid: string): boolean {
    const existed = this.registry.delete(uuid);
    if (existed) this.notifyRenderer({ kind: 'remove', uuid });
    return existed;
  }

  /** Clear all objects. Renders a bulk remove to the renderer. */
  clear(): void {
    const uuids = [...this.registry.keys()];
    this.registry.clear();
    for (const uuid of uuids) this.notifyRenderer({ kind: 'remove', uuid });
  }

  // -------------------------------------------------- transforms -----

  /**
   * THE transformation API.
   * Applies a partial transform patch (any of position/rotation/scale) to
   * the object identified by uuid, then notifies the renderer.
   *
   * The engine re-renders or updates the mesh position ONLY when this
   * function is called. Direct mutation of the ObjectDefinition object is
   * blocked because we hand callers frozen snapshots.
   *
   * @returns the new full transform of the target object.
   * @throws if uuid is not registered.
   */
  updateObjectTransform(uuid: string, patch: PartialTransform): Readonly<Transform> {
    const existing = this.registry.get(uuid);
    if (!existing) {
      throw new Error(`[SceneStateManager] updateObjectTransform: unknown uuid ${uuid}`);
    }
    validateTransform(patch as Transform);

    const oldTransform = existing.transform;
    const newTransform = mergeTransform(oldTransform, patch);

    if (this.dedupeRenders && serializeTransform(oldTransform) === serializeTransform(newTransform)) {
      return oldTransform; // no-op
    }

    const updated: ObjectDefinition = {
      ...existing,
      transform: newTransform,
    };
    this.registry.set(uuid, deepFreeze(deepClone(updated)));
    this.notifyRenderer({ kind: 'transform', uuid, transform: newTransform });
    return this.getObject(uuid)!.transform;
  }

  /**
   * Patch metadata for an object (e.g. rename, tag).
   * @returns the updated metadata block.
   */
  updateObjectMetadata(uuid: string, patch: Partial<ObjectMetadata>): Readonly<ObjectMetadata> {
    const existing = this.registry.get(uuid);
    if (!existing) {
      throw new Error(`[SceneStateManager] updateObjectMetadata: unknown uuid ${uuid}`);
    }
    const nextMetadata = { ...existing.metadata, ...patch };
    if (!nextMetadata.name || typeof nextMetadata.name !== 'string') {
      throw new Error(`[SceneStateManager] metadata.name must be a non-empty string`);
    }
    const updated: ObjectDefinition = {
      ...existing,
      metadata: nextMetadata,
    };
    this.registry.set(uuid, deepFreeze(deepClone(updated)));
    this.notifyRenderer({ kind: 'metadata', uuid, metadata: nextMetadata });
    return this.getObject(uuid)!.metadata;
  }

  // -------------------------------------------------- lookups --------

  /** Returns a frozen copy of the object definition, or undefined. */
  getObject(uuid: string): Readonly<ObjectDefinition> | undefined {
    const def = this.registry.get(uuid);
    return def ? deepFreeze(deepClone(def)) : undefined;
  }

  /**
   * Returns a snapshot summary of the registry. Used by the directive's
   * "report current state of the target object" rule.
   */
  getSnapshot(): SceneSnapshot {
    const byAssetType: Record<string, number> = {};
    for (const def of this.registry.values()) {
      byAssetType[def.assetType] = (byAssetType[def.assetType] ?? 0) + 1;
    }
    return {
      objectCount: this.registry.size,
      uuids: Object.freeze([...this.registry.keys()]),
      byAssetType: Object.freeze(byAssetType),
    };
  }

  /** All object definitions, as a frozen array of frozen copies. */
  getAllObjects(): readonly Readonly<ObjectDefinition>[] {
    return Object.freeze([...this.registry.values()].map((d) => deepFreeze(deepClone(d))));
  }

  /** Filter objects by asset type. */
  getObjectsByAssetType(type: AssetType): readonly Readonly<ObjectDefinition>[] {
    return Object.freeze(
      [...this.registry.values()]
        .filter((d) => d.assetType === type)
        .map((d) => deepFreeze(deepClone(d))),
    );
  }

  /** Convenience: total object count. */
  getObjectCount(): number {
    return this.registry.size;
  }

  /** Whether the registry has the given uuid. */
  has(uuid: string): boolean {
    return this.registry.has(uuid);
  }

  // -------------------------------------------------- internal -------

  private normalize(def: ObjectDefinition): ObjectDefinition {
    validateTransform(def.transform);
    if (!def.metadata?.name) {
      throw new Error('[SceneStateManager] metadata.name is required');
    }
    return def;
  }

  private notifyRenderer(change: RendererChange): void {
    try {
      this.renderer?.syncObject(change);
    } catch (err) {
      // Renderer failures must not corrupt the registry.
      console.error('[SceneStateManager] renderer error (ignored):', err);
    }
  }
}

// --- internal serialization helpers (kept here for module-local use) ---
function serializeTransform(t: Transform): string {
  return `${t.position.x},${t.position.y},${t.position.z}|${t.rotation.x},${t.rotation.y},${t.rotation.z}|${t.scale.x},${t.scale.y},${t.scale.z}`;
}
