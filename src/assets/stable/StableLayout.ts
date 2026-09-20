/**
 * src/assets/stable/StableLayout.ts
 * -----------------------------------------------------------------------------
 * THE single placement source for the Livery Stable — the SAME list the
 * playable map registers and the tests assert against (mirrors BankLayout /
 * SheriffLayout).
 *
 * BUILDING FORM (a real working western livery, NOT props on a plane):
 *   side-gable timber stable, ridge running NORTH–SOUTH over the central
 *   aisle, board-and-batten siding, plank floor, shingle roof with exposed
 *   rafters, a hay loft over the north half, a hay door + hoist beam in the
 *   south gable and a projecting LIVERY STABLE sign.
 *
 * PLAN (building-local, origin = footprint center on the ground, +Z = south
 * entrance, same convention as every other building in the town):
 *
 *   z = −6.85 … −0.55   hay loft deck over the north half (deck top y = 3.0)
 *   z = −6.85 … −5.15   farrier bay + water trough along the north wall
 *   z = −6.85 …  2.9    six stalls: 3 west (Stall 01–03) + 3 east (04–06),
 *                       each 3.25 frontage × ~3.9 depth, fronts on the aisle
 *   x = −1.975 … 1.975  CENTRAL AISLE (~3.83 m clear between stall fronts)
 *   z =  2.9 …  6.85    corner rooms: TACK (west) + FEED (east), each with a
 *                       real hinged door opening OUT into the aisle
 *   z =  6.85 …  7.1    south wall: main wagon gate (2.2 × 3.05, double
 *                       leaves, E) + staff door (1.05 × 2.25, E) + 2 windows
 *   (the 2026 size revision grew the footprint 11.2×13.0 → 12.4×14.2 and the
 *   eave height 3.4 → 3.8 — the stable read small against the saloon/bank;
 *   every interior zone, prop, door and window shifted WITH its walls.)
 *
 * DOOR CONTRACT (all doors are managed objects that spawn CLOSED and are
 * E-opened; poses are pure functions of t — see StableDoors):
 *   • the main gate/staff/room/stall door defs carry scale (1,1,1) — their
 *     1×1 yaw-conservative collider boxes seal their openings when armed
 *     (the 2.2 m gate opening leaves 0.6 m side slits < the 0.7 m player
 *     circle, so a CLOSED gate always blocks and an OPEN gate never does —
 *     the exact mechanism the sheriff/bank doors use).
 *   • every leaf hangs on a DoorRoot hinge group at its TRUE hinge axis;
 *     sweep directions are chosen so no sweep ever hits a wall or prop:
 *     gate → outward (south), stalls → into the stall (north half of each
 *     stall stays clear), rooms → out into the aisle, staff → into the feed
 *     room (its NE-south strip stays clear).
 *
 * Junction discipline (same as the bank/sheriff): segments end AT faces —
 * back-to-back contacts, never overlapping; every purely decorative object
 * carries `collider: false` explicitly (collision comes ONLY from the
 * registered unit-box transforms).
 * -----------------------------------------------------------------------------
 */

import type { ObjectDefinition } from '../../core/types.js';

/** Building-local metric layout of the stable shell (meters, +Z = entrance). */
export const STABLE_LAYOUT = Object.freeze({
  /** Footprint: x ∈ [−w/2, w/2], z ∈ [−d/2, d/2] (d/2 = entrance side).
   *  Size revision: 11.2×13.0 read small against the saloon/bank block; the
   *  12.4×14.2 footprint + 3.8 eaves keep the aisle/stall metrics identical
   *  while every room, loft and bay gains breathing room. */
  width: 12.4,
  depth: 14.2,
  wallHeight: 3.8,
  wallThickness: 0.25,
  /** Plank floor slab: y ∈ [0, floorTop] (one 0.1 step up — climbable). */
  floorTop: 0.1,
  floorSlabThickness: 0.1,
  /** Interior clear half-spans (inner wall faces). */
  innerHalfX: 5.95,
  innerHalfZ: 6.85,
  /** Gable roof: ridge along z at x = 0 (slabs slope east/west). */
  roof: Object.freeze({
    ridgeY: 5.9,
    /** Slab underside at the wall line (sits on the wall plates). */
    wallSeatY: 3.85,
    overhangX: 0.5,
    overhangZ: 0.55,
    thickness: 0.09,
  }),
  /** Stall front planes (±); the aisle clear width is 2×(1.975−0.06) ≈ 3.83. */
  stallFrontX: 1.975,
  stall: Object.freeze({
    frontage: 3.25,
    /** Front assembly: wainscot + grill + cap rail. */
    wainscotH: 1.35,
    grillTopY: 2.55,
    frontThickness: 0.12,
    doorGapW: 1.0,
    doorH: 2.2,
    /** Door gap sits at the SOUTH end of each front: [zMax−1.2, zMax−0.2]. */
    doorGapSouth: 0.2,
    doorGapNorth: 1.2,
  }),
  /** The main wagon gate (2.2 m leaves-scale: the 1×1 collider seals it). */
  mainGate: Object.freeze({ xMin: -1.1, xMax: 1.1, height: 3.05 }),
  /** Staff door on the south facade (opens into the feed room). */
  staffDoor: Object.freeze({ xMin: 3.475, xMax: 4.525, height: 2.25 }),
  windows: Object.freeze([
    { wall: 'south', center: -3.6, sill: 1.55, width: 1.0, height: 1.3, bars: false, shutters: true },
    { wall: 'south', center: 2.75, sill: 1.7, width: 0.9, height: 1.1, bars: false, shutters: false },
    { wall: 'west', center: -5.225, sill: 1.9, width: 0.9, height: 1.15, bars: true, shutters: false },
    { wall: 'west', center: -1.975, sill: 1.9, width: 0.9, height: 1.15, bars: true, shutters: false },
    { wall: 'west', center: 1.275, sill: 1.9, width: 0.9, height: 1.15, bars: true, shutters: false },
    { wall: 'east', center: -5.225, sill: 1.9, width: 0.9, height: 1.15, bars: true, shutters: false },
    { wall: 'east', center: -1.975, sill: 1.9, width: 0.9, height: 1.15, bars: true, shutters: false },
    { wall: 'east', center: 1.275, sill: 1.9, width: 0.9, height: 1.15, bars: true, shutters: false },
    { wall: 'north', center: 0, sill: 1.5, width: 1.1, height: 1.2, bars: false, shutters: true },
  ] as const),
  /** Corner rooms (tack west / feed east). */
  rooms: Object.freeze({
    /** Divider wall center z (rooms span z ∈ [2.96, 6.85]). */
    dividerZ: 2.9,
    /** Room aisle walls at x = ±1.975 (t 0.12). */
    wallX: 1.975,
    thickness: 0.12,
    /** Room doorway in the aisle wall — doors swing OUT into the aisle. */
    doorGap: Object.freeze({ zMin: 5.6, zMax: 6.65, height: 2.2 }),
  }),
  /** Hay loft deck over the north half. */
  loft: Object.freeze({
    joistBottomY: 2.78,
    joistTopY: 2.93,
    deckTopY: 3.0,
    zMin: -6.85,
    zMax: -0.55,
    /** Railing gap along the south edge where the ladder lands. */
    ladderGapX: Object.freeze({ min: 1.0, max: 1.8 }),
    /** Ladder foot (on the aisle floor) — top rests ON the deck edge. */
    ladderX: 1.4,
    ladderFootZ: 0.55,
    ladderRun: 1.05,
  }),
  /** Farrier bay solids — the bench and anvil flank the bay against the
   *  stall fronts, the trough hugs the north wall; the wagon path
   *  (x ∈ [−0.6, 0.6]) stays clear end-to-end. (z −0.6 with the size
   *  revision — the bay keeps its 0.6 m strip south of the north wall.) */
  farrier: Object.freeze({
    anvil: Object.freeze({ x: 1.55, z: -5.9 }),
    bench: Object.freeze({ x: -1.615, z: -5.9 }),
    waterTrough: Object.freeze({ x: -1.1, z: -6.6 }),
  }),
});

