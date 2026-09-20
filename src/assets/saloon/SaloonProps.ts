/**
 * src/assets/saloon/SaloonProps.ts
 * -----------------------------------------------------------------------------
 * Geometry builders for every saloon PROP, rebuilt from the legacy
 * SaloonBarAssetFactory draft to honour THIS project's architecture:
 *
 *  - Builders return a self-contained THREE.Group with the object ORIGIN at
 *    its natural anchor (floor level for furniture, wheel center for the
 *    chandelier, board center for the poster). They NEVER apply the registry
 *    transform — ThreeRendererAdapter does that.
 *  - Everything is primitive-based (Box/Cylinder/Torus/Plane) — no textures,
 *    no external models, low polygon counts.
 *  - Materials come from a per-object SaloonMaterials set (shared within the
 *    object, never across registry entries — see SaloonMaterials.ts).
 *  - Surface rules learned from the horse-model z-fighting fix are applied
 *    everywhere: NO two axis-aligned faces with different materials may be
 *    coplanar with the same normal. Overlays are either embedded into their
 *    host solid or stand proud of it by ≥ 5 mm; stacked contacts are always
 *    back-to-back (max-vs-min) pairs, which can never both face the viewer.
 *  - Lights: the chandelier adds AT MOST ONE real PointLight (metadata
 *    `lights`), everything else that reads as light is an emissive mesh.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { createSaloonMaterials, type SaloonMaterials } from './SaloonMaterials.js';
import {
  buildSaloonBottle,
  buildDecanter,
  buildCarafe,
  buildTumbler,
  buildTallGlass,
  buildWineGlass,
  buildShotGlass,
  buildInvertedTumbler,
  createGlasswareGeoCache,
  type BottleKind,
} from './SaloonGlassware.js';

/** Geometric helpers ------------------------------------------------------- */

/**
 * Shadow-caster size floor (weak-laptop perf revision) — see the twin note in
 * StableProps. The 768²/85 m sun map ≈ 9 texels/m: a part under ~9 cm casts
 * sub-texel noise. Explicit opts.cast still wins; receiveShadow unchanged.
 */
const SHADOW_CASTER_MIN = 0.09;

interface MeshOptions {
  /** Face +Z (front) semantics stay with the builder; default no rotation. */
  rx?: number;
  ry?: number;
  rz?: number;
  cast?: boolean;
  receive?: boolean;
}

