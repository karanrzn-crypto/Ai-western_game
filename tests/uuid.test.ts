/**
 * tests/uuid.test.ts
 * -----------------------------------------------------------------------------
 * Node built-in test runner (`node --test`) tests for the UUID utility.
 * Run with:  npm test
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateUUID, isValidUUID } from '../src/utils/uuid.js';

test('generateUUID returns a v4-shaped string', () => {
  const uuid = generateUUID();
  assert.match(
    uuid,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test('isValidUUID accepts canonical v4 UUIDs', () => {
  assert.equal(isValidUUID('00000000-0000-4000-a000-000000000001'), true);
  assert.equal(isValidUUID('12345678-1234-4234-9234-123456789abc'), true);
});

test('isValidUUID rejects malformed inputs', () => {
  assert.equal(isValidUUID(''), false);
  assert.equal(isValidUUID('not-a-uuid'), false);
  // version 3 (not v4) must be rejected
  assert.equal(isValidUUID('00000000-0000-3000-a000-000000000001'), false);
  // variant byte 0 must be rejected
  assert.equal(isValidUUID('00000000-0000-4000-0234-123456789abc'), false);
});

test('generateUUID returns unique values across calls', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const u = generateUUID();
    assert.equal(seen.has(u), false, `duplicate uuid: ${u}`);
    seen.add(u);
  }
});
