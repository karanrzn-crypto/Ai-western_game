/**
 * Regression tests for the BODY / HEAD / CAMERA movement contract:
 *
 *   1. CAMERA — an independent view yaw, kept within a bounded orbit offset
 *      of the body. RMB drags rotate it in real time and NEVER rotate the
 *      character; the offset can never exceed the bound.
 *   2. MOVEMENT — recomputed EVERY frame from the CURRENT camera basis.
 *      Rotating the camera changes where W/A/S/D carry the player on the
 *      very next frame. Nothing is latched, cached or held until a stop.
 *   3. BODY — A/D held ALONE (no W/S) spin the body in place: dt-driven,
 *      continuous rotation with a fast exponential ramp-up, a constant
 *      capped rate and a smooth exponential release (no per-press step,
 *      no snap, no jerk, no overshoot). With W/S held, A/D stay strafe:
 *      forward-dominant movement (W) turns the body toward the movement
 *      heading (exponential + angular-speed cap); S±A/D slide the body
 *      without rotating it. Velocity always blends (accel/brake), never
 *      snaps — W→S passes through zero smoothly.
 *   4. FOLLOW — during pure-forward runs with the mouse hands-off the
 *      camera eases back behind the body DURING the movement. Idle frames
 *      and lateral/backward moves never rotate anything, so a stop can
 *      never start a camera swing.
 *   5. HEAD — the gaze layer: clamp(normalizeAngle(cameraYaw - bodyYaw),
 *      ±maxHeadYaw) and a clamped fraction of the camera pitch, smoothed
 *      every frame. 0 in first person and while dead.
 *   6. FIRST PERSON — classic view-relative movement and look.
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

/** Heading of the displacement between two positions (atan2 convention). */
const travelHeading = (from: { x: number; z: number }, to: { x: number; z: number }): number =>
  Math.atan2(-(to.x - from.x), -(to.z - from.z));

// --- 1. Camera: independent, bounded, never spins the body ---------------------

test('CONTRACT: RMB orbit rotates the camera in real time, bounded around the body, body untouched', () => {
  const controller = thirdPerson();

  // A long drag saturates the bound instead of orbiting forever.
  controller.look(1100, 0); // yaw -= dx·sens → −1.98 rad → clamps to the - bound
  assert.equal(controller.getCameraOrbitOffset(), -1.9);
  // Dragging back the other way recovers and saturates at the opposite bound.
  for (let i = 0; i < 900; i += 1) controller.look(-6, 0); // ≈ +9.7 rad total
  assert.equal(controller.getCameraOrbitOffset(), 1.9);
  assert.equal(controller.getBodyYaw(), 0, 'the mouse never spun the character');

  // The camera position math (built-in orbit) follows the camera yaw.
  const camera = new THREE.PerspectiveCamera();
  const orbit = new PlayerController(emptyWorld(), {
    camera,
    initialPosition: { x: 0, y: CHARACTER_PROPORTIONS.eyeHeight, z: 0 },
    yaw: 0,
    cameraMode: 'third_person',
  });
  for (let i = 0; i < 900; i += 1) orbit.look(6, 0); // saturate at -1.9
  orbit.update(1 / 60, {});
  const angle = Math.atan2(camera.position.x, camera.position.z);
  assert.ok(Math.abs(wrap(angle - (-1.9))) < 1e-6, `camera orbited to the clamped yaw (angle=${angle.toFixed(3)})`);
  assert.ok(
    Math.abs(Math.hypot(camera.position.x, camera.position.z) - 5.5) < 1e-6,
    'camera stays at its orbit distance',
  );
});

test('CONTRACT: the camera stays within the orbit bound at every frame of a chaotic session', () => {
  const controller = thirdPerson();
  // A chaotic session: orbit, move, release, move again…
  const script: Array<Parameters<PlayerController['update']>[1]> = [
    { forward: true }, { forward: true }, { right: true }, { right: true }, {},
    { backward: true }, { left: true }, {}, { forward: true, left: true },
  ];
  for (let i = 0; i < 270; i += 1) {
    if (i % 30 === 0) controller.look(-40, 3); // RMB flicks mid-session
    controller.update(1 / 60, script[i % script.length]);
    const offset = controller.getCameraOrbitOffset();
    assert.ok(Math.abs(offset) <= 1.9 + 1e-9, `offset ${offset.toFixed(3)} exceeded the bound at frame ${i}`);
    assert.ok(
      Math.abs(wrap(controller.getYaw() - controller.getBodyYaw()) - offset) < 1e-9,
      'getCameraOrbitOffset() is exactly normalizeAngle(cameraYaw - bodyYaw)',
    );
  }
});

