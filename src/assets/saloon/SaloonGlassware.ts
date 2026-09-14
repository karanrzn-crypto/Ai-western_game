/**
 * src/assets/saloon/SaloonGlassware.ts
 * -----------------------------------------------------------------------------
 * Bottle + glassware builders for the saloon's back bar and bar counter.
 *
 * Every builder returns a THREE.Group whose ORIGIN is the object's base
 * center (what sits on the shelf / counter top), built only from primitives
 * — no textures, low segment counts.
 *
 * SILHOUETTE CONTRACT (task §4/§5): every bottle reads base → body →
 * shoulder → narrow neck → lip/rim → cork; a wine glass reads bowl → narrow
 * stem → foot. Parts carry stable mesh names so tests can lock the contract:
 *   bottle-body / bottle-shoulder / bottle-neck / bottle-lip / bottle-cork /
 *   bottle-label · glass-shell / glass-base / glass-liquid ·
 *   glass-bowl / glass-stem / glass-foot / wine-liquid ·
 *   decanter-body / decanter-shoulder / decanter-neck / decanter-stopper /
 *   decanter-liquid
 *
 * GEOMETRY REUSE (task §12): all builders accept an optional per-object
 * geometry cache. One cache instance per PRODUCED OBJECT lets every bottle
 * in that object share one geometry per part (memory + build-time win) while
 * objects never share instances — ThreeRendererAdapter.disposeObject3D()
 * disposes geometries per object, so cross-object sharing is forbidden.
 *
 * VISIBILITY CONTRACT: bottle glass is OPAQUE (glossy, never transparent —
 * a bottle must never vanish against the mirror behind it). Only drinking
 * vessels and decanters use the transparent `glass` material, and always
 * with an opaque liquid mesh inside rendered through the depthWrite:false
 * shell (same pattern as the poker table's whiskey glass).
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { SaloonMaterials } from './SaloonMaterials.js';

/** Per-object geometry cache: part key → shared geometry instance. */
export type GlasswareGeoCache = Map<string, THREE.BufferGeometry>;

export function createGlasswareGeoCache(): GlasswareGeoCache {
  return new Map();
}

/** Fetch-or-create a cached geometry (fresh instance when no cache given). */
function geo(
  cache: GlasswareGeoCache | undefined,
  key: string,
  make: () => THREE.BufferGeometry,
): THREE.BufferGeometry {
  if (!cache) return make();
  const hit = cache.get(key);
  if (hit) return hit;
  const made = make();
  cache.set(key, made);
  return made;
}

function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number, y: number, z: number,
  name: string,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = false;
  m.receiveShadow = false;
  m.name = name;
  parent.add(m);
  return m;
}

/* ========================================================================== */
/* Bottles                                                                    */
/* ========================================================================== */

export type BottleKind = 'whiskey' | 'tall' | 'short';

export interface BottleOptions {
  /** Front paper label (+Z). `cream` = plain label, `band` = label + ink band. */
  label?: 'cream' | 'band';
}

/**
 * One bottle with a real silhouette (base → body → shoulder → neck → lip →
 * cork). Parts overlap each other by ~3 mm at every joint so no hairline
 * gaps or coplanar rings appear. Origin = base center.
 */
