/**
 * src/assets/AssetRegistry.ts
 * -----------------------------------------------------------------------------
 * Registry that maps an AssetType to the IAssetFactory responsible for it.
 *
 * This replaces the previous hard-coded switch statement inside
 * ThreeRendererAdapter. Adding a new asset type now means registering a
 * factory — no edits to the renderer or the SceneStateManager.
 *
 * Failure modes:
 *  - `create()` on an unregistered assetType throws (do NOT silently
 *    substitute a placeholder — that hides bugs in scene files).
 *  - `register()` for an already-registered type throws (forces explicit
 *    intent during boot rather than shadowing registrations).
 *
 * Async support: factories may return a Promise. The renderer adapter
 * awaits the result; the registry itself stays sync.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { AssetType, ObjectDefinition } from '../core/types.js';
import type { IAssetFactory, AssetFactoryFn } from './IAssetFactory.js';
import { logger } from '../utils/Logger.js';

export class AssetRegistry {
  /** assetType → factory */
  private readonly factories = new Map<AssetType, IAssetFactory>();
  /** assetType → display label (for debugging / UI lists) */
  private readonly labels = new Map<AssetType, string>();

  /** Register a factory for an assetType. Throws on duplicates. */
  register(
    assetType: AssetType,
    factory: IAssetFactory | AssetFactoryFn,
    label?: string,
  ): void {
    if (this.factories.has(assetType)) {
      throw new Error(
        `[AssetRegistry] assetType "${assetType}" already registered — call unregister() first or pick a unique name`,
      );
    }
    const f: IAssetFactory =
      typeof factory === 'function' ? { create: factory } : factory;
    this.factories.set(assetType, f);
    if (label) this.labels.set(assetType, label);
    logger.debug('asset type registered', { assetType, label: label ?? null });
  }

  /** Remove a factory. No-op if not registered. */
  unregister(assetType: AssetType): void {
    this.factories.delete(assetType);
    this.labels.delete(assetType);
  }

  /** Whether a factory is registered for the given type. */
  has(assetType: AssetType): boolean {
    return this.factories.has(assetType);
  }

  /** List of all registered asset types. */
  getRegisteredTypes(): readonly AssetType[] {
    return [...this.factories.keys()];
  }

  /** Display label (or the assetType itself when none was set). */
  getLabel(assetType: AssetType): string {
    return this.labels.get(assetType) ?? assetType;
  }

  /**
   * Create the THREE.Object3D for a definition.
   * Throws for unregistered assetTypes — never returns null.
   */
  async create(definition: ObjectDefinition): Promise<THREE.Object3D> {
    const factory = this.factories.get(definition.assetType);
    if (!factory) {
      throw new Error(
        `[AssetRegistry] no factory registered for assetType "${definition.assetType}"`,
      );
    }
    const obj = await factory.create(definition);
    if (!obj) {
      throw new Error(
        `[AssetRegistry] factory for "${definition.assetType}" returned null/undefined`,
      );
    }
    // Mirror the registry uuid onto the THREE object so debugging tools
    // (e.g. inspector) can correlate a mesh back to a scene object.
    obj.uuid = definition.uuid;
    obj.name = definition.metadata.name;
    return obj;
  }
}
