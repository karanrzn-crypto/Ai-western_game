/**
 * HorseModel — procedural build of the western horse.
 *
 * Same architecture as CharacterModel: every articulated part is a
 * THREE.Group ("joint") so the animator only ever rotates groups; meshes are
 * rigid children, so nothing can tear or clip. Shared materials, low-poly
 * primitives, a micro-detail layer hidden beyond the LOD distance (bridle,
 * blaze, hooves, stirrups), and a rigid `riderSocket` group on the saddle —
 * the player's character root is attached to that socket while riding, which
 * makes rider position/rotation bit-stable relative to the horse for free
 * (no per-frame lerp, no drift).
 *
 * Face convention: -Z is forward (head), +Z is the tail — identical to the
 * character and the player controller.
 */
import * as THREE from 'three';
import { HORSE_PROPORTIONS as P } from './HorseProportions.js';

/** Distance (m) beyond which micro-detail meshes are hidden (LOD switch). */
export const HORSE_DETAIL_DISTANCE = 22;

export interface HorseMaterials {
  coat: THREE.MeshStandardMaterial;
  coatDark: THREE.MeshStandardMaterial;
  mane: THREE.MeshStandardMaterial;
  muzzle: THREE.MeshStandardMaterial;
  hoof: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  leatherDark: THREE.MeshStandardMaterial;
  blanket: THREE.MeshStandardMaterial;
  /** Contrasting woven stripe across the saddle blanket. */
  blanketStripe: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
}

export type HorseJoints = Record<HorseJointName, THREE.Group>;

export type HorseJointName =
  | 'body' | 'neck' | 'head' | 'earL' | 'earR' | 'tail'
  | 'legFL' | 'kneeFL' | 'legFR' | 'kneeFR'
  | 'legBL' | 'kneeBL' | 'legBR' | 'kneeBR';

export interface HorseModel {
  /** Hooves at y=0, facing -Z. Synced from the horse controller every frame. */
  root: THREE.Group;
  joints: HorseJoints;
  materials: HorseMaterials;
  /** Saddle seat — the player's character root is attached here while riding. */
  riderSocket: THREE.Group;
  /** Eye meshes (blink animation scales them). */
  eyes: [THREE.Mesh, THREE.Mesh];
  setDetailVisible(visible: boolean): void;
  updateLOD(cameraPosition: THREE.Vector3, detailDistance?: number): boolean;
  dispose(): void;
}

function createHorseMaterials(): HorseMaterials {
  const std = (color: number, roughness: number, metalness = 0): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    coat: std(0x6d4a2c, 0.82),        // bay body
    coatDark: std(0x4a3018, 0.85),    // lower legs / points
    mane: std(0x1d150c, 0.92),        // black mane & tail
    muzzle: std(0x2e2115, 0.78),
    hoof: std(0x241a10, 0.62),
    leather: std(0x4c3218, 0.7),
    leatherDark: std(0x33220f, 0.72),
    blanket: std(0x7a3b2e, 0.9),      // faded red saddle blanket
    blanketStripe: std(0xd9c9a8, 0.95), // cream woven stripe
    brass: std(0xb08d3f, 0.42, 0.9),
    eye: std(0x120c06, 0.4),
  };
}