test('CONTRACT: third-person look() alone never rotates the body (mouse moves the camera, not the cowboy)', () => {
  const controller = thirdPerson();
  const before = controller.getBodyYaw();
  controller.look(-300, 0);
  controller.update(1 / 60, {});
  assert.equal(controller.getBodyYaw(), before, 'body untouched by pure look input');
});

// --- 2. Movement: camera-relative EVERY frame ----------------------------------

test('CONTRACT: W after rotating the camera moves along the NEW camera forward immediately', () => {
  const controller = thirdPerson();
  controller.look(-489, 0); // camera yaw now +0.88 rad relative to the body

  // From rest, the very first movement frames head along the rotated view.
  const p0 = controller.getPosition();
  for (let i = 0; i < 6; i += 1) controller.update(1 / 60, { forward: true });
  const heading = travelHeading(p0, controller.getPosition());
  assert.ok(Math.abs(wrap(heading - 0.88)) < 0.15, `first frames ran along ${heading.toFixed(3)}, expected ~0.88`);

  // The body then turns smoothly toward the camera heading (never a snap).
  for (let i = 0; i < 150; i += 1) controller.update(1 / 60, { forward: true });
  assert.ok(Math.abs(wrap(controller.getBodyYaw() - 0.88)) < 0.03, 'body converged to the camera heading');
  assert.ok(Math.abs(controller.getCameraOrbitOffset()) < 0.05, 'camera settled behind the body during the run');
});

test('CONTRACT: holding W while dragging the camera bends the run continuously (no latch)', () => {
  const controller = thirdPerson();
  const frames = 30;

  // Baseline: run forward along -Z.
  for (let i = 0; i < frames; i += 1) controller.update(1 / 60, { forward: true });
  const before = controller.getPosition();

  // Rotate the camera ~55° right WHILE W stays held.
  for (let i = 0; i < 42; i += 1) {
    controller.look(-12, 0); // ≈ 0.0216 rad per frame
    controller.update(1 / 60, { forward: true });
  }
  const after = controller.getPosition();
  const heading = travelHeading(before, after);
  // The displacement must follow the swept camera (0 → ~0.96 rad), NOT stay
  // on the old world heading. A latched path would keep heading ≈ 0 exactly.
  assert.ok(
    Math.abs(wrap(heading)) > 0.25 && Math.abs(wrap(heading)) < 0.9,
    `mid-drag displacement heading ${heading.toFixed(3)} — the run did not follow the camera`,
  );

  // After the drag stops, further W frames converge to the new heading.
  const mid = controller.getPosition();
  for (let i = 0; i < 30; i += 1) controller.update(1 / 60, { forward: true });
  const settled = travelHeading(mid, controller.getPosition());
  const draggedYaw = 42 * 12 * 0.0018; // ≈ 0.907 rad of camera sweep
  assert.ok(Math.abs(wrap(settled - draggedYaw)) < 0.12, `post-drag heading ${settled.toFixed(3)} ≈ camera forward`);
});

test('CONTRACT: diagonals run the exact normalized camera-relative heading', () => {
  const cases: Array<{ input: { forward?: boolean; backward?: boolean; left?: boolean; right?: boolean }; heading: number }> = [
    { input: { forward: true, right: true }, heading: -Math.PI / 4 },        // W+D
    { input: { forward: true, left: true }, heading: Math.PI / 4 },          // W+A
    { input: { backward: true, right: true }, heading: -3 * Math.PI / 4 },   // S+D
    { input: { backward: true, left: true }, heading: 3 * Math.PI / 4 },     // S+A
  ];
  for (const { input, heading } of cases) {
    const controller = thirdPerson();
    for (let i = 0; i < 240; i += 1) controller.update(1 / 60, input);
    const p = controller.getPosition();
    const travelled = Math.hypot(p.x, p.z);
    assert.ok(travelled > 3, 'diagonal input actually moved the character');
    const dirAngle = Math.atan2(-p.x, -p.z);
    assert.ok(Math.abs(wrap(dirAngle - heading)) < 0.05, `travelled along ${dirAngle.toFixed(3)}, expected ${heading.toFixed(3)}`);
  }
});

