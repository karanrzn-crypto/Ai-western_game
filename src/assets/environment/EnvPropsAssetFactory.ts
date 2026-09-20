/**
 * src/assets/environment/EnvPropsAssetFactory.ts
 * -----------------------------------------------------------------------------
 * WESTERN TOWN STREET & FARM PROP BUILDERS (environment round).
 *
 * Hand-built procedural props used by the redesigned town plan:
 *   dirt-road · town-well · bench · street-lamp · hitching-post · wagon ·
 *   town-sign · hay-bale · windmill · crop-row
 *
 * Conventions (same contract as every other asset module):
 *   • Factories build the Object3D rooted at the local ground (y = 0) and
 *     NEVER apply the def transform — the renderer adapter owns transforms.
 *   • Module-level caches: each distinct texture/material is painted ONCE.
 *   • Determinism: every formerly random scatter uses a seeded RNG
 *     (mulberry32) so headless builds and boots are identical.
 *   • Composite colliders are declared in ENV_PROP_COLLIDERS in the exact
 *     CollisionWorld `{ boxes: [{ size, offset }] }` payload form.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { AssetRegistry } from '../AssetRegistry.js';
import type { ColliderBoxSpec } from '../TownExteriorAssetFactory.js';

// ---------------------------------------------------------------------------
// Deterministic RNG (same pattern as TownExteriorAssetFactory)
// ---------------------------------------------------------------------------

/** Small deterministic PRNG — same numbers on every boot/build. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Shared material / texture caches
// ---------------------------------------------------------------------------

const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 0.95 });
const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x5e4b34, roughness: 1 });
const woodWeatherMat = new THREE.MeshStandardMaterial({ color: 0x74624a, roughness: 1 });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.7, metalness: 0.35 });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 1 });
const shingleMat = new THREE.MeshStandardMaterial({ color: 0x7b6a50, roughness: 1 });
const hayMat = new THREE.MeshStandardMaterial({ color: 0xc2a55e, roughness: 1 });
const waterMat = new THREE.MeshStandardMaterial({ color: 0x27303a, roughness: 0.25, metalness: 0.1 });
const lanternGlassMat = new THREE.MeshStandardMaterial({
  color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 0.85, roughness: 0.4,
});
const dirtRoadMat = new THREE.MeshStandardMaterial({
  color: 0x9b8352, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
});

/** Weathered sign texture per unique text (painted once per text). */
const signTextureCache = new Map<string, THREE.CanvasTexture>();
function getSignTexture(text: string): THREE.CanvasTexture {
  const cached = signTextureCache.get(text);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 144;
  const ctx = canvas.getContext('2d')!;
  // Weathered wood base with grain streaks.
  ctx.fillStyle = '#7a6446'; ctx.fillRect(0, 0, 512, 144);
  const rng = mulberry32(text.length * 7919 + 42);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(94,75,52,0.35)' : 'rgba(140,116,84,0.3)';
    const y = rng() * 144;
    ctx.fillRect(0, y, 512, 1 + rng() * 3);
  }
  ctx.strokeStyle = '#4a3a26'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 496, 128);
  ctx.strokeStyle = 'rgba(74,58,38,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(20, 20, 472, 104);
  ctx.fillStyle = '#2e2318';
  ctx.font = 'bold 78px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 76, 460);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  signTextureCache.set(text, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Builders — all return a Group rooted at the local ground plane
// ---------------------------------------------------------------------------

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 10): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/**
 * Irregular dirt-road patch. Built along LOCAL Z (length), width on X.
 * metadata.lift raises the patch a few mm above the ground (z-fight safe);
 * metadata.seed + metadata.wobble drive the organic snaking + edge jitter.
 */
