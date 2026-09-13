/**
 * Part 3 — HorseAnimator & HorsePersistence tests (spec §1/§12/§17).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createHorseModel,
  HorseAnimator,
  HorsePersistence,
  HORSE_PROPORTIONS,
  GAIT_PHASES,
  HORSE_GAITS,
  validateHorseSave,
} from '../src/index.js';

test('HORSE MODEL: builds the full rig with rider socket and disposes cleanly', () => {
  const model = createHorseModel();
  const names = Object.keys(model.joints);
  for (const joint of ['body', 'neck', 'head', 'earL', 'earR', 'tail', 'legFL', 'kneeFL', 'legBL', 'kneeBR']) {
    assert.ok(names.includes(joint), `joint ${joint} missing`);
  }
  assert.equal(model.root.name, 'horse-root');
  assert.equal(model.riderSocket.parent, model.root);
  assert.ok(Math.abs(model.riderSocket.position.y - HORSE_PROPORTIONS.riderFeetY) < 1e-9);
  model.updateLOD(new THREE.Vector3());
  model.setDetailVisible(false);
  model.dispose();
});

test('HORSE ANIMATOR: standing horse never plays a locomotion cycle (spec §1)', () => {
  const model = createHorseModel();
  const animator = new HorseAnimator(model);
  for (let i = 0; i < 30; i += 1) animator.update({ deltaSeconds: 1 / 60, speed: 0, gait: 'trot' });
  assert.ok(Math.abs(model.joints.legFL.rotation.x) < 0.02, 'front leg must stay at rest');
  assert.ok(Math.abs(model.joints.legBR.rotation.x) < 0.02, 'hind leg must stay at rest');
  assert.equal(animator.getPhase(), 0);
});

test('HORSE ANIMATOR: leg cycle advances with REAL speed (phase ∝ speed/stride)', () => {
  const model = createHorseModel();
  const animator = new HorseAnimator(model);
  animator.update({ deltaSeconds: 0.5, speed: HORSE_PROPORTIONS ? 4.2 : 4.2, gait: 'trot' });
  // Stride comes from the gait table (already scaled by HORSE_SCALE — §6):
  // a smaller animal covers less ground per footfall, so the cycle rate is
  // speed / (actual stride), not speed / reference-stride.
  const expected = 2 * Math.PI * (4.2 / HORSE_GAITS.trot.stride) * 0.5;
  assert.ok(Math.abs(animator.getPhase() - expected) < 1e-6, `phase ${animator.getPhase()} vs ${expected}`);
  // Legs actually swing while moving.
  assert.ok(Math.abs(model.joints.legFL.rotation.x) > 0.05);
});

test('HORSE ANIMATOR: zero speed freezes the phase even in a moving gait', () => {
  const model = createHorseModel();
  const animator = new HorseAnimator(model);
  animator.update({ deltaSeconds: 0.5, speed: 4.2, gait: 'trot' });
  const phase = animator.getPhase();
  animator.update({ deltaSeconds: 0.5, speed: 0, gait: 'trot' });
  assert.equal(animator.getPhase(), phase);
});

// --- Controls revision §5: gait phase hygiene --------------------------------

const GAITS = ['walk', 'trot', 'canter', 'gallop'] as const;
const mod2pi = (a: number): number => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
/** Signed angular distance in (-π, π]. */
const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

test('HORSE GAITS: front legs are never synchronized and every leg is distinct, in every gait', () => {
  for (const gait of GAITS) {
    const { fl, fr, bl, br } = GAIT_PHASES[gait];
    const offsets = [
      ['fl', mod2pi(fl)], ['fr', mod2pi(fr)], ['bl', mod2pi(bl)], ['br', mod2pi(br)],
    ] as const;
    // Front pair: never identical (mod 2π) — the core §5 guarantee.
    assert.notEqual(offsets[0][1], offsets[1][1], `${gait}: front legs synchronized`);
    // ALL four offsets pairwise distinct (mod 2π).
    for (let i = 0; i < offsets.length; i += 1) {
      for (let k = i + 1; k < offsets.length; k += 1) {
        assert.ok(
          Math.abs(offsets[i][1] - offsets[k][1]) > 1e-9,
          `${gait}: ${offsets[i][0]} and ${offsets[k][0]} share phase ${offsets[i][1]}`,
        );
      }
    }
  }
});

