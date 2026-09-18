/**
 * src/assets/gunshop/GunShopMaterials.ts
 * -----------------------------------------------------------------------------
 * Shared Gun Shop PALETTE + procedural textures + ONE material cache.
 *
 * Adapted from the user's GunShopAssetFactory.ts: the procedural canvas
 * texture generators (wood grain, blued steel, grip checkering, felt, printed
 * ammo labels, painted signs) are kept nearly verbatim as the VISUAL source,
 * with three architectural changes demanded by the real project:
 *
 *   1. PROCESS-LIFETIME SINGLETON (weak-laptop perf contract): the user file
 *      created fresh materials AND fresh canvases per builder call — the same
 *      churn the saloon/stable modules measured at 1334 unique materials
 *      before their caches. Nothing mutates a gun-shop material after
 *      creation, so the set is one shared instance (createGunShopMaterials()).
 *      Disposal contract (ThreeRendererAdapter, revised): shared materials are
 *      NEVER disposed per-object — the adapter disposes geometries only.
 *   2. TEXTURE MEMOIZATION — each generator caches per argument key, so 16
 *      shelf ammo boxes of one caliber share ONE canvas texture.
 *   3. HEADLESS SAFETY — every generator falls back to `null` when `document`
 *      is missing (node:test); the material helpers then emit flat-color
 *      materials. Identical contract to the user file, kept.
 *
 * Perf rules honoured here (weak-laptop pattern):
 *   - castShadow is decided by the SIZE FLOOR in GunShopProps helpers, not here.
 *   - Opaque "glass" where transparency is not required; the display-case lid
 *     and the door window are the only genuinely transparent surfaces.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';

/* -------------------------------------------------------------------------- */
/* Palette (from the user file, kept as the visual source)                    */
/* -------------------------------------------------------------------------- */

export const GUNSHOP_PALETTE = Object.freeze({
  woodDark: '#3f2716',
  woodMed: '#6b4226',
  woodTrim: '#8a5a34',
  woodGrip: '#5a3a22',
  steel: '#2b2e33',
  steelLight: '#4a4e56',
  brass: '#b08d3d',
  brassDark: '#7a5f27',
  leather: '#4a2f1a',
  feltRed: '#5a1620',
  parchment: '#e8dcc0',
  bone: '#e2d8bf',
  rope: '#c9b183',
  glassTint: 0xdfeef2,
});

/* -------------------------------------------------------------------------- */
/* Headless-safe canvas texture generators (user file, memoized)              */
/* -------------------------------------------------------------------------- */

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

/** Memoization: one canvas per logical texture (the shop repeats parts a lot). */
const texCache = new Map<string, THREE.CanvasTexture | null>();
function memoized(key: string, gen: () => THREE.CanvasTexture | null): THREE.CanvasTexture | null {
  if (!texCache.has(key)) texCache.set(key, gen());
  return texCache.get(key) ?? null;
}

export function woodTexture(base: string = GUNSHOP_PALETTE.woodMed, grain: string = GUNSHOP_PALETTE.woodDark, size = 256): THREE.CanvasTexture | null {
  return memoized(`wood|${base}|${grain}|${size}`, () => {
    const c = makeCanvas(size, size);
    if (!c) return null;
    const { canvas, ctx } = c;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const seed = { v: 33 };
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
    ctx.globalAlpha = 1;
    return toTexture(canvas, 2, 2);
  });
}

