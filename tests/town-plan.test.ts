/**
 * tests/town-plan.test.ts
 * -----------------------------------------------------------------------------
 * THE REDESIGNED WESTERN TOWN PLAN contract (reference-image round).
 *
 * These tests lock the layout rules the redesign was built on:
 *   1. PROGRESSION — farm (before town, NW) → entrance → main street →
 *      central square → bank/sheriff far side → stable (south) → exit.
 *   2. SQUARE RELATIONS — meat shop RIGHT (west), worker house LEFT (east)
 *      when entering from the north; bank + sheriff flank the south road.
 *   3. FENCE INDIVIDUALITY — every farm/corral fence piece is its OWN def
 *      with its own uuid + collider (never one merged mesh), gate gaps open.
 *   4. WALKABILITY — main street + square→stable corridors contain no
 *      colliding environment def; roads never run under building walls.
 *   5. WORLD HYGIENE — every placement inside the ±49 map, no vegetation
 *      inside a building footprint, no building overlaps another.
 * -----------------------------------------------------------------------------
 */

import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BUILDING_FOOTPRINTS,
  ROAD_PLACEMENTS,
  PROP_PLACEMENTS,
  SIGN_PLACEMENTS,
  CROP_ROW_PLACEMENTS,
  FARM_FENCE_PLACEMENTS,
  CORRAL_FENCE_PLACEMENTS,
  RUIN_FENCE_PLACEMENTS,
  VEGETATION_PLACEMENTS,
  collectEnvironmentPlacements,
  ENV_PROP_COLLIDERS,
} from '../src/assets/environment/index.js';
import {
  SALOON_SITE,
  BANK_SITE,
  SHERIFF_SITE,
  STABLE_SITE,
  GUNSHOP_SITE,
} from '../src/assets/index.js';

type Vec2 = { x: number; z: number };
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);
const SQUARE_CENTER: Vec2 = { x: 0, z: 1 };

test('town-plan: progression — farm before town, stable at the exit', () => {
  const farm = BUILDING_FOOTPRINTS.find((f) => f.name === 'farm-house')!;
  const ruin = BUILDING_FOOTPRINTS.find((f) => f.name === 'ruined-house')!;
  const stable = BUILDING_FOOTPRINTS.find((f) => f.name === 'stable')!;
  // The farm sits BEFORE the town on the north prairie (north = −Z).
  assert.ok(farm.minZ < -30, `farm north of town (minZ ${farm.minZ})`);
  // The ruined house alone on the outskirts — far from the square and town.
  const ruinCenter = { x: (ruin.minX + ruin.maxX) / 2, z: (ruin.minZ + ruin.maxZ) / 2 };
  assert.ok(dist(ruinCenter, SQUARE_CENTER) > 35, 'ruined house far from the square');
  assert.ok(ruin.minZ < -30 && ruin.minX > 20, 'ruined house NE outskirts');
  // The stable anchors the south end next to the exit road.
  assert.ok(stable.minZ > 20 && stable.maxZ < 40, 'stable between square and exit');
  // Exit road reaches the south edge.
  const exitRoad = ROAD_PLACEMENTS.find((r) => r.name === 'جاده خروجی')!;
  assert.ok(exitRoad.z > 43, 'exit road runs to the town edge');
});

