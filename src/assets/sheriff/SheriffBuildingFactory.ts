/**
 * src/assets/sheriff/SheriffBuildingFactory.ts
 * -----------------------------------------------------------------------------
 * The Sheriff Office BUILDING SHELL factory + masonry/plank/bar unit-box
 * factories + registration (mirrors BankExterior's architecture contract):
 *
 *  - Factories implement IAssetFactory.create(definition) and build ONLY
 *    mesh-level state (geometry, material, shadows). They NEVER apply the
 *    registry transform — ThreeRendererAdapter owns that.
 *  - The shell (porch, gable roof, SHERIFF sign, CITY JAIL plaque, front
 *    door held open, six window assemblies, foundation skirt, stovepipe,
 *    corner boards, water table, frieze) is ONE managed object with
 *    `collider: false` — collision comes exclusively from the separately
 *    registered 'sheriff-wall' / 'sheriff-floor' / 'sheriff-ceiling' /
 *    'sheriff-bar-segment' boxes whose transform scale IS their size
 *    (CollisionWorld derives AABBs from the transform alone, so the unit-box
 *    factories build geometry of exactly that size: visual == collider).
 *  - Dimensions come from metadata (width/depth/height/doorWidth), defaulting
 *    to SHERIFF_LAYOUT so the shell can never drift from the wall layout.
 *
 * Z-fighting discipline: every layered part is either back-to-back stacked
 * (max-vs-min contact — the allowed case) or offset ≥ 5 mm from the plane it
 * faces; the sign board buries 4 cm into the facade, window frames stand
 * clear of the siding, the foundation skirt is proud of the walls.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { IAssetFactory } from '../IAssetFactory.js';
import type { AssetRegistry } from '../AssetRegistry.js';
import { SHERIFF_LAYOUT } from './SheriffLayout.js';
import { createSheriffMaterials, makeCanvas, toTexture } from './SheriffMaterials.js';
import { SheriffAssetFactory } from './SheriffOfficeAssetFactory.js';

/* ========================================================================== */
/* Small helpers                                                              */
/* ========================================================================== */

type Mat = THREE.Material;

function addBox(
  parent: THREE.Object3D,
  m: Mat,
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
  m: Mat,
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
    width: num('width', SHERIFF_LAYOUT.width),
    depth: num('depth', SHERIFF_LAYOUT.depth),
    height: num('height', SHERIFF_LAYOUT.wallHeight),
    doorWidth: num('doorWidth', SHERIFF_LAYOUT.frontDoor.xMax - SHERIFF_LAYOUT.frontDoor.xMin),
  };
}

/** Painted town-sign board: border, big serif text and a star glyph. */
function signBoardTexture(text: string, sub?: string): THREE.CanvasTexture | null {
  const c = makeCanvas(1024, 256);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = '#3d4a3a';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#e6d9b8';
  ctx.fillRect(14, 14, 996, 228);
  ctx.strokeStyle = '#2a2016';
  ctx.lineWidth = 10;
  ctx.strokeRect(24, 24, 976, 208);
  ctx.fillStyle = '#2a2016';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 150px Georgia, "Times New Roman", serif';
  ctx.fillText(text, sub ? 560 : 512, 128);
  if (sub) {
    // gold star + small sub line (for the CITY JAIL plaque style)
    ctx.fillStyle = '#b08d3d';
    ctx.font = 'bold 60px Georgia, serif';
    ctx.fillText(sub, 560, 205);
  }
  return toTexture(canvas, 1, 1);
}

/* ========================================================================== */
/* Window assembly                                                            */
/* ========================================================================== */

/**
 * One double-hung window assembly mounted ON a wall face. The assembly lives
 * in the X/Y plane facing +Z; the caller rotates/positions it per wall.
 * Parts: casing (4 strips), sill, lintel, two sashes with a 2×2 muntin grid,
 * one glass pane, optional shutters, optional iron bar cage.
 */
