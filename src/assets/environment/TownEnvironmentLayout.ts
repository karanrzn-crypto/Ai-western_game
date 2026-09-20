/**
 * src/assets/environment/TownEnvironmentLayout.ts
 * -----------------------------------------------------------------------------
 * THE REDESIGNED WESTERN TOWN PLAN — single source of truth for every
 * environment placement OUTSIDE the building modules (roads, square props,
 * farm fences, vegetation, signage …).
 *
 * PROGRESSION (north → south, the way the player travels):
 *   Farm area (NW, BEFORE town, fenced corral + crop field + windmill)
 *   → town entrance (signs + lamps)
 *   → main street (saloon west / GUN SHOP east — first building met)
 *   → central square (well centerpiece; MEAT SHOP right/west,
 *     WORKER HOUSE left/east)
 *   → far side of the square (BANK + SHERIFF flanking the south road,
 *     family + wealthy houses in the residential pockets behind)
 *   → direct road to the STABLE (big yard + corral)
 *   → town exit (south edge).
 *
 * The RUINED house sits alone on the NE outskirts, far from the square.
 *
 * Layout rules locked here and asserted by tests/town-plan.test.ts:
 *   • Farm fence = INDIVIDUAL fence-section defs (each selectable/movable).
 *   • All placements stay inside the ±50 map, clear of building footprints.
 *   • The main-street and square→stable corridors stay walkable.
 *   • Deterministic: fence jitter + vegetation scatter use seeded RNG.
 * -----------------------------------------------------------------------------
 */

import { mulberry32 } from './EnvPropsAssetFactory.js';

// ---------------------------------------------------------------------------
// Placement shape
// ---------------------------------------------------------------------------

export interface EnvPlacement {
  uuid: string;
  type: string;
  name: string;
  x: number;
  z: number;
  /** Optional explicit height — props on raised floors (stable/gunshop
   *  interiors) must sit at the floor-top plane, not the ground. */
  y?: number;
  yaw?: number;
  scale?: number;
  /** Road patch dims (meters) — the builder snakes/jitters along these. */
  length?: number;
  width?: number;
  /** Roads bake their lift into the geometry (z-fight-safe overlaps). */
  lift?: number;
  /** Extra builder metadata (sign text, scatter seed …). */
  text?: string;
  seed?: number;
  wobble?: number;
  /** Collider:false for props the player may brush past (default true). */
  noCollider?: boolean;
  /** Roads are terrain — not editor-selectable. */
  notEditable?: boolean;
}

const ENV_UUID_BASE = '30000000-0000-4000-8000-';
let uuidCounter = 0x1000;
/** Deterministic, collision-free uuid block for the environment layer. */
function envUuid(): string {
  const n = uuidCounter++;
  return `${ENV_UUID_BASE}${n.toString(16).padStart(12, '0')}`;
}

// ---------------------------------------------------------------------------
// Building footprints (core walls, world space) — used by the scatter
// keep-out test and by tests/town-plan.test.ts (no road/vegetation overlap).
// ---------------------------------------------------------------------------

export interface Footprint { name: string; minX: number; maxX: number; minZ: number; maxZ: number }

/**
 * Core (wall) footprints of the whole town after the redesign. Porches and
 * steps are NOT part of these boxes (roads may run to their edge).
 */
export const BUILDING_FOOTPRINTS: readonly Footprint[] = Object.freeze([
  { name: 'saloon', minX: -19, maxX: -9, minZ: -21, maxZ: -13 },
  { name: 'gunshop', minX: 9.5, maxX: 18.5, minZ: -20.5, maxZ: -13.5 },
  { name: 'bank', minX: -18, maxX: -6, minZ: 9.5, maxZ: 18.5 },
  { name: 'sheriff', minX: 6.8, maxX: 17.2, minZ: 10.3, maxZ: 17.7 },
  { name: 'stable', minX: -19.2, maxX: -6.8, minZ: 21.9, maxZ: 36.1 },
  { name: 'meat-shop', minX: -15, maxX: -13, minZ: -0.6, maxZ: 2.6 },
  { name: 'worker-house', minX: 12.3, maxX: 15.7, minZ: -1, maxZ: 3 },
  { name: 'family-house', minX: -25, maxX: -21, minZ: 18.5, maxZ: 23.5 },
  { name: 'wealthy-house', minX: 20.6, maxX: 25.4, minZ: 17.3, maxZ: 22.7 },
  { name: 'farm-house', minX: -23, maxX: -19, minZ: -41.3, maxZ: -36.7 },
  { name: 'ruined-house', minX: 24.8, maxX: 29.2, minZ: -39.6, maxZ: -34.4 },
]);

