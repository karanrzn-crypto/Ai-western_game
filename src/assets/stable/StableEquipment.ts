/**
 * src/assets/stable/StableEquipment.ts
 * -----------------------------------------------------------------------------
 * The stable's working ZONES as decor content groups (collider: false — every
 * prop that must genuinely block movement is a separate unit-box/trough/bench
 * managed object emitted by StableLayout):
 *
 *   TACK ROOM   (SW corner room)  saddle racks + saddles, tack wall (bridles,
 *                 collar, straps, rope), blanket bar, horseshoe rack, crate,
 *                 tool box, TACK sign + dark RATES board on the aisle face.
 *   FEED ROOM   (SE corner room)  hay-bale stack, grain-sack pile, grain bin,
 *                 bucket stack, crates, straw, FEED sign.
 *   FARRIER BAY (north end, west of the aisle center)  wall racks, bench-top
 *                 tools, scraps box, quench bucket, scattered shoes, FARRIER
 *                 sign. (Anvil + workbench + water trough are SOLID defs.)
 *   WATER       water barrel + buckets by the gate (the big trough is a SOLID
 *                 def in the NW corner of the aisle).
 *   HAY LOFT    bale stacks, crate, loose hay, hanging rope on the deck.
 *
 * Convention: every builder returns a group whose children are placed in
 * BUILDING-LOCAL coordinates (the layout sites each def at the building
 * origin). Everything stands flush ON its surface (floor slab top, bench top,
 * deck top) or mounts back-to-back on a wall face — never floating, never
 * coplanar-intersecting.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { STABLE_LAYOUT } from './StableLayout.js';
import { createStableMaterials, type StableMaterials } from './StableMaterials.js';
import {
  addBox,
  addCyl,
  boardSign,
  hayBale,
  hayPile,
  strawScatter,
  woodCrate,
  smallBarrel,
  bucket,
  grainBox,
  grainSack,
  toolBox,
  hammer,
  tongs,
  horseshoe,
  saddle,
  saddleRack,
  bridleHanging,
  horseCollar,
  leatherStrap,
  ropeCoil,
  drapedBlanket,
} from './StableProps.js';

const FLOOR = STABLE_LAYOUT.floorTop;

/* -------------------------------------------------------------------------- */
/* TACK ROOM (SW)                                                             */
/* -------------------------------------------------------------------------- */

