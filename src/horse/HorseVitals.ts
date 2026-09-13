/**
 * HorseVitals — the horse's stamina economy (health reuses the generic
 * HealthSystem from player/Vitals).
 *
 * HorseStamina rules (spec §5):
 *   - Gallop drains fast, canter drains slowly, trot is neutral, walk
 *     recovers slowly, standing recovers fast.
 *   - Any drain pauses recovery for `regenDelay` seconds.
 *   - Falling to/below `fatigueLock` locks the gallop (Fatigued state) until
 *     the pool recovers to `fatigueRecover` (hysteresis — no flicker).
 *   - While fatigued the controller caps the gait at canter and speed decays
 *     naturally; after rest the horse is fresh again.
 * Pure TypeScript, deterministic, tickable at any rate.
 */
import { HORSE_STAMINA } from './HorseProportions.js';
import type { HorseGait } from './HorseProportions.js';

export class HorseStamina {
  private readonly maxStamina: number;
  private currentStamina: number;
  private sinceDrainSeconds = 0;
  private fatigued = false;

  constructor(max = HORSE_STAMINA.max) {
    this.maxStamina = Math.max(1, max);
    this.currentStamina = this.maxStamina;
  }

  get max(): number { return this.maxStamina; }
  get current(): number { return this.currentStamina; }
  get ratio(): number { return this.currentStamina / this.maxStamina; }
  /** Fatigue lock engaged — gallop denied until recovery (spec §5). */
  get isFatigued(): boolean { return this.fatigued; }

  /** Whether the gallop gait is currently available. */
  canGallop(): boolean {
    return !this.fatigued && this.currentStamina > 0;
  }

  /**
   * Advance the pool for one frame with the gait the horse is ACTUALLY
   * holding (its current speed band, not the requested target).
   */
  update(deltaSeconds: number, activeGait: HorseGait): void {
    const dt = Math.max(0, deltaSeconds);
    let rate = 0;
    switch (activeGait) {
      case 'gallop': rate = -HORSE_STAMINA.gallopDrain; break;
      case 'canter': rate = -HORSE_STAMINA.canterDrain; break;
      case 'walk': rate = HORSE_STAMINA.walkRegen; break;
      case 'idle': rate = HORSE_STAMINA.idleRegen; break;
      case 'trot': rate = HORSE_STAMINA.trotRegen; break; // neutral
    }
    if (rate < 0) {
      this.sinceDrainSeconds = 0;
      this.currentStamina = Math.max(0, this.currentStamina + rate * dt);
      if (!this.fatigued && this.currentStamina <= HORSE_STAMINA.fatigueLock) this.fatigued = true;
      return;
    }
    // Regeneration path (walk/idle/trot-neutral after its delay).
    this.sinceDrainSeconds += dt;
    if (rate > 0 && this.sinceDrainSeconds >= HORSE_STAMINA.regenDelay) {
      this.currentStamina = Math.min(this.maxStamina, this.currentStamina + rate * dt);
    }
    if (this.fatigued && this.currentStamina >= HORSE_STAMINA.fatigueRecover) this.fatigued = false;
  }

  /** Immediate one-shot cost (hard collision panic, spook surge...). */
  spend(amount: number): number {
    if (amount <= 0 || this.currentStamina <= 0) return 0;
    const applied = Math.min(this.currentStamina, amount);
    this.currentStamina -= applied;
    this.sinceDrainSeconds = 0;
    if (!this.fatigued && this.currentStamina <= HORSE_STAMINA.fatigueLock) this.fatigued = true;
    return applied;
  }

  /** Full restore (revive / restore-from-save). Values inside the hysteresis
   * band keep the current fatigue lock; crossing a threshold updates it. */
  reset(value = this.maxStamina): void {
    this.currentStamina = Math.min(this.maxStamina, Math.max(0, value));
    this.sinceDrainSeconds = 0;
    if (this.currentStamina <= HORSE_STAMINA.fatigueLock) this.fatigued = true;
    else if (this.currentStamina >= HORSE_STAMINA.fatigueRecover) this.fatigued = false;
  }
}
