/**
 * src/assets/saloon/SaloonBuildingFactory.ts
 * -----------------------------------------------------------------------------
 * The saloon BUILDING SHELL factory + every saloon asset factory class and
 * their one-call registration.
 *
 * Architecture contract (mirrors CubeAssetFactory / GroundAssetFactory):
 *  - Factories implement IAssetFactory.create(definition) and build ONLY
 *    mesh-level state (geometry, material, shadows, lights). They NEVER
 *    apply the registry transform — ThreeRendererAdapter owns that.
 *  - The shell (floor, roof, false front, sign, porch, corner posts, facade
 *    windows) is ONE managed object with `collider: false` — collision comes
 *    exclusively from the separately registered `saloon-wall` boxes, whose
 *    transform scale IS their size (CollisionWorld derives AABBs from the
 *    transform alone).
 *  - Dimensions come from metadata (width/depth/height/doorWidth), defaulting
 *    to SALOON_LAYOUT so the shell can never drift from the wall layout.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { IAssetFactory } from '../IAssetFactory.js';
import type { AssetRegistry } from '../AssetRegistry.js';
import { SALOON_LAYOUT, frontWallSegments } from './SaloonLayout.js';
import { createSaloonMaterials, type SaloonMaterials } from './SaloonMaterials.js';
import {
  buildBarCounter,
  buildBackBar,
  buildBarStool,
  buildPokerTable,
  buildSaloonChair,
  buildPiano,
  buildSwingingDoors,
  buildChandelier,
  buildSpittoon,
  buildWhiskeyBarrel,
  buildWantedPoster,
} from './SaloonProps.js';

/* ========================================================================== */
/* Small helpers                                                              */
/* ========================================================================== */

function addBox(
  parent: THREE.Object3D,
  m: SaloonMaterials[keyof SaloonMaterials],
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
  m: SaloonMaterials[keyof SaloonMaterials],
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
    width: num('width', SALOON_LAYOUT.width),
    depth: num('depth', SALOON_LAYOUT.depth),
    height: num('height', SALOON_LAYOUT.height),
    doorWidth: num('doorWidth', SALOON_LAYOUT.doorWidth),
  };
}

/* ========================================================================== */
/* The shell builder                                                          */
/* ========================================================================== */

/**
 * Western saloon shell, +Z = entrance side:
 *   interior floor slab · flat roof with overhang + fascia trim · tall
 *   false-front parapet carrying the SALOON sign · porch (deck, posts,
 *   roof) · corner posts · 4 facade windows flanking the centered doorway.
 *
 * Deliberately EXCLUDES the four walls (separate `saloon-wall` objects own
 * the colliders) and the doorway leaves (independent swinging-doors object).
 */
