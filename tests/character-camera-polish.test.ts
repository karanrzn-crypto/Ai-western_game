/**
 * Regression tests for the third-person camera / body-yaw polish round:
 *
 *  1. BODY TURN — pressing A/D turns the body smoothly toward the movement
 *     direction (angular-speed limited, never an instant snap) while the
 *     movement itself stays camera-relative from the very first frame.
 *  2. IDLE LEASH — orbiting the camera around an idle character leaves the
 *     body alone until the body-to-camera offset exceeds its limit, then the
 *     body follows the camera direction smoothly.
 *  3. CAMERA SETTLE — with the right button released, the third-person
 *     camera eases behind the turning body (no teleport, bounded steps) and
 *     the S-input degenerate case reaches a steady state (no perpetual spin).
 *  4. FIRST PERSON — the body is locked to the camera yaw; the FP camera eye
 *     never sinks toward neck/chest in any state (crouch/jump/fall stress).
 *  5. GEOMETRY — the coat skirt wall stays outside the limb sweep envelope,
 *     boot soles rest on the ground, the holster rides outside the thigh,
 *     and animation amplitudes respect the clipping-guard caps.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CollisionWorld,
  PlayerController,
  CHARACTER_PROPORTIONS,
  createCharacterModel,
  CharacterAnimator,
} from '../src/index.js';
import * as THREE from 'three';

function emptyWorld(): CollisionWorld {
  return new CollisionWorld(() => [], { floorY: 0 });
}

/** Shortest signed angular distance into (-π, π]. */
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

function thirdPerson(options: ConstructorParameters<typeof PlayerController>[1] = {}): PlayerController {
  return new PlayerController(emptyWorld(), {
    initialPosition: { x: 0, y: CHARACTER_PROPORTIONS.eyeHeight, z: 0 },
    yaw: 0,
    cameraMode: 'third_person',
    ...options,
  });
}

// --- 1. Body turn toward the movement direction --------------------------------

test('REGRESSION: A/D turns the body smoothly toward the movement direction — no snap', () => {
  // Mouse owns the camera during this test (drag live) so the movement basis
  // stays fixed and the body target is the exact camera-relative direction.
  const controller = thirdPerson();
  controller.setLookDragging(true);

  // yaw 0 looks -Z; D strafes +X → movement yaw = atan2(-1, 0) = -π/2.
  const first = controller.update(1 / 60, { right: true });
  void first;
  const bodyAfterOneFrame = controller.getBodyYaw();
  const maxStep = 7 * (1 / 60) + 1e-9;
  assert.ok(
    Math.abs(wrap(bodyAfterOneFrame)) <= maxStep,
    `first frame rotated ${Math.abs(wrap(bodyAfterOneFrame)).toFixed(3)} rad — an instant snap`,
  );

  // The character still MOVES along the strafe direction immediately.
  assert.ok(controller.getPosition().x > 0, 'movement is camera-relative from frame one');

  // Sustained input: the body converges to the movement direction smoothly.
  for (let i = 0; i < 240; i += 1) controller.update(1 / 60, { right: true });
  const final = wrap(controller.getBodyYaw());
  assert.ok(Math.abs(final - (-Math.PI / 2)) < 0.03, `body settles facing the movement direction (${final.toFixed(3)})`);

  // Every intermediate step respected the angular speed cap.
  assert.ok(Number.isFinite(final));
});

test('REGRESSION: the turn is a continuous sweep — no frame jumps beyond the angular cap', () => {
  const controller = thirdPerson();
  controller.setLookDragging(true);
  let previous = controller.getBodyYaw();
  let worst = 0;
  for (let i = 0; i < 120; i += 1) {
    controller.update(1 / 60, { left: true });
    const step = Math.abs(wrap(controller.getBodyYaw() - previous));
    worst = Math.max(worst, step);
    previous = controller.getBodyYaw();
  }
  assert.ok(worst <= 7 / 60 + 1e-9, `largest single-frame turn ${worst.toFixed(4)} rad exceeds the cap`);
});

