/**
 * tests/asset-registry.test.ts
 * -----------------------------------------------------------------------------
 * Tests for the AssetRegistry — the abstraction that replaced the
 * hard-coded switch statement previously inside ThreeRendererAdapter.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AssetRegistry, CubeAssetFactory, registerPrimitiveFactories } from '../src/assets/index.js';
import type { ObjectDefinition } from '../src/core/types.js';

const CUBE_DEF: ObjectDefinition = {
  uuid: '00000000-0000-4000-a000-0000000000a1',
  assetType: 'cube',
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  },
  metadata: { name: 'Test Cube' },
};

test('registerPrimitiveFactories wires up the cube asset type', () => {
  const reg = new AssetRegistry();
  registerPrimitiveFactories(reg);
  assert.equal(reg.has('cube'), true);
  assert.deepEqual(reg.getRegisteredTypes(), ['cube']);
});

test('create() returns a THREE.Object3D for the cube asset type', async () => {
  const reg = new AssetRegistry();
  registerPrimitiveFactories(reg);
  const obj = await reg.create(CUBE_DEF);
  assert.ok(obj instanceof THREE.Object3D);
  assert.equal(obj.uuid, CUBE_DEF.uuid);
  assert.equal(obj.name, CUBE_DEF.metadata.name);
});

test('create() throws for an unregistered asset type (no silent placeholder)', async () => {
  const reg = new AssetRegistry();
  await assert.rejects(
    () => reg.create({ ...CUBE_DEF, assetType: 'unknown' }),
    /no factory registered for assetType "unknown"/,
  );
});

test('register() throws when a factory is already registered for a type', () => {
  const reg = new AssetRegistry();
  reg.register('cube', new CubeAssetFactory());
  assert.throws(() => reg.register('cube', new CubeAssetFactory()), /already registered/);
});

test('register() accepts a bare function as a factory', async () => {
  const reg = new AssetRegistry();
  reg.register('placeholder', () => new THREE.Object3D());
  assert.equal(reg.has('placeholder'), true);
  const obj = await reg.create({ ...CUBE_DEF, assetType: 'placeholder' });
  assert.ok(obj instanceof THREE.Object3D);
});

test('unregister() removes a factory', () => {
  const reg = new AssetRegistry();
  registerPrimitiveFactories(reg);
  assert.equal(reg.has('cube'), true);
  reg.unregister('cube');
  assert.equal(reg.has('cube'), false);
});

test('getLabel() returns the human label or the assetType itself', () => {
  const reg = new AssetRegistry();
  reg.register('cube', new CubeAssetFactory(), 'Demo Cube');
  reg.register('untagged', () => new THREE.Object3D());
  assert.equal(reg.getLabel('cube'), 'Demo Cube');
  assert.equal(reg.getLabel('untagged'), 'untagged');
});
