/**
 * Horse model GEOMETRY tests — tail attachment + z-fighting guards.
 *
 * Two contracts are locked here, both born from real visual bugs:
 *
 *  1. TAIL ANCHOR: the tail root is DERIVED from the actual hindquarters box
 *     (rear face minus a small intentional overlap). The root must be
 *     embedded in the body (no visible gap), the dock must still emerge
 *     behind the body (not buried), and the attachment must SURVIVE every
 *     tail pose the animator can produce (rest, walk swing, gallop lift,
 *     fear raise, flinch, death, yaw flick) — the animator only rotates the
 *     tail joint, and a pivot buried inside the body can never open a gap.
 *
 *  2. NO COPLANAR Z-FIGHTING: the old blaze's top face sat EXACTLY on the
 *     skull's top plane (same normal, overlapping area, different materials)
 *     — a hard flicker on the forehead. Axis-aligned box meshes of this
 *     model must never expose two coplanar, same-normal, overlapping faces
 *     with DIFFERENT materials (same-material pairs are redundant overdraw,
 *     not a visible artifact, and are tolerated — e.g. chest/barrel).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createHorseModel, HORSE_PROPORTIONS, type HorseModel } from '../src/index.js';

/** |faceA - faceB| below this (m) reads as coplanar to the depth buffer. */
const COPLANAR_EPS = 0.001;
/** Minimum linear extent (m) of a face overlap region to count as an area. */
const AREA_EPS = 1e-4;

function collectMeshes(root: THREE.Object3D, predicate: (m: THREE.Mesh) => boolean): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh && predicate(obj as THREE.Mesh)) out.push(obj as THREE.Mesh);
  });
  return out;
}

function combinedBox(meshes: THREE.Mesh[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const mesh of meshes) box.expandByObject(mesh);
  return box;
}

/** Real, geometry-derived rear surface: the rearmost world point of the torso masses. */
function bodyRearZ(model: HorseModel): THREE.Box3 & { rearZ: number } {
  const bodyMeshes = collectMeshes(model.joints.body, () => true);
  assert.ok(bodyMeshes.length >= 4, 'torso masses must exist');
  const box = combinedBox(bodyMeshes) as THREE.Box3 & { rearZ: number };
  box.rearZ = box.max.z;
  return box;
}

const tailPose = (model: HorseModel, rx: number, ry = 0, rz = 0): void => {
  model.joints.tail.rotation.set(rx, ry, rz);
  model.root.updateWorldMatrix(true, true);
};

test('TAIL ANCHOR: derived from the hindquarters rear face — embedded, emerging, never floating', () => {
  const model = createHorseModel();
  model.root.updateWorldMatrix(true, true);

  const body = bodyRearZ(model);
  const rearZ = body.rearZ;

  const pivot = model.joints.tail.getWorldPosition(new THREE.Vector3());
  const overlap = rearZ - pivot.z;

  // The pivot sits INSIDE the rump (intentional overlap) — but never so deep
  // that the dock would be swallowed by the body.
  assert.ok(
    overlap >= 0.005 && overlap <= 0.06,
    `tail root overlap ${overlap.toFixed(4)}m must be a small deliberate embed (5–60mm)`,
  );

  // Attached ON the hindquarters, not floating above/below it.
  assert.ok(
    pivot.y > body.min.y && pivot.y < body.max.y,
    `tail pivot y ${pivot.y.toFixed(3)} must lie inside the torso y-range [${body.min.y.toFixed(3)}, ${body.max.y.toFixed(3)}]`,
  );

  // The tail union STRADDLES the rear plane: part of the dock is inside the
  // body (continuous union — no gap) and part is behind it (visible dock —
  // not buried). Both conditions together reject both failure modes.
  const tailMeshes = collectMeshes(model.joints.tail, () => true);
  assert.ok(tailMeshes.length >= 2, 'dock + root tuft must exist');
  const tailBox = combinedBox(tailMeshes);
  assert.ok(
    tailBox.min.z < rearZ - 0.005,
    `tail front (${tailBox.min.z.toFixed(4)}) must reach INSIDE the body rear plane (${rearZ.toFixed(4)}) — otherwise the tail floats with a visible gap`,
  );
  assert.ok(
    tailBox.max.z > rearZ + 0.005,
    `tail rear (${tailBox.max.z.toFixed(4)}) must emerge BEHIND the body rear plane (${rearZ.toFixed(4)}) — otherwise the tail is buried in the body`,
  );

  model.dispose();
});

test('TAIL ANCHOR: attachment survives every animator tail pose (no gap under rotation)', () => {
  const model = createHorseModel();
  const rearZ = bodyRearZ(model).rearZ;
  const tailMeshes = collectMeshes(model.joints.tail, () => true);

  // Values mirror HorseAnimator's real channel targets: TAIL_REST_RX=-0.08,
  // walk swing ±0.04, gallop lift -0.25, fear raise -0.5, flinch -0.3,
  // death +0.2, idle flick ry ±0.5.
  const poses: Array<[string, number, number]> = [
    ['rest', -0.08, 0],
    ['walk swing min', -0.12, 0],
    ['walk swing max', -0.04, 0],
    ['gallop lift', -0.33, 0],
    ['flinch', -0.38, 0],
    ['fear raise', -0.58, 0],
    ['death', +0.12, 0],
    ['flick left', -0.08, 0.5],
    ['flick right', -0.08, -0.5],
    ['fear + flick', -0.58, 0.5],
  ];

  for (const [name, rx, ry] of poses) {
    tailPose(model, rx, ry);
    const tailBox = combinedBox(tailMeshes);
    assert.ok(
      tailBox.min.z < rearZ && tailBox.max.z > rearZ,
      `pose "${name}" (rx=${rx}, ry=${ry}) separates the tail root from the body: tail z [${tailBox.min.z.toFixed(4)}, ${tailBox.max.z.toFixed(4)}] vs rear plane ${rearZ.toFixed(4)}`,
    );
  }

  model.dispose();
});