test('HORSE GAITS: the phase patterns stay believable western gaits', () => {
  // Walk: evenly quartered 4-beat lateral sequence.
  const walk = GAIT_PHASES.walk;
  const walkSlots = [walk.bl, walk.fl, walk.br, walk.fr].map(mod2pi).sort((a, b) => a - b);
  for (let i = 0; i < 4; i += 1) {
    assert.ok(Math.abs(walkSlots[i] - i * (Math.PI / 2)) < 1e-6, `walk quarter beat ${i} off (${walkSlots[i]})`);
  }
  // Trot: diagonal pairs preserved (LF≈BR, FR≈BL within the small dissociation).
  const trot = GAIT_PHASES.trot;
  assert.ok(Math.abs(wrapPi(trot.fl - trot.br)) < 0.2, 'trot LF+BR diagonal pair');
  assert.ok(Math.abs(wrapPi(trot.fr - trot.bl)) < 0.2, 'trot FR+BL diagonal pair');
  assert.ok(Math.abs(Math.abs(wrapPi(trot.fl - trot.fr)) - Math.PI) < 0.2, 'trot pairs half a cycle apart');
  // Canter: 3-beat transverse — RH leads, LH+RF pair, LF lead fore.
  const canter = GAIT_PHASES.canter;
  assert.equal(mod2pi(canter.br), 0, 'canter RH first beat');
  assert.ok(Math.abs(wrapPi(canter.bl - canter.fr)) < 0.2, 'canter LH+RF diagonal pair');
  assert.ok(Math.abs(mod2pi(canter.fl - canter.br) - Math.PI * 4 / 3) < 0.2, 'canter lead fore on the third beat');
  // Gallop: transverse order RH → LH → RF → LF with tight pairs.
  const gallop = GAIT_PHASES.gallop;
  const order = [gallop.br, gallop.bl, gallop.fr, gallop.fl].map(mod2pi);
  assert.ok(order[0] < order[1] && order[1] < order[2] && order[2] < order[3], 'gallop transverse footfall order');
  assert.ok(order[1] - order[0] < Math.PI / 2, 'gallop hind pair close');
  assert.ok(order[3] - order[2] < Math.PI / 2, 'gallop front pair close');
});

test('HORSE ANIMATOR: canter drives the front legs with visibly different angles', () => {
  // Behavioral check on the rig: sample one full canter cycle and confirm the
  // two front hips never hold the same rotation angle at the same instant.
  const model = createHorseModel();
  const animator = new HorseAnimator(model);
  let maxSync = 0;
  for (let i = 0; i < 240; i += 1) {
    animator.update({ deltaSeconds: 1 / 60, speed: 7.0, gait: 'canter' });
    maxSync = Math.max(maxSync, Math.abs(model.joints.legFL.rotation.x - model.joints.legFR.rotation.x));
  }
  assert.ok(maxSync > 0.15, `front legs must diverge in canter (max |Δrx| ${maxSync.toFixed(3)})`);
});