/** World-space anchor of the stable (west side of the street, south of the
 *  saloon — the SW quadrant is empty ground). */
export const STABLE_SITE = Object.freeze({ x: 10.5, z: 36 });

/** Canonical hex UUID block for the stable (map uses 10000000-…-8000-…
 *  — variant-valid v4 nibble 8, unused by saloon a000 / bank b000). */
const STABLE_UUID_BASE = '10000000-0000-4000-8000-0000000000';

function stableUuid(suffix: string): string {
  return `${STABLE_UUID_BASE}${suffix}`;
}

/** Deterministic split-segment pools (windowed walls / stall fronts). */
export const STABLE_WALL_SEGMENT_UUIDS: readonly string[] = Object.freeze(
  Array.from({ length: 32 }, (_, i) => stableUuid((0x10 + i).toString(16).padStart(2, '0'))),
);
export const STABLE_FRONT_SEGMENT_UUIDS: readonly string[] = Object.freeze(
  Array.from({ length: 18 }, (_, i) => stableUuid((0x40 + i).toString(16).padStart(2, '0'))),
);

/** Object ids inside the stable block — tests key off these. */
export const STABLE_OBJECT_IDS = Object.freeze({
  building: stableUuid('01'),
  floor: stableUuid('02'),
  thresholdGate: stableUuid('03'),
  thresholdStaff: stableUuid('04'),
  wallSouthWest: stableUuid('05'),
  wallSouthEast: stableUuid('06'),
  wallSouthGateHeader: stableUuid('07'),
  wallSouthStaffHeader: stableUuid('08'),
  wallNorth: stableUuid('09'),
  wallWest: stableUuid('0a'),
  wallEast: stableUuid('0b'),
  divWest1: stableUuid('30'),
  divWest2: stableUuid('31'),
  divEast1: stableUuid('32'),
  divEast2: stableUuid('33'),
  barWest1: stableUuid('34'),
  barWest2: stableUuid('35'),
  barEast1: stableUuid('36'),
  barEast2: stableUuid('37'),
  roomDividerTack: stableUuid('38'),
  roomDividerFeed: stableUuid('39'),
  roomWallTackNorth: stableUuid('3a'),
  roomWallTackSouth: stableUuid('3b'),
  roomHeaderTack: stableUuid('3c'),
  roomWallFeedNorth: stableUuid('3d'),
  roomWallFeedSouth: stableUuid('3e'),
  roomHeaderFeed: stableUuid('3f'),
  gate: stableUuid('52'),
  stallDoor1: stableUuid('53'),
  stallDoor2: stableUuid('54'),
  stallDoor3: stableUuid('55'),
  stallDoor4: stableUuid('56'),
  stallDoor5: stableUuid('57'),
  stallDoor6: stableUuid('58'),
  tackDoor: stableUuid('59'),
  feedDoor: stableUuid('5a'),
  staffDoor: stableUuid('5b'),
  trough1: stableUuid('5c'),
  trough2: stableUuid('5d'),
  trough3: stableUuid('5e'),
  trough4: stableUuid('5f'),
  trough5: stableUuid('60'),
  trough6: stableUuid('61'),
  waterTrough: stableUuid('62'),
  workbench: stableUuid('63'),
  anvil: stableUuid('64'),
  tackContents: stableUuid('65'),
  feedContents: stableUuid('66'),
  farrierContents: stableUuid('67'),
  waterContents: stableUuid('68'),
  loftContents: stableUuid('69'),
  stallContents1: stableUuid('6a'),
  stallContents2: stableUuid('6b'),
  stallContents3: stableUuid('6c'),
  stallContents4: stableUuid('6d'),
  stallContents5: stableUuid('6e'),
  stallContents6: stableUuid('6f'),
  liverySign: stableUuid('70'),
  horsesSign: stableUuid('71'),
  ladder: stableUuid('72'),
  window1: stableUuid('73'),
  window2: stableUuid('74'),
  window3: stableUuid('75'),
  window4: stableUuid('76'),
  window5: stableUuid('77'),
  window6: stableUuid('78'),
  window7: stableUuid('79'),
  window8: stableUuid('7a'),
  window9: stableUuid('7b'),
  lanternGate: stableUuid('7c'),
  lanternAisle: stableUuid('7d'),
  lanternFarrier: stableUuid('7e'),
  lanternTack: stableUuid('7f'),
  lanternAisleMidW: stableUuid('80'),
  lanternAisleMidE: stableUuid('81'),
});

/* -------------------------------------------------------------------------- */
/* Zone prop catalog — every tack/feed/farrier/water/loft prop is its OWN     */
/* managed object (logical entities: a saddle, a bale, a crate, a sign…),     */
/* per the object-editing contract. Micro-parts with no independent use stay  */
/* united with their host (tins ride the shelf, shoes ride their rack, the    */
/* scoop rides the grain bin, the dipper rides the water barrel).             */
/* -------------------------------------------------------------------------- */

export type StablePropKind =
  | 'saddle-rack' | 'saddle' | 'bridle' | 'collar' | 'strap'
  | 'tack-board' | 'tack-shelf' | 'blanket-bar' | 'blanket' | 'shoe-rack'
  | 'crate' | 'tool-box' | 'sign' | 'hay-bale' | 'grain-sack' | 'grain-bin'
  | 'bucket' | 'straw' | 'small-barrel' | 'hay-pile' | 'hammer' | 'tongs'
  | 'horseshoe' | 'nail-tin' | 'scraps-box';

export interface StablePropSpec {
  uuid: string;
  kind: StablePropKind;
  name: string;
  /** Building-local position (the def adds the site origin). */
  x: number;
  y: number;
  z: number;
  /** Degrees. */
  rx?: number;
  ry?: number;
  rz?: number;
  params?: Record<string, unknown>;
}

/** Radians (the builder-authoring unit) → degrees (the transform unit). */
const deg = (rad: number): number => (rad * 180) / Math.PI;

let propCursor = 0x82;
const propUuid = (): string => stableUuid((propCursor++).toString(16).padStart(2, '0'));

// Slot 0x8b belonged to the deleted tack-room rope coil («طناب پیچیده»). It
// is RETIRED here — consumed but unused — so the table below keeps every
// historical uuid: saved-scene anchors can never drift after a deletion.
void propUuid();

