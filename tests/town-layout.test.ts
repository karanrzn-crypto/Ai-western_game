/**
 * tests/town-layout.test.ts
 * -----------------------------------------------------------------------------
 * The redesigned-town contract (user's 17-section spec + reference image):
 *
 *   1.  REGISTRATION — every town asset type registers; no namespace
 *       collision; buildTownMapObjects emits unique v4 uuids + finite transforms.
 *   2.  FENCE INDIVIDUALITY (spec §4) — every fence section is its OWN
 *       selectable/movable def: unique uuid per section, never merged into
 *       one object, axis-aligned (collider-exact), real gate gaps.
 *   3.  BUILDING SHELLS — walls tile each footprint, doors block, the
 *       collider policy is exact (walls/pads/decks true; roofs/windows/posts false).
 *   4.  PLACEMENT — all 11 buildings pairwise clear, inside the boundaries,
 *       streets clear of footprints, ruined house isolated on the outskirts.
 *   5.  PROGRESSION WALKABILITY — a real CollisionWorld walk over the FULL
 *       assembled town (town defs + the five rotated buildings): farm road →
 *       entrance → main street past the gun shop → square (around the
 *       fountain) → bank/sheriff gap → stable road → stable gate → exit.
 *   6.  SQUARE + PROPS + VEGETATION + ANIMALS — the fountain landmark, lamps,
 *       benches, hitching posts, sparse vegetation (never a forest), horses
 *       in the pen/corral, troughs + hay.
 *   7.  SITE ROTATION exactness — quaternion-exact yaw composition, checked
 *       against THREE itself.
 * -----------------------------------------------------------------------------
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  AssetRegistry,
  CollisionWorld,
  registerAllTownFactories,
  buildTownMapObjects,
  TOWN_HALF,
  TOWN_SITES,
  TOWN_EXTERIOR_SITES,
  TOWN_EXTERIOR_COLLIDERS,
  TOWN_RESPAWN,
  TOWN_HORSE_SPAWN,
  rotateSiteDefs,
  SALOON_SITE,
  BANK_SITE,
  SHERIFF_SITE,
  STABLE_SITE,
  GUNSHOP_SITE,
  buildSaloonMapObjects,
  buildBankMapObjects,
  buildSheriffMapObjects,
  buildStableMapObjects,
  buildGunShopMapObjects,
  SALOON_LAYOUT,
  BANK_LAYOUT,
  SHERIFF_LAYOUT,
  STABLE_LAYOUT,
  GUNSHOP_LAYOUT,
} from '../src/index.js';
import type { ObjectDefinition, Vec3 } from '../src/index.js';

const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

const townDefs = buildTownMapObjects();
const byType = (type: string): ObjectDefinition[] => townDefs.filter((d) => d.assetType === type);

interface Box2 { x0: number; x1: number; z0: number; z1: number }

/** World-space footprint of a yawed building (footprint w×d + optional front
 *  porch depth on the local +Z side, rotated with the same yaw). */
function rotatedFootprint(site: { x: number; z: number }, yaw: number, w: number, d: number, porch = 0): Box2 {
  const corners: Array<[number, number]> = [
    [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2 + porch], [-w / 2, d / 2 + porch],
  ];
  const a = (yaw * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
  for (const [lx, lz] of corners) {
    const wx = site.x + lx * cos + lz * sin;
    const wz = site.z - lx * sin + lz * cos;
    x0 = Math.min(x0, wx); x1 = Math.max(x1, wx);
    z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
  }
  return { x0, x1, z0, z1 };
}

function overlap(a: Box2, b: Box2, margin = 0): boolean {
  return a.x0 < b.x1 - margin && a.x1 > b.x0 + margin && a.z0 < b.z1 - margin && a.z1 > b.z0 + margin;
}

/** World footprint of a town-exterior building: the UNION of its composite
 *  collider boxes (size × scale, offset × scale, rotated by the site yaw). */
function exteriorFootprint(site: { x: number; z: number; yaw: number; scale: number }, type: string): Box2 {
  const spec = TOWN_EXTERIOR_COLLIDERS[type as keyof typeof TOWN_EXTERIOR_COLLIDERS];
  assert.ok(spec, `collider spec for ${type}`);
  const a = (site.yaw * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
  for (const b of spec.boxes) {
    const hx = (b.size.x * site.scale) / 2;
    const hz = (b.size.z * site.scale) / 2;
    const cx = site.x + (b.offset.x * site.scale) * cos + (b.offset.z * site.scale) * sin;
    const cz = site.z - (b.offset.x * site.scale) * sin + (b.offset.z * site.scale) * cos;
    for (const [sx, sz] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]] as const) {
      // corner of the box in its own yawed frame
      const wx = cx + sx * cos + sz * sin;
      const wz = cz - sx * sin + sz * cos;
      x0 = Math.min(x0, wx); x1 = Math.max(x1, wx);
      z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
    }
  }
  return { x0, x1, z0, z1 };
}

