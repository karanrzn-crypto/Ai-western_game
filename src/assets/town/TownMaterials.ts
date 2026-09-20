/**
 * src/assets/town/TownMaterials.ts
 * -----------------------------------------------------------------------------
 * Shared TOWN palette + procedural textures + ONE process-lifetime material
 * cache (the saloon/stable/gunshop contract):
 *
 *   1. SINGLETON — nothing mutates a town material after creation, so the
 *      whole town (6 new buildings, ~50 fence sections, ~40 props, roads,
 *      vegetation) shares one material set; the adapter never disposes
 *      shared materials per object.
 *   2. TEXTURE MEMOIZATION — generators cache per argument key.
 *   3. HEADLESS SAFETY — every generator returns `null` without `document`
 *      (node:test) and the helpers emit flat-color materials.
 *
 * Biome target (user spec §1 + reference image): warm dusty frontier town —
 * yellowish compact dirt (NOT orange sand, NOT gray), olive/dry vegetation,
 * weathered gray-brown wood, the whole frame warm and hazy.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';

export const TOWN_PALETTE = Object.freeze({
  /** Compact dusty dirt (the reference-image ground tone). */
  dustLight: '#c9a96e',
  dustMid: '#b8955c',
  dustDark: '#a07f4c',
  road: '#a8844e',
  roadEdge: '#9a7a4a',
  plaza: '#bd9a60',
  water: '#5f7d6e',
  waterDeep: '#4a6355',
  /** Weathered construction wood (sun-bleached — the reference look). */
  woodDark: '#5e4630',
  woodMed: '#8a6a45',
  woodLight: '#a3855c',
  woodGray: '#97907c',
  plankShadow: '#55432c',
  roofShingle: '#7a654a',
  roofShingleDark: '#5f4d36',
  stone: '#8f8272',
  stoneDark: '#6f6455',
  canvas: '#cfc0a0',
  canvasStripe: '#8a5a34',
  /** Vegetation (olive/dry — sparse but alive). */
  leafOlive: '#6f7d44',
  leafOliveDark: '#5a6636',
  leafDry: '#96894f',
  grassDry: '#b5a266',
  crop: '#7d8748',
  bark: '#5a4632',
  /** Metalwork + props. */
  iron: '#33352f',
  ironLight: '#4d5049',
  barrel: '#7a5c38',
  barrelBand: '#4d4a44',
  hay: '#c2a556',
  horse: '#4f3a28',
  horseMane: '#2e2418',
  hide: '#8a6a48',
});

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

/* -------------------------------------------------------------------------- */
/* Memoized procedural textures                                               */
/* -------------------------------------------------------------------------- */

const textureCache = new Map<string, THREE.CanvasTexture | null>();

