import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  LocalSceneStorage,
  MemoryStorage,
  PersistenceManager,
  SceneStateManager,
  TransformGizmo,
  isDebugHelper,
} from '../src/index.js';
import type { GizmoHandleId } from '../src/index.js';

const UUID_A = '60000000-0000-4000-a000-000000000001';
const UUID_LOCKED = '60000000-0000-4000-a000-000000000002';
const UUID_PRE = '60000000-0000-4000-a000-000000000003';

function makeManager(): SceneStateManager {
  const manager = new SceneStateManager();
  manager.registerObject({
    uuid: UUID_A,
    assetType: 'cube',
    transform: { position: { x: 0, y: 0.75, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { name: 'Editable', editable: true, collider: true },
  });
  manager.registerObject({
    uuid: UUID_LOCKED,
    assetType: 'cube',
    transform: { position: { x: 4, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { name: 'Locked', editable: false, collider: true },
  });
  manager.registerObject({
    uuid: UUID_PRE,
    assetType: 'cube',
    transform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 30, y: 0, z: 45 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { name: 'Pre-rotated', editable: true },
  });
  return manager;
}

function makeGizmo(manager: SceneStateManager): { gizmo: TransformGizmo; commits: string[] } {
  const commits: string[] = [];
  const gizmo = new TransformGizmo({
    manager,
    onTransformCommitted: (uuid) => commits.push(uuid),
  });
  return { gizmo, commits };
}

function rayAt(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): THREE.Ray {
  return new THREE.Ray(
    new THREE.Vector3(ox, oy, oz),
    new THREE.Vector3(dx, dy, dz).normalize(),
  );
}

/** Pointer ray that pierces the (frozen) drag plane EXACTLY at `point`. */
function planeRay(point: THREE.Vector3, normal: THREE.Vector3): THREE.Ray {
  const origin = point.clone().addScaledVector(normal, -5);
  return new THREE.Ray(origin, normal.clone());
}

function assertVecNear(
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number },
  epsilon: number,
  message: string,
): void {
  assert.ok(
    Math.abs(actual.x - expected.x) <= epsilon &&
    Math.abs(actual.y - expected.y) <= epsilon &&
    Math.abs(actual.z - expected.z) <= epsilon,
    `${message}: expected ~(${expected.x}, ${expected.y}, ${expected.z}), got (${actual.x}, ${actual.y}, ${actual.z})`,
  );
}

function rayFromNdc(camera: THREE.PerspectiveCamera, ndc: THREE.Vector2): THREE.Ray {
  const rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, camera);
  return rc.ray;
}

function pickAtWorld(gizmo: TransformGizmo, camera: THREE.PerspectiveCamera, world: THREE.Vector3): GizmoHandleId | null {
  const ndc = world.clone().project(camera);
  return gizmo.pickHandle(rayFromNdc(camera, new THREE.Vector2(ndc.x, ndc.y)));
}

// ---------------------------------------------------------------------------
// Handle picking
// ---------------------------------------------------------------------------

test('gizmo exposes exactly 3 move + 3 rotate handles and picking resolves them', () => {
  const manager = makeManager();
  const { gizmo } = makeGizmo(manager);
  gizmo.sync(true, UUID_A);
  assert.equal(gizmo.getAttachedUuid(), UUID_A);
  assert.equal(gizmo.root.visible, true);

  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 120);
  camera.position.set(0, 2, 5);
  camera.lookAt(0, 0.75, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const R45 = 0.55 / Math.SQRT2;
  const C = new THREE.Vector3(0, 0.75, 0);
  const probes: Array<[THREE.Vector3, GizmoHandleId]> = [
    [C.clone().add(new THREE.Vector3(0.7, 0, 0)), 'move:x'],
    [C.clone().add(new THREE.Vector3(0, 0.7, 0)), 'move:y'],
    [C.clone().add(new THREE.Vector3(0, 0, 0.7)), 'move:z'],
    [C.clone().add(new THREE.Vector3(0, R45, R45)), 'rotate:x'],
    [C.clone().add(new THREE.Vector3(R45, 0, R45)), 'rotate:y'],
    [C.clone().add(new THREE.Vector3(R45, R45, 0)), 'rotate:z'],
  ];
  for (const [point, expected] of probes) {
    assert.equal(pickAtWorld(gizmo, camera, point), expected, `probe ${expected}`);
  }
  // A ray aimed far off to the side misses every handle.
  assert.equal(pickAtWorld(gizmo, camera, new THREE.Vector3(12, 0.75, 0)), null, 'ray far away misses');
});

test('hidden gizmo (no edit mode / no selection / non-editable) cannot be picked or dragged', () => {
  const manager = makeManager();
  const { gizmo } = makeGizmo(manager);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 120);
  camera.position.set(0, 2, 5);
  camera.lookAt(0, 0.75, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const ray = rayFromNdc(camera, new THREE.Vector2(0, 0));

  gizmo.sync(false, UUID_A);
  assert.equal(gizmo.pickHandle(ray), null, 'not pickable outside edit mode');
  gizmo.sync(true, null);
  assert.equal(gizmo.pickHandle(ray), null, 'not pickable without selection');
  gizmo.sync(true, UUID_LOCKED);
  assert.equal(gizmo.pickHandle(ray), null, 'not pickable for non-editable objects');
  assert.equal(gizmo.beginDrag('move:x', ray), false, 'beginDrag refuses while hidden');
  assert.equal(gizmo.root.visible, false);
});

// ---------------------------------------------------------------------------
// Move gizmo: X/Y/Z constrained, continuous
// ---------------------------------------------------------------------------

test('move gizmo: dragging the X handle changes ONLY position.x, continuously', () => {
  const manager = makeManager();
  const { gizmo, commits } = makeGizmo(manager);
  gizmo.sync(true, UUID_A);
  let calls = 0;
  const original = manager.updateObjectTransform.bind(manager);
  manager.updateObjectTransform = ((uuid: string, patch: Parameters<typeof original>[1]) => {
    calls += 1;
    return original(uuid, patch);
  }) as typeof manager.updateObjectTransform;

  assert.equal(gizmo.beginDrag('move:x', rayAt(0, 0.75, 5, 0, 0, -1)), true);
  for (const x of [0.5, 1.1, 2.4]) {
    gizmo.updateDrag(rayAt(x, 0.75, 5, 0, 0, -1));
    assertVecNear(manager.getObject(UUID_A)!.transform.position, { x, y: 0.75, z: 0 }, 1e-9, `sweep x=${x}`);
  }
  assert.equal(gizmo.isDragging(), true);
  gizmo.endDrag();
  assert.equal(gizmo.isDragging(), false);
  assert.deepEqual(commits, [UUID_A], 'one commit per drag');
  assert.ok(calls >= 3, 'every drag step routed through SceneStateManager.updateObjectTransform');
});

test('move gizmo: Y handle changes only Y; Z handle changes only Z (exact values)', () => {
  const manager = makeManager();
  const { gizmo } = makeGizmo(manager);
  gizmo.sync(true, UUID_A);

  gizmo.beginDrag('move:y', rayAt(0, 0.75, 5, 0, 0, -1));
  gizmo.updateDrag(rayAt(0, 4, 5, 0, 0, -1));
  assertVecNear(manager.getObject(UUID_A)!.transform.position, { x: 0, y: 4, z: 0 }, 1e-9, 'Y drag');
  gizmo.endDrag();

  manager.updateObjectTransform(UUID_A, { position: { x: 0, y: 0.75, z: 0 } });
  gizmo.sync(true, UUID_A);
  // Rays oblique to the Z axis (a ray ALONG the axis can never be resolved).
  gizmo.beginDrag('move:z', rayAt(0, 0.75, 5, 1, 0, -1));
  gizmo.updateDrag(rayAt(0, 0.75, 8, 1, 0, -1));
  assertVecNear(manager.getObject(UUID_A)!.transform.position, { x: 0, y: 0.75, z: 3 }, 1e-9, 'Z drag');
  gizmo.endDrag();
});

test('move gizmo follows the rotated local axis: X handle on a y=90 object moves world -Z only', () => {
  const manager = makeManager();
  const { gizmo } = makeGizmo(manager);
  manager.updateObjectTransform(UUID_A, { rotation: { x: 0, y: 90, z: 0 } });
  gizmo.sync(true, UUID_A);

  // Rays deliberately NOT parallel to the local X axis (world (0,0,-1)).
  assert.equal(gizmo.beginDrag('move:x', rayAt(1, 0.75, 5, -1, 0, -1)), true);
  gizmo.updateDrag(rayAt(1, 0.75, 3, -1, 0, -1));
  assertVecNear(manager.getObject(UUID_A)!.transform.position, { x: 0, y: 0.75, z: -2 }, 1e-9, 'local X handle moved world -Z');
  gizmo.endDrag();
});

// ---------------------------------------------------------------------------
// Rotation gizmo: X/Y/Z rings, continuous, local axis
// ---------------------------------------------------------------------------

test('rotation gizmo: dragging the Y ring a quarter turn sets rotation.y = 90, then the equivalent 180deg orientation', () => {
  const manager = makeManager();
  const { gizmo } = makeGizmo(manager);
  gizmo.sync(true, UUID_A);
  const n = new THREE.Vector3(0, 1, 0);

  gizmo.beginDrag('rotate:y', planeRay(new THREE.Vector3(0.7, 0.75, 0), n));
  gizmo.updateDrag(planeRay(new THREE.Vector3(0, 0.75, -0.7), n));
  assertVecNear(manager.getObject(UUID_A)!.transform.rotation, { x: 0, y: 90, z: 0 }, 1e-6, '+90 local Y');

  // Second quarter turn: the ORIENTATION must be exactly qY(180deg). The Euler
  // XYZ parameterization legitimately re-expresses it as (180, 0, 180) — the
  // identical rotation (Three.js Euler.setFromQuaternion does the same fold).
  gizmo.updateDrag(planeRay(new THREE.Vector3(-0.7, 0.75, 0), n));
  const rot = manager.getObject(UUID_A)!.transform.rotation;
  const qStored = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(rot.x), THREE.MathUtils.degToRad(rot.y), THREE.MathUtils.degToRad(rot.z), 'XYZ'));
  const qHalfTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  assert.ok(qStored.angleTo(qHalfTurn) < 1e-9, `orientation is exactly 180deg about local Y (angleTo=${qStored.angleTo(qHalfTurn)})`);
  gizmo.endDrag();
});

