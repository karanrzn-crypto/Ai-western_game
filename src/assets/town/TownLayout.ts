/**
 * src/assets/town/TownLayout.ts
 * -----------------------------------------------------------------------------
 * THE single source of truth for the redesigned western town (2026-09 layout,
 * per the user's 17-section spec + the second reference image).
 *
 * WORLD CONVENTION: X = east(+), Z = south(+), north = −Z. Ground 120×120
 * (±60, invisible boundary walls). All building yaws are exact multiples of
 * 90° so CollisionWorld's yaw-conservative AABB equals the true box —
 * colliders hug the visuals with ZERO gap.
 *
 * PROGRESSION (spec §2):
 *   farm (north, before town) → town entrance (Z≈−34) → main street
 *   → gun shop (first building, east side) → central square (fountain)
 *   → meat shop RIGHT (west) / worker house LEFT (east)
 *   → bank · sheriff · family house · wealthy house on the FAR side
 *   → direct road south → stable near the exit → town exit (south edge).
 *
 * FENCE CONTRACT (spec §4): every fence section is its OWN def (post + rails,
 * unit-space, collider == extents) — individually selectable/movable in the
 * editor, never merged into one object. Runs are built by fenceRun() with
 * real gate gaps, slight length jitter and a few weathered 'broken' sections.
 *
 * SALOON NOTE: the saloon is an existing full-interior building; the layout
 * parks it on the main street's west side (its SALOON face onto the street)
 * so the street reads like the reference image's west block. It is NOT part
 * of the user's building list, so it changes NOTHING else.
 *
 * DECOR COLLIDERS: trees/bushes/grass/crops/ponds/horses/windmill/roofs/
 * window/porch-post decor carry `collider: false` (soft or overhead). Street
 * lamps block via their post def's box. Everything else that blocks is a
 * unit-space def whose scale IS its collider (zero gap).
 * -----------------------------------------------------------------------------
 */

import type { ObjectDefinition, Vec3 } from '../../core/types.js';
import { SALOON_SITE } from '../saloon/SaloonLayout.js';
import { BANK_SITE } from '../bank/BankLayout.js';
import { SHERIFF_SITE } from '../sheriff/SheriffLayout.js';
import { STABLE_SITE } from '../stable/StableLayout.js';
import { GUNSHOP_SITE } from '../gunshop/GunShopLayout.js';
import { emitFountain } from './TownBuildings.js';

/** Map half-size (ground is 120×120). */
export const TOWN_GROUND_SIZE = 120;
export const TOWN_HALF = TOWN_GROUND_SIZE / 2;

/** World yaw per existing building (degrees — exact multiples of 90). */
export const TOWN_SITES = Object.freeze({
  saloon: Object.freeze({ x: SALOON_SITE.x, z: SALOON_SITE.z, yaw: 90 }),
  bank: Object.freeze({ x: BANK_SITE.x, z: BANK_SITE.z, yaw: 180 }),
  sheriff: Object.freeze({ x: SHERIFF_SITE.x, z: SHERIFF_SITE.z, yaw: 180 }),
  stable: Object.freeze({ x: STABLE_SITE.x, z: STABLE_SITE.z, yaw: 180 }),
  gunshop: Object.freeze({ x: GUNSHOP_SITE.x, z: GUNSHOP_SITE.z, yaw: -90 }),
});

/**
 * The SIX redesigned-town buildings — the user-approved scale-1.3 model round
 * (src/assets/TownExteriorAssetFactory.ts) placed at the 17-section layout's
 * sites. ONE def per building (composite collider boxes; CollisionWorld
 * scales + yaws them with the def transform). Sites:
 *   farmstead  — before town, inside the individually-fenced yard, faces the road
 *   butcher    — RIGHT (west) side entering the square, counter faces the plaza
 *   worker     — LEFT (east) side entering the square
 *   family     — far side of the square, west of the bank
 *   wealthy    — far side of the square, east of the sheriff
 *   abandoned  — far north-east outskirts, isolated
 * UUID block …030040+ sits far above the sequential town cursor (≤0x149).
 */
