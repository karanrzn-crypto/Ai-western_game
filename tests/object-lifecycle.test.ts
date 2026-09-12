/**
 * tests/object-lifecycle.test.ts
 * -----------------------------------------------------------------------------
 * End-to-end lifecycle test:
 *   Create → Register → Update → Render → Save → Clear → Load
 *   → Render again → Delete → Recreate
 *
 * Verifies the directive §2 ("Object lifecycle") requirement.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneStateManager } from '../src/core/SceneStateManager.js';
import { PersistenceManager } from '../src/core/PersistenceManager.js';
import { HeadlessRendererAdapter } from '../src/engine/HeadlessRendererAdapter.js';

const UUID = '00000000-0000-4000-a000-0000000000f1';

function setup(): { manager: SceneStateManager; renderer: HeadlessRendererAdapter; persistence: PersistenceManager } {
  const renderer = new HeadlessRendererAdapter();
  const manager = new SceneStateManager({ renderer });
  const persistence = new PersistenceManager();
  return { manager, renderer, persistence };
}

test('full lifecycle: create → register → update → save → clear → load → render → delete → recreate', () => {
  const { manager, renderer, persistence } = setup();

  // --- Create + Register ---
  const def = manager.registerObject({
    uuid: UUID,
    assetType: 'cube',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    metadata: { name: 'Lifecycle Cube' },
  });
  assert.equal(manager.has(UUID), true);
  assert.equal(renderer.getActiveObjectCount(), 1);

  // --- Update ---
  manager.updateObjectTransform(def.uuid, { position: { x: 5, y: 1, z: 2 } });
  const afterUpdate = manager.getObject(def.uuid)!;
  assert.deepEqual(afterUpdate.transform.position, { x: 5, y: 1, z: 2 });

  // The renderer should have received the transform change.
  const lastChange = renderer.getChangeLog().at(-1);
  assert.equal(lastChange?.change.kind, 'transform');

  // --- Save (export) ---
  const dump = persistence.exportSceneToJSON(manager);
  assert.equal(dump.objects.length, 1);
  assert.equal(dump.objects[0].uuid, UUID);
  assert.deepEqual(dump.objects[0].transform.position, { x: 5, y: 1, z: 2 });

  // --- Clear ---
  manager.clear();
  assert.equal(manager.getObjectCount(), 0);
  assert.equal(renderer.getActiveObjectCount(), 0,
    'renderer must NOT leak stale objects after clear');

  // --- Load (restore) ---
  const summary = persistence.loadSceneFromJSON(dump, manager);
  assert.equal(summary.loaded, 1);
  assert.equal(manager.has(UUID), true);
  const restored = manager.getObject(UUID)!;
  assert.deepEqual(restored.transform.position, { x: 5, y: 1, z: 2 });
  assert.equal(restored.metadata.name, 'Lifecycle Cube');

  // --- Render again (renderer mirror should have the restored mesh) ---
  assert.equal(renderer.getActiveObjectCount(), 1);

  // --- Delete ---
  const removed = manager.unregisterObject(UUID);
  assert.equal(removed, true);
  assert.equal(manager.has(UUID), false);
  assert.equal(renderer.getActiveObjectCount(), 0,
    'renderer must NOT leak the mesh after unregisterObject');

  // --- Recreate with the same uuid ---
  const recreated = manager.registerObject({
    uuid: UUID,
    assetType: 'cube',
    metadata: { name: 'Lifecycle Cube v2' },
  });
  assert.equal(recreated.uuid, UUID);
  assert.equal(manager.has(UUID), true);
  assert.equal(renderer.getActiveObjectCount(), 1);
});

test('unregisterObject does not leave a stale renderer mesh', () => {
  const { manager, renderer } = setup();
  const a = manager.registerObject({ assetType: 'cube' });
  const b = manager.registerObject({ assetType: 'cube' });
  assert.equal(renderer.getActiveObjectCount(), 2);
  manager.unregisterObject(a.uuid);
  assert.equal(renderer.getActiveObjectCount(), 1);
  assert.equal(manager.getObjectCount(), 1);
  assert.equal(manager.has(b.uuid), true);
});

test('clear() removes every mesh and registry entry atomically', () => {
  const { manager, renderer } = setup();
  for (let i = 0; i < 5; i++) {
    manager.registerObject({ assetType: 'cube' });
  }
  assert.equal(renderer.getActiveObjectCount(), 5);
  manager.clear();
  assert.equal(manager.getObjectCount(), 0);
  assert.equal(renderer.getActiveObjectCount(), 0);
});
