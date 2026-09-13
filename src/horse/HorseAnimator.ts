/**
 * HorseAnimator — procedural animation for the horse rig.
 *
 * Same contract as CharacterAnimator: every frame a full target pose is
 * composed from the horse's state, then every channel is exponentially
 * smoothed toward its target (free natural blends, no popping).
 *
 * Gait cycles are PHASE-DRIVEN BY REAL SPEED: the leg cycle advances at
 * 2π · speed / strideLength, so the animation is always synchronized with
 * the actual movement (spec §1). At a standstill the locomotion cycle is
 * bypassed entirely — a standing horse never plays a moving animation.
 *
 * Unmounted idle life (spec: Horse Idle / Unmounted Life): breathing, tail
 * swish, ear twitches, blinking, head/neck look-around, weight shifts, a
 * graze action, plus small random steps (the STEPS themselves are moved by
 * the controller/brain — the animator only renders them). None of these run
 * while the horse is ridden or frightened; fear overlays (ears back, tail
 * up, trembling) take priority, then damage flinch, then the death timeline.
 */
import type { HorseModel } from './HorseModel.js';
import { HORSE_GAITS, HORSE_PROPORTIONS, type HorseGait } from './HorseProportions.js';

export type HorseIdleAction = 'none' | 'graze' | 'look' | 'shift';

export interface HorseAnimatorInput {
  deltaSeconds: number;
  /** Horizontal speed (m/s) — absolute value; reverse animates as a slow walk. */
  speed: number;
  /** Declared gait label from the controller ('dead' runs the death timeline). */
  gait: HorseGait | 'dead';
  /** Yaw change rate (rad/s) — drives the lean-into-turn channels. */
  turnRate?: number;
  /** 0..1 fear intensity (ears back, tail up, trembling). */
  fear?: number;
  /** Injured posture (head low, drooping ears) while alive. */
  injured?: boolean;
  /** Rider in the saddle — suppresses graze/look-away idle life. */
  mounted?: boolean;
  /** Current unmounted idle action chosen by the brain. */
  idleAction?: HorseIdleAction;
  /** Seconds since the idle action started (drives its phase). */
  idleActionTime?: number;
}

/** Called when the horse takes damage; runs a 0.45s flinch. */
export interface HorseAnimatorHooks {
  notifyDamage(): void;
}

type PoseKey =
  | 'body.posY' | 'body.rx' | 'body.ry' | 'body.rz'
  | 'neck.rx' | 'neck.ry' | 'neck.rz'
  | 'head.rx' | 'head.ry'
  | 'earL.rx' | 'earL.rz' | 'earR.rx' | 'earR.rz'
  | 'tail.rx' | 'tail.ry' | 'tail.rz'
  | 'legFL.rx' | 'kneeFL.rx' | 'legFR.rx' | 'kneeFR.rx'
  | 'legBL.rx' | 'kneeBL.rx' | 'legBR.rx' | 'kneeBR.rx';

const POSE_KEYS: PoseKey[] = [
  'body.posY', 'body.rx', 'body.ry', 'body.rz',
  'neck.rx', 'neck.ry', 'neck.rz',
  'head.rx', 'head.ry',
  'earL.rx', 'earL.rz', 'earR.rx', 'earR.rz',
  'tail.rx', 'tail.ry', 'tail.rz',
  'legFL.rx', 'kneeFL.rx', 'legFR.rx', 'kneeFR.rx',
  'legBL.rx', 'kneeBL.rx', 'legBR.rx', 'kneeBR.rx',
];

const DEATH_DURATION = 1.6;
const FLINCH_DURATION = 0.45;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

/**
 * Leg phase offsets per gait (radians of the shared cycle phase):
 *   walk   — 4-beat lateral sequence: LF, RF… classic walk: LH, LF, RH, RF.
 *   trot   — 2-beat diagonal pairs (LF+RH, RF+LH).
 *   canter — 3-beat: RH, LH, then the LF+RF lead pair.
 *   gallop — 4-beat with front-pair suspension and a longer hind reach.
 */