// ---------------------------------------------------------------------------
// Roads — irregular dirt patches. `lift` staggers overlapping pieces by a
// few mm (invisible, kills z-fighting). Corridors stay clear of footprints.
// ---------------------------------------------------------------------------

interface RoadSeg { name: string; x1: number; z1: number; x2: number; z2: number; width: number; lift: number; wobble?: number }

const ROAD_SEGS: readonly RoadSeg[] = [
  { name: 'جاده مزرعه — شمال', x1: -16, z1: -48, x2: -16, z2: -33, width: 5, lift: 0.02 },
  { name: 'جاده مزرعه — پیچ', x1: -16, z1: -33, x2: -7, z2: -28.5, width: 5, lift: 0.026 },
  { name: 'جاده ورودی شهر', x1: -7, z1: -28.5, x2: 0, z2: -26, width: 6, lift: 0.032 },
  { name: 'خیابان اصلی', x1: 0, z1: -26, x2: 0, z2: -7.2, width: 9, lift: 0.02, wobble: 0.5 },
  { name: 'میدان مرکزی', x1: 0, z1: 0.5, x2: 0, z2: 0.5, width: 21, lift: 0.038, wobble: 0 }, // length via width×length patch below
  { name: 'جاده اصطبل — شمال', x1: 0.5, z1: 8, x2: 1, z2: 24, width: 8, lift: 0.026, wobble: 0.4 },
  { name: 'جاده اصطبل — جنوب', x1: 1, z1: 24, x2: 1, z2: 40, width: 8, lift: 0.032, wobble: 0.4 },
  { name: 'جاده خروجی', x1: 1, z1: 40, x2: 0, z2: 47.5, width: 6, lift: 0.02 },
  { name: 'مسیر ایوان سالون', x1: -4.5, z1: -12.1, x2: -9.3, z2: -12.1, width: 3, lift: 0.044 },
  { name: 'مسیر ایوان اسلحه‌فروشی', x1: 4.5, z1: -12.1, x2: 9.7, z2: -12.1, width: 3, lift: 0.044 },
  { name: 'مسیر بانک و کلانتری', x1: -6.2, z1: 12, x2: 6.6, z2: 12, width: 4, lift: 0.044 },
  { name: 'محوطه دروازه اصطبل', x1: -6, z1: 23.5, x2: 1, z2: 23.5, width: 6, lift: 0.048 },
  { name: 'محوطه حصار اسب‌ها', x1: 1, z1: 27.5, x2: 6.5, z2: 27.5, width: 4, lift: 0.048 },
  { name: 'حیاط مزرعه', x1: -15.5, z1: -38, x2: -15.5, z2: -38, width: 7, lift: 0.044, wobble: 0 }, // square patch, length via seg
  { name: 'کف حصار مزرعه', x1: -31, z1: -40, x2: -31, z2: -40, width: 15.6, lift: 0.044, wobble: 0 },
  { name: 'کف حصار اسب‌ها', x1: 12, z1: 28, x2: 12, z2: 28, width: 9, lift: 0.044, wobble: 0 },
];

/** The plaza / yard "square patches": width == length (both on X/Z). */
const SQUARE_PATCH_NAMES = new Set(['میدان مرکزی', 'حیاط مزرعه', 'کف حصار مزرعه', 'کف حصار اسب‌ها']);