/** All 11 buildings of the redesigned town (5 original + 6 town-exterior). */
const BUILDINGS: Array<{ name: string; box: Box2 }> = [
  { name: 'saloon', box: rotatedFootprint(SALOON_SITE, TOWN_SITES.saloon.yaw, SALOON_LAYOUT.width, SALOON_LAYOUT.depth, SALOON_LAYOUT.porchDepth) },
  { name: 'bank', box: rotatedFootprint(BANK_SITE, TOWN_SITES.bank.yaw, BANK_LAYOUT.width, BANK_LAYOUT.depth) },
  { name: 'sheriff', box: rotatedFootprint(SHERIFF_SITE, TOWN_SITES.sheriff.yaw, SHERIFF_LAYOUT.width, SHERIFF_LAYOUT.depth, SHERIFF_LAYOUT.porch.depth) },
  { name: 'stable', box: rotatedFootprint(STABLE_SITE, TOWN_SITES.stable.yaw, STABLE_LAYOUT.width, STABLE_LAYOUT.depth) },
  { name: 'gunshop', box: rotatedFootprint(GUNSHOP_SITE, TOWN_SITES.gunshop.yaw, GUNSHOP_LAYOUT.width, GUNSHOP_LAYOUT.depth, GUNSHOP_LAYOUT.porchDepth) },
  { name: 'farmHouse', box: exteriorFootprint(TOWN_EXTERIOR_SITES[4], 'house-farmstead') },
  { name: 'workerHouse', box: exteriorFootprint(TOWN_EXTERIOR_SITES[1], 'house-worker') },
  { name: 'familyHouse', box: exteriorFootprint(TOWN_EXTERIOR_SITES[2], 'house-family') },
  { name: 'wealthyHouse', box: exteriorFootprint(TOWN_EXTERIOR_SITES[3], 'house-wealthy') },
  { name: 'meatShop', box: exteriorFootprint(TOWN_EXTERIOR_SITES[0], 'butcher-stall') },
  { name: 'ruinedHouse', box: exteriorFootprint(TOWN_EXTERIOR_SITES[5], 'house-abandoned') },
];

/** The four through-streets (door spurs + the plaza are exempt by design). */
const STREETS: Array<{ name: string; box: Box2 }> = [
  { name: 'farmRoad', box: { x0: -5.2, x1: 1.8, z0: -60, z1: -34 } },
  { name: 'mainStreet', box: { x0: -4, x1: 4, z0: -34, z1: -13 } },
  { name: 'stableRoad', box: { x0: -2, x1: 3.2, z0: 9, z1: 34 } },
  { name: 'exitRoad', box: { x0: -3, x1: 3, z0: 34, z1: 60 } },
];

/** The six town-exterior building defs — the map's registration pipeline. */
function buildExteriorDefs(): ObjectDefinition[] {
  return TOWN_EXTERIOR_SITES.map((site) => ({
    uuid: site.uuid,
    assetType: site.type,
    transform: {
      position: { x: site.x, y: 0, z: site.z },
      rotation: { x: 0, y: site.yaw, z: 0 },
      scale: { x: site.scale, y: site.scale, z: site.scale },
    },
    metadata: {
      name: site.name,
      editable: true,
      collider: TOWN_EXTERIOR_COLLIDERS[site.type as keyof typeof TOWN_EXTERIOR_COLLIDERS],
    },
  }));
}

/** The full assembled town: town defs + the six exterior buildings + the five
 *  yawed original buildings — the exact registration pipeline of
 *  game/playable-map.ts. */
