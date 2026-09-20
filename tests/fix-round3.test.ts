/**
 * tests/fix-round3.test.ts — the 12-issue fix round (user report).
 * Locks every fix that pure unit tests can reach:
 *   §1 wealthy porch columns stand ON the deck, capitals at the shaft tops
 *   §2 family porch railing posts seat on the deck (no float, no clip)
 *   §5 road routes stop INSIDE the world (farm road no longer overhangs)
 *   §7 the horse boundary derives from the SHARED world bounds (no ±28.5)
 *   §8 camera/world constants derive from one source of truth
 *   §9 sheriff wall segments carry unique display names
 *   §10 roads are continuous routes (one ribbon per street), not rectangles
 *   §11 the two decorative farm-pen horses are gone
 *   §12 the family house stands beside the butcher, same orientation
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  buildWealthyTownhouse,
  buildFamilyHouse,
  buildTownMapObjects,
  buildSheriffMapObjects,
  SHERIFF_SITE,
  TOWN_EXTERIOR_SITES,
  TOWN_EXTERIOR_COLLIDERS,
  TOWN_GROUND_SIZE,
  TOWN_HALF,
  WORLD_GROUND_SIZE,
  WORLD_HALF_SIZE,
  WORLD_PLAYABLE_HALF,
  HorseController,
  HorsePersistence,
  CollisionWorld,
  registerAllTownFactories,
  AssetRegistry,
} from '../src/index.js';
import type { ObjectDefinition } from '../src/index.js';

/* ------------------------------------------------------------------------ */
/* shared fixtures                                                           */
/* ------------------------------------------------------------------------ */

const townDefs: ObjectDefinition[] = buildTownMapObjects();
const byType = (t: string): ObjectDefinition[] => townDefs.filter((d) => d.assetType === t);

/* ------------------------------------------------------------------------ */
/* §7/§8 — ONE shared source of truth for the world bounds                    */
/* ------------------------------------------------------------------------ */

test('WORLD BOUNDS: ground/half/playable derive from one shared constant chain', () => {
  assert.equal(WORLD_GROUND_SIZE, 120, 'the 2026-09 town ground is 120×120');
  assert.equal(WORLD_HALF_SIZE, WORLD_GROUND_SIZE / 2);
  assert.equal(TOWN_GROUND_SIZE, WORLD_GROUND_SIZE, 'TOWN_GROUND_SIZE re-exports the shared constant');
  assert.equal(TOWN_HALF, WORLD_HALF_SIZE);
  // wall inner face (±59.5) minus a full body margin → the movement clamp
  assert.equal(WORLD_PLAYABLE_HALF, WORLD_HALF_SIZE - 0.5 - 1);
  assert.equal(WORLD_PLAYABLE_HALF, 58.5);
});

test('HORSE BOUNDARY: the old ±28.5 hard limit is gone — restore keeps the far half', () => {
  const registry = new AssetRegistry();
  registerAllTownFactories(registry);
  const world = new CollisionWorld(townDefs);
  const horse = new HorseController(world, { position: { x: 0, y: 0, z: 0 } });
  // a save near the SOUTH-EAST corner of the REAL playable area (the whole
  // band |28.5|…|58.5| used to be silently discarded/snapped)
  horse.restore({ position: { x: 52, y: 0, z: -55 }, yaw: 1, health: 90, stamina: 80, alive: true });
  const p = horse.getPosition();
  assert.ok(Math.abs(p.x - 52) < 1e-9 && Math.abs(p.z + 55) < 1e-9,
    `a position far beyond ±28.5 must survive restore (got ${p.x}, ${p.z})`);
  // past the playable half the clamp still protects the boundary wall
  horse.restore({ position: { x: 59.2, y: 0, z: 59.2 }, yaw: 0, health: 90, stamina: 80, alive: true });
  const c = horse.getPosition();
  assert.ok(Math.abs(c.x) <= WORLD_PLAYABLE_HALF && Math.abs(c.z) <= WORLD_PLAYABLE_HALF,
    'restore clamps to the shared playable half');
  // the first update must NOT snap a boundary horse back toward the center
  horse.restore({ position: { x: 55, y: 0, z: 55 }, yaw: 0, health: 90, stamina: 80, alive: true });
  horse.update({ deltaSeconds: 1 / 60, playerX: 0, playerY: 1.7, playerZ: 0, playerMoving: false });
  const after = horse.getPosition();
  assert.ok(Math.hypot(after.x - 55, after.z - 55) < 0.5,
    `no snap-back on the first update (moved ${Math.hypot(after.x - 55, after.z - 55).toFixed(3)} m)`);
});

