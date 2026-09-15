/**
 * src/assets/bank/BankMaterials.ts
 * -----------------------------------------------------------------------------
 * Shared bank EXTERIOR palette + per-object material sets.
 *
 * Disposal contract (mirrors SaloonMaterials): ThreeRendererAdapter
 * .disposeObject3D() disposes every material found in a managed object's
 * subtree, so materials are created PER FACTORY CALL (createBankMaterials())
 * and shared only WITHIN one produced object — never as cross-object
 * module singletons.
 *
 * Visual language (user spec §C):
 *   aged brick + cream stone + walnut + aged brass + dark iron,
 *   weathered but maintained. Procedural canvas textures (same
 *   headless-safe fallback pattern as BankInteriorAssetFactory: no DOM →
 *   flat color) give the masonry its aged read without any external assets.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';

export const BANK_PALETTE = Object.freeze({
  /** Aged brick body — warm, slightly faded red-brown. */
  brick: 0x8a5a48,
  brickDark: 0x6e4536,
  /** Mortar joints between bricks. */
  mortar: 0xb8ab94,
  /** Pale cream stone — columns, trims, cornices, quoins, steps. */
  stoneCream: 0xd8cdb4,
  stoneCreamDark: 0xbfb298,
  /** Dark walnut entrance doors. */
  walnut: 0x3f2a18,
  walnutLight: 0x5a3d24,
  /** Aged brass (sign letters, door handles). */
  brass: 0xb08d3d,
  brassDark: 0x7a5f27,
  iron: 0x2b2b2b,
  /** Near-black window glass with a cold reflectivity. */
  glassDark: 0x16211f,
  /** Interior flagstone floor (cream, large flags). */
  floorStone: 0xcfc4ab,
  /** Gold leaf for the BANK frieze letters. */
  gold: 0xc9a75a,
  /** Roof slab (tar + gravel read). */
  roof: 0x4a423a,
});

export interface BankMaterials {
  brick: THREE.MeshStandardMaterial;
  brickDark: THREE.MeshStandardMaterial;
  stoneCream: THREE.MeshStandardMaterial;
  stoneCreamDark: THREE.MeshStandardMaterial;
  walnut: THREE.MeshStandardMaterial;
  walnutLight: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  brassDark: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  glassDark: THREE.MeshStandardMaterial;
  floorStone: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
}

// ---------------------------------------------------------------------------
// Procedural canvas texture generators (headless-safe: null → flat color)
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

function toTexture(canvas: HTMLCanvasElement, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Deterministic tiny PRNG so every builder call ages the wall identically. */
function rand(seed: { v: number }): number {
  seed.v = (seed.v * 9301 + 49297) % 233280;
  return seed.v / 233280;
}

/**
 * Aged brick: 4 courses × 2 stretcher bricks per canvas tile, mortar joints,
 * per-brick tone variation and faint weathering streaks. `repeat` should be
 * roughly (faceWidthMeters / 1.0, faceHeightMeters / 0.6) so a brick module
 * lands near 0.5 × 0.15 m.
 */
function brickTexture(repeatX: number, repeatY: number, size = 256): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = '#b0a28c';
  ctx.fillRect(0, 0, size, size);
  const courses = 4;
  const perCourse = 2; // stretcher bond: 2 bricks per row on the tile
  const brickH = size / courses;
  const brickW = size / perCourse;
  const seed = { v: 13 };
  for (let row = 0; row < courses; row += 1) {
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    for (let col = -1; col <= perCourse; col += 1) {
      const x = col * brickW + offset;
      const tone = rand(seed);
      const base = 0.82 + tone * 0.36; // per-brick brightness variation
      const r = Math.min(255, Math.round(138 * base));
      const g = Math.min(255, Math.round(90 * base + tone * 8));
      const b = Math.min(255, Math.round(72 * base));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      // 3px mortar joint
      ctx.fillRect(x + 2, row * brickH + 2, brickW - 4, brickH - 4);
      // subtle top-edge highlight / bottom shadow per brick (aged hand-mold)
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x + 2, row * brickH + 2, brickW - 4, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.fillRect(x + 2, (row + 1) * brickH - 4, brickW - 4, 2);
    }
  }
  // weathering streaks — faint dark runs below a few joints
  for (let i = 0; i < 7; i += 1) {
    const x = rand(seed) * size;
    const y = rand(seed) * size;
    const grd = ctx.createLinearGradient(x, y, x, y + size * 0.3);
    grd.addColorStop(0, 'rgba(40,25,15,0.16)');
    grd.addColorStop(1, 'rgba(40,25,15,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, 3 + rand(seed) * 5, size * 0.3);
  }
  return toTexture(canvas, repeatX, repeatY);
}

/**
 * Cream stone: pale limestone with speckle and faint masons' tooling lines.
 */
function stoneTexture(repeatX: number, repeatY: number, size = 256): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = '#d8cdb4';
  ctx.fillRect(0, 0, size, size);
  const seed = { v: 29 };
  for (let i = 0; i < 900; i += 1) {
    const x = rand(seed) * size;
    const y = rand(seed) * size;
    const tone = rand(seed);
    ctx.fillStyle = tone > 0.5 ? 'rgba(120,105,80,0.10)' : 'rgba(255,250,235,0.10)';
    ctx.fillRect(x, y, 1 + rand(seed) * 2, 1 + rand(seed) * 2);
  }
  // faint horizontal tooling lines
  for (let i = 0; i < 5; i += 1) {
    ctx.strokeStyle = 'rgba(110,98,74,0.08)';
    ctx.lineWidth = 1;
    const y = rand(seed) * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (rand(seed) - 0.5) * 6);
    ctx.stroke();
  }
  return toTexture(canvas, repeatX, repeatY);
}