// --- 3. Body: forward-dominant chase, strafe/backpedal slides ------------------

test('CONTRACT: forward-dominant movement turns the body smoothly toward the heading (capped, no snap)', () => {
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
  assert.ok(Math.abs(wrap(controller.getBodyYaw() - 0.88)) < 0.03, 'body settled on the movement heading');
});

test('CONTRACT: A/D alone spin the body in place — continuous, capped, zero translation', () => {
  const controller = thirdPerson();

  // Sign: A turns LEFT (+yaw), D turns RIGHT (−yaw) — the same "left" the
  // old A-strafe slid toward (yaw 0 faces −Z; left = −X = +yaw).
  controller.update(1 / 60, { left: true });
  const firstA = controller.getBodyYaw();
  assert.ok(firstA > 0 && firstA < 0.05, `first A frame eased into the turn (${firstA.toFixed(4)} rad — not a step)`);
  const p0 = controller.getPosition();
  for (let i = 0; i < 119; i += 1) controller.update(1 / 60, { left: true });
  // bodyYaw accumulates UNWRAPPED — 2 s at 3.7 rad/s minus the ramp ≈ 7.17 rad.
  const swept = controller.getBodyYaw();
  assert.ok(swept > 6.9 && swept < 7.5, `2s of A swept ${swept.toFixed(2)} rad (expected ≈ 7.2)`);
  const p1 = controller.getPosition();
  assert.ok(Math.abs(p1.x - p0.x) < 1e-9 && Math.abs(p1.z - p0.z) < 1e-9, 'turn-in-place never translates');

  const clockwise = thirdPerson();
  for (let i = 0; i < 30; i += 1) clockwise.update(1 / 60, { right: true });
  assert.ok(clockwise.getBodyYaw() < 0, 'D turns right (−yaw)');
});

test('CONTRACT: turn-in-place is dt-driven — no fixed-degree step exists', () => {
  const controller = thirdPerson();

  // The per-frame rotation RAMPS UP (angular velocity, not key steps) and
  // every step stays under the configured turn-rate cap.
  const steps: number[] = [];
  let previous = controller.getBodyYaw();
  for (let i = 0; i < 8; i += 1) {
    controller.update(1 / 60, { left: true });
    steps.push(controller.getBodyYaw() - previous);
    previous = controller.getBodyYaw();
  }
  assert.ok(steps[4] > steps[0] * 2, `later steps (${steps[4].toFixed(4)}) exceed early ones (${steps[0].toFixed(4)}) — velocity-driven`);
  for (const s of steps) assert.ok(s <= 3.7 / 60 + 1e-9, `step ${s.toFixed(4)} rad exceeds the 3.7 rad/s cap`);

  // Repeated press/release cycles accumulate only while held (+ short
  // smooth tail) — never a constant per-press chunk.
  const taps = thirdPerson();
  for (let cycle = 0; cycle < 3; cycle += 1) {
    for (let i = 0; i < 20; i += 1) taps.update(1 / 60, { left: true });
    for (let i = 0; i < 20; i += 1) taps.update(1 / 60, {});
  }
  const held = thirdPerson();
  for (let i = 0; i < 60; i += 1) held.update(1 / 60, { left: true });
  // Both accumulate ≈ 3.3–3.5 rad unwrapped (well apart from the ±π cut).
  assert.ok(
    Math.abs(held.getBodyYaw() - taps.getBodyYaw()) < 0.5,
    `cycled input (${taps.getBodyYaw().toFixed(2)}) ≈ continuously-held (${held.getBodyYaw().toFixed(2)}) — no per-press bonus`,
  );
});