function assembleTown(): ObjectDefinition[] {
  return [
    ...townDefs,
    ...buildExteriorDefs(),
    ...rotateSiteDefs(buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z), SALOON_SITE.x, SALOON_SITE.z, TOWN_SITES.saloon.yaw),
    ...rotateSiteDefs(buildBankMapObjects(BANK_SITE.x, BANK_SITE.z), BANK_SITE.x, BANK_SITE.z, TOWN_SITES.bank.yaw),
    ...rotateSiteDefs(buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z), SHERIFF_SITE.x, SHERIFF_SITE.z, TOWN_SITES.sheriff.yaw),
    ...rotateSiteDefs(buildStableMapObjects(STABLE_SITE.x, STABLE_SITE.z), STABLE_SITE.x, STABLE_SITE.z, TOWN_SITES.stable.yaw),
    ...rotateSiteDefs(buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z), GUNSHOP_SITE.x, GUNSHOP_SITE.z, TOWN_SITES.gunshop.yaw),
  ];
}

/* -------------------------------------------------------------------------- */
/* 1. Registration                                                            */
/* -------------------------------------------------------------------------- */

test('TOWN REGISTRATION: every town-* type registers; no duplicate types', () => {
  const registry = new AssetRegistry();
  registerAllTownFactories(registry);
  const types = new Set(townDefs.map((d) => d.assetType));
  for (const type of types) {
    assert.ok(registry.has(type), `asset type ${type} must be registered`);
  }
});

test('TOWN LAYOUT: unique v4 uuids, finite transforms, names present', () => {
  const uuids = new Set(townDefs.map((d) => d.uuid));
  assert.equal(uuids.size, townDefs.length, 'every town def needs a unique uuid');
  const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  for (const def of townDefs) {
    assert.match(def.uuid, v4, `uuid ${def.uuid} must be v4-shaped`);
    const t = def.transform;
    for (const v of [t.position.x, t.position.y, t.position.z, t.rotation.x, t.rotation.y, t.rotation.z, t.scale.x, t.scale.y, t.scale.z]) {
      assert.ok(Number.isFinite(v), `${def.metadata.name} transform must be finite`);
    }
    assert.ok(typeof def.metadata.name === 'string' && def.metadata.name.length > 0, 'def needs a human name');
    assert.ok(typeof def.metadata.collider === 'boolean', `${def.metadata.name} must declare its collider policy explicitly`);
  }
});

/* -------------------------------------------------------------------------- */
/* 2. Fences — individually movable sections (spec §4)                        */
/* -------------------------------------------------------------------------- */

test('TOWN FENCES: every section is its own def (never merged), with real gates', () => {
  const fences = byType('town-fence');
  assert.ok(fences.length >= 50, `the farm/pen/corral/exit need many sections (got ${fences.length})`);
  const uuids = new Set(fences.map((d) => d.uuid));
  assert.equal(uuids.size, fences.length, 'each fence section must be its OWN object');
  for (const fence of fences) {
    assert.equal(fence.metadata.collider, true, 'a fence section blocks');
    // axis-aligned runs (yaw 0/90) keep the collider AABB == the visual box;
    // a few weathered sections carry a tiny roll (conservative by ≤4 cm).
    const yaw = ((fence.transform.rotation.y % 360) + 360) % 360;
    assert.ok(yaw === 0 || yaw === 90, `fence yaw must be 0/90 (got ${yaw})`);
    assert.ok(Math.abs(fence.transform.rotation.z) <= 4.5, 'roll stays a weathering touch');
    assert.ok(fence.transform.scale.x > 0.3 && fence.transform.scale.y > 0.6, 'section has real extent');
  }
});

