/**
 * src/assets/gunshop/GunShopProps.ts
 * -----------------------------------------------------------------------------
 * The Gun Shop prop library — weapons are STYLIZED VISUAL PROPS ONLY (no
 * ballistic/caliber/firing mechanics anywhere), adapted from the user's
 * GunShopAssetFactory.ts with the project's architecture rules:
 *
 *   • MESH-BUILDING KEPT as the visual source (revolver cylinder/flutes,
 *     lever loop, twin barrels + hammers, extruded bowie blade, printed
 *     ammo labels) — every part now carries a MEANINGFUL NAME (editor/debug).
 *   • MATERIALS come from the shared createGunShopMaterials() cache — the
 *     user file created fresh materials+canvases per builder call.
 *   • SHADOW SIZE FLOOR (weak-laptop contract): parts smaller than 9 cm do
 *     not enter the shadow pass (their cast is invisible noise at 768²/85 m).
 *   • GEOMETRY AUDIT FIXES over the user file (§19/§20 discipline — visual
 *     intent preserved, placement bugs removed at the source):
 *       1. Display case REBUILT as a hollow tray: the original was one SOLID
 *          box with the felt/guns embedded INSIDE it (guns buried to their
 *          midlines, hammer through the glass lid). Now: base + 4 walls +
 *          felt floor + guns seated ON the felt + glass lid ABOVE them with
 *          real clearance.
 *       2. Rifle rack guns hang MUZZLE-UP between pegs + retainer hoops:
 *          the original rotated each gun perpendicular to the backing, so
 *          every muzzle pierced the backing board (and would enter the wall).
 *       3. Shelf spare rifle lies ALONG the shelf width: the original lay
 *          along the shelf DEPTH and poked 7 cm out of its back into the wall.
 *       4. Sign hangs DOWN from its origin: the original built upward from
 *          its origin (chains above origin, board above the chains), which
 *          can never hang from anything.
 *   • NEW builders the user spec lists but the file lacked: workbench, vise,
 *     tool rack (the Gunsmith Workshop corner).
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import {
  createGunShopMaterials,
  ammoLabelTexture,
  signTexture,
} from './GunShopMaterials.js';

/* ========================================================================== */
/* Helpers (exported — GunShopArchitecture builds its shell with them too)    */
/* ========================================================================== */

const SHADOW_SIZE_FLOOR = 0.09; // 9 cm — parts below never cast (invisible noise)

function applyShadow(mesh: THREE.Mesh, force?: boolean): void {
  if (force !== undefined) {
    mesh.castShadow = force;
  } else {
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    const size = bb.getSize(new THREE.Vector3());
    mesh.castShadow = Math.max(size.x, size.y, size.z) >= SHADOW_SIZE_FLOOR;
  }
  mesh.receiveShadow = true;
}

export function addBox(
  parent: THREE.Object3D,
  m: THREE.Material,
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  name: string,
  castShadow?: boolean,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.name = name;
  applyShadow(mesh, castShadow);
  parent.add(mesh);
  return mesh;
}

export function addCyl(
  parent: THREE.Object3D,
  m: THREE.Material,
  rTop: number, rBottom: number, h: number, seg: number,
  x: number, y: number, z: number,
  name: string,
  castShadow?: boolean,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.name = name;
  applyShadow(mesh, castShadow);
  parent.add(mesh);
  return mesh;
}

/** Caliber-labelled material cache: one material per caliber, shared. */
const labelMatCache = new Map<string, THREE.MeshStandardMaterial>();
function labeledMat(caliber: string, texture: THREE.CanvasTexture | null): THREE.MeshStandardMaterial {
  if (!labelMatCache.has(caliber)) {
    labelMatCache.set(
      caliber,
      new THREE.MeshStandardMaterial({
        color: texture ? 0xffffff : 0xd8c79c,
        map: texture ?? undefined,
        roughness: 0.85,
        metalness: 0.02,
      }),
    );
  }
  return labelMatCache.get(caliber)!;
}

/* ========================================================================== */
/* Detailed firearm props (visual centerpieces — user builders preserved)      */
/* ========================================================================== */

/** Single-action revolver: fluted 6-chamber cylinder, cocked hammer, trigger guard, checkered grip, sights. */
export function buildRevolver(scale = 1): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-revolver';
  const s = scale;

  // Frame strap runs grip→barrel along X (the old 0.02×0.03×0.09 box was
  // transposed: 9 cm ACROSS the gun made the whole revolver read as a flat
  // slab and buried the cylinder when the gun was laid on its side).
  const frame = addBox(g, M.steel, 0.1 * s, 0.03 * s, 0.02 * s, 0.03 * s, 0.02 * s, 0, 'revolver-frame');
  void frame;
  addCyl(g, M.steelDark, 0.009 * s, 0.01 * s, 0.13 * s, 12, 0.11 * s, 0.02 * s, 0, 'revolver-barrel').rotation.z = Math.PI / 2;
  addBox(g, M.steelDark, 0.006 * s, 0.008 * s, 0.004 * s, 0.175 * s, 0.032 * s, 0, 'revolver-front-sight');
  addCyl(g, M.steel, 0.003 * s, 0.003 * s, 0.1 * s, 8, 0.11 * s, 0.008 * s, 0, 'revolver-ejector-rod').rotation.z = Math.PI / 2;
  addCyl(g, M.steel, 0.006 * s, 0.006 * s, 0.05 * s, 8, 0.09 * s, 0.008 * s, 0, 'revolver-ejector-housing').rotation.z = Math.PI / 2;

  // fluted cylinder with 6 visible chambers
  const cylinderGroup = new THREE.Group();
  cylinderGroup.name = 'revolver-cylinder';
  cylinderGroup.position.set(0.045 * s, 0.02 * s, 0);
  g.add(cylinderGroup);
  const drum = addCyl(cylinderGroup, M.steel, 0.017 * s, 0.017 * s, 0.032 * s, 16, 0, 0, 0, 'revolver-cylinder-drum');
  drum.rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const chamber = addCyl(cylinderGroup, M.steelDark, 0.0035 * s, 0.0035 * s, 0.034 * s, 8, Math.cos(a) * 0.011 * s, 0, Math.sin(a) * 0.011 * s, `revolver-chamber-${i}`);
    chamber.rotation.x = Math.PI / 2;
    const flute = addBox(cylinderGroup, M.steelDark, 0.004 * s, 0.028 * s, 0.006 * s, Math.cos(a) * 0.016 * s, 0, Math.sin(a) * 0.016 * s, `revolver-flute-${i}`);
    flute.rotation.y = -a;
  }

  // grip: wood, checkered, with a slight backward rake typical of single-action revolvers
  const grip = addBox(g, M.grip, 0.018 * s, 0.06 * s, 0.028 * s, -0.02 * s, -0.02 * s, 0, 'revolver-grip');
  grip.rotation.z = -0.35;
  addBox(g, M.brassDark, 0.024 * s, 0.024 * s, 0.024 * s, -0.04 * s, -0.045 * s, 0, 'revolver-grip-cap'); // sphere→box head, same silhouette
  // (the user file used a small sphere here; a cube reads identically at this
  // size and keeps the geometry audit's box-only path simpler — visual no-op.)

  // hammer, cocked back
  const hammer = addBox(g, M.steelDark, 0.012 * s, 0.018 * s, 0.006 * s, 0.01 * s, 0.045 * s, 0, 'revolver-hammer');
  hammer.rotation.z = -0.5;
  const hammerSpur = addBox(g, M.steelDark, 0.014 * s, 0.006 * s, 0.006 * s, 0.005 * s, 0.052 * s, 0, 'revolver-hammer-spur');
  hammerSpur.rotation.z = -0.5;

  // trigger + trigger guard
  addBox(g, M.steelDark, 0.004 * s, 0.012 * s, 0.004 * s, 0.005 * s, -0.002 * s, 0, 'revolver-trigger');
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.014 * s, 0.0025 * s, 6, 16, Math.PI * 1.3), M.steel);
  guard.name = 'revolver-trigger-guard';
  guard.position.set(0.005 * s, -0.008 * s, 0);
  guard.rotation.z = Math.PI * 0.6;
  guard.castShadow = false;
  guard.receiveShadow = true;
  g.add(guard);

  return g;
}

