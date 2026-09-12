/**
 * src/assets/PrimitiveAssetFactory.ts
 * -----------------------------------------------------------------------------
 * Concrete built-in primitive asset factories.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../core/types.js';
import type { IAssetFactory } from './IAssetFactory.js';
import type { AssetRegistry } from './AssetRegistry.js';
import { GroundAssetFactory } from './GroundAssetFactory.js';

/** Validation cube primitive. */
export class CubeAssetFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xc8b67a }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Register the foundation primitives used by the playable world. */
export function registerPrimitiveFactories(registry: AssetRegistry): void {
  registry.register('cube', new CubeAssetFactory(), 'Foundation Cube');
  registry.register('ground', new GroundAssetFactory(), 'World Ground');
}

export { GroundAssetFactory };
export { AssetRegistry } from './AssetRegistry.js';