function buildWindowAssembly(
  M: ReturnType<typeof createSheriffMaterials>,
  width: number,
  height: number,
  bars: boolean,
  shutters: boolean,
): THREE.Group {
  const g = new THREE.Group();
  const hw = width / 2;
  const hh = height / 2;
  const casing = 0.09;

  // Glass pane: one plate, back face at z = 0 (stacked ON the wall face).
  const glass = addBox(g, M.glass, width, height, 0.04, 0, 0, 0.02, 'window-glass');
  glass.castShadow = false;

  // Casing strips around the glass (fronts 4 cm proud of the glass front).
  const cz = 0.06;
  addBox(g, M.trim, width + casing * 2, casing, 0.07, 0, hh + casing / 2, cz, 'window-casing-top');
  addBox(g, M.trim, width + casing * 2, casing, 0.07, 0, -hh - casing / 2, cz, 'window-casing-bottom');
  addBox(g, M.trim, casing, height, 0.07, -hw - casing / 2, 0, cz, 'window-casing-left');
  addBox(g, M.trim, casing, height, 0.07, hw + casing / 2, 0, cz, 'window-casing-right');
  // Muntin cross (rides the glass front; 4 mm inset so no edge is ever
  // coplanar with the glass edges).
  addBox(g, M.trim, 0.05, height - 0.004, 0.03, 0, 0, 0.04, 'window-muntin-v');
  addBox(g, M.trim, width - 0.004, 0.05, 0.03, 0, 0, 0.04, 'window-muntin-h');
  // Lintel + sill (sill projects 6 cm; top buried under the bottom casing).
  addBox(g, M.trim, width + casing * 2 + 0.08, 0.1, 0.09, 0, hh + casing + 0.05, 0.045, 'window-lintel');
  addBox(g, M.trim, width + casing * 2 + 0.08, 0.07, 0.16, 0, -hh - casing - 0.035, 0.05, 'window-sill');

  if (shutters) {
    // Two louvered shutters (simple slat stacks) flanking the window.
    const sw = hw * 0.72;
    for (const side of [-1, 1] as const) {
      const sx = side * (hw + casing + sw / 2 + 0.02);
      addBox(g, M.trim, sw, height, 0.05, sx, 0, 0.025, 'shutter');
      for (let i = 0; i < 7; i++) {
        addBox(g, M.trim, sw - 0.04, 0.025, 0.03, sx, -hh + 0.09 + (i * (height - 0.18)) / 6, 0.055, 'shutter-slat');
      }
    }
  }

  if (bars) {
    // Iron bar cage: 4 vertical bars + top/bottom straps, standing 6 cm off
    // the glass front (fixed to the casing, like a real frontier jail cage).
    for (let i = 0; i < 4; i++) {
      const bx = -hw + 0.06 + (i * (width - 0.12)) / 3;
      addCyl(g, M.iron, 0.016, 0.016, height + 0.1, 8, bx, 0, 0.1, 'jail-bar');
    }
    // One horizontal iron strap across the middle of the cage (a real
    // jail-window look); it stands 4 cm clear of the glass front.
    addBox(g, M.iron, width + 0.1, 0.06, 0.04, 0, 0, 0.1, 'jail-bar-strap');
  }

  return g;
}

/* ========================================================================== */
/* The shell builder                                                          */
/* ========================================================================== */

/**
 * Western Sheriff Office shell, +Z = street side:
 *   porch (deck-side posts + shed roof + fascia + brackets) · gable roof
 *   (two sloped slabs + gable infills + ridge cap + eave fascia) · stone
 *   foundation skirt · corner boards + water table + frieze · front door
 *   (casing + leaf held open) · SHERIFF sign + CITY JAIL plaque · stovepipe
 *   through the roof with flashing + cap.
 *
 * Deliberately EXCLUDES the walls / floor / ceiling / bar fronts (separate
 * unit-box objects own the colliders) and the two cell doors (user assets).
 */
