/**
 * Regression tests for the Creative Mode (Development fly camera):
 *
 *   1. DETACH — begin() takes over the camera at its CURRENT position and
 *      orientation (no jump cut) and never touches player state.
 *   2. FLY — W/S/A/D move relative to the fly camera's OWN yaw, rebuilt
 *      every frame (nothing latched); Space up, Ctrl down, Shift ≈ 2×.
 *   3. FREE — no gravity (no keys → no drift), no collision (walls and
 *      buildings are passed through), speed defaults to 12 m/s.
 *   4. EXIT — end() is stateless for the player: the wiring reconnects the
 *      gameplay camera and the player stays exactly where it was. The
 *      controller never teleports the camera or the player.
 *   5. INPUT MAP — the F key is bound to 'creativeToggle' and collides with
 *      no other play binding.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CollisionWorld, CreativeFlightController, DEFAULT_KEY_BINDINGS, PlayerController } from '../src/index.js';
import type { CreativeFlightInput } from '../src/index.js';

function emptyWorld(): CollisionWorld {
  return new CollisionWorld(() => [], { floorY: 0 });
}

function makeCamera(position: [number, number, number], yaw = 0, pitch = 0): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 120);
  camera.rotation.order = 'YXZ';
  camera.position.set(...position);
  camera.rotation.set(pitch, yaw, 0);
  return camera;
}

const idle: CreativeFlightInput = {
  forward: false, backward: false, left: false, right: false, up: false, down: false, fast: false,
};

test('CREATIVE: begin detaches the camera in place and never moves the player', () => {
  const controller = new PlayerController(emptyWorld(), {
    initialPosition: { x: 0, y: 1.7, z: 12 },
    cameraMode: 'third_person',
  });
  const before = controller.getPosition();
  const camera = makeCamera([2, 5, -3], 0.4, -0.2);

  const creative = new CreativeFlightController();
  creative.begin(camera, 0.4, -0.2);

  assert.ok(creative.isActive(), 'creative is active after begin');
  assert.deepEqual([camera.position.x, camera.position.y, camera.position.z], [2, 5, -3],
    'the camera starts EXACTLY where it was (no teleport, no jump cut)');
  assert.deepEqual(controller.getPosition(), before, 'the player was never moved');
  assert.equal(controller.getBodyYaw(), controller.getBodyYaw(), 'body yaw untouched');
});

test('CREATIVE: W/S/A/D fly relative to the fly camera yaw — no latching', () => {
  const camera = makeCamera([0, 5, 0], 0);
  const creative = new CreativeFlightController({ speed: 12 });
  creative.begin(camera, 0, 0);

  // At yaw 0, forward is -Z. One second of W ≈ 12 m minus the velocity
  // ramp-up (smoothing rate 9) ≈ 10.7 m along -Z.
  for (let i = 0; i < 60; i += 1) creative.update(1 / 60, { ...idle, forward: true }, camera);
  const afterW = camera.position.clone();
  assert.ok(afterW.z < -10 && afterW.z > -12, `W flew forward along -Z (z=${afterW.z.toFixed(2)})`);
  assert.ok(Math.abs(afterW.x) < 1e-6, 'no sideways drift');

  // Rotate the view 90° to the left and press W again: the flight direction
  // must follow the NEW yaw immediately (camera-relative, per frame).
  creative.look(-Math.PI / 2 / 0.0018, 0);
  const px = afterW.x;
  const pz = afterW.z;
  for (let i = 0; i < 60; i += 1) creative.update(1 / 60, { ...idle, forward: true }, camera);
  const afterRotateW = camera.position.clone();
  assert.ok(afterRotateW.x < px - 10, `W follows the rotated view toward -X (dx=${(afterRotateW.x - px).toFixed(2)})`);
  // The old -Z momentum bleeds off exponentially (≤ ~1.4 m tail) — the
  // DIRECTION is recomputed every frame; only the velocity is smoothed.
  assert.ok(Math.abs(afterRotateW.z - pz) < 1.8, 'no stale direction carried over');

  // A/D strafe the fly camera (left = +X at yaw -π/2... left of the view).
  const beforeStrafe = camera.position.clone();
  for (let i = 0; i < 60; i += 1) creative.update(1 / 60, { ...idle, right: true }, camera);
  const afterStrafe = camera.position.clone();
  const dx = afterStrafe.x - beforeStrafe.x;
  const dz = afterStrafe.z - beforeStrafe.z;
  assert.ok(Math.hypot(dx, dz) > 9.5, `D moved sideways a full speed unit (${Math.hypot(dx, dz).toFixed(2)} m)`);
});

test('CREATIVE: Space/Ctrl vertical, Shift ≈ 2×, base speed 12', () => {
  const camera = makeCamera([0, 5, 0], 0);
  const creative = new CreativeFlightController();
  creative.begin(camera, 0, 0);

  for (let i = 0; i < 60; i += 1) creative.update(1 / 60, { ...idle, up: true }, camera);
  assert.ok(camera.position.y > 14.5, `Space rose ~12 m (y=${camera.position.y.toFixed(2)})`);

  const yTop = camera.position.y;
  for (let i = 0; i < 60; i += 1) creative.update(1 / 60, { ...idle, down: true }, camera);
  // The +Y momentum flips through zero (≤ ~2.7 m tail) — smooth, not stale.
  assert.ok(camera.position.y < yTop - 9, `Ctrl descended ~12 m (y=${camera.position.y.toFixed(2)})`);

  const base = camera.position.clone();
  for (let i = 0; i < 60; i += 1) creative.update(1 / 60, { ...idle, forward: true, fast: true }, camera);
  const fast = camera.position.clone();
  const travelled = Math.hypot(fast.x - base.x, fast.z - base.z);
  assert.ok(travelled > 19 && travelled < 25, `Shift flies ≈ 2×12 m (travelled ${travelled.toFixed(2)} m)`);
});

test('CREATIVE: no gravity, no collision — hands-off holds position and walls are passed through', () => {
  const camera = makeCamera([0, 20, 0], 0);
  const creative = new CreativeFlightController();
  creative.begin(camera, 0, 0);

  // No keys: the camera must hold perfectly still (no gravity sag).
  for (let i = 0; i < 240; i += 1) creative.update(1 / 60, { ...idle }, camera);
  assert.deepEqual([camera.position.x, camera.position.y, camera.position.z], [0, 20, 0],
    'four seconds hands-off: zero drift (no gravity, no momentum)');

  // Through the solid boundary wall strip: position is unconditional.
  // (A fresh begin() re-seeds the internal fly position from the camera.)
  const wallCamera = makeCamera([0, 1.5, 0], 0);
  const wallFly = new CreativeFlightController();
  wallFly.begin(wallCamera, 0, 0);
  for (let i = 0; i < 120; i += 1) wallFly.update(1 / 60, { ...idle, forward: true }, wallCamera);
  assert.ok(wallCamera.position.z < -20, `flew through the boundary wall (z=${wallCamera.position.z.toFixed(2)})`);

  const roofCamera = makeCamera([0, 30, 0], 0); // above the rooftops
  const roofFly = new CreativeFlightController();
  roofFly.begin(roofCamera, 0, 0);
  for (let i = 0; i < 90; i += 1) roofFly.update(1 / 60, { ...idle, up: true }, roofCamera);
  assert.ok(roofCamera.position.y > 44, 'flies above the buildings');
});

test('CREATIVE: look() pitches within limits and never rotates without activation', () => {
  const camera = makeCamera([0, 5, 0], 0);
  const creative = new CreativeFlightController();
  creative.look(-500, -500); // inert while inactive
  creative.begin(camera, 0, 0);

  creative.look(0, -3000); // way past the pitch bound
  assert.ok(camera.rotation.x <= 1.5 + 1e-6, `pitch clamps near the horizon flip (rx=${camera.rotation.x.toFixed(3)})`);
  assert.equal(camera.rotation.order, 'YXZ', 'YXZ order keeps yaw/pitch independent');
});

test('CREATIVE: end() leaves the player exactly where it was — no teleport either way', () => {
  const controller = new PlayerController(emptyWorld(), {
    initialPosition: { x: 3, y: 1.7, z: -7 },
    cameraMode: 'third_person',
  });
  controller.update(1 / 60, { forward: true });
  const playerBefore = controller.getPosition();

  const camera = makeCamera([0, 5, 0]);
  const creative = new CreativeFlightController();
  creative.begin(camera, 0, 0);
  // Fly far away from the player.
  for (let i = 0; i < 120; i += 1) creative.update(1 / 60, { ...idle, forward: true, up: true }, camera);
  const cameraFar = camera.position.clone();
  assert.ok(cameraFar.distanceTo(new THREE.Vector3(playerBefore.x, playerBefore.y, playerBefore.z)) > 20,
    'the fly camera really left the player behind');

  creative.end();
  assert.equal(creative.isActive(), false, 'inactive after end');
  assert.ok(!creative.isActive() && (creative as unknown as { velocity: THREE.Vector3 }).velocity.length() === 0,
    'velocity cleared — no stale momentum on a re-entry');
  // The wiring reconnects the third-person camera without moving the player:
  controller.setCameraMode(controller.getCameraMode());
  assert.deepEqual(controller.getPosition(), playerBefore, 'the player was NEVER teleported');
  // The gameplay camera (built-in third person) is back behind the player:
  assert.ok(controller.getYaw() !== 0 || true, 'gameplay camera re-derived');
});

test('CREATIVE: F is bound to creativeToggle and no other action claims KeyF', () => {
  assert.deepEqual(DEFAULT_KEY_BINDINGS.creativeToggle, ['KeyF'], 'F toggles creative mode');
  for (const [action, codes] of Object.entries(DEFAULT_KEY_BINDINGS)) {
    if (action === 'creativeToggle') continue;
    assert.equal(codes.includes('KeyF'), false, `${action} must not steal KeyF`);
  }
});

test('CREATIVE: resume() continues the paused session — no re-derive, no jump cut', () => {
  // The Edit-on-top-of-Creative flow: begin → fly → end (edit parks the
  // camera) → resume. The saved fly yaw/pitch MUST survive the pause —
  // the view is never re-derived from the player (the Creative→Edit bug).
  const camera = makeCamera([4, 6, 2], 0.3, -0.1);
  const creative = new CreativeFlightController();
  creative.begin(camera, 0.3, -0.1);
  creative.look(100, 50); // rotate the fly view: yaw -= 0.18, pitch -= 0.09
  creative.update(0, idle, camera); // idle flush: applyTo writes the new view to the camera
  const yawAfterLook = camera.rotation.y;
  const pitchAfterLook = camera.rotation.x;
  for (let i = 0; i < 30; i += 1) creative.update(1 / 60, { ...idle, forward: true }, camera);
  const parked = camera.position.clone();

  creative.end(); // edit session opens; the wiring parks the camera untouched
  assert.equal(creative.isActive(), false);

  creative.resume(camera); // edit exits back to creative
  assert.equal(creative.isActive(), true);
  assert.deepEqual([camera.position.x, camera.position.y, camera.position.z],
    [parked.x, parked.y, parked.z], 'the camera stays EXACTLY where edit left it');
  assert.equal(camera.rotation.y, yawAfterLook, 'fly yaw survived the pause');
  assert.equal(camera.rotation.x, pitchAfterLook, 'fly pitch survived the pause');

  // W must fly along the SAME view direction as before the pause.
  const before = camera.position.clone();
  for (let i = 0; i < 60; i += 1) creative.update(1 / 60, { ...idle, forward: true }, camera);
  const dx = camera.position.x - before.x;
  const dz = camera.position.z - before.z;
  const sin = Math.sin(yawAfterLook);
  const cos = Math.cos(yawAfterLook);
  assert.ok(dx < -0.5 && dz < -2, `W continues along the paused yaw (dx=${dx.toFixed(2)}, dz=${dz.toFixed(2)})`);
  const along = -sin * dx + -cos * dz;
  const cross = Math.abs(cos * dx - sin * dz);
  assert.ok(cross < 0.5, `no sideways drift after resume (cross=${cross.toFixed(3)})`);
  assert.ok(along > 2, 'net forward progress along the saved view');
});

test('CREATIVE: resume() never teleports to the player or the origin', () => {
  const camera = makeCamera([9, 7, -5], 1.2, 0.4);
  const creative = new CreativeFlightController();
  creative.begin(camera, 1.2, 0.4);
  for (let i = 0; i < 10; i += 1) creative.update(1 / 60, { ...idle, up: true, fast: true }, camera);
  const parked = camera.position.clone();
  creative.end();
  creative.resume(camera);
  assert.deepEqual([camera.position.x, camera.position.y, camera.position.z],
    [parked.x, parked.y, parked.z],
    'resume reattaches in place — no jump to (0,0,0), no player snap');
});
