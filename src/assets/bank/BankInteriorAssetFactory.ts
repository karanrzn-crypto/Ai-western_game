/**
 * src/assets/bank/BankInteriorAssetFactory.ts
 * -----------------------------------------------------------------------------
 * Visual bank/interior assets supplied by the user, adapted to the CURRENT
 * Ai-western_game asset architecture.
 *
 * The original builders are retained as the visual source. The obsolete
 * guessed IAssetFactory/ObjectDefinition definitions and applyTransform helper
 * are deliberately removed. The real project types are imported below.
 *
 * Factory rule: create() builds the Object3D only. AssetRegistry mirrors UUID
 * and name; ThreeRendererAdapter applies the ObjectDefinition transform.
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { IAssetFactory } from '../IAssetFactory.js';
import type { AssetRegistry } from '../AssetRegistry.js';

const WORLD_SCALE = 1;

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const WOOD_DARK = '#4a2c17';
const WOOD_MED = '#6b4226';
const WOOD_TRIM = '#8a5a34';
const MARBLE_BASE = '#e9e4d8';
const MARBLE_VEIN = '#a79a82';
const BRASS = '#b08d3d';
const BRASS_DARK = '#7a5f27';
const IRON = '#232323';
const LEATHER_GREEN = '#1f3d2c';
const LEATHER_MAROON = '#4a1620';
const PARCHMENT = '#e8dcc0';
const RUG_RED = '#7a1f1f';
const RUG_GOLD = '#b08d3d';
const GLASS_WARM = '#ffd9a0';

// ---------------------------------------------------------------------------
// Procedural canvas texture generators (with headless-safe fallback)
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
  // tiny deterministic PRNG so repeated calls of a builder look consistent
  seed.v = (seed.v * 9301 + 49297) % 233280;
  return seed.v / 233280;
}

function woodTexture(base = WOOD_MED, grain = WOOD_DARK, size = 256): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const seed = { v: 17 };
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
  // a few darker knots
  ctx.globalAlpha = 0.35;
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

function marbleTexture(base = MARBLE_BASE, vein = MARBLE_VEIN, size = 256): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const seed = { v: 41 };
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = vein;
    ctx.globalAlpha = 0.25 + rand(seed) * 0.25;
    ctx.lineWidth = 0.8 + rand(seed) * 1.6;
    ctx.beginPath();
    let x = rand(seed) * size;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < size) {
      x += (rand(seed) - 0.5) * 40;
      y += size / 10;
      ctx.lineTo(x, y);
    }
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
  const seed = { v: 7 };
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

function leatherTexture(base = LEATHER_MAROON, size = 256): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  const step = size / 6;
  // tufted diamond stitch pattern
  for (let row = -1; row <= 6; row++) {
    ctx.beginPath();
    for (let col = 0; col <= 6; col++) {
      const x = col * step;
      const y = row * step + (col % 2 === 0 ? 0 : step / 2);
      if (col === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const seed = { v: 91 };
  for (let row = 0; row <= 6; row++) {
    for (let col = 0; col <= 6; col++) {
      const x = col * step + (row % 2 === 0 ? 0 : step / 2);
      const y = row * step;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, 6);
      grd.addColorStop(0, 'rgba(0,0,0,0.4)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  void seed;
  return toTexture(canvas, 1, 1);
}

/** Renders a short line of text onto a painted-sign style canvas texture. */
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
  ctx.font = opts.font ?? `bold ${Math.floor(h * 0.34)}px Georgia, "Times New Roman", serif`;
  ctx.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
  if (sub) {
    ctx.font = `${Math.floor(h * 0.13)}px Georgia, "Times New Roman", serif`;
    ctx.fillText(sub, w / 2, h * 0.72);
  }
  return toTexture(canvas, 1, 1);
}

