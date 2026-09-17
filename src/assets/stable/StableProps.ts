/**
 * src/assets/stable/StableProps.ts
 * -----------------------------------------------------------------------------
 * The livery stable's procedural PROP LIBRARY — small, light-geometry builders
 * used by the stalls, the equipment zones, the loft and the shell kit.
 *
 * Contract for every builder in this file:
 *   • origin at the prop's BASE center (ground/plank contact at local y=0) —
 *     a builder never floats and never buries itself;
 *   • everything that must stand ON something is placed flush (back-to-back
 *     contact) — never coplanar-intersecting, never overlapping mid-solid;
 *   • shared StableMaterials, BoxGeometry/CylinderGeometry ≤ 16 segments,
 *     shared geometries for repeated parts (rungs, bars, planks);
 *   • NO PointLights here (the shell kit owns the stable's light budget).
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { createStableMaterials, stableSignTexture, rand, type StableMaterials } from './StableMaterials.js';

type Mat = THREE.Material;

/* ========================================================================== */
/* Small helpers                                                              */
/* ========================================================================== */

/**
 * Shadow-caster size floor (weak-laptop perf revision). The sun's shadow map
 * is 768² over an 85 m frustum ≈ 9 texels/m — a part under ~9 cm covers less
 * than ONE depth texel, so its shadow is invisible noise while the cost of
 * re-rendering it in EVERY scheduled depth pass is real (2706 of 3192 scene
 * meshes cast). Parts below the floor default to castShadow=false; explicit
 * `mesh.castShadow = …` assignments after the call still win, and
 * receiveShadow stays true everywhere (main-pass only, no depth pass).
 */
const SHADOW_CASTER_MIN = 0.09;

export function addBox(
  parent: THREE.Object3D,
  m: Mat,
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = Math.max(w, h, d) >= SHADOW_CASTER_MIN;
  mesh.receiveShadow = true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

export function addCyl(
  parent: THREE.Object3D,
  m: Mat,
  rTop: number, rBottom: number, h: number, seg: number,
  x: number, y: number, z: number,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = Math.max(rTop, rBottom) * 2 >= SHADOW_CASTER_MIN || h >= SHADOW_CASTER_MIN;
  mesh.receiveShadow = true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

export function M(): StableMaterials {
  return createStableMaterials();
}

/** Painted sign FACE (thin plane with the canvas texture, never coplanar:
 *  mount it ≥ 2 cm proud of whatever board sits behind it). */
export function signFace(
  text: string,
  w: number,
  h: number,
  opts: { sub?: string; dark?: boolean } = {},
): THREE.Mesh {
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: stableSignTexture(text, { ...opts, w: Math.round(w * 256), h: Math.round(h * 256) }) ?? undefined,
      roughness: 0.85,
    }),
  );
  face.castShadow = false;
  face.receiveShadow = false;
  face.name = `sign-face-${text.toLowerCase().replace(/\s+/g, '-')}`;
  return face;
}

/* ========================================================================== */
/* Hay & feed                                                                 */
/* ========================================================================== */

/** One rectangular hay bale (string-bound): origin base center. */
export function hayBale(w = 0.9, h = 0.5, d = 0.55): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'hay-bale';
  addBox(g, M_.hay, w, h, d, 0, h / 2, 0, 'bale-body');
  // two binding strings
  for (const fx of [-w / 4, w / 4]) {
    addBox(g, M_.hayDark, 0.02, h + 0.004, d + 0.004, fx, h / 2, 0, 'bale-string');
  }
  return g;
}

/** A loose hay pile: layered fluffed slabs, origin base center. */
export function hayPile(radius = 0.5, height = 0.3, seed = 1): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'hay-pile';
  const s = { v: 1000 + seed * 97 };
  const layers = 3;
  for (let i = 0; i < layers; i++) {
    const shrink = 1 - i / (layers + 0.4);
    const w = radius * 2 * shrink;
    const y = (height / layers) * i;
    const slab = addBox(g, i % 2 ? M_.hayDark : M_.hay, w, height / layers + 0.02, w * (0.7 + rand(s) * 0.3), (rand(s) - 0.5) * 0.12, y + height / layers / 2, (rand(s) - 0.5) * 0.12, `pile-${i}`);
    slab.rotation.y = (rand(s) - 0.5) * 0.6;
  }
  return g;
}