export const TOWN_EXTERIOR_SITES = Object.freeze([
  Object.freeze({ uuid: 'c0000000-0000-4000-8000-000000030040', type: 'butcher-stall', name: 'دکه قصابی', x: -12, z: -1.5, yaw: 90, scale: 1 }),
  Object.freeze({ uuid: 'c0000000-0000-4000-8000-000000030041', type: 'house-worker', name: 'خانه کارگری', x: 12, z: -2.5, yaw: -90, scale: 1.3 }),
  Object.freeze({ uuid: 'c0000000-0000-4000-8000-000000030042', type: 'house-family', name: 'خانه خانوادگی', x: -20.5, z: 13, yaw: 180, scale: 1.3 }),
  Object.freeze({ uuid: 'c0000000-0000-4000-8000-000000030043', type: 'house-wealthy', name: 'خانه پولداری', x: 21, z: 13.5, yaw: 180, scale: 1.3 }),
  Object.freeze({ uuid: 'c0000000-0000-4000-8000-000000030044', type: 'house-farmstead', name: 'خانه مزرعه‌ای', x: -12, z: -49.5, yaw: 90, scale: 1 }),
  Object.freeze({ uuid: 'c0000000-0000-4000-8000-000000030045', type: 'house-abandoned', name: 'خانه متروکه', x: 31, z: -50, yaw: 0, scale: 1.3 }),
]);

/** Player respawn: the farm road's north end — the progression starts at the
 *  farm and leads south into town (spec §2/§3). */
export const TOWN_RESPAWN = Object.freeze({ x: -1.5, y: 0, z: -57.5 });
/** Companion horse's first-boot meadow beside the farm road. */
export const TOWN_HORSE_SPAWN = Object.freeze({ x: -3.8, z: -53.5, yaw: 0.7 });

/* -------------------------------------------------------------------------- */
/* UUID block (v4 shape: version 4, variant 8 — first octet c0000000 is fresh) */
/* -------------------------------------------------------------------------- */

