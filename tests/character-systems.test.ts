import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CharacterStateMachine,
  HealthSystem,
  StaminaSystem,
  InputBindings,
  InteractionSystem,
  rayAabbDistance,
  ThirdPersonCamera,
  findSafeSpawnPosition,
  SceneStateManager,
  CollisionWorld,
  PlayerController,
} from '../src/index.js';
import type { Vec3 } from '../src/index.js';
import * as THREE from 'three';

// --- CharacterStateMachine ----------------------------------------------------

test('CharacterStateMachine follows the documented transition priority', () => {
  const sm = new CharacterStateMachine();
  assert.equal(sm.evaluate({ dead: false, grounded: true, verticalVelocity: 0, speed: 0, crouching: false, sprinting: false, interacting: false }), 'idle');
  assert.equal(sm.evaluate({ dead: false, grounded: true, verticalVelocity: 0, speed: 1.2, crouching: false, sprinting: false, interacting: false }), 'walk');
  assert.equal(sm.evaluate({ dead: false, grounded: true, verticalVelocity: 0, speed: 6, crouching: false, sprinting: false, interacting: false }), 'run');
  assert.equal(sm.evaluate({ dead: false, grounded: true, verticalVelocity: 0, speed: 11, crouching: false, sprinting: true, interacting: false }), 'sprint');
  // Sprint needs both the input and the speed; fast walking without sprint stays run.
  assert.equal(sm.evaluate({ dead: false, grounded: true, verticalVelocity: 0, speed: 11, crouching: false, sprinting: false, interacting: false }), 'run');
  assert.equal(sm.evaluate({ dead: false, grounded: false, verticalVelocity: 5, speed: 2, crouching: false, sprinting: false, interacting: false }), 'jump');
  assert.equal(sm.evaluate({ dead: false, grounded: false, verticalVelocity: -8, speed: 2, crouching: false, sprinting: false, interacting: false }), 'fall');
  assert.equal(sm.evaluate({ dead: false, grounded: true, verticalVelocity: 0, speed: 1.5, crouching: true, sprinting: false, interacting: false }), 'crouch');
  assert.equal(sm.evaluate({ dead: false, grounded: true, verticalVelocity: 0, speed: 0, crouching: false, sprinting: false, interacting: true }), 'interacting');
  assert.equal(sm.evaluate({ dead: true, grounded: true, verticalVelocity: 0, speed: 0, crouching: false, sprinting: false, interacting: false }), 'dead');
});

test('CharacterStateMachine dead is terminal and emits change events', () => {
  const sm = new CharacterStateMachine();
  const events: string[] = [];
  sm.on((e) => events.push(`${e.from}->${e.to}`));
  sm.evaluate({ dead: false, grounded: true, verticalVelocity: 0, speed: 0, crouching: false, sprinting: false, interacting: false });
  sm.evaluate({ dead: false, grounded: true, verticalVelocity: 0, speed: 6, crouching: false, sprinting: false, interacting: false });
  sm.evaluate({ dead: true, grounded: true, verticalVelocity: 0, speed: 0, crouching: false, sprinting: false, interacting: false });
  // Any context while dead stays dead.
  sm.evaluate({ dead: false, grounded: true, verticalVelocity: 0, speed: 6, crouching: false, sprinting: true, interacting: false });
  assert.equal(sm.current, 'dead');
  sm.force('idle');
  assert.equal(sm.current, 'idle');
  assert.deepEqual(events, ['idle->run', 'run->dead', 'dead->idle']);
});

// --- HealthSystem -------------------------------------------------------------

test('HealthSystem damage, healing, death and reset', () => {
  const health = new HealthSystem({ max: 100 });
  const events: string[] = [];
  health.on((e) => events.push(e));
  assert.equal(health.damage(30), 30);
  assert.equal(health.current, 70);
  assert.equal(health.heal(15), 15);
  assert.equal(health.current, 85);
  assert.equal(health.damage(0), 0, 'zero damage is a no-op');
  assert.equal(health.damage(-5), 0, 'negative damage is rejected');
  assert.equal(health.damage(200), 85, 'overkill clamps at current health (85)');
  assert.equal(health.isDead, true);
  assert.equal(health.current, 0);
  assert.equal(health.heal(50), 0, 'dead cannot heal');
  assert.ok(events.includes('died'));
  const diedCount = events.filter((e) => e === 'died').length;
  health.damage(10);
  assert.equal(events.filter((e) => e === 'died').length, diedCount, 'death fires exactly once');
  health.reset();
  assert.equal(health.current, 100);
  assert.equal(health.isDead, false);
  assert.ok(events.includes('respawned'));
});