/** Lever-action rifle: tube magazine, loop lever, curved wood buttstock, brass butt plate, sights. */
export function buildLeverActionRifle(scale = 1): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-lever-rifle';
  const s = scale;

  addBox(g, M.brassDark, 0.16 * s, 0.05 * s, 0.03 * s, 0, 0, 0, 'rifle-receiver');
  addCyl(g, M.steelDark, 0.013 * s, 0.015 * s, 0.55 * s, 12, 0.36 * s, 0.005 * s, 0, 'rifle-barrel').rotation.z = Math.PI / 2;
  addCyl(g, M.steel, 0.008 * s, 0.008 * s, 0.5 * s, 10, 0.34 * s, -0.02 * s, 0, 'rifle-mag-tube').rotation.z = Math.PI / 2;
  addCyl(g, M.brass, 0.01 * s, 0.01 * s, 0.015 * s, 10, 0.59 * s, -0.02 * s, 0, 'rifle-mag-cap').rotation.z = Math.PI / 2;
  addBox(g, M.woodMed, 0.28 * s, 0.035 * s, 0.03 * s, 0.25 * s, -0.01 * s, 0, 'rifle-forestock');

  // loop lever beneath the receiver — torus segment + brace
  const leverGroup = new THREE.Group();
  leverGroup.name = 'rifle-lever';
  leverGroup.position.set(-0.02 * s, -0.03 * s, 0);
  g.add(leverGroup);
  const leverLoop = new THREE.Mesh(new THREE.TorusGeometry(0.035 * s, 0.006 * s, 6, 16, Math.PI * 1.4), M.steel);
  leverLoop.name = 'rifle-lever-loop';
  leverLoop.position.set(0, -0.03 * s, 0);
  leverLoop.rotation.z = Math.PI * 0.15;
  leverLoop.castShadow = false;
  leverLoop.receiveShadow = true;
  leverGroup.add(leverLoop);

  // buttstock: curved via tapered box segments forming a comb + grip curve
  const stockGroup = new THREE.Group();
  stockGroup.name = 'rifle-stock';
  stockGroup.position.set(-0.1 * s, -0.01 * s, 0);
  g.add(stockGroup);
  const seg1 = addBox(stockGroup, M.woodMed, 0.14 * s, 0.045 * s, 0.028 * s, -0.06 * s, 0, 0, 'rifle-stock-comb');
  void seg1;
  const seg2 = addBox(stockGroup, M.woodMed, 0.1 * s, 0.09 * s, 0.03 * s, -0.16 * s, -0.015 * s, 0, 'rifle-stock-grip');
  seg2.rotation.z = -0.12;
  addBox(stockGroup, M.brass, 0.012 * s, 0.1 * s, 0.032 * s, -0.21 * s, -0.02 * s, 0, 'rifle-butt-plate');

  // sights
  addBox(g, M.steelDark, 0.006 * s, 0.012 * s, 0.004 * s, 0.6 * s, 0.018 * s, 0, 'rifle-front-sight');
  addBox(g, M.steelDark, 0.012 * s, 0.006 * s, 0.02 * s, 0.15 * s, 0.028 * s, 0, 'rifle-rear-sight-base');
  addBox(g, M.steelDark, 0.003 * s, 0.014 * s, 0.014 * s, 0.15 * s, 0.035 * s, 0, 'rifle-rear-sight-blade');

  // hammer at the rear of the receiver
  const hammer = addBox(g, M.steelDark, 0.012 * s, 0.02 * s, 0.006 * s, -0.085 * s, 0.03 * s, 0, 'rifle-hammer');
  hammer.rotation.z = -0.3;
  addBox(g, M.steelDark, 0.004 * s, 0.014 * s, 0.004 * s, -0.02 * s, -0.02 * s, 0, 'rifle-trigger');

  return g;
}

/** Side-by-side double-barrel shotgun: twin external hammers, double triggers, engraved-look receiver. */
export function buildDoubleBarrelShotgun(scale = 1): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-shotgun';
  const s = scale;

  ([-0.014, 0.014] as const).forEach((z, i) => {
    const barrel = addCyl(g, M.steelDark, 0.014 * s, 0.016 * s, 0.5 * s, 12, 0.3 * s, 0.01 * s, z * s, `shotgun-barrel-${i === 0 ? 'l' : 'r'}`);
    barrel.rotation.z = Math.PI / 2;
  });
  addBox(g, M.steel, 0.5 * s, 0.006 * s, 0.01 * s, 0.3 * s, 0.028 * s, 0, 'shotgun-rib');
  addCyl(g, M.brass, 0.02 * s, 0.02 * s, 0.02 * s, 16, 0.545 * s, 0.01 * s, 0, 'shotgun-muzzle-band').rotation.z = Math.PI / 2;

  addBox(g, M.steel, 0.1 * s, 0.06 * s, 0.045 * s, 0.02 * s, 0.01 * s, 0, 'shotgun-receiver');
  // faint engraving suggestion: thin brass scroll rings, proud of the receiver sides
  ([-1, 1] as const).forEach((side, i) => {
    const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.015 * s, 0.0015 * s, 6, 12), M.brass);
    scroll.name = `shotgun-scroll-${i === 0 ? 'l' : 'r'}`;
    scroll.position.set(0.02 * s, 0.01 * s, side * 0.024 * s);
    scroll.castShadow = false;
    scroll.receiveShadow = true;
    g.add(scroll);
  });

  addBox(g, M.woodMed, 0.22 * s, 0.03 * s, 0.045 * s, 0.19 * s, -0.005 * s, 0, 'shotgun-forend');

  // shorter, more curved stock typical of a coach gun
  const stockGroup = new THREE.Group();
  stockGroup.name = 'shotgun-stock';
  stockGroup.position.set(-0.07 * s, 0, 0);
  g.add(stockGroup);
  addBox(stockGroup, M.woodMed, 0.08 * s, 0.045 * s, 0.035 * s, -0.02 * s, 0, 0, 'shotgun-stock-neck');
  const butt = addBox(stockGroup, M.woodMed, 0.1 * s, 0.1 * s, 0.045 * s, -0.11 * s, -0.02 * s, 0, 'shotgun-stock-butt');
  butt.rotation.z = -0.15;
  addBox(stockGroup, M.steelDark, 0.01 * s, 0.11 * s, 0.05 * s, -0.155 * s, -0.03 * s, 0, 'shotgun-butt-plate');

  // twin external hammers
  ([-0.014, 0.014] as const).forEach((z, i) => {
    const hammer = addBox(g, M.steelDark, 0.014 * s, 0.02 * s, 0.008 * s, -0.015 * s, 0.045 * s, z * s, `shotgun-hammer-${i === 0 ? 'l' : 'r'}`);
    hammer.rotation.z = -0.4;
  });

  // double triggers in a shared guard
  ([-0.006, 0.008] as const).forEach((x, i) => {
    addBox(g, M.steelDark, 0.003 * s, 0.012 * s, 0.004 * s, x, -0.02 * s, 0, `shotgun-trigger-${i === 0 ? 'a' : 'b'}`);
  });
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.02 * s, 0.003 * s, 6, 16, Math.PI * 1.3), M.steel);
  guard.name = 'shotgun-trigger-guard';
  guard.position.set(0.001 * s, -0.03 * s, 0);
  guard.rotation.z = Math.PI * 0.6;
  guard.castShadow = false;
  guard.receiveShadow = true;
  g.add(guard);

  return g;
}

