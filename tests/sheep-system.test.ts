/**
 * tests/sheep-system.test.ts
 * -----------------------------------------------------------------------------
 * The farm sheep NPC system contracts (user request, spec §1–§5):
 *
 *   1. DETERMINISTIC SPAWN — one seeded mulberry32 stream: identical seed →
 *      identical flock (count, positions, thresholds) on every boot; the
 *      flock size stays inside the 4–7 band.
 *   2. SPAWN GEOMETRY — every spawn point sits inside the pen's walkable
 *      rectangle, clears every collider (trough!), and keeps the spawn
 *      spacing; the rejection sampler never emits an invalid point.
 *   3. BEDTIME — thresholds stagger across 20:00–20:45; the wrap-safe
 *      bedtime predicate sleeps the sheep after the threshold AND through
 *      the night, waking them for the day.
 *   4. PEN CLAMP — the hard clamp is the gate-gap's last line of defense:
 *      any outside point lands inside the rect.
 *   5. LIVE SYSTEM (headless integration) — the real createSheepSystem on a
 *      real THREE.Scene + CollisionWorld: spawns 4–7 on the first tick, all
 *      inside the pen and mutually separated, wanders with real movement,
 *      settles to 'sleeping' past 20:00 (staggered, gradual), wakes in the
 *      morning, and dispose() removes every mesh and releases resources.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CollisionWorld } from '../src/physics/CollisionWorld.js';
import type { CollisionBounds } from '../src/index.js';
import {
  BEDTIME_EASE_SECONDS,
  BEDTIME_HOUR,
  BEDTIME_STAGGER_HOURS,
  PEN_INNER_RECT,
  SHEEP_MIN_SEPARATION,
  SHEEP_SPAWN_SPACING,
  WAKE_HOUR,
  bedtimeThresholds,
  clampToPen,
  createSheepSystem,
  flockSize,
  isBedtimeHour,
  mulberry32,
  pickDestination,
  sampleSpawnPoints,
} from '../game/sheep.js';

/** A fake collider AABB (e.g. the pen trough at x −12.7…−10.9, z −45.31…−44.69). */
function box(minX: number, minZ: number, maxX: number, maxZ: number): CollisionBounds {
  return { uuid: 'fake', min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: 1, z: maxZ } };
}

const insidePen = (p: { x: number; z: number }): boolean =>
  p.x >= PEN_INNER_RECT.minX && p.x <= PEN_INNER_RECT.maxX
  && p.z >= PEN_INNER_RECT.minZ && p.z <= PEN_INNER_RECT.maxZ;

test('SHEEP: mulberry32 is deterministic per seed and seed-sensitive', () => {
  const a = mulberry32(1234);
  const b = mulberry32(1234);
  const c = mulberry32(1235);
  const seqA = Array.from({ length: 8 }, () => a());
  const seqB = Array.from({ length: 8 }, () => b());
  const seqC = Array.from({ length: 8 }, () => c());
  assert.deepEqual(seqA, seqB, 'same seed → identical sequence');
  assert.notDeepEqual(seqA, seqC, 'different seed → different sequence');
  for (const v of seqA) assert.ok(v >= 0 && v < 1, 'samples are unit-interval');
});

test('SHEEP: flockSize stays in the 4–7 band for every seed', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const n = flockSize(mulberry32(seed));
    assert.ok(n >= 4 && n <= 7, `seed ${seed} → ${n} (expected 4..7)`);
  }
});

test('SHEEP: spawn sampling is deterministic and never emits an invalid point', () => {
  const trough = box(-12.7, -45.31, -10.9, -44.69); // the real pen trough
  const a = sampleSpawnPoints(mulberry32(42), 6, [trough]);
  const b = sampleSpawnPoints(mulberry32(42), 6, [trough]);
  assert.deepEqual(a, b, 'same seed → identical layout');
  assert.equal(a.length, 6, 'the requested count is honored');
  for (const p of a) {
    assert.ok(insidePen(p), `spawn (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) inside the pen rect`);
    assert.ok(
      !(p.x > trough.min.x - 0.57 && p.x < trough.max.x + 0.57
        && p.z > trough.min.z - 0.57 && p.z < trough.max.z + 0.57),
      `spawn (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) clears the trough (radius + 0.25 pad)`,
    );
  }
  for (let i = 0; i < a.length; i += 1) {
    for (let j = i + 1; j < a.length; j += 1) {
      const d = Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z);
      assert.ok(d >= SHEEP_SPAWN_SPACING, `spawn pair ${i}/${j} spaced ${d.toFixed(2)} ≥ ${SHEEP_SPAWN_SPACING}`);
    }
  }
});

