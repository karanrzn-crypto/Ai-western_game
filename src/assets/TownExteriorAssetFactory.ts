/**
 * src/assets/TownExteriorAssetFactory.ts
 * ------------------------------------------------------------------
 * EXTERIOR-ONLY visual (mesh) objects for a Wild West town street:
 * a butcher's stall and five structurally distinct house facades,
 * plus the small reusable yard props. No interiors anywhere — every
 * building is a hollow-looking shell (walls + roof + porch +
 * surface-mounted doors/windows), matching the brief that players
 * never go inside.
 *
 * INTEGRATED INTO THE REAL ASSET ARCHITECTURE (review revision):
 *  • SCALE — rescaled around the real 1.83 m player: doors are now
 *    2.0–2.2 m tall (the draft's 1.05–1.4 m doors were chest-height
 *    "toy" doors), windows carry real sills, wall heights 2.75–4.4 m,
 *    and the wealthy/family/farm/worker footprints genuinely differ.
 *  • SHARED CACHES — module-level texture + material caches (same
 *    convention as SaloonMaterials): a texture canvas is painted ONCE
 *    per distinct parameter set, and materials are shared across every
 *    building. The MergeStatic pass buckets by material, so shared
 *    materials → fewer buckets → fewer draw calls. No per-mesh canvas
 *    painting, no per-instance material duplicates.
 *  • DETERMINISM — every formerly Math.random() scatter (firewood,
 *    weeds, patch planks, hide spots) uses the seeded LCG, so builds
 *    are bit-for-bit reproducible (tests + stable screenshots).
 *  • ROOF GEOMETRY — porch shed roofs now slope the right way (high at
 *    the wall, low at the street — the draft's rotation.y = π built
 *    them backwards), the butcher awning's low edge lands exactly on
 *    its scallop line, the farmhouse chimney is seated INTO the roof
 *    slope instead of floating, and gable-end infills are buried 15 mm
 *    below the wall top (overlap, never coplanar — the house
 *    anti-z-fighting rule).
 *  • COLLISION — TOWN_EXTERIOR_COLLIDERS ships exact local composite
 *    boxes ({ boxes: [{ size, offset }] }) per placeable building for
 *    the metadata-driven CollisionWorld: one tight body box per shell
 *    house (players must NOT walk behind/into interior-less models),
 *    back/side/counter boxes for the open-front stall, body + shed for
 *    the farmstead. Nothing oversized (wall height only — no roof slab
 *    blocking the air above the street).
 *  • REGISTRY — registerTownExteriorFactories() registers every type
 *    below with the REAL AssetRegistry. Factories do NOT apply the
 *    def transform (the renderer adapter owns transforms).
 *
 * Headless-safe: every canvas generator falls back to a flat-color
 * material when `document` doesn't exist (node:test path).
 *
 * ASSET TYPES
 * ------------------------------------------------------------------
 *   "butcher-stall"    open-front stall: awning, counter, hanging meat,
 *                      hides, balance scale, cleavers, price board, blood
 *   "house-worker"     small one-story wood house, plain gable, tiny stoop
 *   "house-family"     stone-and-wood house, wide railed porch, chimney
 *   "house-wealthy"    two-story townhouse, stone base, columns, balcony,
 *                      cross-gable + cupola, lanterns
 *   "house-farmstead"  tall barn-roofed farmhouse, lean-to shed, fenced
 *                      yard, water trough, firewood
 *   "house-abandoned"  decayed shell: broken/boarded windows, patch
 *                      planks, crooked roof panel, sagging stub, weeds
 *   "wood-crate" / "barrel-prop" / "firewood-stack" / "animal-hide" /
 *   "hanging-meat-cut" / "weed-clump" / "fence-section" / "water-trough"
 *   "town-exterior-scene"  preview layout of all six buildings (kit;
 *                      place buildings as individual defs for colliders)
 * ------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { AssetRegistry } from './AssetRegistry.js';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const WOOD_FRESH = '#8a5a34';
const WOOD_FRESH_GRAIN = '#5a3a20';
const WOOD_WORN = '#6b5030';
const WOOD_WORN_GRAIN = '#3f2e18';
const WOOD_ROT = '#5c5348';
const WOOD_ROT_GRAIN = '#332e26';
const TRIM_DARK = '#2f2013';
const TRIM_WHITE = '#d8d0bc';
const ROOF_WOOD = '#4a3a2a';
const ROOF_WOOD_GRAIN = '#2a2016';
const STONE = '#8f897c';
const MORTAR = '#5c584e';
const FABRIC_CREAM = '#e2d3a8';
const FABRIC_RED = '#7a2b24';
const HIDE_BROWN = '#7a5636';
const HIDE_CREAM = '#d8c8a0';
const MEAT_RED = '#9c3b34';
const MEAT_FAT = '#e6d6bd';
const IRON = '#232323';
const WEED_GREEN = '#6f7a3d';
const WEED_DRY = '#a89654';
const GLASS_TINT = '#cfe0e6';
const BRASS = '#b08d3d';
const BLOOD_DARK = '#4a1512';

// ---------------------------------------------------------------------------
// Deterministic RNG — every scatter is seeded; builds are reproducible.
// ---------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  let v = seed % 233280;
  if (v <= 0) v += 233280;
  return () => {
    v = (v * 9301 + 49297) % 233280;
    return v / 233280;
  };
}

// ---------------------------------------------------------------------------
// Procedural canvas textures — painted ONCE per distinct parameter set,
// cached module-level (headless: cached null → flat-color materials).
// ---------------------------------------------------------------------------

const HAS_DOM = typeof document !== 'undefined';

const textureCache = new Map<string, THREE.CanvasTexture | null>();

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

function cachedTexture(key: string, paint: () => THREE.CanvasTexture | null): THREE.CanvasTexture | null {
  if (textureCache.has(key)) return textureCache.get(key)!;
  const tex = paint();
  textureCache.set(key, tex);
  return tex;
}

function shadeColor(hex: string, factor: number): string {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * factor));
  return `rgb(${r},${g},${b})`;
}

/** Wood plank texture with a `wear` knob (0 = fresh paint, 1 = neglected). */
function woodTexture(base: string, grain: string, wear: number, size = 256, seedBase = 40): THREE.CanvasTexture | null {
  const key = `wood|${base}|${grain}|${wear.toFixed(2)}|${size}|${seedBase}`;
  return cachedTexture(key, () => {
    const c = makeCanvas(size, size);
    if (!c) return null;
    const { canvas, ctx } = c;
    const rng = makeRng(seedBase);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const grainLines = 22;
    for (let i = 0; i < grainLines; i++) {
      const y = (i / grainLines) * size + (rng() - 0.5) * 6;
      ctx.strokeStyle = grain;
      ctx.globalAlpha = (0.12 + rng() * 0.2) * (0.7 + wear * 0.6);
      ctx.lineWidth = 1 + rng() * 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 3 + (rng() - 0.5) * 4);
      }
      ctx.stroke();
    }
    // plank seams
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = grain;
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      const x = (i / 4) * size;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    // weathering blotches / stains, scaled by wear
    const blotchCount = Math.round(2 + wear * 10);
    for (let i = 0; i < blotchCount; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 8 + rng() * 26;
      const dark = rng() > 0.5;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, dark ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.16)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5 + wear * 0.3;
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // thin crack lines for heavily worn wood
    if (wear > 0.55) {
      const crackCount = Math.round((wear - 0.5) * 12);
      ctx.strokeStyle = 'rgba(15,10,5,0.5)';
      ctx.lineWidth = 1;
      for (let i = 0; i < crackCount; i++) {
        let x = rng() * size;
        let y = rng() * size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
          x += (rng() - 0.5) * 18;
          y += (rng() - 0.5) * 18;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    return toTexture(canvas, 2, 2);
  });
}

function stoneTexture(base = STONE, mortar = MORTAR, size = 256): THREE.CanvasTexture | null {
  const key = `stone|${base}|${mortar}|${size}`;
  return cachedTexture(key, () => {
    const c = makeCanvas(size, size);
    if (!c) return null;
    const { canvas, ctx } = c;
    const rng = makeRng(51);
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, size, size);
    const rows = 6;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 === 0 ? 0 : rowH * 0.6;
      const stoneCount = 4;
      const stoneW = size / stoneCount;
      for (let s = -1; s < stoneCount + 1; s++) {
        const x = s * stoneW + offset;
        const y = r * rowH;
        const shade = 0.85 + rng() * 0.3;
        ctx.fillStyle = shadeColor(base, shade);
        ctx.fillRect(x + 2, y + 2, stoneW - 4, rowH - 4);
      }
    }
    return toTexture(canvas, 1.5, 1.5);
  });
}

