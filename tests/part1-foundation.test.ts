import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CollisionWorld, DayNightCycle, LocalSceneStorage, MemoryStorage, ObjectEditorController, PersistenceManager, PlayerController, SceneStateManager } from '../src/index.js';

test('Part 1 foundation wiring works together across player, editor, persistence, and world systems', () => {
  const manager = new SceneStateManager();
  manager.registerObject({ uuid: '50000000-0000-4000-a000-000000000001', assetType: 'cube', transform: { position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 1, z: 2 } }, metadata: { name: 'Editable Platform', editable: true, collider: true } });
  const world = new CollisionWorld(() => manager.getAllObjects(), { floorY: 0 });
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
  const player = new PlayerController(world, { camera, initialPosition: { x: 0, y: 1.7, z: 4 }, yaw: 0 });
  const editor = new ObjectEditorController(manager);
  const persistence = new PersistenceManager();
  const storage = new LocalSceneStorage(persistence, { key: 'part1', storage: new MemoryStorage() });
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x000000, 1, 100);
  const cycle = new DayNightCycle(scene, new THREE.DirectionalLight(0xffffff, 2), new THREE.HemisphereLight(0xffffff, 0x000000, 1), { startTime: 8 });
  player.update(0.25, { forward: true }); cycle.update(0.25);
  editor.setEditMode(true); editor.select('50000000-0000-4000-a000-000000000001'); editor.moveSelected('up');
  storage.saveFromManager(manager, { name: 'integration' });
  const restored = new SceneStateManager(); storage.loadInto(restored);
  assert.ok(player.getPosition().z < 4);
  assert.equal(restored.getObject('50000000-0000-4000-a000-000000000001')?.transform.position.y, 0.75);
  assert.ok(cycle.getTimeOfDay() > 8);
});
