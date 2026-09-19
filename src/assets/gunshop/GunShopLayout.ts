/**
 * src/assets/gunshop/GunShopLayout.ts
 * -----------------------------------------------------------------------------
 * Single source of truth for the Gun Shop's PLACEMENT data — the same
 * contract as BANK_LAYOUT / SHERIFF_LAYOUT / SALOON_LAYOUT / STABLE_LAYOUT:
 *
 *   1. game/playable-map.ts registers every def emitted here.
 *   2. tests/gunshop-assets.test.ts asserts geometry/walkability/colliders
 *      against the SAME list.
 *
 * Coordinate conventions
 * ----------------------
 * - Building-local numbers (GUNSHOP_LAYOUT) are relative to the footprint
 *   CENTER on the ground (y = 0), +Z pointing at the ENTRANCE (south facade,
 *   the town-wide convention).
 * - Walls are centered ON the footprint edges; a wall of thickness t spans
 *   [edge − t/2, edge + t/2]. Colliders derive ONLY from the registered
 *   transform (unit box × scale, yaw-aware — CollisionWorld), so every wall
 *   IS a plain box of exactly its scale and every decorative object carries
 *   `collider: false` explicitly.
 * - The interior plank floor is a REAL collider (stable pattern): the player
 *   steps up onto it (top at floorTop = 0.1). Interior props seat at y = 0.1.
 *
 * Collider policy (CollisionWorld reads ONLY these metadata flags):
 *   - walls / floor / threshold / front door (while closed) → true
 *   - counter / workbench / shelf unit / crates / powder keg → true (solids)
 *   - shell kit, windows, sign, rack, display case, counter-top items,
 *     wall displays, lanterns → false (decor, never blocks the walk path)
 * -----------------------------------------------------------------------------
 */

import type { ObjectDefinition } from '../../core/types.js';

/** Building-local metric layout of the gun shop shell (meters, +Z = entrance). */
export const GUNSHOP_LAYOUT = Object.freeze({
  /** Footprint: x ∈ [−w/2, w/2], z ∈ [−d/2, d/2] (d/2 = entrance side). */
  width: 9,
  depth: 7,
  height: 3.0,
  wallThickness: 0.3,
  floorSlabThickness: 0.1,
  /** Interior plank floor top — every interior prop seats here. */
  floorTop: 0.1,
  /** Doorway cut into the south (entrance) wall, centered on x = 0. */
  doorWidth: 1.1,
  /** Door opening height measured from the FLOOR TOP. */
  doorHeight: 2.3,
  /** Western false-front parapet above the roof over the entrance side. */
  falseFrontTop: 4.1,
  /** Porch extends this far past the facade plane (deck + roof + posts). */
  porchDepth: 1.8,
  porchRoofTopY: 2.87,
  /** Facade windows flanking the door (both sides of the entrance). */
  window: Object.freeze({
    width: 0.9,
    height: 1.3,
    sillY: 1.1,
    centersFromDoor: [1.75, 3.4] as const,
  }),
  roofOverhang: 0.3,
  /** The one openable front door — authored swing metadata (factory reads it). */
  frontDoor: Object.freeze({
    width: 1.1,
    height: 2.3,
    hinge: 'left' as const,
    openSign: 1 as const,
    /** 100° INWARD swing (−Z, into the shop); the swept zone is kept empty. */
    openDeg: (100 * Math.PI) / 180,
  }),
});

/** World-space anchor of the Gun Shop on the playable map: east side of the
 *  street, south of the sheriff (its porch ends at z ≈ 4.0 → 1 m clear gap),
 *  facing south like every other building. Spawn (0, 12), horse (−5, 9) and
 *  the map boundary (x = 29.5) all stay clear. */
export const GUNSHOP_SITE = Object.freeze({ x: 14, z: 8.5 });

/** Canonical hex UUID block for the gun shop (variant nibble 9 — unused:
 *  stable 8000, saloon a000, bank b000; the sheriff's 9000 sits under a
 *  DIFFERENT first octet 90000000-…). */