export function buildSaloonShell(dims: ShellDims): THREE.Group {
  const M = createSaloonMaterials();
  const g = new THREE.Group();
  g.name = 'saloon-building';

  const { width: w, depth: d, height: h } = dims;
  const roofOverhang = SALOON_LAYOUT.roofOverhang;
  const roofTop = h + 0.18; // roof slab y ∈ [h, h + 0.18]

  // --- Interior floor slab (seats props at y = 0.05) -------------------------
  // Bottom face lifted 1 cm off the ground plane: its edges are hidden by
  // the walls, and no down-facing face of this slab may be coplanar with
  // the wall bottoms at y = 0.
  addBox(g, M.woodMed, w - 0.06, 0.04, d - 0.06, 0, 0.03, 0, 'saloon-floor');

  // --- Flat roof with overhang -----------------------------------------------
  addBox(g, M.woodDark, w + roofOverhang * 2, 0.18, d + roofOverhang * 2, 0, h + 0.09, 0, 'saloon-roof');
  // Fascia trim hanging from the roof edge on the three quiet sides; the top
  // half is buried in the roof slab, the bottom hangs 6 cm below it.
  const roofHalfD = d / 2 + roofOverhang;
  addBox(g, M.woodLight, w + roofOverhang * 2, 0.22, 0.06, 0, h + 0.05, -(roofHalfD + 0.03), 'saloon-fascia-rear');
  addBox(g, M.woodLight, 0.06, 0.22, d + roofOverhang * 2 + 0.12, -(w / 2 + roofOverhang + 0.03), h + 0.05, 0, 'saloon-fascia-west');
  addBox(g, M.woodLight, 0.06, 0.22, d + roofOverhang * 2 + 0.12, w / 2 + roofOverhang + 0.03, h + 0.05, 0, 'saloon-fascia-east');

  // --- False front parapet (the unmistakable saloon silhouette) --------------
  // Stands ON the roof slab (stacked contact at roofTop). Box depth 0.14:
  // front face 9 cm PROUD of the entrance wall's outer face, back face 5 cm
  // behind it (above the wall top there is only air, so nothing is buried).
  const wallFaceZ = d / 2 + SALOON_LAYOUT.wallThickness / 2;
  const ffBottom = roofTop;
  const ffTop = SALOON_LAYOUT.falseFrontTop;
  addBox(
    g, M.woodLight,
    w + 0.24, ffTop - ffBottom, 0.14,
    0, (ffBottom + ffTop) / 2, wallFaceZ + 0.02, // center = face − 0.05 + 0.14/2 → front at face+0.09
    'saloon-false-front',
  );

  // --- SALOON sign: board → band → letter blocks, each layer embedded into
  // --- the previous one and standing proud of its face.
  const boardZ = wallFaceZ + 0.09; // false front's front face
  const signY = ffBottom + (ffTop - ffBottom) * 0.42;
  addBox(g, M.woodDark, 5.2, 0.7, 0.1, 0, signY, boardZ + 0.05 - 0.02, 'saloon-sign-board');
  // (board z-span: [boardZ − 0.02, boardZ + 0.08] — back buried in the false
  // front, front 8 cm proud.)
  const boardFrontZ = boardZ + 0.08;
  addBox(g, M.paper, 4.6, 0.34, 0.06, 0, signY, boardFrontZ + 0.01, 'saloon-sign-band');
  const bandFrontZ = boardFrontZ + 0.04;
  // "SALOON" — 6 ink blocks, evenly spaced, each sunk into the band.
  const letters = 6;
  for (let i = 0; i < letters; i += 1) {
    const x = -1.8 + i * 0.72;
    addBox(g, M.ink, 0.18, 0.22, 0.05, x, signY, bandFrontZ + 0.005, `saloon-sign-letter-${i}`);
  }

  // --- Facade windows flanking the door (both sides of the entrance) --------
  // REAL frame: four wood strips around a visible glass pane (the glass is
  // NOT buried inside a solid frame box — it must actually read as glass),
  // plus a cross bar pair riding the glass front and a protruding sill.
  const win = SALOON_LAYOUT.window;
  const glassHalfH = win.height / 2;                 // 0.65
  const glassY = win.sillY + glassHalfH;             // 1.75
  const stripD = 0.07;
  const stripZ = wallFaceZ + 0.02 + stripD / 2;      // strips span [face+0.02, face+0.09]
  const glassZ = wallFaceZ + 0.025;                  // glass spans [face, face+0.05]
  const barZ = wallFaceZ + 0.065;                    // bars span [face+0.05, face+0.08]
  for (const side of [-1, 1]) {
    for (const off of win.centersFromDoor) {
      const wx = side * off;
      const tag = `${side < 0 ? 'w' : 'e'}${off}`;
      // Glass: back face stacked ON the wall's outer face (back-to-back).
      addBox(g, M.glassDark, win.width, win.height, 0.05, wx, glassY, glassZ, `saloon-window-glass-${tag}`);
      // Frame strips: tops/bottoms stacked on the glass edges, sides abut
      // the glass sides; fronts stand 4 cm proud of the glass front.
      addBox(g, M.woodLight, win.width + 0.24, 0.12, stripD, wx, glassY + glassHalfH + 0.06, stripZ, `saloon-window-frame-top-${tag}`);
      addBox(g, M.woodLight, win.width + 0.24, 0.12, stripD, wx, win.sillY - 0.06, stripZ, `saloon-window-frame-bottom-${tag}`);
      addBox(g, M.woodLight, 0.12, win.height, stripD, wx - (win.width / 2 + 0.06), glassY, stripZ, `saloon-window-frame-left-${tag}`);
      addBox(g, M.woodLight, 0.12, win.height, stripD, wx + (win.width / 2 + 0.06), glassY, stripZ, `saloon-window-frame-right-${tag}`);
      // Cross bars ride the glass front (stacked contact), inside the frame.
      addBox(g, M.woodLight, 0.05, win.height, 0.03, wx, glassY, barZ, `saloon-window-cross-v-${tag}`);
      addBox(g, M.woodLight, win.width, 0.05, 0.03, wx, glassY, barZ, `saloon-window-cross-h-${tag}`);
      // Sill: top face stacked under the bottom frame strip, front 4 cm
      // proud of the strips, back buried into the wall.
      addBox(g, M.woodDark, win.width + 0.24, 0.06, 0.14, wx, win.sillY - 0.15, wallFaceZ + 0.06, `saloon-window-sill-${tag}`);
    }
  }

  // --- Porch: deck + posts + porch roof ---------------------------------------
  addBox(g, M.woodMed, w + 0.6, 0.09, SALOON_LAYOUT.porchDepth, 0, 0.045, wallFaceZ + SALOON_LAYOUT.porchDepth / 2, 'saloon-porch-deck');
  const postH = SALOON_LAYOUT.porchRoofTopY - 0.12 - 0.09;
  const postXs = [-w / 2 - 0.1, -1.8, 1.8, w / 2 + 0.1];
  postXs.forEach((px, i) => {
    addCyl(g, M.woodDark, 0.08, 0.09, postH, 8, px, 0.09 + postH / 2, wallFaceZ + SALOON_LAYOUT.porchDepth - 0.2, `saloon-porch-post-${i}`);
  });
  addBox(g, M.woodDark, w + 0.9, 0.12, SALOON_LAYOUT.porchDepth + 0.2, 0, SALOON_LAYOUT.porchRoofTopY - 0.06, wallFaceZ + SALOON_LAYOUT.porchDepth / 2, 'saloon-porch-roof');

  // --- Corner posts (wrap the four corners; tops buried in the roof band,
  // --- bases sunk 6 cm into the ground like real planted timbers) ------------
  // Span: [−0.06, h + 0.1] — the top stays BELOW the false front's bottom
  // (roofTop) so post and parapet never share a plane.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(g, M.woodDark, 0.24, h + 0.16, 0.56, sx * (w / 2), (h + 0.04) / 2, sz * (d / 2), `saloon-corner-post-${sx < 0 ? 'w' : 'e'}${sz < 0 ? 'n' : 's'}`);
    }
  }

  return g;
}

