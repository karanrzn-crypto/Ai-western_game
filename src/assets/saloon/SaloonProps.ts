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

/** Geometric helpers ------------------------------------------------------- */

const DEG = Math.PI / 180;

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
  mesh.castShadow = opts.cast ?? true;
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
  mesh.castShadow = opts.cast ?? true;
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
 * lip, brass foot rail on brackets, vertical front slats. Front = +Z.
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

  return g;
}

/**
 * Shelving unit behind the bar: dark frame, proud mirror panel, three
 * shelves with rows of opaque bottles and a row of glasses. Front = +Z.
 */
export function buildBackBar(opts: PropSizeOptions = {}): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-back-bar';

  const width = opts.backBarWidth ?? 3.6;
  const height = 2.4;
  const depth = 0.35;

  box(g, M.woodDark, width, height, depth, 0, height / 2, 0, 'backbar-frame');
  // Crown caps the frame: stacked on its top face, proud on all sides.
  box(g, M.woodDark, width + 0.1, 0.12, depth + 0.05, 0, height + 0.06, 0, 'backbar-crown');
  // Mirror: a THIN BOX standing 1.5 cm proud of the frame front (a coplanar
  // plane at the frame face would flicker against the wood).
  box(g, M.mirror, width * 0.7, 0.95, 0.03, 0, 1.55, depth / 2 + 0.015, 'backbar-mirror', { cast: false });
  // Mirror frame trim: four slim strips surrounding the mirror, standing
  // 1 cm PROUD of the mirror front.
  const mw = width * 0.7;
  const mz = depth / 2 + 0.04;
  box(g, M.woodLight, mw + 0.08, 0.05, 0.02, 0, 1.55 + 0.5, mz, 'backbar-mirror-trim-top', { cast: false });
  box(g, M.woodLight, mw + 0.08, 0.05, 0.02, 0, 1.55 - 0.5, mz, 'backbar-mirror-trim-bottom', { cast: false });
  box(g, M.woodLight, 0.05, 1.05, 0.02, -mw / 2 - 0.015, 1.55, mz, 'backbar-mirror-trim-left', { cast: false });
  box(g, M.woodLight, 0.05, 1.05, 0.02, mw / 2 + 0.015, 1.55, mz, 'backbar-mirror-trim-right', { cast: false });

  const shelfYs = [height * 0.28, height * 0.42, height * 0.56];
  const bottleColors = [0x2e5a3d, 0x3a2f6b, 0x7a1f1f, 0x1f3a5f, 0x6b4a1f];
  const bottleMats = bottleColors.map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.1 }),
  );

  shelfYs.forEach((y, shelfIdx) => {
    // Shelf board: front edge 2 cm proud of the frame front so bottles sit
    // clearly ON it; back buried inside the frame.
    box(g, M.woodMed, width * 0.92, 0.03, 0.3, 0, y, 0.045, `backbar-shelf-${shelfIdx}`);

    const bottleCount = 7 + shelfIdx;
    for (let i = 0; i < bottleCount; i += 1) {
      const t = (i + 0.5) / bottleCount - 0.5;
      const bh = 0.16 + (i % 3) * 0.02;
      const mat = bottleMats[(i + shelfIdx) % bottleMats.length];
      const bottle = new THREE.Group();
      bottle.name = `backbar-bottle-${shelfIdx}-${i}`;
      cyl(bottle, mat, 0.02, 0.025, bh, 8, 0, bh / 2, 0, 'bottle-body', { cast: false });
      cyl(bottle, mat, 0.008, 0.012, 0.05, 8, 0, bh + 0.024, 0, 'bottle-neck', { cast: false });
      bottle.position.set(t * width * 0.86, y + 0.015, 0.02);
      g.add(bottle);
    }
  });

  // Glasses on the lowest shelf (opaque — cheap and readable).
  for (let i = 0; i < 6; i += 1) {
    const t = (i + 0.5) / 6 - 0.5;
    cyl(g, M.glassDark, 0.016, 0.012, 0.05, 8, t * width * 0.5, shelfYs[0] + 0.04, 0.12, `backbar-glass-${i}`, {
      cast: false,
    });
  }

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
  cyl(g, M.woodMed, 0.1, 0.12, 0.42, 10, 0, 0.34, 0, 'poker-column');
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
  for (const side of [-1, 1]) {
    box(g, M.woodLight, 0.09, 1.18, 0.54, side * 0.68, 0.69, -0.055, `piano-pilaster-${side < 0 ? 'l' : 'r'}`);
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
 * Classic western swinging half-doors. The two leaves hang on INDEPENDENT,
 * NAMED hinge groups ('swinging-door-left-hinge' / '…-right-hinge') so a
 * future interaction system can rotate each leaf around its own edge.
 * No collider is added here — the doorway must stay walkable.
 */
export function buildSwingingDoors(): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-swinging-doors';

  const doorH = 1.1;
  const leafW = 0.72;
  const leafT = 0.045;

  const buildLeaf = (side: -1 | 1): void => {
    const hinge = new THREE.Group();
    hinge.name = side === -1 ? 'swinging-door-left-hinge' : 'swinging-door-right-hinge';
    hinge.position.set(side * 0.78, 0, 0);
    // The leaf hangs INWARD from its hinge edge: mesh center offset is
    // −side·leafW/2 in hinge space, so the leaf spans |x| ∈ [0.06, 0.78] —
    // inside the doorway gap. (Offsetting +side buried the leaf in the wall
    // solid, which the browser run caught immediately.)
    box(hinge, M.woodMed, leafW, doorH, leafT, -side * (leafW / 2), doorH / 2, 0, `door-leaf-${side === -1 ? 'l' : 'r'}`);
    // Push bars on both faces: backs touch the leaf faces (stacked), fronts
    // 2 cm proud.
    box(hinge, M.woodDark, 0.5, 0.08, 0.02, -side * (leafW / 2), 0.85, leafT / 2 + 0.01, `door-bar-front-${side === -1 ? 'l' : 'r'}`);
    box(hinge, M.woodDark, 0.5, 0.08, 0.02, -side * (leafW / 2), 0.85, -(leafT / 2 + 0.01), `door-bar-back-${side === -1 ? 'l' : 'r'}`);
    g.add(hinge);
  };
  buildLeaf(-1);
  buildLeaf(1);

  return g;
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

/** Small brass spittoon (origin at floor center). */
export function buildSpittoon(): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-spittoon';

  cyl(g, M.brass, 0.08, 0.1, 0.12, 12, 0, 0.06, 0, 'spittoon-base');
  torus(g, M.brass, 0.09, 0.015, 12, 0, 0.12, 0, 'spittoon-rim', { rx: Math.PI / 2 });

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

/** Legacy-name re-exports so older call sites keep a stable vocabulary. */
export const DEG_PER_RAD = DEG;
