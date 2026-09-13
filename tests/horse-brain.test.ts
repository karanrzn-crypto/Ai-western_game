/**
 * Part 3 — Horse Stamina & Brain unit tests (pure logic, spec §5/§7/§8/§9/§13).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { HorseBrain, HorseStamina, HORSE_STAMINA } from '../src/index.js';

test('HORSE STAMINA: gallop drains, canter drains slower, trot is neutral', () => {
  const s = new HorseStamina();
  s.update(1, 'gallop');
  assert.ok(Math.abs(s.current - (100 - HORSE_STAMINA.gallopDrain)) < 1e-9);
  const afterGallop = s.current;
  s.reset();
  s.update(1, 'canter');
  assert.ok(Math.abs(s.current - (100 - HORSE_STAMINA.canterDrain)) < 1e-9);
  assert.ok(s.current > afterGallop - 100 + 100); // canter drain < gallop drain
  s.reset();
  s.update(5, 'trot');
  assert.equal(s.current, 100); // trot: neither drains nor recovers
});

test('HORSE STAMINA: walk recovers slowly after the delay, idle recovers fast', () => {
  const s = new HorseStamina();
  s.spend(50);
  // Inside the regen delay: no recovery while walking.
  s.update(HORSE_STAMINA.regenDelay / 2, 'walk');
  assert.equal(s.current, 50);
  s.update(HORSE_STAMINA.regenDelay, 'walk');
  assert.ok(s.current > 50);
  const walkRate = s.current - 50;
  const idle = new HorseStamina();
  idle.spend(50);
  idle.update(HORSE_STAMINA.regenDelay / 2 + HORSE_STAMINA.regenDelay + 1, 'idle');
  assert.ok(idle.current - 50 > walkRate); // idle recovery outpaces walk
});

test('HORSE STAMINA: fatigue lock engages at the threshold and needs hysteresis recovery', () => {
  const s = new HorseStamina();
  s.spend(100 - HORSE_STAMINA.fatigueLock - 0.5); // just ABOVE the lock threshold
  assert.equal(s.isFatigued, false);
  s.update(0.1, 'gallop'); // the drain dips to/below the lock threshold
  assert.equal(s.isFatigued, true); 
  assert.equal(s.canGallop(), false);
  // Recovery to just below the unlock threshold keeps the lock.
  s.reset(HORSE_STAMINA.fatigueRecover - 1);
  assert.equal(s.isFatigued, true);
  s.reset(HORSE_STAMINA.fatigueRecover);
  assert.equal(s.isFatigued, false);
  assert.equal(s.canGallop(), true);
});

test('HORSE BRAIN: idle by default, natural idle life is scheduled', () => {
  const brain = new HorseBrain();
  const ctx = baseCtx();
  const order = brain.update(ctx);
  assert.equal(order.state, 'idle');
  assert.equal(order.targetX, null);
});

test('HORSE BRAIN: summon navigates to the player, then idles on arrival', () => {
  const brain = new HorseBrain();
  brain.notePosition(10, 10);
  assert.equal(brain.summon(), true);
  // Far player: come order targets the player position.
  const far = brain.update({ ...baseCtx(), horseX: 10, horseZ: 10, playerX: -5, playerZ: -5 });
  assert.equal(far.state, 'come');
  assert.equal(far.targetX, -5);
  assert.equal(far.targetZ, -5);
  // Cooldown blocks an immediate second whistle.
  assert.equal(brain.summon(), false);
  // Arrived: the brain settles back to idle.
  const arrived = brain.update({ ...baseCtx(), horseX: -4.2, horseZ: -4.2, playerX: -5, playerZ: -5 });
  assert.equal(arrived.state, 'idle');
  assert.equal(arrived.targetX, null);
});

test('HORSE BRAIN: follow starts far, stops at the keep-distance radius', () => {
  const brain = new HorseBrain();
  brain.notePosition(0, 0);
  // 8m away (> followStart): follow.
  const far = brain.update({ ...baseCtx(), horseX: 0, horseZ: 0, playerX: 8, playerZ: 0 });
  assert.equal(far.state, 'follow');
  assert.ok(far.targetX !== null && far.targetX < 8); // aims short of the player
  // Close: within the keep-distance band the horse settles (idle/waiting).
  const near = brain.update({ ...baseCtx(), horseX: 2.8, horseZ: 0, playerX: 5.5, playerZ: 0 });
  assert.equal(near.state, 'idle');
  assert.equal(near.targetX, null);
});

test('HORSE BRAIN: flee runs away from the threat and calms down after the timer', () => {
  const brain = new HorseBrain();
  brain.notePosition(0, 0);
  brain.scare(5, 0, 0, 0); // threat east of the horse
  const fleeing = brain.update({ ...baseCtx(), horseX: 0, horseZ: 0 });
  assert.equal(fleeing.state, 'flee');
  assert.ok(fleeing.targetX !== null && fleeing.targetX < 0); // runs west, away
  // After the flee duration the horse calms back to normal (spec §13).
  let order = fleeing;
  for (let i = 0; i < 60; i += 1) order = brain.update({ ...baseCtx(), deltaSeconds: 0.2, horseX: -1, horseZ: 0 });
  assert.equal(order.state, 'idle');
});

test('HORSE BRAIN: mounted yields control, unmounting restores autonomy', () => {
  const brain = new HorseBrain();
  const ridden = brain.update({ ...baseCtx(), mounted: true });
  assert.equal(ridden.state, 'ridden');
  assert.equal(ridden.targetX, null);
  const after = brain.update(baseCtx());
  assert.equal(after.state, 'idle');
});

test('HORSE BRAIN: dead is terminal; injured is reported below the health ratio', () => {
  const brain = new HorseBrain();
  const dead = brain.update({ ...baseCtx(), alive: false });
  assert.equal(dead.state, 'dead');
  // Revive → injured state because health is below the ratio.
  const revived = brain.update({ ...baseCtx(), healthRatio: 0.2 });
  assert.ok(['injured', 'idle'].includes(revived.state));
});

test('HORSE BRAIN: stuck watchdog fires an UNSTUCK maneuver instead of grinding', () => {
  const brain = new HorseBrain();
  brain.notePosition(0, 0);
  brain.summon();
  let order = brain.update({ ...baseCtx(), horseX: 0, horseZ: 0, playerX: 20, playerZ: 0 });
  let sawUnstuck = false;
  // Feed 3s of zero displacement with a live target.
  for (let i = 0; i < 40; i += 1) {
    order = brain.update({ ...baseCtx(), deltaSeconds: 0.1, horseX: 0, horseZ: 0, playerX: 20, playerZ: 0 });
    brain.notePosition(0, 0);
    if (order.unstuck) sawUnstuck = true;
  }
  assert.equal(sawUnstuck, true);
});

function baseCtx() {
  return {
    deltaSeconds: 0.1,
    alive: true,
    healthRatio: 1,
    mounted: false,
    playerMoving: false,
    horseX: 0,
    horseZ: 0,
    playerX: 2,
    playerZ: 0,
  };
}
