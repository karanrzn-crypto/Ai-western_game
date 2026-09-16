/**
 * SheriffOfficeAssetFactory.ts
 * ------------------------------------------------------------------
 * Detailed visual (mesh) objects for a Wild West SHERIFF'S
 * OFFICE / JAIL interior. Same toolkit and conventions as the two
 * earlier files in this set (SaloonBarAssetFactory.ts,
 * BankInteriorAssetFactory.ts): three.js primitives dressed up with
 * lightweight procedural <canvas> textures (wood grain, rusted iron,
 * brushed brass, aged parchment, hand-painted signage/wanted-poster
 * text), plus a couple of proper extruded shapes (the five-point
 * star badge) where a flat primitive wouldn't read well.
 *
 * No external image, font, or model files are required. Every
 * texture generator falls back to a flat-color material when
 * `document` doesn't exist (safe to call from your Node/`node:test`
 * HeadlessRendererAdapter path too).
 *
 * Same disclaimer as the previous two files: I still can't fetch
 * your real IAssetFactory.ts from GitHub (blocked by robots.txt), so
 * the adapter shapes at the bottom are inferred from your README —
 * only the small `SimpleAssetFactory`/`applyTransform` block at the
 * end should need adjusting if the real interface differs. All the
 * actual mesh-building (`build*` functions) is framework-agnostic.
 *
 * HOW TO WIRE THIS IN
 * ------------------------------------------------------------------
 * 1. Copy to src/assets/SheriffOfficeAssetFactory.ts
 * 2. Register each entry of SHERIFF_OFFICE_ASSET_FACTORIES in
 *    src/assets/AssetRegistry.ts, same as "cube" -> PrimitiveAssetFactory.
 * 3. New AssetType strings available via manager.registerObject({assetType: 'jail-cell-door', ...})
 *
 * ASSET TYPES DEFINED IN THIS FILE
 * ------------------------------------------------------------------
 *   "sheriff-desk"      rolltop-style desk with a badge, revolver, and paperwork
 *   "sheriff-chair"     ladder-back wood chair with a leather seat pad
 *   "jail-cell-door"    barred cell door + frame on a hinge group, with a working-looking lock
 *   "cell-cot"          iron-framed jail cot with a striped mattress and pillow
 *   "gun-rack"          wall rack holding three long guns
 *   "gun-cabinet"       free-standing glass-front rifle cabinet
 *   "wanted-board"      cork/wood bulletin board layered with painted wanted posters
 *   "sheriff-badge"     extruded five-point star badge on a wood plaque
 *   "potbelly-stove"    cast-iron stove with pipe, door glow, and squat legs
 *   "key-rack"          wall pegboard holding a few dangling key rings
 *   "kerosene-lamp"     glass-reservoir desk lamp with a lit wick
 *   "wash-stand"        wash stand with basin, pitcher, and folded towel
 *   "coat-rack"         standing rack with a hat and a holstered gun belt
 *   "ammo-crate"        stenciled wooden ammunition crate
 * ------------------------------------------------------------------
 */

import * as THREE from 'three';

import { SHERIFF_LAYOUT } from './SheriffLayout.js';

const WORLD_SCALE = 1;

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const WOOD_DARK = '#40260f';
const WOOD_MED = '#6b4226';
const WOOD_TRIM = '#8a5a34';
const IRON = '#242424';
const IRON_RUST = '#5a3a1f';
const BRASS = '#b08d3d';
const BRASS_DARK = '#7a5f27';
const STAR_GOLD = '#d4af37';
const LEATHER = '#3b2417';
const PARCHMENT = '#e8dcc0';
const PARCHMENT_AGED = '#d8c79c';
const TICKING_BASE = '#e2ded0';
const GLASS_WARM = '#ffd9a0';

// ---------------------------------------------------------------------------
// Procedural canvas texture generators (headless-safe: fall back to null)
// ---------------------------------------------------------------------------

const HAS_DOM = typeof document !== 'undefined';

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!HAS_DOM) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function rand(seed: { v: number }) {
  seed.v = (seed.v * 9301 + 49297) % 233280;
  return seed.v / 233280;
}

function woodTexture(base = WOOD_MED, grain = WOOD_DARK, size = 256): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const seed = { v: 23 };
  for (let i = 0; i < 26; i++) {
    const y = (i / 26) * size + (rand(seed) - 0.5) * 6;
    ctx.strokeStyle = grain;
    ctx.globalAlpha = 0.15 + rand(seed) * 0.25;
    ctx.lineWidth = 1 + rand(seed) * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 3 + (rand(seed) - 0.5) * 4);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 3; i++) {
    const kx = rand(seed) * size;
    const ky = rand(seed) * size;
    const grd = ctx.createRadialGradient(kx, ky, 1, kx, ky, 10);
    grd.addColorStop(0, grain);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(kx, ky, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, 2, 2);
}

/** Dark iron with streaky rust drips and a few brighter scratches. */
function ironTexture(base = IRON, rust = IRON_RUST, size = 160): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const seed = { v: 59 };
  for (let i = 0; i < 10; i++) {
    const x = rand(seed) * size;
    const len = size * (0.2 + rand(seed) * 0.5);
    const grd = ctx.createLinearGradient(x, 0, x, len);
    grd.addColorStop(0, rust);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.25 + rand(seed) * 0.25;
    ctx.fillStyle = grd;
    ctx.fillRect(x - 2, 0, 4, len);
  }
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = '#555';
    ctx.beginPath();
    const x1 = rand(seed) * size;
    const y1 = rand(seed) * size;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + (rand(seed) - 0.5) * 20, y1 + (rand(seed) - 0.5) * 20);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, 1, 1);
}

function brassTexture(base = BRASS, size = 128): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const seed = { v: 11 };
  for (let y = 0; y < size; y += 2) {
    ctx.strokeStyle = rand(seed) > 0.5 ? BRASS_DARK : '#c9a75a';
    ctx.globalAlpha = 0.08 + rand(seed) * 0.1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, 1, 1);
}

/** Subtle mattress-ticking stripes. */
function tickingTexture(size = 128): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = TICKING_BASE;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#a89a76';
  ctx.lineWidth = 3;
  for (let x = -size; x < size * 2; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + size, size);
    ctx.stroke();
  }
  return toTexture(canvas, 1, 1);
}

/** Painted sign / plaque text, shared style for badges, crate stencils, cell plaques. */
function signTexture(opts: {
  text: string;
  sub?: string;
  bg?: string;
  fg?: string;
  w?: number;
  h?: number;
  font?: string;
  border?: boolean;
}): THREE.CanvasTexture | null {
  const { text, sub, bg = PARCHMENT, fg = '#2a2016', w = 512, h = 256, border = true } = opts;
  const c = makeCanvas(w, h);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = fg;
    ctx.lineWidth = w * 0.02;
    ctx.strokeRect(w * 0.03, h * 0.06, w * 0.94, h * 0.88);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = opts.font ?? `bold ${Math.floor(h * 0.32)}px Georgia, "Times New Roman", serif`;
  ctx.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
  if (sub) {
    ctx.font = `${Math.floor(h * 0.13)}px Georgia, "Times New Roman", serif`;
    ctx.fillText(sub, w / 2, h * 0.72);
  }
  return toTexture(canvas, 1, 1);
}

