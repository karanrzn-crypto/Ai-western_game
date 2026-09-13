/**
 * HorseController — the horse's body: gaits, acceleration/deceleration,
 * steering, world collision, terrain following, riding input, AI order
 * execution, stamina/health integration and player separation.
 *
 * Architecture contract (mirrors PlayerController):
 *   - PURE LOGIC against the CollisionWorld. It never touches THREE objects;
 *     playable-map syncs the model + camera from getSnapshot() every frame.
 *   - Movement is always integrated through CollisionWorld.movePlayer with
 *     step-up, so the horse can never teleport or pass through colliders
 *     (spec §2/§10/§14).
 *   - Stamina gates the gallop (fatigue lock), injury caps the ceiling,
 *     braking is stronger than natural deceleration, reverse crawls.
 *   - AI orders come from HorseBrain at 10 Hz; whisker steering + a stuck
 *     watchdog keep follow/summon natural without teleporting.
 */
import type { Vec3 } from '../core/types.js';
import { CollisionWorld } from '../physics/CollisionWorld.js';
import { rayAabbDistance } from '../player/ThirdPersonCamera.js';
import { findSafeSpawnPosition } from '../player/Spawn.js';
import { HealthSystem } from '../player/Vitals.js';
import { HorseBrain } from './HorseBrain.js';
import type { HorseAiState } from './HorseBrain.js';
import { HorseStamina } from './HorseVitals.js';
import {
  HORSE_BRAKE_DECELERATION,
  HORSE_GAITS,
  HORSE_NATURAL_DECELERATION,
  HORSE_PROPORTIONS,
  HORSE_REVERSE_SPEED,
  HORSE_TURN_RATES,
  type HorseGait,
} from './HorseProportions.js';

export interface HorseRidingInput {
  /** W held — accelerate toward the target gait. */
  throttle: boolean;
  /** S held — brake (or reverse from standstill). */
  brake: boolean;
  /** A/D steering: +1 left, -1 right. */
  steer: number;
  /** W edge — gait ladder up. */
  tapGaitUp: boolean;
  /** S edge — gait ladder down. */
  tapGaitDown: boolean;
}

export interface HorseWorldContext {
  deltaSeconds: number;
  /** Player feet position (world). */
  playerX: number;
  playerY: number;
  playerZ: number;
  /** Player is moving on foot (drives follow decisions + idle life). */
  playerMoving: boolean;
  /** Player horizontal speed (m/s) — the follow condition needs it. */
  playerSpeed: number;
  /** Player horizontal velocity (m/s) — follow requires MOVING AWAY from the
   *  horse (dot of this with the horse→player direction), revision §11. */
  playerVelX: number;
  playerVelZ: number;
}

export type HorseEvent = 'death' | 'damage' | 'revived' | 'fatigued';

export interface HorseSnapshot {
  /** Feet position (world). */
  position: Vec3;
  yaw: number;
  pitch: number;
  roll: number;
  /** Signed horizontal speed (negative = reverse). */
  speed: number;
  /** Actual gait band from the current speed (drives animation + stamina). */
  gait: HorseGait;
  targetGait: HorseGait;
  reversing: boolean;
  grounded: boolean;
  alive: boolean;
  dead: boolean;
  health: number;
  healthRatio: number;
  stamina: number;
  staminaRatio: number;
  fatigued: boolean;
  injured: boolean;
  fear: number;
  aiState: HorseAiState;
  mounted: boolean;
  /** Idle-life action the animator should render right now. */
  idleAction: 'none' | 'graze' | 'look' | 'shift' | 'headLow';
  turnRate: number;
}

