/**
 * src/assets/countryside/CountryLayout.ts
 * -----------------------------------------------------------------------------
 * THE single source of truth for the living countryside (world-expansion
 * round, user spec §1–§6). The town (±60 core) and the existing farm KEEP
 * their authored coordinates — this module grows the world OUTWARD on the
 * 280×280 ground:
 *
 *   NORTH  — THE RANCH: the existing farm's land continues north past the
 *            yard into open range (cattle enclosure, horse corral, hay barn,
 *            equipment shed, big troughs), bounded by a tall continuous
 *            perimeter fence. The farm road runs straight through it.
 *   EAST   — THE AGRI FARM: workers' house, big barn, two silos, equipment
 *            shed and four large crop fields, reached by its own dirt road.
 *   NORTHWEST — THE FAMILY FARM: rural house, chicken coop + yard, pig pen,
 *            sheep paddock, garden plot and pond, on its own branch road.
 *   SOUTH  — THE WILDS: the exit road continues into deer country (pond,
 *            rocks, tree cover) with two lonely cabins on narrow trails.
 *   HORIZON — low hills and one mesa OUTSIDE the boundary walls (visual
 *            only — the playable terrain stays flat so the collision solver
 *            and the horse never fight the ground).
 *
 * COORDINATE CONTRACT: north = −Z; every managed building yaw is an exact
 * multiple of 90° so composite colliders stay EXACT.
 *
 * PERF CONTRACT (user spec §7): buildings and prop clusters are MANAGED defs
 * (MergeStatic merges each to a few draw calls); fence runs, wild trees,
 * bushes, rocks, grass and stumps are INSTANCED by CountryAmbient (a handful
 * of draw calls for hundreds of pieces) — their exact section/AABB data
 * comes from THIS module's COUNTRY_FENCE_RUNS, never restated.
 * -----------------------------------------------------------------------------
 */

import type { ObjectDefinition, Vec3 } from '../../core/types.js';
import { TOWN_EXTERIOR_COLLIDERS } from '../TownExteriorAssetFactory.js';
import { COUNTRY_COLLIDERS } from './CountryBuildings.js';

/* -------------------------------------------------------------------------- */
/* UUID block — far above every existing cursor (town ≤ 0x30045, ≤ 0x149)     */
/* -------------------------------------------------------------------------- */