test('SHEEP: the sampler survives a pen floor made entirely of colliders', () => {
  const wall = box(-20, -50, 20, 20); // covers everything
  const points = sampleSpawnPoints(mulberry32(7), 4, [wall]);
  assert.ok(points.length < 4, 'no invalid spawn point is invented (partial flock is legal)');
  for (const p of points) assert.ok(insidePen(p));
});

test('SHEEP: bedtime thresholds stagger across 20:00–20:45', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const thresholds = bedtimeThresholds(mulberry32(seed), 6);
    assert.equal(thresholds.length, 6);
    for (const t of thresholds) {
      assert.ok(t >= BEDTIME_HOUR && t <= BEDTIME_HOUR + BEDTIME_STAGGER_HOURS,
        `threshold ${t.toFixed(2)} in [${BEDTIME_HOUR}, ${BEDTIME_HOUR + BEDTIME_STAGGER_HOURS}]`);
    }
  }
});

test('SHEEP: the bedtime predicate is wrap-safe (evening on, morning off)', () => {
  const t = 20.3;
  assert.equal(isBedtimeHour(20.3, t), true, 'at the threshold → bedtime');
  assert.equal(isBedtimeHour(21, t), true, 'evening → bedtime');
  assert.equal(isBedtimeHour(23.9, t), true, 'late night → bedtime');
  assert.equal(isBedtimeHour(0, t), true, 'past midnight → bedtime');
  assert.equal(isBedtimeHour(WAKE_HOUR, t), true, '05:30 → still night');
  assert.equal(isBedtimeHour(8, t), false, 'day → awake');
  assert.equal(isBedtimeHour(19.9, t), false, 'just before 20:00 → awake');
});

test('SHEEP: clampToPen pulls any stray point back inside', () => {
  const out = clampToPen(-20, -60);
  assert.ok(insidePen(out), 'far-outside point clamped in');
  const out2 = clampToPen(0, 0);
  assert.ok(insidePen(out2), 'town-center point clamped in');
  const inPlace = clampToPen(-10, -43);
  assert.equal(inPlace.x, -10);
  assert.equal(inPlace.z, -43, 'interior points pass through untouched');
});

test('SHEEP: pickDestination returns clear, spaced spots (or null when crowded)', () => {
  const rng = mulberry32(99);
  const trough = box(-12.7, -45.31, -10.9, -44.69);
  const flockSpots = [{ x: -10, z: -43 }, { x: -8.5, z: -42 }, { x: -12, z: -41.5 }];
  for (let i = 0; i < 30; i += 1) {
    const dest = pickDestination(rng, [trough], flockSpots, 0);
    if (!dest) continue;
    assert.ok(insidePen(dest));
    for (const spot of flockSpots.slice(1)) {
      const d = Math.hypot(spot.x - dest.x, spot.z - dest.z);
      assert.ok(d >= SHEEP_MIN_SEPARATION + 0.4, `destination respects the flock spacing (${d.toFixed(2)})`);
    }
  }
  // A flock covering every reachable corner leaves no valid destination.
  const everywhere: { x: number; z: number }[] = [];
  for (let x = PEN_INNER_RECT.minX; x <= PEN_INNER_RECT.maxX; x += 1.0) {
    for (let z = PEN_INNER_RECT.minZ; z <= PEN_INNER_RECT.maxZ; z += 1.0) everywhere.push({ x, z });
  }
  const stuck = pickDestination(mulberry32(1), [trough], everywhere, 0);
  assert.equal(stuck, null, 'a fully crowded pen yields null (caller grazes instead)');
});

// ---------------------------------------------------------------------------
// Live system (headless integration — real THREE.Scene + CollisionWorld)
// ---------------------------------------------------------------------------

interface TimeSource { hour: number }

function makeSystem(time: TimeSource) {
  const scene = new THREE.Scene();
  const collision = new CollisionWorld(() => [], { floorY: 0 });
  const system = createSheepSystem({
    scene,
    collisionWorld: collision,
    getTimeOfDay: () => time.hour,
  });
  return { scene, collision, system };
}

function step(system: { update(delta: number, paused: boolean): void }, seconds: number, dt = 0.05): void {
  const ticks = Math.round(seconds / dt);
  for (let i = 0; i < ticks; i += 1) system.update(dt, false);
}

test('SHEEP SYSTEM: spawns 4–7 on the first tick, inside the pen and separated', () => {
  const time: TimeSource = { hour: 12 };
  const { scene, system } = makeSystem(time);
  try {
    assert.equal(system.count(), 0, 'no sheep before the first update (spawns after scene load)');
    step(system, 0.1);
    const count = system.count();
    assert.ok(count >= 4 && count <= 7, `flock ${count} in [4,7]`);
    const list = system.snapshots();
    assert.equal(list.length, count);
    const wools = new Set(list.map((s) => s.wool));
    assert.equal(wools.size, 3, 'all three wool variants appear in a full flock');
    for (const s of list) {
      assert.ok(insidePen({ x: s.x, z: s.z }), `sheep ${s.index} inside the pen (${s.x}, ${s.z})`);
      const node = scene.getObjectByName('farm-sheep-system');
      assert.ok(node, 'the system root group lives in the scene');
    }
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const d = Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z);
        assert.ok(d >= SHEEP_MIN_SEPARATION - 0.05, `sheep ${i}/${j} separated (${d.toFixed(2)} m)`);
      }
    }
  } finally {
    system.dispose();
  }
});

