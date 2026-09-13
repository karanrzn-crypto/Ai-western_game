/**
 * HorseBrain — the horse's autonomous AI (spec §7/§8/§9/§12/§13/§15).
 *
 * Pure decision layer: it reads a plain context snapshot and emits a plain
 * order each decision tick (10 Hz — AI must not do heavy math every frame).
 * It owns NO movement math and NO rendering; HorseController executes the
 * orders through the gait/steering/collision machinery.
 *
 * States (spec §7):
 *   idle    — unmounted default; schedules natural idle life (look/graze/
 *             weight shift/short steps) via the order's idleAction.
 *   follow  — trails the player at HORSE_AI.followStop, picks the gait from
 *             the distance, never bumps into the player.
 *   come    — a summon: navigate to the player from anywhere (whistle).
 *   moving  — executing a small idle-life step or any transient locomotion.
 *   flee    — scared: run AWAY from the threat point, control limited.
 *   injured — alive but health < 30%: gait capped, posture low (the cap
 *             itself is enforced by the controller; the brain reports the
 *             state and keeps distance behaviours but calmer).
 *   dead    — terminal until revived; all autonomy stops.
 *   ridden  — the player is in the saddle: AI yields completely.
 *
 * Stuck watchdog (spec §9): while navigating (come/follow/flee), if the
 * displacement over the watchdog window is below the minimum, the brain
 * emits an UNSTUCK maneuver (reverse + turn) instead of pushing into the
 * obstacle forever.
 */

export type HorseAiState =
  | 'idle' | 'follow' | 'come' | 'moving' | 'flee' | 'injured' | 'dead' | 'ridden';

export type HorseIdleActionName = 'none' | 'graze' | 'look' | 'shift' | 'step';

export interface HorseBrainContext {
  deltaSeconds: number;
  /** The horse is alive (health > 0). */
  alive: boolean;
  /** 0..1 — below HORSE_AI.injuredRatio the brain reports injured. */
  healthRatio: number;
  /** The player is mounted (AI yields). */
  mounted: boolean;
  /** Is the player currently moving on foot? */
  playerMoving: boolean;
  /** World positions (feet level). */
  horseX: number; horseZ: number;
  playerX: number; playerZ: number;
}

export interface HorseBrainOrder {
  state: HorseAiState;
  /** World-space move target, or null to stand. */
  targetX: number | null;
  targetZ: number | null;
  /** Stop when within this distance of the target. */
  arriveRadius: number;
  /** Requested gait ceiling (fatigue/injury caps applied downstream too). */
  gaitCeiling: 'walk' | 'trot' | 'canter' | 'gallop';
  /** Idle-life action to render while standing. */
  idleAction: HorseIdleActionName;
  /** True while executing an UNSTUCK maneuver (reverse away + turn). */
  unstuck: boolean;
}

export interface HorseBrainOptions {
  followStart?: number;
  followStop?: number;
  summonArrive?: number;
  summonCooldown?: number;
  fleeDuration?: number;
  injuredRatio?: number;
  tickHz?: number;
  stuckWindow?: number;
  stuckMinDisplacement?: number;
}

const GRAZE_SECONDS = 5;
const LOOK_SECONDS = 3.2;

export class HorseBrain {
  private state: HorseAiState = 'idle';
  private decisionClock = 0;
  private idleActionTimer = 1.5;
  private idleAction: HorseIdleActionName = 'none';
  private idleActionAge = 0;
  private stepTarget: { x: number; z: number } | null = null;
  private fleeTimer = 0;
  private fleeTarget: { x: number; z: number } | null = null;
  private summonCooldownTimer = 0;
  private unstuckPhase = 0;
  private stuckSampleX = 0;
  private stuckSampleZ = 0;
  private stuckSampleTimer = 0;
  private readonly followStart: number;
  private readonly followStop: number;
  private readonly summonArrive: number;
  private readonly summonCooldown: number;
  private readonly fleeDuration: number;
  private readonly injuredRatio: number;
  private readonly tickHz: number;
  private readonly stuckWindow: number;
  private readonly stuckMinDisplacement: number;

