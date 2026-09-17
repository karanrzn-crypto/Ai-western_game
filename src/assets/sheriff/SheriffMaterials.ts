/**
 * src/assets/sheriff/SheriffMaterials.ts
 * -----------------------------------------------------------------------------
 * Shared procedural materials for the Sheriff Office module (mirrors
 * BankMaterials' contract):
 *
 *  - Every texture is generated on a <canvas> at boot; when `document` does
 *    not exist (node:test headless path) the generators return null and the
 *    materials fall back to flat colors — same headless-safety as the bank.
 *  - `createSheriffMaterials()` returns a FRESH material set per call (the
 *    shell builder calls it once; the unit-box wall/floor factories call it
 *    per creation, exactly like the saloon/bank do — materials are cheap,
 *    geometries are the budget).
 *
 * Palette: weathered board-and-batten siding (dusty gray-green), dark
 * timber trim, wood-shingle roof, stone foundation, warm glass — the
 * read of a small frontier law building, deliberately distinct from the
 * saloon's bright false-front and the bank's classical stone.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';

const CLAPBOARD_BASE = '#8a9078'; // weathered sage-gray siding
const CLAPBOARD_SHADOW = '#5f6653';
const PLANK_BASE = '#8f6a44'; // interior wood plank floor
const PLANK_GRAIN = '#5f4128';
const SHINGLE_BASE = '#4c4038'; // weathered wood shingles
const SHINGLE_SHADOW = '#332b26';
const STONE_BASE = '#8d8578';
const STONE_MORTAR = '#6a635a';
const TRIM_PAINT = '#3d4a3a'; // dark forest trim (door casings, sashes)
const IRON_BASE = '#232323';
const IRON_RUST = '#4f3520';
const PAPER_BASE = '#e6d9b8';

export const SHERIFF_PALETTE = Object.freeze({
  clapboard: CLAPBOARD_BASE,
  trim: TRIM_PAINT,
  plank: PLANK_BASE,
  shingle: SHINGLE_BASE,
  stone: STONE_BASE,
  iron: IRON_BASE,
  paper: PAPER_BASE,
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

/**
 * Memoize a texture generator. Materials stay FRESH per object (the
 * renderer's dispose path owns material lifetimes), but the expensive
 * <canvas> texture generation runs exactly ONCE per process — the sheriff
 * block creates ~40 objects and every one of them used to re-paint the
 * full texture set at boot. Sharing CanvasTextures across materials is
 * dispose-safe: material.dispose() never disposes its textures.
 */
function memoTex(fn: () => THREE.CanvasTexture | null): () => THREE.CanvasTexture | null {
  let cache: THREE.CanvasTexture | null | undefined;
  return () => {
    if (cache === undefined) cache = fn();
    return cache;
  };
}

