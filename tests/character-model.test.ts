import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  CHARACTER_PROPORTIONS,
  CHARACTER_DETAIL_DISTANCE,
  createCharacterModel,
  CharacterAnimator,
} from '../src/index.js';

function build() {
  const model = createCharacterModel();
  const animator = new CharacterAnimator(model);
  return { model, animator };
}

test('character proportions match the designed identity', () => {
  const { model } = build();
  const head = model.joints.head;
  const headWorld = new THREE.Vector3();
  head.getWorldPosition(headWorld);
  assert.ok(Math.abs(headWorld.y - 1.56) < 1e-6, `head joint at ${headWorld.y}`);
  // Hat top: measured from the real geometry (crown pieces inside the hat
  // group), not a hardcoded stack of constants.
  const hat = head.getObjectByName('hat');
  assert.ok(hat, 'hat joint exists');
  model.root.updateMatrixWorld(true);
  let hatTopWorld = -Infinity;
  hat!.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.computeBoundingBox();
      const box = obj.geometry.boundingBox!;
      for (const corner of [
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      ]) {
        hatTopWorld = Math.max(hatTopWorld, obj.localToWorld(corner).y);
      }
    }
  });
  assert.ok(hatTopWorld > 1.86 && hatTopWorld < 2.0, `hat top ${hatTopWorld.toFixed(3)} sits on the head`);
  // Feet: foot joint at 0.05 above ground, boot box bottom touches ~0.
  const foot = model.joints.footL;
  assert.ok(Math.abs(foot.getWorldPosition(new THREE.Vector3()).y - 0.05) < 1e-6);
  assert.equal(CHARACTER_PROPORTIONS.totalHeight, 1.83);
  // Legs longer than torso (heroic western build), shoulders wider than hips.
  assert.ok(CHARACTER_PROPORTIONS.upperLeg + CHARACTER_PROPORTIONS.lowerLeg > 0.8);
  assert.ok(CHARACTER_PROPORTIONS.shoulderHalfWidth > CHARACTER_PROPORTIONS.hipHalfWidth * 2);
  assert.ok(model.joints.legL.position.x < 0 && model.joints.legR.position.x > 0);
});

test('character rig is a proper joint hierarchy', () => {
  const { model } = build();
  const j = model.joints;
  assert.equal(j.spine.parent, j.hips);
  assert.equal(j.chest.parent, j.spine);
  assert.equal(j.neck.parent, j.chest);
  assert.equal(j.head.parent, j.neck);
  assert.equal(j.shoulderL.parent, j.chest);
  assert.equal(j.shoulderR.parent, j.chest);
  assert.equal(j.elbowL.parent, j.shoulderL);
  assert.equal(j.handR.parent, j.elbowR);
  assert.equal(j.kneeL.parent, j.legL);
  assert.equal(j.footR.parent, j.kneeR);
  // Weapon sockets exist on both hands.
  assert.ok(model.handSocketR.parent === j.handR);
  assert.ok(model.handSocketL.parent === j.handL);
});

test('character materials are natural and distinguishable', () => {
  const { model } = build();
  const mats = Object.values(model.materials);
  assert.equal(mats.length, 15);
  const signatures = new Set(mats.map((m) => `${m.color.getHexString()}:${m.roughness.toFixed(2)}:${m.metalness.toFixed(2)}`));
  assert.equal(signatures.size, mats.length, 'every material family must be visually distinct');
  // Realism guards: skin is matte (not plastic/metal), leather is rough, gun is metallic.
  assert.ok(model.materials.skin.metalness === 0 && model.materials.skin.roughness > 0.6);
  assert.ok(model.materials.boot.roughness > 0.6);
  assert.ok(model.materials.gunmetal.metalness > 0.7);
  // No neon/artificial colors: all channels below 0.85 brightness for cloth/leather.
  for (const key of ['shirt', 'vest', 'pants', 'boot', 'belt', 'hat'] as const) {
    const c = model.materials[key].color;
    assert.ok(c.r < 0.85 && c.g < 0.85 && c.b < 0.85, `${key} avoids artificial brightness`);
  }
});

test('character meshes cast shadows and stay low-poly', () => {
  const { model } = build();
  let meshes = 0;
  let shadowCasters = 0;
  model.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      meshes += 1;
      if (obj.castShadow) shadowCasters += 1;
      const positionCount = obj.geometry.getAttribute('position')?.count ?? 0;
      assert.ok(positionCount < 200, 'low-poly primitives only');
    }
  });
  assert.ok(meshes > 40, `character has real detail (${meshes} meshes)`);
  assert.equal(shadowCasters, meshes);
});

test('gun belt and holster ride the right side (thigh tie-down)', () => {
  const { model } = build();
  const holster = model.root.getObjectByName('holster');
  assert.ok(holster);
  // The holster is a rigid child of the RIGHT LEG joint (western tie-down):
  // it moves WITH the swinging thigh, so it can never intersect the pants.
  assert.equal(holster!.parent, model.joints.legR, 'holster parented to the right leg joint');
  model.root.updateMatrixWorld(true);
  const holsterWorld = new THREE.Vector3();
  holster!.getWorldPosition(holsterWorld);
  assert.ok(holsterWorld.x > 0.1, `holster on the +X (right) side (${holsterWorld.x.toFixed(3)})`);
  const gunMetal = model.materials.gunmetal;
  let gunParts = 0;
  holster!.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material === gunMetal) gunParts += 1;
  });
  assert.ok(gunParts >= 2, 'revolver barrel + cylinder present in holster');
});

