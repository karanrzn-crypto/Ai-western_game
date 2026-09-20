/**
 * src/assets/environment/EnvNatureAssetFactory.ts
 * -----------------------------------------------------------------------------
 * PRAIRIE & TOWN VEGETATION BUILDERS (environment round, realism pass).
 *
 *   tree · dead-tree · bush · grass-tuft · rock
 *
 * Sparse, dusty-western vegetation: cottonwood-ish trees with layered dusty-
 * green canopies, sage scrub with twiggy structure, dry grass TUFTS made of
 * real bent blades (never cones) and weathered rocks.
 *
 * REALISM PASS (user bug round — bushes/trees/grass read as primitives):
 *   • TREES — tapered multi-segment trunks with a slight bend + base flare,
 *     primary branches that reach INTO the crown, and a crown of 4-6 craggy
 *     blobs (position-hashed vertex jitter on detail-0 icosahedra — the
 *     silhouette stops reading as a clean icosahedron without adding tris).
 *   • BUSHES — 3-6 small craggy puffs clustered asymmetrically + 2-4 dark
 *     twigs poking through the foliage (irregular branching silhouette).
 *   • GRASS — real BLADES: tapered, bent 2-segment strips (DoubleSide), three
 *     deterministic archetypes (fan / clump / windswept), never a cone.
 *   • VARIATION — every builder is driven by metadata.seed (the layout ships
 *     a distinct seed per placement), so no two instances are identical.
 *
 * All builders are deterministic and never apply the def transform — the
 * renderer adapter owns transforms. Budget (weak-laptop contract):
 *   tree ≈ 250-420 tris · bush ≈ 130-260 · grass ≈ 28-48 · rock 36.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { AssetRegistry } from '../AssetRegistry.js';
import { mulberry32 } from './EnvPropsAssetFactory.js';

// Shared vegetation materials (module-level, painted/built once).
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5a41, roughness: 1 });
const trunkGrayMat = new THREE.MeshStandardMaterial({ color: 0x776851, roughness: 1 });
const deadWoodMat = new THREE.MeshStandardMaterial({ color: 0x7a6f5e, roughness: 1 });
const canopyMats = [
  new THREE.MeshStandardMaterial({ color: 0x6d7a4a, roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x7a8352, roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x5f7042, roughness: 1, flatShading: true }),
];
const sageMats = [
  new THREE.MeshStandardMaterial({ color: 0x7c8154, roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x6f7a4d, roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x868a5c, roughness: 1, flatShading: true }),
];
const twigMat = new THREE.MeshStandardMaterial({ color: 0x54452f, roughness: 1 });
// Grass blades are DoubleSide (strips are visible from both faces).
const dryGrassMats = [
  new THREE.MeshStandardMaterial({ color: 0xa8a25c, roughness: 1, side: THREE.DoubleSide }),
  new THREE.MeshStandardMaterial({ color: 0xb5a95e, roughness: 1, side: THREE.DoubleSide }),
  new THREE.MeshStandardMaterial({ color: 0x9c9a54, roughness: 1, side: THREE.DoubleSide }),
  new THREE.MeshStandardMaterial({ color: 0x8f9a58, roughness: 1, side: THREE.DoubleSide }),
];
const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8272, roughness: 1, flatShading: true });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Deterministic position hash — identical points always get the same jitter,
 * so jittered NON-indexed icosahedra stay watertight across UV seams. */
function posHash(x: number, y: number, z: number, salt: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + salt * 53.13) * 43758.5453;
  return s - Math.floor(s);
}

/** Craggy blob: detail-0 icosahedron with position-hashed radial jitter. */
function craggyBlob(radius: number, salt: number, jitter = 0.16): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 0);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h1 = posHash(v.x, v.y, v.z, salt);
    const h2 = posHash(v.x, v.y, v.z, salt + 7);
    const scale = 1 + (h1 - 0.5) * 2 * jitter + (h2 - 0.5) * 2 * jitter * 0.5;
    v.multiplyScalar(scale);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A tapered, slightly bent trunk from y0..y1 — two stacked cone segments with
 * a small shared-knot offset so the silhouette never reads as one cylinder.
 */
function bentTrunk(
  group: THREE.Object3D, mat: THREE.Material,
  baseR: number, topR: number, height: number, bendX: number, bendZ: number,
): void {
  const midH = height * (0.45 + ((Math.abs(bendX) + Math.abs(bendZ)) % 0.2));
  const seg1 = mesh(new THREE.CylinderGeometry(baseR * 0.72, baseR, midH, 7), mat, bendX * 0.12, midH / 2, bendZ * 0.12);
  seg1.rotation.z = -bendX * 0.06;
  seg1.rotation.x = bendZ * 0.06;
  group.add(seg1);
  const seg2 = mesh(new THREE.CylinderGeometry(topR, baseR * 0.72, height - midH, 7), mat,
    bendX * 0.6, midH + (height - midH) / 2, bendZ * 0.6);
  seg2.rotation.z = -bendX * 0.22;
  seg2.rotation.x = bendZ * 0.22;
  group.add(seg2);
}

