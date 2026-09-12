import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DayNightCycle } from '../src/index.js';

interface Frame {
  intensity: number;
  hemi: number;
  sky: THREE.Color;
  fog: THREE.Color;
  sunColor: THREE.Color;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
}

function createCycle(startTime = 8): { scene: THREE.Scene; sun: THREE.DirectionalLight; hemisphere: THREE.HemisphereLight; cycle: DayNightCycle } {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 1, 100);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  scene.add(sun, hemisphere);
  const cycle = new DayNightCycle(scene, sun, hemisphere, { dayDurationSeconds: 120, startTime });
  return { scene, sun, hemisphere, cycle };
}

function sampleFrame(scene: THREE.Scene, sun: THREE.DirectionalLight, hemisphere: THREE.HemisphereLight, cycle: DayNightCycle, hour: number): Frame {
  cycle.setTimeOfDay(hour);
  const sky = scene.background as THREE.Color;
  const fog = (scene.fog as THREE.Fog).color;
  // Effective shadow-casting direction: light position -> light target.
  // A DOWNWARD-pointing direction (dir.y < 0) means the light sits above the
  // horizon plane; -dir.y is the sine of its elevation angle.
  const dir = sun.target.position.clone().sub(sun.position).normalize();
  return {
    intensity: sun.intensity,
    hemi: hemisphere.intensity,
    sky: sky.clone(),
    fog: fog.clone(),
    sunColor: sun.color.clone(),
    pos: sun.position.clone(),
    dir,
  };
}

// Sine of the shadow-casting light's elevation above the horizon plane.
// Positive and >= floor while the light shines down from above; a negative or
// near-zero value means the light grazes or shines upward from underground.
function shadowElevation(frame: Frame): number { return -frame.dir.y; }

function colorDelta(a: THREE.Color, b: THREE.Color): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}
function vecDelta(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}
function assertChannelContinuity(prev: Frame, cur: Frame, caps: {
  intensity: number; hemi: number; color: number; pos: number; dir: number;
}, hour: number): void {
  assert.ok(Math.abs(cur.intensity - prev.intensity) <= caps.intensity, `sun intensity jump ${prev.intensity.toFixed(4)} -> ${cur.intensity.toFixed(4)} at h=${hour.toFixed(2)}`);
  assert.ok(Math.abs(cur.hemi - prev.hemi) <= caps.hemi, `hemisphere intensity jump at h=${hour.toFixed(2)}`);
  assert.ok(colorDelta(cur.sky, prev.sky) <= caps.color, `sky color jump at h=${hour.toFixed(2)}`);
  assert.ok(colorDelta(cur.fog, prev.fog) <= caps.color, `fog color jump at h=${hour.toFixed(2)}`);
  assert.ok(colorDelta(cur.sunColor, prev.sunColor) <= caps.color, `sun color jump at h=${hour.toFixed(2)}`);
  assert.ok(vecDelta(cur.pos, prev.pos) <= caps.pos, `sun position jump at h=${hour.toFixed(2)}`);
  assert.ok(vecDelta(cur.dir, prev.dir) <= caps.dir, `shadow direction jump at h=${hour.toFixed(2)}`);
}

test('day/night channels are continuous across the whole 24h cycle', () => {
  const { scene, sun, hemisphere, cycle } = createCycle(0);
  const STEP = 0.02;
  const caps = { intensity: 0.03, hemi: 0.02, color: 0.025, pos: 0.6, dir: 0.03 };
  let prev = sampleFrame(scene, sun, hemisphere, cycle, 0);
  for (let i = 1; i <= 1200; i += 1) {
    const hour = (i * STEP) % 24;
    const cur = sampleFrame(scene, sun, hemisphere, cycle, hour);
    assertChannelContinuity(prev, cur, caps, hour);
    assert.ok(shadowElevation(cur) >= 0.15, `shadow elevation collapsed (${shadowElevation(cur).toFixed(3)}) at h=${hour.toFixed(2)}`);
    prev = cur;
  }
});

test('no jump across any keyframe boundary, including 17.99 -> 18.00 -> 18.01', () => {
  const { scene, sun, hemisphere, cycle } = createCycle(0);
  const boundaries = [0, 6, 8, 12, 15, 18, 20];
  for (const H of boundaries) {
    for (const eps of [0.01, 0.05]) {
      // Per-0.01h caps; the 0.05h pass scales the same slopes by 5x.
      const scale = eps / 0.01;
      const caps = { intensity: 0.01 * scale, hemi: 0.006 * scale, color: 0.012 * scale, pos: 0.15 * scale, dir: 0.012 * scale };
      const before = sampleFrame(scene, sun, hemisphere, cycle, (H - eps + 24) % 24);
      const at = sampleFrame(scene, sun, hemisphere, cycle, H);
      const after = sampleFrame(scene, sun, hemisphere, cycle, (H + eps) % 24);
      assertChannelContinuity(before, at, caps, H - eps);
      assertChannelContinuity(at, after, caps, H + eps);
    }
  }
});

