/**
 * src/assets/bank/BankLayout.ts
 * -----------------------------------------------------------------------------
 * Single source of truth for the bank's PLACEMENT data (mirrors SaloonLayout).
 *
 * Two consumers read this module and MUST never disagree:
 *   1. game/playable-map.ts  — registers every bank object in the
 *      SceneStateManager (each entry gets its own UUID and collider metadata).
 *   2. tests/bank-assets.test.ts — asserts entrance openness, wall/stair
 *      colliders, decor non-colliders and walkability against the SAME list.
 *
 * Coordinate conventions (identical to the saloon)
 * ------------------------------------------------
 * - Building-local numbers (BANK_LAYOUT) are relative to the footprint
 *   CENTER on the ground (y = 0), +Z pointing at the ENTRANCE (south facade).
 * - Walls are centered ON the footprint edges; a wall of thickness t spans
 *   [edge − t/2, edge + t/2].
 * - Colliders are derived ONLY from the registered transform (unit box ×
 *   scale, yaw-aware — see CollisionWorld). Walls/steps/landing/floor are
 *   unit-box factories whose transform scale IS their size, so collider and
 *   visual can never disagree. Every decorative object carries
 *   `collider: false` explicitly.
 *
 * Interior flow (final manager-office revision — user Final transforms):
 *   FRONT DOOR → LOBBY (rug, 2 marble columns, grandfather clock, lamps)
 *   → TELLER COUNTER (+ cage above, dressed east of its service window)
 *   → staff strip behind the counter → barred iron SECURE GATE filling the
 *   manager doorway (E to open — collider released while swung open)
 *   → MANAGER OFFICE (desk + chair + interior BANK sign, desk lamp)
 *   → the BIG VAULT DOOR on the office/vault divider's WEST (office) face —
 *   the ONLY way into the VAULT ROOM: E swings it open (collider released),
 *   the player walks the masonry doorway behind it. The old open slot in the
 *   south line is SEALED — the user Final widened the middle segment to run
 *   from the gate clear to the south-east segment.
 * Every partition segment, doorway and slot is derived from
 * BANK_LAYOUT.partitions — the ONE placement source for the private rooms.
 * -----------------------------------------------------------------------------
 */

import type { ObjectDefinition } from '../../core/types.js';