/**
 * Interior flagstone floor: large cream flags with darker grout grid.
 * One canvas tile = one 1.2 m flag; repeat = (w/1.2, d/1.2).
 */
function flagstoneTexture(repeatX: number, repeatY: number, size = 256): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = '#8f8672';
  ctx.fillRect(0, 0, size, size);
  const seed = { v: 47 };
  for (let i = 0; i < 500; i += 1) {
    const x = rand(seed) * size;
    const y = rand(seed) * size;
    const tone = rand(seed);
    const base = 0.86 + tone * 0.2;
    ctx.fillStyle = `rgba(${Math.round(207 * base)},${Math.round(196 * base)},${Math.round(171 * base)},0.9)`;
    ctx.fillRect(x, y, 2 + rand(seed) * 4, 2 + rand(seed) * 4);
  }
  // grout cross at the tile edges
  ctx.strokeStyle = 'rgba(60,52,38,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);
  return toTexture(canvas, repeatX, repeatY);
}

/** Walnut door leaves: vertical grain + panel-ready dark base. */
function walnutTexture(size = 256): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = '#3f2a18';
  ctx.fillRect(0, 0, size, size);
  const seed = { v: 61 };
  for (let i = 0; i < 30; i += 1) {
    const x = (i / 30) * size + (rand(seed) - 0.5) * 5;
    ctx.strokeStyle = rand(seed) > 0.5 ? '#2c1c0e' : '#54382a';
    ctx.globalAlpha = 0.14 + rand(seed) * 0.2;
    ctx.lineWidth = 1 + rand(seed) * 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= size; y += 16) {
      ctx.lineTo(x + Math.sin(y * 0.04 + i) * 3 + (rand(seed) - 0.5) * 3, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, 1, 1);
}

// ---------------------------------------------------------------------------
// Material set (per produced object — disposal contract)
// ---------------------------------------------------------------------------

const std = (color: number, roughness = 0.8, metalness = 0.04): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

export function createBankMaterials(): BankMaterials {
  return {
    brick: new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02 }),
    brickDark: std(BANK_PALETTE.brickDark, 0.85, 0.02),
    stoneCream: new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.02 }),
    stoneCreamDark: std(BANK_PALETTE.stoneCreamDark, 0.75, 0.02),
    walnut: new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }),
    walnutLight: std(BANK_PALETTE.walnutLight, 0.6, 0.05),
    brass: new THREE.MeshStandardMaterial({ color: BANK_PALETTE.brass, roughness: 0.32, metalness: 0.85 }),
    brassDark: new THREE.MeshStandardMaterial({ color: BANK_PALETTE.brassDark, roughness: 0.4, metalness: 0.8 }),
    iron: new THREE.MeshStandardMaterial({ color: BANK_PALETTE.iron, roughness: 0.45, metalness: 0.75 }),
    glassDark: new THREE.MeshStandardMaterial({
      color: BANK_PALETTE.glassDark,
      roughness: 0.2,
      metalness: 0.3,
      // Faint cold sheen so panes read as DARK GLASS in every light (spec:
      // "not black rectangles") — sun by day, gas lamps by night.
      emissive: new THREE.Color(0x0e1a17),
      emissiveIntensity: 0.65,
    }),
    floorStone: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.03 }),
    // Aged gold leaf: half-metal so the frieze letters stay READABLE gold in
    // shade (a full 0.9-metal surface has no envmap to reflect and renders
    // near-black, which killed the BANK sign read).
    gold: new THREE.MeshStandardMaterial({ color: BANK_PALETTE.gold, roughness: 0.42, metalness: 0.5 }),
    roof: std(BANK_PALETTE.roof, 0.95, 0.0),
  };
}

export { brickTexture, stoneTexture, flagstoneTexture, walnutTexture };
