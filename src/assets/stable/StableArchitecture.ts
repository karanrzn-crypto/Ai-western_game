/**
 * src/assets/stable/StableArchitecture.ts
 * -----------------------------------------------------------------------------
 * The Livery Stable BUILDING SHELL factory + the unit-box factories whose
 * transform scale IS their collider (mirrors SheriffBuildingFactory's
 * architecture contract):
 *
 *  - Factories implement IAssetFactory.create(definition) and build ONLY
 *    mesh-level state — they NEVER apply the registry transform (the
 *    ThreeRendererAdapter owns that).
 *  - The SHELL KIT (gable roof + gable infills with real vent/hay-door
 *    holes, foundation skirt, corner boards, water table, frieze, window
 *    assemblies lined into real openings, door casings, structural posts +
 *    beams + rafters + collar ties + ridge beam, the hay-loft deck + railing
 *    + ladder, the projecting LIVERY sign, the hay door + hoist beam, the
 *    hanging HORSES sign and the four lanterns) is ONE managed object with
 *    `collider: false` — collision comes exclusively from the separately
 *    registered 'stable-wall' / 'stable-floor' / 'stable-bar-wall' /
 *    'stable-stall-front' boxes whose transform scale IS their size.
 *  - SOLID furniture factories (troughs, workbench) are PRE-DIVIDED: the
 *    geometry is authored final_size ÷ scale so visual == collider exactly.
 *
 * Z-fighting discipline: every layered part is either back-to-back stacked
 * (max-vs-min contact) or offset ≥ 5 mm from the plane it faces; signs and
 * mount plates stand proud, liners bury into their openings.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { IAssetFactory } from '../IAssetFactory.js';
import { STABLE_LAYOUT } from './StableLayout.js';
import { createStableMaterials, type StableMaterials } from './StableMaterials.js';
import { addBox, addCyl, signFace, stableLantern } from './StableProps.js';

type Mat = THREE.Material;

/* ========================================================================== */
/* Window assembly (lined into a real wall opening)                           */
/* ========================================================================== */

/**
 * One window assembly in the X/Y plane facing +Z (outward), ORIGIN AT THE
 * HOLE CENTER on the wall mid-plane: local z ∈ [−t/2, +t/2] is inside the
 * masonry, +z pokes outside. Liner boards stand 2 cm proud of BOTH faces,
 * the glass sits at the mid-plane, casing + sill + lintel dress the outside.
 * Stall windows get an iron bar cage; facade windows get shutters.
 */
function buildWindowAssembly(
  M_: StableMaterials,
  width: number,
  height: number,
  bars: boolean,
  shutters: boolean,
): THREE.Group {
  const g = new THREE.Group();
  const t = STABLE_LAYOUT.wallThickness;
  const hw = width / 2;
  const hh = height / 2;
  const lining = 0.05;
  const liningDepth = t + 0.04; // 2 cm proud each face
  const casing = 0.09;
  const face = t / 2;

  const lw = width + lining * 2;
  addBox(g, M_.trim, lw, lining * 2, liningDepth, 0, -hh, 0, 'window-liner-bottom');
  addBox(g, M_.trim, lw, lining * 2, liningDepth, 0, hh, 0, 'window-liner-top');
  addBox(g, M_.trim, lining * 2, height - lining * 2, liningDepth, -hw, 0, 0, 'window-liner-left');
  addBox(g, M_.trim, lining * 2, height - lining * 2, liningDepth, hw, 0, 0, 'window-liner-right');

  const glass = addBox(g, M_.glass, width - lining * 2, height - lining * 2, 0.02, 0, 0, 0, 'window-glass');
  glass.castShadow = false;
  addBox(g, M_.trim, 0.05, height - lining * 2 - 0.004, 0.02, 0, 0, 0.022, 'window-muntin-v');
  addBox(g, M_.trim, width - lining * 2 - 0.004, 0.05, 0.02, 0, 0, 0.022, 'window-muntin-h');

  const casingZ = liningDepth / 2 + 0.0125;
  addBox(g, M_.trim, lw + casing * 2, casing, 0.025, 0, hh + lining + casing / 2, casingZ, 'window-casing-top');
  addBox(g, M_.trim, lw + casing * 2, casing, 0.025, 0, -hh - lining - casing / 2, casingZ, 'window-casing-bottom');
  addBox(g, M_.trim, casing, height + lining * 2, 0.025, -hw - lining - casing / 2, 0, casingZ, 'window-casing-left');
  addBox(g, M_.trim, casing, height + lining * 2, 0.025, hw + lining + casing / 2, 0, casingZ, 'window-casing-right');
  addBox(g, M_.trim, lw + casing * 2 + 0.08, 0.07, 0.18, 0, -hh - lining - 0.09, face + 0.08, 'window-sill');
  addBox(g, M_.trim, lw + casing * 2 + 0.08, 0.1, 0.1, 0, hh + lining + 0.05, face + 0.03, 'window-lintel');
  addBox(g, M_.trim, lw + casing * 2, 0.05, 0.14, 0, -hh - lining - 0.025, -face - 0.07, 'window-sill-inner');

  if (shutters) {
    const sw = hw * 0.72;
    for (const side of [-1, 1] as const) {
      const sx = side * (hw + lining + casing + sw / 2 + 0.02);
      addBox(g, M_.trim, sw, height + lining * 2, 0.05, sx, 0, face + 0.025, 'shutter');
      for (let i = 0; i < 6; i++) {
        addBox(g, M_.trim, sw - 0.04, 0.025, 0.03, sx, -hh + 0.09 + (i * (height - 0.18)) / 5, face + 0.055, 'shutter-slat');
      }
    }
  }

  if (bars) {
    for (let i = 0; i < 4; i++) {
      const bx = -hw + 0.06 + (i * (width - 0.12)) / 3;
      addCyl(g, M_.iron, 0.015, 0.015, height + 0.1, 8, bx, 0, face + 0.085, 'stable-bar');
    }
    addBox(g, M_.iron, width + 0.1, 0.055, 0.04, 0, 0, face + 0.085, 'stable-bar-strap');
  }

  return g;
}