const GAIT_PHASES: Record<Exclude<HorseGait, 'idle'>, { fl: number; fr: number; bl: number; br: number }> = {
  walk: { fl: Math.PI * 0.5, fr: Math.PI * 1.5, bl: 0, br: Math.PI },
  trot: { fl: 0, fr: Math.PI, bl: Math.PI, br: 0 },
  canter: { fl: Math.PI * 4 / 3, fr: Math.PI * 4 / 3, bl: Math.PI * 2 / 3, br: 0 },
  gallop: { fl: Math.PI + 0.45, fr: Math.PI, bl: 0.45, br: 0 },
};

export class HorseAnimator {
  private readonly model: HorseModel;
  private readonly current = new Map<PoseKey, number>();
  private readonly targets = new Map<PoseKey, number>();
  private readonly rates = new Map<PoseKey, number>();
  private phase = 0;
  private clock = 0;
  private flinchTime = -1;
  private deathTime = -1;
  private blinkTimer = 2.5;
  private blinkAge = -1;
  private earTwitchTimer = 3;
  private earTwitchAge = -1;
  private earTwitchSide = 0;
  private tailFlickTimer = 4;
  private tailFlickAge = -1;
  private lastGait: HorseGait | 'dead' = 'idle';

  constructor(model: HorseModel) {
    this.model = model;
  }

  getPhase(): number { return this.phase; }

  /** Legacy hook surface (kept for symmetry with CharacterAnimator). */
  get hooks(): HorseAnimatorHooks {
    return { notifyDamage: () => this.notifyDamage() };
  }

  /** Trigger the damage-reaction flinch (spec §1/§6). */
  notifyDamage(): void {
    if (this.deathTime >= 0) return;
    this.flinchTime = 0;
  }

  /** Restore the rest pose instantly (restore/respawn flows). */
  reset(): void {
    this.current.clear();
    this.targets.clear();
    this.rates.clear();
    this.phase = 0;
    this.clock = 0;
    this.flinchTime = -1;
    this.deathTime = -1;
    this.blinkAge = -1;
    this.earTwitchAge = -1;
    this.tailFlickAge = -1;
    this.lastGait = 'idle';
    const { root, joints, eyes } = this.model;
    root.rotation.x = 0;
    root.rotation.z = 0;
    for (const joint of Object.values(joints)) joint.rotation.set(0, 0, 0);
    joints.body.position.y = HORSE_PROPORTIONS.bodyCenterY;
    for (const eye of eyes) eye.scale.y = 1;
    this.applyImmediateRest();
  }

  /** Write the neutral pose once (used by reset so the horse never T-poses). */
  private applyImmediateRest(): void {
    const j = this.model.joints;
    j.legFL.rotation.x = 0; j.legFR.rotation.x = 0;
    j.legBL.rotation.x = 0; j.legBR.rotation.x = 0;
    j.kneeFL.rotation.x = -0.06; j.kneeFR.rotation.x = -0.06;
    j.kneeBL.rotation.x = -0.06; j.kneeBR.rotation.x = -0.06;
    j.tail.rotation.x = 0.12;
    j.neck.rotation.x = -0.18;
  }