/** Tiny detailed pocket derringer. */
export function buildDerringer(scale = 1): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-derringer';
  const s = scale;

  addBox(g, M.brass, 0.01 * s, 0.018 * s, 0.014 * s, 0.015 * s, 0.008 * s, 0, 'derringer-frame');
  addCyl(g, M.steelDark, 0.005 * s, 0.006 * s, 0.045 * s, 10, 0.045 * s, 0.01 * s, 0, 'derringer-barrel').rotation.z = Math.PI / 2;
  const grip = addBox(g, M.grip, 0.01 * s, 0.03 * s, 0.016 * s, -0.005 * s, -0.012 * s, 0, 'derringer-grip');
  grip.rotation.z = -0.5;
  const hammer = addBox(g, M.steelDark, 0.006 * s, 0.01 * s, 0.004 * s, 0.002 * s, 0.02 * s, 0, 'derringer-hammer');
  hammer.rotation.z = -0.4;
  addBox(g, M.steelDark, 0.003 * s, 0.008 * s, 0.003 * s, 0.006 * s, -0.002 * s, 0, 'derringer-trigger');

  return g;
}

/** Extruded bowie-knife blade profile (clip point, single edge, thin taper). */
function createBladeGeometry(length = 0.22, width = 0.035, thickness = 0.004): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -width * 0.5);
  shape.lineTo(length * 0.65, -width * 0.5);
  shape.quadraticCurveTo(length * 0.85, -width * 0.5, length, -width * 0.05);
  shape.quadraticCurveTo(length * 0.9, width * 0.1, length * 0.75, width * 0.15);
  shape.lineTo(0, width * 0.5);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.6,
    bevelSize: thickness * 0.4,
    bevelSegments: 2,
  });
}

/** Bowie knife with an extruded clip-point blade, brass guard, bone handle, and a leather sheath. */
export function buildBowieKnife(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-bowie-knife';

  const blade = new THREE.Mesh(createBladeGeometry(0.22, 0.035, 0.004), M.steel);
  blade.name = 'knife-blade';
  blade.position.set(0.02, 0, 0);
  blade.castShadow = false;
  blade.receiveShadow = true;
  g.add(blade);

  addBox(g, M.brass, 0.012, 0.05, 0.012, 0, 0, 0, 'knife-guard');
  addCyl(g, M.bone, 0.011, 0.013, 0.11, 10, -0.06, 0, 0, 'knife-handle').rotation.z = Math.PI / 2;
  addCyl(g, M.brass, 0.014, 0.014, 0.014, 10, -0.115, 0, 0, 'knife-pommel', false);

  // leather sheath, offset below the knife for a hung display
  const sheathGroup = new THREE.Group();
  sheathGroup.name = 'knife-sheath';
  sheathGroup.position.set(0.05, -0.15, 0);
  addCyl(sheathGroup, M.leather, 0.017, 0.014, 0.23, 10, 0, 0, 0, 'knife-sheath-body').rotation.z = Math.PI / 2;
  const sheathTip = addCyl(sheathGroup, M.brassDark, 0.001, 0.014, 0.03, 10, 0.13, 0, 0, 'knife-sheath-tip', false);
  sheathTip.rotation.z = -Math.PI / 2;
  const beltLoop = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 12), M.leather);
  beltLoop.name = 'knife-sheath-loop';
  beltLoop.position.set(-0.09, 0.015, 0);
  beltLoop.castShadow = false;
  beltLoop.receiveShadow = true;
  sheathGroup.add(beltLoop);
  g.add(sheathGroup);

  return g;
}

/* ========================================================================== */
/* Shop fixtures                                                              */
/* ========================================================================== */

/** Wood sales counter (plain top — the glass display case pairs on top of it). */
export function buildGunshopCounter(length = 3.2): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-counter';

  const height = 1.05;
  const depth = 0.65;

  addBox(g, M.woodMed, length, height, depth, 0, height / 2, 0, 'gunshop-counter-body');
  addBox(g, M.woodTrim, length + 0.06, 0.04, depth + 0.08, 0, height + 0.02, 0, 'gunshop-counter-top');

  const panelCount = Math.max(3, Math.round(length / 0.8));
  for (let i = 0; i < panelCount; i++) {
    const t = (i + 0.5) / panelCount - 0.5;
    addBox(g, M.woodDark, length / panelCount - 0.08, height * 0.55, 0.015, t * length, height * 0.42, depth / 2 + 0.008, `gunshop-counter-panel-${i}`);
  }

  return g;
}

/**
 * Seat an object so its MEASURED lowest point rests gap mm above a surface —
 * no floating, no sinking, no per-pose hand-tuned offsets. The bbox is read
 * from the detached object (rotation already applied), then only y moves.
 */
function seatOnSurface(obj: THREE.Object3D, surfaceY: number, gap = 0.0012): void {
  const bb = new THREE.Box3().setFromObject(obj);
  obj.position.y += surfaceY + gap - bb.min.y;
}

/**
 * GLASS-TOP DISPLAY CASE — hollow tray (see the module header), now dressed
 * like a REAL western gun-store counter case (§ presentation revision):
 *   • every revolver LIES ON ITS SIDE, cylinder up — the way a gunshop lays
 *     them out (rotation.x roll AFTER the yaw, Euler order YXZ), not balanced
 *     on its grip-cap edge;
 *   • a gentle FAN of yaws + staggered depths breaks the mechanical parallel
 *     rows; the hero revolver rests on a felt riser with a brass label;
 *   • every gun is seated by MEASURED bbox (seatOnSurface) — no float, no
 *     sink, no glass contact; all guns keep ≥ 4 cm from the lid.
 * Local origin = base bottom center; interior felt top at y = 0.036; glass
 * lid at y ∈ [0.19, 0.198].
 */
export function buildPistolDisplayCase(width = 1.6): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-display-case';

  const d = 0.45;
  const wallH = 0.16;
  const baseH = 0.03;

  addBox(g, M.woodDark, width, baseH, d, 0, baseH / 2, 0, 'gunshop-display-base');
  addBox(g, M.felt, width - 0.05, 0.006, d - 0.05, 0, baseH + 0.003, 0, 'gunshop-display-felt');
  // four walls (y ∈ [0.03, 0.19]); front/back run the full width, sides nest
  // BETWEEN them (no corner interpenetration).
  addBox(g, M.woodDark, width, wallH, 0.02, 0, baseH + wallH / 2, d / 2 - 0.01, 'gunshop-display-wall-front');
  addBox(g, M.woodDark, width, wallH, 0.02, 0, baseH + wallH / 2, -(d / 2 - 0.01), 'gunshop-display-wall-back');
  addBox(g, M.woodDark, 0.02, wallH, d - 0.04, -(width / 2 - 0.01), baseH + wallH / 2, 0, 'gunshop-display-wall-left');
  addBox(g, M.woodDark, 0.02, wallH, d - 0.04, width / 2 - 0.01, baseH + wallH / 2, 0, 'gunshop-display-wall-right');
  // glass lid sits ON the walls (back-to-back contact, never coplanar overlap)
  addBox(g, M.glass, width - 0.02, 0.008, d - 0.02, 0, baseH + wallH + 0.004, 0, 'gunshop-display-glass', false);

  const feltTop = baseH + 0.006;

  // Felt riser + brass label under the hero revolver (classic gunstore display).
  addBox(g, M.felt, 0.36, 0.022, 0.12, -0.06, feltTop + 0.011 + 0.0012, 0.075, 'gunshop-display-riser', false);
  addBox(g, M.brass, 0.2, 0.005, 0.03, -0.06, feltTop + 0.0012 + 0.0025, 0.16, 'gunshop-display-riser-label', false);

  // Three revolvers on their flanks in a fan. Yaw ≈ π/2 (muzzle north) with
  // ±7–14° spread; depths staggered +0.03…+0.075 (the 27 cm guns + grip reach
  // ±≈0.12 in z, so everything stays ≥ 7 cm off BOTH case walls).
  const revPose = [
    { x: -0.62, z: 0.05, yaw: Math.PI / 2 + 0.24 },
    { x: -0.06, z: 0.075, yaw: Math.PI / 2 - 0.17 },
    { x: 0.46, z: 0.03, yaw: Math.PI / 2 + 0.12 },
  ] as const;
  revPose.forEach((p, i) => {
    const rev = buildRevolver(1);
    rev.name = `gunshop-display-revolver-${i + 1}`;
    rev.rotation.order = 'YXZ';
    rev.rotation.y = p.yaw; // fan…
    rev.rotation.x = Math.PI / 2; // …then roll onto its flank (cylinder up)
    rev.position.set(p.x, i === 1 ? feltTop + 0.022 + 0.0012 : feltTop, p.z);
    g.add(rev);
    seatOnSurface(rev, i === 1 ? feltTop + 0.022 : feltTop);
  });

  // Derringer on its side, angled, in the front-right presentation spot.
  const der = buildDerringer(1.4);
  der.name = 'gunshop-display-derringer';
  der.rotation.order = 'YXZ';
  der.rotation.y = Math.PI / 2 + 0.35;
  der.rotation.x = Math.PI / 2;
  der.position.set(0.17, feltTop, 0.155);
  g.add(der);
  seatOnSurface(der, feltTop);

  return g;
}

