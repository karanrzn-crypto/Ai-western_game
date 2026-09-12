/**
 * tests/uuid-lifecycle.test.ts
 * -----------------------------------------------------------------------------
 * UUID-system tests per directive §4:
 *   - newly created objects receive a unique ID
 *   - saving preserves the ID
 *   - loading preserves the ID
 *   - duplicating an object creates a new ID
 *   - deleting an object removes it completely
 *   - loading the same scene does not silently create different IDs
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneStateManager } from '../src/core/SceneStateManager.js';
import { PersistenceManager } from '../src/core/PersistenceManager.js';
import { HeadlessRendererAdapter } from '../src/engine/HeadlessRendererAdapter.js';
import { generateUUID, isValidUUID } from '../src/utils/uuid.js';

function setup(): { manager: SceneStateManager; persistence: PersistenceManager } {
  const renderer = new HeadlessRendererAdapter();
  const manager = new SceneStateManager({ renderer });
  const persistence = new PersistenceManager();
  return { manager, persistence };
}

const UUID_A = '00000000-0000-4000-a000-0000000000a1';
const UUID_B = '00000000-0000-4000-a000-0000000000a2';

test('newly created objects receive a valid unique uuid', () => {
  const { manager } = setup();
  const a = manager.registerObject({ assetType: 'cube' });
  const b = manager.registerObject({ assetType: 'cube' });
  assert.equal(isValidUUID(a.uuid), true);
  assert.equal(isValidUUID(b.uuid), true);
  assert.notEqual(a.uuid, b.uuid);
});

test('saving preserves the uuid verbatim', () => {
  const { manager, persistence } = setup();
  manager.registerObject({ uuid: UUID_A, assetType: 'cube', metadata: { name: 'A' } });
  const dump = persistence.exportSceneToJSON(manager);
  assert.equal(dump.objects[0].uuid, UUID_A);
});

test('loading preserves the uuid verbatim', () => {
  const { manager, persistence } = setup();
  manager.registerObject({ uuid: UUID_A, assetType: 'cube', metadata: { name: 'A' } });
  const dump = persistence.exportSceneToJSON(manager);

  // Fresh manager — simulate cross-session restore.
  const freshRenderer = new HeadlessRendererAdapter();
  const freshManager = new SceneStateManager({ renderer: freshRenderer });
  persistence.loadSceneFromJSON(dump, freshManager);
  assert.equal(freshManager.has(UUID_A), true);
  assert.equal(freshManager.getObject(UUID_A)!.uuid, UUID_A);
});

test('duplicating an object creates a new uuid (auto-generated)', () => {
  const { manager } = setup();
  const original = manager.registerObject({ uuid: UUID_A, assetType: 'cube', metadata: { name: 'Original' } });
  const dup = manager.duplicateObject(original.uuid);
  assert.notEqual(dup.uuid, original.uuid);
  assert.equal(isValidUUID(dup.uuid), true);
  assert.equal(manager.has(original.uuid), true);
  assert.equal(manager.has(dup.uuid), true);
  assert.equal(manager.getObjectCount(), 2);
  assert.equal(dup.metadata.name, 'Original (copy)');
});

test('duplicating with an explicit override uuid uses that uuid (with collision check)', () => {
  const { manager } = setup();
  const original = manager.registerObject({ uuid: UUID_A, assetType: 'cube', metadata: { name: 'Original' } });
  const dup = manager.duplicateObject(original.uuid, { uuid: UUID_B });
  assert.equal(dup.uuid, UUID_B);

  // Collisions on override uuid are rejected.
  assert.throws(() => manager.duplicateObject(original.uuid, { uuid: UUID_B }));
});

test('duplicating an unknown uuid throws', () => {
  const { manager } = setup();
  assert.throws(() => manager.duplicateObject(UUID_A));
});

test('deleting an object removes it completely (no zombie uuid in registry)', () => {
  const { manager } = setup();
  manager.registerObject({ uuid: UUID_A, assetType: 'cube' });
  assert.equal(manager.has(UUID_A), true);
  manager.unregisterObject(UUID_A);
  assert.equal(manager.has(UUID_A), false);
  assert.equal(manager.getObject(UUID_A), undefined);
  // And re-registering with the same uuid should work (no stale entry).
  manager.registerObject({ uuid: UUID_A, assetType: 'cube' });
  assert.equal(manager.has(UUID_A), true);
});

test('loading the same scene twice does not silently create different uuids', () => {
  const { manager, persistence } = setup();
  const sceneData = {
    version: 1,
    exportedAt: '2024-01-01T00:00:00.000Z',
    objects: [
      {
        uuid: UUID_A,
        assetType: 'cube',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        metadata: { name: 'A' },
      },
    ],
  };
  persistence.loadSceneFromJSON(sceneData, manager);
  const firstLoad = manager.getObject(UUID_A)!;

  // Reload the SAME scene data — uuid must remain identical.
  persistence.loadSceneFromJSON(sceneData, manager);
  const secondLoad = manager.getObject(UUID_A)!;

  assert.equal(secondLoad.uuid, firstLoad.uuid);
  assert.equal(secondLoad.uuid, UUID_A);
  assert.equal(manager.getObjectCount(), 1,
    'reloading should not silently create additional entries');
});

test('duplicate followed by save preserves both uuids', () => {
  const { manager, persistence } = setup();
  const a = manager.registerObject({ uuid: UUID_A, assetType: 'cube', metadata: { name: 'A' } });
  const b = manager.duplicateObject(a.uuid, { uuid: UUID_B });
  const dump = persistence.exportSceneToJSON(manager);
  const uuids = dump.objects.map((o) => o.uuid).sort();
  assert.deepEqual(uuids, [UUID_A, UUID_B].sort());
  void b;
});

test('generateUUID is unique across many calls', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) {
    const u = generateUUID();
    assert.equal(seen.has(u), false, `collision on iteration ${i}: ${u}`);
    seen.add(u);
  }
});
