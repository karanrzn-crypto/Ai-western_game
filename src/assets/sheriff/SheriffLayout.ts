/**
 * src/assets/sheriff/SheriffLayout.ts
 * -----------------------------------------------------------------------------
 * THE single placement source for the Sheriff Office — the SAME list the
 * playable map registers and the tests assert against (mirrors BankLayout).
 *
 * BUILDING FORM (a small western frontier law building, NOT a false-front
 * saloon clone):
 *   side-gable wood-frame office, ridge running east–west, board-and-batten
 *   siding on a stone foundation, plank floor raised 0.15 m, a south-facing
 *   porch over the public door (shed roof, two posts), a big painted SHERIFF
 *   sign above the porch and a CITY JAIL plaque over the barred jail window.
 *
 * ZONES (building-local, origin = footprint center, +z = south/street):
 *   MAIN OFFICE  x ∈ [−5.05, 0.35]  z ∈ [−3.55, 3.55] — public side, desk
 *                facing the door, wanted board + badge behind the desk,
 *                gun rack / wash stand / stove / crates along the west wall.
 *   JAIL BLOCK   x ∈ [0.55, 5.05] — entered through a doorway in the office/
 *                jail divider: a 1.1 m walk corridor along the bars, with
 *                TWO barred cells east of it (north cell + south cell), each
 *                with its own openable iron cell door (E), a cot, and a
 *                barred window to the outside.
 *
 * Junction discipline (same as the bank): segments end AT faces —
 * back-to-back contacts, never overlapping; the only deviations from exact
 * face coordinates are millimetric and buried inside junctions. Every wall
 * segment is a unit-box × scale (scale IS the collider AABB).
 * -----------------------------------------------------------------------------
 */

import type { ObjectDefinition } from '../../core/types.js';

export const SHERIFF_LAYOUT = Object.freeze({
  /** Footprint: width (x) × depth (z). +z faces the street (south). */
  width: 10.4,
  depth: 7.4,
  /** Wall thickness (wood frame). */
  wallThickness: 0.15,
  /** Wall top (y); the plank floor slab fills y ∈ [0, floorTop]. */
  wallHeight: 3.45,
  /** Raised plank floor. */
  floorTop: 0.15,
  floorSlabThickness: 0.15,
  /** Interior plank ceiling slab (y top; interior clear height 3.3). */
  ceilingY: 3.53,
  /** Gable roof: ridge along x at z = 0. */
  roof: Object.freeze({
    eaveY: 3.5, // roof slab top at the wall line z = ±depth/2
    ridgeY: 4.95,
    overhangZ: 0.35, // past the wall outer face
    overhangX: 0.35,
    thickness: 0.09,
  }),
  /** Front door (south wall, office half). */
  frontDoor: Object.freeze({ xMin: -3.05, xMax: -1.95, height: 2.3 }),
  /** South-facing porch (office half only — the jail half stays austere). */
  porch: Object.freeze({
    xMin: -5.2,
    xMax: 0.55,
    depth: 1.8, // from the facade outer face southward
    postSection: 0.14,
    roofFrontY: 3.0,
    roofBackY: 3.42,
  }),
  /** Exterior windows: wall face + center along the wall + size + sill (bottom y). */
  windows: Object.freeze([
    { wall: 'south', center: -4.1, sill: 1.25, width: 1.0, height: 1.7, bars: false, shutters: true },
    { wall: 'south', center: 2.7, sill: 1.55, width: 0.8, height: 1.0, bars: true, shutters: false },
    { wall: 'west', center: 1.6, sill: 1.25, width: 1.0, height: 1.7, bars: false, shutters: true },
    { wall: 'north', center: -4.3, sill: 1.3, width: 1.0, height: 1.5, bars: false, shutters: false },
    { wall: 'north', center: 3.3, sill: 1.6, width: 0.7, height: 0.9, bars: true, shutters: false },
    { wall: 'east', center: 1.6, sill: 1.6, width: 0.7, height: 0.9, bars: true, shutters: false },
  ]),
  /** Interior partitions. */
  partitions: Object.freeze({
    thickness: 0.2,
    /** Office/jail divider (center x). Set at x = 0 so the 1.1 m corridor
     *  west of the bars keeps a real walk lane even where the cell doors'
     *  yaw-conservative 1×1 colliders protrude 0.45 m into it (the same
     *  conservative-box policy the bank uses for its gate/safe). */
    dividerX: 0.0,
    // 1.3 m clear — the ONLY office→jail passage must take a real player
    // circle (r 0.35) with ~0.3 m of aim slack per side, not a pixel gate.
    dividerDoor: Object.freeze({ zMin: 1.55, zMax: 2.85, height: 2.3 }),
    /** Cell divider between the two cells (center z). */
    cellDividerZ: -0.45,
    /** Cell block: bars plane (center x) + cells' z spans. */
    barsX: 1.7,
    barsThickness: 0.1,
    cellNorth: Object.freeze({ zMin: -3.55, zMax: -0.55 }),
    cellSouth: Object.freeze({ zMin: -0.35, zMax: 3.55 }),
    /** Cell door centers along the bars line (gap ±0.61 incl. iron frame). */
    cellDoorAN: -2.0,
    cellDoorBN: 1.15,
  }),
  /** Stove + stovepipe (the pipe continues in the shell through the roof). */
  stove: Object.freeze({ x: -4.15, z: -2.85 }),
});