/* ========================================================================== */
/* Factory classes                                                            */
/* ========================================================================== */

/** The saloon shell — reads width/depth/height/doorWidth from metadata. */
export class SaloonBuildingFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    return buildSaloonShell(shellDimsOf(definition));
  }
}

/**
 * One wall segment. The geometry is a UNIT box: the registry transform's
 * scale IS the wall's size, which is exactly how CollisionWorld derives the
 * collider AABB — visual and collider can never disagree.
 */
export class SaloonWallFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    const M = createSaloonMaterials();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M.woodMed);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'saloon-wall-segment';
    return mesh;
  }
}

/** Each prop factory below wraps one SaloonProps builder. Metadata passthrough is minimal and documented per class. */

export class SaloonBarCounterFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const meta = definition.metadata as Record<string, unknown>;
    const length = Number(meta.barCounterLength);
    return buildBarCounter(Number.isFinite(length) && length > 0 ? { barCounterLength: length } : {});
  }
}

export class SaloonBackBarFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const meta = definition.metadata as Record<string, unknown>;
    const width = Number(meta.backBarWidth);
    return buildBackBar(Number.isFinite(width) && width > 0 ? { backBarWidth: width } : {});
  }
}

export class SaloonBarStoolFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    return buildBarStool();
  }
}

export class SaloonPokerTableFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    return buildPokerTable();
  }
}

export class SaloonChairFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    return buildSaloonChair();
  }
}

export class SaloonPianoFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    return buildPiano();
  }
}

export class SaloonSwingingDoorsFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    return buildSwingingDoors();
  }
}

export class SaloonChandelierFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const meta = definition.metadata as Record<string, unknown>;
    const lights = Number(meta.lights ?? 1);
    return buildChandelier({ lights: Number.isFinite(lights) ? lights : 1 });
  }
}

export class SaloonSpittoonFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    return buildSpittoon();
  }
}

export class SaloonWhiskeyBarrelFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    return buildWhiskeyBarrel();
  }
}

export class SaloonWantedPosterFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    return buildWantedPoster();
  }
}

/* ========================================================================== */
/* Registration                                                               */
/* ========================================================================== */

/** All assetType strings the saloon module registers (UI lists / tests). */
export const SALOON_ASSET_TYPES = Object.freeze([
  'saloon-building',
  'saloon-wall',
  'saloon-swinging-doors',
  'saloon-bar-counter',
  'saloon-back-bar',
  'saloon-bar-stool',
  'saloon-poker-table',
  'saloon-chair',
  'saloon-piano',
  'saloon-chandelier',
  'saloon-spittoon',
  'saloon-whiskey-barrel',
  'saloon-wanted-poster',
] as const);

export type SaloonAssetType = (typeof SALOON_ASSET_TYPES)[number];

/**
 * Register every saloon asset type. Throws on duplicate registration (the
 * registry enforces explicit intent), so call it ONCE during boot — it
 * composes cleanly with registerPrimitiveFactories().
 */
export function registerSaloonFactories(registry: AssetRegistry): void {
  registry.register('saloon-building', new SaloonBuildingFactory(), 'Saloon Building');
  registry.register('saloon-wall', new SaloonWallFactory(), 'Saloon Wall');
  registry.register('saloon-swinging-doors', new SaloonSwingingDoorsFactory(), 'Saloon Swinging Doors');
  registry.register('saloon-bar-counter', new SaloonBarCounterFactory(), 'Saloon Bar Counter');
  registry.register('saloon-back-bar', new SaloonBackBarFactory(), 'Saloon Back Bar');
  registry.register('saloon-bar-stool', new SaloonBarStoolFactory(), 'Saloon Bar Stool');
  registry.register('saloon-poker-table', new SaloonPokerTableFactory(), 'Saloon Poker Table');
  registry.register('saloon-chair', new SaloonChairFactory(), 'Saloon Chair');
  registry.register('saloon-piano', new SaloonPianoFactory(), 'Saloon Piano');
  registry.register('saloon-chandelier', new SaloonChandelierFactory(), 'Saloon Chandelier');
  registry.register('saloon-spittoon', new SaloonSpittoonFactory(), 'Saloon Spittoon');
  registry.register('saloon-whiskey-barrel', new SaloonWhiskeyBarrelFactory(), 'Saloon Whiskey Barrel');
  registry.register('saloon-wanted-poster', new SaloonWantedPosterFactory(), 'Saloon Wanted Poster');
}

/** Re-export so playable-map can compute segment widths without importing deep paths. */
export { frontWallSegments };
