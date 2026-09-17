/**
 * src/assets/stable/StableMaterials.ts
 * -----------------------------------------------------------------------------
 * Shared procedural materials for the Livery Stable module (mirrors
 * SheriffMaterials' contract):
 *
 *  - Every texture is generated on a <canvas> at boot; when `document` does
 *    not exist (node:test headless path) the generators return null and the
 *    materials fall back to flat colors — same headless-safety as the
 *    saloon/bank/sheriff modules.
 *  - `createStableMaterials()` returns a FRESH material set per call (the
 *    shell builder calls it once; the unit-box factories call it per
 *    creation — materials are cheap, geometries are the budget).
 *  - Expensive canvas textures are memoized per process (memoTex), exactly
 *    like the sheriff module.
 *
 * Palette: weathered board-and-batten siding in dusty western TAN (deliberately
 * distinct from the sheriff's sage-gray office and the saloon's bright false
 * front), dark structural timber, worn plank floor, wood shingle roof, straw
 * hay, rusty iron, oiled leather, canvas, dirt and water — the read of a
 * working frontier livery stable.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';

const SIDING_BASE = '#9c8a6a'; // weathered tan board-and-batten
const SIDING_SHADOW = '#6b5b42';
const TIMBER_BASE = '#5c452e'; // structural timber (posts, beams, rafters)
const PLANK_BASE = '#8a6a45'; // worn plank floor
const PLANK_GRAIN = '#5a4128';
const SHINGLE_BASE = '#514237'; // weathered wood shingles
const SHINGLE_SHADOW = '#372c24';
const TRIM_PAINT = '#4a3a28'; // dark timber trim (casings, doors)
const IRON_BASE = '#26241f';
const IRON_RUST = '#6a4326';
const HAY_BASE = '#c2a250'; // straw
const HAY_DARK = '#8f7534';
const DIRT_BASE = '#7a6248';
const CANVAS_BASE = '#cfc3a4';
const LEATHER_BASE = '#5f3d22';
const WATER_BASE = '#4e6066';

export const STABLE_PALETTE = Object.freeze({
  siding: SIDING_BASE,
  timber: TIMBER_BASE,
  trim: TRIM_PAINT,
  plank: PLANK_BASE,
  shingle: SHINGLE_BASE,
  iron: IRON_BASE,
  rust: IRON_RUST,
  hay: HAY_BASE,
  dirt: DIRT_BASE,
  canvas: CANVAS_BASE,
  leather: LEATHER_BASE,
  water: WATER_BASE,
});

const HAS_DOM = typeof document !== 'undefined';

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!HAS_DOM) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return { canvas, ctx };
}

export function toTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function rand(seed: { v: number }): number {
  seed.v = (seed.v * 9301 + 49297) % 233280;
  return seed.v / 233280;
}

function memoTex(fn: () => THREE.CanvasTexture | null): () => THREE.CanvasTexture | null {
  let cache: THREE.CanvasTexture | null | undefined;
  return () => {
    if (cache === undefined) cache = fn();
    return cache;
  };
}

function stdMat(
  color: string,
  texture: THREE.CanvasTexture | null,
  opts: { roughness?: number; metalness?: number; repeat?: [number, number] } = {},
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0.05,
  });
  if (texture) {
    mat.map = texture;
    if (opts.repeat) {
      mat.map = texture.clone();
      mat.map.needsUpdate = true;
      mat.map.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
  }
  return mat;
}

/* -------------------------------------------------------------------------- */
/* Texture generators                                                         */
/* -------------------------------------------------------------------------- */