export function buildTackRoomContents(): THREE.Group {
  const M_: StableMaterials = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'tack-room-contents';

  // Two saddle racks with saddles along the west wall
  for (const rz of [4.35, 5.55]) {
    const rack = saddleRack();
    rack.position.set(-5.02, FLOOR, rz);
    rack.rotation.y = 0;
    g.add(rack);
    const sad = saddle();
    // rack top surface = 0.82 + 0.025 → the saddle base seats EXACTLY on it
    sad.position.set(-5.02, FLOOR + 0.745, rz);
    sad.rotation.y = rz > 5 ? -0.12 : 0.08;
    g.add(sad);
  }

  // Tack wall on the room divider's north face (z = 3.56)
  {
    const board = addBox(g, M_.trim, 1.9, 1.05, 0.035, -4.2, FLOOR + 1.72, 3.578, 'tack-board');
    board.receiveShadow = true;
    const bridle1 = bridleHanging();
    bridle1.position.set(-4.75, FLOOR + 2.12, 3.605);
    g.add(bridle1);
    const bridle2 = bridleHanging();
    bridle2.position.set(-4.35, FLOOR + 2.12, 3.605);
    bridle2.rotation.z = 0.08;
    g.add(bridle2);
    const collar = horseCollar();
    collar.position.set(-3.85, FLOOR + 1.8, 3.61);
    collar.rotation.y = 0;
    g.add(collar);
    const strap = leatherStrap(0.42);
    strap.position.set(-3.45, FLOOR + 1.85, 3.605);
    g.add(strap);
    const coil = ropeCoil(0.12, 0.035);
    coil.position.set(-3.5, FLOOR + 1.55, 3.6);
    g.add(coil);
    // small shelf with tin cans
    addBox(g, M_.plankDark, 0.5, 0.03, 0.16, -3.1, FLOOR + 1.5, 3.63, 'tack-shelf');
    addCyl(g, M_.tin, 0.045, 0.045, 0.11, 8, -3.2, FLOOR + 1.57, 3.63, 'tack-tin-1');
    addCyl(g, M_.tin, 0.04, 0.04, 0.09, 8, -3.05, FLOOR + 1.56, 3.63, 'tack-tin-2');
  }

  // Blanket bar on the west wall (north end) with two draped blankets —
  // kept 5 cm clear of the building's south wall inner face (z = 6.25).
  {
    addBox(g, M_.timber, 0.05, 0.05, 0.8, -5.32, FLOOR + 1.55, 5.8, 'blanket-bar');
    const blanket = drapedBlanket(0.6, 0x7a4a3a);
    blanket.position.set(-5.28, FLOOR + 1.545, 5.8);
    blanket.rotation.y = Math.PI / 2;
    g.add(blanket);
    // the second blanket lies folded on the crate (top at 0.6 — exact seat)
    const folded = drapedBlanket(0.6, 0x5d5a4a);
    folded.position.set(-4.85, FLOOR + 0.5, 5.0);
    folded.rotation.y = 0.16;
    g.add(folded);
  }

  // Horseshoe rack on the building's south wall inner face (z = 6.25)
  {
    const rack = addBox(g, M_.trim, 0.95, 0.3, 0.035, -4.35, FLOOR + 1.85, 6.233, 'shoe-rack-board');
    rack.receiveShadow = true;
    for (let i = 0; i < 4; i++) {
      const shoe = horseshoe();
      shoe.position.set(-4.7 + i * 0.24, FLOOR + 1.88, 6.205);
      shoe.rotation.z = i % 2 ? 0.3 : -0.2;
      g.add(shoe);
    }
  }

  // Crate + tool box on the floor
  const crate = woodCrate(0.45, 0.5);
  crate.position.set(-4.85, FLOOR, 5.0);
  crate.rotation.y = 0.16;
  g.add(crate);
  const box = toolBox();
  box.position.set(-3.55, FLOOR, 5.85);
  box.rotation.y = -0.4;
  g.add(box);

  // TACK sign above the room door (aisle face of the room wall, x = −1.915)
  {
    const sign = boardSign('TACK', 0.62, 0.26);
    sign.position.set(-1.895, FLOOR + 2.6, 5.525);
    sign.rotation.y = Math.PI / 2; // face the aisle (+x)
    g.add(sign);
  }
  // Dark RATES board north of the door on the same face
  {
    const rates = boardSign('RATES', 0.72, 0.5, {
      sub: 'LIVERY 50c - SHOE 25c', dark: true,
    });
    rates.position.set(-1.895, FLOOR + 1.75, 4.25);
    rates.rotation.y = Math.PI / 2;
    g.add(rates);
  }

  return g;
}

/* -------------------------------------------------------------------------- */
/* FEED ROOM (SE)                                                             */
/* -------------------------------------------------------------------------- */