test('rotation gizmo: X ring and Z ring change exactly their own euler axis', () => {
  const manager = makeManager();
  const { gizmo } = makeGizmo(manager);
  gizmo.sync(true, UUID_A);

  // X ring (plane normal = local X): quarter turn from +Y toward -Z => -90.
  gizmo.beginDrag('rotate:x', planeRay(new THREE.Vector3(0, 1.45, 0), new THREE.Vector3(1, 0, 0)));
  gizmo.updateDrag(planeRay(new THREE.Vector3(0, 0.75, -0.7), new THREE.Vector3(1, 0, 0)));
  assertVecNear(manager.getObject(UUID_A)!.transform.rotation, { x: -90, y: 0, z: 0 }, 1e-6, 'X ring -90');
  gizmo.endDrag();

  manager.updateObjectTransform(UUID_A, { rotation: { x: 0, y: 0, z: 0 } });
  gizmo.sync(true, UUID_A);
  // Z ring (plane normal = local Z): quarter turn from +X toward +Y => +90.
  gizmo.beginDrag('rotate:z', planeRay(new THREE.Vector3(0.7, 0.75, 0), new THREE.Vector3(0, 0, 1)));
  gizmo.updateDrag(planeRay(new THREE.Vector3(0, 1.45, 0), new THREE.Vector3(0, 0, 1)));
  assertVecNear(manager.getObject(UUID_A)!.transform.rotation, { x: 0, y: 0, z: 90 }, 1e-6, 'Z ring +90');
  gizmo.endDrag();
});