test('HORSE GAITS: each leg plays a FOOTFALL waveform (contact → support → lift → swing → plant)', () => {
  // The leg cycle is not a sine: driving the rig at a fixed speed, each leg
  // must show (a) a planted SUPPORT window where the hip sweeps back at
  // ~ground speed (monotonic, near-linear), (b) a folded knee mid-SWING far
  // deeper than any stance flexion, and (c) the swing ending protracted
  // (plant) — for every gait, on every leg.
  for (const gait of ['walk', 'trot', 'canter', 'gallop'] as const) {
    const spec = HORSE_GAITS[gait];
    const model = createHorseModel();
    const animator = new HorseAnimator(model);
    // Advance into the gait so smoothing settles.
    for (let i = 0; i < 60; i += 1) animator.update({ deltaSeconds: 1 / 120, speed: spec.speed, gait });
    const legs = ['legFL', 'legFR', 'legBL', 'legBR'] as const;
    const knees = ['kneeFL', 'kneeFR', 'kneeBL', 'kneeBR'] as const;
    const N = 480;
    const hip: number[][] = [[], [], [], []];
    const knee: number[][] = [[], [], [], []];
    for (let i = 0; i < N; i += 1) {
      animator.update({ deltaSeconds: 1 / 120, speed: spec.speed, gait });
      for (let l = 0; l < 4; l += 1) {
        hip[l].push(model.joints[legs[l]].rotation.x);
        knee[l].push(model.joints[knees[l]].rotation.x);
      }
    }
    for (let l = 0; l < 4; l += 1) {
      const minKnee = Math.min(...knee[l]);
      // (b) mid-swing fold: the deepest knee flexion clearly exceeds the
      // stance absorption dip, scaling with the gait's swing amplitude (the
      // pose smoothing damps the peak ~20% at these cycle rates — the bar
      // accounts for that).
      assert.ok(minKnee < -(0.16 + spec.swing * 0.45), `${gait} leg ${l}: swing fold too shallow (${minKnee.toFixed(3)})`);
      // (c) plant: the hip reaches its most protracted angle at some point
      // and its most retracted angle half a stance away (a real sweep).
      const maxHip = Math.max(...hip[l]);
      const minHip = Math.min(...hip[l]);
      assert.ok(maxHip - minHip > spec.swing * 0.6, `${gait} leg ${l}: hip sweep too small (${(maxHip - minHip).toFixed(3)})`);
      // (a) support: somewhere in the cycle the hip moves monotonically back
      // over a contiguous stretch (the planted sweep), not oscillating. The
      // expected run length = duty × cycle time × sample rate (×0.7 slack).
      let bestRun = 0;
      let run = 0;
      for (let i = 1; i < N; i += 1) {
        if (hip[l][i] < hip[l][i - 1] - 1e-4) run += 1;
        else run = 0;
        bestRun = Math.max(bestRun, run);
      }
      const duty = [0.62, 0.52, 0.28, 0.22][['walk', 'trot', 'canter', 'gallop'].indexOf(gait)];
      const cycleSeconds = spec.stride / spec.speed;
      const expectedRun = duty * cycleSeconds * 120;
      assert.ok(bestRun > expectedRun * 0.7, `${gait} leg ${l}: no planted back-sweep (run ${bestRun}, expected ~${expectedRun.toFixed(0)})`);
    }
  }
});

test('HORSE ANIMATOR: graze/headLow never render while the horse is moving', () => {
  const model = createHorseModel();
  const animator = new HorseAnimator(model);
  // Deep graze pose reference (standing): the neck reaches far down.
  for (let i = 0; i < 90; i += 1) {
    animator.update({ deltaSeconds: 1 / 60, speed: 0, gait: 'idle', idleAction: 'graze', idleActionTime: i / 60 });
  }
  const grazeNeck = model.joints.neck.rotation.x;
  // Down-forward convention (negative rx swings the neck's top toward the
  // head side — the muzzle approaches the ground; positive rx pointed the
  // muzzle at the sky, which is what the old broken sign produced).
  assert.ok(grazeNeck < -1.2, `grazing neck reaches down-forward (${grazeNeck.toFixed(2)})`);
  // Moving with the (stale) graze action still active: the neck must stay up —
  // the gait pose owns the neck, the idle action is suppressed entirely.
  for (let i = 0; i < 30; i += 1) {
    animator.update({ deltaSeconds: 1 / 60, speed: 4.2, gait: 'walk', idleAction: 'graze', idleActionTime: 2 });
  }
  assert.ok(model.joints.neck.rotation.x < 0.3, `neck stays up while moving (${model.joints.neck.rotation.x.toFixed(2)})`);
  assert.ok(model.joints.neck.rotation.x > grazeNeck + 0.3, 'moving neck is nothing like the graze pose');
  // Same guarantee for headLow.
  for (let i = 0; i < 30; i += 1) {
    animator.update({ deltaSeconds: 1 / 60, speed: 4.2, gait: 'walk', idleAction: 'headLow', idleActionTime: 2 });
  }
  assert.ok(model.joints.neck.rotation.x < 0.3, 'headLow also suppressed while moving');
});