/* ========================================================================== */
/* Gable infill with real holes (vents + hay door)                            */
/* ========================================================================== */

/** Triangle gable wall (local base y=0 at the wall top) with rectangular
 *  holes cut through; extrude depth = wall thickness. */
function buildGable(M_: StableMaterials, holes: Array<{ x: number; y: number; w: number; h: number }>): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-STABLE_LAYOUT.width / 2, 0);
  shape.lineTo(STABLE_LAYOUT.width / 2, 0);
  shape.lineTo(0, STABLE_LAYOUT.roof.ridgeY - STABLE_LAYOUT.wallHeight + 0.01);
  shape.closePath();
  for (const h of holes) {
    const path = new THREE.Path();
    path.moveTo(h.x - h.w / 2, h.y);
    path.lineTo(h.x - h.w / 2, h.y + h.h);
    path.lineTo(h.x + h.w / 2, h.y + h.h);
    path.lineTo(h.x + h.w / 2, h.y);
    path.closePath();
    shape.holes.push(path);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: STABLE_LAYOUT.wallThickness, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, M_.siding);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'gable-infill';
  return mesh;
}

/* ========================================================================== */
/* The shell kit                                                              */
/* ========================================================================== */

interface ShellDims {
  width: number;
  depth: number;
  height: number;
  gateWidth: number;
  gateHeight: number;
}

/**
 * Western livery stable shell, +Z = the big south gate:
 *   foundation skirt · corner boards + water table + frieze · gable roof
 *   (two sloped slabs + ridge cap + eave fascia) · north/south gable infills
 *   with vent louvers + the gable hay door + hoist beam · projecting
 *   LIVERY sign · 9 lined window assemblies · gate/staff/room door casings ·
 *   structural posts, aisle beams, wall plates, loft joists + deck + railing
 *   + ladder · rafters, collar ties, ridge beam · hanging HORSES sign ·
 *   4 lanterns (exactly 4 real PointLights — the stable's light budget).
 *
 * Deliberately EXCLUDES the walls/floor/partitions/stall fronts (separate
 * unit-box objects own the colliders) and the 10 doors (their own assets).
 */