function cachedTexture(key: string, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 256): THREE.CanvasTexture | null {
  if (textureCache.has(key)) return textureCache.get(key)!;
  let texture: THREE.CanvasTexture | null = null;
  const surface = makeCanvas(w, h);
  if (surface) {
    draw(surface.ctx, w, h);
    texture = new THREE.CanvasTexture(surface.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  textureCache.set(key, texture);
  return texture;
}

/** Mottled dusty ground: light tan base + darker/lighter blotches + faint
 *  wheel-trail streaks. Tiles at 12 m per repeat (tiling stays subtle). */
export function dustyGroundTexture(): THREE.CanvasTexture | null {
  return cachedTexture('town-ground', (ctx, w, h) => {
    ctx.fillStyle = TOWN_PALETTE.dustLight;
    ctx.fillRect(0, 0, w, h);
    // large soft blotches (two tones) — the mottled compact-dirt read
    for (let i = 0; i < 90; i += 1) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 12 + Math.random() * 46;
      ctx.globalAlpha = 0.05 + Math.random() * 0.08;
      ctx.fillStyle = Math.random() > 0.5 ? TOWN_PALETTE.dustMid : TOWN_PALETTE.dustDark;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.5 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // faint wheel trails (two soft parallel streaks per trail)
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = TOWN_PALETTE.roadEdge;
    ctx.lineWidth = 7;
    for (let i = 0; i < 5; i += 1) {
      const y = Math.random() * h;
      const x0 = Math.random() * w;
      const len = 60 + Math.random() * 160;
      const drift = (Math.random() - 0.5) * 40;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.quadraticCurveTo(x0 + len / 2, y + drift, x0 + len, y + drift * 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, y + 16);
      ctx.quadraticCurveTo(x0 + len / 2, y + 16 + drift, x0 + len, y + 16 + drift * 0.4);
      ctx.stroke();
    }
    // sparse pebble specks
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 260; i += 1) {
      ctx.fillStyle = Math.random() > 0.5 ? TOWN_PALETTE.stone : TOWN_PALETTE.dustDark;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }, 512, 512);
}

/** Road strip: packed dirt slightly darker than the ground, wheel ruts,
 *  soft edges. UV contract (continuous-routes round): ribbon geometry maps
 *  u ∈ [0, 1] EXACTLY across the road width, so the darker u-edge bands land
 *  on the road's borders at ANY width — the strip reads as one worn road with
 *  soft shoulders instead of a hard-cut rectangle. */
export function roadTexture(): THREE.CanvasTexture | null {
  return cachedTexture('town-road', (ctx, w, h) => {
    ctx.fillStyle = TOWN_PALETTE.road;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i += 1) {
      const x = Math.random() * w;
      const r = 10 + Math.random() * 34;
      ctx.globalAlpha = 0.06 + Math.random() * 0.07;
      ctx.fillStyle = Math.random() > 0.45 ? TOWN_PALETTE.dustDark : TOWN_PALETTE.dustLight;
      ctx.beginPath();
      ctx.ellipse(x, Math.random() * h, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // two wheel ruts running the strip length (v axis)
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = TOWN_PALETTE.roadEdge;
    for (const rut of [0.3, 0.7]) {
      ctx.fillRect(w * rut - 5, 0, 9, h);
    }
    // soft shoulders: the u borders darken into the ground tone (worn edge)
    const edge = ctx.createLinearGradient(0, 0, w * 0.09, 0);
    edge.addColorStop(0, TOWN_PALETTE.roadEdge);
    edge.addColorStop(1, 'rgba(154,122,74,0)');
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w * 0.09, h);
    const edge2 = ctx.createLinearGradient(w, 0, w * 0.91, 0);
    edge2.addColorStop(0, TOWN_PALETTE.roadEdge);
    edge2.addColorStop(1, 'rgba(154,122,74,0)');
    ctx.fillStyle = edge2;
    ctx.fillRect(w * 0.91, 0, w * 0.09, h);
    ctx.globalAlpha = 1;
  }, 256, 256);
}

/** Weathered plank wall (vertical planks + grain streaks). */
export function plankTexture(base: string, dark: string, seed = 0): THREE.CanvasTexture | null {
  return cachedTexture(`town-plank-${base}-${seed}`, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const plankW = w / 8;
    for (let i = 0; i < 8; i += 1) {
      // plank separation + per-plank tone drift
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = dark;
      ctx.fillRect(i * plankW, 0, 1.5, h);
      ctx.globalAlpha = 0.08 + ((i * 37 + seed) % 10) * 0.012;
      ctx.fillStyle = i % 2 ? dark : '#000000';
      ctx.fillRect(i * plankW + 1.5, 0, plankW - 1.5, h);
      // grain streaks
      ctx.globalAlpha = 0.1;
      for (let g = 0; g < 5; g += 1) {
        const gx = i * plankW + 3 + Math.random() * (plankW - 6);
        ctx.fillRect(gx, Math.random() * h * 0.4, 1, h * (0.3 + Math.random() * 0.5));
      }
    }
    ctx.globalAlpha = 1;
  }, 256, 256);
}

/** Roof shingles (offset rows). */
export function shingleTexture(): THREE.CanvasTexture | null {
  return cachedTexture('town-shingle', (ctx, w, h) => {
    ctx.fillStyle = TOWN_PALETTE.roofShingle;
    ctx.fillRect(0, 0, w, h);
    const rowH = h / 8;
    for (let row = 0; row < 8; row += 1) {
      const offset = row % 2 ? rowH : 0;
      for (let col = -1; col < 8; col += 1) {
        const x = col * rowH * 2 + offset;
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = TOWN_PALETTE.roofShingleDark;
        ctx.fillRect(x, row * rowH, rowH * 2 - 2, rowH - 2);
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#000';
        ctx.fillRect(x, row * rowH + rowH - 3, rowH * 2 - 2, 3);
      }
    }
    ctx.globalAlpha = 1;
  }, 256, 256);
}

/** Painted board sign (planks + carved lettering). */
export function townSignTexture(text: string, paint = '#2e2418', base = '#a8865a'): THREE.CanvasTexture | null {
  return cachedTexture(`town-sign-${text}-${paint}-${base}`, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // plank lines
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#6d5136';
    for (let i = 1; i < 4; i += 1) ctx.fillRect(0, (h / 4) * i, w, 2);
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 30; i += 1) ctx.fillRect(Math.random() * w, 0, 1, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = paint;
    ctx.font = `bold ${Math.floor(h * 0.42)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  }, 256, 128);
}

/* -------------------------------------------------------------------------- */
/* Material set                                                               */
/* -------------------------------------------------------------------------- */

export interface TownMaterials {
  ground: THREE.MeshStandardMaterial;
  road: THREE.MeshStandardMaterial;
  plaza: THREE.MeshStandardMaterial;
  dirtPatch: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  woodMed: THREE.MeshStandardMaterial;
  woodLight: THREE.MeshStandardMaterial;
  woodGray: THREE.MeshStandardMaterial;
  plankA: THREE.MeshStandardMaterial;
  plankB: THREE.MeshStandardMaterial;
  plankC: THREE.MeshStandardMaterial;
  shingle: THREE.MeshStandardMaterial;
  shingleDark: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  stoneDark: THREE.MeshStandardMaterial;
  canvasAwning: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  ironLight: THREE.MeshStandardMaterial;
  barrel: THREE.MeshStandardMaterial;
  barrelBand: THREE.MeshStandardMaterial;
  hay: THREE.MeshStandardMaterial;
  leafOlive: THREE.MeshStandardMaterial;
  leafOliveDark: THREE.MeshStandardMaterial;
  leafDry: THREE.MeshStandardMaterial;
  grassDry: THREE.MeshStandardMaterial;
  crop: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  horse: THREE.MeshStandardMaterial;
  horseMane: THREE.MeshStandardMaterial;
  hide: THREE.MeshStandardMaterial;
  lanternGlass: THREE.MeshStandardMaterial;
  /** Painted cream siding (the wealthy house — residential, not commercial). */
  creamPaint: THREE.MeshStandardMaterial;
}

function std(color: number | string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.95, metalness: 0.02, ...opts });
}

export function createTownMaterials(): TownMaterials {
  const groundMap = dustyGroundTexture();
  const roadMap = roadTexture();
  const plankA = plankTexture(TOWN_PALETTE.woodMed, TOWN_PALETTE.plankShadow, 1);
  const plankB = plankTexture(TOWN_PALETTE.woodLight, TOWN_PALETTE.plankShadow, 2);
  const plankC = plankTexture(TOWN_PALETTE.woodGray, '#4a4438', 3);
  const shingleMap = shingleTexture();

  const materials: TownMaterials = {
    ground: groundMap
      ? std('#ffffff', { map: groundMap })
      : std(TOWN_PALETTE.dustLight),
    road: roadMap
      ? std('#ffffff', { map: roadMap })
      : std(TOWN_PALETTE.road),
    plaza: std(TOWN_PALETTE.plaza),
    dirtPatch: std(TOWN_PALETTE.dustDark),
    water: std(TOWN_PALETTE.water, { roughness: 0.35, metalness: 0.05 }),
    woodDark: std(TOWN_PALETTE.woodDark),
    woodMed: std(TOWN_PALETTE.woodMed),
    woodLight: std(TOWN_PALETTE.woodLight),
    woodGray: std(TOWN_PALETTE.woodGray),
    plankA: plankA ? std('#ffffff', { map: plankA }) : std(TOWN_PALETTE.woodMed),
    plankB: plankB ? std('#ffffff', { map: plankB }) : std(TOWN_PALETTE.woodLight),
    plankC: plankC ? std('#ffffff', { map: plankC }) : std(TOWN_PALETTE.woodGray),
    shingle: shingleMap ? std('#ffffff', { map: shingleMap }) : std(TOWN_PALETTE.roofShingle),
    shingleDark: std(TOWN_PALETTE.roofShingleDark),
    stone: std(TOWN_PALETTE.stone),
    stoneDark: std(TOWN_PALETTE.stoneDark),
    canvasAwning: std(TOWN_PALETTE.canvas),
    iron: std(TOWN_PALETTE.iron, { roughness: 0.6, metalness: 0.5 }),
    ironLight: std(TOWN_PALETTE.ironLight, { roughness: 0.55, metalness: 0.5 }),
    barrel: std(TOWN_PALETTE.barrel),
    barrelBand: std(TOWN_PALETTE.barrelBand, { roughness: 0.5, metalness: 0.4 }),
    hay: std(TOWN_PALETTE.hay),
    leafOlive: std(TOWN_PALETTE.leafOlive),
    leafOliveDark: std(TOWN_PALETTE.leafOliveDark),
    leafDry: std(TOWN_PALETTE.leafDry),
    grassDry: std(TOWN_PALETTE.grassDry),
    crop: std(TOWN_PALETTE.crop),
    bark: std(TOWN_PALETTE.bark),
    horse: std(TOWN_PALETTE.horse),
    horseMane: std(TOWN_PALETTE.horseMane),
    hide: std(TOWN_PALETTE.hide),
    lanternGlass: std('#ffd98a', { emissive: new THREE.Color('#b4762a'), emissiveIntensity: 0.55, roughness: 0.4 }),
    creamPaint: std('#d9cdae', { roughness: 0.9 }),
  };
  return materials;
}

/** Process-lifetime singleton (weak-laptop perf contract). */
let townMaterialsSingleton: TownMaterials | null = null;
export function getTownMaterials(): TownMaterials {
  if (!townMaterialsSingleton) townMaterialsSingleton = createTownMaterials();
  return townMaterialsSingleton;
}