export function buildSheriffShell(dims: ShellDims): THREE.Group {
  const M = createSheriffMaterials();
  const L = SHERIFF_LAYOUT;
  const g = new THREE.Group();
  g.name = 'sheriff-building';

  const { width: w, depth: d, height: h } = dims;
  const wallHalfW = (w - L.wallThickness) / 2;
  const wallHalfD = (d - L.wallThickness) / 2;
  const facadeZ = d / 2; // front wall outer face
  const floorTop = L.floorTop;

  // --- Stone foundation skirt (proud of the walls, tops just under the floor) --
  const skirtH = 0.24;
  const skirtY = skirtH / 2 - 0.015; // bottom −0.015 (never coplanar with the corner boards' −0.025)
  addBox(g, M.stone, w + 0.06, skirtH, 0.09, 0, skirtY, wallHalfD + 0.075, 'foundation-south');
  addBox(g, M.stone, w + 0.06, skirtH, 0.09, 0, skirtY, -wallHalfD - 0.075, 'foundation-north');
  addBox(g, M.stone, 0.09, skirtH, d - t0(L) - 0.06, -wallHalfW - 0.075, skirtY, 0, 'foundation-west');
  addBox(g, M.stone, 0.09, skirtH, d - t0(L) - 0.06, wallHalfW + 0.075, skirtY, 0, 'foundation-east');

  // --- Corner boards + water table + frieze (the trim system) ------------------
  // Corner boards sink 2 cm into the ground (bottom never coplanar with the
  // wall bottoms at y = 0) and rise 2 cm past the wall top (buried look).
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      addBox(g, M.trim, 0.18, h + 0.04, 0.18, sx * (wallHalfW + 0.045), (h + 0.04) / 2 - 0.025, sz * (wallHalfD + 0.045), `corner-board-${sx < 0 ? 'w' : 'e'}${sz < 0 ? 'n' : 's'}`);
    }
  }
  // Water table: skirt trim band at the floor line (3 cm proud, no coplanar).
  addBox(g, M.trim, w + 0.1, 0.12, 0.06, 0, 0.19, wallHalfD + 0.105, 'water-table-south');
  addBox(g, M.trim, w + 0.1, 0.12, 0.06, 0, 0.19, -wallHalfD - 0.105, 'water-table-north');
  for (const sx of [-1, 1] as const) {
    addBox(g, M.trim, 0.06, 0.12, d - t0(L) + 0.1, sx * (wallHalfW + 0.105), 0.19, 0, `water-table-${sx < 0 ? 'west' : 'east'}`);
  }
  // Frieze board under the eaves on all four sides (tops under the roof slabs).
  addBox(g, M.trim, w + 0.12, 0.24, 0.05, 0, h - 0.1, wallHalfD + 0.07, 'frieze-south');
  addBox(g, M.trim, w + 0.12, 0.24, 0.05, 0, h - 0.1, -wallHalfD - 0.07, 'frieze-north');
  for (const sx of [-1, 1] as const) {
    addBox(g, M.trim, 0.05, 0.24, d - t0(L) + 0.12, sx * (wallHalfW + 0.07), h - 0.1, 0, `frieze-${sx < 0 ? 'west' : 'east'}`);
  }

  // --- Gable roof: two sloped slabs + gable infills + ridge cap + eave fascia --
  {
    const rise = L.roof.ridgeY - L.roof.eaveY;
    const runZ = wallHalfD + L.roof.overhangZ;
    const slopeLen = Math.hypot(rise, runZ);
    const angle = Math.atan2(rise, runZ);
    const midZ = runZ / 2;
    const midY = (L.roof.ridgeY + (L.roof.eaveY - (runZ - wallHalfD) * (rise / wallHalfD))) / 2;
    for (const sz of [-1, 1] as const) {
      const slab = addBox(g, M.shingle, w + L.roof.overhangX * 2, L.roof.thickness, slopeLen, 0, midY, sz * midZ, `roof-slab-${sz < 0 ? 'north' : 'south'}`);
      slab.rotation.x = sz > 0 ? angle : -angle;
    }
    // Gable infill triangles (continue the east/west wall planes up to the
    // ridge). Extrusion runs along local +z; after the ±90° yaw it points
    // along ∓x, so position the band exactly on the wall band [±wallCenter
    // ± t/2] — back-to-back with nothing, flush with the wall planes.
    const shape = new THREE.Shape();
    shape.moveTo(-wallHalfD, 0);
    shape.lineTo(wallHalfD, 0);
    shape.lineTo(0, L.roof.ridgeY - h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: L.wallThickness, bevelEnabled: false });
    for (const sx of [-1, 1] as const) {
      const infill = new THREE.Mesh(geo, M.clapboard);
      infill.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      infill.position.set(sx * (wallHalfW + L.wallThickness / 2), h, 0);
      infill.castShadow = true;
      infill.receiveShadow = true;
      infill.name = `gable-infill-${sx < 0 ? 'west' : 'east'}`;
      g.add(infill);
    }
    // Ridge cap.
    addBox(g, M.iron, w + L.roof.overhangX * 2, 0.07, 0.34, 0, L.roof.ridgeY + 0.02, 0, 'ridge-cap');
    // Eave fascia boards along the two eave edges (fronts proud, tops under slabs).
    const eaveOuterZ = wallHalfD + L.roof.overhangZ;
    const eaveY = L.roof.eaveY - (L.roof.overhangZ) * (rise / wallHalfD);
    for (const sz of [-1, 1] as const) {
      addBox(g, M.trim, w + L.roof.overhangX * 2, 0.2, 0.06, 0, eaveY - 0.06, sz * (eaveOuterZ + 0.03), `eave-fascia-${sz < 0 ? 'north' : 'south'}`);
    }
  }

  // --- Porch (office half only): posts + shed roof + fascia + brackets --------
  {
    const px0 = L.porch.xMin;
    const px1 = L.porch.xMax;
    const pc = (px0 + px1) / 2;
    const pw = px1 - px0;
    const pz0 = wallHalfD + L.wallThickness / 2; // facade outer face line
    const pz1 = pz0 + L.porch.depth;
    const pcz = (pz0 + pz1) / 2;
    // Posts (0.14 sq) with simple capitals, deck top → porch roof underside.
    const postH = L.porch.roofBackY - 0.1 - floorTop;
    for (const px of [px0 + 0.35, px1 - 0.35]) {
      addBox(g, M.trim, L.porch.postSection, postH, L.porch.postSection, px, floorTop + postH / 2, pz1 - 0.18, 'porch-post');
      addBox(g, M.trim, L.porch.postSection + 0.08, 0.07, L.porch.postSection + 0.08, px, floorTop + postH + 0.035, pz1 - 0.18, 'porch-post-cap');
    }
    // Shed roof: thin slab sloping down toward the street (+z).
    const roofLen = pz1 - pz0 + 0.24;
    const shed = addBox(g, M.shingle, pw + 0.5, 0.09, roofLen, pc, (L.porch.roofFrontY + L.porch.roofBackY) / 2 + 0.045, pcz + 0.12, 'porch-roof');
    shed.rotation.x = Math.atan2(L.porch.roofBackY - L.porch.roofFrontY, roofLen);
    // Fascia along the porch roof's street edge + two scroll brackets.
    addBox(g, M.trim, pw + 0.5, 0.22, 0.06, pc, L.porch.roofFrontY - 0.07, pz1 + 0.24 + 0.0, 'porch-fascia');
    for (const bx of [px0 + 0.35, px1 - 0.35]) {
      const bracket = addBox(g, M.trim, 0.07, 0.3, 0.5, bx, L.porch.roofFrontY - 0.25, pz1 - 0.05, 'porch-bracket');
      bracket.rotation.x = -0.5;
    }
  }

  // --- Front door: casing + threshold + leaf held OPEN against the west jamb --
  {
    const dxm = (L.frontDoor.xMin + L.frontDoor.xMax) / 2;
    const dw = L.frontDoor.xMax - L.frontDoor.xMin;
    const dh = L.frontDoor.height;
    const casing = 0.1;
    // Casing (both faces — the door reads from the porch AND the office).
    for (const sz of [-1, 1] as const) {
      const z = facadeZ + sz * (L.wallThickness / 2 + 0.035);
      addBox(g, M.trim, dw + casing * 2, casing, 0.07, dxm, floorTop + dh + casing / 2 - 0.02, z, `door-casing-top-${sz < 0 ? 'in' : 'out'}`);
      addBox(g, M.trim, casing, dh, 0.07, L.frontDoor.xMin - casing / 2 + 0.01, floorTop + dh / 2, z, `door-casing-west-${sz < 0 ? 'in' : 'out'}`);
      addBox(g, M.trim, casing, dh, 0.07, L.frontDoor.xMax + casing / 2 - 0.01, floorTop + dh / 2, z, `door-casing-east-${sz < 0 ? 'in' : 'out'}`);
    }
    // Door leaf: wood with an upper glass pane + strap hinges + handle.
    const leaf = new THREE.Group();
    leaf.name = 'front-door-leaf';
    // Hinge on the WEST jamb; swung 100° into the office (propped open).
    leaf.position.set(L.frontDoor.xMin + 0.02, floorTop, wallHalfD);
    leaf.rotation.y = 100 * (Math.PI / 180);
    const leafW = dw - 0.06;
    addBox(leaf, M.trim, leafW, dh - 0.06, 0.06, leafW / 2, (dh - 0.06) / 2 + 0.02, 0, 'door-leaf');
    addBox(leaf, M.glass, leafW * 0.55, 0.6, 0.03, leafW / 2, dh - 0.5, 0.015, 'door-glass');
    addBox(leaf, M.iron, 0.3, 0.05, 0.02, leafW * 0.2, dh - 0.9, 0.04, 'door-strap-hinge');
    const knob = addCyl(leaf, M.iron, 0.03, 0.03, 0.05, 10, leafW - 0.08, 1.0, 0.05, 'door-knob');
    knob.rotation.x = Math.PI / 2;
    g.add(leaf);
  }

  // --- SHERIFF sign above the porch + CITY JAIL plaque over the barred window -
  {
    const sign = new THREE.Group();
    sign.name = 'sheriff-sign';
    const pc = (L.porch.xMin + L.porch.xMax) / 2;
    addBox(sign, M.iron, 3.9, 1.06, 0.08, pc, 3.98, facadeZ + 0.0, 'sign-backboard');
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 0.9), new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: signBoardTexture('SHERIFF') ?? undefined,
      roughness: 0.8,
    }));
    board.position.set(pc, 3.98, facadeZ + 0.045);
    board.name = 'sign-face';
    sign.add(board);
    // Star rosettes at the two ends of the board.
    for (const sx of [-1, 1] as const) {
      const star = new THREE.Mesh(
        new THREE.CircleGeometry(0.14, 10),
        new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4, metalness: 0.6 }),
      );
      star.position.set(pc + sx * 2.06, 3.98, facadeZ + 0.055);
      star.name = 'sign-star';
      sign.add(star);
    }
    g.add(sign);
    // CITY JAIL plaque over the barred jail window.
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: signBoardTexture('CITY JAIL') ?? undefined,
      roughness: 0.85,
    }));
    plaque.position.set(2.7, 2.95, facadeZ + 0.01);
    plaque.name = 'city-jail-plaque';
    g.add(plaque);
  }

  // --- Windows on the four facades --------------------------------------------
  for (const win of L.windows) {
    const asm = buildWindowAssembly(M, win.width, win.height, win.bars, win.shutters);
    switch (win.wall) {
      case 'south':
        asm.position.set(win.center, win.sill + win.height / 2, facadeZ);
        break;
      case 'north':
        asm.position.set(win.center, win.sill + win.height / 2, -facadeZ);
        asm.rotation.y = Math.PI;
        break;
      case 'west':
        asm.position.set(-facadeZ, win.sill + win.height / 2, win.center);
        asm.rotation.y = Math.PI / 2;
        break;
      case 'east':
        asm.position.set(facadeZ, win.sill + win.height / 2, win.center);
        asm.rotation.y = -Math.PI / 2;
        break;
    }
    asm.name = `window-${win.wall}-${win.center}`;
    g.add(asm);
  }

  // --- Stovepipe through the roof (continues the potbelly stove's pipe) -------
  {
    const sx = L.stove.x;
    const sz = L.stove.z;
    const rise = L.roof.ridgeY - L.roof.eaveY;
    const roofYAt = L.roof.eaveY + (wallHalfD - Math.abs(sz)) * (rise / wallHalfD) - (wallHalfD - Math.abs(sz) > 0 ? 0 : 0);
    const pipeBottom = floorTop + 1.61; // overlaps the stove's elbow (5 mm seat)
    const pipeTop = roofYAt + 0.35;
    addCyl(g, M.iron, 0.055, 0.055, pipeTop - pipeBottom, 12, sx, (pipeBottom + pipeTop) / 2, sz, 'stovepipe');
    addCyl(g, M.iron, 0.16, 0.09, 0.14, 12, sx, roofYAt + 0.04, sz, 'stovepipe-flashing');
    addCyl(g, M.iron, 0.12, 0.12, 0.05, 12, sx, pipeTop + 0.06, sz, 'stovepipe-cap');
  }

  return g;
}