  constructor(options: HorseBrainOptions = {}) {
    this.followStart = options.followStart ?? 6.5;
    this.followStop = options.followStop ?? 3.0;
    this.summonArrive = options.summonArrive ?? 3.0;
    this.summonCooldown = options.summonCooldown ?? 3;
    this.fleeDuration = options.fleeDuration ?? 4.2;
    this.injuredRatio = options.injuredRatio ?? 0.3;
    this.tickHz = options.tickHz ?? 10;
    this.stuckWindow = options.stuckWindow ?? 1.4;
    this.stuckMinDisplacement = options.stuckMinDisplacement ?? 0.3;
  }

  get current(): HorseAiState { return this.state; }

  /** Whistle: navigate to the player. Returns false while on cooldown. */
  summon(): boolean {
    if (this.state === 'dead' || this.state === 'ridden') return false;
    if (this.summonCooldownTimer > 0) return false;
    this.summonCooldownTimer = this.summonCooldown;
    this.state = 'come';
    this.fleeTimer = 0;
    this.idleAction = 'none';
    this.stepTarget = null;
    this.resetStuckWatch();
    return true;
  }

  /** Scare the horse away from a world point (spec §13). */
  scare(threatX: number, threatZ: number, horseX: number, horseZ: number): void {
    if (this.state === 'dead' || this.state === 'ridden') return;
    this.state = 'flee';
    this.fleeTimer = this.fleeDuration;
    // Flee target: 12m directly away from the threat.
    const dx = horseX - threatX;
    const dz = horseZ - threatZ;
    const length = Math.hypot(dx, dz) || 1;
    this.fleeTarget = { x: horseX + (dx / length) * 12, z: horseZ + (dz / length) * 12 };
    this.idleAction = 'none';
    this.stepTarget = null;
    this.resetStuckWatch();
  }

  /** Force a state (mount/dismount/death/revive flows). */
  force(state: HorseAiState): void {
    this.state = state;
    this.fleeTimer = 0;
    this.idleAction = 'none';
    this.idleActionAge = 0;
    this.stepTarget = null;
    this.unstuckPhase = 0;
    if (state === 'come' || state === 'flee') this.resetStuckWatch();
  }

  /** Cooldown seconds left before another whistle is accepted. */
  get summonCooldownRemaining(): number { return Math.max(0, this.summonCooldownTimer); }

  get idleActionName(): HorseIdleActionName { return this.idleAction; }
  get idleActionElapsed(): number { return this.idleActionAge; }

