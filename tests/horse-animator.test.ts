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
  const expected = 2 * Math.PI * (4.2 / 2.8) * 0.5;
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

test('HORSE ANIMATOR: damage flinch Jerks the neck, then it settles', () => {
  const model = createHorseModel();
  const animator = new HorseAnimator(model);
  animator.update({ deltaSeconds: 0.2, speed: 0, gait: 'idle' });
  const restNeck = model.joints.neck.rotation.x;
  animator.notifyDamage();
  animator.update({ deltaSeconds: 0.12, speed: 0, gait: 'idle' });
  assert.ok(model.joints.neck.rotation.x < restNeck - 0.05, 'flinch must dip/jerk the neck');
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