function fabricStripeTexture(colorA = FABRIC_CREAM, colorB = FABRIC_RED, size = 128): THREE.CanvasTexture | null {
  const key = `fabric|${colorA}|${colorB}|${size}`;
  return cachedTexture(key, () => {
    const c = makeCanvas(size, size);
    if (!c) return null;
    const { canvas, ctx } = c;
    const rng = makeRng(77);
    const stripes = 8;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
      ctx.fillRect((i / stripes) * size, 0, size / stripes, size);
    }
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000000';
    for (let i = 0; i < 300; i++) {
      ctx.fillRect(rng() * size, rng() * size, 1, 1);
    }
    ctx.globalAlpha = 1;
    return toTexture(canvas, 3, 1);
  });
}

function hideTexture(base = HIDE_CREAM, spot = HIDE_BROWN, seed = 63, size = 200): THREE.CanvasTexture | null {
  const key = `hide|${base}|${spot}|${seed}|${size}`;
  return cachedTexture(key, () => {
    const c = makeCanvas(size, size);
    if (!c) return null;
    const { canvas, ctx } = c;
    const rng = makeRng(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = spot;
      ctx.globalAlpha = 0.7;
      const x = rng() * size;
      const y = rng() * size;
      ctx.beginPath();
      ctx.ellipse(x, y, 14 + rng() * 26, 10 + rng() * 20, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return toTexture(canvas, 1, 1);
  });
}

function meatTexture(size = 128): THREE.CanvasTexture | null {
  const key = `meat|${size}`;
  return cachedTexture(key, () => {
    const c = makeCanvas(size, size);
    if (!c) return null;
    const { canvas, ctx } = c;
    const rng = makeRng(27);
    ctx.fillStyle = MEAT_RED;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = MEAT_FAT;
    for (let i = 0; i < 14; i++) {
      ctx.globalAlpha = 0.3 + rng() * 0.3;
      ctx.lineWidth = 2 + rng() * 3;
      ctx.beginPath();
      const y = rng() * size;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + (rng() - 0.5) * 20, size * 0.7, y + (rng() - 0.5) * 20, size, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return toTexture(canvas, 1, 1);
  });
}

function signTexture(opts: { text: string; sub?: string; bg?: string; fg?: string; w?: number; h?: number; font?: string; border?: boolean }): THREE.CanvasTexture | null {
  const { text, sub, bg = '#e8dcc0', fg = '#2a2016', w = 480, h = 220, border = true, font } = opts;
  const key = `sign|${text}|${sub ?? ''}|${bg}|${fg}|${w}|${h}|${font ?? 'default'}|${border ? 1 : 0}`;
  return cachedTexture(key, () => {
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
    ctx.font = font ?? `bold ${Math.floor(h * 0.3)}px Georgia, serif`;
    ctx.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) {
      ctx.font = font ?? `${Math.floor(h * 0.13)}px Georgia, serif`;
      ctx.fillText(sub, w / 2, h * 0.72);
    }
    return toTexture(canvas, 1, 1);
  });
}

// ---------------------------------------------------------------------------
// Material cache — every material in this module is SHARED module-wide
// (the MergeStatic pass buckets geometry by material, so shared materials
// directly cut draw-call buckets). Keys pin every visual parameter.
// ---------------------------------------------------------------------------

type StdParams = { roughness?: number; metalness?: number; opacity?: number; transparent?: boolean };

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

function cachedMat(key: string, build: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const hit = materialCache.get(key);
  if (hit) return hit;
  const mat = build();
  materialCache.set(key, mat);
  return mat;
}

function stdMat(colorHex: string, tex: THREE.CanvasTexture | null, extra: StdParams = {}): THREE.MeshStandardMaterial {
  const rough = extra.roughness ?? 0.88;
  const metal = extra.metalness ?? 0.02;
  const key = `std|${colorHex}|${tex ? tex.uuid : 'flat'}|${rough}|${metal}|${extra.opacity ?? 1}`;
  return cachedMat(key, () => new THREE.MeshStandardMaterial({
    color: tex ? 0xffffff : new THREE.Color(colorHex),
    map: tex ?? undefined,
    roughness: rough,
    metalness: metal,
    ...(extra.transparent ? { transparent: true, opacity: extra.opacity ?? 1 } : {}),
  }));
}

function metalMat(colorHex: string, extra: StdParams = {}): THREE.MeshStandardMaterial {
  const rough = extra.roughness ?? 0.55;
  const metal = extra.metalness ?? 0.75;
  return cachedMat(`metal|${colorHex}|${rough}|${metal}`, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex), roughness: rough, metalness: metal,
  }));
}

/** Wood material keyed by (wear, tint) — the wear knob picks the palette band. */
function woodMat(wear: number, tint: string = WOOD_FRESH, grainTint?: string): THREE.MeshStandardMaterial {
  const w = Math.max(0, Math.min(1, wear));
  const base = w > 0.7 ? WOOD_ROT : w > 0.4 ? WOOD_WORN : tint;
  const grain = w > 0.7 ? WOOD_ROT_GRAIN : w > 0.4 ? WOOD_WORN_GRAIN : grainTint ?? WOOD_FRESH_GRAIN;
  return stdMat(base, woodTexture(base, grain, w), { roughness: 0.9 });
}

const MAT = {
  trimDark: () => stdMat(TRIM_DARK, woodTexture(TRIM_DARK, '#160e08', 0.2)),
  trimWhite: () => stdMat(TRIM_WHITE, woodTexture(TRIM_WHITE, '#a89f8a', 0.15)),
  roof: (wear = 0.3) => stdMat(ROOF_WOOD, woodTexture(ROOF_WOOD, ROOF_WOOD_GRAIN, wear, 256, 90)),
  stone: () => stdMat(STONE, stoneTexture(), { roughness: 0.9 }),
  iron: () => metalMat(IRON, { roughness: 0.6 }),
  brass: () => metalMat(BRASS, { roughness: 0.4 }),
  glass: (broken = false) => stdMat(broken ? '#3a3f38' : GLASS_TINT, null, { transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1 }),
  fabric: () => stdMat(FABRIC_CREAM, fabricStripeTexture(), { roughness: 0.95 }),
  hide: (seed = 63) => stdMat(HIDE_CREAM, hideTexture(HIDE_CREAM, HIDE_BROWN, seed), { roughness: 0.9 }),
  meat: () => stdMat(MEAT_RED, meatTexture(), { roughness: 0.5 }),
  weed: () => stdMat(WEED_GREEN, null, { roughness: 1 }),
  weedDry: () => stdMat(WEED_DRY, null, { roughness: 1 }),
  blood: () => stdMat(BLOOD_DARK, null, { roughness: 0.35, transparent: true, opacity: 0.34 }),
};

// ---------------------------------------------------------------------------
// Mesh helper
// ---------------------------------------------------------------------------

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function box(parent: THREE.Object3D, material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, name?: string): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
  if (name) m.name = name;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Reusable structural helpers
// ---------------------------------------------------------------------------

/** Symmetric gable roof: two sloped panels + triangular gable-end infill
 *  (buried 15 mm below the wall top — overlap, never coplanar) + ridge cap.
 *  The eave line lands exactly on the wall top. */
function buildGableRoof(opts: { width: number; depth: number; wallHeight: number; ridgeRise: number; overhang?: number; wear?: number }): THREE.Group {
  const { width, depth, wallHeight, ridgeRise, overhang = 0.35, wear = 0.3 } = opts;
  const g = new THREE.Group();
  g.name = 'gable-roof';

  const run = width / 2 + overhang;
  const angle = Math.atan2(ridgeRise, run);
  const slopeLen = Math.hypot(run, ridgeRise);
  const roofMat = MAT.roof(wear);

  [-1, 1].forEach((side) => {
    const panel = mesh(new THREE.BoxGeometry(slopeLen, 0.05, depth + overhang * 2), roofMat, (side * run) / 2, wallHeight + ridgeRise / 2, 0);
    panel.rotation.z = -side * angle;
    g.add(panel);
  });

  // ridge cap beam
  box(g, MAT.trimDark(), 0.08, 0.08, depth + overhang * 2, 0, wallHeight + ridgeRise, 0, 'ridge-cap');

  // triangular gable-end infill at both ends — base buried 15 mm INTO the
  // wall top so no hairline gap or coplanar face ever appears.
  [-1, 1].forEach((zSide) => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, ridgeRise);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
    const infill = mesh(geo, woodMat(wear), 0, wallHeight - 0.015, (zSide * depth) / 2 + 0.002);
    g.add(infill);
  });

  return g;
}

