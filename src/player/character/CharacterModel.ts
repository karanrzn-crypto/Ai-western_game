/**
 * CharacterModel — procedural build of the main character ("The Ranger").
 *
 * Visual identity goals (visible from far away and from behind):
 *   - wide-brim creased cowboy hat (the strongest silhouette driver)
 *   - long duster coat with an open front + back/side skirts
 *   - brick-red neck bandana with a knot at the back of the neck
 *   - dark leather vest over a faded sand shirt, rolled sleeves + gloves
 *   - gun belt with brass buckle, ammo loops, knife sheath and a revolver in
 *     a holster on the right hip (weapon socket = right hand joint)
 *   - tall boot shafts with spurs
 *
 * Rig: every articulated part is a THREE.Group ("joint") so animation only
 * ever rotates groups; meshes are rigid children, which guarantees no cloth/
 * hair clipping deformation and keeps the structure skinnable later.
 *
 * Performance: all materials are shared instances, geometries are low-poly
 * primitives, micro details (buckle, face features, spurs, ammo...) live in
 * a detail layer that hides beyond CHARACTER_DETAIL_DISTANCE (LOD), and the
 * head group can be hidden for first-person view.
 */
import * as THREE from 'three';
import { CHARACTER_PROPORTIONS, type CharacterJointName } from './CharacterProportions.js';

/** Distance (m) beyond which micro-detail meshes are hidden (LOD switch). */
export const CHARACTER_DETAIL_DISTANCE = 18;

export interface CharacterMaterials {
  skin: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  shirt: THREE.MeshStandardMaterial;
  vest: THREE.MeshStandardMaterial;
  coat: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
  belt: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  bandana: THREE.MeshStandardMaterial;
  hat: THREE.MeshStandardMaterial;
  hatBand: THREE.MeshStandardMaterial;
  gunmetal: THREE.MeshStandardMaterial;
  gunWood: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
}

export type CharacterJoints = Record<CharacterJointName, THREE.Group>;

export interface CharacterModel {
  /** Feet at y=0, facing -Z. Synced from the player controller every frame. */
  root: THREE.Group;
  joints: CharacterJoints;
  materials: CharacterMaterials;
  /** Right-hand weapon socket for the future draw/holster flow. */
  handSocketR: THREE.Group;
  handSocketL: THREE.Group;
  setDetailVisible(visible: boolean): void;
  updateLOD(cameraPosition: THREE.Vector3, detailDistance?: number): boolean;
  /** First-person: hide head+hat so they never block the camera. */
  setHeadVisible(visible: boolean): void;
  dispose(): void;
}

function createCharacterMaterials(): CharacterMaterials {
  // Deliberately distinct roughness/metalness/color per surface family so
  // skin, fabric, leather, felt, wood and metal read differently in daylight,
  // sunset and the day/night cycle's night lighting.
  const std = (color: number, roughness: number, metalness = 0): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    skin: std(0xc9976c, 0.72),
    hair: std(0x35261a, 0.86),
    shirt: std(0xb39a72, 0.93),
    vest: std(0x3c2d20, 0.8),
    coat: std(0x5a452f, 0.88),
    pants: std(0x4c4a43, 0.95),
    boot: std(0x322419, 0.76),
    belt: std(0x2c1f16, 0.68),
    glove: std(0x40301f, 0.85),
    bandana: std(0x99432f, 0.95),
    hat: std(0x4a3726, 0.9),
    hatBand: std(0x241a12, 0.9),
    gunmetal: std(0x45484d, 0.38, 0.85),
    gunWood: std(0x5c3d24, 0.6),
    brass: std(0xb08d3f, 0.42, 0.9),
    eye: std(0x241a12, 0.5),
  };
}

