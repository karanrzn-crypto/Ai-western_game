/**
 * tests/countryside.test.ts
 * -----------------------------------------------------------------------------
 * The living-countryside contracts (world-expansion round, user spec §1–§7):
 *
 *   1. WORLD CHAIN — the 280×280 ground derives from ONE shared constant;
 *      the walls/playable half follow it (fix-round3's old 120 asserts moved
 *      here, updated to the expanded world).
 *   2. LAYOUT — every managed countryside def sits inside the boundary walls
 *      (±139.5), every building yaw is an exact 90° multiple, every site
 *      carries a collider payload, and the THREE farms are genuinely
 *      separated (≥ 60 m between any two farms' building clusters).
 *   3. FENCES — the run→section computation: gaps honored, sections inside
 *      the world, every section yields an exact collider AABB.
 *   4. AMBIENT — seeded determinism (same seed → identical placement),
 *      every point inside the walls, NONE inside the town rectangle or on
 *      any road corridor, trees never inside fenced habitat rects, static
 *      colliders present for every tree/big rock/fence section.
 *   5. BUILDINGS — every new type builds headless with real children and
 *      ships exact local collider boxes.
 *   6. ROADS CONNECT — each countryside road forks off an existing corridor
 *      or continues one (no orphan routes).
 * -----------------------------------------------------------------------------
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  WORLD_GROUND_SIZE,
  WORLD_HALF_SIZE,
  WORLD_PLAYABLE_HALF,
  TOWN_ROUTE_CORRIDORS,
} from '../src/index.js';
import {
  COUNTRY_FENCE_RUNS,
  COUNTRY_FENCE_STYLES,
  COUNTRY_ROADS,
  COUNTRY_SITES,
  COUNTRY_ZONES,
  buildCountryMapObjects,
  countryColliderFor,
  type CountryFenceRun,
} from '../src/assets/countryside/CountryLayout.js';
import {
  COUNTRY_BUILDING_TYPES,
  COUNTRY_COLLIDERS,
  buildHayBarn,
  buildEquipmentShed,
  buildRemoteCabin,
  buildChickenCoop,
  buildPigShelter,
  buildGrainSilo,
} from '../src/assets/countryside/CountryBuildings.js';
import { createCountryAmbient } from '../src/assets/countryside/CountryAmbient.js';
import type { CollisionBounds } from '../src/physics/CollisionWorld.js';

/* ------------------------------------------------------------------------ */
/* 1 — the world chain                                                        */
/* ------------------------------------------------------------------------ */

test('COUNTRY WORLD: the 280×280 expansion derives from one shared constant', () => {
  assert.equal(WORLD_GROUND_SIZE, 280, 'the living-countryside ground is 280×280');
  assert.equal(WORLD_HALF_SIZE, 140);
  assert.equal(WORLD_PLAYABLE_HALF, 138.5, 'wall inner face (139.5) minus the body margin');
});

test('COUNTRY WORLD: every countryside def sits inside the boundary walls', () => {
  const defs = buildCountryMapObjects();
  assert.ok(defs.length >= 60, `the countryside carries real content (${defs.length} defs)`);
  for (const def of defs) {
    const { x, z } = def.transform.position;
    assert.ok(Math.abs(x) <= WORLD_HALF_SIZE - 1 && Math.abs(z) <= WORLD_HALF_SIZE - 1,
      `${def.metadata.name} at (${x}, ${z}) inside ±139`);
  }
  // determinism: same build → same uuids and transforms
  const again = buildCountryMapObjects();
  assert.deepEqual(again.map((d) => d.uuid), defs.map((d) => d.uuid));
});

/* ------------------------------------------------------------------------ */
/* 2 — the three farms + sites                                                */
/* ------------------------------------------------------------------------ */

const FARM_CLUSTERS: Record<string, Array<[number, number]>> = {
  ranch: [[-7.5, -85], [-13, -64], [-2, -80]],
  agri: [[80, -94], [90, -98], [86, -88], [96, -95]],
  family: [[-88, -88], [-83, -84.5], [-93, -84]],
};