/** Single-slope shed/lean-to roof: HIGH edge at local z ≈ 0, sloping DOWN
 *  toward +z (the street side). Callers place the group so the high edge
 *  sits against the wall it shelters. */
function buildShedRoof(opts: { width: number; depth: number; lowHeight: number; highHeight: number; overhang?: number; wear?: number; mat?: THREE.Material }): THREE.Group {
  const { width, depth, lowHeight, highHeight, overhang = 0.25, wear = 0.3, mat } = opts;
  const g = new THREE.Group();
  g.name = 'shed-roof';

  const rise = highHeight - lowHeight;
  const run = depth + overhang;
  const angle = Math.atan2(rise, run);
  const slopeLen = Math.hypot(run, rise);
  const roofMat = mat ?? MAT.roof(wear);

  const panel = mesh(new THREE.BoxGeometry(width + overhang * 2, 0.04, slopeLen), roofMat, 0, lowHeight + rise / 2, run / 2 - overhang / 2);
  panel.rotation.x = angle;
  g.add(panel);

  return g;
}

/** Simple frame-and-pane window, mounted flush on a wall surface. */
function buildWindowUnit(w = 0.65, h = 0.95, broken = false): THREE.Group {
  const g = new THREE.Group();
  g.name = 'window-unit';

  box(g, MAT.trimDark(), w, h, 0.04, 0, 0, 0, 'window-frame');
  const pane = mesh(new THREE.PlaneGeometry(w - 0.07, h - 0.07), MAT.glass(broken), 0, 0, 0.022);
  pane.name = 'window-pane';
  g.add(pane);
  box(g, MAT.trimDark(), 0.02, h - 0.07, 0.012, 0, 0, 0.032);
  box(g, MAT.trimDark(), w - 0.07, 0.02, 0.012, 0, 0, 0.032);
  box(g, MAT.trimDark(), w + 0.1, 0.045, 0.07, 0, -h / 2 - 0.022, 0.024); // sill

  if (broken) {
    // a diagonal crack overlay + a couple of boards nailed across
    const crack = mesh(new THREE.PlaneGeometry(0.025, h * 0.7), MAT.glass(true), 0.03, 0, 0.024);
    crack.rotation.z = 0.5;
    g.add(crack);
    [-0.16, 0.14].forEach((oy, i) => {
      const board = mesh(new THREE.BoxGeometry(w + 0.12, 0.09, 0.025), woodMat(0.78), 0, oy, 0.055);
      board.rotation.z = i === 0 ? 0.09 : -0.06;
      g.add(board);
    });
  }

  return g;
}

/** Panel door, mounted flush on a wall surface — REAL scale: the defaults
 *  clear the 1.83 m Ranger with headroom (2.05 m leaf in a 2.11 m frame). */
function buildDoorUnit(w = 0.92, h = 2.05, fancy = false): THREE.Group {
  const g = new THREE.Group();
  g.name = 'door-unit';

  box(g, MAT.trimDark(), w + 0.1, h + 0.06, 0.05, 0, 0, 0, 'door-frame');
  const panel = mesh(new THREE.BoxGeometry(w, h, 0.035), woodMat(fancy ? 0.15 : 0.35, fancy ? TRIM_WHITE : WOOD_WORN), 0, 0, 0.022);
  panel.name = 'door-leaf';
  g.add(panel);

  if (fancy) {
    // two raised panel insets for a nicer door
    [-0.5, 0.5].forEach((oy) => {
      box(g, MAT.trimDark(), w * 0.62, h * 0.3, 0.012, 0, oy * h, 0.045);
    });
    const glassInsert = mesh(new THREE.CircleGeometry(w * 0.16, 16), MAT.glass(), 0, h * 0.32, 0.046);
    g.add(glassInsert);
  } else {
    for (let i = 0; i < 3; i++) {
      box(g, woodMat(0.4), w / 3 - 0.012, h - 0.05, 0.006, -w / 2 + (i + 0.5) * (w / 3), 0, 0.042);
    }
  }

  const knob = mesh(new THREE.SphereGeometry(0.032, 8, 8), MAT.brass(), w / 2 - 0.1, -0.02, 0.055);
  g.add(knob);

  return g;
}

/** Wood step stack leading up to a door/porch (real 18 cm risers). */
function buildSteps(width: number, count: number, wear = 0.3): THREE.Group {
  const g = new THREE.Group();
  g.name = 'wood-steps';
  const stepH = 0.18;
  const stepD = 0.3;
  for (let i = 0; i < count; i++) {
    box(g, woodMat(wear), width, stepH, stepD * (count - i), 0, stepH / 2 + i * stepH, stepD * count / 2 - stepD * (count - i) / 2);
  }
  return g;
}

/** Covered or open porch: platform, posts, optional railing, shed roof that
 *  slopes the RIGHT way (high at the wall, low at the street). */
function buildPorch(opts: { width: number; depth: number; postHeight: number; roofed?: boolean; railed?: boolean; wear?: number; sagging?: boolean }): THREE.Group {
  const { width, depth, postHeight, roofed = true, railed = false, wear = 0.3, sagging = false } = opts;
  const g = new THREE.Group();
  g.name = 'porch';

  const deckH = 0.18;
  box(g, woodMat(wear), width, deckH, depth, 0, deckH / 2, depth / 2, 'porch-deck');

  const postCount = Math.max(2, Math.round(width / 1.4) + 1);
  for (let i = 0; i < postCount; i++) {
    const x = -width / 2 + 0.18 + (i * (width - 0.36)) / (postCount - 1);
    const post = mesh(new THREE.CylinderGeometry(0.045, 0.05, postHeight, 10), woodMat(wear), x, deckH + postHeight / 2, depth - 0.12);
    if (sagging && i === Math.floor(postCount / 2)) post.rotation.z = 0.12;
    g.add(post);
  }

  if (railed) {
    box(g, MAT.trimDark(), width - 0.24, 0.05, 0.05, 0, deckH + 0.95, depth - 0.1);
    const balusterCount = Math.round(width / 0.22);
    for (let i = 0; i < balusterCount; i++) {
      const x = -width / 2 + 0.18 + (i * (width - 0.36)) / (balusterCount - 1);
      const baluster = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.86, 6), MAT.trimDark(), x, deckH + 0.5, depth - 0.1);
      g.add(baluster);
    }
  }

  if (roofed) {
    // High edge against the house wall (local z = 0), low edge over the
    // street — no mirroring, the shed roof already slopes toward +z.
    const roof = buildShedRoof({
      width,
      depth: depth - 0.05,
      lowHeight: deckH + postHeight - 0.3,
      highHeight: deckH + postHeight + 0.18,
      overhang: 0.22,
      wear,
    });
    roof.position.z = 0.11; // high edge lands on the wall plane
    g.add(roof);
  }

  return g;
}

/** Stacked-box chimney with a small cap, seated INTO the caller's roof slope
 *  (callers sink the base below the shingle plane — no floating stacks). */
function buildChimney(height = 1.0): THREE.Group {
  const g = new THREE.Group();
  g.name = 'chimney';
  box(g, MAT.stone(), 0.3, height, 0.3, 0, height / 2, 0, 'chimney-shaft');
  box(g, MAT.trimDark(), 0.38, 0.07, 0.38, 0, height + 0.035, 0, 'chimney-cap');
  return g;
}

// ---------------------------------------------------------------------------
// Reusable yard/stall props
// ---------------------------------------------------------------------------

export function buildWoodCrate(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'wood-crate';
  const size = 0.42;
  box(g, woodMat(0.45), size, size, size, 0, size / 2, 0, 'crate-body');
  [-1, 1].forEach((sx) => {
    box(g, woodMat(0.5), 0.035, size, 0.035, (sx * size) / 2, size / 2, (sx * size) / 2);
  });
  return g;
}

