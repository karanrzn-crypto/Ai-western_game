import assert from 'node:assert/strict';
import test from 'node:test';
import { CollisionWorld, SceneStateManager } from '../src/index.js';
function buildWorld(): { manager: SceneStateManager; world: CollisionWorld } { const manager = new SceneStateManager(); const world = new CollisionWorld(() => manager.getAllObjects(), { floorY: 0 }); return { manager, world }; }
test('CollisionWorld blocks movement into a wall but allows moving away from it', () => { const { manager, world } = buildWorld(); manager.registerObject({ uuid: '20000000-0000-4000-a000-000000000001', assetType: 'cube', transform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 2, z: 2 } }, metadata: { name: 'Wall', collider: true } }); const blocked = world.movePlayer({ x: 2, y: 1.7, z: 0 }, { x: -1, y: 0, z: 0 }); assert.equal(blocked.blockedX, true); assert.equal(blocked.position.x, 1.35); const away = world.movePlayer({ x: 2, y: 1.7, z: 0 }, { x: 1, y: 0, z: 0 }); assert.equal(away.blockedX, false); assert.equal(away.position.x, 3); });
test('CollisionWorld resolves corner collision stably on X and Z', () => { const { manager, world } = buildWorld(); manager.registerObject({ uuid: '20000000-0000-4000-a000-000000000002', assetType: 'cube', transform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 2, z: 2 } }, metadata: { name: 'Corner Block', collider: true } }); const result = world.movePlayer({ x: 2, y: 1.7, z: 2 }, { x: -1, y: 0, z: -1 }); assert.ok(result.blockedX || result.blockedZ); assert.ok(result.position.x >= 1); assert.ok(result.position.z >= 1.35); });
test('CollisionWorld enforces boundary collision and player radius', () => { const { manager, world } = buildWorld(); manager.registerObject({ uuid: '20000000-0000-4000-a000-000000000003', assetType: 'cube', transform: { position: { x: 0, y: 1, z: -5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 10, y: 2, z: 1 } }, metadata: { name: 'North Boundary', collider: true, mapBoundary: true } }); const wide = world.movePlayer({ x: 0, y: 1.7, z: -3.8 }, { x: 0, y: 0, z: -1 }, 0.5); assert.equal(wide.blockedZ, true); assert.equal(wide.position.z, -4); });
test('CollisionWorld handles ground collision and landing on object tops', () => { const { manager, world } = buildWorld(); manager.registerObject({ uuid: '20000000-0000-4000-a000-000000000004', assetType: 'cube', transform: { position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 1, z: 2 } }, metadata: { name: 'Platform', collider: true } }); const floor = world.movePlayer({ x: 5, y: 3, z: 0 }, { x: 0, y: -5, z: 0 }); assert.equal(floor.grounded, true); assert.equal(floor.position.y, 1.7); const platform = world.movePlayer({ x: 0, y: 3, z: 0 }, { x: 0, y: -5, z: 0 }); assert.equal(platform.grounded, true); assert.equal(platform.position.y, 2.7); });
test('CollisionWorld uses conservative rotated-object bounds for supported solids', () => { const { manager, world } = buildWorld(); manager.registerObject({ uuid: '20000000-0000-4000-a000-000000000005', assetType: 'cube', transform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 45, z: 0 }, scale: { x: 2, y: 2, z: 4 } }, metadata: { name: 'Rotated Crate', collider: true } }); const result = world.movePlayer({ x: 3, y: 1.7, z: 0 }, { x: -2, y: 0, z: 0 }); assert.equal(result.blockedX, true); });
test('CollisionWorld SCALES local collider boxes with the def transform (scaled-house contract)', () => {
  // The four town houses spawn at scale 1.3. The renderer scales the visual
  // group, so CollisionWorld must scale the local boxes (size AND offset)
  // per-axis — otherwise the enlarged walls stay walk-through (user §2).
  const { manager, world } = buildWorld();
  manager.registerObject({
    uuid: '20000000-0000-4000-a000-000000000006',
    assetType: 'house-family',
    transform: { position: { x: -12, y: 0, z: 28 }, rotation: { x: 0, y: 90, z: 0 }, scale: { x: 1.3, y: 1.3, z: 1.3 } },
    metadata: { name: 'Scaled Family House', collider: { boxes: [{ size: { x: 5, y: 3, z: 4 }, offset: { x: 0, y: 1.5, z: 0 } }] } },
  });
  const bounds = world.getCollisionBounds().filter((b) => b.uuid.endsWith('006'));
  assert.equal(bounds.length, 1);
  const b = bounds[0]!;
  // 5.0 deep (local x) → world z after yaw 90; 4.0 wide (local z) → world x.
  // Every dimension ×1.3, faces exactly at ±(half·1.3) around the anchor.
  assert.ok(Math.abs((b.max.x - b.min.x) - 4 * 1.3) < 1e-9, `x span ${(b.max.x - b.min.x).toFixed(3)} == 5.2`);
  assert.ok(Math.abs((b.max.z - b.min.z) - 5 * 1.3) < 1e-9, `z span ${(b.max.z - b.min.z).toFixed(3)} == 6.5`);
  assert.ok(Math.abs((b.max.y - b.min.y) - 3 * 1.3) < 1e-9, `y span ${(b.max.y - b.min.y).toFixed(3)} == 3.9`);
  assert.ok(Math.abs(b.max.x - (-12 + 2.6)) < 1e-9, `east face ${(b.max.x).toFixed(3)} == visual wall −9.4`);
  // Walk east→west INTO the scaled wall: blocked exactly one radius outside
  // the VISUAL face (no gap, no penetration — collision == visual).
  const walk = world.movePlayer({ x: -8, y: 1.7, z: 28 }, { x: -6, y: 0, z: 0 });
  assert.equal(walk.blockedX, true);
  assert.ok(Math.abs(walk.position.x - (-9.4 + 0.35)) < 1e-9, `stops at face+radius ${walk.position.x.toFixed(3)} == −9.05`);
});
test('CollisionWorld rotates offset boxes with SIGNED yaw (phantom-shed regression)', () => {
  // The farmstead shed box (offset x 3.3) at yaw −90 used to MIRROR to the
  // wrong side (|sin| in the center offset) — an invisible wall ~6 m from
  // the real shed, blocking empty field (user §5). The offset must rotate
  // exactly like the renderer: local (3.3, −0.4) → world (+0.4, +3.3).
  const { manager, world } = buildWorld();
  manager.registerObject({
    uuid: '20000000-0000-4000-a000-000000000007',
    assetType: 'house-farmstead',
    transform: { position: { x: 26, y: 0, z: -2 }, rotation: { x: 0, y: -90, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { name: 'Farm', collider: { boxes: [{ size: { x: 2, y: 2.1, z: 3.2 }, offset: { x: 3.3, y: 1.05, z: -0.4 } }] } },
  });
  const b = world.getCollisionBounds().find((x) => x.uuid.endsWith('007'))!;
  // shed center at world (26 + 0.4, −2 + 3.3) = (26.4, 1.3); extents 1.6/1.0.
  assert.ok(Math.abs((b.min.x + b.max.x) / 2 - 26.4) < 1e-9, `center x ${((b.min.x + b.max.x) / 2).toFixed(3)} == 26.4`);
  assert.ok(Math.abs((b.min.z + b.max.z) / 2 - 1.3) < 1e-9, `center z ${((b.min.z + b.max.z) / 2).toFixed(3)} == 1.3 (ON the shed, not mirrored south)`);
  assert.ok(Math.abs(b.min.z - 0.3) < 1e-9 && Math.abs(b.max.z - 2.3) < 1e-9, 'shed spans z 0.3..2.3');
  // The OLD mirrored box sat at z −6.3..−4.3: nothing may collide there now.
  const phantomWalk = world.movePlayer({ x: 25.6, y: 1.7, z: -5.3 }, { x: 0, y: 0, z: -1 });
  assert.equal(phantomWalk.blockedZ, false, 'the old phantom spot is empty field again');
});
