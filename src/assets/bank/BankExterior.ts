/**
 * src/assets/bank/BankExterior.ts
 * -----------------------------------------------------------------------------
 * The bank BUILDING SHELL factory + the masonry factories + their registration
 * (mirrors SaloonBuildingFactory's architecture contract):
 *
 *  - Factories implement IAssetFactory.create(definition) and build ONLY
 *    mesh-level state (geometry, material, shadows). They NEVER apply the
 *    registry transform — ThreeRendererAdapter owns that.
 *  - The shell (roof, cornices, entablature + BANK letters, pediment + crest,
 *    four classical columns, entrance surround, walnut doors held open,
 *    window assemblies, quoins) is ONE managed object with `collider: false`
 *    — collision comes exclusively from the separately registered `bank-wall`
 *    / `bank-stair` / `bank-floor` unit boxes whose transform scale IS their
 *    size (CollisionWorld derives AABBs from the transform alone).
 *  - Dimensions come from metadata (width/depth/height/doorWidth), defaulting
 *    to BANK_LAYOUT so the shell can never drift from the wall layout.
 *
 * Z-fighting discipline: every layered part is either back-to-back stacked
 * (max-vs-min contact — the allowed case) or offset ≥ 5 mm from the plane it
 * faces; coplanar same-normal overlaps between different materials never
 * occur (tests/bank-assets.test.ts scans for exactly that class of bug).
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { IAssetFactory } from '../IAssetFactory.js';
import type { AssetRegistry } from '../AssetRegistry.js';
import { BANK_LAYOUT } from './BankLayout.js';
import { createBankMaterials, brickTexture, stoneTexture, flagstoneTexture } from './BankMaterials.js';

/* ========================================================================== */
/* Small helpers                                                              */
/* ========================================================================== */

