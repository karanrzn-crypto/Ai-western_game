/**
 * src/assets/gunshop/GunShopArchitecture.ts
 * -----------------------------------------------------------------------------
 * The Gun Shop BUILDING SHELL factory + unit-box collider factories + the
 * REAL openable front door (and its pure pose API).
 *
 * Architecture contract (mirrors the saloon/stable/sheriff modules):
 *  - Factories implement IAssetFactory.create(definition) and build ONLY
 *    mesh-level state. They NEVER apply the registry transform —
 *    ThreeRendererAdapter owns that.
 *  - The shell (roof, false front, porch, corner posts, door casing) is ONE
 *    managed object with `collider: false`; the REAL walls / floor /
 *    threshold are separately registered UNIT BOXES whose transform scale IS
 *    their size — CollisionWorld derives the AABB from the transform alone,
 *    so visual and collider can never disagree.
 *  - The front door follows the house door contract (sheriff front door):
 *      def root spawns CLOSED at the wall mid-plane
 *       └── 'front-door-hinge'  ← the ONLY thing that rotates (dynamic)
 *            ├── leaf slab + glass + panels + straps + knob
 *       └── hinge knuckles mount on the STATIC root (jamb side)
 *    Pure pose: setGunShopFrontDoorOpen(root, t) re-derives the pose from
 *    t ∈ [0,1] every frame — never accumulated, mid-swing re-trigger safe.
 *    The swing metadata (hinge/openSign/openDeg) rides the def metadata the
 *    same way the stable leaf doors do.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { IAssetFactory } from '../IAssetFactory.js';
import { GUNSHOP_LAYOUT } from './GunShopLayout.js';
import { createGunShopMaterials } from './GunShopMaterials.js';
import { addBox, addCyl } from './GunShopProps.js';

/* ========================================================================== */
/* Facade window assembly (independent managed object)                        */
/* ========================================================================== */

/**
 * ONE facade window in its local frame: origin = building-local
 * (side · offset, 0, 0) — the def carries that position; children sit
 * centered on x = 0 at their absolute heights/z offsets. REAL frame: four
 * wood strips around a visible OPAQUE dark glass pane (a pane must never
 * vanish), a cross-bar pair riding the glass front and a protruding sill.
 * Same construction the saloon facade windows use.
 */
export function buildGunShopWindowAssembly(side: -1 | 1, offset: number): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = `gunshop-window-${side < 0 ? 'w' : 'e'}${offset}`;
  void side; // orientation is baked into the def position, not the geometry

  const win = GUNSHOP_LAYOUT.window;
  const wallFaceZ = GUNSHOP_LAYOUT.depth / 2 + GUNSHOP_LAYOUT.wallThickness / 2;
  const glassHalfH = win.height / 2;
  const glassY = win.sillY + glassHalfH;
  const stripD = 0.07;
  const stripZ = wallFaceZ + 0.02 + stripD / 2;   // strips span [face+0.02, face+0.09]
  const glassZ = wallFaceZ + 0.025;               // glass spans [face, face+0.05]
  const barZ = wallFaceZ + 0.065;                 // bars span [face+0.05, face+0.08]

  addBox(g, M.glassDark, win.width, win.height, 0.05, 0, glassY, glassZ, 'gunshop-window-glass');
  addBox(g, M.woodTrim, win.width + 0.24, 0.12, stripD, 0, glassY + glassHalfH + 0.06, stripZ, 'gunshop-window-frame-top');
  addBox(g, M.woodTrim, win.width + 0.24, 0.12, stripD, 0, win.sillY - 0.06, stripZ, 'gunshop-window-frame-bottom');
  addBox(g, M.woodTrim, 0.12, win.height, stripD, -(win.width / 2 + 0.06), glassY, stripZ, 'gunshop-window-frame-left');
  addBox(g, M.woodTrim, 0.12, win.height, stripD, win.width / 2 + 0.06, glassY, stripZ, 'gunshop-window-frame-right');
  addBox(g, M.woodTrim, 0.05, win.height, 0.03, 0, glassY, barZ, 'gunshop-window-cross-v');
  addBox(g, M.woodTrim, win.width, 0.05, 0.03, 0, glassY, barZ, 'gunshop-window-cross-h');
  addBox(g, M.woodDark, win.width + 0.24, 0.06, 0.14, 0, win.sillY - 0.15, wallFaceZ + 0.06, 'gunshop-window-sill');

  return g;
}

/* ========================================================================== */
/* The shell builder                                                          */
/* ========================================================================== */

interface ShellDims {
  width: number;
  depth: number;
  height: number;
  doorWidth: number;
}

