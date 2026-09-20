/**
 * src/assets/stable/StableStalls.ts
 * -----------------------------------------------------------------------------
 * The CONTENT GROUP of each of the six horse stalls — everything inside a
 * stall that does NOT need its own collider box (the trough, the stall front
 * wainscot/grill segments and the stall door are separate managed objects;
 * see StableLayout).
 *
 * Every stall shares the same structure but carries CONTROLLED, seeded
 * variation (per STABLE_LAYOUT.stalls — the ONE source of truth):
 *   • nameplate  (STALL 01…06 canvas, proud of the grill segment's aisle face)
 *   • tie ring   (iron ring on the wainscot's aisle face)
 *   • water      (wood/metal bucket — stall 06 is deliberately empty)
 *   • hay rack   (wall-mounted, full/half/none) with hay to match
 *   • hay pile   (corner pile in some stalls)
 *   • floor wear (dirt patch / hoof-worn boards / straw scatter)
 *   • tools      (pitchfork / shovel leaning on the north end)
 *   • extras     (rope coil / draped blanket / horse brush / hanging bridle)
 *
 * Placement discipline: every prop stands ON the plank floor (slab top at
 * STABLE_LAYOUT.floorTop), every wall mount is back-to-back or ≥ 4 mm proud,
 * nothing intersects the door sweep quarter-disc (the sweep occupies the
 * south end of each stall — the north end stays clear).
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { STABLE_LAYOUT, type StableStallSpec } from './StableLayout.js';
import { createStableMaterials, type StableMaterials } from './StableMaterials.js';
import {
  addBox,
  signFace,
  hayPile,
  strawScatter,
  bucket,
  pitchfork,
  shovel,
  horseBrush,
  bridleHanging,
  drapedBlanket,
} from './StableProps.js';

/** Top of the plank floor slab (everything stands on this). */
const FLOOR = STABLE_LAYOUT.floorTop;
/** Stall-front assembly half thickness. */
const FRONT_HALF_T = STABLE_LAYOUT.stall.frontThickness / 2;

/**
 * Build one stall's content group. The def (and thus the group) sits at the
 * stall's interior center on the floor:
 *   x = side * (innerHalfX + stallFrontX + frontT/2) / 2 … (spec.defX)
 *   z = (zMin + zMax) / 2, y = 0 — children use offsets from that origin.
 */
