/**
 * Regression tests for the player-yaw / camera-yaw contract requested in the
 * movement-and-camera rework:
 *
 *   1. The camera has NO independent yaw: camera yaw ≡ body yaw + orbit
 *      offset, re-derived every frame (player and camera turn together).
 *   2. S behaves exactly as specified: press → target changes immediately →
 *      the body smoothly follows → the camera follows the body DURING the
 *      same update → after the stop NOTHING keeps rotating.
 *   3. Diagonal input (W+A, W+D, S+A, S+D) uses the normalized camera-relative
 *      vector — one heading computed from `dir`, never per-key rotations.
 *   4. RMB orbit works ON the body (bounded offset), not as a free yaw.
 *   5. First person keeps classic view-relative movement and look.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CollisionWorld, PlayerController, CHARACTER_PROPORTIONS } from '../src/index.js';

function emptyWorld(): CollisionWorld {
  return new CollisionWorld(() => [], { floorY: 0 });
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

function thirdPerson(options: ConstructorParameters<typeof PlayerController>[1] = {}): PlayerController {
  return new PlayerController(emptyWorld(), {
    initialPosition: { x: 0, y: CHARACTER_PROPORTIONS.eyeHeight, z: 0 },
    yaw: 0,
    cameraMode: 'third_person',
    ...options,
  });
}

test('CONTRACT: the camera never owns a yaw — it is body yaw + orbit offset, always', () => {
  const controller = thirdPerson();
  controller.setLookDragging(true);
  const inputs = [
    { forward: true }, { right: true }, { backward: true }, { left: true },
    { forward: true, right: true }, { backward: true, left: true }, {},
  ] as const;
  for (let i = 0; i < 400; i += 1) {
    if (i % 17 === 0) controller.look(-33, 5);
    if (i % 23 === 0) controller.look(51, -2);
    controller.update(1 / 60, inputs[i % inputs.length]);
    const derived = controller.getBodyYaw() + controller.getCameraOrbitOffset();
    assert.ok(
      Math.abs(wrap(controller.getYaw() - derived)) < 1e-9,
      `frame ${i}: camera yaw diverged from body yaw + offset`,
    );
  }
});

test('CONTRACT: S flow — press, immediate retarget, smooth body, camera follows in the same update', () => {
  const controller = thirdPerson();

  // 1. S pressed → targetYaw changes on THIS frame (the body starts turning).
  controller.update(1 / 60, { backward: true });
  const firstBodyStep = Math.abs(wrap(controller.getBodyYaw() - 0));
  assert.ok(firstBodyStep > 0 && firstBodyStep <= 7 / 60 + 1e-9);

  // 2. The camera yaw updated during the SAME update (no waiting).
  assert.equal(wrap(controller.getYaw() - controller.getBodyYaw()), 0);

  // 3. The body converges to the movement heading (camera-backward at press).
  for (let i = 0; i < 150; i += 1) controller.update(1 / 60, { backward: true });
  assert.ok(Math.abs(Math.abs(wrap(controller.getBodyYaw())) - Math.PI) < 0.03);
  // 4. …and the camera arrived WITH it: the offset is back at zero.
  assert.ok(Math.abs(controller.getCameraOrbitOffset()) < 1e-3);

  // 5. W after the S-turn: no late, sudden rotation for either of them.
  const c0 = controller.getYaw();
  const b0 = controller.getBodyYaw();
  controller.update(1 / 60, { forward: true });
  assert.ok(Math.abs(wrap(controller.getYaw() - c0)) < 7 / 60 + 1e-9, 'camera step bounded');
  assert.ok(Math.abs(wrap(controller.getBodyYaw() - b0)) <= 7 / 60 + 1e-9, 'body step bounded');
});

test('CONTRACT: after every stop the camera and body stay frozen (no catch-up system exists)', () => {
  const controller = thirdPerson();
  const stops: Array<{ forward?: boolean; backward?: boolean; left?: boolean; right?: boolean }> = [
    { forward: true }, { left: true }, { right: true }, { backward: true },
  ];
  for (const input of stops) {
    for (let i = 0; i < 40; i += 1) controller.update(1 / 60, input);
    const c = controller.getYaw();
    const b = controller.getBodyYaw();
    for (let i = 0; i < 90; i += 1) controller.update(1 / 60, {});
    assert.equal(controller.getYaw(), c, 'camera frozen at stop');
    assert.equal(controller.getBodyYaw(), b, 'body frozen at stop');
  }
});

test('CONTRACT: diagonals produce the exact normalized camera-relative heading', () => {
  const cases: Array<{ input: { forward?: boolean; backward?: boolean; left?: boolean; right?: boolean }; heading: number }> = [
    // Camera yaw 0 looks -Z; right is +X.
    { input: { forward: true, right: true }, heading: -Math.PI / 4 },        // W+D → (-Z, +X)/√2
    { input: { forward: true, left: true }, heading: Math.PI / 4 },          // W+A
    { input: { backward: true, right: true }, heading: -3 * Math.PI / 4 },   // S+D
    { input: { backward: true, left: true }, heading: 3 * Math.PI / 4 },     // S+A
  ];
  for (const { input, heading } of cases) {
    const controller = thirdPerson();
    for (let i = 0; i < 240; i += 1) controller.update(1 / 60, input);
    const body = wrap(controller.getBodyYaw());
    assert.ok(
      Math.abs(wrap(body - heading)) < 0.03,
      `input ${JSON.stringify(input)} → body ${body.toFixed(3)}, expected ${heading.toFixed(3)}`,
    );
    // The movement itself ran along the same diagonal (world-space check).
    const p = controller.getPosition();
    const travelled = Math.hypot(p.x, p.z);
    assert.ok(travelled > 3, 'diagonal input actually moved the character');
    const dirAngle = Math.atan2(-p.x, -p.z);
    assert.ok(Math.abs(wrap(dirAngle - heading)) < 0.05, 'travelled along the diagonal heading');
  }
});

test('CONTRACT: RMB orbit rotates the camera AROUND the body — bounded, body untouched', () => {
  const controller = thirdPerson();
  controller.setLookDragging(true);

  // A long drag saturates the bound instead of orbiting forever.
  controller.look(900, 0); // yaw -= dx·sens → offset sweeps to the - bound
  assert.equal(controller.getCameraOrbitOffset(), -1.9);
  // Dragging back the other way (in realistic per-frame amounts) recovers and
  // saturates at the opposite bound — still bounded, body untouched.
  for (let i = 0; i < 900; i += 1) controller.look(-6, 0); // ≈ +11.9 rad total
  assert.equal(controller.getCameraOrbitOffset(), 1.9);
  assert.equal(controller.getBodyYaw(), 0, 'the mouse never spun the character');

  // The camera position math (built-in orbit) follows the derived yaw.
  const camera = new THREE.PerspectiveCamera();
  const orbit = new PlayerController(emptyWorld(), {
    camera,
    initialPosition: { x: 0, y: CHARACTER_PROPORTIONS.eyeHeight, z: 0 },
    yaw: 0,
    cameraMode: 'third_person',
  });
  for (let i = 0; i < 900; i += 1) orbit.look(6, 0); // saturate at -1.9
  orbit.update(1 / 60, {});
  // The camera's horizontal offset direction matches the clamped yaw exactly.
  const angle = Math.atan2(camera.position.x, camera.position.z);
  assert.ok(
    Math.abs(wrap(angle - (-1.9))) < 1e-6,
    `camera orbited to the clamped yaw (angle=${angle.toFixed(3)})`,
  );
  assert.ok(
    Math.abs(Math.hypot(camera.position.x, camera.position.z) - 5.5) < 1e-6,
    'camera stays at its orbit distance',
  );
});

test('CONTRACT: first-person look and movement keep classic behaviour', () => {
  const controller = new PlayerController(emptyWorld(), {
    initialPosition: { x: 0, y: 1.7, z: 0 },
    yaw: 0,
    cameraMode: 'first_person',
  });
  controller.look(-Math.PI / 2 / 0.0022, 0); // turn the view 90° left
  assert.equal(controller.getBodyYaw(), controller.getYaw(), 'body IS the camera in FP');
  for (let i = 0; i < 30; i += 1) controller.update(1 / 60, { forward: true });
  const p = controller.getPosition();
  assert.ok(p.x < -0.5 && Math.abs(p.z) < 0.5, 'W runs along the rotated view');
});

test('CONTRACT: crouch toggle flips the flag and nothing else (no extra state)', () => {
  const controller = thirdPerson();
  assert.equal(controller.isCrouching(), false);
  assert.equal(controller.toggleCrouch(), true);
  assert.equal(controller.isCrouching(), true);
  assert.equal(controller.toggleCrouch(), false);
  assert.equal(controller.isCrouching(), false);
  // Toggling never moves or turns the character.
  const p = controller.getPosition();
  assert.equal(p.x, 0);
  assert.equal(controller.getBodyYaw(), controller.getYaw());
});
