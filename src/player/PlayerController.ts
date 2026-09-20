import * as THREE from 'three';
import type { Vec3 } from '../core/types.js';
import { CollisionWorld } from '../physics/CollisionWorld.js';
import { CHARACTER_PROPORTIONS } from './character/CharacterProportions.js';
import type { StaminaSystem } from './Vitals.js';
import type { ThirdPersonCamera } from './ThirdPersonCamera.js';

export type CameraMode = 'first_person' | 'third_person';

/** Shortest signed angular distance of `angle` into (-π, π]. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export interface PlayerInputState {
  forward?: boolean;
  backward?: boolean;
  left?: boolean;
  right?: boolean;
  sprint?: boolean;
}

export interface PlayerControllerOptions {
  initialPosition?: Vec3;
  yaw?: number;
  pitch?: number;
  eyeHeight?: number;
  radius?: number;
  walkSpeed?: number;
  sprintSpeed?: number;
  jumpSpeed?: number;
  gravity?: number;
  thirdPersonDistance?: number;
  thirdPersonHeight?: number;
  lookSensitivity?: number;
  cameraMode?: CameraMode;
  camera?: THREE.Camera;
  /** Speed while crouched. */
  crouchSpeed?: number;
  /** Eye-height multiplier while crouched (collision height follows). */
  crouchEyeFactor?: number;
  /**
   * Explicit crouch eye height (m). When set it wins over `crouchEyeFactor`;
   * defaults come from CHARACTER_PROPORTIONS so every camera height shares
   * one source of truth.
   */
  crouchEyeHeight?: number;
  /** Camera eye can never sink below this (guards neck/chest-level cameras). */
  minEyeHeight?: number;
  /** Time to reach full speed (0 = legacy instant velocity). */
  accelerationTime?: number;
  /** Time to stop when input releases (0 = legacy instant stop). */
  decelerationTime?: number;
  /**
   * Hard bound (rad) on the horizontal RMB orbit offset relative to the body.
   * The camera can never separate from the character beyond this angle.
   */
  maxOrbitOffset?: number;
  /** Exponential turn rate of the body toward its movement heading. */
  bodyTurnRate?: number;
  /** Hard cap on the body's angular speed (rad/s) — turns never snap. */
  bodyMaxTurnSpeed?: number;
  /** Turn-in-place angular speed (rad/s) while A/D are held alone (third person). */
  turnInPlaceRate?: number;
  /** Exponential ramp-up rate of the turn-in-place spin — fast start, never instant. */
  turnSpinUpRate?: number;
  /** Exponential decay rate of the spin after A/D release — smooth stop, no jerk. */
  turnReleaseRate?: number;
  /** Exponential rate at which the camera eases behind the body during turn-in-place. */
  turnCameraAlignRate?: number;
  /**
   * Exponential rate at which the residual orbit offset eases behind the
   * body during forward-dominant movement. Defaults to `bodyTurnRate`: with
   * equal rates a pure-W run leaves the camera exactly where it was (the
   * body does the whole realign) while W±A/D diagonals end with the camera
   * settled behind the character.
   */
  moveCameraAlignRate?: number;
  /** Hard bound (rad) of the head-look yaw offset relative to the body. */
  maxHeadYaw?: number;
  /** Exponential smoothing rate of the head yaw toward the camera. */
  headYawRate?: number;
  /** Fraction of the camera pitch that bleeds into the head/neck. */
  headPitchFactor?: number;
  /** Hard bound (rad) of the head-look pitch offset. */
  maxHeadPitch?: number;
  /** Exponential smoothing rate of the head pitch toward the camera. */
  headPitchRate?: number;
  /** Max ledge height the controller can step onto while grounded. */
  stepHeight?: number;
  /** Optional stamina pool: sprint degrades to walk when it runs out. */
  stamina?: StaminaSystem;
  /**
   * Stamina charged per jump. 0 = free jumps. A jump is denied while the
   * pool holds less than the cost (and the cost is paid only when the jump
   * actually leaves the ground).
   */
  jumpStaminaCost?: number;
  /** Fired when the controller lands after being airborne. */
  onLand?: (impactSpeed: number) => void;
}

export interface PlayerControllerSnapshot {
  position: Vec3;
  /** Camera yaw — the independent, mouse-orbited view heading. */
  yaw: number;
  /** Character body (mesh) yaw — where the ranger's body faces. */
  bodyYaw: number;
  pitch: number;
  verticalVelocity: number;
  grounded: boolean;
  cameraMode: CameraMode;
}

/** Per-frame movement sample handed to the body-yaw logic. */
interface MovementIntent {
  /** Camera-relative movement direction (0,0 when no keys are held). */
  x: number;
  z: number;
  /** Yaw of the movement direction (only meaningful when x/z ≠ 0). */
  yaw: number;
  /** W held without S: the body is allowed to chase the movement heading. */
  forwardDominant: boolean;
  /** Turn-in-place: +1 = spin left (A alone), −1 = right (D alone), 0 = off. */
  turn: number;
}