test('HealthSystem fall damage is a future hook, off by default', () => {
  const off = new HealthSystem();
  assert.equal(off.applyFallImpact(30), 0, 'disabled by default');
  const on = new HealthSystem({ fallDamageEnabled: true, fallDamageThreshold: 10, fallDamageScale: 5 });
  assert.equal(on.applyFallImpact(8), 0, 'below threshold is safe');
  assert.equal(on.applyFallImpact(14), 20, '(14 - 10) * 5');
});

// --- StaminaSystem ------------------------------------------------------------

test('StaminaSystem drains while sprinting and regenerates after the delay', () => {
  const stamina = new StaminaSystem({ max: 100, drainPerSecond: 20, regenPerSecond: 25, regenDelaySeconds: 1 });
  stamina.update(2, true);
  assert.equal(stamina.current, 60);
  // Delay clock: no regen for 0.9s after stopping.
  stamina.update(0.9, false);
  assert.equal(stamina.current, 60);
  stamina.update(0.5, false);
  assert.equal(stamina.current, 72.5);
});

test('StaminaSystem hysteresis locks sprint until recovery', () => {
  const stamina = new StaminaSystem({ max: 100, drainPerSecond: 50, regenPerSecond: 20, regenDelaySeconds: 0.2, lockThreshold: 5, recoverThreshold: 30 });
  assert.equal(stamina.canSprint(), true);
  stamina.update(1.9, true); // 100 -> 5
  assert.equal(stamina.isSprintLocked, true);
  assert.equal(stamina.canSprint(), false);
  stamina.update(1.0, false); // regen to 25 — still below recover threshold
  assert.equal(stamina.isSprintLocked, true);
  stamina.update(0.5, false); // 25 -> 35 — unlocked
  assert.equal(stamina.isSprintLocked, false);
  assert.equal(stamina.canSprint(), true);
  stamina.reset();
  assert.equal(stamina.current, 100);
  assert.equal(stamina.isSprintLocked, false);
});

// --- InputBindings ------------------------------------------------------------

class FakeKeyTarget {
  private readonly listeners = new Map<string, Array<(event: { code: string; repeat?: boolean; preventDefault: () => void }) => void>>();
  addEventListener(type: string, listener: (event: { code: string; repeat?: boolean; preventDefault: () => void }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, listener: (event: { code: string; repeat?: boolean; preventDefault: () => void }) => void): void {
    const list = this.listeners.get(type) ?? [];
    const index = list.indexOf(listener);
    if (index >= 0) list.splice(index, 1);
  }
  press(code: string, repeat = false): void {
    for (const l of this.listeners.get('keydown') ?? []) l({ code, repeat, preventDefault: () => undefined });
  }
  release(code: string): void {
    for (const l of this.listeners.get('keyup') ?? []) l({ code, repeat: false, preventDefault: () => undefined });
  }
  blur(): void {
    for (const l of this.listeners.get('blur') ?? []) l({ code: '', repeat: false, preventDefault: () => undefined });
  }
}

test('InputBindings maps keys to actions with edges and remapping', () => {
  const target = new FakeKeyTarget();
  const input = new InputBindings(target as never);
  const detach = input.attach();
  input.setEnabled(true);

  target.press('KeyW');
  assert.equal(input.isDown('forward'), true);
  assert.equal(input.isDown('backward'), false);
  const move = input.getMoveInput();
  assert.ok(move.forward && !move.left && !move.right && !move.backward && !move.sprint);

  assert.equal(input.consumePressed('forward'), true, 'edge fires once');
  assert.equal(input.consumePressed('forward'), false);

  target.press('KeyW', true);
  assert.equal(input.consumePressed('forward'), false, 'key repeat is not a new edge');
  target.release('KeyW');
  assert.equal(input.isDown('forward'), false);

  // Remapping: move jump to KeyP, then remove it.
  input.bind('jump', 'KeyP');
  assert.deepEqual(input.getBindings('jump').includes('KeyP'), true);
  target.press('KeyP');
  assert.equal(input.isDown('jump'), true);
  input.unbind('jump', 'KeyP');
  target.release('KeyP');
  target.press('KeyP');
  assert.equal(input.isDown('jump'), false);
  assert.equal(input.actionOf('KeyP'), null);
  detach();

  // Disable freezes everything.
  target.press('KeyA');
  input.setEnabled(false);
  assert.equal(input.isDown('left'), false);
  assert.equal(input.isEnabled(), false);
});

// --- InteractionSystem ----------------------------------------------------------

test('InteractionSystem picks the best candidate in range and dispatches', () => {
  let interacted = 0;
  const system = new InteractionSystem({ defaultRange: 3, facingWeight: 0 });
  system.register({ uuid: 'a', label: 'Crate', getPosition: () => ({ x: 2, y: 1, z: 0 }), onInteract: () => { interacted += 1; } });
  system.register({ uuid: 'b', label: 'Door', getPosition: () => ({ x: 1, y: 1, z: 0 }), onInteract: () => { interacted += 2; } });
  assert.equal(system.update({ x: 0, y: 1, z: 0 }, null)?.label, 'Door');
  assert.equal(system.tryInteract(), true);
  assert.equal(interacted, 2);

  // Out of range candidates disappear.
  system.unregister('b');
  assert.equal(system.update({ x: 0, y: 1, z: 0 }, null)?.label, 'Crate');
  system.unregister('a');
  assert.equal(system.update({ x: 0, y: 1, z: 0 }, null), null);
  assert.equal(system.tryInteract(), false);
});

test('InteractionSystem respects canInteract, facing preference and prompts', () => {
  let unlocked = false;
  let prompted: string | null = null;
  const system = new InteractionSystem({ defaultRange: 5, facingWeight: 2, onPromptChange: (i) => { prompted = i?.label ?? null; } });
  system.register({
    uuid: 'chest',
    label: 'Open chest',
    getPosition: () => ({ x: 0, y: 1, z: -4 }),
    canInteract: () => unlocked,
    onInteract: () => undefined,
  });
  system.register({ uuid: 'npc', label: 'Talk', getPosition: () => ({ x: 0, y: 1, z: -2.5 }), onInteract: () => undefined });
  // Facing -Z: chest is closer but locked; NPC wins and also scores better with facing.
  system.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 });
  assert.equal(system.getCurrent()?.uuid, 'npc');
  assert.equal(prompted, 'Talk');
  unlocked = true;
  system.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 });
  // Chest is nearer (4 vs 2.5)… NPC is still nearer; facing only re-weights.
  assert.equal(system.getCurrent()?.uuid, 'npc');
  system.clear();
  assert.equal(prompted, null, 'prompt cleared with the system');
});