test('SHEEP SYSTEM: sheep wander (real movement) and stay inside the pen', () => {
  const time: TimeSource = { hour: 12 };
  const { system } = makeSystem(time);
  try {
    step(system, 0.1);
    const before = system.snapshots();
    step(system, 25); // 25 simulated seconds — wander cycles definitely run
    const after = system.snapshots();
    const moved = after.filter((s, i) => Math.hypot(s.x - before[i].x, s.z - before[i].z) > 0.5);
    assert.ok(moved.length >= 2, `at least two sheep roamed (${moved.length} moved > 0.5 m)`);
    for (const s of after) assert.ok(insidePen({ x: s.x, z: s.z }), `roaming sheep ${s.index} never left the pen`);
  } finally {
    system.dispose();
  }
});

test('SHEEP SYSTEM: bedtime after 20:00 is staggered, gradual, and reversible', () => {
  const time: TimeSource = { hour: 12 };
  const { system } = makeSystem(time);
  try {
    step(system, 0.1);
    time.hour = 20.05; // just past 20:00 — the earliest thresholds fire
    step(system, 1);
    const early = system.snapshots();
    const settling = early.filter((s) => s.bedtimeFactor > 0);
    assert.ok(settling.length > 0, 'the earliest sheep begin settling right after 20:00');
    assert.ok(settling.length < early.length, 'the flock does NOT settle simultaneously (staggered)');
    time.hour = 20.9; // past every staggered threshold (max 20:45) — all easing now
    step(system, BEDTIME_EASE_SECONDS + 3);
    const asleep = system.snapshots();
    assert.ok(asleep.every((s) => s.state === 'sleeping'), 'after the ease window every sheep is settled');
    assert.ok(asleep.every((s) => s.bedtimeFactor > 0.98));
    time.hour = 9; // morning
    step(system, BEDTIME_EASE_SECONDS + 3);
    const awake = system.snapshots();
    assert.ok(awake.every((s) => s.bedtimeFactor < 0.02), 'morning fully reverses the settle');
    assert.ok(awake.some((s) => s.state !== 'sleeping'), 'life resumes');
  } finally {
    system.dispose();
  }
});

test('SHEEP SYSTEM: paused update freezes movement but keeps the settle alive', () => {
  const time: TimeSource = { hour: 12 };
  const { system } = makeSystem(time);
  try {
    step(system, 0.1);
    const before = system.snapshots();
    time.hour = 21;
    const ticks = Math.round((BEDTIME_EASE_SECONDS + 2) / 0.05);
    for (let i = 0; i < ticks; i += 1) system.update(0.05, true); // paused
    const after = system.snapshots();
    for (let i = 0; i < after.length; i += 1) {
      const drift = Math.hypot(after[i].x - before[i].x, after[i].z - before[i].z);
      assert.ok(drift < 0.05, `paused sheep ${i} never moves (drift ${drift.toFixed(3)})`);
    }
    assert.ok(after.every((s) => s.bedtimeFactor > 0.9), 'the time-driven settle still completes while paused');
  } finally {
    system.dispose();
  }
});

test('SHEEP SYSTEM: dispose removes the flock and re-init never duplicates', () => {
  const time: TimeSource = { hour: 12 };
  const scene = new THREE.Scene();
  const collision = new CollisionWorld(() => [], { floorY: 0 });
  const first = createSheepSystem({ scene, collisionWorld: collision, getTimeOfDay: () => time.hour });
  step(first, 0.1);
  const firstCount = first.count();
  assert.ok(firstCount >= 4);
  first.dispose();
  assert.equal(scene.getObjectByName('farm-sheep-system'), undefined, 'the system root is gone');
  assert.equal(first.count(), 0, 'the flock is empty after dispose');

  // Re-initialization (scene re-entry / hot-reload path): the second system
  // spawns ONE flock — the duplicate guard disposed any prior group first.
  const second = createSheepSystem({ scene, collisionWorld: collision, getTimeOfDay: () => time.hour });
  step(second, 0.1);
  assert.equal(second.count(), firstCount, 'the same seed spawns the same flock size');
  let named = 0;
  scene.traverse((o) => {
    if (o.name === 'farm-sheep-system' && o.parent === scene) named += 1;
  });
  assert.equal(named, 1, 'exactly ONE system root exists after re-init');
  second.dispose();
});