function box(
  parent: THREE.Object3D,
  m: SaloonMaterials[keyof SaloonMaterials],
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  name: string,
  opts: MeshOptions = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rz) mesh.rotation.z = opts.rz;
  mesh.castShadow = opts.cast ?? Math.max(w, h, d) >= SHADOW_CASTER_MIN;
  mesh.receiveShadow = opts.receive ?? true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function cyl(
  parent: THREE.Object3D,
  m: SaloonMaterials[keyof SaloonMaterials],
  rTop: number, rBottom: number, h: number, seg: number,
  x: number, y: number, z: number,
  name: string,
  opts: MeshOptions = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), m);
  mesh.position.set(x, y, z);
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rz) mesh.rotation.z = opts.rz;
  mesh.castShadow = opts.cast ?? (Math.max(rTop, rBottom) * 2 >= SHADOW_CASTER_MIN || h >= SHADOW_CASTER_MIN);
  mesh.receiveShadow = opts.receive ?? true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function torus(
  parent: THREE.Object3D,
  m: SaloonMaterials[keyof SaloonMaterials],
  r: number, tube: number, seg: number,
  x: number, y: number, z: number,
  name: string,
  opts: MeshOptions = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, seg), m);
  mesh.position.set(x, y, z);
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rz) mesh.rotation.z = opts.rz;
  mesh.castShadow = opts.cast ?? true;
  mesh.receiveShadow = opts.receive ?? true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function plane(
  parent: THREE.Object3D,
  m: SaloonMaterials[keyof SaloonMaterials],
  w: number, h: number,
  x: number, y: number, z: number,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

/* ========================================================================== */
/* Bar corner                                                                 */
/* ========================================================================== */

export interface PropSizeOptions {
  barCounterLength?: number;
  backBarWidth?: number;
}

/**
 * Long wooden bar counter: slab body, overhanging countertop, raised back
 * lip, brass foot rail on brackets, vertical front slats — plus a NATURAL
 * used-bar dressing on top (task §9): cash register, a labelled whiskey
 * bottle pair on a tray, decanter, drinking glasses, folded towel,
 * coasters, cork scatter, tin and a service bell. Roughly 40–50 % of the
 * counter top stays deliberately empty; items are grouped in clusters
 * (register / bottles+glasses / towel+coasters / tin+bell), never scattered.
 * Front = +Z.
 */
export function buildBarCounter(opts: PropSizeOptions = {}): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-bar-counter';

  const length = opts.barCounterLength ?? 4;
  const height = 1.1;
  const depth = 0.7;

  box(g, M.woodMed, length, height, depth, 0, height / 2, 0, 'bar-body');
  // Countertop: bottom face rests exactly ON the body's top face (stacked,
  // back-to-back); front/back overhang 6 cm each so the edge reads.
  box(g, M.woodLight, length + 0.1, 0.06, depth + 0.12, 0, height + 0.03, 0, 'bar-countertop');
  // Raised back lip stands on the countertop's back edge (stacked contact at
  // y = countertop top), back face flush with the countertop's back face —
  // the two faces are vertically stacked, never area-overlapping.
  const topHalfDepth = (depth + 0.12) / 2; // countertop half depth = 0.41
  box(g, M.woodDark, length + 0.1, 0.12, 0.06, 0, height + 0.12, -topHalfDepth + 0.03, 'bar-back-lip');

  // Brass foot rail stands 1 cm proud of the front face on small brackets.
  const railZ = depth / 2 + 0.03;
  cyl(g, M.brass, 0.02, 0.02, length - 0.2, 10, 0, 0.25, railZ, 'bar-foot-rail', { rz: Math.PI / 2 });
  for (const bx of [-length / 3, 0, length / 3]) {
    box(g, M.iron, 0.03, 0.03, 0.08, bx, 0.25, depth / 2 + 0.005, 'bar-rail-bracket');
  }

  // Front paneling: vertical slats whose backs touch the front face
  // (back-to-back contact), fronts 2 cm proud.
  const slatCount = Math.max(3, Math.round(length / 0.5));
  for (let i = 0; i < slatCount; i += 1) {
    const t = (i + 0.5) / slatCount - 0.5;
    box(g, M.woodDark, 0.04, height * 0.7, 0.02, t * (length - 0.1), height * 0.42, depth / 2 + 0.01, `bar-slat-${i}`);
  }

  // --- Counter-top dressing (task §9) ----------------------------------------
  // Everything stands ON the countertop top face (y = height + 0.06);
  // the back lip (z ∈ [-0.41, -0.35]) stays clear. The customer-facing
  // strips between clusters stay EMPTY on purpose.
  const topY = height + 0.06;
  const G = createGlasswareGeoCache();

  // Cluster 1 — cash register, west end.
  const register = buildCashRegister(M);
  register.position.set(-length / 2 + 0.4, topY, -0.05);
  g.add(register);

  // Cluster 2 — whiskey bottle pair on a tray + decanter + glasses.
  const tray = new THREE.Group();
  tray.name = 'bar-bottle-tray';
  box(tray, M.woodDark, 0.36, 0.018, 0.18, 0, 0.009, 0, 'tray-board');
  box(tray, M.woodDark, 0.36, 0.025, 0.012, 0, 0.0305, 0.084, 'tray-rail-front');
  box(tray, M.woodDark, 0.36, 0.025, 0.012, 0, 0.0305, -0.084, 'tray-rail-back');
  tray.position.set(-0.7, topY, -0.22);
  g.add(tray);
  const cb1 = buildSaloonBottle('whiskey', M, G, { label: 'cream' });
  cb1.position.set(-0.09, 0, 0);
  const cb2 = buildSaloonBottle('whiskey', M, G, { label: 'band' });
  cb2.position.set(0.09, 0, 0);
  tray.add(cb1, cb2);
  const cd = buildDecanter(M, G);
  cd.position.set(-0.32, topY, -0.18);
  g.add(cd);
  const cg1 = buildTallGlass(M, G);
  cg1.position.set(-0.45, topY, 0.05);
  g.add(cg1);
  const cg2 = buildTumbler(M, G, { whiskey: true });
  cg2.position.set(-0.18, topY, 0.08);
  g.add(cg2);

  // Cluster 3 — folded towel + coasters.
  box(g, M.paper, 0.22, 0.03, 0.16, 0.5, topY + 0.015, 0.1, 'bar-towel', { cast: false });
  cyl(g, M.woodDark, 0.045, 0.045, 0.006, 10, 0.95, topY + 0.003, 0.02, 'bar-coaster-1', { cast: false });
  cyl(g, M.paper, 0.045, 0.045, 0.006, 10, 1.05, topY + 0.003, 0.1, 'bar-coaster-2', { cast: false });

  // Cork scatter between the clusters.
  for (const [i, [cx, cz]] of [[-0.05, 0.18], [0.06, 0.22], [0.13, 0.15]].entries()) {
    cyl(g, M.cork, 0.011, 0.011, 0.02, 6, cx, topY + 0.01, cz, `bar-cork-${i}`, { cast: false, rz: 0.4 * i });
  }

  // Cluster 4 — tin + brass service bell, east end.
  cyl(g, M.iron, 0.05, 0.05, 0.07, 10, 1.45, topY + 0.035, -0.25, 'bar-tin');
  cyl(g, M.brass, 0.028, 0.028, 0.008, 10, 1.75, topY + 0.004, -0.1, 'bar-bell-base');
  const bellDome = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), M.brass);
  bellDome.name = 'bar-bell-dome';
  bellDome.position.set(1.75, topY + 0.016, -0.1);
  bellDome.castShadow = false;
  g.add(bellDome);
  const bellKnob = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), M.brass);
  bellKnob.name = 'bar-bell-knob';
  bellKnob.position.set(1.75, topY + 0.044, -0.1);
  bellKnob.castShadow = false;
  g.add(bellKnob);

  return g;
}

/**
 * Old-style cash register (origin = base center): dark metal body with a
 * raised back block, brass drawer, ivory key slab, side crank and a paper
 * roll. Used on BOTH the bar counter and the back-bar countertop.
 */
function buildCashRegister(M: SaloonMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = 'saloon-cash-register';

  box(g, M.iron, 0.3, 0.16, 0.24, 0, 0.08, 0, 'register-body');
  // Raised back block: stacked on the body top, back-aligned with it.
  box(g, M.iron, 0.3, 0.07, 0.12, 0, 0.195, -0.06, 'register-top');
  // Drawer slides out of the front face (back-to-back contact).
  box(g, M.brass, 0.24, 0.05, 0.03, 0, 0.055, 0.135, 'register-drawer');
  // Key slab stacked on the body top, in front of the raised block.
  box(g, M.paper, 0.24, 0.012, 0.07, 0, 0.166, 0.055, 'register-keys');
  // Side crank + paper roll.
  cyl(g, M.brass, 0.007, 0.007, 0.05, 8, 0.165, 0.19, 0.02, 'register-crank', { rz: Math.PI / 2 });
  cyl(g, M.paper, 0.022, 0.022, 0.05, 8, 0, 0.255, -0.06, 'register-roll', { cast: false });

  return g;
}