test('TOWN FENCES: the farm yard encloses with gate gaps onto the road + field', () => {
  const fences = byType('town-fence').filter((d) => String(d.metadata.name).includes('مزرعه'));
  assert.ok(fences.length >= 20, `yard fence sections present (${fences.length})`);
  // yard rectangle: X ∈ [−21, −5.8], Z ∈ [−57, −38.5]
  for (const fence of fences) {
    const p = fence.transform.position;
    assert.ok(p.x >= -21.4 && p.x <= -5.4 && p.z >= -57.4 && p.z <= -38.1,
      `yard section ${fence.metadata.name} must hug the yard rectangle (at ${p.x},${p.z})`);
  }
  // gate onto the farm road: east side (x ≈ −5.8) must have a z-gap at [−51.5, −48.9]
  const east = fences.filter((d) => Math.abs(d.transform.position.x - (-5.8)) < 0.2);
  const coversGate = east.some((d) => {
    const half = d.transform.scale.x / 2; // yaw 90 → the section length runs along z
    const z = d.transform.position.z;
    return z + half > -51.5 + 0.05 && z - half < -48.9 - 0.05;
  });
  assert.equal(coversGate, false, 'the east gate gap must NOT be covered by a section');
  // the yard must NOT swallow the farm house footprint
  const house = BUILDINGS.find((b) => b.name === 'farmHouse')!;
  for (const fence of fences) {
    const p = fence.transform.position;
    const insideHouse = p.x > house.box.x0 - 0.3 && p.x < house.box.x1 + 0.3 && p.z > house.box.z0 - 0.3 && p.z < house.box.z1 + 0.3;
    assert.equal(insideHouse, false, `section ${fence.metadata.name} must not intersect the farm house`);
  }
});

/* -------------------------------------------------------------------------- */
/* 3. Building shells                                                         */
/* -------------------------------------------------------------------------- */

test('TOWN EXTERIOR BUILDINGS: the six approved buildings sit at their sites', () => {
  const byUuid = new Map(buildExteriorDefs().map((d) => [d.uuid, d]));

  for (const site of TOWN_EXTERIOR_SITES) {
    const def = byUuid.get(site.uuid);
    assert.ok(def, `${site.name} (${site.uuid}) must be registered`);
    assert.equal(def.assetType, site.type, `${site.name} asset type`);
    assert.equal(def.metadata.name, site.name, `${site.name} name`);
    const t = def.transform;
    assert.ok(Math.abs(t.position.x - site.x) < 1e-6 && Math.abs(t.position.z - site.z) < 1e-6, `${site.name} site`);
    assert.ok(Math.abs(t.rotation.y - site.yaw) < 1e-6, `${site.name} yaw`);
    assert.ok(Math.abs(t.scale.x - site.scale) < 1e-6 && Math.abs(t.scale.z - site.scale) < 1e-6, `${site.name} scale (the model-round contract)`);
    // composite collider boxes ride with the def (the SCALE CONTRACT)
    const spec = TOWN_EXTERIOR_COLLIDERS[site.type as keyof typeof TOWN_EXTERIOR_COLLIDERS];
    assert.deepEqual(def.metadata.collider, spec, `${site.name} carries the exact composite collider payload`);
  }
});

test('TOWN PLACEMENT: all 11 buildings pairwise clear and inside the boundaries', () => {
  for (let i = 0; i < BUILDINGS.length; i += 1) {
    const a = BUILDINGS[i];
    assert.ok(a.box.x0 > -TOWN_HALF + 1 && a.box.x1 < TOWN_HALF - 1 && a.box.z0 > -TOWN_HALF + 1 && a.box.z1 < TOWN_HALF - 1,
      `${a.name} must sit inside the boundary walls`);
    for (let j = i + 1; j < BUILDINGS.length; j += 1) {
      const b = BUILDINGS[j];
      assert.equal(overlap(a.box, b.box, 1.0), false,
        `${a.name} [${a.box.x0.toFixed(1)},${a.box.x1.toFixed(1)}]×[${a.box.z0.toFixed(1)},${a.box.z1.toFixed(1)}] must keep ≥1 m from ${b.name} [${b.box.x0.toFixed(1)},${b.box.x1.toFixed(1)}]×[${b.box.z0.toFixed(1)},${b.box.z1.toFixed(1)}]`);
    }
  }
});

test('TOWN PLACEMENT: streets stay clear of every building footprint', () => {
  for (const street of STREETS) {
    for (const building of BUILDINGS) {
      assert.equal(overlap(street.box, building.box, 0.2), false,
        `${building.name} must not sit on ${street.name}`);
    }
  }
});

