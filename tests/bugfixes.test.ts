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

// ---------------------------------------------------------------------------
// FIX ROUND — 2026-09 «first-person controls + counters collision + stable»
// ---------------------------------------------------------------------------

import {
  buildSaloonMapObjects,
  buildGunShopMapObjects,
  buildStableMapObjects,
  SALOON_SITE,
  GUNSHOP_SITE,
  STABLE_SITE,
  STABLE_LAYOUT,
  dismountCameraPlan,
} from '../src/index.js';

test('fix round: FP A/D alone turn in place smoothly (no translation, no snap)', () => {
  const controller = new PlayerController(new CollisionWorld([]), {
    initialPosition: { x: 0, y: 1.7, z: 0 },
    yaw: 0,
    cameraMode: 'first_person',
  });
  let total = 0;
  let worst = 0;
  for (let i = 0; i < 120; i += 1) {
    const before = controller.getBodyYaw();
    controller.update(1 / 60, { left: true });
    const step = controller.getBodyYaw() - before;
    total += step;
    worst = Math.max(worst, Math.abs(step));
  }
  assert.ok(total > 1.0, `FP A turned the view left (total ${total.toFixed(3)} rad)`);
  assert.ok(Math.abs(controller.getPosition().x) < 1e-6, 'turn never translates');
  assert.ok(worst <= 3.7 / 60 + 0.02, `per-frame turn bounded (${worst.toFixed(4)}) — no snap`);
  // Release decays to zero (smooth stop).
  for (let i = 0; i < 60; i += 1) controller.update(1 / 60, {});
  assert.equal(controller.getTurnVelocity(), 0, 'spin decays to exact zero after release');
});

test('fix round: dismountCameraPlan — dismount is shown in third person, then the rider mode returns', () => {
  const fpPlan = dismountCameraPlan('first_person');
  assert.equal(fpPlan.during, 'third_person', 'the choreography is always visible (third person)');
  assert.equal(fpPlan.after, 'first_person', 'a first-person rider returns to first person');
  const tpPlan = dismountCameraPlan('third_person');
  assert.equal(tpPlan.during, 'third_person');
  assert.equal(tpPlan.after, 'third_person', 'a third-person rider keeps third person');
});

test('fix round: bar counter CORNERS block — the exact composite box, no oversize', () => {
  const defs = buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z);
  const world = new CollisionWorld(defs);
  // Counter box (layout): x ∈ [SALOON_SITE.x−2.05, SALOON_SITE.x+2.05],
  // z ∈ [SALOON_SITE.z−2.596, SALOON_SITE.z−1.776]. Old bug: a 1 m AABB at
  // the anchor left both ENDS walk-through.
  const zMid = SALOON_SITE.z - 2.186;
  // 1) Walk INTO the counter's east END from open floor: must be stopped
  //    just outside the visual end (x = +2.05) + player radius (0.35).
  let pos = { x: SALOON_SITE.x + 4.5, y: 1.7, z: zMid };
  let blocked = false;
  for (let i = 0; i < 60; i += 1) {
    const r = world.movePlayer(pos, { x: -0.1, y: 0, z: 0 });
    if (r.blockedX) { blocked = true; pos = r.position; break; }
    pos = r.position;
  }
  assert.ok(blocked, 'the counter east end must block the player');
  assert.ok(pos.x > SALOON_SITE.x + 2.0,
    `stopped at the visual end + radius (x=${pos.x.toFixed(3)}) — not deep inside, not far away`);
  // 2) The corner zone (x ≈ +1.9, z at the counter face) must ALSO block.
  let cornerPos = { x: SALOON_SITE.x + 1.9, y: 1.7, z: SALOON_SITE.z - 1.0 };
  const corner = world.movePlayer(cornerPos, { x: 0, y: 0, z: -0.5 });
  assert.ok(corner.blockedZ, 'the counter corner must block (old walk-through zone)');
  assert.ok(corner.position.z > SALOON_SITE.z - 1.776 - 0.45,
    `stopped just outside the counter face (z=${corner.position.z.toFixed(3)})`);
  // 3) No oversize: standing 0.6 m EAST of the visual end must be free.
  const free = world.movePlayer({ x: SALOON_SITE.x + 2.75, y: 1.7, z: zMid }, { x: 0.3, y: 0, z: 0 });
  assert.equal(free.blockedX, false, 'no invisible collision beyond the visual end');
  // 4) The poker-chair corner area stays clear (no extra collision).
  const poker = world.movePlayer({ x: -9.413, y: 1.7, z: -11.913 }, { x: 0.4, y: 0, z: 0.4 });
  assert.equal(poker.blockedX, false && poker.blockedZ, 'poker chair area stays walkable');
});