const NO_MOVEMENT: MovementIntent = { x: 0, z: 0, yaw: 0, forwardDominant: false, turn: 0 };

/**
 * PlayerController — three separated layers: BODY, HEAD, CAMERA.
 *
 * ARCHITECTURE CONTRACT (regression-tested in tests/player-yaw-camera.test.ts):
 *
 *   bodyYaw      THE player heading — what the visible body faces. Two turn
 *                sources, both continuous (no per-press steps, no snaps):
 *                A/D held ALONE (no W/S, third person) spin the body in
 *                place — the angular velocity ramps up fast but never
 *                instantly, holds a constant dt-driven rate, and decays
 *                exponentially on release; forward-dominant movement
 *                (W held, S released) turns the body toward the movement
 *                heading (exponential + angular-speed cap). W/S ± A/D and
 *                S alone never spin the body — they slide it.
 *
 *   headYaw /    The look layer: clamp(normalizeAngle(cameraYaw - bodyYaw),
 *   headPitch    ±maxHeadYaw) and a clamped fraction of the camera pitch,
 *                smoothed every frame. The head/neck track the camera
 *                naturally (idle included) while the body keeps its course.
 *
 *   cameraYaw    The camera's own view heading. Exactly three things rotate
 *                it: RMB drags in real time, turn-in-place (A/D alone) in
 *                lockstep with the body, and the forward-movement camera
 *                follow (see below) — synchronous with the body in both
 *                driven cases, so the camera can never lag behind and snap
 *                later, while any orbit offset eases back to "exactly
 *                behind". It stays within ±maxOrbitOffset of the body
 *                (bounded orbit, clamped on every change).
 *
 *   Movement: the world-space heading is SAMPLED from the CURRENT camera
 *   basis when the movement starts, when the movement key set changes, or
 *   when an RMB orbit rotates the camera mid-run — rotating the camera
 *   therefore changes where W/A/S/D carry the player from the very next
 *   frame. Between those events the heading is world-fixed ON PURPOSE:
 *   while the camera follows the turning body (below) a live re-derivation
 *   would rotate the heading with it, and body and camera would chase each
 *   other forever (no fixed point → perpetual spin). The latched heading
 *   gives both layers a stable target:
 *
 *     input → camera basis (at sample time) → world-space movement
 *     heading / turn-in-place intent → body yaw (A/D-only spin or
 *     forward-dominant chase) → camera follow + orbit ease → head look
 *     (camera − body, clamped) → camera position → render.
 *
 *   CAMERA FOLLOW (forward-dominant movement only): while W is held, the
 *   camera tracks the body's rotation 1:1 and any residual orbit offset
 *   eases behind at moveCameraAlignRate (default = bodyTurnRate). With
 *   equal rates the linear system has an exact cancellation: a pure-W run
 *   leaves the camera stationary (the body does the whole realign), while
 *   W+A/W+D diagonals — whose heading sits ±π/4 off the camera — end with
 *   the camera settled behind the character DURING the run. Idle, strafe
 *   and backpedal frames never rotate the camera, so a stop can never
 *   start a post-stop catch-up swing.
 *
 *   First person: look() drives the body directly (the body IS the camera)
 *   and movement stays view-relative every frame.
 *
 *   Nothing auto-rotates while idle: once the (short, smooth) turn-release
 *   tail has decayed, releasing the keys freezes the body, the head target
 *   and the camera, so "stop → camera suddenly swings" cannot exist.
 */
export class PlayerController {
  private readonly collisionWorld: CollisionWorld;
  private readonly eyeHeight: number;
  private readonly radius: number;
  private readonly walkSpeed: number;
  private readonly sprintSpeed: number;
  private readonly jumpSpeed: number;
  private readonly gravity: number;
  private readonly thirdPersonDistance: number;
  private readonly thirdPersonHeight: number;
  private readonly lookSensitivity: number;
  private readonly crouchSpeed: number;
  private readonly crouchEyeFactor: number;
  private readonly crouchEyeHeight: number;
  private readonly minEyeHeight: number;
  private readonly jumpStaminaCost: number;
  private readonly accelerationTime: number;
  private readonly decelerationTime: number;
  private readonly stepHeight: number;
  private readonly maxOrbitOffset: number;
  private readonly bodyTurnRate: number;
  private readonly bodyMaxTurnSpeed: number;
  private readonly turnInPlaceRate: number;
  private readonly turnSpinUpRate: number;
  private readonly turnReleaseRate: number;
  private readonly turnCameraAlignRate: number;
  private readonly moveCameraAlignRate: number;
  private readonly maxHeadYaw: number;
  private readonly headYawRate: number;
  private readonly headPitchFactor: number;
  private readonly maxHeadPitch: number;
  private readonly headPitchRate: number;
  private readonly stamina: StaminaSystem | null;
  private readonly onLand?: (impactSpeed: number) => void;