test('TOWN PLACEMENT: the ruined house is isolated on the outskirts (spec §5)', () => {
  const ruin = BUILDINGS.find((b) => b.name === 'ruinedHouse')!;
  const ruinCenter = { x: (ruin.box.x0 + ruin.box.x1) / 2, z: (ruin.box.z0 + ruin.box.z1) / 2 };
  for (const building of BUILDINGS) {
    if (building.name === 'ruinedHouse') continue;
    const c = { x: (building.box.x0 + building.box.x1) / 2, z: (building.box.z0 + building.box.z1) / 2 };
    const dist = Math.hypot(c.x - ruinCenter.x, c.z - ruinCenter.z);
    assert.ok(dist > 18, `${building.name} must stay far from the ruin (dist ${dist.toFixed(1)} m)`);
  }
});

test('TOWN PROGRESSION: the required order of landmarks along the route', () => {
  const zOf = (name: string): number => {
    const b = BUILDINGS.find((x) => x.name === name)!;
    return (b.box.z0 + b.box.z1) / 2;
  };
  // farm (north) → entrance (−34) → gun shop on the main street → square
  // (fountain −2) → far-side row (+10..+18) → stable (+36) → exit (+46+)
  assert.ok(zOf('farmHouse') < -34, 'farm house sits before the town entrance');
  const gunshop = BUILDINGS.find((b) => b.name === 'gunshop')!;
  assert.ok(gunshop.box.z1 < -13, 'gun shop sits on the main street, before the square');
  assert.ok(zOf('stable') > zOf('wealthyHouse'), 'the stable is the farthest destination south');
  // entering the square heading south: meat shop on the RIGHT (west, x<0),
  // worker house on the LEFT (east, x>0) — spec §9
  const meat = BUILDINGS.find((b) => b.name === 'meatShop')!;
  const worker = BUILDINGS.find((b) => b.name === 'workerHouse')!;
  assert.ok((meat.box.x0 + meat.box.x1) / 2 < 0, 'meat shop on the west (right) side');
  assert.ok((worker.box.x0 + worker.box.x1) / 2 > 0, 'worker house on the east (left) side');
  // bank/sheriff flank the stable-road gap on the far side — spec §10
  const bank = BUILDINGS.find((b) => b.name === 'bank')!;
  const sheriff = BUILDINGS.find((b) => b.name === 'sheriff')!;
  assert.ok(bank.box.x1 < 0 && sheriff.box.x0 > 0, 'bank west, sheriff east of the road gap');
  assert.ok(bank.box.z0 > -13 && sheriff.box.z0 > -13, 'both on the FAR (south) side of the square');
});

/* -------------------------------------------------------------------------- */
/* 5. FULL-TOWN walkability (the progression, on a real CollisionWorld)        */
/* -------------------------------------------------------------------------- */

test('TOWN WALKABILITY: spawn → entrance → street → square → stable road → exit', () => {
  const world = new CollisionWorld(assembleTown());
  const walk = (from: { x: number; z: number }, to: { x: number; z: number }, label: string): void => {
    let pos = { x: from.x, y: PLAYER_HEIGHT, z: from.z };
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / 0.4);
    for (let i = 0; i < steps; i += 1) {
      const before = { ...pos };
      let r = world.movePlayer(pos, { x: dx / steps, y: 0, z: dz / steps });
      if (r.blockedZ || r.blockedX) {
        // step-up (PlayerController semantics) — porches/steps are climbable
        const lifted = world.movePlayer(pos, { x: 0, y: 0.35, z: 0 });
        const moved = world.movePlayer(lifted.position, { x: dx / steps, y: 0, z: dz / steps });
        const settled = world.movePlayer(moved.position, { x: 0, y: -(0.35 + 0.05), z: 0 });
        r = settled;
      }
      assert.ok(Math.hypot(r.position.x - before.x, r.position.z - before.z) > 1e-4,
        `${label}: blocked at (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)}) step ${i}`);
      pos = r.position;
    }
    const miss = Math.hypot(pos.x - to.x, pos.z - to.z);
    assert.ok(miss < 1.2, `${label}: must arrive near the target (missed by ${miss.toFixed(2)} m)`);
  };

  // the respawn point must stand clear of every collider
  for (const bounds of world.getCollisionBounds()) {
    const inside = TOWN_RESPAWN.x + PLAYER_RADIUS > bounds.min.x && TOWN_RESPAWN.x - PLAYER_RADIUS < bounds.max.x
      && TOWN_RESPAWN.z + PLAYER_RADIUS > bounds.min.z && TOWN_RESPAWN.z - PLAYER_RADIUS < bounds.max.z;
    assert.equal(inside, false, `respawn must not start inside collider ${bounds.uuid}`);
  }

  // 1) farm road: spawn → town entrance
  walk({ x: TOWN_RESPAWN.x, z: TOWN_RESPAWN.z }, { x: -1, z: -35 }, 'farm road → entrance');
  // 2) main street, past the gun shop porch, to the square's north edge
  walk({ x: -1, z: -35 }, { x: 0, z: -14 }, 'main street');
  walk({ x: 0, z: -20 }, { x: 5.9, z: -25 }, 'walk up to the gun shop porch door');
  // 3) the square: north edge (east of the hitching rail) → around the
  // fountain (west walk) → south gap
  walk({ x: 0, z: -13 }, { x: 0.8, z: -9.2 }, 'square: enter past the hitching rail');
  walk({ x: 0.8, z: -9.2 }, { x: -6.2, z: -2.2 }, 'square: drift west past the fountain');
  walk({ x: -6.2, z: -2.2 }, { x: -0.8, z: 3.6 }, 'square: around the fountain south side');
  // 4) through the bank/sheriff gap onto the stable road
  walk({ x: -0.8, z: 3.6 }, { x: 0.6, z: 12 }, 'square → far-side road gap');
  walk({ x: 0.6, z: 12 }, { x: 0.6, z: 28 }, 'stable road');
  // 5) to the stable gate + the corral gate across the road
  walk({ x: 0.6, z: 28 }, { x: 8.5, z: 27.6 }, 'up to the stable front');
  walk({ x: 0.6, z: 30 }, { x: -7.2, z: 35.2 }, 'into the corral gate');
  // 6) the exit road runs south out of town
  walk({ x: 0, z: 43 }, { x: 0, z: 58 }, 'town exit');
});

