/**
 * MergeStatic tests.
 *
 * Locks the static-geometry merge contract (the weak-laptop draw-call fix):
 *
 *  1. MERGING — sibling meshes sharing a material collapse into ONE mesh;
 *     vertex count and world-space AABB are preserved; the def root keeps
 *     its identity and the merged mesh stays a child of the def tree.
 *  2. MATERIAL BUCKETS — different materials never merge into one mesh.
 *  3. DYNAMIC SUBTREES — a userData.dynamic pivot (door hinge) keeps its
 *     group structure; its meshes merge only with each other; rotating the
 *     pivot after the merge still carries the (merged) leaf — a pose API on
 *     a merged door is bit-for-bit the old behaviour.
 *  4. NO CROSS-PIVOT BAKING — a hinge mesh and a static root mesh never
 *     share a merged mesh (the classic "piece stays behind when the door
 *     opens" regression is impossible by construction).
 *  5. ESCAPE HATCHES — userData.noMerge on a subtree leaves it untouched;
 *     non-indexed geometry stays unmerged.
 *  6. LIVE DEF — the merge pass through ThreeRendererAdapter.onMeshResolved
 *     produces the same merged tree the direct call does (one contract, one
 *     funnel), and metadata.noMerge opts the def out.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { mergeStaticGeometry } from '../src/assets/MergeStatic.js';
import { ThreeRendererAdapter } from '../src/engine/ThreeRendererAdapter.js';
import { AssetRegistry } from '../src/assets/AssetRegistry.js';
import type { ObjectDefinition } from '../src/core/types.js';

const matA = new THREE.MeshStandardMaterial({ color: 0xaa0000 });
const matB = new THREE.MeshStandardMaterial({ color: 0x00aa00 });

function boxMesh(m: THREE.Material, x: number, y: number, z: number, name = 'part'): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
  mesh.position.set(x, y, z);
  mesh.name = name;
  return mesh;
}

function worldBoxOf(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const g = (o as THREE.Mesh).geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const clone = g.boundingBox!.clone().applyMatrix4(o.matrixWorld);
    box.union(clone);
  });
  return box;
}

function countMeshes(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) n += 1; });
  return n;
}

function countVertices(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const g = (o as THREE.Mesh).geometry;
    n += g.attributes.position ? g.attributes.position.count : 0;
  });
  return n;
}

test('MERGE: same-material siblings collapse into one mesh; geometry is preserved', () => {
  const root = new THREE.Group();
  root.name = 'def-root';
  root.add(boxMesh(matA, 0, 0, 0, 'a'), boxMesh(matA, 5, 0, 0, 'b'), boxMesh(matA, 0, 5, 0, 'c'));
  const beforeBox = worldBoxOf(root);
  const beforeVerts = countVertices(root);

  mergeStaticGeometry(root);

  assert.equal(countMeshes(root), 1, 'three same-material siblings → one merged mesh');
  assert.equal(countVertices(root), beforeVerts, 'vertex count is preserved through the bake');
  const afterBox = worldBoxOf(root);
  for (const axis of ['x', 'y', 'z'] as const) {
    assert.ok(Math.abs(beforeBox.min[axis] - afterBox.min[axis]) < 1e-6, `min.${axis} preserved`);
    assert.ok(Math.abs(beforeBox.max[axis] - afterBox.max[axis]) < 1e-6, `max.${axis} preserved`);
  }
  const merged = (root.children[0] as THREE.Mesh);
  assert.equal(merged.material, matA, 'merged mesh keeps the shared (cached) material');
  assert.equal(merged.matrixAutoUpdate, false, 'merged mesh never moves locally');
  assert.deepEqual(merged.userData.mergedFrom, ['a', 'b', 'c'], 'merged provenance recorded');
});

test('MERGE: different materials stay in separate meshes', () => {
  const root = new THREE.Group();
  root.add(boxMesh(matA, 0, 0, 0), boxMesh(matA, 1, 0, 0), boxMesh(matB, 0, 1, 0), boxMesh(matB, 1, 1, 0));
  mergeStaticGeometry(root);
  assert.equal(countMeshes(root), 2, 'two material buckets → two merged meshes');
  const mats = new Set<THREE.Material>();
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) mats.add((o as THREE.Mesh).material as THREE.Material); });
  assert.deepEqual([...mats], [matA, matB]);
});

test('MERGE: a dynamic hinge subtree merges within itself and still swings its (merged) leaf', () => {
  const root = new THREE.Group();
  root.name = 'door-def';
  // static frame parts on the root
  root.add(boxMesh(matA, -2, 1, 0, 'frame-left'), boxMesh(matA, 2, 1, 0, 'frame-right'));
  // a runtime-rotated hinge with a three-part leaf
  const hinge = new THREE.Group();
  hinge.name = 'door-hinge';
  hinge.userData.dynamic = true;
  hinge.position.set(-1, 0, 0);
  const leaf = boxMesh(matA, 1, 1, 0, 'leaf');
  const brace = boxMesh(matA, 1, 1.2, 0.05, 'brace');
  const peg = boxMesh(matA, 1.4, 0.8, 0.05, 'peg');
  hinge.add(leaf, brace, peg);
  root.add(hinge);

  const hingeWorldBefore = worldBoxOf(hinge);
  mergeStaticGeometry(root);

  // static bucket: 2 meshes → 1; hinge bucket: 3 meshes → 1 (own mount)
  assert.equal(countMeshes(root), 2, 'one merged static mesh + one merged leaf mesh');
  const mergedHinge = hinge.getObjectByName('leaf+merged') ?? hinge.children.find((c) => (c as THREE.Mesh).isMesh);
  assert.ok(mergedHinge && mergedHinge.parent === hinge, 'the leaf mesh lives INSIDE the hinge (never baked across the pivot)');

  // rotate the hinge like setStableLeafDoorOpen would — the merged leaf follows
  hinge.rotation.y = Math.PI / 2;
  root.updateMatrixWorld(true);
  const hingeWorldAfter = worldBoxOf(hinge);
  assert.ok(hingeWorldAfter.min.z < hingeWorldBefore.min.z - 0.5, 'the merged leaf physically swings with the pivot');
  assert.ok(hingeWorldAfter.min.x < hingeWorldBefore.max.x, 'leaf sweeps toward the aisle like the real door');
});

test('MERGE: noMerge subtree and non-indexed geometry are left untouched', () => {
  const root = new THREE.Group();
  root.add(boxMesh(matA, 0, 0, 0), boxMesh(matA, 1, 0, 0));

  const exempt = new THREE.Group();
  exempt.userData.noMerge = true;
  exempt.add(boxMesh(matA, 0, 5, 0, 'keep-1'), boxMesh(matA, 1, 5, 0, 'keep-2'));
  root.add(exempt);

  const nonIndexed = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), matA);
  nonIndexed.position.set(0, -5, 0);
  nonIndexed.name = 'non-indexed';
  root.add(nonIndexed);

  mergeStaticGeometry(root);

  assert.equal(countMeshes(root), 4, '2 merged + 2 exempt + 1 non-indexed');
  assert.ok(exempt.getObjectByName('keep-1'), 'noMerge subtree untouched');
  assert.ok(root.getObjectByName('non-indexed'), 'non-indexed geometry left alone');
});

/* ---------- the adapter funnel ------------------------------------------- */