test('HORSE PERSISTENCE: the validator accepts the whole playable band', () => {
  const persistence = new HorsePersistence({ storage: memoryStorage() });
  persistence.save({ version: 1, position: { x: 50, y: 0, z: -50 }, yaw: 0, health: 100, stamina: 100, alive: true });
  const loaded = persistence.load();
  assert.ok(loaded, 'a save at (50, −50) — far beyond the old ±28.5 — loads');
  assert.equal(loaded!.position.x, 50);
  persistence.save({ version: 1, position: { x: 59.9, y: 0, z: 0 }, yaw: 0, health: 100, stamina: 100, alive: true });
  assert.equal(persistence.load(), null, 'a save outside the playable half is still rejected');
});

function memoryStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

/* ------------------------------------------------------------------------ */
/* §1 — wealthy house porch columns                                           */
/* ------------------------------------------------------------------------ */

test('WEALTHY PORCH: columns stand exactly on the deck, capitals cap the shafts', () => {
  const g = buildWealthyTownhouse();
  const deck = g.getObjectByName('porch-floor') as THREE.Mesh;
  const roofDeck = g.getObjectByName('porch-roof-deck') as THREE.Mesh;
  assert.ok(deck && roofDeck, 'porch floor + roof deck present');
  const deckBox = new THREE.Box3().setFromObject(deck);
  const roofBox = new THREE.Box3().setFromObject(roofDeck);
  const deckTop = deckBox.max.y;
  assert.ok(Math.abs(deckTop - 0.14) < 1e-6, `deck top at 0.14 (got ${deckTop.toFixed(4)})`);

  // the four columns: white cylinders standing on the porch deck line
  const columns = (g.children as THREE.Mesh[]).filter((m) =>
    m.isMesh && (m.geometry as THREE.CylinderGeometry).type === 'CylinderGeometry'
    && Math.abs((m as THREE.Mesh).position.z - (4.8 / 2 + 0.55)) < 1e-6
    && Math.abs((m as THREE.Mesh).position.x) > 0.3,
  );
  assert.equal(columns.length, 8, '4 column shafts + 4 capitals on the porch line');
  const shafts = columns.filter((m) => (m.geometry as THREE.CylinderGeometry).parameters.radiusTop === 0.1
    && (m.geometry as THREE.CylinderGeometry).parameters.radiusBottom === 0.11);
  const capitals = columns.filter((m) => (m.geometry as THREE.CylinderGeometry).parameters.radiusTop === 0.14);
  assert.equal(shafts.length, 4, 'four column shafts');
  assert.equal(capitals.length, 4, 'four capitals');
  const heights = new Set<number>();
  for (const shaft of shafts) {
    const box = new THREE.Box3().setFromObject(shaft);
    heights.add(+box.min.y.toFixed(4));
    assert.ok(Math.abs(box.min.y - deckTop) < 1e-6,
      `shaft base sits EXACTLY on the deck top (base ${box.min.y.toFixed(4)} vs deck ${deckTop.toFixed(4)})`);
    // the capital must cap THIS shaft's top
    const cap = capitals
      .map((c) => new THREE.Box3().setFromObject(c))
      .find((cb) => Math.abs(cb.min.y - box.max.y) < 1e-6);
    assert.ok(cap, 'a capital sits directly on the shaft top');
    assert.ok(Math.abs(cap.max.y - roofBox.min.y) < 1e-6,
      'the capital lands flush under the porch-roof beam underside');
  }
  assert.equal(heights.size, 1, 'all four shafts share the same base height (symmetry)');
});