const GUNSHOP_UUID_BASE = '10000000-0000-4000-9000-0000000000';

function gunshopUuid(suffix: string): string {
  return `${GUNSHOP_UUID_BASE}${suffix}`;
}

/** Object ids inside the gun shop block — tests key off these names. */
export const GUNSHOP_OBJECT_IDS = Object.freeze({
  building: gunshopUuid('01'),
  floor: gunshopUuid('02'),
  threshold: gunshopUuid('03'),
  wallRear: gunshopUuid('04'),
  wallWest: gunshopUuid('05'),
  wallEast: gunshopUuid('06'),
  wallFrontWest: gunshopUuid('07'),
  wallFrontEast: gunshopUuid('08'),
  wallFrontHeader: gunshopUuid('09'),
  frontDoor: gunshopUuid('0a'),
  sign: gunshopUuid('0b'),
  windowWest1: gunshopUuid('0c'),
  windowWest2: gunshopUuid('0d'),
  windowEast1: gunshopUuid('0e'),
  windowEast2: gunshopUuid('0f'),
  lanternSales: gunshopUuid('10'),
  lanternWorkshop: gunshopUuid('11'),
  counter: gunshopUuid('12'),
  displayCase: gunshopUuid('13'),
  rifleRack: gunshopUuid('14'),
  shelfUnit: gunshopUuid('15'),
  cashRegister: gunshopUuid('16'),
  brassScale: gunshopUuid('17'),
  cartridgeStand: gunshopUuid('18'),
  ammoBox1: gunshopUuid('19'),
  ammoBox2: gunshopUuid('1a'),
  bowieKnife: gunshopUuid('1b'),
  holsterDisplay: gunshopUuid('1c'),
  workbench: gunshopUuid('1d'),
  vise: gunshopUuid('1e'),
  toolRack: gunshopUuid('1f'),
  powderKeg: gunshopUuid('20'),
  ammoCrate1: gunshopUuid('21'),
  ammoCrate2: gunshopUuid('22'),
  parapetSign: gunshopUuid('23'),
  porchShingle: gunshopUuid('24'),
  repairsBoard: gunshopUuid('25'),
});

/** The one openable door — the map + tests read this table. */
export const GUNSHOP_DOOR_SPEC = Object.freeze({
  uuid: GUNSHOP_OBJECT_IDS.frontDoor,
  labelOpen: 'Open the gun shop',
  labelClose: 'Close the gun shop',
  range: 2.0,
});

/** Front-wall segment geometry implied by GUNSHOP_LAYOUT (building-local). */
export function frontWallSegments(): Array<{ cx: number; width: number }> {
  const segWidth = (GUNSHOP_LAYOUT.width - GUNSHOP_LAYOUT.doorWidth) / 2;
  const offset = GUNSHOP_LAYOUT.doorWidth / 2 + segWidth / 2;
  return [
    { cx: -offset, width: segWidth },
    { cx: offset, width: segWidth },
  ];
}

const deg = 0;
const identity = () => ({ x: deg, y: deg, z: deg });
const unitScale = () => ({ x: 1, y: 1, z: 1 });

/**
 * Every managed object the Gun Shop adds to the playable map, anchored at
 * (originX, originZ) = the footprint CENTER. Positions are world-space;
 * y values seat props on the interior plank floor (top at floorTop = 0.1),
 * on the counter top (0.1 + 1.09 = 1.19) or hang fixtures from mounts.
 */