/** World-space anchor of the Sheriff Office: FAR (south) side of the central
 *  town square, flanking the stable road's north gap east of the bank; map
 *  assembly yaws it 180° so the porch + sign face north onto the square. */
export const SHERIFF_SITE = Object.freeze({ x: 8.5, z: 14.5 });

/** Canonical hex UUID block for the sheriff block (saloon …a000-, bank …b000-;
 *  v4 canonical group-4 prefixes are 8/9/a/b — the sheriff takes 9). */
const SHERIFF_UUID_BASE = '90000000-0000-4000-9000-0000000000';

function sheriffUuid(suffix: string): string {
  return `${SHERIFF_UUID_BASE}${suffix}`;
}

/** Extra canonical uuids for SPLIT wall segments (windows turn each windowed
 *  wall into several masonry boxes; the wall's canonical id stays on its first
 *  segment, every further segment draws from this pool — suffixes 2a…41). */
export const SHERIFF_WALL_SEGMENT_UUIDS: readonly string[] = Object.freeze(
  Array.from({ length: 24 }, (_, i) => sheriffUuid((0x2a + i).toString(16).padStart(2, '0'))),
);

/** Object ids inside the sheriff block — tests key off these names. */
export const SHERIFF_OBJECT_IDS = Object.freeze({
  building: sheriffUuid('01'),
  floor: sheriffUuid('02'),
  threshold: sheriffUuid('03'),
  porchDeck: sheriffUuid('04'),
  ceiling: sheriffUuid('05'),
  wallRear: sheriffUuid('06'),
  wallWest: sheriffUuid('07'),
  wallEast: sheriffUuid('08'),
  wallFrontWest: sheriffUuid('09'),
  wallFrontEast: sheriffUuid('0a'),
  wallFrontHeader: sheriffUuid('0b'),
  divNorth: sheriffUuid('0c'),
  divHeader: sheriffUuid('0d'),
  divSouth: sheriffUuid('0e'),
  cellDivider: sheriffUuid('0f'),
  barANorth: sheriffUuid('10'),
  barASouth: sheriffUuid('11'),
  barAHeader: sheriffUuid('12'),
  barBNorth: sheriffUuid('13'),
  barBSouth: sheriffUuid('14'),
  barBHeader: sheriffUuid('15'),
  cellDoorA: sheriffUuid('16'),
  cellDoorB: sheriffUuid('17'),
  cotA: sheriffUuid('18'),
  cotB: sheriffUuid('19'),
  desk: sheriffUuid('1a'),
  chair: sheriffUuid('1b'),
  deskLamp: sheriffUuid('1c'),
  wantedBoard: sheriffUuid('1d'),
  badgePlaque: sheriffUuid('1e'),
  gunCabinet: sheriffUuid('1f'),
  gunRack: sheriffUuid('20'),
  washStand: sheriffUuid('21'),
  ammoCrate1: sheriffUuid('22'),
  ammoCrate2: sheriffUuid('23'),
  coatRack: sheriffUuid('24'),
  stove: sheriffUuid('25'),
  keyRack: sheriffUuid('26'),
  corridorLantern: sheriffUuid('27'),
  exteriorLantern: sheriffUuid('28'),
  frontDoor: sheriffUuid('29'),
});

