/**
 * src/assets/IAssetFactory.ts
 * -----------------------------------------------------------------------------
 * Per-asset-type factory contract.
 *
 * The asset layer is engine-specific (it produces three.js Object3Ds), but
 * it is SEPARATE from the renderer adapter so that adding a new asset type
 * never touches rendering logic and never rewrites the SceneStateManager.
 *
 * Why this interface returns a THREE.Object3D (and not a generic): because
 * asset creation is, fundamentally, a rendering concern. The state layer
 * (SceneStateManager) does NOT import three; only this module does. The
 * renderer adapter consumes the produced Object3D.
 *
 * Sync vs async: sync factories run inline and are fine for primitives.
 * Future loaders (GLTF, textures) may return a Promise; the renderer
 * adapter handles both. The simplest factories just `return new Mesh(...)`.
 * -----------------------------------------------------------------------------
 */

import type * as THREE from 'three';
import type { ObjectDefinition, AssetType } from '../core/types.js';

export interface IAssetFactory {
  /**
   * Create (or asynchronously load) the THREE.Object3D for the given
   * definition. Implementations should NOT apply the transform — the
   * renderer adapter will do that. They SHOULD apply mesh-level setup
   * like geometry, material, castShadow, etc.
   *
   * Returning a Promise is allowed for loaders that fetch over network.
   */
  create(definition: ObjectDefinition): THREE.Object3D | Promise<THREE.Object3D>;
}

/** Convenience type alias for a factory function (vs an object with `create`). */
export type AssetFactoryFn = IAssetFactory['create'];

/** Discriminator used by the registry to map assetType → factory. */
export type { AssetType };