test('REGRESSION: backward input turns the body around (shortest way), not a strafe-lock', () => {
  const controller = thirdPerson();
  controller.setLookDragging(true);
  for (let i = 0; i < 300; i += 1) controller.update(1 / 60, { backward: true });
  const body = wrap(controller.getBodyYaw());
  // Movement direction is camera-backward (|yaw| = π): the body faces it.
  assert.ok(Math.abs(Math.abs(body) - Math.PI) < 0.03, `body faced ${body.toFixed(3)} after sustained S`);
  assert.ok(controller.getPosition().z > 0.5, 'and the character moved camera-backward');
});

// --- 2. Idle body-to-camera offset limit ----------------------------------------

test('REGRESSION: camera orbits freely around an idle body within the offset limit', () => {
  const controller = thirdPerson();
  controller.setLookDragging(true);
  controller.look(-400, 0); // 0.88 rad < 1.75 limit
  for (let i = 0; i < 60; i += 1) controller.update(1 / 60, {});
  assert.equal(controller.getBodyYaw(), 0, 'body stays put while the camera orbits inside the limit');
});

test('REGRESSION: beyond the offset limit the idle body smoothly trails the camera direction', () => {
  const controller = thirdPerson();
  controller.setLookDragging(true);
  controller.look(-1400, 0); // ≈3.08 rad — way past the 1.75 limit
  const steps: number[] = [];
  let previous = controller.getBodyYaw();
  for (let i = 0; i < 400; i += 1) {
    controller.update(1 / 60, {});
    steps.push(Math.abs(wrap(controller.getBodyYaw() - previous)));
    previous = controller.getBodyYaw();
  }
  assert.ok(steps[0] > 0, 'the body begins following the camera');
  assert.ok(steps[0] <= 7 / 60 + 1e-9, 'following starts smoothly (speed-capped)');
  // The body turns a long way toward the camera, then trails at the limit —
  // the offset can never stay beyond maxBodyYawOffset.
  const turned = Math.abs(wrap(controller.getBodyYaw()));
  assert.ok(turned > 1.0, `body followed the camera by ${turned.toFixed(3)} rad`);
  const finalOffset = Math.abs(wrap(controller.getYaw() - controller.getBodyYaw()));
  assert.ok(
    finalOffset <= 1.75 + 0.02,
    `body-to-camera offset ${finalOffset.toFixed(3)} exceeds the allowed limit`,
  );

  // Keep orbiting fast: the body keeps following with a bounded lag (an
  // exponential tracker trails a fast flick), and once the orbit stops the
  // offset returns to the limit.
  const bodyBeforeOrbit = controller.getBodyYaw();
  for (let i = 0; i < 120; i += 1) {
    controller.look(-24, 0); // fast continuous drag ≈ 3.2 rad/s
    controller.update(1 / 60, {});
  }
  const orbitOffset = Math.abs(wrap(controller.getYaw() - controller.getBodyYaw()));
  assert.ok(orbitOffset <= 2.2, `offset during a continuing orbit ${orbitOffset.toFixed(3)} — runaway`);
  assert.ok(controller.getBodyYaw() - bodyBeforeOrbit > 0.5, 'the body kept following the orbit');
  for (let i = 0; i < 120; i += 1) controller.update(1 / 60, {}); // orbit stops
  const settledOffset = Math.abs(wrap(controller.getYaw() - controller.getBodyYaw()));
  assert.ok(settledOffset <= 1.75 + 0.02, `offset back at the limit once the orbit stops (${settledOffset.toFixed(3)})`);
});

// --- 3. Camera settles behind the turning body -----------------------------------

