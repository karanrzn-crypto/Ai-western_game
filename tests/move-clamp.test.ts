/**
 * tests/move-clamp.test.ts
 * -----------------------------------------------------------------------------
 * Regression tests for the two Editor fixes:
 *   1. Move-drag penetration guard (MoveClamp): a drag stops exactly at the
 *      contact boundary with the ground or another object, never sinks in,
 *      never teleports through, never blocks sliding along a flush face, and
 *      keeps the contact marker stable (no flicker) while pinned.
 *   2. (Gizmo world-axis move tests live in transform-gizmo.test.ts; the
 *      clamped-drag integration through the real TransformGizmo lives here.)
 * -----------------------------------------------------------------------------
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  ContactIndicator,
  SceneStateManager,
  TransformGizmo,
  clampAxisDelta,
  makeSceneAxisClamp,
} from '../src/index.js';
import type { ObjectDefinition } from '../src/index.js';

const UUID_A = '80000000-0000-4000-a000-000000000001';
const UUID_WALL = '80000000-0000-4000-a000-000000000002';

function box(
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
}

function rayAt(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): THREE.Ray {
  return new THREE.Ray(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(dx, dy, dz).normalize());
}

function approx(actual: number, expected: number, tol = 1e-9, message?: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    message ?? `expected ${actual} ≈ ${expected} (±${tol})`,
  );
}

// ---------------------------------------------------------------------------
// clampAxisDelta — pure AABB math
// ---------------------------------------------------------------------------

const UNIT = box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5); // selected at the origin
const WALL_RIGHT = box(2.5, -0.5, -0.5, 3.5, 0.5, 0.5); // gap 2.0 on +X

test('approach clamps exactly AT the contact boundary; smaller steps pass free', () => {
  assert.equal(clampAxisDelta({ selected: UNIT, axis: 'x', delta: 0.7, blockers: [WALL_RIGHT] }), 0.7, 'below the boundary — free');
  assert.equal(clampAxisDelta({ selected: UNIT, axis: 'x', delta: 2.0, blockers: [WALL_RIGHT] }), 2.0, 'lands exactly on the face');
  assert.equal(clampAxisDelta({ selected: UNIT, axis: 'x', delta: 5.0, blockers: [WALL_RIGHT] }), 2.0, 'stops at the boundary');
  assert.equal(clampAxisDelta({ selected: UNIT, axis: 'x', delta: -3.0, blockers: [WALL_RIGHT] }), -3.0, 'retreat always free');
});

test('already touching (gap 0): further approach blocked, retreat free — no jitter', () => {
  const touching = box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
  const wall = box(0.5, -0.5, -0.5, 1.5, 0.5, 0.5);
  assert.equal(clampAxisDelta({ selected: touching, axis: 'x', delta: 0.1, blockers: [wall] }), 0, 'cannot push in');
  assert.equal(clampAxisDelta({ selected: touching, axis: 'x', delta: -0.5, blockers: [wall] }), -0.5, 'can pull out');
});

test('a huge step cannot tunnel through: clamped to the boundary in one step', () => {
  assert.equal(clampAxisDelta({ selected: UNIT, axis: 'x', delta: 50, blockers: [WALL_RIGHT] }), 2.0);
});

test('flush neighbour does NOT block sliding along the contact plane', () => {
  // Wall touching on X (lateral Y overlap full), dragging along Z must stay free.
  const wall = box(0.5, -0.5, -0.5, 1.5, 0.5, 0.5);
  assert.equal(clampAxisDelta({ selected: UNIT, axis: 'z', delta: 4, blockers: [wall] }), 4);
  // Float-noise lateral overlap (1e-12) must not freeze the drag either.
  const noisy = box(0.5, -0.5, -0.5, 1.5, 0.5, 0.5 - 1e-12);
  assert.equal(clampAxisDelta({ selected: UNIT, axis: 'z', delta: 4, blockers: [noisy] }), 4);
});

test('already sunk: deeper movement blocked, exiting free (no auto-separation)', () => {
  const sunk = box(0.45, -0.5, -0.5, 1.45, 0.5, 0.5); // 0.05 into the wall from -X
  const wall = box(0.5, -0.5, -0.5, 1.5, 0.5, 0.5);
  assert.equal(clampAxisDelta({ selected: sunk, axis: 'x', delta: 0.1, blockers: [wall] }), 0, 'deeper blocked');
  assert.equal(clampAxisDelta({ selected: sunk, axis: 'x', delta: -0.2, blockers: [wall] }), -0.2, 'exit free');

  const sunkFromPlus = box(-1.45, -0.5, -0.5, -0.45, 0.5, 0.5); // entered from +X side
  const wallLeft = box(-1.5, -0.5, -0.5, -0.5, 0.5, 0.5);
  assert.equal(clampAxisDelta({ selected: sunkFromPlus, axis: 'x', delta: -0.1, blockers: [wallLeft] }), 0, 'deeper blocked (+ side)');
  assert.equal(clampAxisDelta({ selected: sunkFromPlus, axis: 'x', delta: 0.2, blockers: [wallLeft] }), 0.2, 'exit free (+ side)');
});

test('GROUND: downward motion stops at the floor, from any height', () => {
  const ground = box(-30, 0, -30, 30, 0, 30);
  const resting = box(-1.5, 0, -1.5, 1.5, 1, 1.5); // resting exactly on the floor
  assert.equal(clampAxisDelta({ selected: resting, axis: 'y', delta: -0.3, blockers: [ground] }), 0, 'resting: cannot go down');
  assert.equal(clampAxisDelta({ selected: resting, axis: 'y', delta: 0.5, blockers: [ground] }), 0.5, 'up is free');

  const floating = box(-1.5, 0.02, -1.5, 1.5, 1.02, 1.5);
  approx(clampAxisDelta({ selected: floating, axis: 'y', delta: -0.5, blockers: [ground] }), -0.02, 1e-9, 'drops exactly onto the floor');
});

test('blockers behind the motion and containment cases never constrain the step', () => {
  // Moving +X away from a wall on the -X side.
  const wallBehind = box(-3.5, -0.5, -0.5, -2.5, 0.5, 0.5);
  assert.equal(clampAxisDelta({ selected: UNIT, axis: 'x', delta: 3, blockers: [wallBehind] }), 3);
  // Ground CONTAINS the object along X: horizontal sliding must stay possible.
  const ground = box(-30, 0, -30, 30, 0, 30);
  assert.equal(clampAxisDelta({ selected: UNIT, axis: 'x', delta: 3, blockers: [ground] }), 3);
});

test('no blockers -> delta unchanged (both signs)', () => {
  assert.equal(clampAxisDelta({ selected: UNIT, axis: 'y', delta: 2.5, blockers: [] }), 2.5);
  assert.equal(clampAxisDelta({ selected: UNIT, axis: 'y', delta: -2.5, blockers: [] }), -2.5);
  assert.equal(clampAxisDelta({ selected: UNIT, axis: 'y', delta: 0, blockers: [WALL_RIGHT] }), 0);
});

// ---------------------------------------------------------------------------
// makeSceneAxisClamp + real TransformGizmo integration
// ---------------------------------------------------------------------------

function cubeDef(uuid: string, name: string, editable: boolean): ObjectDefinition {
  return {
    uuid,
    assetType: 'cube',
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { name, editable, collider: true },
  };
}

function addCubeMesh(scene: THREE.Scene, uuid: string, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.uuid = uuid;
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

test('makeSceneAxisClamp reads live scene bounds: clamps toward the wall, free away', () => {
  const scene = new THREE.Scene();
  addCubeMesh(scene, UUID_A, 0, 0, 0);
  addCubeMesh(scene, UUID_WALL, 3, 0, 0);
  const managerStub = {
    getObject: (uuid: string) => (uuid === UUID_A ? cubeDef(UUID_A, 'A', true) : cubeDef(UUID_WALL, 'wall', false)),
    getAllObjects: () => [cubeDef(UUID_A, 'A', true), cubeDef(UUID_WALL, 'wall', false)],
  };
  const clamp = makeSceneAxisClamp(scene, managerStub);

  assert.equal(clamp(UUID_A, 'x', 10), 2, 'clamped to the wall face (gap 2.0)');
  assert.equal(clamp(UUID_A, 'x', 1), 1, 'below the boundary — free');
  assert.equal(clamp(UUID_A, 'x', -5), -5, 'away — free');
  assert.equal(clamp(UUID_A, 'y', 10), 10, 'no blocker on Y — free');
});

test('through the real gizmo: drag pins at the wall face, stays pinned, releases on reverse', () => {
  const scene = new THREE.Scene();
  const meshA = addCubeMesh(scene, UUID_A, 0, 0, 0);
  addCubeMesh(scene, UUID_WALL, 3, 0, 0);
  const manager = new SceneStateManager();
  manager.registerObject(cubeDef(UUID_A, 'A', true));
  manager.registerObject({ ...cubeDef(UUID_WALL, 'دیوار', false), uuid: UUID_WALL });

  const gizmo = new TransformGizmo({
    manager,
    clampMoveDelta: makeSceneAxisClamp(scene, manager),
  });
  gizmo.sync(true, UUID_A);

  // No renderer adapter here, so mirror the manager state onto the mesh the
  // way ThreeRendererAdapter does in the app (the clamp reads scene bounds).
  const syncMesh = (): void => {
    const t = manager.getObject(UUID_A)!.transform.position;
    meshA.position.set(t.x, t.y, t.z);
  };
  const drag = (rayX: number): void => {
    gizmo.updateDrag(rayAt(rayX, 0, 5, 0, 0, -1));
    syncMesh();
  };

  assert.equal(gizmo.beginDrag('move:x', rayAt(0, 0, 5, 0, 0, -1)), true);
  drag(10); // pointer far beyond the wall
  assert.equal(manager.getObject(UUID_A)!.transform.position.x, 2, 'stopped exactly at the contact boundary (gap 0)');

  drag(30); // keep pushing — must stay pinned
  assert.equal(manager.getObject(UUID_A)!.transform.position.x, 2, 'pinned, no sink-in, no drift');

  drag(1); // pointer back — releases instantly
  assert.equal(manager.getObject(UUID_A)!.transform.position.x, 1, 'retreat is never blocked');
  gizmo.endDrag();

  const rotation = manager.getObject(UUID_A)!.transform.rotation;
  assert.deepEqual(rotation, { x: 0, y: 0, z: 0 }, 'move drag never touches rotation');
});

test('clamped drag keeps the contact marker STABLE: visible, pinned, no flicker', () => {
  const scene = new THREE.Scene();
  const meshA = addCubeMesh(scene, UUID_A, 0, 0, 0);
  const meshWall = addCubeMesh(scene, UUID_WALL, 3, 0, 0);
  const manager = new SceneStateManager();
  manager.registerObject(cubeDef(UUID_A, 'A', true));
  manager.registerObject({ ...cubeDef(UUID_WALL, 'دیوار', false), uuid: UUID_WALL });

  const gizmo = new TransformGizmo({ manager, clampMoveDelta: makeSceneAxisClamp(scene, manager) });
  const indicator = new ContactIndicator();
  scene.add(indicator.group);

  const frame = (rayX: number): void => {
    gizmo.sync(true, UUID_A);
    if (gizmo.isDragging()) {
      gizmo.updateDrag(rayAt(rayX, 0, 5, 0, 0, -1));
      const t = manager.getObject(UUID_A)!.transform.position;
      meshA.position.set(t.x, t.y, t.z); // adapter mirror
    }
    indicator.update({ editMode: true, selectedUuid: UUID_A, scene, manager });
  };

  frame(0);
  gizmo.beginDrag('move:x', rayAt(0, 0, 5, 0, 0, -1));

  // Several frames pushing harder and harder past the wall.
  const pinnedXs: number[] = [];
  for (const push of [10, 20, 40, 80]) {
    frame(push);
    assert.equal(indicator.group.visible, true, `marker visible while pinned (push ${push})`);
    pinnedXs.push(indicator.group.position.x);
  }
  assert.equal(pinnedXs[0], 2.5, 'marker sits BETWEEN the two touching faces (x = 2.5)');
  assert.equal(new Set(pinnedXs).size, 1, 'marker position identical every frame — no flicker');
  assert.equal(meshA.position.x, 2, 'object rests exactly against the wall');
  assert.equal(meshWall.position.x, 3, 'wall untouched');

  frame(1); // pull back
  assert.equal(indicator.group.visible, false, 'marker hidden the frame contact ends');
  gizmo.endDrag();
});