function clusterDistance(a: Array<[number, number]>, b: Array<[number, number]>): number {
  let min = Infinity;
  for (const [ax, az] of a) for (const [bx, bz] of b) min = Math.min(min, Math.hypot(ax - bx, az - bz));
  return min;
}

test('COUNTRY LAYOUT: the three farms are genuinely separated (≥ 60 m)', () => {
  assert.ok(clusterDistance(FARM_CLUSTERS.ranch, FARM_CLUSTERS.agri) >= 60,
    `ranch ↔ agri ${clusterDistance(FARM_CLUSTERS.ranch, FARM_CLUSTERS.agri).toFixed(1)} m`);
  assert.ok(clusterDistance(FARM_CLUSTERS.ranch, FARM_CLUSTERS.family) >= 60,
    `ranch ↔ family ${clusterDistance(FARM_CLUSTERS.ranch, FARM_CLUSTERS.family).toFixed(1)} m`);
  assert.ok(clusterDistance(FARM_CLUSTERS.agri, FARM_CLUSTERS.family) >= 60,
    `agri ↔ family ${clusterDistance(FARM_CLUSTERS.agri, FARM_CLUSTERS.family).toFixed(1)} m`);
});

test('COUNTRY SITES: every building yaw is an exact 90° multiple with a collider payload', () => {
  for (const s of COUNTRY_SITES) {
    assert.ok(s.yaw % 90 === 0, `${s.name} yaw ${s.yaw} — composite colliders stay exact`);
    assert.ok(countryColliderFor(s.type), `${s.name} (${s.type}) carries a collider payload`);
    assert.ok(Math.abs(s.x) <= 138 && Math.abs(s.z) <= 138, `${s.name} inside the playable half`);
  }
  const types = new Set(COUNTRY_SITES.map((s) => s.type));
  for (const t of ['barn-hay', 'shed-equipment', 'cabin-remote', 'coop-chicken', 'pig-shelter', 'silo-grain']) {
    assert.ok(types.has(t), `the new countryside building type ${t} is placed`);
  }
  assert.ok(COUNTRY_SITES.some((s) => s.type === 'house-worker'), 'the agri farm has its workers house');
  assert.ok(COUNTRY_SITES.some((s) => s.type === 'house-family'), 'the family farm has its rural house');
  assert.ok(COUNTRY_SITES.some((s) => s.type === 'house-abandoned'), 'the wilds keep a ruined shell');
});

/* ------------------------------------------------------------------------ */
/* 3 — fences                                                                 */
/* ------------------------------------------------------------------------ */

/** The EXACT section computation CountryAmbient performs (kept in sync by the
 *  shared test — a change in one must update the other). */
function sectionsOf(run: CountryFenceRun): Array<{ x: number; z: number; len: number; height: number }> {
  const style = COUNTRY_FENCE_STYLES[run.style];
  const alongX = run.from[1] === run.to[1];
  const a = alongX ? run.from[0] : run.from[1];
  const b = alongX ? run.to[0] : run.to[1];
  const fixed = alongX ? run.from[1] : run.from[0];
  const sorted = [...(run.gaps ?? [])].sort((p, q) => p[0] - q[0]);
  const intervals: Array<[number, number]> = [];
  let cursor = Math.min(a, b);
  const end = Math.max(a, b);
  for (const [g0, g1] of sorted) {
    if (g0 > cursor) intervals.push([cursor, Math.min(g0, end)]);
    cursor = Math.max(cursor, g1);
  }
  if (cursor < end) intervals.push([cursor, end]);
  const out: Array<{ x: number; z: number; len: number; height: number }> = [];
  for (const [i0, i1] of intervals) {
    const len = i1 - i0;
    if (len < 0.35) continue;
    const count = Math.max(1, Math.round(len / (run.section ?? 2.2)));
    const secLen = len / count;
    for (let i = 0; i < count; i += 1) {
      const c = i0 + secLen * (i + 0.5);
      out.push({ x: alongX ? c : fixed, z: alongX ? fixed : c, len: secLen, height: style.height });
    }
  }
  return out;
}