/** Aged wanted-poster texture with a simple painted silhouette portrait. */
function wantedPosterTexture(name: string, reward: string, size = 320): THREE.CanvasTexture | null {
  const w = size;
  const h = Math.round(size * 1.3);
  const c = makeCanvas(w, h);
  if (!c) return null;
  const { canvas, ctx } = c;

  ctx.fillStyle = PARCHMENT_AGED;
  ctx.fillRect(0, 0, w, h);

  // age blotches
  const seed = { v: name.length * 13 + 7 };
  for (let i = 0; i < 8; i++) {
    const x = rand(seed) * w;
    const y = rand(seed) * h;
    const r = 10 + rand(seed) * 30;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(120,95,55,0.25)');
    grd.addColorStop(1, 'rgba(120,95,55,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#2a2016';
  ctx.lineWidth = w * 0.015;
  ctx.strokeRect(w * 0.04, h * 0.04, w * 0.92, h * 0.92);

  ctx.fillStyle = '#2a2016';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.floor(w * 0.2)}px Georgia, serif`;
  ctx.fillText('WANTED', w / 2, h * 0.13);

  // simple silhouette bust portrait (abstract, not a specific likeness)
  ctx.fillStyle = '#26201a';
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.32, w * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.28, h * 0.52);
  ctx.quadraticCurveTo(w / 2, h * 0.4, w * 0.72, h * 0.52);
  ctx.lineTo(w * 0.78, h * 0.62);
  ctx.lineTo(w * 0.22, h * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2a2016';
  ctx.lineWidth = w * 0.008;
  ctx.strokeRect(w * 0.16, h * 0.16, w * 0.68, h * 0.5);

  ctx.font = `bold ${Math.floor(w * 0.09)}px Georgia, serif`;
  ctx.fillText(name.toUpperCase(), w / 2, h * 0.72);
  ctx.font = `${Math.floor(w * 0.075)}px Georgia, serif`;
  ctx.fillText('DEAD OR ALIVE', w / 2, h * 0.8);
  ctx.font = `bold ${Math.floor(w * 0.1)}px Georgia, serif`;
  ctx.fillText(reward, w / 2, h * 0.9);

  return toTexture(canvas, 1, 1);
}

// ---------------------------------------------------------------------------
// Material / mesh helpers
// ---------------------------------------------------------------------------

function stdMat(colorHex: string, tex: THREE.CanvasTexture | null, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color: tex ? 0xffffff : new THREE.Color(colorHex),
    map: tex ?? undefined,
    roughness: 0.8,
    metalness: 0.05,
    ...extra,
  });
}

function metalMat(colorHex: string, tex: THREE.CanvasTexture | null, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color: tex ? 0xffffff : new THREE.Color(colorHex),
    map: tex ?? undefined,
    roughness: 0.45,
    metalness: 0.8,
    ...extra,
  });
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const MAT = {
  woodDark: () => stdMat(WOOD_DARK, woodTexture(WOOD_DARK, '#20120a')),
  woodMed: () => stdMat(WOOD_MED, woodTexture(WOOD_MED, WOOD_DARK)),
  woodTrim: () => stdMat(WOOD_TRIM, woodTexture(WOOD_TRIM, WOOD_MED)),
  iron: () => metalMat(IRON, ironTexture(), { roughness: 0.6 }),
  ironDark: () => metalMat('#161616', ironTexture('#161616'), { roughness: 0.65 }),
  brass: () => metalMat(BRASS, brassTexture()),
  brassDark: () => metalMat(BRASS_DARK, brassTexture(BRASS_DARK)),
  leather: () => stdMat(LEATHER, null, { roughness: 0.65 }),
  parchment: () => stdMat(PARCHMENT, null, { roughness: 1 }),
  ticking: () => stdMat(TICKING_BASE, tickingTexture(), { roughness: 0.9 }),
  glassWarm: () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(GLASS_WARM),
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
      metalness: 0.1,
      emissive: new THREE.Color(GLASS_WARM),
      emissiveIntensity: 0.7,
    }),
  glassClear: () =>
    new THREE.MeshStandardMaterial({
      color: 0xdfeef2,
      transparent: true,
      opacity: 0.18,
      roughness: 0.05,
      metalness: 0.1,
    }),
};

/** Five-point star built with a real extruded Shape (used for the badge). */
function createStarGeometry(outerR: number, innerR: number, depth: number, points = 5): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = i * step - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: depth * 0.2, bevelSegments: 2 });
}

/**
 * Simple long-gun prop (rifle/shotgun silhouette) reused by the rack and the
 * cabinet. The whole gun lies along local +X with its BORE AXIS ON y = 0 —
 * barrel (-0.375..+0.375), stock (-0.64..-0.36), foregrip, trigger guard all
 * collinear — so consumers may pitch the group up (rotation.z = PI/2) and the
 * rifle stays one straight piece: butts land where the consumer's comment
 * says, muzzles up, no lateral offset. (The old prop had its barrel floating
 * at y = +0.375 above the stock line; stood upright that became a 37.5 cm
 * horizontal shift that threw barrels THROUGH the cabinet side / outside the
 * rack.)
 */
function buildRifle(): THREE.Group {
  const g = new THREE.Group();
  const barrel = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 8), MAT.iron(), 0, 0, 0);
  barrel.rotation.z = Math.PI / 2;
  g.add(barrel);
  const stock = mesh(new THREE.BoxGeometry(0.28, 0.06, 0.035), MAT.woodDark(), -0.5, -0.02, 0);
  g.add(stock);
  const foregrip = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), MAT.woodDark(), -0.1, 0, 0);
  foregrip.rotation.z = Math.PI / 2;
  g.add(foregrip);
  const trigger = mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 10, Math.PI), MAT.iron(), -0.28, -0.01, 0);
  trigger.rotation.z = Math.PI;
  g.add(trigger);
  return g;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** Sturdy wood desk with a star badge, a revolver, and a small stack of wanted posters. */
export function buildSheriffDesk(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sheriff-desk';

  const w = 1.5 * WORLD_SCALE;
  const d = 0.75 * WORLD_SCALE;
  const h = 0.75 * WORLD_SCALE;

  const top = mesh(new THREE.BoxGeometry(w, 0.06, d), MAT.woodMed(), 0, h, 0);
  g.add(top);

  [-1, 1].forEach((side) => {
    const pedestal = mesh(new THREE.BoxGeometry(0.35, h - 0.06, d), MAT.woodDark(), (side * w) / 2 - side * 0.2, (h - 0.06) / 2, 0);
    g.add(pedestal);
    for (let i = 0; i < 2; i++) {
      const drawer = mesh(new THREE.BoxGeometry(0.3, 0.22, 0.02), MAT.woodMed(), (side * w) / 2 - side * 0.2, 0.18 + i * 0.28, d / 2 + 0.01);
      g.add(drawer);
      const handle = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 6), MAT.iron(), drawer.position.x, drawer.position.y, d / 2 + 0.03);
      handle.rotation.z = Math.PI / 2;
      g.add(handle);
    }
  });
  const kneeTrim = mesh(new THREE.BoxGeometry(w * 0.28, 0.05, d), MAT.woodTrim(), 0, h - 0.03, 0);
  g.add(kneeTrim);

  // small stack of papers / wanted posters on the desk
  for (let i = 0; i < 4; i++) {
    const paper = mesh(new THREE.BoxGeometry(0.22, 0.004, 0.28), MAT.parchment(), -0.35, h + 0.03 + i * 0.005, -0.05 + i * 0.01);
    paper.rotation.y = (i - 2) * 0.05;
    g.add(paper);
  }
  const topPosterTex = wantedPosterTexture('J. CARSON', '$500 REWARD', 220);
  const topPoster = mesh(new THREE.PlaneGeometry(0.2, 0.26), stdMat(PARCHMENT_AGED, topPosterTex), -0.35, h + 0.055, -0.02);
  topPoster.rotation.x = -Math.PI / 2;
  g.add(topPoster);

  // star badge lying on the desk
  const badgeGeo = createStarGeometry(0.045, 0.02, 0.008);
  const badge = mesh(badgeGeo, metalMat(STAR_GOLD, brassTexture(STAR_GOLD)), 0.35, h + 0.035, 0.05);
  badge.rotation.x = -Math.PI / 2;
  g.add(badge);

  // revolver prop (cylinder barrel + block grip + cylinder drum)
  const revolver = new THREE.Group();
  const rBarrel = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 8), MAT.iron(), 0.09, 0, 0);
  rBarrel.rotation.z = Math.PI / 2;
  revolver.add(rBarrel);
  const rDrum = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 10), MAT.ironDark(), 0.02, 0, 0);
  rDrum.rotation.z = Math.PI / 2;
  revolver.add(rDrum);
  const rGrip = mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), MAT.woodDark(), -0.03, -0.03, 0);
  rGrip.rotation.z = -0.4;
  revolver.add(rGrip);
  revolver.position.set(0.15, h + 0.045, -0.1);
  revolver.rotation.y = 0.3;
  g.add(revolver);

  return g;
}

/** Ladder-back wood chair with a leather seat pad. */
export function buildSheriffChair(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sheriff-chair';

  const seatH = 0.46 * WORLD_SCALE;
  const seatSize = 0.42 * WORLD_SCALE;

  const seat = mesh(new THREE.BoxGeometry(seatSize, 0.04, seatSize), MAT.woodMed(), 0, seatH, 0);
  g.add(seat);
  const cushion = mesh(new THREE.BoxGeometry(seatSize - 0.04, 0.03, seatSize - 0.04), MAT.leather(), 0, seatH + 0.035, 0);
  g.add(cushion);

  const legPositions: [number, number][] = [
    [seatSize / 2 - 0.03, seatSize / 2 - 0.03],
    [-seatSize / 2 + 0.03, seatSize / 2 - 0.03],
    [seatSize / 2 - 0.03, -seatSize / 2 + 0.03],
    [-seatSize / 2 + 0.03, -seatSize / 2 + 0.03],
  ];
  legPositions.forEach(([x, z]) => {
    const leg = mesh(new THREE.CylinderGeometry(0.02, 0.02, seatH, 8), MAT.woodDark(), x, seatH / 2, z);
    g.add(leg);
  });

  const backHeight = 0.48 * WORLD_SCALE;
  [-1, 1].forEach((side) => {
    const post = mesh(
      new THREE.CylinderGeometry(0.02, 0.02, backHeight, 8),
      MAT.woodDark(),
      (side * seatSize) / 2 - side * 0.03,
      seatH + backHeight / 2,
      -seatSize / 2 + 0.03
    );
    g.add(post);
  });
  for (let i = 0; i < 3; i++) {
    const y = seatH + 0.08 + i * 0.15;
    const slat = mesh(new THREE.BoxGeometry(seatSize - 0.06, 0.03, 0.02), MAT.woodMed(), 0, y, -seatSize / 2 + 0.03);
    g.add(slat);
  }

  return g;
}

/** Barred jail cell door on a hinge group, with a heavy lock plate.
 *
 *  Frame = two FULL-HEIGHT jamb posts + one Lintel. Every frame face either
 *  BURIES into the layout's ironwork or stands INSET from it — never coplanar
 *  with it (the old build's flush faces z-fought against the user-Final iron
 *  headers y 2.25/2.29 and the bar segments' ±0.61 ends, and its hinge
 *  knuckles sat at mid-door where they read as two dark specks on the closed
 *  leaf and floated in the doorway once it swung open):
 *    • posts span ±[0.55, 0.63] along the wall — 2 cm PAST the segments'
 *      ±0.61 ends, whose end faces bury inside the posts (this also covers
 *      the 2 cm slits between segment ends and header ends) — and stand
 *      ±0.04 deep, 1 cm inset from the headers'/rails' ±0.05 faces;
 *    • lintel spans y [height−0.04, height+0.14] (world [2.21, 2.39]: its
 *      bottom sits 4–8 cm BELOW the header bottoms 2.25/2.29 — no flush
 *      underside pair — and its top buries inside both headers), length
 *      ±0.59 (its end faces bury inside the posts / headers), depth ±0.035
 *      (inset from posts and headers alike).
 *  The leaf's rails are 5 cm shorter than the gap and its top rail sits
 *  3.5 cm below the lintel underside, so nothing on the swinging leaf shares
 *  a plane with the static frame it slides out from. */
export function buildJailCellDoor(width = 1.1 * WORLD_SCALE, height = 2.1 * WORLD_SCALE): THREE.Group {
  const g = new THREE.Group();
  g.name = 'jail-cell-door';

  // Frame: lintel (buried over the posts, up into both masonry headers)
  // + two full-height jamb posts standing 2 cm proud past the segment ends.
  const lintel = mesh(new THREE.BoxGeometry(width + 0.08, 0.18, 0.07), MAT.ironDark(), 0, height + 0.05, 0);
  lintel.name = 'jail-door-lintel';
  g.add(lintel);
  [-width / 2 - 0.04, width / 2 + 0.04].forEach((x) => {
    // 2 cm leg buried into the plank floor — bolted-down iron, and the post
    // bottom never shares the floor-plane pair the rail bottoms stand on.
    const post = mesh(new THREE.BoxGeometry(0.08, height + 0.02, 0.08), MAT.ironDark(), x, height / 2 - 0.01, 0);
    post.name = 'jail-door-post';
    g.add(post);
  });

  // hinge group for the swinging barred door
  const hinge = new THREE.Group();
  hinge.name = 'jail-cell-door-hinge';
  hinge.position.set(-width / 2, 0, 0);
  g.add(hinge);

  const doorFrame = new THREE.Group();
  hinge.add(doorFrame);
  // Rails are 5 cm shorter than the gap (2.5 cm clear of each jamb post's
  // inner end face — the closed leaf never shares a plane with the frame it
  // slides out of); the top rail sits 3.5 cm below the lintel's underside so
  // the swinging leaf never clips it (rail top at height − 0.075).
  const top = mesh(new THREE.BoxGeometry(width - 0.05, 0.05, 0.04), MAT.iron(), width / 2, height - 0.1, 0);
  doorFrame.add(top);
  const bottom = mesh(new THREE.BoxGeometry(width - 0.05, 0.05, 0.04), MAT.iron(), width / 2, 0.05, 0);
  doorFrame.add(bottom);
  const midRail = mesh(new THREE.BoxGeometry(width - 0.05, 0.04, 0.04), MAT.iron(), width / 2, height * 0.55, 0);
  doorFrame.add(midRail);
  [0, width].forEach((x) => {
    const post = mesh(new THREE.BoxGeometry(0.045, height - 0.06, 0.045), MAT.iron(), x, (height - 0.06) / 2, 0);
    doorFrame.add(post);
  });

  const barCount = 9;
  for (let i = 1; i < barCount; i++) {
    const x = (i / barCount) * width;
    const bar = mesh(new THREE.CylinderGeometry(0.014, 0.014, height - 0.1, 8), MAT.iron(), x, height / 2, 0);
    doorFrame.add(bar);
  }

  // Hinge knuckles mounted ON the west jamb post's corridor face at the
  // hinge axis (x = −width/2, 3.5 cm proud of the post face). The old build
  // parked them at x = +0.02 — mid-door — where they showed as two stray
  // dark specks on the closed leaf and floated in the open doorway.
  [height * 0.15, height * 0.85].forEach((y) => {
    const knuckle = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 10), MAT.ironDark(), -width / 2, y, 0.05);
    knuckle.name = 'jail-door-knuckle';
    g.add(knuckle);
  });

  // heavy lock plate + hasp near the free edge of the door
  const lockPlate = mesh(new THREE.BoxGeometry(0.12, 0.18, 0.03), MAT.ironDark(), width - 0.08, height * 0.5, 0.03);
  doorFrame.add(lockPlate);
  const keyhole = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.032, 10), new THREE.MeshStandardMaterial({ color: 0x000000 }), width - 0.08, height * 0.5, 0.046);
  keyhole.rotation.x = Math.PI / 2;
  doorFrame.add(keyhole);
  const lockRing = mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 16), MAT.brassDark(), width - 0.08, height * 0.5 - 0.02, 0.045);
  doorFrame.add(lockRing);

  return g;
}

/* ========================================================================== */
/* The Sheriff OFFICE FRONT DOOR — a real openable door (E), spawns CLOSED     */
/* ========================================================================== */

/**
 * Panelled wood front door for the office's south doorway, hung on a REAL
 * hinge pivot. The layout places this asset's root at the doorway center on
 * the wall mid-plane; inside, the 'front-door-hinge' group (the user's
 * DoorRoot) sits at the actual hinge axis — 4 cm off the WEST jamb — and the
 * leaf meshes are its children, so opening the door is a pure rotation of
 * that pivot: no synthetic mesh-center spin, no transform accumulation.
 *
 * Geometry discipline (all dims from SHERIFF_LAYOUT.frontDoor — dw 1.1, dh 2.3):
 *   • leaf 1.01 × 2.25 × 0.06, hinge edge 4 cm off the west jamb, latch edge
 *     5 cm off the east jamb, top 1 cm under the casing's 2 cm hang-down,
 *     bottom 2 cm over the threshold — the 100° inward sweep grazes NOTHING:
 *     the swept hinge disc (r = 3 cm) stays 1 cm clear of the wall face and
 *     only grazes the casing hang's boundary plane at exactly 90° (zero-area
 *     contact), and the tip never crosses the jambs (verified against the
 *     wall band z ∈ [3.55, 3.70] and both casing rings).
 *   • the glass pane is mounted 3 cm PROUD of the leaf's street face inside
 *     a trim frame — the old build sat its front face EXACTLY on the leaf
 *     face (same-normal coplanar pair → the entrance "color flicker").
 *   • strap hinges + a wrought knob dress the street face; everything on the
 *     leaf is proud of it (back-to-back contacts only, never flush-coplanar).
 */
export function buildSheriffFrontDoor(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sheriff-front-door';

  const dw = SHERIFF_LAYOUT.frontDoor.xMax - SHERIFF_LAYOUT.frontDoor.xMin;
  const dh = SHERIFF_LAYOUT.frontDoor.height;
  const hingeOffX = 0.04;                    // hinge axis 4 cm off the west jamb
  const leafW = dw - hingeOffX - 0.05;       // 1.01 — latch edge 5 cm off the east jamb
  const leafH = dh - 0.05;                   // 2.25 — top 1 cm under the casing hang
  const leafT = 0.06;
  const bottomLift = 0.02;                   // leaf bottom 2 cm over the threshold

  // The DoorRoot: an independent pivot AT the real hinge axis. Everything
  // that swings is a child; setSheriffFrontDoorOpen rotates ONLY this group.
  const hinge = new THREE.Group();
  hinge.name = 'front-door-hinge';
  hinge.position.set(-dw / 2 + hingeOffX, 0, 0);
  g.add(hinge);

  // Leaf slab.
  const slab = mesh(new THREE.BoxGeometry(leafW, leafH, leafT), MAT.woodTrim(), leafW / 2, bottomLift + leafH / 2, 0);
  slab.name = 'front-door-leaf';
  slab.castShadow = true;
  slab.receiveShadow = true;
  hinge.add(slab);

  // Glazed upper section: glass pane 3 cm PROUD of the street face inside a
  // trim frame 4.5 cm proud — the old flush pane front was the z-fight.
  const glassW = leafW * 0.55;
  const glassH = 0.6;
  const upperGlassY = bottomLift + leafH - 0.62; // glass band center
  const glass = mesh(new THREE.BoxGeometry(glassW, glassH, 0.03), MAT.glassClear(), leafW / 2, upperGlassY, leafT / 2 + 0.015);
  glass.name = 'front-door-glass';
  glass.castShadow = false;
  hinge.add(glass);
  const frT = 0.045; // frame depth (z), proud of the glass front by 1.5 cm
  const frZ = leafT / 2 + frT / 2; // back face exactly ON the slab face (back-to-back)
  const frW = glassW + 0.1;
  const frH = glassH + 0.1;
  hinge.add(mesh(new THREE.BoxGeometry(frW, 0.05, frT), MAT.woodDark(), leafW / 2, upperGlassY + frH / 2 - 0.025, frZ));
  hinge.add(mesh(new THREE.BoxGeometry(frW, 0.05, frT), MAT.woodDark(), leafW / 2, upperGlassY - frH / 2 + 0.025, frZ));
  hinge.add(mesh(new THREE.BoxGeometry(0.05, glassH, frT), MAT.woodDark(), leafW / 2 - frW / 2 + 0.025, upperGlassY, frZ));
  hinge.add(mesh(new THREE.BoxGeometry(0.05, glassH, frT), MAT.woodDark(), leafW / 2 + frW / 2 - 0.025, upperGlassY, frZ));

  // Two wrought-iron strap hinges ON the street face at the hinge edge
  // (proud plates, back-to-back with the slab — the mounted-hinge look).
  [bottomLift + 0.42, bottomLift + leafH - 0.42].forEach((sy) => {
    const strap = mesh(new THREE.BoxGeometry(0.3, 0.05, 0.015), MAT.ironDark(), 0.15, sy, leafT / 2 + 0.0075);
    strap.name = 'front-door-strap';
    hinge.add(strap);
  });

  // Wrought knob + rose on the street face near the latch edge.
  const knob = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 10), MAT.ironDark(), leafW - 0.09, 1.02, leafT / 2 + 0.02);
  knob.rotation.x = Math.PI / 2;
  knob.name = 'front-door-knob';
  hinge.add(knob);
  hinge.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.014, 10), MAT.ironDark(), leafW - 0.09, 1.02, leafT / 2 + 0.007));
  // Interior thumb latch (the office side reads as a finished door too).
  const thumb = mesh(new THREE.BoxGeometry(0.09, 0.05, 0.02), MAT.ironDark(), leafW - 0.09, 1.02, -leafT / 2 - 0.01);
  thumb.name = 'front-door-thumb';
  hinge.add(thumb);

  // Hinge knuckles ON the axis (like the cell doors — never mid-door specks).
  [bottomLift + 0.42, bottomLift + leafH - 0.42].forEach((sy) => {
    const knuckle = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 10), MAT.ironDark(), -dw / 2 + hingeOffX, sy, 0);
    knuckle.rotation.z = Math.PI / 2;
    knuckle.name = 'front-door-knuckle';
    g.add(knuckle); // mounted on the ROOT (static jamb side), not the leaf
  });

  return g;
}

/** Iron-framed jail cot with a striped mattress and a flat pillow. */
export function buildCellCot(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cell-cot';

  const len = 1.85 * WORLD_SCALE;
  const wid = 0.7 * WORLD_SCALE;
  const legH = 0.35 * WORLD_SCALE;

  [
    [len / 2 - 0.05, wid / 2 - 0.05],
    [-len / 2 + 0.05, wid / 2 - 0.05],
    [len / 2 - 0.05, -wid / 2 + 0.05],
    [-len / 2 + 0.05, -wid / 2 + 0.05],
  ].forEach(([x, z]) => {
    const leg = mesh(new THREE.CylinderGeometry(0.02, 0.02, legH, 8), MAT.iron(), x, legH / 2, z);
    g.add(leg);
  });

  const frameTop = mesh(new THREE.BoxGeometry(len, 0.03, wid), MAT.iron(), 0, legH, 0);
  g.add(frameTop);

  // simple scrolled headboard/footboard bars
  [-len / 2, len / 2].forEach((x) => {
    const boardHeight = 0.32;
    const board = mesh(new THREE.BoxGeometry(0.02, boardHeight, wid), MAT.iron(), x, legH + boardHeight / 2, 0);
    g.add(board);
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4 - 0.5;
      const spindle = mesh(new THREE.CylinderGeometry(0.008, 0.008, boardHeight - 0.04, 6), MAT.iron(), x, legH + boardHeight / 2, t * wid);
      g.add(spindle);
    }
  });

  const mattress = mesh(new THREE.BoxGeometry(len - 0.1, 0.08, wid - 0.06), MAT.ticking(), 0, legH + 0.07, 0);
  g.add(mattress);
  const pillow = mesh(new THREE.BoxGeometry(0.28, 0.05, wid - 0.14), stdMat('#f0ead8', null, { roughness: 0.9 }), -len / 2 + 0.24, legH + 0.13, 0);
  g.add(pillow);

  return g;
}

/**
 * Floor-standing WESTERN GUN RACK: plinth + backboard + two stiles + top
 * cap, a butt shelf with brass pegs, and a front retaining rail. Four long
 * guns stand muzzle-up, butts RESTING on the pegs (nothing floats), barrels
 * clear of the cap, ≥10 cm spacing, zero intersection with the frame or
 * the wall. Origin at the base center, back plane at local z = 0.
 */
export function buildGunRack(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'gun-rack';

  const W = 0.85;
  const D = 0.24;
  const H = 1.62;

  // Carcass: plinth, backboard, stiles, top cap.
  g.add(mesh(new THREE.BoxGeometry(W, 0.1, D), MAT.woodDark(), 0, 0.05, D / 2));
  g.add(mesh(new THREE.BoxGeometry(W, 1.44, 0.035), MAT.woodDark(), 0, 0.82, 0.0175));
  for (const sx of [-1, 1] as const) {
    g.add(mesh(new THREE.BoxGeometry(0.06, H, 0.05), MAT.woodTrim(), sx * (W / 2 - 0.03), H / 2, 0.045));
  }
  g.add(mesh(new THREE.BoxGeometry(W, 0.04, D), MAT.woodTrim(), 0, 1.6, D / 2));

  // Butt shelf (top y 0.34) + 4 brass pegs the butts rest on + front rail.
  g.add(mesh(new THREE.BoxGeometry(W - 0.12, 0.035, D - 0.04), MAT.woodMed(), 0, 0.3225, D / 2));
  g.add(mesh(new THREE.BoxGeometry(W - 0.12, 0.05, 0.035), MAT.woodMed(), 0, 0.78, D - 0.0175));

  // Four rifles, muzzle-up, 16 cm apart, butts ON the pegs (y = 0.36).
  for (let i = 0; i < 4; i++) {
    const x = -0.24 + i * 0.16;
    const peg = mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05), MAT.brassDark(), x, 0.35, D / 2 - 0.02);
    g.add(peg);
    const rifle = buildRifle();
    rifle.rotation.z = Math.PI / 2;
    rifle.rotation.y = 0.02 * (i - 1.5);
    rifle.position.set(x, 1.0, 0.12);
    g.add(rifle);
  }

  return g;
}

/**
 * Glazed GUN DISPLAY CABINET (real case, not a painted box): plinth +
 * open carcass (sides / deck / back / top / crown) + a wood-framed glass
 * front with the pane INSET 2.75 cm behind the frame face (never coplanar)
 * + three vertical rifles on brass pegs inside, butts resting on the deck,
 * ≥8 cm clear of the glass. Origin at the plinth bottom, front toward +z.
 */
export function buildGunCabinet(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'gun-cabinet';

  const W = 0.95;
  const D = 0.34;

  // Plinth + reveal strip.
  const plinth = mesh(new THREE.BoxGeometry(W, 0.15, D), MAT.woodDark(), 0, 0.075, 0);
  g.add(plinth);
  const reveal = mesh(new THREE.BoxGeometry(W + 0.06, 0.04, D + 0.05), MAT.woodTrim(), 0, 0.17, 0);
  g.add(reveal);

  // Carcass: sides, deck (interior floor), back panel, top, crown.
  for (const sx of [-1, 1] as const) {
    const side = mesh(new THREE.BoxGeometry(0.04, 1.36, 0.3), MAT.woodDark(), sx * 0.435, 0.87, 0.15);
    g.add(side);
  }
  const deck = mesh(new THREE.BoxGeometry(W - 0.08, 0.04, 0.3), MAT.woodMed(), 0, 0.21, 0.15);
  g.add(deck);
  const backPanel = mesh(new THREE.BoxGeometry(W - 0.08, 1.36, 0.03), MAT.woodDark(), 0, 0.87, 0.015);
  g.add(backPanel);
  const top = mesh(new THREE.BoxGeometry(W, 0.08, 0.3), MAT.woodDark(), 0, 1.59, 0.15);
  g.add(top);
  const crown = mesh(new THREE.BoxGeometry(W + 0.06, 0.07, D), MAT.woodTrim(), 0, 1.665, 0);
  g.add(crown);

  // Glazed front: stiles + rails (front face 0.32), glass INSET (front face
  // 0.2925 — 2.75 cm behind the frame), a mid glazing bar 2.5 mm clear of
  // the glass, brass knob + key plate on the right stile.
  for (const sx of [-1, 1] as const) {
    const stile = mesh(new THREE.BoxGeometry(0.05, 1.36, 0.07), MAT.woodMed(), sx * 0.435, 0.87, 0.285);
    g.add(stile);
  }
  for (const ry of [0.26, 1.48] as const) {
    const rail = mesh(new THREE.BoxGeometry(W - 0.1, 0.06, 0.07), MAT.woodMed(), 0, ry, 0.285);
    g.add(rail);
  }
  const glass = mesh(new THREE.BoxGeometry(0.86, 1.16, 0.015), MAT.glassClear(), 0, 0.87, 0.285);
  glass.castShadow = false;
  g.add(glass);
  const glazingBar = mesh(new THREE.BoxGeometry(0.86, 0.03, 0.02), MAT.woodMed(), 0, 0.9, 0.305);
  g.add(glazingBar);
  const knob = mesh(new THREE.SphereGeometry(0.015, 8, 8), MAT.brassDark(), 0.435, 0.9, 0.335);
  g.add(knob);
  const keyPlate = mesh(new THREE.BoxGeometry(0.03, 0.06, 0.01), MAT.brassDark(), 0.435, 0.82, 0.325);
  g.add(keyPlate);

  // Three display rifles: muzzle-up on brass pegs, butts ON the deck
  // (deck top 0.23 → rifle origin y 0.87), 26 cm apart, ≥8 cm from the glass.
  for (let i = 0; i < 3; i++) {
    const x = -0.26 + i * 0.26;
    for (const py of [0.5, 1.2] as const) {
      const peg = mesh(new THREE.BoxGeometry(0.025, 0.025, 0.07), MAT.brassDark(), x, py, 0.065);
      g.add(peg);
    }
    const rifle = buildRifle();
    rifle.rotation.z = Math.PI / 2 - 0.04;
    rifle.position.set(x, 0.87, 0.13);
    g.add(rifle);
  }

  return g;
}

/** Wood bulletin board layered with a handful of painted wanted posters.
 *
 *  Z-FIGHT DISCIPLINE (the user-reported flicker): every poster used to sit
 *  at the SAME z (0.017) — several of them OVERLAP each other, so overlapping
 *  same-normal planes fought the depth buffer and the board "changed color"
 *  as the camera moved. Now each poster carries its OWN real depth offset
 *  (6 mm steps, nearest 6 mm off the board face) — stacked papers, never
 *  coplanar; the pin nails are CHILDREN of their poster (they ride the
 *  poster's rotation and always poke through its own plane). */
export function buildWantedBoard(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'wanted-board';

  const w = 1.3 * WORLD_SCALE;
  const h = 1.1 * WORLD_SCALE;
  const board = mesh(new THREE.BoxGeometry(w, h, 0.03), MAT.woodMed(), 0, h / 2 + 0.4, 0);
  g.add(board);
  const frame = mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.02), MAT.woodTrim(), 0, h / 2 + 0.4, -0.01);
  g.add(frame);

  const names: [string, string][] = [
    ['BLACK JACK', '$800 REWARD'],
    ['RED EYE MCGRAW', '$1200 REWARD'],
    ['ONE-EYE PETE', '$350 REWARD'],
    ['THE KID', '$600 REWARD'],
  ];
  // [x, y, rot, z] — the 4th entry is the poster's REAL plane offset: strict
  // 6 mm ladder off the board face (board front = +0.015), so no two posters
  // (nor any poster and the board) ever share a z plane.
  const positions: [number, number, number, number][] = [
    [-0.32, 0.08, 0.03, 0.021],
    [0.05, 0.15, -0.02, 0.027],
    [0.3, -0.05, 0.04, 0.033],
    [-0.05, -0.18, 0.02, 0.039],
  ];
  names.forEach(([name, reward], i) => {
    const tex = wantedPosterTexture(name, reward, 220);
    const [px, py, rot, pz] = positions[i];
    const poster = mesh(new THREE.PlaneGeometry(0.34, 0.44), stdMat(PARCHMENT_AGED, tex), px, h / 2 + 0.4 + py, pz);
    poster.rotation.z = rot;
    poster.name = `wanted-poster-${i}`;
    g.add(poster);
    // small nail pins at the top corners — CHILDREN of the poster so they
    // rotate with it and sit proud of ITS plane (never re-coplanar with the
    // board face when the poster offset changes)
    [-0.13, 0.13].forEach((nx) => {
      const nail = mesh(new THREE.SphereGeometry(0.008, 6, 6), MAT.ironDark(), nx, 0.2, 0.004);
      nail.name = `wanted-poster-${i}-nail`;
      poster.add(nail);
    });
  });

  return g;
}

/** Extruded five-point star badge mounted on a small wood plaque, engraved "SHERIFF". */
export function buildSheriffBadge(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sheriff-badge';

  const plaqueTex = signTexture({ text: 'SHERIFF', bg: WOOD_DARK, fg: STAR_GOLD, w: 320, h: 140, border: false, font: 'bold 44px Georgia, serif' });
  const plaque = mesh(new THREE.BoxGeometry(0.5, 0.22, 0.02), stdMat(WOOD_DARK, plaqueTex), 0, 0, 0);
  g.add(plaque);

  const starGeo = createStarGeometry(0.14, 0.06, 0.02);
  const star = mesh(starGeo, metalMat(STAR_GOLD, brassTexture(STAR_GOLD)), 0, 0.04, 0.02);
  g.add(star);

  const rim = mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 16), MAT.brassDark(), 0, 0.04, 0.035);
  g.add(rim);

  return g;
}

/** Cast-iron potbelly stove with a pipe, a glowing door gap, and squat legs. */
export function buildPotbellyStove(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'potbelly-stove';

  const bodyBottom = mesh(new THREE.CylinderGeometry(0.24, 0.16, 0.45, 16), MAT.iron(), 0, 0.4, 0);
  g.add(bodyBottom);
  const bodyTop = mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.25, 16), MAT.iron(), 0, 0.4 + 0.225 + 0.125, 0);
  g.add(bodyTop);

  // decorative bands
  [0.25, 0.55].forEach((y) => {
    const band = mesh(new THREE.TorusGeometry(0.22, 0.012, 8, 20), MAT.ironDark(), 0, y, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  });

  // door with a warm glow gap
  const door = mesh(new THREE.BoxGeometry(0.14, 0.16, 0.02), MAT.ironDark(), 0, 0.35, 0.23);
  g.add(door);
  const doorHandle = mesh(new THREE.SphereGeometry(0.012, 8, 8), MAT.brassDark(), 0.06, 0.35, 0.245);
  g.add(doorHandle);
  const glow = mesh(new THREE.PlaneGeometry(0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0xff6a2a, emissive: 0xff6a2a, emissiveIntensity: 1.4 }), 0, 0.29, 0.241);
  g.add(glow);
  const emberLight = new THREE.PointLight(0xff7a33, 0.6, 2, 2);
  emberLight.position.set(0, 0.3, 0.3);
  g.add(emberLight);

  // stovepipe going up with a small elbow
  const pipe = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 12), MAT.ironDark(), 0, 0.4 + 0.35 + 0.45, 0);
  g.add(pipe);
  const elbow = mesh(new THREE.SphereGeometry(0.055, 10, 10), MAT.ironDark(), 0, 0.4 + 0.35 + 0.9, 0);
  g.add(elbow);

  // squat cabriole-style legs
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.16, 8), MAT.ironDark(), Math.cos(a) * 0.16, 0.08, Math.sin(a) * 0.16);
    leg.rotation.z = Math.cos(a) * 0.3;
    leg.rotation.x = Math.sin(a) * 0.3;
    g.add(leg);
  }

  return g;
}

/** Wall pegboard with a few dangling key rings. */
export function buildKeyRack(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'key-rack';

  const board = mesh(new THREE.BoxGeometry(0.4, 0.12, 0.02), MAT.woodMed(), 0, 0, 0);
  g.add(board);

  for (let i = 0; i < 4; i++) {
    const x = -0.14 + i * 0.09;
    const peg = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), MAT.ironDark(), x, -0.01, 0.03);
    peg.rotation.x = Math.PI / 2;
    g.add(peg);

    // only hang keys on some pegs for variety
    if (i !== 2) {
      const ring = mesh(new THREE.TorusGeometry(0.025, 0.004, 6, 12), MAT.iron(), x, -0.07, 0.05);
      g.add(ring);
      for (let k = 0; k < 3; k++) {
        const key = mesh(new THREE.BoxGeometry(0.006, 0.03, 0.012), MAT.iron(), x + (k - 1) * 0.012, -0.11, 0.05);
        g.add(key);
      }
    }
  }

  return g;
}

/** Brass-and-glass kerosene desk lamp with a lit wick. */
export function buildKeroseneLamp(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'kerosene-lamp';

  const base = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 16), MAT.brass(), 0, 0.01, 0);
  g.add(base);
  const reservoir = mesh(new THREE.SphereGeometry(0.045, 14, 10), MAT.glassWarm(), 0, 0.06, 0);
  g.add(reservoir);
  const burner = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.03, 12), MAT.brass(), 0, 0.1, 0);
  g.add(burner);
  const chimney = mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.12, 12, 1, true), MAT.glassClear(), 0, 0.18, 0);
  g.add(chimney);
  const flameLight = new THREE.PointLight(0xffcf80, 0.5, 1.6, 2);
  flameLight.position.set(0, 0.12, 0);
  g.add(flameLight);
  const flame = mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffdf9a, emissive: 0xffb347, emissiveIntensity: 1.5 }), 0, 0.12, 0);
  g.add(flame);
  const handle = mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 12, Math.PI), MAT.brassDark(), 0.05, 0.1, 0);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);

  return g;
}

/** Wash stand with a basin, pitcher, and a folded towel. */
export function buildWashStand(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'wash-stand';

  const h = 0.75 * WORLD_SCALE;
  const top = mesh(new THREE.BoxGeometry(0.45, 0.03, 0.35), MAT.woodMed(), 0, h, 0);
  g.add(top);

  [[-0.18, -0.13], [0.18, -0.13], [-0.18, 0.13], [0.18, 0.13]].forEach(([x, z]) => {
    const leg = mesh(new THREE.CylinderGeometry(0.015, 0.02, h - 0.03, 8), MAT.woodDark(), x, (h - 0.03) / 2, z);
    g.add(leg);
  });
  const shelf = mesh(new THREE.BoxGeometry(0.4, 0.02, 0.3), MAT.woodDark(), 0, h * 0.4, 0);
  g.add(shelf);

  const basin = mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.06, 20), stdMat('#e8e4d8', null, { roughness: 0.3, metalness: 0.1 }), 0, h + 0.045, 0);
  g.add(basin);
  const basinInner = mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.02, 20), stdMat('#cfe0e6', null, { roughness: 0.15 }), 0, h + 0.065, 0);
  g.add(basinInner);

  const pitcherBody = mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.14, 14), stdMat('#e8e4d8', null, { roughness: 0.3 }), -0.12, h * 0.4 + 0.08, 0);
  g.add(pitcherBody);
  const pitcherNeck = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.04, 14), stdMat('#e8e4d8', null, { roughness: 0.3 }), -0.12, h * 0.4 + 0.17, 0);
  g.add(pitcherNeck);
  const pitcherHandle = mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI * 1.3), stdMat('#e8e4d8', null, { roughness: 0.3 }), -0.16, h * 0.4 + 0.1, 0);
  pitcherHandle.rotation.y = Math.PI / 2;
  g.add(pitcherHandle);

  const towel = mesh(new THREE.BoxGeometry(0.16, 0.03, 0.12), MAT.ticking(), 0.15, h * 0.4 + 0.03, 0);
  g.add(towel);

  return g;
}

/** Standing coat rack holding a hat and a holstered gun belt. */
export function buildCoatRack(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'coat-rack';

  const poleH = 1.7 * WORLD_SCALE;
  const pole = mesh(new THREE.CylinderGeometry(0.025, 0.03, poleH, 10), MAT.woodDark(), 0, poleH / 2, 0);
  g.add(pole);

  const baseRing = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 16), MAT.woodDark(), 0, 0.02, 0);
  g.add(baseRing);

  // pegs radiating near the top
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const peg = mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.12, 8), MAT.woodTrim(), Math.cos(a) * 0.06, poleH - 0.15, Math.sin(a) * 0.06);
    peg.rotation.z = Math.PI / 2;
    peg.rotation.y = -a;
    g.add(peg);
  }

  // hat: cone crown + wide brim torus
  const hatGroup = new THREE.Group();
  hatGroup.position.set(0.08, poleH - 0.02, 0);
  const crown = mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.13, 16), stdMat('#4a3826', null, { roughness: 0.85 }), 0, 0.06, 0);
  hatGroup.add(crown);
  const brim = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.015, 24), stdMat('#4a3826', null, { roughness: 0.85 }), 0, 0.01, 0);
  hatGroup.add(brim);
  const band = mesh(new THREE.TorusGeometry(0.095, 0.012, 8, 16), MAT.leather(), 0, 0.02, 0);
  band.rotation.x = Math.PI / 2;
  hatGroup.add(band);
  g.add(hatGroup);

  // gun belt with holster hanging from a lower peg
  const beltGroup = new THREE.Group();
  beltGroup.position.set(-0.06, poleH - 0.35, 0.04);
  const holster = mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.22, 10), MAT.leather(), 0, -0.1, 0);
  holster.rotation.z = 0.15;
  beltGroup.add(holster);
  const gripPoke = mesh(new THREE.BoxGeometry(0.018, 0.05, 0.018), MAT.woodDark(), 0.02, 0.02, 0);
  gripPoke.rotation.z = 0.15;
  beltGroup.add(gripPoke);
  const beltStrap = mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 16, Math.PI), MAT.leather(), 0, 0.08, 0);
  beltStrap.rotation.z = Math.PI;
  beltGroup.add(beltStrap);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    const bullet = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6), MAT.brassDark(), Math.cos(a) * 0.09, 0.08 + Math.sin(a) * 0.09 * 0.3, 0.015);
    beltGroup.add(bullet);
  }
  g.add(beltGroup);

  return g;
}

/** Stenciled wooden ammunition crate with a sliding lid line. */
export function buildAmmoCrate(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'ammo-crate';

  const w = 0.4 * WORLD_SCALE;
  const h = 0.26 * WORLD_SCALE;
  const d = 0.28 * WORLD_SCALE;

  const stencilTex = signTexture({ text: '.45 CAL', sub: 'U.S. CAVALRY', bg: WOOD_MED, fg: '#1c1c1c', w: 300, h: 200, border: false, font: 'bold 46px "Courier New", monospace' });
  const body = mesh(new THREE.BoxGeometry(w, h, d), stdMat(WOOD_MED, stencilTex), 0, h / 2, 0);
  g.add(body);

  // corner + edge battens
  const battenMat = MAT.woodDark();
  [-1, 1].forEach((sx) => {
    const vBatten = mesh(new THREE.BoxGeometry(0.03, h, 0.03), battenMat, (sx * w) / 2, h / 2, (sx * d) / 2);
    g.add(vBatten);
  });
  [0.03, h - 0.03].forEach((y) => {
    const hBatten = mesh(new THREE.BoxGeometry(w + 0.02, 0.025, d + 0.02), battenMat, 0, y, 0);
    g.add(hBatten);
  });

  // rope handles on the short ends
  [-w / 2 - 0.005, w / 2 + 0.005].forEach((x) => {
    const rope = mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), stdMat('#c9b183', null, { roughness: 0.9 }), x, h * 0.6, 0);
    rope.rotation.z = Math.PI / 2;
    rope.rotation.y = Math.PI / 2;
    g.add(rope);
  });

  return g;
}

// ---------------------------------------------------------------------------
// One-call convenience: a full sheriff's office + attached cell
// ---------------------------------------------------------------------------

export function buildSheriffOfficeScene(): THREE.Group {
  const scene = new THREE.Group();
  scene.name = 'sheriff-office-scene';

  const desk = buildSheriffDesk();
  desk.position.set(0, 0, -1.8);
  scene.add(desk);

  const chair = buildSheriffChair();
  chair.position.set(0, 0, -1.3);
  chair.rotation.y = Math.PI;
  scene.add(chair);

  const board = buildWantedBoard();
  board.position.set(-2.2, 0, -2.2);
  board.rotation.y = Math.PI / 2;
  scene.add(board);

  const badge = buildSheriffBadge();
  badge.position.set(1.6, 1.7, -2.35);
  scene.add(badge);

  const stove = buildPotbellyStove();
  stove.position.set(2, 0, -0.5);
  scene.add(stove);

  const rack = buildGunRack();
  rack.position.set(2.2, 1.5, -2.35);
  scene.add(rack);

  const cabinet = buildGunCabinet();
  cabinet.position.set(-2.3, 0, 0.5);
  cabinet.rotation.y = Math.PI / 2;
  scene.add(cabinet);

  const keys = buildKeyRack();
  keys.position.set(0.9, 1.5, -2.35);
  scene.add(keys);

  const lamp = buildKeroseneLamp();
  lamp.position.set(-0.4, 0.75, -1.85);
  scene.add(lamp);

  const stand = buildWashStand();
  stand.position.set(-1.6, 0, 1.6);
  scene.add(stand);

  const coatRack = buildCoatRack();
  coatRack.position.set(1.8, 0, 2);
  scene.add(coatRack);

  const crate1 = buildAmmoCrate();
  crate1.position.set(2.1, 0, 1.6);
  scene.add(crate1);
  const crate2 = buildAmmoCrate();
  crate2.position.set(2.1, 0.27, 1.6);
  crate2.rotation.y = 0.3;
  scene.add(crate2);

  // an attached jail cell
  const cellDoor = buildJailCellDoor();
  cellDoor.position.set(0.5, 0, 3.2);
  cellDoor.rotation.y = Math.PI;
  scene.add(cellDoor);

  const cot = buildCellCot();
  cot.position.set(0.9, 0, 4.2);
  cot.rotation.y = Math.PI / 2;
  scene.add(cot);

  return scene;
}

// ---------------------------------------------------------------------------
// Project wiring — IAssetFactory adapters (the user file's inferred adapter
// block, rewritten against the REAL AssetRegistry contract; every build*
// function above is used VERBATIM — zero geometry rework)
// ---------------------------------------------------------------------------

import type { ObjectDefinition } from '../../core/types.js';
import type { IAssetFactory } from '../IAssetFactory.js';
import type { AssetRegistry } from '../AssetRegistry.js';

/**
 * Minimal factory: builders own all mesh-level state; the renderer adapter
 * owns the registry transform (same contract as the bank/saloon factories).
 */
export class SheriffAssetFactory implements IAssetFactory {
  constructor(private readonly builder: () => THREE.Object3D) {}
  create(_definition: ObjectDefinition): THREE.Object3D {
    return this.builder();
  }
}

/** All assetType strings supplied by the user's asset library. */
export const SHERIFF_OFFICE_ASSET_TYPES = Object.freeze([
  'sheriff-desk',
  'sheriff-chair',
  'jail-cell-door',
  'cell-cot',
  'gun-rack',
  'gun-cabinet',
  'wanted-board',
  'sheriff-badge',
  'potbelly-stove',
  'key-rack',
  'kerosene-lamp',
  'wash-stand',
  'coat-rack',
  'ammo-crate',
] as const);

export type SheriffOfficeAssetType = (typeof SHERIFF_OFFICE_ASSET_TYPES)[number];

/** Register the 14 user-supplied asset types (the building shell + the
 *  openable front door register separately). */
export function registerSheriffAssetFactories(registry: AssetRegistry): void {
  registry.register('sheriff-desk', new SheriffAssetFactory(() => buildSheriffDesk()), 'Sheriff Desk');
  registry.register('sheriff-chair', new SheriffAssetFactory(() => buildSheriffChair()), 'Sheriff Chair');
  registry.register('jail-cell-door', new SheriffAssetFactory(() => buildJailCellDoor()), 'Jail Cell Door');
  registry.register('cell-cot', new SheriffAssetFactory(() => buildCellCot()), 'Cell Cot');
  registry.register('gun-rack', new SheriffAssetFactory(() => buildGunRack()), 'Gun Rack');
  registry.register('gun-cabinet', new SheriffAssetFactory(() => buildGunCabinet()), 'Gun Cabinet');
  registry.register('wanted-board', new SheriffAssetFactory(() => buildWantedBoard()), 'Wanted Board');
  registry.register('sheriff-badge', new SheriffAssetFactory(() => buildSheriffBadge()), 'Sheriff Badge');
  registry.register('potbelly-stove', new SheriffAssetFactory(() => buildPotbellyStove()), 'Potbelly Stove');
  registry.register('key-rack', new SheriffAssetFactory(() => buildKeyRack()), 'Key Rack');
  registry.register('kerosene-lamp', new SheriffAssetFactory(() => buildKeroseneLamp()), 'Kerosene Lamp');
  registry.register('wash-stand', new SheriffAssetFactory(() => buildWashStand()), 'Wash Stand');
  registry.register('coat-rack', new SheriffAssetFactory(() => buildCoatRack()), 'Coat Rack');
  registry.register('ammo-crate', new SheriffAssetFactory(() => buildAmmoCrate()), 'Ammo Crate');
}

/* ---------------------------------------------------------------------------
 * Jail cell door — open/close API (ADDITIVE; the builder above is untouched).
 * The cell doors spawn CLOSED and swing INWARD into their cell (positive
 * hinge yaw rotates the leaf tip toward the cell interior) so an open door
 * never blocks the 1.1 m corridor. Pure hinge rotation — no scaling, no
 * re-parenting — shared verbatim by the interaction system and the tests.
 * ------------------------------------------------------------------------- */

/** Swing angle (radians) a cell door opens through: 80°, like the bank gates. */
export const JAIL_CELL_DOOR_OPEN_ANGLE = 1.396;

/**
 * Pose a jail cell door between CLOSED (t = 0) and FULLY OPEN (t = 1).
 * Positive rotation about the hinge group's local +Y swings the barred leaf
 * INWARD (into the cell the door fronts — for the layout's rotY −90 doors
 * the leaf tip sweeps toward +x, the cell interior).
 */
export function setJailCellDoorOpen(root: THREE.Object3D, t: number): void {
  const hinge = root.getObjectByName('jail-cell-door-hinge');
  if (hinge) hinge.rotation.y = THREE.MathUtils.clamp(t, 0, 1) * JAIL_CELL_DOOR_OPEN_ANGLE;
}

/* ---------------------------------------------------------------------------
 * Sheriff FRONT door — open/close API (the office's public entrance).
 * The door spawns CLOSED across the south doorway; E swings the leaf INWARD
 * into the office around the real hinge pivot ('front-door-hinge', 4 cm off
 * the west jamb). 100° — the sweep was verified against the wall band, both
 * casing rings and every furniture line: the leaf grazes nothing. Pure pose-
 * from-t rotation (position is RE-DERIVED from the state every frame, never
 * accumulated) — shared verbatim by the interaction system and the tests.
 * ------------------------------------------------------------------------- */

/** Swing angle (radians) the office front door opens through: 100° inward. */
export const SHERIFF_FRONT_DOOR_OPEN_ANGLE = (100 * Math.PI) / 180;

/**
 * Pose the front door between CLOSED (t = 0) and FULLY OPEN (t = 1).
 * Positive rotation about the hinge pivot's local +Y swings the leaf tip
 * INTO the office (the root's +z faces the street; +yaw turns +x toward −z).
 */
export function setSheriffFrontDoorOpen(root: THREE.Object3D, t: number): void {
  const hinge = root.getObjectByName('front-door-hinge');
  if (hinge) hinge.rotation.y = THREE.MathUtils.clamp(t, 0, 1) * SHERIFF_FRONT_DOOR_OPEN_ANGLE;
}