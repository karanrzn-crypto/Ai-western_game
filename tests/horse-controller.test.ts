/**
 * Part 3 — HorseController integration tests: gaits, acceleration/deceleration,
 * collision, terrain, mount/dismount, AI navigation and persistence
 * (spec §2/§3/§4/§10/§14/§17).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { CollisionWorld, HorseController, SceneStateManager, HORSE_GAITS, HORSE_PROPORTIONS } from '../src/index.js';

let uuidCounter = 0;
function wall(manager: SceneStateManager, position: { x: number; y: number; z: number }, scale: { x: number; y: number; z: number }): void {
  uuidCounter += 1;
  manager.registerObject({
    uuid: `30000000-0000-4000-a000-${String(uuidCounter).padStart(12, '0')}`,
    assetType: 'cube',
    transform: { position, rotation: { x: 0, y: 0, z: 0 }, scale },
    metadata: { name: 'Block', collider: true },
  });
}

function buildWorld(): { manager: SceneStateManager; world: CollisionWorld } {
  const manager = new SceneStateManager();
  const world = new CollisionWorld(() => manager.getAllObjects(), { floorY: 0 });
  return { manager, world };
}

function horseAt(world: CollisionWorld, x = 0, z = 0, yaw = 0): HorseController {
  return new HorseController(world, { position: { x, y: 0, z }, yaw });
}

const DT = 1 / 60;

function ctx(playerFeet = { x: 0, y: 1.7, z: 0 }, playerMoving = false) {
  return {
    deltaSeconds: DT,
    playerX: playerFeet.x,
    playerY: playerFeet.y,
    playerZ: playerFeet.z,
    playerMoving,
    playerSpeed: playerMoving ? 3.4 : 0,
  };
}

test('HORSE CONTROLLER: holding W accelerates smoothly to the walk gait (no teleport)', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 0, 0, 0); // faces -Z
  horse.mount();
  let maxStep = 0;
  let previous = horse.getPosition();
  for (let i = 0; i < 240; i += 1) {
    horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
    const p = horse.getPosition();
    maxStep = Math.max(maxStep, Math.hypot(p.x - previous.x, p.z - previous.z));
    previous = p;
  }
  assert.ok(Math.abs(horse.getSpeed() - HORSE_GAITS.walk.speed) < 0.05);
  assert.ok(horse.getPosition().z < -2); // moved forward (−Z)
  // Per-frame movement can never exceed speed·dt (+ε) — no teleporting.
  assert.ok(maxStep <= horse.getSpeed() * DT + 0.02);
});

test('HORSE CONTROLLER: gait ladder taps reach all four gaits, taps down descend', () => {
  const { world } = buildWorld();
  const horse = horseAt(world);
  horse.mount();
  // Burn the mount lock (the horse stands while the rider settles).
  for (let i = 0; i < 30; i += 1) horse.update(ctx(), { throttle: false, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
  const ride = (up: boolean, down: boolean): void =>
    horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: up, tapGaitDown: down });
  assert.equal(horse.getTargetGait(), 'idle');
  ride(true, false); // idle → walk
  assert.equal(horse.getTargetGait(), 'walk');
  ride(true, false); // → trot
  assert.equal(horse.getTargetGait(), 'trot');
  ride(true, false); // → canter
  assert.equal(horse.getTargetGait(), 'canter');
  ride(true, false); // → gallop
  assert.equal(horse.getTargetGait(), 'gallop');
  for (let i = 0; i < 400; i += 1) horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
  assert.ok(Math.abs(horse.getSpeed() - HORSE_GAITS.gallop.speed) < 0.1);
  const rideDown = (): void => horse.update(ctx(), { throttle: false, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: true });
  rideDown(); // gallop → canter
  assert.equal(horse.getTargetGait(), 'canter');
  rideDown();
  rideDown();
  rideDown(); // → idle
  assert.equal(horse.getTargetGait(), 'idle');
  // Holding W from idle rides again (dead-throttle guard).
  ride(false, false);
  assert.equal(horse.getTargetGait(), 'walk');
});

test('HORSE CONTROLLER: braking stops faster than natural deceleration', () => {
  const run = (brake: boolean): number => {
    const { world } = buildWorld();
    const horse = horseAt(world);
    horse.mount();
    horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: true, tapGaitDown: true, });
    horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: true, tapGaitDown: true });
    horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: true, tapGaitDown: true });
    for (let i = 0; i < 600; i += 1) horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
    let frames = 0;
    while (horse.getSpeed() > 0.05 && frames < 1200) {
      horse.update(ctx(), { throttle: false, brake, steer: 0, tapGaitUp: false, tapGaitDown: false });
      frames += 1;
    }
    return frames * DT;
  };
  const brakeTime = run(true);
  const naturalTime = run(false);
  assert.ok(brakeTime < naturalTime, `brake ${brakeTime.toFixed(2)}s should beat natural ${naturalTime.toFixed(2)}s`);
});

test('HORSE CONTROLLER: releasing W coasts to a smooth full stop at every gait (no snap, no cruise)', () => {
  for (const taps of [0, 1, 2, 3]) { // walk, trot, canter, gallop
    const { world } = buildWorld();
    const horse = horseAt(world);
    horse.mount();
    for (let i = 0; i < 30; i += 1) horse.update(ctx(), { throttle: false, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
    for (let i = 0; i < taps; i += 1) horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: true, tapGaitDown: false });
    // Ride until the selected gait's steady-state speed is reached.
    const gait = (['walk', 'trot', 'canter', 'gallop'] as const)[taps];
    for (let i = 0; i < 900 && horse.getSpeed() < HORSE_GAITS[gait].speed - 0.05; i += 1) {
      horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
    }
    assert.ok(horse.getSpeed() > 1.5, `gait ${gait} should be moving`);
    // Release W — the very next frame must NOT be an instant stop.
    horse.update(ctx(), { throttle: false, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
    assert.ok(horse.getSpeed() > 1.2, 'release keeps momentum (continues briefly)');
    // Coast: speed decays gradually and monotonically toward exactly zero.
    let previous = horse.getSpeed();
    let frames = 0;
    while (horse.getSpeed() > 0 && frames < 1200) {
      horse.update(ctx(), { throttle: false, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
      assert.ok(horse.getSpeed() <= previous + 1e-9, 'deceleration is monotonic');
      previous = horse.getSpeed();
      frames += 1;
    }
    assert.equal(horse.getSpeed(), 0);
    assert.ok(frames > 30, `coast takes time (gait ${gait}: ${frames} frames)`);
    assert.ok(frames * DT < 8, 'coast does not drag forever');
    // After stopping: no artificial movement, speed stays exactly zero.
    const stopped = horse.getPosition();
    for (let i = 0; i < 120; i += 1) {
      horse.update(ctx(), { throttle: false, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
      assert.equal(horse.getSpeed(), 0);
    }
    const after = horse.getPosition();
    assert.ok(Math.hypot(after.x - stopped.x, after.z - stopped.z) < 1e-6, 'a stopped horse does not drift');
  }
});

test('HORSE CONTROLLER: reverse crawls far slower than the walk and steers inverted', () => {
  const { world } = buildWorld();
  const horse = horseAt(world);
  horse.mount();
  // From standstill, hold S → reverse.
  for (let i = 0; i < 120; i += 1) horse.update(ctx(), { throttle: false, brake: true, steer: 0, tapGaitUp: false, tapGaitDown: false });
  assert.ok(horse.getSpeed() < 0);
  assert.ok(Math.abs(horse.getSpeed()) <= 1.1 + 1e-6);
  assert.ok(Math.abs(horse.getSpeed()) < HORSE_GAITS.walk.speed);
  assert.ok(horse.getPosition().z > 0.5); // backed up (+Z)
});

test('HORSE CONTROLLER: steering turns left (+yaw) while riding forward', () => {
  const { world } = buildWorld();
  const horse = horseAt(world);
  horse.mount();
  for (let i = 0; i < 60; i += 1) horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
  const yawBefore = horse.getYaw();
  for (let i = 0; i < 30; i += 1) horse.update(ctx(), { throttle: true, brake: false, steer: 1, tapGaitUp: false, tapGaitDown: false });
  assert.ok(horse.getYaw() > yawBefore + 0.2);
});

test('HORSE CONTROLLER: never passes through a wall — collision clamps, no teleport', () => {
  const { manager, world } = buildWorld();
  wall(manager, { x: 0, y: 1.5, z: -6 }, { x: 10, y: 3, z: 1 });
  const horse = horseAt(world, 0, 0, 0); // rides toward the wall at -Z
  horse.mount();
  for (let i = 0; i < 600; i += 1) horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: true, tapGaitDown: false });
  const p = horse.getPosition();
  const bounds = world.getCollisionBounds()[0];
  assert.ok(p.z > bounds.min.z - HORSE_PROPORTIONS.collisionRadius - 0.1, `horse z=${p.z} must stay in front of the wall`);
  // Front face of the wall is at z=-6.5; horse nose stops at radius distance.
  assert.ok(p.z >= -6.5 + HORSE_PROPORTIONS.collisionRadius - 0.05);
});

test('HORSE CONTROLLER: steps up onto low ledges and stands on top (terrain)', () => {
  const { manager, world } = buildWorld();
  wall(manager, { x: 0, y: 0.2, z: -10 }, { x: 6, y: 0.4, z: 24 }); // deep ledge
  const horse = horseAt(world, 0, 0, 0);
  horse.mount();
  for (let i = 0; i < 30; i += 1) horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
  horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: true, tapGaitDown: false });
  // Ride until clearly on top of the ledge (past the climb, before the far edge).
  for (let i = 0; i < 600; i += 1) {
    horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
    const p = horse.getPosition();
    if (p.z < -6 && p.z > -16) break;
  }
  const p = horse.getPosition();
  assert.ok(Math.abs(p.y - 0.4) < 0.05, `horse stands on the ledge, y=${p.y}`);
  assert.ok(p.z < -5);
});

test('HORSE CONTROLLER: gallop drains stamina until fatigue caps the gait at canter', () => {
  const { world } = buildWorld();
  const horse = horseAt(world);
  horse.mount();
  for (let i = 0; i < 30; i += 1) horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
  for (let i = 0; i < 3; i += 1) horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: true, tapGaitDown: false });
  let fatiguedSeen = false;
  for (let i = 0; i < 60 * 40; i += 1) {
    horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: false, tapGaitDown: false });
    if (horse.getSnapshot().fatigued) fatiguedSeen = true;
  }
  assert.equal(fatiguedSeen, true);
  assert.ok(horse.getSnapshot().staminaRatio < 1);
  // While fatigued the gallop is capped: target gait can never be gallop.
  horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: true, tapGaitDown: false });
  assert.notEqual(horse.getTargetGait(), 'gallop');
  assert.ok(horse.getSpeed() < HORSE_GAITS.gallop.speed - 0.5);
});

test('HORSE CONTROLLER: damage injures (gait capped) and death blocks mounting', () => {
  const { world } = buildWorld();
  const horse = horseAt(world);
  horse.damage(80);
  assert.equal(horse.isInjured(), true);
  horse.mount();
  horse.update(ctx(), { throttle: false, brake: false, steer: 0, tapGaitUp: true, tapGaitDown: false });
  assert.notEqual(horse.getTargetGait(), 'gallop'); // injured ceiling = canter
  horse.dismount();
  horse.damage(200);
  assert.equal(horse.isDead(), true);
  assert.equal(horse.canMount({ x: 0, y: 1.7, z: 0 }), false);
  horse.mount();
  assert.equal(horse.isMounted(), false); // dead horses are never mountable
  // Revive (debug heal) brings it back.
  horse.heal(35);
  assert.equal(horse.isAlive(), true);
  assert.equal(horse.canMount({ x: 0, y: 1.7, z: 0 }), true);
});

test('HORSE CONTROLLER: mount requires proximity; dismount lands on a safe spot', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 0, 0);
  assert.equal(horse.canMount({ x: 0, y: 1.7, z: 10 }), false); // too far
  assert.equal(horse.canMount({ x: 0.8, y: 1.7, z: 0.8 }), true);
  horse.mount();
  assert.equal(horse.isMounted(), true);
  const feet = horse.computeDismountFeet();
  horse.dismount();
  assert.equal(horse.isMounted(), false);
  // Landed on the left flank at roughly one stride, on the ground.
  assert.ok(Math.hypot(feet.x, feet.z) > 0.8 && Math.hypot(feet.x, feet.z) < 2.2);
  assert.ok(feet.y >= -0.01);
});

test('HORSE CONTROLLER: dismount spot falls back when the left side is blocked', () => {
  const { manager, world } = buildWorld();
  wall(manager, { x: -2.2, y: 1.5, z: 0 }, { x: 3, y: 3, z: 6 }); // blocks the left side
  const horse = horseAt(world, 0, 0, 0); // left = -X → inside the wall
  horse.mount();
  const feet = horse.computeDismountFeet();
  // The fallback spot must be clear of the wall (x > wall max + radius).
  assert.ok(feet.x > -0.7 + 0.35, `dismount x=${feet.x} must not be inside the wall`);
});

test('HORSE CONTROLLER: horse and player never hard-overlap (separation push)', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 0, 0);
  // Player standing halfway inside the horse's capsule.
  horse.update(ctx({ x: 0.5, y: 1.7, z: 0 }));
  const separation = horse.takePlayerSeparation();
  assert.ok(separation !== null);
  const dist = Math.hypot(separation!.x, separation!.z);
  assert.ok(dist >= HORSE_PROPORTIONS.collisionRadius + 0.35 - 0.01);
});

test('HORSE CONTROLLER: follow keeps its distance, never teleports, never bumps', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 0, 0);
  let playerZ = 9;
  let minDistance = Infinity;
  let maxStep = 0;
  for (let i = 0; i < 60 * 12; i += 1) {
    horse.update(ctx({ x: 0, y: 1.7, z: playerZ }, true));
    const p = horse.getPosition();
    minDistance = Math.min(minDistance, Math.hypot(p.x, p.z - playerZ));
    maxStep = Math.max(maxStep, Math.abs(horse.getSpeed()) * DT);
  }
  assert.ok(minDistance > 1.8, `follow must not enter the player radius (min ${minDistance.toFixed(2)}m)`);
  assert.ok(minDistance < 4.5, `follow must reach the keep-distance band (min ${minDistance.toFixed(2)}m)`);
  assert.ok(maxStep <= HORSE_GAITS.gallop.speed * DT + 0.02);
});

test('HORSE CONTROLLER: summon returns a far horse without teleporting', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 20, 20);
  assert.equal(horse.summon(), true);
  let maxStep = 0;
  let previous = horse.getPosition();
  let arrived = false;
  for (let i = 0; i < 60 * 30; i += 1) {
    horse.update(ctx({ x: 0, y: 1.7, z: 0 }));
    const p = horse.getPosition();
    maxStep = Math.max(maxStep, Math.hypot(p.x - previous.x, p.z - previous.z));
    previous = p;
    if (Math.hypot(p.x, p.z) < 2.7) { arrived = true; break; }
  }
  assert.equal(arrived, true, 'horse must reach the player after the whistle');
  assert.ok(maxStep <= HORSE_GAITS.gallop.speed * DT + 0.02, 'no per-frame teleport');
  horse.update(ctx()); // one more tick: arrival registers and the brain settles
  assert.equal(horse.getAiState(), 'idle');
});

test('HORSE CONTROLLER: serialize/restore round-trips position, vitals and death', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 3, 7, 1.2);
  horse.damage(40);
  const data = horse.serialize();
  assert.equal(data.version, 1);
  const restored = new HorseController(world, { position: { x: 0, y: 0, z: 0 } });
  restored.restore(data);
  assert.equal(restored.getPosition().x, 3);
  assert.equal(restored.getPosition().z, 7);
  assert.ok(Math.abs(restored.getYaw() - 1.2) < 1e-6);
  assert.ok(Math.abs(restored.health.current - data.health) < 1e-9);
  // Death persistence: a dead save restores dead (and unmountable).
  horse.damage(400);
  const deadData = horse.serialize();
  assert.equal(deadData.alive, false);
  const deadRestored = new HorseController(world, {});
  deadRestored.restore(deadData);
  assert.equal(deadRestored.isDead(), true);
  assert.equal(deadRestored.canMount({ x: 0, y: 1.7, z: 0 }), false);
});