/**
 * WALL RACK OF LONG GUNS — guns hang MUZZLE-UP between backing pegs and
 * front retainer hoops (the user file's perpendicular rotation pierced the
 * backing; see the module header). Backing 1.8 × 0.9, guns clear of it.
 */
export function buildRifleWallRack(count = 7): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-rifle-rack';

  const width = 1.8;
  addBox(g, M.woodDark, width, 0.9, 0.05, 0, 0, 0, 'gunshop-rack-backing');

  // two support rails proud of the backing (back faces ON the backing front)
  addBox(g, M.woodTrim, width - 0.1, 0.02, 0.04, 0, 0.2, 0.045, 'gunshop-rack-rail-top');
  addBox(g, M.woodTrim, width - 0.1, 0.02, 0.04, 0, -0.25, 0.045, 'gunshop-rack-rail-bottom');

  for (let i = 0; i < count; i++) {
    const x = -width / 2 + 0.15 + i * ((width - 0.3) / (count - 1));
    const gun = i % 3 === 0 ? buildDoubleBarrelShotgun(0.8) : buildLeverActionRifle(0.55);
    gun.name = `gunshop-rack-gun-${i + 1}`;
    gun.position.set(x, 0.02, 0.1);
    // MUZZLE-UP: the gun's long axis (+x) stands on +y; a touch of variation.
    gun.rotation.z = Math.PI / 2 + 0.02 * (i % 2 === 0 ? 1 : -1);
    g.add(gun);

    // backing pegs the stock/forestock rest against (proud of the backing,
    // clear of the gun body at z ≥ 0.082)
    addCyl(g, M.steelDark, 0.008, 0.008, 0.05, 8, x, 0.2, 0.05, `gunshop-rack-peg-${i + 1}-hi`, false).rotation.x = Math.PI / 2;
    addCyl(g, M.steelDark, 0.008, 0.008, 0.05, 8, x, -0.25, 0.05, `gunshop-rack-peg-${i + 1}-lo`, false).rotation.x = Math.PI / 2;
    // retainer hoops in FRONT of each gun: back face exactly ON the gun front
    const hoopZ = 0.118 + 0.006;
    for (const [yy, tag] of [[0.2, 'hi'], [-0.25, 'lo']] as const) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), M.steelDark);
      hoop.name = `gunshop-rack-hoop-${i + 1}-${tag}`;
      hoop.position.set(x, yy, hoopZ);
      hoop.rotation.z = Math.PI; // arc opens downward, hugging the gun
      hoop.castShadow = false;
      hoop.receiveShadow = true;
      g.add(hoop);
    }
  }

  return g;
}

/** Small printed-label cartridge box, meant to be stacked.
 *  (`Gunshop` prefix for barrel-export safety — see buildGunshopAmmoCrate.) */
export function buildGunshopAmmoBox(caliber = '.45 COLT'): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-ammo-box';

  const mat = labeledMat(caliber, ammoLabelTexture(caliber));
  addBox(g, mat, 0.11, 0.045, 0.07, 0, 0.0225, 0, 'gunshop-ammo-box-body');
  // lid: clear 8 mm overhang on every side (the old ±1 mm overhang was
  // float-coplanar with the body's side faces) and seated 2 mm INTO the top.
  addBox(g, M.woodDark, 0.126, 0.004, 0.086, 0, 0.045, 0, 'gunshop-ammo-box-lid', false);

  return g;
}

/** Wood ammunition crate, stencilled with a caliber, with rope handles.
 *  (`Gunshop` prefix: `buildAmmoCrate` already exists in the sheriff module —
 *  the two coexist under the barrel's `export *`.) */
export function buildGunshopAmmoCrate(caliber = '.44-40 WCF'): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-ammo-crate';

  const w = 0.4;
  const h = 0.26;
  const d = 0.28;

  const stencilTex = signTexture({
    text: caliber, sub: 'HANDLE WITH CARE', bg: GUNSHOP_STENcil_BG, fg: '#1c1c1c',
    w: 300, h: 200, border: false, font: 'bold 40px "Courier New", monospace',
  });
  const bodyMat = labeledMat(`crate|${caliber}`, stencilTex);
  addBox(g, bodyMat, w, h, d, 0, h / 2, 0, 'gunshop-ammo-crate-body');

  ([-1, 1] as const).forEach((sx, i) => {
    addBox(g, M.woodDark, 0.03, h, 0.03, (sx * w) / 2, h / 2, (sx * d) / 2, `gunshop-ammo-crate-batten-v-${i === 0 ? 'l' : 'r'}`);
  });
  ([0.03, h - 0.03] as const).forEach((y, i) => {
    addBox(g, M.woodDark, w + 0.02, 0.025, d + 0.02, 0, y, 0, `gunshop-ammo-crate-batten-h-${i === 0 ? 'lo' : 'hi'}`);
  });
  ([-w / 2 - 0.005, w / 2 + 0.005] as const).forEach((x, i) => {
    const ropeHandle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), M.rope);
    ropeHandle.name = `gunshop-ammo-crate-handle-${i === 0 ? 'l' : 'r'}`;
    ropeHandle.position.set(x, h * 0.6, 0);
    ropeHandle.rotation.z = Math.PI / 2;
    ropeHandle.rotation.y = Math.PI / 2;
    ropeHandle.castShadow = false;
    ropeHandle.receiveShadow = true;
    g.add(ropeHandle);
  });

  return g;
}
const GUNSHOP_STENcil_BG = '#6b4226'; // crate stencil background (wood med)

/** Black-powder keg with iron bands and a small brass funnel spout. */
export function buildPowderKeg(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-powder-keg';

  const kegTex = signTexture({
    text: 'BLACK', sub: 'POWDER', bg: GUNSHOP_PALETTE_BG, fg: '#c9a75a',
    w: 220, h: 220, border: true, font: 'bold 40px Georgia, serif',
  });
  const kegMat = labeledMat('keg|black-powder', kegTex);
  addCyl(g, kegMat, 0.2, 0.17, 0.42, 16, 0, 0.21, 0, 'gunshop-powder-keg-barrel');
  ([0.06, 0.21, 0.36] as const).forEach((y, i) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.01, 6, 16), M.steelDark);
    band.name = `gunshop-powder-keg-band-${i + 1}`;
    band.position.set(0, y, 0);
    band.rotation.x = Math.PI / 2;
    band.castShadow = false;
    band.receiveShadow = true;
    g.add(band);
  });
  addCyl(g, M.brass, 0.025, 0.025, 0.02, 10, 0.1, 0.43, 0, 'gunshop-powder-keg-bung', false);
  addCyl(g, M.brass, 0.001, 0.02, 0.03, 10, 0.1, 0.46, 0, 'gunshop-powder-keg-funnel', false);

  return g;
}
const GUNSHOP_PALETTE_BG = '#3f2716';