export function buildBarrelProp(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'barrel-prop';
  const barrel = mesh(new THREE.CylinderGeometry(0.26, 0.23, 0.6, 14), woodMat(0.4), 0, 0.3, 0);
  g.add(barrel);
  [0.1, 0.3, 0.5].forEach((y) => {
    const band = mesh(new THREE.TorusGeometry(0.25, 0.014, 6, 16), MAT.iron(), 0, y, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  });
  return g;
}

export function buildFirewoodStack(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'firewood-stack';
  const rng = makeRng(311);
  const rows = 3;
  const perRow = 6;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < perRow; i++) {
      const log = mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.48, 8), woodMat(0.45 + rng() * 0.15), i * 0.115 - (perRow * 0.115) / 2, 0.055 + r * 0.105, 0);
      log.rotation.z = Math.PI / 2;
      g.add(log);
    }
  }
  return g;
}

export function buildAnimalHide(kind: 'cow' | 'deer' = 'cow'): THREE.Group {
  const g = new THREE.Group();
  g.name = 'animal-hide';
  const w = kind === 'cow' ? 0.85 : 0.6;
  const h = kind === 'cow' ? 1.1 : 0.85;
  const hide = mesh(new THREE.PlaneGeometry(w, h, 6, 8), MAT.hide(kind === 'cow' ? 63 : 91), 0, h / 2, 0);
  // ripple the plane a little so it doesn't read as a perfectly flat card
  const pos = hide.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = (Math.sin(i * 1.3) + Math.sin(i * 0.7)) * 0.012;
    pos.setZ(i, z);
  }
  pos.needsUpdate = true;
  hide.geometry.computeVertexNormals();
  g.add(hide);
  const rod = mesh(new THREE.CylinderGeometry(0.012, 0.012, w + 0.12, 8), MAT.iron(), 0, h + 0.03, 0);
  rod.rotation.z = Math.PI / 2;
  g.add(rod);
  return g;
}

export function buildHangingMeatCut(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'hanging-meat-cut';
  const hook = mesh(new THREE.TorusGeometry(0.025, 0.005, 6, 10, Math.PI * 1.5), MAT.iron(), 0, 0.02, 0);
  g.add(hook);
  const cut = mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.28, 10), MAT.meat(), 0, -0.17, 0);
  g.add(cut);
  const twine = mesh(new THREE.TorusGeometry(0.07, 0.005, 6, 12), stdMat('#c9b183', null, { roughness: 0.9 }), 0, -0.02, 0);
  twine.rotation.x = Math.PI / 2;
  g.add(twine);
  return g;
}

export function buildWeedClump(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'weed-clump';
  const rng = makeRng(400 + Math.floor(g.name.length * 17));
  for (let i = 0; i < 6; i++) {
    const dry = rng() > 0.4;
    const blade = mesh(new THREE.ConeGeometry(0.007, 0.16 + rng() * 0.14, 3), dry ? MAT.weedDry() : MAT.weed(), (rng() - 0.5) * 0.14, 0.09, (rng() - 0.5) * 0.14);
    blade.rotation.z = (rng() - 0.5) * 0.5;
    blade.rotation.x = (rng() - 0.5) * 0.3;
    g.add(blade);
  }
  return g;
}

export function buildFenceSection(length = 1.4, wear = 0.35): THREE.Group {
  const g = new THREE.Group();
  g.name = 'fence-section';
  [0, length].forEach((x) => {
    box(g, woodMat(wear), 0.07, 0.85, 0.07, x - length / 2, 0.425, 0);
  });
  [0.3, 0.58].forEach((t) => {
    box(g, woodMat(wear), length, 0.06, 0.025, 0, t * 0.85 + 0.15, 0);
  });
  return g;
}

/** Farmyard water trough: plank box + sunken water surface (2 cm below the
 *  rim — visible on top, never coplanar with the rim). */
export function buildWaterTrough(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'water-trough';
  const w = 1.0;
  const h = 0.3;
  const d = 0.42;
  const t = 0.04;
  box(g, woodMat(0.5), w, h, t, 0, h / 2, -d / 2);
  box(g, woodMat(0.5), w, h, t, 0, h / 2, d / 2);
  box(g, woodMat(0.5), t, h, d, -w / 2 + t / 2, h / 2, 0);
  box(g, woodMat(0.5), t, h, d, w / 2 - t / 2, h / 2, 0);
  const water = mesh(new THREE.BoxGeometry(w - 2 * t - 0.01, 0.02, d - 2 * t - 0.01), stdMat('#3d5a66', null, { roughness: 0.15, metalness: 0.1 }), 0, h - 0.05, 0);
  water.name = 'trough-water';
  water.castShadow = false;
  g.add(water);
  return g;
}

/** Butcher's balance scale: base, post, cross beam, two chains + pans. */
function buildBalanceScale(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'balance-scale';
  box(g, woodMat(0.3), 0.16, 0.03, 0.1, 0, 0.015, 0, 'scale-base');
  box(g, MAT.brass(), 0.025, 0.34, 0.025, 0, 0.19, 0, 'scale-post');
  box(g, MAT.brass(), 0.4, 0.02, 0.02, 0, 0.37, 0, 'scale-beam');
  [-0.18, 0.18].forEach((x) => {
    const chain = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 4), MAT.iron(), x, 0.315, 0);
    g.add(chain);
    const pan = mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.014, 12), MAT.brass(), x, 0.265, 0);
    pan.name = 'scale-pan';
    g.add(pan);
  });
  return g;
}

/** Meat cleaver: blade + riveted handle, laid flat (or hung via rotation). */
function buildCleaver(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cleaver';
  box(g, MAT.iron(), 0.17, 0.13, 0.006, 0, 0, 0, 'cleaver-blade');
  box(g, woodMat(0.3), 0.09, 0.035, 0.02, 0.12, 0.03, 0, 'cleaver-handle');
  return g;
}

// ---------------------------------------------------------------------------
// 1. Butcher's stall — readable AS a butcher's from distance (§3)
// ---------------------------------------------------------------------------