/** Dark blued-steel with faint brushed highlight streaks. */
export function steelTexture(base: string = GUNSHOP_PALETTE.steel, size = 128): THREE.CanvasTexture | null {
  return memoized(`steel|${base}|${size}`, () => {
    const c = makeCanvas(size, size);
    if (!c) return null;
    const { canvas, ctx } = c;
    const grd = ctx.createLinearGradient(0, 0, size, 0);
    grd.addColorStop(0, base);
    grd.addColorStop(0.5, GUNSHOP_PALETTE.steelLight);
    grd.addColorStop(1, base);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    const seed = { v: 71 };
    for (let y = 0; y < size; y += 2) {
      ctx.strokeStyle = rand(seed) > 0.5 ? '#1a1c1f' : '#5a5e66';
      ctx.globalAlpha = 0.06 + rand(seed) * 0.08;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return toTexture(canvas, 1, 1);
  });
}

/** Fine wood-grip checkering (diamond crosshatch) for pistol/rifle grips. */
export function checkeringTexture(base: string = GUNSHOP_PALETTE.woodGrip, size = 96): THREE.CanvasTexture | null {
  return memoized(`check|${base}|${size}`, () => {
    const c = makeCanvas(size, size);
    if (!c) return null;
    const { canvas, ctx } = c;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    const step = size / 10;
    for (let i = -10; i <= 20; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step - size, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step + size, size);
      ctx.stroke();
    }
    return toTexture(canvas, 1, 1);
  });
}

/** Deep felt lining for a display case. */
export function feltTexture(base: string = GUNSHOP_PALETTE.feltRed, size = 128): THREE.CanvasTexture | null {
  return memoized(`felt|${base}|${size}`, () => {
    const c = makeCanvas(size, size);
    if (!c) return null;
    const { canvas, ctx } = c;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const seed = { v: 19 };
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = rand(seed) > 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(rand(seed) * size, rand(seed) * size, 1, 1);
    }
    return toTexture(canvas, 1, 1);
  });
}

/** Small printed ammo-box label (memoized per caliber + brand). */
export function ammoLabelTexture(caliber: string, brand = 'FRONTIER ARMS CO.'): THREE.CanvasTexture | null {
  return memoized(`ammo|${caliber}|${brand}`, () => {
    const w = 220;
    const h = 140;
    const c = makeCanvas(w, h);
    if (!c) return null;
    const { canvas, ctx } = c;
    ctx.fillStyle = '#d8c79c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2a2016';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#2a2016';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 26px Georgia, serif';
    ctx.fillText(caliber, w / 2, h * 0.38);
    ctx.font = '13px Georgia, serif';
    ctx.fillText(brand, w / 2, h * 0.62);
    ctx.font = 'bold 15px Georgia, serif';
    ctx.fillText('20 CARTRIDGES', w / 2, h * 0.82);
    return toTexture(canvas, 1, 1);
  });
}

/** Painted sign / plaque text, shared style (memoized per text+style). */
export function signTexture(opts: {
  text: string;
  sub?: string;
  bg?: string;
  fg?: string;
  w?: number;
  h?: number;
  font?: string;
  border?: boolean;
}): THREE.CanvasTexture | null {
  const key = `sign|${opts.text}|${opts.sub ?? ''}|${opts.bg ?? ''}|${opts.fg ?? ''}|${opts.w ?? 0}|${opts.h ?? 0}|${opts.font ?? ''}|${opts.border === false ? 0 : 1}`;
  return memoized(key, () => {
    const { text, sub, bg = GUNSHOP_PALETTE.parchment, fg = '#2a2016', w = 512, h = 256, border = true } = opts;
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
    ctx.font = opts.font ?? `bold ${Math.floor(h * 0.3)}px Georgia, serif`;
    ctx.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) {
      ctx.font = `${Math.floor(h * 0.13)}px Georgia, serif`;
      ctx.fillText(sub, w / 2, h * 0.72);
    }
    return toTexture(canvas, 1, 1);
  });
}

/* -------------------------------------------------------------------------- */
/* Material set                                                               */
/* -------------------------------------------------------------------------- */

function stdMat(colorHex: string, tex: THREE.CanvasTexture | null, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color: tex ? 0xffffff : new THREE.Color(colorHex),
    ...(tex ? { map: tex } : {}),
    roughness: 0.8,
    metalness: 0.05,
    ...extra,
  });
}