test('rotation gizmo is continuous: small pointer steps accumulate fractionally in one direction', () => {
  const manager = makeManager();
  const { gizmo } = makeGizmo(manager);
  gizmo.sync(true, UUID_A);
  const n = new THREE.Vector3(0, 1, 0);
  const qStart = new THREE.Quaternion();
  const quatOf = () => {
    const r = manager.getObject(UUID_A)!.transform.rotation;
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(r.x), THREE.MathUtils.degToRad(r.y), THREE.MathUtils.degToRad(r.z), 'XYZ'));
  };

  gizmo.beginDrag('rotate:y', planeRay(new THREE.Vector3(0.7, 0.75, 0), n));
  // Orientation progress (quaternion angle from start) must grow monotonically
  // even where the Euler numbers re-parameterize past 90deg.
  const progress: number[] = [];
  for (const x of [0.4, 0.1, -0.2, -0.5]) {
    gizmo.updateDrag(planeRay(new THREE.Vector3(x, 0.75, -0.55), n));
    progress.push(qStart.angleTo(quatOf()));
  }
  for (let i = 1; i < progress.length; i++) {
    assert.ok(progress[i] > progress[i - 1], `orientation grows monotonically at step ${i}: ${progress.map((p) => p.toFixed(3)).join(', ')}`);
  }
  assert.ok(progress.every((p) => p > 0.1), 'drag actually rotated the object');
  gizmo.endDrag();
});

