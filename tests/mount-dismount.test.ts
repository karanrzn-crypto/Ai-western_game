/**
 * Mount speed-up + dismount choreography tests (controls revision §20/§21).
 *
 * The mount timeline was RE-TIMED (faster, same keyframes) and a short
 * hand-authored DISMOUNT choreography was added. These tests lock the
 * contracts both systems must keep:
 *   - the mount stays SHORT and its phase bounds ordered;
 *   - the dismount is SHORT, starts exactly on SEAT_POSE and ends exactly on
 *     the character animator's standing rest (zero pop at both handovers);
 *   - the dismount root path ends clear of the horse (outside its collision
 *     capsule) on the LEFT flank, facing the horse.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  buildMountTimeline,
  buildDismountTimeline,
  dismountRootPose,
  poseDismountRider,
  applyRiderPose,
  DISMOUNT_STAND,
  MOUNT_FACE_HORSE,
  MOUNT_SEAT_QUATERNION,
  SEAT_POSE,
  HORSE_PROPORTIONS,
  type MountJoints,
} from '../src/index.js';

const EPS = 1e-9;

function makeJoints(): MountJoints {
  const euler = () => new THREE.Euler();
  const joint = () => ({ position: { y: 0 }, rotation: euler() });
  return {
    hips: joint(), spine: joint(), chest: joint(), neck: joint(), head: joint(),
    shoulderL: joint(), elbowL: joint(), shoulderR: joint(), elbowR: joint(),
    legL: joint(), kneeL: joint(), footL: joint(),
    legR: joint(), kneeR: joint(), footR: joint(),
  } as unknown as MountJoints;
}

test('MOUNT TIMELINE: the re-timed mount is short and its phase bounds stay ordered', () => {
  for (const arc of [0.5, 2.4, 3.5, 8]) {
    const timeline = buildMountTimeline(arc);
    assert.ok(timeline.total < 3.5, `total ${timeline.total.toFixed(2)}s must be short (arc ${arc})`);
    assert.ok(timeline.walkEnd > 0 && timeline.walkEnd < timeline.reachEnd);
    assert.ok(timeline.reachEnd < timeline.climbEnd);
    assert.ok(timeline.climbEnd < timeline.swingEnd);
    assert.ok(timeline.swingEnd < timeline.seatEnd);
    assert.ok(timeline.seatEnd < 1);
  }
  // The walk phase can no longer dominate: at a long arc it caps at 1.4s of a
  // ≤ 3.35s total (the old version walked up to 1.9s of ~4.9s).
  const long = buildMountTimeline(30);
  assert.ok(long.walkEnd * long.total <= 1.4 + EPS);
});

test('DISMOUNT TIMELINE: short, ordered, and fully covers [0, 1]', () => {
  const timeline = buildDismountTimeline();
  assert.ok(timeline.total < 2, `dismount must be short (total ${timeline.total.toFixed(2)}s)`);
  assert.ok(timeline.total > 1, 'dismount is not a teleport — it takes over a second');
  assert.ok(timeline.gripEnd > 0 && timeline.gripEnd < timeline.swingEnd);
  assert.ok(timeline.swingEnd < timeline.dropEnd);
  assert.ok(timeline.dropEnd < 1);
});

test('DISMOUNT ROOT: starts seated at the origin, ends standing beside the LEFT flank', () => {
  const timeline = buildDismountTimeline();
  const root = { position: new THREE.Vector3(2, 5, 3), quaternion: new THREE.Quaternion() };

  // t = 0: exactly the seated socket origin, facing the horse's head.
  dismountRootPose(root, 0, timeline);
  assert.equal(root.position.x, 0);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
  assert.ok(root.quaternion.angleTo(MOUNT_SEAT_QUATERNION) < 1e-9, 'starts on the seat quaternion');

  // t = 1: exactly the dismount stand point, facing the horse's flank.
  dismountRootPose(root, 1, timeline);
  assert.ok(Math.abs(root.position.x - DISMOUNT_STAND.x) < 1e-6);
  assert.ok(Math.abs(root.position.y - DISMOUNT_STAND.y) < 1e-6);
  assert.ok(Math.abs(root.position.z - DISMOUNT_STAND.z) < 1e-6);
  assert.ok(root.quaternion.angleTo(MOUNT_FACE_HORSE) < 1e-6, 'lands facing the flank');

  // The stand point is OUTSIDE the horse's collision capsule + player radius:
  // |x| > collisionRadius + 0.35 (the rider's capsule) — no separation push.
  assert.ok(Math.abs(DISMOUNT_STAND.x) > HORSE_PROPORTIONS.collisionRadius + 0.35);
  // And it is on the horse's LEFT side (the proper western dismount side).
  assert.ok(DISMOUNT_STAND.x < 0);
});

test('DISMOUNT ROOT: the descent is monotonic and stays outboard through the drop', () => {
  const timeline = buildDismountTimeline();
  const root = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  let previousY = Infinity;
  for (let i = 1; i <= 40; i += 1) {
    const t = i / 40;
    if (t < timeline.swingEnd) continue; // the stand-up may rise first
    if (t > timeline.dropEnd) break;     // the settle HOLDS the landing height
    dismountRootPose(root, t, timeline);
    assert.ok(root.position.y < previousY, `y must decrease monotonically through the drop (t=${t.toFixed(2)})`);
    previousY = root.position.y;
  }
  // Settle: the root stands still at the landing height (knees absorb, not the root).
  dismountRootPose(root, timeline.dropEnd, timeline);
  const landedY = root.position.y;
  dismountRootPose(root, 1, timeline);
  assert.ok(Math.abs(root.position.y - landedY) < 1e-6, 'the settle phase does not sink or rise');
});

test('DISMOUNT POSE: starts exactly on SEAT_POSE (no pop at dismount start)', () => {
  const timeline = buildDismountTimeline();
  const j = makeJoints();
  applyRiderPose(j);
  poseDismountRider(j, 0, timeline);
  assert.ok(Math.abs(j.hips.position.y - SEAT_POSE.hipsY) < 1e-9);
  assert.ok(Math.abs(j.legR.rotation.x - SEAT_POSE.legRx) < 1e-9);
  assert.ok(Math.abs(j.legR.rotation.z - SEAT_POSE.legRz) < 1e-9);
  assert.ok(Math.abs(j.kneeR.rotation.x - SEAT_POSE.kneeRx) < 1e-9);
  assert.ok(Math.abs(j.shoulderL.rotation.x - SEAT_POSE.shoulderL.rx) < 1e-9);
  assert.ok(Math.abs(j.elbowR.rotation.x - SEAT_POSE.elbowR) < 1e-9);
});

test('DISMOUNT POSE: ends exactly on the animator standing rest (no pop at handover)', () => {
  const timeline = buildDismountTimeline();
  const j = makeJoints();
  poseDismountRider(j, 1, timeline);
  // The character animator's rest: hips 0.96, HANG legs (rx 0 / knee −0.06),
  // rest arms (rz ∓0.07, elbows 0.22), neutral spine/head.
  assert.ok(Math.abs(j.hips.position.y - 0.96) < 0.01);
  assert.ok(Math.abs(j.legL.rotation.x) < 0.01, 'left thigh at rest');
  assert.ok(Math.abs(j.kneeL.rotation.x + 0.06) < 0.01, 'left knee at rest');
  assert.ok(Math.abs(j.legR.rotation.x) < 0.01, 'right thigh at rest after the swing');
  assert.ok(Math.abs(j.kneeR.rotation.x + 0.06) < 0.01, 'right knee at rest after the swing');
  assert.ok(Math.abs(j.shoulderL.rotation.z + 0.07) < 0.01, 'left shoulder rest');
  assert.ok(Math.abs(j.shoulderR.rotation.z - 0.07) < 0.01, 'right shoulder rest');
  assert.ok(Math.abs(j.elbowL.rotation.x - 0.22) < 0.02, 'left elbow rest');
  assert.ok(Math.abs(j.elbowR.rotation.x - 0.22) < 0.02, 'right elbow rest');
  assert.ok(Math.abs(j.spine.rotation.x) < 0.01);
  assert.ok(Math.abs(j.head.rotation.x) < 0.01);
});

test('DISMOUNT POSE: the right leg swings through the air (not glued to the seat)', () => {
  const timeline = buildDismountTimeline();
  const j = makeJoints();
  // Mid-swing the right thigh must have LEFT the seated drape and the knee
  // must fold — the boot arcs over the cantle, it never drags through it.
  const midSwing = timeline.swingEnd * 0.75;
  poseDismountRider(j, midSwing, timeline);
  assert.ok(Math.abs(j.legR.rotation.x - SEAT_POSE.legRx) > 0.4, 'right thigh departs the seat pose');
  assert.ok(j.kneeR.rotation.x < -0.8, 'right knee folds during the swing');
});