function addBox(
  parent: THREE.Object3D,
  m: THREE.Material,
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function addCyl(
  parent: THREE.Object3D,
  m: THREE.Material,
  rTop: number, rBottom: number, h: number, seg: number,
  x: number, y: number, z: number,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

interface ShellDims {
  width: number;
  depth: number;
  height: number;
  doorWidth: number;
}

function shellDimsOf(definition: ObjectDefinition): ShellDims {
  const meta = definition.metadata as Record<string, unknown>;
  const num = (key: string, fallback: number): number => {
    const v = Number(meta[key]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    width: num('width', BANK_LAYOUT.width),
    depth: num('depth', BANK_LAYOUT.depth),
    height: num('height', BANK_LAYOUT.wallHeight),
    doorWidth: num('doorWidth', BANK_LAYOUT.doorWidth),
  };
}

/** Attach a procedural texture to a material (falls back to flat color). */
function applyMap(mat: THREE.MeshStandardMaterial, tex: THREE.CanvasTexture | null): void {
  if (!tex) return;
  mat.map = tex;
  mat.color.set(0xffffff);
  mat.needsUpdate = true;
}

/* ========================================================================== */
/* The shell builder                                                          */
/* ========================================================================== */

/**
 * Neoclassical frontier bank shell, +Z = entrance side:
 *   flat roof with overhang · side/rear cornices · entablature (architrave,
 *   walnut frieze with gold BANK letters, projecting cornice) · triangular
 *   pediment with crest emblem and raking cornices · FOUR fluted classical
 *   columns on plinths · entrance surround (jambs, lintel, shallow arch,
 *   keystone) · walnut double doors held open against the facade · two tall
 *   front windows + four side windows with real frames/mullions/sills ·
 *   corner quoins.
 *
 * Deliberately EXCLUDES the walls/stairs/landing/floor (separate unit-box
 * objects own the colliders).
 */
export function buildBankShell(dims: ShellDims): THREE.Group {
  const M = createBankMaterials();
  const g = new THREE.Group();
  g.name = 'bank-building';

  const { width: w, depth: d, height: h } = dims;
  const L = BANK_LAYOUT;
  const floorTop = L.floorTop;
  const wallFaceZ = d / 2 + L.wallThickness / 2; // facade outer face (4.675)
  const roofTop = L.roofSlabTop;

  // --- Flat roof with overhang ------------------------------------------------
  // Spans x ±(w/2 + overhang), z from the rear overhang to 0.18 short of the
  // facade plane (the temple front is crowned by the entablature instead, and
  // the attic wall rises from the roof top back-to-back — never overlapping).
  const roofZmin = -(d / 2 + L.roofOverhang);
  const roofZmax = d / 2 + L.wallThickness / 2 - 0.18;
  addBox(
    g, M.roof,
    w + L.roofOverhang * 2, roofTop - h, roofZmax - roofZmin,
    0, (h + roofTop) / 2, (roofZmin + roofZmax) / 2,
    'bank-roof',
  );

  // --- Side + rear cornices (cream stone band crowning the quiet walls) -------
  // Side cornices run from the rear wall's outer face to just past the facade
  // (wrapping the front corners); the rear cornice spans the full width and
  // the side ones butt INTO it edge-to-edge — no coplanar overlap.
  const corH = 0.34;
  const corY = 4.82; // spans [4.65, 4.99]
  const corZmax = d / 2 + L.wallThickness / 2 + 0.08; // wraps past the facade
  const corZmin = -(d / 2 + L.wallThickness / 2); // rear wall outer face
  addBox(g, M.stoneCream, 0.08, corH, corZmax - corZmin, w / 2 + L.wallThickness / 2 + 0.04, corY, (corZmin + corZmax) / 2, 'bank-cornice-east');
  addBox(g, M.stoneCream, 0.08, corH, corZmax - corZmin, -(w / 2 + L.wallThickness / 2 + 0.04), corY, (corZmin + corZmax) / 2, 'bank-cornice-west');
  addBox(g, M.stoneCream, w + L.wallThickness + 0.16, corH, 0.08, 0, corY, -(d / 2 + L.wallThickness / 2 + 0.04), 'bank-cornice-rear');

  // --- Entablature: architrave → walnut frieze + gold BANK letters → cornice --
  // Stepped classical projection over the columns (z=5.35): architrave face
  // 5.80, frieze face 5.78, cornice face 5.90; backs bury into the wall band.
  const E = L.entablature;
  addBox(g, M.stoneCream, E.halfWidth * 2, 0.3, 1.4, 0, 5.35, 5.1, 'bank-architrave');
  addBox(g, M.walnut, E.halfWidth * 2, E.friezeTopY - 5.5, 1.38, 0, (5.5 + E.friezeTopY) / 2, 5.09, 'bank-frieze');
  addBox(g, M.stoneCream, E.halfWidth * 2 + 0.2, E.topY - E.friezeTopY, 1.55, 0, (E.friezeTopY + E.topY) / 2, 5.125, 'bank-entablature-cornice');

  // GOLD "BANK" letters — embedded 2 cm into the frieze face (5.78), proud 4 cm.
  const letterXs = [-1.02, -0.34, 0.34, 1.02];
  letterXs.forEach((lx, i) => {
    addBox(g, M.gold, 0.42, 0.42, 0.06, lx, 5.72, 5.79, `bank-sign-letter-${i}`);
  });

  // --- Triangular pediment (ExtrudeGeometry prism — never a z-fight box) ------
  const P = L.pediment;
  const shape = new THREE.Shape();
  shape.moveTo(-P.halfWidth, 0);
  shape.lineTo(P.halfWidth, 0);
  shape.lineTo(0, P.apexHeight);
  shape.closePath();
  const prismGeo = new THREE.ExtrudeGeometry(shape, { depth: P.zFront - P.zBack, bevelEnabled: false });
  const prism = new THREE.Mesh(prismGeo, M.stoneCream);
  prism.position.set(0, E.topY, P.zBack);
  prism.castShadow = true;
  prism.receiveShadow = true;
  prism.name = 'bank-pediment';
  g.add(prism);

  // Pediment base band (projects past the tympanum face, covers the cornice top)
  addBox(g, M.stoneCreamDark, P.halfWidth * 2 + 0.1, 0.16, 0.2, 0, E.topY + 0.08, 5.9, 'bank-pediment-base-band');

  // Raking cornices along the two slopes (rotated → exempt from the box scan).
  // Length = exact slope − 6 cm so the upper ends MEET at the apex without
  // crossing past it (the old +0.16 overhang made the rakes poke out as
  // crossed "wings"); the base band covers the pulled-in eaves ends.
  const slopeAngle = Math.atan2(P.apexHeight, P.halfWidth);
  const slopeLen = Math.hypot(P.halfWidth, P.apexHeight) - 0.06;
  for (const side of [-1, 1]) {
    const rake = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.18, 0.14), M.stoneCream);
    rake.position.set((side * P.halfWidth) / 2, E.topY + P.apexHeight / 2, 6.03);
    // −side: the WEST rake (side −1) must rise TOWARD the apex (+x), the east
    // rake (side +1) toward −x. side×angle tilted them outward-down, which
    // drew crossed sticks over the tympanum instead of a raking cornice.
    rake.rotation.z = -side * slopeAngle;
    rake.castShadow = true;
    rake.receiveShadow = true;
    rake.name = `bank-pediment-rake-${side < 0 ? 'w' : 'e'}`;
    g.add(rake);
  }

  // Crest emblem: brass disc + ring + diamond, embedded into the tympanum face.
  addCyl(g, M.brassDark, 0.3, 0.3, 0.05, 24, 0, E.topY + 0.42, 6.0, 'bank-crest-disc').rotation.x = Math.PI / 2;
  const crestRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 24), M.brass);
  crestRing.position.set(0, E.topY + 0.42, 6.03);
  crestRing.name = 'bank-crest-ring';
  g.add(crestRing);
  const crestDiamond = addBox(g, M.gold, 0.16, 0.16, 0.04, 0, E.topY + 0.42, 6.05, 'bank-crest-diamond');
  crestDiamond.rotation.z = Math.PI / 4;

  // --- FOUR classical columns on the landing ----------------------------------
  const C = L.columns;
  C.xs.forEach((cx, i) => {
    const col = new THREE.Group();
    col.name = `bank-column-${i}`;
    col.position.set(cx, floorTop, C.z);
    g.add(col);
    // stepped plinth + base tier (stone, slightly darker than the shaft)
    addBox(col, M.stoneCreamDark, C.plinthSize, C.plinthHeight, C.plinthSize, 0, C.plinthHeight / 2, 0, `bank-column-${i}-plinth`);
    addBox(col, M.stoneCreamDark, 0.56, 0.1, 0.56, 0, C.plinthHeight + 0.05, 0, `bank-column-${i}-base`);
    // shaft (straight cylinder keeps the flutes flush)
    addCyl(col, M.stoneCream, C.shaftRadius, C.shaftRadius, 3.65, 24, 0, C.plinthHeight + 0.1 + 1.825, 0, `bank-column-${i}-shaft`);
    // subtle fluting: thin darker strips hugging the shaft (rotated → exempt)
    for (let f = 0; f < C.flutes; f += 1) {
      const a = (f / C.flutes) * Math.PI * 2;
      const flute = new THREE.Mesh(new THREE.BoxGeometry(0.018, 3.45, 0.018), M.stoneCreamDark);
      flute.position.set(Math.cos(a) * C.shaftRadius * 0.985, C.plinthHeight + 0.2 + 1.725, Math.sin(a) * C.shaftRadius * 0.985);
      flute.rotation.y = -a;
      flute.castShadow = true;
      flute.name = `bank-column-${i}-flute-${f}`;
      col.add(flute);
    }
    // capital: flaring bell + square abacus (top = architrave bottom)
    addCyl(col, M.stoneCream, 0.36, C.shaftRadius, 0.25, 24, 0, C.plinthHeight + 0.1 + 3.65 + 0.125, 0, `bank-column-${i}-capital`);
    addBox(col, M.stoneCream, 0.98, 0.1, 0.98, 0, C.plinthHeight + 0.1 + 3.65 + 0.25 + 0.05, 0, `bank-column-${i}-abacus`);
  });

  // --- Entrance surround: jambs, lintel, shallow arch, keystone ---------------
  const doorH = floorTop + L.doorHeight; // 3.1 — header underside
  const jambX = dims.doorWidth / 2 - 0.02; // casing wraps 2 cm into the reveal
  for (const side of [-1, 1]) {
    addBox(g, M.stoneCream, 0.25, L.doorHeight + 0.05, 0.24, side * (jambX + 0.125), floorTop + (L.doorHeight + 0.05) / 2, wallFaceZ, `bank-door-jamb-${side < 0 ? 'w' : 'e'}`);
  }
  addBox(g, M.stoneCream, dims.doorWidth + 0.5, 0.3, 0.24, 0, doorH + 0.2, wallFaceZ, 'bank-door-lintel');
  // Shallow segmental arch: flattened semicircle springing from the lintel top.
  const arch = new THREE.Mesh(new THREE.TorusGeometry(dims.doorWidth / 2 + 0.25, 0.07, 8, 32, Math.PI), M.stoneCreamDark);
  arch.position.set(0, doorH + 0.35, wallFaceZ + 0.06);
  arch.scale.y = 0.32;
  arch.castShadow = true;
  arch.name = 'bank-door-arch';
  g.add(arch);
  addBox(g, M.stoneCream, 0.16, 0.34, 0.1, 0, doorH + 0.8, wallFaceZ + 0.165, 'bank-door-keystone');

  // --- Walnut double doors held OPEN against the entrance casing --------------
  // Real 180° outward swing: each leaf rests ON the jamb casing front
  // (back face 5 mm clear of it), panels + brass handles facing the street.
  // Nothing stands in the walkable opening.
  const leafW = dims.doorWidth / 2 + 0.01;
  const leafZ = wallFaceZ + 0.1525; // back 4.80, front 4.855 — clears the casing
  for (const side of [-1, 1]) {
    addBox(g, M.walnut, leafW, L.doorHeight - 0.08, 0.055, side * (dims.doorWidth / 2 + leafW / 2), floorTop + (L.doorHeight - 0.08) / 2, leafZ, `bank-door-leaf-${side < 0 ? 'left' : 'right'}`);
    // two recessed-look panels proud of the leaf's street face
    [floorTop + 0.75, floorTop + 1.7].forEach((py, pi) => {
      addBox(g, M.walnutLight, leafW - 0.36, 0.8, 0.02, side * (dims.doorWidth / 2 + leafW / 2), py, wallFaceZ + 0.19, `bank-door-panel-${side < 0 ? 'left' : 'right'}-${pi}`);
    });
    // brass handle bar at the meeting stile (the leaf's free edge)
    addCyl(g, M.brass, 0.022, 0.022, 0.35, 10, side * (dims.doorWidth + 0.02 - 0.12), floorTop + 1.35, wallFaceZ + 0.21, `bank-door-handle-${side < 0 ? 'left' : 'right'}`);
  }

  // --- Facade windows (one tall assembly per side of the entrance) ------------
  const W = L.window;
  for (const side of [-1, 1]) {
    for (const off of W.centersFromDoor) {
      const wx = side * off;
      const tag = `${side < 0 ? 'w' : 'e'}${off}`;
      const glassY = W.sillY + W.height / 2;
      // glass back face stacked ON the facade (back-to-back, saloon convention)
      addBox(g, M.glassDark, W.width, W.height, 0.05, wx, glassY, wallFaceZ + 0.025, `bank-window-glass-front-${tag}`);
      // frame strips proud of the glass
      addBox(g, M.stoneCream, W.width + 0.24, 0.12, 0.07, wx, glassY + W.height / 2 + 0.06, wallFaceZ + 0.085, `bank-window-frame-top-${tag}`);
      addBox(g, M.stoneCream, W.width + 0.24, 0.12, 0.07, wx, W.sillY - 0.06, wallFaceZ + 0.085, `bank-window-frame-bottom-${tag}`);
      addBox(g, M.stoneCream, 0.12, W.height, 0.07, wx - (W.width / 2 + 0.06), glassY, wallFaceZ + 0.085, `bank-window-frame-left-${tag}`);
      addBox(g, M.stoneCream, 0.12, W.height, 0.07, wx + (W.width / 2 + 0.06), glassY, wallFaceZ + 0.085, `bank-window-frame-right-${tag}`);
      // mullions ride the glass front
      addBox(g, M.stoneCream, 0.05, W.height, 0.03, wx, glassY, wallFaceZ + 0.065, `bank-window-mullion-v-${tag}`);
      addBox(g, M.stoneCream, W.width, 0.05, 0.03, wx, glassY, wallFaceZ + 0.065, `bank-window-mullion-h-${tag}`);
      // projecting sill — WIDER than the frame strips (classical), top tucked
      // 1 cm under the bottom strip so no same-normal faces ever meet
      addBox(g, M.stoneCreamDark, W.width + 0.4, 0.07, 0.14, wx, W.sillY - 0.045, wallFaceZ + 0.07, `bank-window-sill-${tag}`);
    }
  }

  // --- Side windows (simpler, 2 per quiet wall) -------------------------------
  const S = L.sideWindow;
  for (const sx of [-1, 1]) {
    for (const cz of S.centers) {
      const tag = `${sx < 0 ? 'w' : 'e'}${cz < 0 ? 'n' : 's'}`;
      const faceX = sx * (w / 2 + L.wallThickness / 2);
      const glassY = S.sillY + S.height / 2;
      addBox(g, M.glassDark, 0.05, S.height, S.width, sx * (w / 2 + L.wallThickness / 2 + 0.025), glassY, cz, `bank-window-glass-side-${tag}`);
      addBox(g, M.stoneCream, 0.07, 0.12, S.width + 0.24, faceX + sx * 0.085, glassY + S.height / 2 + 0.06, cz, `bank-window-frame-top-${tag}`);
      addBox(g, M.stoneCream, 0.07, 0.12, S.width + 0.24, faceX + sx * 0.085, S.sillY - 0.06, cz, `bank-window-frame-bottom-${tag}`);
      addBox(g, M.stoneCream, 0.07, S.height, 0.12, faceX + sx * 0.085, glassY, cz - (S.width / 2 + 0.06), `bank-window-frame-left-${tag}`);
      addBox(g, M.stoneCream, 0.07, S.height, 0.12, faceX + sx * 0.085, glassY, cz + (S.width / 2 + 0.06), `bank-window-frame-right-${tag}`);
      addBox(g, M.stoneCream, 0.03, S.height, 0.05, faceX + sx * 0.065, glassY, cz, `bank-window-mullion-v-${tag}`);
      addBox(g, M.stoneCream, 0.03, 0.05, S.width, faceX + sx * 0.065, glassY, cz, `bank-window-mullion-h-${tag}`);
      addBox(g, M.stoneCreamDark, 0.14, 0.07, S.width + 0.4, faceX + sx * 0.07, S.sillY - 0.045, cz, `bank-window-sill-${tag}`);
    }
  }

  // --- Corner quoins (front corners only — the facade is the formal face) -----
  // Each block buries into the wall band and projects past the facade with
  // ALTERNATING depth (0.115 / 0.075) — the classic quoins read.
  const quoinRows = 5;
  for (const sx of [-1, 1]) {
    for (let r = 0; r < quoinRows; r += 1) {
      const proud = r % 2 === 0 ? 0.115 : 0.075;
      const qzMin = d / 2 - 0.2;
      const qzMax = wallFaceZ + proud;
      const cy = 0.51 + r * 0.88;
      addBox(
        g, M.stoneCream,
        0.63, 0.82, qzMax - qzMin,
        sx * (w / 2 - 0.135), cy, (qzMin + qzMax) / 2,
        `bank-quoine-${sx < 0 ? 'w' : 'e'}-${r}`,
      );
    }
  }

  return g;
}