export function buildSaloonBottle(
  kind: BottleKind,
  M: SaloonMaterials,
  cache?: GlasswareGeoCache,
  opts: BottleOptions = {},
): THREE.Group {
  const g = new THREE.Group();
  g.name = `saloon-bottle-${kind}`;

  // [body rTop, body rBottom, body h, shoulder rTop, shoulder h,
  //  neck rTop, neck h, lip r, lip h, cork r, cork h, segments, bodyMat]
  const spec = {
    whiskey: { bT: 0.042, bB: 0.046, bH: 0.19, sT: 0.016, sH: 0.055, nT: 0.0145, nH: 0.07, lipR: 0.018, lipH: 0.014, corkR: 0.0125, corkH: 0.026, seg: 10, mat: M.bottleBrown },
    tall: { bT: 0.03, bB: 0.034, bH: 0.26, sT: 0.012, sH: 0.05, nT: 0.011, nH: 0.06, lipR: 0.0135, lipH: 0.012, corkR: 0.009, corkH: 0.022, seg: 10, mat: M.bottleGreen },
    short: { bT: 0.05, bB: 0.054, bH: 0.13, sT: 0.02, sH: 0.045, nT: 0.016, nH: 0.035, lipR: 0.02, lipH: 0.012, corkR: 0.0135, corkH: 0.02, seg: 8, mat: M.bottleOlive },
  }[kind];
  const k = kind; // cache key prefix
  const E = 0.003; // joint embed depth

  // Base: a low thick foot disc the body stands on (the "base" of the
  // silhouette), bottom exactly at y = 0.
  const baseR = spec.bB + 0.004;
  mesh(g, geo(cache, `${k}.base`, () => new THREE.CylinderGeometry(baseR, baseR, 0.012, spec.seg)), spec.mat, 0, 0.006, 0, 'bottle-base');
  const bodyBottom = 0.009; // 3 mm embed into the base disc
  const bodyTop = bodyBottom + spec.bH;
  mesh(g, geo(cache, `${k}.body`, () => new THREE.CylinderGeometry(spec.bT, spec.bB, spec.bH, spec.seg)), spec.mat, 0, bodyBottom + spec.bH / 2, 0, 'bottle-body');
  const shoulderTop = bodyTop - E + spec.sH;
  mesh(g, geo(cache, `${k}.shoulder`, () => new THREE.CylinderGeometry(spec.sT, spec.bT, spec.sH, spec.seg)), spec.mat, 0, bodyTop - E + spec.sH / 2, 0, 'bottle-shoulder');
  const neckTop = shoulderTop - E + spec.nH;
  mesh(g, geo(cache, `${k}.neck`, () => new THREE.CylinderGeometry(spec.nT, spec.sT, spec.nH, 8)), spec.mat, 0, shoulderTop - E + spec.nH / 2, 0, 'bottle-neck');
  mesh(g, geo(cache, `${k}.lip`, () => new THREE.CylinderGeometry(spec.lipR, spec.lipR, spec.lipH, 8)), spec.mat, 0, neckTop - E + spec.lipH / 2, 0, 'bottle-lip');
  const lipTop = neckTop - E + spec.lipH;
  mesh(g, geo(cache, `${k}.cork`, () => new THREE.CylinderGeometry(spec.corkR, spec.corkR + 0.001, spec.corkH, 8)), M.cork, 0, lipTop - 0.005 + spec.corkH / 2, 0, 'bottle-cork');

  // Front label: a DEEP slab buried well into the body and standing ~6 mm
  // proud of its front surface — deep enough that even the label's x-edges
  // (where the cylinder wall curves away) stay embedded, so no corner of
  // the label ever floats off the glass.
  if (opts.label) {
    const labelW = kind === 'short' ? 0.05 : kind === 'tall' ? 0.04 : 0.055;
    const bodyFront = kind === 'short' ? 0.052 : kind === 'tall' ? 0.032 : 0.044;
    // Deep slab: back buried 1 cm into the body (so even the x-edges, where
    // the cylinder wall curves away, stay embedded), front ~6 mm proud.
    const labelZ = bodyFront - 0.002;
    mesh(
      g,
      geo(cache, `${k}.label`, () => new THREE.BoxGeometry(labelW, kind === 'tall' ? 0.06 : 0.07, 0.016)),
      M.paper, 0, kind === 'tall' ? 0.13 : 0.1, labelZ, 'bottle-label',
    );
    if (opts.label === 'band') {
      mesh(
        g,
        geo(cache, `${k}.band`, () => new THREE.BoxGeometry(labelW + 0.004, 0.018, 0.016)),
        M.ink, 0, kind === 'tall' ? 0.085 : 0.055, labelZ, 'bottle-label-band',
      );
    }
  }

  return g;
}

/**
 * Decanter: broad clear-glass body with a rounded shoulder, short neck and
 * a stopper; amber liquid inside whose surface sits well below the shoulder
 * (task §7). Silhouette deliberately distinct from every bottle.
 */