export function buildFeedRoomContents(): THREE.Group {
  const M_: StableMaterials = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'feed-room-contents';

  // Hay-bale stack against the room's north face (divider z = 3.56):
  // 2 bales bottom + 1 crosswise on top, all resting on the floor slab.
  const b1 = hayBale();
  b1.position.set(4.0, FLOOR, 3.87);
  g.add(b1);
  const b2 = hayBale();
  b2.position.set(4.9, FLOOR, 3.87);
  b2.rotation.y = 0.03;
  g.add(b2);
  const b3 = hayBale();
  b3.position.set(4.45, FLOOR + 0.5, 3.87);
  b3.rotation.y = Math.PI / 2 + 0.05;
  g.add(b3);

  // Grain sacks: 3 lying + 1 standing, west of the bales
  const s1 = grainSack(false, 1);
  s1.position.set(2.6, FLOOR, 3.95);
  s1.rotation.y = 0.1;
  g.add(s1);
  const s2 = grainSack(false, 2);
  s2.position.set(2.6, FLOOR, 4.55);
  s2.rotation.y = -0.15;
  g.add(s2);
  const s3 = grainSack(false, 3);
  s3.position.set(2.6, FLOOR + 0.38, 4.25);
  s3.rotation.y = 0.35;
  g.add(s3);
  const s4 = grainSack(true, 4);
  s4.position.set(3.3, FLOOR, 4.5);
  g.add(s4);

  // Grain bin with a scoop
  const bin = grainBox();
  bin.position.set(4.95, FLOOR, 4.9);
  bin.rotation.y = 0;
  g.add(bin);
  const scoop = addBox(g, M_.tin, 0.12, 0.05, 0.18, 4.75, FLOOR + 0.86, 5.05, 'feed-scoop');
  scoop.rotation.z = 0.2;

  // Bucket stack + crate near the room's east wall
  const bk1 = bucket('metal', false);
  bk1.position.set(5.05, FLOOR, 5.9);
  g.add(bk1);
  const bk2 = bucket('wood', false);
  bk2.position.set(5.05, FLOOR + 0.23, 5.9);
  bk2.rotation.y = 0.5;
  g.add(bk2);
  const crate = woodCrate(0.5, 0.55);
  crate.position.set(4.8, FLOOR, 5.35);
  crate.rotation.y = -0.22;
  g.add(crate);

  // Straw on the floor
  const straw = strawScatter(2.2, 1.6, 9);
  straw.position.set(3.4, FLOOR + 0.002, 5.3);
  g.add(straw);

  // FEED sign above the room door (aisle face x = +1.915)
  {
    const sign = boardSign('FEED', 0.62, 0.26);
    sign.position.set(1.895, FLOOR + 2.6, 5.525);
    sign.rotation.y = Math.PI / 2; // face the aisle (−x)
    g.add(sign);
  }

  return g;
}

/* -------------------------------------------------------------------------- */
/* FARRIER BAY (north end of the aisle, under the loft)                       */
/* -------------------------------------------------------------------------- */

export function buildFarrierContents(): THREE.Group {
  const M_: StableMaterials = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'farrier-contents';

  // The BENCH (solid def) stands against the WEST stall front, 1.5 m long
  // along z, top at y = 1.0 — tools laid out on it.
  const hammerT = hammer();
  hammerT.position.set(-1.72, 1.0, -5.85);
  hammerT.rotation.y = 0.4;
  g.add(hammerT);
  const tongsT = tongs();
  tongsT.position.set(-1.52, 1.0, -5.62);
  tongsT.rotation.y = -0.3;
  g.add(tongsT);
  for (const [sx, sy] of [[-1.68, -5.12], [-1.5, -5.2]] as const) {
    const shoe = horseshoe();
    shoe.position.set(sx, 1.005, sy);
    shoe.rotation.x = Math.PI / 2;
    shoe.rotation.z = sx > -1.55 ? 0.5 : -0.3;
    g.add(shoe);
  }
  const nailTin = addCyl(g, M_.tin, 0.06, 0.06, 0.1, 10, -1.78, 1.05, -4.95, 'nail-tin');
  nailTin.castShadow = true;

  // FARRIER sign on the bench-side stall front's aisle face (x = −1.915),
  // above the bench — the bay reads as a named work area from the aisle.
  {
    const sign = boardSign('FARRIER', 0.9, 0.32);
    sign.position.set(-1.913, FLOOR + 2.32, -5.3);
    sign.rotation.y = Math.PI / 2; // face +x (the aisle)
    g.add(sign);
  }

  // Horseshoe rack on the north wall (above the water trough line)
  {
    const rack = addBox(g, M_.trim, 0.95, 0.3, 0.035, -0.2, FLOOR + 1.9, -6.233, 'farrier-shoe-rack');
    rack.receiveShadow = true;
    for (let i = 0; i < 4; i++) {
      const shoe = horseshoe();
      shoe.position.set(-0.55 + i * 0.24, FLOOR + 1.93, -6.205);
      shoe.rotation.z = i % 2 ? -0.25 : 0.35;
      g.add(shoe);
    }
  }

  // Iron scraps box + quench bucket + dropped shoe + straw
  const scraps = addBox(g, M_.rust, 0.5, 0.22, 0.36, -1.62, FLOOR + 0.11, -4.78, 'iron-scraps-box');
  scraps.receiveShadow = true;
  for (let i = 0; i < 3; i++) {
    const scrap = addBox(g, M_.iron, 0.16, 0.02, 0.03, -1.72 + i * 0.09, FLOOR + 0.23, -4.75 - (i % 2) * 0.06, `iron-scrap-${i}`);
    scrap.rotation.y = i * 0.7;
    g.add(scrap);
  }
  const quench = bucket('metal', true);
  quench.position.set(1.32, FLOOR, -4.72);
  g.add(quench);
  const dropped = horseshoe();
  dropped.position.set(0.92, FLOOR + 0.014, -4.55);
  dropped.rotation.x = Math.PI / 2;
  dropped.rotation.z = 1.1;
  g.add(dropped);
  const straw = strawScatter(1.0, 0.8, 4);
  straw.position.set(0.5, FLOOR + 0.002, -4.4);
  g.add(straw);

  return g;
}