  update(input: HorseAnimatorInput): void {
    const dt = Math.max(0, input.deltaSeconds);
    this.clock += dt;

    // Blink + ear twitch + tail flick timers run in every living state.
    if (this.deathTime < 0) this.updateMicroLife(dt);

    if (input.gait === 'dead') {
      if (this.lastGait !== 'dead') this.deathTime = 0;
      if (this.deathTime >= 0) this.deathTime = Math.min(DEATH_DURATION, this.deathTime + dt);
      this.lastGait = 'dead';
      this.applyDeathPose(dt);
      return;
    }
    this.deathTime = -1;
    this.lastGait = input.gait;

    if (this.flinchTime >= 0) {
      this.flinchTime += dt;
      if (this.flinchTime > FLINCH_DURATION) this.flinchTime = -1;
    }

    const speed = Math.abs(Math.max(0, input.speed));
    const moving = speed > 0.15 && input.gait !== 'idle';
    // Phase advances with REAL ground speed: no movement → no cycle progress.
    if (moving) {
      const stride = HORSE_GAITS[input.gait === 'idle' ? 'walk' : input.gait].stride;
      this.phase = (this.phase + (Math.PI * 2) * (speed / stride) * dt) % (Math.PI * 2);
    }

    // Base: neutral standing pose (also the blend source between gaits).
    this.setAll((set) => {
      set('body.posY', HORSE_PROPORTIONS.bodyCenterY, 10);
      set('body.rx', 0, 10); set('body.ry', 0, 10); set('body.rz', 0, 10);
      set('neck.rx', -0.18, 9); set('neck.ry', 0, 9); set('neck.rz', 0, 9);
      set('head.rx', 0.06, 9); set('head.ry', 0, 9);
      set('earL.rx', 0, 10); set('earL.rz', -0.1, 10);
      set('earR.rx', 0, 10); set('earR.rz', 0.1, 10);
      set('tail.rx', 0.12, 9); set('tail.ry', 0, 9); set('tail.rz', 0, 9);
      set('legFL.rx', 0, 12); set('kneeFL.rx', -0.06, 12);
      set('legFR.rx', 0, 12); set('kneeFR.rx', -0.06, 12);
      set('legBL.rx', 0, 12); set('kneeBL.rx', -0.06, 12);
      set('legBR.rx', 0, 12); set('kneeBR.rx', -0.06, 12);
    });

    if (moving) this.applyGaitPose(input, speed);
    else this.applyStandPose(input);

    this.applyTurnLean(input);
    this.applyInjured(input);
    this.applyFear(input);
    this.applyFlinch();
    this.flush(dt);
  }

  /** Leg cycle for the current gait — amplitudes scale with the gait spec. */
  private applyGaitPose(input: HorseAnimatorInput, _speed: number): void {
    const gait: Exclude<HorseGait, 'idle'> = input.gait === 'idle' || input.gait === 'dead' ? 'walk' : input.gait;
    const spec = HORSE_GAITS[gait];
    const phases = GAIT_PHASES[gait];
    const phi = this.phase;
    const swing = spec.swing;
    // Knee flexion follows each leg's swing with a lag (hooves tuck mid-swing).
    const leg = (offset: number): { hip: number; knee: number } => {
      const s = Math.sin(phi + offset);
      const lift = Math.max(0, Math.sin(phi + offset + 2.2));
      return { hip: swing * s, knee: -(0.08 + swing * 0.85 * lift) };
    };
    const fl = leg(phases.fl);
    const fr = leg(phases.fr);
    const bl = leg(phases.bl);
    const br = leg(phases.br);
    const bobPhase = gait === 'trot' ? 2 * phi : phi * 2;
    const bob = spec.bob * (0.5 - 0.5 * Math.cos(bobPhase));
    const gallopPitch = gait === 'gallop' ? 0.1 * Math.sin(phi - 0.6) : gait === 'canter' ? 0.05 * Math.sin(phi) : 0;
    const gallopRoll = gait === 'gallop' ? 0.05 * Math.sin(phi) : 0;
    this.setAll((set) => {
      set('legFL.rx', fl.hip, 16); set('kneeFL.rx', fl.knee, 16);
      set('legFR.rx', fr.hip, 16); set('kneeFR.rx', fr.knee, 16);
      set('legBL.rx', bl.hip, 16); set('kneeBL.rx', bl.knee, 16);
      set('legBR.rx', br.hip, 16); set('kneeBR.rx', br.knee, 16);
      set('body.posY', HORSE_PROPORTIONS.bodyCenterY - bob, 16);
      set('body.rx', gallopPitch, 12);
      set('body.rz', gallopRoll, 12);
      // Head/neck counter-carriage: bounces opposite the barrel, stretches
      // forward at speed.
      set('neck.rx', -0.18 + (gait === 'gallop' ? -0.22 : gait === 'canter' ? -0.14 : -0.04) + 0.05 * Math.sin(bobPhase), 11);
      set('head.rx', 0.06 + (gait === 'gallop' ? 0.12 : 0), 11);
      set('tail.rx', 0.12 + (gait === 'gallop' ? -0.25 : 0.04 * Math.sin(phi)), 10);
      set('tail.ry', 0.18 * Math.sin(phi * 0.5 + 1), 10);
      set('earL.rz', -0.1 - 0.06, 10);
      set('earR.rz', 0.1 + 0.06, 10);
    });
  }