/* ========================================================================== */
/* Masonry factories (unit box × transform scale → collider == visual)        */
/* ========================================================================== */

/** One masonry wall segment. Brick texture repeat comes from metadata;
 *  `plaster: true` swaps the aged brick for cream plaster — the interior
 *  partitions read as finished rooms (spec §C interior palette), not facades. */
export class BankWallFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const M = createBankMaterials();
    const meta = definition.metadata as Record<string, unknown>;
    const repeat = Array.isArray(meta.brickRepeat) ? (meta.brickRepeat as number[]) : [8, 8];
    if (meta.plaster === true) {
      applyMap(M.stoneCream, stoneTexture(repeat[0] ?? 4, repeat[1] ?? 4));
    } else {
      applyMap(M.brick, brickTexture(repeat[0] ?? 8, repeat[1] ?? 8));
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M.brick);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'bank-wall-segment';
    return mesh;
  }
}

/** One stone step / the landing. Scale IS the block size. */
export class BankStairFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const M = createBankMaterials();
    const meta = definition.metadata as Record<string, unknown>;
    const repeat = Array.isArray(meta.stoneRepeat) ? (meta.stoneRepeat as number[]) : [4, 1];
    applyMap(M.stoneCream, stoneTexture(repeat[0] ?? 4, repeat[1] ?? 1));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M.stoneCream);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'bank-stair-block';
    return mesh;
  }
}