test('rotation gizmo rotates around the object OWN LOCAL axis on a pre-rotated object', () => {
  const manager = makeManager();
  const { gizmo } = makeGizmo(manager);
  gizmo.sync(true, UUID_PRE);

  // Local Y axis of euler(30,0,45) in world space + right-handed ring basis.
  const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(30), 0, THREE.MathUtils.degToRad(45), 'XYZ'));
  const n = new THREE.Vector3(0, 1, 0).applyQuaternion(q0);
  const u = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 0, 1)).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  const C = new THREE.Vector3(0, 1, 0);

  gizmo.beginDrag('rotate:y', planeRay(C.clone().addScaledVector(u, 0.7), n));
  gizmo.updateDrag(planeRay(C.clone().addScaledVector(v, 0.7), n));

  const rot = manager.getObject(UUID_PRE)!.transform.rotation;
  const qDelta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const expected = new THREE.Euler().setFromQuaternion(q0.clone().multiply(qDelta), 'XYZ');
  assertVecNear(rot, {
    x: THREE.MathUtils.radToDeg(expected.x),
    y: THREE.MathUtils.radToDeg(expected.y),
    z: THREE.MathUtils.radToDeg(expected.z),
  }, 1e-4, 'ring drag = q0 (x) qY(90) post-multiply (LOCAL axis)');
  gizmo.endDrag();
});

// ---------------------------------------------------------------------------
// Separation guarantees
// ---------------------------------------------------------------------------

test('gizmo is never a managed object: debug-tagged, unregistered, not saved, no collider', () => {
  const manager = makeManager();
  const { gizmo } = makeGizmo(manager);
  const before = manager.getObjectCount();
  gizmo.sync(true, UUID_A);

  let nodes = 0;
  gizmo.root.traverse((node) => {
    nodes += 1;
    assert.equal(isDebugHelper(node), true, `debug tag on ${node.type}`);
    assert.equal(manager.has(node.uuid), false, `not managed: ${node.type}`);
  });
  assert.ok(nodes >= 13, 'gizmo built arms + rings + proxies + root');

  gizmo.beginDrag('move:x', rayAt(0, 0.75, 5, 0, 0, -1));
  gizmo.updateDrag(rayAt(2, 0.75, 5, 0, 0, -1));
  gizmo.endDrag();

  const persistence = new PersistenceManager();
  const storage = new LocalSceneStorage(persistence, { key: 'gizmo-separation', storage: new MemoryStorage() });
  storage.saveFromManager(manager, { name: 'separation' });
  const restored = new SceneStateManager();
  storage.loadInto(restored);
  assert.equal(restored.getObjectCount(), before, 'only the real objects survive save/load');
  gizmo.root.traverse((node) => assert.equal(restored.has(node.uuid), false, 'gizmo node absent from loaded scene'));
  assert.equal(restored.getObject(UUID_A)?.metadata.collider, true, 'real object keeps its collider; gizmo added none');
});