export function buildDirtRoad(definition: ObjectDefinition): THREE.Group {
  const group = new THREE.Group();
  const meta = definition.metadata as { length?: number; width?: number; lift?: number; seed?: number; wobble?: number };
  const length = Math.max(2, Number(meta.length ?? 10));
  const width = Math.max(2, Number(meta.width ?? 6));
  const lift = Number(meta.lift ?? 0.03);
  const seed = Number(meta.seed ?? 1);
  const wobble = Number(meta.wobble ?? 0.35);
  const rng = mulberry32(seed);

  const segL = Math.max(2, Math.ceil(length / 2.2));
  const geo = new THREE.PlaneGeometry(width, length, 4, segL);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const phase = rng() * Math.PI * 2;
  const freq = 0.35 + rng() * 0.3;
  for (let i =0; i < pos.count; i++) {
    const px = pos.getX(i); const pz = pos.getZ(i);
    // Whole-strip snaking (path curve) + ragged edges (dirt look).
    const snake = Math.sin(pz * freq + phase) * wobble;
    let nx = px + snake;
    if (Math.abs(Math.abs(px) - width / 2) < 0.01) nx += (rng() - 0.5) * Math.min(1.4, width * 0.16);
    if (Math.abs(Math.abs(pz) - length / 2) < 0.01) pos.setZ(i, pz + (rng() - 0.5) * 0.8);
    pos.setX(i, nx);
  }
  geo.computeVertexNormals();
  geo.translate(0, lift, 0);
  const mesh = new THREE.Mesh(geo, dirtRoadMat);
  mesh.receiveShadow = true;
  mesh.name = 'road-surface';
  group.add(mesh);
  return group;
}

/** Stone well with post-and-gable roof, rope + bucket — the square centerpiece. */
export function buildTownWell(): THREE.Group {
  const group = new THREE.Group();
  const ring = cyl(1.08, 1.18, 0.9, stoneMat, 0, 0.45, 0, 12);
  group.add(ring);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.86, 12), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = 0.74;
  group.add(water);
  // Stone ring cap segments for a hand-built look.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const stone = box(0.5, 0.14, 0.3, stoneMat, Math.cos(a) * 1.1, 0.95, Math.sin(a) * 1.1);
    stone.rotation.y = -a;
    group.add(stone);
  }
  group.add(box(0.14, 1.9, 0.14, woodDarkMat, -0.95, 1.8, 0));
  group.add(box(0.14, 1.9, 0.14, woodDarkMat, 0.95, 1.8, 0));
  group.add(box(2.2, 0.12, 0.12, woodDarkMat, 0, 2.66, 0));
  group.add(cyl(0.015, 0.015, 0.62, ironMat, 0, 2.32, 0, 6));
  group.add(cyl(0.17, 0.14, 0.24, woodDarkMat, 0, 1.95, 0, 10));
  // Gable roof.
  const panelL = box(1.35, 0.06, 1.6, shingleMat, -0.62, 3.06, 0);
  panelL.rotation.z = 0.5;
  const panelR = box(1.35, 0.06, 1.6, shingleMat, 0.62, 3.06, 0);
  panelR.rotation.z = -0.5;
  group.add(panelL, panelR);
  group.add(box(0.1, 0.08, 1.7, woodDarkMat, 0, 3.42, 0));
  return group;
}

/**
 * Porch/square bench — ADULT SCALE (user bug round: the old 1.72 m bench read
 * as child furniture next to the 1.83 m Ranger). Seat 2.3 × 0.66 m at 0.53 m,
 * full-height back posts to 1.04 m with a raked two-slat back + cap, armrests
 * on the side frames. Faces local +Z (the back leans to local −Z).
 */