test('HEAD GEOMETRY: no coplanar same-normal overlapping faces with different materials (z-fighting scan)', () => {
  const model = createHorseModel();
  model.root.updateWorldMatrix(true, true);

  // Only axis-aligned boxes can form the stable coplanar pairs that flicker
  // (the old blaze/skull pair). Rotated meshes and cylinders never hold a
  // shared plane, so they are out of scope for this scan.
  const boxes = collectMeshes(
    model.root,
    (m) => (m.geometry as THREE.BufferGeometry).type === 'BoxGeometry',
  );
  const identity = new THREE.Quaternion();
  const axisAligned = boxes.filter((m) => m.getWorldQuaternion(new THREE.Quaternion()).angleTo(identity) < 1e-6);
  assert.ok(axisAligned.length >= 10, 'expected the model’s box meshes to be scannable');

  const worldBoxes = axisAligned.map((mesh) => ({
    name: mesh.name || mesh.uuid,
    material: mesh.material as THREE.Material,
    box: new THREE.Box3().setFromObject(mesh),
  }));

  const axes = ['x', 'y', 'z'] as const;
  const others = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] } as const;
  const fights: string[] = [];

  for (let i = 0; i < worldBoxes.length; i += 1) {
    for (let j = i + 1; j < worldBoxes.length; j += 1) {
      const a = worldBoxes[i];
      const b = worldBoxes[j];
      if (a.material === b.material) continue; // same material → no visible flicker
      for (const axis of axes) {
        const [m1, m2] = others[axis];
        const overlapsOn = (m: 'x' | 'y' | 'z'): boolean =>
          Math.min(a.box.max[m], b.box.max[m]) - Math.max(a.box.min[m], b.box.min[m]) > AREA_EPS;
        if (!overlapsOn(m1) || !overlapsOn(m2)) continue;
        // Same-normal faces only: max-vs-max (+axis) or min-vs-min (−axis).
        // max-vs-min is back-to-back contact and can never both face the viewer.
        if (Math.abs(a.box.max[axis] - b.box.max[axis]) < COPLANAR_EPS) {
          fights.push(`${a.name} ↔ ${b.name}: coplanar +${axis} faces at ${a.box.max[axis].toFixed(4)}`);
        }
        if (Math.abs(a.box.min[axis] - b.box.min[axis]) < COPLANAR_EPS) {
          fights.push(`${a.name} ↔ ${b.name}: coplanar −${axis} faces at ${a.box.min[axis].toFixed(4)}`);
        }
      }
    }
  }

  assert.deepEqual(fights, [], `z-fighting coplanar pairs found:\n  ${fights.join('\n  ')}`);
  model.dispose();
});

test('HEAD GEOMETRY: the blaze is a clear overlay of the skull front face (forward = -Z)', () => {
  const model = createHorseModel();
  model.root.updateWorldMatrix(true, true);

  const find = (name: string): THREE.Mesh => {
    const mesh = model.root.getObjectByName(name) as THREE.Mesh | undefined;
    assert.ok(mesh, `mesh "${name}" must exist`);
    return mesh;
  };
  const skull = new THREE.Box3().setFromObject(find('skull'));
  const blaze = new THREE.Box3().setFromObject(find('blaze'));
  const bridge = new THREE.Box3().setFromObject(find('nose-bridge'));

  // Front face pushed FORWARD (-Z) of the skull plane — a real overlay, with
  // a visible but small standoff (2mm … 6cm).
  const forward = skull.min.z - blaze.min.z;
  assert.ok(
    forward >= 0.002 && forward <= 0.06,
    `blaze front must protrude 2–60mm forward of the skull face (got ${forward.toFixed(4)}m)`,
  );
  // Back buried inside the skull (continuous solid — no floating slab).
  assert.ok(blaze.max.z > skull.min.z + 0.01, 'blaze back must be buried inside the skull volume');
  // Top held CLEAR of the skull top plane (the old flicker pair) — both sides
  // of the pair strictly separated by more than the coplanar epsilon.
  assert.ok(
    skull.max.y - blaze.max.y > COPLANAR_EPS,
    `blaze top (${blaze.max.y.toFixed(4)}) must sit below the skull top (${skull.max.y.toFixed(4)})`,
  );
  // Lower end sinks into the bridge box, so the stripe reads as continuous
  // into the nose bridge instead of stopping mid-air.
  assert.ok(
    blaze.min.y < bridge.max.y && blaze.min.y > bridge.min.y,
    'blaze bottom must sink into the nose-bridge box',
  );

  model.dispose();
});

test('PROPORTIONS: tail anchor is not a hand-tuned constant anymore', () => {
  // The proportions table must not carry a tailBaseZ offset — the anchor is
  // derived in HorseModel from the hindquarters geometry.
  assert.equal(
    (HORSE_PROPORTIONS as unknown as Record<string, unknown>).tailBaseZ,
    undefined,
    'HORSE_PROPORTIONS.tailBaseZ must be removed (anchor derives from the hindquarters box)',
  );
});