/** Building-local metric layout of the bank shell (meters, +Z = entrance). */
export const BANK_LAYOUT = Object.freeze({
  /** Footprint: x ∈ [−w/2, w/2], z ∈ [−d/2, d/2] (d/2 = entrance side). */
  width: 12,
  depth: 9,
  /** Masonry wall top (interior ceiling = roof slab underside at this y). */
  wallHeight: 4.8,
  wallThickness: 0.35,
  /** Grand central doorway cut into the south wall, centered on x = 0. */
  doorWidth: 2.2,
  doorHeight: 2.5, // measured from the interior floor (top of landing)
  /** Interior floor slab top — the whole public floor is elevated. */
  floorTop: 0.6,
  floorSlabThickness: 0.6,
  /** Broad stone stairs: 3 steps × 0.15 rise (player stepHeight is 0.35). */
  steps: Object.freeze({
    count: 3,
    rise: 0.15,
    tread: 0.45,
    width: 5.0,
  }),
  /** Front landing (stylobate) carrying the four columns, in FRONT of the facade. */
  landing: Object.freeze({
    width: 8.8,
    depth: 1.2, // from the facade outer face southward
  }),
  /** Four classical columns, symmetric around the centered entrance. */
  columns: Object.freeze({
    xs: [-3.65, -1.9, 1.9, 3.65] as const,
    z: 5.35,
    plinthSize: 0.62,
    plinthHeight: 0.5,
    shaftRadius: 0.27,
    flutes: 12,
  }),
  /** Entablature above the capitals + triangular pediment. */
  entablature: Object.freeze({
    halfWidth: 4.5,
    bottomY: 5.2,
    friezeTopY: 5.95,
    topY: 6.18,
    zFront: 5.9,
    zBack: 4.35,
  }),
  pediment: Object.freeze({
    halfWidth: 4.7,
    apexHeight: 1.32,
    zFront: 6.0,
    zBack: 4.45,
  }),
  /** Facade windows flanking the entrance (one tall window per side).
   *  Center offset 2.775 = exact middle of the intercolumniation bay between
   *  the door-side column (±1.9) and the outer column (±3.65), so the glass
   *  clears both column shafts and the window reads as bay-centered. */
  window: Object.freeze({
    width: 1.0,
    height: 2.1,
    sillY: 1.5, // glass bottom (interior floor is at 0.6)
    centersFromDoor: [2.775] as const,
  }),
  /** Simpler side windows (2 per side wall). */
  sideWindow: Object.freeze({
    width: 1.0,
    height: 1.9,
    sillY: 1.6,
    centers: [-1.5, 1.5] as const,
  }),
  roofOverhang: 0.25,
  roofSlabTop: 5.02,
  /** Interior partitions — single source of truth for the private rooms
   *  (final user Final-transform revision).
   *  Manager office: the west rear room bounded by a south line (with the
   *  barred-gate manager doorway at its center-west) and an east wall at
   *  x = 2.723; the vault room fills the office's EAST end (west wall at
   *  x = −0.2) and is entered ONLY through the big vault door mounted on the
   *  divider's west (office) face — the user Final widened the south line's
   *  middle segment until it sealed the old open slot. All numbers are
   *  building-local and match the user Final data (world minus BANK_SITE).
   *  Junction discipline: segments end AT faces (back-to-back, never
   *  overlapping) — the only deviations from the raw user numbers are
   *  millimetric end trims buried inside junctions, plus ONE principled
   *  trim: the middle segment's raw west end (−1.427) would eat 24 cm of
   *  the iron gate, so it seats at the gate's east jamb (−1.19) instead. */
  partitions: Object.freeze({
    thickness: 0.18,
    height: 4.8,
    /** z of the office/vault south line. */
    southZ: -1.6,
    /** Manager doorway — the barred iron gate fills it. */
    officeDoor: Object.freeze({ xMin: -2.2, xMax: -1.2 }),
    /** Manager door header above the gate: y ∈ [2.75, 4.95] (top buried in
     *  the roof-slab band [4.8, 5.02], so nothing pokes through the roof).
     *  xMin derives from the south wall's exact east end (officeDoor.xMin)
     *  so the two plaster boxes meet back-to-back with zero overlap. */
    officeHeader: Object.freeze({ xMin: -2.2, xMax: -1.19, yMin: 2.75, yMax: 4.95 }),
    /** Full-height middle segment: gate → south-east segment. User Final
     *  world center x 1.873 (local −0.127), width 2.6 ⇒ raw span
     *  [−1.427, 1.173]. The raw west end overlaps the iron gate's east jamb
     *  by 0.237 m, so it is TRIMMED to the gate jamb seat (−1.19, the
     *  officeHeader's east face) — the gate's jamb buries 5 mm into the
     *  masonry, exactly like a door frame set into a wall. The east end is
     *  the user's exact value and runs into the south-east segment face. */
    southMid: Object.freeze({ xMin: -1.19, xMax: 1.173 }),
    /** South-line east segment: middle segment → office east wall face. */
    southEast: Object.freeze({ xMin: 1.173, xMax: 2.633 }),
    /** Manager office / vault room EAST wall (center x, 0.18 thick). */
    eastX: 2.723,
    /** East wall span between junction faces (rear wall face → south line). */
    eastZ: Object.freeze({ min: -4.325, max: -1.5105 }),
    /** Vault room WEST wall (center x, 0.30 thick) — the office/vault
     *  divider. The big vault door hangs on its WEST (office) face, so the
     *  wall carries a real masonry DOORWAY and is built from three segments:
     *  north (rear wall face → doorway), the doorway itself, south
     *  (doorway → the middle segment's north face). */
    vaultWestX: -0.2,
    vaultWestThickness: 0.3,
    /** Divider NORTH segment span (rear wall inner face → doorway). */
    vaultWestZ: Object.freeze({ min: -4.325, max: -3.62 }),
    /** Divider SOUTH segment span (doorway → middle segment north face). */
    vaultWestSouthZ: Object.freeze({ min: -2.38, max: -1.69 }),
    /** Masonry doorway cut into the divider for the vault door, centered on
     *  the door z. Sized to the door's iron mounting plate (which seals the
     *  circle-vs-rectangle corners): 1.24 m wide × 2.34 m tall off the slab. */
    vaultDoorway: Object.freeze({ zMin: -3.62, zMax: -2.38, yMax: 2.94 }),
    /** Big vault door placement — user Final world (1.475, 0.600, −26.000),
     *  rotY −90 ⇒ local (−0.525, 0.600, −3.000). The −0.525 is principled:
     *  divider west face (−0.35) − 0.175 frame depth, so the deepest frame
     *  ring's back edge seats exactly ON the masonry face. */
    vaultDoor: Object.freeze({ x: -0.525, y: 0.6, z: -3.0, rotY: -90 }),
  }),
});

/** World-space anchor of the bank: FAR (south) side of the central town
 *  square, flanking the stable road's north gap; the map assembly yaws it
 *  180° so the columned facade faces north onto the square. */
export const BANK_SITE = Object.freeze({ x: -8, z: 14 });

/** Canonical hex UUID block for the bank (map uses 10000000-…-b000-…). */
const BANK_UUID_BASE = '10000000-0000-4000-b000-0000000000';