/** THE zone-prop placement table (single source, consumed by the map). */
export const STABLE_PROPS: readonly StablePropSpec[] = Object.freeze([
  // --- TACK ROOM (SW corner; x −0.6 / z −0.6 + south-wall huggers +0.6 with
  //  the 2026 size revision — every prop keeps its exact wall clearance) ---
  { uuid: propUuid(), kind: 'saddle-rack', name: 'پایه زین ۱', x: -5.62, y: 0.1, z: 4.35 },
  // saddle origin = the RACK TOP surface (0.1 + 0.845): the old 0.845 put the
  // blanket's top face exactly flush with the rack-top plane (coplanar
  // co-facing pair, z-fight scan round).
  { uuid: propUuid(), kind: 'saddle', name: 'زین ۱', x: -5.62, y: 0.945, z: 4.35, ry: deg(0.08) },
  { uuid: propUuid(), kind: 'saddle-rack', name: 'پایه زین ۲', x: -5.62, y: 0.1, z: 5.55 },
  { uuid: propUuid(), kind: 'saddle', name: 'زین ۲', x: -5.62, y: 0.945, z: 5.55, ry: deg(-0.12) },
  { uuid: propUuid(), kind: 'tack-board', name: 'تخته یراق', x: -4.2, y: 1.82, z: 2.978 },
  { uuid: propUuid(), kind: 'bridle', name: 'دهنه ۱', x: -4.75, y: 2.22, z: 3.005 },
  { uuid: propUuid(), kind: 'bridle', name: 'دهنه ۲', x: -4.35, y: 2.22, z: 3.005, rz: deg(0.08) },
  { uuid: propUuid(), kind: 'collar', name: 'یلغه', x: -3.85, y: 1.9, z: 3.01 },
  { uuid: propUuid(), kind: 'strap', name: 'تسمه چرمی', x: -3.45, y: 1.95, z: 3.005, params: { len: 0.42 } },
  { uuid: propUuid(), kind: 'tack-shelf', name: 'قفسه قوطی', x: -3.1, y: 1.6, z: 3.03 },
  { uuid: propUuid(), kind: 'blanket-bar', name: 'میله پتو', x: -5.92, y: 1.65, z: 5.8 },
  // blanket origin = the BAR TOP (1.65 + 0.025): the over-fold contacts the
  // bar top plane (hidden interface) instead of being sunk flush with it
  // (z-fight scan fix); wallT = the 0.05 bar so the drops hug it; ry 0 —
  // the new builder's local thickness axis is X (the bar runs along Z).
  { uuid: propUuid(), kind: 'blanket', name: 'پتو آویزان', x: -5.88, y: 1.675, z: 5.8, ry: 0, params: { color: 0x7a4a3a, wallT: 0.05 } },
  { uuid: propUuid(), kind: 'blanket', name: 'پتو تاشده', x: -4.85, y: 0.6, z: 5.0, ry: deg(0.16), params: { color: 0x5d5a4a, folded: true } },
  { uuid: propUuid(), kind: 'shoe-rack', name: 'پایه نعل (اتاق یراق)', x: -4.35, y: 1.95, z: 6.833, params: { side: 'south' } },
  { uuid: propUuid(), kind: 'crate', name: 'جعبه چوبی یراق', x: -4.85, y: 0.1, z: 5.0, ry: deg(0.16), params: { w: 0.45, h: 0.5 } },
  { uuid: propUuid(), kind: 'tool-box', name: 'جعبه ابزار', x: -3.55, y: 0.1, z: 6.45, ry: deg(-0.4) },
  // sign y 2.685 (was 2.7): the board's top face used to land exactly on the
  // stone trim band's top behind it (coplanar co-facing pair, scan round).
  { uuid: propUuid(), kind: 'sign', name: 'تابلوی TACK', x: -1.895, y: 2.685, z: 6.125, ry: 90, params: { text: 'TACK', w: 0.62, h: 0.26 } },
  { uuid: propUuid(), kind: 'sign', name: 'تابلوی RATES', x: -1.895, y: 1.85, z: 4.25, ry: 90, params: { text: 'RATES', w: 0.72, h: 0.5, sub: 'LIVERY 50c - SHOE 25c', dark: true } },
  // --- FEED ROOM (SE corner; x +0.6 with the east wall, signs follow doors) ---
  { uuid: propUuid(), kind: 'hay-bale', name: 'باله علوفه ۱', x: 4.6, y: 0.1, z: 3.87 },
  { uuid: propUuid(), kind: 'hay-bale', name: 'باله علوفه ۲', x: 5.5, y: 0.1, z: 3.87, ry: deg(0.03) },
  { uuid: propUuid(), kind: 'hay-bale', name: 'باله علوفه ۳ (رویی)', x: 5.05, y: 0.6, z: 3.87, ry: deg(Math.PI / 2 + 0.05) },
  { uuid: propUuid(), kind: 'grain-sack', name: 'کیسه غله ۱', x: 2.6, y: 0.1, z: 3.95, ry: deg(0.1), params: { seed: 1 } },
  { uuid: propUuid(), kind: 'grain-sack', name: 'کیسه غله ۲', x: 2.6, y: 0.1, z: 4.55, ry: deg(-0.15), params: { seed: 2 } },
  { uuid: propUuid(), kind: 'grain-sack', name: 'کیسه غله ۳', x: 2.6, y: 0.48, z: 4.25, ry: deg(0.35), params: { seed: 3 } },
  { uuid: propUuid(), kind: 'grain-sack', name: 'کیسه غله ایستاده', x: 3.3, y: 0.1, z: 4.5, params: { standing: true, seed: 4 } },
  { uuid: propUuid(), kind: 'grain-bin', name: 'صندوق غله', x: 5.55, y: 0.1, z: 4.9 },
  { uuid: propUuid(), kind: 'bucket', name: 'سطل فلزی', x: 5.65, y: 0.1, z: 5.9, params: { kind: 'metal', full: false } },
  { uuid: propUuid(), kind: 'bucket', name: 'سطل چوبی رویی', x: 5.65, y: 0.33, z: 5.9, ry: deg(0.5), params: { kind: 'wood', full: false } },
  { uuid: propUuid(), kind: 'crate', name: 'جعبه چوبی علوفه', x: 5.4, y: 0.1, z: 5.35, ry: deg(-0.22), params: { w: 0.5, h: 0.55 } },
  { uuid: propUuid(), kind: 'straw', name: 'پخش کاه (علوفه)', x: 3.4, y: 0.102, z: 5.3, params: { w: 2.2, d: 1.6, seed: 9 } },
  { uuid: propUuid(), kind: 'sign', name: 'تابلوی FEED', x: 1.895, y: 2.7, z: 6.125, ry: 90, params: { text: 'FEED', w: 0.62, h: 0.26 } },
  // --- FARRIER BAY (north end; z −0.6 with the north wall) ---
  { uuid: propUuid(), kind: 'hammer', name: 'چکش نعلبندی', x: -1.72, y: 1.0, z: -6.45, ry: deg(0.4) },
  { uuid: propUuid(), kind: 'tongs', name: 'انبر نعلبندی', x: -1.52, y: 1.0, z: -6.22, ry: deg(-0.3) },
  { uuid: propUuid(), kind: 'horseshoe', name: 'نعل روی میز ۱', x: -1.68, y: 1.015, z: -5.72, rx: 90, rz: deg(-0.3) },
  { uuid: propUuid(), kind: 'horseshoe', name: 'نعل روی میز ۲', x: -1.5, y: 1.015, z: -5.8, rx: 90, rz: deg(0.5) },
  { uuid: propUuid(), kind: 'nail-tin', name: 'قوطی میخ', x: -1.78, y: 1.05, z: -5.55 },
  { uuid: propUuid(), kind: 'sign', name: 'تابلوی FARRIER', x: -1.913, y: 2.42, z: -5.9, ry: 90, params: { text: 'FARRIER', w: 0.9, h: 0.32 } },
  { uuid: propUuid(), kind: 'shoe-rack', name: 'پایه نعل (نعلبندی)', x: -0.2, y: 2.0, z: -6.833, params: { side: 'north' } },
  { uuid: propUuid(), kind: 'scraps-box', name: 'جعبه قراضه آهن', x: -1.62, y: 0.21, z: -5.38 },
  { uuid: propUuid(), kind: 'bucket', name: 'سطل آبکیری', x: 1.32, y: 0.1, z: -5.32, params: { kind: 'metal', full: true } },
  { uuid: propUuid(), kind: 'horseshoe', name: 'نعل افتاده', x: 0.92, y: 0.114, z: -5.15, rx: 90, rz: deg(1.1) },
  { uuid: propUuid(), kind: 'straw', name: 'پخش کاه (نعلبندی)', x: 0.5, y: 0.102, z: -5.0, params: { w: 1.0, d: 0.8, seed: 4 } },
  // --- WATER STATION ---
  { uuid: propUuid(), kind: 'small-barrel', name: 'بشکه آب', x: 1.45, y: 0.1, z: 4.35, params: { r: 0.3, h: 0.9 } },
  { uuid: propUuid(), kind: 'bucket', name: 'سطل آب فلزی', x: 0.92, y: 0.1, z: 5.18, ry: deg(0.6), params: { kind: 'metal', full: true } },
  { uuid: propUuid(), kind: 'bucket', name: 'سطل آب چوبی', x: 1.05, y: 0.1, z: 4.75, ry: deg(-0.4), params: { kind: 'wood', full: true } },
  // --- HAY LOFT (deck top 3.0; north-wall huggers z −0.6 with the size
  //  revision, mid-deck props keep their aisle-relative spots) ---
  { uuid: propUuid(), kind: 'hay-bale', name: 'باله شیروانی ۱', x: -3.7, y: 3.0, z: -6.15 },
  { uuid: propUuid(), kind: 'hay-bale', name: 'باله شیروانی ۲', x: -2.78, y: 3.0, z: -6.15, ry: deg(0.04) },
  { uuid: propUuid(), kind: 'hay-bale', name: 'باله شیروانی ۳ (رویی)', x: -3.24, y: 3.5, z: -6.15, ry: deg(Math.PI / 2 - 0.06) },
  { uuid: propUuid(), kind: 'hay-bale', name: 'باله شیروانی ۴', x: 3.1, y: 3.0, z: -4.7, ry: deg(-0.08) },
  { uuid: propUuid(), kind: 'hay-bale', name: 'باله شیروانی ۵', x: 3.99, y: 3.0, z: -4.72 },
  { uuid: propUuid(), kind: 'crate', name: 'جعبه شیروانی', x: -4.5, y: 3.0, z: -3.3, ry: deg(0.3), params: { w: 0.55, h: 0.6 } },
  { uuid: propUuid(), kind: 'hay-pile', name: 'توده علوفه', x: 0.9, y: 3.0, z: -6.4, params: { radius: 0.5, height: 0.32, seed: 5 } },
  { uuid: propUuid(), kind: 'straw', name: 'پخش کاه (شیروانی)', x: 1.4, y: 3.002, z: -3.6, params: { w: 2.4, d: 2.0, seed: 7 } },
  // ROPE COILS — ALL deleted on user request. The hanging loft coil
  // («طناب آویز») went first (it floated mid-aisle in their save); the user
  // then reported the ring problem STILL unsolved and ordered «کلا انرا پاک
  // کن» — delete them COMPLETELY. So the wall-mounted tack-room coil
  // («طناب پیچیده») AND the per-stall `rope` extras (stalls 01/04, whose
  // tori hung beside the stall doors and stayed behind when the doors
  // swung — they read as stray door rings) are gone too. NO rope-coil
  // geometry may exist anywhere in the world; the census test locks zero.
] as const);