/* ------------------------------------------------------------------------ */
/* §2 — family house porch railing                                            */
/* ------------------------------------------------------------------------ */

test('FAMILY PORCH: railing posts seat on the deck (no gap, no clip)', () => {
  const g = buildFamilyHouse();
  const porch = g.getObjectByName('porch');
  assert.ok(porch, 'family porch present');
  const deck = porch.getObjectByName('porch-deck') as THREE.Mesh;
  assert.ok(deck, 'porch deck present');
  const deckTop = new THREE.Box3().setFromObject(deck).max.y;
  assert.ok(Math.abs(deckTop - 0.18) < 1e-6, `deck top at 0.18 (got ${deckTop.toFixed(4)})`);
  // balusters: thin dark cylinders on the street edge of the porch
  const balusters = (porch.children as THREE.Mesh[]).filter((m) =>
    m.isMesh && (m.geometry as THREE.CylinderGeometry).type === 'CylinderGeometry'
    && Math.abs((m.geometry as THREE.CylinderGeometry).parameters.radiusTop - 0.011) < 1e-6);
  assert.ok(balusters.length >= 10, `railing balusters present (${balusters.length})`);
  const bottoms = new Set<number>();
  for (const b of balusters) {
    const box = new THREE.Box3().setFromObject(b);
    bottoms.add(+box.min.y.toFixed(4));
    assert.ok(Math.abs(box.min.y - deckTop) < 1e-6,
      `baluster bottom sits EXACTLY on the deck (bottom ${box.min.y.toFixed(4)})`);
    assert.ok(box.max.y > deckTop + 0.8, 'balusters still reach the rail band');
  }
  assert.equal(bottoms.size, 1, 'every post stands at the same height');
});

/* ------------------------------------------------------------------------ */
/* §5 + §10 — roads: continuous routes inside the world                       */
/* ------------------------------------------------------------------------ */

test('ROADS: every street is ONE continuous route ribbon (no rectangle tiles)', () => {
  const roads = byType('town-road');
  const routes = roads.filter((d) => Array.isArray(d.metadata.route));
  const plazas = roads.filter((d) => Array.isArray(d.metadata.polygon));
  const patches = roads.filter((d) => d.metadata.tint === 'patch');
  assert.equal(routes.length, 3, `two street routes + one spur (got ${routes.length})`);
  assert.equal(plazas.length, 1, 'the plaza is ONE polygon slab');
  assert.equal(patches.length, 7, 'the worn patches stay as organic blobs');
  // no legacy rectangle strips remain (the old 22-tile pile)
  const legacy = roads.filter((d) => !Array.isArray(d.metadata.route)
    && !Array.isArray(d.metadata.polygon) && d.metadata.tint !== 'patch');
  assert.equal(legacy.length, 0, 'no plain rectangle road strips remain');
  // widths stay consistent per route: any width change between adjacent
  // points is small and gradual (the deliberate entrance trumpet)
  for (const route of routes) {
    const pts = route.metadata.route as Array<{ x: number; z: number; w: number }>;
    assert.ok(pts.length >= 3, `${route.metadata.name}: multi-point centerline`);
    for (let i = 1; i < pts.length; i += 1) {
      assert.ok(Math.abs(pts[i].w - pts[i - 1].w) <= 1.0,
        `${route.metadata.name}: width changes gradually (${pts[i - 1].w} → ${pts[i].w})`);
    }
  }
});

test('ROADS: all route/plaza geometry stops INSIDE the world boundary', () => {
  const limit = TOWN_HALF - 0.5; // the boundary walls' inner face
  for (const road of byType('town-road')) {
    const pts = (road.metadata.route ?? road.metadata.polygon) as Array<{ x: number; z: number }> | undefined;
    for (const p of pts ?? []) {
      assert.ok(Math.abs(p.x) <= limit && Math.abs(p.z) <= limit,
        `${road.metadata.name} point (${p.x}, ${p.z}) must stay inside ±${limit} (the farm road used to overhang to −61)`);
    }
  }
  // the explicit regression: the farm route's north end sits ON the wall line
  const farm = byType('town-road').find((d) => Array.isArray(d.metadata.route)
    && (d.metadata.route as Array<{ z: number }>)[0].z < -50)!;
  assert.equal((farm.metadata.route as Array<{ z: number }>)[0].z, -(TOWN_HALF - 0.5),
    'the farm road ends exactly at the boundary wall inner face (−59.5)');
});