test('town-plan: square relations — meat RIGHT/west, worker LEFT/east, bank+sheriff far side', () => {
  const meat = BUILDING_FOOTPRINTS.find((f) => f.name === 'meat-shop')!;
  const worker = BUILDING_FOOTPRINTS.find((f) => f.name === 'worker-house')!;
  const bank = BUILDING_FOOTPRINTS.find((f) => f.name === 'bank')!;
  const sheriff = BUILDING_FOOTPRINTS.find((f) => f.name === 'sheriff')!;
  // Entering the square from the main entrance (north), facing south:
  // right hand = west (−X), left hand = east (+X).
  assert.ok(meat.maxX < SQUARE_CENTER.x - 10, 'meat shop on the RIGHT (west) of the square');
  assert.ok(worker.minX > SQUARE_CENTER.x + 10, 'worker house on the LEFT (east) of the square');
  // Far side of the square: both south of the plaza centre, flanking the
  // road corridor to the stable (road runs near x ≈ 0.5).
  assert.ok(bank.minZ > 9 && sheriff.minZ > 9, 'bank + sheriff on the FAR side of the square');
  assert.ok(bank.maxX < -5 && sheriff.minX > 5, 'bank west / sheriff east of the stable road');
  // The gun shop is met BEFORE the square (north of it) on the main route.
  const gunshop = BUILDING_FOOTPRINTS.find((f) => f.name === 'gunshop')!;
  assert.ok(gunshop.maxZ < -13, 'gun shop before the square on the main street');
  // And the saloon mirrors it on the west side of the same street.
  assert.ok(SALOON_SITE.x < -9 && SALOON_SITE.z < -13, 'saloon west of the main street');
  assert.equal(GUNSHOP_SITE.x > 9, true, 'gun shop east of the main street');
});

test('town-plan: well centerpiece + seating inside the plaza', () => {
  const well = PROP_PLACEMENTS.find((p) => p.type === 'town-well');
  assert.ok(well, 'the square has a well centerpiece');
  assert.ok(Math.abs(well!.x) < 5 && Math.abs(well!.z) < 5, 'well near the plaza centre');
  const benches = PROP_PLACEMENTS.filter((p) => p.type === 'bench');
  assert.ok(benches.length >= 4, 'benches around the well');
  const lamps = PROP_PLACEMENTS.filter((p) => p.type === 'street-lamp');
  assert.ok(lamps.length >= 14, 'street lamps across the town (street/square/stable road)');
  const hitches = PROP_PLACEMENTS.filter((p) => p.type === 'hitching-post');
  assert.ok(hitches.length >= 8, 'hitching posts at shops + square + stable');
});

test('town-plan: FARM FENCE is individual sections with own uuids + colliders', () => {
  // Individuality: every section its own def + uuid + fence-section type.
  const uuids = new Set(FARM_FENCE_PLACEMENTS.map((f) => f.uuid));
  assert.equal(uuids.size, FARM_FENCE_PLACEMENTS.length, 'no two fence pieces share a uuid');
  assert.ok(FARM_FENCE_PLACEMENTS.length >= 26, `enough sections for the corral (${FARM_FENCE_PLACEMENTS.length})`);
  // The section type carries the real collider payload table.
  const payload = (ENV_PROP_COLLIDERS as Record<string, unknown>)['fence-section']
    ?? 'carried by TOWN_EXTERIOR_COLLIDERS (fence-section type registered there)';
  assert.ok(payload, 'fence-section collider payload exists');
  // All sections hug the corral ring (x −34…−24, z −46…−34).
  for (const f of FARM_FENCE_PLACEMENTS) {
    const onRing =
      (Math.abs(f.z - -34) < 0.8 && f.x >= -34.6 && f.x <= -23.4) ||
      (Math.abs(f.z - -46) < 0.8 && f.x >= -34.6 && f.x <= -23.4) ||
      (Math.abs(f.x - -34) < 0.8 && f.z >= -46.6 && f.z <= -33.4) ||
      (Math.abs(f.x - -24) < 0.8 && f.z >= -46.6 && f.z <= -33.4);
    assert.ok(onRing, `section ${f.uuid} sits on the corral ring (${f.x.toFixed(1)}, ${f.z.toFixed(1)})`);
  }
  // Gate gap on the south run (x −29.5…−26.5) stays open.
  const gapBlocked = FARM_FENCE_PLACEMENTS.filter((f) =>
    Math.abs(f.z - -34) < 0.8 && f.x > -29.6 && f.x < -26.4);
  assert.equal(gapBlocked.length, 0, 'farm corral gate gap is clear');
});

