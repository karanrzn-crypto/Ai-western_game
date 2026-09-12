import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  LocalSceneStorage,
  MemoryStorage,
  ObjectEditorController,
  PersistenceManager,
  SceneStateManager,
  TransformGizmo,
  buildPanelTransformPatch,
  formatPanelNumber,
  formatSelectedObjectInfo,
  parsePanelNumber,
} from '../src/index.js';

const UUID_A = '60000000-0000-4000-a000-000000000001';
const UUID_LOCKED = '60000000-0000-4000-a000-000000000002';
const UUID_DOOR = '60000000-0000-4000-a000-000000000003';

function makeManager(): SceneStateManager {
  const manager = new SceneStateManager();
  manager.registerObject({
    uuid: UUID_A,
    assetType: 'cube',
    transform: {
      position: { x: 2, y: 1, z: 3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    metadata: { name: 'مکعب اسپاون', editable: true, collider: true },
  });
  manager.registerObject({
    uuid: UUID_LOCKED,
    assetType: 'cube',
    transform: {
      position: { x: 4, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    metadata: { name: 'دیوار مرزی شمالی', editable: false, collider: true },
  });
  return manager;
}

function makeEditor(manager: SceneStateManager): ObjectEditorController {
  const editor = new ObjectEditorController(manager);
  editor.setEditMode(true);
  return editor;
}

// ---------------------------------------------------------------------------
// 1) Pure panel helpers: parse + format
// ---------------------------------------------------------------------------

test('parsePanelNumber accepts valid numbers and rejects drafts', () => {
  assert.equal(parsePanelNumber('2.5'), 2.5);
  assert.equal(parsePanelNumber('  -3 '), -3);
  assert.equal(parsePanelNumber('0'), 0);
  assert.equal(parsePanelNumber('1e2'), 100); // scientific notation is valid in number inputs
  assert.equal(parsePanelNumber(''), null); // cleared field
  assert.equal(parsePanelNumber('   '), null);
  assert.equal(parsePanelNumber('-'), null); // in-progress draft
  assert.equal(parsePanelNumber('2.'), 2); // partial decimal still parses numerically
  assert.equal(parsePanelNumber('abc'), null);
  assert.equal(parsePanelNumber('Infinity'), null);
  assert.equal(parsePanelNumber('NaN'), null);
});

test('formatPanelNumber is compact and round-trips through parsePanelNumber', () => {
  assert.equal(formatPanelNumber(2.5), '2.5');
  assert.equal(formatPanelNumber(2), '2');
  assert.equal(formatPanelNumber(-1.25), '-1.25');
  assert.equal(formatPanelNumber(0), '0');
  assert.equal(formatPanelNumber(2.73548), '2.735'); // gizmo-precision values stay readable
  assert.equal(formatPanelNumber(Number.NaN), '');
  for (const value of [2.5, -1.25, 0, 12.345, -0.001]) {
    const parsed = parsePanelNumber(formatPanelNumber(value));
    assert.ok(parsed !== null);
    assert.ok(Math.abs(parsed - Number(value.toFixed(3))) < 1e-9);
  }
});

test('buildPanelTransformPatch produces the minimal merged patch shape', () => {
  assert.deepEqual(buildPanelTransformPatch('position', 'x', 5), { position: { x: 5 } });
  assert.deepEqual(buildPanelTransformPatch('rotation', 'y', 45), { rotation: { y: 45 } });
  assert.deepEqual(buildPanelTransformPatch('scale', 'z', 2), { scale: { z: 2 } });
});

// ---------------------------------------------------------------------------
// 2) Numeric edits apply through SceneStateManager.updateObjectTransform
// ---------------------------------------------------------------------------

test('numeric panel edit sets the absolute value and preserves the other axes', () => {
  const manager = makeManager();
  const editor = makeEditor(manager);
  editor.select(UUID_A);

  assert.equal(editor.setSelectedTransform(buildPanelTransformPatch('position', 'x', 7.5)), true);
  const transform = manager.getObject(UUID_A)!.transform;
  assert.equal(transform.position.x, 7.5);
  assert.equal(transform.position.y, 1); // untouched
  assert.equal(transform.position.z, 3); // untouched
  assert.deepEqual(transform.rotation, { x: 0, y: 0, z: 0 });
  assert.deepEqual(transform.scale, { x: 1, y: 1, z: 1 });

  assert.equal(editor.setSelectedTransform(buildPanelTransformPatch('rotation', 'y', 45)), true);
  assert.deepEqual(manager.getObject(UUID_A)!.transform.rotation, { x: 0, y: 45, z: 0 });

  assert.equal(editor.setSelectedTransform(buildPanelTransformPatch('scale', 'z', 2.5)), true);
  assert.deepEqual(manager.getObject(UUID_A)!.transform.scale, { x: 1, y: 1, z: 2.5 });
});

test('numeric edits flow through updateObjectTransform (event proof) and fire onObjectModified', () => {
  const manager = makeManager();
  const editor = makeEditor(manager);
  editor.select(UUID_A);

  const events: Array<{ uuid: string; x: number }> = [];
  manager.bus.on('object:transform-updated', ({ uuid, transform }) => {
    events.push({ uuid, x: transform.position.x });
  });

  let modified = 0;
  const probing = new ObjectEditorController(manager, {
    onObjectModified: () => { modified++; },
  });
  probing.setEditMode(true);
  probing.select(UUID_A);

  probing.setSelectedTransform(buildPanelTransformPatch('position', 'x', 9));
  assert.equal(events.length, 1); // emitted only by updateObjectTransform
  assert.equal(events[0]!.uuid, UUID_A);
  assert.equal(events[0]!.x, 9);
  assert.equal(modified, 1);
});

test('numeric edits respect the editor guard rails', () => {
  const manager = makeManager();

  const outsideEditor = new ObjectEditorController(manager);
  outsideEditor.select(UUID_A);
  assert.equal(outsideEditor.setSelectedTransform({ position: { x: 99 } }), false); // not in edit mode
  assert.equal(manager.getObject(UUID_A)!.transform.position.x, 2);

  const editor = makeEditor(manager);
  assert.equal(editor.setSelectedTransform({ position: { x: 99 } }), false); // nothing selected
  editor.select(UUID_LOCKED);
  assert.equal(editor.setSelectedTransform({ position: { x: 99 } }), false); // editable === false
  assert.equal(manager.getObject(UUID_LOCKED)!.transform.position.x, 4);
  editor.select(UUID_A);
  assert.equal(editor.setSelectedTransform({ position: { x: 5 } }), true);
});

// ---------------------------------------------------------------------------
// 3) Numeric edits and gizmo edits share one state source
// ---------------------------------------------------------------------------

test('after a numeric edit the gizmo rides the new transform', () => {
  const manager = makeManager();
  const editor = makeEditor(manager);
  editor.select(UUID_A);
  const gizmo = new TransformGizmo({ manager });

  gizmo.sync(true, UUID_A);
  assert.ok(Math.abs(gizmo.root.position.x - 2) < 1e-9);

  editor.setSelectedTransform(buildPanelTransformPatch('position', 'x', 8));
  gizmo.sync(true, UUID_A);
  assert.ok(Math.abs(gizmo.root.position.x - 8) < 1e-9); // gizmo follows numeric edits
});

test('numeric edit then gizmo-style local rotation compose on the same object', () => {
  const manager = makeManager();
  const editor = makeEditor(manager);
  editor.select(UUID_A);

  editor.setSelectedTransform(buildPanelTransformPatch('position', 'x', 5));
  editor.setSelectedTransform(buildPanelTransformPatch('rotation', 'y', 90)); // absolute set
  editor.rotateSelectedBy('x', 90); // local-axis rotation (gizmo/keyboard path)

  const rotation = manager.getObject(UUID_A)!.transform.rotation;
  // Stored Euler may re-parameterize past 90deg (e.g. qY(180) -> (180,0,180)),
  // so compare ORIENTATION: result must equal qY(90) post-multiplied by qX(90)
  // (= local X after a +90 yaw).
  const actual = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation.x * Math.PI / 180, rotation.y * Math.PI / 180, rotation.z * Math.PI / 180, 'XYZ'),
  );
  const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0, 'XYZ'))
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0, 'XYZ')));
  assert.ok(actual.angleTo(expected) < 1e-6, `orientation mismatch: (${rotation.x}, ${rotation.y}, ${rotation.z})`);
  assert.equal(manager.getObject(UUID_A)!.transform.position.x, 5); // position untouched by rotations
});