function bankUuid(suffix: string): string {
  return `${BANK_UUID_BASE}${suffix}`;
}

/** Object ids inside the bank block — tests key off these names. */
export const BANK_OBJECT_IDS = Object.freeze({
  building: bankUuid('01'),
  floor: bankUuid('02'),
  wallRear: bankUuid('03'),
  wallWest: bankUuid('04'),
  wallEast: bankUuid('05'),
  wallFrontWest: bankUuid('06'),
  wallFrontEast: bankUuid('07'),
  wallFrontHeader: bankUuid('08'),
  atticWall: bankUuid('09'),
  landing: bankUuid('0a'),
  step1: bankUuid('0b'),
  step2: bankUuid('0c'),
  step3: bankUuid('0d'),
  threshold: bankUuid('0e'),
  tellerCounter: bankUuid('10'),
  tellerCage: bankUuid('11'),
  vaultDoor: bankUuid('12'),
  safeDepositWall: bankUuid('13'),
  floorSafe: bankUuid('14'),
  bankersDesk: bankUuid('15'),
  bankersChair: bankUuid('16'),
  grandfatherClock: bankUuid('17'),
  columnWest: bankUuid('18'),
  columnEast: bankUuid('19'),
  floorRug: bankUuid('1a'),
  bankSign: bankUuid('1b'),
  lampWestLobby: bankUuid('1c'),
  lampEastLobby: bankUuid('1d'),
  lampOffice: bankUuid('2f'),
  lampVault: bankUuid('1e'),
  partitionOfficeSouth: bankUuid('26'),
  partitionOfficeSouthEast: bankUuid('2e'),
  partitionOfficeEast: bankUuid('27'),
  partitionVaultWest: bankUuid('28'),
  partitionVaultWestSouth: bankUuid('30'),
  partitionVaultWestHeader: bankUuid('31'),
  secureGate: bankUuid('2b'),
  partitionOfficeHeader: bankUuid('2c'),
  partitionVaultHeader: bankUuid('2d'),
  counterMoneyBag: bankUuid('20'),
  counterCoins1: bankUuid('21'),
  counterCoins2: bankUuid('22'),
  vaultMoneyBag1: bankUuid('23'),
  vaultMoneyBag2: bankUuid('24'),
  deskCoinStack: bankUuid('25'),
  lampVaultWest: bankUuid('32'),
});

const identity = () => ({ x: 0, y: 0, z: 0 });

/**
 * Every managed object the bank adds to the playable map.
 * Positions are world-space, anchored at (originX, originZ) = footprint
 * CENTER; interior props sit on the floor slab (top at BANK_LAYOUT.floorTop).
 *
 * Collider policy (CollisionWorld reads ONLY these metadata flags):
 *   - shell walls, floor slab, landing, steps → collider: true (real
 *     masonry; the steps' 0.2 m rises are climbable via player stepHeight)
 *   - solid banking furniture (teller counter, vault, floor safe, desk) → true
 *   - shell kit, wall-mounted fixtures, seats, small decor → false
 */