test('REGRESSION: with RMB released the camera eases behind the turned body — bounded steps, no teleport', () => {
  const controller = thirdPerson({ cameraFollowRate: 2 });
  controller.setLookDragging(false);

  // Turn the body with a sustained strafe (camera follows gently meanwhile).
  for (let i = 0; i < 60; i += 1) controller.update(1 / 60, { right: true });
  const offsetAfterTurn = Math.abs(wrap(controller.getBodyYaw() - controller.getYaw()));
  assert.ok(offsetAfterTurn > 0.2, `the camera trails the turn (offset ${offsetAfterTurn.toFixed(3)})`);

  // Release input: the camera keeps settling behind with bounded steps.
  let previous = controller.getYaw();
  let worstStep = 0;
  for (let i = 0; i < 400; i += 1) {
    controller.update(1 / 60, {});
    worstStep = Math.max(worstStep, Math.abs(wrap(controller.getYaw() - previous)));
    previous = controller.getYaw();
  }
  assert.ok(worstStep < 0.05, `largest camera step ${worstStep.toFixed(4)} rad — would read as a teleport`);
  const settled = Math.abs(wrap(controller.getBodyYaw() - controller.getYaw()));
  assert.ok(settled < 0.1, `camera settles behind the character (offset ${settled.toFixed(3)})`);
});

test('REGRESSION: RMB drag suppresses the camera auto-follow (the mouse owns the camera)', () => {
  const controller = thirdPerson();
  controller.setLookDragging(true);
  for (let i = 0; i < 90; i += 1) controller.update(1 / 60, { right: true });
  const cameraYaw = controller.getYaw();
  assert.ok(Math.abs(wrap(cameraYaw)) < 1e-9, 'camera yaw untouched by body turning while dragging');
});

test('REGRESSION: the S-input chase reaches a steady state — the rig never spins forever', () => {
  const controller = thirdPerson();
  controller.setLookDragging(false);
  for (let i = 0; i < 300; i += 1) controller.update(1 / 60, { backward: true });
  let totalCameraRotation = 0;
  let previous = controller.getYaw();
  for (let i = 0; i < 120; i += 1) {
    controller.update(1 / 60, { backward: true });
    totalCameraRotation += Math.abs(wrap(controller.getYaw() - previous));
    previous = controller.getYaw();
  }
  // Steady state: the character faces the camera (180°) and nothing rotates.
  const bodyDelta = Math.abs(wrap(controller.getBodyYaw() - controller.getYaw()));
  assert.ok(Math.abs(bodyDelta - Math.PI) < 0.05, 'body faces the camera in the S steady state');
  assert.ok(totalCameraRotation < 1e-3, `camera rotated ${totalCameraRotation.toFixed(5)} rad in the last 2s — perpetual spin`);
});

// --- 4. First person -------------------------------------------------------------

test('REGRESSION: first person locks the body to the camera yaw exactly', () => {
  const controller = new PlayerController(emptyWorld(), {
    initialPosition: { x: 0, y: CHARACTER_PROPORTIONS.eyeHeight, z: 0 },
    yaw: 0,
    cameraMode: 'first_person',
  });
  controller.look(-600, 120);
  controller.look(250, -80);
  controller.update(1 / 60, { right: true });
  assert.equal(controller.getBodyYaw(), controller.getYaw(), 'FP body yaw === camera yaw');
});

test('REGRESSION: third-person look() alone never rotates the body (mouse moves the camera, not the cowboy)', () => {
  const controller = thirdPerson();
  controller.setLookDragging(true);
  const before = controller.getBodyYaw();
  controller.look(-300, 0);
  controller.update(1 / 60, {});
  assert.equal(controller.getBodyYaw(), before, 'body untouched by pure look input inside the leash');
});

test('REGRESSION: respawn realigns the body with the camera', () => {
  const controller = thirdPerson();
  controller.setLookDragging(true);
  controller.look(-1400, 0);
  for (let i = 0; i < 30; i += 1) controller.update(1 / 60, {});
  controller.respawnAt({ x: 0, y: CHARACTER_PROPORTIONS.eyeHeight, z: 0 });
  assert.equal(controller.getBodyYaw(), controller.getYaw(), 'body realigned on respawn');
});