  private camera?: THREE.Camera;
  private thirdPersonRig: ThirdPersonCamera | null = null;
  private readonly position: Vec3;
  /**
   * THE player heading (what the visible character faces). Movement turns it
   * smoothly toward the movement intent while that intent is
   * forward-dominant; first-person look drives it directly.
   */
  private bodyYaw: number;
  /**
   * The camera's own view heading (third person). RMB drags rotate it in
   * real time; it is kept within ±maxOrbitOffset of the body. The mouse
   * NEVER rotates the body — only this yaw.
   */
  private cameraYaw: number;
  /** Smoothed head-look yaw offset (body-relative, clamped) — the look layer. */
  private headYaw = 0;
  /** Smoothed head-look pitch offset (clamped fraction of the camera pitch). */
  private headPitch = 0;
  /** Turn-in-place angular velocity (rad/s, +left/−right) — smoothed, never stepped. */
  private spinVel = 0;
  /**
   * World-space movement heading latched from the camera basis (third
   * person). Re-sampled when the movement starts, when the key set changes
   * or when RMB rotates the camera mid-run; null whenever no movement keys
   * are held. See the class contract — the latch is what lets the camera
   * follow the turning body without a perpetual body/camera chase.
   */
  private moveHeading: { x: number; z: number; yaw: number } | null = null;
  /** The key set the latched heading was sampled for. */
  private moveHeadingKeySet = '';
  /** An RMB yaw rotation happened since the heading was sampled. */
  private cameraOrbitedSinceSample = false;
  private pitch: number;
  private verticalVelocity = 0;
  private grounded = true;
  private cameraMode: CameraMode;
  private jumpQueued = false;
  private crouching = false;
  private dead = false;
  private sprintingActual = false;
  private currentEyeHeight: number;
  private readonly velocity: Vec3 = { x: 0, y: 0, z: 0 };
  // Scratch vectors — reused every frame, never reallocated (no GC churn).
  private readonly scratchForward = new THREE.Vector3();
  private readonly scratchRight = new THREE.Vector3();
  private readonly scratchDirection = new THREE.Vector3();
  private readonly scratchCamTarget = new THREE.Vector3();
  private input: Required<PlayerInputState> = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };

  constructor(collisionWorld: CollisionWorld, options: PlayerControllerOptions = {}) {
    this.collisionWorld = collisionWorld;
    this.eyeHeight = options.eyeHeight ?? 1.7;
    this.radius = options.radius ?? 0.35;
    this.walkSpeed = options.walkSpeed ?? 6;
    this.sprintSpeed = options.sprintSpeed ?? 11;
    this.jumpSpeed = options.jumpSpeed ?? 6.5;
    this.gravity = options.gravity ?? 18;
    this.thirdPersonDistance = options.thirdPersonDistance ?? 5.5;
    this.thirdPersonHeight = options.thirdPersonHeight ?? 2.2;
    // RMB look sensitivity — tuned ~18% below the original 0.0022 so a
    // horizontal drag sweeps the camera slightly slower (user feel request).
    this.lookSensitivity = options.lookSensitivity ?? 0.0018;
    this.crouchSpeed = options.crouchSpeed ?? 2.6;
    this.crouchEyeFactor = Math.min(1, Math.max(0.3, options.crouchEyeFactor ?? 0.58));
    // One source of truth for camera heights (CharacterProportions): an
    // explicit crouchEyeHeight wins, then an explicit crouchEyeFactor, and
    // otherwise the proportions' crouch ratio scales with the stand eye.
    const standEye = Math.max(0.5, options.eyeHeight ?? CHARACTER_PROPORTIONS.eyeHeight);
    const defaultCrouchEye = standEye * (CHARACTER_PROPORTIONS.crouchEyeHeight / CHARACTER_PROPORTIONS.eyeHeight);
    const explicitCrouchEye = options.crouchEyeHeight ?? (options.crouchEyeFactor !== undefined
      ? standEye * this.crouchEyeFactor
      : defaultCrouchEye);
    this.crouchEyeHeight = Math.min(standEye, Math.max(0.3, explicitCrouchEye));
    // The eye floor can never exceed the crouch eye (crouch must stay usable).
    this.minEyeHeight = Math.min(
      this.crouchEyeHeight,
      Math.max(0.1, options.minEyeHeight ?? CHARACTER_PROPORTIONS.minEyeHeight),
    );
    this.jumpStaminaCost = Math.max(0, options.jumpStaminaCost ?? 0);
    this.accelerationTime = Math.max(0, options.accelerationTime ?? 0);
    this.decelerationTime = Math.max(0, options.decelerationTime ?? 0);
    this.stepHeight = Math.max(0, options.stepHeight ?? 0);
    this.maxOrbitOffset = Math.max(0.3, Math.min(Math.PI, options.maxOrbitOffset ?? 1.9));
    this.bodyTurnRate = Math.max(1, options.bodyTurnRate ?? 9);
    this.bodyMaxTurnSpeed = Math.max(0.5, options.bodyMaxTurnSpeed ?? 7);
    // Turn-in-place angular speed — tuned ~18% below the original 4.5 rad/s
    // so held A/D still spin briskly but with a calmer sweep (user feel request).
    this.turnInPlaceRate = Math.max(0.5, options.turnInPlaceRate ?? 3.7);
    this.turnSpinUpRate = Math.max(1, options.turnSpinUpRate ?? 16);
    this.turnReleaseRate = Math.max(1, options.turnReleaseRate ?? 16);
    this.turnCameraAlignRate = Math.max(0.5, options.turnCameraAlignRate ?? 3);
    // Defaults to the body turn rate — the equal-rate pairing is what makes
    // pure-W realigns camera-stationary while diagonals settle the camera
    // behind (see the class contract). Must stay after bodyTurnRate.
    this.moveCameraAlignRate = Math.max(0.5, options.moveCameraAlignRate ?? this.bodyTurnRate);
    this.maxHeadYaw = Math.max(0.2, Math.min(Math.PI, options.maxHeadYaw ?? 1.0));
    this.headYawRate = Math.max(0.5, options.headYawRate ?? 7);
    this.headPitchFactor = Math.max(0, Math.min(1, options.headPitchFactor ?? 0.55));
    this.maxHeadPitch = Math.max(0.1, Math.min(Math.PI * 0.5, options.maxHeadPitch ?? 0.6));
    this.headPitchRate = Math.max(0.5, options.headPitchRate ?? 7);
    this.stamina = options.stamina ?? null;
    this.onLand = options.onLand;
    this.position = { ...(options.initialPosition ?? { x: 0, y: this.eyeHeight, z: 12 }) };
    this.bodyYaw = options.yaw ?? Math.PI;
    this.cameraYaw = this.bodyYaw;
    this.pitch = options.pitch ?? 0;
    this.cameraMode = options.cameraMode ?? 'first_person';
    this.camera = options.camera;
    this.currentEyeHeight = this.eyeHeight;
    this.applyCamera();
  }

  attachCamera(camera: THREE.Camera): void {
    this.camera = camera;
    this.applyCamera();
  }

  /**
   * Hand third-person framing to a collision-aware camera rig. While set and
   * in third-person mode the controller stops driving the camera itself;
   * pass null to restore the built-in orbit math.
   */
  setThirdPersonRig(rig: ThirdPersonCamera | null): void {
    this.thirdPersonRig = rig;
  }

  setInput(input: PlayerInputState): void {
    this.input = {
      forward: Boolean(input.forward),
      backward: Boolean(input.backward),
      left: Boolean(input.left),
      right: Boolean(input.right),
      sprint: Boolean(input.sprint),
    };
  }

  requestJump(): boolean {
    if (!this.grounded || this.dead || this.crouching) return false;
    // A jump with a stamina price is denied when the pool can't pay it.
    if (this.stamina && this.jumpStaminaCost > 0 && this.stamina.current < this.jumpStaminaCost) {
      return false;
    }
    this.jumpQueued = true;
    return true;
  }

  // --- Crouch ---------------------------------------------------------------
  setCrouching(crouching: boolean): void {
    // Standing up under a low ceiling is rejected by re-checking headroom:
    // probe a small upward move; if it gets blocked, stay crouched.
    if (!crouching && this.crouching) {
      const probe = this.collisionWorld.movePlayer(
        this.position,
        { x: 0, y: 0.12, z: 0 },
        this.radius,
        this.eyeHeight,
      );
      if (probe.blockedY) return;
    }
    this.crouching = crouching;
  }

  toggleCrouch(): boolean {
    this.setCrouching(!this.crouching);
    return this.crouching;
  }

  isCrouching(): boolean { return this.crouching; }

  // --- Death / respawn ------------------------------------------------------
  setDead(dead: boolean): void {
    this.dead = dead;
    if (dead) {
      this.jumpQueued = false;
      this.crouching = false;
      this.spinVel = 0;
      this.moveHeading = null;
    }
  }

  isDead(): boolean { return this.dead; }

  /**
   * Stop all motion in place (Development-mode fly camera hand-off): zeroes
   * the horizontal velocity and the turn-in-place spin so the character
   * freezes exactly where it stands — position, yaw, vertical state and
   * grounded state are untouched, and the animator reads a standstill.
   */
  freezeMotion(): void {
    this.velocity.x = 0;
    this.velocity.z = 0;
    this.spinVel = 0;
    this.jumpQueued = false;
    this.moveHeading = null;
  }

  /** Teleport to a (safe) point and reset all motion state. */
  respawnAt(position: Vec3): void {
    this.position.x = position.x;
    this.position.y = position.y;
    this.position.z = position.z;
    this.verticalVelocity = 0;
    this.velocity.x = 0;
    this.velocity.z = 0;
    this.spinVel = 0;
    this.grounded = false;
    this.crouching = false;
    this.dead = false;
    this.jumpQueued = false;
    this.moveHeading = null;
    this.cameraYaw = this.bodyYaw; // camera exactly behind the body again
    this.headYaw = 0;
    this.headPitch = 0;
    this.thirdPersonRig?.snap();
    this.applyCamera();
  }

  /**
   * Rotate the CAMERA (RMB look). In third person this ONLY moves the
   * camera's own view heading, kept within ±maxOrbitOffset of the body —
   * the mouse never rotates the character. In first person the body IS the
   * camera, so look drives the heading directly.
   */
  look(deltaX: number, deltaY: number): void {
    this.pitch -= deltaY * this.lookSensitivity;
    this.pitch = clamp(this.pitch, -Math.PI * 0.49, Math.PI * 0.49);
    if (this.cameraMode === 'first_person') {
      this.bodyYaw -= deltaX * this.lookSensitivity;
      this.cameraYaw = this.bodyYaw;
    } else {
      // A horizontal orbit changes the camera-relative movement basis: flag
      // the latched heading for a re-sample on the next moving frame.
      if (deltaX !== 0) this.cameraOrbitedSinceSample = true;
      this.cameraYaw -= deltaX * this.lookSensitivity;
      this.clampOrbitOffset();
    }
    this.applyCamera();
  }

  /** Current character body (mesh) yaw — the direction the ranger faces. */
  getBodyYaw(): number {
    return this.bodyYaw;
  }

  /** Force the body yaw (respawn flows). The camera realigns with it. */
  setBodyYaw(yaw: number): void {
    this.bodyYaw = yaw;
    this.cameraYaw = yaw;
    this.spinVel = 0;
    this.moveHeading = null;
  }

  /** Current turn-in-place angular velocity (rad/s, +left/−right) — 0 when not spinning. */
  getTurnVelocity(): number {
    return this.spinVel;
  }

  /**
   * Camera yaw — the independent view heading. It never drifts beyond
   * ±maxOrbitOffset of the body, but it is NOT rigidly derived from the
   * body: RMB orbit is the only thing that moves it.
   */
  getYaw(): number {
    return this.cameraYaw;
  }

  /** Current bounded orbit offset of the camera relative to the body.
   *  Raw (unwrapped) on purpose: clampOrbitOffset() guarantees |offset| ≤
   *  maxOrbitOffset < π at all times, so no wrap is ever needed and the
   *  clamped value stays bit-exact. */
  getCameraOrbitOffset(): number {
    return this.cameraYaw - this.bodyYaw;
  }

  getPitch(): number {
    return this.pitch;
  }

  getVerticalVelocity(): number {
    return this.verticalVelocity;
  }

  isGrounded(): boolean {
    return this.grounded;
  }

  getRadius(): number {
    return this.radius;
  }

  getCameraMode(): CameraMode {
    return this.cameraMode;
  }

  /** Actual sprint state this frame (input + stamina + actually moving). */
  isSprinting(): boolean { return this.sprintingActual; }

  /** Standing camera eye height (m) — single source: CharacterProportions. */
  getStandingEyeHeight(): number { return this.eyeHeight; }

  /** Crouching camera eye height (m). */
  getCrouchEyeHeight(): number { return this.crouchEyeHeight; }

  /** Hard floor for the camera eye (m). */
  getMinEyeHeight(): number { return this.minEyeHeight; }

  /** Current smoothed eye height (drops while crouched). */
  getEyeHeight(): number { return this.currentEyeHeight; }

  /** Current horizontal speed (m/s) — feeds the character state machine. */
  getHorizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Feet position (world) — the character model's root. */
  getFeetPosition(): Vec3 {
    return { x: this.position.x, y: this.position.y - this.currentEyeHeight, z: this.position.z };
  }

  /** Smoothed head-look yaw offset (rad, body-relative) — 0 in first person. */
  getHeadLookYaw(): number {
    return this.cameraMode === 'third_person' && !this.dead ? this.headYaw : 0;
  }

  /** Smoothed head-look pitch offset (rad) — 0 in first person. */
  getHeadLookPitch(): number {
    return this.cameraMode === 'third_person' && !this.dead ? this.headPitch : 0;
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.spinVel = 0;
    // (Re)entering a mode puts the camera exactly on the body heading: the
    // third-person rig starts behind the character and first person starts
    // looking the way the character faces.
    this.cameraYaw = this.bodyYaw;
    this.moveHeading = null;
    // Entering third person hands the camera to the rig: snap it to the
    // character so it never glides in from a stale follow point.
    if (mode === 'third_person') this.thirdPersonRig?.snap();
    this.applyCamera();
  }

  toggleCameraMode(): CameraMode {
    this.setCameraMode(this.cameraMode === 'first_person' ? 'third_person' : 'first_person');
    return this.cameraMode;
  }

  update(deltaSeconds: number, input?: PlayerInputState): void {
    if (input) this.setInput(input);
    const dt = Math.max(0, deltaSeconds);

    const move = this.dead ? NO_MOVEMENT : this.computeMovement();
    this.updateBodyYaw(dt, move);
    this.updateHeadLook(dt);

    if (this.jumpQueued && this.grounded && !this.dead && !this.crouching) {
      this.verticalVelocity = this.jumpSpeed;
      this.grounded = false;
      // Pay the stamina cost only when the jump actually happens.
      if (this.stamina && this.jumpStaminaCost > 0) this.stamina.spend(this.jumpStaminaCost);
    }
    this.jumpQueued = false;

    const wantsSprint = this.input.sprint && !this.dead && !this.crouching
      && (!this.stamina || this.stamina.canSprint());
    const targetSpeed = this.dead ? 0
      : this.crouching ? this.crouchSpeed
      : wantsSprint ? this.sprintSpeed
      : this.walkSpeed;
    this.sprintingActual = wantsSprint && (move.x !== 0 || move.z !== 0);

    // Target velocity with optional accel/decel smoothing (legacy = instant).
    const targetVx = move.x * targetSpeed;
    const targetVz = move.z * targetSpeed;
    if (this.accelerationTime > 0 || this.decelerationTime > 0) {
      const accelRate = this.accelerationTime > 0 ? 1 / this.accelerationTime : 0;
      const decelRate = this.decelerationTime > 0 ? 1 / this.decelerationTime : 0;
      const accelerating = targetVx * targetVx + targetVz * targetVz > this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
      const rate = (accelerating ? accelRate : decelRate) || 60;
      const blend = 1 - Math.exp(-rate * dt);
      this.velocity.x += (targetVx - this.velocity.x) * blend;
      this.velocity.z += (targetVz - this.velocity.z) * blend;
      if (Math.abs(this.velocity.x) < 1e-4) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 1e-4) this.velocity.z = 0;
    } else {
      this.velocity.x = targetVx;
      this.velocity.z = targetVz;
    }

    const targetEye = this.crouching ? this.crouchEyeHeight : this.eyeHeight;
    this.currentEyeHeight += (targetEye - this.currentEyeHeight) * (1 - Math.exp(-12 * dt));
    // The camera eye may never drop below the configured floor.
    if (this.currentEyeHeight < this.minEyeHeight) this.currentEyeHeight = this.minEyeHeight;

    const deltaX = this.velocity.x * dt;
    const deltaZ = this.velocity.z * dt;
    if (deltaX !== 0 || deltaZ !== 0) {
      const result = this.collisionWorld.movePlayer(
        this.position,
        { x: deltaX, y: 0, z: deltaZ },
        this.radius,
        this.currentEyeHeight,
      );
      this.position.x = result.position.x;
      this.position.z = result.position.z;
      // Step-up: when grounded and horizontally blocked, try to climb small
      // ledges (lift → horizontal retry → settle). Only accepted when it
      // actually gains ground, so flat-wall behaviour is unchanged.
      if (this.stepHeight > 0 && this.grounded && (result.blockedX || result.blockedZ)) {
        const lifted = this.collisionWorld.movePlayer(
          this.position,
          { x: 0, y: this.stepHeight, z: 0 },
          this.radius,
          this.currentEyeHeight,
        );
        const stepped = this.collisionWorld.movePlayer(
          lifted.position,
          { x: deltaX, y: 0, z: deltaZ },
          this.radius,
          this.currentEyeHeight,
        );
        const settled = this.collisionWorld.movePlayer(
          stepped.position,
          { x: 0, y: -this.stepHeight - 0.05, z: 0 },
          this.radius,
          this.currentEyeHeight,
        );
        const gained = Math.abs(settled.position.x - this.position.x) + Math.abs(settled.position.z - this.position.z);
        const before = Math.abs(result.position.x - this.position.x) + Math.abs(result.position.z - this.position.z);
        if (gained > before + 1e-4) {
          this.position.x = settled.position.x;
          this.position.z = settled.position.z;
          this.position.y = settled.position.y;
          this.grounded = settled.grounded;
        }
      }
    }

    const wasAirborne = !this.grounded;
    const impactSpeed = Math.abs(this.verticalVelocity);
    this.verticalVelocity -= this.gravity * dt;
    const vertical = this.collisionWorld.movePlayer(
      this.position,
      { x: 0, y: this.verticalVelocity * dt, z: 0 },
      this.radius,
      this.currentEyeHeight,
    );
    this.position.y = vertical.position.y;
    this.grounded = vertical.grounded;
    if (this.grounded && this.verticalVelocity < 0) {
      this.verticalVelocity = 0;
      if (wasAirborne && this.onLand) this.onLand(impactSpeed);
    }

    this.applyCamera();
  }

  getPosition(): Vec3 {
    return { ...this.position };
  }

  setPosition(position: Vec3): void {
    this.position.x = position.x;
    this.position.y = position.y;
    this.position.z = position.z;
    this.applyCamera();
  }

  getSnapshot(): PlayerControllerSnapshot {
    return {
      position: this.getPosition(),
      yaw: this.getYaw(),
      bodyYaw: this.bodyYaw,
      pitch: this.pitch,
      verticalVelocity: this.verticalVelocity,
      grounded: this.grounded,
      cameraMode: this.cameraMode,
    };
  }

  /**
   * Body yaw logic (both camera modes):
   *   - A/D held ALONE (no W/S) spin the body in place in FIRST person too
   *     (controls-consistency revision: the game's A/D-alone = turn language
   *     now matches across on-foot first/third person and riding). The
   *     ANGULAR VELOCITY is what gets smoothed (never the angle per key
   *     press), so the turn starts fast but never snaps, holds a constant
   *     dt-driven rate while held, and decays exponentially on release — a
   *     natural smooth stop with no jerk. In first person the body IS the
   *     camera, so bodyYaw and cameraYaw stay locked; in third person the
   *     camera rotates WITH the body every frame (it can never lag behind
   *     and catch up later) while any residual orbit offset eases toward
   *     "exactly behind".
   *   - forward-dominant movement (W held, S released, third person) turns
   *     the body smoothly (exponential + angular-speed cap) toward the
   *     latched movement heading, and the CAMERA FOLLOWS the body's rotation
   *     1:1 while any residual orbit offset eases behind at
   *     moveCameraAlignRate (= bodyTurnRate by default): W±A/D runs therefore
   *     end with the camera settled behind the character DURING the run,
   *     never as a post-stop catch-up. With the equal-rate pairing a pure-W
   *     realign leaves the camera bit-stationary — the body does the whole
   *     turn.
   *   - W/S ± A/D and S alone slide the body without rotating it (and the
   *     camera follows nothing); idle frames rotate nothing.
   * First person look(): still owns the heading when the mouse moves.
   */
  private updateBodyYaw(dt: number, move: MovementIntent): void {
    if (this.dead) return;

    // --- Turn-in-place (A/D alone): dt-driven continuous spin --------------
    if (move.turn !== 0) {
      const targetVel = move.turn * this.turnInPlaceRate;
      this.spinVel += (targetVel - this.spinVel) * (1 - Math.exp(-this.turnSpinUpRate * dt));
    } else if (this.spinVel !== 0) {
      // Release: exponential decay of the spin — a smooth natural stop.
      this.spinVel *= Math.exp(-this.turnReleaseRate * dt);
      if (Math.abs(this.spinVel) < 0.02) this.spinVel = 0;
    }
    if (this.spinVel !== 0) {
      const delta = this.spinVel * dt;
      this.bodyYaw += delta;
      if (this.cameraMode === 'first_person') {
        // The body IS the camera: the view rotates with it, one value.
        this.cameraYaw = this.bodyYaw;
        return;
      }
      // Camera follows synchronously: it rotates WITH the body every frame
      // (it can never remain on the old side and snap later), while any
      // residual orbit offset eases toward zero behind the character.
      this.cameraYaw += delta;
      const offset = this.cameraYaw - this.bodyYaw;
      if (offset !== 0) {
        this.cameraYaw = this.bodyYaw + offset * Math.exp(-this.turnCameraAlignRate * dt);
      }
      this.clampOrbitOffset();
      return; // the spin owns the body this frame
    }

    if (this.cameraMode === 'first_person') return;
    if (move.x === 0 && move.z === 0) return;
    if (!move.forwardDominant) return;

    // --- Forward-dominant chase + camera follow ---------------------------
    const bodyBefore = this.bodyYaw;
    const diff = wrapAngle(move.yaw - this.bodyYaw);
    if (diff !== 0) {
      // Exponential approach clamped by a hard angular speed: large turns
      // sweep at constant speed and settle smoothly — never a snap.
      const step = diff * (1 - Math.exp(-this.bodyTurnRate * dt));
      const maxStep = this.bodyMaxTurnSpeed * dt;
      this.bodyYaw += Math.abs(step) <= maxStep ? step : Math.sign(step) * maxStep;
    }

    // The camera tracks the body's rotation 1:1 (keeping the current
    // relative angle) while the residual orbit offset eases toward "exactly
    // behind". With moveCameraAlignRate === bodyTurnRate and an uncapped
    // chase, the camera's total motion cancels exactly for pure W (its yaw
    // stays where the player left it) and the camera sweeps ±π/4 alongside
    // the body for W±A/D diagonals — both arrive at the heading together.
    const bodyDelta = this.bodyYaw - bodyBefore;
    this.cameraYaw += bodyDelta;
    const offset = this.cameraYaw - this.bodyYaw;
    if (offset !== 0) {
      this.cameraYaw = this.bodyYaw + offset * Math.exp(-this.moveCameraAlignRate * dt);
    }
    this.clampOrbitOffset();
  }

  /**
   * The look layer: the head/neck ease toward the camera's view every frame
   * (idle included) — the character's gaze stays connected to the camera
   * while the body keeps its course. Clamped so the neck never breaks.
   */
  private updateHeadLook(dt: number): void {
    if (this.dead || this.cameraMode === 'first_person') {
      this.headYaw = 0;
      this.headPitch = 0;
      return;
    }
    const yawTarget = clamp(wrapAngle(this.cameraYaw - this.bodyYaw), -this.maxHeadYaw, this.maxHeadYaw);
    this.headYaw += (yawTarget - this.headYaw) * (1 - Math.exp(-this.headYawRate * dt));
    const pitchTarget = clamp(this.pitch * this.headPitchFactor, -this.maxHeadPitch, this.maxHeadPitch);
    this.headPitch += (pitchTarget - this.headPitch) * (1 - Math.exp(-this.headPitchRate * dt));
    if (Math.abs(this.headYaw) < 1e-4) this.headYaw = 0;
    if (Math.abs(this.headPitch) < 1e-4) this.headPitch = 0;
  }

  /** Keep the camera within ±maxOrbitOffset of the body (UNWRAPPED — a long
   *  drag must saturate at the bound, not wrap across ±π). */
  private clampOrbitOffset(): void {
    const offset = this.cameraYaw - this.bodyYaw;
    if (offset > this.maxOrbitOffset) this.cameraYaw = this.bodyYaw + this.maxOrbitOffset;
    else if (offset < -this.maxOrbitOffset) this.cameraYaw = this.bodyYaw - this.maxOrbitOffset;
  }

  /**
   * Movement direction for this frame. First person stays live view-relative
   * every frame (A/D alone turn in place via the turn branch above — they
   * only strafe when W/S is held too). Third person samples the world-space
   * heading from the CURRENT camera basis when the movement starts, when the
   * movement key set changes, or when an RMB orbit rotated the camera (so a
   * mid-run drag still bends the path); between those events the heading is
   * world-fixed so the camera can follow the turning body without a
   * perpetual chase.
   */
  private computeMovement(): MovementIntent {
    // A/D held ALONE (no W/S, either camera mode): turn in place — the body
    // pivots quickly and smoothly (first person: the view rotates with it;
    // third person: the camera follows); no translation.
    const turn = this.turnInPlaceInput();
    if (turn !== 0) {
      this.moveHeading = null;
      return { x: 0, z: 0, yaw: this.bodyYaw, forwardDominant: false, turn };
    }

    const keySet = this.moveKeySet();
    if (keySet === '0000') {
      this.moveHeading = null;
      return NO_MOVEMENT;
    }

    if (this.cameraMode === 'first_person') {
      const dir = this.cameraRelativeDirection();
      if (dir.x === 0 && dir.z === 0) return NO_MOVEMENT;
      return {
        x: dir.x,
        z: dir.z,
        yaw: Math.atan2(-dir.x, -dir.z),
        forwardDominant: this.input.forward && !this.input.backward,
        turn: 0,
      };
    }

    const needsSample = this.moveHeading === null
      || keySet !== this.moveHeadingKeySet
      || this.cameraOrbitedSinceSample;
    if (needsSample) {
      const dir = this.cameraRelativeDirection();
      this.moveHeading = { x: dir.x, z: dir.z, yaw: Math.atan2(-dir.x, -dir.z) };
      this.moveHeadingKeySet = keySet;
      this.cameraOrbitedSinceSample = false;
    }
    const heading = this.moveHeading;
    if (!heading) return NO_MOVEMENT; // unreachable: needsSample guarantees a sample
    return {
      x: heading.x,
      z: heading.z,
      yaw: heading.yaw,
      forwardDominant: this.input.forward && !this.input.backward,
      turn: 0,
    };
  }

  /** +1 = spin left (A), −1 = spin right (D) — while A/D are held without
   *  any forward/backward key, in BOTH camera modes (the controls-consistency
   *  revision: first person now turns in place exactly like third person,
   *  with the same smoothed angular velocity — no snap, no shake). With W/S
   *  held, A/D stay strafe (the existing camera-relative movement). */
  private turnInPlaceInput(): number {
    if (this.input.forward || this.input.backward) return 0;
    return (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
  }

  /** Normalized camera-relative WASD direction (0,0,0 when no keys). */
  private cameraRelativeDirection(): Vec3 {
    const camYaw = this.cameraMode === 'first_person' ? this.bodyYaw : this.cameraYaw;
    const forward = this.scratchForward.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = this.scratchRight.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const direction = this.scratchDirection.set(0, 0, 0);

    if (this.input.forward) direction.add(forward);
    if (this.input.backward) direction.sub(forward);
    if (this.input.right) direction.add(right);
    if (this.input.left) direction.sub(right);

    if (direction.lengthSq() > 0) direction.normalize();
    return { x: direction.x, y: 0, z: direction.z };
  }

  private moveKeySet(): string {
    return `${this.input.forward ? 1 : 0}${this.input.backward ? 1 : 0}${this.input.left ? 1 : 0}${this.input.right ? 1 : 0}`;
  }

  private applyCamera(): void {
    if (!this.camera) return;
    this.camera.rotation.order = 'YXZ';
    if (this.cameraMode === 'first_person') {
      this.camera.position.set(this.position.x, this.position.y, this.position.z);
      this.camera.rotation.set(this.pitch, this.bodyYaw, 0);
      return;
    }
    // A collision-aware rig owns third-person framing when attached.
    if (this.thirdPersonRig) return;

    // Built-in third person: orbit behind the camera's view yaw.
    const target = this.scratchCamTarget.set(this.position.x, this.position.y - 0.5, this.position.z);
    const cosPitch = Math.cos(this.pitch);
    this.camera.position.set(
      this.position.x + Math.sin(this.cameraYaw) * cosPitch * this.thirdPersonDistance,
      this.position.y + (this.thirdPersonHeight - this.eyeHeight) - Math.sin(this.pitch) * this.thirdPersonDistance,
      this.position.z + Math.cos(this.cameraYaw) * cosPitch * this.thirdPersonDistance,
    );
    this.camera.lookAt(target);
  }
}