/** Vertical board-and-batten siding: wide boards + narrow battens over seams. */
function genBoardBatten(): THREE.CanvasTexture | null {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = SIDING_BASE;
  ctx.fillRect(0, 0, 256, 256);
  const seed = { v: 77 };
  const boardW = 64;
  for (let x = 0; x < 256; x += boardW) {
    // per-board brightness variation
    ctx.fillStyle = `rgba(${Math.round(rand(seed) * 36)},${Math.round(rand(seed) * 30)},${Math.round(rand(seed) * 24)},0.18)`;
    ctx.fillRect(x, 0, boardW, 256);
    // seam shadow
    ctx.fillStyle = 'rgba(30,24,16,0.5)';
    ctx.fillRect(x + boardW - 3, 0, 3, 256);
    // vertical grain streaks
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = SIDING_SHADOW;
      ctx.lineWidth = 1;
      const gx = x + 6 + rand(seed) * (boardW - 12);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx + (rand(seed) - 0.5) * 6, 256);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // batten over the seam
    ctx.fillStyle = 'rgba(255,250,235,0.10)';
    ctx.fillRect(x + boardW - 1, 0, 10, 256);
    ctx.fillStyle = 'rgba(30,24,16,0.32)';
    ctx.fillRect(x + boardW - 1, 0, 2, 256);
    ctx.fillRect(x + boardW + 7, 0, 2, 256);
  }
  return toTexture(canvas, 1, 1);
}