let countryUuidCursor = 0x31000;
function countryUuid(): string {
  countryUuidCursor += 1;
  return `c0000000-0000-4000-8000-${countryUuidCursor.toString(16).padStart(12, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Building sites (managed defs — one per building, exact colliders)          */
/* -------------------------------------------------------------------------- */

export interface CountrySite {
  uuid: string;
  type: string;
  name: string;
  x: number;
  z: number;
  /** exact multiple of 90 — composite colliders stay exact */
  yaw: number;
  scale?: number;
}

let siteCursor = 0;
function site(type: string, name: string, x: number, z: number, yaw: number, scale = 1): CountrySite {
  siteCursor += 1;
  return {
    uuid: `c0000000-0000-4000-8000-${(0x32000 + siteCursor).toString(16).padStart(12, '0')}`,
    type, name, x, z, yaw, scale,
  };
}

export const COUNTRY_SITES: readonly CountrySite[] = Object.freeze([
  // --- THE RANCH (north) -----------------------------------------------------
  site('barn-hay', 'انبار علوفهٔ رانچ', -7.5, -85, 90),       // door faces the road (east)
  site('shed-equipment', 'انبار تجهیزات رانچ', -13, -64, 90), // open side east
  // --- THE AGRI FARM (east) --------------------------------------------------
  site('house-worker', 'خانهٔ کارگران مزرعه', 80, -94, 180),   // reused town house faces north
  site('barn-hay', 'آخور و انبار مزرعهٔ کشاورزی', 90, -98, -90), // door faces west
  site('silo-grain', 'سیلو غله ۱', 96, -93, 0),
  site('silo-grain', 'سیلو غله ۲', 96, -98.5, 0),
  site('shed-equipment', 'انبار ابزار کشاورزی', 86, -88, 180), // open side north to the yard
  // --- THE FAMILY FARM (northwest) --------------------------------------------
  site('house-family', 'خانهٔ روستایی خانوادگی', -88, -88, 180),
  site('coop-chicken', 'مرغدانی', -83, -84.5, 180),
  site('pig-shelter', 'جا خوک‌ها', -93, -84, 180),
  // --- THE WILDS (south) ------------------------------------------------------
  site('cabin-remote', 'کلبهٔ تک‌افتادهٔ جنوب', -32, 126, 180),
  site('house-abandoned', 'خانهٔ متروکهٔ دشت', 98, 106, 270, 1.15), // reused ruined shell
]);

/** Collider payload per site (reuses the town table for the reused types). */
export function countryColliderFor(type: string): unknown {
  return (COUNTRY_COLLIDERS as Record<string, unknown>)[type]
    ?? (TOWN_EXTERIOR_COLLIDERS as Record<string, unknown>)[type];
}

/* -------------------------------------------------------------------------- */
/* Fence runs — INSTANCED by CountryAmbient (exact section data lives here)   */
/* -------------------------------------------------------------------------- */

export type CountryFenceStyle = 'farm' | 'corral' | 'tall' | 'low';

export interface CountryFenceRun {
  name: string;
  from: [number, number];
  to: [number, number];
  /** gate gaps as [start, end] along the run axis */
  gaps?: Array<[number, number]>;
  style: CountryFenceStyle;
  section?: number;
}

export const COUNTRY_FENCE_STYLES: Readonly<Record<CountryFenceStyle, { height: number; thickness: number }>> = Object.freeze({
  farm: { height: 1.12, thickness: 0.2 },   // the town farm-fence contract
  corral: { height: 1.12, thickness: 0.2 },
  tall: { height: 1.45, thickness: 0.22 },  // cattle-proof perimeter
  low: { height: 0.8, thickness: 0.16 },    // garden/chicken yard
});

export const COUNTRY_FENCE_RUNS: readonly CountryFenceRun[] = Object.freeze([
  // --- ranch perimeter (wraps AROUND the existing yard's fence lines) --------
  { name: 'حصار رانچ — شمال', from: [-30, -96], to: [2, -96], style: 'tall' },
  { name: 'حصار رانچ — غرب', from: [-30, -96], to: [-30, -57], style: 'tall' },
  { name: 'حصار رانچ — جنوب غربی', from: [-30, -57], to: [-21, -57], style: 'tall' },
  { name: 'حصار رانچ — جنوب شرقی', from: [-5.8, -57], to: [2, -57], gaps: [[-4.6, 0.8]], style: 'tall' }, // the farm road passes THROUGH — the ranch's dirt entry
  { name: 'حصار رانچ — شرق', from: [2, -96], to: [2, -57], gaps: [[-66, -63]], style: 'tall' }, // trailhead gap
  // --- cattle enclosure (big, tall, one wide gate on its east side) -----------
  { name: 'حصار گاوها — شمال', from: [-28, -94], to: [-14, -94], style: 'tall' },
  { name: 'حصار گاوها — جنوب', from: [-28, -76], to: [-14, -76], style: 'tall' },
  { name: 'حصار گاوها — غرب', from: [-28, -94], to: [-28, -76], style: 'tall' },
  { name: 'حصار گاوها — شرق', from: [-14, -94], to: [-14, -76], gaps: [[-86.5, -83.5]], style: 'tall' },
  // --- horse corral beside the road -------------------------------------------
  { name: 'حصار اسب رانچ — شمال', from: [-11, -72], to: [-3.5, -72], style: 'corral' },
  { name: 'حصار اسب رانچ — جنوب', from: [-11, -63], to: [-3.5, -63], style: 'corral' },
  { name: 'حصار اسب رانچ — غرب', from: [-11, -72], to: [-11, -63], gaps: [[-68.8, -66.2]], style: 'corral' },
  { name: 'حصار اسب رانچ — شرق', from: [-3.5, -72], to: [-3.5, -63], style: 'corral' },
  // --- agri farmstead yard (house + barn + silos) ------------------------------
  { name: 'حصار مزرعهٔ کشاورزی — شمال', from: [72, -100], to: [100, -100], gaps: [[92, 95.5]], style: 'farm' },
  { name: 'حصار مزرعهٔ کشاورزی — جنوب', from: [72, -84], to: [100, -84], gaps: [[75, 79]], style: 'farm' }, // road entry
  { name: 'حصار مزرعهٔ کشاورزی — غرب', from: [72, -100], to: [72, -84], style: 'farm' },
  { name: 'حصار مزرعهٔ کشاورزی — شرق', from: [100, -100], to: [100, -84], style: 'farm' },
  // --- family farm: chicken yard (low), pig pen, sheep paddock -----------------
  { name: 'حصار مرغ‌ها — شمال', from: [-81.5, -86], to: [-76.5, -86], style: 'low' },
  { name: 'حصار مرغ‌ها — جنوب', from: [-81.5, -81], to: [-76.5, -81], style: 'low' },
  { name: 'حصار مرغ‌ها — غرب', from: [-81.5, -86], to: [-81.5, -81], gaps: [[-84.4, -82.6]], style: 'low' },
  { name: 'حصار مرغ‌ها — شرق', from: [-76.5, -86], to: [-76.5, -81], style: 'low' },
  { name: 'حصار خوک‌ها — شمال', from: [-95, -86], to: [-90, -86], style: 'farm' },
  { name: 'حصار خوک‌ها — جنوب', from: [-95, -81], to: [-90, -81], style: 'farm' },
  { name: 'حصار خوک‌ها — غرب', from: [-95, -86], to: [-95, -81], style: 'farm' },
  { name: 'حصار خوک‌ها — شرق', from: [-90, -86], to: [-90, -81], gaps: [[-84.6, -82.4]], style: 'farm' },
  { name: 'حصار گوسفند خانوادگی — شمال', from: [-96, -96], to: [-89, -96], style: 'farm' },
  { name: 'حصار گوسفند خانوادگی — جنوب', from: [-96, -90], to: [-89, -90], gaps: [[-93.6, -91.4]], style: 'farm' },
  { name: 'حصار گوسفند خانوادگی — غرب', from: [-96, -96], to: [-96, -90], style: 'farm' },
  { name: 'حصار گوسفند خانوادگی — شرق', from: [-89, -96], to: [-89, -90], style: 'farm' },
  // --- family garden plot -------------------------------------------------------
  { name: 'حصار باغ — شمال', from: [-94.5, -104], to: [-88.5, -104], style: 'low' },
  { name: 'حصار باغ — جنوب', from: [-94.5, -99.5], to: [-88.5, -99.5], gaps: [[-92.4, -90.6]], style: 'low' },
  { name: 'حصار باغ — غرب', from: [-94.5, -104], to: [-94.5, -99.5], style: 'low' },
  { name: 'حصار باغ — شرق', from: [-88.5, -104], to: [-88.5, -99.5], style: 'low' },
]);

/* -------------------------------------------------------------------------- */
/* Roads — 'town-road' route defs (the SAME ribbon factory the town uses)     */
/* -------------------------------------------------------------------------- */

export interface CountryRoad { name: string; pts: Array<[number, number, number]>; }

export const COUNTRY_ROADS: readonly CountryRoad[] = Object.freeze([
  // ranch road: the farm road continues north THROUGH the open range
  { name: 'جادهٔ رانچ', pts: [[-1.5, -59.5, 6.5], [-1.5, -70, 5.5], [-1.8, -88, 5], [-2, -108, 3.5], [-2, -122, 3]] },
  // agri branch: forks east off the farm road
  { name: 'جادهٔ مزرعهٔ کشاورزی', pts: [[-1.5, -60, 5.5], [28, -63.5, 4.4], [52, -71, 4], [70, -79.5, 3.8], [80, -86, 3.6], [88, -90, 3.4]] },
  // family branch: forks northwest off the farm road
  { name: 'جادهٔ مزرعهٔ خانوادگی', pts: [[-1.5, -62, 5], [-30, -66, 3.8], [-56, -73.5, 3.4], [-74, -83, 3.2], [-86, -89.5, 3]] },
  // wilds: the exit road continues south into deer country
  { name: 'جادهٔ دشت جنوبی', pts: [[0, 59.5, 5.5], [0, 80, 4.6], [-6, 100, 3.6], [-16, 118, 3.2], [-26, 130, 3]] },
  // east trail to the ruined plain cabin (narrow)
  { name: 'مسیر کلبهٔ دشت', pts: [[0.6, 80, 3], [30, 88, 2.8], [58, 96, 2.8], [84, 102, 2.6], [96, 104, 2.6]] },
  // spur: deer-meadow clearing (ends at the pond rim)
  { name: 'مسیر چراگاه گوزن', pts: [[-16, 118, 3], [-26, 114, 2.6], [-36, 110, 2.6]] },
]);

/** Ground-corridor polylines for the ambient keep-out (same data as above). */
export const COUNTRY_ROAD_CORRIDORS = COUNTRY_ROADS;

/* -------------------------------------------------------------------------- */
/* Ponds, fields, habitat rects                                               */
/* -------------------------------------------------------------------------- */

export interface CountryPond { name: string; x: number; z: number; rx: number; rz: number; }

export const COUNTRY_PONDS: readonly CountryPond[] = Object.freeze([
  { name: 'حوض چراگاه گوزن', x: -42, z: 108, rx: 4.2, rz: 2.7 },
  { name: 'حوض آب خانوادگی', x: -84, z: -93, rx: 1.8, rz: 1.3 },
]);

/** Big crop fields — merged-geometry defs (2 draw calls each), not fences. */
export interface CountryField { name: string; x: number; z: number; rows: number; rowGap: number; length: number; yaw?: number; }

export const COUNTRY_FIELDS: readonly CountryField[] = Object.freeze([
  { name: 'کشتزار گندم ۱', x: 64, z: -102, rows: 8, rowGap: 1.5, length: 18 },
  { name: 'کشتزار گندم ۲', x: 86, z: -110, rows: 8, rowGap: 1.5, length: 20, yaw: 90 },
  { name: 'کشتزار جو', x: 60, z: -114, rows: 6, rowGap: 1.5, length: 14 },
  { name: 'کشتزار یونجه', x: 102, z: -108, rows: 7, rowGap: 1.4, length: 16, yaw: 90 },
  { name: 'باغ خانوادگی', x: -91.5, z: -101.75, rows: 4, rowGap: 1.1, length: 5 },
]);

/** Fenced habitat interiors — the ambient layer thins these out (the yards'
 * furniture is managed defs; the grass stays short and sparse inside). */
export const COUNTRY_HABITAT_RECTS: readonly { x0: number; z0: number; x1: number; z1: number }[] = Object.freeze([
  { x0: -28, z0: -94, x1: -14, z1: -76 },   // cattle enclosure
  { x0: -11, z0: -72, x1: -3.5, z1: -63 },  // horse corral
  { x0: -100, z0: -100, x1: 100, z1: -84 }, // agri yard
  { x0: -96, z0: -104, x1: -76.5, z1: -81 },// family farmstead strip
]);

/** The deer meadow's open clearing (trees around it, none inside the rim). */
export const DEER_MEADOW = Object.freeze({ x: -42, z: 108, r: 7 });

/* -------------------------------------------------------------------------- */
/* Ambient zones (density rects for CountryAmbient)                           */
/* -------------------------------------------------------------------------- */

export type CountryZoneKind = 'plains' | 'grassland' | 'wild' | 'ranchRange';

export interface CountryZone {
  name: string;
  kind: CountryZoneKind;
  x0: number; z0: number; x1: number; z1: number;
}

export const COUNTRY_ZONES: readonly CountryZone[] = Object.freeze([
  { name: 'دشت شرق', kind: 'plains', x0: 8, z0: -138, x1: 138, z1: -28 },
  { name: 'دشت جنوب شرق', kind: 'plains', x0: 26, z0: -28, x1: 138, z1: 96 },
  { name: 'دشت جنوب شرق دور', kind: 'plains', x0: 40, z0: 96, x1: 138, z1: 138 },
  { name: 'چمنزار غرب', kind: 'grassland', x0: -138, z0: -28, x1: -10, z1: 138 },
  { name: 'چمنزار غرب میانی', kind: 'grassland', x0: -138, z0: -100, x1: -34, z1: -28 },
  { name: 'چمنزار شمال غرب', kind: 'grassland', x0: -138, z0: -138, x1: -34, z1: -100 },
  { name: 'دشت جنوبی', kind: 'wild', x0: -138, z0: 56, x1: 40, z1: 138 },
  { name: 'مراتع رانچ', kind: 'ranchRange', x0: -34, z0: -138, x1: 8, z1: -100 },
  { name: 'مراتع رانچ میانی', kind: 'ranchRange', x0: -34, z0: -100, x1: 8, z1: -57 },
  { name: 'مرتع شرق رانچ', kind: 'ranchRange', x0: 8, z0: -138, x1: 34, z1: -100 },
]);

/** Per-kind instance densities (per 100×100 m): grass tufts / bushes / small
 * rocks / big rocks / trees / stumps — tuned so the FULL countryside stays
 * ≈ 1,900 instances (a handful of draw calls, ~70 k triangles). */
export const ZONE_DENSITY: Readonly<Record<CountryZoneKind, {
  grass: number; bush: number; rock: number; bigRock: number; tree: number; stump: number;
}>> = Object.freeze({
  plains: { grass: 95, bush: 26, rock: 14, bigRock: 5, tree: 3, stump: 3 },
  grassland: { grass: 150, bush: 38, rock: 10, bigRock: 3, tree: 8, stump: 4 },
  wild: { grass: 110, bush: 40, rock: 18, bigRock: 6, tree: 22, stump: 6 },
  ranchRange: { grass: 120, bush: 24, rock: 8, bigRock: 2, tree: 2, stump: 2 },
});

/* -------------------------------------------------------------------------- */
/* The managed def list (buildings' props, roads, ponds, fields, landmarks)   */
/* -------------------------------------------------------------------------- */

const defs: ObjectDefinition[] = [];

function emit(
  assetType: string,
  name: string,
  position: Vec3,
  metadata: Record<string, unknown>,
  rotation: Vec3 = { x: 0, y: 0, z: 0 },
  scale: Vec3 = { x: 1, y: 1, z: 1 },
): void {
  defs.push({
    uuid: countryUuid(),
    assetType,
    transform: { position, rotation, scale },
    metadata: { name, editable: metadata.editable ?? true, ...metadata },
  });
}

function boxDef(
  assetType: string,
  name: string,
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number,
  metadata: Record<string, unknown>,
): void {
  emit(assetType, name, { x, y, z }, metadata, { x: 0, y: 0, z: 0 }, { x: sx, y: sy, z: sz });
}

/** Every managed def the countryside needs (ambient layer is NOT here — it
 *  builds its own instanced group from the exported tables above). */
export function buildCountryMapObjects(): ObjectDefinition[] {
  countryUuidCursor = 0x31000;
  siteCursor = 0;
  defs.length = 0;

  // --- buildings at their sites ------------------------------------------------
  for (const s of COUNTRY_SITES) {
    const scale = s.scale ?? 1;
    defs.push({
      uuid: s.uuid,
      assetType: s.type,
      transform: {
        position: { x: s.x, y: 0, z: s.z },
        rotation: { x: 0, y: s.yaw, z: 0 },
        scale: { x: scale, y: scale, z: scale },
      },
      metadata: { name: s.name, editable: true, collider: countryColliderFor(s.type) },
    });
  }

  // --- roads + worn patches -----------------------------------------------------
  for (const road of COUNTRY_ROADS) {
    emit('town-road', road.name, { x: 0, y: 0.02, z: 0 }, {
      collider: false, editable: false,
      route: road.pts.map(([x, z, w]) => ({ x, z, w })),
    });
  }
  boxDef('town-road', 'لکهٔ خاک رانچ', -9, 0.015, -70, 3.6, 1, 2.6, { collider: false, editable: false, width: 3.6, depth: 2.6, tint: 'patch' });
  boxDef('town-road', 'لکهٔ خاک مزرعهٔ کشاورزی', 84, 0.015, -92, 3.2, 1, 2.4, { collider: false, editable: false, width: 3.2, depth: 2.4, tint: 'patch' });
  boxDef('town-road', 'لکهٔ خاک مزرعهٔ خانوادگی', -86, 0.015, -90, 3, 1, 2.2, { collider: false, editable: false, width: 3, depth: 2.2, tint: 'patch' });

  // --- ponds ---------------------------------------------------------------------
  for (const pond of COUNTRY_PONDS) {
    emit('town-pond', pond.name, { x: pond.x, y: 0, z: pond.z }, { collider: false, rx: pond.rx, rz: pond.rz });
  }

  // --- crop fields (merged-geometry defs — 2 draw calls each) ---------------------
  for (const field of COUNTRY_FIELDS) {
    emit('country-field', field.name, { x: field.x, y: 0, z: field.z }, {
      collider: false, editable: false,
      rows: field.rows, rowGap: field.rowGap, length: field.length,
    }, { x: 0, y: field.yaw ?? 0, z: 0 });
  }

  /* -- RANCH furniture (logical placement only) --------------------------------- */
  // cattle enclosure: two big troughs + hay feed + rake
  boxDef('town-trough', 'آبشخور بزرگ گاوها ۱', -24, 0, -80, 2.4, 0.47, 0.62, { collider: true });
  boxDef('town-trough', 'آبشخور بزرگ گاوها ۲', -24, 0, -88, 2.4, 0.47, 0.62, { collider: true });
  boxDef('town-hay', 'علوفهٔ گاوها ۱', -19, 0, -83, 1.5, 0.78, 1.0, { collider: true });
  boxDef('town-hay', 'علوفهٔ گاوها ۲', -19, 0.78, -83, 1.2, 0.7, 0.85, { collider: false });
  boxDef('town-hay', 'علوفهٔ گاوها ۳', -19.6, 0, -88.5, 1.2, 0.78, 0.9, { collider: true });
  // horse corral: trough + hay
  boxDef('town-trough', 'آبشخور اسب رانچ', -7.2, 0, -70.5, 1.9, 0.47, 0.62, { collider: true });
  boxDef('town-hay', 'علوفهٔ اسب رانچ', -9.6, 0, -66.5, 1.15, 0.78, 0.85, { collider: true });
  emit('town-hitching', 'پایهٔ مهار رانچ', { x: -2.9, y: 0, z: -64.5 }, { collider: true }, { x: 0, y: 90, z: 0 }, { x: 2.0, y: 1.1, z: 0.35 });
  // barn yard: wagon, barrels, woodpile, lamps
  boxDef('town-box', 'گاری رانچ — محفظه', -4.6, 0.76, -81, 1.9, 0.75, 3.4, { tint: 'plankA', collider: true });
  emit('town-wagon', 'گاری رانچ — چرخ‌ها', { x: -4.6, y: 0, z: -81 }, { collider: false });
  boxDef('town-hay', 'بار گاری رانچ', -4.6, 1.52, -81, 1.0, 0.78, 0.75, { collider: false });
  boxDef('town-barrel', 'بشکهٔ انبار رانچ ۱', -3.6, 0, -83.2, 0.74, 0.95, 0.74, { collider: true });
  boxDef('town-barrel', 'بشکهٔ انبار رانچ ۲', -3.7, 0, -84.1, 0.68, 0.9, 0.68, { collider: true });
  boxDef('town-woodpile', 'هیزم رانچ', -10.4, 0, -82.5, 1.5, 1.05, 0.8, { collider: true });
  boxDef('town-lamp-post', 'چراغ انبار رانچ — پایه', -4.4, 0, -87.6, 0.45, 1.05, 0.45, { collider: true });
  emit('town-lamp-head', 'چراغ انبار رانچ — سر', { x: -4.4, y: 1.05, z: -87.6 }, { collider: false });
  // shed yard: crates + hay
  boxDef('town-crate', 'جعبهٔ تجهیزات ۱', -10.8, 0, -62.4, 0.85, 0.85, 0.85, { collider: true });
  boxDef('town-crate', 'جعبهٔ تجهیزات ۲', -10.9, 0.85, -62.5, 0.62, 0.62, 0.62, { collider: false });
  boxDef('town-hay', 'علوفهٔ انبار تجهیزات', -15.6, 0, -62.6, 1.15, 0.78, 0.85, { collider: true });

  /* -- AGRI FARM furniture ------------------------------------------------------- */
  boxDef('town-crate', 'جعبهٔ محصول ۱', 82.5, 0, -90.5, 0.85, 0.85, 0.85, { collider: true });
  boxDef('town-crate', 'جعبهٔ محصول ۲', 83.5, 0, -90.6, 0.8, 0.8, 0.8, { collider: true });
  boxDef('town-crate', 'جعبهٔ محصول — روی هم', 83, 0.85, -90.5, 0.6, 0.6, 0.6, { collider: false });
  boxDef('town-barrel', 'بشکهٔ مزرعهٔ کشاورزی', 81.4, 0, -89.8, 0.74, 0.95, 0.74, { collider: true });
  boxDef('town-hay', 'علوفهٔ جلوی انبار', 87.5, 0, -92.2, 1.3, 0.78, 0.95, { collider: true });
  boxDef('town-trough', 'آبشخور کارگران', 78.2, 0, -90.6, 1.8, 0.47, 0.62, { collider: true });
  boxDef('town-woodpile', 'هیزم مزرعهٔ کشاورزی', 97.4, 0, -90.2, 1.4, 1.05, 0.8, { collider: true });
  boxDef('town-lamp-post', 'چراغ خانهٔ کارگران — پایه', 79.2, 0, -92.4, 0.45, 1.05, 0.45, { collider: true });
  emit('town-lamp-head', 'چراغ خانهٔ کارگران — سر', { x: 79.2, y: 1.05, z: -92.4 }, { collider: false });
  emit('town-windmill', 'آسیاب بادی مزرعه', { x: 104, y: 0, z: -96 }, { collider: false });

  /* -- FAMILY FARM furniture ------------------------------------------------------ */
  boxDef('town-woodpile', 'هیزم خانهٔ روستایی', -85.8, 0, -86.2, 1.3, 1.05, 0.75, { collider: true });
  boxDef('town-barrel', 'بشکهٔ آب باران', -84.4, 0, -89.4, 0.74, 0.95, 0.74, { collider: true });
  boxDef('town-crate', 'جعبهٔ تخم‌مرغ', -80.4, 0, -85.8, 0.7, 0.7, 0.7, { collider: true });
  boxDef('town-trough', 'آبشخور گوسفند خانوادگی', -93.5, 0, -93.4, 1.7, 0.47, 0.62, { collider: true });
  boxDef('town-hay', 'علوفهٔ گوسفند خانوادگی', -95.2, 0, -91.6, 1.1, 0.78, 0.8, { collider: true });
  boxDef('town-trough', 'آبشخور خوک‌ها', -92.6, 0, -82.6, 1.4, 0.47, 0.55, { collider: true });
  boxDef('town-lamp-post', 'چراغ ایوان روستایی — پایه', -85.6, 0, -90.4, 0.45, 1.05, 0.45, { collider: true });
  emit('town-lamp-head', 'چراغ ایوان روستایی — سر', { x: -85.6, y: 1.05, z: -90.4 }, { collider: false });
  // parked wagon at the family farm (bed = collider, wheels = decor)
  boxDef('town-box', 'گاری خانوادگی — محفظه', -89.5, 0.76, -84.8, 1.9, 0.75, 3.4, { tint: 'plankB', collider: true });
  emit('town-wagon', 'گاری خانوادگی — چرخ‌ها', { x: -89.5, y: 0, z: -84.8 }, { collider: false });

  /* -- WILDS furniture ------------------------------------------------------------- */
  boxDef('town-crate', 'جعبهٔ کلبهٔ جنوب', -30.4, 0, 124.6, 0.75, 0.75, 0.75, { collider: true });
  boxDef('town-barrel', 'بشکهٔ کلبهٔ جنوب', -33.6, 0, 124.4, 0.74, 0.95, 0.74, { collider: true });
  boxDef('town-woodpile', 'هیزم کلبهٔ جنوب', -30.6, 0, 128.4, 1.2, 0.95, 0.7, { collider: true });
  boxDef('town-rock', 'سنگ چراگاه گوزن ۱', -47.5, 0, 104.5, 1.6, 1.0, 1.4, { collider: true });
  boxDef('town-rock', 'سنگ چراگاه گوزن ۲', -36.8, 0, 112.8, 1.2, 0.75, 1.1, { collider: true });

  /* -- landmark trees (rich managed models at farm fronts) ------------------------- */
  const tree = (x: number, z: number, seed: number, s: number, name: string): void => {
    emit('town-tree', name, { x, y: 0, z }, { collider: false, seed }, { x: 0, y: seed * 37, z: 0 }, { x: s, y: s, z: s });
  };
  tree(-12.2, -90.5, 11, 1.2, 'درخت رانچ');
  tree(-19.8, -60.8, 12, 1.05, 'درخت انبار رانچ');
  tree(75.5, -88.5, 13, 1.1, 'درخت مزرعهٔ کشاورزی');
  tree(99.5, -103.5, 14, 1.0, 'درخت انبار غله');
  tree(-83.2, -87.6, 15, 1.15, 'درخت خانهٔ روستایی');
  tree(-31.5, 122.4, 16, 1.25, 'درخت کلبهٔ جنوب');
  tree(-38.5, 113.5, 17, 1.3, 'درخت چراگاه گوزن');
  tree(95.5, 110.5, 18, 1.1, 'درخت خانهٔ متروکه');

  return defs;
}

/* -------------------------------------------------------------------------- */
/* Horizon hills — VISUAL ONLY, outside the boundary walls (±140)             */
/* -------------------------------------------------------------------------- */

export interface HillSpec { x: number; z: number; rx: number; ry: number; rz: number; }

/** Ring of low hills + one flat-topped mesa beyond the walls (never reached:
 *  the walls stand at ±139.5 and every mound center sits ≥ 158 m out). */
export const COUNTRY_HILLS: readonly HillSpec[] = Object.freeze([
  { x: -185, z: -120, rx: 42, ry: 13, rz: 30 },
  { x: -150, z: -30, rx: 30, ry: 8, rz: 40 },
  { x: -168, z: 70, rx: 38, ry: 11, rz: 34 },
  { x: -110, z: 175, rx: 46, ry: 14, rz: 30 },
  { x: -30, z: 190, rx: 55, ry: 9, rz: 26 },
  { x: 70, z: 178, rx: 40, ry: 12, rz: 36 },
  { x: 155, z: 110, rx: 36, ry: 15, rz: 30 },
  { x: 190, z: 20, rx: 44, ry: 16, rz: 32 }, // the mesa (flat-topped)
  { x: 150, z: -70, rx: 34, ry: 10, rz: 40 },
  { x: 100, z: -175, rx: 48, ry: 12, rz: 28 },
  { x: 20, z: -190, rx: 52, ry: 10, rz: 30 },
  { x: -70, z: -180, rx: 44, ry: 13, rz: 32 },
]);