export function buildGunShopMapObjects(originX: number, originZ: number): ObjectDefinition[] {
  const L = GUNSHOP_LAYOUT;
  const floorY = L.floorTop;
  const counterTop = floorY + 1.09; // counter body 1.05 + top slab 0.04
  const at = (lx: number, ly: number, lz: number) => ({
    position: { x: originX + lx, y: ly, z: originZ + lz },
    rotation: identity(),
    scale: unitScale(),
  });

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

  // --- Shell -----------------------------------------------------------------
  // One managed object for the non-colliding shell kit: roof + fascia, false
  // front, porch (deck/posts/roof), corner posts, door casing. collider:false —
  // the REAL walls below carry the colliders (their scale IS the AABB).
  push(GUNSHOP_OBJECT_IDS.building, 'gunshop-building', 'مغازه اسلحه‌فروشی — بدنه ساختمان', at(0, 0, 0), {
    collider: false,
    width: L.width,
    depth: L.depth,
    height: L.height,
    doorWidth: L.doorWidth,
  });

  // --- Floor + threshold (REAL colliders — the player steps up onto them) ----
  // Slab seat y ∈ [0.005, 0.095]: never coplanar with the wall bottoms (0)
  // nor with the props standing at floorTop (0.1) — the stable pattern.
  push(GUNSHOP_OBJECT_IDS.floor, 'gunshop-floor', 'مغازه اسلحه‌فروشی — کف چوبی', {
    position: { x: originX, y: L.floorSlabThickness / 2, z: originZ },
    rotation: identity(),
    scale: { x: L.width - L.wallThickness - 0.05, y: L.floorSlabThickness - 0.01, z: L.depth - L.wallThickness - 0.05 },
  }, { collider: true });
  push(GUNSHOP_OBJECT_IDS.threshold, 'gunshop-floor', 'مغازه اسلحه‌فروشی — آستانه در ورودی', {
    position: { x: originX, y: L.floorSlabThickness / 2 - 0.01, z: originZ + L.depth / 2 - L.wallThickness / 2 },
    rotation: identity(),
    scale: { x: L.doorWidth, y: L.floorSlabThickness, z: L.wallThickness },
  }, { collider: true });

  // --- Walls (each a plain box of exactly its scale → collider == visual) ----
  const t = L.wallThickness;
  const H = L.height;
  push(GUNSHOP_OBJECT_IDS.wallRear, 'gunshop-wall', 'مغازه اسلحه‌فروشی — دیوار شمالی', {
    position: { x: originX, y: H / 2, z: originZ - L.depth / 2 },
    rotation: identity(),
    scale: { x: L.width, y: H, z: t },
  }, { collider: true });
  push(GUNSHOP_OBJECT_IDS.wallWest, 'gunshop-wall', 'مغازه اسلحه‌فروشی — دیوار غربی', {
    position: { x: originX - L.width / 2, y: H / 2, z: originZ },
    rotation: identity(),
    // Spans BETWEEN the rear/front walls (never under them) so adjacent wall
    // solids abut back-to-back instead of overlapping.
    scale: { x: t, y: H, z: L.depth - t },
  }, { collider: true });
  push(GUNSHOP_OBJECT_IDS.wallEast, 'gunshop-wall', 'مغازه اسلحه‌فروشی — دیوار شرقی', {
    position: { x: originX + L.width / 2, y: H / 2, z: originZ },
    rotation: identity(),
    scale: { x: t, y: H, z: L.depth - t },
  }, { collider: true });
  // South (entrance) wall split around the doorway — the gap IS the entrance.
  const segs = frontWallSegments();
  push(GUNSHOP_OBJECT_IDS.wallFrontWest, 'gunshop-wall', 'مغازه اسلحه‌فروشی — نمای جلویی (غرب در)', {
    position: { x: originX + segs[0].cx, y: H / 2, z: originZ + L.depth / 2 },
    rotation: identity(),
    scale: { x: segs[0].width, y: H, z: t },
  }, { collider: true });
  push(GUNSHOP_OBJECT_IDS.wallFrontEast, 'gunshop-wall', 'مغازه اسلحه‌فروشی — نمای جلویی (شرق در)', {
    position: { x: originX + segs[1].cx, y: H / 2, z: originZ + L.depth / 2 },
    rotation: identity(),
    scale: { x: segs[1].width, y: H, z: t },
  }, { collider: true });
  push(GUNSHOP_OBJECT_IDS.wallFrontHeader, 'gunshop-wall', 'مغازه اسلحه‌فروشی — بالای در', {
    position: {
      x: originX,
      y: floorY + L.doorHeight + (H - floorY - L.doorHeight) / 2,
      z: originZ + L.depth / 2,
    },
    rotation: identity(),
    scale: { x: L.doorWidth, y: H - floorY - L.doorHeight, z: t },
  }, { collider: true });

  // --- The FRONT DOOR (real openable leaf, spawns CLOSED — collider armed) ---
  // Root at the doorway center on the wall MID-plane, seat on the floor top;
  // the hinge pivot ('front-door-hinge') sits 4 cm off the west jamb. The
  // swing zone (x ∈ [−0.6, 0.6], z ∈ [2.4, 3.5] local) is kept empty by this
  // layout — the 100° inward sweep grazes nothing.
  push(GUNSHOP_OBJECT_IDS.frontDoor, 'gunshop-front-door', 'مغازه اسلحه‌فروشی — در ورودی', {
    position: { x: originX, y: floorY, z: originZ + L.depth / 2 },
    rotation: identity(),
    scale: unitScale(),
  }, {
    collider: true,
    style: 'front',
    hinge: L.frontDoor.hinge,
    openSign: L.frontDoor.openSign,
    openDeg: L.frontDoor.openDeg,
    width: L.frontDoor.width,
    height: L.frontDoor.height,
  });

  // --- Facade SIGN + WINDOWS (independent selectable entities) ---------------
  // The sign hangs DOWN from its origin; the def mounts it 8 cm INTO the
  // porch-roof underside (buried junction) mid-porch, in front of the door.
  push(GUNSHOP_OBJECT_IDS.sign, 'gunshop-sign', 'مغازه اسلحه‌فروشی — تابلوی GUNSMITH', at(0, L.porchRoofTopY + 0.08, L.depth / 2 + L.porchDepth / 2 + 0.65), {
    collider: false,
  });
  // § facade revision: three small period trade signs, each its own logical
  // object — parapet board (west of center, on the false front), double-sided
  // hanging shingle (west porch, between the windows), repairs board (east of
  // the door casing). All mount proud with buried bolts — no coplanar faces,
  // no window/casing/sign overlap (bands asserted in tests).
  const wallFaceZ = L.depth / 2 + L.wallThickness / 2;
  // Parapet front face sits at wallFaceZ + 0.09; the board's BACK face mounts
  // 5 mm proud of it (def z = face + 0.005; the board spans z ∈ [0, 0.025]).
  push(GUNSHOP_OBJECT_IDS.parapetSign, 'gunshop-parapet-sign', 'مغازه اسلحه‌فروشی — تابلوی GUNS & AMMUNITION', {
    position: { x: originX - 1.5, y: L.height + 0.62, z: originZ + wallFaceZ + 0.095 },
    rotation: identity(),
    scale: unitScale(),
  }, { collider: false });
  push(GUNSHOP_OBJECT_IDS.porchShingle, 'gunshop-porch-shingle', 'مغازه اسلحه‌فروشی — تابلوی آویز AMMUNITION', {
    position: { x: originX - 2.6, y: L.porchRoofTopY - 0.1, z: originZ + L.depth / 2 + L.porchDepth / 2 + 0.3 },
    rotation: identity(),
    scale: unitScale(),
  }, { collider: false });
  push(GUNSHOP_OBJECT_IDS.repairsBoard, 'gunshop-repairs-board', 'مغازه اسلحه‌فروشی — تابلوی REPAIRS', {
    position: { x: originX + 0.925, y: 1.75, z: originZ + wallFaceZ + 0.005 },
    rotation: identity(),
    scale: unitScale(),
  }, { collider: false });
  const winDefs: Array<{ id: string; side: -1 | 1; off: number; label: string }> = [
    { id: GUNSHOP_OBJECT_IDS.windowWest1, side: -1, off: L.window.centersFromDoor[0], label: 'غربی ۱' },
    { id: GUNSHOP_OBJECT_IDS.windowWest2, side: -1, off: L.window.centersFromDoor[1], label: 'غربی ۲' },
    { id: GUNSHOP_OBJECT_IDS.windowEast1, side: 1, off: L.window.centersFromDoor[0], label: 'شرقی ۱' },
    { id: GUNSHOP_OBJECT_IDS.windowEast2, side: 1, off: L.window.centersFromDoor[1], label: 'شرقی ۲' },
  ];
  for (const w of winDefs) {
    push(w.id, 'gunshop-window', `مغازه اسلحه‌فروشی — پنجره نما (${w.label})`,
      { position: { x: originX + w.side * w.off, y: 0, z: originZ }, rotation: identity(), scale: unitScale() },
      { collider: false, side: w.side, offset: w.off });
  }

  // --- Hanging lanterns (2 real PointLights total — the light budget) --------
  push(GUNSHOP_OBJECT_IDS.lanternSales, 'gunshop-lantern', 'مغازه اسلحه‌فروشی — فانوس فروشگاه', at(-0.4, H, 1.4), {
    collider: false, lit: true,
  });
  push(GUNSHOP_OBJECT_IDS.lanternWorkshop, 'gunshop-lantern', 'مغازه اسلحه‌فروشی — فانوس کارگاه', at(1.5, H, -2.9), {
    collider: false, lit: true,
  });

  // --- Sales area (front half) ------------------------------------------------
  // Counter runs E-W south of center; the entrance path (door → counter
  // front) and BOTH side aisles stay clear (walkability contract).
  push(GUNSHOP_OBJECT_IDS.counter, 'gunshop-counter', 'مغازه اسلحه‌فروشی — پیشخوان فروش', at(-0.4, floorY, 1.4), {
    collider: true,
  });
  // Counter-top dressing (each its own logical object; none collides).
  push(GUNSHOP_OBJECT_IDS.displayCase, 'gunshop-pistol-display-case', 'مغازه اسلحه‌فروشی — ویترین اسلحه', at(-1.05, counterTop, 1.4), {
    collider: false,
  });
  push(GUNSHOP_OBJECT_IDS.cashRegister, 'gunshop-cash-register', 'مغازه اسلحه‌فروشی — صندوق مکانیکی', at(1.0, counterTop, 1.4), {
    collider: false,
  });
  push(GUNSHOP_OBJECT_IDS.brassScale, 'gunshop-brass-scale', 'مغازه اسلحه‌فروشی — ترازوی برنجی', at(0.62, counterTop, 1.45), {
    collider: false,
  });
  push(GUNSHOP_OBJECT_IDS.ammoBox1, 'gunshop-ammo-box', 'مغازه اسلحه‌فروشی — جعبه فشنگ ۱', at(0.28, counterTop, 1.5), {
    collider: false,
  });
  push(GUNSHOP_OBJECT_IDS.ammoBox2, 'gunshop-ammo-box', 'مغازه اسلحه‌فروشی — جعبه فشنگ ۲', at(0.28, counterTop, 1.32), {
    collider: false,
  });
  push(GUNSHOP_OBJECT_IDS.cartridgeStand, 'gunshop-cartridge-stand', 'مغازه اسلحه‌فروشی — پایه فشنگ', at(0.95, counterTop, 1.62), {
    collider: false,
  });

  // --- Side walls --------------------------------------------------------------
  // WEST: the rifle wall rack (guns hang muzzle-UP on it), def mounted so its
  // backing back face buries 1.5 cm into the wall's inner face.
  push(GUNSHOP_OBJECT_IDS.rifleRack, 'gunshop-rifle-wall-rack', 'مغازه اسلحه‌فروشی — قفسه دیواری تفنگ', {
    position: { x: originX - L.width / 2 + t / 2 + 0.01, y: 1.5, z: originZ + 1.9 },
    rotation: { x: 0, y: 90, z: 0 },
    scale: unitScale(),
  }, { collider: false });
  // Knife + sheath hung on the west wall south of the rack (handle/sheath
  // backs bury into the wall — mounted look, no floating).
  push(GUNSHOP_OBJECT_IDS.bowieKnife, 'gunshop-bowie-knife', 'مغازه اسلحه‌فروشی — چاقوی بوویی', {
    position: { x: originX - L.width / 2 + t / 2 + 0.015, y: 1.65, z: originZ + 3.1 },
    rotation: { x: 0, y: 90, z: 0 },
    scale: unitScale(),
  }, { collider: false });
  // EAST: the ammo shelf unit, back face buried 1.5 cm into the wall.
  push(GUNSHOP_OBJECT_IDS.shelfUnit, 'gunshop-shelf-unit', 'مغازه اسلحه‌فروشی — قفسه قوطی فشنگ', {
    position: { x: originX + L.width / 2 - t / 2 - 0.16, y: floorY, z: originZ + 1.4 },
    rotation: { x: 0, y: -90, z: 0 },
    scale: unitScale(),
  }, { collider: true });
  // FRONT-wall interior, east of the door: holster board (backs buried).
  push(GUNSHOP_OBJECT_IDS.holsterDisplay, 'gunshop-holster-display', 'مغازه اسلحه‌فروشی — تخته هولستر', {
    position: { x: originX + 2.4, y: 1.5, z: originZ + L.depth / 2 - t / 2 - 0.015 },
    rotation: { x: 0, y: 180, z: 0 },
    scale: unitScale(),
  }, { collider: false });

  // --- Back area — the Gunsmith WORKSHOP (north end) ---------------------------
  push(GUNSHOP_OBJECT_IDS.workbench, 'gunshop-workbench', 'مغازه اسلحه‌فروشی — میز کار اسلحه‌سازی', at(1.5, floorY, -3.01), {
    collider: true,
  });
  // Vise mounted ON the workbench top (top surface = floorY + 0.95).
  push(GUNSHOP_OBJECT_IDS.vise, 'gunshop-vise', 'مغازه اسلحه‌فروشی — گیره میز کار', at(1.05, floorY + 0.95, -3.1), {
    collider: false,
  });
  // Tool rack on the north wall, east of the bench (board back buried 2.5 mm).
  push(GUNSHOP_OBJECT_IDS.toolRack, 'gunshop-tool-rack', 'مغازه اسلحه‌فروشی — تخته ابزار', {
    position: { x: originX + 2.7, y: 1.7, z: originZ - L.depth / 2 + t / 2 + 0.01 },
    rotation: identity(),
    scale: unitScale(),
  }, { collider: false });

  // --- Corner storage (west-back, small and logical) ---------------------------
  push(GUNSHOP_OBJECT_IDS.powderKeg, 'gunshop-powder-keg', 'مغازه اسلحه‌فروشی — بشکه باروت', at(-3.8, floorY, -2.9), {
    collider: true,
  });
  push(GUNSHOP_OBJECT_IDS.ammoCrate1, 'gunshop-ammo-crate', 'مغازه اسلحه‌فروشی — صندوق مهمات ۱', {
    position: { x: originX - 3.7, y: floorY, z: originZ - 2.15 },
    rotation: { x: 0, y: 7, z: 0 },
    scale: unitScale(),
  }, { collider: true });
  // Crate 2 stacked ON crate 1 (crate top = floorY + 0.26); slight counter-yaw.
  push(GUNSHOP_OBJECT_IDS.ammoCrate2, 'gunshop-ammo-crate', 'مغازه اسلحه‌فروشی — صندوق مهمات ۲', {
    position: { x: originX - 3.7, y: floorY + 0.26, z: originZ - 2.15 },
    rotation: { x: 0, y: -5, z: 0 },
    scale: unitScale(),
  }, { collider: true });

  return defs;
}
