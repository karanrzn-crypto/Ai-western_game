/**
 * CharacterAnimator — procedural animation for the main character rig.
 *
 * Every frame a full target pose is composed from the character state
 * (+ locomotion cycle, land impulse, turn lean, breathing), then every
 * channel is exponentially smoothed toward its target, which gives free
 * natural transitions (start/stop/turn blends) with no popping. Death runs
 * on a dedicated timeline. The rig's hat/equipment are rigid children of
 * joints, so nothing can clip during animation.
 */
import type { CharacterModel } from './CharacterModel.js';
import { CHARACTER_PROPORTIONS } from './CharacterProportions.js';
import type { CharacterState } from '../CharacterStateMachine.js';

export interface AnimatorInput {
  state: CharacterState;
  deltaSeconds: number;
  /** Horizontal speed (m/s). */
  speed: number;
  /** Yaw change rate (rad/s) — drives the lean-into-turn channels. */
  turnRate?: number;
}

type PoseKey =
  | 'hips.posY' | 'hips.rx' | 'hips.ry' | 'hips.rz'
  | 'spine.rx' | 'spine.ry'
  | 'chest.rx' | 'chest.ry' | 'chest.rz'
  | 'neck.rx' | 'neck.ry'
  | 'head.rx' | 'head.ry'
  | 'shoulderL.rx' | 'shoulderL.rz' | 'elbowL.rx'
  | 'shoulderR.rx' | 'shoulderR.rz' | 'elbowR.rx'
  | 'legL.rx' | 'kneeL.rx' | 'footL.rx'
  | 'legR.rx' | 'kneeR.rx' | 'footR.rx';

const POSE_KEYS: PoseKey[] = [
  'hips.posY', 'hips.rx', 'hips.ry', 'hips.rz',
  'spine.rx', 'spine.ry',
  'chest.rx', 'chest.ry', 'chest.rz',
  'neck.rx', 'neck.ry',
  'head.rx', 'head.ry',
  'shoulderL.rx', 'shoulderL.rz', 'elbowL.rx',
  'shoulderR.rx', 'shoulderR.rz', 'elbowR.rx',
  'legL.rx', 'kneeL.rx', 'footL.rx',
  'legR.rx', 'kneeR.rx', 'footR.rx',
];

const REST_SHOULDER_Z = 0.07;
const DEATH_DURATION = 1.15;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

export class CharacterAnimator {
  private readonly model: CharacterModel;
  private readonly current = new Map<PoseKey, number>();
  private readonly targets = new Map<PoseKey, number>();
  private readonly rates = new Map<PoseKey, number>();
  private phase = 0;
  private clock = 0;
  private landImpulse = 0;
  private deathTime = -1;
  private lastState: CharacterState = 'idle';

  constructor(model: CharacterModel) {
    this.model = model;
  }

  getPhase(): number { return this.phase; }

  /** Call when the controller transitions airborne → grounded. */
  notifyLanding(impactSpeed: number): void {
    this.landImpulse = clamp(impactSpeed / 9, 0, 1.2);
  }

  /** Restore the rest pose instantly (respawn flow). */
  reset(): void {
    this.current.clear();
    this.targets.clear();
    this.rates.clear();
    this.phase = 0;
    this.clock = 0;
    this.landImpulse = 0;
    this.deathTime = -1;
    this.lastState = 'idle';
    const { root, joints } = this.model;
    root.rotation.x = 0;
    for (const joint of Object.values(joints)) joint.rotation.set(0, 0, 0);
    joints.shoulderL.rotation.z = -REST_SHOULDER_Z;
    joints.shoulderR.rotation.z = REST_SHOULDER_Z;
    joints.hips.position.y = CHARACTER_PROPORTIONS.hipY;
  }