export function buildButcherStall(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'butcher-stall';
  const wear = 0.55;
  const rng = makeRng(513);

  const width = 3.0;
  const depth = 1.8;
  const wallHeight = 1.25;

  // simple open-front frame: back wall + two side walls, no front wall
  box(g, woodMat(wear), width, wallHeight, 0.07, 0, wallHeight / 2, -depth / 2, 'stall-back-wall');
  [-1, 1].forEach((side) => {
    box(g, woodMat(wear), 0.07, wallHeight, depth, (side * width) / 2, wallHeight / 2, 0, `stall-side-wall-${side < 0 ? 'w' : 'e'}`);
  });

  // corner posts holding up the awning
  [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [-width / 2, depth / 2],
    [width / 2, depth / 2],
  ].forEach(([x, z]) => {
    const post = mesh(new THREE.CylinderGeometry(0.05, 0.055, 2.45, 10), woodMat(wear), x, 1.225, z);
    g.add(post);
  });

  // striped fabric awning: HIGH at the back posts, low edge EXACTLY on the
  // scallop line at the front (z = depth/2 + 0.05), so the trim reads as
  // the awning's edge instead of floating behind it.
  const frontLine = depth / 2 + 0.05;
  const awnDepth = frontLine + depth / 2; // back edge sits behind the back posts
  const awning = buildShedRoof({
    width: width + 0.35,
    depth: awnDepth,
    lowHeight: 2.1,
    highHeight: 2.5,
    overhang: 0.0,
    mat: MAT.fabric(),
  });
  awning.position.z = -depth / 2; // high edge at the back post line
  g.add(awning);
  // scalloped trim along the awning's front edge
  for (let i = 0; i < 8; i++) {
    const scallop = mesh(new THREE.ConeGeometry(0.07, 0.12, 6), MAT.fabric(), -width / 2 + 0.19 + i * (width / 7), 2.06, frontLine);
    scallop.rotation.x = Math.PI;
    g.add(scallop);
  }

  // front sales counter (real 0.95 m counter height)
  box(g, woodMat(wear), width - 0.25, 0.95, 0.5, 0, 0.475, depth / 2 - 0.25, 'stall-counter');
  box(g, woodMat(wear * 0.8), width - 0.15, 0.05, 0.56, 0, 0.975, depth / 2 - 0.25, 'stall-counter-top');

  // hook rail above the counter with hanging meat cuts
  const hookRail = mesh(new THREE.CylinderGeometry(0.018, 0.018, width - 0.35, 8), MAT.iron(), 0, 2.15, depth / 2 - 0.08);
  hookRail.rotation.z = Math.PI / 2;
  g.add(hookRail);
  for (let i = 0; i < 5; i++) {
    const cut = buildHangingMeatCut();
    cut.position.set(-width / 2 + 0.45 + i * ((width - 0.9) / 4), 2.12, depth / 2 - 0.08);
    g.add(cut);
  }

  // carcass/meat pieces on the back shelf
  box(g, woodMat(wear), width - 0.35, 0.05, 0.34, 0, 1.05, -depth / 2 + 0.24, 'stall-back-shelf');
  for (let i = 0; i < 3; i++) {
    box(g, MAT.meat(), 0.26, 0.17, 0.2, -0.6 + i * 0.6, 1.16, -depth / 2 + 0.24, `meat-piece-${i}`);
  }

  // animal hides hung at one side — FOUR, varied sizes and hangs
  const hides: Array<{ kind: 'cow' | 'deer'; z: number; y: number; rot: number }> = [
    { kind: 'cow', z: -0.35, y: 0.1, rot: 0.04 },
    { kind: 'deer', z: 0.45, y: 0.28, rot: -0.05 },
    { kind: 'cow', z: 1.05, y: 0.05, rot: 0.07 },
    { kind: 'deer', z: -0.95, y: 0.4, rot: 0.1 },
  ];
  hides.forEach((hd, i) => {
    const hide = buildAnimalHide(hd.kind);
    hide.position.set(-width / 2 - 0.12, hd.y, hd.z);
    hide.rotation.y = Math.PI / 2;
    hide.rotation.z = hd.rot;
    hide.name = `stall-hide-${i}`;
    g.add(hide);
  });

  // BIG cutting board + cleaver ON the counter (§3: larger board, clear knife)
  const board = mesh(new THREE.BoxGeometry(0.62, 0.035, 0.4), woodMat(0.35), -0.35, 1.017, depth / 2 - 0.3);
  board.name = 'cutting-board';
  g.add(board);
  const cleaver = buildCleaver();
  cleaver.rotation.x = -Math.PI / 2;
  cleaver.position.set(-0.2, 1.045, depth / 2 - 0.28);
  cleaver.rotation.z = 0.35;
  g.add(cleaver);
  // a second cleaver hangs on the back wall from two nails
  const cleaver2 = buildCleaver();
  cleaver2.rotation.z = Math.PI / 2;
  cleaver2.rotation.x = -Math.PI / 2;
  cleaver2.position.set(0.85, 1.62, -depth / 2 + 0.055);
  g.add(cleaver2);

  // balance scale on the counter (§3)
  const scale = buildBalanceScale();
  scale.position.set(0.75, 1.0, depth / 2 - 0.3);
  g.add(scale);

  // hand-written price board, chalk on dark slate (§3)
  const priceTex = signTexture({
    text: 'FRESH MEAT', sub: 'ask for Tom', bg: '#20221f', fg: '#d8d4c2',
    w: 380, h: 200, font: 'italic 34px Georgia, serif',
  });
  const priceBoard = mesh(new THREE.BoxGeometry(0.56, 0.3, 0.02), stdMat('#20221f', priceTex), 1.45, 1.5, -depth / 2 + 0.055);
  priceBoard.rotation.y = -0.12;
  priceBoard.name = 'price-board';
  g.add(priceBoard);
  box(g, MAT.iron(), 0.5, 0.02, 0.015, 1.45, 1.665, -depth / 2 + 0.05); // nail bar

  // two subtle old blood stains — counter top edge + ground under the rail
  // (thin decals slightly ABOVE the surface — the anti-coplanar rule)
  const stain1 = mesh(new THREE.PlaneGeometry(0.24, 0.11), MAT.blood(), -0.62, 1.0015, depth / 2 - 0.18);
  stain1.rotation.x = -Math.PI / 2;
  stain1.name = 'blood-stain-counter';
  stain1.castShadow = false;
  g.add(stain1);
  const stain2 = mesh(new THREE.PlaneGeometry(0.34, 0.2), MAT.blood(), -0.4, 0.0015, depth / 2 + 0.25);
  stain2.rotation.x = -Math.PI / 2;
  stain2.rotation.z = rng() * 0.8;
  stain2.name = 'blood-stain-ground';
  stain2.castShadow = false;
  g.add(stain2);

  // crates, barrel, rope coil around the stall
  const crate1 = buildWoodCrate();
  crate1.position.set(width / 2 + 0.35, 0, depth / 2 - 0.25);
  g.add(crate1);
  const crate2 = buildWoodCrate();
  crate2.position.set(width / 2 + 0.35, 0.43, depth / 2 - 0.25);
  crate2.rotation.y = 0.3;
  g.add(crate2);
  const barrel = buildBarrelProp();
  barrel.position.set(width / 2 + 0.8, 0, depth / 2 - 0.5);
  g.add(barrel);
  const ropeCoil = mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 20), stdMat('#c9b183', null, { roughness: 0.9 }), width / 2 + 0.35, 0.16, depth / 2 + 0.35);
  ropeCoil.rotation.x = Math.PI / 2;
  g.add(ropeCoil);

  // hanging sign
  const signTex = signTexture({ text: 'BUTCHER', sub: 'FRESH MEAT DAILY', w: 480, h: 200 });
  const sign = mesh(new THREE.BoxGeometry(1.0, 0.4, 0.03), stdMat('#e8dcc0', signTex), 0, 2.3, depth / 2 + 0.36);
  sign.name = 'butcher-sign';
  g.add(sign);
  box(g, MAT.iron(), 0.02, 0.02, 0.5, -0.3, 2.42, depth / 2 + 0.16);
  box(g, MAT.iron(), 0.02, 0.02, 0.5, 0.3, 2.42, depth / 2 + 0.16);

  return g;
}

// ---------------------------------------------------------------------------
// 2. House exteriors — REAL scale around the 1.83 m Ranger, each with its
//    own visual identity (§1/§2): worker = plain & cheap, family = tidy &
//    decorated porch, wealthy = the town's landmark, farm = out-of-town
//    working yard, abandoned = real decay, not just a dark tint.
// ---------------------------------------------------------------------------

/** House 1: small one-story worker's house — plain, cheap, a tiny stoop. */
export function buildWorkerHouse(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'house-worker';
  const wear = 0.45;

  const width = 4.0;
  const depth = 3.4;
  const wallHeight = 2.75;

  box(g, woodMat(wear), width, wallHeight, depth, 0, wallHeight / 2, 0, 'house-body');

  const roof = buildGableRoof({ width, depth, wallHeight, ridgeRise: 1.15, overhang: 0.32, wear });
  g.add(roof);

  const door = buildDoorUnit(0.92, 2.05, false);
  door.position.set(0, 1.025, depth / 2 + 0.02);
  g.add(door);
  [-1.25, 1.25].forEach((x) => {
    const win = buildWindowUnit(0.65, 0.95, false);
    win.position.set(x, 1.75, depth / 2 + 0.02);
    g.add(win);
  });

  box(g, woodMat(wear), 1.3, 0.16, 0.5, 0, 0.08, depth / 2 + 0.25, 'stoop');
  const steps = buildSteps(1.1, 1, wear);
  steps.position.set(0, 0, depth / 2 + 0.5);
  g.add(steps);

  // a crate and a shovel leaning on the wall — the worker's whole fortune
  const crate = buildWoodCrate();
  crate.position.set(width / 2 + 0.3, 0, depth / 2 - 0.45);
  g.add(crate);
  const shovelHandle = mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.35, 8), woodMat(0.4), width / 2 + 0.06, 0.68, depth / 2 - 1.0);
  shovelHandle.rotation.z = 0.15;
  g.add(shovelHandle);
  const shovelHead = mesh(new THREE.BoxGeometry(0.17, 0.22, 0.012), MAT.iron(), width / 2 + 0.16, 0.05, depth / 2 - 0.8);
  shovelHead.rotation.z = 0.15;
  g.add(shovelHead);

  return g;
}

/** House 2: mid-size family house — stone base, wood upper, wide railed
 *  porch with potted plants and flower boxes, chimney. */
