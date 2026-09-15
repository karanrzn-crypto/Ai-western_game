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
 * Interior flow (user spec §B.1):
 *   FRONT DOOR → LOBBY (rug, 2 marble columns, grandfather clock, lamps)
 *   → TELLER COUNTER (+ cage above, dressed with coins/money bag)
 *   → SECURE BACK AREA (vault door in the rear wall, safe-deposit wall,
 *   floor safe) + BANKER OFFICE (desk + chair, west rear corner).
 * The vault door sits east of the counter line so it is visible straight
 * from the entrance over the counter's east end.
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
  lampEastSecure: bankUuid('1e'),
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

  // --- Teller line (public side faces the door; vault sight-line kept east) ---
  push(BANK_OBJECT_IDS.tellerCounter, 'teller-counter', 'بانک — پیشخوان تحویل', {
    position: { x: originX - 1.0, y: floorY, z: originZ - 0.75 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });
  // Cage sits ON the counter (base raised 5 mm so its bottom rail never
  // lands coplanar with the counter's brass tray; the rail still sinks into
  // the marble top and the posts emerge from the rail — nothing floats).
  push(BANK_OBJECT_IDS.tellerCage, 'teller-cage', 'بانک — قفس تحویل', {
    position: { x: originX - 1.0, y: floorY + 1.205, z: originZ - 0.75 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  // --- Vault (rear wall, east of the counter line — visible from the door) ----
  push(BANK_OBJECT_IDS.vaultDoor, 'bank-vault-door', 'بانک — در گاوصندوق', {
    position: { x: originX + 2.7, y: floorY, z: originZ - 4.3 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });

  // --- Safe-deposit wall (east wall, secure section, faces west into the room).
  // Panel bottom (backing at local y 0.32) grounded exactly on the floor.
  push(BANK_OBJECT_IDS.safeDepositWall, 'safe-deposit-wall', 'بانک — دیوار صندوق امانات', {
    position: { x: originX + 5.8, y: floorY - 0.32, z: originZ - 2.6 },
    rotation: { x: 0, y: -90, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  // --- Floor safe (rear-east corner, door turned toward the room) --------------
  push(BANK_OBJECT_IDS.floorSafe, 'floor-safe', 'بانک — گاوصندوق زمینی', {
    position: { x: originX + 4.55, y: floorY, z: originZ - 3.8 },
    rotation: { x: 0, y: -45, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });

  // --- Banker office (semi-private, west rear corner) --------------------------
  push(BANK_OBJECT_IDS.bankersDesk, 'bankers-desk', 'بانک — میز مدیر', {
    position: { x: originX - 4.15, y: floorY, z: originZ - 2.55 },
    rotation: { x: 0, y: 35, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: true });
  // Chair behind the desk (banker side), facing the desktop.
  push(BANK_OBJECT_IDS.bankersChair, 'bankers-chair', 'بانک — صندلی مدیر', {
    position: { x: originX - 4.72, y: floorY, z: originZ - 3.18 },
    rotation: { x: 0, y: 215, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Interior BANK sign — wall-mounted above the desk on the west wall.
  push(BANK_OBJECT_IDS.bankSign, 'bank-sign', 'بانک — تابلو داخلی', {
    position: { x: originX - 5.79, y: floorY + 2.0, z: originZ - 2.55 },
    rotation: { x: 0, y: 90, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  // --- Lobby (open entrance area) ----------------------------------------------
  // Grandfather clock against the west wall, face turned into the room.
  // z = origin + 0.2 stands it in the CLEAR wall span between the two west
  // side windows (world z −24..−25 and −21..−22) — its old spot (z + 1.6)
  // planted the cabinet directly in front of the south-west window.
  push(BANK_OBJECT_IDS.grandfatherClock, 'grandfather-clock', 'بانک — ساعت دیواری', {
    position: { x: originX - 5.65, y: floorY, z: originZ + 0.2 },
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

  // --- Gas wall lamps (3 → warm restrained light; desk lamp adds a 4th) --------
  // The lamp's bracket tab presses flat against ±X walls: west wall rotY = 0
  // (arm swings +X into the room), east wall rotY = 180. 5 mm off the wall
  // face so nothing is coplanar with the masonry.
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
  push(BANK_OBJECT_IDS.lampEastSecure, 'gas-wall-lamp', 'بانک — چراغ دیواری ۳', {
    position: { x: originX + 5.78, y: floorY + 1.75, z: originZ - 0.9 },
    rotation: { x: 0, y: 180, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  // --- Money bags / coin stacks (dressed, never scattered) ---------------------
  // Counter top dressing east of the cage's service window (window strip
  // [−1.35, −0.65] stays clear working space).
  push(BANK_OBJECT_IDS.counterMoneyBag, 'money-bag', 'بانک — کیسه پول پیشخوان', {
    position: { x: originX + 0.25, y: floorY + 1.2, z: originZ - 0.85 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  push(BANK_OBJECT_IDS.counterCoins1, 'coin-stack', 'بانک — سکه پیشخوان ۱', {
    position: { x: originX - 0.1, y: floorY + 1.2, z: originZ - 0.58 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  push(BANK_OBJECT_IDS.counterCoins2, 'coin-stack', 'بانک — سکه پیشخوان ۲', {
    position: { x: originX - 0.38, y: floorY + 1.2, z: originZ - 0.92 },
    rotation: { x: 0, y: 40, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // Secure floor: two bags beside the vault (east of it, clear of its AABB).
  push(BANK_OBJECT_IDS.vaultMoneyBag1, 'money-bag', 'بانک — کیسه پول گاوصندوق ۱', {
    position: { x: originX + 1.7, y: floorY, z: originZ - 3.5 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  push(BANK_OBJECT_IDS.vaultMoneyBag2, 'money-bag', 'بانک — کیسه پول گاوصندوق ۲', {
    position: { x: originX + 2.1, y: floorY, z: originZ - 3.72 },
    rotation: { x: 0, y: 70, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });
  // One coin stack on the banker's desktop (top at floorY + 0.775).
  push(BANK_OBJECT_IDS.deskCoinStack, 'coin-stack', 'بانک — سکه میز مدیر', {
    position: { x: originX - 4.35, y: floorY + 0.775, z: originZ - 2.35 },
    rotation: identity(),
    scale: { x: 1, y: 1, z: 1 },
  }, { collider: false });

  return defs;
}