export function buildBench(): THREE.Group {
  const group = new THREE.Group();
  const len = 2.3;
  const depth = 0.66;
  const seatTop = 0.55;
  const backTop = 1.04;
  const halfL = len / 2;
  for (const sx of [-1, 1]) {
    const x = sx * (halfL - 0.07);
    // Front leg (to the seat rail) + full-height back post.
    group.add(box(0.1, seatTop - 0.08, 0.09, woodDarkMat, x, (seatTop - 0.08) / 2, depth / 2 - 0.08));
    group.add(box(0.1, backTop, 0.09, woodDarkMat, x, backTop / 2, -depth / 2 + 0.09));
    // Seat rail + lower stretcher between the legs.
    group.add(box(0.12, 0.06, depth - 0.1, woodDarkMat, x, seatTop - 0.07, 0));
    group.add(box(0.07, 0.05, depth - 0.24, woodDarkMat, x, 0.16, 0));
    // Armrest: back post → forward support → front tip.
    group.add(box(0.13, 0.05, depth - 0.04, woodMat, x, 0.75, 0.02));
    group.add(box(0.06, 0.19, 0.06, woodDarkMat, x, 0.645, depth / 2 - 0.14));
  }
  // Seat slats (4 × 0.15 with gaps) on the seat rails.
  for (let i = 0; i < 4; i++) {
    const z = depth / 2 - 0.095 - i * 0.157;
    group.add(box(len, 0.045, 0.15, woodMat, 0, seatTop - 0.0225, z));
  }
  // Backrest: two raked slats + top cap, mounted on the back posts.
  const tilt = -0.16; // ~9° rake back
  for (const y of [0.68, 0.86]) {
    const slat = box(len - 0.02, 0.14, 0.045, woodMat, 0, y, -depth / 2 + 0.09);
    slat.rotation.x = tilt;
    group.add(slat);
  }
  const cap = box(len, 0.06, 0.1, woodDarkMat, 0, backTop - 0.03, -depth / 2 + 0.09);
  cap.rotation.x = tilt;
  group.add(cap);
  return group;
}

/** Wooden street lamp: post + arm + hanging emissive lantern. */
export function buildStreetLamp(): THREE.Group {
  const group = new THREE.Group();
  group.add(cyl(0.17, 0.22, 0.26, ironMat, 0, 0.13, 0, 10));
  group.add(cyl(0.055, 0.085, 3.0, woodWeatherMat, 0, 1.76, 0, 8));
  group.add(box(0.72, 0.08, 0.08, woodWeatherMat, 0.3, 3.2, 0));
  group.add(cyl(0.02, 0.02, 0.16, ironMat, 0.58, 3.08, 0, 6));
  const glass = box(0.24, 0.32, 0.24, lanternGlassMat, 0.58, 2.82, 0);
  glass.name = 'lamp-glass';
  group.add(glass);
  group.add(cyl(0.16, 0.19, 0.05, ironMat, 0.58, 3.0, 0, 8));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.14, 4), ironMat);
  cap.position.set(0.58, 3.06, 0); cap.rotation.y = Math.PI / 4;
  group.add(cap);
  return group;
}

/**
 * Hitching rail — REAL WESTERN STRUCTURE (user bug round: two bare posts + one
 * plank read as primitive blocks). Square chamfered posts with dome caps and
 * buried feet, top + lower rails, diagonal end braces, and a coiled rope loop
 * hung over the top rail. metadata.seed drives slight per-instance variation
 * (height ±4 cm, lean ±1.5°, rope side) — the layout ships a distinct seed.
 * Built along X; total length 1.9 m, rails at 0.93 / 0.62 m.
 */
