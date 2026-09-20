/**
 * src/assets/environment/EnvNatureAssetFactory.ts
 * -----------------------------------------------------------------------------
 * PRAIRIE & TOWN VEGETATION BUILDERS (environment round).
 *
 *   tree · dead-tree · bush · grass-tuft · rock
 *
 * Sparse, dusty-western vegetation: cottonwood-ish trees with dusty-green
 * canopies, sage bushes, dry grass tufts and weathered rocks. All builders
 * are deterministic (metadata.seed drives the per-instance variation) and
 * never apply the def transform — the renderer adapter owns transforms.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { AssetRegistry } from '../AssetRegistry.js';
import { mulberry32 } from './EnvPropsAssetFactory.js';

// Shared vegetation materials (module-level, painted/built once).
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5a41, roughness: 1 });
const deadWoodMat = new THREE.MeshStandardMaterial({ color: 0x7a6f5e, roughness: 1 });
const canopyMats = [
  new THREE.MeshStandardMaterial({ color: 0x6d7a4a, roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x7a8352, roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x5f7042, roughness: 1, flatShading: true }),
];
const sageMats = [
  new THREE.MeshStandardMaterial({ color: 0x7c8154, roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x6f7a4d, roughness: 1, flatShading: true }),
];
const dryGrassMats = [
  new THREE.MeshStandardMaterial({ color: 0xa8a25c, roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: 0xb5a95e, roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: 0x9c9a54, roughness: 1 }),
];
const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8272, roughness: 1, flatShading: true });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Shady prairie tree: trunk + 2-4 dusty-green canopy blobs. */
export function buildTree(definition: ObjectDefinition): THREE.Group {
  const group = new THREE.Group();
  const seed = Number((definition.metadata as { seed?: number }).seed ?? 7);
  const rng = mulberry32(seed);
  const trunkH = 2.4 + rng() * 1.1;
  const trunk = mesh(
    new THREE.CylinderGeometry(0.14 + rng() * 0.06, 0.24 + rng() * 0.1, trunkH, 7),
    trunkMat, 0, trunkH / 2, 0,
  );
  group.add(trunk);
  const blobs = 2 + Math.floor(rng() * 2.4);
  for (let i = 0; i < blobs; i++) {
    const r = 1.0 + rng() * 0.75;
    const mat = canopyMats[Math.floor(rng() * canopyMats.length)];
    const blob = mesh(new THREE.IcosahedronGeometry(r, 0), mat,
      (rng() - 0.5) * 1.15, trunkH + 0.25 + rng() * 1.25, (rng() - 0.5) * 1.15);
    blob.scale.y = 0.78 + rng() * 0.2;
    group.add(blob);
  }
  return group;
}

/** Bare dead tree: leaning trunk + a few naked branches (ruin areas). */
export function buildDeadTree(): THREE.Group {
  const group = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.26, 3.1, 6), deadWoodMat, 0, 1.55, 0);
  trunk.rotation.z = 0.08;
  group.add(trunk);
  for (const [h, tilt, yaw] of [[1.7, 0.9, 0.4], [2.2, 0.7, 2.4], [2.6, 1.1, 4.3]] as const) {
    const branch = mesh(new THREE.CylinderGeometry(0.045, 0.09, 1.5, 5), deadWoodMat,
      Math.sin(yaw) * 0.55, h + 0.35, Math.cos(yaw) * 0.55);
    branch.rotation.z = tilt; branch.rotation.y = yaw;
    group.add(branch);
  }
  return group;
}

/** Low sage bush: 2-3 squashed canopy blobs close to the ground. */
export function buildBush(definition: ObjectDefinition): THREE.Group {
  const group = new THREE.Group();
  const seed = Number((definition.metadata as { seed?: number }).seed ?? 11);
  const rng = mulberry32(seed);
  const puffs = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < puffs; i++) {
    const r = 0.34 + rng() * 0.3;
    const mat = sageMats[Math.floor(rng() * sageMats.length)];
    const puff = mesh(new THREE.IcosahedronGeometry(r, 0), mat,
      (rng() - 0.5) * 0.7, 0.24 + rng() * 0.18, (rng() - 0.5) * 0.7);
    puff.scale.y = 0.72;
    group.add(puff);
  }
  return group;
}

/** Dry grass tuft: a spray of thin dry-yellow blades. No shadow casting. */
export function buildGrassTuft(definition: ObjectDefinition): THREE.Group {
  const group = new THREE.Group();
  const seed = Number((definition.metadata as { seed?: number }).seed ?? 13);
  const rng = mulberry32(seed);
  const blades = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < blades; i++) {
    const mat = dryGrassMats[Math.floor(rng() * dryGrassMats.length)];
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.3 + rng() * 0.28, 4), mat);
    blade.position.set((rng() - 0.5) * 0.4, 0.16, (rng() - 0.5) * 0.4);
    blade.rotation.z = (rng() - 0.5) * 0.7;
    blade.rotation.x = (rng() - 0.5) * 0.7;
    group.add(blade);
  }
  return group;
}

/** Weathered prairie rock: squashed dodecahedron, FIXED base size (1.0 m
 * diameter × 0.6 m high at scale 1) so the collider payload in
 * ENV_PROP_COLLIDERS stays exact while per-instance def scale varies it. */
export function buildRock(definition: ObjectDefinition): THREE.Group {
  const group = new THREE.Group();
  const seed = Number((definition.metadata as { seed?: number }).seed ?? 17);
  const rng = mulberry32(seed);
  const rock = mesh(new THREE.DodecahedronGeometry(0.5, 0), rockMat, 0, 0.3, 0);
  rock.scale.y = 0.6;
  rock.rotation.y = rng() * Math.PI;
  group.add(rock);
  return group;
}

// ---------------------------------------------------------------------------
// Registry wiring
// ---------------------------------------------------------------------------

/** Register every vegetation asset type with the game's AssetRegistry. */
export function registerEnvNatureFactories(registry: AssetRegistry): void {
  const builders: Readonly<Record<string, (def: ObjectDefinition) => THREE.Group>> = {
    'tree': (def) => buildTree(def),
    'dead-tree': () => buildDeadTree(),
    'bush': (def) => buildBush(def),
    'grass-tuft': (def) => buildGrassTuft(def),
    'rock': (def) => buildRock(def),
  };
  for (const [assetType, build] of Object.entries(builders)) {
    registry.register(assetType, { create: (def) => build(def) }, assetType);
  }
}