/** One tapered branch from `from` toward `to` (both world-local). */
function branch(group: THREE.Object3D, mat: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, r0: number): void {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.45, r0, len, 5), mat);
  b.position.copy(from.clone().add(to).multiplyScalar(0.5));
  b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  b.castShadow = true; b.receiveShadow = true;
  group.add(b);
}

/** Shady prairie tree: bent trunk + branches + layered craggy crown. */
export function buildTree(definition: ObjectDefinition): THREE.Group {
  const group = new THREE.Group();
  const seed = Number((definition.metadata as { seed?: number }).seed ?? 7);
  const rng = mulberry32(seed);
  const salt = seed * 3.7 + 1;

  const trunkH = 2.2 + rng() * 1.4;
  const baseR = 0.2 + rng() * 0.09;
  const bendX = (rng() - 0.5) * 0.5;
  const bendZ = (rng() - 0.5) * 0.5;
  const trunk = rng() > 0.5 ? trunkMat : trunkGrayMat;
  bentTrunk(group, trunk, baseR * 1.5, baseR, trunkH, bendX, bendZ);

  // Root flare feet — three small tapered prongs around the base (no floating).
  for (let i = 0; i < 3; i++) {
    const a = rng() * Math.PI * 2;
    const prong = mesh(new THREE.CylinderGeometry(0.03, baseR * 0.55, 0.34 + rng() * 0.16, 5), trunk,
      Math.cos(a) * baseR * 0.9, 0.16, Math.sin(a) * baseR * 0.9);
    prong.rotation.z = Math.cos(a) * 0.5;
    prong.rotation.x = -Math.sin(a) * 0.5;
    group.add(prong);
  }

  // Primary branches: 2-3 leaving the upper trunk, tips inside the crown.
  const crownY = trunkH + 0.55 + rng() * 0.5;
  const crownR = 1.15 + rng() * 0.8;
  const branchCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < branchCount; i++) {
    const a = (i / branchCount) * Math.PI * 2 + rng() * 1.2;
    const fromY = trunkH * (0.62 + rng() * 0.25);
    const from = new THREE.Vector3(bendX * fromY * 0.5, fromY, bendZ * fromY * 0.5);
    const to = new THREE.Vector3(
      Math.cos(a) * crownR * (0.55 + rng() * 0.3),
      crownY + (rng() - 0.35) * 0.7,
      Math.sin(a) * crownR * (0.55 + rng() * 0.3),
    );
    branch(group, trunk, from, to, baseR * (0.5 + rng() * 0.25));
  }

  // Crown: 4-6 craggy blobs — one dominant cap + surrounding filler lobes.
  const blobs = 4 + Math.floor(rng() * 2.4);
  for (let i = 0; i < blobs; i++) {
    const r = (i === 0 ? 1.0 : 0.55) + rng() * 0.55;
    const mat = canopyMats[Math.floor(rng() * canopyMats.length)];
    const a = rng() * Math.PI * 2;
    const spread = i === 0 ? 0.12 : 0.45 + rng() * 0.55;
    const blob = mesh(craggyBlob(r, salt + i * 11), mat,
      Math.cos(a) * crownR * spread + bendX * 0.4,
      crownY + (i === 0 ? 0.35 : (rng() - 0.4) * 0.9),
      Math.sin(a) * crownR * spread + bendZ * 0.4);
    blob.scale.y = 0.72 + rng() * 0.3;
    blob.rotation.y = rng() * Math.PI;
    group.add(blob);
  }
  return group;
}

/** Bare dead tree: leaning bent trunk + naked tapered branches (ruin areas). */
export function buildDeadTree(definition?: ObjectDefinition): THREE.Group {
  const group = new THREE.Group();
  const seed = Number((definition?.metadata as { seed?: number } | undefined)?.seed ?? 17);
  const rng = mulberry32(seed);
  const trunkH = 2.7 + rng() * 0.8;
  const bendX = (rng() - 0.5) * 0.4;
  const bendZ = (rng() - 0.5) * 0.4;
  bentTrunk(group, deadWoodMat, 0.3, 0.09, trunkH, bendX, bendZ);
  const branchCount = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < branchCount; i++) {
    const a = rng() * Math.PI * 2;
    const fromY = trunkH * (0.45 + rng() * 0.4);
    const from = new THREE.Vector3(bendX * fromY * 0.5, fromY, bendZ * fromY * 0.5);
    const reach = 0.5 + rng() * 0.6;
    const to = new THREE.Vector3(
      from.x + Math.cos(a) * reach, fromY + 0.35 + rng() * 0.55, from.z + Math.sin(a) * reach,
    );
    branch(group, deadWoodMat, from, to, 0.055 + rng() * 0.03);
  }
  return group;
}