export function buildFamilyHouse(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'house-family';
  const wear = 0.25;

  const width = 5.0;
  const depth = 4.0;
  const stoneHeight = 1.15;
  const woodHeight = 1.85;
  const wallHeight = stoneHeight + woodHeight;

  box(g, MAT.stone(), width, stoneHeight, depth, 0, stoneHeight / 2, 0, 'stone-base');
  box(g, woodMat(wear, WOOD_FRESH), width, woodHeight, depth, 0, stoneHeight + woodHeight / 2, 0, 'wood-upper');

  const roof = buildGableRoof({ width, depth, wallHeight, ridgeRise: 1.5, overhang: 0.42, wear });
  g.add(roof);

  // chimney seated INTO the roof slope: the roof surface at x = 1.9 sits at
  // wallHeight + ridge·(1 − x/run); the shaft base sinks 0.35 below it.
  const chimney = buildChimney(1.0);
  chimney.position.set(width / 2 - 0.6, wallHeight + 0.12, -depth / 2 + 0.7);
  g.add(chimney);

  const porch = buildPorch({ width: width * 0.84, depth: 1.5, postHeight: 2.2, roofed: true, railed: true, wear });
  porch.position.set(0, 0, depth / 2);
  g.add(porch);

  const door = buildDoorUnit(0.95, 2.1, true);
  door.position.set(0, 1.05, depth / 2 + 1.42);
  g.add(door);
  [-1.55, 1.55].forEach((x) => {
    const win = buildWindowUnit(0.72, 1.05, false);
    win.position.set(x, stoneHeight + 0.75, depth / 2 + 0.02);
    g.add(win);
  });
  [-1.55, 1.55].forEach((x) => {
    const winSide = buildWindowUnit(0.62, 0.9, false);
    winSide.position.set(width / 2 + 0.02, stoneHeight + 0.75, x * 0.55);
    winSide.rotation.y = Math.PI / 2;
    g.add(winSide);
  });

  const steps = buildSteps(1.4, 2, wear);
  steps.position.set(0, 0, depth / 2 + 1.5);
  g.add(steps);

  // porch furniture: potted plants + a chair + flower boxes under the wins
  [-1.9, 1.9].forEach((x) => {
    const pot = mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.2, 10), stdMat('#8a6a4a', null, { roughness: 0.9 }), x, 0.28, depth / 2 + 1.9);
    g.add(pot);
    const plant = mesh(new THREE.SphereGeometry(0.15, 8, 6), MAT.weed(), x, 0.46, depth / 2 + 1.9);
    g.add(plant);
  });
  [-1.55, 1.55].forEach((x) => {
    const flowerBox = box(g, woodMat(0.3), 0.8, 0.14, 0.18, x, stoneHeight + 0.18, depth / 2 + 0.07, 'flower-box');
    void flowerBox;
    const blooms = mesh(new THREE.SphereGeometry(0.06, 6, 4), stdMat('#a34a3a', null, { roughness: 0.9 }), x - 0.2, stoneHeight + 0.3, depth / 2 + 0.07);
    g.add(blooms);
    const blooms2 = mesh(new THREE.SphereGeometry(0.06, 6, 4), stdMat('#b8a23a', null, { roughness: 0.9 }), x + 0.18, stoneHeight + 0.3, depth / 2 + 0.07);
    g.add(blooms2);
  });
  const chairSeat = mesh(new THREE.BoxGeometry(0.42, 0.035, 0.42), woodMat(wear), 1.2, 0.62, depth / 2 + 1.5);
  g.add(chairSeat);
  const chairBack = mesh(new THREE.BoxGeometry(0.42, 0.45, 0.035), woodMat(wear), 1.2, 0.85, depth / 2 + 1.3);
  g.add(chairBack);

  return g;
}

/** House 3: two-story wealthy townhouse — the town's LANDMARK: stone base,
 *  columns, second-floor balcony, cross-gable + cupola, dentil molding,
 *  shutters, lanterns by the door. */
export function buildWealthyTownhouse(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'house-wealthy';
  const wear = 0.12;

  const width = 5.4;
  const depth = 4.8;
  const floorHeight = 2.2;
  const wallHeight = floorHeight * 2;

  // stone base grounds the building (landmark weight, §2)
  box(g, MAT.stone(), width + 0.08, 0.55, depth + 0.08, 0, 0.275, 0, 'stone-base');
  box(g, woodMat(wear, TRIM_WHITE), width, wallHeight - 0.55, depth, 0, 0.55 + (wallHeight - 0.55) / 2, 0, 'house-body');
  box(g, MAT.trimDark(), width + 0.05, 0.07, depth + 0.05, 0, floorHeight, 0, 'floor-divider');

  const roof = buildGableRoof({ width, depth, wallHeight, ridgeRise: 1.75, overhang: 0.45, wear });
  g.add(roof);

  // cross-gable projecting over the entrance
  const crossGable = buildGableRoof({ width: 1.9, depth: 1.1, wallHeight: wallHeight + 0.35, ridgeRise: 0.8, overhang: 0.22, wear });
  crossGable.position.set(0, 0, depth / 2 - 0.25);
  g.add(crossGable);

  // decorative cupola on the ridge
  box(g, woodMat(wear, TRIM_WHITE), 0.4, 0.4, 0.4, 0, wallHeight + 1.75 + 0.2, 0, 'cupola-base');
  const cupolaRoof = mesh(new THREE.ConeGeometry(0.32, 0.4, 4), MAT.roof(wear), 0, wallHeight + 1.75 + 0.6, 0);
  cupolaRoof.rotation.y = Math.PI / 4;
  g.add(cupolaRoof);
  const finial = mesh(new THREE.SphereGeometry(0.035, 8, 8), MAT.brass(), 0, wallHeight + 1.75 + 0.83, 0);
  g.add(finial);

  // dentil molding along the front eave
  for (let i = 0; i < 16; i++) {
    const x = -width / 2 + 0.22 + i * ((width - 0.44) / 15);
    box(g, MAT.trimWhite(), 0.07, 0.07, 0.07, x, wallHeight + 0.035, depth / 2 + 0.045);
  }

  // ground-floor columned porch
  [-1.85, -0.62, 0.62, 1.85].forEach((x) => {
    const column = mesh(new THREE.CylinderGeometry(0.1, 0.11, floorHeight - 0.55, 14), MAT.trimWhite(), x, 0.55 + (floorHeight - 0.55) / 2, depth / 2 + 0.55);
    g.add(column);
    const capital = mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.09, 14), MAT.trimWhite(), x, floorHeight - 0.55, depth / 2 + 0.55);
    g.add(capital);
  });
  box(g, MAT.trimWhite(), 4.2, 0.09, 1.2, 0, floorHeight, depth / 2 + 0.55, 'porch-roof-deck');
  box(g, woodMat(wear), 4.2, 0.14, 1.2, 0, 0.07, depth / 2 + 0.55, 'porch-floor');

  // second-floor balcony over the entrance, with a railing
  box(g, MAT.trimWhite(), 2.0, 0.09, 0.7, 0, floorHeight + 0.09, depth / 2 + 0.3, 'balcony-floor');
  box(g, MAT.trimWhite(), 2.0, 0.05, 0.05, 0, floorHeight + 0.95, depth / 2 + 0.62, 'balcony-rail');
  for (let i = 0; i < 9; i++) {
    const x = -0.92 + i * (1.84 / 8);
    const baluster = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.82, 6), MAT.trimWhite(), x, floorHeight + 0.53, depth / 2 + 0.62);
    g.add(baluster);
  }
  const balconyDoor = buildDoorUnit(0.9, 2.05, true);
  balconyDoor.position.set(0, floorHeight + 0.1 + 1.025, depth / 2 + 0.02);
  g.add(balconyDoor);

  const mainDoor = buildDoorUnit(1.05, 2.2, true);
  mainDoor.position.set(0, 0.55 + 1.1, depth / 2 + 0.58);
  g.add(mainDoor);

  // lanterns flanking the door (unlit props — no light budget cost)
  [-0.85, 0.85].forEach((x) => {
    box(g, MAT.iron(), 0.03, 0.03, 0.3, x, 2.45, depth / 2 + 0.42);
    const lamp = box(g, MAT.glass(), 0.14, 0.22, 0.14, x, 2.3, depth / 2 + 0.55, 'lantern');
    void lamp;
    box(g, MAT.iron(), 0.17, 0.03, 0.17, x, 2.42, depth / 2 + 0.55);
  });

  // many large windows, both floors, with simple shutters
  const winRowGround: number[] = [-1.95, -1.15, 1.15, 1.95];
  winRowGround.forEach((x) => {
    const win = buildWindowUnit(0.62, 1.15, false);
    win.position.set(x, 1.35, depth / 2 + 0.02);
    g.add(win);
    [-1, 1].forEach((s) => {
      box(g, stdMat('#3a5030', null, { roughness: 0.8 }), 0.2, 1.15, 0.025, x + s * 0.44, 1.35, depth / 2 + 0.016);
    });
  });
  [-1.7, 1.7].forEach((x) => {
    const win = buildWindowUnit(0.7, 1.05, false);
    win.position.set(x, floorHeight + 1.05, depth / 2 + 0.02);
    g.add(win);
  });
  [-1.7, 0, 1.7].forEach((x) => {
    const winSide = buildWindowUnit(0.6, 0.95, false);
    winSide.position.set(width / 2 + 0.02, 1.35, x * 0.62);
    winSide.rotation.y = Math.PI / 2;
    g.add(winSide);
    const winSideUp = buildWindowUnit(0.6, 0.95, false);
    winSideUp.position.set(width / 2 + 0.02, floorHeight + 1.05, x * 0.62);
    winSideUp.rotation.y = Math.PI / 2;
    g.add(winSideUp);
  });

  const steps = buildSteps(1.6, 2, wear * 0.6);
  steps.position.set(0, 0, depth / 2 + 1.35);
  g.add(steps);

  return g;
}