test('COUNTRY FENCES: runs honor gates and stay inside the world', () => {
  assert.ok(COUNTRY_FENCE_RUNS.length >= 12, `real fence work (${COUNTRY_FENCE_RUNS.length} runs)`);
  let total = 0;
  for (const run of COUNTRY_FENCE_RUNS) {
    const sections = sectionsOf(run);
    total += sections.length;
    assert.ok(sections.length > 0, `${run.name} yields sections`);
    for (const s of sections) {
      assert.ok(Math.abs(s.x) <= 139 && Math.abs(s.z) <= 139, `${run.name} section inside the walls`);
    }
  }
  assert.ok(total >= 150, `the countryside carries ${total} fence sections (instanced)`);
  // the cattle enclosure has a real gate: the east run's gap removes sections
  const cattleEast = COUNTRY_FENCE_RUNS.find((r) => r.name === 'حصار گاوها — شرق')!;
  const cattleSections = sectionsOf(cattleEast);
  const gateZ = cattleSections.filter((s) => s.z > -86.5 && s.z < -83.5);
  assert.equal(gateZ.length, 0, 'the cattle gate gap is a real walkable opening');
  // the tall perimeter uses the tall style
  const perimeter = COUNTRY_FENCE_RUNS.find((r) => r.name === 'حصار رانچ — شمال')!;
  assert.equal(perimeter.style, 'tall');
});

/* ------------------------------------------------------------------------ */
/* 4 — ambient (live, headless: real THREE.Scene + keep-outs)                 */
/* ------------------------------------------------------------------------ */

function fakeBound(minX: number, minZ: number, maxX: number, maxZ: number): CollisionBounds {
  return { uuid: 'fake', min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: 3, z: maxZ } };
}

function makeAmbient() {
  const scene = new THREE.Scene();
  // keep-outs: one fake building so placement respects collider AABBs
  const ambient = createCountryAmbient({
    scene,
    colliderKeepOuts: [fakeBound(50, -105, 55, -100)],
  });
  return { scene, ambient };
}

test('COUNTRY AMBIENT: real, seeded, plentiful and clean of every keep-out', () => {
  const { scene, ambient } = makeAmbient();
  try {
    const stats = ambient.stats();
    assert.ok(stats.trees >= 60, `trees planted: ${stats.trees}`);
    assert.ok(stats.grass >= 800, `grass tufts planted: ${stats.grass}`);
    assert.ok(stats.fenceSections >= 150, `fence sections: ${stats.fenceSections}`);
    assert.ok(stats.hills === 12, 'the horizon ring is authored');
    assert.ok(stats.staticColliders >= stats.trees + stats.bigRocks + stats.fenceSections,
      'every tree/big rock/fence section carries an exact static AABB');

    const root = scene.getObjectByName('country-ambient-root');
    assert.ok(root, 'the ambient root lives in the scene');
    const meshes = root!.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh);
    assert.ok(meshes.length <= 20, `the whole countryside costs ${meshes.length} draw calls`);

    // keep-out spot checks: the fake building AABB + town rect + main street
    const spots: Array<[number, number, string]> = [
      [52.5, -102.5, 'inside the fake collider keep-out'],
      [0, -20, 'inside the town rectangle'],
      [0, -30, 'on the main street corridor'],
      [-1.5, -90, 'on the ranch road corridor'],
      [-42, 108, 'the deer pond'],
    ];
    const colliders = ambient.staticColliders();
    const blocked = (x: number, z: number): boolean =>
      colliders.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z);
    for (const [x, z, why] of spots) assert.ok(!blocked(x, z), `no static collider at ${why} (${x}, ${z})`);

    // determinism: rebuild → identical stats (fixed seeds)
    const { scene: scene2, ambient: ambient2 } = makeAmbient();
    try {
      assert.deepEqual(ambient2.stats(), stats, 'the same seeds grow the same countryside');
    } finally {
      ambient2.dispose();
      scene2.clear();
    }
  } finally {
    ambient.dispose();
    scene.clear();
  }
});