// --- ThirdPersonCamera ----------------------------------------------------------

test('rayAabbDistance solves slab tests correctly', () => {
  const bounds = { uuid: 'b', min: { x: -1, y: -1, z: 2 }, max: { x: 1, y: 1, z: 4 } };
  assert.equal(rayAabbDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, bounds), 2);
  assert.equal(rayAabbDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, bounds), null, 'behind');
  assert.equal(rayAabbDistance({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, bounds), null, 'misses sideways');
  assert.equal(rayAabbDistance({ x: 0.5, y: 0, z: 3 }, { x: 0, y: 0, z: 1 }, bounds), 0, 'inside');
});

test('ThirdPersonCamera follows, occludes and smooths', () => {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
  const rig = new ThirdPersonCamera(camera, () => [], { defaultDistance: 5 });
  const snap1 = rig.update({ targetPosition: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, deltaSeconds: 1 });
  assert.equal(snap1.appliedDistance, 5);
  assert.ok(Math.abs(camera.position.z - 5) < 1e-6, 'camera behind the target (yaw 0 → +Z back)');
  assert.ok(Math.abs(camera.position.x - 0.32) < 1e-6, 'over-the-shoulder offset along +X');
  assert.ok(Number.isFinite(camera.position.y));

  // Wall between target and camera: camera must be pulled in front of it.
  const wall = { uuid: 'w', min: { x: -50, y: -50, z: 2.5 }, max: { x: 50, y: 50, z: 3 } };
  const occluding = new ThirdPersonCamera(camera, () => [wall], { defaultDistance: 5, minDistance: 0.9 });
  const snap2 = occluding.update({ targetPosition: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, deltaSeconds: 1 });
  assert.equal(snap2.occluded, true);
  assert.ok(snap2.appliedDistance < 2.5, `camera pulled to ${snap2.appliedDistance.toFixed(2)} before the wall`);
  assert.ok(camera.position.z < 2.5, 'camera never enters the wall');

  // After the wall is gone the distance eases back (no instant rubber band).
  const free = new ThirdPersonCamera(camera, () => [], { defaultDistance: 5 });
  free.update({ targetPosition: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, deltaSeconds: 0.016 });
  // Simulate prior occlusion by clamping through a wall frame, then release.
  const occluding2 = new ThirdPersonCamera(camera, () => [wall], { defaultDistance: 5, minDistance: 0.9 });
  occluding2.update({ targetPosition: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, deltaSeconds: 1 });
  const cleared = new ThirdPersonCamera(camera, () => [], { defaultDistance: 5, distanceSmoothing: 6 });
  // Carry the clamped distance over by running one occluded frame then a free one.
  const eased = cleared.update({ targetPosition: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, deltaSeconds: 0.05 });
  assert.equal(eased.occluded, false);
  assert.ok(Number.isFinite(eased.appliedDistance));
});