/** Hay stuffed into a trough/rack mouth (a low fluffy slab). */
export function hayClump(w: number, d: number, h = 0.12): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'hay-clump';
  addBox(g, M_.hay, w, h, d, 0, h / 2, 0, 'clump-1');
  const c2 = addBox(g, M_.hayDark, w * 0.8, h * 0.7, d * 0.8, (rand({ v: 17 }) - 0.5) * w * 0.2, h * 0.9, (rand({ v: 31 }) - 0.5) * d * 0.2, 'clump-2');
  c2.rotation.y = 0.3;
  return g;
}

/** Straw scattered on the floor — several thin flat flakes, ~2 cm tall. */
export function strawScatter(w: number, d: number, seed = 1): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'straw-scatter';
  const s = { v: 2000 + seed * 131 };
  for (let i = 0; i < 7; i++) {
    const flake = addBox(g, i % 2 ? M_.hay : M_.hayDark, 0.16 + rand(s) * 0.3, 0.02, 0.1 + rand(s) * 0.2,
      (rand(s) - 0.5) * w, 0.01, (rand(s) - 0.5) * d, `flake-${i}`);
    flake.rotation.y = rand(s) * Math.PI;
  }
  return g;
}

/** Burlap grain sack: lying (default) or standing; origin base center. */
export function grainSack(standing = false, seed = 1): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'grain-sack';
  const s = { v: 3000 + seed * 57 };
  if (standing) {
    const body = addCyl(g, M_.canvas, 0.17, 0.21, 0.55, 10, 0, 0.275, 0, 'sack-body');
    body.scale.set(1, 1, 1.25);
    addCyl(g, M_.canvas, 0.07, 0.15, 0.1, 10, 0, 0.58, 0, 'sack-neck');
  } else {
    const body = addCyl(g, M_.canvas, 0.2, 0.2, 0.62, 10, 0, 0.2, 0, 'sack-body');
    body.rotation.z = Math.PI / 2;
    body.scale.set(1, 1, 1.3);
    body.rotation.y = (rand(s) - 0.5) * 0.4;
    // tied end
    addCyl(g, M_.canvas, 0.09, 0.13, 0.09, 10, 0.34, 0.2, 0, 'sack-tie');
  }
  return g;
}

/* ========================================================================== */
/* Wood containers                                                            */
/* ========================================================================== */

/** Wooden crate with corner boards + slat look; origin base center. */
export function woodCrate(size = 0.5, h = 0.5): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'wood-crate';
  addBox(g, M_.plankDark, size, h, size, 0, h / 2, 0, 'crate-body');
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(g, M_.timber, 0.05, h + 0.01, 0.05, sx * (size / 2 - 0.02), h / 2, sz * (size / 2 - 0.02), 'crate-corner');
    }
  }
  for (const sy of [0.18, h - 0.18]) {
    if (sy > h) continue;
    addBox(g, M_.timber, size + 0.012, 0.06, size + 0.012, 0, sy, 0, 'crate-band');
  }
  return g;
}

/** Small wooden barrel with iron hoops; origin base center. */
export function smallBarrel(r = 0.3, h = 0.85, water = false): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = water ? 'water-barrel' : 'wood-barrel';
  addCyl(g, M_.plankDark, r * 0.92, r, h, 12, 0, h / 2, 0, 'barrel-body');
  for (const hy of [h * 0.16, h * 0.5, h * 0.84]) {
    const hoop = addCyl(g, M_.rust, r * 1.01, r * 1.01, 0.035, 12, 0, hy, 0, 'barrel-hoop');
    hoop.castShadow = false;
  }
  // lid / open top with dark interior
  if (water) {
    const surf = addCyl(g, M_.water, r * 0.82, r * 0.82, 0.015, 12, 0, h - 0.09, 0, 'barrel-water');
    surf.castShadow = false;
  } else {
    addCyl(g, M_.timber, r * 0.95, r * 0.95, 0.03, 12, 0, h + 0.015, 0, 'barrel-lid');
  }
  return g;
}