/** Small mantle clock (origin = base center) for the back-bar countertop. */
function buildMantleClock(M: SaloonMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = 'saloon-mantle-clock';

  box(g, M.woodDark, 0.12, 0.03, 0.06, 0, 0.015, 0, 'clock-base');
  // Face disc standing upright (axis rotated onto Z), bottom on the base.
  cyl(g, M.paper, 0.06, 0.06, 0.025, 14, 0, 0.09, 0, 'clock-face', { rx: Math.PI / 2 });
  torus(g, M.brass, 0.06, 0.008, 16, 0, 0.09, 0.014, 'clock-ring', { cast: false });
  box(g, M.ink, 0.006, 0.03, 0.004, 0, 0.098, 0.014, 'clock-hand-hour', { cast: false });
  box(g, M.ink, 0.005, 0.04, 0.004, 0.008, 0.105, 0.016, 'clock-hand-minute', { cast: false, rz: 2.1 });

  return g;
}

/**
 * Shelving unit behind the bar — OPEN-SHELF construction (task §3).
 *
 * The previous build was a SOLID full-depth frame slab; its bottles and
 * glasses were placed at depths INSIDE that solid volume, so the frame's
 * own front face hid them — the root cause of the invisible glassware.
 * The required customer-side layering is:
 *
 *   BACK WALL → MIRROR/REAR PANEL → SHELVES → BOTTLES → GLASSWARE →
 *   FRONT SHELF EDGE → CUSTOMER SPACE
 *
 * so the unit is now: thin back panel + proud mirror + solid base cabinet
 * + OPEN shelves that project forward. Bottles stand on the shelf BACK
 * half, several cm clear of the mirror face; glassware stands on the
 * shelf FRONT edge, fully in front of the bottles; the countertop carries
 * the hero row (decanter, carafe, wine glasses, whiskey tumbler) plus a
 * cash register and a mantle clock. NO renderOrder / depthTest tricks —
 * the fix is purely geometric. Front = +Z.
 */