export function createCharacterModel(): CharacterModel {
  const materials = createCharacterMaterials();
  const P = CHARACTER_PROPORTIONS;
  const root = new THREE.Group();
  root.name = 'character-root';
  const joints = {} as CharacterJoints;
  const detailParts: THREE.Object3D[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  let headJoint: THREE.Group | null = null;
  let handSocketR: THREE.Group | null = null;
  let handSocketL: THREE.Group | null = null;

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
    m.receiveShadow = false;
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
    m.receiveShadow = false;
    parent.add(m);
    if (detail) detailParts.push(m);
    return m;
  };

  // --- Rig skeleton ---------------------------------------------------------
  const hips = group('hips', root, 0, P.hipY, 0);
  const spine = group('spine', hips, 0, 0.14, 0);
  const chest = group('chest', spine, 0, 0.18, 0);
  const neck = group('neck', chest, 0, 0.22, 0);
  const head = group('head', neck, 0, 0.06, 0);
  const shoulderL = group('shoulderL', chest, -P.shoulderHalfWidth, 0.19, 0);
  const shoulderR = group('shoulderR', chest, P.shoulderHalfWidth, 0.19, 0);
  const elbowL = group('elbowL', shoulderL, 0, -P.upperArm, 0);
  const elbowR = group('elbowR', shoulderR, 0, -P.upperArm, 0);
  const handL = group('handL', elbowL, 0, -P.lowerArm, 0);
  const handR = group('handR', elbowR, 0, -P.lowerArm, 0);
  const legL = group('legL', hips, -P.hipHalfWidth, -0.06, 0);
  const legR = group('legR', hips, P.hipHalfWidth, -0.06, 0);
  const kneeL = group('kneeL', legL, 0, -P.upperLeg, 0);
  const kneeR = group('kneeR', legR, 0, -P.upperLeg, 0);
  const footL = group('footL', kneeL, 0, -P.lowerLeg, 0);
  const footR = group('footR', kneeR, 0, -P.lowerLeg, 0);
  Object.assign(joints, { hips, spine, chest, neck, head, shoulderL, elbowL, handL, shoulderR, elbowR, handR, legL, kneeL, footL, legR, kneeR, footR });
  headJoint = head;

  handSocketR = group('hand-socket-r', handR);
  handSocketL = group('hand-socket-l', handL);

  // --- Torso ----------------------------------------------------------------
  mesh(hips, materials.pants, 0.32, 0.18, 0.21, 0, 0, 0);
  // Gun belt + brass buckle + ammo loops + knife sheath.
  mesh(hips, materials.belt, 0.345, 0.085, 0.225, 0, 0.105, 0);
  mesh(hips, materials.brass, 0.05, 0.052, 0.016, 0, 0.105, -0.118, true);
  mesh(hips, materials.belt, 0.1, 0.045, 0.235, -0.1, 0.105, 0, true);
  for (let i = 0; i < 4; i += 1) {
    const bullet = cylinder(hips, materials.brass, 0.011, 0.011, 0.05, -0.062 + i * 0.026, 0.105, -0.09, true, 6);
    bullet.rotation.x = Math.PI / 2;
  }
  const knifeSheath = mesh(hips, materials.belt, 0.038, 0.15, 0.055, -0.125, 0.02, 0.07, true);
  knifeSheath.rotation.z = 0.22;
  mesh(hips, materials.gunWood, 0.028, 0.05, 0.032, -0.138, -0.055, 0.085, true);
  // Holster + revolver on the RIGHT hip (+X), muzzle angled down-forward.
  const holster = group('holster', hips, 0.145, 0.055, 0.01);
  holster.rotation.set(0.12, -0.18, -0.08);
  mesh(holster, materials.belt, 0.09, 0.23, 0.115, 0, -0.09, 0);
  const barrel = cylinder(holster, materials.gunmetal, 0.022, 0.022, 0.2, 0, -0.1, -0.012, false, 7);
  barrel.rotation.x = Math.PI / 2 - 0.35;
  cylinder(holster, materials.gunmetal, 0.03, 0.03, 0.075, 0, -0.015, -0.005, false, 7).rotation.x = Math.PI / 2 - 0.35;
  mesh(holster, materials.gunWood, 0.042, 0.095, 0.055, 0.005, 0.045, 0.055).rotation.x = 0.5;

  mesh(spine, materials.shirt, 0.3, 0.2, 0.185, 0, 0.06, 0);
  mesh(chest, materials.shirt, 0.35, 0.27, 0.2, 0, 0.06, 0);
  // Leather vest sits over the chest block.
  mesh(chest, materials.vest, 0.365, 0.25, 0.215, 0, 0.075, 0);
  mesh(chest, materials.brass, 0.02, 0.02, 0.012, -0.03, 0.16, -0.112, true);
  mesh(chest, materials.brass, 0.02, 0.02, 0.012, -0.03, 0.06, -0.112, true);

  // Duster coat: open front, back skirt + side skirts hang from the shoulders.
  const coatBack = mesh(chest, materials.coat, 0.42, 0.56, 0.05, 0, -0.11, 0.135);
  coatBack.rotation.x = 0.05;
  mesh(chest, materials.coat, 0.17, 0.56, 0.05, -0.115, -0.11, 0.14).rotation.x = 0.08;
  mesh(chest, materials.coat, 0.17, 0.56, 0.05, 0.115, -0.11, 0.14).rotation.x = 0.08;
  mesh(chest, materials.coat, 0.07, 0.5, 0.17, -0.205, -0.09, 0.02);
  mesh(chest, materials.coat, 0.07, 0.5, 0.17, 0.205, -0.09, 0.02);
  mesh(chest, materials.coat, 0.1, 0.47, 0.05, -0.145, -0.08, -0.12).rotation.x = -0.03;
  mesh(chest, materials.coat, 0.1, 0.47, 0.05, 0.145, -0.08, -0.12).rotation.x = -0.03;
  mesh(chest, materials.coat, 0.32, 0.07, 0.11, 0, 0.185, 0.05); // collar

  // --- Neck + bandana -------------------------------------------------------
  cylinder(neck, materials.skin, 0.052, 0.058, 0.09, 0, 0.02, 0, false, 8);
  cylinder(neck, materials.bandana, 0.082, 0.082, 0.06, 0, -0.025, 0, false, 10);
  mesh(neck, materials.bandana, 0.055, 0.1, 0.04, 0.02, -0.07, 0.085, true);

  // --- Head, hair, face, hat ------------------------------------------------
  mesh(head, materials.skin, P.headWidth, P.headHeight, P.headDepth, 0, 0.115, 0);
  mesh(head, materials.hair, 0.2, 0.1, 0.235, 0, 0.205, 0.012);
  mesh(head, materials.hair, 0.195, 0.13, 0.05, 0, 0.13, 0.108);
  mesh(head, materials.skin, 0.02, 0.048, 0.038, -0.097, 0.12, 0.005, true);
  mesh(head, materials.skin, 0.02, 0.048, 0.038, 0.097, 0.12, 0.005, true);
  mesh(head, materials.eye, 0.034, 0.02, 0.012, -0.045, 0.15, -0.113, true);
  mesh(head, materials.eye, 0.034, 0.02, 0.012, 0.045, 0.15, -0.113, true);
  mesh(head, materials.hair, 0.052, 0.014, 0.014, -0.045, 0.172, -0.111, true);
  mesh(head, materials.hair, 0.052, 0.014, 0.014, 0.045, 0.172, -0.111, true);
  mesh(head, materials.skin, 0.032, 0.052, 0.036, 0, 0.105, -0.121, true);
  mesh(head, materials.hair, 0.085, 0.028, 0.02, 0, 0.06, -0.116, true); // mustache
  // Cowboy hat: dipped brim, creased crown, dark band.
  const hat = group('hat', head, 0, 0.2, 0);
  hat.rotation.x = -0.05;
  cylinder(hat, materials.hat, 0.24, 0.24, 0.018, 0, 0, 0, false, 14);
  cylinder(hat, materials.hat, 0.105, 0.098, 0.155, 0, 0.082, 0.004, false, 12);
  cylinder(hat, materials.hatBand, 0.108, 0.108, 0.032, 0, 0.028, 0.001, true, 12);
  mesh(hat, materials.hat, 0.032, 0.024, 0.1, 0, 0.165, 0.002, true); // crown crease

  // --- Arms (rolled sleeves: skin forearms + leather gloves) ----------------
  const shoulderRest = (joint: THREE.Group, side: -1 | 1): void => { joint.rotation.z = side * -0.07; };
  shoulderRest(shoulderL, -1);
  shoulderRest(shoulderR, 1);
  cylinder(shoulderL, materials.shirt, 0.058, 0.05, P.upperArm, 0, -P.upperArm / 2, 0, false, 8);
  cylinder(shoulderR, materials.shirt, 0.058, 0.05, P.upperArm, 0, -P.upperArm / 2, 0, false, 8);
  cylinder(elbowL, materials.skin, 0.046, 0.04, P.lowerArm * 0.9, 0, -P.lowerArm / 2 + 0.01, 0, false, 8);
  cylinder(elbowR, materials.skin, 0.046, 0.04, P.lowerArm * 0.9, 0, -P.lowerArm / 2 + 0.01, 0, false, 8);
  mesh(handL, materials.glove, 0.07, 0.1, 0.062, 0, -0.045, 0);
  mesh(handR, materials.glove, 0.07, 0.1, 0.062, 0, -0.045, 0);

  // --- Legs + boots + spurs -------------------------------------------------
  cylinder(legL, materials.pants, 0.088, 0.072, P.upperLeg * 0.96, 0, -P.upperLeg / 2, 0, false, 9);
  cylinder(legR, materials.pants, 0.088, 0.072, P.upperLeg * 0.96, 0, -P.upperLeg / 2, 0, false, 9);
  cylinder(kneeL, materials.pants, 0.066, 0.058, P.lowerLeg * 0.45, 0, -P.lowerLeg * 0.24, 0, false, 8);
  cylinder(kneeR, materials.pants, 0.066, 0.058, P.lowerLeg * 0.45, 0, -P.lowerLeg * 0.24, 0, false, 8);
  cylinder(kneeL, materials.boot, 0.072, 0.062, P.lowerLeg * 0.55, 0, -P.lowerLeg * 0.68, 0, false, 8);
  cylinder(kneeR, materials.boot, 0.072, 0.062, P.lowerLeg * 0.55, 0, -P.lowerLeg * 0.68, 0, false, 8);
  mesh(footL, materials.boot, 0.115, P.footHeight, P.footLength, 0, -0.045, -0.055);
  mesh(footR, materials.boot, 0.115, P.footHeight, P.footLength, 0, -0.045, -0.055);
  const spurL = mesh(kneeL, materials.brass, 0.012, 0.03, 0.03, 0, -P.lowerLeg + 0.02, 0.075, true);
  spurL.rotation.x = 0.4;
  const spurR = mesh(kneeR, materials.brass, 0.012, 0.03, 0.03, 0, -P.lowerLeg + 0.02, 0.075, true);
  spurR.rotation.x = 0.4;

  return {
    root,
    joints,
    materials,
    handSocketR: handSocketR!,
    handSocketL: handSocketL!,
    setDetailVisible(visible: boolean): void {
      for (const part of detailParts) part.visible = visible;
    },
    updateLOD(cameraPosition: THREE.Vector3, detailDistance = CHARACTER_DETAIL_DISTANCE): boolean {
      const distance = cameraPosition.distanceTo(root.position);
      const visible = distance <= detailDistance;
      this.setDetailVisible(visible);
      return visible;
    },
    setHeadVisible(visible: boolean): void {
      if (headJoint) headJoint.visible = visible;
    },
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      root.removeFromParent();
    },
  };
}