test('LOD hides micro details at distance and restores them up close', () => {
  const { model } = build();
  model.root.position.set(0, 0, 0);
  const near = model.updateLOD(new THREE.Vector3(2, 1, 2));
  assert.equal(near, true);
  let visibleDetails = 0;
  model.root.traverse((obj) => { if (obj.visible && obj.parent && obj.name !== 'character-root') visibleDetails += 1; });
  const far = model.updateLOD(new THREE.Vector3(CHARACTER_DETAIL_DISTANCE + 10, 1, 0));
  assert.equal(far, false);
  assert.ok(visibleDetails > 0, 'near view shows detail meshes');
  // After hiding, at least one previously visible mesh is now invisible.
  let hidden = 0;
  model.root.traverse((obj) => { if (!obj.visible && obj instanceof THREE.Mesh) hidden += 1; });
  assert.ok(hidden > 0, 'far view hides detail meshes');
  model.updateLOD(new THREE.Vector3(1, 1, 1));
});

test('first-person mode hides the head group', () => {
  const { model } = build();
  model.setHeadVisible(false);
  assert.equal(model.joints.head.visible, false);
  assert.equal(model.joints.chest.visible, true, 'body stays visible');
  model.setHeadVisible(true);
  assert.equal(model.joints.head.visible, true);
});

test('animator idle settles into a calm rest pose', () => {
  const { model, animator } = build();
  for (let i = 0; i < 90; i += 1) {
    animator.update({ state: 'idle', deltaSeconds: 1 / 60, speed: 0 });
  }
  assert.ok(Math.abs(model.joints.chest.rotation.x) < 0.06);
  assert.ok(Math.abs(model.joints.legL.rotation.x) < 0.08);
  assert.ok(Math.abs(model.joints.legR.rotation.x) < 0.08);
  assert.ok(Math.abs(model.joints.hips.position.y - CHARACTER_PROPORTIONS.hipY) < 0.02);
  assert.equal(model.root.rotation.x, 0);
});

test('animator walk/run cycles alternate legs with speed-scaled amplitude', () => {
  const { model, animator } = build();
  let maxSwingWalk = 0;
  let oppositeFound = false;
  for (let i = 0; i < 180; i += 1) {
    animator.update({ state: 'run', deltaSeconds: 1 / 60, speed: 3 });
    const l = model.joints.legL.rotation.x;
    const r = model.joints.legR.rotation.x;
    if (l * r < 0) oppositeFound = true;
    maxSwingWalk = Math.max(maxSwingWalk, Math.abs(l));
  }
  assert.ok(oppositeFound, 'legs alternate during walk');
  assert.ok(maxSwingWalk > 0.2, `walk swing amplitude ${maxSwingWalk.toFixed(2)}`);

  let maxSwingRun = 0;
  for (let i = 0; i < 180; i += 1) {
    animator.update({ state: 'run', deltaSeconds: 1 / 60, speed: 9 });
    maxSwingRun = Math.max(maxSwingRun, Math.abs(model.joints.legL.rotation.x));
  }
  assert.ok(maxSwingRun > maxSwingWalk * 1.15, `run amplitude ${maxSwingRun.toFixed(2)} exceeds walk ${maxSwingWalk.toFixed(2)}`);
  assert.ok(animator.getPhase() !== 0, 'locomotion phase advances');
});

test('animator sprint leans forward more than run', () => {
  const { model, animator } = build();
  for (let i = 0; i < 150; i += 1) animator.update({ state: 'run', deltaSeconds: 1 / 60, speed: 6 });
  const runLean = model.joints.chest.rotation.x;
  for (let i = 0; i < 150; i += 1) animator.update({ state: 'sprint', deltaSeconds: 1 / 60, speed: 11 });
  const sprintLean = model.joints.chest.rotation.x;
  assert.ok(sprintLean > runLean + 0.04, `sprint lean ${sprintLean.toFixed(3)} > run lean ${runLean.toFixed(3)}`);
});

test('animator crouch lowers the hips and bends the knees', () => {
  const { model, animator } = build();
  for (let i = 0; i < 120; i += 1) {
    animator.update({ state: 'crouch', deltaSeconds: 1 / 60, speed: 0 });
  }
  assert.ok(model.joints.hips.position.y < CHARACTER_PROPORTIONS.hipY - 0.25, `hips dropped to ${model.joints.hips.position.y.toFixed(3)}`);
  assert.ok(model.joints.kneeL.rotation.x < -0.8, `knees bent ${model.joints.kneeL.rotation.x.toFixed(2)}`);
  assert.ok(model.joints.hips.rotation.x > 0.3, 'torso leans forward while crouched');
  // Crouch-walk keeps the cycle on top of the crouch base.
  for (let i = 0; i < 90; i += 1) {
    animator.update({ state: 'crouch', deltaSeconds: 1 / 60, speed: 2.4 });
  }
  assert.ok(model.joints.hips.position.y < CHARACTER_PROPORTIONS.hipY - 0.25);
});

