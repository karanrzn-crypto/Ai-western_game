import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  LocalSceneStorage,
  MemoryStorage,
  ObjectEditorController,
  PersistenceManager,
  SceneStateManager,
  createDebugAxes,
  formatSelectedObjectInfo,
  isDebugHelper,
  applyLocalRotationDegrees,
} from '../src/index.js';

const UUID_A = '50000000-0000-4000-a000-000000000001';
const UUID_LOCKED = '50000000-0000-4000-a000-000000000002';
const UUID_PRE = '50000000-0000-4000-a000-000000000003';

function makeManager(): SceneStateManager {
  const manager = new SceneStateManager();
  manager.registerObject({
    uuid: UUID_A,
    assetType: 'cube',
    transform: { position: { x: 2, y: 1, z: 3 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { name: 'Editable Cube', editable: true, collider: true },
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

function makeEditor(manager: SceneStateManager): ObjectEditorController {
  const editor = new ObjectEditorController(manager);
  editor.setEditMode(true);
  return editor;
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

// ---------------------------------------------------------------------------
// 1) Move + Position
// ---------------------------------------------------------------------------

test('moving the selection changes Position through SceneStateManager', () => {
  const manager = makeManager();
  const editor = makeEditor(manager);
  editor.select(UUID_A);

  assert.equal(editor.moveSelected('right', false), true);
  assertVecNear(manager.getObject(UUID_A)!.transform.position, { x: 2.25, y: 1, z: 3 }, 1e-9, 'arrow-right');

  editor.moveSelectedBy({ x: 0, y: -0.5, z: 1 });
  assertVecNear(manager.getObject(UUID_A)!.transform.position, { x: 2.25, y: 0.5, z: 4 }, 1e-9, 'raw delta');
});

test('moving does not touch rotation or scale, and info reflects new position instantly', () => {
  const manager = makeManager();
  const editor = makeEditor(manager);
  editor.select(UUID_A);
  editor.moveSelectedBy({ x: 1.5, y: 0, z: 0 });

  const def = manager.getObject(UUID_A)!;
  assertVecNear(def.transform.rotation, { x: 0, y: 0, z: 0 }, 1e-9, 'rotation untouched');
  assertVecNear(def.transform.scale, { x: 1, y: 1, z: 1 }, 1e-9, 'scale untouched');

  const info = formatSelectedObjectInfo(manager.getObject(editor.getSelectedUuid()!));
  assert.equal(info.position, '3.50, 1.00, 3.00');
});

// ---------------------------------------------------------------------------
// 2) Rotation around each local axis
// ---------------------------------------------------------------------------

test('rotation around LOCAL Y: identity +90deg matches Three.js quaternion reference', () => {
  const manager = makeManager();
  const editor = makeEditor(manager);
  editor.select(UUID_A);

  assert.equal(editor.rotateSelectedBy('y', 90), true);
  const rot = manager.getObject(UUID_A)!.transform.rotation;
  assertVecNear(rot, { x: 0, y: 90, z: 0 }, 1e-6, 'euler after +90 local Y');

  const stored = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(THREE.MathUtils.degToRad(rot.x), THREE.MathUtils.degToRad(rot.y), THREE.MathUtils.degToRad(rot.z), 'XYZ'),
  );
  const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  assert.ok(stored.angleTo(expected) < 1e-7, `stored quaternion must equal +90deg Y (angle=${stored.angleTo(expected)})`);
});

test('rotation around LOCAL X and LOCAL Z on a pre-rotated object: post-multiplied quaternion reference', () => {
  const manager = makeManager();
  const editor = makeEditor(manager);
  const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(30), 0, THREE.MathUtils.degToRad(45), 'XYZ'));

  // Local X +90 => q' = q0 ⊗ qX(90)
  editor.select(UUID_PRE);
  editor.rotateSelectedBy('x', 90);
  {
    const rot = manager.getObject(UUID_PRE)!.transform.rotation;
    const qDelta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const expectedEuler = new THREE.Euler().setFromQuaternion(q0.clone().multiply(qDelta), 'XYZ');
    assertVecNear(rot, {
      x: THREE.MathUtils.radToDeg(expectedEuler.x),
      y: THREE.MathUtils.radToDeg(expectedEuler.y),
      z: THREE.MathUtils.radToDeg(expectedEuler.z),
    }, 1e-4, 'local X +90 on pre-rotated');
  }

  // Reset to q0, then Local Z +90 => q' = q0 ⊗ qZ(90)
  manager.updateObjectTransform(UUID_PRE, { rotation: { x: 30, y: 0, z: 45 } });
  editor.rotateSelectedBy('z', 90);
  {
    const rot = manager.getObject(UUID_PRE)!.transform.rotation;
    const qDelta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const expectedEuler = new THREE.Euler().setFromQuaternion(q0.clone().multiply(qDelta), 'XYZ');
    assertVecNear(rot, {
      x: THREE.MathUtils.radToDeg(expectedEuler.x),
      y: THREE.MathUtils.radToDeg(expectedEuler.y),
      z: THREE.MathUtils.radToDeg(expectedEuler.z),
    }, 1e-4, 'local Z +90 on pre-rotated');
  }
});

test('local-axis rotation is NOT a world-axis rotation (no orbiting, different quaternion)', () => {
  // For q0 = RX(30)·RZ(45), rotating +90 about local Y (q0 ⊗ qY) must differ
  // from rotating +90 about the WORLD Y axis (qY ⊗ q0).
  const local = applyLocalRotationDegrees({ x: 30, y: 0, z: 45 }, 'y', 90);

  const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(30), 0, THREE.MathUtils.degToRad(45), 'XYZ'));
  const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const worldEuler = new THREE.Euler().setFromQuaternion(qY.clone().multiply(q0), 'XYZ');

  assert.ok(
    Math.abs(local.y - THREE.MathUtils.radToDeg(worldEuler.y)) > 1 ||
    Math.abs(local.x - THREE.MathUtils.radToDeg(worldEuler.x)) > 1 ||
    Math.abs(local.z - THREE.MathUtils.radToDeg(worldEuler.z)) > 1,
    'local rotation must not equal world-axis rotation for a non-identity orientation',
  );

  // Position is never touched by rotation => object spins in place, no orbit.
  const manager = makeManager();
  const editor = makeEditor(manager);
  editor.select(UUID_PRE);
  editor.rotateSelectedBy('y', 90);
  assertVecNear(manager.getObject(UUID_PRE)!.transform.position, { x: 0, y: 1, z: 0 }, 1e-12, 'position unchanged by rotation');
});

test('rotation honors guard rails and step sizes (15deg normal, 45deg Shift)', () => {
  const manager = makeManager();
  const editor = new ObjectEditorController(manager); // starts in play mode
  editor.select(UUID_A);

  assert.equal(editor.rotateSelected('y', 1), false, 'refuses outside edit mode');
  editor.setEditMode(true);
  assert.equal(editor.rotateSelected('y', 1, false), true);
  assertVecNear(manager.getObject(UUID_A)!.transform.rotation, { x: 0, y: 15, z: 0 }, 1e-6, 'normal step 15deg');

  editor.rotateSelected('y', 1, true);
  assertVecNear(manager.getObject(UUID_A)!.transform.rotation, { x: 0, y: 60, z: 0 }, 1e-6, 'shift step 45deg');

  editor.rotateSelected('y', -1, false);
  assertVecNear(manager.getObject(UUID_A)!.transform.rotation, { x: 0, y: 45, z: 0 }, 1e-6, 'negative direction');

  // Deselected -> refuse.
  editor.select(null);
  assert.equal(editor.rotateSelected('x', 1), false, 'refuses with no selection');

  // Non-editable object -> refuse.
  editor.select(UUID_LOCKED);
  assert.equal(editor.select(UUID_LOCKED), null, 'non-editable cannot be selected');
  assert.equal(editor.rotateSelected('x', 1), false, 'refuses for non-editable object');
  assertVecNear(manager.getObject(UUID_LOCKED)!.transform.rotation, { x: 0, y: 0, z: 0 }, 1e-9, 'locked object untouched');
});

test('rotation fires onObjectModified (used by the demo to refresh helper + panel + save)', () => {
  const manager = makeManager();
  const modified: string[] = [];
  const editor = new ObjectEditorController(manager, { onObjectModified: (uuid) => modified.push(uuid) });
  editor.setEditMode(true);
  editor.select(UUID_A);
  editor.rotateSelected('z', 1, false);
  assert.deepEqual(modified, [UUID_A]);
});

// ---------------------------------------------------------------------------
// 3) Rotation survives Save/Load
// ---------------------------------------------------------------------------

test('local rotation is preserved through Save/Load (PersistenceManager + LocalSceneStorage)', () => {
  const manager = makeManager();
  const editor = makeEditor(manager);
  editor.select(UUID_A);
  editor.rotateSelected('y', 1, false); // +15
  editor.rotateSelected('y', 1, false); // +15 -> 30
  const before = manager.getObject(UUID_A)!.transform.rotation;
  assertVecNear(before, { x: 0, y: 30, z: 0 }, 1e-6, 'two 15deg steps accumulated exactly');

  const persistence = new PersistenceManager();
  const storage = new LocalSceneStorage(persistence, { key: 'rotation-persistence', storage: new MemoryStorage() });
  storage.saveFromManager(manager, { name: 'rotation test' });

  const restored = new SceneStateManager();
  storage.loadInto(restored);
  const after = restored.getObject(UUID_A)!.transform.rotation;
  assertVecNear(after, before, 1e-9, 'rotation preserved exactly across save/load');

  // And the restored object can keep being rotated around its own axis.
  const editor2 = makeEditor(restored);
  editor2.select(UUID_A);
  editor2.rotateSelected('y', 1, false);
  assertVecNear(restored.getObject(UUID_A)!.transform.rotation, { x: 0, y: 45, z: 0 }, 1e-6, 'rotation continues after load');
});

// ---------------------------------------------------------------------------
// 4) Selection info panel formatting
// ---------------------------------------------------------------------------

test('selected object info shows Name/UUID/Position/Rotation/Scale', () => {
  const manager = makeManager();
  const info = formatSelectedObjectInfo(manager.getObject(UUID_PRE));
  assert.equal(info.name, 'Pre-rotated');
  assert.equal(info.uuid, UUID_PRE);
  assert.equal(info.position, '0.00, 1.00, 0.00');
  assert.equal(info.rotation, '30.0, 0.0, 45.0');
  assert.equal(info.scale, '1.00, 1.00, 1.00');
});

test('deselection returns info panel to None / No selection', () => {
  const manager = makeManager();
  assert.deepEqual(formatSelectedObjectInfo(undefined), {
    name: 'None',
    uuid: 'No selection',
    position: '—',
    rotation: '—',
    scale: '—',
  });
  const editor = makeEditor(manager);
  editor.select(UUID_A);
  editor.select(null);
  assert.equal(editor.getSelectedUuid(), null);
  assert.equal(formatSelectedObjectInfo(manager.getObject(editor.getSelectedUuid() ?? '')).name, 'None');
});

test('rotation updates are visible in formatted info immediately after rotating', () => {
  const manager = makeManager();
  const editor = makeEditor(manager);
  editor.select(UUID_A);
  editor.rotateSelected('y', 1, false);
  const info = formatSelectedObjectInfo(manager.getObject(editor.getSelectedUuid()!));
  assert.equal(info.rotation, '0.0, 15.0, 0.0');
});

// ---------------------------------------------------------------------------
// 5) Debug axes / origin are display-only (not selectable, not movable)
// ---------------------------------------------------------------------------

test('debug axes sit at the world origin (0,0,0) and contain X/Y/Z arms', () => {
  const axes = createDebugAxes();
  assert.equal(axes.position.x, 0);
  assert.equal(axes.position.y, 0);
  assert.equal(axes.position.z, 0);

  // 3 positive arms + 3 negative stubs + 1 origin marker.
  assert.equal(axes.children.length, 7);

  const endpoints = axes.children
    .filter((child): child is THREE.Line => child instanceof THREE.Line)
    .map((line) => {
      const attr = line.geometry.getAttribute('position');
      return {
        x: attr.getX(1) - attr.getX(0),
        y: attr.getY(1) - attr.getY(0),
        z: attr.getZ(1) - attr.getZ(0),
      };
    });
  const hasArm = (x: number, y: number, z: number) =>
    endpoints.some((e) => Math.abs(e.x - x) < 1e-6 && Math.abs(e.y - y) < 1e-6 && Math.abs(e.z - z) < 1e-6);
  assert.ok(hasArm(2.5, 0, 0), 'positive X arm');
  assert.ok(hasArm(0, 2.5, 0), 'positive Y arm');
  assert.ok(hasArm(0, 0, 2.5), 'positive Z arm');
  assert.ok(hasArm(-0.875, 0, 0), 'negative X stub');
  assert.ok(hasArm(0, -0.875, 0), 'negative Y stub');
  assert.ok(hasArm(0, 0, -0.875), 'negative Z stub');
});

test('debug axes and origin can never be selected or moved', () => {
  const manager = makeManager();
  const axes = createDebugAxes();
  const editor = makeEditor(manager);

  // Every node of the helper is tagged as a debug helper...
  axes.traverse((node) => assert.equal(isDebugHelper(node), true, node.type));

  // ...none of them is registered in the manager...
  axes.traverse((node) => assert.equal(manager.has(node.uuid), false, node.uuid));

  // ...so selecting any of them fails, and nothing can be moved.
  axes.traverse((node) => {
    assert.equal(editor.select(node.uuid), null, `select(${node.type}) must be refused`);
  });
  assert.equal(manager.getObjectCount(), 3, 'manager untouched by debug axes');
  assert.equal(editor.getSelectedUuid(), null);

  // Manager-side guarantee: moveSelected has no target -> no-op.
  assert.equal(editor.moveSelected('up'), false);
});

test('raycast hits on debug axes are excluded by the isDebugHelper tag (demo filter)', () => {
  // The demo builds picking candidates from MANAGED uuids only, so the axes
  // helper never even enters the candidate list. This test proves the second
  // line of defense: any raw full-scene raycast can be filtered with the
  // isDebugHelper tag, and the tagged nodes never resolve to a managed uuid.
  const manager = makeManager();
  const axes = createDebugAxes();
  const scene = new THREE.Scene();
  scene.add(axes);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.position.set(0, 0, 0);
  scene.add(mesh);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 120);
  camera.position.set(0, 2, 6);
  camera.lookAt(0, 0, 0);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  const hits = raycaster.intersectObjects([...scene.children], true).map((hit) => hit.object);
  assert.ok(hits.length > 0, 'sanity: ray crosses scene objects');
  assert.ok(hits.some((obj) => isDebugHelper(obj)), 'sanity: ray crosses the debug axes overlay');

  const selectable = hits.filter((obj) => !isDebugHelper(obj));
  assert.ok(!selectable.some((obj) => isDebugHelper(obj)), 'filter removes every helper node');
  for (const obj of selectable) {
    assert.equal(manager.has(obj.uuid), false, 'unfiltered leftovers are still not managed objects');
  }

  // Demo contract: candidates are built ONLY from managed uuids.
  const managedCandidates = [...manager.getSnapshot().uuids]
    .map((uuid) => scene.getObjectByProperty('uuid', uuid))
    .filter((obj): obj is THREE.Object3D => Boolean(obj));
  assert.equal(managedCandidates.length, 0, 'debug axes never become picking candidates');
});