let townUuidCursor = 0;
function townUuid(): string {
  townUuidCursor += 1;
  return `c0000000-0000-4000-8000-${townUuidCursor.toString(16).padStart(12, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Def sink + helpers                                                         */
/* -------------------------------------------------------------------------- */

interface EmitOpts {
  collider: boolean;
  editable?: boolean;
  [key: string]: unknown;
}

const defs: ObjectDefinition[] = [];
function emit(
  assetType: string,
  name: string,
  position: Vec3,
  metadata: EmitOpts,
  rotation: Vec3 = { x: 0, y: 0, z: 0 },
  scale: Vec3 = { x: 1, y: 1, z: 1 },
): void {
  defs.push({
    uuid: townUuid(),
    assetType,
    transform: { position, rotation, scale },
    metadata: { name, editable: metadata.editable ?? true, ...metadata },
  });
}

/** Unit-box helper: scale IS the size (collider == visual). */
function box(
  assetType: string,
  name: string,
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number,
  metadata: EmitOpts,
  rotation: Vec3 = { x: 0, y: 0, z: 0 },
): void {
  emit(assetType, name, { x, y, z }, metadata, rotation, { x: sx, y: sy, z: sz });
}

/* -------------------------------------------------------------------------- */
/* Fence runs (individual sections — spec §4)                                 */
/* -------------------------------------------------------------------------- */

const FENCE_H = 1.12;
const FENCE_T = 0.2;

interface FenceRunOpts {
  from: [number, number];
  to: [number, number];
  /** gaps as [start, end] along the run axis (gate openings) */
  gaps?: Array<[number, number]>;
  style?: 'farm' | 'corral';
  name: string;
  /** nominal section length */
  section?: number;
}

/** Emit individually-movable fence sections along an axis-aligned run. */
function fenceRun(opts: FenceRunOpts): void {
  const { from, to, gaps = [], style = 'farm', name, section = 2.2 } = opts;
  const alongX = from[1] === to[1];
  const a = alongX ? from[0] : from[1];
  const b = alongX ? to[0] : to[1];
  const fixed = alongX ? from[1] : from[0];
  // covered intervals = [a, b] minus gaps
  const sorted = [...gaps].sort((p, q) => p[0] - q[0]);
  const intervals: Array<[number, number]> = [];
  let cursor = Math.min(a, b);
  const end = Math.max(a, b);
  for (const [g0, g1] of sorted) {
    if (g0 > cursor) intervals.push([cursor, Math.min(g0, end)]);
    cursor = Math.max(cursor, g1);
  }
  if (cursor < end) intervals.push([cursor, end]);
  let index = 0;
  for (const [i0, i1] of intervals) {
    const len = i1 - i0;
    if (len < 0.35) continue; // too short for a section — a natural gap
    const count = Math.max(1, Math.round(len / section));
    const secLen = len / count;
    for (let i = 0; i < count; i += 1) {
      const c = i0 + secLen * (i + 0.5);
      // weathered variety: every 7th section sags a little, every 11th breaks
      const broken = index % 11 === 10;
      const h = FENCE_H * (broken ? 0.86 : 1 - (index % 7) * 0.018);
      const roll = broken ? (index % 2 ? 3.2 : -2.6) : 0;
      const pos: Vec3 = alongX ? { x: c, y: 0, z: fixed } : { x: fixed, y: 0, z: c };
      const rot: Vec3 = { x: 0, y: alongX ? 0 : 90, z: roll };
      emit('town-fence', `${name} #${index + 1}`, pos, { collider: true, style: broken ? 'broken' : style }, rot, { x: secLen, y: h, z: FENCE_T });
      index += 1;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Street furniture helpers                                                   */
/* -------------------------------------------------------------------------- */

/** Lamp = collider post def + decor lantern head at the top. */
function lamp(x: number, z: number, name: string): void {
  box('town-lamp-post', `${name} — پایه`, x, 0, z, 0.45, 1.05, 0.45, { collider: true });
  emit('town-lamp-head', `${name} — سر چراغ`, { x, y: 1.05, z }, { collider: false });
}

function bench(x: number, z: number, yaw: number, name: string, s = 1): void {
  emit('town-bench', name, { x, y: 0, z }, { collider: true }, { x: 0, y: yaw, z: 0 }, { x: 1.08 * s, y: 0.85, z: 0.56 * s });
}

function barrel(x: number, z: number, name: string, s = 1, y = 0): void {
  box('town-barrel', name, x, y, z, 0.74 * s, 0.95 * s, 0.74 * s, { collider: y < 0.2 });
}

function crate(x: number, z: number, name: string, s = 0.85, y = 0): void {
  box('town-crate', name, x, y, z, s, s, s, { collider: y < 0.2 });
}

function hay(x: number, z: number, name: string, sx = 1.15, sz = 0.85): void {
  box('town-hay', name, x, 0, z, sx, 0.78, sz, { collider: true });
}

function rock(x: number, z: number, name: string, sx: number, sy: number, sz: number): void {
  box('town-rock', name, x, 0, z, sx, sy, sz, { collider: true });
}

function hitching(x: number, z: number, yaw: number, name: string): void {
  emit('town-hitching', name, { x, y: 0, z }, { collider: true }, { x: 0, y: yaw, z: 0 }, { x: 1.5, y: 1.0, z: 0.22 });
}

function trough(x: number, z: number, name: string, sx = 1.9): void {
  box('town-trough', name, x, 0, z, sx, 0.58, 0.9, { collider: true });
}

function tree(x: number, z: number, seed: number, s: number, name: string): void {
  emit('town-tree', name, { x, y: 0, z }, { collider: false, seed }, { x: 0, y: seed * 37, z: 0 }, { x: s, y: s, z: s });
}

function bush(x: number, z: number, seed: number, name: string, s = 1): void {
  emit('town-bush', name, { x, y: 0, z }, { collider: false, seed }, { x: 0, y: seed * 53, z: 0 }, { x: s, y: s, z: s });
}

function horse(x: number, z: number, yaw: number, name: string, tint = 'horse'): void {
  emit('town-horse', name, { x, y: 0, z }, { collider: false, tint }, { x: 0, y: yaw, z: 0 });
}

/* -------------------------------------------------------------------------- */
/* The six new buildings — shell specs                                        */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* THE TOWN                                                                   */
/* -------------------------------------------------------------------------- */

export function buildTownMapObjects(): ObjectDefinition[] {
  townUuidCursor = 0;
  defs.length = 0;

  /* -- ground + roads (visual, y-offsets ≥ 5 mm apart — no z-fighting) ----- */
  emit('town-ground', 'زمین شهر', { x: 0, y: 0, z: 0 }, { collider: false, editable: false, size: TOWN_GROUND_SIZE });

  const road = (name: string, x: number, z: number, w: number, d: number, y: number, tint: 'road' | 'plaza' | 'patch' = 'road'): void => {
    emit('town-road', name, { x, y, z }, { collider: false, editable: false, width: w, depth: d, tint });
  };
  // farm road (two overlapped strips — natural, un-straight edges)
  road('جاده مزرعه — بخش شمالی', -1.7, -47.5, 7, 27, 0.02);
  road('جاده مزرعه — بخش جنوبی', -1.1, -44.5, 6, 21, 0.045);
  // entrance widening
  road('ورودی شهر', 0, -35.2, 9.5, 6, 0.03);
  // main street
  road('خیابان اصلی', 0, -23.5, 8, 21, 0.025);
  road('خیابان اصلی — رد چرخ', -0.4, -23, 6.6, 19, 0.05);
  // central plaza (two overlapped slabs — organic edge)
  road('میدان مرکزی', 0, -2, 30, 22, 0.03, 'plaza');
  road('میدان مرکزی — مرکز', 0, -1, 24, 17.5, 0.055, 'plaza');
  // stable road + exit (the road passes THROUGH the bank/sheriff gap:
  // bank east edge −2, sheriff west edge 3.3 → the strip is 5.2 wide there)
  road('جاده اسطبل', 0.6, 21.5, 5.2, 25, 0.025);
  road('جاده اسطبل — رد چرخ', 0.6, 22, 4.0, 24, 0.05);
  road('جاده خروجی', 0, 46.5, 6, 27, 0.02);
  // short spurs to the far-side houses' doors
  road('مسیر خانه خانوادگی', -19.8, 9.6, 4.2, 3.6, 0.035);
  road('مسیر خانه پولداری', 21.6, 9.6, 4.2, 3.6, 0.035);
  // dirt patches (worn ground variety)
  road('لکه خاک ۱', -8, -18, 4.5, 3, 0.015, 'patch');
  road('لکه خاک ۲', 7, -12, 3.6, 2.6, 0.015, 'patch');
  road('لکه خاک ۳', -15, -30, 3.8, 2.8, 0.015, 'patch');
  road('لکه خاک ۴', 14, 4.5, 3.2, 2.4, 0.015, 'patch');
  road('لکه خاک ۵', -6, 16, 4, 3, 0.015, 'patch');
  road('لکه خاک ۶', 10, 27, 3.4, 2.6, 0.015, 'patch');
  road('لکه خاک ۷', -13, 35, 3.8, 2.8, 0.015, 'patch');

  /* -- FARM AREA (north, before town — spec §3) ---------------------------- */
  // yard fence: rectangle X [−21, −5.8] × Z [−57, −38.5], gates east + south
  fenceRun({ name: 'حصار مزرعه — شمال', from: [-21, -57], to: [-5.8, -57], style: 'farm' });
  fenceRun({ name: 'حصار مزرعه — جنوب', from: [-21, -38.5], to: [-5.8, -38.5], gaps: [[-16.4, -13.8]], style: 'farm' });
  fenceRun({ name: 'حصار مزرعه — غرب', from: [-21, -57], to: [-21, -38.5], style: 'farm' });
  fenceRun({ name: 'حصار مزرعه — شرق', from: [-5.8, -57], to: [-5.8, -38.5], gaps: [[-51.5, -48.9]], style: 'farm' });
  // livestock pen (south-east of the yard), gate on its west side
  fenceRun({ name: 'حصار آغل — شمال', from: [-12.5, -44], to: [-6.8, -44], style: 'farm' });
  fenceRun({ name: 'حصار آغل — جنوب', from: [-12.5, -39.5], to: [-6.8, -39.5], style: 'farm' });
  fenceRun({ name: 'حصار آغل — غرب', from: [-12.5, -44], to: [-12.5, -39.5], gaps: [[-42.6, -41.2]], style: 'farm' });
  fenceRun({ name: 'حصار آغل — شرق', from: [-6.8, -44], to: [-6.8, -39.5], style: 'farm' });
  trough(-10.6, -42.8, 'آبخوری آغل', 1.8);
  hay(-11.7, -40.3, 'علوفه آغل', 1.05, 0.8);
  horse(-10.9, -42.4, 24, 'اسب آغل ۱');
  horse(-8.4, -41.3, -38, 'اسب آغل ۲', 'hide');
  // crop field east of the road
  emit('town-crops', 'کشتزار', { x: 7.75, y: 0, z: -51.5 }, { collider: false, rows: 7, rowGap: 1.4, length: 10 });
  // pond south of the yard
  emit('town-pond', 'حوض آب مزرعه', { x: -18.5, y: 0, z: -35.2 }, { collider: false, rx: 2.6, rz: 1.8 });
  // windmill landmark
  emit('town-windmill', 'آسیاب بادی', { x: -24.5, y: 0, z: -55.5 }, { collider: false });
  tree(-24.8, -46.5, 3, 1.15, 'درخت مزرعه ۱');
  tree(-17.6, -57.6, 7, 0.95, 'درخت مزرعه ۲');
  tree(-25.6, -52.2, 5, 1.25, 'درخت مزرعه ۳');
  bush(-20.6, -38.1, 2, 'بوته مزرعه ۱', 1.1);
  bush(14.6, -55.6, 4, 'بوته مزرعه ۲');
  rock(-22.9, -42.6, 'سنگ مزرعه', 1.1, 0.7, 1.0);

  fenceRun({ name: 'حصار خرابه', from: [26.5, -44.6], to: [32, -44.6], style: 'farm' });
  bush(27.4, -54.2, 5, 'بوته خرابه ۱');
  bush(36.2, -51.2, 3, 'بوته خرابه ۲');
  bush(30.2, -44.9, 6, 'بوته خرابه ۳', 0.85);
  rock(28.2, -51.9, 'سنگ خرابه ۱', 1.3, 0.8, 1.2);
  rock(33.6, -47.8, 'سنگ خرابه ۲', 0.9, 0.6, 0.9);
  rock(29.9, -46.3, 'سنگ خرابه ۳', 0.7, 0.5, 0.7);

  /* -- TOWN ENTRANCE (Z ≈ −34 — spec §6) ----------------------------------- */
  lamp(-5.2, -33.0, 'چراغ ورودی غربی');
  lamp(5.0, -33.6, 'چراغ ورودی شرقی');
  bush(5.8, -34.6, 1, 'بوته ورودی ۱');
  bush(-6.3, -35.3, 3, 'بوته ورودی ۲');

  /* -- MAIN STREET (gun shop first — spec §7; saloon west) ------------------ */
  lamp(-4.9, -30.2, 'چراغ خیابان ۱');
  lamp(5.0, -22.3, 'چراغ خیابان ۲');
  lamp(-4.9, -15.8, 'چراغ خیابان ۳');
  hitching(-5.4, -19.3, 90, 'پایه مهار سالن');
  hitching(5.4, -24.3, 90, 'پایه مهار اسلحه‌فروشی');
  barrel(-6.1, -14.6, 'بشکه خیابان ۱');
  barrel(-6.55, -13.9, 'بشکه خیابان ۲', 0.9);
  crate(-6.6, -13.2, 'جعبه سالن', 0.8);
  crate(5.75, -27.4, 'جعبه اسلحه‌فروشی', 0.85);
  crate(5.75, -27.4, 'جعبه اسلحه‌فروشی — روی هم', 0.62, 0.85);
  barrel(6.1, -20.4, 'بشکه اسلحه‌فروشی');
  barrel(6.55, -19.6, 'بشکه اسلحه‌فروشی ۲', 0.92);
  // parked wagon (east shoulder, bed = collider)
  box('town-box', 'گاری — محفظه', 6.4, 0.76, -18.6, 1.9, 0.75, 3.4, { tint: 'plankA', collider: true });
  emit('town-wagon', 'گاری — چرخ‌ها', { x: 6.4, y: 0, z: -18.6 }, { collider: false });
  box('town-hay', 'بار گاری', 6.4, 1.52, -18.6, 1.0, 0.78, 0.75, { collider: false });
  woodpileHelper(-9.3, -27.1, 'هیزم سالن', 1.5, 0.8);

  /* -- CENTRAL SQUARE (spec §8) --------------------------------------------- */
  emitFountain(localSinkDirect(), 0, -2);
  bench(3.0, -2.1, 90, 'نیمکت میدان ۱');
  bench(-3.1, -1.7, -90, 'نیمکت میدان ۲', 0.94);
  bench(0.7, -5.6, 180, 'نیمکت میدان ۳', 1.05);
  bench(-0.6, 1.7, 0, 'نیمکت میدان ۴', 0.9);
  lamp(-13.8, -10.6, 'چراغ میدان ۱');
  lamp(13.9, -10.2, 'چراغ میدان ۲');
  lamp(-13.2, 6.8, 'چراغ میدان ۳');
  lamp(13.6, 6.2, 'چراغ میدان ۴');
  hitching(-2.4, -9.6, 0, 'پایه مهار میدان شمال');
  hitching(-7.9, 2.4, 0, 'پایه مهار قصابی');
  hitching(6.9, -7.8, 0, 'پایه مهار میدان شرقی');
  barrel(-8.1, -3.9, 'بشکه قصابی ۱');
  barrel(-8.7, -3.0, 'بشکه قصابی ۲', 0.94);
  barrel(-7.55, -3.25, 'بشکه قصابی ۳', 0.88);
  crate(8.9, -4.7, 'جعبه خانه کارگری', 0.8);
  crate(9.4, -5.25, 'جعبه خانه کارگری ۲', 0.68);
  barrel(8.75, 0.35, 'بشکه خانه کارگری');
  crate(-2.7, 8.0, 'جعبه میدان', 0.75);
  tree(-14.9, -12.5, 2, 1.0, 'درخت میدان ۱');
  tree(14.2, 8.7, 6, 0.9, 'درخت میدان ۲');
  bush(-5.8, 8.9, 4, 'بوته میدان ۱');
  bush(14.9, 9.6, 2, 'بوته میدان ۲');
  bush(-14.3, -13.6, 5, 'بوته میدان ۳', 0.9);
  bush(14.9, -13.2, 1, 'بوته میدان ۴');

  tree(28.3, 8.0, 4, 1.05, 'درخت باغ پولداری');
  bush(14.1, 6.2, 6, 'بوته باغ پولداری ۱', 1.1);
  bush(15.6, 18.2, 2, 'بوته باغ پولداری ۲');
  bush(-28.2, 8.8, 3, 'بوته باغ خانوادگی', 0.95);

  /* -- ROAD TO STABLE + CORRAL + EXIT (spec §11/§12) ------------------------ */
  lamp(4.3, 17.8, 'چراغ جاده اسطبل ۱');
  lamp(-4.4, 26.5, 'چراغ جاده اسطبل ۲');
  lamp(4.1, 46.8, 'چراغ خروجی');
  hitching(4.2, 22.2, 90, 'پایه مهار جاده اسطبل');
  trough(-4.6, 20.6, 'آبخوری جاده', 1.8);
  barrel(-3.95, 20.0, 'سطل آب جاده', 0.42);
  hay(4.3, 28.6, 'علوفه جلوی اسطبل', 1.15, 0.85);
  hay(3.5, 31.6, 'علوفه حیاط اسطبل', 1.0, 0.8);
  woodpileHelper(15.6, 28.3, 'هیزم اسطبل', 1.3, 0.75);
  // corral west of the road, opposite the stable
  fenceRun({ name: 'حصار آسبدان — شمال', from: [-16, 29], to: [-5.5, 29], style: 'corral' });
  fenceRun({ name: 'حصار آسبدان — جنوب', from: [-16, 41.5], to: [-5.5, 41.5], style: 'corral' });
  fenceRun({ name: 'حصار آسبدان — غرب', from: [-16, 29], to: [-16, 41.5], style: 'corral' });
  fenceRun({ name: 'حصار آسبدان — شرق', from: [-5.5, 29], to: [-5.5, 41.5], gaps: [[34, 36.6]], style: 'corral' });
  trough(-10.6, 33.6, 'آبخوری آسبدان', 2.0);
  hay(-14.3, 39.6, 'علوفه آسبدان ۱', 1.2, 0.85);
  hay(-13.1, 40.0, 'علوفه آسبدان ۲', 1.0, 0.8);
  barrel(-8.9, 32.8, 'سطل آسبدان', 0.42);
  horse(-13.6, 36.6, -42, 'اسب آسبدان ۱');
  horse(-8.1, 38.6, 18, 'اسب آسبدان ۲', 'hide');
  rock(-15.1, 30.6, 'سنگ آسبدان', 0.8, 0.5, 0.8);
  // exit framing fences
  fenceRun({ name: 'حصار خروجی — غرب', from: [-4.5, 44], to: [-4.5, 52.4], style: 'farm' });
  fenceRun({ name: 'حصار خروجی — شرق', from: [4.5, 44], to: [4.5, 48.6], style: 'farm' });
  emit('town-sign', 'تابلوی جاده خروجی', { x: -4.9, y: 0, z: 45.4 }, { collider: false, width: 1.2, height: 0.5, text: '' }, { x: 0, y: 24, z: 0 });
  bush(-4.9, 42.9, 7, 'بوته خروجی ۱');
  bush(17.3, 27.7, 3, 'بوته اسطبل ۱');
  bush(-17.9, 42.3, 5, 'بوته خروجی ۲');

  /* -- Outskirt vegetation + grass clusters (sparse — spec §1) -------------- */
  tree(-30.2, -28.4, 2, 1.3, 'درخت حاشیه ۱');
  tree(25.2, -33.2, 8, 1.05, 'درخت حاشیه ۲');
  tree(-27.6, 20.2, 5, 0.95, 'درخت حاشیه ۳');
  tree(30.6, 8.2, 9, 1.15, 'درخت حاشیه ۴');
  tree(-17.6, 25.6, 6, 1.2, 'درخت جاده اسطبل');
  bush(-33.1, -18.4, 1, 'بوته حاشیه ۱');
  bush(28.1, -25.2, 4, 'بوته حاشیه ۲');
  bush(24.4, 19.8, 6, 'بوته حاشیه ۳');
  rock(-26.4, -33.6, 'سنگ حاشیه ۱', 1.5, 0.9, 1.3);
  rock(22.6, -38.4, 'سنگ حاشیه ۲', 1.0, 0.65, 1.0);
  rock(-30.6, 14.4, 'سنگ حاشیه ۳', 1.2, 0.75, 1.1);
  rock(27.2, 20.6, 'سنگ حاشیه ۴', 0.85, 0.55, 0.85);
  emit('town-grass', 'خوشه علف مزرعه', { x: -8, y: 0, z: -35.5 }, { collider: false, count: 16, spread: 4, seed: 1 });
  emit('town-grass', 'خوشه علف خرابه‌ها', { x: 26, y: 0, z: -40 }, { collider: false, count: 14, spread: 4.5, seed: 2 });
  emit('town-grass', 'خوشه علف جنوب', { x: 17, y: 0, z: 22 }, { collider: false, count: 12, spread: 4, seed: 3 });
  emit('town-grass', 'خوشه علف غرب', { x: -28.5, y: 0, z: 4.5 }, { collider: false, count: 10, spread: 3.5, seed: 4 });

  return defs;
}

/* -- small local helpers ---------------------------------------------------- */

function woodpileHelper(x: number, z: number, name: string, sx: number, sz: number): void {
  box('town-woodpile', name, x, 0, z, sx, 1.05, sz, { collider: true });
}

/** Fountain sink that emits straight into the town def list (world space). */
function localSinkDirect(): import('./TownBuildings.js').TownDefSink {
  return (assetType, name, transform, metadata) => {
    defs.push({
      uuid: townUuid(),
      assetType,
      transform: {
        position: transform.position,
        rotation: transform.rotation,
        scale: transform.scale,
      },
      metadata: { name, editable: true, ...metadata },
    });
  };
}