/** Wood block with rows of loose brass cartridges standing upright, for a counter display. */
export function buildCartridgeStand(rows = 3, cols = 6): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-cartridge-stand';

  const w = cols * 0.03;
  const d = rows * 0.03;
  addBox(g, M.woodDark, w + 0.03, 0.03, d + 0.03, 0, 0.015, 0, 'gunshop-cartridge-stand-block');

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (c + 0.5) * (w / cols);
      const z = -d / 2 + (r + 0.5) * (d / rows);
      addCyl(g, M.steelDark, 0.006, 0.006, 0.012, 8, x, 0.028, z, `gunshop-cartridge-${r}-${c}-hole`, false);
      addCyl(g, M.brass, 0.005, 0.0055, 0.03, 8, x, 0.045, z, `gunshop-cartridge-${r}-${c}-case`, false);
      addCyl(g, M.brass, 0.001, 0.0045, 0.012, 8, x, 0.066, z, `gunshop-cartridge-${r}-${c}-bullet`, false);
    }
  }

  return g;
}

/**
 * One slot of the shelf-fill plan: x across the width, optional depth offset,
 * optional stack onto the PREVIOUS slot, optional small yaw for a hand-stocked
 * look. Deterministic table — no randomness (tests lock the arrangement).
 */
interface ShelfSlot { x: number; z?: number; stack?: boolean; yaw?: number }

/**
 * Wall shelving unit MOSTLY STOCKED with labeled ammo boxes (§ revision — the
 * old 4-boxes-per-shelf row left 2/3 of every board bare and read artificial):
 *   • varied arrangement — side by side, stacked pairs, depth offsets, small
 *     yaws, uneven gaps (a hand-stocked shelf, not a spreadsheet);
 *   • the TOP shelf stays deliberately half-empty (reach space + visible
 *     wood — a few open cells read more real than 100% fill);
 *   • every box sits ON a board or ON another box's lid (no float/sink),
 *     inside the shelf sides, never through the back panel.
 * The spare rifle still lies ALONG the shelf width on top (see header note).
 */
export function buildGunShelfUnit(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-shelf-unit';

  const width = 1.4;
  const height = 1.8;
  const depth = 0.35;

  addBox(g, M.woodDark, 0.04, height, depth, -width / 2, height / 2, 0, 'gunshop-shelf-side-left');
  addBox(g, M.woodDark, 0.04, height, depth, width / 2, height / 2, 0, 'gunshop-shelf-side-right');

  const shelfYs = [0.05, 0.55, 1.05, 1.55];
  const calibers = ['.44-40', '.45 COLT', '.38 WCF', '12 GA'];
  const fill: ShelfSlot[][] = [
    // bottom shelf — the working stock: full row + one stacked pair
    [{ x: -0.56 }, { x: -0.42, z: 0.045 }, { x: -0.3 }, { x: -0.16, yaw: 0.06 }, { x: -0.02 },
     { x: 0.12, z: -0.05 }, { x: 0.12, stack: true }, { x: 0.3 }, { x: 0.44, z: 0.05 }, { x: 0.56 }],
    // second shelf — mostly full, one reach gap kept on purpose
    [{ x: -0.56 }, { x: -0.4 }, { x: -0.24, z: -0.045 }, { x: -0.08 }, { x: 0.1 },
     { x: 0.1, stack: true }, { x: 0.26, yaw: -0.05 }, { x: 0.44 }, { x: 0.57, z: 0.04 }],
    // third shelf — tight display row + one stack
    [{ x: -0.56 }, { x: -0.45 }, { x: -0.34, z: 0.045 }, { x: -0.23 }, { x: -0.12, yaw: 0.05 },
     { x: 0 }, { x: 0.12, z: -0.05 }, { x: 0.24 }, { x: 0.24, stack: true }, { x: 0.4, yaw: -0.04 }, { x: 0.54 }],
    // top shelf — PARTIAL by design (open cells read real, § requirement)
    [{ x: -0.5 }, { x: -0.3, z: 0.04 }, { x: -0.1 }, { x: 0.12, yaw: 0.06 }],
  ];
  const BOX_LID_TOP = 0.047;
  shelfYs.forEach((y, i) => {
    const boardTop = y + 0.015;
    addBox(g, M.woodMed, width, 0.03, depth, 0, y, 0, `gunshop-shelf-board-${i + 1}`);
    let prev: { x: number; z: number } | null = null;
    fill[i].forEach((slot, b) => {
      const box = buildGunshopAmmoBox(calibers[i] ?? '.45 COLT');
      box.name = `gunshop-shelf-box-${i + 1}-${b + 1}`;
      const x = slot.stack && prev ? prev.x : slot.x;
      const z = slot.stack && prev ? prev.z : (slot.z ?? 0);
      const baseY = slot.stack && prev ? boardTop + BOX_LID_TOP + 0.0012 : boardTop;
      box.position.set(x, baseY, z);
      if (slot.yaw) box.rotation.y = slot.yaw;
      g.add(box);
      prev = { x, z };
    });
  });

  // spare rifle lies ALONG the shelf WIDTH (the user file's depthwise rifle
  // poked out of the shelf back into the wall — see the module header).
  const spareRifle = buildLeverActionRifle(0.5);
  spareRifle.name = 'gunshop-shelf-rifle';
  spareRifle.position.set(-0.1, height + 0.045, 0.02);
  spareRifle.rotation.y = 0;
  g.add(spareRifle);

  return g;
}

/** Ornate brass mechanical cash register/till. */
export function buildCashRegister(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-cash-register';

  addBox(g, M.brass, 0.28, 0.1, 0.22, 0, 0.05, 0, 'gunshop-register-base');
  addBox(g, M.brass, 0.22, 0.18, 0.18, 0, 0.19, 0, 'gunshop-register-body');
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 16, 1, false, 0, Math.PI), M.brass);
  shoulder.name = 'gunshop-register-shoulder';
  shoulder.position.set(0, 0.28, 0);
  shoulder.rotation.x = Math.PI / 2;
  shoulder.castShadow = false;
  shoulder.receiveShadow = true;
  g.add(shoulder);

  // key rows
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const key = addCyl(g, M.brassDark, 0.008, 0.008, 0.01, 8, -0.08 + c * 0.04, 0.1 + r * 0.025, 0.091, `gunshop-register-key-${r}-${c}`, false);
      key.rotation.x = Math.PI / 2;
    }
  }

  addCyl(g, M.brassDark, 0.008, 0.008, 0.1, 8, 0.15, 0.19, 0, 'gunshop-register-crank', false).rotation.z = Math.PI / 2;
  addCyl(g, M.brassDark, 0.015, 0.015, 0.015, 8, 0.2, 0.24, 0, 'gunshop-register-crank-handle', false);
  // drawer sits 1.5 cm ABOVE the base bottom (the old 0-centered drawer
  // shared its −y face with the base's) and still projects out the front.
  addBox(g, M.brassDark, 0.26, 0.06, 0.2, 0, 0.045, 0.02, 'gunshop-register-drawer');
  const drawerPull = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.003, 6, 10), M.brassDark);
  drawerPull.name = 'gunshop-register-drawer-pull';
  drawerPull.position.set(0, 0.045, 0.13);
  drawerPull.rotation.x = Math.PI / 2;
  drawerPull.castShadow = false;
  drawerPull.receiveShadow = true;
  g.add(drawerPull);

  return g;
}

/** Wall rack of holsters and coiled gun belts. */
export function buildHolsterDisplay(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-holster-display';

  addBox(g, M.woodDark, 0.9, 0.55, 0.03, 0, 0, 0, 'gunshop-holster-board');

  for (let i = 0; i < 3; i++) {
    const x = -0.28 + i * 0.28;
    addCyl(g, M.steelDark, 0.01, 0.012, 0.06, 8, x, 0.15, 0.03, `gunshop-holster-peg-${i + 1}`, false).rotation.x = Math.PI / 2;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 16, Math.PI), M.leather);
    belt.name = `gunshop-holster-belt-${i + 1}`;
    belt.position.set(x, -0.02, 0.05);
    belt.rotation.z = Math.PI;
    belt.castShadow = false;
    belt.receiveShadow = true;
    g.add(belt);
    const holster = addCyl(g, M.leather, 0.03, 0.035, 0.24, 10, x, -0.2, 0.06, `gunshop-holster-pocket-${i + 1}`, false);
    holster.rotation.z = 0.1;
    for (let b = 0; b < 8; b++) {
      const a = (b / 8) * Math.PI;
      addCyl(g, M.brassDark, 0.006, 0.006, 0.03, 6, x + Math.cos(a) * 0.11, -0.02 + Math.sin(a) * 0.11 * 0.4, 0.07, `gunshop-holster-loop-${i + 1}-${b}`, false);
    }
  }

  return g;
}

