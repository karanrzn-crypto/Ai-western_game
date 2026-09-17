/**
 * AuthoredLayout tests.
 *
 * Locks the "put it back" contract of the object editor:
 *   1. CAPTURE — the snapshot clones every definition's transform.
 *   2. RESTORE ONE — a deviating object returns to its authored transform
 *      through SceneStateManager.updateObjectTransform (the ONLY mutation
 *      funnel — renderer notifications fire, names never touched).
 *   3. RESTORE ALL — only actually-deviating objects are restored and the
 *      returned count is honest.
 *   4. SAFETY — unknown uuids restore nothing; the snapshot is detached from
 *      later registry mutations; isModified/isRestorable reflect reality.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { SceneStateManager } from '../src/core/SceneStateManager.js';
import { AuthoredLayout } from '../src/editor/AuthoredLayout.js';
import type { ObjectDefinition } from '../src/core/types.js';

function def(uuid: string, x: number, y = 0, name = `obj-${uuid.slice(-2)}`): ObjectDefinition {
  return {
    uuid,
    assetType: 'cube',
    transform: {
      position: { x, y, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    metadata: { name, editable: true },
  };
}

const A = '30000000-0000-4000-a000-000000000001';
const B = '30000000-0000-4000-a000-000000000002';
const C = '30000000-0000-4000-a000-000000000003';

test('AUTHORED LAYOUT: capture clones every transform; size reflects the registry', () => {
  const manager = new SceneStateManager();
  manager.registerObject(def(A, 1));
  manager.registerObject(def(B, 2));
  const layout = new AuthoredLayout();
  layout.capture(manager.getAllObjects());
  assert.equal(layout.size, 2);
  assert.ok(layout.has(A) && layout.has(B));
  assert.equal(layout.getTransform(A)?.position.x, 1);
});

test('AUTHORED LAYOUT: restore returns a moved object to its authored transform', () => {
  const manager = new SceneStateManager();
  manager.registerObject(def(A, 1));
  const layout = new AuthoredLayout();
  layout.capture(manager.getAllObjects());

  manager.updateObjectTransform(A, { position: { x: 99, y: 42, z: -7 } });
  const moved = manager.getObject(A)!;
  assert.ok(layout.isModified(moved), 'the moved def must read as modified');

  assert.equal(layout.restore(manager, A), true);
  const restored = manager.getObject(A)!;
  assert.deepEqual(restored.transform.position, { x: 1, y: 0, z: 0 });
  assert.deepEqual(restored.transform.rotation, { x: 0, y: 0, z: 0 });
  assert.deepEqual(restored.transform.scale, { x: 1, y: 1, z: 1 });
  assert.equal(layout.isModified(restored), false, 'restored def is no longer modified');
  // names are labels, not layout — a user rename survives the restore
  assert.equal(restored.metadata.name, 'obj-01');
});

test('AUTHORED LAYOUT: restoreAll restores only deviating objects and counts honestly', () => {
  const manager = new SceneStateManager();
  manager.registerObject(def(A, 1));
  manager.registerObject(def(B, 2));
  manager.registerObject(def(C, 3));
  const layout = new AuthoredLayout();
  layout.capture(manager.getAllObjects());

  manager.updateObjectTransform(A, { position: { x: 50, y: 0, z: 0 } });
  manager.updateObjectTransform(B, { rotation: { x: 0, y: 90, z: 0 } });

  assert.equal(layout.restoreAll(manager), 2, 'only A and B deviate');
  assert.deepEqual(manager.getObject(A)!.transform.position, { x: 1, y: 0, z: 0 });
  assert.deepEqual(manager.getObject(B)!.transform.rotation, { x: 0, y: 0, z: 0 });
  assert.equal(layout.restoreAll(manager), 0, 'second pass: everything already authored');
});

test('AUTHORED LAYOUT: unknown uuids restore nothing; the snapshot survives registry churn', () => {
  const manager = new SceneStateManager();
  manager.registerObject(def(A, 1));
  const layout = new AuthoredLayout();
  layout.capture(manager.getAllObjects());

  assert.equal(layout.restore(manager, B), false, 'unknown uuid must not restore');
  assert.equal(layout.restore(manager, A), true);

  // the snapshot is detached: later mutations of the captured defs never
  // leak into the stored authored transforms
  manager.updateObjectTransform(A, { position: { x: 7, y: 7, z: 7 } });
  assert.equal(layout.getTransform(A)?.position.x, 1, 'authored snapshot stays pristine');
});