  update(input: AnimatorInput): void {
    const dt = Math.max(0, input.deltaSeconds);
    this.clock += dt;
    if (input.state === 'dead') {
      if (this.lastState !== 'dead') this.deathTime = 0;
      if (this.deathTime >= 0) this.deathTime = Math.min(DEATH_DURATION, this.deathTime + dt);
      this.lastState = 'dead';
      this.applyDeathPose(dt);
      return;
    }
    this.deathTime = -1;
    this.lastState = input.state;

    const speed = Math.max(0, input.speed);
    const moving = speed > 0.2;
    const speedRatio = clamp(speed / 8.5, 0, 1.2);
    if (moving && input.state !== 'interacting') {
      const phaseRate = 2.6 + speed * 1.55;
      this.phase = (this.phase + phaseRate * dt) % (Math.PI * 2);
    }
    this.landImpulse *= Math.exp(-5.5 * dt);

    // Base: neutral rest pose.
    this.setAll((set) => {
      set('hips.posY', CHARACTER_PROPORTIONS.hipY, 10);
      set('hips.rx', 0, 10); set('hips.ry', 0, 10); set('hips.rz', 0, 10);
      set('spine.rx', 0, 10); set('spine.ry', 0, 10);
      set('chest.rx', 0, 10); set('chest.ry', 0, 10); set('chest.rz', 0, 10);
      set('neck.rx', 0, 10); set('neck.ry', 0, 10);
      set('head.rx', 0, 10); set('head.ry', 0, 10);
      set('shoulderL.rx', 0, 10); set('shoulderL.rz', -REST_SHOULDER_Z, 10); set('elbowL.rx', 0.22, 10);
      set('shoulderR.rx', 0, 10); set('shoulderR.rz', REST_SHOULDER_Z, 10); set('elbowR.rx', 0.22, 10);
      set('legL.rx', 0, 10); set('kneeL.rx', -0.06, 10); set('footL.rx', 0, 10);
      set('legR.rx', 0, 10); set('kneeR.rx', -0.06, 10); set('footR.rx', 0, 10);
    });

    if (input.state === 'jump' || input.state === 'fall') this.applyAirPose(input, dt);
    else if (input.state === 'crouch') this.applyCrouchPose(input, dt, moving, speedRatio);
    else if (input.state === 'interacting') this.applyInteractPose(dt);
    else if (moving) this.applyLocomotionPose(input, dt, speedRatio);

    this.applyIdleOverlay(input, dt, moving);
    this.applyLandOverlay(dt);
    this.applyTurnLean(input, dt);
    this.flush(dt);
  }

  /** Compose into the target table; `set` overwrites a channel's target. */
  private setAll(compose: (set: (key: PoseKey, value: number, rate?: number) => void) => void): void {
    const set = (key: PoseKey, value: number, rate = 10): void => {
      this.targets.set(key, value);
      this.rates.set(key, rate);
    };
    compose(set);
  }

  private applyLocomotionPose(input: AnimatorInput, _dt: number, speedRatio: number): void {
    const phi = this.phase;
    // Amplitude caps (CharacterProportions): the swing envelope stays inside
    // the pelvis volume and clear of the coat/holster at full sprint.
    const legA = Math.min(0.42 + 0.5 * Math.min(speedRatio, 1.2), CHARACTER_PROPORTIONS.maxLegSwing);
    const armA = Math.min(legA * 0.72, CHARACTER_PROPORTIONS.maxArmSwing);
    const kneeK = 0.5 + 0.5 * Math.min(speedRatio, 1.1);
    const bobA = 0.02 + 0.03 * Math.min(speedRatio, 1.1);
    const lean = input.state === 'sprint' ? 0.22 : input.state === 'run' ? 0.13 : 0.06;
    const sinL = Math.sin(phi);
    const sinR = Math.sin(phi + Math.PI);
    this.setAll((set) => {
      set('legL.rx', legA * sinL, 14);
      set('legR.rx', legA * sinR, 14);
      set('kneeL.rx', -(0.14 + kneeK * Math.max(0, Math.sin(phi + 2.4))), 14);
      set('kneeR.rx', -(0.14 + kneeK * Math.max(0, Math.sin(phi + Math.PI + 2.4))), 14);
      set('footL.rx', -(legA * sinL - (0.14 + kneeK * Math.max(0, Math.sin(phi + 2.4)))) * 0.35, 14);
      set('footR.rx', -(legA * sinR - (0.14 + kneeK * Math.max(0, Math.sin(phi + Math.PI + 2.4)))) * 0.35, 14);
      set('shoulderL.rx', -armA * sinL, 14);
      set('shoulderR.rx', -armA * sinR, 14);
      set('elbowL.rx', 0.22 + 0.45 * armA * Math.max(0, sinL), 14);
      set('elbowR.rx', 0.22 + 0.45 * armA * Math.max(0, sinR), 14);
      set('hips.ry', 0.1 * sinL, 12);
      set('hips.rz', 0.035 * sinL, 12);
      set('hips.posY', CHARACTER_PROPORTIONS.hipY - bobA * (0.5 - 0.5 * Math.cos(2 * phi)), 14);
      set('spine.ry', -0.05 * sinL, 12);
      set('chest.ry', -0.14 * sinL, 12);
      set('chest.rx', lean + 0.03 * Math.sin(2 * phi), 12);
    });
  }