test('ROADS: the route factory builds one continuous mesh per route', async () => {
  const registry = new AssetRegistry();
  registerAllTownFactories(registry);
  const def = byType('town-road').find((d) => Array.isArray(d.metadata.route))!;
  const obj = await registry.create(def);
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o: THREE.Object3D) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  assert.equal(meshes.length, 1, 'ONE mesh per route (a single continuous surface)');
  const box = new THREE.Box3().setFromObject(meshes[0]);
  assert.ok(box.max.z - box.min.z > 40, 'the street ribbon spans its whole route (no seams)');
});

/* ------------------------------------------------------------------------ */
/* §9 — unique sheriff display names                                          */
/* ------------------------------------------------------------------------ */

test('SHERIFF PANEL: every managed def has a unique display name', () => {
  const defs = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z);
  const names = new Map<string, number>();
  for (const d of defs) names.set(d.metadata.name, (names.get(d.metadata.name) ?? 0) + 1);
  const dups = [...names.entries()].filter(([, n]) => n > 1);
  assert.deepEqual(dups, [], `duplicate display names: ${dups.map(([n]) => n).join(' | ')}`);
});

/* ------------------------------------------------------------------------ */
/* §11 — the two decorative farm-pen horses are gone                          */
/* ------------------------------------------------------------------------ */

test('FARM HORSES REMOVED: no decorative horse def stands at the farm/pen', () => {
  const horses = byType('town-horse');
  assert.equal(horses.length, 2, 'only the two corral horses remain in the town defs');
  for (const h of horses) {
    const p = h.transform.position;
    assert.ok(p.z > 28, `decor horses only at the stable corral (found one at z=${p.z})`);
  }
});

/* ------------------------------------------------------------------------ */
/* §12 — the family house sits beside the butcher shop                        */
/* ------------------------------------------------------------------------ */

test('FAMILY HOUSE BESIDE BUTCHER: same orientation, adjacent, clear of it', () => {
  const family = TOWN_EXTERIOR_SITES.find((s) => s.type === 'house-family')!;
  const butcher = TOWN_EXTERIOR_SITES.find((s) => s.type === 'butcher-stall')!;
  assert.equal(family.yaw, butcher.yaw, 'both face the same direction (east onto the square)');
  const gap = Math.hypot(family.x - butcher.x, family.z - butcher.z);
  assert.ok(gap < 9, `the house stands NEXT to the stall (center distance ${gap.toFixed(1)} m)`);
  // their composite colliders must not interpenetrate (yaw-aware AABBs)
  const boxOf = (site: { x: number; z: number; yaw: number; scale: number; type: string }) => {
    const spec = TOWN_EXTERIOR_COLLIDERS[site.type];
    const a = (site.yaw * Math.PI) / 180;
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
    for (const b of spec.boxes) {
      const hx = (b.size.x * site.scale) / 2; const hz = (b.size.z * site.scale) / 2;
      const cx = site.x + b.offset.x * site.scale * Math.cos(a) + b.offset.z * site.scale * Math.sin(a);
      const cz = site.z - b.offset.x * site.scale * Math.sin(a) + b.offset.z * site.scale * Math.cos(a);
      for (const [sx, sz] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]] as const) {
        const wx = cx + sx * Math.cos(a) + sz * Math.sin(a);
        const wz = cz - sx * Math.sin(a) + sz * Math.cos(a);
        x0 = Math.min(x0, wx); x1 = Math.max(x1, wx);
        z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
      }
    }
    return { x0, x1, z0, z1 };
  };
  const f = boxOf(family); const b = boxOf(butcher);
  const overlaps = f.x0 < b.x1 && f.x1 > b.x0 && f.z0 < b.z1 && f.z1 > b.z0;
  assert.equal(overlaps, false, 'house and stall colliders stay clear of each other');
});