export function buildBackBar(opts: PropSizeOptions = {}): THREE.Group {
  const M = createSaloonMaterials();
  const G = createGlasswareGeoCache();
  const g = new THREE.Group();
  g.name = 'saloon-back-bar';

  const width = opts.backBarWidth ?? 3.6;
  const depth = 0.42;
  const panelH = 2.6; // panel + side panels; crown caps at 2.74
  const shelfTops = [1.44, 1.9, 2.34]; // spacing fits a 0.40 m tall bottle + slab

  // Back panel: THIN — nothing lives behind the mirror plane.
  box(g, M.woodDark, width, panelH, 0.04, 0, panelH / 2, -depth / 2 + 0.02, 'backbar-back-panel');

  // Base cabinet (solid, below the shelves) + plank fronts + brass band.
  box(g, M.woodDark, width, 0.92, depth, 0, 0.46, 0, 'backbar-base-cabinet');
  const plankW = (width - 0.3) / 3;
  for (let i = 0; i < 3; i += 1) {
    const px = -width / 2 + 0.15 + plankW * (i + 0.5);
    box(g, M.woodMed, plankW - 0.02, 0.7, 0.02, px, 0.41, depth / 2 + 0.01, `backbar-plank-${i}`);
    cyl(g, M.brass, 0.012, 0.012, 0.02, 8, px, 0.72, depth / 2 + 0.03, `backbar-knob-${i}`, { rx: Math.PI / 2 });
  }
  box(g, M.brass, width, 0.03, 0.02, 0, 0.875, depth / 2 + 0.01, 'backbar-brass-band');

  // Countertop: stacked on the cabinet top, overhanging front + sides.
  box(g, M.woodLight, width + 0.1, 0.05, depth + 0.08, 0, 0.945, 0.02, 'backbar-countertop');
  const counterY = 0.97; // countertop top face

  // Side panels: open-shelf uprights above the countertop.
  for (const side of [-1, 1]) {
    box(
      g, M.woodDark, 0.06, panelH - 0.97, depth,
      side * (width / 2 - 0.03), 0.97 + (panelH - 0.97) / 2, 0,
      `backbar-side-panel-${side < 0 ? 'l' : 'r'}`,
    );
  }

  // Mirror: stacked ON the back panel's front face (back-to-back), BEHIND
  // every bottle and glass.
  box(g, M.mirror, 2.4, 1.05, 0.03, 0, 1.95, -depth / 2 + 0.055, 'backbar-mirror', { cast: false });
  // Mirror trim: embedded 1 cm into the mirror, fronts 1.5 cm proud.
  const mz = -depth / 2 + 0.065;
  box(g, M.woodLight, 2.56, 0.05, 0.02, 0, 2.5, mz, 'backbar-mirror-trim-top', { cast: false });
  box(g, M.woodLight, 2.56, 0.05, 0.02, 0, 1.4, mz, 'backbar-mirror-trim-bottom', { cast: false });
  box(g, M.woodLight, 0.05, 1.05, 0.02, -1.225, 1.95, mz, 'backbar-mirror-trim-left', { cast: false });
  box(g, M.woodLight, 0.05, 1.05, 0.02, 1.225, 1.95, mz, 'backbar-mirror-trim-right', { cast: false });

  // Shelves project FORWARD from the back panel — back edge 3 cm clear of
  // the mirror's front face, front edge standing proud as the visible lip.
  shelfTops.forEach((top, i) => {
    box(g, M.woodMed, width - 0.12, 0.035, 0.3, 0, top - 0.0175, 0.04, `backbar-shelf-${i}`);
    // Brass edge strip riding the shelf's front-top edge (stacked on the
    // shelf top, front 1.5 cm proud of the slab face).
    box(g, M.brass, width - 0.12, 0.025, 0.04, 0, top + 0.0125, 0.185, `backbar-shelf-strip-${i}`);
  });

  // Crown caps panel + side panels; proud on every side.
  box(g, M.woodDark, width + 0.12, 0.14, depth + 0.06, 0, panelH + 0.07, -0.01, 'backbar-crown');

  // Small placards on the back-panel flanks, between shelves 1 and 2.
  for (const side of [-1, 1]) {
    const px = side * 1.5;
    box(g, M.paper, 0.28, 0.36, 0.015, px, 1.63, -depth / 2 + 0.035, `backbar-placard-${side < 0 ? 'l' : 'r'}`, { cast: false });
    box(g, M.ink, 0.2, 0.02, 0.01, px, 1.72, -depth / 2 + 0.042, `backbar-placard-line-${side < 0 ? 'l' : 'r'}-0`, { cast: false });
    box(g, M.ink, 0.16, 0.02, 0.01, px, 1.63, -depth / 2 + 0.042, `backbar-placard-line-${side < 0 ? 'l' : 'r'}-1`, { cast: false });
    box(g, M.ink, 0.18, 0.02, 0.01, px, 1.54, -depth / 2 + 0.042, `backbar-placard-line-${side < 0 ? 'l' : 'r'}-2`, { cast: false });
  }

  // Cash register (west) + mantle clock (east) on the countertop.
  const register = buildCashRegister(M);
  register.position.set(-1.35, counterY, 0);
  g.add(register);
  const clock = buildMantleClock(M);
  clock.position.set(1.35, counterY, 0);
  g.add(clock);

  // --- Shelf BOTTLES: back row, clear of the mirror --------------------------
  const shelfPlan: Array<Array<{ kind: BottleKind; label?: 'cream' | 'band' }>> = [
    [{ kind: 'whiskey', label: 'cream' }, { kind: 'whiskey' }, { kind: 'tall' }, { kind: 'short' }, { kind: 'tall', label: 'band' }, { kind: 'whiskey' }],
    [{ kind: 'tall' }, { kind: 'short', label: 'cream' }, { kind: 'tall' }, { kind: 'whiskey', label: 'band' }, { kind: 'short' }, { kind: 'tall' }],
    [{ kind: 'short' }, { kind: 'short' }, { kind: 'short' }, { kind: 'short' }, { kind: 'short' }],
  ];
  const shelfXs = [
    [-1.5, -1.12, -0.4, 0.02, 0.85, 1.5],
    [-1.52, -1.15, -0.12, 0.35, 1.05, 1.5],
    [-1.5, -1.05, 0.25, 1.1, 1.5],
  ];
  shelfPlan.forEach((row, si) => {
    row.forEach((b, bi) => {
      const bottle = buildSaloonBottle(b.kind, M, G, { label: b.label });
      bottle.name = `backbar-bottle-${si}-${bi}`;
      bottle.position.set(shelfXs[si][bi], shelfTops[si], -0.045);
      g.add(bottle);
    });
  });

  // --- Countertop hero row: decanter, carafe, wine, whiskey ------------------
  const dec = buildDecanter(M, G);
  dec.position.set(0.55, counterY, 0.02);
  g.add(dec);
  const car = buildCarafe(M, G);
  car.position.set(0.85, counterY, 0.06);
  g.add(car);
  const w1 = buildWineGlass(M, G, 'half');
  w1.position.set(0.15, counterY, 0.08);
  g.add(w1);
  const w2 = buildWineGlass(M, G, 'full');
  w2.position.set(0.32, counterY, 0.04);
  g.add(w2);
  const wt = buildTumbler(M, G, { whiskey: true });
  wt.position.set(0.02, counterY, 0.05);
  g.add(wt);

  // --- Shelf GLASSWARE: front row — fully visible, in front of bottles ------
  const shelfGlass = (item: THREE.Group, x: number, top: number, i: number): void => {
    item.name = `backbar-glassware-${i}`;
    item.position.set(x, top, 0.1);
    g.add(item);
  };
  shelfGlass(buildTumbler(M, G), -0.75, shelfTops[0], 0);
  shelfGlass(buildTumbler(M, G, { whiskey: true }), -0.6, shelfTops[0], 1);
  shelfGlass(buildTumbler(M, G), 0.6, shelfTops[0], 2);
  shelfGlass(buildShotGlass(M, G), 0.75, shelfTops[0], 3);
  shelfGlass(buildShotGlass(M, G), 0.85, shelfTops[0], 4);
  shelfGlass(buildWineGlass(M, G, 'empty'), -0.7, shelfTops[1], 5);
  shelfGlass(buildWineGlass(M, G, 'half'), 0.6, shelfTops[1], 6);
  shelfGlass(buildWineGlass(M, G, 'full'), 0.75, shelfTops[1], 7);
  shelfGlass(buildInvertedTumbler(M, G), -0.65, shelfTops[2], 8);
  shelfGlass(buildInvertedTumbler(M, G), 0.6, shelfTops[2], 9);
  shelfGlass(buildInvertedTumbler(M, G), 0.75, shelfTops[2], 10);

  return g;
}

/** Round-topped iron-based bar stool (origin at floor center). */
export function buildBarStool(): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-bar-stool';

  const seatH = 0.75;
  cyl(g, M.woodMed, 0.16, 0.16, 0.04, 16, 0, seatH, 0, 'stool-seat');
  // Pole embeds 2 cm into the seat (a floating gap would read as a bug).
  cyl(g, M.iron, 0.03, 0.03, seatH - 0.02, 8, 0, (seatH - 0.02) / 2, 0, 'stool-pole');
  torus(g, M.iron, 0.14, 0.015, 16, 0, 0.28, 0, 'stool-footring', { rx: Math.PI / 2 });
  cyl(g, M.iron, 0.09, 0.09, 0.02, 16, 0, 0.01, 0, 'stool-base');

  return g;
}

/* ========================================================================== */
/* Poker corner                                                               */
/* ========================================================================== */

