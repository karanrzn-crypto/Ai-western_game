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
 *   z = −6.25 … −0.55   hay loft deck over the north half (deck top y = 3.0)
 *   z = −6.25 … −5.65   farrier bay + water trough along the north wall
 *   z = −6.25 …  3.5    six stalls: 3 west (Stall 01–03) + 3 east (04–06),
 *                       each 3.25 frontage × ~3.31 depth, fronts on the aisle
 *   x = −1.975 … 1.975  CENTRAL AISLE (~3.83 m clear between stall fronts)
 *   z =  3.5 …  6.25    corner rooms: TACK (west) + FEED (east), each with a
 *                       real hinged door opening OUT into the aisle
 *   z =  6.25 …  6.5    south wall: main wagon gate (2.2 × 3.05, double
 *                       leaves, E) + staff door (1.05 × 2.25, E) + 2 windows
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
  /** Footprint: x ∈ [−w/2, w/2], z ∈ [−d/2, d/2] (d/2 = entrance side). */
  width: 11.2,
  depth: 13.0,
  wallHeight: 3.4,
  wallThickness: 0.25,
  /** Plank floor slab: y ∈ [0, floorTop] (one 0.1 step up — climbable). */
  floorTop: 0.1,
  floorSlabThickness: 0.1,
  /** Interior clear half-spans (inner wall faces). */
  innerHalfX: 5.35,
  innerHalfZ: 6.25,
  /** Gable roof: ridge along z at x = 0 (slabs slope east/west). */
  roof: Object.freeze({
    ridgeY: 5.5,
    /** Slab underside at the wall line (sits on the wall plates). */
    wallSeatY: 3.45,
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
    { wall: 'west', center: -4.625, sill: 1.9, width: 0.9, height: 1.15, bars: true, shutters: false },
    { wall: 'west', center: -1.375, sill: 1.9, width: 0.9, height: 1.15, bars: true, shutters: false },
    { wall: 'west', center: 1.875, sill: 1.9, width: 0.9, height: 1.15, bars: true, shutters: false },
    { wall: 'east', center: -4.625, sill: 1.9, width: 0.9, height: 1.15, bars: true, shutters: false },
    { wall: 'east', center: -1.375, sill: 1.9, width: 0.9, height: 1.15, bars: true, shutters: false },
    { wall: 'east', center: 1.875, sill: 1.9, width: 0.9, height: 1.15, bars: true, shutters: false },
    { wall: 'north', center: 0, sill: 1.5, width: 1.1, height: 1.2, bars: false, shutters: true },
  ] as const),
  /** Corner rooms (tack west / feed east). */
  rooms: Object.freeze({
    /** Divider wall center z (rooms span z ∈ [3.56, 6.25]). */
    dividerZ: 3.5,
    /** Room aisle walls at x = ±1.975 (t 0.12). */
    wallX: 1.975,
    thickness: 0.12,
    /** Room doorway in the aisle wall — doors swing OUT into the aisle. */
    doorGap: Object.freeze({ zMin: 5.0, zMax: 6.05, height: 2.2 }),
  }),
  /** Hay loft deck over the north half. */
  loft: Object.freeze({
    joistBottomY: 2.78,
    joistTopY: 2.93,
    deckTopY: 3.0,
    zMin: -6.25,
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
   *  (x ∈ [−0.6, 0.6]) stays clear end-to-end. */
  farrier: Object.freeze({
    anvil: Object.freeze({ x: 1.55, z: -5.3 }),
    bench: Object.freeze({ x: -1.615, z: -5.3 }),
    waterTrough: Object.freeze({ x: -1.1, z: -6.0 }),
  }),
});

/** World-space anchor of the stable (west side of the street, south of the
 *  saloon — the SW quadrant is empty ground). */
export const STABLE_SITE = Object.freeze({ x: -16, z: 6 });

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
});

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
  [-6.25, -3.0],
  [-3.0, 0.25],
  [0.25, 3.5],
];

const stallVariation: ReadonlyArray<Omit<StableStallSpec, 'index' | 'side' | 'zMin' | 'zMax' | 'defX' | 'doorGapCenter' | 'troughZ'>> = [
  { troughHay: 0.8, bucket: { kind: 'wood', full: true }, rack: 'full', pile: false, floor: 'dirt', tool: 'pitchfork', extra: 'rope' },
  { troughHay: 0.5, bucket: { kind: 'wood', full: true }, rack: 'half', pile: false, floor: 'worn', tool: null, extra: 'blanket' },
  { troughHay: 0.25, bucket: { kind: 'metal', full: true }, rack: null, pile: true, floor: 'straw', tool: null, extra: 'brush' },
  { troughHay: 0.7, bucket: { kind: 'wood', full: true }, rack: 'full', pile: true, floor: 'dirt', tool: null, extra: 'rope' },
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
    for (const [pi, pz] of [[0, -3.0], [1, 0.25]] as const) {
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
    L.farrier.anvil.x, floorY, L.farrier.anvil.z, 1, 1, 1);

  /* --- Content groups (decor — collider: false) ------------------------------ */
  push(STABLE_OBJECT_IDS.tackContents, 'stable-tack-contents', 'اسطبل — محتویات اتاق یراق',
    { position: { x: originX, y: 0, z: originZ }, rotation: identity(), scale: { x: 1, y: 1, z: 1 } },
    { collider: false });
  push(STABLE_OBJECT_IDS.feedContents, 'stable-feed-contents', 'اسطبل — محتویات اتاق علوفه',
    { position: { x: originX, y: 0, z: originZ }, rotation: identity(), scale: { x: 1, y: 1, z: 1 } },
    { collider: false });
  push(STABLE_OBJECT_IDS.farrierContents, 'stable-farrier-contents', 'اسطبل — محتویات نعلبندی',
    { position: { x: originX, y: 0, z: originZ }, rotation: identity(), scale: { x: 1, y: 1, z: 1 } },
    { collider: false });
  push(STABLE_OBJECT_IDS.waterContents, 'stable-water-contents', 'اسطبل — ایستگاه آب',
    { position: { x: originX, y: 0, z: originZ }, rotation: identity(), scale: { x: 1, y: 1, z: 1 } },
    { collider: false });
  push(STABLE_OBJECT_IDS.loftContents, 'stable-loft-contents', 'اسطبل — محتویات علوفه‌خور',
    { position: { x: originX, y: 0, z: originZ }, rotation: identity(), scale: { x: 1, y: 1, z: 1 } },
    { collider: false });
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

  return defs;
}