function segToPlacement(seg: RoadSeg, index: number): EnvPlacement {
  const dx = seg.x2 - seg.x1; const dz = seg.z2 - seg.z1;
  const straight = Math.hypot(dx, dz);
  const square = SQUARE_PATCH_NAMES.has(seg.name);
  const yaw = square ? 0 : (Math.atan2(dx, dz) * 180) / Math.PI;
  return {
    uuid: envUuid(),
    type: 'dirt-road',
    name: seg.name,
    x: (seg.x1 + seg.x2) / 2,
    z: (seg.z1 + seg.z2) / 2,
    yaw,
    // Square patches are width×width organic plazas; street pieces pad
    // 0.8 m past each endpoint so the joints never show a dirt gap.
    length: square ? seg.width : straight + 0.8,
    width: seg.width,
    lift: seg.lift,
    wobble: seg.wobble,
    notEditable: true,
    noCollider: true, // terrain — never a wall
    seed: 100 + index * 7,
  };
}

/** All road/yard dirt pieces, ready for registration (collider:false). */
export const ROAD_PLACEMENTS: readonly EnvPlacement[] = ROAD_SEGS.map(segToPlacement);

// ---------------------------------------------------------------------------
// Square + street props
// ---------------------------------------------------------------------------

const bench = (x: number, z: number, yaw: number): EnvPlacement => ({
  uuid: envUuid(), type: 'bench', name: 'نیمکت میدان', x, z, yaw,
});

const lamp = (x: number, z: number): EnvPlacement => ({
  uuid: envUuid(), type: 'street-lamp', name: 'چراغ خیابانی', x, z,
});

const hitch = (x: number, z: number, yaw = 0, seed = 3): EnvPlacement => ({
  uuid: envUuid(), type: 'hitching-post', name: 'جای بستن اسب', x, z, yaw, seed,
});

const barrel = (x: number, z: number, yaw = 0): EnvPlacement => ({
  uuid: envUuid(), type: 'barrel-prop', name: 'بشکه چوبی', x, z, yaw,
});

const crate = (x: number, z: number, yaw = 0, y = 0): EnvPlacement => ({
  uuid: envUuid(), type: 'wood-crate', name: 'جعبه چوبی', x, z, y, yaw,
});

const hay = (x: number, z: number): EnvPlacement => ({
  uuid: envUuid(), type: 'hay-bale', name: 'باله علوفه', x, z, yaw: 0,
});

const trough = (x: number, z: number, yaw = 0): EnvPlacement => ({
  uuid: envUuid(), type: 'water-trough', name: 'آخور آب', x, z, yaw,
});

const wagon = (x: number, z: number, yaw: number): EnvPlacement => ({
  uuid: envUuid(), type: 'wagon', name: 'گاری چوبی', x, z, yaw,
});

const firewood = (x: number, z: number, yaw = 0): EnvPlacement => ({
  uuid: envUuid(), type: 'firewood-stack', name: 'پشته هیزم', x, z, yaw,
});