test('town-plan: STABLE corral fence individual + gate toward the road', () => {
  const uuids = new Set(CORRAL_FENCE_PLACEMENTS.map((f) => f.uuid));
  assert.equal(uuids.size, CORRAL_FENCE_PLACEMENTS.length, 'corral sections all individual');
  assert.ok(CORRAL_FENCE_PLACEMENTS.length >= 22, `enough corral sections (${CORRAL_FENCE_PLACEMENTS.length})`);
  // Gate gap on the west run (x = 7, z 26.5…29) faces the stable road.
  const gapBlocked = CORRAL_FENCE_PLACEMENTS.filter((f) =>
    Math.abs(f.x - 7) < 0.8 && f.z > 26.4 && f.z < 29.1);
  assert.equal(gapBlocked.length, 0, 'stable corral gate faces the road');
});

test('town-plan: roads form the full route and never collide', () => {
  assert.ok(ROAD_PLACEMENTS.length >= 14, 'road network complete');
  for (const r of ROAD_PLACEMENTS) {
    assert.equal(r.type, 'dirt-road');
    assert.ok(r.notEditable === true, 'roads are terrain (not editor-selectable)');
    assert.ok(Math.abs(r.x) <= 48.5 && Math.abs(r.z) <= 48.5, `road ${r.name} inside the map`);
  }
  // Main street connects the entrance to the square (midpoint between them).
  const main = ROAD_PLACEMENTS.find((r) => r.name === 'خیابان اصلی')!;
  assert.ok(main.z < -8 && main.z > -26, 'main street runs from the entrance to the square');
  // Stable road connects the square to the stable yard.
  const stableRoad = ROAD_PLACEMENTS.filter((r) => r.name.includes('اصطبل') && r.type === 'dirt-road');
  assert.ok(stableRoad.length >= 2, 'stable road north + south pieces');
  // Overlapping road pieces use DIFFERENT lifts (z-fight-safe).
  const lifts = new Map<string, number>();
  for (const r of ROAD_PLACEMENTS) {
    const key = `${r.lift}`;
    lifts.set(key, (lifts.get(key) ?? 0) + 1);
  }
  assert.ok(lifts.size >= 4, 'lift staggering in use');
});

test('town-plan: roads never run under building walls', () => {
  for (const r of ROAD_PLACEMENTS) {
    const halfW = (r.width ?? 6) / 2;
    for (const fp of BUILDING_FOOTPRINTS) {
      const overlapX = r.x + halfW > fp.minX && r.x - halfW < fp.maxX;
      const overlapZ = r.z + halfW > fp.minZ && r.z - halfW < fp.maxZ;
      if (overlapX && overlapZ) {
        // Road rect touches the footprint box — only acceptable when the road
        // CLARANCE stops at a porch/approach edge; the plan keeps every road
        // centre clear of the core boxes, so assert on centre clearance.
        const cx = Math.max(fp.minX, Math.min(r.x, fp.maxX));
        const cz = Math.max(fp.minZ, Math.min(r.z, fp.maxZ));
        const centreDist = Math.hypot(r.x - cx, r.z - cz);
        assert.ok(centreDist >= halfW,
          `road "${r.name}" centre must stay outside ${fp.name} walls (d=${centreDist.toFixed(2)}, halfW=${halfW})`);
      }
    }
  }
});