const identity = () => ({ x: 0, y: 0, z: 0 });

/**
 * Every managed object the Sheriff Office adds to the playable map.
 * Positions are world-space, anchored at (originX, originZ) = footprint
 * CENTER; interior props sit on the plank floor (top at floorTop = 0.15).
 *
 * Collider policy (CollisionWorld reads ONLY these metadata flags):
 *   - walls, floor, porch deck, threshold, ceiling, bar segments, headers
 *     → collider: true (scale IS the AABB)
 *   - cell doors spawn CLOSED → collider: true (released while open by the
 *     runtime interaction — they ARE the cell walkability switch)
 *   - solid furniture (desk, gun cabinet, stove, cots) → true
 *   - shell kit (porch roof, sign, windows, trims), wall mounts, seats,
 *     small decor, lamps → false
 */
export function buildSheriffMapObjects(originX: number, originZ: number): ObjectDefinition[] {
  const L = SHERIFF_LAYOUT;
  const floorY = L.floorTop;
  const t = L.wallThickness;
  const pt = L.partitions;

  const defs: ObjectDefinition[] = [];
  let extraSegCursor = 0; // split-wall segment uuid pool cursor
  const push = (
    uuid: string,
    assetType: string,
    name: string,
    transform: ObjectDefinition['transform'],
    metadata: Record<string, unknown>,
  ): void => {
    defs.push({ uuid, assetType, transform, metadata: { name, editable: true, ...metadata } });
  };
  const wall = (
    uuid: string, name: string,
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
    repeat: [number, number],
  ): void => push(uuid, 'sheriff-wall', name,
    { position: { x: originX + x, y, z: originZ + z }, rotation: identity(), scale: { x: sx, y: sy, z: sz } },
    { collider: true, clapboardRepeat: repeat });

  // --- Floor slab (unit box × scale → exact collider) ------------------------
  // Spans between the wall inner faces; the plank texture repeats ~per plank.
  push(SHERIFF_OBJECT_IDS.floor, 'sheriff-floor', 'کلانتری — کف چوبی', {
    position: { x: originX, y: L.floorSlabThickness / 2 + 0.005, z: originZ },
    rotation: identity(),
    scale: { x: L.width - t - 0.05, y: L.floorSlabThickness - 0.01, z: L.depth - t - 0.05 },
  }, { collider: true, plankRepeat: [10, 7] });
  // Threshold: carries the floor across the front wall band (doorway bottom);
  // its top sits 5 mm below the slab top so no same-normal coplanar face is
  // ever shared with the floor (z-fight discipline).
  push(SHERIFF_OBJECT_IDS.threshold, 'sheriff-floor', 'کلانتری — آستانه در', {
    position: { x: originX + (L.frontDoor.xMin + L.frontDoor.xMax) / 2, y: L.floorSlabThickness / 2 - 0.01, z: originZ + (L.depth - t) / 2 },
    rotation: identity(),
    scale: { x: L.frontDoor.xMax - L.frontDoor.xMin, y: L.floorSlabThickness, z: t },
  }, { collider: true });
  // Porch deck (top flush with the interior floor — one 0.15 step, climbable).
  push(SHERIFF_OBJECT_IDS.porchDeck, 'sheriff-floor', 'کلانتری — ایوان', {
    position: {
      x: originX + (L.porch.xMin + L.porch.xMax) / 2,
      y: 0.06 + 0.045,
      z: originZ + L.depth / 2 + t / 2 + L.porch.depth / 2,
    },
    rotation: identity(),
    scale: { x: L.porch.xMax - L.porch.xMin, y: 0.09, z: L.porch.depth },
  }, { collider: true, plankRepeat: [6, 2] });

  // --- Walls (each a plain box of exactly its scale → collider == visual) ----
  // WINDOWS ARE REAL OPENINGS: every windowed wall is SPLIT into masonry
  // segments around its hole(s) — between-segments run full height, each hole
  // gets a below + above segment. The hole IS the window; the shell's window
  // assembly lines it (frame + glass INSIDE the wall depth). The collider
  // tiles exactly like the visual (the unit-box scale IS the AABB).
  const wc = (span: number): number => (span - t) / 2; // wall center line
  interface Hole { min: number; max: number; yMin: number; yMax: number }
  const holesByWall: Record<string, Hole[]> = {};
  for (const win of L.windows) {
    (holesByWall[win.wall] ??= []).push({
      min: win.center - win.width / 2,
      max: win.center + win.width / 2,
      yMin: win.sill,
      yMax: win.sill + win.height,
    });
  }
  for (const holes of Object.values(holesByWall)) holes.sort((a, b) => a.min - b.min);
  /** Emit a windowed wall as masonry segments around its holes.
   *  axis 'x': the wall runs along x (front/rear walls, fixed z center);
   *  axis 'z': the wall runs along z (side walls, fixed x center). */
  const windowedWall = (
    uuid: string, name: string, axis: 'x' | 'z',
    aMin: number, aMax: number, center: number,
    holes: Hole[],
  ): void => {
    let segIdx = 0;
    const seg = (a1: number, a2: number, y1: number, y2: number, label: string): void => {
      const w = a2 - a1;
      const h = y2 - y1;
      if (w < 0.02 || h < 0.02) return; // never emit slivers
      const cx = axis === 'x' ? (a1 + a2) / 2 : center;
      const cz = axis === 'x' ? center : (a1 + a2) / 2;
      const sx = axis === 'x' ? w : t;
      const sz = axis === 'x' ? t : w;
      // The wall's canonical uuid stays on its FIRST segment; further
      // segments draw deterministic extras from the reserved pool.
      const id = segIdx === 0 ? uuid : SHERIFF_WALL_SEGMENT_UUIDS[extraSegCursor++];
      segIdx += 1;
      wall(id, `${name} — ${label}`, cx, (y1 + y2) / 2, cz, sx, h, sz, [Math.max(1, w / 1.05), Math.max(1, h / 1.05)]);
    };
    let cursor = aMin;
    holes.forEach((hole, i) => {
      seg(cursor, hole.min, 0, L.wallHeight, `بخش ${i + 1}`);
      seg(hole.min, hole.max, 0, hole.yMin, 'زیر پنجره');
      seg(hole.min, hole.max, hole.yMax, L.wallHeight, 'بالای پنجره');
      cursor = hole.max;
    });
    seg(cursor, aMax, 0, L.wallHeight, `بخش ${holes.length + 1}`);
  };
  windowedWall(SHERIFF_OBJECT_IDS.wallRear, 'کلانتری — دیوار شمالی', 'x', -L.width / 2, L.width / 2, -wc(L.depth), holesByWall.north ?? []);
  windowedWall(SHERIFF_OBJECT_IDS.wallWest, 'کلانتری — دیوار غربی', 'z', -(L.depth - 2 * t) / 2, (L.depth - 2 * t) / 2, -wc(L.width), holesByWall.west ?? []);
  windowedWall(SHERIFF_OBJECT_IDS.wallEast, 'کلانتری — دیوار شرقی', 'z', -(L.depth - 2 * t) / 2, (L.depth - 2 * t) / 2, wc(L.width), holesByWall.east ?? []);
  const doorMidX = (L.frontDoor.xMin + L.frontDoor.xMax) / 2;
  const doorW = L.frontDoor.xMax - L.frontDoor.xMin;
  windowedWall(SHERIFF_OBJECT_IDS.wallFrontWest, 'کلانتری — نمای جنوبی (غرب در)', 'x', -wc(L.width), L.frontDoor.xMin, wc(L.depth), holesByWall.south?.filter((h) => h.max <= L.frontDoor.xMin) ?? []);
  windowedWall(SHERIFF_OBJECT_IDS.wallFrontEast, 'کلانتری — نمای جنوبی (شرق در)', 'x', L.frontDoor.xMax, wc(L.width), wc(L.depth), holesByWall.south?.filter((h) => h.min >= L.frontDoor.xMax) ?? []);
  wall(SHERIFF_OBJECT_IDS.wallFrontHeader, 'کلانتری — بالای در',
    doorMidX, floorY + L.frontDoor.height + (L.wallHeight - floorY - L.frontDoor.height) / 2, wc(L.depth),
    doorW, L.wallHeight - floorY - L.frontDoor.height, t, [1, 1]);

  // --- Partitions -------------------------------------------------------------
  // Interior partitions STAND ON the plank floor (y ∈ [floorTop, wallTop] —
  // bottoms back-to-back with the slab top, never coplanar with its bottom).
  // Office/jail divider: full-depth line at x = 0 with the jail doorway
  // (z ∈ [1.55, 2.85], 2.3 tall) — three segments around the opening.
  {
    const px = pt.dividerX;
    const d = pt.dividerDoor;
    const pH = L.wallHeight - floorY; // 3.3, off the plank floor
    wall(SHERIFF_OBJECT_IDS.divNorth, 'کلانتری — دیوار داخلی (شمال)',
      px, floorY + pH / 2 - 0.005, (pt.cellNorth.zMin + d.zMin) / 2,
      pt.thickness, pH + 0.01, d.zMin - pt.cellNorth.zMin, [5, 3.2]);
    wall(SHERIFF_OBJECT_IDS.divHeader, 'کلانتری — بالای راهرو زندان',
      px, floorY + d.height + (L.wallHeight - floorY - d.height) / 2, (d.zMin + d.zMax) / 2,
      pt.thickness, L.wallHeight - floorY - d.height, d.zMax - d.zMin, [1, 1]);
    wall(SHERIFF_OBJECT_IDS.divSouth, 'کلانتری — دیوار داخلی (جنوب)',
      px, floorY + pH / 2 - 0.005, (d.zMax + pt.cellSouth.zMax) / 2,
      pt.thickness, pH + 0.01, pt.cellSouth.zMax - d.zMax, [1, 3.2]);
    // Cell divider (between the two cells): bars line → east wall INNER face
    // (back-to-back tiling — never pokes into the wall band).
    wall(SHERIFF_OBJECT_IDS.cellDivider, 'کلانتری — دیوار بین سلول‌ها',
      (pt.barsX + pt.barsThickness / 2 + wc(L.width) - t / 2) / 2, floorY + pH / 2 - 0.005, pt.cellDividerZ,
      wc(L.width) - t / 2 - (pt.barsX + pt.barsThickness / 2), pH + 0.01, pt.thickness, [3.2, 3.2]);
  }

  // --- Jail bar fronts (cell A north cell, cell B south cell) -----------------
  // Iron bar walls floor→ceiling on the corridor side of each cell, with a
  // 1.22 m gap for the openable jail-cell-door. Non-door spans are 'sheriff-
  // bar-segment' (bars + rails + exact box collider); the header above each
  // door is a plain iron box.
  {
    const bx = pt.barsX;
    const bt = pt.barsThickness;
    const barH = L.wallHeight - floorY; // 3.3, off the plank floor
    const frameHalf = 0.61; // jail-cell-door frame outer half-width
    // NOTE: position is the AABB CENTER (CollisionWorld derives the box from
    // the transform alone) — the bar-segment builder builds its bars CENTERED
    // on the group origin to match, so visual == collider exactly.
    const seg = (uuid: string, name: string, zMin: number, zMax: number) =>
      push(uuid, 'sheriff-bar-segment', name, {
        position: { x: originX + bx, y: floorY + barH / 2, z: originZ + (zMin + zMax) / 2 },
        rotation: identity(),
        scale: { x: bt, y: barH, z: zMax - zMin },
      }, { collider: true, length: zMax - zMin, height: barH });
    // Masonry iron headers OVER the cell-door gaps — the user's Final
    // transforms applied VERBATIM (world y center + size; z = the door gap
    // ±0.61 = the door frame's outer width, flush with it). Header A spans
    // y [2.25, 3.45] (wall top); header B y [2.29, 3.59] — its top 14 cm
    // buries into the ceiling cavity, invisible from inside (no coplanar
    // face with the ceiling slab's planes).
    const header = (uuid: string, name: string, zc: number, yCenter: number, ySize: number) =>
      push(uuid, 'sheriff-wall', name, {
        position: { x: originX + bx, y: yCenter, z: originZ + zc },
        rotation: identity(),
        scale: { x: bt, y: ySize, z: 1.22 },
      }, { collider: true, material: 'iron' });
    // Cell A (north cell, z ∈ [−3.55, −0.55]), door center z = −2.0.
    seg(SHERIFF_OBJECT_IDS.barANorth, 'کلانتری — میله‌های سلول ۱ (شمال)', pt.cellNorth.zMin, pt.cellDoorAN - frameHalf);
    seg(SHERIFF_OBJECT_IDS.barASouth, 'کلانتری — میله‌های سلول ۱ (جنوب)', pt.cellDoorAN + frameHalf, pt.cellNorth.zMax);
    header(SHERIFF_OBJECT_IDS.barAHeader, 'کلانتری — بالای در سلول ۱', pt.cellDoorAN, 2.85, 1.2);
    // Cell B (south cell, z ∈ [−0.35, 3.55]), door center z = 1.15.
    seg(SHERIFF_OBJECT_IDS.barBNorth, 'کلانتری — میله‌های سلول ۲ (شمال)', pt.cellSouth.zMin, pt.cellDoorBN - frameHalf);
    seg(SHERIFF_OBJECT_IDS.barBSouth, 'کلانتری — میله‌های سلول ۲ (جنوب)', pt.cellDoorBN + frameHalf, pt.cellSouth.zMax);
    header(SHERIFF_OBJECT_IDS.barBHeader, 'کلانتری — بالای در سلول ۲', pt.cellDoorBN, 2.94, 1.3);
  }

  // --- Interior plank ceiling (collider: also stops re-entry from above) ------
  // Ceiling spans the inner faces only — it must never reach the gable
  // infill bands (x ±[wc, wc+t/2+…]) nor share a plane with them.
  push(SHERIFF_OBJECT_IDS.ceiling, 'sheriff-ceiling', 'کلانتری — سقف چوبی', {
    position: { x: originX, y: L.ceilingY - 0.04, z: originZ },
    rotation: identity(),
    scale: { x: L.width - 2 * t - 0.05, y: 0.08, z: L.depth - 2 * t - 0.05 },
  }, { collider: true, plankRepeat: [10, 7] });

  // --- The shell kit (ONE managed object, collider: false) --------------------
  // Porch (posts + shed roof + fascia + brackets), gable roof slabs + gable
  // infills + ridge cap + eave fascia, stone foundation skirt, front door
  // (casing + leaf held open), six window assemblies (two barred), the big
  // SHERIFF sign, the CITY JAIL plaque and the stovepipe through the roof.
  push(SHERIFF_OBJECT_IDS.building, 'sheriff-building', 'کلانتری — بدنه ساختمان', {
    position: { x: originX, y: 0, z: originZ },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, {
    collider: false,
    width: L.width,
    depth: L.depth,
    height: L.wallHeight,
    doorWidth: doorW,
  });

  // --- Jail -------------------------------------------------------------------
  // Two iron cell doors (user asset) in the bars gaps — spawn CLOSED, E
  // opens them inward into the cell (interaction wired in playable-map).
  for (const [uuid, zc, label] of [
    [SHERIFF_OBJECT_IDS.cellDoorA, pt.cellDoorAN, 'کلانتری — در سلول ۱'],
    [SHERIFF_OBJECT_IDS.cellDoorB, pt.cellDoorBN, 'کلانتری — در سلول ۲'],
  ] as const) {
    push(uuid, 'jail-cell-door', label, {
      position: { x: originX + pt.barsX, y: floorY, z: originZ + zc },
      rotation: { x: 0, y: -90, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }, { collider: true });
  }

  // --- Front door (the office's public entrance — TRULY OPENABLE, E) ---------
  // Spawns CLOSED across the south doorway; E swings the leaf INWARD into
  // the office around the real hinge pivot ('front-door-hinge' — 4 cm off
  // the WEST jamb; 100° sweep, verified clear of the wall band, both casing
  // rings and every furniture line). Collider policy == the cell doors': a
  // yaw-conservative 1×1 box at the doorway center that is ARMED while the
  // door is closed and RELEASED past half-open — the doorway's 5 cm side
  // slits (against the wall segments) stay impassable for the player circle
  // either way. The builder (buildSheriffFrontDoor) reads SHERIFF_LAYOUT
  // directly — this def carries no duplicate dimensions.
  push(SHERIFF_OBJECT_IDS.frontDoor, 'sheriff-front-door', 'کلانتری — در ورودی', {
    position: { x: originX + doorMidX, y: floorY, z: originZ + wc(L.depth) },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });

  // Cots inside each cell — the user's Final transforms applied VERBATIM
  // (world (17.022, 0.15, −2.645) / (16.85, 0.15, 1.455) minus the site;
  // rotY 180; scale 1.1/1.1/1.7). Cot A's north edge lands flush on the cell
  // divider's north face (−0.55); cot B's south edge flush on the south wall
  // inner face (3.55) — both clear of the doors' 80° swing arcs.
  push(SHERIFF_OBJECT_IDS.cotA, 'cell-cot', 'کلانتری — تخت سلول ۱', {
    position: { x: originX + 4.022, y: floorY, z: originZ - 1.145 },
    rotation: { x: 0, y: 180, z: 0 },
    scale: { x: 1.1, y: 1.1, z: 1.7 },
  }, { collider: true });
  push(SHERIFF_OBJECT_IDS.cotB, 'cell-cot', 'کلانتری — تخت سلول ۲', {
    position: { x: originX + 3.85, y: floorY, z: originZ + 2.955 },
    rotation: { x: 0, y: 180, z: 0 },
    scale: { x: 1.1, y: 1.1, z: 1.7 },
  }, { collider: true });

  // --- Main office furniture (every prop has a spatial reason) ----------------
  // Desk mid-office facing the door; the chair BEHIND it (north side) facing
  // the desk; visitors stand south of the desk with ~2 m of open floor.
  push(SHERIFF_OBJECT_IDS.desk, 'sheriff-desk', 'کلانتری — میز کلانتر', {
    position: { x: originX - 2.5, y: floorY, z: originZ + 0.45 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, {
    // EXACT composite box (buildSheriffDesk 1.5 × 0.75, top to 0.78) —
    // composite-collider fix class (the §3 sweep).
    collider: {
      boxes: [{ size: { x: 1.5, y: 0.78, z: 0.75 }, offset: { x: 0, y: 0.39, z: 0 } }],
    },
  });
  push(SHERIFF_OBJECT_IDS.chair, 'sheriff-chair', 'کلانتری — صندلی کلانتر', {
    position: { x: originX - 2.5, y: floorY, z: originZ - 0.4 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Kerosene lamp ON the desk top (top y = floorTop + 0.75).
  push(SHERIFF_OBJECT_IDS.deskLamp, 'kerosene-lamp', 'کلانتری — چراغ میز', {
    position: { x: originX - 1.95, y: floorY + 0.75, z: originZ + 0.35 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Wanted board behind the desk on the north wall (posters face the room).
  push(SHERIFF_OBJECT_IDS.wantedBoard, 'wanted-board', 'کلانتری — تخته تحت تعقیب', {
    position: { x: originX - 2.5, y: floorY, z: originZ - 3.52 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // SHERIFF badge plaque — the user's Final transform VERBATIM (world
  // (10.525, 2.0, −5.03) minus the site): centered over the desk line, back
  // face 1 cm off the north wall inner face.
  push(SHERIFF_OBJECT_IDS.badgePlaque, 'sheriff-badge', 'کلانتری — نشان کلانتر', {
    position: { x: originX - 2.475, y: 2.0, z: originZ - 3.53 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Gun display cabinet against the north wall — the user's Final transform
  // VERBATIM (world (12.41, 0.10, −4.87) minus the site). Its back sits
  // 3 cm off the wall inner face; the rebuilt case grounds through its
  // plinth at the user's y (10 cm seat into the plank floor, deliberate).
  push(SHERIFF_OBJECT_IDS.gunCabinet, 'gun-cabinet', 'کلانتری — ویترین اسلحه', {
    position: { x: originX - 0.59, y: 0.1, z: originZ - 3.37 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });
  // Gun rack — rebuilt as a FLOOR-STANDING rifle rack against the west wall
  // (back plane 1 cm off the wall inner face, facing east into the office).
  push(SHERIFF_OBJECT_IDS.gunRack, 'gun-rack', 'کلانتری — قفسه اسلحه', {
    position: { x: originX - 5.04, y: floorY, z: originZ + 0.3 },
    rotation: { x: 0, y: 90, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Wash stand in the office's north-west stretch, basin side out.
  push(SHERIFF_OBJECT_IDS.washStand, 'wash-stand', 'کلانتری — دستشویی پایه‌دار', {
    position: { x: originX - 4.87, y: floorY, z: originZ - 1.7 },
    rotation: { x: 0, y: 90, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Ammo crates under the west window (one stacked pair, slight yaw variance).
  push(SHERIFF_OBJECT_IDS.ammoCrate1, 'ammo-crate', 'کلانتری — جعبه فشنگ ۱', {
    position: { x: originX - 4.87, y: floorY, z: originZ + 2.2 },
    rotation: { x: 0, y: 90, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  push(SHERIFF_OBJECT_IDS.ammoCrate2, 'ammo-crate', 'کلانتری — جعبه فشنگ ۲', {
    position: { x: originX - 4.87, y: floorY + 0.26, z: originZ + 2.2 },
    rotation: { x: 0, y: 78, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Coat rack beside the front door (hat + gun belt greet the visitor).
  push(SHERIFF_OBJECT_IDS.coatRack, 'coat-rack', 'کلانتری — رگال کت', {
    position: { x: originX - 0.6, y: floorY, z: originZ + 3.05 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Potbelly stove in the office's north-west corner; the stovepipe continues
  // through the roof (shell kit). Warm ember glow faces the room.
  push(SHERIFF_OBJECT_IDS.stove, 'potbelly-stove', 'کلانتری — اجاق هیزمی', {
    position: { x: originX + L.stove.x, y: floorY, z: originZ + L.stove.z },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, {
    // EXACT composite box (round 0.48 m stove body, 0.78 to the top plate)
    // — composite-collider fix class (the §3 sweep).
    collider: {
      boxes: [{ size: { x: 0.5, y: 0.78, z: 0.5 }, offset: { x: 0, y: 0.39, z: 0 } }],
    },
  });
  // Key rack on the office face of the divider, north of the jail doorway —
  // the keys hang exactly where the sheriff grabs them on his way in.
  push(SHERIFF_OBJECT_IDS.keyRack, 'key-rack', 'کلانتری — قفسه کلید', {
    position: { x: originX + pt.dividerX - pt.thickness / 2 - 0.025, y: floorY + 1.35, z: originZ + 1.0 },
    rotation: { x: 0, y: -90, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  // --- Lanterns (user-asset kerosene on the desk + two shell lanterns) ------
  // Corridor lantern on the divider's jail face, mid-corridor.
  push(SHERIFF_OBJECT_IDS.corridorLantern, 'sheriff-lantern', 'کلانتری — چراغ راهرو', {
    position: { x: originX + pt.dividerX + pt.thickness / 2 + 0.005, y: floorY + 1.85, z: originZ - 0.5 },
    rotation: { x: 0, y: 90, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Exterior lantern beside the front door, above the porch rail line.
  push(SHERIFF_OBJECT_IDS.exteriorLantern, 'sheriff-lantern', 'کلانتری — چراغ بیرونی', {
    position: { x: originX - 1.72, y: floorY + 2.2, z: originZ + L.depth / 2 + 0.005 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  return defs;
}
