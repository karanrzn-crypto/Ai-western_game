/**
 * RenderGovernor — adaptive DPR ladder + on-demand shadow scheduling.
 *
 * Weak-laptop policy regression tests:
 *   • the ladder tops out at 1.0 and BOOTS at the second rung (0.85) — the
 *     old boot-at-1.5 slideshow is gone;
 *   • a slow machine walks down (two rungs under 12 fps) and can never
 *     climb back without SUSTAINED ≥50 fps proof;
 *   • the shadow scheduler fires on demand: fast cadence while casters
 *     move, slow cadence when only the sun drifts, immediate on invalidate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { AdaptiveResolution, DEFAULT_DPR_LADDER, ShadowScheduler } from '../src/index.js';

interface SinkLog {
  ratios: number[];
}

function makeSink(devicePixelRatio = 1): { sink: { setPixelRatio(r: number): void; getDevicePixelRatio(): number }; log: SinkLog } {
  const log: SinkLog = { ratios: [] };
  return {
    log,
    sink: {
      setPixelRatio: (ratio) => log.ratios.push(ratio),
      getDevicePixelRatio: () => devicePixelRatio,
    },
  };
}

const BOOT = 10_000; // arbitrary epoch ms for performance.now

test('GOVERNOR: boots at the second rung (0.85) capped by the device DPR — never 1.5', () => {
  const { sink, log } = makeSink(1);
  const governor = new AdaptiveResolution({ sink, getDevicePixelRatio: sink.getDevicePixelRatio });
  assert.equal(governor.getPixelRatio(), 0.85);
  assert.deepEqual(log.ratios, [0.85], 'exactly one initial apply');

  const { sink: sink2 } = makeSink(2);
  const governor2 = new AdaptiveResolution({ sink: sink2, getDevicePixelRatio: sink2.getDevicePixelRatio });
  assert.equal(governor2.getPixelRatio(), 0.85, 'device DPR 2 is CAPPED by the rung');
});

test('GOVERNOR: the ladder tops out at 1.0 — no 1.25/1.5 rungs exist anymore', () => {
  assert.deepEqual([...DEFAULT_DPR_LADDER], [1.0, 0.85, 0.75]);
  const { sink, log } = makeSink(1);
  const governor = new AdaptiveResolution({ sink, getDevicePixelRatio: sink.getDevicePixelRatio });
  // Absurd headroom still cannot exceed the ladder top.
  let now = BOOT;
  for (let i = 0; i < 20; i += 1) governor.update(now += 1500, 1 / 120);
  assert.equal(governor.getPixelRatio(), 1.0);
  assert.deepEqual(log.ratios, [0.85, 1.0], 'one boot apply + exactly one climb');
});

test('GOVERNOR: a slideshow (<12 fps) drops two rungs to the floor and stays readable', () => {
  const { sink, log } = makeSink(1);
  const governor = new AdaptiveResolution({ sink, getDevicePixelRatio: sink.getDevicePixelRatio });
  assert.equal(governor.update(BOOT + 4000, 1 / 10), true, 'first check steps down');
  assert.equal(governor.getPixelRatio(), 0.75, '0.85 → floor in ONE check');
  assert.deepEqual(log.ratios, [0.85, 0.75]);
  // The floor is hard: more slow checks never go below it.
  assert.equal(governor.update(BOOT + 5500, 1 / 8), false);
  assert.equal(governor.getPixelRatio(), 0.75);
});

test('GOVERNOR: a weak machine below 21 fps can NEVER climb back — no bounce', () => {
  const { sink } = makeSink(1);
  const governor = new AdaptiveResolution({ sink, getDevicePixelRatio: sink.getDevicePixelRatio });
  let now = BOOT;
  governor.update(now += 1500, 1 / 15); // 15 fps → one rung down (0.75)
  assert.equal(governor.getPixelRatio(), 0.75);
  // 35 fps is "fine" (> 21) but nowhere near the 50 fps climb proof:
  for (let i = 0; i < 10; i += 1) governor.update(now += 1500, 1 / 35);
  assert.equal(governor.getPixelRatio(), 0.75, 'no climb without sustained headroom');
});

test('GOVERNOR: climbing needs consecutive ≥50 fps confirmations, then ONE rung', () => {
  const { sink, log } = makeSink(1);
  const governor = new AdaptiveResolution({ sink, getDevicePixelRatio: sink.getDevicePixelRatio });
  let now = BOOT;
  // One good check: not enough (default confirmations = 2).
  assert.equal(governor.update(now += 1500, 1 / 60), false);
  assert.equal(governor.getPixelRatio(), 0.85);
  // Second consecutive good check: climb exactly one rung.
  assert.equal(governor.update(now += 1500, 1 / 60), true);
  assert.equal(governor.getPixelRatio(), 1.0);
  assert.deepEqual(log.ratios, [0.85, 1.0]);
  // A dip resets the streak — the next good pair climbs nothing (already top).
  assert.equal(governor.update(now += 1500, 1 / 18), true); // 18 fps → down
  assert.equal(governor.getPixelRatio(), 0.85);
  assert.equal(governor.update(now += 1500, 1 / 60), false); // one good check
  assert.equal(governor.update(now += 1500, 1 / 15), true); // dip cancels the streak
  assert.equal(governor.getPixelRatio(), 0.75);
});

test('SHADOWS: fires on demand — fast cadence while casters move, slow when idle', () => {
  const shadows = new ShadowScheduler({ idleIntervalSeconds: 0.15, movingIntervalSeconds: 1 / 30 });
  assert.equal(shadows.update(1 / 60, false), true, 'the very first frame refreshes');
  // Idle: nothing fires until the 150ms cooldown expires.
  assert.equal(shadows.update(0.05, false), false);
  assert.equal(shadows.update(0.05, false), false);
  assert.equal(shadows.update(0.05, false), true, '≈3rd frame at 60fps → 150ms elapsed');
  // A caster STARTING to move refreshes immediately (no trailing shadow).
  assert.equal(shadows.update(1 / 60, true), true, 'rising edge fires at once');
  // Then the moving cadence: roughly every other frame at 60 fps.
  assert.equal(shadows.update(1 / 60, true), false, 'just refreshed');
  assert.equal(shadows.update(1 / 60, true), true, 'moving cadence fires every ~1/30s');
  assert.equal(shadows.update(1 / 60, true), false);
  assert.equal(shadows.update(1 / 60, true), true);
});

test('SHADOWS: invalidate() forces the next refresh (off-cadence edit transforms)', () => {
  const shadows = new ShadowScheduler({});
  assert.equal(shadows.update(1 / 60, false), true);
  assert.equal(shadows.update(0.01, false), false, 'inside the idle cooldown');
  shadows.invalidate();
  assert.equal(shadows.update(0.01, false), true, 'invalidation breaks the cooldown');
});