  /**
   * Standing pose + the unmounted idle life. While ridden the horse stays
   * attentive (no graze/look-away) — breathing and micro motion only.
   */
  private applyStandPose(input: HorseAnimatorInput): void {
    const t = this.clock;
    const ridden = input.mounted === true;
    const action = ridden ? 'none' : input.idleAction ?? 'none';
    const actionT = input.idleActionTime ?? 0;

    // Breathing (chest/ barrel) — always present while alive.
    this.setAll((set) => {
      set('body.posY', HORSE_PROPORTIONS.bodyCenterY - 0.008 * (0.5 - 0.5 * Math.cos(t * 1.6)), 6);
      set('body.rz', 0.008 * Math.sin(t * 0.8), 6);
      set('neck.rx', -0.18 + 0.02 * Math.sin(t * 1.6 + 0.7), 6);
    });

    if (action === 'graze') {
      // Neck reaches down, head nibbles at the grass.
      const reach = easeOut(clamp(actionT / 0.9, 0, 1));
      this.setAll((set) => {
        set('neck.rx', -0.18 + 1.35 * reach + 0.03 * Math.sin(t * 3.1) * reach, 6);
        set('head.rx', 0.06 + 0.22 * reach + 0.1 * Math.sin(t * 3.4) * reach, 7);
        set('head.ry', 0.1 * Math.sin(t * 1.9), 7);
        set('tail.ry', 0.25 * Math.sin(t * 2.2), 8);
        set('tail.rz', 0.1 * reach, 8);
      });
    } else if (action === 'look') {
      this.setAll((set) => {
        set('neck.ry', 0.3 * Math.sin(t * 0.9), 6);
        set('head.ry', 0.45 * Math.sin(t * 0.62 + 0.5), 6);
        set('head.rx', 0.06 + 0.05 * Math.sin(t * 1.3), 6);
        set('earL.rz', -0.1 - 0.25 * Math.max(0, Math.sin(t * 2.6)), 8);
        set('earR.rz', 0.1 + 0.25 * Math.max(0, Math.sin(t * 2.6 + 2.4)), 8);
      });
    } else if (action === 'shift') {
      // Weight shifts between the hind legs; a hoof picks up briefly.
      const w = Math.sin(t * 1.1);
      this.setAll((set) => {
        set('body.rz', 0.035 * w, 6);
        set('body.posY', HORSE_PROPORTIONS.bodyCenterY - 0.012 + 0.008 * w, 6);
        set('legBL.rx', 0.06 * w, 8);
        set('legBR.rx', -0.06 * w, 8);
        set('kneeBL.rx', -0.06 - 0.25 * Math.max(0, w), 8);
        set('tail.ry', 0.2 * Math.sin(t * 1.7), 8);
      });
    }
  }

  private applyTurnLean(input: HorseAnimatorInput): void {
    const turnRate = clamp(input.turnRate ?? 0, -3, 3);
    if (Math.abs(turnRate) < 0.05) return;
    const lean = clamp(-turnRate * 0.06, -0.12, 0.12);
    this.setAll((set) => {
      set('body.rz', (this.targets.get('body.rz') ?? 0) + lean, 8);
      set('neck.ry', (this.targets.get('neck.ry') ?? 0) + clamp(turnRate * 0.16, -0.4, 0.4), 8);
    });
  }

  /** Injured posture: head low, drooping ears, shallow breath. */
  private applyInjured(input: HorseAnimatorInput): void {
    if (!input.injured) return;
    this.setAll((set) => {
      set('neck.rx', (this.targets.get('neck.rx') ?? -0.18) + 0.4, 5);
      set('head.rx', (this.targets.get('head.rx') ?? 0.06) + 0.2, 5);
      set('earL.rz', -0.45, 5);
      set('earR.rz', 0.45, 5);
      set('tail.rz', 0, 5);
    });
  }

  /** Fear overlay: ears pinned back, tail raised, trembling. */
  private applyFear(input: HorseAnimatorInput): void {
    const fear = clamp(input.fear ?? 0, 0, 1);
    if (fear < 0.01) return;
    const t = this.clock;
    this.setAll((set) => {
      set('earL.rz', (this.targets.get('earL.rz') ?? -0.1) - 0.7 * fear, 9);
      set('earR.rz', (this.targets.get('earR.rz') ?? 0.1) + 0.7 * fear, 9);
      set('tail.rx', (this.targets.get('tail.rx') ?? 0.12) - 0.5 * fear, 9);
      set('neck.rx', (this.targets.get('neck.rx') ?? -0.18) - 0.25 * fear, 9);
      set('body.posY', (this.targets.get('body.posY') ?? HORSE_PROPORTIONS.bodyCenterY) + 0.004 * Math.sin(t * 31) * fear, 20);
    });
  }