/**
 * Round felt poker table (origin at floor center).
 *
 * Full prop fidelity per the task: pedestal base, turned column with collar
 * rings, wooden tabletop, green baize, leather armrest, brass studs, cards,
 * deck, dealer button, chip stacks, whiskey glass and ashtray. All the
 * "sitting on the felt" props embed 2–3 mm into the baize top (no floating
 * props, no coplanar faces). FELT_TOP is the baize surface every prop seats
 * against.
 */
export function buildPokerTable(): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-poker-table';

  const radius = 0.88;
  const FELT_TOP = 0.72;

  // --- Pedestal base (two tiers, stacked back-to-back) -----------------------
  cyl(g, M.woodDark, 0.37, 0.42, 0.09, 14, 0, 0.045, 0, 'poker-pedestal-lower');
  cyl(g, M.woodMed, 0.29, 0.345, 0.06, 12, 0, 0.12, 0, 'poker-pedestal-upper');

  // --- Turned column: shaft + two collar rings + capital ----------------------
  // Z-FIGHT SCAN FIX: the shaft used to end EXACTLY at the high collar's top
  // plane (both caps co-facing at 0.55 → flicker across the whole shaft cap).
  // It now stops 2 cm short — the cap buries inside the collar ring.
  cyl(g, M.woodMed, 0.1, 0.12, 0.4, 10, 0, 0.33, 0, 'poker-column');
  cyl(g, M.woodDark, 0.14, 0.16, 0.06, 10, 0, 0.23, 0, 'poker-collar-low');
  cyl(g, M.woodDark, 0.14, 0.16, 0.06, 10, 0, 0.52, 0, 'poker-collar-high');
  cyl(g, M.woodMed, 0.19, 0.21, 0.09, 10, 0, 0.59, 0, 'poker-capital');

  // --- Tabletop + green baize --------------------------------------------------
  // Top slab sits ON the capital (stacked contact at 0.635); baize embeds
  // 8 mm into the slab so its top stands 1 cm proud of the wood.
  cyl(g, M.woodMed, radius, radius, 0.075, 24, 0, 0.6725, 0, 'poker-tabletop');
  cyl(g, M.felt, radius - 0.08, radius - 0.08, 0.018, 24, 0, 0.711, 0, 'poker-baize');

  // --- Leather armrest riding the rim + brass studs on its inner edge ---------
  torus(g, M.leather, radius - 0.045, 0.055, 24, 0, FELT_TOP, 0, 'poker-armrest', { rx: Math.PI / 2 });
  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2;
    const r = radius - 0.108;
    cyl(g, M.brass, 0.012, 0.012, 0.018, 8, Math.cos(angle) * r, FELT_TOP + 0.006, Math.sin(angle) * r, `poker-stud-${i}`);
  }

  // --- Cards fanned near the center (each rotated slightly) --------------------
  for (let i = 0; i < 5; i += 1) {
    box(g, M.ivory, 0.12, 0.008, 0.18, -0.3 + i * 0.15, FELT_TOP + 0.003, 0.02, `poker-card-${i}`, {
      ry: (i - 2) * 0.05,
      cast: false,
    });
  }

  // --- Deck, dealer button, chip stacks ----------------------------------------
  box(g, M.leatherDark, 0.11, 0.028, 0.16, -0.52, FELT_TOP + 0.011, -0.25, 'poker-deck', { cast: false });
  cyl(g, M.ivory, 0.055, 0.055, 0.018, 12, 0.52, FELT_TOP + 0.006, -0.25, 'poker-dealer-button', { cast: false });

  const stacks = [
    { x: 0.28, z: 0.32, count: 8, mat: M.brass },
    { x: 0.44, z: 0.28, count: 6, mat: M.iron },
    { x: 0.15, z: 0.43, count: 10, mat: M.ivory },
  ];
  for (const [si, stack] of stacks.entries()) {
    for (let i = 0; i < stack.count; i += 1) {
      cyl(g, stack.mat, 0.042, 0.042, 0.011, 10, stack.x, FELT_TOP + 0.0025 + 0.0055 + i * 0.011, stack.z, `poker-chip-${si}-${i}`, { cast: false });
    }
  }

  // --- Whiskey glass (transparent shell + amber liquid inside) -----------------
  cyl(g, M.whiskeyGlass, 0.052, 0.047, 0.09, 10, -0.62, FELT_TOP + 0.043, 0.28, 'poker-whiskey-glass', { cast: false });
  cyl(g, M.amber, 0.042, 0.046, 0.055, 10, -0.62, FELT_TOP + 0.0255, 0.28, 'poker-whiskey', { cast: false });

  // --- Ashtray -------------------------------------------------------------------
  cyl(g, M.iron, 0.07, 0.065, 0.018, 10, 0.62, FELT_TOP + 0.007, 0.34, 'poker-ashtray', { cast: false });

  return g;
}

/**
 * Ladder-back chair (origin at floor center, "front" = +Z — the layout
 * module rotates chairs so this face points at the poker table).
 */
export function buildSaloonChair(): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-chair';

  const seatH = 0.45;
  const size = 0.4;

  box(g, M.woodMed, size, 0.04, size, 0, seatH, 0, 'chair-seat');
  const legXZ = size / 2 - 0.03;
  const legPositions: Array<[number, number]> = [
    [legXZ, legXZ],
    [-legXZ, legXZ],
    [legXZ, -legXZ],
    [-legXZ, -legXZ],
  ];
  legPositions.forEach(([x, z], i) => {
    cyl(g, M.woodDark, 0.02, 0.02, seatH, 8, x, seatH / 2, z, `chair-leg-${i}`);
  });
  // Backrest posts pass THROUGH the seat slab into it (embedded, no gap).
  for (const side of [-1, 1]) {
    cyl(
      g, M.woodDark, 0.02, 0.02, 0.45, 8,
      side * (size / 2 - 0.03), seatH + 0.225, -size / 2 + 0.03,
      side === -1 ? 'chair-post-l' : 'chair-post-r',
    );
  }
  for (let i = 0; i < 3; i += 1) {
    box(g, M.woodMed, size - 0.06, 0.03, 0.02, 0, seatH + 0.08 + i * 0.14, -size / 2 + 0.03, `chair-slat-${i}`);
  }

  return g;
}