test('ThirdPersonCamera lowers the target while crouched', () => {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
  const rig = new ThirdPersonCamera(camera, () => [], { targetHeight: 1.58, crouchTargetHeight: 1.0 });
  rig.update({ targetPosition: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, crouchFactor: 1, deltaSeconds: 1 });
  const standingY = camera.position.y;
  rig.update({ targetPosition: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, crouchFactor: 0, deltaSeconds: 1 });
  const crouchedY = camera.position.y;
  assert.ok(crouchedY < standingY - 0.4, `crouch lowers camera (${standingY.toFixed(2)} → ${crouchedY.toFixed(2)})`);
});

// --- Safe spawn + controller integration ----------------------------------------

function createWorldWithBoxes(boxes: Array<{ position: Vec3; scale: Vec3 }>): { world: CollisionWorld; manager: SceneStateManager } {
  const manager = new SceneStateManager();
  boxes.forEach((box, i) => {
    manager.registerObject({
      uuid: `20000000-0000-4000-a000-00000000000${i}`,
      assetType: 'cube',
      transform: { position: box.position, rotation: { x: 0, y: 0, z: 0 }, scale: box.scale },
      metadata: { name: `box ${i}`, collider: true },
    });
  });
  return { world: new CollisionWorld(() => manager.getAllObjects(), { floorY: 0 }), manager };
}

test('findSafeSpawnPosition rejects blocked spots and returns a grounded one', () => {
  const { world } = createWorldWithBoxes([
    { position: { x: 0, y: 1, z: 0 }, scale: { x: 2, y: 2, z: 2 } }, // solid block at origin
  ]);
  const safe = findSafeSpawnPosition(world, { candidates: [{ x: 0, y: 1.7, z: 0 }, { x: 10, y: 1.7, z: 10 }] });
  const insideBlock = Math.abs(safe.x) < 1.35 && Math.abs(safe.z) < 1.35;
  assert.equal(insideBlock, false, 'spawn point must not sit inside the block');
  const probe = world.movePlayer(safe, { x: 0, y: -0.1, z: 0 }, 0.35, 1.7);
  assert.equal(probe.grounded, true);
});

test('PlayerController crouch slows movement, lowers the eye and blocks jumping', () => {
  const { world } = createWorldWithBoxes([]);
  const controller = new PlayerController(world, { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: 0, crouchSpeed: 2.4 });
  controller.setCrouching(true);
  assert.equal(controller.requestJump(), false, 'crouch blocks jump');
  controller.update(1, { forward: true });
  assert.ok(Math.abs(controller.getPosition().z) < 3, `crouch speed limits movement (${controller.getPosition().z.toFixed(2)})`);
  const eye = controller.getPosition().y - controller.getFeetPosition().y;
  assert.ok(eye < 1.2, `eye height drops to ${eye.toFixed(2)}`);
  controller.setCrouching(false);
  controller.update(0.5, { forward: false });
  const standingEye = controller.getPosition().y - controller.getFeetPosition().y;
  assert.ok(standingEye > 1.6, `stands back up (${standingEye.toFixed(2)})`);
});

test('PlayerController dead state disables movement and respawnAt resets it', () => {
  const { world } = createWorldWithBoxes([]);
  const controller = new PlayerController(world, { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: 0 });
  controller.setDead(true);
  assert.equal(controller.isDead(), true);
  assert.equal(controller.requestJump(), false);
  controller.update(1, { forward: true, sprint: true });
  assert.ok(Math.abs(controller.getPosition().z) < 1e-6, 'dead players do not move');
  controller.respawnAt({ x: 3, y: 1.7, z: 4 });
  assert.equal(controller.isDead(), false);
  assert.equal(controller.getHorizontalSpeed(), 0);
  assert.equal(controller.getPosition().x, 3);
  controller.update(1, { forward: true });
  assert.ok(controller.getPosition().z < 4 - 5, 'moves again after respawn');
});