  /** Damage reaction: head jerks up/back, body dips, then settles. */
  private applyFlinch(): void {
    if (this.flinchTime < 0) return;
    const t = clamp(this.flinchTime / FLINCH_DURATION, 0, 1);
    const pulse = Math.sin(t * Math.PI);
    this.setAll((set) => {
      set('neck.rx', (this.targets.get('neck.rx') ?? -0.18) - 0.5 * pulse, 16);
      set('head.rx', (this.targets.get('head.rx') ?? 0.06) - 0.35 * pulse, 16);
      set('body.posY', (this.targets.get('body.posY') ?? HORSE_PROPORTIONS.bodyCenterY) - 0.05 * pulse, 16);
      set('tail.rx', (this.targets.get('tail.rx') ?? 0.12) - 0.3 * pulse, 14);
      set('earL.rz', (this.targets.get('earL.rz') ?? -0.1) - 0.4 * pulse, 14);
      set('earR.rz', (this.targets.get('earR.rz') ?? 0.1) + 0.4 * pulse, 14);
    });
  }

  /** Death: legs fold, the body sinks and rolls onto its side, head rests. */
  private applyDeathPose(dt: number): void {
    const t = clamp((this.deathTime < 0 ? DEATH_DURATION : this.deathTime) / DEATH_DURATION, 0, 1);
    const ease = easeOut(t);
    // Roll the whole root onto its left side (root pivots at the hooves).
    this.model.root.rotation.z = 1.42 * ease;
    this.model.root.rotation.x = 0.06 * ease;
    this.setAll((set) => {
      set('body.posY', HORSE_PROPORTIONS.bodyCenterY * (1 - 0.55 * ease), 7);
      set('legFL.rx', 0.9 * ease, 7); set('kneeFL.rx', -1.6 * ease, 7);
      set('legFR.rx', 0.5 * ease, 7); set('kneeFR.rx', -1.2 * ease, 7);
      set('legBL.rx', 0.8 * ease, 7); set('kneeBL.rx', -1.5 * ease, 7);
      set('legBR.rx', 0.45 * ease, 7); set('kneeBR.rx', -1.1 * ease, 7);
      set('neck.rx', -0.18 + 0.85 * ease, 7);
      set('head.rx', 0.06 + 0.3 * ease, 7);
      set('tail.rx', 0.12 + 0.2 * ease, 7);
      set('earL.rz', -0.4 * ease, 7);
      set('earR.rz', 0.4 * ease, 7);
    });
    this.flush(dt, 7);
  }

