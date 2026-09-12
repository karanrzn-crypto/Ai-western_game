import * as THREE from 'three';
import type { ObjectDefinition } from '../core/types.js';
import type { IAssetFactory } from './IAssetFactory.js';

/** Large flat ground used by the first playable movement map. */
export class GroundAssetFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const size = Number(definition.metadata.size ?? 80);
    const safeSize = Number.isFinite(size) && size > 0 ? size : 80;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(safeSize, safeSize),
      new THREE.MeshStandardMaterial({ color: 0x3b3428, roughness: 1 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  }
}