/* ========================================================================== */
/* Music corner                                                               */
/* ========================================================================== */

/**
 * Upright saloon piano (origin at floor center, player side = +Z).
 *
 * Full furniture fidelity per the task: multi-layer cabinet (bottom board →
 * cabinet → top band → lid), side pilasters, red silk decorative panel with a
 * wooden lattice over it, fallboard, keybed, 21 individual white keys, black
 * keys in octave pattern, music desk with sheet paper, pedal lyre with three
 * brass pedals — plus twin brass candle sconces with emissive flames (no
 * real lights). Every front-mounted part is embedded into its host solid by
 * ≥ 5 mm; stacked contacts are back-to-back; nothing floats.
 */
export function buildPiano(): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-piano';

  const w = 1.52;
  const d = 0.65;

  // --- Multi-layer cabinet -----------------------------------------------------
  // Bottom board → main cabinet → top band → lid, each layer proud of the
  // one below in width/depth so the silhouette reads as stacked cabinetry.
  box(g, M.woodDark, w, 0.12, 0.5, 0, 0.06, -0.075, 'piano-bottom-board');
  box(g, M.woodMed, w - 0.04, 0.92, 0.5, 0, 0.58, -0.075, 'piano-cabinet');
  box(g, M.woodDark, w, 0.24, 0.52, 0, 1.16, -0.06, 'piano-top-band');
  // Lid: stacked ON the band top (1.28), overhanging on all sides.
  box(g, M.woodDark, w + 0.05, 0.06, d + 0.05, 0, 1.31, 0, 'piano-lid');

  // --- Side pilasters: full-height strips proud of cabinet + band fronts ------
  // Z-FIGHT SCAN FIX (two rounds): (1) the pilasters used to end EXACTLY at
  // the top-band's top plane — coplanar co-facing tops in two different woods;
  // they now stop 5 cm below it. (2) their BACKS shared the cabinet's back
  // plane (z −0.325) — both back faces co-facing across a ~830 cm² overlap;
  // the strips now sit 2 cm forward of the cabinet back (still proud at the
  // front, same silhouette from the room side).
  for (const side of [-1, 1]) {
    box(g, M.woodLight, 0.09, 1.13, 0.52, side * 0.68, 0.665, -0.045, `piano-pilaster-${side < 0 ? 'l' : 'r'}`);
  }

  // --- Red silk decorative panel + wooden lattice on the top-band front -------
  // Silk back is embedded 1 cm into the band front; lattice slats stack
  // back-to-back ON the silk front.
  box(g, M.silk, w - 0.22, 0.22, 0.03, 0, 1.16, 0.205, 'piano-silk-panel', { cast: false });
  for (let i = 0; i < 9; i += 1) {
    box(g, M.woodLight, 0.025, 0.18, 0.025, -0.47 + i * 0.118, 1.16, 0.2325, `piano-lattice-${i}`, { cast: false });
  }

  // --- Fallboard + keybed + keyboard --------------------------------------------
  // Fallboard: deep slab whose back embeds 1.5 cm into the cabinet front.
  box(g, M.woodLight, w - 0.16, 0.15, 0.1, 0, 0.84, 0.21, 'piano-fallboard');
  // Keybed: protrudes forward; back half buried in the cabinet.
  box(g, M.woodDark, w - 0.02, 0.13, 0.28, 0, 0.66, 0.31, 'piano-keybed');
  // 21 individual white keys, bottoms embedded 2.5 mm into the keybed top,
  // fronts cantilevering past the keybed edge like real keys.
  const keyW = (w - 0.2) / 21;
  for (let i = 0; i < 21; i += 1) {
    const x = -w / 2 + 0.1 + keyW * (i + 0.5);
    box(g, M.ivory, keyW * 0.9, 0.025, 0.17, x, 0.735, 0.43, `piano-key-white-${i}`, { cast: false });
  }
  // Black keys in octave pattern (C D EF G A B), bottoms buried in the white
  // strip, fronts recessed 3 cm — the classic keyboard silhouette.
  const pattern = [0, 1, 3, 4, 5];
  for (let octave = 0; octave < 3; octave += 1) {
    for (const offset of pattern) {
      const index = octave * 7 + offset;
      if (index >= 20) continue;
      const x = -w / 2 + 0.1 + keyW * (index + 1);
      box(g, M.ink, keyW * 0.55, 0.03, 0.11, x, 0.76, 0.4, `piano-key-black-${index}`, { cast: false });
    }
  }

  // --- Music desk with sheet paper (shelf above the fallboard) ------------------
  box(g, M.woodLight, 0.95, 0.035, 0.22, 0, 0.99, 0.28, 'piano-music-desk');
  plane(g, M.paper, 0.38, 0.21, 0, 1.09, 0.3, 'piano-music-paper');

  // --- Pedal lyre: two legs to the floor + three brass pedals --------------------
  for (const side of [-1, 1]) {
    box(g, M.woodDark, 0.06, 0.49, 0.05, side * 0.11, 0.245, 0.2, `piano-lyre-leg-${side < 0 ? 'l' : 'r'}`);
  }
  for (const [i, x] of [-0.055, 0, 0.055].entries()) {
    cyl(g, M.brass, 0.022, 0.022, 0.13, 8, x, 0.11, 0.2, `piano-pedal-${i}`);
  }

  // --- Twin brass candle sconces on the pilasters + emissive flames --------------
  for (const side of [-1, 1]) {
    const x = side * 0.7;
    cyl(g, M.brass, 0.02, 0.02, 0.17, 8, x, 0.945, 0.22, `piano-sconce-${side < 0 ? 'l' : 'r'}`);
    box(g, M.flame, 0.02, 0.05, 0.02, x, 1.055, 0.22, `piano-flame-${side < 0 ? 'l' : 'r'}`, { cast: false });
  }

  return g;
}