/** Brass balance scale for weighing powder or lead, with hanging pans. */
export function buildBrassScale(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-brass-scale';

  addCyl(g, M.brass, 0.06, 0.07, 0.02, 16, 0, 0.01, 0, 'gunshop-scale-base', false);
  addCyl(g, M.brass, 0.008, 0.008, 0.22, 10, 0, 0.13, 0, 'gunshop-scale-post', false);
  addBox(g, M.brass, 0.28, 0.008, 0.008, 0, 0.24, 0, 'gunshop-scale-beam', false);
  addCyl(g, M.brassDark, 0.012, 0.012, 0.012, 8, 0, 0.24, 0, 'gunshop-scale-fulcrum', false);

  ([-0.13, 0.13] as const).forEach((x, i) => {
    const tag = i === 0 ? 'l' : 'r';
    const chainA = addCyl(g, M.brassDark, 0.002, 0.002, 0.08, 6, x - 0.02, 0.2, 0, `gunshop-scale-chain-${tag}-a`, false);
    chainA.rotation.z = 0.25 * Math.sign(x);
    const chainB = addCyl(g, M.brassDark, 0.002, 0.002, 0.08, 6, x + 0.02, 0.2, 0, `gunshop-scale-chain-${tag}-b`, false);
    chainB.rotation.z = -0.25 * Math.sign(x);
    addCyl(g, M.brass, 0.045, 0.035, 0.012, 16, x, 0.16, 0, `gunshop-scale-pan-${tag}`, false);
  });

  return g;
}

/**
 * Hanging painted shop sign — hangs DOWN from its origin (the user file
 * built upward from the origin, which can never hang from anything; see the
 * module header). Origin = the mount point under the porch roof.
 */
export function buildGunsmithSign(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-sign';

  const chainLen = 0.28;
  ([-0.35, 0.35] as const).forEach((x, i) => {
    addCyl(g, M.brassDark, 0.006, 0.006, chainLen, 6, x, -0.02 - chainLen / 2, 0, `gunshop-sign-chain-${i === 0 ? 'l' : 'r'}`, false);
  });

  const tex = signTexture({ text: 'GUNSMITH', sub: 'GUNS \u00b7 AMMUNITION \u00b7 REPAIRS', w: 560, h: 220 });
  const boardMat = tex
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 1, metalness: 0 })
    : M.parchment;
  addBox(g, boardMat, 1.0, 0.34, 0.03, 0, -0.02 - chainLen - 0.17, 0, 'gunshop-sign-board');
  addBox(g, M.woodDark, 1.04, 0.38, 0.015, 0, -0.02 - chainLen - 0.17, -0.0125, 'gunshop-sign-frame');

  // small crossed-rifle silhouette below the board, for flavor
  const cy = -0.02 - chainLen - 0.34 - 0.1;
  const crossA = addCyl(g, M.steelDark, 0.006, 0.006, 0.5, 6, 0, cy, 0.02, 'gunshop-sign-cross-a', false);
  crossA.rotation.z = Math.PI / 5;
  const crossB = addCyl(g, M.steelDark, 0.006, 0.006, 0.5, 6, 0, cy, 0.02, 'gunshop-sign-cross-b', false);
  crossB.rotation.z = -Math.PI / 5;

  return g;
}

/* ========================================================================== */
/* Gunsmith workshop corner (NEW — the user spec listed them, the file         */
/* lacked them)                                                                */
/* ========================================================================== */