test('TOWN WALKABILITY: exterior building bodies block (worker wall + butcher counter)', () => {
  const world = new CollisionWorld(assembleTown());
  // Exterior-only shells: the composite body boxes must stop the player.
  // Approach runs STEP toward the face (movePlayer resolves against the
  // destination, so a single long stride would tunnel past the wall).
  const stepUntilBlocked = (from: { x: number; z: number }, d: { x: number; z: number }, maxSteps = 14): { blocked: boolean; x: number; z: number } => {
    let pos = { x: from.x, z: from.z };
    for (let i = 0; i < maxSteps; i += 1) {
      const r = world.movePlayer({ x: pos.x, y: PLAYER_HEIGHT, z: pos.z }, { x: d.x, y: 0, z: d.z });
      pos = { x: r.position.x, z: r.position.z };
      if (r.blockedX || r.blockedZ) return { blocked: true, x: pos.x, z: pos.z };
    }
    return { blocked: false, x: pos.x, z: pos.z };
  };
  // worker house (site (12, −2.5) yaw −90, body 4.0×3.4 ×1.3): walking WEST
  // into its east face stops at the face + radius.
  {
    const box = BUILDINGS.find((b) => b.name === 'workerHouse')!.box;
    const r = stepUntilBlocked({ x: box.x1 + 2, z: -2.5 }, { x: -0.3, z: 0 });
    assert.equal(r.blocked, true, 'worker house east wall must block');
    assert.ok(Math.abs(r.x - (box.x1 + 0.35)) < 0.06, `player stops at face + radius (x=${r.x.toFixed(2)}, face ${box.x1.toFixed(2)})`);
  }
  // butcher stall counter (site (−12, −1.5) yaw 90): the open-front stall's
  // counter faces the plaza (world +X) — walking WEST into it stops.
  {
    const box = BUILDINGS.find((b) => b.name === 'meatShop')!.box;
    const r = stepUntilBlocked({ x: box.x0 - 2, z: -1.5 }, { x: 0.3, z: 0 });
    assert.equal(r.blocked, true, 'butcher counter must block');
    assert.ok(r.x < box.x0 + 1.2, `player stops at the counter (x=${r.x.toFixed(2)}, front ${box.x0.toFixed(2)})`);
  }
  // wealthy house (site (21, 13.5) yaw 180): walking NORTH into its front
  // face stops at the facade.
  {
    const box = BUILDINGS.find((b) => b.name === 'wealthyHouse')!.box;
    const r = stepUntilBlocked({ x: 21, z: box.z0 - 2 }, { x: 0, z: 0.3 });
    assert.equal(r.blocked, true, 'wealthy house front wall must block');
  }
});