test('HORSE ANIMATOR: damage flinch Jerks the neck, then it settles', () => {
  const model = createHorseModel();
  const animator = new HorseAnimator(model);
  animator.update({ deltaSeconds: 0.2, speed: 0, gait: 'idle' });
  const restNeck = model.joints.neck.rotation.x;
  animator.notifyDamage();
  animator.update({ deltaSeconds: 0.12, speed: 0, gait: 'idle' });
  // The flinch JERKS the head UP-back (positive rx) — the corrected sign.
  assert.ok(model.joints.neck.rotation.x > restNeck + 0.05, 'flinch must jerk the head up-back');
  for (let i = 0; i < 60; i += 1) animator.update({ deltaSeconds: 1 / 60, speed: 0, gait: 'idle' });
  assert.ok(Math.abs(model.joints.neck.rotation.x - restNeck) < 0.03, 'flinch settles back');
});

test('HORSE ANIMATOR: death timeline collapses the horse onto its side', () => {
  const model = createHorseModel();
  const animator = new HorseAnimator(model);
  for (let i = 0; i < 120; i += 1) animator.update({ deltaSeconds: 1 / 30, speed: 0, gait: 'dead' });
  assert.ok(model.root.rotation.z > 1.3, `rolled onto the side (z=${model.root.rotation.z})`);
  assert.ok(model.joints.body.position.y < HORSE_PROPORTIONS.bodyCenterY * 0.6, 'body sank');
});

test('HORSE ANIMATOR: reset restores the rest pose instantly', () => {
  const model = createHorseModel();
  const animator = new HorseAnimator(model);
  for (let i = 0; i < 60; i += 1) animator.update({ deltaSeconds: 1 / 30, speed: 0, gait: 'dead' });
  animator.reset();
  assert.equal(model.root.rotation.z, 0);
  assert.ok(Math.abs(model.joints.body.position.y - HORSE_PROPORTIONS.bodyCenterY) < 1e-9);
});

test('HORSE PERSISTENCE: strict validation discards corrupt payloads', () => {
  assert.ok(validateHorseSave({ version: 1, position: { x: 1, y: 0, z: 2 }, yaw: 0.5, health: 80, stamina: 55, alive: true }));
  assert.equal(validateHorseSave({ version: 2, position: { x: 1, y: 0, z: 2 }, yaw: 0, health: 80, stamina: 55, alive: true }), null);
  assert.equal(validateHorseSave({ version: 1, position: { x: 'x', y: 0, z: 2 }, yaw: 0, health: 80, stamina: 55, alive: true }), null);
  assert.equal(validateHorseSave({ version: 1, position: { x: 999, y: 0, z: 2 }, yaw: 0, health: 80, stamina: 55, alive: true }), null);
  assert.equal(validateHorseSave({ version: 1, position: { x: 1, y: 0, z: 2 }, yaw: 0, health: 80, stamina: 55 }), null);
  assert.equal(validateHorseSave(null), null);
});

test('HORSE PERSISTENCE: save/load round-trip through a storage stub', () => {
  const backing = new Map<string, string>();
  const storage = {
    getItem: (key: string): string | null => backing.get(key) ?? null,
    setItem: (key: string, value: string): void => { backing.set(key, value); },
  };
  const persistence = new HorsePersistence({ storage });
  assert.equal(persistence.load(), null); // nothing saved yet
  persistence.save({ version: 1, position: { x: -4, y: 0, z: 8 }, yaw: 2.2, health: 60, stamina: 12.4, alive: true });
  const loaded = persistence.load();
  assert.ok(loaded);
  assert.equal(loaded!.position.x, -4);
  assert.equal(loaded!.yaw, 2.2);
  assert.equal(loaded!.health, 60);
  assert.equal(loaded!.alive, true);
  // Corrupt JSON → discarded, not thrown.
  backing.set('k', '{broken');
  const corrupt = new HorsePersistence({ key: 'k', storage });
  assert.equal(corrupt.load(), null);
});