/**
 * Round piano stool (origin at floor center): leather-padded seat on a
 * turned wooden pole with a flat iron foot. The pole embeds into both the
 * seat and the foot so nothing floats.
 */
export function buildPianoStool(): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-piano-stool';

  cyl(g, M.leather, 0.2, 0.2, 0.07, 14, 0, 0.525, 0, 'pianostool-seat');
  cyl(g, M.woodMed, 0.055, 0.065, 0.5, 10, 0, 0.28, 0, 'pianostool-pole');
  cyl(g, M.iron, 0.16, 0.16, 0.025, 12, 0, 0.0125, 0, 'pianostool-foot');

  return g;
}

/* ========================================================================== */
/* Entrance                                                                   */
/* ========================================================================== */

/**
 * Classic western saloon DOUBLE doors — FULL HEIGHT (the 2026 entrance-door
 * revision: the old 1.1 m half-leaves vanished against the 2.3 m opening and
 * the doorway read as a bare hole — user report: «بار هنوز در ورودی ندارند»).
 * The same saloon style, now actually readable as a door: two paneled
 * walnut leaves with push bars on BOTH faces meeting at the doorway center,
 * hanging on INDEPENDENT, NAMED hinge groups ('swinging-door-left-hinge' /
 * '…-right-hinge'), both flagged `userData.dynamic = true` — the MergeStatic
 * contract (see MergeStatic.ts / BankExterior.ts): a runtime-rotated pivot
 * without that flag gets its subtree baked into the def's static merged mesh
 * and the hinge spins EMPTY (the visible leaf never moves — the exact bug
 * the browser run caught: door state toggled, leaves frozen).
 *
 * House door contract (mirrors the gunshop/bank front doors): t=0 is dead
 * closed — the leaf yaws are NEVER built in here; the runtime pose comes
 * solely from setSaloonDoorsOpen (pure, deterministic re-derivation). E
 * swings both leaves INWARD (into the bar): the inward sweep keeps every
 * leaf point at z ≤ the doorway plane, so the leaves can never touch the
 * porch deck outside (its top is 9 cm, at z ≥ the facade plane).
 */
export function buildSwingingDoors(): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-swinging-doors';

  const doorH = 2.24; // 2.3 m doorway − 6 cm: 2 cm bottom lift + 4 cm header gap
  const leafW = 0.775; // hinge axis 1 cm off its jamb → free edge 1.5 cm off the meeting line
  const leafT = 0.05;

  const buildLeaf = (side: -1 | 1): void => {
    const hinge = new THREE.Group();
    hinge.name = side === -1 ? 'swinging-door-left-hinge' : 'swinging-door-right-hinge';
    // Hinge axis 1 cm off its jamb; the leaf extends toward the center, free
    // edge 1.5 cm off the meeting line. (Offsetting +side buried the leaf in
    // the wall solid, which the browser run caught immediately.)
    hinge.position.set(side * 0.79, 0.02, 0);
    // INWARD swing: the LEFT leaf's tip (+x from its hinge) needs −z, i.e.
    // R_y: z' = −x·sinθ < 0 → θ > 0 → openSign +1; the right leaf mirrors.
    hinge.userData.openSign = side === -1 ? 1 : -1;
    // MergeStatic contract (see MergeStatic.ts): a runtime-rotated pivot MUST
    // carry this flag or its subtree is baked into the def's static merged
    // mesh and the hinge spins EMPTY — state toggles, the visible leaf never
    // moves. Every other door in town (bank/gunshop/sheriff/stable) flags its
    // hinges; the saloon rebuild missed it (the frozen-door bug report).
    hinge.userData.dynamic = true;
    g.add(hinge);

    const dir = -side; // leaf extends this way from its hinge
    // Leaf slab.
    box(hinge, M.woodMed, leafW, doorH, leafT, dir * leafW / 2, doorH / 2, 0, `door-leaf-${side === -1 ? 'l' : 'r'}`);
    // Recessed-look panel field per face (frame back ON the slab, field
    // 2 mm off it — the house anti-coplanar rule).
    for (const sz of [-1, 1] as const) {
      box(hinge, M.woodDark, leafW - 0.24, doorH - 0.5, 0.012, dir * leafW / 2, doorH / 2, sz * (leafT / 2 + 0.009), `door-panel-frame-${side === -1 ? 'l' : 'r'}-${sz < 0 ? 'in' : 'out'}`);
      box(hinge, M.woodLight, leafW - 0.34, doorH - 0.62, 0.008, dir * leafW / 2, doorH / 2, sz * (leafT / 2 + 0.002), `door-panel-field-${side === -1 ? 'l' : 'r'}-${sz < 0 ? 'in' : 'out'}`);
    }
    // Push bars on both faces (the batwing signature): backs touch the leaf
    // faces (stacked), centers 1 cm proud.
    box(hinge, M.woodDark, 0.52, 0.09, 0.02, dir * (leafW - 0.14), 1.05, leafT / 2 + 0.02, `door-bar-front-${side === -1 ? 'l' : 'r'}`);
    box(hinge, M.woodDark, 0.52, 0.09, 0.02, dir * (leafW - 0.14), 1.05, -(leafT / 2 + 0.02), `door-bar-back-${side === -1 ? 'l' : 'r'}`);
  };
  buildLeaf(-1);
  buildLeaf(1);

  return g;
}