  private applyIdleOverlay(input: AnimatorInput, _dt: number, moving: boolean): void {
    // Breathing/weight-shift overlay belongs to standing idle only — crouch,
    // interacting and airborne states own their full pose.
    if (moving || input.state !== 'idle') return;
    const t = this.clock;
    this.setAll((set) => {
      set('chest.rx', 0.028 * Math.sin(t * 1.7), 6);
      set('shoulderL.rx', 0.02 * Math.sin(t * 1.7 + 1.1), 6);
      set('shoulderR.rx', 0.02 * Math.sin(t * 1.7 + 1.9), 6);
      set('hips.rz', 0.02 * Math.sin(t * 0.7), 6);
      set('hips.posY', CHARACTER_PROPORTIONS.hipY - 0.004 * (0.5 - 0.5 * Math.cos(t * 1.7)), 6);
      set('head.ry', 0.08 * Math.sin(t * 0.31), 5);
      set('head.rx', 0.04 * Math.sin(t * 0.53 + 2), 5);
    });
  }

  private applyCrouchPose(_input: AnimatorInput, _dt: number, moving: boolean, speedRatio: number): void {
    const phi = this.phase;
    const cycleA = moving ? 0.26 + 0.16 * speedRatio : 0;
    const sinL = Math.sin(phi);
    const sinR = Math.sin(phi + Math.PI);
    this.setAll((set) => {
      set('hips.posY', CHARACTER_PROPORTIONS.hipY - 0.34 + (moving ? -0.012 * (0.5 - 0.5 * Math.cos(2 * phi)) : 0), 9);
      set('hips.rx', 0.5, 9);
      set('spine.rx', 0.15, 9);
      set('chest.rx', 0.12, 9);
      set('neck.rx', -0.15, 9);
      set('legL.rx', 0.95 + cycleA * sinL, 12);
      set('legR.rx', 0.95 + cycleA * sinR, 12);
      set('kneeL.rx', -1.3 - cycleA * 0.6 * Math.max(0, Math.sin(phi + 2.4)), 12);
      set('kneeR.rx', -1.3 - cycleA * 0.6 * Math.max(0, Math.sin(phi + Math.PI + 2.4)), 12);
      set('footL.rx', 0.5, 12);
      set('footR.rx', 0.5, 12);
      set('shoulderL.rx', -0.35 + cycleA * 0.5 * sinR, 12);
      set('shoulderR.rx', -0.35 + cycleA * 0.5 * sinL, 12);
      set('elbowL.rx', 0.75, 12);
      set('elbowR.rx', 0.75, 12);
    });
  }

  private applyAirPose(input: AnimatorInput, _dt: number): void {
    const jump = input.state === 'jump';
    const t = this.clock;
    this.setAll((set) => {
      if (jump) {
        set('legL.rx', 0.65, 10); set('kneeL.rx', -1.05, 10); set('footL.rx', 0.35, 10);
        set('legR.rx', -0.28, 10); set('kneeR.rx', -0.5, 10); set('footR.rx', 0.25, 10);
        // Arm spread capped so the flared limbs stay clear of the body.
        set('shoulderL.rz', -0.28, 10); set('shoulderR.rz', 0.28, 10);
        set('shoulderL.rx', -0.35, 10); set('shoulderR.rx', -0.35, 10);
        set('elbowL.rx', 0.55, 10); set('elbowR.rx', 0.55, 10);
        set('spine.rx', 0.08, 10); set('chest.rx', 0.06, 10);
      } else {
        set('legL.rx', -0.35, 10); set('kneeL.rx', -0.45, 10); set('footL.rx', 0.2, 10);
        set('legR.rx', -0.15, 10); set('kneeR.rx', -0.75, 10); set('footR.rx', 0.3, 10);
        set('shoulderL.rz', -0.34, 10); set('shoulderR.rz', 0.34, 10);
        set('shoulderL.rx', -0.6 + 0.12 * Math.sin(t * 9), 10);
        set('shoulderR.rx', -0.6 + 0.12 * Math.sin(t * 9 + Math.PI), 10);
        set('elbowL.rx', 0.4, 10); set('elbowR.rx', 0.4, 10);
        set('spine.rx', -0.06, 10); set('chest.rx', -0.04, 10);
        set('head.rx', -0.1, 10);
      }
    });
  }

  private applyInteractPose(_dt: number): void {
    const t = this.clock;
    this.setAll((set) => {
      set('shoulderR.rx', -1.15 + 0.03 * Math.sin(t * 2.2), 9);
      set('shoulderR.rz', 0.12, 9);
      set('elbowR.rx', 0.5, 9);
      set('head.rx', 0.15, 8);
      set('spine.rx', 0.08, 8);
      set('chest.ry', -0.12, 8);
    });
  }