/** Wooden/metal bucket with a rope handle; `full` shows water. */
export function bucket(kind: 'wood' | 'metal' = 'wood', full = true): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = `${kind}-bucket`;
  const bodyMat = kind === 'wood' ? M_.plankDark : M_.tin;
  addCyl(g, bodyMat, 0.115, 0.09, 0.22, 10, 0, 0.11, 0, 'bucket-body');
  const rim = addCyl(g, kind === 'wood' ? M_.rust : M_.tin, 0.12, 0.12, 0.02, 10, 0, 0.21, 0, 'bucket-rim');
  rim.castShadow = false;
  if (full) {
    const surf = addCyl(g, M_.water, 0.1, 0.1, 0.012, 10, 0, 0.185, 0, 'bucket-water');
    surf.castShadow = false;
  }
  // rope handle arc (two posts + a bent bar reads as the handle at this size)
  const handle = addCyl(g, M_.hayDark, 0.011, 0.011, 0.19, 6, 0, 0.29, 0, 'bucket-handle');
  handle.rotation.z = 0;
  handle.scale.set(1, 1, 1);
  handle.rotation.x = 0;
  // lay the handle across: rotate to span the mouth
  handle.rotation.z = Math.PI / 2.6;
  return g;
}

/** Wooden feed bin with a slanted lid; origin base center. */
export function grainBox(w = 0.7, h = 0.85, d = 0.8): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'grain-box';
  addBox(g, M_.plankDark, w, h * 0.72, d, 0, h * 0.36, 0, 'bin-body');
  // slanted lid hinged along the back
  const lid = addBox(g, M_.trim, w + 0.04, 0.035, d + 0.04, 0, h * 0.72 + 0.09, -d * 0.12, 'bin-lid');
  lid.rotation.x = 0.28;
  addBox(g, M_.trim, w + 0.04, 0.05, 0.05, 0, h * 0.72 + 0.025, d / 2 - 0.025, 'bin-lip');
  return g;
}

/* ========================================================================== */
/* Tools & tack                                                               */
/* ========================================================================== */

/** Pitchfork leaning against a wall: origin at the FLOOR end of the shaft. */
export function pitchfork(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'pitchfork';
  addCyl(g, M_.timber, 0.016, 0.02, 1.4, 8, 0, 0.7, 0, 'fork-shaft');
  const head = new THREE.Group();
  head.position.set(0, 1.4, 0);
  head.name = 'fork-head';
  addBox(head, M_.iron, 0.22, 0.03, 0.02, 0, 0.02, 0, 'fork-ferrule');
  for (let i = 0; i < 3; i++) {
    const tx = (i - 1) * 0.08;
    addCyl(head, M_.iron, 0.008, 0.011, 0.24, 6, tx, 0.15, 0, 'fork-tine');
  }
  g.add(head);
  return g;
}

/** Shovel leaning: origin at the floor end. */
export function shovel(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'shovel';
  addCyl(g, M_.timber, 0.014, 0.017, 1.25, 8, 0, 0.625, 0, 'shovel-shaft');
  addBox(g, M_.iron, 0.16, 0.22, 0.02, 0, 0.11, 0, 'shovel-blade');
  addBox(g, M_.timber, 0.11, 0.09, 0.03, 0, 1.28, 0, 'shovel-grip');
  return g;
}

/** Broom standing on its bristles: origin at the floor. */
export function broom(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'broom';
  addCyl(g, M_.timber, 0.015, 0.015, 1.2, 8, 0, 0.78, 0, 'broom-handle');
  addBox(g, M_.trim, 0.09, 0.12, 0.05, 0, 0.24, 0, 'broom-head');
  for (let i = 0; i < 4; i++) {
    addBox(g, M_.hayDark, 0.085, 0.16 - i * 0.02, 0.012, 0, 0.08, (i - 1.5) * 0.014, `broom-straw-${i}`);
  }
  return g;
}