export function buildHitchingPost(definition?: ObjectDefinition): THREE.Group {
  const group = new THREE.Group();
  const seed = Number((definition?.metadata as { seed?: number } | undefined)?.seed ?? 3);
  const rng = mulberry32(seed);
  const j = (range: number) => (rng() - 0.5) * 2 * range;

  const postH = 1.02 + j(0.04);
  const ropeSide = rng() > 0.5 ? 1 : -1;
  for (const sx of [-1, 1]) {
    const x = sx * 0.8;
    // Post: buried 2 cm, tiny lean, chamfer cap.
    const post = box(0.11, postH + 0.02, 0.11, woodDarkMat, x, (postH + 0.02) / 2 - 0.02, 0);
    post.rotation.z = j(0.015);
    post.rotation.x = j(0.015);
    group.add(post);
    group.add(box(0.15, 0.045, 0.15, woodWeatherMat, x, postH + 0.02, 0)); // dome cap
    // Diagonal brace post→rail.
    const brace = box(0.05, 0.42, 0.05, woodWeatherMat, x - sx * 0.17, postH - 0.24, 0);
    brace.rotation.z = sx * 0.62;
    group.add(brace);
  }
  // Top rail + lower rail (slightly narrower), plus a rope loop.
  group.add(box(1.9, 0.09, 0.055, woodMat, 0, postH - 0.09 + j(0.015), 0));
  group.add(box(1.9, 0.07, 0.04, woodWeatherMat, 0, 0.62 + j(0.02), 0));
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.013, 6, 14, Math.PI * 1.25), ironMat);
  rope.name = 'hitch-rope-loop';
  rope.position.set(ropeSide * 0.45, postH - 0.13, 0);
  rope.rotation.z = Math.PI; // arc hangs DOWN over the rail
  rope.rotation.y = Math.PI / 2;
  rope.castShadow = false;
  rope.receiveShadow = true;
  group.add(rope);
  return group;
}

/** Wooden wagon: bed, side boards, four wheels, draw pole. */
export function buildWagon(): THREE.Group {
  const group = new THREE.Group();
  group.add(box(2.7, 0.16, 1.5, woodMat, 0, 0.86, 0));
  group.add(box(2.7, 0.3, 0.07, woodWeatherMat, 0, 1.06, 0.72));
  group.add(box(2.7, 0.3, 0.07, woodWeatherMat, 0, 1.06, -0.72));
  group.add(box(0.07, 0.3, 1.5, woodWeatherMat, -1.32, 1.06, 0));
  const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.09, 12);
  for (const [x, z] of [[-1.05, 0.78], [1.05, 0.78], [-1.05, -0.78], [1.05, -0.78]]) {
    const wheel = new THREE.Mesh(wheelGeo, woodDarkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.55, z);
    wheel.castShadow = true;
    group.add(wheel);
    const hub = cyl(0.09, 0.09, 0.14, ironMat, x, 0.55, z, 8);
    hub.rotation.z = Math.PI / 2;
    group.add(hub);
  }
  group.add(box(1.0, 0.09, 0.09, woodDarkMat, 1.95, 0.72, 0));
  return group;
}

/** Town sign: two posts + text board (canvas texture per metadata.text). */
export function buildTownSign(definition: ObjectDefinition): THREE.Group {
  const group = new THREE.Group();
  const text = String((definition.metadata as { text?: string }).text ?? 'TOWN');
  group.add(box(0.13, 2.5, 0.13, woodDarkMat, -1.22, 1.25, 0));
  group.add(box(0.13, 2.5, 0.13, woodDarkMat, 1.22, 1.25, 0));
  const boardMats = [
    woodWeatherMat, woodWeatherMat,
    new THREE.MeshStandardMaterial({ map: getSignTexture(text), roughness: 0.95 }),
    woodWeatherMat, woodWeatherMat, woodWeatherMat,
  ];
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.78, 0.09), boardMats);
  board.position.y = 1.86; board.castShadow = true;
  group.add(board);
  group.add(box(3.05, 0.1, 0.14, woodDarkMat, 0, 2.32, 0));
  return group;
}

/** Round hay bale lying on its side (axis along local X). */
export function buildHayBale(): THREE.Group {
  const group = new THREE.Group();
  const bale = cyl(0.52, 0.52, 0.88, hayMat, 0, 0.52, 0, 14);
  bale.rotation.z = Math.PI / 2;
  group.add(bale);
  const swirl = cyl(0.53, 0.53, 0.06, woodWeatherMat, 0.2, 0.52, 0, 14);
  swirl.rotation.z = Math.PI / 2;
  group.add(swirl);
  return group;
}