test('fix round: gunshop counter CORNERS block — exact box, both ends', () => {
  const defs = buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z);
  const world = new CollisionWorld(defs);
  // Counter def at (GUNSHOP_SITE.x − 0.4, GUNSHOP_SITE.z + 1.4), box 3.26 × 0.73.
  const cz = GUNSHOP_SITE.z + 1.4;
  // East end walk-in.
  let pos = { x: GUNSHOP_SITE.x + 2.6, y: 1.7, z: cz };
  let blocked = false;
  for (let i = 0; i < 60; i += 1) {
    const r = world.movePlayer(pos, { x: -0.1, y: 0, z: 0 });
    if (r.blockedX) { blocked = true; pos = r.position; break; }
    pos = r.position;
  }
  assert.ok(blocked, 'the counter east end must block the player');
  const eastEdge = GUNSHOP_SITE.x - 0.4 + 3.26 / 2;
  assert.ok(pos.x > eastEdge - 0.02 && pos.x < eastEdge + 0.45,
    `stopped at edge + radius (x=${pos.x.toFixed(3)}, edge ${eastEdge.toFixed(3)})`);
  // West end walk-in.
  let west = { x: GUNSHOP_SITE.x - 3.6, y: 1.7, z: cz };
  let westBlocked = false;
  for (let i = 0; i < 60; i += 1) {
    const r = world.movePlayer(west, { x: 0.1, y: 0, z: 0 });
    if (r.blockedX) { westBlocked = true; west = r.position; break; }
    west = r.position;
  }
  assert.ok(westBlocked, 'the counter WEST end must also block (the old walk-through corner)');
  const westEdge = GUNSHOP_SITE.x - 0.4 - 3.26 / 2;
  assert.ok(west.x < westEdge + 0.02 && west.x > westEdge - 0.45,
    `stopped at edge − radius (x=${west.x.toFixed(3)}, edge ${westEdge.toFixed(3)})`);
});

test('fix round: stable footprint grew to the 2026 size ratio (12.4 × 14.2, eaves 3.8)', () => {
  assert.equal(STABLE_LAYOUT.width, 12.4);
  assert.equal(STABLE_LAYOUT.depth, 14.2);
  assert.equal(STABLE_LAYOUT.wallHeight, 3.8);
  // Interior metrics preserved: 6 stalls of 3.25 frontage on both rows.
  const defs = buildStableMapObjects(STABLE_SITE.x, STABLE_SITE.z);
  const fronts = defs.filter((d) => d.assetType === 'stable-stall-front');
  assert.equal(fronts.length, 18, 'stall front segments intact after the growth');
  // The redesigned town places the stable on the stable road south of the
  // square (TownLayout.TOWN_SITES.stable, yaw 180): it must stay inside the
  // 120×120 boundary walls (±60) and clear of the corral across the road
  // (corral east fence at x = −5.5).
  const halfDiag = Math.hypot(STABLE_LAYOUT.width / 2, STABLE_LAYOUT.depth / 2);
  assert.ok(STABLE_SITE.x - halfDiag > -60 && STABLE_SITE.z + halfDiag < 60,
    'the grown stable still fits inside the boundary walls');
  assert.ok(STABLE_SITE.x - STABLE_LAYOUT.width / 2 > -5.5 + 1.0,
    `the stable west face (${STABLE_SITE.x - STABLE_LAYOUT.width / 2}) must clear the corral fence (−5.5)`);
});