/** Wall thickness accessor kept tiny — the shell needs it for skirt spans. */
function t0(_L: typeof SHERIFF_LAYOUT): number {
  return SHERIFF_LAYOUT.wallThickness;
}

/* ========================================================================== */
/* Unit-box factories (scale IS the collider size)                            */
/* ========================================================================== */

/** One clapboard wall segment: UNIT box scaled by the registry transform. */
export class SheriffWallFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const M = createSheriffMaterials();
    const meta = definition.metadata as Record<string, unknown>;
    const material = typeof meta.material === 'string' ? meta.material : 'clapboard';
    let mat: Mat = M.clapboard;
    if (material === 'iron') mat = M.iron;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'sheriff-wall-segment';
    return mesh;
  }
}

/** Plank floor / porch deck / threshold: UNIT box, plank texture. */
export class SheriffFloorFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    const M = createSheriffMaterials();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M.plank);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'sheriff-floor-slab';
    return mesh;
  }
}

/** Interior plank ceiling: UNIT box, darker planks. */
export class SheriffCeilingFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    const M = createSheriffMaterials();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M.plankDark);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'sheriff-ceiling-slab';
    return mesh;
  }
}

/**
 * One jail bar-front segment: rails + vertical bars, built CENTERED on the
 * group origin (local y ∈ [−h/2, +h/2], local z ∈ [−len/2, +len/2]) so the
 * visual EXACTLY matches the transform-derived AABB (center = position,
 * size = scale). Bars are shared-geometry instanced-style cylinders.
 */