/** Interior flagstone floor slab. Scale IS the slab size. */
export class BankFloorFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const M = createBankMaterials();
    const meta = definition.metadata as Record<string, unknown>;
    const repeat = Array.isArray(meta.floorRepeat) ? (meta.floorRepeat as number[]) : [9, 7];
    applyMap(M.floorStone, flagstoneTexture(repeat[0] ?? 9, repeat[1] ?? 7));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M.floorStone);
    mesh.receiveShadow = true;
    mesh.name = 'bank-floor-slab';
    return mesh;
  }
}

/* ========================================================================== */
/* Registration                                                               */
/* ========================================================================== */

/** All assetType strings the bank EXTERIOR module registers (UI lists / tests). */
export const BANK_EXTERIOR_ASSET_TYPES = Object.freeze([
  'bank-building',
  'bank-wall',
  'bank-stair',
  'bank-floor',
] as const);

/**
 * Register the exterior asset types. Throws on duplicate registration (the
 * registry enforces explicit intent). Composes with registerBankFactories()
 * (the supplied interior file) via registerAllBankFactories().
 */
export function registerBankExteriorFactories(registry: AssetRegistry): void {
  registry.register('bank-building', new BankBuildingFactory(), 'Bank Building');
  registry.register('bank-wall', new BankWallFactory(), 'Bank Wall');
  registry.register('bank-stair', new BankStairFactory(), 'Bank Stair');
  registry.register('bank-floor', new BankFloorFactory(), 'Bank Floor');
}

/** The saloon-style shell factory — reads width/depth/height/doorWidth from metadata. */
export class BankBuildingFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    return buildBankShell(shellDimsOf(definition));
  }
}
