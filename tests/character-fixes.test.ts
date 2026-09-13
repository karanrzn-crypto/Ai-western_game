/**
 * Regression tests for the Part-2 character review fixes:
 *
 *  1. MOVEMENT — the reported "character doesn't move" bug: input gated by
 *     the enabled flag must reach the controller and drive it (the demo now
 *     enables input whenever play mode is active).
 *  2. Camera-relative WASD in both camera modes.
 *  3. MouseLookController — camera rotation ONLY on right-button drag.
 *  4. Eye height single source + crouch eye + min eye floor.
 *  5. Jump stamina cost.
 *  6. Camera mode toggle is single-step and presentation-only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CollisionWorld,
  InputBindings,
  MouseLookController,
  MOUSE_LOOK_BUTTON,
  PlayerController,
  StaminaSystem,
  CHARACTER_PROPORTIONS,
} from '../src/index.js';
import * as THREE from 'three';
import { ThirdPersonCamera } from '../src/index.js';

function emptyWorld(): CollisionWorld {
  return new CollisionWorld(() => [], { floorY: 0 });
}

// --- 1. The reported movement bug --------------------------------------------

test('REGRESSION: disabled input keeps the character still; play-mode-enabled input moves it', () => {
  // The original bug: the game booted in play mode with InputBindings
  // disabled, so WASD never reached the controller. The wiring contract:
  // play mode => enabled, edit mode => disabled.
  const bindings = new InputBindings();
  const controller = new PlayerController(emptyWorld(), { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: 0 });

  // Boot state of the old build: play mode active, input disabled.
  bindings.setEnabled(false);
  assert.deepEqual(bindings.getMoveInput(), { forward: false, backward: false, left: false, right: false, sprint: false });
  const frozen = controller.getPosition().z;
  controller.update(1, bindings.getMoveInput());
  assert.equal(controller.getPosition().z, frozen, 'disabled input never moves the player');

  // Fixed boot state: play mode => input enabled (applyModeState at boot).
  bindings.setEnabled(true);
  bindings.bind('forward', 'KeyW');
  // Simulate the key lifecycle through the public action surface.
  (bindings as unknown as { downCodes: Set<string> }).downCodes.add('KeyW');
  const move = bindings.getMoveInput();
  assert.equal(move.forward, true, 'W reaches the action map once enabled');

  let z = controller.getPosition().z;
  for (let i = 0; i < 20; i += 1) {
    controller.update(1 / 30, bindings.getMoveInput());
    z = controller.getPosition().z;
  }
  assert.ok(z < -1, `character walks forward with W held (z=${z.toFixed(2)})`);
});

test('REGRESSION: WASD moves along the CAMERA forward (yaw-relative), both camera modes', () => {
  const world = emptyWorld();
  // yaw = 0 looks down -Z: W must decrease z.
  const facingNorth = new PlayerController(world, { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: 0 });
  facingNorth.update(0.25, { forward: true });
  const north = facingNorth.getPosition();
  assert.ok(north.z < -0.5 && Math.abs(north.x) < 1e-6, 'W goes -Z at yaw 0');

  // yaw = +PI/2 (turn left 90°) looks down -X: W must decrease x, NOT z.
  const facingWest = new PlayerController(emptyWorld(), { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: Math.PI / 2 });
  facingWest.update(0.25, { forward: true });
  const west = facingWest.getPosition();
  assert.ok(west.x < -0.5 && Math.abs(west.z) < 1e-6, 'W follows the rotated camera forward');

  // Strafe: D moves along camera-right. At yaw 0 right = +X.
  const strafing = new PlayerController(emptyWorld(), { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: 0 });
  strafing.update(0.25, { right: true });
  const strafed = strafing.getPosition();
  assert.ok(strafed.x > 0.5 && Math.abs(strafed.z) < 1e-6, 'D strafes along camera right');

  // Mode must not matter: movement math is presentation-agnostic.
  const fp = new PlayerController(emptyWorld(), { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: 0, cameraMode: 'first_person' });
  fp.update(0.25, { forward: true });
  assert.ok(fp.getPosition().z < -0.5, 'first person W identical');
});

// --- 2. MouseLookController — right-button-only camera drag -------------------

test('MouseLookController: camera rotates ONLY on right-button drag', () => {
  const look = new MouseLookController();

  // LEFT button never starts a drag; mouse movement stays inert.
  assert.equal(look.beginDrag(0, 100, 100), false, 'left click cannot start look');
  assert.equal(look.isDragging, false);
  look.updateMove(140, 80);
  assert.deepEqual(look.consumeLookDelta(), { x: 0, y: 0 }, 'no rotation without right button');

  // MIDDLE button too.
  assert.equal(look.beginDrag(1, 100, 100), false);

  // RIGHT button starts; deltas accumulate; consume returns and resets.
  assert.equal(look.beginDrag(MOUSE_LOOK_BUTTON, 100, 100), true);
  assert.equal(look.isDragging, true);
  look.updateMove(140, 80);   // +40, -20
  look.updateMove(160, 60);   // +20, -20
  const delta = look.consumeLookDelta();
  assert.deepEqual(delta, { x: 60, y: -40 });
  assert.deepEqual(look.consumeLookDelta(), { x: 0, y: 0 }, 'consume resets the accumulator');

  // Release stops NEW accumulation immediately, and the pixels dragged while
  // the button was held still apply once (a flick must not lose its motion).
  look.updateMove(170, 50);   // +10, -10 while still held
  assert.equal(look.endDrag(MOUSE_LOOK_BUTTON), true);
  assert.equal(look.isDragging, false);
  assert.deepEqual(look.consumeLookDelta(), { x: 10, y: -10 }, 'final flick segment survives the release');
  assert.deepEqual(look.consumeLookDelta(), { x: 0, y: 0 }, 'then the camera is frozen');
  look.updateMove(300, 300);
  assert.deepEqual(look.consumeLookDelta(), { x: 0, y: 0 }, 'released right button = camera frozen');

  // A left click DURING an active right drag must not end it.
  look.beginDrag(MOUSE_LOOK_BUTTON, 0, 0);
  look.endDrag(0); // left goes up mid-drag
  assert.equal(look.isDragging, true, 'left-button release does not stop the right-drag');
  look.endDrag(MOUSE_LOOK_BUTTON);
  assert.equal(look.isDragging, false);

  // A fresh drag never emits a jump from stale coordinates.
  look.beginDrag(MOUSE_LOOK_BUTTON, 500, 500);
  assert.deepEqual(look.consumeLookDelta(), { x: 0, y: 0 }, 'first frame of a drag is jump-free');
  look.cancel();
});

test('MouseLookController: pointer lock state is irrelevant to the rules', () => {
  // The controller has no pointer-lock API by design; the demo may be locked
  // through any path — without beginDrag(right) nothing rotates.
  const look = new MouseLookController();
  look.updateMove(120, 60); // pointer locked and moving, but no right-drag
  assert.deepEqual(look.consumeLookDelta(), { x: 0, y: 0 });
  // Cancel drops pending deltas (mode switch / window blur).
  look.beginDrag(MOUSE_LOOK_BUTTON, 0, 0);
  look.updateMove(50, 25);
  look.cancel();
  assert.equal(look.isDragging, false);
  assert.deepEqual(look.consumeLookDelta(), { x: 0, y: 0 }, 'cancel discards unapplied deltas');
});

// --- 3. Eye height single source ----------------------------------------------

test('Camera eye heights come from ONE source with explicit crouch eye and a hard floor', () => {
  // Defaults derive from CharacterProportions (the single source of truth).
  const defaults = new PlayerController(emptyWorld(), {});
  assert.equal(defaults.getStandingEyeHeight(), CHARACTER_PROPORTIONS.eyeHeight);
  assert.equal(defaults.getCrouchEyeHeight(), CHARACTER_PROPORTIONS.crouchEyeHeight);
  assert.equal(defaults.getMinEyeHeight(), CHARACTER_PROPORTIONS.minEyeHeight);
  assert.ok(defaults.getCrouchEyeHeight() < defaults.getStandingEyeHeight());
  assert.ok(defaults.getMinEyeHeight() <= defaults.getCrouchEyeHeight());

  // Explicit crouch eye wins over the legacy factor.
  const explicit = new PlayerController(emptyWorld(), { crouchEyeHeight: 1.05 });
  assert.equal(explicit.getCrouchEyeHeight(), 1.05);

  // Legacy factor still honoured when no explicit height is given.
  const factorized = new PlayerController(emptyWorld(), { eyeHeight: 2.0, crouchEyeFactor: 0.5 });
  assert.equal(factorized.getCrouchEyeHeight(), 1.0);

  // The floor can never exceed the crouch eye (crouch must stay usable).
  const guarded = new PlayerController(emptyWorld(), { minEyeHeight: 5 });
  assert.equal(guarded.getMinEyeHeight(), guarded.getCrouchEyeHeight());
});

test('Crouch lowers the eye to the configured crouch height; the camera never sinks below the floor', () => {
  const controller = new PlayerController(emptyWorld(), {
    initialPosition: { x: 0, y: CHARACTER_PROPORTIONS.eyeHeight, z: 0 },
    crouchEyeHeight: CHARACTER_PROPORTIONS.crouchEyeHeight,
    minEyeHeight: CHARACTER_PROPORTIONS.minEyeHeight,
  });
  controller.update(5, {}); // settle + fully blend down... (standing: stays at stand eye)
  assert.ok(Math.abs(controller.getEyeHeight() - CHARACTER_PROPORTIONS.eyeHeight) < 0.01, 'standing eye');

  controller.setCrouching(true);
  for (let i = 0; i < 200; i += 1) controller.update(1 / 30, {});
  assert.ok(
    Math.abs(controller.getEyeHeight() - CHARACTER_PROPORTIONS.crouchEyeHeight) < 0.01,
    `crouch eye reaches the configured height (${controller.getEyeHeight().toFixed(3)})`,
  );
  assert.ok(controller.getEyeHeight() >= controller.getMinEyeHeight(), 'eye never below the floor');
});

test('First-person camera sits at feet + eye height (never neck/chest), third person defers to the rig', () => {
  const camera = new THREE.PerspectiveCamera();
  const world = emptyWorld();
  const controller = new PlayerController(world, {
    camera,
    initialPosition: { x: 2, y: CHARACTER_PROPORTIONS.eyeHeight, z: 5 },
    cameraMode: 'first_person',
  });
  camera.updateMatrixWorld();
  const feetY = controller.getFeetPosition().y;
  assert.ok(
    Math.abs(camera.position.y - (feetY + controller.getEyeHeight())) < 1e-6,
    `FP camera at eye height (${camera.position.y.toFixed(3)})`,
  );
  assert.ok(camera.position.y - feetY >= controller.getMinEyeHeight(), 'FP camera above the eye floor');

  // Switching to third person WITHOUT a rig: built-in orbit still frames the
  // character from behind (never inside the head).
  controller.setCameraMode('third_person');
  assert.ok(camera.position.distanceTo(new THREE.Vector3(2, camera.position.y, 5)) > 3, 'TP camera pulled back');
});

// --- 4. Jump stamina cost ------------------------------------------------------

test('Jump costs stamina; a jump the pool cannot afford is denied', () => {
  const world = emptyWorld();
  const stamina = new StaminaSystem({ max: 100 });
  const controller = new PlayerController(world, {
    initialPosition: { x: 0, y: 1.7, z: 0 },
    stamina,
    jumpStaminaCost: 10,
  });

  // Denial: drain below the cost first.
  stamina.update(0, false);
  (stamina as unknown as { currentStamina: number }).currentStamina = 9;
  assert.equal(controller.requestJump(), false, 'jump denied when stamina < cost');

  // Affordable jump pays exactly the cost when it leaves the ground.
  (stamina as unknown as { currentStamina: number }).currentStamina = 55;
  assert.equal(controller.requestJump(), true);
  assert.equal(stamina.current, 55, 'cost is paid on the jump, not on the request');
  controller.update(1 / 60);
  assert.ok(controller.getVerticalVelocity() > 0, 'airborne');
  assert.equal(stamina.current, 45, 'exactly 10 stamina spent on the jump');

  // Cost 0 (or no stamina system) keeps jumps free.
  const free = new PlayerController(emptyWorld(), { initialPosition: { x: 0, y: 1.7, z: 0 }, stamina, jumpStaminaCost: 0 });
  (stamina as unknown as { currentStamina: number }).currentStamina = 3;
  assert.equal(free.requestJump(), true, 'zero cost never denies');
  free.update(1 / 60);
  assert.equal(stamina.current, 3, 'zero cost spends nothing');
});

test('StaminaSystem.spend delays regen and engages the sprint lock on the threshold', () => {
  const stamina = new StaminaSystem({ max: 100, lockThreshold: 5, recoverThreshold: 30 });
  stamina.spend(97);
  assert.equal(stamina.current, 3);
  assert.equal(stamina.isSprintLocked, true, 'spending into the lock threshold locks sprint');
  stamina.reset();
  stamina.spend(10);
  assert.equal(stamina.current, 90);
  // Regen delayed by the spend (effort clock reset).
  stamina.update(0.4, false);
  assert.equal(stamina.current, 90, 'no regen inside the delay window');
  stamina.update(0.5, false);
  assert.ok(stamina.current > 90, 'regen resumes after the delay');
});

// --- 5. Camera mode toggle: single-step, presentation-only ---------------------

class SpyRig extends ThirdPersonCamera {
  snapCount = 0;
  snap(): void {
    this.snapCount += 1;
    super.snap();
  }
}

test('REGRESSION: camera mode toggles exactly once per action and never moves the player', () => {
  const camera = new THREE.PerspectiveCamera();
  const rig = new SpyRig(camera, null);
  const controller = new PlayerController(emptyWorld(), {
    camera,
    initialPosition: { x: 0, y: 1.7, z: 0 },
    yaw: 0,
    cameraMode: 'third_person',
  });
  controller.setThirdPersonRig(rig);

  // The old bug: two independent code paths toggled per keypress and V never
  // switched. Contract now: one toggle = one switch.
  assert.equal(controller.toggleCameraMode(), 'first_person');
  assert.equal(controller.toggleCameraMode(), 'third_person');
  assert.equal(rig.snapCount, 1, 'rig snaps exactly when re-entering third person');

  // Presentation-only: toggling must not teleport the player or reset motion.
  const before = controller.getPosition();
  controller.update(1 / 60, { forward: true });
  const during = controller.getPosition();
  controller.toggleCameraMode();
  controller.update(1 / 60, { forward: true });
  const after = controller.getPosition();
  assert.ok(Math.abs(after.x - during.x) < 1e-6, 'mode switch does not touch x');
  assert.ok(after.z < during.z, 'movement continues seamlessly through a mode switch');
  assert.deepEqual(before.x, 0);
});

test('Movement and camera stay coupled: WASD follows the RMB-rotated camera', () => {
  // The gameplay loop contract: look (yaw change) then move — the movement
  // direction must reflect the NEW camera yaw on the same frame.
  const controller = new PlayerController(emptyWorld(), { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: 0 });
  controller.look(-100, 0); // RMB drag of 100px to the right...
  controller.update(0.25, { forward: true }); // ...W on the same frame
  const pos = controller.getPosition();
  // yaw -= 100 * 0.0018 => yaw = -0.18 => forward turns toward -X side.
  assert.ok(pos.x < -0.05, `W follows the freshly rotated camera (x=${pos.x.toFixed(3)})`);
  assert.ok(pos.z < 0, 'and still moves forward');
});