/** Wall hook: small iron L (mount plate flush + hook bar). */
export function wallHook(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'wall-hook';
  addBox(g, M_.iron, 0.05, 0.09, 0.015, 0, 0.045, 0.0075, 'hook-plate');
  addBox(g, M_.iron, 0.015, 0.015, 0.09, 0, 0.07, 0.055, 'hook-bar');
  return g;
}

/** Farrier's hammer lying on a surface: origin base center. */
export function hammer(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'hammer';
  addCyl(g, M_.timber, 0.016, 0.019, 0.26, 8, 0, 0.02, 0, 'hammer-handle').rotation.z = Math.PI / 2;
  addBox(g, M_.iron, 0.05, 0.06, 0.1, 0.14, 0.045, 0, 'hammer-head');
  return g;
}

/** Farrier tongs: two crossed arms; origin base center. */
export function tongs(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'tongs';
  for (const s of [-1, 1]) {
    const arm = addBox(g, M_.iron, 0.32, 0.016, 0.016, 0, 0.016, s * 0.012, 'tong-arm');
    arm.rotation.y = s * 0.16;
  }
  addCyl(g, M_.iron, 0.014, 0.014, 0.02, 8, 0, 0.02, 0, 'tong-pivot');
  return g;
}

/** Horseshoe (open U): torus with a gap — half torus reads as a shoe. */
export function horseshoe(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'horseshoe';
  const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 12, Math.PI * 1.35), M_.rust);
  shoe.castShadow = true;
  shoe.name = 'shoe-body';
  g.add(shoe);
  return g;
}

/** Iron anvil on an oak stump: origin at the FLOOR (stump bottom). */
export function anvil(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'anvil';
  addCyl(g, M_.plankDark, 0.26, 0.3, 0.42, 12, 0, 0.21, 0, 'anvil-stump');
  const body = addBox(g, M_.iron, 0.5, 0.14, 0.16, 0, 0.49, 0, 'anvil-body');
  body.name = 'anvil-body';
  addBox(g, M_.iron, 0.14, 0.16, 0.13, -0.26, 0.44, 0, 'anvil-horn-base');
  const horn = addCyl(g, M_.iron, 0.006, 0.045, 0.24, 10, -0.42, 0.5, 0, 'anvil-horn');
  horn.rotation.z = Math.PI / 2 + 0.22;
  addBox(g, M_.iron, 0.09, 0.1, 0.12, 0.28, 0.47, 0, 'anvil-heel');
  return g;
}

/** Saddle: blanket + tree skirt + seat + horn + stirrups; origin base center. */
export function saddle(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'saddle';
  // folded blanket
  addBox(g, M_.canvas, 0.62, 0.06, 0.62, 0, 0.03, 0, 'saddle-blanket');
  addBox(g, M_.canvas, 0.5, 0.05, 0.5, 0, 0.075, 0, 'saddle-blanket2').material = M_.leather;
  // seat
  const seat = addBox(g, M_.leather, 0.34, 0.14, 0.44, 0, 0.17, -0.02, 'saddle-seat');
  seat.name = 'saddle-seat';
  // horn + cantle
  addCyl(g, M_.leather, 0.035, 0.05, 0.09, 8, 0, 0.27, -0.2, 'saddle-horn');
  addBox(g, M_.leather, 0.3, 0.08, 0.06, 0, 0.24, 0.2, 'saddle-cantle');
  // stirrup leathers
  for (const sx of [-1, 1]) {
    addBox(g, M_.leather, 0.03, 0.3, 0.02, sx * 0.19, 0.16, 0.02, 'stirrup-leather');
    addBox(g, M_.iron, 0.05, 0.09, 0.02, sx * 0.19, 0.045, 0.02, 'stirrup-tread');
  }
  return g;
}

/** Wooden saddle rack (A-frame stand); origin base center. */
export function saddleRack(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'saddle-rack';
  for (const sx of [-1, 1]) {
    const legA = addBox(g, M_.timber, 0.05, 0.9, 0.05, sx * 0.24, 0.45, -0.18, 'rack-leg');
    legA.rotation.x = -0.28;
    const legB = addBox(g, M_.timber, 0.05, 0.9, 0.05, sx * 0.24, 0.45, 0.18, 'rack-leg');
    legB.rotation.x = 0.28;
  }
  addBox(g, M_.trim, 0.6, 0.05, 0.5, 0, 0.82, 0, 'rack-top');
  return g;
}