/* -------------------------------------------------------------------------- */
/* 6. Square, props, vegetation, animals                                      */
/* -------------------------------------------------------------------------- */

test('TOWN SQUARE: fountain landmark + furniture, nothing blocking the axis', () => {
  const fountain = byType('town-box').filter((d) => String(d.metadata.name).includes('آب‌نمای میدان'));
  assert.ok(fountain.length >= 9, `fountain assembled from its parts (${fountain.length})`);
  const center = fountain.filter((d) => Math.abs(d.transform.position.x) < 2 && Math.abs(d.transform.position.z + 2) < 2);
  assert.ok(center.length >= 9, 'the fountain stands at the square center (0, −2)');
  assert.ok(byType('town-bench').length >= 4, 'benches around the square');
  assert.ok(byType('town-hitching').length >= 3, 'hitching posts');
  assert.ok(byType('town-lamp-post').length >= 9, 'lamps along street + square + stable road');
  for (const lamp of byType('town-lamp-post')) {
    assert.equal(lamp.metadata.collider, true, 'lamp posts block');
  }
});

test('TOWN VEGETATION: sparse, varied, collider-free, off the roads and houses', () => {
  const trees = byType('town-tree');
  const bushes = byType('town-bush');
  const grass = byType('town-grass');
  assert.ok(trees.length >= 9 && trees.length <= 16, `trees sparse (${trees.length})`);
  assert.ok(bushes.length >= 12 && bushes.length <= 24, `bushes sparse (${bushes.length})`);
  assert.ok(grass.length >= 3 && grass.length <= 6, 'grass comes as clusters');
  const scales = new Set(trees.map((d) => d.transform.scale.x.toFixed(2)));
  assert.ok(scales.size >= 4, `trees vary in size (${scales.size} distinct scales)`);
  for (const def of [...trees, ...bushes, ...grass]) {
    assert.equal(def.metadata.collider, false, 'vegetation is soft (no fake walls)');
    const p = def.transform.position;
    assert.ok(Math.abs(p.x) < TOWN_HALF - 2 && Math.abs(p.z) < TOWN_HALF - 2, 'inside the map');
    for (const street of STREETS) {
      assert.equal(overlap({ x0: p.x - 0.6, x1: p.x + 0.6, z0: p.z - 0.6, z1: p.z + 0.6 }, street.box, 0.1), false,
        `${def.metadata.name} must not sit in the middle of ${street.name}`);
    }
    for (const building of BUILDINGS) {
      assert.equal(overlap({ x0: p.x - 0.6, x1: p.x + 0.6, z0: p.z - 0.6, z1: p.z + 0.6 }, building.box, 0.1), false,
        `${def.metadata.name} must not stand inside ${building.name}`);
    }
  }
});

test('TOWN ANIMALS + CARE: horses in the pen and corral, troughs, hay, crops', () => {
  const horses = byType('town-horse');
  assert.equal(horses.length, 4, 'two horses in the farm pen + two in the corral');
  for (const h of horses) assert.equal(h.metadata.collider, false, 'decor horses are soft');
  const inPen = horses.filter((h) => h.transform.position.x < -5.8 && h.transform.position.z < -38);
  const inCorral = horses.filter((h) => h.transform.position.x < -5 && h.transform.position.z > 28);
  assert.equal(inPen.length, 2, 'pen horses');
  assert.equal(inCorral.length, 2, 'corral horses');
  assert.ok(byType('town-trough').length >= 3, 'water troughs (pen + corral + road)');
  assert.ok(byType('town-hay').length >= 4, 'hay bales');
  assert.equal(byType('town-crops').length, 1, 'one crop field east of the farm road');
  assert.equal(byType('town-pond').length, 1, 'the farm pond');
  assert.equal(byType('town-windmill').length, 1, 'the farm windmill');
});

test('TOWN SPAWN: the companion horse boots beside the farm road, clear of fences', () => {
  const world = new CollisionWorld(assembleTown());
  for (const bounds of world.getCollisionBounds()) {
    const inside = TOWN_HORSE_SPAWN.x + 0.7 > bounds.min.x && TOWN_HORSE_SPAWN.x - 0.7 < bounds.max.x
      && TOWN_HORSE_SPAWN.z + 0.7 > bounds.min.z && TOWN_HORSE_SPAWN.z - 0.7 < bounds.max.z;
    assert.equal(inside, false, `horse spawn must be clear of collider ${bounds.uuid}`);
  }
});