/* -------------------------------------------------------------------------- */
/* Stall specifications — layout + controlled variation, ONE source           */
/* -------------------------------------------------------------------------- */

export interface StableStallSpec {
  /** 1…6 (west 01–03, east 04–06). */
  index: number;
  /** −1 = west row, +1 = east row. */
  side: -1 | 1;
  /** Frontage span (building-local z). */
  zMin: number;
  zMax: number;
  /** Content-group def x (stall interior center). */
  defX: number;
  /** Door gap center z. */
  doorGapCenter: number;
  /** Feed trough center z (north end, clear of the door sweep). */
  troughZ: number;
  /** Hay fill level in the trough (0–1). */
  troughHay: number;
  bucket: { kind: 'wood' | 'metal'; full: boolean } | null;
  rack: 'full' | 'half' | null;
  pile: boolean;
  floor: 'dirt' | 'worn' | 'straw';
  tool: 'pitchfork' | 'shovel' | null;
  extra: 'rope' | 'blanket' | 'brush' | 'bridle' | null;
}

const stallZRows: ReadonlyArray<readonly [number, number]> = [
  [-6.85, -3.6],
  [-3.6, -0.35],
  [-0.35, 2.9],
];

const stallVariation: ReadonlyArray<Omit<StableStallSpec, 'index' | 'side' | 'zMin' | 'zMax' | 'defX' | 'doorGapCenter' | 'troughZ'>> = [
  { troughHay: 0.8, bucket: { kind: 'wood', full: true }, rack: 'full', pile: false, floor: 'dirt', tool: 'pitchfork', extra: null },
  { troughHay: 0.5, bucket: { kind: 'wood', full: true }, rack: 'half', pile: false, floor: 'worn', tool: null, extra: 'blanket' },
  { troughHay: 0.25, bucket: { kind: 'metal', full: true }, rack: null, pile: true, floor: 'straw', tool: null, extra: 'brush' },
  { troughHay: 0.7, bucket: { kind: 'wood', full: true }, rack: 'full', pile: true, floor: 'dirt', tool: null, extra: null },
  { troughHay: 0.4, bucket: { kind: 'metal', full: true }, rack: 'half', pile: false, floor: 'worn', tool: null, extra: 'bridle' },
  { troughHay: 0.15, bucket: null, rack: null, pile: true, floor: 'straw', tool: 'shovel', extra: null },
];

/** The six stalls, west 01–03 then east 04–06 (north → south). */
export const STABLE_STALLS: readonly StableStallSpec[] = Object.freeze(
  (() => {
    const out: StableStallSpec[] = [];
    let index = 1;
    for (const side of [-1, 1] as const) {
      for (const [zMin, zMax] of stallZRows) {
        const gapSouth = zMax - STABLE_LAYOUT.stall.doorGapSouth;
        const gapNorth = zMax - STABLE_LAYOUT.stall.doorGapNorth;
        out.push({
          index,
          side,
          zMin,
          zMax,
          defX: side * ((STABLE_LAYOUT.innerHalfX + STABLE_LAYOUT.stallFrontX + STABLE_LAYOUT.stall.frontThickness / 2) / 2),
          doorGapCenter: (gapNorth + gapSouth) / 2,
          troughZ: zMin + 0.625,
          ...stallVariation[index - 1],
        });
        index += 1;
      }
    }
    return out;
  })(),
);

/* -------------------------------------------------------------------------- */
/* Door specifications — positions, orientations, swings                      */
/* -------------------------------------------------------------------------- */

export interface StableDoorSpec {
  uuid: string;
  /** Managed assetType. */
  kind: 'stable-gate' | 'stable-stall-door' | 'stable-room-door' | 'stable-staff-door';
  /** Def position (building-local) + yaw. */
  x: number;
  y: number;
  z: number;
  rotY: 0 | 90 | 180 | -90;
  /** Leaf build parameters (read by buildStableLeafDoor / gate). */
  width: number;
  height: number;
  style: 'gate' | 'stall' | 'room' | 'staff';
  hinge: 'left' | 'right';
  openSign: 1 | -1;
  /** Open angle in radians. */
  openDeg: number;
  /** Interaction labels. */
  labelOpen: string;
  labelClose: string;
  /** Interaction reach. */
  range: number;
  /** Which stall (1–6) — stall doors only. */
  stall?: number;
}

const D = Math.PI / 180;

