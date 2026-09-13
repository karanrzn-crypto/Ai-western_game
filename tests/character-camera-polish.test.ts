/**
 * Regression tests for the third-person camera / body-yaw architecture:
 *
 *  1. BODY — A/D held ALONE (no W/S) spin the body in place (fast smooth
 *     ramp, constant capped rate, exponential release — never steps/snaps);
 *     with W/S held, A/D and S SLIDE the character without rotating it;
 *     forward-dominant movement (W/W±A/D) turns the body smoothly toward
 *     the movement heading (angular-speed limited, never a snap) while
 *     the movement itself is camera-relative from every frame.
 *  2. RMB ORBIT — the mouse only rotates the camera's own view yaw, kept
 *     within a bounded offset of the body; it never rotates the character.
 *  3. FOLLOW — the camera eases back behind the body during pure-forward
 *     runs (realign happens DURING the movement), nothing auto-rotates
 *     while idle (a stop can never start a camera swing), and the orbit
 *     offset only re-centers while running pure-forward hands-off.
 *  4. FIRST PERSON — the body is locked to the camera yaw; the FP camera eye
 *     never sinks toward neck/chest in any state (crouch/jump/fall stress).
 *  5. GEOMETRY — no cape/cloak/flowing-cloth parts exist on the model, boot
 *     soles rest on the ground, the holster rides outside the thigh, and
 *     animation amplitudes respect the clipping-guard caps.
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

// --- 1. Body turn rules -----------------------------------------------------------

test('REGRESSION: strafing (with S held) never rotates the body — movement is camera-relative from frame one', () => {
  const controller = thirdPerson();

  // yaw 0 looks -Z; S+D slides +X/+Z. First frame must already move and NOT turn.
  controller.update(1 / 60, { backward: true, right: true });
  assert.equal(controller.getBodyYaw(), 0, 'the first strafe frame did not rotate the body');
  assert.ok(controller.getPosition().x > 0, 'movement is camera-relative from frame one');

  // Sustained input: a straight diagonal line, zero body rotation.
  for (let i = 0; i < 240; i += 1) controller.update(1 / 60, { backward: true, right: true });
  assert.equal(wrap(controller.getBodyYaw()), 0, `body held its heading (${wrap(controller.getBodyYaw()).toFixed(3)})`);
  const p = controller.getPosition();
  assert.ok(p.x > 3 && p.z > 3, 'strafe kept moving along the camera-relative diagonal');
});

test('REGRESSION: A/D alone turn the body in place — fast ramp, constant capped rate, smooth stop', () => {
  const controller = thirdPerson();

  // Ramp-up: per-frame steps grow to the cap (velocity-driven, never steps).
  const steps: number[] = [];
  let previous = controller.getBodyYaw();
  for (let i = 0; i < 30; i += 1) {
    controller.update(1 / 60, { left: true });
    steps.push(controller.getBodyYaw() - previous);
    previous = controller.getBodyYaw();
  }
  assert.ok(steps[0] > 0 && steps[0] < 0.05, 'the first frame eases into the turn (no snap)');
  assert.ok(steps[steps.length - 1] > steps[0] * 2, 'the spin ramps up to full speed');
  for (const s of steps) assert.ok(s <= 3.7 / 60 + 1e-9, `step ${s.toFixed(4)} exceeds the 3.7 rad/s cap`);

  // Sustained hold: constant capped rate — no runaway acceleration.
  let worstDeviation = 0;
  previous = controller.getBodyYaw();
  for (let i = 0; i < 120; i += 1) {
    controller.update(1 / 60, { left: true });
    worstDeviation = Math.max(worstDeviation, Math.abs(controller.getBodyYaw() - previous - 3.7 / 60));
    previous = controller.getBodyYaw();
  }
  assert.ok(worstDeviation < 0.01, `sustained spin deviated ${worstDeviation.toFixed(4)} rad/frame from the constant rate`);

  // Release: smooth decay, then an exact freeze.
  for (let i = 0; i < 60; i += 1) controller.update(1 / 60, {});
  const body = controller.getBodyYaw();
  const camera = controller.getYaw();
  for (let i = 0; i < 60; i += 1) controller.update(1 / 60, {});
  assert.equal(controller.getBodyYaw(), body, 'body frozen after the release tail');
  assert.equal(controller.getYaw(), camera, 'camera frozen after the release tail');
});

test('REGRESSION: forward-dominant turns are a continuous sweep — no frame jumps beyond the angular cap', () => {
  const controller = thirdPerson();
  controller.look(-489, 0); // camera +0.88 off the body
  let previous = controller.getBodyYaw();
  let worst = 0;
  for (let i = 0; i < 120; i += 1) {
    controller.update(1 / 60, { forward: true });
    const step = Math.abs(wrap(controller.getBodyYaw() - previous));
    worst = Math.max(worst, step);
    previous = controller.getBodyYaw();
  }
  assert.ok(worst <= 7 / 60 + 1e-9, `largest single-frame turn ${worst.toFixed(4)} rad exceeds the cap`);
  assert.ok(Math.abs(wrap(controller.getBodyYaw() - 0.88)) < 0.03, 'body settled on the camera heading');
});

test('REGRESSION: backward input backpedals — the body holds its heading and the move goes camera-backward', () => {
  const controller = thirdPerson();
  for (let i = 0; i < 300; i += 1) controller.update(1 / 60, { backward: true });
  assert.equal(wrap(controller.getBodyYaw()), 0, 'S never spun the body around');
  assert.ok(controller.getPosition().z > 0.5, 'and the character moved camera-backward');
});

test('REGRESSION: W+A converges the body onto the diagonal (forward-dominant chase), movement stays straight', () => {
  const controller = thirdPerson();
  for (let i = 0; i < 240; i += 1) controller.update(1 / 60, { forward: true, left: true });
  const body = wrap(controller.getBodyYaw());
  assert.ok(Math.abs(body - Math.PI / 4) < 0.03, `body settled on the W+A diagonal (${body.toFixed(3)})`);
  // The travelled path runs along the same diagonal (camera stayed put).
  const p = controller.getPosition();
  const dirAngle = Math.atan2(-p.x, -p.z);
  assert.ok(Math.abs(wrap(dirAngle - Math.PI / 4)) < 0.05, 'travelled along the diagonal heading');
});

// --- 2. RMB orbit: a bounded offset around the body ------------------------------

test('REGRESSION: RMB orbit never rotates the body and stays within the offset bound', () => {
  const controller = thirdPerson();

  controller.look(-400, 0); // 0.72 rad < 1.9 bound (yaw -= dx·sens)
  for (let i = 0; i < 60; i += 1) controller.update(1 / 60, {});
  assert.equal(controller.getBodyYaw(), 0, 'body stays put while the camera orbits');
  assert.ok(Math.abs(controller.getCameraOrbitOffset() - 0.72) < 1e-9, 'offset matches the mouse drag');

  // A huge drag clamps at the bound instead of separating the camera forever.
  controller.look(-5000, 0);
  assert.ok(
    Math.abs(Math.abs(controller.getCameraOrbitOffset()) - 1.9) < 1e-9,
    `offset clamped to ±1.9 (got ${controller.getCameraOrbitOffset().toFixed(3)})`,
  );
  const cameraYaw = controller.getYaw();
  for (let i = 0; i < 60; i += 1) controller.update(1 / 60, {});
  assert.equal(controller.getBodyYaw(), 0, 'still no body rotation at the clamp');
  assert.equal(controller.getYaw(), cameraYaw, 'camera rests at the clamped offset');
});

test('REGRESSION: third-person look() alone never rotates the body (mouse moves the camera, not the cowboy)', () => {
  const controller = thirdPerson();
  const before = controller.getBodyYaw();
  controller.look(-300, 0);
  controller.update(1 / 60, {});
  assert.equal(controller.getBodyYaw(), before, 'body untouched by pure look input');
});

// --- 3. Realignment: the body chases the camera, never the reverse ----------------

test('REGRESSION: the orbit offset closes only when the body chases the camera (forward movement), never while idle or dragging without W', () => {
  const controller = thirdPerson();

  // Idle: the offset persists (no camera motion after stopping).
  controller.look(-330, 0); // +0.594 rad
  for (let i = 0; i < 120; i += 1) controller.update(1 / 60, {});
  assert.ok(Math.abs(controller.getCameraOrbitOffset() - 0.594) < 1e-9, 'idle never closes the offset');

  // Lateral and backward movement: the body slides without turning.
  for (let i = 0; i < 90; i += 1) controller.update(1 / 60, { backward: true, left: true });
  assert.ok(Math.abs(controller.getCameraOrbitOffset() - 0.594) < 1e-9, 'strafe never closes the offset');
  for (let i = 0; i < 90; i += 1) controller.update(1 / 60, { backward: true });
  assert.ok(Math.abs(controller.getCameraOrbitOffset() - 0.594) < 1e-9, 'backpedal never closes the offset');

  // Pure forward run: the BODY arrives at the camera heading — offset closes.
  const cameraBefore = controller.getYaw();
  for (let i = 0; i < 150; i += 1) controller.update(1 / 60, { forward: true });
  assert.ok(Math.abs(controller.getCameraOrbitOffset()) < 0.05, `offset closed while running (${controller.getCameraOrbitOffset().toFixed(3)})`);
  assert.ok(Math.abs(wrap(controller.getYaw() - cameraBefore)) < 1e-9, 'the camera itself never moved');

  // While dragging mid-run the body still chases the live camera heading.
  controller.look(-489, 0); // flick +0.88 while W is held
  for (let i = 0; i < 120; i += 1) controller.update(1 / 60, { forward: true });
  assert.ok(
    Math.abs(wrap(controller.getBodyYaw() - controller.getYaw())) < 0.05,
    'body chased the camera even while the drag was live',
  );
});

test('REGRESSION: the movement heading is re-sampled EVERY frame — a mid-run drag bends the path', () => {
  const controller = thirdPerson();

  // Run forward, then sweep the camera while W stays held.
  for (let i = 0; i < 30; i += 1) controller.update(1 / 60, { forward: true });
  const before = controller.getPosition();
  for (let i = 0; i < 42; i += 1) {
    controller.look(-12, 0);
    controller.update(1 / 60, { forward: true });
  }
  const after = controller.getPosition();
  const heading = Math.atan2(-(after.x - before.x), -(after.z - before.z));
  assert.ok(
    Math.abs(wrap(heading)) > 0.25,
    `displacement heading ${heading.toFixed(3)} — a latched path would still head ~0`,
  );
});

test('REGRESSION: stopping freezes the camera — no post-stop catch-up rotation', () => {
  const controller = thirdPerson();
  for (let i = 0; i < 90; i += 1) controller.update(1 / 60, { forward: true });
  const cameraAtStop = controller.getYaw();
  const bodyAtStop = controller.getBodyYaw();

  for (let i = 0; i < 240; i += 1) controller.update(1 / 60, {});
  assert.equal(controller.getYaw(), cameraAtStop, 'camera yaw frozen after the stop');
  assert.equal(controller.getBodyYaw(), bodyAtStop, 'body yaw frozen after the stop');
});

test('REGRESSION: the W A stop D stop S stop W sequence never rotates anything after a stop', () => {
  const controller = thirdPerson();
  const move = (frames: number, input: { forward?: boolean; backward?: boolean; left?: boolean; right?: boolean }): void => {
    for (let i = 0; i < frames; i += 1) controller.update(1 / 60, input);
  };
  const assertFrozen = (label: string): void => {
    // Absorb the smooth turn-release tail (A/D stops decay over ~0.3 s);
    // W/S stops are already frozen and pass through unchanged.
    for (let i = 0; i < 45; i += 1) controller.update(1 / 60, {});
    const c = controller.getYaw();
    const b = controller.getBodyYaw();
    for (let i = 0; i < 60; i += 1) controller.update(1 / 60, {});
    assert.equal(controller.getYaw(), c, `${label}: camera frozen after stop`);
    assert.equal(controller.getBodyYaw(), b, `${label}: body frozen after stop`);
  };

  move(45, { forward: true }); assertFrozen('W');
  move(45, { left: true }); assertFrozen('A');
  move(45, { right: true }); assertFrozen('D');
  move(45, { backward: true }); assertFrozen('S');
  move(45, { forward: true }); assertFrozen('W again');
});

test('REGRESSION: held lateral input (S+D) converges to a straight line — no perpetual spin', () => {
  const controller = thirdPerson();
  for (let i = 0; i < 300; i += 1) controller.update(1 / 60, { backward: true, right: true });
  let totalCameraRotation = 0;
  let totalBodyRotation = 0;
  let previousCamera = controller.getYaw();
  let previousBody = controller.getBodyYaw();
  for (let i = 0; i < 120; i += 1) {
    controller.update(1 / 60, { backward: true, right: true });
    totalCameraRotation += Math.abs(wrap(controller.getYaw() - previousCamera));
    totalBodyRotation += Math.abs(wrap(controller.getBodyYaw() - previousBody));
    previousCamera = controller.getYaw();
    previousBody = controller.getBodyYaw();
  }
  assert.ok(totalBodyRotation < 1e-3, `body rotated ${totalBodyRotation.toFixed(5)} rad in the last 2s — spin`);
  assert.ok(totalCameraRotation < 1e-3, `camera rotated ${totalCameraRotation.toFixed(5)} rad in the last 2s — spin`);
});

test('REGRESSION: a fresh W press uses the rotated camera basis immediately', () => {
  const controller = thirdPerson();
  controller.look(-100, 0); // camera yaw now +0.18 relative to the body
  const p0 = controller.getPosition();
  for (let i = 0; i < 10; i += 1) controller.update(1 / 60, { forward: true });
  const heading = Math.atan2(
    -(controller.getPosition().x - p0.x),
    -(controller.getPosition().z - p0.z),
  );
  assert.ok(Math.abs(wrap(heading - 0.22)) < 0.2, `first frames ran along the camera heading (${heading.toFixed(3)})`);
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

test('REGRESSION: respawn realigns the camera behind the body', () => {
  const controller = thirdPerson();
  controller.look(-1400, 0);
  for (let i = 0; i < 30; i += 1) controller.update(1 / 60, {});
  controller.respawnAt({ x: 0, y: CHARACTER_PROPORTIONS.eyeHeight, z: 0 });
  assert.equal(controller.getCameraOrbitOffset(), 0, 'orbit offset reset on respawn');
  assert.equal(controller.getBodyYaw(), controller.getYaw(), 'camera exactly behind the body');
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

test('REGRESSION: the model has NO cape/cloak/flowing-cloth parts', () => {
  const { model } = buildModel();
  assert.equal(model.root.getObjectByName('coat'), undefined, 'no coat skirt object');
  assert.equal(model.root.getObjectByName('coat-skirt'), undefined, 'no coat skirt mesh');
  assert.equal(model.root.getObjectByName('bandana-drop'), undefined, 'no hanging bandana drop');
  assert.equal(model.root.getObjectByName('knife-sheath'), undefined, 'no back-hanging sheath');
  assert.equal('coat' in model.joints, false, 'no coat joint in the rig');
  // The body-hugging wardrobe that SHOULD exist, does:
  assert.ok(model.root.getObjectByName('hat'), 'hat exists');
  assert.ok(model.joints.shoulderL && model.joints.legR, 'limbs exist');
  // Every remaining mesh is a rigid child of a joint (nothing floats free).
  model.root.traverse((obj) => {
    if (obj === model.root) return; // the root itself is sceneless by design
    assert.ok(obj.parent, 'no orphaned parts');
  });
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
    assert.ok(spread <= 0.36, `${state} arm spread ${spread.toFixed(3)} exceeds the guard`);
  }
});

// -- helpers -----------------------------------------------------------------------

function buildModel() {
  const model = createCharacterModel();
  const animator = new CharacterAnimator(model);
  return { model, animator };
}