/** Horizontal clapboard siding: stacked boards with shadow lines and grain. */
function genClapboard(): THREE.CanvasTexture | null {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = CLAPBOARD_BASE;
  ctx.fillRect(0, 0, 256, 256);
  const seed = { v: 41 };
  const boardH = 32;
  for (let y = 0; y < 256; y += boardH) {
    // per-board brightness variation
    ctx.fillStyle = `rgba(${Math.round(rand(seed) * 40)},${Math.round(rand(seed) * 36)},${Math.round(rand(seed) * 30)},0.18)`;
    ctx.fillRect(0, y, 256, boardH);
    // shadow gap line at each board bottom
    ctx.fillStyle = 'rgba(20,24,18,0.55)';
    ctx.fillRect(0, y + boardH - 4, 256, 4);
    // subtle top highlight
    ctx.fillStyle = 'rgba(255,255,245,0.14)';
    ctx.fillRect(0, y, 256, 2);
    // grain streaks
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = CLAPBOARD_SHADOW;
      ctx.lineWidth = 1;
      const gy = y + 6 + rand(seed) * (boardH - 12);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(256, gy + (rand(seed) - 0.5) * 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  return toTexture(canvas, 2, 2);
}

/** Wide interior floor planks with nail heads. */
function genPlank(): THREE.CanvasTexture | null {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = PLANK_BASE;
  ctx.fillRect(0, 0, 256, 256);
  const seed = { v: 77 };
  const plankW = 42;
  for (let x = 0; x < 256; x += plankW) {
    ctx.fillStyle = `rgba(${Math.round(rand(seed) * 50)},${Math.round(rand(seed) * 34)},${Math.round(rand(seed) * 22)},0.2)`;
    ctx.fillRect(x, 0, plankW, 256);
    ctx.strokeStyle = 'rgba(30,18,8,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + plankW - 1, 0);
    ctx.lineTo(x + plankW - 1, 256);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = PLANK_GRAIN;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1;
      const gy = rand(seed) * 256;
      ctx.beginPath();
      ctx.moveTo(x + 2, gy);
      ctx.bezierCurveTo(x + plankW * 0.3, gy + (rand(seed) - 0.5) * 8, x + plankW * 0.7, gy + (rand(seed) - 0.5) * 8, x + plankW - 2, gy);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // nail pairs at plank ends
    ctx.fillStyle = 'rgba(40,40,40,0.8)';
    ctx.beginPath();
    ctx.arc(x + 6, 20, 1.6, 0, Math.PI * 2);
    ctx.arc(x + 6, 236, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas, 3, 3);
}

/** Wood shingle roof: staggered courses with heavy shadow lines. */
function genShingle(): THREE.CanvasTexture | null {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = SHINGLE_BASE;
  ctx.fillRect(0, 0, 256, 256);
  const seed = { v: 93 };
  const courseH = 26;
  const shingleW = 34;
  for (let row = 0; row * courseH < 256 + courseH; row++) {
    const y = row * courseH;
    const offset = row % 2 === 0 ? 0 : shingleW / 2;
    for (let x = -shingleW; x < 256 + shingleW; x += shingleW) {
      const shade = 0.85 + rand(seed) * 0.35;
      ctx.fillStyle = `rgba(${Math.round(40 * shade)},${Math.round(34 * shade)},${Math.round(28 * shade)},0.85)`;
      ctx.fillRect(x + offset, y, shingleW - 2, courseH);
      ctx.fillStyle = SHINGLE_SHADOW;
      ctx.fillRect(x + offset, y + courseH - 5, shingleW - 2, 5);
    }
  }
  return toTexture(canvas, 5, 3);
}

/** Rough stone foundation blocks with mortar joints. */
function genStone(): THREE.CanvasTexture | null {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = STONE_MORTAR;
  ctx.fillRect(0, 0, 256, 256);
  const seed = { v: 55 };
  const rows = 5;
  const rowH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 0 ? 0 : 24;
    for (let x = -40 + offset; x < 256 + 40; x += 52) {
      const shade = 0.8 + rand(seed) * 0.4;
      ctx.fillStyle = `rgb(${Math.round(141 * shade)},${Math.round(133 * shade)},${Math.round(120 * shade)})`;
      ctx.fillRect(x + 2, r * rowH + 2, 48, rowH - 4);
      ctx.fillStyle = 'rgba(255,255,250,0.12)';
      ctx.fillRect(x + 2, r * rowH + 2, 48, 3);
    }
  }
  return toTexture(canvas, 3, 1);
}

/** Rusted iron for bars, stovepipe caps, window cages. */
function genIron(): THREE.CanvasTexture | null {
  const c = makeCanvas(128, 128);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = IRON_BASE;
  ctx.fillRect(0, 0, 128, 128);
  const seed = { v: 31 };
  for (let i = 0; i < 8; i++) {
    const x = rand(seed) * 128;
    const len = 128 * (0.25 + rand(seed) * 0.5);
    const grd = ctx.createLinearGradient(x, 0, x, len);
    grd.addColorStop(0, IRON_RUST);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = grd;
    ctx.fillRect(x - 2, 0, 4, len);
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, 1, 1);
}

/** Aged paper (sign plaques). */
function genPaper(): THREE.CanvasTexture | null {
  const c = makeCanvas(128, 128);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = PAPER_BASE;
  ctx.fillRect(0, 0, 128, 128);
  const seed = { v: 19 };
  for (let i = 0; i < 6; i++) {
    const x = rand(seed) * 128;
    const y = rand(seed) * 128;
    const r = 6 + rand(seed) * 16;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(120,95,55,0.2)');
    grd.addColorStop(1, 'rgba(120,95,55,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas, 1, 1);
}

function stdMat(colorHex: string, tex: THREE.CanvasTexture | null, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: tex ? 0xffffff : new THREE.Color(colorHex),
    map: tex ?? undefined,
    roughness: 0.85,
    metalness: 0.04,
    ...extra,
  });
}

export interface SheriffMaterials {
  /** Exterior board-and-batten siding (the unit-box walls). */
  clapboard: THREE.MeshStandardMaterial;
  /** Dark painted timber trim — casings, corner boards, posts, fascia. */
  trim: THREE.MeshStandardMaterial;
  /** Interior wood plank floor / porch deck / threshold. */
  plank: THREE.MeshStandardMaterial;
  /** Interior plank ceiling (darker, low-key). */
  plankDark: THREE.MeshStandardMaterial;
  /** Roof shingles (gable slabs + porch shed roof). */
  shingle: THREE.MeshStandardMaterial;
  /** Stone foundation skirt. */
  stone: THREE.MeshStandardMaterial;
  /** Iron (bar rails/headers, stovepipe flashing, window cages). */
  iron: THREE.MeshStandardMaterial;
  /** Aged paper/plaque ground (sign boards paint over it). */
  paper: THREE.MeshStandardMaterial;
  /** Window glass: faint reflective pane, NOT opaque. */
  glass: THREE.MeshStandardMaterial;
  /** Warm lit glass for the wall lanterns. */
  glassWarm: THREE.MeshStandardMaterial;
}


// Memoized texture accessors (generation runs once per process).
const clapboardTexture = memoTex(genClapboard);
const plankTexture = memoTex(genPlank);
const shingleTexture = memoTex(genShingle);
const stoneTexture = memoTex(genStone);
const ironTexture = memoTex(genIron);
const paperTexture = memoTex(genPaper);

/**
 * SHARED MATERIAL CACHE (weak-laptop perf revision). The old "call once per
 * builder invocation" contract multiplied identical sheriff materials across
 * every def; nothing mutates a sheriff material after creation, so the set
 * is a process-lifetime SINGLETON. Visual output is bit-identical.
 * Disposal contract (revised with ThreeRendererAdapter): shared materials are
 * NEVER disposed per-object — the adapter disposes geometries only.
 */
let sheriffMaterialsCache: SheriffMaterials | null = null;

export function createSheriffMaterials(): SheriffMaterials {
  if (!sheriffMaterialsCache) sheriffMaterialsCache = buildSheriffMaterials();
  return sheriffMaterialsCache;
}

function buildSheriffMaterials(): SheriffMaterials {
  return {
    clapboard: stdMat(CLAPBOARD_BASE, clapboardTexture()),
    trim: stdMat(TRIM_PAINT, null, { roughness: 0.7 }),
    plank: stdMat(PLANK_BASE, plankTexture()),
    plankDark: stdMat('#6d5236', plankTexture(), { roughness: 0.9 }),
    shingle: stdMat(SHINGLE_BASE, shingleTexture(), { roughness: 0.95 }),
    stone: stdMat(STONE_BASE, stoneTexture()),
    iron: stdMat(IRON_BASE, ironTexture(), { roughness: 0.55, metalness: 0.6 }),
    paper: stdMat(PAPER_BASE, paperTexture(), { roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#9fb6b8'),
      transparent: true,
      opacity: 0.32,
      roughness: 0.12,
      metalness: 0.2,
      emissive: new THREE.Color('#2c3a38'),
      emissiveIntensity: 0.35,
    }),
    glassWarm: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffd9a0'),
      transparent: true,
      opacity: 0.55,
      roughness: 0.15,
      emissive: new THREE.Color('#ffb45e'),
      emissiveIntensity: 0.9,
    }),
  };
}