export function buildStableShell(dims: ShellDims): THREE.Group {
  const M_ = createStableMaterials();
  const L = STABLE_LAYOUT;
  const g = new THREE.Group();
  g.name = 'stable-building';

  const w = dims.width;
  const d = dims.depth;
  const h = dims.height;
  const t = L.wallThickness;
  const floorTop = L.floorTop;
  const halfW = (w - t) / 2; // 5.475 — wall center line
  const halfD = (d - t) / 2; // 6.375
  const facadeZ = d / 2; // 6.5 outer face
  const gateHalf = dims.gateWidth / 2;
  const gateH = dims.gateHeight;

  /* --- Foundation skirt (proud of the walls, tops just past the floor) --- */
  {
    const skirtH = 0.3;
    const skirtY = skirtH / 2 - 0.02;
    addBox(g, M_.timber, w + 0.08, skirtH, 0.1, 0, skirtY, halfD + 0.08, 'foundation-south');
    addBox(g, M_.timber, w + 0.08, skirtH, 0.1, 0, skirtY, -halfD - 0.08, 'foundation-north');
    addBox(g, M_.timber, 0.1, skirtH, d - t - 0.06, -halfW - 0.08, skirtY, 0, 'foundation-west');
    addBox(g, M_.timber, 0.1, skirtH, d - t - 0.06, halfW + 0.08, skirtY, 0, 'foundation-east');
  }

  /* --- Corner boards + water table + frieze ------------------------------- */
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      addBox(g, M_.trim, 0.18, h + 0.04, 0.18, sx * (halfW + 0.045), (h + 0.04) / 2 - 0.025, sz * (halfD + 0.045), `corner-board-${sx < 0 ? 'w' : 'e'}${sz < 0 ? 'n' : 's'}`);
    }
  }
  addBox(g, M_.trim, w + 0.1, 0.12, 0.06, 0, 0.19, halfD + 0.105, 'water-table-south');
  addBox(g, M_.trim, w + 0.1, 0.12, 0.06, 0, 0.19, -halfD - 0.105, 'water-table-north');
  for (const sx of [-1, 1] as const) {
    addBox(g, M_.trim, 0.06, 0.12, d - t + 0.1, sx * (halfW + 0.105), 0.19, 0, `water-table-${sx < 0 ? 'west' : 'east'}`);
  }
  addBox(g, M_.trim, w + 0.12, 0.24, 0.05, 0, h - 0.1, halfD + 0.07, 'frieze-south');
  addBox(g, M_.trim, w + 0.12, 0.24, 0.05, 0, h - 0.1, -halfD - 0.07, 'frieze-north');
  for (const sx of [-1, 1] as const) {
    addBox(g, M_.trim, 0.05, 0.24, d - t + 0.12, sx * (halfW + 0.07), h - 0.1, 0, `frieze-${sx < 0 ? 'west' : 'east'}`);
  }

  /* --- Gable roof: two sloped slabs + ridge cap + eave fascia -------------- */
  {
    const rise = L.roof.ridgeY - L.roof.wallSeatY; // 2.05
    const run = w / 2 + L.roof.overhangX; // 6.1
    const slope = rise / (w / 2); // 0.366 per meter from the ridge
    const angle = Math.atan(slope);
    const slabLen = Math.hypot(run, rise + L.roof.overhangX * slope);
    const midX = run / 2;
    const undersideAt = (x: number): number => L.roof.ridgeY - x * slope;
    for (const sx of [-1, 1] as const) {
      const slab = addBox(g, M_.shingle, slabLen, L.roof.thickness, d + L.roof.overhangZ * 2, sx * midX, undersideAt(midX) + L.roof.thickness / 2, 0, `roof-slab-${sx < 0 ? 'west' : 'east'}`);
      slab.rotation.z = sx > 0 ? -angle : angle;
    }
    addBox(g, M_.iron, 0.4, 0.07, d + L.roof.overhangZ * 2, 0, L.roof.ridgeY + L.roof.thickness + 0.02, 0, 'ridge-cap');
    // Eave fascia boards on the two lower edges (east/west).
    const eaveY = undersideAt(run);
    for (const sx of [-1, 1] as const) {
      addBox(g, M_.trim, 0.06, 0.2, d + L.roof.overhangZ * 2, sx * (run + 0.03), eaveY - 0.08, 0, `eave-fascia-${sx < 0 ? 'west' : 'east'}`);
    }
  }

  /* --- Gable infills (north + south) with REAL holes ------------------------ */
  {
    const vents = (x: number): Array<{ x: number; y: number; w: number; h: number }> => [
      { x, y: 0.7, w: 0.45, h: 0.35 },
      { x: -x, y: 0.7, w: 0.45, h: 0.35 },
    ];
    // SOUTH gable: hay door hole (world y 3.7–4.35 → local 0.3–0.95) + 2 vents.
    const south = buildGable(M_, [
      { x: 0, y: 0.3, w: 1.15, h: 0.65 },
      ...vents(2.0),
    ]);
    south.position.set(0, h, d / 2 - t);
    south.name = 'gable-south';
    g.add(south);
    // NORTH gable: 2 vents only.
    const north = buildGable(M_, vents(1.6));
    north.position.set(0, h, -d / 2);
    north.name = 'gable-north';
    g.add(north);

    // Vent louvers (proud frames + slats) on all four vent holes.
    const louver = (x: number, zBase: number, dir: 1 | -1): void => {
      const grp = new THREE.Group();
      grp.name = 'gable-vent';
      addBox(grp, M_.trim, 0.55, 0.45, 0.04, x, h + 0.875, zBase + dir * 0.02, 'vent-frame');
      for (let i = 0; i < 3; i++) {
        const slat = addBox(grp, M_.plankDark, 0.45, 0.03, 0.06, x, h + 0.78 + i * 0.11, zBase + dir * 0.03, 'vent-slat');
        slat.rotation.x = dir * -0.6;
      }
      g.add(grp);
    };
    louver(1.6, -d / 2, -1);
    louver(-1.6, -d / 2, -1);
    louver(2.0, d / 2 - t, 1);
    louver(-2.0, d / 2 - t, 1);

    // Gable HAY DOOR: liner boards inside the hole, frame proud, board door
    // inset behind the frame, straps + handle (decorative, closed).
    const hyC = h + 0.625; // hole center y (world 4.225)
    const hz = d / 2 - t / 2; // south gable mid-plane
    addBox(g, M_.plankDark, 1.05, 0.55, 0.03, 0, hyC, hz, 'haydoor-liner');
    const fr = 0.09;
    addBox(g, M_.trim, 1.15 + fr * 2, fr, 0.07, 0, h + 0.95 + fr / 2, facadeZ - 0.005, 'haydoor-frame-top');
    addBox(g, M_.trim, 1.15 + fr * 2, fr, 0.07, 0, h + 0.3 - fr / 2, facadeZ - 0.005, 'haydoor-frame-bottom');
    addBox(g, M_.trim, fr, 0.65 + fr * 2, 0.07, -(1.15 / 2 + fr / 2), hyC, facadeZ - 0.005, 'haydoor-frame-left');
    addBox(g, M_.trim, fr, 0.65 + fr * 2, 0.07, 1.15 / 2 + fr / 2, hyC, facadeZ - 0.005, 'haydoor-frame-right');
    addBox(g, M_.plankDark, 1.12, 0.62, 0.045, 0, hyC, facadeZ - 0.075, 'haydoor-leaf');
    for (let i = 1; i < 4; i++) {
      addBox(g, M_.timber, 0.014, 0.58, 0.04, -0.56 + i * 0.28, hyC, facadeZ - 0.068, 'haydoor-seam');
    }
    addBox(g, M_.iron, 0.34, 0.05, 0.016, -0.35, hyC + 0.18, facadeZ - 0.05, 'haydoor-strap');
    addBox(g, M_.iron, 0.05, 0.12, 0.03, 0.42, hyC, facadeZ - 0.06, 'haydoor-handle');
  }

  /* --- Hay HOIST beam on the north gable + pulley + rope -------------------- */
  {
    const beamY = 4.9;
    addBox(g, M_.timber, 0.12, 0.12, 0.75, 0, beamY, -facadeZ - 0.375, 'hoist-beam');
    const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 14), M_.iron);
    pulley.position.set(0, beamY - 0.14, -facadeZ - 0.68);
    pulley.name = 'hoist-pulley';
    pulley.castShadow = true;
    g.add(pulley);
    addCyl(g, M_.hayDark, 0.012, 0.012, 0.62, 6, 0, beamY - 0.5, -facadeZ - 0.68, 'hoist-rope');
    addBox(g, M_.iron, 0.05, 0.05, 0.1, 0, beamY - 0.16, -facadeZ - 0.66, 'hoist-hook');
  }

  /* --- Projecting LIVERY sign on the south gable ----------------------------- */
  {
    const boardY = 4.735; // board center (board 0.63 tall → 4.42…5.05)
    addBox(g, M_.trim, 2.3, 0.63, 0.06, 0, boardY, facadeZ + 0.12, 'livery-sign-board');
    const face = signFace('LIVERY', 2.2, 0.53, { sub: 'S T A B L E' });
    face.position.set(0, boardY, facadeZ + 0.155);
    face.name = 'livery-sign-face';
    g.add(face);
    // iron straps tie the board back to the gable face (z 6.5 → 6.59)
    for (const sx of [-0.85, 0.85] as const) {
      addBox(g, M_.iron, 0.045, 0.2, 0.12, sx, boardY + 0.18, facadeZ + 0.045, 'livery-sign-strap');
    }
    // diagonal braces from the wall up to the board's bottom edge
    for (const sx of [-0.95, 0.95] as const) {
      const brace = addBox(g, M_.iron, 0.04, 0.34, 0.04, sx, boardY - 0.28, facadeZ + 0.07, 'livery-sign-brace');
      brace.rotation.x = -0.55;
    }
  }

  /* --- Windows: real assemblies lined into the wall openings ----------------- */
  for (const win of L.windows) {
    const asm = buildWindowAssembly(M_, win.width, win.height, win.bars, win.shutters);
    const midY = win.sill + win.height / 2;
    switch (win.wall) {
      case 'south':
        asm.position.set(win.center, midY, halfD);
        break;
      case 'north':
        asm.position.set(win.center, midY, -halfD);
        asm.rotation.y = Math.PI;
        break;
      case 'west':
        asm.position.set(-halfW, midY, win.center);
        asm.rotation.y = -Math.PI / 2;
        break;
      case 'east':
        asm.position.set(halfW, midY, win.center);
        asm.rotation.y = Math.PI / 2;
        break;
    }
    asm.name = `window-${win.wall}-${win.center}`;
    g.add(asm);
  }

  /* --- Door casings (2 cm proud rings, buried seats — no shared planes) ----- */
  {
    const casing = (cx: number, cz: number, cw: number, ch: number, alongX: boolean, base: number): void => {
      const depth = t + 0.04; // 2 cm proud of BOTH wall faces
      const jW = 0.12;
      if (alongX) {
        addBox(g, M_.trim, jW, ch + 0.06, depth, cx - (cw / 2 + jW / 2 - 0.01), base + (ch + 0.06) / 2 - 0.03, cz, 'door-casing-jamb');
        addBox(g, M_.trim, jW, ch + 0.06, depth, cx + (cw / 2 + jW / 2 - 0.01), base + (ch + 0.06) / 2 - 0.03, cz, 'door-casing-jamb');
        addBox(g, M_.trim, cw + jW * 2, 0.12, depth, cx, base + ch + 0.03, cz, 'door-casing-header');
      } else {
        addBox(g, M_.trim, depth, ch + 0.06, jW, cx, base + (ch + 0.06) / 2 - 0.03, cz - (cw / 2 + jW / 2 - 0.01), 'door-casing-jamb');
        addBox(g, M_.trim, depth, ch + 0.06, jW, cx, base + (ch + 0.06) / 2 - 0.03, cz + (cw / 2 + jW / 2 - 0.01), 'door-casing-jamb');
        addBox(g, M_.trim, depth, 0.12, cw + jW * 2, cx, base + ch + 0.03, cz, 'door-casing-header');
      }
    };
    // Main gate: heavy surround on the facade.
    casing(0, facadeZ - 0.01, dims.gateWidth, gateH, true, floorTop);
    // Staff door.
    casing((L.staffDoor.xMin + L.staffDoor.xMax) / 2, facadeZ - 0.01, L.staffDoor.xMax - L.staffDoor.xMin, L.staffDoor.height, true, floorTop);
    // Room doors (walls run along z → casing runs along z).
    const dg = L.rooms.doorGap;
    const dcz = (dg.zMin + dg.zMax) / 2;
    casing(-L.rooms.wallX, dcz, dg.zMax - dg.zMin, dg.height, false, floorTop);
    casing(L.rooms.wallX, dcz, dg.zMax - dg.zMin, dg.height, false, floorTop);
    // Iron bracket straps flanking the gate (facade dress).
    for (const sx of [-1, 1] as const) {
      const strap = addBox(g, M_.iron, 0.05, 0.7, 0.03, sx * (gateHalf + 0.24), floorTop + gateH * 0.55, facadeZ + 0.02, 'gate-bracket-strap');
      strap.rotation.z = sx * -0.5;
    }
  }

  /* --- Structural posts (stall-front posts + north bay + loft edge) ---------- */
  {
    const postS = 0.18;
    const beamY = 2.62; // aisle beam bottom
    const postBottom = 0.095; // sinks 5 mm into the slab — never coplanar with it
    for (const sx of [-1, 1] as const) {
      for (const pz of [-3.0, 0.25]) {
        addBox(g, M_.timber, postS, beamY - postBottom, postS, sx * L.stallFrontX, postBottom + (beamY - postBottom) / 2, pz, `front-post-${sx < 0 ? 'w' : 'e'}-${pz}`);
      }
      addBox(g, M_.timber, postS, beamY - postBottom, postS, sx * L.stallFrontX, postBottom + (beamY - postBottom) / 2, -L.innerHalfZ + 0.12, `bay-post-${sx < 0 ? 'w' : 'e'}`);
      addBox(g, M_.timber, postS, L.loft.joistBottomY - postBottom, postS, sx * 1.2, postBottom + (L.loft.joistBottomY - postBottom) / 2, -L.loft.zMax + 0.005, `loft-post-${sx < 0 ? 'w' : 'e'}`);
    }
  }

  /* --- Aisle beams + wall plates + loft joists + deck + railing + ladder ----- */
  {
    const beamY = 2.62 + 0.08; // beam center (0.16 tall → 2.54…2.70)
    for (const sx of [-1, 1] as const) {
      addBox(g, M_.timber, 0.14, 0.16, L.rooms.dividerZ - L.loft.zMin, sx * L.stallFrontX, beamY, (L.loft.zMin + L.rooms.dividerZ) / 2, `aisle-beam-${sx < 0 ? 'w' : 'e'}`);
      addBox(g, M_.timber, 0.14, 0.16, L.innerHalfZ * 2, sx * (L.innerHalfX - 0.07), beamY, 0, `wall-plate-${sx < 0 ? 'w' : 'e'}`);
    }
    for (let z = -6.2; z <= -0.6; z += 0.8) {
      addBox(g, M_.timber, L.innerHalfX * 2, 0.15, 0.1, 0, L.loft.joistBottomY + 0.075, z, `loft-joist-${z.toFixed(1)}`);
    }
    const segLen = (L.loft.zMax - L.loft.zMin - 0.06) / 4;
    for (let i = 0; i < 4; i++) {
      const zc = L.loft.zMin + segLen / 2 + i * (segLen + 0.02);
      addBox(g, i % 2 ? M_.plankDark : M_.plank, L.innerHalfX * 2, 0.07, segLen, 0, L.loft.joistTopY + 0.035, zc, `loft-deck-${i}`);
    }
    addBox(g, M_.trim, L.innerHalfX * 2 - 0.02, 0.28, 0.06, 0, L.loft.joistBottomY + 0.135, L.loft.zMax - 0.025, 'loft-edge-board');
    // Railing along the south edge with the ladder gap.
    const railY1 = L.loft.deckTopY + 0.75;
    const railY2 = L.loft.deckTopY + 0.42;
    const gapMin = L.loft.ladderGapX.min - 0.2;
    const gapMax = L.loft.ladderGapX.max + 0.2;
    for (let x = -5.2; x <= 5.21; x += 1.2) {
      if (x > gapMin - 0.35 && x < gapMax + 0.35) continue;
      addBox(g, M_.trim, 0.07, 0.85, 0.07, x, L.loft.deckTopY + 0.42, L.loft.zMax + 0.03, 'loft-rail-post');
    }
    addBox(g, M_.trim, 0.07, 0.85, 0.07, gapMin, L.loft.deckTopY + 0.42, L.loft.zMax + 0.03, 'loft-rail-post');
    addBox(g, M_.trim, 0.07, 0.85, 0.07, gapMax, L.loft.deckTopY + 0.42, L.loft.zMax + 0.03, 'loft-rail-post');
    const westW = gapMin + L.innerHalfX;
    const eastW = L.innerHalfX - gapMax;
    addBox(g, M_.trim, westW, 0.06, 0.05, (gapMin - L.innerHalfX) / 2, railY1, L.loft.zMax + 0.03, 'loft-rail-top-w');
    addBox(g, M_.trim, eastW, 0.06, 0.05, (gapMax + L.innerHalfX) / 2, railY1, L.loft.zMax + 0.03, 'loft-rail-top-e');
    addBox(g, M_.trim, westW, 0.06, 0.05, (gapMin - L.innerHalfX) / 2, railY2, L.loft.zMax + 0.03, 'loft-rail-mid-w');
    addBox(g, M_.trim, eastW, 0.06, 0.05, (gapMax + L.innerHalfX) / 2, railY2, L.loft.zMax + 0.03, 'loft-rail-mid-e');
    // Ladder: leans from the aisle floor, top ends AT the deck edge top.
    const lad = buildLadder(L.loft.deckTopY - floorTop, L.loft.ladderRun);
    lad.position.set(L.loft.ladderX, floorTop, L.loft.ladderFootZ);
    g.add(lad);
  }

  /* --- Rafters + collar ties + ridge beam ------------------------------------ */
  {
    const rise = L.roof.ridgeY - L.roof.wallSeatY;
    const slope = rise / (L.width / 2);
    const angle = Math.atan(slope);
    const rafterLen = Math.hypot(L.width / 2 + 0.15, (L.width / 2 + 0.15) * slope);
    const rafterCx = (L.width / 2 + 0.15) / 2;
    const rafterCy = L.roof.ridgeY - rafterCx * slope - 0.09;
    for (const rz of [-6.0, -4.4, -2.8, -1.2, 0.4, 2.0, 3.6, 5.2]) {
      for (const sx of [-1, 1] as const) {
        const rafter = addBox(g, M_.timber, rafterLen, 0.14, 0.1, sx * rafterCx, rafterCy, rz, `rafter-${sx < 0 ? 'w' : 'e'}-${rz.toFixed(1)}`);
        rafter.rotation.z = sx > 0 ? -angle : angle;
      }
    }
    for (const tz of [-4.4, -1.2, 2.0, 5.2]) {
      addBox(g, M_.timber, 5.2, 0.16, 0.12, 0, L.roof.ridgeY - 0.95, tz, `collar-tie-${tz.toFixed(1)}`);
    }
    addBox(g, M_.timber, 0.14, 0.2, L.depth + L.roof.overhangZ * 2 - 0.2, 0, L.roof.ridgeY - 0.14, 0, 'ridge-beam');
  }

  /* --- Hanging HORSES sign under the loft edge ------------------------------- */
  {
    const sz = L.loft.zMax + 0.09;
    for (const sx of [-0.3, 0.3] as const) {
      addBox(g, M_.iron, 0.014, 0.26, 0.014, -0.85 + sx, L.loft.joistBottomY - 0.13, sz, 'horses-sign-chain');
    }
    addBox(g, M_.trim, 0.9, 0.3, 0.03, -0.85, L.loft.joistBottomY - 0.41, sz, 'horses-sign-board');
    const face = signFace('HORSES', 0.8, 0.24);
    face.position.set(-0.85, L.loft.joistBottomY - 0.41, sz + 0.017);
    face.name = 'horses-sign-face-n';
    g.add(face);
    const face2 = signFace('HORSES', 0.8, 0.24);
    face2.position.set(-0.85, L.loft.joistBottomY - 0.41, sz - 0.017);
    face2.rotation.y = Math.PI;
    face2.name = 'horses-sign-face-s';
    g.add(face2);
  }

  /* --- Lanterns — EXACTLY 6 real PointLights (the stable's light budget) ----- */
  {
    const gateLantern = stableLantern(true);
    gateLantern.position.set(-1.45, 2.45, facadeZ); // backplate back-to-back with the facade
    gateLantern.name = 'lantern-gate';
    g.add(gateLantern);
    const aisleLantern = stableLantern(true);
    aisleLantern.position.set(-1.55, L.loft.joistBottomY, L.loft.zMax + 0.11);
    aisleLantern.rotation.x = Math.PI / 2; // hangs DOWN from the edge board
    aisleLantern.name = 'lantern-aisle';
    g.add(aisleLantern);
    const farrierLantern = stableLantern(true);
    farrierLantern.position.set(-1.35, 2.2, -L.innerHalfZ); // north wall, west of the window, lights the bay
    farrierLantern.name = 'lantern-farrier';
    g.add(farrierLantern);
    const tackLantern = stableLantern(true);
    tackLantern.position.set(-L.rooms.wallX + L.rooms.thickness / 2, 2.2, 4.45);
    tackLantern.rotation.y = Math.PI / 2; // hangs toward +x (the aisle)
    tackLantern.name = 'lantern-tack';
    g.add(tackLantern);
    // 5+6) mid-aisle pair hanging from the stall-front beams — the aisle is
    // 13 m deep; without these its middle runs dark even at noon.
    for (const sx of [-1, 1] as const) {
      const mid = stableLantern(true);
      mid.position.set(sx * (L.stallFrontX - 0.12), 2.54, 0.6);
      mid.rotation.x = Math.PI / 2; // hangs DOWN from the beam
      mid.name = `lantern-aisle-mid-${sx < 0 ? 'w' : 'e'}`;
      g.add(mid);
    }
  }

  return g;
}

