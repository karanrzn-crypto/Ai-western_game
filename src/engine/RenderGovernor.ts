/**
 * RenderGovernor — the single owner of "how hard do we push the GPU".
 *
 * Two cooperating governors, both driven from the wall-clock perf counter:
 *
 *   1. AdaptiveResolution — the DPR ladder. WEAK-LAPTOP POLICY (measured on
 *      the 1280×800 software-rendered harness + the user's laptop matrix:
 *      1.5 → 166.6ms/6fps, 1.0 → 83.3ms/12, 0.85 → 66.6/15, 0.75 → 50/20 —
 *      frame time is essentially linear in pixels on fill-bound machines):
 *
 *        • The ladder TOPS OUT at 1.0 — the old 1.5/1.25 rungs made every
 *          weak machine boot into a slideshow for seconds and were removed.
 *        • The game BOOTS at 0.85 (never at the top rung) so weak systems
 *          start playable instead of climbing down from 1.5.
 *        • Stepping UP requires PROVEN headroom: fps ≥ stepUpFps for
 *          `stepUpConfirmations` consecutive checks. A weak machine that
 *          sits below 21 fps can never climb back — no "bounce" to a high
 *          DPR without reason.
 *        • Stepping DOWN stays aggressive (below 21 one rung, below 12 two)
 *          so a slideshow reaches a readable rung fast.
 *
 *   2. ShadowScheduler — on-demand shadow-map refresh. The shadow depth
 *      pass costs real milliseconds (measured: ~12 ms per 2048² refresh on
 *      the harness, ~6 ms/frame amortized at the old every-other-frame
 *      cadence) while the sun orbits a barely-visible ~0.02°/frame. The
 *      scheduler fires the refresh ONLY when the cooldown expires:
 *        • casters moving (player/horse/mount/edit drag) → fast cadence —
 *          their shadows must track them;
 *        • world idle (sun drift only) → slow cadence — nothing else in the
 *          light frustum changed, so 4–5 of every 6 depth passes were waste.
 */

/** Target that receives resolution changes (three.js renderer compatible). */
export interface ResolutionSink {
  setPixelRatio(ratio: number): void;
}

export interface AdaptiveResolutionOptions {
  /** Applies the chosen pixel ratio (typically the three.js renderer). */
  sink: ResolutionSink;
  /** Reported by the host (window.devicePixelRatio in the browser). */
  getDevicePixelRatio: () => number;
  /** Ladder, BEST quality first — index 0 is the highest allowed ratio. */
  ladder?: readonly number[];
  /** Boot rung index (default: 1 → the second rung, e.g. 0.85). */
  initialRung?: number;
  /** Wall-clock ms between adaptation checks (default 1500). */
  checkIntervalMs?: number;
  /** Warm-up ms before the first check so boot-time shader compilation
   *  cannot fake a slow machine (default 4000). */
  warmupMs?: number;
  /** frame EMA below this fps → one rung down (default 21). */
  stepDownFps?: number;
  /** frame EMA below this fps → two rungs down, slideshow escape (default 12). */
  stepDownFastFps?: number;
  /** Sustained fps required before ONE rung up (default 50). */
  stepUpFps?: number;
  /** Consecutive up-threshold checks required before that one rung up. */
  stepUpConfirmations?: number;
}

export class AdaptiveResolution {
  private readonly sink: ResolutionSink;
  private readonly getDevicePixelRatio: () => number;
  private readonly ladder: readonly number[];
  private rung: number;
  private readonly checkIntervalMs: number;
  private readonly warmupMs: number;
  private readonly stepDownFps: number;
  private readonly stepDownFastFps: number;
  private readonly stepUpFps: number;
  private readonly stepUpConfirmations: number;
  private nextCheckAt: number;
  private goodStreak = 0;

