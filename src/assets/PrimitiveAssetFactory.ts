/**
 * src/assets/PrimitiveAssetFactory.ts
 * -----------------------------------------------------------------------------
 * Concrete IAssetFactory implementations for primitive geometry.
 *
 * These replace the inline switch statement that used to live inside
 * ThreeRendererAdapter.DefaultAssetFactory. Each primitive registers
 * itself into an AssetRegistry — new asset types can be added by
 * copying the pattern, without touching the renderer or the
 * SceneStateManager.
 *
 * The cube primitive here is the validation asset for the minimal demo.
 * It is NOT a final game asset.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../core/types.js';
import type { IAssetFactory } from './IAssetFactory.js';
import type { AssetRegistry } from './AssetRegistry.js';

/**
 * A "cube" — a 1x1x1 BoxGeometry with a warm tan material. Used by the
 * minimal validation demo only. Not a final game asset.
 */
export class CubeAssetFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    return new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xc8b67a }),
    );
  }
}

/**
 * Convenience helper: register all built-in primitive factories into a
 * given AssetRegistry. Production code can replace or extend this list
 * (e.g. add GLTF loaders) without modifying this function.
 *
 * Future primitive factories (plane, sphere, etc.) should be added here
 * rather than spawning parallel registration code in caller modules.
 */
export function registerPrimitiveFactories(registry: AssetRegistry): void {
  // 'cube' is the only primitive currently wired up. The saloon-era
  // primitives (wall, chair, table, barrel, door, ground, npc, light)
  // were intentionally REMOVED because they were western-world content.
  // Re-add them here when their game-world design is finalised.
  registry.register('cube', new CubeAssetFactory(), 'Demo Cube');
}

// re-export the registry type so callers can do
// `import { AssetRegistry, registerPrimitiveFactories } from '@app/assets'`.
export { AssetRegistry } from './AssetRegistry.js';