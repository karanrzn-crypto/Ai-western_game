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
 * Interior flow (manager-office revision):
 *   FRONT DOOR → LOBBY (rug, 2 marble columns, grandfather clock, lamps)
 *   → TELLER COUNTER (+ cage above, dressed east of its service window)
 *   → staff strip behind the counter → MANAGER OFFICE (west rear room:
 *   desk + chair + interior BANK sign, walled off by two masonry partitions)
 *   → SECURE VAULT ENCLOSURE inside the office's east end, behind a barred
 *   iron gate: big vault door on the rear wall, safe-deposit wall on the
 *   enclosure's west wall, floor safe, money bags beside the vault.
 * Every partition segment, doorway and gate opening is derived from
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
  /** Interior partitions — single source of truth for the private rooms.
   *  Manager office: west rear room bounded by a south wall (with the office
   *  doorway at its east end) and an east wall; the secure vault enclosure
   *  fills the office's east end behind a barred gate in its south wall. */
  partitions: Object.freeze({
    thickness: 0.18,
    height: 4.8,
    officeSouthZ: -1.6,
    officeEastX: 0.35,
    // Doorway sits in the west half, directly south of the vault gate, so the
    // lobby → office → enclosure flow never wedges between wall faces.
    officeDoor: Object.freeze({ xMin: -2.2, xMax: -1.2 }),
    vaultWestX: -2.35,
    vaultSouthZ: -2.35,
    vaultGate: Object.freeze({ xMin: -1.9, xMax: -0.9 }),
  }),
});