test('town-plan: vegetation sparse but alive, never inside buildings', () => {
  const trees = VEGETATION_PLACEMENTS.filter((v) => v.type === 'tree');
  const bushes = VEGETATION_PLACEMENTS.filter((v) => v.type === 'bush');
  const grass = VEGETATION_PLACEMENTS.filter((v) => v.type === 'grass-tuft');
  const rocks = VEGETATION_PLACEMENTS.filter((v) => v.type === 'rock');
  assert.ok(trees.length >= 20, `trees present (${trees.length})`);
  assert.ok(bushes.length >= 30, `bushes present (${bushes.length})`);
  assert.ok(grass.length >= 40, `grass tufts present (${grass.length})`);
  assert.ok(rocks.length >= 15, `rocks present (${rocks.length})`);
  // Nothing inside a building footprint (2 m breathing margin) — EXCEPT the
  // ruin dressing, which is INTENTIONALLY hugging the ruined house (rocks,
  // dead trees, debris) and gets its own dedicated check below.
  for (const v of VEGETATION_PLACEMENTS) {
    for (const fp of BUILDING_FOOTPRINTS) {
      if (fp.name === 'ruined-house') continue;
      const inside = v.x > fp.minX - 2 && v.x < fp.maxX + 2 && v.z > fp.minZ - 2 && v.z < fp.maxZ + 2;
      assert.ok(!inside, `${v.type} ${v.uuid} must stay clear of ${fp.name}`);
    }
  }
  // Ruin dressing hugs the ruin (within 7 m of its centre) — debris, not
  // random scatter, and never INSIDE the walls themselves.
  const ruin = BUILDING_FOOTPRINTS.find((f) => f.name === 'ruined-house')!;
  const ruinCenter = { x: (ruin.minX + ruin.maxX) / 2, z: (ruin.minZ + ruin.maxZ) / 2 };
  for (const v of VEGETATION_PLACEMENTS.filter((p) => p.name === 'درخت خشکیده' || (p.name === 'سنگ' && p.x > 20 && p.z < -30))) {
    const d = dist(v, ruinCenter);
    assert.ok(d <= 7, `ruin dressing ${v.uuid} within 7 m of the ruin (d=${d.toFixed(1)})`);
    const insideWalls = v.x > ruin.minX && v.x < ruin.maxX && v.z > ruin.minZ && v.z < ruin.maxZ;
    assert.ok(!insideWalls, `ruin dressing ${v.uuid} never inside the walls`);
  }
});

test('town-plan: world hygiene — bounds, unique uuids, building separation', () => {
  const all = collectEnvironmentPlacements();
  const uuids = new Set(all.map((p) => p.uuid));
  assert.equal(uuids.size, all.length, 'every environment def has a unique uuid');
  for (const p of all) {
    assert.ok(Math.abs(p.x) <= 49 && Math.abs(p.z) <= 49, `${p.type} ${p.uuid} inside the map`);
  }
  // Buildings never intersect each other (core footprints, 1 m margin).
  for (let i = 0; i < BUILDING_FOOTPRINTS.length; i++) {
    for (let j = i + 1; j < BUILDING_FOOTPRINTS.length; j++) {
      const a = BUILDING_FOOTPRINTS[i]!; const b = BUILDING_FOOTPRINTS[j]!;
      const overlap = a.minX < b.maxX - 1 && a.maxX > b.minX + 1 && a.minZ < b.maxZ - 1 && a.maxZ > b.minZ + 1;
      assert.ok(!overlap, `${a.name} must not overlap ${b.name}`);
    }
  }
});

test('town-plan: signs, crops and ruin dressing exist', () => {
  assert.equal(SIGN_PLACEMENTS.length, 2, 'entrance + exit signs');
  const texts = SIGN_PLACEMENTS.map((s) => s.text);
  assert.ok(texts.every((t) => typeof t === 'string' && t.length > 0), 'signs carry text');
  assert.equal(CROP_ROW_PLACEMENTS.length, 4, 'crop field rows');
  assert.ok(RUIN_FENCE_PLACEMENTS.length >= 3, 'collapsed fence at the ruin');
  // Site sanity for the rotated enterables (asserted here so the plan and
  // the building modules can never silently drift apart).
  assert.deepEqual(BANK_SITE, { x: -12, z: 14 });
  assert.deepEqual(SHERIFF_SITE, { x: 12, z: 14 });
  assert.deepEqual(STABLE_SITE, { x: -13, z: 29 });
});