function clockFaceTexture(size = 256): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = '#f2ead6';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a2016';
  ctx.lineWidth = 3;
  ctx.stroke();
  const numerals = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.fillStyle = '#2a2016';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.floor(size * 0.09)}px Georgia, serif`;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r = size * 0.38;
    const x = size / 2 + Math.cos(angle) * r;
    const y = size / 2 + Math.sin(angle) * r;
    ctx.fillText(numerals[i], x, y);
  }
  // center hub + hands frozen at a decorative angle
  ctx.strokeStyle = '#2a2016';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(size / 2, size / 2);
  ctx.lineTo(size / 2 + size * 0.22, size / 2 - size * 0.08);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(size / 2, size / 2);
  ctx.lineTo(size / 2 - size * 0.02, size / 2 - size * 0.3);
  ctx.stroke();
  ctx.fillStyle = '#2a2016';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(canvas, 1, 1);
}

function rugTexture(size = 512): THREE.CanvasTexture | null {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = RUG_RED;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = RUG_GOLD;
  const cx = size / 2;
  const cy = size / 2;
  for (let r = size * 0.08; r < size * 0.46; r += size * 0.06) {
    ctx.lineWidth = size * 0.012;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // border band
  ctx.strokeStyle = RUG_GOLD;
  ctx.lineWidth = size * 0.03;
  ctx.strokeRect(size * 0.04, size * 0.04, size * 0.92, size * 0.92);
  // corner medallions
  ctx.fillStyle = RUG_GOLD;
  [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92]].forEach(([fx, fy]) => {
    ctx.beginPath();
    ctx.arc(fx * size, fy * size, size * 0.03, 0, Math.PI * 2);
    ctx.fill();
  });
  return toTexture(canvas, 1, 1);
}

// ---------------------------------------------------------------------------
// Material / mesh helpers
// ---------------------------------------------------------------------------

function stdMat(colorHex: string, tex: THREE.CanvasTexture | null, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color: tex ? 0xffffff : new THREE.Color(colorHex),
    map: tex ?? undefined,
    roughness: 0.75,
    metalness: 0.05,
    ...extra,
  });
}

function metalMat(colorHex: string, tex: THREE.CanvasTexture | null, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color: tex ? 0xffffff : new THREE.Color(colorHex),
    map: tex ?? undefined,
    roughness: 0.35,
    metalness: 0.85,
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

// Shared material instances (built once per module load; cheap + consistent look)
const MAT = {
  woodDark: () => stdMat(WOOD_DARK, woodTexture(WOOD_DARK, '#2f1a0d')),
  woodMed: () => stdMat(WOOD_MED, woodTexture(WOOD_MED, WOOD_DARK)),
  woodTrim: () => stdMat(WOOD_TRIM, woodTexture(WOOD_TRIM, WOOD_MED)),
  marble: () => stdMat(MARBLE_BASE, marbleTexture(), { roughness: 0.25, metalness: 0.05 }),
  brass: () => metalMat(BRASS, brassTexture()),
  brassDark: () => metalMat(BRASS_DARK, brassTexture(BRASS_DARK)),
  iron: () => metalMat(IRON, null, { roughness: 0.55 }),
  leatherGreen: () => stdMat(LEATHER_GREEN, leatherTexture(LEATHER_GREEN), { roughness: 0.6 }),
  leatherMaroon: () => stdMat(LEATHER_MAROON, leatherTexture(LEATHER_MAROON), { roughness: 0.6 }),
  parchment: () => stdMat(PARCHMENT, null, { roughness: 1 }),
  glassWarm: () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(GLASS_WARM),
      transparent: true,
      opacity: 0.55,
      roughness: 0.1,
      metalness: 0.1,
      emissive: new THREE.Color(GLASS_WARM),
      emissiveIntensity: 0.6,
    }),
};

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** Big riveted circular vault door on a hinge group, set into a stepped iron frame. */
export function buildBankVaultDoor(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bank-vault-door';

  const opening = 1.6 * WORLD_SCALE;

  // stepped wall frame around the opening (3 concentric rings for a "thick vault wall" read)
  for (let i = 0; i < 3; i++) {
    const r = opening / 2 + 0.06 + i * 0.05;
    const frameRing = mesh(
      new THREE.TorusGeometry(r, 0.025, 8, 32),
      MAT.iron(),
      0,
      opening / 2 + 0.06,
      -0.05 - i * 0.05
    );
    g.add(frameRing);
  }

  // hinge group holding the door slab so it can be rotated open by the agent
  const hinge = new THREE.Group();
  hinge.name = 'bank-vault-door-hinge';
  hinge.position.set(-opening / 2 - 0.05, opening / 2 + 0.06, 0.02);
  g.add(hinge);

  const doorRadius = opening / 2 + 0.02;
  const doorSlab = mesh(
    new THREE.CylinderGeometry(doorRadius, doorRadius, 0.14, 32),
    MAT.iron(),
    doorRadius,
    0,
    0
  );
  doorSlab.rotation.z = Math.PI / 2;
  hinge.add(doorSlab);

  // decorative inset ring + brass plaque on the door face
  const inset = mesh(new THREE.TorusGeometry(doorRadius * 0.7, 0.02, 8, 32), MAT.brassDark(), doorRadius, 0, 0.08);
  inset.rotation.y = Math.PI / 2;
  hinge.add(inset);

  const plaqueTex = signTexture({ text: 'CENTRAL', sub: 'BANK & TRUST', bg: '#171717', fg: '#c9a75a', w: 400, h: 220, border: false });
  const plaque = mesh(
    new THREE.CircleGeometry(doorRadius * 0.45, 32),
    stdMat('#171717', plaqueTex, { roughness: 0.4, metalness: 0.4 }),
    doorRadius,
    0,
    0.081
  );
  plaque.rotation.y = Math.PI / 2;
  hinge.add(plaque);

  // ring of rivets around the door edge
  const rivetCount = 20;
  for (let i = 0; i < rivetCount; i++) {
    const a = (i / rivetCount) * Math.PI * 2;
    const rivet = mesh(
      new THREE.SphereGeometry(0.025, 8, 8),
      MAT.iron(),
      doorRadius,
      Math.sin(a) * doorRadius * 0.88,
      Math.cos(a) * doorRadius * 0.88 + 0.075
    );
    hinge.add(rivet);
  }

  // spoked wheel handle + hub bolts, centered on the door
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(doorRadius, 0, 0.1);
  hinge.add(wheelGroup);
  const hub = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), MAT.brass(), 0, 0, 0);
  hub.rotation.x = Math.PI / 2;
  wheelGroup.add(hub);
  const rim = mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 24), MAT.brass(), 0, 0, 0);
  wheelGroup.add(rim);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spoke = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), MAT.brass(), Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0);
    spoke.rotation.z = a + Math.PI / 2;
    wheelGroup.add(spoke);
  }
  // locking bolts radiating from hub toward the door edge (the classic vault look)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bolt = mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6),
      MAT.iron(),
      Math.cos(a) * 0.35,
      Math.sin(a) * 0.35,
      -0.02
    );
    bolt.rotation.z = a + Math.PI / 2;
    wheelGroup.add(bolt);
  }

  return g;
}

/** Marble-topped teller counter with a brass cash-slot trim and carved base panels. */
export function buildTellerCounter(length = 3.2 * WORLD_SCALE): THREE.Group {
  const g = new THREE.Group();
  g.name = 'teller-counter';

  const height = 1.15 * WORLD_SCALE;
  const depth = 0.6 * WORLD_SCALE;

  const body = mesh(new THREE.BoxGeometry(length, height, depth), MAT.woodMed(), 0, height / 2, 0);
  g.add(body);

  const top = mesh(new THREE.BoxGeometry(length + 0.08, 0.05, depth + 0.1), MAT.marble(), 0, height + 0.025, 0);
  g.add(top);

  // brass edge trim under the marble
  const trim = mesh(new THREE.BoxGeometry(length + 0.1, 0.02, depth + 0.12), MAT.brass(), 0, height - 0.005, 0);
  g.add(trim);

  // carved base panels (recessed rectangles suggested via thin darker overlay boxes)
  const panelCount = Math.max(3, Math.round(length / 0.8));
  for (let i = 0; i < panelCount; i++) {
    const t = (i + 0.5) / panelCount - 0.5;
    const panel = mesh(
      new THREE.BoxGeometry(length / panelCount - 0.08, height * 0.55, 0.015),
      MAT.woodDark(),
      t * length,
      height * 0.42,
      depth / 2 + 0.008
    );
    g.add(panel);
    const frame = mesh(
      new THREE.BoxGeometry(length / panelCount - 0.04, 0.02, 0.02),
      MAT.woodTrim(),
      t * length,
      height * 0.42 + height * 0.28,
      depth / 2 + 0.012
    );
    g.add(frame);
  }

  // brass cash tray slot at one end
  const tray = mesh(new THREE.BoxGeometry(0.3, 0.02, 0.15), MAT.brass(), length / 2 - 0.3, height + 0.06, 0);
  g.add(tray);

  return g;
}

/** Wrought-iron teller grille to sit on top of the counter, with a small service opening. */
export function buildTellerCage(width = 3.0 * WORLD_SCALE): THREE.Group {
  const g = new THREE.Group();
  g.name = 'teller-cage';

  const height = 1.3 * WORLD_SCALE;

  // top and bottom rails
  [0, height].forEach((y) => {
    const rail = mesh(new THREE.BoxGeometry(width, 0.04, 0.04), MAT.iron(), 0, y, 0);
    g.add(rail);
  });
  // side posts
  [-width / 2, width / 2].forEach((x) => {
    const post = mesh(new THREE.BoxGeometry(0.05, height, 0.05), MAT.iron(), x, height / 2, 0);
    g.add(post);
  });

  // vertical bars with a gap in the middle for the service window
  const barCount = 14;
  const gapStart = -0.35;
  const gapEnd = 0.35;
  for (let i = 0; i < barCount; i++) {
    const t = (i + 0.5) / barCount - 0.5;
    const x = t * width;
    if (x > gapStart && x < gapEnd) continue;
    const bar = mesh(new THREE.CylinderGeometry(0.01, 0.01, height, 6), MAT.iron(), x, height / 2, 0);
    g.add(bar);
  }

  // arched header over the service opening
  const archSegments = 10;
  for (let i = 0; i <= archSegments; i++) {
    const t = i / archSegments;
    const a = Math.PI * t;
    const x = Math.cos(a) * (gapEnd - gapStart) * 0.5;
    const y = height * 0.55 + Math.sin(a) * 0.25;
    const seg = mesh(new THREE.SphereGeometry(0.012, 6, 6), MAT.iron(), x, y, 0);
    g.add(seg);
  }

  // small brass counter ledge at the base of the window
  const ledge = mesh(new THREE.BoxGeometry(gapEnd - gapStart, 0.02, 0.1), MAT.brass(), 0, 0.02, 0.05);
  g.add(ledge);

  // decorative scrollwork finials on top of the side posts
  [-width / 2, width / 2].forEach((x) => {
    const finial = mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12), MAT.iron(), x, height + 0.02, 0);
    finial.rotation.x = Math.PI / 2;
    g.add(finial);
  });

  return g;
}

/** Banker's writing desk with a leather insert, ledger book, inkwell, and a green banker's lamp. */
export function buildBankersDesk(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bankers-desk';

  const w = 1.5 * WORLD_SCALE;
  const d = 0.8 * WORLD_SCALE;
  const h = 0.75 * WORLD_SCALE;

  const top = mesh(new THREE.BoxGeometry(w, 0.05, d), MAT.woodMed(), 0, h, 0);
  g.add(top);

  const leatherInset = mesh(new THREE.BoxGeometry(w * 0.75, 0.005, d * 0.6), MAT.leatherGreen(), 0, h + 0.028, 0);
  g.add(leatherInset);

  // side drawer stacks (two pedestals)
  [-1, 1].forEach((side) => {
    const pedestal = mesh(new THREE.BoxGeometry(0.35, h - 0.05, d), MAT.woodDark(), (side * w) / 2 - side * 0.2, (h - 0.05) / 2, 0);
    g.add(pedestal);
    for (let i = 0; i < 3; i++) {
      const drawer = mesh(
        new THREE.BoxGeometry(0.3, 0.18, 0.02),
        MAT.woodMed(),
        (side * w) / 2 - side * 0.2,
        0.15 + i * 0.2,
        d / 2 + 0.01
      );
      g.add(drawer);
      const handle = mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 10), MAT.brass(), drawer.position.x, drawer.position.y, d / 2 + 0.03);
      handle.rotation.x = Math.PI / 2;
      g.add(handle);
    }
  });

  // center kneehole trim
  const kneeTrim = mesh(new THREE.BoxGeometry(w * 0.3, 0.06, d), MAT.woodTrim(), 0, h - 0.02, 0);
  g.add(kneeTrim);

  // ledger book (open, with a painted "LEDGER" cover texture on the closed half)
  const ledgerTex = signTexture({ text: 'LEDGER', bg: LEATHER_MAROON, fg: '#c9a75a', w: 300, h: 200, border: true });
  const ledgerCover = mesh(new THREE.BoxGeometry(0.24, 0.02, 0.3), stdMat(LEATHER_MAROON, ledgerTex), -0.3, h + 0.04, -0.1);
  g.add(ledgerCover);
  const ledgerPages = mesh(new THREE.BoxGeometry(0.22, 0.03, 0.28), MAT.parchment(), -0.3, h + 0.055, 0.15);
  ledgerPages.rotation.x = -0.15;
  g.add(ledgerPages);

  // inkwell + quill
  const inkwell = mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 10), MAT.brass(), 0.35, h + 0.05, -0.1);
  g.add(inkwell);
  const quill = mesh(new THREE.CylinderGeometry(0.003, 0.006, 0.22, 6), MAT.woodTrim(), 0.38, h + 0.15, -0.08);
  quill.rotation.z = 0.5;
  quill.rotation.x = 0.3;
  g.add(quill);

  // green-glass banker's lamp
  const lampBase = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 12), MAT.brass(), 0.35, h + 0.035, 0.15);
  g.add(lampBase);
  const lampPole = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 8), MAT.brass(), 0.35, h + 0.14, 0.15);
  g.add(lampPole);
  const lampShade = mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), stdMat(LEATHER_GREEN, null, { roughness: 0.3 }), 0.35, h + 0.25, 0.15);
  lampShade.rotation.x = Math.PI;
  g.add(lampShade);
  const bulb = mesh(new THREE.SphereGeometry(0.025, 8, 8), MAT.glassWarm(), 0.35, h + 0.22, 0.15);
  g.add(bulb);
  const lampLight = new THREE.PointLight(0xfff0c0, 0.5, 2.2, 2);
  lampLight.position.set(0.35, h + 0.21, 0.15);
  g.add(lampLight);

  return g;
}

/** Tufted leather high-back chair on a brass 5-spoke caster base. */
export function buildBankersChair(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bankers-chair';

  const seatH = 0.5 * WORLD_SCALE;

  const seat = mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.08, 16), MAT.leatherGreen(), 0, seatH, 0);
  g.add(seat);

  const backrest = mesh(new THREE.BoxGeometry(0.44, 0.55, 0.08), MAT.leatherGreen(), 0, seatH + 0.35, -0.2);
  backrest.rotation.x = -0.08;
  g.add(backrest);

  // tufting buttons grid on the backrest for extra detail
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const bx = -0.14 + c * 0.14;
      const by = seatH + 0.14 + r * 0.16;
      const button = mesh(new THREE.SphereGeometry(0.012, 6, 6), MAT.brassDark(), bx, by, -0.16 - r * 0.01);
      g.add(button);
    }
  }

  // central gas-lift column
  const column = mesh(new THREE.CylinderGeometry(0.03, 0.04, seatH - 0.15, 10), MAT.brass(), 0, (seatH - 0.15) / 2 + 0.1, 0);
  g.add(column);

  // 5-spoke caster base
  const hub = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), MAT.brassDark(), 0, 0.1, 0);
  g.add(hub);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 6), MAT.brassDark(), (Math.cos(a) * 0.28) / 2, 0.1, (Math.sin(a) * 0.28) / 2);
    leg.rotation.z = Math.PI / 2;
    leg.rotation.y = -a;
    g.add(leg);
    const caster = mesh(new THREE.SphereGeometry(0.025, 8, 8), MAT.iron(), Math.cos(a) * 0.28, 0.03, Math.sin(a) * 0.28);
    g.add(caster);
  }

  return g;
}

/** Wall panel of small numbered brass safe-deposit-box doors. */
export function buildSafeDepositWall(cols = 6, rows = 4): THREE.Group {
  const g = new THREE.Group();
  g.name = 'safe-deposit-wall';

  const boxSize = 0.24;
  const gap = 0.03;
  const panelW = cols * (boxSize + gap);
  const panelH = rows * (boxSize + gap);

  const backing = mesh(new THREE.BoxGeometry(panelW + 0.1, panelH + 0.1, 0.06), MAT.woodDark(), 0, panelH / 2 + 0.4, 0);
  g.add(backing);

  let n = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -panelW / 2 + c * (boxSize + gap) + boxSize / 2;
      const y = panelH - r * (boxSize + gap) - boxSize / 2 + 0.4;

      const doorTex = brassTexture(BRASS);
      const door = mesh(new THREE.BoxGeometry(boxSize, boxSize, 0.03), metalMat(BRASS, doorTex), x, y, 0.045);
      g.add(door);

      const dial = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 12), MAT.brassDark(), x - boxSize * 0.22, y, 0.06);
      dial.rotation.x = Math.PI / 2;
      g.add(dial);

      const handle = mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), MAT.brassDark(), x + boxSize * 0.28, y, 0.065);
      g.add(handle);

      // tiny engraved number plate
      if (n <= 999) {
        const numTex = signTexture({ text: String(n), bg: '#171717', fg: BRASS, w: 80, h: 50, border: false, font: 'bold 26px Georgia, serif' });
        const plate = mesh(new THREE.PlaneGeometry(0.06, 0.03), stdMat('#171717', numTex), x, y - boxSize * 0.3, 0.061);
        g.add(plate);
      }
      n++;
    }
  }

  return g;
}

/** Free-standing cast-iron floor safe with a gold trim line and combination dial. */
export function buildFloorSafe(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'floor-safe';

  const size = 0.7 * WORLD_SCALE;
  const body = mesh(new THREE.BoxGeometry(size, size * 0.9, size * 0.8), MAT.iron(), 0, (size * 0.9) / 2, 0);
  g.add(body);

  // gold trim band
  const trim = mesh(new THREE.BoxGeometry(size + 0.01, 0.03, size * 0.8 + 0.01), MAT.brass(), 0, size * 0.9 * 0.75, 0);
  g.add(trim);

  // door face with dial + handle wheel
  const door = mesh(new THREE.BoxGeometry(size * 0.9, size * 0.8, 0.03), MAT.iron(), 0, (size * 0.9) / 2, size * 0.4 + 0.02);
  g.add(door);

  const dialPlate = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 20), MAT.brass(), 0.15, size * 0.55, size * 0.4 + 0.04);
  dialPlate.rotation.x = Math.PI / 2;
  g.add(dialPlate);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const tick = mesh(new THREE.BoxGeometry(0.004, 0.015, 0.004), MAT.brassDark(), 0.15 + Math.cos(a) * 0.07, size * 0.55 + Math.sin(a) * 0.07, size * 0.4 + 0.055);
    g.add(tick);
  }
  const dialKnob = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 10), MAT.brassDark(), 0.15, size * 0.55, size * 0.4 + 0.06);
  dialKnob.rotation.x = Math.PI / 2;
  g.add(dialKnob);

  const handleWheel = mesh(new THREE.TorusGeometry(0.08, 0.015, 8, 16), MAT.brass(), -0.15, size * 0.45, size * 0.4 + 0.05);
  g.add(handleWheel);

  // squat feet
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const foot = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.05, 10), MAT.iron(), (sx * size) / 2.4, 0.025, (sz * size * 0.8) / 2.4);
    g.add(foot);
  });

  return g;
}

/** Tall case (grandfather) clock with a painted roman-numeral face and pendulum. */
export function buildGrandfatherClock(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'grandfather-clock';

  const height = 2.2 * WORLD_SCALE;
  const body = mesh(new THREE.BoxGeometry(0.5, height * 0.75, 0.32), MAT.woodDark(), 0, (height * 0.75) / 2, 0);
  g.add(body);

  const hood = mesh(new THREE.BoxGeometry(0.44, height * 0.22, 0.3), MAT.woodDark(), 0, height * 0.75 + (height * 0.22) / 2, 0);
  g.add(hood);

  const crown = mesh(new THREE.ConeGeometry(0.28, 0.22, 4), MAT.woodDark(), 0, height * 0.97 + 0.11, 0);
  crown.rotation.y = Math.PI / 4;
  g.add(crown);

  const finial = mesh(new THREE.SphereGeometry(0.03, 8, 8), MAT.brass(), 0, height * 0.97 + 0.24, 0);
  g.add(finial);

  // glass-fronted face
  const faceTex = clockFaceTexture();
  const face = mesh(new THREE.CircleGeometry(0.16, 32), stdMat('#f2ead6', faceTex), 0, height * 0.86, 0.161);
  g.add(face);
  const faceRing = mesh(new THREE.TorusGeometry(0.17, 0.012, 8, 24), MAT.brass(), 0, height * 0.86, 0.16);
  g.add(faceRing);

  // lower cabinet glass door revealing the pendulum
  const doorGlass = mesh(
    new THREE.PlaneGeometry(0.32, height * 0.45),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.25, roughness: 0.1 }),
    0,
    height * 0.36,
    0.161
  );
  g.add(doorGlass);
  const pendulumRod = mesh(new THREE.CylinderGeometry(0.006, 0.006, height * 0.35, 6), MAT.brass(), 0, height * 0.4, 0.1);
  g.add(pendulumRod);
  const pendulumBob = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), MAT.brass(), 0, height * 0.23, 0.1);
  pendulumBob.rotation.x = Math.PI / 2;
  g.add(pendulumBob);

  // weights hint (two thin brass cylinders beside the pendulum)
  [-0.08, 0.08].forEach((x) => {
    const weight = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 10), MAT.brassDark(), x, height * 0.45, 0.09);
    g.add(weight);
  });

  return g;
}

/** Wall-mounted brass gas lamp with a warm lit glass globe. */
export function buildGasWallLamp(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'gas-wall-lamp';

  const backplate = mesh(new THREE.BoxGeometry(0.08, 0.14, 0.02), MAT.brassDark(), 0, 0, -0.01);
  g.add(backplate);

  // curved bracket arm approximated with two angled segments
  const arm1 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 8), MAT.brass(), 0.05, 0.04, 0);
  arm1.rotation.z = Math.PI / 2.6;
  g.add(arm1);
  const arm2 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), MAT.brass(), 0.16, 0.12, 0);
  arm2.rotation.z = Math.PI / 8;
  g.add(arm2);

  const fitting = mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.05, 10), MAT.brassDark(), 0.22, 0.17, 0);
  g.add(fitting);

  const globe = mesh(new THREE.SphereGeometry(0.07, 14, 10), MAT.glassWarm(), 0.22, 0.24, 0);
  g.add(globe);

  const cap = mesh(new THREE.ConeGeometry(0.04, 0.05, 10), MAT.brass(), 0.22, 0.32, 0);
  g.add(cap);

  const light = new THREE.PointLight(0xffb066, 0.7, 3, 2);
  light.position.set(0.22, 0.24, 0);
  g.add(light);

  return g;
}

/** Fluted marble column with capital and plinth. */
export function buildMarbleColumn(height = 2.6 * WORLD_SCALE): THREE.Group {
  const g = new THREE.Group();
  g.name = 'marble-column';

  const radius = 0.18 * WORLD_SCALE;

  const plinth = mesh(new THREE.BoxGeometry(radius * 2.6, 0.15, radius * 2.6), MAT.marble(), 0, 0.075, 0);
  g.add(plinth);

  const shaft = mesh(new THREE.CylinderGeometry(radius, radius * 1.05, height - 0.5, 20), MAT.marble(), 0, 0.15 + (height - 0.5) / 2, 0);
  g.add(shaft);

  // flutes: thin vertical grooves suggested via darker inset strips
  const fluteCount = 16;
  for (let i = 0; i < fluteCount; i++) {
    const a = (i / fluteCount) * Math.PI * 2;
    const flute = mesh(
      new THREE.BoxGeometry(0.012, height - 0.6, 0.012),
      stdMat(MARBLE_VEIN, null, { roughness: 0.3 }),
      Math.cos(a) * radius * 0.98,
      0.2 + (height - 0.6) / 2,
      Math.sin(a) * radius * 0.98
    );
    flute.rotation.y = -a;
    g.add(flute);
  }

  const capital = mesh(new THREE.CylinderGeometry(radius * 1.4, radius, 0.22, 20), MAT.marble(), 0, height - 0.13, 0);
  g.add(capital);
  const abacus = mesh(new THREE.BoxGeometry(radius * 3, 0.08, radius * 3), MAT.marble(), 0, height - 0.02, 0);
  g.add(abacus);

  return g;
}

/** Tied cloth money bag with a rope-knot neck. */
export function buildMoneyBag(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'money-bag';

  const sack = mesh(new THREE.SphereGeometry(0.14, 14, 10), stdMat('#8a7a5a', null, { roughness: 0.95 }), 0, 0.13, 0);
  sack.scale.set(1, 0.9, 1);
  g.add(sack);

  const neck = mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.1, 10), stdMat('#8a7a5a', null, { roughness: 0.95 }), 0, 0.24, 0);
  g.add(neck);

  const knot = mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 12), stdMat('#5a4a30', null, { roughness: 0.9 }), 0, 0.28, 0);
  knot.rotation.x = Math.PI / 2;
  g.add(knot);

  // a couple of coins spilled at the base for detail
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const coin = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.008, 12), MAT.brass(), Math.cos(angle) * 0.16, 0.005, Math.sin(angle) * 0.16);
    coin.rotation.x = Math.PI / 2;
    coin.rotation.z = i * (Math.PI / 2);
    g.add(coin);
  }

  return g;
}

/** Stack of gold coins with one leaning coin for visual detail. */
export function buildCoinStack(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'coin-stack';

  const coinCount = 10;
  for (let i = 0; i < coinCount; i++) {
    const coin = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.007, 16), MAT.brass(), 0, 0.0035 + i * 0.0075, 0);
    coin.rotation.y = i * 0.3;
    g.add(coin);
  }

  const leaning = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.007, 16), MAT.brass(), 0.045, 0.03, 0);
  leaning.rotation.z = Math.PI / 2.3;
  g.add(leaning);

  return g;
}

/** Patterned area rug for the bank lobby floor.
 *  An axis-aligned thin BOX (woven top, plain dyed-wool sides) instead of a
 *  rotated plane: the root keeps identity rotation — ThreeRendererAdapter
 *  OWNS the transform and would flatten any builder-baked rotation — and the
 *  1.2 cm slab gives the rug believable thickness from every angle. */
export function buildFloorRug(w = 2.4 * WORLD_SCALE, d = 1.6 * WORLD_SCALE): THREE.Group {
  const g = new THREE.Group();
  g.name = 'floor-rug';

  const tex = rugTexture();
  const topMat = stdMat(RUG_RED, tex, { roughness: 0.95 });
  const sideMat = stdMat('#6b1717', null, { roughness: 0.95 });
  // BoxGeometry material order: +x, −x, +y (top), −y, +z, −z.
  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.012, d),
    [sideMat, sideMat, topMat, sideMat, sideMat, sideMat],
  );
  rug.receiveShadow = true;
  rug.name = 'floor-rug-weave';
  g.add(rug);
  return g;
}

/** Hanging painted "BANK" sign on a short brass chain. */
export function buildBankSign(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bank-sign';

  const chainLen = 0.3;
  [-0.25, 0.25].forEach((x) => {
    const chain = mesh(new THREE.CylinderGeometry(0.006, 0.006, chainLen, 6), MAT.brassDark(), x, chainLen / 2 + 0.02, 0);
    g.add(chain);
  });

  const tex = signTexture({ text: 'BANK', sub: 'EST. 1881', w: 512, h: 220 });
  const board = mesh(new THREE.BoxGeometry(0.9, 0.35, 0.03), stdMat(PARCHMENT, tex), 0, chainLen + 0.2, 0);
  g.add(board);
  const frame = mesh(new THREE.BoxGeometry(0.94, 0.39, 0.015), MAT.woodDark(), 0, chainLen + 0.2, -0.01);
  g.add(frame);

  return g;
}

// ---------------------------------------------------------------------------
// One-call convenience: a full furnished bank lobby corner
// ---------------------------------------------------------------------------

export function buildBankInteriorScene(): THREE.Group {
  const scene = new THREE.Group();
  scene.name = 'bank-interior-scene';

  const rug = buildFloorRug(3, 2);
  rug.position.set(0, 0, 1.2);
  scene.add(rug);

  const counter = buildTellerCounter(3.2);
  counter.position.set(0, 0, -2);
  scene.add(counter);

  const cage = buildTellerCage(3.0);
  cage.position.set(0, 1.17, -2);
  scene.add(cage);

  const vault = buildBankVaultDoor();
  vault.position.set(-2.6, 0, -3.2);
  vault.rotation.y = Math.PI / 2;
  scene.add(vault);

  const safeWall = buildSafeDepositWall(6, 4);
  safeWall.position.set(2.8, 0, -3.3);
  safeWall.rotation.y = -Math.PI / 2;
  scene.add(safeWall);

  const floorSafe = buildFloorSafe();
  floorSafe.position.set(2.2, 0, -2.2);
  floorSafe.rotation.y = -0.4;
  scene.add(floorSafe);

  const desk = buildBankersDesk();
  desk.position.set(1.4, 0, 1.5);
  desk.rotation.y = Math.PI * 0.15;
  scene.add(desk);

  const chair = buildBankersChair();
  chair.position.set(1.4, 0, 2.0);
  chair.rotation.y = Math.PI * 1.1;
  scene.add(chair);

  const clock = buildGrandfatherClock();
  clock.position.set(-3, 0, 0.5);
  clock.rotation.y = Math.PI / 2;
  scene.add(clock);

  [-1.5, 1.5].forEach((x) => {
    const column = buildMarbleColumn(2.6);
    column.position.set(x, 0, -0.5);
    scene.add(column);
  });

  const lamp1 = buildGasWallLamp();
  lamp1.position.set(-3.1, 1.6, -1.5);
  lamp1.rotation.y = Math.PI / 2;
  scene.add(lamp1);
  const lamp2 = buildGasWallLamp();
  lamp2.position.set(3.1, 1.6, -1.5);
  lamp2.rotation.y = -Math.PI / 2;
  scene.add(lamp2);

  const bag1 = buildMoneyBag();
  bag1.position.set(0.7, 1.2, -2.15);
  scene.add(bag1);

  const coins1 = buildCoinStack();
  coins1.position.set(0.5, 1.2, -2.2);
  scene.add(coins1);
  const coins2 = buildCoinStack();
  coins2.position.set(-0.5, 1.2, -2.2);
  scene.add(coins2);

  const sign = buildBankSign();
  sign.position.set(0, 2.3, 3.9);
  scene.add(sign);

  return scene;
}


// ---------------------------------------------------------------------------
// CURRENT Ai-western_game IAssetFactory integration
// ---------------------------------------------------------------------------

class BankAssetFactory implements IAssetFactory {
  constructor(private readonly builder: () => THREE.Object3D) {}

  create(_definition: ObjectDefinition): THREE.Object3D {
    // Intentionally do not apply transform/uuid/name here.
    return this.builder();
  }
}

export const BANK_INTERIOR_ASSET_TYPES = Object.freeze([
  'bank-vault-door',
  'teller-counter',
  'teller-cage',
  'bankers-desk',
  'bankers-chair',
  'safe-deposit-wall',
  'floor-safe',
  'grandfather-clock',
  'gas-wall-lamp',
  'marble-column',
  'money-bag',
  'coin-stack',
  'floor-rug',
  'bank-sign',
  'bank-interior-scene',
] as const);

export type BankInteriorAssetType = (typeof BANK_INTERIOR_ASSET_TYPES)[number];

export function registerBankFactories(registry: AssetRegistry): void {
  registry.register('bank-vault-door', new BankAssetFactory(buildBankVaultDoor), 'Bank Vault Door');
  registry.register('teller-counter', new BankAssetFactory(() => buildTellerCounter()), 'Teller Counter');
  registry.register('teller-cage', new BankAssetFactory(() => buildTellerCage()), 'Teller Cage');
  registry.register('bankers-desk', new BankAssetFactory(buildBankersDesk), "Banker's Desk");
  registry.register('bankers-chair', new BankAssetFactory(buildBankersChair), "Banker's Chair");
  registry.register('safe-deposit-wall', new BankAssetFactory(() => buildSafeDepositWall()), 'Safe Deposit Wall');
  registry.register('floor-safe', new BankAssetFactory(buildFloorSafe), 'Floor Safe');
  registry.register('grandfather-clock', new BankAssetFactory(buildGrandfatherClock), 'Grandfather Clock');
  registry.register('gas-wall-lamp', new BankAssetFactory(buildGasWallLamp), 'Gas Wall Lamp');
  registry.register('marble-column', new BankAssetFactory(() => buildMarbleColumn()), 'Marble Column');
  registry.register('money-bag', new BankAssetFactory(buildMoneyBag), 'Money Bag');
  registry.register('coin-stack', new BankAssetFactory(buildCoinStack), 'Coin Stack');
  registry.register('floor-rug', new BankAssetFactory(() => buildFloorRug()), 'Floor Rug');
  registry.register('bank-sign', new BankAssetFactory(buildBankSign), 'Bank Sign');
  registry.register('bank-interior-scene', new BankAssetFactory(buildBankInteriorScene), 'Bank Interior Scene');
}