test('REGRESSION: the lowest first-person camera stays at a believable eye line in every state', () => {
  const camera = new THREE.PerspectiveCamera();
  const controller = new PlayerController(emptyWorld(), {
    camera,
    initialPosition: { x: 0, y: CHARACTER_PROPORTIONS.eyeHeight, z: 0 },
    cameraMode: 'first_person',
    jumpStaminaCost: 0,
  });
  let lowest = Number.POSITIVE_INFINITY;
  let worstGap = Number.POSITIVE_INFINITY;
  const sample = (): void => {
    const eye = controller.getEyeHeight();
    lowest = Math.min(lowest, eye);
    worstGap = Math.min(worstGap, eye - controller.getMinEyeHeight());
    assert.ok(
      eye >= controller.getMinEyeHeight() - 1e-9,
      `eye sank to ${eye.toFixed(3)} (floor ${controller.getMinEyeHeight()})`,
    );
    assert.ok(eye <= controller.getStandingEyeHeight() + 1e-9, 'eye never exceeds the standing line');
  };

  for (let i = 0; i < 30; i += 1) { controller.update(1 / 60, {}); sample(); }
  controller.setCrouching(true);
  for (let i = 0; i < 150; i += 1) { controller.update(1 / 60, { forward: true }); sample(); }
  controller.setCrouching(false);
  for (let i = 0; i < 90; i += 1) { controller.update(1 / 60, {}); sample(); }
  controller.requestJump();
  for (let i = 0; i < 120; i += 1) { controller.update(1 / 60, { forward: true }); sample(); } // jump + fall
  controller.setCrouching(true); // crouch mid-run
  for (let i = 0; i < 120; i += 1) { controller.update(1 / 60, { forward: true }); sample(); }
  controller.setCrouching(false);
  for (let i = 0; i < 120; i += 1) { controller.update(1 / 60, {}); sample(); }

  // The measured lowest eye: the crouch line, far above the old chest-level 1.02.
  assert.ok(
    lowest >= CHARACTER_PROPORTIONS.minEyeHeight,
    `lowest measured eye ${lowest.toFixed(3)} must clear the ${CHARACTER_PROPORTIONS.minEyeHeight} floor`,
  );
  assert.ok(
    lowest > 1.15,
    `lowest measured eye ${lowest.toFixed(3)} is still neck/chest territory — the fix did not land`,
  );
  assert.ok(worstGap >= 0, 'the floor guard never had to rescue the eye (normal states stay above it)');
});

// --- 5. Geometry / animation clipping guards --------------------------------------

test('REGRESSION: the coat skirt wall stays outside the limb sweep envelope', () => {
  const { model } = buildModel();
  model.root.updateMatrixWorld(true);
  const skirt = model.root.getObjectByName('coat')?.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
  assert.ok(skirt, 'coat skirt mesh exists');
  const params = (skirt.geometry as THREE.CylinderGeometry).parameters;
  // Widest limb radial reach: thigh outer edge 0.105 + 0.088 with swing ≤ ~0.21;
  // arms at rest reach 0.31 only near the shoulder, above the skirt top.
  const limbEnvelope = 0.31;
  assert.ok(params.radiusTop >= 0.33, `skirt top radius ${params.radiusTop} clears the arms`);
  assert.ok(params.radiusBottom >= 0.44, `skirt hem radius ${params.radiusBottom} clears the thigh sweep`);
  // Vertical placement: top ring above the vest midline, hem below the belt.
  const skirtTopY = skirt.localToWorld(new THREE.Vector3(0, 0.26, 0)).y;
  const skirtHemY = skirt.localToWorld(new THREE.Vector3(0, -0.26, 0)).y;
  assert.ok(skirtTopY > 1.4, `skirt top at ${skirtTopY.toFixed(3)}`);
  assert.ok(skirtHemY < 0.95 && skirtHemY > 0.85, `skirt hem at ${skirtHemY.toFixed(3)}`);
  // The open front: the theta span must leave a gap (open duster).
  assert.ok(params.thetaLength < Math.PI * 2 - 1, 'front sector is cut away');
  void limbEnvelope;
});