/**
 * Pure pose for the saloon double doors: t=0 → CLOSED (both leaf yaws 0),
 * t=1 → OPEN (each leaf swung inward). Reads the swing side baked into each
 * hinge's userData at build time; derived ONLY from t (never accumulated —
 * re-triggering mid-swing is deterministic).
 */
export function setSaloonDoorsOpen(root: THREE.Object3D, t: number): void {
  for (const name of ['swinging-door-left-hinge', 'swinging-door-right-hinge']) {
    const hinge = root.getObjectByName(name) as THREE.Group | null;
    if (!hinge) continue;
    const sign = Number(hinge.userData.openSign ?? 1) || 1;
    // `+ 0` normalizes −0 to +0 — pure pose, no quirks.
    hinge.rotation.y = THREE.MathUtils.clamp(t, 0, 1) * (100 * (Math.PI / 180)) * sign + 0;
  }
}

/* ========================================================================== */
/* Lights & small props                                                       */
/* ========================================================================== */

export interface ChandelierOptions {
  /** Number of REAL PointLights (0 = emissive meshes only). Default 1. */
  lights?: number;
  /** Lantern count around the wheel. */
  lanterns?: number;
}

/**
 * Wagon-wheel chandelier. At most ONE real PointLight per instance
 * (performance budget); all other "light" is emissive mesh work.
 * Origin = wheel center; the chain rises toward the ceiling (+Y).
 */
export function buildChandelier(opts: ChandelierOptions = {}): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-chandelier';

  const radius = 0.5;
  const lanternCount = opts.lanterns ?? 6;
  const realLights = Math.max(0, Math.min(1, opts.lights ?? 1));

  cyl(g, M.iron, 0.012, 0.012, 0.45, 6, 0, 0.225, 0, 'chandelier-chain', { cast: false });
  torus(g, M.woodDark, radius, 0.04, 16, 0, 0, 0, 'chandelier-wheel', { rx: Math.PI / 2 });
  for (let i = 0; i < lanternCount; i += 1) {
    const angle = (i / lanternCount) * Math.PI * 2;
    const cx = Math.cos(angle);
    const sz = Math.sin(angle);
    // Spoke: a thin rod from the hub to the rim (rotated into place).
    cyl(g, M.woodDark, 0.015, 0.015, radius, 6, cx * radius * 0.5, 0, sz * radius * 0.5, `chandelier-spoke-${i}`, {
      rz: Math.PI / 2,
      ry: -angle,
      cast: false,
    });
    // Hanging rod + lantern body + flame chip.
    cyl(g, M.iron, 0.006, 0.006, 0.05, 6, cx * radius, -0.045, sz * radius, `chandelier-rod-${i}`, { cast: false });
    cyl(g, M.lampGlass, 0.032, 0.032, 0.09, 8, cx * radius, -0.115, sz * radius, `chandelier-lantern-${i}`, { cast: false });
    box(g, M.flame, 0.016, 0.03, 0.016, cx * radius, -0.155, sz * radius, `chandelier-flame-${i}`, { cast: false });
  }

  if (realLights > 0) {
    const light = new THREE.PointLight(0xffb066, 1.1, 7, 2);
    light.position.set(0, -0.12, 0);
    light.name = 'chandelier-point-light';
    g.add(light);
  }

  return g;
}

/**
 * Brass spittoon (origin at floor center) — broad bowl, narrower foot, thick
 * upper rim, and a darker recessed interior (task §10).
 */
export function buildSpittoon(): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-spittoon';

  // Narrow foot.
  cyl(g, M.brass, 0.05, 0.042, 0.035, 12, 0, 0.0175, 0, 'spittoon-base');
  // Broad flared bowl stacked on the foot.
  cyl(g, M.brass, 0.09, 0.055, 0.083, 12, 0, 0.0765, 0, 'spittoon-bowl');
  // Darker interior disc sitting on the bowl's top face.
  cyl(g, M.brassDark, 0.082, 0.075, 0.014, 12, 0, 0.125, 0, 'spittoon-interior', { cast: false });
  // Thick upper rim wrapping the interior's top edge.
  torus(g, M.brass, 0.088, 0.016, 14, 0, 0.132, 0, 'spittoon-rim', { rx: Math.PI / 2 });

  return g;
}

/** Whiskey barrel with iron hoops that actually hug the tapered staves. */
export function buildWhiskeyBarrel(): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  const gname = 'saloon-whiskey-barrel';
  g.name = gname;

  const rBottom = 0.24;
  const rTop = 0.28;
  const h = 0.6;
  cyl(g, M.woodMed, rTop, rBottom, h, 16, 0, h / 2, 0, 'barrel-body');
  // Hoop radius follows the taper at its height, sunk 5 mm INTO the wood so
  // the hoop's outer edge stands proud without floating.
  for (const y of [0.12, 0.3, 0.48]) {
    const rAt = rBottom + ((rTop - rBottom) * y) / h;
    torus(g, M.iron, rAt - 0.005, 0.018, 16, 0, y, 0, `barrel-hoop-${y}`, { rx: Math.PI / 2 });
  }

  return g;
}

/**
 * Flat "WANTED" poster board (origin = board center, face = +Z). Detail
 * planes stand 1 cm proud of the board — deep enough to be depth-safe,
 * shallow enough to read as printed ink.
 */
export function buildWantedPoster(): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-wanted-poster';

  plane(g, M.paper, 0.35, 0.5, 0, 0, 0, 'poster-board');
  plane(g, M.ink, 0.3, 0.06, 0, 0.19, 0.01, 'poster-header');
  plane(g, M.glassDark, 0.2, 0.2, 0, -0.02, 0.01, 'poster-portrait');
  plane(g, M.ink, 0.28, 0.03, 0, -0.19, 0.01, 'poster-footer');

  return g;
}