/* ========================================================================== */
/* Ladder (rails + rungs, leaning back along −Z)                              */
/* ========================================================================== */

function buildLadder(height: number, run: number): THREE.Group {
  const M_ = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'loft-ladder';
  const len = Math.hypot(height, run);
  const tilt = Math.atan2(run, height);
  const rungGeo = new THREE.BoxGeometry(0.44, 0.035, 0.035);
  let n = 0;
  for (let hDist = 0.3; hDist < len - 0.1; hDist += 0.3) {
    const rung = new THREE.Mesh(rungGeo, M_.timber);
    rung.position.set(0, Math.cos(tilt) * hDist, -Math.sin(tilt) * hDist);
    rung.rotation.x = tilt;
    rung.castShadow = true;
    rung.name = `ladder-rung-${n++}`;
    g.add(rung);
  }
  for (const sx of [-1, 1] as const) {
    const rail = addBox(g, M_.timber, 0.05, len, 0.08, sx * 0.22, Math.cos(tilt) * len / 2, -Math.sin(tilt) * len / 2, 'ladder-rail');
    rail.rotation.x = tilt;
  }
  return g;
}

/* ========================================================================== */
/* Unit-box / pre-divided factories (scale IS the collider)                   */
/* ========================================================================== */

/** One siding/plank wall segment: UNIT box scaled by the registry transform. */
export class StableWallFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const M_ = createStableMaterials();
    const meta = definition.metadata as Record<string, unknown>;
    const material = typeof meta.material === 'string' ? meta.material : 'siding';
    const mat: Mat = material === 'plank' ? M_.plank
      : material === 'plankDark' ? M_.plankDark
        : material === 'timber' ? M_.timber
          : M_.siding;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'stable-wall-segment';
    return mesh;
  }
}