/**
 * Farm windmill: lattice tower + spinning wheel (named 'windmill-wheel' —
 * the playable map rotates this child slowly around its local Z each frame)
 * + tail vane. Wheel faces local +Z.
 */
export function buildWindmill(): THREE.Group {
  const group = new THREE.Group();
  const legTop = 1.05; const legBottom = 1.7; const towerH = 5.6;
  // Four legs leaning from a wide ground spread to the narrow top.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const from = new THREE.Vector3(sx * legBottom, 0, sz * legBottom);
    const to = new THREE.Vector3(sx * legTop, towerH, sz * legTop);
    const dir = to.clone().sub(from);
    const leg = box(0.15, dir.length(), 0.15, woodWeatherMat, 0, 0, 0);
    leg.position.copy(from.clone().add(to).multiplyScalar(0.5));
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    group.add(leg);
  }
  for (const y of [1.8, 3.4, 4.9]) {
    const w = legBottom + ((legTop - legBottom) * y) / towerH;
    group.add(box(w * 2, 0.1, 0.1, woodWeatherMat, 0, y, w));
    group.add(box(w * 2, 0.1, 0.1, woodWeatherMat, 0, y, -w));
    group.add(box(0.1, 0.1, w * 2, woodWeatherMat, w, y, 0));
    group.add(box(0.1, 0.1, w * 2, woodWeatherMat, -w, y, 0));
  }
  group.add(box(2.5, 0.14, 2.5, woodDarkMat, 0, towerH + 0.07, 0));
  group.add(box(1.5, 1.1, 1.2, woodMat, 0, towerH + 0.7, 0));
  // The wheel: blades radiating in the local XY plane, axis = local Z.
  const wheel = new THREE.Group();
  wheel.name = 'windmill-wheel';
  const axle = cyl(0.09, 0.09, 0.7, ironMat, 0, 0, 0.35, 8);
  axle.rotation.x = Math.PI / 2;
  wheel.add(axle);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.045, 6, 20), woodDarkMat));
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 16), woodDarkMat));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const blade = box(0.34, 1.18, 0.03, woodMat, 0, 0, 0);
    blade.position.set(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0.06);
    blade.rotation.z = a - Math.PI / 2;
    blade.rotation.y = 0.42; // blade pitch so the wheel reads as a fan
    wheel.add(blade);
  }
  wheel.position.set(0, towerH + 0.7, 0.95);
  group.add(wheel);
  group.add(box(0.08, 0.08, 2.2, woodDarkMat, 0, towerH + 0.7, -1.6));
  group.add(box(0.06, 0.9, 0.7, woodMat, 0, towerH + 0.7, -2.6));
  return group;
}

/** Crop row: dark dirt mound + a line of young green sprouts (along X). */
export function buildCropRow(): THREE.Group {
  const group = new THREE.Group();
  const mound = box(6, 0.16, 0.85, new THREE.MeshStandardMaterial({ color: 0x77613f, roughness: 1 }), 0, 0.08, 0);
  mound.castShadow = false;
  group.add(mound);
  const sproutMat = new THREE.MeshStandardMaterial({ color: 0x7d8a4a, roughness: 1 });
  for (let i = 0; i < 12; i++) {
    const x = -2.75 + i * 0.5;
    const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 5), sproutMat);
    sprout.position.set(x, 0.32, 0);
    sprout.rotation.z = (i % 3 - 1) * 0.12;
    sprout.castShadow = true;
    group.add(sprout);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Collider payloads (exact CollisionWorld form)
// ---------------------------------------------------------------------------