// ---------------------------------------------------------------------------
// 4) Human-readable names + UUID-as-debug + Save/Load preservation
// ---------------------------------------------------------------------------

test('panel info shows the human name as primary and the uuid as its own debug field', () => {
  const manager = makeManager();
  const info = formatSelectedObjectInfo(manager.getObject(UUID_A));
  assert.equal(info.name, 'مکعب اسپاون'); // Persian human name, not a uuid
  assert.equal(info.uuid, UUID_A); // uuid available separately for the debug line
  assert.notEqual(info.name, info.uuid);

  const none = formatSelectedObjectInfo(undefined);
  assert.equal(none.name, 'None');
  assert.equal(none.uuid, 'No selection');
});

test('Save/Load preserves numeric edits AND human-readable names', () => {
  const manager = makeManager();
  manager.registerObject({
    uuid: UUID_DOOR,
    assetType: 'door',
    transform: {
      position: { x: -6, y: 0, z: -4 },
      rotation: { x: 0, y: 20, z: 0 },
      scale: { x: 1, y: 2.2, z: 0.3 },
    },
    metadata: { name: 'در ورودی بانک', editable: true, collider: true },
  });

  const editor = makeEditor(manager);
  editor.select(UUID_DOOR);
  // Numeric panel edits (absolute values on all three groups).
  editor.setSelectedTransform(buildPanelTransformPatch('position', 'x', -2.5));
  editor.setSelectedTransform(buildPanelTransformPatch('position', 'y', 0.5));
  editor.setSelectedTransform(buildPanelTransformPatch('rotation', 'y', 35));
  editor.setSelectedTransform(buildPanelTransformPatch('scale', 'y', 3));

  const persistence = new PersistenceManager();
  const storage = new LocalSceneStorage(persistence, { key: 'test.selection-panel', storage: new MemoryStorage() });
  storage.saveFromManager(manager, { map: 'playable-map', mode: 'development' });
  assert.ok(storage.hasSavedScene());

  const reloaded = new SceneStateManager();
  const summary = storage.loadInto(reloaded);
  assert.ok(summary);
  assert.equal(summary!.loaded, 3);

  const door = reloaded.getObject(UUID_DOOR)!;
  assert.equal(door.metadata.name, 'در ورودی بانک'); // Persian name survives the round-trip
  assert.equal(door.transform.position.x, -2.5);
  assert.equal(door.transform.position.y, 0.5);
  assert.equal(door.transform.rotation.y, 35);
  assert.equal(door.transform.scale.y, 3);

  const cube = reloaded.getObject(UUID_A)!;
  assert.equal(cube.metadata.name, 'مکعب اسپاون');
  assert.equal(cube.transform.position.x, 2); // untouched object keeps its default

  const boundary = reloaded.getObject(UUID_LOCKED)!;
  assert.equal(boundary.metadata.name, 'دیوار مرزی شمالی');
});

test('a gizmo-committed transform and a numeric edit persist identically', () => {
  const manager = makeManager();
  const editor = makeEditor(manager);
  editor.select(UUID_A);

  // Simulate the end state of a gizmo X-drag (updateDrag writes the same way).
  manager.updateObjectTransform(UUID_A, { position: { x: 2.74, y: 1, z: 3 } });
  // Then a numeric correction on the same field.
  editor.setSelectedTransform(buildPanelTransformPatch('position', 'x', 3.25));

  const persistence = new PersistenceManager();
  const dump = persistence.exportSceneToJSON(manager);
  const raw = JSON.parse(JSON.stringify(dump));
  const entry = raw.objects.find((o: { uuid: string }) => o.uuid === UUID_A);
  assert.equal(entry.transform.position.x, 3.25);
  assert.equal(entry.metadata.name, 'مکعب اسپاون');

  const reloaded = new SceneStateManager();
  persistence.loadSceneFromJSON(raw, reloaded);
  assert.equal(reloaded.getObject(UUID_A)!.transform.position.x, 3.25);
});