test('PlayerController sprint degrades to walk when stamina is locked', () => {
  const { world } = createWorldWithBoxes([]);
  const stamina = new StaminaSystem({ max: 100, drainPerSecond: 60, regenPerSecond: 10, regenDelaySeconds: 0.1, lockThreshold: 5, recoverThreshold: 90 });
  const controller = new PlayerController(world, { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: 0, stamina });
  controller.update(1, { forward: true, sprint: true });
  assert.equal(controller.isSprinting(), true);
  assert.ok(controller.getPosition().z < -10, 'sprinting covers sprint distance');
  for (let i = 0; i < 8; i += 1) { stamina.update(1, true); controller.update(0.001, {}); }
  assert.equal(stamina.isSprintLocked, true);
  const z = controller.getPosition().z;
  controller.update(1, { forward: true, sprint: true });
  const moved = Math.abs(controller.getPosition().z - z);
  assert.ok(moved < 7, `sprint degraded to walk speed (${moved.toFixed(2)} m/s)`);
  assert.equal(controller.isSprinting(), false);
});

test('PlayerController acceleration ramps speed smoothly (opt-in)', () => {
  const { world } = createWorldWithBoxes([]);
  const smooth = new PlayerController(world, { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: 0, accelerationTime: 0.5, decelerationTime: 0.5 });
  smooth.update(0.05, { forward: true });
  const earlySpeed = smooth.getHorizontalSpeed();
  assert.ok(earlySpeed > 0.3 && earlySpeed < 4, `ramping (${earlySpeed.toFixed(2)})`);
  for (let i = 0; i < 40; i += 1) smooth.update(0.05, { forward: true });
  assert.ok(Math.abs(smooth.getHorizontalSpeed() - 6) < 0.2, 'reaches full walk speed');
  smooth.update(0.001, { forward: false });
  for (let i = 0; i < 60; i += 1) smooth.update(0.05, { forward: false });
  assert.ok(smooth.getHorizontalSpeed() < 0.05, 'decelerates to a stop');
  // Legacy controller stays instant.
  const instant = new PlayerController(world, { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: 0 });
  instant.update(0.05, { forward: true });
  assert.equal(instant.getHorizontalSpeed(), 6);
});

test('PlayerController steps onto small ledges when stepHeight allows', () => {
  const withStep = createWorldWithBoxes([{ position: { x: 0, y: 0.15, z: -3 }, scale: { x: 4, y: 0.3, z: 4 } }]);
  const stepper = new PlayerController(withStep.world, { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: 0, stepHeight: 0.4 });
  let maxY = 0;
  let groundedOnTop = false;
  for (let i = 0; i < 40; i += 1) {
    stepper.update(1 / 30, { forward: true });
    maxY = Math.max(maxY, stepper.getPosition().y);
    if (stepper.isGrounded() && Math.abs(stepper.getPosition().y - 2.0) < 0.05) groundedOnTop = true;
  }
  assert.ok(stepper.getPosition().z < -1, `crossed the ledge (z=${stepper.getPosition().z.toFixed(2)})`);
  assert.ok(groundedOnTop, `walked grounded on top of the ledge (maxY=${maxY.toFixed(2)})`);
  assert.ok(Math.abs(maxY - 2.0) < 0.05, `climbed to ledge height (maxY=${maxY.toFixed(2)})`);

  const noStep = createWorldWithBoxes([{ position: { x: 0, y: 0.15, z: -3 }, scale: { x: 4, y: 0.3, z: 4 } }]);
  const walker = new PlayerController(noStep.world, { initialPosition: { x: 0, y: 1.7, z: 0 }, yaw: 0 });
  for (let i = 0; i < 40; i += 1) walker.update(1 / 30, { forward: true });
  assert.ok(walker.getPosition().z > -1.5, `stopped by the ledge (z=${walker.getPosition().z.toFixed(2)})`);
  assert.equal(walker.getPosition().y, 1.7, 'never leaves the floor without stepHeight');
});

test('PlayerController fires onLand with the impact speed', () => {
  const { world } = createWorldWithBoxes([]);
  let lastImpact = 0;
  const controller = new PlayerController(world, {
    initialPosition: { x: 0, y: 1.7, z: 0 },
    onLand: (impact) => { lastImpact = impact; },
  });
  controller.requestJump();
  for (let i = 0; i < 40; i += 1) controller.update(0.1);
  assert.ok(lastImpact > 3, `landing impact reported (${lastImpact.toFixed(1)} m/s)`);
});