export const PROP_PLACEMENTS: readonly EnvPlacement[] = Object.freeze([
  // The square centerpiece sits slightly off-axis (organic feel).
  { uuid: envUuid(), type: 'town-well', name: 'چاه مرکزی شهر', x: -1, z: 0.5, yaw: 15 },
  // Benches around the well (each faces the centerpiece). Adult-scale benches
  // (2.3 m) — the east pair nudged so the collar collider stays clear of the
  // square's barrel cluster.
  bench(-4.4, 0.5, 90), bench(2.4, -1.4, -90), bench(2.4, 2.3, -90), bench(-1, 4.1, 180),
  // Street lamps — main street.
  lamp(-6.5, -23), lamp(6.5, -19.5), lamp(-6.5, -13.5), lamp(6.5, -10.5),
  // Town entrance pair.
  lamp(-4.5, -28), lamp(4.5, -28),
  // Square corners.
  lamp(-7.5, -5.5), lamp(7.5, -5.5), lamp(-7.5, 6.5), lamp(7.5, 6.5),
  // Bank / sheriff fronts.
  lamp(-5.2, 9.5), lamp(5.2, 9.5),
  // Stable road + exit.
  lamp(-3.8, 17), lamp(6.2, 21.5), lamp(-3.8, 31), lamp(6.2, 36),
  lamp(-2.8, 43.5), lamp(3.2, 45.5),
  // Farm lane.
  lamp(-13.5, -36.5),
  // Hitching posts — meat shop (right/west) & worker house (left/east).
  hitch(-10.5, -1.8, 0, 11), hitch(10.5, 0.8, 0, 23),
  // Saloon / gunshop porches.
  hitch(-6, -11.2, 0, 31), hitch(6, -11.2, 0, 47),
  // Stable gate + corral.
  hitch(-4.2, 20.5, 0, 59), hitch(5.8, 20.5, 0, 67), hitch(6, 31, 90, 71),
  // Farm lane — moved to the ROAD EDGE (z-fight/walk round: it used to stand
  // at x −16.5, mid-road, and body-blocked anyone riding the lane down).
  hitch(-18.6, -36, 90, 83),
  // Barrels & crates — square clusters.
  barrel(2.9, 3.9), barrel(3.5, 3.4), barrel(2.5, 4.5),
  crate(3.9, 4.3), crate(3.5, 4.9),
  barrel(-8.6, -12.4), barrel(-9.2, -11.7),       // saloon porch
  barrel(9.9, -13.2), barrel(10.4, -12.5), crate(11, -14.1, 0, 0.1), // gunshop — ON the raised plank floor
  barrel(-15.6, 3.1),                              // behind meat shop
  crate(11.4, -0.4),                               // worker house front
  // Wagons — main street edge, near exit, corral, farm.
  wagon(6.8, -23.5, 14), wagon(6.2, 38.6, -12), wagon(14.5, 25.5, 100), wagon(-25.5, -36, 20),
  // Water troughs.
  trough(-29.5, -40.5), trough(8.8, 29.5), trough(-9.6, -2.6), trough(4.8, 42.5, 90),
  // Hay — stable corral + farm corral + gate side.
  hay(9.5, 26.5), hay(12.5, 31.5), hay(15, 27.8), hay(-4.9, 21.6),
  hay(-27.5, -42.5), hay(-31, -38.5), hay(-26, -37.5),
  // Firewood stacks by the houses.
  firewood(-21.9, 19.6, 90), firewood(13.2, 2.8, -90), firewood(-22.5, -38.6, 90), firewood(16.8, 12.5),
  // Farm barrels/crates near the house porch.
  barrel(-18.6, -37.4), barrel(-18.1, -36.8), crate(-19.6, -40.2), crate(-19.1, -40.7),
  // Stable gate side props — the crate moved WEST out of the stable
  // footprint (it used to stand INSIDE the building at (−7.1, 22.4), buried
  // 9.5 cm into the raised plank floor; walk-round fix).
  barrel(-5.9, 20.6), barrel(-6.5, 21.1), crate(-5.9, 21.6),
]);

export const SIGN_PLACEMENTS: readonly EnvPlacement[] = [
  { uuid: envUuid(), type: 'town-sign', name: 'تابلو ورودی شهر', x: 4.2, z: -28.6, yaw: -135, text: 'DRY GULCH' },
  { uuid: envUuid(), type: 'town-sign', name: 'تابلو خروجی شهر', x: 2.8, z: 46, yaw: 180, text: 'COME BACK SOON' },
];

// ---------------------------------------------------------------------------
// Crop field (east of the farm lane, south of the farm corral)
// ---------------------------------------------------------------------------

export const CROP_ROW_PLACEMENTS: readonly EnvPlacement[] = [-8.6, -7, -5.4, -3.8].map((x, i) => ({
  uuid: envUuid(),
  type: 'crop-row',
  name: `ردیف کشت ${i + 1}`,
  x,
  z: -40,
  yaw: 0,
  noCollider: true,
}));

