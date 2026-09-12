/**
 * Vitals — Health & Stamina systems for the player character (and reusable
 * for future NPCs). Pure TypeScript, no rendering dependencies, fully
 * deterministic so they are trivially testable and can tick at any rate.
 */

// --- Health -----------------------------------------------------------------

export interface HealthSystemOptions {
  max?: number;
  /** Start value; defaults to max. */
  initial?: number;
  /**
   * Optional fall-damage hook, disabled by default (Part 2 keeps it off until
   * combat lands). Maps impact speed (m/s at landing) to damage.
   */
  fallDamageEnabled?: boolean;
  fallDamageThreshold?: number;
  fallDamageScale?: number;
}

export type HealthEvent = 'damaged' | 'healed' | 'died' | 'respawned';

/** Tracks hit points, emits change events, and reports death exactly once. */
export class HealthSystem {
  private readonly maxHealth: number;
  private currentHealth: number;
  private dead = false;
  private deathReported = false;
  private readonly listeners: Array<(event: HealthEvent, value: number) => void> = [];
  private readonly fallDamageEnabled: boolean;
  private readonly fallDamageThreshold: number;
  private readonly fallDamageScale: number;

  constructor(options: HealthSystemOptions = {}) {
    this.maxHealth = Math.max(1, options.max ?? 100);
    this.currentHealth = Math.min(this.maxHealth, Math.max(0, options.initial ?? this.maxHealth));
    this.fallDamageEnabled = options.fallDamageEnabled ?? false;
    this.fallDamageThreshold = Math.max(0, options.fallDamageThreshold ?? 9);
    this.fallDamageScale = Math.max(0, options.fallDamageScale ?? 4.5);
  }

  on(listener: (event: HealthEvent, value: number) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  get max(): number { return this.maxHealth; }
  get current(): number { return this.currentHealth; }
  get ratio(): number { return this.currentHealth / this.maxHealth; }
  get isDead(): boolean { return this.dead; }

  damage(amount: number): number {
    if (this.dead || amount <= 0) return 0;
    const applied = Math.min(this.currentHealth, amount);
    this.currentHealth -= applied;
    this.emit('damaged', applied);
    if (this.currentHealth <= 0) {
      this.dead = true;
      if (!this.deathReported) {
        this.deathReported = true;
        this.emit('died', 0);
      }
    }
    return applied;
  }

  heal(amount: number): number {
    if (this.dead || amount <= 0) return 0;
    const applied = Math.min(this.maxHealth - this.currentHealth, amount);
    this.currentHealth += applied;
    if (applied > 0) this.emit('healed', applied);
    return applied;
  }

  /**
   * Fall-damage hook: call with the vertical speed at the moment of landing.
   * No-op while `fallDamageEnabled` is false (the future-combat switch).
   */
  applyFallImpact(impactSpeed: number): number {
    if (!this.fallDamageEnabled) return 0;
    if (impactSpeed <= this.fallDamageThreshold) return 0;
    return this.damage((impactSpeed - this.fallDamageThreshold) * this.fallDamageScale);
  }

  /** Full restore used by the respawn flow. */
  reset(): void {
    this.currentHealth = this.maxHealth;
    const wasDead = this.dead;
    this.dead = false;
    this.deathReported = false;
    if (wasDead) this.emit('respawned', this.currentHealth);
  }

  private emit(event: HealthEvent, value: number): void {
    for (const listener of this.listeners) listener(event, value);
  }
}

// --- Stamina ----------------------------------------------------------------

export interface StaminaSystemOptions {
  max?: number;
  /** Stamina consumed per second while sprinting. */
  drainPerSecond?: number;
  /** Stamina restored per second while regenerating. */
  regenPerSecond?: number;
  /** Seconds of non-sprint required before regeneration starts. */
  regenDelaySeconds?: number;
  /** When stamina falls to/below this, sprint locks until `recoverThreshold`. */
  lockThreshold?: number;
  /** Stamina needed to unlock sprint again (hysteresis, avoids flip-flop). */
  recoverThreshold?: number;
}

/**
 * Sprint stamina with hysteresis: draining to the lock threshold stops sprint
 * until the pool recovers to the (higher) recover threshold, so the sprint
 * state can never flicker on the boundary.
 */
export class StaminaSystem {
  private readonly maxStamina: number;
  private readonly drainPerSecond: number;
  private readonly regenPerSecond: number;
  private readonly regenDelaySeconds: number;
  private readonly lockThreshold: number;
  private readonly recoverThreshold: number;
  private currentStamina: number;
  private sinceSprintSeconds = 0;
  private sprintLocked = false;

  constructor(options: StaminaSystemOptions = {}) {
    this.maxStamina = Math.max(1, options.max ?? 100);
    this.drainPerSecond = Math.max(0, options.drainPerSecond ?? 14);
    this.regenPerSecond = Math.max(0, options.regenPerSecond ?? 16);
    this.regenDelaySeconds = Math.max(0, options.regenDelaySeconds ?? 0.8);
    this.lockThreshold = Math.max(0, options.lockThreshold ?? 5);
    this.recoverThreshold = Math.min(this.maxStamina, Math.max(this.lockThreshold, options.recoverThreshold ?? 30));
    this.currentStamina = this.maxStamina;
  }

  get max(): number { return this.maxStamina; }
  get current(): number { return this.currentStamina; }
  get ratio(): number { return this.currentStamina / this.maxStamina; }
  get isSprintLocked(): boolean { return this.sprintLocked; }

  /** Whether sprinting is currently permitted (not locked, pool not empty). */
  canSprint(): boolean {
    return !this.sprintLocked && this.currentStamina > 0;
  }

  /**
   * Advance the pool. `sprinting` means "actually sprinting right now"
   * (the caller combines input + moving + grounded); the delay clock resets
   * only while sprinting drains the pool.
   */
  update(deltaSeconds: number, sprinting: boolean): void {
    const dt = Math.max(0, deltaSeconds);
    if (sprinting && this.currentStamina > 0) {
      this.sinceSprintSeconds = 0;
      this.currentStamina = Math.max(0, this.currentStamina - this.drainPerSecond * dt);
      if (!this.sprintLocked && this.currentStamina <= this.lockThreshold) this.sprintLocked = true;
      return;
    }
    this.sinceSprintSeconds += dt;
    if (this.sinceSprintSeconds < this.regenDelaySeconds) return;
    if (this.currentStamina < this.maxStamina) {
      this.currentStamina = Math.min(this.maxStamina, this.currentStamina + this.regenPerSecond * dt);
    }
    if (this.sprintLocked && this.currentStamina >= this.recoverThreshold) this.sprintLocked = false;
  }

  /** Full restore used by the respawn flow. */
  reset(): void {
    this.currentStamina = this.maxStamina;
    this.sinceSprintSeconds = 0;
    this.sprintLocked = false;
  }
}