/** Heavy gunsmith workbench: top, legs, apron, lower shelf, tool back-panel. */
export function buildGunshopWorkbench(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-workbench';

  const w = 1.6;
  const d = 0.7;
  const topY = 0.9;

  addBox(g, M.woodTrim, w, 0.05, d, 0, topY + 0.025, 0, 'gunshop-workbench-top');
  const legXs = [-w / 2 + 0.05, w / 2 - 0.05];
  const legZs = [-d / 2 + 0.05, d / 2 - 0.05];
  for (const [i, lx] of legXs.entries()) {
    for (const [j, lz] of legZs.entries()) {
      addBox(g, M.woodDark, 0.07, topY, 0.07, lx, topY / 2, lz, `gunshop-workbench-leg-${i * 2 + j + 1}`);
    }
  }
  addBox(g, M.woodDark, w, 0.12, 0.03, 0, topY - 0.13, d / 2 - 0.02, 'gunshop-workbench-apron');
  addBox(g, M.woodMed, w - 0.2, 0.03, d - 0.15, 0, 0.18, 0, 'gunshop-workbench-shelf');
  // back riser panel with three pegs (tools hang above the bench in use)
  addBox(g, M.woodMed, w, 0.55, 0.03, 0, topY + 0.05 + 0.275, -d / 2 + 0.02, 'gunshop-workbench-back-panel');
  const pegZ = -d / 2 + 0.06;
  ([-0.5, 0, 0.5] as const).forEach((px, i) => {
    addCyl(g, M.steelDark, 0.008, 0.008, 0.05, 8, px, topY + 0.38, pegZ, `gunshop-workbench-peg-${i + 1}`, false).rotation.x = Math.PI / 2;
  });

  /* ---- BENCH DRESSING (§ revision: the bare top read as storage furniture,
   * not a gunsmith's bench). Every item is seated on the top surface by
   * MEASURED bbox (no sink / no float), pairwise non-overlapping, real scale.
   * The WEST end (x ≤ −0.3) stays clear for the vise def mounted there. ---- */
  const top = topY + 0.05; // workable surface
  const place = (obj: THREE.Object3D, x: number, z: number, yaw = 0): void => {
    obj.position.x += x;
    obj.position.z += z;
    obj.rotation.y = yaw;
    g.add(obj);
    seatOnSurface(obj, top);
  };

  // A revolver laid out IN PARTS along the back edge — barrel, cylinder,
  // grip frame — the unmistakable sign of work in progress.
  const partBarrel = addCyl(g, M.steelDark, 0.009, 0.01, 0.13, 10, 0, 0.0095, 0, 'gunshop-bench-part-barrel', false);
  partBarrel.rotation.z = Math.PI / 2;
  const barrelG = new THREE.Group(); barrelG.name = 'gunshop-bench-part-barrel-group'; barrelG.add(partBarrel);
  place(barrelG, -0.06, -0.24, 0.1);
  const partCyl = addCyl(g, M.steel, 0.018, 0.018, 0.034, 12, 0, 0.017, 0, 'gunshop-bench-part-cylinder', false);
  partCyl.rotation.x = Math.PI / 2;
  const cylG = new THREE.Group(); cylG.name = 'gunshop-bench-part-cylinder-group'; cylG.add(partCyl);
  place(cylG, 0.08, -0.235, 0);
  const partGrip = addBox(g, M.grip, 0.022, 0.062, 0.03, 0, 0.031, 0, 'gunshop-bench-part-grip', false);
  const gripG = new THREE.Group(); gripG.name = 'gunshop-bench-part-grip-group'; gripG.add(partGrip);
  place(gripG, 0.15, -0.24, 0.35);

  // Ball-peen hammer, lying across the back-right.
  const hammer = new THREE.Group(); hammer.name = 'gunshop-bench-hammer';
  const hHandle = addCyl(hammer, M.woodTrim, 0.008, 0.009, 0.14, 8, 0, 0.009, 0, 'gunshop-bench-hammer-handle', false);
  hHandle.rotation.z = Math.PI / 2;
  addBox(hammer, M.steel, 0.032, 0.032, 0.058, 0.062, 0.026, 0, 'gunshop-bench-hammer-head', false);
  place(hammer, 0.36, -0.17, 0.15);

  // Two turn-screws (period screwdrivers), shaft + wood handle, parallel-ish.
  for (const [i, sd] of [[0.3, 0.06, -0.1], [0.35, 0.19, 0.14]].entries()) {
    const driver = new THREE.Group(); driver.name = `gunshop-bench-screwdriver-${i + 1}`;
    const shaft = addCyl(driver, M.steel, 0.003, 0.003, 0.075, 8, 0, 0.004, 0, `gunshop-bench-screwdriver-${i + 1}-shaft`, false);
    shaft.rotation.z = Math.PI / 2;
    const handle = addCyl(driver, M.woodTrim, 0.0095, 0.011, 0.055, 10, -0.063, 0.011, 0, `gunshop-bench-screwdriver-${i + 1}-handle`, false);
    handle.rotation.z = Math.PI / 2;
    place(driver, sd[0], sd[1], sd[2]);
  }

  // Flat file, mid right.
  const file = new THREE.Group(); file.name = 'gunshop-bench-file';
  addBox(file, M.steel, 0.115, 0.007, 0.018, 0.02, 0.0045, 0, 'gunshop-bench-file-blade', false);
  addBox(file, M.woodTrim, 0.05, 0.016, 0.02, -0.052, 0.009, 0, 'gunshop-bench-file-handle', false);
  place(file, 0.5, 0.14, 0.08);

  // Oil bottle (dark glass, brass neck), standing near the back edge.
  const oil = new THREE.Group(); oil.name = 'gunshop-bench-oil-bottle';
  addCyl(oil, M.glassDark, 0.018, 0.02, 0.075, 10, 0, 0.0375, 0, 'gunshop-bench-oil-body', false);
  addCyl(oil, M.brassDark, 0.008, 0.008, 0.02, 8, 0, 0.085, 0, 'gunshop-bench-oil-neck', false);
  addCyl(oil, M.brass, 0.0095, 0.0095, 0.008, 8, 0, 0.099, 0, 'gunshop-bench-oil-cap', false);
  place(oil, -0.05, 0.19, 0);

  // Tin parts tray with small pins/screws inside.
  const tray = new THREE.Group(); tray.name = 'gunshop-bench-parts-tray';
  addBox(tray, M.steel, 0.13, 0.006, 0.09, 0, 0.003, 0, 'gunshop-bench-tray-base', false);
  addBox(tray, M.steel, 0.13, 0.02, 0.006, 0, 0.013, 0.042, 'gunshop-bench-tray-rim-n', false);
  addBox(tray, M.steel, 0.13, 0.02, 0.006, 0, 0.013, -0.042, 'gunshop-bench-tray-rim-s', false);
  addBox(tray, M.steel, 0.006, 0.02, 0.078, 0.062, 0.013, 0, 'gunshop-bench-tray-rim-e', false);
  addBox(tray, M.steel, 0.006, 0.02, 0.078, -0.062, 0.013, 0, 'gunshop-bench-tray-rim-w', false);
  [[-0.03, 0.015], [0.01, -0.018], [0.035, 0.02], [-0.015, -0.03]].forEach(([px, pz], k) => {
    addCyl(tray, M.brass, 0.0035, 0.0035, 0.012, 6, px, 0.012, pz, `gunshop-bench-tray-pin-${k + 1}`, false);
  });
  place(tray, 0.14, 0.16, -0.06);

  // Three loose cartridges by the tray.
  [[0.02, 0.04, 0.3], [0.055, 0.075, -0.2], [-0.005, 0.09, 0.1]].forEach(([cx, cz, cy], k) => {
    const cart = addCyl(g, M.brass, 0.0055, 0.0055, 0.032, 8, 0, 0.0055, 0, `gunshop-bench-cartridge-${k + 1}`, false);
    cart.rotation.z = Math.PI / 2;
    const cartG = new THREE.Group(); cartG.name = `gunshop-bench-cartridge-${k + 1}-group`; cartG.add(cart);
    place(cartG, cx, cz, cy);
  });

  // Cleaning rag, crumpled flat, west of the tray.
  const rag = addBox(g, M.leather, 0.16, 0.012, 0.12, 0, 0.006, 0, 'gunshop-bench-rag', false);
  const ragG = new THREE.Group(); ragG.name = 'gunshop-bench-rag-group'; ragG.add(rag);
  place(ragG, -0.2, 0.12, 0.35);

  // Wrench hangs on the CENTER peg; wire coil on the EAST peg.
  const wrench = new THREE.Group(); wrench.name = 'gunshop-bench-hanging-wrench';
  const wRing = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 12), M.steel);
  wRing.name = 'gunshop-bench-wrench-ring';
  wRing.castShadow = false; wRing.receiveShadow = true;
  wRing.position.set(0, 0, 0);
  wrench.add(wRing);
  addBox(wrench, M.steel, 0.012, 0.13, 0.005, 0, -0.075, 0, 'gunshop-bench-wrench-shaft', false);
  addBox(wrench, M.steel, 0.03, 0.024, 0.008, 0, -0.15, 0, 'gunshop-bench-wrench-jaw', false);
  wrench.position.set(0, topY + 0.38, pegZ - 0.008);
  g.add(wrench);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 6, 14), M.steelDark);
  coil.name = 'gunshop-bench-wire-coil';
  coil.castShadow = false; coil.receiveShadow = true;
  coil.position.set(0.5, topY + 0.375, pegZ - 0.01);
  g.add(coil);

  // Wooden toolbox on the lower shelf.
  const box2 = new THREE.Group(); box2.name = 'gunshop-bench-toolbox';
  addBox(box2, M.woodMed, 0.32, 0.11, 0.18, 0, 0.055, 0, 'gunshop-bench-toolbox-body', false);
  addBox(box2, M.woodDark, 0.34, 0.02, 0.2, 0, 0.115, 0, 'gunshop-bench-toolbox-lid', false);
  const tbHandle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 12, Math.PI), M.brassDark);
  tbHandle.name = 'gunshop-bench-toolbox-handle';
  tbHandle.castShadow = false; tbHandle.receiveShadow = true;
  tbHandle.position.set(0, 0.125, 0);
  tbHandle.rotation.y = Math.PI / 2;
  box2.add(tbHandle);
  box2.position.set(-0.35, 0, 0);
  g.add(box2);
  seatOnSurface(box2, 0.195); // lower shelf board top

  return g;
}

/** Bench vise with fixed/moving jaws, screw and T-handle. Origin = base bottom. */
export function buildGunshopVise(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-vise';

  addBox(g, M.steelDark, 0.16, 0.03, 0.1, 0, 0.015, 0, 'gunshop-vise-base');
  addBox(g, M.steelDark, 0.05, 0.09, 0.1, 0.055, 0.075, 0, 'gunshop-vise-fixed-jaw');
  addBox(g, M.steel, 0.14, 0.025, 0.03, -0.01, 0.05, 0, 'gunshop-vise-slide');
  // moving jaw 5 mm clear of the slide's −x face (the old −0.06 center put
  // both −x faces on the same plane).
  addBox(g, M.steelDark, 0.04, 0.08, 0.1, -0.055, 0.07, 0, 'gunshop-vise-moving-jaw');
  addCyl(g, M.steel, 0.012, 0.012, 0.1, 8, -0.13, 0.07, 0, 'gunshop-vise-screw', false).rotation.z = Math.PI / 2;
  addCyl(g, M.steel, 0.006, 0.006, 0.12, 8, -0.18, 0.07, 0, 'gunshop-vise-handle', false);

  return g;
}