// ---------------------------------------------------------------------------
// Fences — INDIVIDUAL sections (each its own def/uuid/collider).
// ---------------------------------------------------------------------------

const FENCE_STEP = 1.38;
const fenceRng = mulberry32(0x51e3);

/**
 * Walk a fence run from (x1,z1) to (x2,z2) laying individual sections.
 * `gaps` are [start,end] parameter ranges (meters from the start) left open
 * as gates. Yaw jitter + tiny position jitter keep it hand-built looking.
 */
function fenceRun(
  name: string, x1: number, z1: number, x2: number, z2: number,
  gaps: ReadonlyArray<readonly [number, number]> = [],
): EnvPlacement[] {
  const dx = x2 - x1; const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const ux = dx / length; const uz = dz / length;
  const baseYaw = (Math.atan2(dx, dz) * 180) / Math.PI + 90; // fence builds along X
  const out: EnvPlacement[] = [];
  for (let d = FENCE_STEP / 2; d < length; d += FENCE_STEP) {
    if (gaps.some(([a, b]) => d >= a && d <= b)) continue;
    const j = (fenceRng() - 0.5) * 5;   // ±2.5° lean
    const pj = (fenceRng() - 0.5) * 0.1; // 5 cm placement jitter
    out.push({
      uuid: envUuid(),
      type: 'fence-section',
      name,
      x: x1 + ux * d + -uz * pj,
      z: z1 + uz * d + ux * pj,
      yaw: baseYaw + j,
      notEditable: false,
    });
  }
  return out;
}

/**
 * FARM CORRAL (livestock yard west of the farm house) — ENLARGED (user bug
 * round: 10×12 m read as a cramped pen): now 15×15 m (x −38.5…−23.5,
 * z −47.5…−32.5), ~225 m² of real surrounding land for the livestock,
 * trough, hay and movement. Gate on the SOUTH run (world x −29.5…−26.5,
 * i.e. run parameter d 9.0…12.0). Every section is a separate object —
 * the whole fence is never merged.
 */
export const FARM_FENCE_PLACEMENTS: readonly EnvPlacement[] = Object.freeze([
  ...fenceRun('حصار مزرعه — ضلع جنوبی', -38.5, -32.5, -23.5, -32.5, [[9.0, 12.0]]),
  ...fenceRun('حصار مزرعه — ضلع شمالی', -38.5, -47.5, -23.5, -47.5),
  ...fenceRun('حصار مزرعه — ضلع غربی', -38.5, -47.5, -38.5, -32.5),
  ...fenceRun('حصار مزرعه — ضلع شرقی', -23.5, -47.5, -23.5, -32.5),
]);

/**
 * STABLE CORRAL (horse yard east of the stable road):
 * rect x 7…17, z 22…34, gate on the WEST run (z 26.5…29).
 */
export const CORRAL_FENCE_PLACEMENTS: readonly EnvPlacement[] = Object.freeze([
  ...fenceRun('حصار اسب‌ها — ضلع غربی', 7, 22, 7, 34, [[4.5, 7]]),
  ...fenceRun('حصار اسب‌ها — ضلع شرقی', 17, 22, 17, 34),
  ...fenceRun('حصار اسب‌ها — ضلع جنوبی', 7, 22, 17, 22),
  ...fenceRun('حصار اسب‌ها — ضلع شمالی', 7, 34, 17, 34),
]);

/** Collapsed fence corner near the ruined house (leaning, worn). */
export const RUIN_FENCE_PLACEMENTS: readonly EnvPlacement[] = [
  { uuid: envUuid(), type: 'fence-section', name: 'حصار شکسته', x: 23.5, z: -32.5, yaw: 12 },
  { uuid: envUuid(), type: 'fence-section', name: 'حصار شکسته', x: 25, z: -31.8, yaw: 38 },
  { uuid: envUuid(), type: 'fence-section', name: 'حصار شکسته', x: 22.2, z: -33.4, yaw: -6 },
];