  constructor(options: AdaptiveResolutionOptions) {
    this.sink = options.sink;
    this.getDevicePixelRatio = options.getDevicePixelRatio;
    this.ladder = options.ladder ?? DEFAULT_DPR_LADDER;
    this.rung = Math.max(0, Math.min(this.ladder.length - 1, options.initialRung ?? 1));
    this.checkIntervalMs = options.checkIntervalMs ?? 1500;
    this.warmupMs = options.warmupMs ?? 4000;
    this.stepDownFps = options.stepDownFps ?? 21;
    this.stepDownFastFps = options.stepDownFastFps ?? 12;
    this.stepUpFps = options.stepUpFps ?? 50;
    this.stepUpConfirmations = Math.max(1, options.stepUpConfirmations ?? 2);
    this.nextCheckAt = performance.now() + this.warmupMs;
    this.apply(); // boot rung — never starts at the top of the ladder
  }

  /** Current effective pixel ratio (device-capped rung value). */
  getPixelRatio(): number {
    return Math.min(this.getDevicePixelRatio() || 1, this.ladder[this.rung]);
  }

  getCurrentRungIndex(): number {
    return this.rung;
  }

  /**
   * Feed the wall-clock frame EMA once per frame. Returns true when the rung
   * changed (the drawing buffer was reallocated this frame).
   */
  update(nowMs: number, frameEmaSeconds: number): boolean {
    if (nowMs < this.nextCheckAt) return false;
    this.nextCheckAt = nowMs + this.checkIntervalMs;
    const fps = 1 / Math.max(frameEmaSeconds, 1e-4);
    if (fps < this.stepDownFastFps) {
      this.goodStreak = 0;
      return this.move(+2);
    }
    if (fps < this.stepDownFps) {
      this.goodStreak = 0;
      return this.move(+1);
    }
    if (fps >= this.stepUpFps) {
      this.goodStreak += 1;
      if (this.goodStreak >= this.stepUpConfirmations) {
        this.goodStreak = 0;
        return this.move(-1);
      }
      return false;
    }
    this.goodStreak = 0;
    return false;
  }

  /** +n steps toward FASTER (smaller ratio), −1 toward QUALITY. */
  private move(steps: number): boolean {
    const next = Math.max(0, Math.min(this.ladder.length - 1, this.rung + steps));
    if (next === this.rung) return false;
    this.rung = next;
    this.apply();
    return true;
  }

  private apply(): void {
    this.sink.setPixelRatio(this.getPixelRatio());
  }
}

/**
 * WEAK-LAPTOP LADDER — tops out at 1.0. The previous ladder (1.5, 1.25, …)
 * let strong machines render supersampled, but on the target weak hardware
 * 1.5 measured 166 ms/frame (6 fps): those rungs only ever produced slideshows.
 */
export const DEFAULT_DPR_LADDER = [1.0, 0.85, 0.75] as const;

export interface ShadowSchedulerOptions {
  /** Refresh cadence while only the sun drifts (default 0.15 s). */
  idleIntervalSeconds?: number;
  /** Refresh cadence while shadow casters move (default 1/30 s — every
   *  other frame at 60 fps, the old behaviour). */
  movingIntervalSeconds?: number;
}

export class ShadowScheduler {
  private readonly idleIntervalSeconds: number;
  private readonly movingIntervalSeconds: number;
  private cooldown = 0; // ≤ 0 → the very first update() fires
  private previousMoving = false;

  constructor(options: ShadowSchedulerOptions = {}) {
    this.idleIntervalSeconds = Math.max(0.001, options.idleIntervalSeconds ?? 0.15);
    this.movingIntervalSeconds = Math.max(0.001, options.movingIntervalSeconds ?? 1 / 30);
  }

  /**
   * Call once per frame. Returns true exactly when the shadow map should be
   * rebuilt this frame (`renderer.shadowMap.needsUpdate = true`).
   *
   * A false→true transition of `castersMoving` fires IMMEDIATELY (a caster
   * just started moving — its shadow must not trail up to a full idle
   * interval behind it), then the fast moving cadence takes over.
   */
  update(deltaSeconds: number, castersMoving: boolean): boolean {
    this.cooldown -= Math.max(0, deltaSeconds);
    const startedMoving = castersMoving && !this.previousMoving;
    this.previousMoving = castersMoving;
    if (this.cooldown > 0 && !startedMoving) return false;
    this.cooldown = castersMoving ? this.movingIntervalSeconds : this.idleIntervalSeconds;
    return true;
  }

  /** Force the next update() to fire (a transform changed off-cadence). */
  invalidate(): void {
    this.cooldown = 0;
  }
}