  /** Blink / ear twitch / tail flick scheduler — living states only. */
  private updateMicroLife(dt: number): void {
    // Blink.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkAge < 0) {
      this.blinkAge = 0;
      this.blinkTimer = 2 + Math.random() * 3.5;
    }
    if (this.blinkAge >= 0) {
      this.blinkAge += dt;
      // 0.22s blink: close and reopen.
      const t = this.blinkAge / 0.22;
      const openness = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2;
      const scale = clamp(openness, 0.08, 1);
      this.model.eyes[0].scale.y = scale;
      this.model.eyes[1].scale.y = scale;
      if (this.blinkAge >= 0.22) {
        this.blinkAge = -1;
        this.model.eyes[0].scale.y = 1;
        this.model.eyes[1].scale.y = 1;
      }
    }
    // Ear twitch (one side at a time).
    this.earTwitchTimer -= dt;
    if (this.earTwitchTimer <= 0 && this.earTwitchAge < 0) {
      this.earTwitchAge = 0;
      this.earTwitchSide = Math.random() < 0.5 ? 0 : 1;
      this.earTwitchTimer = 2.5 + Math.random() * 4;
    }
    if (this.earTwitchAge >= 0) {
      this.earTwitchAge += dt;
      const t = this.earTwitchAge / 0.3;
      const wiggle = Math.sin(t * Math.PI * 3) * 0.3 * (1 - t);
      const joint = this.earTwitchSide === 0 ? this.model.joints.earL : this.model.joints.earR;
      // Applied directly as a post-pose offset; flush() will keep it because
      // the target channels below add the same wiggle during this window.
      if (this.earTwitchAge < 0.3) {
        this.setAll((set) => {
          const key: PoseKey = this.earTwitchSide === 0 ? 'earL.rz' : 'earR.rz';
          set(key, wiggle, 24);
        });
      } else {
        this.earTwitchAge = -1;
        joint.rotation.z = this.earTwitchSide === 0 ? -0.1 : 0.1;
      }
    }
    // Tail flick.
    this.tailFlickTimer -= dt;
    if (this.tailFlickTimer <= 0 && this.tailFlickAge < 0) {
      this.tailFlickAge = 0;
      this.tailFlickTimer = 3.5 + Math.random() * 4;
    }
    if (this.tailFlickAge >= 0) {
      this.tailFlickAge += dt;
      if (this.tailFlickAge < 0.5) {
        const t = this.tailFlickAge / 0.5;
        this.setAll((set) => {
          set('tail.ry', Math.sin(t * Math.PI * 2) * 0.5 * (1 - t * 0.4), 18);
        });
      } else {
        this.tailFlickAge = -1;
      }
    }
  }

  private setAll(compose: (set: (key: PoseKey, value: number, rate?: number) => void) => void): void {
    const set = (key: PoseKey, value: number, rate = 10): void => {
      this.targets.set(key, value);
      this.rates.set(key, rate);
    };
    compose(set);
  }

  /** Smooth every channel toward its target and write into the rig. */
  private flush(dt: number, defaultRate?: number): void {
    const blend = (rate: number): number => 1 - Math.exp(-rate * Math.max(dt, 1e-5));
    for (const key of POSE_KEYS) {
      if (!this.targets.has(key)) continue;
      const target = this.targets.get(key)!;
      const current = this.current.get(key) ?? target;
      const next = current + (target - current) * blend(defaultRate ?? this.rates.get(key) ?? 10);
      this.current.set(key, next);
      this.writeChannel(key, next);
    }
    this.targets.clear();
    this.rates.clear();
  }

  private writeChannel(key: PoseKey, value: number): void {
    const { joints } = this.model;
    const safe = Number.isFinite(value) ? clamp(value, -3, 3) : 0;
    switch (key) {
      case 'body.posY': joints.body.position.y = safe; break;
      case 'body.rx': joints.body.rotation.x = safe; break;
      case 'body.ry': joints.body.rotation.y = safe; break;
      case 'body.rz': joints.body.rotation.z = safe; break;
      case 'neck.rx': joints.neck.rotation.x = safe; break;
      case 'neck.ry': joints.neck.rotation.y = safe; break;
      case 'neck.rz': joints.neck.rotation.z = safe; break;
      case 'head.rx': joints.head.rotation.x = safe; break;
      case 'head.ry': joints.head.rotation.y = safe; break;
      case 'earL.rx': joints.earL.rotation.x = safe; break;
      case 'earL.rz': joints.earL.rotation.z = safe; break;
      case 'earR.rx': joints.earR.rotation.x = safe; break;
      case 'earR.rz': joints.earR.rotation.z = safe; break;
      case 'tail.rx': joints.tail.rotation.x = safe; break;
      case 'tail.ry': joints.tail.rotation.y = safe; break;
      case 'tail.rz': joints.tail.rotation.z = safe; break;
      case 'legFL.rx': joints.legFL.rotation.x = safe; break;
      case 'kneeFL.rx': joints.kneeFL.rotation.x = safe; break;
      case 'legFR.rx': joints.legFR.rotation.x = safe; break;
      case 'kneeFR.rx': joints.kneeFR.rotation.x = safe; break;
      case 'legBL.rx': joints.legBL.rotation.x = safe; break;
      case 'kneeBL.rx': joints.kneeBL.rotation.x = safe; break;
      case 'legBR.rx': joints.legBR.rotation.x = safe; break;
      case 'kneeBR.rx': joints.kneeBR.rotation.x = safe; break;
    }
  }
}