export function buildStallContents(spec: StableStallSpec): THREE.Group {
  const M_: StableMaterials = createStableMaterials();
  const g = new THREE.Group();
  g.name = `stall-${String(spec.index).padStart(2, '0')}-contents`;

  const side = spec.side; // −1 west, +1 east
  const zMin = spec.zMin;
  const zMax = spec.zMax;
  const zc = (zMin + zMax) / 2;
  // Aisle-facing direction: a west stall (side −1) opens toward +x.
  const aisleX = -side;
  // Key planes in DEF-LOCAL space:
  const frontMidX = side * STABLE_LAYOUT.stallFrontX - spec.defX; // front mid-plane
  const faceX = frontMidX + aisleX * FRONT_HALF_T; // wainscot's AISLE face
  const wallX = side * STABLE_LAYOUT.innerHalfX - spec.defX; // side wall inner face
  const northZ = zMin - zc; // stall's north end (partition or north wall)
  const southZ = zMax - zc; // stall's south end (room divider side)
  const gapZ = spec.doorGapCenter - zc;

  /* --- Nameplate over the door gap (4 mm proud of the aisle face) --------- */
  {
    const plate = signFace(`STALL ${String(spec.index).padStart(2, '0')}`, 0.38, 0.13);
    plate.position.set(faceX + aisleX * 0.004, FLOOR + 2.42, gapZ);
    plate.rotation.y = aisleX > 0 ? Math.PI / 2 : -Math.PI / 2;
    plate.name = 'stall-nameplate';
    g.add(plate);
    for (const [nz, ny] of [[-0.16, 0.05], [0.16, 0.05], [-0.16, -0.05], [0.16, -0.05]] as const) {
      const nail = addBox(g, M_.iron, 0.008, 0.012, 0.008, faceX + aisleX * 0.004, FLOOR + 2.42 + ny, gapZ + nz, 'nameplate-nail');
      nail.castShadow = false;
    }
  }

  /* --- Tie ring on the wainscot's aisle face (north end) ------------------- */
  {
    const plate = addBox(g, M_.iron, 0.02, 0.09, 0.07, faceX + aisleX * 0.012, FLOOR + 1.45, northZ + 0.55, 'tie-ring-plate');
    plate.castShadow = false;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 12), M_.iron);
    ring.position.set(faceX + aisleX * 0.035, FLOOR + 1.44, northZ + 0.55);
    ring.rotation.y = Math.PI / 2;
    ring.castShadow = true;
    ring.name = 'tie-ring';
    g.add(ring);
  }

  /* --- Water bucket (stall 06 intentionally has none) ----------------------- */
  if (spec.bucket) {
    const b = bucket(spec.bucket.kind, spec.bucket.full);
    b.position.set(side * 0.95, FLOOR, northZ + 0.42);
    b.rotation.y = side * 0.7;
    g.add(b);
  }

  /* --- Wall hay rack with hay (full / half / none) --------------------------- */
  if (spec.rack) {
    const rack = new THREE.Group();
    rack.name = 'hay-rack';
    const rw = 1.15; // along z
    const rh = 0.85;
    const bottomY = FLOOR + 0.55;
    const rackX = wallX - side * 0.03; // 3 cm off the wall face
    addBox(rack, M_.timber, 0.035, rh, 0.06, rackX, bottomY + rh / 2, -rw / 2 + 0.05, 'rack-stile-n');
    addBox(rack, M_.timber, 0.035, rh, 0.06, rackX, bottomY + rh / 2, rw / 2 - 0.05, 'rack-stile-s');
    addBox(rack, M_.timber, 0.05, 0.09, rw, rackX, bottomY + 0.045, 0, 'rack-bottom');
    addBox(rack, M_.timber, 0.05, 0.09, rw, rackX, bottomY + rh - 0.045, 0, 'rack-top');
    const barGeo = new THREE.BoxGeometry(0.03, 0.05, rw - 0.1);
    const bars = Math.round(rh / 0.16);
    for (let i = 1; i < bars; i++) {
      const bar = new THREE.Mesh(barGeo, M_.timber);
      bar.position.set(wallX - side * 0.11, bottomY + i * (rh / bars), 0);
      bar.rotation.x = 0.5;
      bar.castShadow = true;
      bar.name = `rack-bar-${i}`;
      rack.add(bar);
    }
    const hayH = spec.rack === 'full' ? rh - 0.12 : (rh - 0.12) * 0.5;
    addBox(rack, M_.hay, 0.16, hayH, rw - 0.16, wallX - side * 0.13, bottomY + 0.1 + hayH / 2, 0, 'rack-hay');
    if (spec.rack === 'full') {
      const topClump = hayPile(0.18, 0.1, spec.index + 20);
      // Base ON the rack top board (back-to-back) — the old −0.02 offset
      // buried the clump's lower slab inside the board.
      topClump.position.set(wallX - side * 0.16, bottomY + rh, 0);
      rack.add(topClump);
    }
    rack.position.set(0, 0, northZ + 1.15);
    g.add(rack);
  }

  /* --- Corner hay pile -------------------------------------------------------- */
  if (spec.pile) {
    const pile = hayPile(0.42, 0.34, spec.index);
    pile.position.set(side * 1.05, FLOOR, northZ + 0.5);
    pile.rotation.y = spec.index * 1.3;
    g.add(pile);
  }

  /* --- Floor wear (5–6 mm proud of the slab top; base = back-to-back) -------- */
  if (spec.floor === 'dirt') {
    const patch = addBox(g, M_.dirt, 1.5, 0.008, 1.3, 0, FLOOR + 0.004, (northZ + southZ) / 2 + 0.15, 'floor-dirt');
    patch.receiveShadow = true;
    patch.castShadow = false;
    const straw = strawScatter(1.2, 1.0, spec.index);
    straw.position.set(0.25 * side, FLOOR + 0.012, southZ - 0.5);
    g.add(straw);
  } else if (spec.floor === 'worn') {
    for (let i = 0; i < 3; i++) {
      const strip = addBox(g, M_.plankDark, 1.35, 0.006, 0.32, (i - 1) * 0.05, FLOOR + 0.003, (northZ + southZ) / 2 + (i - 1) * 0.34, `floor-worn-${i}`);
      strip.rotation.y = (i - 1) * 0.015;
      strip.receiveShadow = true;
      strip.castShadow = false;
    }
  } else {
    const straw = strawScatter(1.7, 1.5, spec.index);
    straw.position.set(side * 0.2, FLOOR + 0.012, (northZ + southZ) / 2);
    g.add(straw);
    const pile = hayPile(0.3, 0.2, spec.index + 6);
    pile.position.set(side * 1.1, FLOOR, southZ - 0.55);
    g.add(pile);
  }

  /* --- Tools leaning on the stall's north end --------------------------------- */
  if (spec.tool) {
    const tool = spec.tool === 'pitchfork' ? pitchfork() : shovel();
    tool.position.set(side * 0.4, FLOOR, northZ + 0.14);
    tool.rotation.x = side > 0 ? 0.24 : -0.24;
    tool.rotation.z = side * 0.1;
    g.add(tool);
  }

  /* --- Extras ------------------------------------------------------------------ */
  // NOTE: the former `rope` extra (a rope coil + iron hook hung on the
  // wainscot beside the stall door) was DELETED on user request — its torus
  // read as a stray «door ring» that stayed behind when the door swung.
  switch (spec.extra) {
    case 'blanket': {
      // draped over the partition top (visible through the grill bars)
      const blanket = drapedBlanket(0.7, 0x7a4a3a);
      blanket.position.set(side * 0.5, FLOOR + 1.35, northZ + 0.04);
      blanket.rotation.y = Math.PI / 2;
      g.add(blanket);
      break;
    }
    case 'brush': {
      const brush = horseBrush();
      brush.position.set(side * 0.2, FLOOR, southZ - 0.4);
      brush.rotation.y = 0.7;
      g.add(brush);
      break;
    }
    case 'bridle': {
      // hanging bridle on the wainscot's aisle face, by the tie ring
      const bridle = bridleHanging();
      bridle.position.set(faceX + aisleX * 0.012, FLOOR + 1.42, northZ + 0.95);
      bridle.rotation.y = aisleX > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(bridle);
      break;
    }
    default:
      break;
  }

  return g;
}