test('save/load preserves a gizmo-moved AND gizmo-rotated transform', () => {
  const manager = makeManager();
  const { gizmo } = makeGizmo(manager);
  gizmo.sync(true, UUID_A);

  gizmo.beginDrag('move:x', rayAt(0, 0.75, 5, 0, 0, -1));
  gizmo.updateDrag(rayAt(2.5, 0.75, 5, 0, 0, -1));
  gizmo.endDrag();
  gizmo.sync(true, UUID_A);
  // Probe points are relative to the object's NEW position (2.5, 0.75, 0).
  gizmo.beginDrag('rotate:y', planeRay(new THREE.Vector3(3.2, 0.75, 0), new THREE.Vector3(0, 1, 0)));
  gizmo.updateDrag(planeRay(new THREE.Vector3(2.5, 0.75, -0.7), new THREE.Vector3(0, 1, 0)));
  gizmo.endDrag();

  const before = manager.getObject(UUID_A)!.transform;
  assertVecNear(before.position, { x: 2.5, y: 0.75, z: 0 }, 1e-9, 'sanity: moved');
  assertVecNear(before.rotation, { x: 0, y: 90, z: 0 }, 1e-6, 'sanity: rotated');

  const persistence = new PersistenceManager();
  const storage = new LocalSceneStorage(persistence, { key: 'gizmo-persistence', storage: new MemoryStorage() });
  storage.saveFromManager(manager, { name: 'persistence' });
  const restored = new SceneStateManager();
  storage.loadInto(restored);
  const after = restored.getObject(UUID_A)!.transform;
  assertVecNear(after.position, before.position, 1e-9, 'position preserved');
  assertVecNear(after.rotation, before.rotation, 1e-9, 'rotation preserved');
});

// ---------------------------------------------------------------------------
// Visibility + lifecycle
// ---------------------------------------------------------------------------

test('gizmo rides the selected object transform (position AND rotation), not the origin', () => {
  const manager = makeManager();
  const { gizmo } = makeGizmo(manager);
  manager.updateObjectTransform(UUID_A, { position: { x: 2, y: 3, z: 4 }, rotation: { x: 0, y: 90, z: 0 } });
  gizmo.sync(true, UUID_A);
  assertVecNear(gizmo.root.position, { x: 2, y: 3, z: 4 }, 1e-9, 'root at object position');
  const expectedQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0, 'XYZ'));
  assert.ok(gizmo.root.quaternion.angleTo(expectedQ) < 1e-9, 'root oriented with object rotation');
});

test('endDrag fires exactly one commit per drag; leaving edit mode mid-drag cancels cleanly', () => {
  const manager = makeManager();
  const { gizmo, commits } = makeGizmo(manager);
  gizmo.sync(true, UUID_A);
  gizmo.beginDrag('move:x', rayAt(0, 0.75, 5, 0, 0, -1));
  gizmo.updateDrag(rayAt(1, 0.75, 5, 0, 0, -1));
  gizmo.endDrag();
  gizmo.endDrag(); // second call is a no-op
  assert.deepEqual(commits, [UUID_A], 'exactly one commit');

  gizmo.sync(true, UUID_A);
  gizmo.beginDrag('rotate:y', planeRay(new THREE.Vector3(0.7, 0.75, 0), new THREE.Vector3(0, 1, 0)));
  gizmo.sync(false, null); // leaving edit mode mid-drag
  assert.equal(gizmo.isDragging(), false, 'drag cancelled by sync(false)');
  assert.deepEqual(commits, [UUID_A, UUID_A], 'cancel commits the applied delta once');
});