/** Bridle hanging from a hook: headstall loop + cheekpieces + bit. */
export function bridleHanging(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'bridle';
  // headstall: two straps forming a loop
  for (const sz of [-1, 1]) {
    const strap = addBox(g, M_.leather, 0.025, 0.34, 0.012, sz * 0.07, -0.2, 0, 'bridle-strap');
    strap.rotation.x = sz * 0.12;
  }
  addBox(g, M_.leather, 0.17, 0.025, 0.012, 0, -0.06, 0, 'bridle-browband');
  addBox(g, M_.leather, 0.17, 0.025, 0.012, 0, -0.36, 0, 'bridle-noseband');
  // bit
  const bit = addCyl(g, M_.iron, 0.008, 0.008, 0.14, 8, 0, -0.4, 0, 'bridle-bit');
  bit.rotation.z = Math.PI / 2;
  // reins hanging loose
  const rein = addBox(g, M_.leather, 0.018, 0.4, 0.01, 0.1, -0.58, 0.02, 'bridle-rein');
  rein.rotation.z = -0.18;
  return g;
}

/** Horse collar (horseshoe-shaped leather collar) hanging on a wall. */
export function horseCollar(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'horse-collar';
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.055, 8, 16), M_.leather);
  ring.castShadow = true;
  ring.name = 'collar-ring';
  g.add(ring);
  // hames (metal strips) left/right
  for (const sx of [-1, 1]) {
    const hame = addBox(g, M_.brass, 0.03, 0.34, 0.02, sx * 0.2, 0, 0.05, 'collar-hame');
    hame.rotation.z = -sx * 0.35;
  }
  return g;
}

/** Leather strap hanging in a loop. */
export function leatherStrap(len = 0.5): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'leather-strap';
  const strap = new THREE.Mesh(new THREE.TorusGeometry(len / 2, 0.018, 6, 14), M_.leather);
  strap.scale.set(1, 1.25, 1);
  strap.castShadow = true;
  strap.name = 'strap-loop';
  g.add(strap);
  return g;
}

/** Folded blanket draped over a rail: origin at the contact top. */
export function drapedBlanket(w = 0.7, color = 0x7a4a3a): THREE.Group {
  const g = new THREE.Group();
  g.name = 'draped-blanket';
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const over = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.5), mat);
  over.position.y = 0.015;
  over.name = 'blanket-top';
  over.castShadow = true;
  g.add(over);
  for (const sz of [-1, 1]) {
    const drop = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, 0.03), mat);
    drop.position.set(0, -0.2, sz * 0.245);
    drop.name = 'blanket-drop';
    drop.castShadow = true;
    g.add(drop);
  }
  return g;
}

/** Horse brush lying flat; origin base center. */
export function horseBrush(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'horse-brush';
  addBox(g, M_.timber, 0.19, 0.03, 0.07, 0, 0.015, 0, 'brush-back');
  for (let i = 0; i < 5; i++) {
    addBox(g, M_.hayDark, 0.012, 0.025, 0.06, -0.08 + i * 0.04, 0.04, 0, 'brush-bristle');
  }
  return g;
}

/** Wooden stool; origin base center. */
export function woodenStool(): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'wooden-stool';
  addCyl(g, M_.plankDark, 0.17, 0.17, 0.04, 10, 0, 0.46, 0, 'stool-seat');
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const leg = addCyl(g, M_.timber, 0.02, 0.025, 0.46, 8, sx * 0.11, 0.23, sz * 0.11, 'stool-leg');
    leg.rotation.z = sx * 0.12;
    leg.rotation.x = -sz * 0.12;
  }
  return g;
}

/** Small tool box with a handle; origin base center. */
export function toolBox(w = 0.5, h = 0.24, d = 0.24): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'tool-box';
  addBox(g, M_.trim, w, h, d, 0, h / 2, 0, 'box-body');
  addBox(g, M_.trim, w + 0.02, 0.03, d + 0.02, 0, h + 0.015, 0, 'box-lid');
  const handle = addCyl(g, M_.iron, 0.012, 0.012, w * 0.5, 8, 0, h + 0.05, 0, 'box-handle');
  handle.rotation.z = Math.PI / 2;
  return g;
}