/** Plank floor / threshold: UNIT box, plank texture. */
export class StableFloorFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    const M_ = createStableMaterials();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M_.plank);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'stable-floor-slab';
    return mesh;
  }
}

/**
 * One bar-grill wall (stall partitions above their wainscot): PRE-DIVIDED by
 * the registry scale — geometry authored final_size ÷ scale so the visual
 * lands EXACTLY on the AABB. Rails + vertical square bars, shared geometry.
 */
export class StableBarWallFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const M_ = createStableMaterials();
    const meta = definition.metadata as Record<string, unknown>;
    const len = Number(meta.length);
    const height = Number(meta.height);
    const Ln = Number.isFinite(len) && len > 0 ? len : 1;
    const Hn = Number.isFinite(height) && height > 0 ? height : 1.1;
    const s = definition.transform.scale;
    const sx = Math.abs(s.x) > 1e-6 ? Math.abs(s.x) : 1;
    const sy = Math.abs(s.y) > 1e-6 ? Math.abs(s.y) : 1;
    const sz = Math.abs(s.z) > 1e-6 ? Math.abs(s.z) : 1;
    const g = new THREE.Group();
    g.name = 'stable-bar-wall';

    // The def carries the LENGTH in its x-scale and the THICKNESS in z —
    // author the rails/bars along local x accordingly (visual == collider).
    // Rails run 1 cm PAST each end (buried into the wall / front junctions —
    // never coplanar with the wall plates' end faces).
    const rail = 0.06;
    addBox(g, M_.timber, (Ln + 0.02) / sx, rail / sy, 0.1 / sz, 0, (Hn / 2 - rail / 2) / sy, 0, 'bar-rail-top');
    addBox(g, M_.timber, (Ln + 0.02) / sx, rail / sy, 0.1 / sz, 0, -(Hn / 2 - rail / 2) / sy, 0, 'bar-rail-bottom');
    const barGeo = new THREE.BoxGeometry(0.035 / sx, (Hn - rail * 2) / sy, 0.035 / sz);
    const count = Math.max(2, Math.round(Ln / 0.16));
    for (let i = 0; i < count; i++) {
      // half-step inset: no bar lands exactly on a junction face
      const x = (-Ln / 2 + ((i + 0.5) * Ln) / count) / sx;
      const bar = new THREE.Mesh(barGeo, M_.timber);
      bar.position.set(x, 0, 0);
      bar.castShadow = true;
      bar.name = `bar-${i}`;
      g.add(bar);
    }
    return g;
  }
}