/** House 4: tall farmhouse with a steep barn roof, an attached lean-to
 *  shed, a fenced yard, a water trough and tools — out-of-town working
 *  feel (§2). */
export function buildFarmhouse(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'house-farmstead';
  const wear = 0.4;

  const width = 4.6;
  const depth = 4.0;
  const wallHeight = 3.0;

  box(g, woodMat(wear), width, wallHeight, depth, 0, wallHeight / 2, 0, 'house-body');

  const roof = buildGableRoof({ width, depth, wallHeight, ridgeRise: 2.0, overhang: 0.42, wear });
  g.add(roof);

  // chimney SEATED into the slope: at x = −1.9 the roof surface sits at
  // wallHeight + ridge·(1 − 1.9/run); the base sinks 0.3 below it.
  const chimney = buildChimney(0.95);
  chimney.position.set(-width / 2 + 0.5, wallHeight + 0.3, 0);
  g.add(chimney);

  const door = buildDoorUnit(0.95, 2.08, false);
  door.position.set(-0.5, 1.04, depth / 2 + 0.02);
  g.add(door);
  const win1 = buildWindowUnit(0.65, 0.95, false);
  win1.position.set(1.1, 1.75, depth / 2 + 0.02);
  g.add(win1);
  const winAttic = buildWindowUnit(0.55, 0.6, false);
  winAttic.position.set(0, wallHeight + 0.62, depth / 2 + 0.02);
  g.add(winAttic);

  box(g, woodMat(wear), 1.35, 0.16, 0.5, -0.5, 0.08, depth / 2 + 0.25, 'stoop');
  const steps = buildSteps(1.2, 1, wear);
  steps.position.set(-0.5, 0, depth / 2 + 0.5);
  g.add(steps);

  // attached lean-to shed on one side
  const shedWidth = 2.0;
  const shedWallH = 2.1;
  box(g, woodMat(wear + 0.1), shedWidth, shedWallH, depth * 0.8, width / 2 + shedWidth / 2, shedWallH / 2, -depth * 0.1, 'shed-body');
  const shedRoof = buildShedRoof({ width: shedWidth + 0.25, depth: depth * 0.8 + 0.25, lowHeight: shedWallH - 0.35, highHeight: wallHeight * 0.72, overhang: 0.22, wear: wear + 0.1 });
  shedRoof.rotation.y = Math.PI / 2;
  shedRoof.position.set(width / 2 + shedWidth / 2, 0, -depth * 0.1);
  g.add(shedRoof);
  const shedDoor = buildDoorUnit(0.85, 1.95, false);
  shedDoor.rotation.y = Math.PI / 2;
  shedDoor.position.set(width / 2 + 0.02, 0.975, -depth * 0.1);
  g.add(shedDoor);

  // fenced yard section along the front
  for (let i = 0; i < 4; i++) {
    const fence = buildFenceSection(1.4, wear);
    fence.position.set(-2.9 + i * 1.4, 0, depth / 2 + 1.55);
    g.add(fence);
  }

  // water trough by the fence (§2 farmyard identity)
  const trough = buildWaterTrough();
  trough.position.set(1.9, 0, depth / 2 + 1.4);
  trough.rotation.y = -0.2;
  g.add(trough);

  // farmyard clutter: barrel, crate, stacked firewood, a leaning rake
  const barrel1 = buildBarrelProp();
  barrel1.position.set(-width / 2 - 0.35, 0, -depth / 2 + 0.5);
  g.add(barrel1);
  const crate = buildWoodCrate();
  crate.position.set(-width / 2 - 0.35, 0, -depth / 2 + 1.2);
  g.add(crate);
  const wood = buildFirewoodStack();
  wood.position.set(-width / 2 - 0.42, 0, 0.3);
  wood.rotation.y = Math.PI / 2;
  g.add(wood);
  const rakeHandle = mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.55, 8), woodMat(0.4), width / 2 + 0.06, 0.75, depth / 2 - 0.4);
  rakeHandle.rotation.z = 0.18;
  g.add(rakeHandle);
  const rakeHead = mesh(new THREE.BoxGeometry(0.3, 0.04, 0.025), MAT.iron(), width / 2 + 0.18, 0.05, depth / 2 - 0.25);
  rakeHead.rotation.z = 0.18;
  g.add(rakeHead);

  return g;
}

/** House 5: same footprint class as the worker's house, but DECADES of
 *  neglect — broken and boarded windows, crooked patches, a knocked
 *  roof panel, sagging stub roof, leaning fence, weeds (§2). */
export function buildAbandonedHouse(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'house-abandoned';
  const wear = 0.9;
  const rng = makeRng(977);

  const width = 4.0;
  const depth = 3.4;
  const wallHeight = 2.75;

  box(g, woodMat(wear), width, wallHeight, depth, 0, wallHeight / 2, 0, 'house-body');

  const roof = buildGableRoof({ width, depth, wallHeight, ridgeRise: 1.15, overhang: 0.32, wear });
  // knock one roof panel slightly askew to suggest a partial collapse
  roof.children[1].rotation.z += 0.06;
  roof.children[1].position.y -= 0.05;
  g.add(roof);

  const door = buildDoorUnit(0.92, 2.05, false);
  door.rotation.z = 0.045;
  door.position.set(0, 1.025, depth / 2 + 0.02);
  g.add(door);

  const brokenWin = buildWindowUnit(0.65, 0.95, true);
  brokenWin.position.set(-1.25, 1.75, depth / 2 + 0.02);
  g.add(brokenWin);
  const boardedWin = buildWindowUnit(0.65, 0.95, true);
  boardedWin.position.set(1.25, 1.75, depth / 2 + 0.02);
  g.add(boardedWin);

  // crooked patch planks nailed over the wall
  for (let i = 0; i < 4; i++) {
    const patch = mesh(new THREE.BoxGeometry(0.7, 0.16, 0.025), woodMat(0.82), (rng() - 0.5) * 2.0, 0.6 + rng() * 1.5, depth / 2 + 0.035);
    patch.rotation.z = (rng() - 0.5) * 0.4;
    g.add(patch);
  }
  // a small board stack leaning by the door (repairs that never finished)
  [-0.9, -0.84].forEach((x, i) => {
    const plank = mesh(new THREE.BoxGeometry(0.16, 1.7, 0.025), woodMat(0.85), x, 0.85, depth / 2 + 0.45 + i * 0.05);
    plank.rotation.z = 0.16 + i * 0.05;
    g.add(plank);
  });

  const stoop = box(g, woodMat(wear), 1.3, 0.14, 0.5, 0, 0.07, depth / 2 + 0.25, 'stoop');
  stoop.rotation.z = 0.035;
  const steps = buildSteps(1.1, 1, wear);
  steps.position.set(0, -0.02, depth / 2 + 0.5);
  g.add(steps);

  // sagging porch roof stub over the door, propped by a leaning post
  const stubRoof = buildShedRoof({ width: 1.35, depth: 0.6, lowHeight: 2.05, highHeight: 2.3, overhang: 0.16, wear });
  stubRoof.position.z = depth / 2 + 0.15;
  stubRoof.rotation.z = -0.08;
  g.add(stubRoof);
  const propPost = mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.0, 8), woodMat(wear), 0.55, 1.0, depth / 2 + 0.4);
  propPost.rotation.z = 0.2;
  g.add(propPost);

  // leaning broken fence piece by the yard
  const brokenFence = buildFenceSection(1.3, 0.85);
  brokenFence.position.set(width / 2 + 0.9, 0, depth / 2 + 0.6);
  brokenFence.rotation.z = -0.18;
  g.add(brokenFence);

  // weeds and grass clumps scattered around the base
  for (let i = 0; i < 10; i++) {
    const weed = buildWeedClump();
    const angle = rng() * Math.PI * 2;
    const r = width / 2 + 0.25 + rng() * 0.7;
    weed.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    g.add(weed);
  }

  return g;
}