/** Iron lantern (the stable's wall/hanging lantern) with an OPTIONAL
 *  PointLight — the caller decides whether this instance carries a real
 *  light (the shell kit keeps the light budget at exactly 4). */
export function stableLantern(withLight: boolean): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'stable-lantern';
  addBox(g, M_.iron, 0.14, 0.2, 0.03, 0, 0.1, 0.015, 'lantern-backplate');
  const arm = addCyl(g, M_.iron, 0.014, 0.014, 0.18, 8, 0, 0.18, 0.1, 'lantern-arm');
  arm.rotation.x = Math.PI / 2;
  addBox(g, M_.iron, 0.12, 0.02, 0.12, 0, 0.08, 0.18, 'lantern-floor');
  const glass = addBox(g, M_.glass, 0.09, 0.14, 0.09, 0, 0.16, 0.18, 'lantern-glass');
  glass.castShadow = false;
  // corner posts wrap the glass depth (5 mm proud front/back — no face
  // coincidence with the glass panes)
  for (const sx of [-1, 1] as const) {
    addBox(g, M_.iron, 0.012, 0.16, 0.1, sx * 0.045, 0.16, 0.18, 'lantern-post');
  }
  addBox(g, M_.iron, 0.12, 0.02, 0.12, 0, 0.25, 0.18, 'lantern-top');
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffdf9a, emissive: 0xffb347, emissiveIntensity: 1.6 }),
  );
  flame.position.set(0, 0.15, 0.18);
  flame.name = 'lantern-flame';
  g.add(flame);
  if (withLight) {
    // The stable is 11×13 m with a 13 m-deep aisle — the lanterns carry the
    // whole interior (4 real lights, budget-locked), including at NIGHT when
    // the day/night cycle kills the sun. Physical decay-2 falloff needs real
    // wattage to read at 4–6 m.
    const light = new THREE.PointLight(0xffc26e, 6.5, 9.5, 2);
    light.position.set(0, 0.16, 0.18);
    light.name = 'lantern-light';
    g.add(light);
  }
  return g;
}

/** Wooden ladder: two rails + rungs; origin base center at the FLOOR,
 *  leaning back along -Z by the given tilt (top ends up toward -Z). */
export function ladder(height: number, run = 1.05): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = 'ladder';
  const len = Math.hypot(height, run);
  const tilt = Math.atan2(run, height);
  const rungGeo = new THREE.BoxGeometry(0.42, 0.035, 0.035);
  let n = 0;
  for (let h = 0.28; h < len - 0.12; h += 0.3) {
    const rung = new THREE.Mesh(rungGeo, M_.timber);
    rung.position.set(0, Math.cos(tilt) * h, -Math.sin(tilt) * h);
    rung.rotation.x = tilt;
    rung.castShadow = true;
    rung.name = `ladder-rung-${n++}`;
    g.add(rung);
  }
  for (const sx of [-1, 1] as const) {
    const rail = addBox(g, M_.timber, 0.05, len, 0.08, sx * 0.21, Math.cos(tilt) * len / 2, -Math.sin(tilt) * len / 2, 'ladder-rail');
    rail.rotation.x = tilt;
  }
  return g;
}

/** Generic painted board sign: back board + PROUD face plane (2 cm). */
export function boardSign(
  text: string,
  w: number,
  h: number,
  opts: { sub?: string; dark?: boolean; board?: boolean } = {},
): THREE.Group {
  const M_ = M();
  const g = new THREE.Group();
  g.name = `sign-${text.toLowerCase().replace(/\s+/g, '-')}`;
  if (opts.board !== false) {
    addBox(g, M_.trim, w + 0.08, h + 0.08, 0.04, 0, h / 2, 0, 'sign-board');
  }
  const face = signFace(text, w, h, opts);
  face.position.set(0, h / 2, 0.021); // 2 mm proud of the board front
  face.name = `${g.name}-face`;
  g.add(face);
  return g;
}
