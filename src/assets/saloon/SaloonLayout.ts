/**
 * src/assets/saloon/SaloonLayout.ts
 * -----------------------------------------------------------------------------
 * Single source of truth for the saloon's PLACEMENT data.
 *
 * Two consumers read this module and MUST never disagree:
 *   1. game/playable-map.ts  — registers every saloon object in the
 *      SceneStateManager (each entry gets its own UUID and collider metadata).
 *   2. tests/saloon-assets.test.ts — asserts entrance openness, wall
 *      colliders and decor non-colliders against the SAME list.
 *
 * Coordinate conventions
 * ----------------------
 * - Building-local numbers (SALOON_LAYOUT) are relative to the footprint
 *   CENTER on the ground (y = 0), with +Z pointing at the ENTRANCE (south
 *   facade, same orientation convention as the existing enterable BUILDING).
 * - Walls are centered ON the footprint edges (the same convention the
 *   existing BUILDING cubes use), so a wall of thickness t spans
 *   [edge − t/2, edge + t/2].
 * - Colliders in this project are derived ONLY from the registered
 *   transform (unit-box × scale, yaw-aware) — see CollisionWorld. Every
 *   wall therefore IS a plain box of exactly its scale, and every purely
 *   decorative object MUST carry `collider: false` explicitly (the
 *   collision default for non-ground objects is TRUE).
 * -----------------------------------------------------------------------------
 */

import type { ObjectDefinition } from '../../core/types.js';

/** Building-local metric layout of the saloon shell (meters, +Z = entrance). */
export const SALOON_LAYOUT = Object.freeze({
  /** Footprint: x ∈ [−w/2, w/2], z ∈ [−d/2, d/2] (d/2 = entrance side). */
  width: 10,
  depth: 8,
  height: 3.2,
  wallThickness: 0.3,
  /** Doorway cut into the south (entrance) wall, centered on x = 0. */
  doorWidth: 1.6,
  doorHeight: 2.3,
  /** Western false-front parapet above the roof over the entrance side. */
  falseFrontTop: 4.5,
  /** Porch extends this far past the facade plane (deck + roof + posts). */
  porchDepth: 1.8,
  porchRoofTopY: 2.87,
  /** Facade windows flanking the door (both sides of the entrance). */
  window: Object.freeze({
    width: 0.9,
    height: 1.3,
    sillY: 1.1,
    centersFromDoor: [1.75, 3.55] as const,
  }),
  roofOverhang: 0.3,
});

/** World-space anchor of the saloon on the playable map. */
export const SALOON_SITE = Object.freeze({ x: -12, z: -12 });

/** Canonical hex UUID block for the saloon (map uses 10000000-…-a000-…). */
const SALOON_UUID_BASE = '10000000-0000-4000-a000-0000000000';

/** Deterministic v4-shaped uuid from a 2-digit hex suffix. */
function saloonUuid(suffix: string): string {
  return `${SALOON_UUID_BASE}${suffix}`;
}

/** Object ids inside the saloon block — tests key off these names. */
export const SALOON_OBJECT_IDS = Object.freeze({
  building: saloonUuid('40'),
  wallRear: saloonUuid('41'),
  wallWest: saloonUuid('42'),
  wallEast: saloonUuid('43'),
  wallFrontWest: saloonUuid('44'),
  wallFrontEast: saloonUuid('45'),
  wallFrontHeader: saloonUuid('46'),
  swingingDoors: saloonUuid('47'),
  barCounter: saloonUuid('48'),
  backBar: saloonUuid('49'),
  stool1: saloonUuid('4a'),
  stool2: saloonUuid('4b'),
  stool3: saloonUuid('4c'),
  stool4: saloonUuid('4d'),
  pokerTable: saloonUuid('4e'),
  chair1: saloonUuid('4f'),
  chair2: saloonUuid('50'),
  chair3: saloonUuid('51'),
  chair4: saloonUuid('52'),
  piano: saloonUuid('53'),
  pianoStool: saloonUuid('5c'),
  chandelierWest: saloonUuid('54'),
  chandelierEast: saloonUuid('55'),
  barrel1: saloonUuid('56'),
  barrel2: saloonUuid('57'),
  barrel3: saloonUuid('58'),
  spittoon1: saloonUuid('59'),
  spittoon2: saloonUuid('5a'),
  wantedPoster: saloonUuid('5b'),
});

