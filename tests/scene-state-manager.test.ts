/**
 * tests/scene-state-manager.test.ts
 * -----------------------------------------------------------------------------
 * Node built-in test runner tests for SceneStateManager.
 * Run with:  npm test
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneStateManager } from '../src/core/SceneStateManager.js';
import { HeadlessRendererAdapter } from '../src/engine/HeadlessRendererAdapter.js';

function makeManager(): { manager: SceneStateManager; renderer: HeadlessRendererAdapter } {
  const renderer = new HeadlessRendererAdapter();
  const manager = new SceneStateManager({ renderer });
  return { manager, renderer };
}

test('registerObject assigns a uuid when omitted', () => {
  const { manager } = makeManager();
  const def = manager.registerObject({ assetType: 'wall' });
  assert.equal(def.uuid.length > 0, true);
  assert.equal(def.assetType, 'wall');
  assert.equal(def.metadata.name, 'Unnamed');
  assert.deepEqual(def.transform.position, { x: 0, y: 0, z: 0 });
});

test('registerObject preserves supplied uuid and metadata', () => {
  const { manager } = makeManager();
  const def = manager.registerObject({
    uuid: '00000000-0000-4000-a000-0000000000aa',
    assetType: 'chair',
    transform: {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 90, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    metadata: { name: 'My Chair', color: 'red' },
  });
  assert.equal(def.uuid, '00000000-0000-4000-a000-0000000000aa');
  assert.equal(def.metadata.color, 'red');
  assert.deepEqual(def.transform.position, { x: 1, y: 2, z: 3 });
});

test('registerObject rejects malformed uuid', () => {
  const { manager } = makeManager();
  assert.throws(() =>
    manager.registerObject({ uuid: 'nope', assetType: 'wall' }),
  );
});

test('registerObject rejects duplicate uuid', () => {
  const { manager } = makeManager();
  manager.registerObject({
    uuid: '00000000-0000-4000-a000-0000000000bb',
    assetType: 'wall',
  });
  assert.throws(() =>
    manager.registerObject({
      uuid: '00000000-0000-4000-a000-0000000000bb',
      assetType: 'wall',
    }),
  );
});

test('updateObjectTransform applies a partial patch', () => {
  const { manager } = makeManager();
  const def = manager.registerObject({
    uuid: '00000000-0000-4000-a000-0000000000cc',
    assetType: 'wall',
    transform: {
      position: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  // Move only on X; rotation and scale must be preserved.
  manager.updateObjectTransform(def.uuid, { position: { x: 5 } });
  const updated = manager.getObject(def.uuid)!;
  assert.deepEqual(updated.transform.position, { x: 5, y: 1, z: 1 });
  assert.deepEqual(updated.transform.rotation, { x: 0, y: 0, z: 0 });
  assert.deepEqual(updated.transform.scale, { x: 1, y: 1, z: 1 });
});

test('updateObjectTransform rejects non-finite numbers', () => {
  const { manager } = makeManager();
  const def = manager.registerObject({ assetType: 'wall' });
  assert.throws(() =>
    manager.updateObjectTransform(def.uuid, { position: { x: Number.NaN } }),
  );
});

test('updateObjectTransform throws on unknown uuid', () => {
  const { manager } = makeManager();
  assert.throws(() =>
    manager.updateObjectTransform('00000000-0000-4000-a000-999999999999', {
      position: { x: 1 },
    }),
  );
});

test('updateObjectTransform notifies renderer with the new transform', () => {
  const { manager, renderer } = makeManager();
  const def = manager.registerObject({ assetType: 'wall' });
  renderer.clearLog();
  manager.updateObjectTransform(def.uuid, { position: { x: 9 } });
  const logs = renderer.getChangeLog();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].change.kind, 'transform');
  if (logs[0].change.kind === 'transform') {
    assert.equal(logs[0].change.transform.position.x, 9);
  }
});

test('renderer is only notified once when dedupeRenders is on (no-op transform)', () => {
  const renderer = new HeadlessRendererAdapter();
  const manager = new SceneStateManager({ renderer, dedupeRenders: true });
  const def = manager.registerObject({
    assetType: 'wall',
    transform: {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  });
  renderer.clearLog();
  // Same transform patch — should be deduped.
  manager.updateObjectTransform(def.uuid, {
    position: { x: 1 },
    rotation: { x: 0 },
    scale: { x: 1 },
  });
  assert.equal(renderer.getChangeLog().length, 0);
});

test('unregisterObject removes the object and notifies renderer', () => {
  const { manager, renderer } = makeManager();
  const def = manager.registerObject({ assetType: 'wall' });
  const removed = manager.unregisterObject(def.uuid);
  assert.equal(removed, true);
  assert.equal(manager.has(def.uuid), false);
  const last = renderer.getChangeLog().at(-1);
  assert.equal(last?.change.kind, 'remove');
});

test('getSnapshot summarizes by assetType', () => {
  const { manager } = makeManager();
  manager.registerObject({ uuid: '00000000-0000-4000-a000-0000000000d1', assetType: 'wall' });
  manager.registerObject({ uuid: '00000000-0000-4000-a000-0000000000d2', assetType: 'wall' });
  manager.registerObject({ uuid: '00000000-0000-4000-a000-0000000000d3', assetType: 'chair' });
  const snap = manager.getSnapshot();
  assert.equal(snap.objectCount, 3);
  assert.equal(snap.byAssetType.wall, 2);
  assert.equal(snap.byAssetType.chair, 1);
});

test('getObjectsByAssetType filters correctly', () => {
  const { manager } = makeManager();
  manager.registerObject({ uuid: '00000000-0000-4000-a000-0000000000e1', assetType: 'wall' });
  manager.registerObject({ uuid: '00000000-0000-4000-a000-0000000000e2', assetType: 'chair' });
  manager.registerObject({ uuid: '00000000-0000-4000-a000-0000000000e3', assetType: 'chair' });
  const chairs = manager.getObjectsByAssetType('chair');
  assert.equal(chairs.length, 2);
});

test('returned definitions are frozen', () => {
  const { manager } = makeManager();
  const def = manager.registerObject({ assetType: 'wall' });
  assert.equal(Object.isFrozen(def), true);
  assert.throws(() => {
    (def as any).metadata.name = 'mutated';
  });
});

test('clear empties the registry', () => {
  const { manager } = makeManager();
  manager.registerObject({ assetType: 'wall' });
  manager.registerObject({ assetType: 'chair' });
  manager.clear();
  assert.equal(manager.getObjectCount(), 0);
});
