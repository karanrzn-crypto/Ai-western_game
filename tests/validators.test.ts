/**
 * tests/validators.test.ts
 * -----------------------------------------------------------------------------
 * Tests for merge / validate helpers used by SceneStateManager.
 * Run with:  npm test
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeVec3, mergeTransform, validateTransform } from '../src/core/validators.js';
import { DEFAULT_TRANSFORM } from '../src/core/types.js';

test('mergeVec3 keeps base value when patch omits axis', () => {
  const out = mergeVec3({ x: 1, y: 2, z: 3 }, { x: 9 });
  assert.deepEqual(out, { x: 9, y: 2, z: 3 });
});

test('mergeVec3 returns clone of base when patch undefined', () => {
  const base = { x: 1, y: 2, z: 3 };
  const out = mergeVec3(base, undefined);
  assert.deepEqual(out, base);
  // Ensure no shared reference
  out.x = 99;
  assert.equal(base.x, 1);
});

test('mergeTransform merges only the supplied subfields', () => {
  const base = DEFAULT_TRANSFORM;
  const out = mergeTransform(base, { position: { y: 5 }, scale: { x: 2 } });
  assert.deepEqual(out.position, { x: 0, y: 5, z: 0 });
  assert.deepEqual(out.rotation, { x: 0, y: 0, z: 0 });
  assert.deepEqual(out.scale, { x: 2, y: 1, z: 1 });
});

test('validateTransform throws on NaN', () => {
  assert.throws(() =>
    validateTransform({ position: { x: Number.NaN } }),
  );
});

test('validateTransform throws on Infinity', () => {
  assert.throws(() =>
    validateTransform({ rotation: { y: Number.POSITIVE_INFINITY } }),
  );
});

test('validateTransform throws on non-number', () => {
  assert.throws(() =>
    validateTransform({ scale: { z: 'big' as unknown as number } }),
  );
});

test('validateTransform passes a clean partial patch', () => {
  assert.doesNotThrow(() =>
    validateTransform({ position: { x: 1, y: 2, z: 3 } }),
  );
});