/** Wall tool rack: board + pegs + four gunsmith tools. Origin = board center. */
export function buildGunshopToolRack(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-tool-rack';

  addBox(g, M.woodDark, 0.8, 0.6, 0.025, 0, 0, 0, 'gunshop-toolrack-board');

  // pegs + tools (each tool hangs from its peg, parts named)
  const peg = (x: number, y: number, tag: string): void => {
    addCyl(g, M.steelDark, 0.006, 0.006, 0.04, 8, x, y, 0.03, `gunshop-toolrack-peg-${tag}`, false).rotation.x = Math.PI / 2;
  };
  peg(-0.25, 0.18, 'screwdriver');
  const sdHandle = addCyl(g, M.woodTrim, 0.011, 0.011, 0.06, 8, -0.25, 0.12, 0.05, 'gunshop-tool-screwdriver-handle', false);
  void sdHandle;
  addCyl(g, M.steel, 0.003, 0.003, 0.08, 8, -0.25, 0.02, 0.05, 'gunshop-tool-screwdriver-shaft', false);

  peg(-0.08, 0.18, 'hammer');
  addBox(g, M.steel, 0.05, 0.03, 0.03, -0.08, 0.1, 0.05, 'gunshop-tool-hammer-head', false);
  addCyl(g, M.woodTrim, 0.008, 0.008, 0.1, 8, -0.08, 0.02, 0.05, 'gunshop-tool-hammer-handle', false);

  peg(0.1, 0.18, 'file');
  addBox(g, M.steel, 0.018, 0.14, 0.006, 0.1, 0.08, 0.05, 'gunshop-tool-file-blade', false);
  addBox(g, M.woodTrim, 0.024, 0.05, 0.014, 0.1, -0.02, 0.05, 'gunshop-tool-file-handle', false);

  peg(0.27, 0.18, 'oil');
  addCyl(g, M.brassDark, 0.02, 0.02, 0.07, 10, 0.27, 0.1, 0.05, 'gunshop-tool-oilbottle-body', false);
  addCyl(g, M.brassDark, 0.008, 0.008, 0.02, 8, 0.27, 0.145, 0.05, 'gunshop-tool-oilbottle-neck', false);

  return g;
}

/** Hanging interior lantern (sales/workshop). `lit` adds ONE real PointLight. */
export function buildGunshopLantern(lit: boolean): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-lantern';

  addCyl(g, M.steelDark, 0.01, 0.01, 0.25, 8, 0, -0.125, 0, 'gunshop-lantern-rod', false);
  addCyl(g, M.steelDark, 0.09, 0.07, 0.03, 10, 0, -0.27, 0, 'gunshop-lantern-cap', false);
  addCyl(g, M.glassDark, 0.055, 0.055, 0.12, 10, 0, -0.345, 0, 'gunshop-lantern-globe', false);
  addCyl(g, M.flame, 0.016, 0.016, 0.05, 8, 0, -0.34, 0, 'gunshop-lantern-flame', false);
  addCyl(g, M.steelDark, 0.075, 0.06, 0.02, 10, 0, -0.415, 0, 'gunshop-lantern-base', false);

  if (lit) {
    const light = new THREE.PointLight(0xffb066, 6.5, 9, 2);
    light.name = 'gunshop-lantern-light';
    light.position.set(0, -0.36, 0);
    light.castShadow = false;
    g.add(light);
  }

  return g;
}

/* ========================================================================== */
/* Decorative WESTERN TRADE SIGNS (§ facade revision — three small period     */
/* signs, each its own logical object, none touching windows/casing/sign)     */
/* ========================================================================== */

/**
 * Flat painted board mounted on the FALSE-FRONT parapet face. Origin = board
 * center; the back face sits 4 mm proud of its mount plane (the def positions
 * it), four iron bolts bury into the parapet — no coplanar faces anywhere.
 * Text plate + wood frame strips, western serif, street-readable size.
 */
export function buildGunshopParapetSign(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-parapet-sign';

  const tex = signTexture({ text: 'GUNS & AMMUNITION', w: 640, h: 180, border: true });
  const boardMat = tex
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 1, metalness: 0 })
    : M.parchment;
  addBox(g, boardMat, 1.35, 0.38, 0.025, 0, 0, 0.0125, 'gunshop-parapet-sign-board');
  addBox(g, M.woodDark, 1.39, 0.05, 0.032, 0, 0.215, 0.0125, 'gunshop-parapet-sign-frame-top');
  addBox(g, M.woodDark, 1.39, 0.05, 0.032, 0, -0.215, 0.0125, 'gunshop-parapet-sign-frame-bottom');
  // corner bolts: pass through the board, heads 2 mm proud of the FRONT
  // face, shanks buried into the parapet behind (board mounts 5 mm off the
  // face on the bolt heads — no coplanar pair, no float).
  ([-0.6, 0.6] as const).forEach((bx, i) => {
    addCyl(g, M.steelDark, 0.008, 0.008, 0.05, 8, bx, 0.13, 0.007, `gunshop-parapet-sign-bolt-${i === 0 ? 'w' : 'e'}-hi`, false).rotation.x = Math.PI / 2;
    addCyl(g, M.steelDark, 0.008, 0.008, 0.05, 8, bx, -0.13, 0.007, `gunshop-parapet-sign-bolt-${i === 0 ? 'w' : 'e'}-lo`, false).rotation.x = Math.PI / 2;
  });

  return g;
}

/**
 * Double-sided hanging SHINGLE under the porch roof, west of the main
 * GUNSMITH sign. Origin = the mount point at the porch-roof underside; two
 * short chains carry a framed board whose two texture plates ride the ±z
 * faces (backs ON the board core — no coplanar exposure).
 */
export function buildGunshopPorchShingle(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-porch-shingle';

  const chainLen = 0.3;
  ([-0.3, 0.3] as const).forEach((x, i) => {
    addCyl(g, M.brassDark, 0.005, 0.005, chainLen, 6, x, -chainLen / 2, 0, `gunshop-shingle-chain-${i === 0 ? 'w' : 'e'}`, false);
  });

  const tex = signTexture({ text: 'AMMUNITION', sub: 'LOADED TO ORDER', w: 460, h: 160, border: true });
  const boardMat = tex
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 1, metalness: 0 })
    : M.parchment;
  const cy = -chainLen - 0.13;
  addBox(g, M.woodDark, 0.88, 0.28, 0.03, 0, cy, 0, 'gunshop-shingle-board');
  addBox(g, boardMat, 0.82, 0.22, 0.004, 0, cy, 0.017, 'gunshop-shingle-face-south');
  addBox(g, boardMat, 0.82, 0.22, 0.004, 0, cy, -0.017, 'gunshop-shingle-face-north');

  return g;
}

/**
 * Small vertical REPAIRS board flanking the doorway (east of the casing, west
 * of the first window — the classic barber-pole spot). Origin = board center;
 * the back face mounts 4 mm proud of the wall face, two bolts bury behind.
 */
export function buildGunshopRepairsBoard(): THREE.Group {
  const M = createGunShopMaterials();
  const g = new THREE.Group();
  g.name = 'gunshop-repairs-board';

  const tex = signTexture({ text: 'REPAIRS', sub: 'GUNSMITH', w: 256, h: 320, border: true });
  const boardMat = tex
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 1, metalness: 0 })
    : M.parchment;
  addBox(g, boardMat, 0.48, 0.6, 0.02, 0, 0, 0.015, 'gunshop-repairs-board-board');
  addBox(g, M.woodDark, 0.52, 0.045, 0.026, 0, 0.3225, 0.015, 'gunshop-repairs-board-cap');
  addBox(g, M.woodDark, 0.52, 0.045, 0.026, 0, -0.3225, 0.015, 'gunshop-repairs-board-base');
  ([-0.16, 0.16] as const).forEach((bx, i) => {
    addCyl(g, M.steelDark, 0.007, 0.007, 0.044, 8, bx, 0.22, 0.002, `gunshop-repairs-board-bolt-${i === 0 ? 'w' : 'e'}-hi`, false).rotation.x = Math.PI / 2;
    addCyl(g, M.steelDark, 0.007, 0.007, 0.044, 8, bx, -0.22, 0.002, `gunshop-repairs-board-bolt-${i === 0 ? 'w' : 'e'}-lo`, false).rotation.x = Math.PI / 2;
  });

  return g;
}