export class SheriffBarSegmentFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const M = createSheriffMaterials();
    const meta = definition.metadata as Record<string, unknown>;
    const len = Number(meta.length);
    const height = Number(meta.height);
    const L = Number.isFinite(len) && len > 0 ? len : 1;
    const H = Number.isFinite(height) && height > 0 ? height : 3.3;
    const g = new THREE.Group();
    g.name = 'sheriff-bar-segment';

    const rail = 0.07;
    addBox(g, M.iron, 0.1, rail, L, 0, H / 2 - rail / 2, 0, 'bar-rail-top');
    addBox(g, M.iron, 0.1, 0.09, L, 0, -H / 2 + 0.045, 0, 'bar-rail-bottom');
    const barGeo = new THREE.CylinderGeometry(0.015, 0.015, H - rail - 0.09, 8);
    const count = Math.max(2, Math.round(L / 0.14));
    for (let i = 0; i <= count; i++) {
      const z = -L / 2 + (i * L) / count;
      const bar = new THREE.Mesh(barGeo, M.iron);
      bar.position.set(0, 0, z);
      bar.castShadow = true;
      bar.name = `bar-${i}`;
      g.add(bar);
    }
    return g;
  }
}

/**
 * Wall lantern: iron back plate + curved arm + glass box + candle flame +
 * PointLight. Origin at the BACK of the back plate (mount it 5 mm off the
 * wall face); the lantern hangs toward local +Z.
 */
