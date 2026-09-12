/**
 * tests/persistence-manager.test.ts
 * -----------------------------------------------------------------------------
 * Tests for the JSON persistence layer (exportSceneToJSON / loadSceneFromJSON).
 * Run with:  npm test
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneStateManager } from '../src/core/SceneStateManager.js';
import { PersistenceManager } from '../src/core/PersistenceManager.js';
import { HeadlessRendererAdapter } from '../src/engine/HeadlessRendererAdapter.js';

function setup(): { manager: SceneStateManager; persistence: PersistenceManager } {
  const renderer = new HeadlessRendererAdapter();
  const manager = new SceneStateManager({ renderer });
  const persistence = new PersistenceManager();
  return { manager, persistence };
}

test('exportSceneToJSON includes every registered object', () => {
  const { manager, persistence } = setup();
  manager.registerObject({
    uuid: '00000000-0000-4000-a000-000000000001',
    assetType: 'wall',
    transform: {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    metadata: { name: 'Wall A' },
  });
  const out = persistence.exportSceneToJSON(manager);
  assert.equal(out.version, 1);
  assert.equal(out.objects.length, 1);
  assert.equal(out.objects[0].uuid, '00000000-0000-4000-a000-000000000001');
  assert.deepEqual(out.objects[0].transform.position, { x: 1, y: 2, z: 3 });
  assert.equal(out.objects[0].metadata.name, 'Wall A');
});

test('loadSceneFromJSON restores uuid-persisted objects into a fresh manager', () => {
  const { manager, persistence } = setup();
  const sceneData = {
    version: 1 as const,
    exportedAt: '2024-01-01T00:00:00.000Z',
    objects: [
      {
        uuid: '00000000-0000-4000-a000-000000000010',
        assetType: 'wall',
        transform: {
          position: { x: 5, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        metadata: { name: 'North Wall' },
      },
      {
        uuid: '00000000-0000-4000-a000-000000000011',
        assetType: 'chair',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        metadata: { name: 'Chair 1' },
      },
    ],
  };
  const summary = persistence.loadSceneFromJSON(sceneData, manager);
  assert.equal(summary.loaded, 2);
  assert.equal(summary.skipped.length, 0);
  assert.equal(manager.has('00000000-0000-4000-a000-000000000010'), true);
  assert.equal(manager.has('00000000-0000-4000-a000-000000000011'), true);
  const wall = manager.getObject('00000000-0000-4000-a000-000000000010')!;
  assert.deepEqual(wall.transform.position, { x: 5, y: 0, z: 0 });
});

test('export → load round-trips with full fidelity', () => {
  const { manager, persistence } = setup();
  manager.registerObject({
    uuid: '00000000-0000-4000-a000-000000000020',
    assetType: 'door',
    transform: {
      position: { x: 1.5, y: 2.5, z: 3.5 },
      rotation: { x: 0, y: 45, z: 0 },
      scale: { x: 2, y: 2, z: 2 },
    },
    metadata: { name: 'Swing Door', swingDirection: 'inward' },
  });
  const dump = persistence.exportSceneToJSON(manager);
  // New manager — fresh session, simulating "uuid persists across sessions"
  const freshRenderer = new HeadlessRendererAdapter();
  const freshManager = new SceneStateManager({ renderer: freshRenderer });
  persistence.loadSceneFromJSON(dump, freshManager);
  const restored = freshManager.getObject('00000000-0000-4000-a000-000000000020')!;
  assert.equal(restored.assetType, 'door');
  assert.equal(restored.metadata.name, 'Swing Door');
  assert.equal(restored.metadata.swingDirection, 'inward');
  assert.deepEqual(restored.transform.position, { x: 1.5, y: 2.5, z: 3.5 });
  assert.deepEqual(restored.transform.rotation, { x: 0, y: 45, z: 0 });
  assert.deepEqual(restored.transform.scale, { x: 2, y: 2, z: 2 });
});

test('loadSceneFromJSON skips malformed entries but loads valid ones (lenient mode)', () => {
  const { manager, persistence } = setup();
  const sceneData = {
    version: 1 as const,
    exportedAt: '2024-01-01T00:00:00.000Z',
    objects: [
      {
        uuid: '00000000-0000-4000-a000-000000000030',
        assetType: 'wall',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        metadata: { name: 'OK' },
      },
      {
        uuid: 'not-a-uuid',
        assetType: 'wall',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        metadata: { name: 'Bad' },
      },
    ],
  };
  const summary = persistence.loadSceneFromJSON(sceneData, manager, { mode: 'lenient' });
  assert.equal(summary.loaded, 1);
  assert.equal(summary.skipped.length, 1);
});

test('loadSceneFromJSON rejects wrong schema version', () => {
  const { manager, persistence } = setup();
  assert.throws(() =>
    persistence.loadSceneFromJSON(
      { version: 99, exportedAt: 'x', objects: [] },
      manager,
    ),
  );
});