/** Low western sage scrub: clustered craggy puffs + twigs (branching read). */
export function buildBush(definition: ObjectDefinition): THREE.Group {
  const group = new THREE.Group();
  const seed = Number((definition.metadata as { seed?: number }).seed ?? 11);
  const rng = mulberry32(seed);
  const salt = seed * 5.1 + 3;

  const scaleR = 0.85 + rng() * 0.5;      // overall footprint driver
  const puffs = 5 + Math.floor(rng() * 3); // 5-7 soft foliage lobes
  for (let i = 0; i < puffs; i++) {
    const r = (i === 0 ? 0.3 : 0.14 + rng() * 0.16) * scaleR;
    const mat = sageMats[Math.floor(rng() * sageMats.length)];
    const a = rng() * Math.PI * 2;
    const rad = i === 0 ? 0 : (0.14 + rng() * 0.3) * scaleR;
    const puff = mesh(craggyBlob(r, salt + i * 13, 0.09), mat,
      Math.cos(a) * rad,
      (i === 0 ? 0.24 : 0.13 + rng() * 0.24) * scaleR,
      Math.sin(a) * rad);
    puff.scale.y = 0.66 + rng() * 0.22;
    puff.rotation.y = rng() * Math.PI;
    group.add(puff);
  }

  // Twiggy structure: 2-4 thin dark branches poke through the foliage.
  const twigs = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < twigs; i++) {
    const a = rng() * Math.PI * 2;
    const lean = 0.35 + rng() * 0.5;
    const h = 0.4 + rng() * 0.34;
    const twig = mesh(new THREE.CylinderGeometry(0.009, 0.022, h, 4), twigMat,
      Math.cos(a) * 0.14 * scaleR, h * 0.42, Math.sin(a) * 0.14 * scaleR);
    twig.rotation.z = Math.cos(a) * lean;
    twig.rotation.x = -Math.sin(a) * lean;
    group.add(twig);
  }
  return group;
}

/** One grass blade: tapered, bent 2-segment strip (4 tris, DoubleSide). */
function grassBlade(height: number, lean: number, curl: number, yaw: number, mat: THREE.Material): THREE.Mesh {
  const w = 0.028 + (height % 0.03) * 0.3;
  const geo = new THREE.PlaneGeometry(w, height, 1, 2);
  geo.translate(0, height / 2, 0); // pivot at the root
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / height;           // 0 at root … 1 at tip
    pos.setX(i, pos.getX(i) * (1 - t * 0.85)); // taper to a point
    pos.setZ(i, curl * t * t * height);        // bend out along the length
  }
  geo.computeVertexNormals();
  const blade = new THREE.Mesh(geo, mat);
  blade.rotation.y = yaw;
  blade.rotation.x = lean;
  blade.castShadow = false;
  blade.receiveShadow = true;
  return blade;
}

/** Dry grass tuft: real bent blades in three seed-picked archetypes. */
export function buildGrassTuft(definition: ObjectDefinition): THREE.Group {
  const group = new THREE.Group();
  const seed = Number((definition.metadata as { seed?: number }).seed ?? 13);
  const rng = mulberry32(seed);

  const blades = 10 + Math.floor(rng() * 4); // 10-13
  const archetype = Math.floor(rng() * 3);  // 0 fan · 1 clump · 2 windswept
  const windYaw = rng() * Math.PI * 2;      // the "wind" direction
  const baseH = 0.24 + rng() * 0.2;

  for (let i = 0; i < blades; i++) {
    const mat = dryGrassMats[Math.floor(rng() * dryGrassMats.length)];
    const h = baseH * (0.5 + rng() * 0.9);
    const a = rng() * Math.PI * 2;
    let lean: number;
    let yaw: number;
    if (archetype === 0) {
      // FAN — blades splay evenly outward all around.
      lean = 0.35 + rng() * 0.55;
      yaw = a;
    } else if (archetype === 1) {
      // CLUMP — two opposing ranks leaning apart.
      lean = 0.3 + rng() * 0.45;
      yaw = (Math.floor(rng() * 2)) * Math.PI + (rng() - 0.5) * 1.1;
    } else {
      // WINDSWEPT — every blade leans along the same wind line.
      lean = 0.5 + rng() * 0.6;
      yaw = windYaw + (rng() - 0.5) * 0.9;
    }
    const curl = (rng() - 0.5) * 0.6;
    const blade = grassBlade(h, lean, curl, yaw, mat);
    blade.position.set((rng() - 0.5) * 0.22, 0, (rng() - 0.5) * 0.22);
    group.add(blade);
  }
  return group;
}

/** Weathered prairie rock: squashed craggy dodecahedron, FIXED base size
 * (1.0 m diameter × 0.6 m high at scale 1) so the collider payload in
 * ENV_PROP_COLLIDERS stays exact while per-instance def scale varies it. */
export function buildRock(definition: ObjectDefinition): THREE.Group {
  const group = new THREE.Group();
  const seed = Number((definition.metadata as { seed?: number }).seed ?? 17);
  const rng = mulberry32(seed);
  const rock = mesh(craggyBlob(0.5, seed * 1.3 + 5, 0.12), rockMat, 0, 0.3, 0);
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
    'dead-tree': (def) => buildDeadTree(def),
    'bush': (def) => buildBush(def),
    'grass-tuft': (def) => buildGrassTuft(def),
    'rock': (def) => buildRock(def),
  };
  for (const [assetType, build] of Object.entries(builders)) {
    registry.register(assetType, { create: (def) => build(def) }, assetType);
  }
}