  /**
   * Advance the brain. Returns an order every call; decisions are re-made
   * at `tickHz` (cheap), between ticks the previous decision is refreshed
   * from the SAME inputs that are cheap to recompute (distance-based gait).
   */
  update(context: HorseBrainContext): HorseBrainOrder {
    const dt = Math.max(0, context.deltaSeconds);
    this.summonCooldownTimer = Math.max(0, this.summonCooldownTimer - dt);

    // Terminal states first.
    if (!context.alive) {
      this.state = 'dead';
      return { state: 'dead', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: 'walk', idleAction: 'none', unstuck: false };
    }
    if (this.state === 'dead') this.state = 'injured'; // revived
    if (context.mounted) {
      this.state = 'ridden';
      this.idleAction = 'none';
      return { state: 'ridden', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: 'gallop', idleAction: 'none', unstuck: false };
    }
    if (this.state === 'ridden') this.state = 'idle'; // rider just dismounted

    const distToPlayer = Math.hypot(context.playerX - context.horseX, context.playerZ - context.horseZ);
    const injured = context.healthRatio > 0 && context.healthRatio < this.injuredRatio;

    // Flee runs its timer; after it, calm back to normal (spec §13).
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0 || !this.fleeTarget) {
        this.state = 'idle';
        this.fleeTarget = null;
        this.idleActionTimer = 1;
      }
    }
    if (this.state !== 'flee' && injured && this.state !== 'come') this.state = this.state === 'idle' || this.state === 'moving' || this.state === 'follow' ? 'injured' : this.state;

    this.decisionClock += dt;
    if (this.decisionClock >= 1 / this.tickHz) {
      this.decisionClock = 0;
      this.decide(context, distToPlayer);
    }

    return this.buildOrder(context, distToPlayer);
  }

  /** Slow decision pass (10 Hz): state selection + idle-life scheduling. */
  private decide(context: HorseBrainContext, distToPlayer: number): void {
    if (this.state === 'flee' || this.state === 'come' || this.state === 'ridden' || this.state === 'dead') return;

    // Follow vs idle arbitration.
    if (distToPlayer > this.followStart) {
      this.state = 'follow';
      return;
    }
    if (this.state === 'follow' && distToPlayer <= this.followStop) {
      this.state = 'idle';
      this.idleActionTimer = 1.2;
    }

    if (this.state === 'idle' || this.state === 'injured') {
      // Natural idle life scheduler (spec §12): look/graze/shift/step.
      this.idleActionAge += 1 / this.tickHz;
      if (this.idleAction !== 'none') {
        const done = this.idleAction === 'step'
          ? this.stepTarget === null
          : this.idleActionAge >= (this.idleAction === 'graze' ? GRAZE_SECONDS : LOOK_SECONDS);
        if (done) {
          this.idleAction = 'none';
          this.idleActionAge = 0;
          this.idleActionTimer = 2 + Math.random() * 4;
        }
        return;
      }
      this.idleActionTimer -= 1 / this.tickHz;
      if (this.idleActionTimer <= 0) {
        // Pick the next idle behaviour; injured horses skip the step.
        const roll = Math.random();
        if (roll < 0.3) {
          this.idleAction = 'look';
          this.idleActionAge = 0;
        } else if (roll < 0.55 && this.state === 'idle') {
          this.idleAction = 'graze';
          this.idleActionAge = 0;
        } else if (roll < 0.8) {
          this.idleAction = 'shift';
          this.idleActionAge = 0;
        } else if (this.state === 'idle' && context.playerMoving !== true) {
          // A few short steps around the idle anchor, never toward the player.
          const angle = Math.random() * Math.PI * 2;
          const radius = 1 + Math.random() * 1.2;
          const nx = context.horseX + Math.cos(angle) * radius;
          const nz = context.horseZ + Math.sin(angle) * radius;
          const distTarget = Math.hypot(nx - context.playerX, nz - context.playerZ);
          if (distTarget > this.followStop + 0.6) {
            this.stepTarget = { x: nx, z: nz };
            this.idleAction = 'step';
            this.idleActionAge = 0;
            this.state = 'moving';
          } else {
            this.idleAction = 'look';
            this.idleActionAge = 0;
          }
        } else {
          this.idleAction = 'look';
          this.idleActionAge = 0;
        }
      }
    }
  }

  /** Per-frame order assembly (cheap; gait chosen from live distance). */
  private buildOrder(context: HorseBrainContext, distToPlayer: number): HorseBrainOrder {
    const injured = context.healthRatio > 0 && context.healthRatio < this.injuredRatio;
    const ceiling: HorseBrainOrder['gaitCeiling'] = injured ? 'canter' : 'gallop';

    switch (this.state) {
      case 'come': {
        // Re-sample the player position every tick (the whistle target moves).
        const unstuck = this.updateStuckWatch(context);
        if (unstuck) return this.unstuckOrder(context, ceiling);
        if (distToPlayer <= this.summonArrive) {
          this.state = 'idle';
          this.idleActionTimer = 0.8;
          return { state: 'idle', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: ceiling, idleAction: 'none', unstuck: false };
        }
        return {
          state: 'come',
          targetX: context.playerX,
          targetZ: context.playerZ,
          arriveRadius: this.summonArrive,
          gaitCeiling: ceiling,
          idleAction: 'none',
          unstuck: false,
        };
      }
      case 'flee': {
        const unstuck = this.updateStuckWatch(context);
        if (unstuck) return this.unstuckOrder(context, 'gallop');
        if (!this.fleeTarget) {
          this.state = 'idle';
          return { state: 'idle', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: ceiling, idleAction: 'none', unstuck: false };
        }
        return {
          state: 'flee',
          targetX: this.fleeTarget.x,
          targetZ: this.fleeTarget.z,
          arriveRadius: 1.5,
          gaitCeiling: 'gallop',
          idleAction: 'none',
          unstuck: false,
        };
      }
      case 'follow': {
        const unstuck = this.updateStuckWatch(context);
        if (unstuck) return this.unstuckOrder(context, ceiling);
        if (distToPlayer <= this.followStop) {
          // Player stopped or close enough — hold (spec §8).
          return { state: 'follow', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: ceiling, idleAction: 'none', unstuck: false };
        }
        // Aim a bit short of the player so the horse never bumps them.
        const dx = context.playerX - context.horseX;
        const dz = context.playerZ - context.horseZ;
        const stopAt = this.followStop * 0.9;
        const scale = Math.max(0, 1 - stopAt / Math.max(distToPlayer, 1e-4));
        return {
          state: 'follow',
          targetX: context.playerX - dx * scale,
          targetZ: context.playerZ - dz * scale,
          arriveRadius: 0.8,
          gaitCeiling: ceiling,
          idleAction: 'none',
          unstuck: false,
        };
      }
      case 'moving': {
        if (!this.stepTarget) {
          this.state = 'idle';
          this.idleActionTimer = 1.5;
          return { state: 'idle', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: ceiling, idleAction: 'none', unstuck: false };
        }
        const dx = this.stepTarget.x - context.horseX;
        const dz = this.stepTarget.z - context.horseZ;
        if (Math.hypot(dx, dz) <= 0.35) {
          this.stepTarget = null;
          this.state = 'idle';
          this.idleActionTimer = 2;
          return { state: 'idle', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: ceiling, idleAction: 'none', unstuck: false };
        }
        return {
          state: 'moving',
          targetX: this.stepTarget.x,
          targetZ: this.stepTarget.z,
          arriveRadius: 0.35,
          gaitCeiling: 'walk',
          idleAction: 'none',
          unstuck: false,
        };
      }
      case 'injured':
        return { state: 'injured', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: 'canter', idleAction: this.idleAction === 'step' ? 'none' : this.idleAction, unstuck: false };
      case 'ridden':
        return { state: 'ridden', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: 'gallop', idleAction: 'none', unstuck: false };
      case 'dead':
        return { state: 'dead', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: 'walk', idleAction: 'none', unstuck: false };
      case 'flee':
      case 'come':
      case 'follow':
      case 'idle':
      default: {
        // Idle: render the scheduled idle action; a step is handled above via
        // 'moving' — if we got here with a pending step target, execute it.
        if (this.idleAction === 'step' && this.stepTarget) {
          this.state = 'moving';
          return this.buildOrder(context, distToPlayer);
        }
        return {
          state: 'idle',
          targetX: null,
          targetZ: null,
          arriveRadius: 0,
          gaitCeiling: ceiling,
          idleAction: this.idleAction,
          unstuck: false,
        };
      }
    }
  }

  /** UNSTUCK: back up and pivot away, then the normal order resumes. */
  private unstuckOrder(context: HorseBrainContext, ceiling: HorseBrainOrder['gaitCeiling']): HorseBrainOrder {
    this.unstuckPhase += context.deltaSeconds;
    if (this.unstuckPhase < 0.7) {
      return { state: this.state, targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: 'walk', idleAction: 'none', unstuck: true };
    }
    if (this.unstuckPhase < 1.3) {
      // Pivot phase: turn toward the goal again — controller steers freely.
      return { state: this.state, targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: 'walk', idleAction: 'none', unstuck: false };
    }
    this.unstuckPhase = 0;
    this.resetStuckWatch();
    return { state: this.state, targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: ceiling, idleAction: 'none', unstuck: false };
  }

  /**
   * Stuck watchdog: while navigating, sample position every `stuckWindow`;
   * if the horse barely moved while it had a target, declare unstuck.
   */
  private updateStuckWatch(context: HorseBrainContext): boolean {
    if (this.unstuckPhase > 0) return true;
    this.stuckSampleTimer += context.deltaSeconds;
    if (this.stuckSampleTimer < this.stuckWindow) return false;
    const moved = Math.hypot(context.horseX - this.stuckSampleX, context.horseZ - this.stuckSampleZ);
    this.stuckSampleTimer = 0;
    this.stuckSampleX = context.horseX;
    this.stuckSampleZ = context.horseZ;
    if (moved < this.stuckMinDisplacement) {
      this.unstuckPhase = 1e-6; // start the maneuver
      return true;
    }
    return false;
  }

  private resetStuckWatch(): void {
    this.stuckSampleTimer = -0.5; // give the horse a moment to start moving
    this.stuckSampleX = 0;
    this.stuckSampleZ = 0;
    this.unstuckPhase = 0;
  }

  /** Feeds the watchdog a fresh anchor (called by the controller each tick). */
  notePosition(x: number, z: number): void {
    if (this.stuckSampleX === 0 && this.stuckSampleZ === 0) {
      this.stuckSampleX = x;
      this.stuckSampleZ = z;
    }
  }
}