/**
 * One stall-front segment: lower wainscot boards + upper bar grill + cap
 * rail, PRE-DIVIDED by the registry scale. metadata: wainscot, wainscotH,
 * length, height, floorY (the segment base's world y).
 */
export class StableStallFrontFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const M_ = createStableMaterials();
    const meta = definition.metadata as Record<string, unknown>;
    const len = Number(meta.length) || 1;
    const height = Number(meta.height) || 2.45;
    const wainscot = Boolean(meta.wainscot);
    const wainscotH = Number(meta.wainscotH) || 1.35;
    const floorY = Number(meta.floorY) || 0.1;
    const s = definition.transform.scale;
    const sx = Math.abs(s.x) > 1e-6 ? Math.abs(s.x) : 1;
    const sy = Math.abs(s.y) > 1e-6 ? Math.abs(s.y) : 1;
    const sz = Math.abs(s.z) > 1e-6 ? Math.abs(s.z) : 1;
    const g = new THREE.Group();
    g.name = 'stable-stall-front';

    // The def box is centered on the wall mid-plane; segment-local y = 0 at
    // the segment's base (floorY), heights measured upward from there.
    const y = (v: number): number => (floorY + v - (floorY + height / 2)) / sy;

    if (wainscot) {
      const wh = wainscotH - floorY;
      // Full-box parts author (1, …, 1) — metric sub-parts author metric÷scale.
      const slab = addBox(g, M_.plankDark, 1, wh / sy, 1, 0, y(wh / 2), 0, 'front-wainscot');
      slab.castShadow = true;
      addBox(g, M_.trim, 1 + 0.012 / sx, 0.07 / sy, 1 - 0.004 / sz, 0, y(wh + 0.035), 0, 'wainscot-cap');
      this.addBars(g, M_, len, height - wh, wh, sx, sy, sz, y);
    } else {
      this.addBars(g, M_, len, height, 0, sx, sy, sz, y);
    }
    return g;
  }

  private addBars(
    g: THREE.Group,
    M_: StableMaterials,
    len: number,
    barH: number,
    fromY: number,
    sx: number, sy: number, sz: number,
    y: (v: number) => number,
  ): void {
    if (barH <= 0.02) return;
    const rail = 0.05;
    addBox(g, M_.trim, 0.09 / sx, rail / sy, len / sz, 0, y(fromY + barH - rail / 2), 0, 'front-cap-rail');
    addBox(g, M_.trim, 0.09 / sx, rail / sy, len / sz, 0, y(fromY + rail / 2), 0, 'front-mid-rail');
    const barGeo = new THREE.BoxGeometry(0.04 / sx, (barH - rail * 2) / sy, 0.04 / sz);
    const count = Math.max(2, Math.round(len / 0.16));
    for (let i = 0; i < count; i++) {
      // half-step inset: no bar ever lands exactly on a segment boundary
      const z = (-len / 2 + ((i + 0.5) * len) / count) / sz;
      const bar = new THREE.Mesh(barGeo, M_.timber);
      bar.position.set(0, y(fromY + rail + (barH - rail * 2) / 2), z);
      bar.castShadow = true;
      bar.name = `front-bar-${i}`;
      g.add(bar);
    }
  }
}