  private applyLandOverlay(_dt: number): void {
    if (this.landImpulse < 0.01) return;
    const impulse = this.landImpulse;
    this.setAll((set) => {
      set('hips.posY', (this.targets.get('hips.posY') ?? CHARACTER_PROPORTIONS.hipY) - 0.17 * impulse, 16);
      set('kneeL.rx', (this.targets.get('kneeL.rx') ?? 0) - 1.0 * impulse, 16);
      set('kneeR.rx', (this.targets.get('kneeR.rx') ?? 0) - 1.0 * impulse, 16);
      set('spine.rx', (this.targets.get('spine.rx') ?? 0) + 0.3 * impulse, 16);
      set('chest.rx', (this.targets.get('chest.rx') ?? 0) + 0.22 * impulse, 16);
      set('shoulderL.rx', (this.targets.get('shoulderL.rx') ?? 0) + 0.35 * impulse, 16);
      set('shoulderR.rx', (this.targets.get('shoulderR.rx') ?? 0) + 0.35 * impulse, 16);
    });
  }

  private applyTurnLean(input: AnimatorInput, _dt: number): void {
    const turnRate = clamp(input.turnRate ?? 0, -6, 6);
    if (Math.abs(turnRate) < 0.05) return;
    const lean = clamp(-turnRate * 0.09, -0.15, 0.15);
    this.setAll((set) => {
      set('chest.rz', lean, 8);
      set('head.ry', clamp(turnRate * 0.18, -0.4, 0.4), 8);
    });
  }

  private applyDeathPose(dt: number): void {
    const t = clamp(this.deathTime / DEATH_DURATION, 0, 1);
    const ease = easeOut(t);
    // Tip the whole body onto its back (root pivots at the feet).
    this.model.root.rotation.x = 1.48 * ease;
    this.setAll((set) => {
      set('hips.posY', CHARACTER_PROPORTIONS.hipY * (1 - 0.72 * ease), 7);
      set('legL.rx', -0.12 * ease, 7); set('kneeL.rx', -0.08 * ease, 7); set('footL.rx', 0.1 * ease, 7);
      set('legR.rx', -0.05 * ease, 7); set('kneeR.rx', -0.14 * ease, 7); set('footR.rx', 0.12 * ease, 7);
      set('shoulderL.rz', -REST_SHOULDER_Z - 0.95 * ease, 7);
      set('shoulderR.rz', REST_SHOULDER_Z + 0.95 * ease, 7);
      set('shoulderL.rx', -0.1 * ease, 7); set('shoulderR.rx', -0.1 * ease, 7);
      set('elbowL.rx', 0.15, 7); set('elbowR.rx', 0.15, 7);
      set('head.rx', 0.12 * ease, 7);
      set('spine.rx', 0, 7); set('chest.rx', 0, 7);
    });
    this.flush(dt, 14);
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
      case 'hips.posY': joints.hips.position.y = safe; break;
      case 'hips.rx': joints.hips.rotation.x = safe; break;
      case 'hips.ry': joints.hips.rotation.y = safe; break;
      case 'hips.rz': joints.hips.rotation.z = safe; break;
      case 'spine.rx': joints.spine.rotation.x = safe; break;
      case 'spine.ry': joints.spine.rotation.y = safe; break;
      case 'chest.rx': joints.chest.rotation.x = safe; break;
      case 'chest.ry': joints.chest.rotation.y = safe; break;
      case 'chest.rz': joints.chest.rotation.z = safe; break;
      case 'neck.rx': joints.neck.rotation.x = safe; break;
      case 'neck.ry': joints.neck.rotation.y = safe; break;
      case 'head.rx': joints.head.rotation.x = safe; break;
      case 'head.ry': joints.head.rotation.y = safe; break;
      case 'shoulderL.rx': joints.shoulderL.rotation.x = safe; break;
      case 'shoulderL.rz': joints.shoulderL.rotation.z = safe; break;
      case 'elbowL.rx': joints.elbowL.rotation.x = safe; break;
      case 'shoulderR.rx': joints.shoulderR.rotation.x = safe; break;
      case 'shoulderR.rz': joints.shoulderR.rotation.z = safe; break;
      case 'elbowR.rx': joints.elbowR.rotation.x = safe; break;
      case 'legL.rx': joints.legL.rotation.x = safe; break;
      case 'kneeL.rx': joints.kneeL.rotation.x = safe; break;
      case 'footL.rx': joints.footL.rotation.x = safe; break;
      case 'legR.rx': joints.legR.rotation.x = safe; break;
      case 'kneeR.rx': joints.kneeR.rotation.x = safe; break;
      case 'footR.rx': joints.footR.rotation.x = safe; break;
    }
  }
}