/** Composite collider payloads for the prop types above. */
export const ENV_PROP_COLLIDERS: Readonly<Record<string, { readonly boxes: readonly ColliderBoxSpec[] }>> = Object.freeze({
  'town-well': Object.freeze({
    boxes: Object.freeze([Object.freeze({ size: Object.freeze({ x: 2.3, y: 1.7, z: 2.3 }), offset: Object.freeze({ x: 0, y: 0.85, z: 0 }) })]),
  }),
  'bench': Object.freeze({
    boxes: Object.freeze([Object.freeze({ size: Object.freeze({ x: 2.36, y: 1.05, z: 0.7 }), offset: Object.freeze({ x: 0, y: 0.525, z: 0 }) })]),
  }),
  'street-lamp': Object.freeze({
    boxes: Object.freeze([Object.freeze({ size: Object.freeze({ x: 0.36, y: 3.3, z: 0.36 }), offset: Object.freeze({ x: 0.1, y: 1.65, z: 0 }) })]),
  }),
  'hitching-post': Object.freeze({
    boxes: Object.freeze([Object.freeze({ size: Object.freeze({ x: 2.0, y: 1.1, z: 0.3 }), offset: Object.freeze({ x: 0, y: 0.55, z: 0 }) })]),
  }),
  'wagon': Object.freeze({
    boxes: Object.freeze([Object.freeze({ size: Object.freeze({ x: 3.0, y: 1.5, z: 1.7 }), offset: Object.freeze({ x: 0, y: 0.75, z: 0 }) })]),
  }),
  'town-sign': Object.freeze({
    boxes: Object.freeze([Object.freeze({ size: Object.freeze({ x: 3.0, y: 2.3, z: 0.32 }), offset: Object.freeze({ x: 0, y: 1.15, z: 0 }) })]),
  }),
  'hay-bale': Object.freeze({
    boxes: Object.freeze([Object.freeze({ size: Object.freeze({ x: 0.95, y: 1.05, z: 1.05 }), offset: Object.freeze({ x: 0, y: 0.52, z: 0 }) })]),
  }),
  'windmill': Object.freeze({
    boxes: Object.freeze([Object.freeze({ size: Object.freeze({ x: 2.2, y: 6.4, z: 2.2 }), offset: Object.freeze({ x: 0, y: 3.2, z: 0 }) })]),
  }),
  // Nature payloads (builders in EnvNatureAssetFactory keep matching fixed
  // base sizes; def scale varies them and CollisionWorld scales the boxes).
  'tree': Object.freeze({
    boxes: Object.freeze([Object.freeze({ size: Object.freeze({ x: 0.6, y: 3.4, z: 0.6 }), offset: Object.freeze({ x: 0, y: 1.7, z: 0 }) })]),
  }),
  'dead-tree': Object.freeze({
    boxes: Object.freeze([Object.freeze({ size: Object.freeze({ x: 0.5, y: 3.1, z: 0.5 }), offset: Object.freeze({ x: 0, y: 1.55, z: 0 }) })]),
  }),
  'rock': Object.freeze({
    boxes: Object.freeze([Object.freeze({ size: Object.freeze({ x: 1.0, y: 0.6, z: 1.0 }), offset: Object.freeze({ x: 0, y: 0.3, z: 0 }) })]),
  }),
});

// ---------------------------------------------------------------------------
// Registry wiring
// ---------------------------------------------------------------------------

/** Register every street/farm prop asset type with the game's AssetRegistry. */
export function registerEnvPropFactories(registry: AssetRegistry): void {
  const builders: Readonly<Record<string, (def: ObjectDefinition) => THREE.Group>> = {
    'dirt-road': (def) => buildDirtRoad(def),
    'town-well': () => buildTownWell(),
    'bench': () => buildBench(),
    'street-lamp': () => buildStreetLamp(),
    'hitching-post': (def) => buildHitchingPost(def),
    'wagon': () => buildWagon(),
    'town-sign': (def) => buildTownSign(def),
    'hay-bale': () => buildHayBale(),
    'windmill': () => buildWindmill(),
    'crop-row': () => buildCropRow(),
  };
  for (const [assetType, build] of Object.entries(builders)) {
    registry.register(assetType, { create: (def) => build(def) }, assetType);
  }
}