/* -------------------------------------------------------------------------- */
/* WATER (barrel station by the gate; the big trough is a SOLID def NW)       */
/* -------------------------------------------------------------------------- */

export function buildWaterContents(): THREE.Group {
  const M_: StableMaterials = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'water-contents';

  const barrel = smallBarrel(0.3, 0.9, true);
  // Positioned NORTH of the feed door's swept sector (the open feed-room
  // leaf sweeps the aisle quadrant x∈[1.0,1.975], z∈[5.05,6.02]).
  barrel.position.set(1.45, FLOOR, 4.35);
  g.add(barrel);
  const metal = bucket('metal', true);
  metal.position.set(0.92, FLOOR, 5.18);
  metal.rotation.y = 0.6;
  g.add(metal);
  const wood = bucket('wood', true);
  wood.position.set(1.05, FLOOR, 4.75);
  wood.rotation.y = -0.4;
  g.add(wood);
  // dipper across the barrel rim
  const dipper = addCyl(g, M_.tin, 0.05, 0.04, 0.03, 8, 1.45, FLOOR + 0.945, 4.13, 'water-dipper');
  dipper.rotation.x = Math.PI / 2;
  dipper.castShadow = true;

  return g;
}

/* -------------------------------------------------------------------------- */
/* HAY LOFT (storage on the deck — deck top at LOFT.deckTopY)                 */
/* -------------------------------------------------------------------------- */

export function buildLoftContents(): THREE.Group {
  const g = new THREE.Group();
  const deck = STABLE_LAYOUT.loft.deckTopY;
  g.name = 'loft-contents';

  // Bale stack A: 2 + 1, west end
  const a1 = hayBale();
  a1.position.set(-3.7, deck, -5.55);
  g.add(a1);
  const a2 = hayBale();
  a2.position.set(-2.78, deck, -5.55);
  a2.rotation.y = 0.04;
  g.add(a2);
  const a3 = hayBale();
  a3.position.set(-3.24, deck + 0.5, -5.55);
  a3.rotation.y = Math.PI / 2 - 0.06;
  g.add(a3);

  // Bale stack B: 2 bales, east end
  const b1 = hayBale();
  b1.position.set(3.1, deck, -4.7);
  b1.rotation.y = -0.08;
  g.add(b1);
  const b2 = hayBale();
  b2.position.set(3.99, deck, -4.72);
  g.add(b2);

  // Crate + loose hay + straw
  const crate = woodCrate(0.55, 0.6);
  crate.position.set(-4.5, deck, -3.3);
  crate.rotation.y = 0.3;
  g.add(crate);
  const pile = hayPile(0.5, 0.32, 5);
  pile.position.set(0.9, deck, -5.8);
  g.add(pile);
  const straw = strawScatter(2.4, 2.0, 7);
  straw.position.set(1.4, deck + 0.002, -3.6);
  g.add(straw);

  // Hanging rope on the loft fascia (aisle face, z = −0.55 line)
  const hook = addBox(g, createStableMaterials().iron, 0.03, 0.05, 0.04, -0.6, STABLE_LAYOUT.loft.deckTopY - 0.28, -0.52, 'loft-rope-hook');
  hook.castShadow = false;
  const coil = ropeCoil(0.13, 0.04);
  coil.position.set(-0.6, deck - 0.5, -0.5);
  g.add(coil);

  return g;
}