/** Every openable door on the stable — the layout table the map + tests read. */
export const STABLE_DOOR_SPECS: readonly StableDoorSpec[] = Object.freeze([
  {
    uuid: STABLE_OBJECT_IDS.gate,
    kind: 'stable-gate',
    x: 0, y: STABLE_LAYOUT.floorTop, z: STABLE_LAYOUT.depth / 2 - STABLE_LAYOUT.wallThickness / 2,
    rotY: 0,
    width: STABLE_LAYOUT.mainGate.xMax - STABLE_LAYOUT.mainGate.xMin,
    height: STABLE_LAYOUT.mainGate.height,
    style: 'gate', hinge: 'left', openSign: 1,
    openDeg: 105 * D,
    labelOpen: 'Open the stable gate', labelClose: 'Close the stable gate',
    range: 2.6,
  },
  ...STABLE_STALLS.map<StableDoorSpec>((s) => ({
    uuid: [
      STABLE_OBJECT_IDS.stallDoor1, STABLE_OBJECT_IDS.stallDoor2, STABLE_OBJECT_IDS.stallDoor3,
      STABLE_OBJECT_IDS.stallDoor4, STABLE_OBJECT_IDS.stallDoor5, STABLE_OBJECT_IDS.stallDoor6,
    ][s.index - 1],
    kind: 'stable-stall-door',
    x: s.side * STABLE_LAYOUT.stallFrontX,
    y: STABLE_LAYOUT.floorTop,
    z: s.doorGapCenter,
    // West fronts (side −1) face +x → rotY 90; east fronts face −x → rotY −90.
    rotY: s.side === -1 ? 90 : -90,
    width: STABLE_LAYOUT.stall.doorGapW,
    height: STABLE_LAYOUT.stall.doorH,
    style: 'stall',
    hinge: 'left',
    openSign: 1,
    // 92° — the leaf reads fully open yet its tip (with hinge/face
    // thickness) stays 12 cm clear of the partition beside the hinge.
    openDeg: 92 * D,
    labelOpen: `Open stall ${['one', 'two', 'three', 'four', 'five', 'six'][s.index - 1]}`,
    labelClose: `Close stall ${['one', 'two', 'three', 'four', 'five', 'six'][s.index - 1]}`,
    range: 2.0,
    stall: s.index,
  })),
  {
    uuid: STABLE_OBJECT_IDS.tackDoor,
    kind: 'stable-room-door',
    x: -STABLE_LAYOUT.rooms.wallX, y: STABLE_LAYOUT.floorTop,
    z: (STABLE_LAYOUT.rooms.doorGap.zMin + STABLE_LAYOUT.rooms.doorGap.zMax) / 2,
    rotY: 90,
    width: STABLE_LAYOUT.rooms.doorGap.zMax - STABLE_LAYOUT.rooms.doorGap.zMin,
    height: STABLE_LAYOUT.rooms.doorGap.height,
    style: 'room', hinge: 'right', openSign: 1,
    openDeg: 100 * D,
    labelOpen: 'Open the tack room', labelClose: 'Close the tack room',
    range: 2.0,
  },
  {
    uuid: STABLE_OBJECT_IDS.feedDoor,
    kind: 'stable-room-door',
    x: STABLE_LAYOUT.rooms.wallX, y: STABLE_LAYOUT.floorTop,
    z: (STABLE_LAYOUT.rooms.doorGap.zMin + STABLE_LAYOUT.rooms.doorGap.zMax) / 2,
    rotY: -90,
    width: STABLE_LAYOUT.rooms.doorGap.zMax - STABLE_LAYOUT.rooms.doorGap.zMin,
    height: STABLE_LAYOUT.rooms.doorGap.height,
    style: 'room', hinge: 'right', openSign: 1,
    openDeg: 100 * D,
    labelOpen: 'Open the feed room', labelClose: 'Close the feed room',
    range: 2.0,
  },
  {
    uuid: STABLE_OBJECT_IDS.staffDoor,
    kind: 'stable-staff-door',
    x: (STABLE_LAYOUT.staffDoor.xMin + STABLE_LAYOUT.staffDoor.xMax) / 2,
    y: STABLE_LAYOUT.floorTop,
    z: STABLE_LAYOUT.depth / 2 - STABLE_LAYOUT.wallThickness / 2,
    rotY: 180,
    width: STABLE_LAYOUT.staffDoor.xMax - STABLE_LAYOUT.staffDoor.xMin,
    height: STABLE_LAYOUT.staffDoor.height,
    style: 'staff', hinge: 'left', openSign: -1,
    openDeg: 95 * D,
    labelOpen: 'Open the staff door', labelClose: 'Close the staff door',
    range: 2.0,
  },
]);

/* -------------------------------------------------------------------------- */
/* Map-object emission                                                        */
/* -------------------------------------------------------------------------- */

const identity = () => ({ x: 0, y: 0, z: 0 });

/**
 * Every managed object the stable adds to the playable map, anchored at
 * (originX, originZ) = footprint CENTER. Interior props sit on the plank
 * floor (top at STABLE_LAYOUT.floorTop).
 *
 * Collider policy (CollisionWorld reads ONLY these metadata flags):
 *   - floor, thresholds, walls, partitions, bar walls, room walls,
 *     stall-front segments → collider: true (scale IS the AABB)
 *   - all 10 doors → true at spawn (released while open by the map's updater)
 *   - troughs / workbench / anvil / water trough → true (real obstacles)
 *   - shell kit + every content group + nameplates/props → false
 */