export function buildSheriffLantern(): THREE.Group {
  const M = createSheriffMaterials();
  const g = new THREE.Group();
  g.name = 'sheriff-lantern';

  addBox(g, M.iron, 0.14, 0.2, 0.03, 0, 0, 0.015, 'lantern-backplate');
  const arm = addCyl(g, M.iron, 0.014, 0.014, 0.18, 8, 0, 0.08, 0.1, 'lantern-arm');
  arm.rotation.x = Math.PI / 2;
  addBox(g, M.iron, 0.12, 0.02, 0.12, 0, -0.02, 0.18, 'lantern-floor');
  const glass = addBox(g, M.glassWarm, 0.09, 0.14, 0.09, 0, 0.06, 0.18, 'lantern-glass');
  glass.castShadow = false;
  for (const sx of [-1, 1] as const) {
    addBox(g, M.iron, 0.012, 0.16, 0.012, sx * 0.045, 0.06, 0.14, 'lantern-post');
  }
  addBox(g, M.iron, 0.12, 0.02, 0.12, 0, 0.15, 0.18, 'lantern-top');
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffdf9a, emissive: 0xffb347, emissiveIntensity: 1.6 }),
  );
  flame.position.set(0, 0.05, 0.18);
  flame.name = 'lantern-flame';
  g.add(flame);
  const light = new THREE.PointLight(0xffc26e, 0.55, 3.2, 2);
  light.position.set(0, 0.06, 0.18);
  light.name = 'lantern-light';
  g.add(light);

  return g;
}