export function buildDecanter(M: SaloonMaterials, cache?: GlasswareGeoCache): THREE.Group {
  const g = new THREE.Group();
  g.name = 'saloon-decanter';

  mesh(g, geo(cache, 'dec.body', () => new THREE.CylinderGeometry(0.058, 0.062, 0.12, 12)), M.glass, 0, 0.06, 0, 'decanter-body');
  // Liquid: surface at y = 0.084, comfortably below the shoulder line 0.117.
  mesh(g, geo(cache, 'dec.liquid', () => new THREE.CylinderGeometry(0.05, 0.054, 0.08, 12)), M.amber, 0, 0.044, 0, 'decanter-liquid');
  mesh(g, geo(cache, 'dec.shoulder', () => new THREE.CylinderGeometry(0.02, 0.058, 0.05, 12)), M.glass, 0, 0.142, 0, 'decanter-shoulder');
  mesh(g, geo(cache, 'dec.neck', () => new THREE.CylinderGeometry(0.018, 0.02, 0.045, 10)), M.glass, 0, 0.1865, 0, 'decanter-neck');
  mesh(g, geo(cache, 'dec.stop', () => new THREE.CylinderGeometry(0.022, 0.017, 0.018, 10)), M.glass, 0, 0.218, 0, 'decanter-stopper');
  mesh(g, geo(cache, 'dec.knob', () => new THREE.SphereGeometry(0.015, 10, 8)), M.glass, 0, 0.234, 0, 'decanter-stopper-knob');

  return g;
}

/** Simple carafe — flared-lip glass body with wine inside. */
export function buildCarafe(M: SaloonMaterials, cache?: GlasswareGeoCache): THREE.Group {
  const g = new THREE.Group();
  g.name = 'saloon-carafe';

  mesh(g, geo(cache, 'car.body', () => new THREE.CylinderGeometry(0.048, 0.052, 0.13, 10)), M.glass, 0, 0.065, 0, 'carafe-body');
  mesh(g, geo(cache, 'car.liquid', () => new THREE.CylinderGeometry(0.04, 0.044, 0.06, 10)), M.wine, 0, 0.034, 0, 'carafe-liquid');
  mesh(g, geo(cache, 'car.lip', () => new THREE.CylinderGeometry(0.056, 0.048, 0.03, 10)), M.glass, 0, 0.145, 0, 'carafe-lip');

  return g;
}

/* ========================================================================== */
/* Drinking glasses                                                           */
/* ========================================================================== */

/**
 * Whiskey tumbler: short, slightly flared, thick dark base; optional amber
 * whiskey inside with the surface well below the rim (task §5/§6).
 */
export function buildTumbler(
  M: SaloonMaterials,
  cache?: GlasswareGeoCache,
  opts: { whiskey?: boolean } = {},
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'saloon-tumbler';

  mesh(g, geo(cache, 'tum.shell', () => new THREE.CylinderGeometry(0.033, 0.028, 0.078, 10)), M.glass, 0, 0.039, 0, 'glass-shell');
  mesh(g, geo(cache, 'tum.base', () => new THREE.CylinderGeometry(0.024, 0.026, 0.016, 10)), M.glassDark, 0, 0.009, 0, 'glass-base');
  if (opts.whiskey) {
    mesh(g, geo(cache, 'tum.liquid', () => new THREE.CylinderGeometry(0.023, 0.026, 0.032, 10)), M.amber, 0, 0.03, 0, 'glass-liquid');
  }

  return g;
}

/** Tall drinking glass — narrow, straight-walled, thin lip. */
export function buildTallGlass(
  M: SaloonMaterials,
  cache?: GlasswareGeoCache,
  opts: { liquid?: 'amber' | 'wine' } = {},
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'saloon-tall-glass';

  mesh(g, geo(cache, 'tall.shell', () => new THREE.CylinderGeometry(0.026, 0.023, 0.115, 10)), M.glass, 0, 0.0575, 0, 'glass-shell');
  mesh(g, geo(cache, 'tall.base', () => new THREE.CylinderGeometry(0.019, 0.021, 0.012, 10)), M.glassDark, 0, 0.007, 0, 'glass-base');
  if (opts.liquid) {
    mesh(g, geo(cache, 'tall.liquid', () => new THREE.CylinderGeometry(0.019, 0.021, 0.055, 10)), opts.liquid === 'amber' ? M.amber : M.wine, 0, 0.0315, 0, 'glass-liquid');
  }

  return g;
}