// ---------------------------------------------------------------------------
// One-call convenience: all six buildings laid out along a street (kit
// preview — place buildings as INDIVIDUAL defs so each carries its own
// collider from TOWN_EXTERIOR_COLLIDERS).
// ---------------------------------------------------------------------------

export function buildTownExteriorScene(): THREE.Group {
  const scene = new THREE.Group();
  scene.name = 'town-exterior-scene';

  const abandoned = buildAbandonedHouse();
  abandoned.position.set(-17.5, 0, 0);
  scene.add(abandoned);

  const stall = buildButcherStall();
  stall.position.set(-11.5, 0, 0);
  scene.add(stall);

  const worker = buildWorkerHouse();
  worker.position.set(-6.5, 0, 0);
  scene.add(worker);

  const family = buildFamilyHouse();
  family.position.set(0, 0, 0);
  scene.add(family);

  const wealthy = buildWealthyTownhouse();
  wealthy.position.set(7.5, 0, 0);
  scene.add(wealthy);

  const farm = buildFarmhouse();
  farm.position.set(16, 0, 0);
  scene.add(farm);

  return scene;
}

// ---------------------------------------------------------------------------
// Collision (§6) — exact local composite boxes for the metadata-driven
// CollisionWorld ({ boxes: [{ size, offset }] }, yaw-aware). One tight body
// box per shell house (players must NOT walk behind/into interior-less
// models), back/side/counter boxes for the open-front stall, body + shed
// for the farmstead. Wall height only — nothing oversized, the air above
// the street stays walkable.
// ---------------------------------------------------------------------------

export interface ColliderBoxSpec {
  size: { x: number; y: number; z: number };
  offset: { x: number; y: number; z: number };
}

/**
 * Per-assetType metadata collider payloads in the EXACT CollisionWorld form
 * (`{ boxes: [{ size, offset }] }`) — attach as `metadata.collider` when the
 * def is registered. (A bare array would NOT parse and would silently fall
 * back to the 1 m³ transform-derived box — the walk-through bug class.)
 */
export const TOWN_EXTERIOR_COLLIDERS: Readonly<Record<string, { readonly boxes: readonly ColliderBoxSpec[] }>> = Object.freeze({
  'house-worker': Object.freeze({
    boxes: Object.freeze([
      Object.freeze({ size: Object.freeze({ x: 4.0, y: 2.75, z: 3.4 }), offset: Object.freeze({ x: 0, y: 1.375, z: 0 }) }),
    ]),
  }),
  'house-family': Object.freeze({
    boxes: Object.freeze([
      Object.freeze({ size: Object.freeze({ x: 5.0, y: 3.0, z: 4.0 }), offset: Object.freeze({ x: 0, y: 1.5, z: 0 }) }),
    ]),
  }),
  'house-wealthy': Object.freeze({
    boxes: Object.freeze([
      Object.freeze({ size: Object.freeze({ x: 5.4, y: 4.4, z: 4.8 }), offset: Object.freeze({ x: 0, y: 2.2, z: 0 }) }),
    ]),
  }),
  'house-farmstead': Object.freeze({
    boxes: Object.freeze([
      Object.freeze({ size: Object.freeze({ x: 4.6, y: 3.0, z: 4.0 }), offset: Object.freeze({ x: 0, y: 1.5, z: 0 }) }),
      Object.freeze({ size: Object.freeze({ x: 2.0, y: 2.1, z: 3.2 }), offset: Object.freeze({ x: 3.3, y: 1.05, z: -0.4 }) }),
    ]),
  }),
  'house-abandoned': Object.freeze({
    boxes: Object.freeze([
      Object.freeze({ size: Object.freeze({ x: 4.0, y: 2.75, z: 3.4 }), offset: Object.freeze({ x: 0, y: 1.375, z: 0 }) }),
    ]),
  }),
  'butcher-stall': Object.freeze({
    boxes: Object.freeze([
      Object.freeze({ size: Object.freeze({ x: 3.0, y: 1.25, z: 0.1 }), offset: Object.freeze({ x: 0, y: 0.625, z: -0.9 }) }),
      Object.freeze({ size: Object.freeze({ x: 0.1, y: 1.25, z: 1.8 }), offset: Object.freeze({ x: -1.45, y: 0.625, z: 0 }) }),
      Object.freeze({ size: Object.freeze({ x: 0.1, y: 1.25, z: 1.8 }), offset: Object.freeze({ x: 1.45, y: 0.625, z: 0 }) }),
      Object.freeze({ size: Object.freeze({ x: 2.75, y: 0.95, z: 0.56 }), offset: Object.freeze({ x: 0, y: 0.475, z: 0.65 }) }),
    ]),
  }),
  'fence-section': Object.freeze({
    boxes: Object.freeze([
      Object.freeze({ size: Object.freeze({ x: 1.4, y: 0.85, z: 0.12 }), offset: Object.freeze({ x: 0, y: 0.425, z: 0 }) }),
    ]),
  }),
  'wood-crate': Object.freeze({
    boxes: Object.freeze([
      Object.freeze({ size: Object.freeze({ x: 0.42, y: 0.42, z: 0.42 }), offset: Object.freeze({ x: 0, y: 0.21, z: 0 }) }),
    ]),
  }),
  'barrel-prop': Object.freeze({
    boxes: Object.freeze([
      Object.freeze({ size: Object.freeze({ x: 0.5, y: 0.6, z: 0.5 }), offset: Object.freeze({ x: 0, y: 0.3, z: 0 }) }),
    ]),
  }),
  'firewood-stack': Object.freeze({
    boxes: Object.freeze([
      Object.freeze({ size: Object.freeze({ x: 0.72, y: 0.33, z: 0.14 }), offset: Object.freeze({ x: 0, y: 0.165, z: 0 }) }),
    ]),
  }),
  'water-trough': Object.freeze({
    boxes: Object.freeze([
      Object.freeze({ size: Object.freeze({ x: 1.0, y: 0.3, z: 0.42 }), offset: Object.freeze({ x: 0, y: 0.15, z: 0 }) }),
    ]),
  }),
});

// ---------------------------------------------------------------------------
// Asset Registry wiring — the REAL IAssetFactory contract: factories return
// the built Object3D and NEVER apply the def transform (the renderer adapter
// owns transforms and the merge pass).
// ---------------------------------------------------------------------------

export const TOWN_EXTERIOR_ASSET_TYPES = Object.freeze([
  'butcher-stall',
  'house-worker',
  'house-family',
  'house-wealthy',
  'house-farmstead',
  'house-abandoned',
  'wood-crate',
  'barrel-prop',
  'firewood-stack',
  'animal-hide',
  'hanging-meat-cut',
  'weed-clump',
  'fence-section',
  'water-trough',
  'town-exterior-scene',
] as const);

export type TownExteriorAssetType = (typeof TOWN_EXTERIOR_ASSET_TYPES)[number];

/** Register every town-exterior asset type with the game's AssetRegistry. */
export function registerTownExteriorFactories(registry: AssetRegistry): void {
  const builders: Readonly<Record<string, () => THREE.Group>> = {
    'butcher-stall': () => buildButcherStall(),
    'house-worker': () => buildWorkerHouse(),
    'house-family': () => buildFamilyHouse(),
    'house-wealthy': () => buildWealthyTownhouse(),
    'house-farmstead': () => buildFarmhouse(),
    'house-abandoned': () => buildAbandonedHouse(),
    'wood-crate': () => buildWoodCrate(),
    'barrel-prop': () => buildBarrelProp(),
    'firewood-stack': () => buildFirewoodStack(),
    'animal-hide': () => buildAnimalHide(),
    'hanging-meat-cut': () => buildHangingMeatCut(),
    'weed-clump': () => buildWeedClump(),
    'fence-section': () => buildFenceSection(),
    'water-trough': () => buildWaterTrough(),
    'town-exterior-scene': () => buildTownExteriorScene(),
  };
  for (const [assetType, build] of Object.entries(builders)) {
    registry.register(assetType, { create: () => build() }, assetType);
  }
}