test('CONTRACT: releasing A/D decays the spin smoothly — no jerk, no overshoot, then exact freeze', () => {
  const controller = thirdPerson();
  for (let i = 0; i < 90; i += 1) controller.update(1 / 60, { left: true }); // full spin speed

  const steps: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    const before = controller.getBodyYaw();
    controller.update(1 / 60, {});
    steps.push(controller.getBodyYaw() - before);
  }
  let tail = 0;
  for (let i = 0; i < steps.length; i += 1) {
    if (steps[i] === 0) break; // exact freeze reached — tail is over
    assert.ok(steps[i] > 0, 'the release tail never reverses (no overshoot)');
    if (i > 0) assert.ok(steps[i] <= steps[i - 1] + 1e-12, `release step grew (${steps[i - 1].toFixed(5)} → ${steps[i].toFixed(5)})`);
    tail += steps[i];
  }
  // The whole tail is a short, bounded glide (≈ v₀ / release-rate ≈ 0.28 rad).
  assert.ok(tail > 0.05 && tail < 0.5, `release tail ${tail.toFixed(3)} rad — a bounded smooth stop`);

  const body = controller.getBodyYaw();
  const camera = controller.getYaw();
  for (let i = 0; i < 60; i += 1) controller.update(1 / 60, {});
  assert.equal(controller.getBodyYaw(), body, 'body exactly frozen after the tail');
  assert.equal(controller.getYaw(), camera, 'camera exactly frozen after the tail');
});

test('CONTRACT: the camera follows turn-in-place synchronously and ends behind the body', () => {
  const controller = thirdPerson();

  // From a behind start the offset stays exactly zero while both rotate.
  let previousBody = controller.getBodyYaw();
  let previousCamera = controller.getYaw();
  for (let i = 0; i < 150; i += 1) {
    controller.update(1 / 60, { left: true });
    assert.ok(
      Math.abs((controller.getBodyYaw() - previousBody) - (controller.getYaw() - previousCamera)) < 1e-9,
      'camera rotated with the body every single frame',
    );
    assert.ok(Math.abs(controller.getCameraOrbitOffset()) < 1e-9, 'camera stays exactly behind');
    previousBody = controller.getBodyYaw();
    previousCamera = controller.getYaw();
  }
  assert.ok(Math.abs(wrap(controller.getBodyYaw())) > 2, 'the body genuinely spun');

  // A pre-existing orbit offset eases toward zero: the camera swings behind
  // DURING the turn (never as a post-stop snap).
  const orbited = thirdPerson();
  orbited.look(-334, 0); // ≈ +0.6 rad offset
  for (let i = 0; i < 240; i += 1) orbited.update(1 / 60, { left: true });
  assert.ok(
    Math.abs(orbited.getCameraOrbitOffset()) < 0.05,
    `camera settled behind (${orbited.getCameraOrbitOffset().toFixed(3)})`,
  );
  assert.ok(Math.abs(orbited.getCameraOrbitOffset()) <= 1.9, 'offset never breached the bound');
});

test('CONTRACT: with W or S held, A/D stay strafe — turn-in-place never takes over', () => {
  const controller = thirdPerson();

  // W+D: camera-relative diagonal run, body chases the heading (unchanged).
  for (let i = 0; i < 240; i += 1) controller.update(1 / 60, { forward: true, right: true });
  const body = wrap(controller.getBodyYaw());
  assert.ok(Math.abs(body - (-Math.PI / 4)) < 0.03, `W+D body settled on the diagonal (${body.toFixed(3)})`);
  const p = controller.getPosition();
  assert.ok(Math.abs(wrap(Math.atan2(-p.x, -p.z) - (-Math.PI / 4))) < 0.05, 'W+D travelled the camera-relative diagonal');
  assert.ok(controller.getHorizontalSpeed() > 4, 'W+D actually moves');

  // S+A: slides camera-backward-left, body untouched.
  const slider = thirdPerson();
  for (let i = 0; i < 240; i += 1) slider.update(1 / 60, { backward: true, left: true });
  assert.equal(wrap(slider.getBodyYaw()), 0, 'S+A never rotates the body');
  assert.ok(slider.getPosition().x < -1 && slider.getPosition().z > 1, 'S+A slides the diagonal');

  // First person keeps classic strafe on A/D (the mouse owns turning there).
  const fp = new PlayerController(emptyWorld(), {
    initialPosition: { x: 0, y: CHARACTER_PROPORTIONS.eyeHeight, z: 0 },
    yaw: 0,
    cameraMode: 'first_person',
  });
  fp.update(1 / 60, { right: true });
  assert.ok(fp.getPosition().x > 0, 'FP D still strafes along camera-right');
});