export type WineFill = 'empty' | 'half' | 'full';

/**
 * Wine glass with the mandated bowl → narrow stem → foot silhouette and an
 * opaque burgundy liquid surface BELOW the rim (task §6). The bowl is an
 * open sphere cap — the rim is a real edge that catches the light.
 *
 * Numbers (R = 0.048): the cap spans θ ∈ [0.42π, 0.92π]; its lowest point
 * is R·|cos 0.92π| = 0.0465 below the sphere centre, its rim R·cos 0.42π ≈
 * 0.0119 above the centre. Bowl cross-section radius at height h above the
 * bowl bottom: r(h) = R·sin(acos(h/R − 0.9686)) — the liquid cylinder is
 * sized/positioned to stay inside that wall at BOTH its ends.
 */
export function buildWineGlass(
  M: SaloonMaterials,
  cache?: GlasswareGeoCache,
  fill: WineFill = 'half',
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'saloon-wine-glass';

  const R = 0.048;
  const rimTheta = 0.42 * Math.PI;
  const botTheta = 0.92 * Math.PI;

  // Foot + stem (stem embeds 2 mm into the foot, bowl 2 mm into the stem).
  mesh(g, geo(cache, 'wg.foot', () => new THREE.CylinderGeometry(0.032, 0.038, 0.008, 12)), M.glass, 0, 0.004, 0, 'glass-foot');
  mesh(g, geo(cache, 'wg.stem', () => new THREE.CylinderGeometry(0.005, 0.007, 0.058, 8)), M.glass, 0, 0.035, 0, 'glass-stem');

  // Bowl: open sphere cap, bottom anchored at y = 0.062 (2 mm into stem top).
  const bowlBottom = 0.062;
  const bowlCy = bowlBottom + R * 0.9686;
  mesh(
    g,
    geo(cache, 'wg.bowl', () => new THREE.SphereGeometry(R, 12, 10, 0, Math.PI * 2, rimTheta, botTheta - rimTheta)),
    M.glass, 0, bowlCy, 0, 'glass-bowl',
  );

  // Liquid: opaque burgundy cylinder safely inside the bowl wall at both
  // ends; its surface always ends ≥ 12 mm below the rim (rim y ≈ 0.120).
  // Cache key includes the fill — the three fill variants are different
  // geometries.
  if (fill !== 'empty') {
    const h = fill === 'full' ? 0.032 : 0.02;
    const rTop = fill === 'full' ? 0.04 : 0.038;
    mesh(
      g,
      geo(cache, `wg.liquid.${fill}`, () => new THREE.CylinderGeometry(rTop, 0.026, h, 12)),
      M.wine, 0, bowlBottom + 0.014 + h / 2, 0, 'wine-liquid',
    );
  }

  return g;
}

/** Shot glass — small, thick-walled, unmistakable silhouette. */
export function buildShotGlass(M: SaloonMaterials, cache?: GlasswareGeoCache): THREE.Group {
  const g = new THREE.Group();
  g.name = 'saloon-shot-glass';

  mesh(g, geo(cache, 'shot.shell', () => new THREE.CylinderGeometry(0.022, 0.017, 0.048, 8)), M.glass, 0, 0.024, 0, 'glass-shell');
  mesh(g, geo(cache, 'shot.base', () => new THREE.CylinderGeometry(0.015, 0.017, 0.014, 8)), M.glassDark, 0, 0.008, 0, 'glass-base');

  return g;
}

/**
 * Upside-down tumbler (drying on the shelf): the upright tumbler flipped
 * around X, re-anchored so the group origin stays at its base (the rim).
 */
export function buildInvertedTumbler(M: SaloonMaterials, cache?: GlasswareGeoCache): THREE.Group {
  const inner = buildTumbler(M, cache);
  inner.rotation.x = Math.PI;
  inner.position.y = 0.078;
  const g = new THREE.Group();
  g.name = 'saloon-inverted-tumbler';
  g.add(inner);
  return g;
}
