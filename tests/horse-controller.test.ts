/**
 * Part 3 — HorseController integration tests: gaits, acceleration/deceleration,
 * collision, terrain, mount/dismount, AI navigation and persistence
 * (spec §2/§3/§4/§10/§14/§17).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { CollisionWorld, HorseController, SceneStateManager, HORSE_GAITS, HORSE_PROPORTIONS, mountEnterCameraMode } from '../src/index.js';

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

test('HORSE CONTROLLER: grinding a wall does not pump stamina dry (knock is edge-triggered)', () => {
  const { manager, world } = buildWorld();
  wall(manager, { x: 0, y: 1.5, z: -6 }, { x: 10, y: 3, z: 1 });
  const horse = horseAt(world, 0, 0, 0);
  horse.mount();
  // 3 seconds of full-throttle grind against the wall: the blocked condition
  // holds on EVERY frame, but the knock must fire at most once per refractory
  // window (1s) — 3s ⇒ ≤ 4 knocks (12 SP) + gallop-band drain (9/s ⇒ 27) ≈ 39.
  for (let i = 0; i < 180; i += 1) {
    horse.update(ctx(), { throttle: true, brake: false, steer: 0, tapGaitUp: true, tapGaitDown: false });
  }
  const sp = horse.getSnapshot().stamina;
  assert.ok(sp >= 60, `wall grind must not drain stamina to 0 (SP left ${sp.toFixed(1)})`);
});

test('HORSE CONTROLLER: COME arrival never plows the player (no snowplow, no contact)', () => {
  const { world } = buildWorld();
  // Horse 12m east of the player, facing them; explicit COME; the caller
  // applies the separation push (like playable-map does) and the brain
  // re-targets the LIVE player position — the exact feedback loop that used
  // to drag a player ~28m across the map on a canter arrival.
  const horse = horseAt(world, 12, 0, Math.PI / 2);
  let px = 0;
  let pz = 0;
  assert.equal(horse.summon(), true);
  let minDist = Infinity;
  let maxPlayerDrift = 0;
  for (let i = 0; i < 60 * 30; i += 1) {
    horse.update(ctx({ x: px, y: 1.7, z: pz }));
    const sep = horse.takePlayerSeparation();
    if (sep) {
      px = sep.x;
      pz = sep.z;
    }
    const h = horse.getPosition();
    minDist = Math.min(minDist, Math.hypot(h.x - px, h.z - pz));
    maxPlayerDrift = Math.max(maxPlayerDrift, Math.hypot(px, pz));
  }
  assert.ok(minDist >= 0.9, `horse must never reach the player capsule (min ${minDist.toFixed(3)}m)`);
  assert.ok(maxPlayerDrift < 0.5, `player must never be plowed (drift ${maxPlayerDrift.toFixed(2)}m)`);
  const snap = horse.getSnapshot();
  const finalDist = Math.hypot(snap.position.x - px, snap.position.z - pz);
  assert.ok(finalDist <= 4.5, `COME must arrive near the player (final ${finalDist.toFixed(2)}m)`);
  assert.notEqual(snap.aiState, 'come', 'COME must terminate on arrival');
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

test('HORSE CONTROLLER: a player walking away is NEVER chased — the horse stays put', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 0, 0);
  // The player walks away at 3.4 m/s for 12s; the horse must stay a local
  // animal: no follow state, no pursuit, position drift < 3.5m (idle steps).
  let maxDrift = 0;
  for (let i = 0; i < 60 * 12; i += 1) {
    const playerZ = 9 + i * 3.4 * DT;
    horse.update(ctx({ x: 0, y: 1.7, z: playerZ }, true));
    const p = horse.getPosition();
    maxDrift = Math.max(maxDrift, Math.hypot(p.x, p.z));
  }
  assert.ok((horse.getAiState() as string) !== 'follow' && (horse.getAiState() as string) !== 'come', `state must never chase (${horse.getAiState()})`);
  assert.ok(maxDrift < 3.5, `horse must stay put (drift ${maxDrift.toFixed(2)}m)`);
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

// --- Revision issue 9: no passive health loss in any non-damage state -------

test('HORSE CONTROLLER: STAY for 10s — health never changes (issue 9)', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 0, 0, 0);
  assert.equal(horse.stay(), true);
  const start = horse.getSnapshot().health;
  for (let i = 0; i < 600; i += 1) {
    // The player drifts far away mid-stay; the horse must neither follow nor
    // lose health for standing.
    horse.update(ctx({ x: 0.01 * i, y: 1.7, z: 0 }));
  }
  assert.equal(horse.getSnapshot().health, start, 'STAY must not drain health');
  assert.equal(horse.getAiState(), 'stay');
});

test('HORSE CONTROLLER: STAY permanently blocks damage-flee — the horse parks in place (controls §1)', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 0, 0, 0);
  assert.equal(horse.stay(), true);
  // Damage while staying: health DROPS (real damage event) but the horse must
  // never enter flee locomotion — position bit-constant through 8s.
  horse.damage(25, 5, 0);
  assert.equal(horse.getSnapshot().health, 75, 'real damage still applies');
  let maxDrift = 0;
  for (let i = 0; i < 60 * 8; i += 1) {
    horse.update(ctx({ x: 5, y: 1.7, z: 0 }));
    const p = horse.getPosition();
    maxDrift = Math.max(maxDrift, Math.hypot(p.x, p.z));
  }
  assert.equal(horse.getAiState(), 'stay', `must stay parked (${horse.getAiState()})`);
  assert.equal(maxDrift, 0, `parked horse must not move an inch (drift ${maxDrift.toFixed(4)}m)`);
});

test('HORSE CONTROLLER: IDLE for 10s — health never changes (issue 9)', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 0, 0, 0);
  const start = horse.getSnapshot().health;
  for (let i = 0; i < 600; i += 1) horse.update(ctx({ x: 0, y: 1.7, z: 0 }));
  assert.equal(horse.getSnapshot().health, start, 'IDLE must not drain health');
});

test('HORSE CONTROLLER: player walking away for 10s — health unchanged, no chase (issue 9)', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 0, 0, 0);
  const start = horse.getSnapshot().health;
  // The player walks away at 3.4 m/s; an empty world means no collision
  // damage is possible — and there is no follow to move the horse either.
  for (let i = 0; i < 600; i += 1) {
    const px = 8 + i * 3.4 * DT;
    horse.update(ctx({ x: Math.min(px, 40), y: 1.7, z: 0 }, true));
  }
  assert.equal(horse.getSnapshot().health, start, 'walking away must not drain health');
  assert.ok((horse.getAiState() as string) !== 'follow' && (horse.getAiState() as string) !== 'come', `no chase (${horse.getAiState()})`);
});

test('HORSE CONTROLLER: only explicit damage lowers health — heal/debug paths intact', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 0, 0, 0);
  const applied = horse.damage(25, 1, 1);
  assert.equal(applied, 25);
  assert.equal(horse.getSnapshot().health, 75);
  assert.equal(horse.heal(10), 10);
  assert.equal(horse.getSnapshot().health, 85);
});

// --- Controls revision §1: nothing can ever engage a chase -------------------

test('HORSE CONTROLLER: player approaching the horse never moves it (command model)', () => {
  const { world } = buildWorld();
  const horse = horseAt(world, 20, 0, 0);
  // The player starts 10m away on +X and walks TOWARD the horse — no command
  // exists that would make the horse close distance, and approach never
  // triggers anything. The horse never moves.
  for (let i = 0; i < 120; i += 1) {
    horse.update(ctx({ x: 30 - i * 3.4 * DT, y: 1.7, z: 0 }, true));
  }
  assert.ok((horse.getAiState() as string) !== 'follow' && (horse.getAiState() as string) !== 'come', `approach must not chase (${horse.getAiState()})`);
  assert.equal(horse.getPosition().x, 20); // the horse never moved
});

// --- Controls revision §3: the mount camera contract --------------------------

test('MOUNT CAMERA: first-person mount switches to THIRD PERSON and never returns to FP', () => {
  // FP → mount: the camera MUST enter the choreography as third person.
  assert.equal(mountEnterCameraMode('first_person'), 'third_person');
  // TP → mount: stays third person (no flicker, no toggle-back).
  assert.equal(mountEnterCameraMode('third_person'), 'third_person');
  // After the settle the mount flow keeps whatever this returned — i.e. the
  // rider never lands back in first person from a mount start.
});