/**
 * Western gunsmith shell, +Z = entrance side:
 *   flat roof with overhang + fascia trim · false-front parapet · porch
 *   (deck, posts, roof) · corner posts · door casing on the facade.
 *
 * Deliberately EXCLUDES the four walls + floor/threshold (separate unit-box
 * objects own the colliders), the doorway leaf ('gunshop-front-door'), the
 * facade windows and the sign (independent managed objects).
 */
export function buildGunShopShell(dims: ShellDims): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-building';

  const { width: w, depth: d, height: h } = dims;
  const overhang = GUNSHOP_LAYOUT.roofOverhang;
  const roofTop = h + 0.18; // roof slab y ∈ [h, h + 0.18]
  const wallFaceZ = d / 2 + GUNSHOP_LAYOUT.wallThickness / 2;

  // --- Flat roof with overhang + fascia (mirrors the saloon shell) -----------
  addBox(g, M.woodDark, w + overhang * 2, 0.18, d + overhang * 2, 0, h + 0.09, 0, 'gunshop-roof');
  const roofHalfD = d / 2 + overhang;
  addBox(g, M.woodTrim, w + overhang * 2, 0.22, 0.06, 0, h + 0.05, -(roofHalfD + 0.03), 'gunshop-fascia-rear');
  addBox(g, M.woodTrim, 0.06, 0.22, d + overhang * 2 + 0.12, -(w / 2 + overhang + 0.03), h + 0.05, 0, 'gunshop-fascia-west');
  addBox(g, M.woodTrim, 0.06, 0.22, d + overhang * 2 + 0.12, w / 2 + overhang + 0.03, h + 0.05, 0, 'gunshop-fascia-east');

  // --- False front parapet (the unmistakable frontier shop silhouette) -------
  // Stands ON the roof slab (stacked contact at roofTop); front face 9 cm
  // proud of the entrance wall's outer face, back 5 cm behind it.
  const ffBottom = roofTop;
  const ffTop = GUNSHOP_LAYOUT.falseFrontTop;
  addBox(
    g, M.woodTrim,
    w + 0.24, ffTop - ffBottom, 0.14,
    0, (ffBottom + ffTop) / 2, wallFaceZ + 0.02,
    'gunshop-false-front',
  );
  // Cap trim riding the parapet top (5 mm proud all around, no coplanar top).
  addBox(g, M.woodDark, w + 0.32, 0.08, 0.2, 0, ffTop + 0.04, wallFaceZ + 0.02, 'gunshop-false-front-cap');

  // --- Porch: deck + posts + porch roof ---------------------------------------
  const porch = GUNSHOP_LAYOUT.porchDepth;
  addBox(g, M.woodMed, w + 0.6, 0.09, porch, 0, 0.045, wallFaceZ + porch / 2, 'gunshop-porch-deck');
  const postH = GUNSHOP_LAYOUT.porchRoofTopY - 0.12 - 0.09;
  const postXs = [-w / 2 - 0.1, -1.8, 1.8, w / 2 + 0.1];
  postXs.forEach((px, i) => {
    addCyl(g, M.woodDark, 0.08, 0.09, postH, 8, px, 0.09 + postH / 2, wallFaceZ + porch - 0.2, `gunshop-porch-post-${i}`);
  });
  addBox(g, M.woodDark, w + 0.9, 0.12, porch + 0.2, 0, GUNSHOP_LAYOUT.porchRoofTopY - 0.06, wallFaceZ + porch / 2, 'gunshop-porch-roof');

  // --- Corner posts (wrap the four corners; tops stay BELOW the false front) --
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(g, M.woodDark, 0.24, h + 0.16, 0.56, sx * (w / 2), (h + 0.04) / 2, sz * (d / 2), `gunshop-corner-post-${sx < 0 ? 'w' : 'e'}${sz < 0 ? 'n' : 's'}`);
    }
  }

  // --- Door casing on the facade (jamb strips + header, backs buried 1 cm) ---
  // Jamb strips wrap the doorway edges: inner faces stand 1 cm PROUD of the
  // jamb planes (the wall edge is inside the strip — never coplanar), and
  // their feet sink 1 cm into the porch deck (the deck top is at 0.09).
  const dw = dims.doorWidth;
  const casingH = GUNSHOP_LAYOUT.floorTop + GUNSHOP_LAYOUT.doorHeight + 0.04;
  const casingZ = wallFaceZ + 0.02;
  const casingBottom = 0.08; // sunk into the porch deck (top 0.09)
  addBox(g, M.woodTrim, 0.08, casingH - casingBottom, 0.06, -(dw / 2 + 0.03), (casingH + casingBottom) / 2, casingZ, 'gunshop-door-casing-west');
  addBox(g, M.woodTrim, 0.08, casingH - casingBottom, 0.06, dw / 2 + 0.03, (casingH + casingBottom) / 2, casingZ, 'gunshop-door-casing-east');
  addBox(g, M.woodTrim, dw + 0.24, 0.08, 0.06, 0, casingH + 0.04, casingZ, 'gunshop-door-casing-header');

  return g;
}

