/**
 * HorseBrain — the horse's autonomous AI.
 *
 * Pure decision layer: it reads a plain context snapshot and emits a plain
 * order each decision tick (10 Hz — AI must not do heavy math every frame).
 * It owns NO movement math and NO rendering; HorseController executes the
 * orders through the gait/steering/collision machinery.
 *
 * States (revision §10) — always exactly one, never mixed:
 *   idle    — unmounted default; free to perform natural idle life (look /
 *             graze / weight shift / head low / a few small steps).
 *   stay    — explicit player command: remains at its current location even
 *             if the player walks away. Idle life CONTINUES in place (§11),
 *             but no locomotion steps and never an autonomous return.
 *   follow  — trails the player automatically ONLY under the game's intended
 *             follow condition: the PLAYER is moving away from the horse and
 *             the separation exceeds followStart. A horse that moved away by
 *             itself (flee, idle wander) never auto-returns (§8).
 *   come    — an explicit player command (COME / whistle): navigate to the
 *             player from anywhere, stop at the arrival distance, then idle.
 *   moving  — executing a small idle-life step or any transient locomotion.
 *   flee    — scared: run AWAY from the threat point, control limited. When
 *             the flee ends the horse calms where it IS (no auto-return); if
 *             STAY was active it resumes staying at its new location.
 *   injured — alive but health < 30%: gait capped, posture low; idle life
 *             continues while standing (never while moving).
 *   dead    — terminal; all autonomy stops. Only an explicit future revival
 *             mechanic may end it (no respawn, no timer).
 *   ridden  — the player is in the saddle: AI yields completely.
 *
 * Stuck watchdog: while navigating (come/follow/flee), if the displacement
 * over the watchdog window is below the minimum, the brain emits an UNSTUCK
 * maneuver (reverse + turn) instead of pushing into the obstacle forever.
 */

export type HorseAiState =
  | 'idle' | 'stay' | 'follow' | 'come' | 'moving' | 'flee' | 'injured' | 'ridden' | 'dead';

export type HorseIdleActionName = 'none' | 'graze' | 'look' | 'shift' | 'headLow' | 'step';

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
  /** Player horizontal speed (m/s) — the follow condition needs "moving away". */
  playerSpeed: number;
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

/** Randomized action durations (seconds) — the idle mix never repeats the
 *  same shape the same way twice (spec §5: varied intervals). */
function actionDuration(action: HorseIdleActionName): number {
  switch (action) {
    case 'graze': return 3.5 + Math.random() * 2.5;
    case 'look': return 2.2 + Math.random() * 1.8;
    case 'headLow': return 2 + Math.random() * 1.6;
    case 'shift': return 1.6 + Math.random() * 0.9;
    default: return 1;
  }
}

export class HorseBrain {
  private state: HorseAiState = 'idle';
  /** STAY persists through scares: the horse resumes staying where it calmed. */
  private stayActive = false;
  private decisionClock = 0;
  private idleActionTimer = 1.5;
  private idleAction: HorseIdleActionName = 'none';
  private idleActionAge = 0;
  private idleActionDuration = 1;
  private stepTarget: { x: number; z: number } | null = null;
  private fleeTimer = 0;
  private fleeTarget: { x: number; z: number } | null = null;
  private summonCooldownTimer = 0;
  /** Player↔horse distance at the previous decision tick (follow direction). */
  private lastPlayerDistance: number | null = null;
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
  get isStaying(): boolean { return this.stayActive; }

  /** COME — explicit command: navigate to the player. False while on cooldown
   *  or when the horse cannot obey (dead / ridden). Overrides STAY. */
  summon(): boolean {
    if (this.state === 'dead' || this.state === 'ridden') return false;
    if (this.summonCooldownTimer > 0) return false;
    this.summonCooldownTimer = this.summonCooldown;
    this.state = 'come';
    this.stayActive = false;
    this.fleeTimer = 0;
    this.fleeTarget = null;
    this.idleAction = 'none';
    this.stepTarget = null;
    this.resetStuckWatch();
    return true;
  }

  /** STAY — explicit command: park here (idle life continues in place).
   *  Calling again releases the stay. Rejected while fleeing (too scared)
   *  and while ridden/dead. */
  commandStay(): boolean {
    if (this.state === 'dead' || this.state === 'ridden' || this.state === 'flee') return false;
    if (this.stayActive) {
      this.stayActive = false;
      if (this.state === 'stay') this.state = 'idle';
      this.idleActionTimer = 1;
      return true;
    }
    this.stayActive = true;
    this.state = 'stay';
    this.fleeTimer = 0;
    this.fleeTarget = null;
    this.idleAction = 'none';
    this.idleActionAge = 0;
    this.stepTarget = null;
    return true;
  }

