/**
 * tests/bugfixes.test.ts
 * -----------------------------------------------------------------------------
 * Regression tests for the five bugs found and fixed during the 2026-09
 * code review. Each test reproduces the original failure mode and asserts
 * the corrected behaviour.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  AssetRegistry,
  CollisionWorld,
  LocalSceneStorage,
  MemoryStorage,
  PersistenceManager,
  PlayerController,
  SceneLoadError,
  SceneStateManager,
  ThreeRendererAdapter,
  configure,
  resetConfig,
} from '../src/index.js';
import { HeadlessRendererAdapter } from '../src/engine/HeadlessRendererAdapter.js';

// ---------------------------------------------------------------------------
// BUG 1 — ThreeRendererAdapter kept a zombie mesh when an async asset load
//         resolved AFTER the object had been unregistered.
// ---------------------------------------------------------------------------
test('regression: async mesh resolving after removal is disposed, not added', async () => {
  const registry = new AssetRegistry();
  registry.register('slowcube', (): THREE.Object3D | Promise<THREE.Object3D> => {
    return new Promise<THREE.Object3D>((resolve) => {
      setTimeout(() => resolve(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))), 10);
    });
  });
  const scene = new THREE.Scene();
  const adapter = new ThreeRendererAdapter({ scene, assetRegistry: registry });
  const manager = new SceneStateManager({ renderer: adapter });

  const def = manager.registerObject({ assetType: 'slowcube', metadata: { name: 'Slow' } });
  manager.unregisterObject(def.uuid);
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(adapter.getActiveObjectCount(), 0, 'renderer must not track removed objects');
  assert.equal(scene.children.length, 0, 'scene graph must not contain zombie meshes');
});

// ---------------------------------------------------------------------------
// BUG 2 — loadSceneFromJSON cleared the manager before hitting the
//         maxObjects ceiling, breaking atomicity and throwing a generic Error.
// ---------------------------------------------------------------------------
test('regression: atomic load exceeding maxObjects throws SceneLoadError and leaves manager untouched', () => {
  configure({ scene: { maxObjects: 2 } });
  try {
    const manager = new SceneStateManager({ renderer: new HeadlessRendererAdapter() });
    manager.registerObject({
      uuid: '00000000-0000-4000-a000-0000000000a1',
      assetType: 'cube',
      metadata: { name: 'PreExisting' },
    });
    const persistence = new PersistenceManager();
    const scene = {
      version: 1,
      exportedAt: '2024-01-01T00:00:00.000Z',
      objects: [1, 2, 3].map((i) => ({
        uuid: `00000000-0000-4000-a000-00000000000${i}`,
        assetType: 'cube',
        transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        metadata: { name: `Obj ${i}` },
      })),
    };

    assert.throws(
      () => persistence.loadSceneFromJSON(scene, manager),
      (err: unknown) => err instanceof SceneLoadError,
      'ceiling violation must surface as SceneLoadError',
    );
    assert.equal(manager.getObjectCount(), 1, 'pre-existing state must survive the failed load');
    assert.equal(manager.has('00000000-0000-4000-a000-0000000000a1'), true);
  } finally {
    resetConfig();
  }
});

// ---------------------------------------------------------------------------
// BUG 3 — LocalSceneStorage.load() silently DESTROYED saves it could not
//         validate. Correct behaviour: keep the raw payload, return null.
// ---------------------------------------------------------------------------
test('regression: invalid save is kept on disk, not silently wiped', () => {
  const persistence = new PersistenceManager();
  const backend = new MemoryStorage();
  const storage = new LocalSceneStorage(persistence, { key: 'future', storage: backend });
  const rawSave = JSON.stringify({ version: 99, exportedAt: '2030-01-01T00:00:00.000Z', objects: [] });
  backend.setItem('future', rawSave);

  assert.equal(storage.load(), null, 'unvalidatable save reports as "no scene"');
  assert.equal(backend.getItem('future'), rawSave, 'raw payload must be preserved for future recovery');
  assert.equal(storage.hasSavedScene(), true, 'save must NOT be silently destroyed');
});

// ---------------------------------------------------------------------------
// BUG 4 — third-person camera ignored pitch entirely (dead look up/down).
// ---------------------------------------------------------------------------
test('regression: third-person camera responds to pitch', () => {
  const world = new CollisionWorld(() => [], { floorY: 0 });
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
  const player = new PlayerController(world, {
    camera,
    initialPosition: { x: 0, y: 1.7, z: 0 },
    cameraMode: 'third_person',
  });

  const yNeutral = camera.position.y;
  player.look(0, -400); // look up (pitch > 0)
  const yUp = camera.position.y;
  player.look(0, 800); // look down (pitch < 0)
  const yDown = camera.position.y;

  // Standard third-person orbit: looking UP swings the camera LOW behind the
  // player (low-angle shot); looking DOWN raises it (bird's-eye). The dead-pitch
  // bug was that the camera never moved at all.
  assert.ok(yUp < yNeutral - 0.5, `looking up must LOWER the camera (${yUp} < ${yNeutral})`);
  assert.ok(yDown > yNeutral + 0.5, `looking down must RAISE the camera (${yDown} > ${yNeutral})`);
});

// ---------------------------------------------------------------------------
// BUG 5 — CollisionWorld deep-cloned the entire scene on every movePlayer
//         call. With an event bus wired in, bounds are cached and only
//         rebuilt when the scene actually changes.
// ---------------------------------------------------------------------------
test('regression: collision bounds are cached and invalidated via the event bus', () => {
  const manager = new SceneStateManager();
  let definitionsCalls = 0;
  const world = new CollisionWorld(
    () => { definitionsCalls += 1; return manager.getAllObjects(); },
    { floorY: 0, events: manager.bus },
  );

  manager.registerObject({
    uuid: '00000000-0000-4000-a000-0000000000b1',
    assetType: 'cube',
    transform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 2, z: 2 } },
    metadata: { name: 'Wall', collider: true },
  });

  world.getCollisionBounds();
  const afterFirst = definitionsCalls;
  for (let i = 0; i < 10; i += 1) {
    world.movePlayer({ x: 3, y: 1.7, z: 0 }, { x: 0.1, y: 0, z: 0.1 });
  }
  assert.equal(definitionsCalls, afterFirst, 'repeated moves must reuse cached bounds (no O(N) rebuilds)');

  // A scene mutation must invalidate the cache exactly once.
  const uuid = '00000000-0000-4000-a000-0000000000b1';
  manager.updateObjectTransform(uuid, { position: { x: 10 } });
  world.getCollisionBounds();
  assert.equal(definitionsCalls, afterFirst + 1, 'transform change rebuilds bounds once');

  const bounds = world.getCollisionBounds();
  assert.equal(bounds[0].max.x, 11, 'rebuilt bounds reflect the new position');
});