/**
 * Feed / water trough: PRE-DIVIDED slatted trough. metadata: axis ('x'|'z'
 * = the LENGTH direction), hayLevel (0–1), water (bool). The def scale IS
 * the trough's collider box.
 */
export class StableTroughFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const M_ = createStableMaterials();
    const meta = definition.metadata as Record<string, unknown>;
    const axis: 'x' | 'z' = meta.axis === 'z' ? 'z' : 'x';
    const water = Boolean(meta.water);
    const hayLevel = Math.min(1, Math.max(0, Number(meta.hayLevel) || 0));
    const s = definition.transform.scale;
    const sx = Math.abs(s.x) > 1e-6 ? Math.abs(s.x) : 1;
    const sy = Math.abs(s.y) > 1e-6 ? Math.abs(s.y) : 1;
    const sz = Math.abs(s.z) > 1e-6 ? Math.abs(s.z) : 1;
    const g = new THREE.Group();
    g.name = water ? 'stable-water-trough' : 'stable-feed-trough';

    const len = axis === 'x' ? sx : sz;
    const depth = axis === 'x' ? sz : sx;
    const plankT = 0.045;
    const sideLen = len - 0.02;
    const innerD = depth - plankT * 2;
    const hDiv = sy; // height divisor
    const height = sy;

    // Long walls (along the length axis)
    for (const side of [-1, 1] as const) {
      if (axis === 'x') {
        addBox(g, M_.plankDark, sideLen / sx, (height - 0.01) / hDiv, plankT / sz, 0, 0, side * (depth / 2 - plankT / 2) / sz, 'trough-wall');
      } else {
        addBox(g, M_.plankDark, plankT / sx, (height - 0.01) / hDiv, sideLen / sz, side * (depth / 2 - plankT / 2) / sx, 0, 0, 'trough-wall');
      }
    }
    // End walls
    for (const e of [-1, 1] as const) {
      if (axis === 'x') {
        addBox(g, M_.plankDark, plankT / sx, (height - 0.01) / hDiv, depth / sz, e * (len / 2 - plankT / 2) / sx, 0, 0, 'trough-end');
      } else {
        addBox(g, M_.plankDark, depth / sx, (height - 0.01) / hDiv, plankT / sz, 0, 0, e * (len / 2 - plankT / 2) / sz, 'trough-end');
      }
    }
    // Trough floor
    if (axis === 'x') {
      addBox(g, M_.plankDark, sideLen / sx, 0.04 / hDiv, innerD / sz, 0, -(height / 2 - 0.05) / hDiv, 0, 'trough-floor');
    } else {
      addBox(g, M_.plankDark, innerD / sx, 0.04 / hDiv, sideLen / sz, 0, -(height / 2 - 0.05) / hDiv, 0, 'trough-floor');
    }
    // Water surface / hay fill
    const fillH = height * 0.45;
    const fillY = -(height / 2) / hDiv + (0.07 + (fillH * (water ? 1 : 0.4 + hayLevel * 0.6)) / 2) / hDiv;
    if (water) {
      if (axis === 'x') {
        addBox(g, M_.water, (sideLen - 0.05) / sx, 0.03 / hDiv, (depth - 0.1) / sz, 0, fillY, 0, 'trough-water');
      } else {
        addBox(g, M_.water, (depth - 0.1) / sx, 0.03 / hDiv, (sideLen - 0.05) / sz, 0, fillY, 0, 'trough-water');
      }
    } else if (hayLevel > 0.02) {
      const hayH = fillH * (0.4 + hayLevel * 0.6);
      if (axis === 'x') {
        addBox(g, M_.hay, (sideLen - 0.04) / sx, hayH / hDiv, (depth - 0.08) / sz, 0, -(height / 2 - 0.07 - hayH / 2) / hDiv, 0, 'trough-hay');
      } else {
        addBox(g, M_.hay, (depth - 0.08) / sx, hayH / hDiv, (sideLen - 0.04) / sz, 0, -(height / 2 - 0.07 - hayH / 2) / hDiv, 0, 'trough-hay');
      }
    }
    return g;
  }
}

