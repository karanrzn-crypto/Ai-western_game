/**
 * tests/contact-indicator.test.ts
 * -----------------------------------------------------------------------------
 * Regression tests for the Edit-mode flush-contact indicator:
 *   - surface/bounds-based contact math (NOT center distance),
 *   - ground contact at the object's footprint,
 *   - live show/hide while transforms change (gizmo-drag simulation),
 *   - strict separation: never managed, never saved, never selectable.
 * -----------------------------------------------------------------------------
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  ContactIndicator,
  DEFAULT_CONTACT_EPSILON,
  LocalSceneStorage,
  MemoryStorage,
  PersistenceManager,
  SceneStateManager,
  computeBoxContact,
  isDebugHelper,
} from '../src/index.js';
import type { ObjectDefinition } from '../src/index.js';

const EPS = DEFAULT_CONTACT_EPSILON; // 0.08

const UUID_A = '70000000-0000-4000-a000-000000000001';
const UUID_B = '70000000-0000-4000-a000-000000000002';
const UUID_GROUND = '70000000-0000-4000-a000-000000000003';

function box(
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
}

function approx(actual: number, expected: number, tol = 1e-9, message?: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    message ?? `expected ${actual} ≈ ${expected} (±${tol})`,
  );
}

function vecApprox(actual: THREE.Vector3, x: number, y: number, z: number, tol = 1e-9, message?: string): void {
  assert.ok(
    Math.abs(actual.x - x) <= tol && Math.abs(actual.y - y) <= tol && Math.abs(actual.z - z) <= tol,
    message ?? `expected (${actual.x}, ${actual.y}, ${actual.z}) ≈ (${x}, ${y}, ${z})`,
  );
}

// ---------------------------------------------------------------------------
// computeBoxContact — surface/bounds based detection
// ---------------------------------------------------------------------------

test('detects EXACT face-to-face contact (gap 0) on X, not center distance', () => {
  // Centers are 1.0 apart — center-distance checks would fire much too early.
  const a = box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
  const b = box(0.5, -0.5, -0.5, 1.5, 0.5, 0.5);
  const contact = computeBoxContact(a, b, EPS);
  assert.ok(contact);
  assert.equal(contact.axis, 'x');
  approx(contact.gap, 0);
  vecApprox(contact.normal, 1, 0, 0);
  // Marker sits BETWEEN the two facing surfaces (x = 0.5), centered on their overlap.
  vecApprox(contact.point, 0.5, 0, 0);
});

test('detects a near-flush gap within the tight epsilon and reports the midpoint', () => {
  const a = box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
  const b = box(0.508, -0.5, -0.5, 1.508, 0.5, 0.5); // gap = 0.008 (< 0.01)
  const contact = computeBoxContact(a, b, EPS);
  assert.ok(contact);
  approx(contact.gap, 0.008);
  approx(contact.point.x, (0.5 + 0.508) / 2, 1e-9, 'marker between the two surfaces');
});

test('marker is HIDDEN a little before contact (gap 0.03) — the old loose threshold bug', () => {
  const a = box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
  const b = box(0.53, -0.5, -0.5, 1.53, 0.5, 0.5); // gap = 0.03 > 0.01
  assert.equal(computeBoxContact(a, b, EPS), null);
});

test('marker is HIDDEN when surfaces sink just past epsilon (0.02 penetration)', () => {
  const a = box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
  const b = box(0.48, -0.5, -0.5, 1.48, 0.5, 0.5); // 0.02 deep — merged, not flush
  assert.equal(computeBoxContact(a, b, EPS), null);
});

test('a hair of penetration (0.005) still reads as flush contact', () => {
  const a = box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
  const b = box(0.495, -0.5, -0.5, 1.495, 0.5, 0.5);
  const contact = computeBoxContact(a, b, EPS);
  assert.ok(contact);
  approx(contact.gap, -0.005);
});

test('no contact when the surface gap exceeds epsilon', () => {
  const a = box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
  const b = box(0.75, -0.5, -0.5, 1.75, 0.5, 0.5); // gap = 0.25 > 0.01
  assert.equal(computeBoxContact(a, b, EPS), null);
});

test('no contact for a corner graze (gap on two axes at once)', () => {
  const a = box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
  const b = box(0.505, -0.5, 1.53, 1.505, 0.5, 2.53); // x gap 0.005, z gap 1.03
  assert.equal(computeBoxContact(a, b, EPS), null);
});

test('no contact when the shared face area is below minOverlap', () => {
  const a = box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
  const b = box(0.5, 0.49, 0.49, 1.5, 1.5, 1.5); // flush on x, but overlap is only 0.01 in y and z
  assert.equal(computeBoxContact(a, b, EPS), null);
});

test('no contact when boxes deeply interpenetrate (merged, not flush)', () => {
  const a = box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
  const b = box(-0.2, -0.2, -0.2, 0.2, 0.2, 0.2); // fully inside a
  assert.equal(computeBoxContact(a, b, EPS), null);
});

test('GROUND contact: flat ground below, marker at the object footprint midpoint', () => {
  const cube = box(-1.5, 0.005, -1.5, 1.5, 0.505, 1.5); // floating 0.005 above the floor
  const ground = box(-30, 0, -30, 30, 0, 30); // degenerate (flat) ground AABB
  const contact = computeBoxContact(cube, ground, EPS);
  assert.ok(contact);
  assert.equal(contact.axis, 'y');
  approx(contact.gap, 0.005);
  vecApprox(contact.normal, 0, -1, 0, 1e-9, 'normal points from the cube toward the ground');
  // Centered on the CUBE's footprint (0, y, 0) — not the ground's center.
  vecApprox(contact.point, 0, 0.0025, 0);
});

test('ground contact fires when the object rests EXACTLY on the floor (gap 0)', () => {
  const cube = box(-1.5, 0, -1.5, 1.5, 0.5, 1.5);
  const ground = box(-30, 0, -30, 30, 0, 30);
  const contact = computeBoxContact(cube, ground, EPS);
  assert.ok(contact);
  approx(contact.gap, 0);
});

test('no contact while the object floats only 0.03 above the floor (beyond tight epsilon)', () => {
  const cube = box(-1.5, 0.03, -1.5, 1.5, 0.53, 1.5);
  const ground = box(-30, 0, -30, 30, 0, 30);
  assert.equal(computeBoxContact(cube, ground, EPS), null);
});

test('deeply sunken faces do not qualify even for the most-flush ranking', () => {
  // Sunk 0.07 into x and 0.05 into y — both beyond the tight epsilon, so
  // neither face counts as flush any more (merged, not touching).
  const a = box(0, 0, 0, 1, 1, 1);
  const b = box(0.93, 0.95, -0.5, 1.93, 1.6, 0.5);
  assert.equal(computeBoxContact(a, b, EPS), null);
});

// ---------------------------------------------------------------------------
// ContactIndicator — scene integration (meshes + manager-like stub)
// ---------------------------------------------------------------------------

interface StubManager {
  getObject(uuid: string): Readonly<ObjectDefinition> | undefined;
  getAllObjects(): readonly Readonly<ObjectDefinition>[];
}

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
  mesh.uuid = uuid; // mirrors ThreeRendererAdapter (mesh.uuid = def.uuid)
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

function makeStubManager(defs: ObjectDefinition[]): StubManager {
  return {
    getObject: (uuid) => defs.find((d) => d.uuid === uuid),
    getAllObjects: () => defs,
  };
}

test('indicator appears between two touching cubes and hides when they separate', () => {
  const scene = new THREE.Scene();
  const meshA = addCubeMesh(scene, UUID_A, 0, 0, 0);
  const meshB = addCubeMesh(scene, UUID_B, 1.4, 0, 0); // gap 0.4 — apart
  const defs = [cubeDef(UUID_A, 'A', true), cubeDef(UUID_B, 'B', true)];
  const manager = makeStubManager(defs);
  const indicator = new ContactIndicator();

  indicator.update({ editMode: true, selectedUuid: UUID_A, scene, manager });
  assert.equal(indicator.group.visible, false, 'hidden while apart');

  meshB.position.x = 1.005; // gap 0.005 — flush within the tight epsilon
  const contact = computeBoxContact(
    new THREE.Box3().setFromObject(meshA),
    new THREE.Box3().setFromObject(meshB),
    EPS,
  );
  assert.ok(contact);
  indicator.update({ editMode: true, selectedUuid: UUID_A, scene, manager });
  assert.equal(indicator.group.visible, true, 'shown while flush');
  vecApprox(indicator.group.position, contact.point.x, contact.point.y, contact.point.z, 1e-9);

  meshB.position.x = 1.05; // separated again (gap 0.05 > epsilon)
  indicator.update({ editMode: true, selectedUuid: UUID_A, scene, manager });
  assert.equal(indicator.group.visible, false, 'hidden IMMEDIATELY once contact ends');
});

test('ground contact through update(): ring lies flat under the object', () => {
  const scene = new THREE.Scene();
  addCubeMesh(scene, UUID_A, 0, 0.505, 0); // cube bottom at y = 0.005
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60));
  ground.uuid = UUID_GROUND;
  ground.rotation.x = -Math.PI / 2; // horizontal plane, AABB y-extent 0
  scene.add(ground);

  const groundDef: ObjectDefinition = {
    uuid: UUID_GROUND,
    assetType: 'ground',
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: -90, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { name: 'زمین نقشه اصلی', editable: false, collider: false },
  };
  const defs = [groundDef, cubeDef(UUID_A, 'A', true)];
  const manager = makeStubManager(defs);
  const indicator = new ContactIndicator();

  indicator.update({ editMode: true, selectedUuid: UUID_A, scene, manager });
  assert.equal(indicator.group.visible, true, 'ground counts as a contact surface');
  approx(indicator.group.position.y, 0.0025, 1e-6, 'marker between the cube bottom and the ground');
  const expected = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, -1, 0),
  );
  approx(
    indicator.group.quaternion.angleTo(expected), 0, 1e-6,
    'ring plane faces the ground (normal from cube toward ground)',
  );
});

test('indicator stays hidden without edit mode, without selection, or for a non-editable selection', () => {
  const scene = new THREE.Scene();
  addCubeMesh(scene, UUID_A, 0, 0, 0);
  addCubeMesh(scene, UUID_B, 1, 0, 0); // touching
  const defs = [
    cubeDef(UUID_A, 'A', true),
    { ...cubeDef(UUID_B, 'Locked', false) },
  ];
  const manager = makeStubManager(defs);
  const indicator = new ContactIndicator();

  indicator.update({ editMode: false, selectedUuid: UUID_A, scene, manager });
  assert.equal(indicator.group.visible, false, 'play mode: hidden');

  indicator.update({ editMode: true, selectedUuid: null, scene, manager });
  assert.equal(indicator.group.visible, false, 'no selection: hidden');

  indicator.update({ editMode: true, selectedUuid: UUID_B, scene, manager });
  assert.equal(indicator.group.visible, false, 'non-editable selection: hidden (nothing can move it)');

  indicator.update({ editMode: true, selectedUuid: 'missing-uuid', scene, manager });
  assert.equal(indicator.group.visible, false, 'unknown selection: hidden');
});

test('live gizmo-style drag: contact state follows every transform commit', () => {
  const scene = new THREE.Scene();
  const meshA = addCubeMesh(scene, UUID_A, 0, 0, 0);
  const meshB = addCubeMesh(scene, UUID_B, 4, 0, 0);
  const defB = cubeDef(UUID_B, 'B', true);
  const manager = makeStubManager([cubeDef(UUID_A, 'A', true), defB]);
  const indicator = new ContactIndicator();

  const dragTo = (x: number): void => {
    // What TransformGizmo.updateDrag does: manager.updateObjectTransform
    // (def) + the adapter mirrors it onto the mesh, then the frame runs.
    defB.transform.position.x = x;
    meshB.position.x = x;
    indicator.update({ editMode: true, selectedUuid: UUID_A, scene, manager });
  };

  dragTo(3.0);
  assert.equal(indicator.group.visible, false, 'gap 2.0');
  dragTo(1.5);
  assert.equal(indicator.group.visible, false, 'gap 0.5');
  dragTo(1.05);
  assert.equal(indicator.group.visible, false, 'gap 0.05 — beyond the tight epsilon, no ghost marker');
  dragTo(1.005);
  assert.equal(indicator.group.visible, true, 'gap 0.005 — flush while dragging');
  dragTo(1.0);
  assert.equal(indicator.group.visible, true, 'gap 0 — exact contact');
  dragTo(1.9);
  assert.equal(indicator.group.visible, false, 'hidden the frame the surfaces separate');

  assert.equal(meshA.visible, true, 'indicator never touches the objects themselves');
});

// ---------------------------------------------------------------------------
// Separation guarantees
// ---------------------------------------------------------------------------

test('indicator is never a managed object: debug-tagged, unregistered, not saved, no collider', () => {
  const manager = new SceneStateManager();
  manager.registerObject({
    uuid: UUID_A,
    assetType: 'cube',
    transform: { position: { x: 0, y: 0.75, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { name: 'Editable', editable: true, collider: true },
  });
  manager.registerObject({
    uuid: UUID_B,
    assetType: 'cube',
    transform: { position: { x: 1, y: 0.75, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { name: 'Neighbor', editable: true, collider: true },
  });
  const scene = new THREE.Scene();
  addCubeMesh(scene, UUID_A, 0, 0.75, 0);
  addCubeMesh(scene, UUID_B, 1, 0.75, 0);
  const before = manager.getObjectCount();

  const indicator = new ContactIndicator();
  indicator.update({ editMode: true, selectedUuid: UUID_A, scene, manager });
  assert.equal(indicator.group.visible, true, 'sanity: the two cubes touch');

  let nodes = 0;
  indicator.group.traverse((node) => {
    nodes += 1;
    assert.equal(isDebugHelper(node), true, `debug tag on ${node.type}`);
    assert.equal(manager.has(node.uuid), false, `not managed: ${node.type}`);
  });
  assert.ok(nodes >= 3, 'ring + dot + root built');

  const persistence = new PersistenceManager();
  const storage = new LocalSceneStorage(persistence, { key: 'contact-separation', storage: new MemoryStorage() });
  storage.saveFromManager(manager, { name: 'separation' });
  const restored = new SceneStateManager();
  storage.loadInto(restored);
  assert.equal(restored.getObjectCount(), before, 'only the real objects survive save/load');
  indicator.group.traverse((node) => {
    assert.equal(restored.has(node.uuid), false, 'indicator node absent from loaded scene');
  });
  assert.equal(restored.getObject(UUID_A)?.metadata.collider, true, 'real object keeps its collider; indicator added none');
});