test('CONTRACT: backpedaling (S) slides the body — smooth W→S reversal through zero', () => {
  // The demo's blend settings: S must reverse the velocity through zero.
  const controller = thirdPerson({ accelerationTime: 0.16, decelerationTime: 0.12 });

  // Build up forward speed, then press S and sample the speed curve.
  for (let i = 0; i < 40; i += 1) controller.update(1 / 60, { forward: true });
  assert.ok(controller.getHorizontalSpeed() > 4, 'W reached walking speed');

  const samples: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    controller.update(1 / 60, { backward: true });
    samples.push(controller.getHorizontalSpeed());
  }
  // The speed must pass through ~0 and build back up — never teleport from
  // +speed to -speed in one frame.
  const minSpeed = Math.min(...samples);
  assert.ok(minSpeed < 0.5, `speed never approached zero (min ${minSpeed.toFixed(2)})`);
  assert.ok(samples[samples.length - 1] > 3, 'S ended at backward walking speed');
  let worstJump = 0;
  for (let i = 1; i < samples.length; i += 1) worstJump = Math.max(worstJump, Math.abs(samples[i] - samples[i - 1]));
  assert.ok(worstJump < 1.2, `largest per-frame speed jump ${worstJump.toFixed(3)} m/s — a snap exists`);

  // S never rotates the body and moves it camera-backward (+Z at yaw 0).
  assert.equal(wrap(controller.getBodyYaw()), 0, 'body held its heading during backpedal');
  assert.ok(controller.getPosition().z > 1, 'character moved camera-backward');
});

// --- 4. Realignment: the body chases the camera, never the reverse -------------

test('CONTRACT: the body realigns with the camera during forward runs — idle, strafe and backpedal never move anything', () => {
  const controller = thirdPerson();
  controller.look(-330, 0); // +0.594 rad offset

  // Idle: nothing moves.
  for (let i = 0; i < 120; i += 1) controller.update(1 / 60, {});
  assert.ok(Math.abs(controller.getCameraOrbitOffset() - 0.594) < 1e-9, 'idle never rotates anything');

  // Lateral movement (S+D): the body slides, the offset persists.
  for (let i = 0; i < 120; i += 1) controller.update(1 / 60, { backward: true, right: true });
  assert.ok(Math.abs(controller.getCameraOrbitOffset() - 0.594) < 1e-9, 'strafe never closes the offset');
  assert.equal(wrap(controller.getBodyYaw()), 0, 'strafe never rotates the body');

  // Backpedal: ditto.
  for (let i = 0; i < 120; i += 1) controller.update(1 / 60, { backward: true });
  assert.ok(Math.abs(controller.getCameraOrbitOffset() - 0.594) < 1e-9, 'backpedal never closes the offset');
  assert.equal(wrap(controller.getBodyYaw()), 0, 'backpedal never rotates the body');

  // Pure forward: the BODY swings around to the camera heading, closing the
  // offset — the camera itself never moved (no catch-up swing exists).
  const cameraBefore = controller.getYaw();
  for (let i = 0; i < 150; i += 1) controller.update(1 / 60, { forward: true });
  assert.ok(Math.abs(controller.getCameraOrbitOffset()) < 0.05, `body arrived at the camera (${controller.getCameraOrbitOffset().toFixed(3)})`);
  assert.ok(Math.abs(wrap(controller.getYaw() - cameraBefore)) < 1e-9, 'the camera itself never moved — the body did the realign');
  assert.ok(Math.abs(wrap(controller.getBodyYaw() - cameraBefore)) < 0.05, 'body heading ≈ camera heading');

  // While dragging mid-run, the body still chases the live camera heading.
  const bodyBefore = controller.getBodyYaw();
  controller.look(-489, 0); // flick the camera +0.88 while W is held
  for (let i = 0; i < 120; i += 1) controller.update(1 / 60, { forward: true });
  assert.ok(
    Math.abs(wrap(controller.getBodyYaw() - controller.getYaw())) < 0.05,
    'body chased the camera even while the drag was live',
  );
  assert.ok(Math.abs(wrap(controller.getBodyYaw() - bodyBefore)) > 0.5, '…and genuinely swung around');
});