/* -------------------------------------------------------------------------- */
/* 7. Site rotation exactness (checked against THREE itself)                  */
/* -------------------------------------------------------------------------- */

test('SITE ROTATION: yaw composition is quaternion-exact vs THREE (pitched defs)', () => {
  const defs: ObjectDefinition[] = [{
    uuid: 'test-rot-1',
    assetType: 'test',
    transform: {
      position: { x: 3, y: 1.5, z: -2 },
      rotation: { x: 24, y: 10, z: 0 },
      scale: { x: 9, y: 0.1, z: 4 },
    },
    metadata: { name: 'pitched slab' },
  }];
  for (const yaw of [90, -90, 180, 270]) {
    const [out] = rotateSiteDefs(defs, 10.5, -25, yaw);
    // THREE reference: parent-yaw the same pose
    const parent = new THREE.Object3D();
    parent.rotation.y = (yaw * Math.PI) / 180;
    parent.position.set(10.5, 0, -25);
    const child = new THREE.Object3D();
    child.rotation.set(24 * Math.PI / 180, 10 * Math.PI / 180, 0);
    // the def position is WORLD — the parent's child must carry the LOCAL
    child.position.set(3 - 10.5, 1.5, -2 - (-25));
    parent.add(child);
    parent.updateMatrixWorld(true);
    const wp = new THREE.Vector3();
    child.getWorldPosition(wp);
    const wq = new THREE.Quaternion();
    child.getWorldQuaternion(wq);
    assert.ok(Math.abs(out.transform.position.x - wp.x) < 1e-4
      && Math.abs(out.transform.position.y - wp.y) < 1e-4
      && Math.abs(out.transform.position.z - wp.z) < 1e-4,
      `yaw ${yaw}: position must match THREE (got ${out.transform.position.x.toFixed(4)},${out.transform.position.z.toFixed(4)} vs ${wp.x.toFixed(4)},${wp.z.toFixed(4)})`);
    const eq = eulerToQuaternion(out.transform.rotation);
    const dot = Math.abs(eq.x * wq.x + eq.y * wq.y + eq.z * wq.z + eq.w * wq.w);
    assert.ok(Math.abs(dot - 1) < 1e-4, `yaw ${yaw}: orientation must match THREE (dot ${dot.toFixed(6)})`);
  }
});

test('SITE ROTATION: identity yaw returns untouched transforms; AABBs stay exact', () => {
  const defs: ObjectDefinition[] = [{
    uuid: 'test-rot-2',
    assetType: 'test',
    transform: { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 45, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    metadata: { name: 'x' },
  }];
  const [same] = rotateSiteDefs(defs, 5, 5, 0);
  assert.deepEqual(same.transform, defs[0].transform, 'zero yaw = bit-identical passthrough');
  // 90° yaw of an axis-aligned wall: the world AABB must equal the rotated box
  const wall: ObjectDefinition = {
    uuid: 'test-rot-3',
    assetType: 'test',
    transform: { position: { x: 2, y: 1.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 8, y: 3, z: 0.3 } },
    metadata: { name: 'wall' },
  };
  const [rot] = rotateSiteDefs([wall], 0, 0, 90);
  assert.ok(Math.abs(rot.transform.position.x) < 1e-9 && Math.abs(rot.transform.position.z + 2) < 1e-9, 'position rotates (+90° maps +X to −Z)');
  assert.ok(Math.abs(rot.transform.rotation.y - 90) < 1e-6, 'yaw composes');
  assert.deepEqual(rot.transform.scale, { x: 8, y: 3, z: 0.3 }, 'scale (the collider extents) is preserved');
});

/** Local Euler-degrees (XYZ) → quaternion, matching the renderer adapter. */
function eulerToQuaternion(deg: Vec3): { x: number; y: number; z: number; w: number } {
  const e = new THREE.Euler(deg.x * Math.PI / 180, deg.y * Math.PI / 180, deg.z * Math.PI / 180, 'XYZ');
  const q = new THREE.Quaternion().setFromEuler(e);
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}