/** Worn plank floor: long planks, color variation, scuffs, nail dots. */
function genPlank(): THREE.CanvasTexture | null {
  const c = makeCanvas(512, 512);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = PLANK_BASE;
  ctx.fillRect(0, 0, 512, 512);
  const seed = { v: 123 };
  const plankH = 64;
  for (let y = 0; y < 512; y += plankH) {
    const shade = 0.82 + rand(seed) * 0.36;
    ctx.fillStyle = `rgba(${Math.round(90 * shade)},${Math.round(66 * shade)},${Math.round(42 * shade)},0.55)`;
    ctx.fillRect(0, y, 512, plankH);
    // gap shadow + top highlight
    ctx.fillStyle = 'rgba(24,16,8,0.6)';
    ctx.fillRect(0, y + plankH - 3, 512, 3);
    ctx.fillStyle = 'rgba(255,240,210,0.10)';
    ctx.fillRect(0, y, 512, 2);
    // grain + scuffs
    for (let i = 0; i < 9; i++) {
      ctx.globalAlpha = 0.10 + rand(seed) * 0.10;
      ctx.strokeStyle = rand(seed) > 0.5 ? PLANK_GRAIN : '#a88355';
      ctx.lineWidth = 1;
      const gy = y + 6 + rand(seed) * (plankH - 12);
      const gx = rand(seed) * 512;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + 60 + rand(seed) * 140, gy + (rand(seed) - 0.5) * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // butt joints + nail dots
    for (let x = 40 + rand(seed) * 120; x < 512; x += 150 + rand(seed) * 120) {
      ctx.fillStyle = 'rgba(24,16,8,0.45)';
      ctx.fillRect(x, y + 1, 2, plankH - 2);
      ctx.fillStyle = 'rgba(30,30,30,0.5)';
      ctx.beginPath();
      ctx.arc(x + 6, y + 8, 1.4, 0, Math.PI * 2);
      ctx.arc(x + 6, y + plankH - 8, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return toTexture(canvas, 1, 1);
}

/** Wood shingle roof. */
function genShingle(): THREE.CanvasTexture | null {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = SHINGLE_BASE;
  ctx.fillRect(0, 0, 256, 256);
  const seed = { v: 209 };
  const rows = 8;
  const rowH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 16;
    for (let x = -32; x < 256; x += 32) {
      const shade = 0.8 + rand(seed) * 0.4;
      ctx.fillStyle = `rgba(${Math.round(81 * shade)},${Math.round(66 * shade)},${Math.round(55 * shade)},0.6)`;
      ctx.fillRect(x + offset, r * rowH, 30, rowH);
      ctx.fillStyle = SHINGLE_SHADOW;
      ctx.fillRect(x + offset, r * rowH + rowH - 3, 30, 3);
    }
  }
  return toTexture(canvas, 1, 1);
}

/** Straw hay: streaky tangled strands. */
function genHay(): THREE.CanvasTexture | null {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = HAY_BASE;
  ctx.fillRect(0, 0, 256, 256);
  const seed = { v: 311 };
  for (let i = 0; i < 240; i++) {
    ctx.globalAlpha = 0.25 + rand(seed) * 0.5;
    ctx.strokeStyle = rand(seed) > 0.4 ? HAY_DARK : '#e0c46a';
    ctx.lineWidth = 1 + rand(seed) * 1.4;
    const x = rand(seed) * 256;
    const y = rand(seed) * 256;
    const len = 14 + rand(seed) * 40;
    const ang = (rand(seed) - 0.5) * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, 1, 1);
}

/** Packed dirt ground patch. */
function genDirt(): THREE.CanvasTexture | null {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = DIRT_BASE;
  ctx.fillRect(0, 0, 256, 256);
  const seed = { v: 401 };
  for (let i = 0; i < 300; i++) {
    ctx.globalAlpha = 0.08 + rand(seed) * 0.2;
    ctx.fillStyle = rand(seed) > 0.5 ? '#8d745a' : '#63503c';
    ctx.beginPath();
    ctx.arc(rand(seed) * 256, rand(seed) * 256, 1 + rand(seed) * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, 1, 1);
}

/** Canvas fabric (blankets, sacks). */
function genCanvasTex(): THREE.CanvasTexture | null {
  const c = makeCanvas(128, 128);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = CANVAS_BASE;
  ctx.fillRect(0, 0, 128, 128);
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 128; i += 4) {
    ctx.fillStyle = '#b3a684';
    ctx.fillRect(i, 0, 2, 128);
    ctx.fillRect(0, i, 128, 2);
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, 1, 1);
}

/** Oiled leather (saddles, straps, bridles). */
function genLeather(): THREE.CanvasTexture | null {
  const c = makeCanvas(128, 128);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = LEATHER_BASE;
  ctx.fillRect(0, 0, 128, 128);
  const seed = { v: 517 };
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.10 + rand(seed) * 0.16;
    ctx.strokeStyle = rand(seed) > 0.5 ? '#7a5230' : '#462b16';
    ctx.lineWidth = 1 + rand(seed) * 2;
    ctx.beginPath();
    ctx.arc(rand(seed) * 128, rand(seed) * 128, 3 + rand(seed) * 10, 0, Math.PI * (0.6 + rand(seed)));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, 1, 1);
}

const memoBoardBatten = memoTex(genBoardBatten);
const memoPlank = memoTex(genPlank);
const memoShingle = memoTex(genShingle);
const memoHay = memoTex(genHay);
const memoDirt = memoTex(genDirt);
const memoCanvasTex = memoTex(genCanvasTex);
const memoLeather = memoTex(genLeather);

/* -------------------------------------------------------------------------- */
/* Painted sign boards (LIVERY STABLE, TACK, FEED, FARRIER, nameplates)       */
/* -------------------------------------------------------------------------- */

/**
 * Painted wooden sign face: weathered board, border, western serif text.
 * `dark` flips to a chalk-style board (rates board). Returns null headless.
 */
export function stableSignTexture(
  text: string,
  opts: { sub?: string; dark?: boolean; w?: number; h?: number } = {},
): THREE.CanvasTexture | null {
  const W = opts.w ?? 1024;
  const H = opts.h ?? 256;
  const c = makeCanvas(W, H);
  if (!c) return null;
  const { canvas, ctx } = c;
  const bg = opts.dark ? '#2e2a22' : '#6b5638';
  const fg = opts.dark ? '#e2d6b4' : '#e8d9b0';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // weathered streaks
  const seed = { v: 613 };
  ctx.globalAlpha = 0.10;
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = rand(seed) > 0.5 ? '#000' : '#fff';
    ctx.fillRect(0, rand(seed) * H, W, 1 + rand(seed) * 3);
  }
  ctx.globalAlpha = 1;
  // border
  ctx.strokeStyle = opts.dark ? '#8d7f5e' : '#2e2114';
  ctx.lineWidth = Math.max(4, Math.round(H * 0.045));
  ctx.strokeRect(H * 0.055, H * 0.055, W - H * 0.11, H - H * 0.11);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (opts.sub) {
    ctx.font = `bold ${Math.round(H * 0.52)}px Georgia, "Times New Roman", serif`;
    ctx.fillText(text, W / 2, H * 0.42);
    ctx.fillStyle = opts.dark ? '#b9a878' : '#c9a95c';
    ctx.font = `${Math.round(H * 0.22)}px Georgia, serif`;
    ctx.fillText(opts.sub, W / 2, H * 0.78);
  } else {
    ctx.font = `bold ${Math.round(H * 0.56)}px Georgia, "Times New Roman", serif`;
    ctx.fillText(text, W / 2, H * 0.54);
  }
  return toTexture(canvas, 1, 1);
}

/* -------------------------------------------------------------------------- */
/* The material set                                                           */
/* -------------------------------------------------------------------------- */

export interface StableMaterials {
  siding: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  plank: THREE.MeshStandardMaterial;
  plankDark: THREE.MeshStandardMaterial;
  shingle: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  rust: THREE.MeshStandardMaterial;
  hay: THREE.MeshStandardMaterial;
  hayDark: THREE.MeshStandardMaterial;
  dirt: THREE.MeshStandardMaterial;
  canvas: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  tin: THREE.MeshStandardMaterial;
}

/**
 * SHARED MATERIAL CACHE (weak-laptop perf revision).
 *
 * The old contract built a FRESH 17-material set on EVERY builder invocation
 * — with 323 managed defs that measured 1334 unique materials in the live
 * scene: massive GPU state churn, uniform uploads, and GC pressure. Nothing
 * in the codebase mutates a material after creation (verified: no per-frame
 * emissive/opacity/color writes; stdMat clones textures for repeat variants),
 * so the set is now a process-lifetime SINGLETON. Visual output is bit-identical;
 * every mesh simply shares one instance per look.
 *
 * Disposal contract (revised with ThreeRendererAdapter): shared materials are
 * NEVER disposed per-object — the adapter now disposes geometries only.
 */
let stableMaterialsCache: StableMaterials | null = null;

export function createStableMaterials(): StableMaterials {
  if (!stableMaterialsCache) stableMaterialsCache = buildStableMaterials();
  return stableMaterialsCache;
}

function buildStableMaterials(): StableMaterials {
  return {
    siding: stdMat(SIDING_BASE, memoBoardBatten(), { roughness: 0.9 }),
    timber: stdMat(TIMBER_BASE, memoPlank(), { roughness: 0.92, repeat: [1.2, 1.2] }),
    trim: stdMat(TRIM_PAINT, memoPlank(), { roughness: 0.88, repeat: [0.8, 0.8] }),
    plank: stdMat(PLANK_BASE, memoPlank(), { roughness: 0.9 }),
    plankDark: stdMat('#6b5136', memoPlank(), { roughness: 0.92 }),
    shingle: stdMat(SHINGLE_BASE, memoShingle(), { roughness: 0.95 }),
    iron: stdMat(IRON_BASE, null, { roughness: 0.6, metalness: 0.55 }),
    rust: stdMat(IRON_RUST, null, { roughness: 0.85, metalness: 0.3 }),
    hay: stdMat(HAY_BASE, memoHay(), { roughness: 1 }),
    hayDark: stdMat(HAY_DARK, memoHay(), { roughness: 1 }),
    dirt: stdMat(DIRT_BASE, memoDirt(), { roughness: 1 }),
    canvas: stdMat(CANVAS_BASE, memoCanvasTex(), { roughness: 0.95 }),
    leather: stdMat(LEATHER_BASE, memoLeather(), { roughness: 0.7 }),
    water: stdMat(WATER_BASE, null, { roughness: 0.15, metalness: 0.1 }),
    glass: stdMat('#b8c8c4', null, { roughness: 0.25, metalness: 0.15 }),
    brass: stdMat('#a8862f', null, { roughness: 0.45, metalness: 0.7 }),
    tin: stdMat('#8f8b80', null, { roughness: 0.5, metalness: 0.6 }),
  };
}