test('animator jump and fall poses differ and stay stable', () => {
  const { model, animator } = build();
  for (let i = 0; i < 60; i += 1) animator.update({ state: 'jump', deltaSeconds: 1 / 60, speed: 2, turnRate: 0 });
  const jumpKnee = model.joints.kneeL.rotation.x;
  const jumpShoulder = Math.abs(model.joints.shoulderL.rotation.z);
  for (let i = 0; i < 60; i += 1) animator.update({ state: 'fall', deltaSeconds: 1 / 60, speed: 2, turnRate: 0 });
  const fallShoulder = Math.abs(model.joints.shoulderL.rotation.z);
  assert.ok(jumpShoulder > 0.2, 'arms spread during jump');
  assert.ok(fallShoulder > jumpShoulder, 'arms spread wider while falling');
  assert.ok(Number.isFinite(jumpKnee));
});

test('landing impulse compresses the body then recovers', () => {
  const { model, animator } = build();
  for (let i = 0; i < 60; i += 1) animator.update({ state: 'idle', deltaSeconds: 1 / 60, speed: 0 });
  const baselineKnee = model.joints.kneeL.rotation.x;
  animator.notifyLanding(9);
  animator.update({ state: 'idle', deltaSeconds: 1 / 30, speed: 0 });
  const compressed = model.joints.kneeL.rotation.x;
  assert.ok(compressed < baselineKnee - 0.3, `landing compresses knees (${compressed.toFixed(2)} < ${baselineKnee.toFixed(2)})`);
  for (let i = 0; i < 120; i += 1) animator.update({ state: 'idle', deltaSeconds: 1 / 60, speed: 0 });
  assert.ok(Math.abs(model.joints.kneeL.rotation.x - baselineKnee) < 0.12, 'body recovers after landing');
});

test('death timeline tips the body onto its back and holds', () => {
  const { model, animator } = build();
  for (let i = 0; i < 30; i += 1) animator.update({ state: 'idle', deltaSeconds: 1 / 60, speed: 0 });
  for (let i = 0; i < 100; i += 1) animator.update({ state: 'dead', deltaSeconds: 1 / 60, speed: 0 });
  assert.ok(model.root.rotation.x > 1.3, `body tipped (rotation.x=${model.root.rotation.x.toFixed(2)})`);
  assert.ok(model.joints.hips.position.y < 0.5, 'body lies near the ground');
  const held = model.root.rotation.x;
  for (let i = 0; i < 60; i += 1) animator.update({ state: 'dead', deltaSeconds: 1 / 60, speed: 0 });
  assert.ok(Math.abs(model.root.rotation.x - held) < 0.01, 'death pose holds');
});

test('animator resets cleanly for respawn', () => {
  const { model, animator } = build();
  for (let i = 0; i < 100; i += 1) animator.update({ state: 'dead', deltaSeconds: 1 / 60, speed: 0 });
  animator.reset();
  assert.equal(model.root.rotation.x, 0);
  assert.ok(Math.abs(model.joints.hips.position.y - CHARACTER_PROPORTIONS.hipY) < 1e-6);
  assert.equal(animator.getPhase(), 0);
});

test('animator transitions are smooth with no popping', () => {
  const { model, animator } = build();
  let previousChest = 0;
  let previousHipsY: number = CHARACTER_PROPORTIONS.hipY;
  for (let i = 0; i < 400; i += 1) {
    const state = (['idle', 'run', 'crouch', 'fall', 'sprint', 'idle'] as const)[Math.floor(i / 60) % 6];
    animator.update({ state, deltaSeconds: 1 / 60, speed: state === 'idle' ? 0 : state === 'fall' ? 2 : 7 });
    const chest = model.joints.chest.rotation.x;
    const hipsY = model.joints.hips.position.y;
    assert.ok(Number.isFinite(chest) && Number.isFinite(hipsY), 'no NaN at any frame');
    assert.ok(Math.abs(chest - previousChest) < 0.2, `chest pose jumps by ${Math.abs(chest - previousChest).toFixed(3)} rad`);
    assert.ok(Math.abs(hipsY - previousHipsY) < 0.1, `hips jump by ${Math.abs(hipsY - previousHipsY).toFixed(3)}m`);
    previousChest = chest;
    previousHipsY = hipsY;
  }
});

test('turn lean responds to yaw rate without breaking limits', () => {
  const { model, animator } = build();
  for (let i = 0; i < 60; i += 1) animator.update({ state: 'run', deltaSeconds: 1 / 60, speed: 7, turnRate: 4 });
  assert.ok(model.joints.chest.rotation.z < -0.03, 'leans into the turn');
  for (let i = 0; i < 120; i += 1) animator.update({ state: 'run', deltaSeconds: 1 / 60, speed: 7, turnRate: 0 });
  assert.ok(Math.abs(model.joints.chest.rotation.z) < 0.02, 'lean recovers');
});