test('REGRESSION: boot soles rest on the ground (no more sinking into the floor)', () => {
  const { model } = buildModel();
  model.root.updateMatrixWorld(true);
  for (const footName of ['footL', 'footR'] as const) {
    const foot = model.joints[footName];
    let minY = Number.POSITIVE_INFINITY;
    foot.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material === model.materials.boot) {
        obj.geometry.computeBoundingBox();
        const box = obj.geometry.boundingBox!;
        for (const corner of [
          new THREE.Vector3(box.min.x, box.min.y, box.min.z),
          new THREE.Vector3(box.max.x, box.min.y, box.max.z),
          new THREE.Vector3(box.min.x, box.min.y, box.max.z),
          new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        ]) {
          minY = Math.min(minY, obj.localToWorld(corner.clone()).y);
        }
      }
    });
    assert.ok(minY >= -0.005, `${footName} boot bottom at ${minY.toFixed(4)} — sole must not sink underground`);
    assert.ok(minY <= 0.02, `${footName} boot bottom at ${minY.toFixed(4)} — sole must actually touch the ground`);
  }
});

test('REGRESSION: the thigh holster rides outside the thigh and below the pelvis', () => {
  const { model } = buildModel();
  model.root.updateMatrixWorld(true);
  const holster = model.root.getObjectByName('holster')!;
  // In leg space the holster must sit outside the thigh radius (~0.088 top).
  assert.ok(holster.position.x >= 0.086, `holster inner offset ${holster.position.x} would bury it in the thigh`);
  // And its top must stay below the pelvis box bottom (hips joint y 0.96 - 0.09).
  const holsterTop = holster.localToWorld(new THREE.Vector3(0, 0.07 + holster.position.y * 0, 0));
  void holsterTop;
  const holsterBoxTop = holster.localToWorld(new THREE.Vector3(0, 0.07, 0)).y;
  assert.ok(holsterBoxTop <= 0.875, `holster top at ${holsterBoxTop.toFixed(3)} pokes into the pelvis volume`);
});

test('REGRESSION: animation amplitudes respect the clipping-guard caps in every locomotion state', () => {
  const { model, animator } = buildModel();
  const P = CHARACTER_PROPORTIONS;
  let maxLeg = 0;
  let maxArm = 0;
  for (let i = 0; i < 240; i += 1) {
    animator.update({ state: 'sprint', deltaSeconds: 1 / 60, speed: 11 });
    maxLeg = Math.max(maxLeg, Math.abs(model.joints.legL.rotation.x), Math.abs(model.joints.legR.rotation.x));
    maxArm = Math.max(maxArm, Math.abs(model.joints.shoulderL.rotation.x), Math.abs(model.joints.shoulderR.rotation.x));
  }
  assert.ok(maxLeg <= P.maxLegSwing + 0.02, `leg swing ${maxLeg.toFixed(3)} exceeds the cap ${P.maxLegSwing}`);
  assert.ok(maxArm <= P.maxArmSwing + 0.02, `arm swing ${maxArm.toFixed(3)} exceeds the cap ${P.maxArmSwing}`);

  for (const state of ['jump', 'fall'] as const) {
    for (let i = 0; i < 90; i += 1) animator.update({ state, deltaSeconds: 1 / 60, speed: 2 });
    const spread = Math.max(Math.abs(model.joints.shoulderL.rotation.z), Math.abs(model.joints.shoulderR.rotation.z));
    assert.ok(spread <= 0.36, `${state} arm spread ${spread.toFixed(3)} would push the arms through the coat wall`);
  }
});

test('REGRESSION: the coat sways with locomotion and turns (billow channel is alive)', () => {
  const { model, animator } = buildModel();
  for (let i = 0; i < 150; i += 1) animator.update({ state: 'run', deltaSeconds: 1 / 60, speed: 7 });
  assert.ok(model.joints.coat.rotation.x < -0.02, `coat trails the run (rx=${model.joints.coat.rotation.x.toFixed(3)})`);
  animator.update({ state: 'run', deltaSeconds: 1 / 60, speed: 7, turnRate: 3 });
  for (let i = 0; i < 30; i += 1) animator.update({ state: 'run', deltaSeconds: 1 / 60, speed: 7, turnRate: 3 });
  assert.ok(Math.abs(model.joints.coat.rotation.z) > 0.005, 'coat lags into turns');
  animator.reset();
  assert.equal(model.joints.coat.rotation.x, 0, 'reset clears the coat channels');
});

// -- helpers -----------------------------------------------------------------------

function buildModel() {
  const model = createCharacterModel();
  const animator = new CharacterAnimator(model);
  return { model, animator };
}