test('explicit 17.99 / 18.00 / 18.01 sunset boundary keeps intensity, colors, position and shadows stable', () => {
  const { scene, sun, hemisphere, cycle } = createCycle(0);
  const before = sampleFrame(scene, sun, hemisphere, cycle, 17.99);
  const at = sampleFrame(scene, sun, hemisphere, cycle, 18.0);
  const after = sampleFrame(scene, sun, hemisphere, cycle, 18.01);
  const caps = { intensity: 0.01, hemi: 0.006, color: 0.012, pos: 0.15, dir: 0.012 };
  assertChannelContinuity(before, at, caps, 17.99);
  assertChannelContinuity(at, after, caps, 18.01);
  // Behavior at 18:00 itself is preserved: sun exactly at the horizon while
  // the shadow-casting direction still points down from above the horizon.
  cycle.setTimeOfDay(18);
  assert.ok(Math.abs(sun.position.y) <= 0.0001, 'sun must sit on the horizon at 18:00');
  const liveDir = sun.target.position.clone().sub(sun.position).normalize();
  assert.ok(-liveDir.y >= 0.15, 'shadow direction must stay above the horizon at 18:00');
});

test('keyframe values at 12:00, 18:00 and 00:00 are preserved exactly', () => {
  const { scene, sun, hemisphere, cycle } = createCycle(0);
  cycle.setTimeOfDay(12);
  assert.equal(sun.intensity, 2.35);
  assert.equal(hemisphere.intensity, 1.04);
  assert.equal((scene.background as THREE.Color).getHex(), 0xbdd8f0);
  assert.equal((scene.fog as THREE.Fog).color.getHex(), 0xb4cfe6);
  assert.equal(sun.color.getHex(), 0xffffff);
  assert.ok(Math.abs(sun.position.y - 42) < 1e-6);
  cycle.setTimeOfDay(18);
  assert.equal(sun.intensity, 0.62);
  assert.equal(hemisphere.intensity, 0.42);
  assert.equal((scene.background as THREE.Color).getHex(), 0xe19a70);
  assert.equal((scene.fog as THREE.Fog).color.getHex(), 0xc88361);
  assert.equal(sun.color.getHex(), 0xffb070);
  cycle.setTimeOfDay(0);
  assert.equal(sun.intensity, 0.05);
  assert.equal(hemisphere.intensity, 0.16);
  assert.equal((scene.background as THREE.Color).getHex(), 0x0f1622);
  assert.equal((scene.fog as THREE.Fog).color.getHex(), 0x121926);
  assert.equal(sun.color.getHex(), 0x8aa0c5);
});

test('shadow-casting direction never dips below the horizon at any hour', () => {
  const { sun, cycle } = createCycle(0);
  for (let i = 0; i < 480; i += 1) {
    const hour = i * 0.05;
    cycle.setTimeOfDay(hour);
    const dir = sun.target.position.clone().sub(sun.position).normalize();
    assert.ok(-dir.y >= 0.15, `shadow elevation collapsed (${(-dir.y).toFixed(3)}) at h=${hour.toFixed(2)}`);
  }
  // After sunset the visual sun is below the horizon yet the effective light
  // direction still points downward from above it — shadows fade with
  // intensity instead of vanishing at a fixed hour.
  cycle.setTimeOfDay(18.5);
  assert.ok(sun.position.y < 0, 'visual sun should be below the horizon at 18:30');
  const dir1830 = sun.target.position.clone().sub(sun.position).normalize();
  assert.ok(-dir1830.y >= 0.15, 'shadows must persist right after sunset');
});

test('real-time update() crosses 18:00 without any discontinuity', () => {
  const { scene, sun, hemisphere, cycle } = createCycle(17.8);
  const caps = { intensity: 0.06, hemi: 0.03, color: 0.06, pos: 1.3, dir: 0.08 };
  let prev = sampleFrame(scene, sun, hemisphere, cycle, cycle.getTimeOfDay());
  for (let i = 0; i < 6; i += 1) {
    cycle.update(0.5); // 0.1h per step with dayDurationSeconds = 120
    const cur = sampleFrame(scene, sun, hemisphere, cycle, cycle.getTimeOfDay());
    assertChannelContinuity(prev, cur, caps, cycle.getTimeOfDay());
    prev = cur;
  }
});