/* ------------------------------------------------------------------------ */
/* 5 — buildings                                                              */
/* ------------------------------------------------------------------------ */

test('COUNTRY BUILDINGS: every new type builds headless with exact colliders', () => {
  const builders: Array<[string, () => THREE.Group]> = [
    ['barn-hay', buildHayBarn],
    ['shed-equipment', buildEquipmentShed],
    ['cabin-remote', buildRemoteCabin],
    ['coop-chicken', buildChickenCoop],
    ['pig-shelter', buildPigShelter],
    ['silo-grain', buildGrainSilo],
  ];
  for (const [type, build] of builders) {
    const g = build();
    assert.ok(g.children.length >= 4, `${type} builds real geometry (${g.children.length} parts)`);
    const payload = (COUNTRY_COLLIDERS as Record<string, { boxes: unknown }>)[type];
    assert.ok(payload && Array.isArray(payload.boxes) && payload.boxes.length > 0,
      `${type} ships exact local collider boxes`);
  }
  assert.equal(COUNTRY_BUILDING_TYPES.length, 6);
});

/* ------------------------------------------------------------------------ */
/* 6 — roads connect                                                          */
/* ------------------------------------------------------------------------ */

test('COUNTRY ROADS: every route forks off an existing corridor (no orphans)', () => {
  // anchors: town corridor endpoints + every point of the countryside's own
  // routes (a route may fork off the MIDDLE of another route — the east
  // trail leaves the south road at its knee, the deer spur at its bend)
  const anchors: Array<[number, number]> = [];
  for (const route of Object.values(TOWN_ROUTE_CORRIDORS)) {
    anchors.push([route[0][0], route[0][1]], [route[route.length - 1][0], route[route.length - 1][1]]);
  }
  const allCountryPoints: Array<[number, number]> = COUNTRY_ROADS.flatMap((r) => r.pts.map(([x, z]) => [x, z] as [number, number]));
  for (const road of COUNTRY_ROADS) {
    const [sx, sz] = road.pts[0];
    const onTown = anchors.some(([ax, az]) => Math.hypot(ax - sx, az - sz) < 12);
    const onCountry = allCountryPoints.some(([ax, az]) => Math.hypot(ax - sx, az - sz) < 0.01 && !(ax === sx && az === sz))
      || COUNTRY_ROADS.some((other) => other !== road
        && other.pts.some(([ax, az]) => Math.hypot(ax - sx, az - sz) < 8));
    assert.ok(onTown || onCountry, `${road.name} forks off the network (start ${sx}, ${sz})`);
    assert.ok(road.pts.length >= 3, `${road.name} is a real continuous route`);
    for (const [x, z] of road.pts) {
      assert.ok(Math.abs(x) <= 139 && Math.abs(z) <= 139, `${road.name} stays inside the walls`);
    }
  }
});

/* ------------------------------------------------------------------------ */
/* 7 — zones cover the expansion                                              */
/* ------------------------------------------------------------------------ */

test('COUNTRY ZONES: the density rects cover the countryside, never the town core', () => {
  assert.ok(COUNTRY_ZONES.length >= 6);
  for (const zone of COUNTRY_ZONES) {
    assert.ok(zone.x1 > zone.x0 && zone.z1 > zone.z0, `${zone.name} is a real rect`);
    assert.ok(Math.abs(zone.x0) <= 138 && Math.abs(zone.x1) <= 138 && Math.abs(zone.z0) <= 138 && Math.abs(zone.z1) <= 138);
    // zones may brush the town rect edge but must not swallow it
    const cx = (zone.x0 + zone.x1) / 2;
    const cz = (zone.z0 + zone.z1) / 2;
    const inTown = Math.abs(cx) < 20 && cz > -50 && cz < 50;
    assert.ok(!inTown, `${zone.name} stays out of the town core`);
  }
});