function metalMat(colorHex: string, tex: THREE.CanvasTexture | null, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color: tex ? 0xffffff : new THREE.Color(colorHex),
    ...(tex ? { map: tex } : {}),
    roughness: 0.3,
    metalness: 0.85,
    ...extra,
  });
}

export interface GunShopMaterials {
  woodDark: THREE.MeshStandardMaterial;
  woodMed: THREE.MeshStandardMaterial;
  woodTrim: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  steelDark: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  brassDark: THREE.MeshStandardMaterial;
  grip: THREE.MeshStandardMaterial;
  bone: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  felt: THREE.MeshStandardMaterial;
  parchment: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial;
  /** Emissive flame chip — the lantern glow without adding light cost. */
  flame: THREE.MeshStandardMaterial;
  /** Display-case lid: genuinely transparent (the ONLY transparent surface). */
  glass: THREE.MeshStandardMaterial;
  /** Facade/window "glass": OPAQUE dark (panes must never vanish). */
  glassDark: THREE.MeshStandardMaterial;
  /** Paper label surface for ammo boxes. */
  label: THREE.MeshStandardMaterial;
}

function buildGunShopMaterials(): GunShopMaterials {
  return {
    woodDark: stdMat(GUNSHOP_PALETTE.woodDark, woodTexture(GUNSHOP_PALETTE.woodDark, '#20120a')),
    woodMed: stdMat(GUNSHOP_PALETTE.woodMed, woodTexture(GUNSHOP_PALETTE.woodMed, GUNSHOP_PALETTE.woodDark)),
    woodTrim: stdMat(GUNSHOP_PALETTE.woodTrim, woodTexture(GUNSHOP_PALETTE.woodTrim, GUNSHOP_PALETTE.woodMed)),
    steel: metalMat(GUNSHOP_PALETTE.steel, steelTexture(), { roughness: 0.35 }),
    steelDark: metalMat('#1c1e21', steelTexture('#1c1e21'), { roughness: 0.4 }),
    brass: metalMat(GUNSHOP_PALETTE.brass, steelTexture(GUNSHOP_PALETTE.brass), { roughness: 0.35 }),
    brassDark: metalMat(GUNSHOP_PALETTE.brassDark, steelTexture(GUNSHOP_PALETTE.brassDark), { roughness: 0.4 }),
    grip: stdMat(GUNSHOP_PALETTE.woodGrip, checkeringTexture(), { roughness: 0.7 }),
    bone: stdMat(GUNSHOP_PALETTE.bone, null, { roughness: 0.6 }),
    leather: stdMat(GUNSHOP_PALETTE.leather, null, { roughness: 0.7 }),
    felt: stdMat(GUNSHOP_PALETTE.feltRed, feltTexture(), { roughness: 0.95, metalness: 0 }),
    parchment: stdMat(GUNSHOP_PALETTE.parchment, null, { roughness: 1 }),
    rope: stdMat(GUNSHOP_PALETTE.rope, null, { roughness: 0.9 }),
    flame: new THREE.MeshStandardMaterial({
      color: 0xffb066,
      emissive: 0xffb066,
      emissiveIntensity: 1.6,
      roughness: 0.6,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: GUNSHOP_PALETTE.glassTint,
      transparent: true,
      opacity: 0.16,
      roughness: 0.05,
      metalness: 0.1,
    }),
    glassDark: new THREE.MeshStandardMaterial({
      color: 0x1c2a33,
      roughness: 0.15,
      metalness: 0.55,
    }),
    label: stdMat('#d8c79c', null, { roughness: 0.85 }),
  };
}

/**
 * SHARED MATERIAL CACHE (see the module header): one process-lifetime set.
 * Every gun-shop builder takes its materials from here, so the whole shop
 * shares ~17 material instances no matter how many props it builds.
 */
let gunShopMaterialsCache: GunShopMaterials | null = null;

export function createGunShopMaterials(): GunShopMaterials {
  if (!gunShopMaterialsCache) gunShopMaterialsCache = buildGunShopMaterials();
  return gunShopMaterialsCache;
}
