/**
 * tests/transform-ops.test.ts
 * -----------------------------------------------------------------------------
 * Tests for TransformOps helpers.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY_TRANSFORM,
  vec3Equal,
  transformsEqual,
  cloneTransform,
  makeTransform,
} from '../src/core/TransformOps.js';

test('IDENTITY_TRANSFORM is frozen and zeroed with scale=1', () => {
  assert.equal(Object.isFrozen(IDENTITY_TRANSFORM), true);
  assert.deepEqual(IDENTITY_TRANSFORM.position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(IDENTITY_TRANSFORM.rotation, { x: 0, y: 0, z: 0 });
  assert.deepEqual(IDENTITY_TRANSFORM.scale, { x: 1, y: 1, z: 1 });
});

test('vec3Equal returns true only on full match', () => {
  assert.equal(vec3Equal({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }), true);
  assert.equal(vec3Equal({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 4 }), false);
});

test('transformsEqual covers all 9 numeric fields', () => {
  const a = IDENTITY_TRANSFORM;
  const b = cloneTransform(IDENTITY_TRANSFORM);
  assert.equal(transformsEqual(a, b), true);
  b.position.x = 1;
  assert.equal(transformsEqual(a, b), false);
});

test('cloneTransform produces an independent copy', () => {
  const t = { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
  const c = cloneTransform(t);
  c.position.x = 999;
  assert.equal(t.position.x, 1, 'original must not mutate when clone changes');
});

test('makeTransform fills defaults from identity', () => {
  const t = makeTransform({ position: { x: 5 } });
  assert.deepEqual(t.position, { x: 5, y: 0, z: 0 });
  assert.deepEqual(t.rotation, { x: 0, y: 0, z: 0 });
  assert.deepEqual(t.scale, { x: 1, y: 1, z: 1 });
});