/* ========================================================================== */
/* Registration                                                               */
/* ========================================================================== */

/** Shell-side asset type strings (the 14 user asset types register separately). */
export const SHERIFF_BUILDING_ASSET_TYPES = Object.freeze([
  'sheriff-building',
  'sheriff-wall',
  'sheriff-floor',
  'sheriff-ceiling',
  'sheriff-bar-segment',
  'sheriff-lantern',
] as const);

export type SheriffBuildingAssetType = (typeof SHERIFF_BUILDING_ASSET_TYPES)[number];

/** Register the shell + unit-box + lantern factories. Throws on duplicates. */
export function registerSheriffBuildingFactories(registry: AssetRegistry): void {
  registry.register('sheriff-building', new SheriffBuildingFactory(), 'Sheriff Building');
  registry.register('sheriff-wall', new SheriffWallFactory(), 'Sheriff Wall');
  registry.register('sheriff-floor', new SheriffFloorFactory(), 'Sheriff Floor');
  registry.register('sheriff-ceiling', new SheriffCeilingFactory(), 'Sheriff Ceiling');
  registry.register('sheriff-bar-segment', new SheriffBarSegmentFactory(), 'Sheriff Bar Segment');
  registry.register('sheriff-lantern', new SheriffAssetFactory(() => buildSheriffLantern()), 'Sheriff Lantern');
}

export class SheriffBuildingFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    return buildSheriffShell(shellDimsOf(definition));
  }
}