/** Front-wall segment geometry implied by SALOON_LAYOUT (building-local). */
export function frontWallSegments(): Array<{ cx: number; width: number }> {
  const segWidth = (SALOON_LAYOUT.width - SALOON_LAYOUT.doorWidth) / 2;
  const offset = SALOON_LAYOUT.doorWidth / 2 + segWidth / 2;
  return [
    { cx: -offset, width: segWidth },
    { cx: offset, width: segWidth },
  ];
}

const deg = 0;
const identity = () => ({ x: deg, y: deg, z: deg });
const unitScale = () => ({ x: 1, y: 1, z: 1 });

/**
 * Every managed object the saloon adds to the playable map.
 * Positions are world-space, anchored at (originX, originZ) = the
 * building footprint CENTER; y values seat props on the interior floor
 * slab (top at 0.05) or hang fixtures from the ceiling.
 *
 * Collider policy (CollisionWorld reads ONLY these metadata flags):
 *   - shell walls → collider: true (real walls block the player)
 *   - solid furniture (bar, back-bar, piano, poker table, barrels) → true
 *   - shell itself, doors, seats, small decor, hanging lights → false
 */
export function buildSaloonMapObjects(originX: number, originZ: number): ObjectDefinition[] {
  const L = SALOON_LAYOUT;
  const floorY = 0.05; // interior floor slab top (built by the shell factory)
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
  // One managed object for the non-colliding shell kit: floor slab, roof,
  // false front + SALOON sign, porch, corner posts, facade windows. Its own
  // transform-scale is meaningless for collision, so collider: false — the
  // REAL walls below carry the colliders.
  push(SALOON_OBJECT_IDS.building, 'saloon-building', 'سالون — بدنه ساختمان', at(0, 0, 0), {
    collider: false,
    width: L.width,
    depth: L.depth,
    height: L.height,
    doorWidth: L.doorWidth,
  });

  // --- Walls (each a plain box of exactly its scale → collider == visual) ----
  const t = L.wallThickness;
  push(SALOON_OBJECT_IDS.wallRear, 'saloon-wall', 'سالون — دیوار شمالی', {
    position: { x: originX, y: L.height / 2, z: originZ - L.depth / 2 },
    rotation: identity(),
    scale: { x: L.width, y: L.height, z: t },
  }, { collider: true });
  push(SALOON_OBJECT_IDS.wallWest, 'saloon-wall', 'سالون — دیوار غربی', {
    position: { x: originX - L.width / 2, y: L.height / 2, z: originZ },
    rotation: identity(),
    // Spans BETWEEN the rear/front walls (never under them) so adjacent wall
    // solids abut back-to-back instead of overlapping — overlapping tops at
    // the corners would be same-normal coplanar faces.
    scale: { x: t, y: L.height, z: L.depth - t },
  }, { collider: true });
  push(SALOON_OBJECT_IDS.wallEast, 'saloon-wall', 'سالون — دیوار شرقی', {
    position: { x: originX + L.width / 2, y: L.height / 2, z: originZ },
    rotation: identity(),
    scale: { x: t, y: L.height, z: L.depth - t },
  }, { collider: true });
  // South (entrance) wall split around the doorway — the gap IS the entrance.
  const segs = frontWallSegments();
  push(SALOON_OBJECT_IDS.wallFrontWest, 'saloon-wall', 'سالون — نمای جلویی (غرب در)', {
    position: { x: originX + segs[0].cx, y: L.height / 2, z: originZ + L.depth / 2 },
    rotation: identity(),
    scale: { x: segs[0].width, y: L.height, z: t },
  }, { collider: true });
  push(SALOON_OBJECT_IDS.wallFrontEast, 'saloon-wall', 'سالون — نمای جلویی (شرق در)', {
    position: { x: originX + segs[1].cx, y: L.height / 2, z: originZ + L.depth / 2 },
    rotation: identity(),
    scale: { x: segs[1].width, y: L.height, z: t },
  }, { collider: true });
  push(SALOON_OBJECT_IDS.wallFrontHeader, 'saloon-wall', 'سالون — بالای در', {
    position: {
      x: originX,
      y: L.height - (L.height - L.doorHeight) / 2,
      z: originZ + L.depth / 2,
    },
    rotation: identity(),
    scale: { x: L.doorWidth, y: L.height - L.doorHeight, z: t },
  }, { collider: true });

  // --- Entrance --------------------------------------------------------------
  // Independent swinging-half-doors: two named hinge groups, no collider —
  // nothing may ever block the walk-through (animation hooks come later).
  // Origin sits 1 cm above the ground so no leaf bottom face is coplanar
  // with the wall bottoms on the ground plane.
  push(SALOON_OBJECT_IDS.swingingDoors, 'saloon-swinging-doors', 'سالون — درهای چرخان', at(0, 0.01, L.depth / 2), {
    collider: false,
  });

  // --- Bar corner (rear of the interior, facing the entrance) ----------------
  // Bar-corner placements are the player's finalized in-game arrangement
  // (baked from the Object panel FINAL states of the 2026-09 play session):
  // counter pulled toward the entrance, stools spread wider + scaled up.
  push(SALOON_OBJECT_IDS.barCounter, 'saloon-bar-counter', 'سالون — پیشخوان بار', at(0, floorY, -2.186), {
    collider: true,
  });
  // Back bar stands ON the floor slab (y = floorY). The saved scene had it
  // raised to y ≈ 1.0 — a workaround for the glassware being buried INSIDE
  // the old solid frame; the builder is now open-shelved, so it belongs on
  // the floor again (raised it also clipped the crown through the roof).
  push(SALOON_OBJECT_IDS.backBar, 'saloon-back-bar', 'سالون — قفسه پشت بار', at(0, floorY, -3.65), {
    collider: true,
  });
  // User-finalized stool placement (positions + scales from the Object panel).
  const stoolPlacements: Array<{ x: number; y: number; z: number; s: [number, number, number] }> = [
    { x: -1.656, y: 0.05, z: -1.22, s: [1.25, 1.1, 1.1] },
    { x: -0.643, y: 0.049, z: -1.193, s: [1.25, 1.1, 1.25] },
    { x: 0.527, y: 0.05, z: -1.231, s: [1.25, 1.1, 1.25] },
    { x: 1.595, y: 0.05, z: -1.218, s: [1.25, 1.1, 1.25] },
  ];
  stoolPlacements.forEach((p, i) => {
    const key = `stool${i + 1}` as 'stool1';
    push(SALOON_OBJECT_IDS[key], 'saloon-bar-stool', `سالون — چهارپایه بار ${i + 1}`, {
      position: { x: originX + p.x, y: p.y, z: originZ + p.z },
      rotation: identity(),
      scale: { x: p.s[0], y: p.s[1], z: p.s[2] },
    }, { collider: false });
  });

  // --- Poker corner (east side) ----------------------------------------------
  const tableLocal = { x: 3.4, z: 0.9 };
  push(SALOON_OBJECT_IDS.pokerTable, 'saloon-poker-table', 'سالون — میز پوکر', at(tableLocal.x, floorY, tableLocal.z), {
    collider: true,
  });
  // Chairs face the table. The built-in chair front is +Z, so a chair at
  // polar angle θ around the table faces the table with rotY = θ (the old
  // θ−180° rule faced them AWAY — the player flipped chairs 2/4 in-game to
  // fix it, and those exact Final transforms are baked below).
  // Orbit radius 1.15 keeps the ladder-back seats (0.4 m wide) clear of the
  // 0.88 m-radius table's leather armrest.
  const radius = 1.15;
  const atPolar = (thetaDeg: number): { x: number; z: number } => ({
    x: tableLocal.x + Math.cos((thetaDeg * Math.PI) / 180) * radius,
    z: tableLocal.z + Math.sin((thetaDeg * Math.PI) / 180) * radius,
  });
  const p1 = atPolar(45);
  const p3 = atPolar(225);
  const chairPlacements: Array<{ pos: { x: number; y: number; z: number }; rot: { x: number; y: number; z: number } }> = [
    { pos: { x: p1.x, y: floorY, z: p1.z }, rot: { x: deg, y: 45, z: deg } },
    // Chair 2 = player's exact Final state (position incl. y = 0.000 and the
    // gimbal-euler (-180, 46, 180), which renders upright facing the table).
    { pos: { x: 2.686, y: 0.0, z: 1.7 }, rot: { x: -180, y: 46, z: 180 } },
    { pos: { x: p3.x, y: floorY, z: p3.z }, rot: { x: deg, y: 225, z: deg } },
    // Chair 4 = player's exact Final state.
    { pos: { x: 4.213, y: floorY, z: 0.078 }, rot: { x: deg, y: 318, z: deg } },
  ];
  chairPlacements.forEach((c, i) => {
    const key = `chair${i + 1}` as 'chair1';
    push(SALOON_OBJECT_IDS[key], 'saloon-chair', `سالون — صندلی پوکر ${i + 1}`, {
      position: { x: originX + c.pos.x, y: c.pos.y, z: originZ + c.pos.z },
      rotation: c.rot,
      scale: unitScale(),
    }, { collider: false });
  });

  // --- Music corner (west side, facing into the room) ------------------------
  // Piano x = player's finalized position (tucked to 2.5 cm off the wall).
  push(SALOON_OBJECT_IDS.piano, 'saloon-piano', 'سالون — پیانو', {
    position: { x: originX - 4.5, y: floorY, z: originZ + 0.8 },
    rotation: { x: deg, y: 90, z: deg },
    scale: unitScale(),
  }, { collider: true });
  // Stool stands in front of the keyboard (the piano's local +Z keybed faces
  // east after its 90° yaw), just off the keys, clear of the poker corner.
  // x = player's finalized position.
  push(SALOON_OBJECT_IDS.pianoStool, 'saloon-piano-stool', 'سالون — چهارپایه پیانو', at(-3.525, floorY, 0.8), {
    collider: false,
  });

  // --- Hanging lights (2 real PointLights total — perf budget) ---------------
  push(SALOON_OBJECT_IDS.chandelierWest, 'saloon-chandelier', 'سالون — لوستر ۱', at(-1.9, 2.72, -0.6), {
    collider: false,
    lights: 1,
  });
  push(SALOON_OBJECT_IDS.chandelierEast, 'saloon-chandelier', 'سالون — لوستر ۲', at(1.9, 2.72, 1.0), {
    collider: false,
    lights: 1,
  });

  // --- Small props -------------------------------------------------------------
  push(SALOON_OBJECT_IDS.barrel1, 'saloon-whiskey-barrel', 'سالون — بشکه ویسکی ۱', at(-4.35, floorY, -3.35), {
    collider: true,
  });
  push(SALOON_OBJECT_IDS.barrel2, 'saloon-whiskey-barrel', 'سالون — بشکه ویسکی ۲', at(-3.62, floorY, -3.5), {
    collider: true,
  });
  push(SALOON_OBJECT_IDS.barrel3, 'saloon-whiskey-barrel', 'سالون — بشکه ویسکی ۳', at(4.35, floorY, -3.35), {
    collider: true,
  });
  // Spittoon 1 moved east of the bar: at its old (1.1, −2.1) it now lands
  // INSIDE the counter body, which the player pulled south to z = −2.186.
  push(SALOON_OBJECT_IDS.spittoon1, 'saloon-spittoon', 'سالون — تف‌دان ۱', at(2.45, floorY, -2.05), {
    collider: false,
  });
  push(SALOON_OBJECT_IDS.spittoon2, 'saloon-spittoon', 'سالون — تف‌دان ۲', at(2.35, floorY, -0.4), {
    collider: false,
  });
  // Poster hangs on the west wall's INNER face, reading east into the room.
  push(SALOON_OBJECT_IDS.wantedPoster, 'saloon-wanted-poster', 'سالون — پوستر مطلوب‌الوجوب', {
    position: { x: originX - 4.83, y: 1.55, z: originZ + 2.5 },
    rotation: { x: deg, y: 90, z: deg },
    scale: unitScale(),
  }, { collider: false });

  return defs;
}