test('CONTRACT: after every stop the camera and body stay frozen (no catch-up system exists)', () => {
  const controller = thirdPerson();
  const stops: Array<{ forward?: boolean; backward?: boolean; left?: boolean; right?: boolean }> = [
    { forward: true }, { left: true }, { right: true }, { backward: true },
  ];
  for (const input of stops) {
    for (let i = 0; i < 40; i += 1) controller.update(1 / 60, input);
    // Absorb the (short, smooth) turn-release tail that A/D stops have —
    // that tail is part of the stop, not a post-stop catch-up.
    for (let i = 0; i < 90; i += 1) controller.update(1 / 60, {});
    const c = controller.getYaw();
    const b = controller.getBodyYaw();
    for (let i = 0; i < 90; i += 1) controller.update(1 / 60, {});
    assert.equal(controller.getYaw(), c, 'camera frozen after stop+tail');
    assert.equal(controller.getBodyYaw(), b, 'body frozen after stop+tail');
  }
});

test('CONTRACT: the W A stop D stop S stop W sequence never rotates anything after a stop', () => {
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

// --- 5. Head look: the gaze layer ----------------------------------------------

test('CONTRACT: the head tracks the camera, clamped and smoothed', () => {
  const controller = thirdPerson();

  // Orbit well past the head bound: the gaze clamps at maxHeadYaw.
  controller.look(-900, 0); // offset → +1.62 rad, head clamps at 1.0
  for (let i = 0; i < 120; i += 1) controller.update(1 / 60, {});
  assert.ok(Math.abs(controller.getHeadLookYaw() - 1.0) < 1e-3, `head clamped at ±1.0 (got ${controller.getHeadLookYaw().toFixed(3)})`);

  // The approach is smoothed — no single-frame jump reaches the target.
  const smooth = thirdPerson();
  smooth.look(-400, 0); // target 0.72
  smooth.update(1 / 60, {});
  assert.ok(smooth.getHeadLookYaw() > 0.01 && smooth.getHeadLookYaw() < 0.88, 'head eased toward the target, not snapped');

  // A moderate orbit converges to exactly the camera-minus-body offset.
  const moderate = thirdPerson();
  moderate.look(-270, 0); // +0.486
  for (let i = 0; i < 120; i += 1) moderate.update(1 / 60, {});
  assert.ok(Math.abs(moderate.getHeadLookYaw() - 0.486) < 1e-3, 'head converged on the orbit offset');

  // Camera pitch bleeds into the head pitch (clamped fraction).
  moderate.look(0, -700); // pitch += 700·0.0018 ≈ 1.26 → ×0.55 = 0.693 → clamp 0.6
  for (let i = 0; i < 120; i += 1) moderate.update(1 / 60, {});
  assert.ok(
    Math.abs(moderate.getHeadLookPitch() - 0.6) < 1e-3,
    `head pitch clamped at 0.6 (got ${moderate.getHeadLookPitch().toFixed(3)})`,
  );
});

test('CONTRACT: head look is zero in first person and while dead', () => {
  const fp = new PlayerController(emptyWorld(), {
    initialPosition: { x: 0, y: 1.7, z: 0 },
    yaw: 0,
    cameraMode: 'first_person',
  });
  fp.look(-300, 100);
  fp.update(1 / 60, {});
  assert.equal(fp.getHeadLookYaw(), 0, 'FP gaze offset is zero');
  assert.equal(fp.getHeadLookPitch(), 0, 'FP gaze pitch is zero');

  const dead = thirdPerson();
  dead.look(-300, 0);
  dead.update(1 / 60, {});
  dead.setDead(true);
  dead.update(1 / 60, {});
  assert.equal(dead.getHeadLookYaw(), 0, 'dead gaze offset is zero');
});

// --- 6. First person + misc ------------------------------------------------------

test('CONTRACT: first-person look and movement keep classic behaviour', () => {
  const controller = new PlayerController(emptyWorld(), {
    initialPosition: { x: 0, y: 1.7, z: 0 },
    yaw: 0,
    cameraMode: 'first_person',
  });
  controller.look(-Math.PI / 2 / 0.0018, 0); // turn the view 90° left
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

test('CONTRACT: respawn realigns the camera behind the body', () => {
  const controller = thirdPerson();
  controller.look(-1400, 0);
  for (let i = 0; i < 30; i += 1) controller.update(1 / 60, {});
  controller.respawnAt({ x: 0, y: CHARACTER_PROPORTIONS.eyeHeight, z: 0 });
  assert.equal(controller.getCameraOrbitOffset(), 0, 'orbit offset reset on respawn');
  assert.equal(controller.getHeadLookYaw(), 0, 'gaze reset on respawn');
  assert.equal(controller.getBodyYaw(), controller.getYaw(), 'camera exactly behind the body');
});