/** World-space anchor of the bank on the playable map (street's north end). */
export const BANK_SITE = Object.freeze({ x: 2, z: -23 });

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
  partitionVaultSouthWest: bankUuid('29'),
  partitionVaultSouthEast: bankUuid('2a'),
  secureGate: bankUuid('2b'),
  partitionOfficeHeader: bankUuid('2c'),
  partitionVaultHeader: bankUuid('2d'),
  counterMoneyBag: bankUuid('20'),
  counterCoins1: bankUuid('21'),
  counterCoins2: bankUuid('22'),
  vaultMoneyBag1: bankUuid('23'),
  vaultMoneyBag2: bankUuid('24'),
  deskCoinStack: bankUuid('25'),
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
  // behind the teller counter · manager office x ∈ [−5.825, 0.26],
  // z ∈ [−4.325, −1.51] · secure vault enclosure x ∈ [−2.44, 0.26],
  // z ∈ [−4.325, −2.44] inside the office's east end.
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

  // --- Manager office partitions (masonry unit boxes → exact colliders) ------
  // Junction discipline (z-fight scan): a perpendicular segment always ends
  // AT the other's face (back-to-back) and never shares a max/min plane with
  // an overlapping box. The office doorway is the gap between the south
  // wall's east end (−0.85) and the east wall (0.26).
  {
    const P = L.partitions;
    const pt = P.thickness;
    const halfT = pt / 2;
    // Partitions rise from the floor slab TOP (y = floorTop) to the ceiling —
    // their bottom face rests back-to-back on the slab, never sharing its y=0
    // underside plane.
    const wallY = (floorY + P.height) / 2;
    const wallH = P.height - floorY;
    // Office south wall, west segment: west inner wall → doorway.
    push(BANK_OBJECT_IDS.partitionOfficeSouth, 'bank-wall', 'بانک — دیوار دفتر مدیر (جنوبی)', {
      position: { x: originX + (-5.825 + P.officeDoor.xMin) / 2, y: wallY, z: originZ + P.officeSouthZ },
      rotation: identity(),
      scale: { x: P.officeDoor.xMin - -5.825, y: wallH, z: pt },
    }, { collider: true, plaster: true, brickRepeat: [3.3, 4] });
    // Office south wall, east segment: doorway → office east wall face.
    push(BANK_OBJECT_IDS.partitionOfficeSouthEast, 'bank-wall', 'بانک — دیوار دفتر مدیر (جنوبی ۲)', {
      position: { x: originX + (P.officeDoor.xMax + P.officeEastX - halfT) / 2, y: wallY, z: originZ + P.officeSouthZ },
      rotation: identity(),
      scale: { x: (P.officeEastX - halfT) - P.officeDoor.xMax, y: wallH, z: pt },
    }, { collider: true, plaster: true, brickRepeat: [1.3, 4] });
    // Office doorway header (cased opening, 2.5 m clear like the facade door).
    push(BANK_OBJECT_IDS.partitionOfficeHeader, 'bank-wall', 'بانک — بالای در دفتر مدیر', {
      position: {
        x: originX + (P.officeDoor.xMin + P.officeDoor.xMax) / 2,
        y: (floorY + 2.5 + P.height) / 2,
        z: originZ + P.officeSouthZ,
      },
      rotation: identity(),
      scale: { x: P.officeDoor.xMax - P.officeDoor.xMin, y: P.height - 2.5, z: pt },
    }, { collider: true, plaster: true, brickRepeat: [1, 2] });
    // Office east wall: rear wall inner face → south wall's north face
    // (fills the L-corner; shares no coplanar max/min plane with the south
    // wall because their x-ranges never overlap).
    push(BANK_OBJECT_IDS.partitionOfficeEast, 'bank-wall', 'بانک — دیوار دفتر مدیر (شرقی)', {
      position: { x: originX + P.officeEastX, y: wallY, z: originZ + (-4.325 + P.officeSouthZ + halfT) / 2 },
      rotation: identity(),
      scale: { x: pt, y: wallH, z: (P.officeSouthZ + halfT) - -4.325 },
    }, { collider: true, plaster: true, brickRepeat: [2.6, 4] });
    // Enclosure west wall: rear wall inner face → enclosure south wall's face.
    push(BANK_OBJECT_IDS.partitionVaultWest, 'bank-wall', 'بانک — دیوار محفظه گاوصندوق (غربی)', {
      position: { x: originX + P.vaultWestX, y: wallY, z: originZ + (-4.325 + P.vaultSouthZ - halfT) / 2 },
      rotation: identity(),
      scale: { x: pt, y: wallH, z: (P.vaultSouthZ - halfT) - -4.325 },
    }, { collider: true, plaster: true, brickRepeat: [1.7, 4] });
    // Enclosure south wall — two segments flanking the barred gate opening.
    push(BANK_OBJECT_IDS.partitionVaultSouthWest, 'bank-wall', 'بانک — دیوار محفظه گاوصندوق (جنوبی ۱)', {
      position: { x: originX + (P.vaultWestX - halfT + P.vaultGate.xMin) / 2, y: wallY, z: originZ + P.vaultSouthZ },
      rotation: identity(),
      scale: { x: P.vaultGate.xMin - (P.vaultWestX - halfT), y: wallH, z: pt },
    }, { collider: true, plaster: true, brickRepeat: [0.5, 4] });
    push(BANK_OBJECT_IDS.partitionVaultSouthEast, 'bank-wall', 'بانک — دیوار محفظه گاوصندوق (جنوبی ۲)', {
      position: { x: originX + (P.vaultGate.xMax + P.officeEastX - halfT) / 2, y: wallY, z: originZ + P.vaultSouthZ },
      rotation: identity(),
      scale: { x: (P.officeEastX - halfT) - P.vaultGate.xMax, y: wallH, z: pt },
    }, { collider: true, plaster: true, brickRepeat: [1, 4] });
    // Masonry header closing the gate opening above the iron frame (the
    // frame top at floorTop + 2.12 is the header's exact bottom face).
    push(BANK_OBJECT_IDS.partitionVaultHeader, 'bank-wall', 'بانک — بالای در محفظه گاوصندوق', {
      position: {
        x: originX + (P.vaultGate.xMin + P.vaultGate.xMax) / 2,
        y: (floorY + 2.12 + P.height) / 2,
        z: originZ + P.vaultSouthZ,
      },
      rotation: identity(),
      scale: { x: P.vaultGate.xMax - P.vaultGate.xMin, y: P.height - 2.12, z: pt },
    }, { collider: true, plaster: true, brickRepeat: [1, 2.4] });
    // Barred iron gate held OPEN (visual, non-collider): the opening is the
    // secure entrance and must stay walkable. Origin 2 cm north of the wall
    // centerline so the frame never lands coplanar with the masonry.
    const gateCx = (P.vaultGate.xMin + P.vaultGate.xMax) / 2;
    push(BANK_OBJECT_IDS.secureGate, 'secure-gate', 'بانک — در آهنی محفظه گاوصندوق', {
      // 5 mm seat above the slab: the jamb blocks must never land coplanar
      // with the partition faces (same discipline as the cage on the counter).
      position: { x: originX + gateCx, y: floorY + 0.005, z: originZ + P.vaultSouthZ - 0.02 },
      rotation: identity(),
      scale: { x: 1, y: 1, z: 1 },
    }, { collider: false });
  }

  // --- Vault enclosure contents -----------------------------------------------
  // Big vault door on the enclosure's rear (north) wall, facing south into the
  // enclosure; frame rings set into the masonry, door face proud of it.
  push(BANK_OBJECT_IDS.vaultDoor, 'bank-vault-door', 'بانک — در گاوصندوق', {
    position: { x: originX - 0.95, y: floorY, z: originZ - 4.22 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });
  // Safe-deposit wall on the enclosure's west partition (east face), doors
  // facing east (rotY = +90 maps the builder's +Z door normal to +X).
  // Backing bottom rests exactly on the floor: backing spans local y
  // [0.35, 1.53], so y = floorTop − 0.35 grounds it.
  push(BANK_OBJECT_IDS.safeDepositWall, 'safe-deposit-wall', 'بانک — دیوار صندوق امانات', {
    position: { x: originX - 2.245, y: floorY - 0.35, z: originZ - 3.35 },
    rotation: { x: 0, y: 90, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Floor safe tucked into the enclosure's south-east corner (dial turned
  // toward the gate). Its yaw-conservative AABB must stay clear of the gate
  // corridor (walker window x ∈ [0.45, 0.75] around the opening), which is
  // why it hugs the east partition instead of the enclosure center.
  push(BANK_OBJECT_IDS.floorSafe, 'floor-safe', 'بانک — گاوصندوق زمینی', {
    position: { x: originX - 0.4, y: floorY, z: originZ - 2.95 },
    rotation: { x: 0, y: 45, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });
  // Money bags beside the vault door, clear of its AABB and of the deposit wall.
  push(BANK_OBJECT_IDS.vaultMoneyBag1, 'money-bag', 'بانک — کیسه پول گاوصندوق ۱', {
    position: { x: originX - 1.75, y: floorY, z: originZ - 3.85 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  push(BANK_OBJECT_IDS.vaultMoneyBag2, 'money-bag', 'بانک — کیسه پول گاوصندوق ۲', {
    position: { x: originX - 1.45, y: floorY, z: originZ - 3.62 },
    rotation: { x: 0, y: 70, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Gas lamp on the enclosure's south wall (north face), lighting the vault.
  // rotY = 90 swings the lamp arm to −Z (north, into the enclosure); backplate
  // block sits 5 mm off the wall face (no coplanar masonry contact).
  push(BANK_OBJECT_IDS.lampVault, 'gas-wall-lamp', 'بانک — چراغ محفظه گاوصندوق', {
    position: { x: originX, y: floorY + 1.75, z: originZ - 2.485 },
    rotation: { x: 0, y: 90, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  // --- Manager office furniture (west half, enclosure east) --------------------
  // Desk faces south (drawers toward the banker's side at rotY = 180); the
  // chair stands behind it (north), facing the desktop. The desk keeps a
  // ≥0.9 m walk lane to the enclosure west wall (its 1×1 collider face at
  // x = −3.4 vs the wall face at −2.44). Walking strips: north
  // z ∈ [−4.325, −3.6] and the whole south strip z ∈ [−2.44, −1.69] stay clear.
  push(BANK_OBJECT_IDS.bankersDesk, 'bankers-desk', 'بانک — میز مدیر', {
    position: { x: originX - 3.9, y: floorY, z: originZ - 2.7 },
    rotation: { x: 0, y: 180, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });
  push(BANK_OBJECT_IDS.bankersChair, 'bankers-chair', 'بانک — صندلی مدیر', {
    position: { x: originX - 3.9, y: floorY, z: originZ - 3.35 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Coin stack on the desktop's free east half (clear of ledger/inkwell/lamp).
  push(BANK_OBJECT_IDS.deskCoinStack, 'coin-stack', 'بانک — سکه میز مدیر', {
    position: { x: originX - 3.35, y: floorY + 0.775, z: originZ - 2.55 },
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
  // Office lamp on the office south wall's north face, arm swinging north to
  // light the desk area (rotY = 90 maps the lamp's +X arm to −Z).
  push(BANK_OBJECT_IDS.lampOffice, 'gas-wall-lamp', 'بانک — چراغ دفتر مدیر', {
    position: { x: originX - 3.0, y: floorY + 1.75, z: originZ - 1.475 },
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