export function buildBankMapObjects(originX: number, originZ: number): ObjectDefinition[] {
  const L = BANK_LAYOUT;
  const floorY = L.floorTop; // interior floor slab top
  const t = L.wallThickness;

  const defs: ObjectDefinition[] = [];
  const push = (
    uuid: string,
    assetType: string,
    name: string,
    transform: ObjectDefinition['transform'],
    metadata: Record<string, unknown>,
  ): void => {
    defs.push({ uuid, assetType, transform, metadata: { name, editable: true, ...metadata } });
  };

  // --- Shell ------------------------------------------------------------------
  // One managed object for the non-colliding shell kit: roof, cornices,
  // entablature + BANK frieze letters, pediment + crest, four classical
  // columns, entrance surround (jambs/lintel/arch/keystone), walnut doors
  // held open, facade + side window assemblies, quoins. Its own transform
  // scale is meaningless for collision, so collider: false — the REAL walls
  // below carry the colliders.
  push(BANK_OBJECT_IDS.building, 'bank-building', 'بانک — بدنه ساختمان', {
    position: { x: originX, y: 0, z: originZ },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, {
    collider: false,
    width: L.width,
    depth: L.depth,
    height: L.wallHeight,
    doorWidth: L.doorWidth,
  });

  // --- Interior floor slab (unit box × scale → exact collider) ----------------
  // Spans between the wall inner faces (1 cm gaps like the saloon floor).
  const floorW = L.width - t - 0.05;
  const floorD = L.depth - t - 0.05;
  push(BANK_OBJECT_IDS.floor, 'bank-floor', 'بانک — کف داخل', {
    position: { x: originX, y: L.floorSlabThickness / 2, z: originZ },
    rotation: identity(),
    scale: { x: floorW, y: L.floorSlabThickness, z: floorD },
  }, { collider: true, floorRepeat: [Math.round(floorW / 1.2), Math.round(floorD / 1.2)] });

  // --- Walls (each a plain box of exactly its scale → collider == visual) -----
  push(BANK_OBJECT_IDS.wallRear, 'bank-wall', 'بانک — دیوار شمالی', {
    position: { x: originX, y: L.wallHeight / 2, z: originZ - L.depth / 2 },
    rotation: identity(),
    scale: { x: L.width, y: L.wallHeight, z: t },
  }, { collider: true, brickRepeat: [12, 8] });
  // Side walls span BETWEEN the rear/front walls (never under them).
  push(BANK_OBJECT_IDS.wallWest, 'bank-wall', 'بانک — دیوار غربی', {
    position: { x: originX - L.width / 2, y: L.wallHeight / 2, z: originZ },
    rotation: identity(),
    scale: { x: t, y: L.wallHeight, z: L.depth - t },
  }, { collider: true, brickRepeat: [8.6, 8] });
  push(BANK_OBJECT_IDS.wallEast, 'bank-wall', 'بانک — دیوار شرقی', {
    position: { x: originX + L.width / 2, y: L.wallHeight / 2, z: originZ },
    rotation: identity(),
    scale: { x: t, y: L.wallHeight, z: L.depth - t },
  }, { collider: true, brickRepeat: [8.6, 8] });
  // South (entrance) wall split around the doorway — the gap IS the entrance.
  const segW = (L.width - L.doorWidth) / 2;
  const segCx = L.doorWidth / 2 + segW / 2;
  push(BANK_OBJECT_IDS.wallFrontWest, 'bank-wall', 'بانک — نمای جلویی (غرب در)', {
    position: { x: originX - segCx, y: L.wallHeight / 2, z: originZ + L.depth / 2 },
    rotation: identity(),
    scale: { x: segW, y: L.wallHeight, z: t },
  }, { collider: true, brickRepeat: [4.9, 8] });
  push(BANK_OBJECT_IDS.wallFrontEast, 'bank-wall', 'بانک — نمای جلویی (شرق در)', {
    position: { x: originX + segCx, y: L.wallHeight / 2, z: originZ + L.depth / 2 },
    rotation: identity(),
    scale: { x: segW, y: L.wallHeight, z: t },
  }, { collider: true, brickRepeat: [4.9, 8] });
  push(BANK_OBJECT_IDS.wallFrontHeader, 'bank-wall', 'بانک — بالای در', {
    position: {
      x: originX,
      y: L.floorTop + L.doorHeight + (L.wallHeight - L.floorTop - L.doorHeight) / 2,
      z: originZ + L.depth / 2,
    },
    rotation: identity(),
    scale: { x: L.doorWidth, y: L.wallHeight - L.floorTop - L.doorHeight, z: t },
  }, { collider: true, brickRepeat: [2.2, 2.8] });
  // Attic story behind the entablature/pediment (rises from the roof top).
  push(BANK_OBJECT_IDS.atticWall, 'bank-wall', 'بانک — دیوار اتاق زیر شیروانی', {
    position: { x: originX, y: L.roofSlabTop + (L.entablature.friezeTopY - 0.01 - L.roofSlabTop) / 2, z: originZ + 4.4975 },
    rotation: identity(),
    scale: { x: 8.9, y: L.entablature.friezeTopY - 0.01 - L.roofSlabTop, z: 0.345 },
  }, { collider: true, brickRepeat: [8.9, 1.6] });

  // --- Front stairs + landing (unit boxes → exact colliders) ------------------
  // The landing sits IN FRONT of the facade (its north edge = wall outer
  // face) and the three steps descend southward onto the street; the landing
  // top equals the interior floor top, so the doorway thresholds seamlessly.
  {
    const wallFaceZ = L.depth / 2 + L.wallThickness / 2; // 4.675
    const landingFrontZ = wallFaceZ + L.landing.depth; // 5.875
    push(BANK_OBJECT_IDS.landing, 'bank-stair', 'بانک — سکوی جلو', {
      position: {
        x: originX,
        y: L.floorTop / 2,
        z: originZ + wallFaceZ + L.landing.depth / 2,
      },
      rotation: identity(),
      scale: { x: L.landing.width, y: L.floorTop, z: L.landing.depth },
    }, { collider: true, stoneRepeat: [8.8, 0.6] });
    const stepYs = [1, 2, 3].map((i) => L.steps.rise * i);
    stepYs.forEach((topY, i) => {
      // i = 0 is the lowest, southernmost step; i = count-1 abuts the landing.
      const zMin = landingFrontZ + L.steps.tread * (L.steps.count - 1 - i);
      push(BANK_OBJECT_IDS[`step${i + 1}` as 'step1'], 'bank-stair', `بانک — پله ${i + 1}`, {
        position: { x: originX, y: topY / 2, z: originZ + zMin + L.steps.tread / 2 },
        rotation: identity(),
        scale: { x: L.steps.width, y: topY, z: L.steps.tread },
      }, { collider: true, stoneRepeat: [5, 0.5] });
    });
    // Doorway threshold: carries the elevated floor across the wall band so
    // the player can never fall through the entrance gap (interior slab ↔
    // threshold ↔ landing are contiguous at the same top height).
    push(BANK_OBJECT_IDS.threshold, 'bank-floor', 'بانک — آستانه در', {
      position: { x: originX, y: L.floorTop / 2, z: originZ + (floorD / 2 + wallFaceZ) / 2 },
      rotation: identity(),
      scale: { x: L.doorWidth - 0.04, y: L.floorTop, z: wallFaceZ - floorD / 2 },
    }, { collider: true });
  }

  // ===========================================================================
  // INTERIOR — manager-office revision
  // ---------------------------------------------------------------------------
  // Zones (building-local): lobby z ∈ [−1.6, 4.325] (public) · staff strip
  // behind the teller counter · manager office x ∈ [−5.825, −0.35],
  // z ∈ [−4.325, −1.51] · secure vault enclosure x ∈ [−0.05, 2.633],
  // z ∈ [−4.325, −1.6] east of the divider — entered ONLY through the big
  // vault door on the divider's office face.
  // ===========================================================================

  // --- Teller line (freestanding island; service window faces the door) ------
  // z = −0.1 keeps a ≥0.9 m staff strip between the counter and the office
  // south wall (z = −1.51) so the player can always reach the office doorway.
  push(BANK_OBJECT_IDS.tellerCounter, 'teller-counter', 'بانک — پیشخوان تحویل', {
    position: { x: originX, y: floorY, z: originZ - 0.1 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });
  // Cage sits ON the counter (base raised so its bottom rail sinks into the
  // marble top and the posts emerge from it — nothing floats, nothing
  // coplanar). Same footprint center as the counter.
  push(BANK_OBJECT_IDS.tellerCage, 'teller-cage', 'بانک — قفس تحویل', {
    position: { x: originX, y: floorY + 1.205, z: originZ - 0.1 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  // --- Manager office + vault room partitions (masonry unit boxes) -----------
  // Final user-transform revision. The private suite spans the rear band:
  //   MANAGER OFFICE x ∈ [−5.825, −0.35] · VAULT ROOM x ∈ [−0.05, 2.633]
  // separated by the 0.30 m vault west wall, both entered from the south
  // line (z = −1.6): the barred iron gate fills the manager doorway, the
  // open full-height slot is the vault entrance.
  // Junction discipline (z-fight scan): a perpendicular segment always ends
  // AT the other's face (back-to-back) and never shares a max/min plane with
  // an overlapping box — the constants' raw user values are therefore only
  // ever trimmed by millimetres at buried junction ends, never moved.
  {
    const P = L.partitions;
    const pt = P.thickness;
    // Partitions rise from the floor slab TOP (y = floorTop) to the ceiling —
    // their bottom face rests back-to-back on the slab, never sharing its y=0
    // underside plane.
    const wallY = (floorY + P.height) / 2;
    const wallH = P.height - floorY;
    // South line, west segment: west inner wall → manager doorway.
    push(BANK_OBJECT_IDS.partitionOfficeSouth, 'bank-wall', 'بانک — دیوار دفتر مدیر (جنوبی)', {
      position: { x: originX + (-5.825 + P.officeDoor.xMin) / 2, y: wallY, z: originZ + P.southZ },
      rotation: identity(),
      scale: { x: P.officeDoor.xMin - -5.825, y: wallH, z: pt },
    }, { collider: true, plaster: true, brickRepeat: [3.3, 4] });
    // Manager door header above the iron gate (user Final: y 2.75 → 4.95 —
    // the top face buries into the roof-slab band [4.8, 5.02]).
    push(BANK_OBJECT_IDS.partitionOfficeHeader, 'bank-wall', 'بانک — بالای در دفتر مدیر', {
      position: {
        x: originX + (P.officeHeader.xMin + P.officeHeader.xMax) / 2,
        y: (P.officeHeader.yMin + P.officeHeader.yMax) / 2,
        z: originZ + P.southZ,
      },
      rotation: identity(),
      scale: {
        x: P.officeHeader.xMax - P.officeHeader.xMin,
        y: P.officeHeader.yMax - P.officeHeader.yMin,
        z: pt,
      },
    }, { collider: true, plaster: true, brickRepeat: [1, 2] });
    // South line, full-height middle segment: gate → south-east segment
    // (user Final world center 1.873, width 2.6; raw west end −1.427 trimmed
    // to the gate jamb seat −1.19 so the iron gate never gets eaten — see
    // partitions.southMid. y 0.2 → 4.8 — the bottom 0.4 m buries into the
    // floor slab, the top meets the ceiling exactly). The old open vault
    // entrance slot is SEALED under this segment per the user Final data.
    push(BANK_OBJECT_IDS.partitionVaultHeader, 'bank-wall', 'بانک — دیوار میانی خط جنوبی', {
      position: {
        x: originX + (P.southMid.xMin + P.southMid.xMax) / 2,
        y: 2.5,
        z: originZ + P.southZ,
      },
      rotation: identity(),
      scale: { x: P.southMid.xMax - P.southMid.xMin, y: 4.6, z: pt },
    }, { collider: true, plaster: true, brickRepeat: [2.4, 4.6] });
    // South line, east segment: middle segment → office east wall face.
    push(BANK_OBJECT_IDS.partitionOfficeSouthEast, 'bank-wall', 'بانک — دیوار دفتر مدیر (جنوبی ۲)', {
      position: { x: originX + (P.southEast.xMin + P.southEast.xMax) / 2, y: wallY, z: originZ + P.southZ },
      rotation: identity(),
      scale: { x: P.southEast.xMax - P.southEast.xMin, y: wallH, z: pt },
    }, { collider: true, plaster: true, brickRepeat: [1.3, 4] });
    // Office east wall (also the vault room's east wall): rear wall inner
    // face → just past the south line's south face (user Final span, north
    // end trimmed 0.5 mm to meet the rear wall back-to-back).
    push(BANK_OBJECT_IDS.partitionOfficeEast, 'bank-wall', 'بانک — دیوار دفتر مدیر (شرقی)', {
      position: {
        x: originX + P.eastX,
        y: wallY,
        z: originZ + (P.eastZ.min + P.eastZ.max) / 2,
      },
      rotation: identity(),
      scale: { x: pt, y: wallH, z: P.eastZ.max - P.eastZ.min },
    }, { collider: true, plaster: true, brickRepeat: [2.6, 4] });
    // Vault room west wall (the office/vault divider) — THREE masonry
    // segments around the big vault door's real doorway (rear wall inner
    // face → doorway → the middle segment's north face; user Final 0.30 m
    // thick, ends trimmed to the junction faces so nothing overlaps).
    push(BANK_OBJECT_IDS.partitionVaultWest, 'bank-wall', 'بانک — دیوار گاوصندوق (غربی)', {
      position: {
        x: originX + P.vaultWestX,
        y: wallY,
        z: originZ + (P.vaultWestZ.min + P.vaultWestZ.max) / 2,
      },
      rotation: identity(),
      scale: { x: P.vaultWestThickness, y: wallH, z: P.vaultWestZ.max - P.vaultWestZ.min },
    }, { collider: true, plaster: true, brickRepeat: [1.7, 4] });
    push(BANK_OBJECT_IDS.partitionVaultWestSouth, 'bank-wall', 'بانک — دیوار گاوصندوق (غربی ۲)', {
      position: {
        x: originX + P.vaultWestX,
        y: wallY,
        z: originZ + (P.vaultWestSouthZ.min + P.vaultWestSouthZ.max) / 2,
      },
      rotation: identity(),
      scale: { x: P.vaultWestThickness, y: wallH, z: P.vaultWestSouthZ.max - P.vaultWestSouthZ.min },
    }, { collider: true, plaster: true, brickRepeat: [1.7, 4] });
    // Masonry header over the vault doorway (doorway top → the ceiling),
    // resting back-to-back on the slab line like the other partitions.
    push(BANK_OBJECT_IDS.partitionVaultWestHeader, 'bank-wall', 'بانک — بالای در گاوصندوق', {
      position: {
        x: originX + P.vaultWestX,
        y: (P.vaultDoorway.yMax + P.height) / 2,
        z: originZ + (P.vaultDoorway.zMin + P.vaultDoorway.zMax) / 2,
      },
      rotation: identity(),
      scale: {
        x: P.vaultWestThickness,
        y: P.height - P.vaultDoorway.yMax,
        z: P.vaultDoorway.zMax - P.vaultDoorway.zMin,
      },
    }, { collider: true, plaster: true, brickRepeat: [1.2, 1.9] });
    // Barred iron gate filling the manager doorway — CLOSED by default and
    // genuinely openable (E): the interaction swings both leaves toward the
    // lobby and releases the collider so the player walks through.
    // 5 mm seat above the slab: the jamb blocks must never land coplanar with
    // the partition bottoms (same discipline as the cage on the counter).
    const gateCx = (P.officeDoor.xMin + P.officeDoor.xMax) / 2;
    push(BANK_OBJECT_IDS.secureGate, 'secure-gate', 'بانک — در آهنی دفتر مدیر', {
      position: { x: originX + gateCx, y: floorY + 0.005, z: originZ + P.southZ },
      rotation: identity(),
      scale: { x: 1, y: 1, z: 1 },
    }, { collider: true });
  }

  // --- Vault room contents (user Final transforms) -----------------------------
  // Big vault door ON the office/vault divider's WEST (office) face — the
  // ONLY entrance to the vault room since the user Final sealed the old
  // south-line slot. User Final world (1.475, 0.600, −26.000), rotY −90 ⇒
  // local (−0.525, 0.600, −3.000). The −0.525 seats the deepest frame ring's
  // back edge exactly on the divider's west face (−0.35 − 0.175 frame
  // depth); the builder's mounting plate seals the rectangular doorway's
  // circle-vs-rectangle corners. Genuinely openable (E): the swing releases
  // the collider while the disc stands open so the player walks the masonry
  // doorway behind it (see playable-map updateVaultDoor).
  push(BANK_OBJECT_IDS.vaultDoor, 'bank-vault-door', 'بانک — در گاوصندوق', {
    position: { x: originX + L.partitions.vaultDoor.x, y: L.partitions.vaultDoor.y, z: originZ + L.partitions.vaultDoor.z },
    rotation: { x: 0, y: L.partitions.vaultDoor.rotY, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });
  // Safe-deposit wall on the VAULT ROOM's east wall (west face), doors facing
  // west into the room (user Final rotY = 268 — a 2° skew keeps the brass
  // doors off coplanar with the masonry). Scale 1.1 per user Final; the
  // builder origin sits at the backing's base, so y = 0.59 grounds it
  // (base 1 cm below the floor top — seated, never floating).
  push(BANK_OBJECT_IDS.safeDepositWall, 'safe-deposit-wall', 'بانک — دیوار صندوق امانات', {
    position: { x: originX + 2.573, y: 0.59, z: originZ - 3.092 },
    rotation: { x: 0, y: 268, z: 0 },
    scale: { x: 1.1, y: 1.1, z: 1.1 },
  }, { collider: false });
  // Floor safe in the vault room's south-east corner (user Final; rotY
  // (180, 0, 180) ≡ yaw 180 — dial turned north). Its yaw-conservative 1×1
  // collider covers x ∈ [3.06, 4.06] world, clear of the vault doorway lane
  // (the doorway sits at x ≤ −0.05; the safe leans on the east wall).
  push(BANK_OBJECT_IDS.floorSafe, 'floor-safe', 'بانک — گاوصندوق زمینی', {
    position: { x: originX + 1.411, y: floorY, z: originZ - 1.975 },
    rotation: { x: 180, y: 0, z: 180 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });
  // Money bags beside the vault rear wall (user Final).
  push(BANK_OBJECT_IDS.vaultMoneyBag1, 'money-bag', 'بانک — کیسه پول گاوصندوق ۱', {
    position: { x: originX + 1.015, y: floorY, z: originZ - 3.85 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  push(BANK_OBJECT_IDS.vaultMoneyBag2, 'money-bag', 'بانک — کیسه پول گاوصندوق ۲', {
    position: { x: originX + 1.73, y: 0.62, z: originZ - 3.536 },
    rotation: { x: 0, y: 70, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Gas lamp remounted on the vault west wall's EAST face, NORTH segment
  // (the old −2.485 mount now hangs inside the vault doorway — the doorway
  // spans z ∈ [−3.62, −2.38]); arm swinging east into the vault room
  // (rotY = 0 maps the +X arm to +X); backplate block sits 5 mm off the
  // wall face (no coplanar masonry contact).
  push(BANK_OBJECT_IDS.lampVault, 'gas-wall-lamp', 'بانک — چراغ گاوصندوق', {
    position: { x: originX - 0.005, y: floorY + 1.75, z: originZ - 3.9 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Second divider lamp — user request "یک چراغ هم روی دیوار گاوصندوق (غربی)":
  // mounted on the divider's WEST face (office side, south of the vault
  // doorway, lighting the big door), arm swinging west into the office
  // (rotY = 180 maps the +X arm to −X); backplate 5 mm off the wall face.
  push(BANK_OBJECT_IDS.lampVaultWest, 'gas-wall-lamp', 'بانک — چراغ دیوار گاوصندوق', {
    position: {
      x: originX + L.partitions.vaultWestX - L.partitions.vaultWestThickness / 2 - 0.045,
      y: floorY + 1.75,
      z: originZ - 2.1,
    },
    rotation: { x: 0, y: 180, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  // --- Manager office furniture (user Final transforms) ------------------------
  // User Final: desk rot (180, −66.052, 180) — an exact pure yaw (verified
  // quaternion-equal to yaw 246.052°) facing the desk ESE; the chair stands
  // WNW behind it (yaw 52.68°), facing the desktop. Coin on the desktop.
  push(BANK_OBJECT_IDS.bankersDesk, 'bankers-desk', 'بانک — میز مدیر', {
    position: { x: originX - 4.022, y: floorY, z: originZ - 2.7 },
    rotation: { x: 180, y: -66.052, z: 180 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });
  push(BANK_OBJECT_IDS.bankersChair, 'bankers-chair', 'بانک — صندلی مدیر', {
    position: { x: originX - 5.03, y: floorY, z: originZ - 3.119 },
    rotation: { x: 0, y: 52.68, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Coin stack on the desktop (user Final y 1.38 — 5 mm seat on the 1.375 top).
  push(BANK_OBJECT_IDS.deskCoinStack, 'coin-stack', 'بانک — سکه میز مدیر', {
    position: { x: originX - 4.0, y: 1.38, z: originZ - 2.55 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Interior BANK sign above the desk on the office's west wall, facing east.
  push(BANK_OBJECT_IDS.bankSign, 'bank-sign', 'بانک — تابلو داخلی', {
    position: { x: originX - 5.79, y: floorY + 2.0, z: originZ - 2.7 },
    rotation: { x: 0, y: 90, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  // --- Lobby (open entrance area) ----------------------------------------------
  // Grandfather clock against the west wall between the two west windows,
  // face turned east into the room.
  push(BANK_OBJECT_IDS.grandfatherClock, 'grandfather-clock', 'بانک — ساعت دیواری', {
    position: { x: originX - 5.65, y: floorY, z: originZ + 0.35 },
    rotation: { x: 0, y: 90, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Two marble columns flanking the lobby (spec: two is sufficient).
  push(BANK_OBJECT_IDS.columnWest, 'marble-column', 'بانک — ستون مرمری غربی', {
    position: { x: originX - 2.7, y: floorY, z: originZ + 1.9 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  push(BANK_OBJECT_IDS.columnEast, 'marble-column', 'بانک — ستون مرمری شرقی', {
    position: { x: originX + 2.7, y: floorY, z: originZ + 1.9 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Rug centered on the entrance path.
  push(BANK_OBJECT_IDS.floorRug, 'floor-rug', 'بانک — فرش سالن', {
    position: { x: originX, y: floorY + 0.005, z: originZ + 2.5 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  // --- Gas wall lamps (4 → warm restrained light; desk lamp adds a 5th) --------
  // The lamp's bracket block presses 5 mm off its wall face; rotY swings the
  // arm into the room (west wall 0, east wall 180, north-facing face 90).
  push(BANK_OBJECT_IDS.lampWestLobby, 'gas-wall-lamp', 'بانک — چراغ دیواری ۱', {
    position: { x: originX - 5.78, y: floorY + 1.75, z: originZ + 2.9 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  push(BANK_OBJECT_IDS.lampEastLobby, 'gas-wall-lamp', 'بانک — چراغ دیواری ۲', {
    position: { x: originX + 5.78, y: floorY + 1.75, z: originZ + 2.9 },
    rotation: { x: 0, y: 180, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Office lamp on the office south wall's NORTH face (inside the office),
  // arm swinging north to light the desk area (rotY = 90 maps the +X arm to
  // −Z). z = −1.735 seats the backplate 5 mm off the wall's north face
  // (−1.69); the old −1.475 put the origin on the lobby side with the whole
  // arm buried inside the masonry.
  push(BANK_OBJECT_IDS.lampOffice, 'gas-wall-lamp', 'بانک — چراغ دفتر مدیر', {
    position: { x: originX - 3.0, y: floorY + 1.75, z: originZ - 1.735 },
    rotation: { x: 0, y: 90, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  // --- Counter dressing (east of the cage's service window) --------------------
  // Window strip x ∈ [−0.35, 0.35] stays clear working space; marble top face
  // is at floorTop + 1.2, so dressing rests exactly on it.
  push(BANK_OBJECT_IDS.counterMoneyBag, 'money-bag', 'بانک — کیسه پول پیشخوان', {
    position: { x: originX + 0.8, y: floorY + 1.2, z: originZ - 0.15 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  push(BANK_OBJECT_IDS.counterCoins1, 'coin-stack', 'بانک — سکه پیشخوان ۱', {
    position: { x: originX + 0.5, y: floorY + 1.2, z: originZ + 0.08 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  push(BANK_OBJECT_IDS.counterCoins2, 'coin-stack', 'بانک — سکه پیشخوان ۲', {
    position: { x: originX + 0.5, y: floorY + 1.2, z: originZ - 0.38 },
    rotation: { x: 0, y: 40, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  return defs;
}