function makeDef(overrides: Partial<ObjectDefinition['metadata']> = {}): ObjectDefinition {
  return {
    uuid: 'd3b07384-d9a0-4b9f-9a11-00000000abcd',
    assetType: 'test-cube',
    transform: { position: { x: 10, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { name: 'merge-test-def', ...overrides },
  };
}

test('MERGE: ThreeRendererAdapter runs the same pass at materialisation', async () => {
  const registry = new AssetRegistry();
  registry.register('test-cube', { create: () => {
    const g = new THREE.Group();
    g.add(boxMesh(matA, 0, 0, 0, 'p1'), boxMesh(matA, 1, 0, 0, 'p2'), boxMesh(matA, 2, 0, 0, 'p3'));
    return g;
  } }, 'test');
  const adapter = new ThreeRendererAdapter({ assetRegistry: registry });
  adapter.syncObject({ kind: 'add', definition: makeDef() });
  // AssetRegistry.create is async — materialisation lands on a later microtask.
  await new Promise((r) => setTimeout(r, 0));

  const mesh = adapter.threeScene.getObjectByName('merge-test-def');
  assert.ok(mesh, 'def materialised under its registry name');
  assert.equal(countMeshes(mesh!), 1, 'the adapter-merged def carries ONE mesh');
  // the registry transform still applies on top of the merged geometry
  mesh!.updateMatrixWorld(true);
  const wp = new THREE.Vector3();
  new THREE.Box3().setFromObject(mesh!).getCenter(wp);
  assert.ok(Math.abs(wp.x - (10 + 1)) < 1e-6, 'merged geometry sits at the def transform + geometry center');
});

test('MERGE: metadata.noMerge opts a def out of the adapter pass', async () => {
  const registry = new AssetRegistry();
  registry.register('test-cube', { create: () => {
    const g = new THREE.Group();
    g.add(boxMesh(matA, 0, 0, 0, 'p1'), boxMesh(matA, 1, 0, 0, 'p2'));
    return g;
  } }, 'test');
  const adapter = new ThreeRendererAdapter({ assetRegistry: registry });
  adapter.syncObject({ kind: 'add', definition: makeDef({ noMerge: true }) });
  await new Promise((r) => setTimeout(r, 0));

  const mesh = adapter.threeScene.getObjectByName('merge-test-def');
  assert.ok(mesh, 'def materialised under its registry name');
  assert.equal(countMeshes(mesh!), 2, 'opted-out def keeps its separate meshes');
});

/* ---------- the REAL doors: one merge contract for the whole town ---------
 *
 * Regression for the frozen-bar-door bug: the saloon rebuild hung its leaves
 * on hinge groups WITHOUT `userData.dynamic = true`, so the merge pass baked
 * them into the def's static mesh — the hinges kept rotating (state, collider
 * and harness yaw checks all "worked") but the VISIBLE leaf never moved and
 * the player walked through the doorway of a visually closed door.
 *
 * The contract is SYSTEM-wide, so is the lock: every real door factory in the
 * game must (a) flag every runtime pivot `userData.dynamic`, (b) still render
 * ≥1 mesh per hinge AFTER the merge pass, and (c) move rendered geometry when
 * its pose API opens it. A future door that forgets the flag fails here. */

import { buildSwingingDoors, setSaloonDoorsOpen } from '../src/assets/saloon/SaloonProps.js';
import { buildBankFrontDoor, setBankFrontDoorOpen } from '../src/assets/bank/BankExterior.js';
import { buildGunShopFrontDoor, setGunShopFrontDoorOpen } from '../src/assets/gunshop/GunShopArchitecture.js';
import {
  buildJailCellDoor,
  buildSheriffFrontDoor,
  setJailCellDoorOpen,
  setSheriffFrontDoorOpen,
} from '../src/assets/sheriff/SheriffOfficeAssetFactory.js';
import {
  buildStableGate,
  buildStableLeafDoor,
  setStableGateOpen,
  setStableLeafDoorOpen,
} from '../src/assets/stable/StableDoors.js';
import {
  buildBankVaultDoor,
  buildSecureGate,
  setBankVaultDoorOpen,
  setSecureGateOpen,
} from '../src/assets/bank/BankInteriorAssetFactory.js';

const HALF_DEG = (deg: number): number => (deg * Math.PI) / 180;

interface RealDoorCase {
  name: string;
  build: () => THREE.Object3D;
  hinges: string[];
  open: (root: THREE.Object3D) => void;
}

const REAL_DOORS: RealDoorCase[] = [
  {
    name: 'saloon swinging doors',
    build: () => buildSwingingDoors(),
    hinges: ['swinging-door-left-hinge', 'swinging-door-right-hinge'],
    open: (r) => setSaloonDoorsOpen(r, 1),
  },
  {
    name: 'bank front door',
    build: () => buildBankFrontDoor({ width: 1.7, height: 2.4, openDeg: HALF_DEG(100) }),
    hinges: ['bank-front-door-hinge-w', 'bank-front-door-hinge-e'],
    open: (r) => setBankFrontDoorOpen(r, 1),
  },
  {
    name: 'gun shop front door',
    build: () => buildGunShopFrontDoor({ width: 1.1, height: 2.2, hinge: 'left', openSign: 1, openDeg: HALF_DEG(100) }),
    hinges: ['front-door-hinge'],
    open: (r) => setGunShopFrontDoorOpen(r, 1),
  },
  {
    name: 'sheriff front door',
    build: () => buildSheriffFrontDoor(),
    hinges: ['front-door-hinge'],
    open: (r) => setSheriffFrontDoorOpen(r, 1),
  },
  {
    name: 'sheriff jail cell door',
    build: () => buildJailCellDoor(),
    hinges: ['jail-cell-door-hinge'],
    open: (r) => setJailCellDoorOpen(r, 1),
  },
  {
    name: 'stable gate',
    build: () => buildStableGate(),
    hinges: ['gate-leaf-w-hinge', 'gate-leaf-e-hinge'],
    open: (r) => setStableGateOpen(r, 1),
  },
  {
    name: 'stable leaf door',
    build: () => buildStableLeafDoor({ width: 1.2, height: 2.1, style: 'stall', hinge: 'left', openSign: 1, openDeg: HALF_DEG(95) }),
    hinges: ['door-hinge'],
    open: (r) => setStableLeafDoorOpen(r, 1),
  },
  {
    name: 'bank vault door',
    build: () => buildBankVaultDoor(),
    hinges: ['bank-vault-door-hinge'],
    open: (r) => setBankVaultDoorOpen(r, 1),
  },
  {
    name: 'bank secure gate',
    build: () => buildSecureGate(),
    hinges: ['secure-gate-leaf-w', 'secure-gate-leaf-e'],
    open: (r) => setSecureGateOpen(r, 1),
  },
];

for (const door of REAL_DOORS) {
  test(`MERGE: the ${door.name} swing VISIBLE leaves after the merge pass`, () => {
    const root = door.build();

    // (a) MergeStatic contract at build time: every runtime pivot is flagged.
    for (const h of door.hinges) {
      const hinge = root.getObjectByName(h);
      assert.ok(hinge, `hinge "${h}" exists in the built root`);
      assert.equal(hinge.userData.dynamic, true, `hinge "${h}" carries userData.dynamic`);
    }

    // (b) Exactly what ThreeRendererAdapter.onMeshResolved runs.
    mergeStaticGeometry(root);

    for (const h of door.hinges) {
      const hinge = root.getObjectByName(h)!;
      let meshes = 0;
      hinge.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes += 1; });
      assert.ok(meshes >= 1, `hinge "${h}" still renders its leaf (meshes=${meshes}) — never baked into a static bucket`);
    }

    // (c) The pose API moves RENDERED geometry, not empty groups: the root's
    // world AABB must change once the door opens.
    root.updateMatrixWorld(true);
    const closed = new THREE.Box3().setFromObject(root);
    door.open(root);
    root.updateMatrixWorld(true);
    const opened = new THREE.Box3().setFromObject(root);
    const moved = (['x', 'y', 'z'] as const)
      .map((a) => Math.max(Math.abs(opened.min[a] - closed.min[a]), Math.abs(opened.max[a] - closed.max[a])))
      .reduce((m, d) => Math.max(m, d), 0);
    assert.ok(moved > 0.01, `opening moves rendered geometry by ${moved.toFixed(3)}m (> 1cm)`);
  });
}