export function createHorseModel(): HorseModel {
  const materials = createHorseMaterials();
  const root = new THREE.Group();
  root.name = 'horse-root';
  // YXZ: yaw first, then the death roll — the horse rolls onto its side
  // relative to its own facing, whatever the yaw is.
  root.rotation.order = 'YXZ';

  const joints = {} as HorseJoints;
  const detailParts: THREE.Object3D[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const group = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const mesh = (
    parent: THREE.Object3D,
    material: THREE.Material,
    w: number, h: number, d: number,
    x = 0, y = 0, z = 0,
    detail = false,
  ): THREE.Mesh => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    if (detail) detailParts.push(m);
    return m;
  };
  const cylinder = (
    parent: THREE.Object3D,
    material: THREE.Material,
    radiusTop: number, radiusBottom: number, height: number,
    x = 0, y = 0, z = 0,
    detail = false,
    segments = 9,
  ): THREE.Mesh => {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    if (detail) detailParts.push(m);
    return m;
  };

  // --- Rig skeleton ---------------------------------------------------------
  // `body` is the whole-torso joint (bob / pitch / roll of the barrel).
  const body = group('body', root, 0, P.bodyCenterY, 0);
  const neck = group('neck', root, 0, P.neckBaseY, P.neckBaseZ);
  const head = group('head', neck, 0, P.neckLength, -0.12);
  const earL = group('earL', head, -0.09, 0.14, 0.02);
  const earR = group('earR', head, 0.09, 0.14, 0.02);
  const tail = group('tail', root, 0, P.tailBaseY, P.tailBaseZ);
  const legFL = group('legFL', root, -P.legHalfWidth, P.frontLegY, P.frontLegZ);
  const legFR = group('legFR', root, P.legHalfWidth, P.frontLegY, P.frontLegZ);
  const legBL = group('legBL', root, -P.legHalfWidth, P.hindLegY, P.hindLegZ);
  const legBR = group('legBR', root, P.legHalfWidth, P.hindLegY, P.hindLegZ);
  const kneeFL = group('kneeFL', legFL, 0, -P.upperLeg, 0);
  const kneeFR = group('kneeFR', legFR, 0, -P.upperLeg, 0);
  const kneeBL = group('kneeBL', legBL, 0, -P.upperLeg, 0);
  const kneeBR = group('kneeBR', legBR, 0, -P.upperLeg, 0);
  Object.assign(joints, { body, neck, head, earL, earR, tail, legFL, kneeFL, legFR, kneeFR, legBL, kneeBL, legBR, kneeBR });

  // --- Torso (barrel) ---------------------------------------------------------
  // A tapered chest → rounded hindquarters read, built from 3 boxes. The
  // overlay masses stay BARELY wider than the barrel (a lean riding horse,
  // not a draft animal) — the slim silhouette lives in these multipliers.
  mesh(body, materials.coat, P.bodyWidth, P.bodyHeight * 0.94, 0.7, 0, 0.02, -0.42);   // chest
  mesh(body, materials.coat, P.bodyWidth, P.bodyHeight, 0.62, 0, 0, 0.12);             // barrel
  mesh(body, materials.coat, P.bodyWidth * 0.96, P.bodyHeight * 0.92, 0.5, 0, 0.03, 0.58); // hindquarters
  // Belly shading + shoulder/haunch muscle masses.
  mesh(body, materials.coatDark, P.bodyWidth * 1.0, 0.16, 1.2, 0, -P.bodyHeight * 0.44, 0.05);
  mesh(body, materials.coat, P.bodyWidth * 1.03, 0.3, 0.32, 0, 0.1, -0.5);
  mesh(body, materials.coat, P.bodyWidth * 1.02, 0.32, 0.34, 0, 0.12, 0.62);

  // --- Western saddle (rigid — never animated) ---------------------------------
  // Built in LAYERS on the back, body-local (body joint center = bodyCenterY;
  // saddle seat TOP = saddleTopY). The rider socket and the stirrups stay in
  // the classic relationship: feet hang exactly at stirrup-tread level.
  const saddleY = P.saddleTopY - P.bodyCenterY; // 0.30 — seat top surface
  // 1) Saddle blanket (drapes slightly past the slim barrel) + contrast stripe.
  mesh(body, materials.blanket, P.bodyWidth * 1.24, 0.05, 0.8, 0, saddleY - 0.19, 0.05);
  mesh(body, materials.blanketStripe, P.bodyWidth * 1.24, 0.012, 0.8, 0, saddleY - 0.162, 0.05, true);
  // 2) Leather skirt — the wide base slab that carries the whole saddle.
  mesh(body, materials.leatherDark, P.bodyWidth * 1.12, 0.07, 0.66, 0, saddleY - 0.135, 0.05);
  // 3) Cinch strap under the belly (reads as a wrapped girth).
  mesh(body, materials.leatherDark, P.bodyWidth * 1.1, 0.045, 0.09, 0, -P.bodyHeight / 2 - 0.02, 0.08);
  // 4) Seat pad — top face IS saddleTopY (rider sits here).
  mesh(body, materials.leather, 0.46, 0.1, 0.5, 0, saddleY - 0.05, 0.08);
  // 5) Pommel fork (front rise) + horn — the western signature.
  mesh(body, materials.leatherDark, 0.34, 0.13, 0.13, 0, saddleY + 0.055, -0.18);
  const horn = cylinder(body, materials.leatherDark, 0.028, 0.05, 0.12, 0, saddleY + 0.16, -0.18, false, 8);
  horn.rotation.x = -0.22;
  cylinder(body, materials.brass, 0.032, 0.032, 0.03, 0, saddleY + 0.215, -0.185, true, 8); // horn cap
  // 6) Cantle (rear rise) — taller than the pommel, with a brass rim.
  mesh(body, materials.leatherDark, 0.4, 0.17, 0.11, 0, saddleY + 0.065, 0.31);
  mesh(body, materials.brass, 0.4, 0.03, 0.115, 0, saddleY + 0.155, 0.31, true);
  // 7) Fenders hang from the skirt; stirrups hang at rider-foot level.
  const fenderY = saddleY - 0.17 - 0.17; // center of the hanging strap
  mesh(body, materials.leatherDark, 0.09, 0.36, 0.05, -0.3, fenderY, 0.1);
  mesh(body, materials.leatherDark, 0.09, 0.36, 0.05, 0.3, fenderY, 0.1);
  const stirrupY = P.riderFeetY - P.bodyCenterY + 0.025; // tread just under the rider's feet
  const stirrupBuild = (side: -1 | 1): void => {
    const tread = mesh(body, materials.leather, 0.13, 0.045, 0.17, side * 0.3, stirrupY, 0.1);
    mesh(body, materials.leatherDark, 0.13, 0.09, 0.03, side * 0.3, stirrupY + 0.055, 0.155, true); // front riser
    mesh(body, materials.leatherDark, 0.13, 0.09, 0.03, side * 0.3, stirrupY + 0.055, 0.045, true); // back riser
    tread.name = side === -1 ? 'stirrup-l' : 'stirrup-r';
  };
  stirrupBuild(-1);
  stirrupBuild(1);
  // 8) Skirt tie strings (detail flavor).
  mesh(body, materials.leather, 0.03, 0.12, 0.02, -P.bodyWidth * 0.56, saddleY - 0.16, -0.18, true);
  mesh(body, materials.leather, 0.03, 0.12, 0.02, P.bodyWidth * 0.56, saddleY - 0.16, -0.18, true);

  // Rider socket: the character root attaches here while mounted. Local
  // offset = stirrup-level feet, centered on the seat.
  const riderSocket = group('rider-socket', root, 0, P.riderFeetY, P.riderZ);

  // --- Neck, mane, head --------------------------------------------------------
  // Slim, clearly-tapered neck: narrow at the poll, moderate at the chest —
  // the single biggest readability lever between "riding horse" and "bulky".
  cylinder(neck, materials.coat, 0.15, 0.225, P.neckLength + 0.16, 0, P.neckLength / 2 + 0.02, -0.05, false, 9)
    .rotation.x = 0.42; // angled up-forward
  // Mane: a ridge of thin boxes along the top of the neck.
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    mesh(neck, materials.mane, 0.08, 0.14 + 0.05 * Math.sin(t * Math.PI), 0.1,
      0, 0.16 + t * (P.neckLength - 0.02), -0.02 - t * 0.16, i % 2 === 0);
  }
  // Head: skull box + tapered muzzle + jaw.
  mesh(head, materials.coat, P.headWidth, 0.3, 0.42, 0, 0.04, -0.08);
  mesh(head, materials.coat, P.headWidth * 0.78, 0.2, 0.3, 0, -0.06, -0.32);
  mesh(head, materials.muzzle, P.headWidth * 0.6, 0.16, 0.14, 0, -0.09, -0.46);
  mesh(head, materials.coatDark, 0.18, 0.2, 0.12, 0, -0.08, 0.12); // jaw
  // Blaze (detail) + eyes + forelock + ears.
  mesh(head, materials.muzzle, 0.06, 0.26, 0.3, 0, 0.06, -0.29, true);
  const eyeL = mesh(head, materials.eye, 0.05, 0.05, 0.05, -P.headWidth / 2, 0.08, -0.1, true);
  const eyeR = mesh(head, materials.eye, 0.05, 0.05, 0.05, P.headWidth / 2, 0.08, -0.1, true);
  eyeL.name = 'eye-l';
  eyeR.name = 'eye-r';
  mesh(head, materials.mane, 0.16, 0.1, 0.08, 0, 0.19, -0.02, true); // forelock
  const earBuild = (ear: THREE.Group): void => {
    const cone = new THREE.CylinderGeometry(0.008, 0.055, P.earHeight, 6);
    geometries.push(cone);
    const m = new THREE.Mesh(cone, materials.coat);
    m.position.y = P.earHeight / 2;
    m.castShadow = true;
    ear.add(m);
    const inner = new THREE.CylinderGeometry(0.004, 0.03, P.earHeight * 0.7, 6);
    geometries.push(inner);
    const innerMesh = new THREE.Mesh(inner, materials.muzzle);
    innerMesh.position.set(0, P.earHeight / 2, 0.03);
    ear.add(innerMesh);
    detailParts.push(innerMesh);
  };
  earBuild(earL);
  earBuild(earR);
  // Bridle (detail): noseband + cheek strap + rein stubs toward the saddle.
  mesh(head, materials.leatherDark, P.headWidth * 0.8, 0.05, 0.05, 0, -0.04, -0.4, true);
  mesh(head, materials.leatherDark, 0.04, 0.3, 0.05, -P.headWidth / 2, 0.0, -0.18, true);
  mesh(head, materials.leatherDark, 0.04, 0.3, 0.05, P.headWidth / 2, 0.0, -0.18, true);

  // --- Tail ----------------------------------------------------------------------
  cylinder(tail, materials.mane, 0.05, 0.09, P.tailLength, 0, -P.tailLength / 2 + 0.05, 0, false, 7);
  mesh(tail, materials.mane, 0.14, 0.3, 0.08, 0, -0.14, 0.02); // tail root tuft

  // --- Legs: upper + lower + hoof --------------------------------------------------
  const buildLeg = (upper: THREE.Group, knee: THREE.Group, dark: boolean): void => {
    cylinder(upper, dark ? materials.coatDark : materials.coat, 0.095, 0.08, P.upperLeg, 0, -P.upperLeg / 2, 0, false, 8);
    // Chestnut + joint bulge (detail).
    cylinder(upper, materials.coatDark, 0.1, 0.1, 0.08, 0, -0.04, 0, true, 8);
    cylinder(knee, dark ? materials.coatDark : materials.coat, 0.072, 0.06, P.lowerLeg, 0, -P.lowerLeg / 2, 0, false, 8);
    mesh(knee, materials.hoof, 0.12, P.hoofHeight, 0.15, 0, -P.lowerLeg - P.hoofHeight / 2 + 0.02, -0.01);
  };
  buildLeg(legFL, kneeFL, true);
  buildLeg(legFR, kneeFR, true);
  buildLeg(legBL, kneeBL, false);
  buildLeg(legBR, kneeBR, false);

  return {
    root,
    joints,
    materials,
    riderSocket,
    eyes: [eyeL, eyeR],
    setDetailVisible(visible: boolean): void {
      for (const part of detailParts) part.visible = visible;
    },
    updateLOD(cameraPosition: THREE.Vector3, detailDistance = HORSE_DETAIL_DISTANCE): boolean {
      const distance = cameraPosition.distanceTo(root.position);
      const visible = distance <= detailDistance;
      this.setDetailVisible(visible);
      return visible;
    },
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      root.removeFromParent();
    },
  };
}