// ---------------------------------------------------------------------------
// Vegetation — sparse dusty-prairie scatter (deterministic).
// ---------------------------------------------------------------------------

function distToSeg(px: number, pz: number, s: RoadSeg): number {
  const dx = s.x2 - s.x1; const dz = s.z2 - s.z1;
  const l2 = dx * dx + dz * dz;
  let t = ((px - s.x1) * dx + (pz - s.z1) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s.x1 + dx * t), pz - (s.z1 + dz * t));
}

function inRect(px: number, pz: number, r: Footprint, margin: number): boolean {
  return px > r.minX - margin && px < r.maxX + margin && pz > r.minZ - margin && pz < r.maxZ + margin;
}

const KEEP_OUT_RECTS: readonly Footprint[] = [
  ...BUILDING_FOOTPRINTS,
  { name: 'plaza', minX: -11.5, maxX: 11.5, minZ: -8.5, maxZ: 9.5 },
  { name: 'crop-field', minX: -11.5, maxX: -2, minZ: -44, maxZ: -36.5 },
  { name: 'farm-corral', minX: -39.1, maxX: -22.9, minZ: -48.1, maxZ: -31.9 },
  { name: 'stable-corral', minX: 6.4, maxX: 17.6, minZ: 21.4, maxZ: 34.6 },
];

function scatterClear(x: number, z: number): boolean {
  if (Math.abs(x) > 46.5 || Math.abs(z) > 46.5) return false;
  for (const r of KEEP_OUT_RECTS) if (inRect(x, z, r, 2)) return false;
  for (const seg of ROAD_SEGS) {
    const clear = seg.width / 2 + 1.6;
    if (distToSeg(x, z, seg) < clear) return false;
  }
  return true;
}

interface ScatterSpec { type: string; name: string; count: number; seed: number; scaleMin: number; scaleMax: number; noCollider?: boolean }

const SCATTER_SPECS: readonly ScatterSpec[] = [
  { type: 'tree', name: 'درخت صحرایی', count: 14, seed: 0x41, scaleMin: 0.85, scaleMax: 1.35 },
  { type: 'bush', name: 'بوته صحرایی', count: 36, seed: 0x42, scaleMin: 0.8, scaleMax: 1.4, noCollider: true },
  { type: 'grass-tuft', name: 'علف خشک', count: 55, seed: 0x43, scaleMin: 0.8, scaleMax: 1.5, noCollider: true },
  { type: 'rock', name: 'سنگ صحرایی', count: 14, seed: 0x44, scaleMin: 0.6, scaleMax: 1.6 },
];

function scatter(): EnvPlacement[] {
  const out: EnvPlacement[] = [];
  for (const spec of SCATTER_SPECS) {
    const rng = mulberry32(spec.seed);
    let placed = 0; let attempts = 0;
    while (placed < spec.count && attempts < spec.count * 60) {
      attempts++;
      const x = (rng() * 2 - 1) * 46;
      const z = (rng() * 2 - 1) * 46;
      if (!scatterClear(x, z)) continue;
      out.push({
        uuid: envUuid(), type: spec.type, name: spec.name,
        x, z, yaw: rng() * 360,
        scale: spec.scaleMin + rng() * (spec.scaleMax - spec.scaleMin),
        seed: 1000 + placed * 13 + spec.seed,
        noCollider: spec.noCollider === true,
      });
      placed++;
    }
  }
  return out;
}

/** Hand-placed landmark trees (square entrance, building yards, farm, stable). */
const MANUAL_TREES: ReadonlyArray<{ x: number; z: number; s: number }> = [
  { x: -11.5, z: -7.8, s: 1.15 }, { x: 11.8, z: -7.2, s: 1.05 },   // square entrance pair
  { x: -20.5, z: 10.2, s: 1.2 },                                   // behind the bank
  { x: -24.5, z: 27.5, s: 1.1 }, { x: -27.5, z: 20.5, s: 0.95 },   // family pocket
  { x: 19.6, z: 25.4, s: 1.15 }, { x: 27.8, z: 15.2, s: 0.9 },     // wealthy pocket
  { x: -30.5, z: -33.2, s: 1.2 }, { x: -11.8, z: -45.5, s: 0.9 },  // farm
  { x: -21.5, z: 38.5, s: 1.05 }, { x: 8, z: 37, s: 0.95 },        // stable road
  { x: 20.5, z: -30.5, s: 1.1 },                                    // toward the ruin
];