  /** Scare the horse away from a world point. Fear overrides every command
   *  (a startled horse runs first); STAY resumes where it calms. */
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
    this.fleeTarget = null;
    this.idleAction = 'none';
    this.idleActionAge = 0;
    this.stepTarget = null;
    this.unstuckPhase = 0;
    if (state === 'ridden') this.stayActive = false; // riding supersedes STAY
    if (state === 'idle') this.stayActive = false;
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
      this.stayActive = false;
      return { state: 'dead', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: 'walk', idleAction: 'none', unstuck: false };
    }
    if (this.state === 'dead') this.state = this.stayActive ? 'stay' : 'injured'; // explicit revive
    if (context.mounted) {
      this.state = 'ridden';
      this.idleAction = 'none';
      return { state: 'ridden', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: 'gallop', idleAction: 'none', unstuck: false };
    }
    if (this.state === 'ridden') this.state = this.stayActive ? 'stay' : 'idle'; // rider just dismounted

    const distToPlayer = Math.hypot(context.playerX - context.horseX, context.playerZ - context.horseZ);
    const injured = context.healthRatio > 0 && context.healthRatio < this.injuredRatio;

    // Flee runs its timer; when it ends the horse calms WHERE IT IS — it
    // never autonomously returns to the player (§8). STAY resumes in place.
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0 || !this.fleeTarget) {
        this.state = this.stayActive ? 'stay' : 'idle';
        this.fleeTarget = null;
        this.idleActionTimer = 1;
      }
    }
    // Injury supersedes idle-ish states but never interrupts COME (explicit)
    // or FLEE (panic); recovery hands the state back (STAY included).
    if (this.state !== 'flee' && this.state !== 'come' && this.state !== 'stay' && this.state !== 'injured'
      && injured && (this.state === 'idle' || this.state === 'moving' || this.state === 'follow')) {
      this.state = 'injured';
    } else if (this.state === 'injured' && !injured) {
      this.state = this.stayActive ? 'stay' : 'idle';
    }

    this.decisionClock += dt;
    if (this.decisionClock >= 1 / this.tickHz) {
      this.decisionClock = 0;
      this.decide(context, distToPlayer);
      this.lastPlayerDistance = distToPlayer;
    }

    return this.buildOrder(context, distToPlayer);
  }

  /** Slow decision pass (10 Hz): state selection + idle-life scheduling.
   *  The idle mix: look around, graze, weight shift / hoof lift, relaxed
   *  head-low, a few small steps — randomized pick, durations and gaps, so
   *  no fixed loop emerges. STAY keeps the idle life but drops the steps. */
  private decide(context: HorseBrainContext, distToPlayer: number): void {
    if (this.state === 'flee' || this.state === 'come' || this.state === 'ridden' || this.state === 'dead') return;

    // FOLLOW arbitration (§8/§10): only the game's intended follow condition
    // engages it — the PLAYER is walking away from the horse and the gap is
    // beyond followStart. A horse that drifted/fled away by itself stays put
    // (a stationary player never triggers follow; a shrinking gap neither).
    if (this.state !== 'stay' && this.state !== 'follow'
      && distToPlayer > this.followStart
      && context.playerSpeed > 0.5
      && (this.lastPlayerDistance === null || distToPlayer >= this.lastPlayerDistance - 0.05)) {
      this.state = 'follow';
      this.idleAction = 'none';
      this.stepTarget = null;
      return;
    }
    if (this.state === 'follow' && distToPlayer <= this.followStop) {
      this.state = 'idle';
      this.idleActionTimer = 1.2;
    }

    if (this.state === 'idle' || this.state === 'stay' || this.state === 'injured') {
      const stepAllowed = this.state === 'idle'; // STAY: idle life stays in place
      this.idleActionAge += 1 / this.tickHz;
      if (this.idleAction !== 'none') {
        const done = this.idleAction === 'step'
          ? this.stepTarget === null
          : this.idleActionAge >= this.idleActionDuration;
        if (done) {
          this.idleAction = 'none';
          this.idleActionAge = 0;
          this.idleActionTimer = 1.5 + Math.random() * 6.5;
        }
        return;
      }
      this.idleActionTimer -= 1 / this.tickHz;
      if (this.idleActionTimer <= 0) {
        // Weighted random pick; injured horses skip the step.
        const roll = Math.random();
        const pick = (action: HorseIdleActionName): void => {
          this.idleAction = action;
          this.idleActionAge = 0;
          this.idleActionDuration = actionDuration(action);
        };
        if (roll < 0.26) pick('look');
        else if (roll < 0.5) pick('graze');
        else if (roll < 0.72) pick('shift');
        else if (roll < 0.88) pick('headLow');
        else if (stepAllowed && context.playerMoving !== true) {
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
            pick('look');
          }
        } else {
          pick('look');
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
          this.state = this.stayActive ? 'stay' : 'idle';
          return { state: this.state, targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: ceiling, idleAction: 'none', unstuck: false };
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
          this.state = this.stayActive ? 'stay' : 'idle';
          this.idleActionTimer = 1.5;
          return { state: this.state, targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: ceiling, idleAction: 'none', unstuck: false };
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
      case 'stay':
        return { state: 'stay', targetX: null, targetZ: null, arriveRadius: 0, gaitCeiling: ceiling, idleAction: this.idleAction === 'step' ? 'none' : this.idleAction, unstuck: false };
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