const LADDER: HorseGait[] = ['idle', 'walk', 'trot', 'canter', 'gallop'];
const PLAYER_RADIUS = 0.35;
const MAX_MAP_X = 28.5;
const MAX_MAP_Z = 28.5;

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export class HorseController {
  private readonly collisionWorld: CollisionWorld;
  readonly health: HealthSystem;
  readonly stamina: HorseStamina;
  private readonly brain: HorseBrain;
  private readonly listeners: Array<(event: HorseEvent) => void> = [];

  /** Feet position (world). */
  private readonly position: Vec3;
  private yaw: number;
  private pitch = 0;
  private roll = 0;
  /** Signed speed (m/s); negative while reversing. */
  private speed = 0;
  private targetGait: HorseGait = 'idle';
  private grounded = true;
  private mounted = false;
  private fear = 0;
  private spookSurge = 0;
  private mountLock = 0;
  private lastTurnRate = 0;
  private deathHandled = false;

  constructor(
    collisionWorld: CollisionWorld,
    options: { position?: Vec3; yaw?: number; maxHealth?: number } = {},
  ) {
    this.collisionWorld = collisionWorld;
    this.health = new HealthSystem({ max: options.maxHealth ?? 100 });
    this.stamina = new HorseStamina();
    this.brain = new HorseBrain();
    const start = options.position ?? { x: -5, y: 0, z: 9 };
    this.position = { x: start.x, y: start.y, z: start.z };
    this.yaw = options.yaw ?? 0;
    this.health.on((event) => {
      if (event === 'died') this.handleDeath();
      else if (event === 'damaged') this.emit('damage');
    });
  }

  on(listener: (event: HorseEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }
  private emit(event: HorseEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  // --- Public state ---------------------------------------------------------

  getPosition(): Vec3 {
    return { x: this.position.x, y: this.position.y, z: this.position.z };
  }
  getYaw(): number { return this.yaw; }
  getPitch(): number { return this.pitch; }
  getRoll(): number { return this.roll; }
  getSpeed(): number { return this.speed; }
  getTargetGait(): HorseGait { return this.targetGait; }
  isMounted(): boolean { return this.mounted; }
  isDead(): boolean { return this.health.isDead; }
  isAlive(): boolean { return !this.health.isDead; }
  isInjured(): boolean { return !this.health.isDead && this.health.ratio < 0.3; }
  getAiState(): HorseAiState { return this.brain.current; }
  getFear(): number { return this.fear; }
  getTurnRate(): number { return this.lastTurnRate; }
  get brainState(): HorseAiState { return this.brain.current; }
  get idleAction(): 'none' | 'graze' | 'look' | 'shift' | 'headLow' {
    const action = this.brain.idleActionName;
    return action === 'step' ? 'none' : action;
  }
  /** True while the horse holds the explicit STAY command. */
  isStaying(): boolean { return this.brain.isStaying; }

  /** Spec §15 relationship snapshot — HUD + tests. */
  getRelationship(): { player: 'on_foot' | 'riding'; horse: 'waiting' | 'staying' | 'following' | 'summoned' | 'moving' | 'fleeing' | 'injured' | 'dead' } {
    const horse = this.brain.current;
    return {
      player: this.mounted ? 'riding' : 'on_foot',
      horse: horse === 'ridden' ? 'waiting'
        : horse === 'stay' ? 'staying'
        : horse === 'follow' ? 'following'
        : horse === 'come' ? 'summoned'
        : horse === 'moving' ? 'moving'
        : horse === 'flee' ? 'fleeing'
        : horse === 'injured' ? 'injured'
        : horse === 'dead' ? 'dead'
        : 'waiting',
    };
  }

  getSnapshot(): HorseSnapshot {
    const gait = this.actualGait();
    return {
      position: this.getPosition(),
      yaw: this.yaw,
      pitch: this.pitch,
      roll: this.roll,
      speed: this.speed,
      gait,
      targetGait: this.targetGait,
      reversing: this.speed < -0.05,
      grounded: this.grounded,
      alive: this.isAlive(),
      dead: this.health.isDead,
      health: this.health.current,
      healthRatio: this.health.ratio,
      stamina: this.stamina.current,
      staminaRatio: this.stamina.ratio,
      fatigued: this.stamina.isFatigued,
      injured: this.isInjured(),
      fear: this.fear,
      aiState: this.brain.current,
      mounted: this.mounted,
      idleAction: this.idleAction,
      turnRate: this.lastTurnRate,
    };
  }

  // --- Mount / dismount (spec §3) --------------------------------------------

  /** Mount allowed: alive, not ridden, close enough, calm enough. */
  canMount(playerFeet: Vec3): boolean {
    if (!this.isAlive() || this.mounted) return false;
    if (this.brain.current === 'flee') return false;
    const dx = playerFeet.x - this.position.x;
    const dz = playerFeet.z - this.position.z;
    return Math.hypot(dx, dz) <= 2.6;
  }

  /**
   * Take the rider. The caller attaches the character model to the socket and
   * plays the mount animation; `lockSeconds` keeps the horse standing for the
   * whole choreography (reach → grip → climb → settle) — it may not walk off.
   */
  mount(lockSeconds = 0.45): void {
    if (!this.isAlive() || this.mounted) return;
    this.mounted = true;
    this.mountLock = Math.max(0.45, lockSeconds); // horse stands while the rider settles
    this.brain.force('ridden');
    this.targetGait = 'idle';
    this.speed = 0;
  }

  /**
   * Release the rider. Returns a safe feet position for the player: the
   * horse's LEFT side first (proper western dismount), then right, front,
   * back — each validated against the CollisionWorld so the player can
   * never be placed inside a wall/object (spec §3).
   */
  computeDismountFeet(): Vec3 {
    const eye = 1.7;
    const leftX = -Math.cos(this.yaw);
    const leftZ = Math.sin(this.yaw);
    const rightX = -leftX;
    const rightZ = -leftZ;
    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    const base = this.position;
    const at = (dx: number, dz: number, dist: number): Vec3 =>
      ({ x: base.x + dx * dist, y: base.y + eye, z: base.z + dz * dist });
    const candidates = [
      at(leftX, leftZ, 1.15),
      at(rightX, rightZ, 1.15),
      at(fwdX, fwdZ, 1.5),
      at(-fwdX, -fwdZ, 1.5),
    ];
    const safe = findSafeSpawnPosition(this.collisionWorld, {
      candidates,
      radius: PLAYER_RADIUS,
      height: eye,
      nudges: [{ x: 0, y: 0, z: 0 }],
    });
    return { x: safe.x, y: safe.y - eye, z: safe.z };
  }

  dismount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.brain.force(this.isAlive() ? 'idle' : 'dead');
    this.targetGait = 'idle';
    this.speed = 0;
    this.mountLock = 0.3;
  }

  // --- Summon + stay (spec §9 / revision §9/§10) -------------------------------

  /** COME (whistle): returns false while the cooldown is still running. */
  summon(): boolean {
    if (this.mounted || !this.isAlive()) return false;
    return this.brain.summon();
  }
  get summonCooldown(): number { return this.brain.summonCooldownRemaining; }

  /** STAY command: park here (toggle). False when it cannot obey right now. */
  stay(): boolean {
    if (this.mounted || !this.isAlive()) return false;
    return this.brain.commandStay();
  }

  // --- Damage / fear (spec §6/§13) ----------------------------------------------

  damage(amount: number, threatX?: number, threatZ?: number): number {
    const applied = this.health.damage(amount);
    if (applied <= 0) return 0;
    this.fear = 1;
    if (this.mounted) {
      // Spook surge while ridden: control stays with the player, but the
      // horse briefly surges (spec §13 — control "can" be limited).
      this.spookSurge = 1.2;
      this.stamina.spend(4);
    } else {
      const tx = threatX ?? this.position.x;
      const tz = threatZ ?? this.position.z;
      this.brain.scare(tx, tz, this.position.x, this.position.z);
    }
    return applied;
  }

  heal(amount: number): number {
    if (this.health.isDead) {
      // Debug revive path: bring the horse back from the death state.
      this.health.reset();
      this.stamina.reset();
      this.deathHandled = false;
      this.brain.force('idle');
      this.fear = 0;
      this.emit('revived');
      return this.health.max;
    }
    return this.health.heal(amount);
  }

  private handleDeath(): void {
    if (this.deathHandled) return;
    this.deathHandled = true;
    this.speed = 0;
    this.targetGait = 'idle';
    this.fear = 0;
    this.spookSurge = 0;
    if (this.mounted) {
      // The saddle just collapsed — the caller must force the dismount.
      this.mounted = false;
    }
    this.brain.force('dead');
    this.emit('death');
  }

  // --- Main update ---------------------------------------------------------------

  update(context: HorseWorldContext, ridingInput?: HorseRidingInput): void {
    const dt = Math.max(0, context.deltaSeconds);
    this.fear = Math.max(0, this.fear - dt / 4.2);
    this.spookSurge = Math.max(0, this.spookSurge - dt);
    this.mountLock = Math.max(0, this.mountLock - dt);

    if (this.health.isDead) {
      this.speed = 0;
      this.lastTurnRate = 0;
      this.stamina.update(dt, 'idle');
      this.settleOnGround();
      this.applyPlayerSeparation(context);
      return;
    }

    if (this.mounted && ridingInput) this.applyRidingInput(ridingInput, dt);
    else this.applyAiOrders(dt, context);

    this.integrateMovement(dt, context);
    this.stamina.update(dt, this.actualGait());
  }

  /** Gait ladder + throttle/brake/reverse while ridden (spec §4/§19).
   *  Natural momentum contract: W held = accelerate to / hold the selected
   *  gait; W released = the animal COASTS — natural deceleration to a smooth
   *  full stop, then standing (no snap, no cruise-hold, no artificial drift). */
  private applyRidingInput(input: HorseRidingInput, dt: number): void {
    if (this.mountLock > 0) return; // horse stands while the rider settles

    const ceiling = this.gaitCeiling();
    if (input.tapGaitUp) {
      const index = LADDER.indexOf(this.targetGait);
      this.targetGait = LADDER[Math.min(LADDER.length - 1, index + 1)];
    }
    if (input.tapGaitDown) {
      const index = LADDER.indexOf(this.targetGait);
      this.targetGait = LADDER[Math.max(0, index - 1)];
    }
    // Holding W always rides at a walk or above: never a dead throttle from a
    // standstill, and never an instant stop when the ladder sits at idle.
    if (input.throttle && this.targetGait === 'idle') this.targetGait = 'walk';
    if (LADDER.indexOf(this.targetGait) > LADDER.indexOf(ceiling)) this.targetGait = ceiling;

    const targetSpeed = HORSE_GAITS[this.targetGait].speed * (this.spookSurge > 0 ? 1.15 : 1);
    const steering = clamp(input.steer, -1, 1);
    this.steerHorse(steering, dt);

    if (input.brake) {
      if (this.speed > 0.15) {
        // Brake — faster than natural decel (spec §4: stop < gait change).
        this.speed = Math.max(0, this.speed - HORSE_BRAKE_DECELERATION * dt);
      } else {
        // Reverse crawl from standstill.
        this.speed = Math.max(-HORSE_REVERSE_SPEED, this.speed - 2.2 * dt);
      }
      return;
    }
    if (input.throttle) {
      if (this.speed < 0) {
        // Stop reversing first.
        this.speed = Math.min(0, this.speed + HORSE_BRAKE_DECELERATION * dt);
        return;
      }
      const accel = HORSE_GAITS[this.targetGait].acceleration;
      this.speed = Math.min(targetSpeed, this.speed + accel * dt);
      return;
    }
    // Reins neutral: the horse loses momentum like a real animal — gradual
    // natural deceleration to exactly zero, then it stands (no snapping).
    if (this.speed > 0) this.speed = Math.max(0, this.speed - HORSE_NATURAL_DECELERATION * dt);
    else if (this.speed < 0) this.speed = Math.min(0, this.speed + HORSE_NATURAL_DECELERATION * dt);
  }

  /** Execute the brain's order (unmounted). */
  private applyAiOrders(dt: number, context: HorseWorldContext): void {
    const order = this.brain.update({
      deltaSeconds: dt,
      alive: this.isAlive(),
      healthRatio: this.health.ratio,
      mounted: false,
      playerMoving: context.playerMoving,
      playerSpeed: context.playerSpeed,
      playerVelX: context.playerVelX,
      playerVelZ: context.playerVelZ,
      horseX: this.position.x,
      horseZ: this.position.z,
      playerX: context.playerX,
      playerZ: context.playerZ,
    });
    this.brain.notePosition(this.position.x, this.position.z);

    const ceiling = this.gaitCeiling();
    if (order.unstuck) {
      // Back up and pivot (spec §9: never grind into the same obstacle).
      this.speed = Math.max(-HORSE_REVERSE_SPEED, this.speed - 3 * dt);
      this.steerHorse(this.position.z >= 0 ? 0.8 : -0.8, dt);
      return;
    }

    if (order.targetX === null || order.targetZ === null) {
      // Stand — natural deceleration to a full stop.
      this.targetGait = 'idle';
      if (this.speed > 0) this.speed = Math.max(0, this.speed - HORSE_NATURAL_DECELERATION * dt);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + HORSE_NATURAL_DECELERATION * dt);
      return;
    }

    const dx = order.targetX - this.position.x;
    const dz = order.targetZ - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= order.arriveRadius) {
      this.targetGait = 'idle';
      if (this.speed > 0) this.speed = Math.max(0, this.speed - HORSE_BRAKE_DECELERATION * dt);
      return;
    }

    // Gait from remaining distance (spec §8: pick a suitable speed).
    const ceilingIndex = LADDER.indexOf(order.gaitCeiling === 'gallop' ? ceiling : order.gaitCeiling);
    let wanted: HorseGait = 'walk';
    if (distance > 16) wanted = 'gallop';
    else if (distance > 10) wanted = 'canter';
    else if (distance > 5.5) wanted = 'trot';
    if (LADDER.indexOf(wanted) > ceilingIndex) wanted = LADDER[ceilingIndex];
    this.targetGait = wanted;

    const steer = this.steerToward(order.targetX, order.targetZ, dt);
    this.steerHorse(steer, dt);

    // Speed cap eases the arrival (no overshoot into the player).
    const cap = Math.max(HORSE_GAITS.walk.speed, Math.min(HORSE_GAITS[wanted].speed, (distance - order.arriveRadius * 0.7) * 1.4));
    const accel = HORSE_GAITS[wanted].acceleration;
    if (this.speed < cap) this.speed = Math.min(cap, this.speed + accel * dt);
    else this.speed = Math.max(cap, this.speed - HORSE_BRAKE_DECELERATION * dt);
  }

  /** Injury/fatigue gait ceiling (spec §5/§6). */
  private gaitCeiling(): HorseGait {
    if (this.isInjured()) return 'canter';
    if (this.stamina.isFatigued) return 'canter';
    return 'gallop';
  }

  /** Steering with speed-dependent turn rate (spec §2/§14). */
  private steerHorse(steer: number, dt: number): void {
    if (steer === 0) {
      this.lastTurnRate = this.lastTurnRate * Math.exp(-8 * dt);
      if (Math.abs(this.lastTurnRate) < 0.01) this.lastTurnRate = 0;
      return;
    }
    const band = Math.abs(this.speed);
    const turnRate = band < 0.4 ? HORSE_TURN_RATES.stand
      : band < 2.6 ? HORSE_TURN_RATES.walk
      : band < 5.6 ? HORSE_TURN_RATES.trot
      : band < 9.2 ? HORSE_TURN_RATES.canter
      : HORSE_TURN_RATES.gallop;
    // Reversing inverts the steering feel (like a vehicle).
    const direction = this.speed < -0.05 ? -1 : 1;
    const rate = steer * turnRate * direction;
    this.lastTurnRate = rate;
    this.yaw = wrapAngle(this.yaw + rate * dt);
  }

  /**
   * AI navigation steering: turn toward the target with 3 whisker rays
   * (ray/AABB against the world) so buildings/walls are rounded, not
   * ground into (spec §9/§10).
   */
  private steerToward(targetX: number, targetZ: number, _dt: number): number {
    const desired = Math.atan2(-(targetX - this.position.x), -(targetZ - this.position.z));
    let diff = wrapAngle(desired - this.yaw);
    const probeLength = Math.max(2.4, Math.abs(this.speed) * 0.6);
    const centerClear = this.rayClear(this.yaw, probeLength);
    if (centerClear) {
      const leftClear = this.rayClear(this.yaw + 0.6, probeLength * 0.8);
      const rightClear = this.rayClear(this.yaw - 0.6, probeLength * 0.8);
      if (diff > 0.1 && !leftClear) diff = 0.25;
      else if (diff < -0.1 && !rightClear) diff = -0.25;
      return clamp(diff * 1.6, -1, 1);
    }
    const leftClear = this.rayClear(this.yaw + 0.6, probeLength);
    const rightClear = this.rayClear(this.yaw - 0.6, probeLength);
    if (leftClear && !rightClear) diff = 0.95;
    else if (rightClear && !leftClear) diff = -0.95;
    else if (!leftClear && !rightClear) diff = diff >= 0 ? 1.25 : -1.25;
    else diff = diff >= 0 ? 0.95 : -0.95;
    return clamp(diff * 1.6, -1, 1);
  }

  /** True when a ray from the horse's chest along `yaw` hits no collider. */
  private rayClear(yaw: number, length: number): boolean {
    const origin = { x: this.position.x, y: this.position.y + 1.2, z: this.position.z };
    const dir = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
    for (const bounds of this.collisionWorld.getCollisionBounds()) {
      const hit = rayAabbDistance(origin, dir, bounds);
      if (hit !== null && hit < length) return false;
    }
    return true;
  }

  /** Acceleration, collision, step-up, terrain alignment, player separation. */
  private integrateMovement(dt: number, context: HorseWorldContext): void {
    if (this.mountLock > 0) {
      this.settleOnGround();
      return;
    }
    const radius = HORSE_PROPORTIONS.collisionRadius;
    const height = HORSE_PROPORTIONS.collisionHeight;
    const moving = Math.abs(this.speed) > 0.01;

    if (moving) {
      const step = this.speed * dt;
      // Edge guard: refuse to gallop off a dangerous drop (spec §10).
      const aheadX = this.position.x - Math.sin(this.yaw) * Math.sign(step) * 1.2;
      const aheadZ = this.position.z - Math.cos(this.yaw) * Math.sign(step) * 1.2;
      const aheadGround = this.groundHeightAt(aheadX, aheadZ);
      if (this.grounded && aheadGround < this.position.y - 1.2) {
        this.speed = 0;
      } else {
        const desiredX = this.position.x - Math.sin(this.yaw) * step;
        const desiredZ = this.position.z - Math.cos(this.yaw) * step;
        // Player bump guard: never walk into the on-foot player (spec §10).
        const minPlayerDist = radius + PLAYER_RADIUS + 0.05;
        const playerDx = desiredX - context.playerX;
        const playerDz = desiredZ - context.playerZ;
        const playerDist = Math.hypot(playerDx, playerDz);
        const blockedByPlayer = !this.mounted
          && Math.hypot(context.playerX - this.position.x, context.playerZ - this.position.z) > minPlayerDist
          && playerDist < minPlayerDist;
        if (blockedByPlayer) {
          this.speed = 0;
        } else {
          const from = { x: this.position.x, y: this.position.y + height, z: this.position.z };
          const result = this.collisionWorld.movePlayer(
            from,
            { x: desiredX - this.position.x, y: 0, z: desiredZ - this.position.z },
            radius,
            height,
          );
          const movedDistance = Math.hypot(result.position.x - from.x, result.position.z - from.z);
          const wantedDistance = Math.abs(step);
          this.position.x = result.position.x;
          this.position.z = result.position.z;
          this.position.y = result.position.y - height;
          this.grounded = result.grounded;
          // Hard collision at speed = a spook trigger + stamina knock.
          if (movedDistance < wantedDistance * 0.55 && Math.abs(this.speed) > 4.5) {
            this.onHardCollision();
          }
          // Step-up (ledges/curbs) — same pattern as the player controller.
          if (this.grounded && (result.blockedX || result.blockedZ) && Math.abs(this.speed) > 0.4) {
            this.tryStepUp(step, radius, height);
          }
        }
      }
    }

    this.settleOnGround();
    this.alignToTerrain(dt);
    this.applyPlayerSeparation(context);
    this.clampToMap();
  }

  /** Lift → move → settle, accepted only when it gains ground. */
  private tryStepUp(step: number, radius: number, height: number): void {
    const stepHeight = HORSE_PROPORTIONS.stepHeight;
    const lifted = this.collisionWorld.movePlayer(
      { x: this.position.x, y: this.position.y + height, z: this.position.z },
      { x: 0, y: stepHeight, z: 0 },
      radius,
      height,
    );
    const stepped = this.collisionWorld.movePlayer(
      lifted.position,
      { x: -Math.sin(this.yaw) * step, y: 0, z: -Math.cos(this.yaw) * step },
      radius,
      height,
    );
    const settled = this.collisionWorld.movePlayer(
      stepped.position,
      { x: 0, y: -stepHeight - 0.05, z: 0 },
      radius,
      height,
    );
    const gained = Math.abs(settled.position.x - this.position.x) + Math.abs(settled.position.z - this.position.z);
    if (gained > 0.02) {
      this.position.x = settled.position.x;
      this.position.z = settled.position.z;
      this.position.y = settled.position.y - height;
      this.grounded = settled.grounded;
    }
  }

  /**
   * Ground the horse on the highest walkable surface under its body (the
   * CollisionWorld floor is flat, but box tops are legitimate ground) —
   * position must never sink into the terrain (spec §10/§11).
   */
  private settleOnGround(): void {
    const ground = this.groundHeightAt(this.position.x, this.position.z);
    if (this.position.y <= ground + 0.01) {
      this.position.y = ground;
      this.grounded = true;
    } else if (this.position.y > ground + 0.05) {
      // Gravity settle (no ballistic arcs for a ground-bound animal).
      this.position.y = Math.max(ground, this.position.y - 9 * 0.016);
    }
  }

  /** Highest collider top under (x, z) that the horse could stand on. */
  private groundHeightAt(x: number, z: number): number {
    let best = 0; // world floor
    const feet = this.position.y;
    for (const bounds of this.collisionWorld.getCollisionBounds()) {
      if (x < bounds.min.x - 0.15 || x > bounds.max.x + 0.15) continue;
      if (z < bounds.min.z - 0.15 || z > bounds.max.z + 0.15) continue;
      if (bounds.max.y <= feet + HORSE_PROPORTIONS.stepHeight + 0.05 && bounds.max.y > best) {
        best = bounds.max.y;
      }
    }
    return best;
  }

  /** Pitch/roll follow the terrain (sampled fore/aft + left/right). */
  private alignToTerrain(dt: number): void {
    const s = 1.0;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const hFront = this.groundHeightAt(this.position.x + sinY * s, this.position.z + cosY * s);
    const hBack = this.groundHeightAt(this.position.x - sinY * s, this.position.z - cosY * s);
    const hRight = this.groundHeightAt(this.position.x + cosY * s * 0.5, this.position.z - sinY * s * 0.5);
    const hLeft = this.groundHeightAt(this.position.x - cosY * s * 0.5, this.position.z + sinY * s * 0.5);
    const pitchTarget = clamp(Math.atan2(hBack - hFront, 2 * s), -0.45, 0.45);
    const rollTarget = clamp(Math.atan2(hRight - hLeft, s), -0.35, 0.35);
    const blend = 1 - Math.exp(-6 * dt);
    this.pitch += (pitchTarget - this.pitch) * blend;
    this.roll += (rollTarget - this.roll) * blend;
  }

  /** Push the on-foot player out of the horse's capsule (spec §14). */
  private applyPlayerSeparation(context: HorseWorldContext): void {
    if (this.mounted) return;
    const minDist = HORSE_PROPORTIONS.collisionRadius + PLAYER_RADIUS + 0.05;
    const dx = context.playerX - this.position.x;
    const dz = context.playerZ - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist >= minDist || dist < 1e-4) return;
    // Corrected player position handed back through the context by the caller
    // via takePlayerSeparation() — stored transiently.
    const scale = (minDist - dist) / dist;
    this.playerSeparation = { x: context.playerX + dx * scale, z: context.playerZ + dz * scale };
  }

  private playerSeparation: { x: number; z: number } | null = null;

  /** Consumes the pending player push-out (position correction), if any. */
  takePlayerSeparation(): { x: number; z: number } | null {
    const sep = this.playerSeparation;
    this.playerSeparation = null;
    return sep;
  }

  private onHardCollision(): void {
    this.stamina.spend(3);
    if (this.mounted) {
      this.spookSurge = Math.max(this.spookSurge, 0.8);
      this.fear = Math.max(this.fear, 0.6);
    } else {
      this.brain.scare(this.position.x - Math.sin(this.yaw) * 2, this.position.z - Math.cos(this.yaw) * 2, this.position.x, this.position.z);
      this.fear = 1;
    }
  }

  private clampToMap(): void {
    this.position.x = clamp(this.position.x, -MAX_MAP_X, MAX_MAP_X);
    this.position.z = clamp(this.position.z, -MAX_MAP_Z, MAX_MAP_Z);
  }

  /** Actual gait band from the CURRENT speed (animation + stamina use it). */
  private actualGait(): HorseGait {
    const band = Math.abs(this.speed);
    if (band < 0.15) return 'idle';
    if (band < 2.6) return 'walk';
    if (band < 5.6) return 'trot';
    if (band < 9.2) return 'canter';
    return 'gallop';
  }

  // --- Persistence (spec §17) --------------------------------------------------

  serialize(): { version: number; position: Vec3; yaw: number; health: number; stamina: number; alive: boolean } {
    return {
      version: 1,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      yaw: this.yaw,
      health: this.health.current,
      stamina: this.stamina.current,
      alive: this.isAlive(),
    };
  }

  restore(data: {
    position?: { x: number; y: number; z: number };
    yaw?: number;
    health?: number;
    stamina?: number;
    alive?: boolean;
  }): void {
    if (data.position && Number.isFinite(data.position.x) && Number.isFinite(data.position.y) && Number.isFinite(data.position.z)) {
      this.position.x = clamp(data.position.x, -MAX_MAP_X, MAX_MAP_X);
      this.position.y = Math.max(0, data.position.y);
      this.position.z = clamp(data.position.z, -MAX_MAP_Z, MAX_MAP_Z);
    }
    if (typeof data.yaw === 'number' && Number.isFinite(data.yaw)) this.yaw = wrapAngle(data.yaw);
    this.mounted = false;
    if (data.alive === false) {
      this.health.restoreDead();
      this.deathHandled = true;
      this.brain.force('dead');
      this.stamina.reset(Math.max(0, data.stamina ?? 0));
      this.speed = 0;
      return;
    }
    this.deathHandled = false;
    this.brain.force('idle');
    this.health.reset(Math.max(1, data.health ?? this.health.max));
    this.stamina.reset(Math.max(0, data.stamina ?? this.stamina.max));
    this.speed = 0;
    this.targetGait = 'idle';
  }
}
