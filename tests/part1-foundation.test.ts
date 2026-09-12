import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CollisionWorld, DayNightCycle, SceneStateManager } from '../src/index.js';

test('CollisionWorld stops the player at a solid cube', () => {
  const manager = new SceneStateManager();
  manager.registerObject({
    uuid: '20000000-0000-4000-a000-000000000001',
    assetType: 'cube',
    transform: {
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 2, y: 2, z: 2 },
    },
    metadata: { name: 'Test Wall', collider: true },
  });

  const world = new CollisionWorld(() => manager.getAllObjects(), 0);
  const result = world.movePlayer(
    { x: 2, y: 1.7, z: 0 },
    { x: -1, y: 0, z: 0 },
  );

  assert.equal(result.blockedX, true);
  assert.equal(result.position.x, 2);
});

test('CollisionWorld keeps the player on the ground', () => {
  const world = new CollisionWorld(() => [], 0);
  const result = world.movePlayer(
    { x: 0, y: 2, z: 0 },
    { x: 0, y: -5, z: 0 },
  );

  assert.equal(result.grounded, true);
  assert.equal(result.position.y, 1.7);
});

test('DayNightCycle advances time and changes sun intensity', () => {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  scene.add(sun, hemisphere);
  const cycle = new DayNightCycle(scene, sun, hemisphere, {
    dayDurationSeconds: 120,
    startTime: 12,
  });
  const startTime = cycle.getTimeOfDay();
  const startIntensity = sun.intensity;

  cycle.update(10);

  assert.notEqual(cycle.getTimeOfDay(), startTime);
  assert.notEqual(sun.intensity, startIntensity);
});