export function buildStableMapObjects(originX: number, originZ: number): ObjectDefinition[] {
  const L = STABLE_LAYOUT;
  const floorY = L.floorTop;
  const t = L.wallThickness;

  const defs: ObjectDefinition[] = [];
  let wallCursor = 0;
  let frontCursor = 0;
  const push = (
    uuid: string,
    assetType: string,
    name: string,
    transform: ObjectDefinition['transform'],
    metadata: Record<string, unknown>,
  ): void => {
    defs.push({ uuid, assetType, transform, metadata: { name, editable: true, ...metadata } });
  };
  const box = (
    uuid: string, assetType: string, name: string,
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
    metadata: Record<string, unknown> = {},
    ry = 0,
  ): void => push(uuid, assetType, name,
    { position: { x: originX + x, y, z: originZ + z }, rotation: { x: 0, y: ry, z: 0 }, scale: { x: sx, y: sy, z: sz } },
    { collider: true, ...metadata });

  const wallBox = (
    uuid: string | null, name: string,
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
    material = 'siding',
  ): void => {
    const id = uuid ?? STABLE_WALL_SEGMENT_UUIDS[wallCursor++];
    box(id, 'stable-wall', name, x, y, z, sx, sy, sz, { material });
  };

  /* --- Floor + thresholds ------------------------------------------------- */
  // Slab seat: y ∈ [0.005, 0.095] — never coplanar with the wall bottoms (0)
  // nor with the interiors standing at floorTop (0.1) — the sheriff pattern.
  box(STABLE_OBJECT_IDS.floor, 'stable-floor', 'اسطبل — کف چوبی',
    0, L.floorSlabThickness / 2, 0,
    L.width - t - 0.05, L.floorSlabThickness - 0.01, L.depth - t - 0.05,
    { plankRepeat: [10, 12] });
  // Thresholds carry the floor across the wall band under both south doors.
  box(STABLE_OBJECT_IDS.thresholdGate, 'stable-floor', 'اسطبل — آستانه دروازه',
    0, L.floorSlabThickness / 2 - 0.01, L.depth / 2 - t / 2,
    L.mainGate.xMax - L.mainGate.xMin, L.floorSlabThickness, t);
  box(STABLE_OBJECT_IDS.thresholdStaff, 'stable-floor', 'اسطبل — آستانه در کارکنان',
    (L.staffDoor.xMin + L.staffDoor.xMax) / 2, L.floorSlabThickness / 2 - 0.01, L.depth / 2 - t / 2,
    L.staffDoor.xMax - L.staffDoor.xMin, L.floorSlabThickness, t);

  /* --- Walls (unit boxes; windows are REAL openings — segments tile them) -- */
  const wz = L.depth / 2 - t / 2; // south/north wall center z
  const wx = L.width / 2 - t / 2; // west/east wall center x
  const H = L.wallHeight;

  // SOUTH wall — gate + staff door + 2 windows, emitted manually.
  // West of the gate: segments around the west window (hole z −4.1…−3.1).
  wallBox(STABLE_OBJECT_IDS.wallSouthWest, 'اسطبل — نمای جنوبی (غرب دروازه)',
    (-L.width / 2 - 4.1) / 2, H / 2, wz,
    -4.1 + L.width / 2, H, t);
  wallBox(null, 'اسطبل — نمای جنوبی (زیر پنجره غ)',
    -3.6, (floorY + 1.55) / 2, wz, 1.0, 1.55 - floorY, t);
  wallBox(null, 'اسطبل — نمای جنوبی (بالای پنجره غ)',
    -3.6, (2.85 + H) / 2, wz, 1.0, H - 2.85, t);
  wallBox(null, 'اسطبل — نمای جنوبی (بخش ۲)',
    (-3.1 + L.mainGate.xMin) / 2, H / 2, wz, -1.1 + 3.1, H, t);
  // Gate header.
  box(STABLE_OBJECT_IDS.wallSouthGateHeader, 'stable-wall', 'اسطبل — بالای دروازه',
    0, (L.mainGate.height + floorY + H) / 2, wz,
    L.mainGate.xMax - L.mainGate.xMin, H - L.mainGate.height - floorY, t);
  // East of the gate: window + staff door + segments.
  wallBox(STABLE_OBJECT_IDS.wallSouthEast, 'اسطبل — نمای جنوبی (شرق دروازه)',
    (L.mainGate.xMax + 2.3) / 2, H / 2, wz, 2.3 - L.mainGate.xMax, H, t);
  wallBox(null, 'اسطبل — نمای جنوبی (زیر پنجره خ)',
    2.75, (floorY + 1.7) / 2, wz, 0.9, 1.7 - floorY, t);
  wallBox(null, 'اسطبل — نمای جنوبی (بالای پنجره خ)',
    2.75, (2.8 + H) / 2, wz, 0.9, H - 2.8, t);
  wallBox(null, 'اسطبل — نمای جنوبی (بخش ۳)',
    (3.2 + L.staffDoor.xMin) / 2, H / 2, wz, L.staffDoor.xMin - 3.2, H, t);
  wallBox(STABLE_OBJECT_IDS.wallSouthStaffHeader, 'اسطبل — بالای در کارکنان',
    (L.staffDoor.xMin + L.staffDoor.xMax) / 2, (floorY + L.staffDoor.height + H) / 2, wz,
    L.staffDoor.xMax - L.staffDoor.xMin, H - floorY - L.staffDoor.height, t);
  wallBox(null, 'اسطبل — نمای جنوبی (بخش ۴)',
    (L.staffDoor.xMax + L.width / 2) / 2, H / 2, wz, L.width / 2 - L.staffDoor.xMax, H, t);

  // NORTH wall — one window (into the farrier bay).
  wallBox(STABLE_OBJECT_IDS.wallNorth, 'اسطبل — دیوار شمالی',
    (-L.width / 2 - 0.55) / 2, H / 2, -wz, -0.55 + L.width / 2, H, t);
  wallBox(null, 'اسطبل — دیوار شمالی (زیر پنجره)',
    0, (floorY + 1.5) / 2, -wz, 1.1, 1.5 - floorY, t);
  wallBox(null, 'اسطبل — دیوار شمالی (بالای پنجره)',
    0, (2.7 + H) / 2, -wz, 1.1, H - 2.7, t);
  wallBox(null, 'اسطبل — دیوار شمالی (بخش ۲)',
    (0.55 + L.width / 2) / 2, H / 2, -wz, L.width / 2 - 0.55, H, t);

  // WEST + EAST walls — three barred stall windows each.
  const sideWindows = L.windows.filter((w) => w.wall === 'west');
  for (const [side, wallId, wallName] of [
    [-1, STABLE_OBJECT_IDS.wallWest, 'اسطبل — دیوار غربی'],
    [1, STABLE_OBJECT_IDS.wallEast, 'اسطبل — دیوار شرقی'],
  ] as const) {
    const wins = [...sideWindows].sort((a, b) => a.center - b.center);
    let cursor = -L.innerHalfZ;
    wins.forEach((win, i) => {
      const hMin = win.center - win.width / 2;
      const hMax = win.center + win.width / 2;
      wallBox(i === 0 && side === -1 ? wallId : null, `${wallName} (بخش ${i + 1})`,
        side * wx, H / 2, (cursor + hMin) / 2, t, H, hMin - cursor);
      wallBox(null, `${wallName} (زیر پنجره ${i + 1})`,
        side * wx, (floorY + win.sill) / 2, win.center, t, win.sill - floorY, win.width);
      wallBox(null, `${wallName} (بالای پنجره ${i + 1})`,
        side * wx, (win.sill + win.height + H) / 2, win.center, t, H - win.sill - win.height, win.width);
      cursor = hMax;
    });
    wallBox(side === 1 ? wallId : null, `${wallName} (بخش پایانی)`,
      side * wx, H / 2, (cursor + L.innerHalfZ) / 2, t, H, L.innerHalfZ - cursor);
  }

  /* --- Stall partitions (solid lower + bar grill upper) -------------------- */
  // Partitions span from the side wall's inner face to the stall front's
  // stall-side face (±2.035) — back-to-back, never overlapping.
  const stripHalf = (L.innerHalfX - (L.stallFrontX + L.stall.frontThickness / 2)) / 2; // 1.6575
  const stripCx = (L.innerHalfX + L.stallFrontX + L.stall.frontThickness / 2) / 2; // 3.6925
  for (const side of [-1, 1] as const) {
    const [z1, z2] = side === -1
      ? [STABLE_OBJECT_IDS.divWest1, STABLE_OBJECT_IDS.divWest2]
      : [STABLE_OBJECT_IDS.divEast1, STABLE_OBJECT_IDS.divEast2];
    const [b1, b2] = side === -1
      ? [STABLE_OBJECT_IDS.barWest1, STABLE_OBJECT_IDS.barWest2]
      : [STABLE_OBJECT_IDS.barEast1, STABLE_OBJECT_IDS.barEast2];
    for (const [pi, pz] of [[0, -3.6], [1, -0.35]] as const) {
      box(side === -1 ? (pi === 0 ? z1 : z2) : (pi === 0 ? z1 : z2), 'stable-wall',
        `اسطبل — دیوار جداکننده (${side < 0 ? 'غرب' : 'شرق'} ${pi + 1})`,
        side * stripCx, floorY + L.stall.wainscotH / 2, pz,
        stripHalf * 2, L.stall.wainscotH, L.stall.frontThickness,
        { material: 'plankDark' });
      box(side === -1 ? (pi === 0 ? b1 : b2) : (pi === 0 ? b1 : b2), 'stable-bar-wall',
        `اسطبل — نرده جداکننده (${side < 0 ? 'غرب' : 'شرق'} ${pi + 1})`,
        side * stripCx, floorY + L.stall.wainscotH + (L.stall.grillTopY - L.stall.wainscotH) / 2, pz,
        stripHalf * 2, L.stall.grillTopY - L.stall.wainscotH, L.stall.frontThickness,
        { length: stripHalf * 2, height: L.stall.grillTopY - L.stall.wainscotH });
    }
  }

  /* --- Corner room walls ---------------------------------------------------- */
  const rz = L.rooms.dividerZ;
  const rt = L.rooms.thickness;
  const roomHalfX = (L.innerHalfX - (L.rooms.wallX + rt / 2)) / 2; // 1.6575
  const roomCx = (L.innerHalfX + L.rooms.wallX + rt / 2) / 2; // 3.6925
  const dg = L.rooms.doorGap;
  const roomH = H - floorY;
  // Tack room (west) — runs 2 cm INTO the side wall (buried junction, the
  // end face never shares the wall-plate plane at ±innerHalfX).
  box(STABLE_OBJECT_IDS.roomDividerTack, 'stable-wall', 'اسطبل — دیوار اتاق یراق',
    -roomCx - 0.01, floorY + (roomH - 0.005) / 2, rz, roomHalfX * 2 + 0.02, roomH - 0.005, rt, { material: 'plankDark' });
  box(STABLE_OBJECT_IDS.roomWallTackNorth, 'stable-wall', 'اسطبل — دیوار اتاق یراق (گذر)',
    -L.rooms.wallX, floorY + roomH / 2, (rz + dg.zMin) / 2, rt, roomH, dg.zMin - rz, { material: 'plankDark' });
  box(STABLE_OBJECT_IDS.roomHeaderTack, 'stable-wall', 'اسطبل — بالای در اتاق یراق',
    -L.rooms.wallX, floorY + dg.height + (roomH - dg.height) / 2, (dg.zMin + dg.zMax) / 2,
    rt, roomH - dg.height, dg.zMax - dg.zMin, { material: 'plankDark' });
  box(STABLE_OBJECT_IDS.roomWallTackSouth, 'stable-wall', 'اسطبل — دیوار اتاق یراق (جنوب)',
    -L.rooms.wallX, floorY + roomH / 2, (dg.zMax + L.innerHalfZ) / 2, rt, roomH, L.innerHalfZ - dg.zMax, { material: 'plankDark' });
  // Feed room (east) — mirror
  box(STABLE_OBJECT_IDS.roomDividerFeed, 'stable-wall', 'اسطبل — دیوار اتاق علوفه',
    roomCx + 0.01, floorY + (roomH - 0.005) / 2, rz, roomHalfX * 2 + 0.02, roomH - 0.005, rt, { material: 'plankDark' });
  box(STABLE_OBJECT_IDS.roomWallFeedNorth, 'stable-wall', 'اسطبل — دیوار اتاق علوفه (گذر)',
    L.rooms.wallX, floorY + roomH / 2, (rz + dg.zMin) / 2, rt, roomH, dg.zMin - rz, { material: 'plankDark' });
  box(STABLE_OBJECT_IDS.roomHeaderFeed, 'stable-wall', 'اسطبل — بالای در اتاق علوفه',
    L.rooms.wallX, floorY + dg.height + (roomH - dg.height) / 2, (dg.zMin + dg.zMax) / 2,
    rt, roomH - dg.height, dg.zMax - dg.zMin, { material: 'plankDark' });
  box(STABLE_OBJECT_IDS.roomWallFeedSouth, 'stable-wall', 'اسطبل — دیوار اتاق علوفه (جنوب)',
    L.rooms.wallX, floorY + roomH / 2, (dg.zMax + L.innerHalfZ) / 2, rt, roomH, L.innerHalfZ - dg.zMax, { material: 'plankDark' });

  /* --- Stall fronts (wainscot + grill segments; the gap holds the door) ----- */
  const front = L.stall;
  for (const s of STABLE_STALLS) {
    const gapMin = s.zMax - front.doorGapNorth;
    const gapMax = s.zMax - front.doorGapSouth;
    const frontCx = s.side * L.stallFrontX; // plane of the front assembly
    const segH = front.grillTopY - floorY;
    // Segment A: zMin → gapMin (wainscot + grill)
    box(STABLE_FRONT_SEGMENT_UUIDS[frontCursor++], 'stable-stall-front',
      `اسطبل — جلوی جایگاه ${String(s.index).padStart(2, '0')} (شمال)`,
      frontCx, floorY + segH / 2, (s.zMin + gapMin) / 2,
      front.frontThickness, segH, gapMin - s.zMin,
      { wainscot: true, wainscotH: front.wainscotH, length: gapMin - s.zMin, height: segH, floorY });
    // Segment B: header/grill above the door gap
    const bH = front.grillTopY - floorY - front.doorH;
    box(STABLE_FRONT_SEGMENT_UUIDS[frontCursor++], 'stable-stall-front',
      `اسطبل — جلوی جایگاه ${String(s.index).padStart(2, '0')} (بالای در)`,
      frontCx, floorY + front.doorH + bH / 2, gapMin + front.doorGapW / 2,
      front.frontThickness, bH, front.doorGapW,
      { wainscot: false, length: front.doorGapW, height: bH, floorY: floorY + front.doorH });
    // Segment C: post sliver south of the gap
    box(STABLE_FRONT_SEGMENT_UUIDS[frontCursor++], 'stable-stall-front',
      `اسطبل — جلوی جایگاه ${String(s.index).padStart(2, '0')} (پایه)`,
      frontCx, floorY + segH / 2, (gapMax + s.zMax) / 2,
      front.frontThickness, segH, s.zMax - gapMax,
      { wainscot: true, wainscotH: front.wainscotH, length: s.zMax - gapMax, height: segH, floorY });
  }

  /* --- The 10 doors (all spawn CLOSED — collider armed) --------------------- */
  for (const d of STABLE_DOOR_SPECS) {
    push(d.uuid, d.kind, `اسطبل — ${d.style === 'gate' ? 'دروازه اصلی' : d.style === 'stall' ? `در جایگاه ${d.stall}` : d.style === 'room' ? (d.x < 0 ? 'در اتاق یراق' : 'در اتاق علوفه') : 'در کارکنان'}`,
      { position: { x: originX + d.x, y: d.y, z: originZ + d.z }, rotation: { x: 0, y: d.rotY, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      { collider: true, style: d.style, hinge: d.hinge, openSign: d.openSign, openDeg: d.openDeg, width: d.width, height: d.height });
  }

  /* --- Feed troughs (solid, one per stall, hay level per spec) -------------- */
  const troughIds = [
    STABLE_OBJECT_IDS.trough1, STABLE_OBJECT_IDS.trough2, STABLE_OBJECT_IDS.trough3,
    STABLE_OBJECT_IDS.trough4, STABLE_OBJECT_IDS.trough5, STABLE_OBJECT_IDS.trough6,
  ];
  for (const [i, s] of STABLE_STALLS.entries()) {
    box(troughIds[i], 'stable-feed-trough',
      `اسطبل — آخور جایگاه ${String(s.index).padStart(2, '0')}`,
      s.side * (L.stallFrontX + front.frontThickness / 2 + 0.2), floorY + 0.21, s.troughZ,
      0.4, 0.42, 0.95,
      { hayLevel: s.troughHay, axis: 'z' });
  }

  /* --- Farrier / water solids ----------------------------------------------- */
  box(STABLE_OBJECT_IDS.waterTrough, 'stable-water-trough', 'اسطبل — آبشخور',
    L.farrier.waterTrough.x, floorY + 0.21, L.farrier.waterTrough.z, 0.9, 0.42, 0.5, { axis: 'x' });
  box(STABLE_OBJECT_IDS.workbench, 'stable-workbench', 'اسطبل — میز کار نعلبندی',
    L.farrier.bench.x, floorY + 0.45, L.farrier.bench.z, 1.5, 0.9, 0.6, {}, 90);
  box(STABLE_OBJECT_IDS.anvil, 'stable-anvil', 'اسطبل — سندان',
    L.farrier.anvil.x, floorY, L.farrier.anvil.z,
    // EXACT composite box (anvil builder real dims: stump 0.6 + horn/heel
    // span ≈ 0.87, 0.56 tall, 0.6 deep) — the old scale-1 transform gave a
    // 1 m³ box that blocked 20 cm of invisible air around the visual.
    1, 1, 1,
    { collider: { boxes: [{ size: { x: 0.88, y: 0.56, z: 0.6 }, offset: { x: -0.1, y: 0.28, z: 0 } }] } });

  /* --- Zone PROPS (one managed object per logical entity) -------------------- */
  // The tack/feed/farrier/water/loft contents used to be five big groups;
  // now every saddle, bale, crate, bucket, tool and sign is its own object
  // (selectable/movable), placed from STABLE_PROPS above. Micro-parts with
  // no independent use ride their host unit (see the catalog comment).
  for (const p of STABLE_PROPS) {
    push(p.uuid, 'stable-prop', `اسطبل — ${p.name}`,
      {
        position: { x: originX + p.x, y: p.y, z: originZ + p.z },
        rotation: { x: p.rx ?? 0, y: p.ry ?? 0, z: p.rz ?? 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      // NOTE: params ride a nested `params` key — a flat spread would let a
      // bucket's params.kind ('metal') clobber the def's discriminant kind.
      { collider: false, kind: p.kind, params: (p.params ?? {}) });
  }

  /* --- Per-stall content groups (controlled variation units) ------------------ */
  // NOTE: the stall interiors stay one group per stall BY DESIGN — each is a
  // single logical unit whose items derive from the stall's own geometry
  // (nameplate over ITS door gap, rack on ITS wall, per the variation spec).
  const stallContentIds = [
    STABLE_OBJECT_IDS.stallContents1, STABLE_OBJECT_IDS.stallContents2, STABLE_OBJECT_IDS.stallContents3,
    STABLE_OBJECT_IDS.stallContents4, STABLE_OBJECT_IDS.stallContents5, STABLE_OBJECT_IDS.stallContents6,
  ];
  for (const [i, s] of STABLE_STALLS.entries()) {
    push(stallContentIds[i], 'stable-stall-contents',
      `اسطبل — محتویات جایگاه ${String(s.index).padStart(2, '0')}`,
      { position: { x: originX + s.defX, y: 0, z: originZ + (s.zMin + s.zMax) / 2 }, rotation: identity(), scale: { x: 1, y: 1, z: 1 } },
      { collider: false, stall: s.index });
  }

  /* --- The shell kit (ONE object, collider: false — like every building) ----- */
  push(STABLE_OBJECT_IDS.building, 'stable-building', 'اسطبل — بدنه ساختمان',
    { position: { x: originX, y: 0, z: originZ }, rotation: identity(), scale: { x: 1, y: 1, z: 1 } },
    {
      collider: false,
      width: L.width,
      depth: L.depth,
      height: L.wallHeight,
      gateWidth: L.mainGate.xMax - L.mainGate.xMin,
      gateHeight: L.mainGate.height,
    });

  /* --- Independent shell entities (selectable/movable on their own) ---------- */
  // The LIVERY + HORSES signs build in building-local coords, so their defs
  // sit at the building origin — the geometry is unchanged from the old
  // in-shell kit; only the grouping moved so the editor can pick them.
  push(STABLE_OBJECT_IDS.liverySign, 'stable-sign', 'اسطبل — تابلوی LIVERY',
    { position: { x: originX, y: 0, z: originZ }, rotation: identity(), scale: { x: 1, y: 1, z: 1 } },
    { collider: false, kind: 'livery' });
  push(STABLE_OBJECT_IDS.horsesSign, 'stable-sign', 'اسطبل — تابلوی HORSES',
    { position: { x: originX, y: 0, z: originZ }, rotation: identity(), scale: { x: 1, y: 1, z: 1 } },
    { collider: false, kind: 'horses' });

  // The loft ladder — def at the ladder foot ON the plank floor; geometry
  // spans foot (0,0,0) → (±0.22, height, −run) landing on the deck edge.
  push(STABLE_OBJECT_IDS.ladder, 'stable-ladder', 'اسطبل — نردبان شیروانی',
    {
      position: { x: originX + L.loft.ladderX, y: L.floorTop, z: originZ + L.loft.ladderFootZ },
      rotation: identity(),
      scale: { x: 1, y: 1, z: 1 },
    },
    { collider: false, height: L.loft.deckTopY - L.floorTop, run: L.loft.ladderRun });

  // 9 windows: one managed object each, positioned/oriented EXACTLY like the
  // shell's old inline loop (south 0°, north 180°, west −90°, east +90°;
  // hole center on the wall mid-plane at the window's mid height).
  {
    const halfW = (L.width - L.wallThickness) / 2;
    const halfD = (L.depth - L.wallThickness) / 2;
    const windowIds = [
      STABLE_OBJECT_IDS.window1, STABLE_OBJECT_IDS.window2, STABLE_OBJECT_IDS.window3,
      STABLE_OBJECT_IDS.window4, STABLE_OBJECT_IDS.window5, STABLE_OBJECT_IDS.window6,
      STABLE_OBJECT_IDS.window7, STABLE_OBJECT_IDS.window8, STABLE_OBJECT_IDS.window9,
    ];
    const wallLabel: Record<string, string> = { south: 'جنوبی', north: 'شمالی', west: 'غربی', east: 'شرقی' };
    L.windows.forEach((win, i) => {
      // NOTE: win.sill is the ABSOLUTE building-local height of the hole's
      // bottom (the under-window wall segments span [floorY, sill]) — the
      // old shell loop added no floorTop here either.
      const midY = win.sill + win.height / 2;
      let px = 0, pz = 0, ry = 0;
      switch (win.wall) {
        case 'south': px = win.center; pz = halfD; ry = 0; break;
        case 'north': px = win.center; pz = -halfD; ry = 180; break;
        case 'west': px = -halfW; pz = win.center; ry = -90; break;
        case 'east': px = halfW; pz = win.center; ry = 90; break;
      }
      push(windowIds[i], 'stable-window', `اسطبل — پنجره ${wallLabel[win.wall]} ${i + 1}`,
        { position: { x: originX + px, y: midY, z: originZ + pz }, rotation: { x: 0, y: ry, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        { collider: false, wall: win.wall, center: win.center, sill: win.sill, width: win.width, height: win.height, bars: win.bars, shutters: win.shutters });
    });
  }

  // 6 lanterns — now individually selectable objects (same poses the shell
  // baked in). LIGHT BUDGET (restored): exactly 4 real PointLights — the
  // documented shell-kit budget (StableProps.stableLantern). The two
  // mid-aisle lanterns ride emissive-only (their flame chips still glow);
  // forward rendering pays for every real light in EVERY fragment, so the
  // 4-light budget is a perf contract, not a suggestion.
  {
    const lanternDefs: Array<{ id: string; name: string; x: number; y: number; z: number; rx: number; ry: number; lit: boolean }> = [
      { id: STABLE_OBJECT_IDS.lanternGate, name: 'فانوس دروازه', x: -1.45, y: 2.45, z: L.depth / 2, rx: 0, ry: 0, lit: true },
      { id: STABLE_OBJECT_IDS.lanternAisle, name: 'فانوس گذر', x: -1.55, y: L.loft.joistBottomY, z: L.loft.zMax + 0.11, rx: 90, ry: 0, lit: true },
      { id: STABLE_OBJECT_IDS.lanternFarrier, name: 'فانوس نعلبندی', x: -1.35, y: 2.2, z: -L.innerHalfZ, rx: 0, ry: 0, lit: true },
      { id: STABLE_OBJECT_IDS.lanternTack, name: 'فانوس اتاق یراق', x: -L.rooms.wallX + L.rooms.thickness / 2, y: 2.2, z: 4.45, rx: 0, ry: 90, lit: true },
      { id: STABLE_OBJECT_IDS.lanternAisleMidW, name: 'فانوس میانی غربی', x: -(L.stallFrontX - 0.12), y: 2.54, z: 0.6, rx: 90, ry: 0, lit: false },
      { id: STABLE_OBJECT_IDS.lanternAisleMidE, name: 'فانوس میانی شرقی', x: L.stallFrontX - 0.12, y: 2.54, z: 0.6, rx: 90, ry: 0, lit: false },
    ];
    for (const ld of lanternDefs) {
      push(ld.id, 'stable-lantern', `اسطبل — ${ld.name}`,
        { position: { x: originX + ld.x, y: ld.y, z: originZ + ld.z }, rotation: { x: ld.rx, y: ld.ry, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        { collider: false, lit: ld.lit });
    }
  }

  return defs;
}