const MANUAL_TREES_PLACEMENTS: readonly EnvPlacement[] = MANUAL_TREES.map((t, i) => ({
  uuid: envUuid(), type: 'tree', name: 'درخت شهر', x: t.x, z: t.z, yaw: i * 47 % 360, scale: t.s, seed: 500 + i * 29,
}));

/** Dead trees + rock cluster around the ruined house (NE outskirts). */
export const RUIN_NATURE_PLACEMENTS: readonly EnvPlacement[] = [
  { uuid: envUuid(), type: 'dead-tree', name: 'درخت خشکیده', x: 31, z: -41.5, yaw: 20 },
  { uuid: envUuid(), type: 'dead-tree', name: 'درخت خشکیده', x: 23, z: -42, yaw: 130 },
  { uuid: envUuid(), type: 'dead-tree', name: 'درخت خشکیده', x: 31.8, z: -33.5, yaw: 260 },
  { uuid: envUuid(), type: 'rock', name: 'سنگ', x: 24.2, z: -41.8, yaw: 10, scale: 1.4 },
  { uuid: envUuid(), type: 'rock', name: 'سنگ', x: 29.6, z: -33.8, yaw: 70, scale: 1.1 },
  { uuid: envUuid(), type: 'rock', name: 'سنگ', x: 25.6, z: -32.2, yaw: 160, scale: 0.8 },
  { uuid: envUuid(), type: 'rock', name: 'سنگ', x: 30.8, z: -38.9, yaw: 210, scale: 1.5 },
  { uuid: envUuid(), type: 'rock', name: 'سنگ', x: 23.4, z: -36.2, yaw: 300, scale: 0.9 },
  { uuid: envUuid(), type: 'bush', name: 'بوته صحرایی', x: 22.6, z: -38.8, yaw: 40, seed: 901, noCollider: true },
  { uuid: envUuid(), type: 'bush', name: 'بوته صحرایی', x: 30.2, z: -36, yaw: 90, seed: 902, noCollider: true },
  { uuid: envUuid(), type: 'grass-tuft', name: 'علف خشک', x: 26, z: -31.5, yaw: 0, seed: 903, noCollider: true },
  { uuid: envUuid(), type: 'grass-tuft', name: 'علف خشک', x: 28.5, z: -42.5, yaw: 0, seed: 904, noCollider: true },
];

export const VEGETATION_PLACEMENTS: readonly EnvPlacement[] = Object.freeze([
  ...MANUAL_TREES_PLACEMENTS,
  ...scatter(),
  ...RUIN_NATURE_PLACEMENTS,
]);

// ---------------------------------------------------------------------------
// Aggregate export + audit helpers
// ---------------------------------------------------------------------------

/**
 * Every environment def to register at boot (roads → props → fences → crops
 * → signs → vegetation). Order only affects editor z-ordering of selection.
 */
export function collectEnvironmentPlacements(): EnvPlacement[] {
  return [
    ...ROAD_PLACEMENTS,
    ...PROP_PLACEMENTS,
    ...SIGN_PLACEMENTS,
    ...CROP_ROW_PLACEMENTS,
    ...FARM_FENCE_PLACEMENTS,
    ...CORRAL_FENCE_PLACEMENTS,
    ...RUIN_FENCE_PLACEMENTS,
    ...VEGETATION_PLACEMENTS,
  ];
}

/** True when the point sits inside the footprint (optionally with margin). */
export function pointInFootprint(x: number, z: number, margin = 0): boolean {
  return BUILDING_FOOTPRINTS.some((r) => inRect(x, z, r, margin));
}