/** Farrier workbench: PRE-DIVIDED top + legs + lower shelf. */
export class StableWorkbenchFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const M_ = createStableMaterials();
    const s = definition.transform.scale;
    const sx = Math.abs(s.x) > 1e-6 ? Math.abs(s.x) : 1;
    const sy = Math.abs(s.y) > 1e-6 ? Math.abs(s.y) : 1;
    const sz = Math.abs(s.z) > 1e-6 ? Math.abs(s.z) : 1;
    const g = new THREE.Group();
    g.name = 'stable-workbench';

    const topT = 0.07;
    const H = sy; // 0.9
    addBox(g, M_.plankDark, 1 / sx, topT / sy, 1 / sz, 0, (H / 2 - topT / 2) / sy, 0, 'bench-top');
    const legH = H - topT;
    const legGeo = new THREE.BoxGeometry(0.09 / sx, legH / sy, 0.09 / sz);
    for (const lx of [-1, 1] as const) {
      for (const lz of [-1, 1] as const) {
        const leg = new THREE.Mesh(legGeo, M_.timber);
        leg.position.set(lx * 0.66 / sx, (H / 2 - topT - legH / 2) / sy, lz * 0.21 / sz);
        leg.castShadow = true;
        leg.name = 'bench-leg';
        g.add(leg);
      }
    }
    addBox(g, M_.plankDark, 1.2 / sx, 0.045 / sy, 0.5 / sz, 0, (H / 2 - topT - 0.22) / sy, 0, 'bench-shelf');
    return g;
  }
}

/** Anvil on its oak stump (scale 1 — approximate 1×1 collider, bank-style). */
export class StableAnvilFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const M_ = createStableMaterials();
    const g = new THREE.Group();
    g.name = 'stable-anvil';
    addCyl(g, M_.plankDark, 0.26, 0.3, 0.42, 12, 0, 0.21, 0, 'anvil-stump');
    addBox(g, M_.iron, 0.5, 0.14, 0.16, 0, 0.49, 0, 'anvil-body');
    addBox(g, M_.iron, 0.14, 0.16, 0.13, -0.26, 0.44, 0, 'anvil-horn-base');
    const horn = addCyl(g, M_.iron, 0.006, 0.045, 0.24, 10, -0.42, 0.5, 0, 'anvil-horn');
    horn.rotation.z = Math.PI / 2 + 0.22;
    addBox(g, M_.iron, 0.09, 0.1, 0.12, 0.28, 0.47, 0, 'anvil-heel');
    return g;
  }
}

/* ========================================================================== */
/* Registration                                                               */
/* ========================================================================== */

export const STABLE_ARCH_ASSET_TYPES = Object.freeze([
  'stable-building',
  'stable-wall',
  'stable-floor',
  'stable-bar-wall',
  'stable-stall-front',
  'stable-feed-trough',
  'stable-water-trough',
  'stable-workbench',
  'stable-anvil',
] as const);

export type StableArchAssetType = (typeof STABLE_ARCH_ASSET_TYPES)[number];