/* ========================================================================== */
/* Unit-box collider factories (scale IS the size)                            */
/* ========================================================================== */

/** One wall segment — the registry transform's scale IS the wall's AABB. */
export class GunShopWallFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    const M = createGunShopMaterials();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M.woodMed);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'gunshop-wall-segment';
    return mesh;
  }
}

/** The plank floor / threshold — same unit-box discipline. */
export class GunShopFloorFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    const M = createGunShopMaterials();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M.woodMed);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'gunshop-floor-slab';
    return mesh;
  }
}

/* ========================================================================== */
/* The FRONT DOOR — a real openable door (E), spawns CLOSED                   */
/* ========================================================================== */

export interface GunShopFrontDoorMeta {
  width: number;
  height: number;
  hinge: 'left' | 'right';
  openSign: 1 | -1;
  /** Open angle in RADIANS. */
  openDeg: number;
}

export function frontDoorMetaOf(definition: ObjectDefinition): GunShopFrontDoorMeta {
  const meta = definition.metadata as Record<string, unknown>;
  const num = (key: string, fallback: number): number => {
    const v = Number(meta[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  const fd = GUNSHOP_LAYOUT.frontDoor;
  return {
    width: num('width', fd.width),
    height: num('height', fd.height),
    hinge: meta.hinge === 'right' ? 'right' : fd.hinge,
    openSign: Number(meta.openSign) === -1 ? -1 : fd.openSign,
    openDeg: num('openDeg', fd.openDeg),
  };
}

/**
 * Panelled wood front door for the south doorway, hung on a REAL hinge
 * pivot. The def root sits at the doorway center on the wall MID-plane,
 * seated on the floor top; 'front-door-hinge' (the DoorRoot) sits at the
 * actual hinge axis — 4 cm off the WEST jamb — and the leaf meshes are its
 * children, so opening the door is a pure rotation of that pivot.
 *
 * Geometry discipline (dw 1.1, dh 2.3 from the floor top) — SEAL-TIGHT fit
 * (§ shadow revision: at dawn/dusk the old 3 cm top / 5 cm latch gaps let
 * low-sun rays stripe the interior floor through the CLOSED door):
 *   • leaf 1.045 × 2.28 × 0.06 — hinge edge 4 cm off the west jamb (the
 *     swing pivot), latch edge 1.5 cm off the east jamb, top 8 mm under the
 *     casing header, bottom 1.2 cm over the threshold — the light line
 *     through the remaining hairline gaps stays ≤ 1.5 cm at any sun angle;
 *   • the 100° INWARD sweep stays inside the doorway's clear zone (the
 *     layout keeps the swept path free, so the swept hinge disc and tip
 *     graze nothing);
 *   • the glass pane rides 3 cm PROUD of the leaf's street face inside a
 *     trim frame (the sheriff front door's anti-coplanar fix);
 *   • straps + knob dress the street face; the thumb latch the interior;
 *     everything mounted is proud/back-to-back, never flush-coplanar.
 */
export function buildGunShopFrontDoor(meta: GunShopFrontDoorMeta): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-front-door';

  const dw = meta.width;
  const dh = meta.height;
  const hingeOffX = 0.04;
  const leafW = dw - hingeOffX - 0.015;
  const leafH = dh - 0.02;
  const leafT = 0.06;
  const bottomLift = 0.012;
  const hingeX = (meta.hinge === 'left' ? -1 : 1) * (dw / 2 - hingeOffX);
  const dir = meta.hinge === 'left' ? 1 : -1; // leaf extends this way from the hinge

  const hinge = new THREE.Group();
  hinge.name = 'front-door-hinge';
  // Runtime-rotated pivot (setGunShopFrontDoorOpen) — see MergeStatic contract.
  hinge.userData.dynamic = true;
  hinge.position.set(hingeX, bottomLift, 0);
  hinge.userData.openSign = meta.openSign;
  hinge.userData.openDeg = meta.openDeg;
  g.add(hinge);

  // Leaf slab.
  const slab = addBox(hinge, M.woodTrim, leafW, leafH, leafT, dir * leafW / 2, leafH / 2, 0, 'gunshop-front-door-leaf');
  void slab;

  // Glazed upper section: pane rides 3 cm PROUD of the street face (+z) with
  // its back face ON the slab face; the trim frame is MORE proud (backs also
  // ON the slab face) and sits in the y band [1.475, 2.125] — clear of the
  // lower panel row (top 1.35) and the hinge straps (x ≤ 0.18, the frame
  // starts at x 0.2525).
  const glassW = 0.405;
  const glassH = 0.5;
  const upperGlassY = 1.8;
  addBox(hinge, M.glass, glassW, glassH, 0.03, dir * leafW / 2, upperGlassY, leafT / 2 + 0.015, 'gunshop-front-door-glass', false);
  const frT = 0.045;
  const frZ = leafT / 2 + frT / 2;
  const frW = glassW + 0.1;
  const frH = glassH + 0.1;
  addBox(hinge, M.woodDark, frW, 0.05, frT, dir * leafW / 2, upperGlassY + frH / 2 - 0.025, frZ, 'gunshop-front-door-glass-frame-top');
  addBox(hinge, M.woodDark, frW, 0.05, frT, dir * leafW / 2, upperGlassY - frH / 2 + 0.025, frZ, 'gunshop-front-door-glass-frame-bottom');
  addBox(hinge, M.woodDark, 0.05, glassH, frT, dir * (leafW / 2 - frW / 2 + 0.025), upperGlassY, frZ, 'gunshop-front-door-glass-frame-left');
  addBox(hinge, M.woodDark, 0.05, glassH, frT, dir * (leafW / 2 + frW / 2 - 0.025), upperGlassY, frZ, 'gunshop-front-door-glass-frame-right');

  // Recessed panel row on EACH face (single tall row, clear of the glass band
  // and of the latch-edge knob zone). Frame: backs ON the slab face, 12 mm
  // thick; field: 4 mm inset INSIDE the frame's outer face and 2 mm off the
  // slab — every same-normal face ≥ 2 mm from its neighbour (no coplanar).
  const py = 0.8;
  const ph = 1.1;
  for (const sz of [-1, 1] as const) {
    addBox(hinge, M.woodDark, leafW - 0.37, ph, 0.012, dir * leafW / 2, py, sz * (leafT / 2 + 0.008), `gunshop-front-door-panel-frame-${sz < 0 ? 'in' : 'out'}`);
    addBox(hinge, M.woodMed, leafW - 0.45, ph - 0.08, 0.008, dir * leafW / 2, py, sz * (leafT / 2 + 0.002), `gunshop-front-door-panel-field-${sz < 0 ? 'in' : 'out'}`);
  }

  // Wrought-iron strap hinges ON the street face at the hinge edge. Length
  // 0.18 keeps them clear of BOTH the panel row (starts x 0.185) and the
  // glazed section (frame starts x 0.2525) — no shared planes anywhere.
  [bottomLift + 0.42, bottomLift + leafH - 0.42].forEach((sy, i) => {
    addBox(hinge, M.steelDark, 0.18, 0.05, 0.015, dir * 0.09, sy, leafT / 2 + 0.0075, `gunshop-front-door-strap-${i === 0 ? 'low' : 'high'}`);
  });

  // Wrought knob + rose on the street face near the latch edge; interior
  // thumb latch on the shop face.
  const knobX = dir * (leafW - 0.09);
  const knobY = bottomLift + 1.02;
  addCyl(hinge, M.steelDark, 0.028, 0.028, 0.05, 10, knobX, knobY, leafT / 2 + 0.02, 'gunshop-front-door-knob', false).rotation.x = Math.PI / 2;
  addCyl(hinge, M.steelDark, 0.045, 0.045, 0.014, 10, knobX, knobY, leafT / 2 + 0.007, 'gunshop-front-door-knob-rose', false).rotation.x = Math.PI / 2;
  addBox(hinge, M.steelDark, 0.09, 0.05, 0.02, knobX, knobY, -leafT / 2 - 0.01, 'gunshop-front-door-thumb-latch', false);

  // Hinge knuckles ON the STATIC root at the hinge axis (jamb side).
  [bottomLift + 0.42, bottomLift + leafH - 0.42].forEach((sy, i) => {
    const knuckle = addCyl(g, M.steelDark, 0.022, 0.022, 0.09, 10, hingeX, sy, 0, `gunshop-front-door-knuckle-${i === 0 ? 'low' : 'high'}`);
    knuckle.rotation.z = Math.PI / 2;
  });

  return g;
}

/**
 * Pure pose for the front door: t=0 → CLOSED (leaf yaw 0), t=1 → OPEN 100°
 * inward. Reads the swing side/angle baked into hinge.userData at build
 * time; derived ONLY from t (never accumulated, deterministic re-trigger).
 */
export function setGunShopFrontDoorOpen(root: THREE.Object3D, t: number): void {
  const hinge = root.getObjectByName('front-door-hinge') as THREE.Group | null;
  if (!hinge) return;
  const sign = Number(hinge.userData.openSign ?? 1) || 1;
  const openDeg = Number(hinge.userData.openDeg ?? GUNSHOP_LAYOUT.frontDoor.openDeg) || GUNSHOP_LAYOUT.frontDoor.openDeg;
  // `+ 0` normalizes −0 (negative sign × t=0) to +0 — pure pose, no quirks.
  hinge.rotation.y = THREE.MathUtils.clamp(t, 0, 1) * openDeg * sign + 0;
}
