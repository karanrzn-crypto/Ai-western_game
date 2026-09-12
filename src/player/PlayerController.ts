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
  /**
   * Rate (1/s) at which the orbit offset eases back to zero WHILE the
   * character is moving and the mouse is hands-off. Idle frames never touch
   * it, so stopping can never start a camera swing.
   */
  orbitReturnRate?: number;
  /** Exponential turn rate of the body toward its movement heading. */
  bodyTurnRate?: number;
  /** Hard cap on the body's angular speed (rad/s) — turns never snap. */
  bodyMaxTurnSpeed?: number;
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
  /** Camera yaw — always `bodyYaw + cameraOrbitOffset`. */
  yaw: number;
  /** Character body (mesh) yaw — the single source the camera derives from. */
  bodyYaw: number;
  pitch: number;
  verticalVelocity: number;
  grounded: boolean;
  cameraMode: CameraMode;
}

/**
 * PlayerController — one heading, one derived camera.
 *
 * ARCHITECTURE CONTRACT (regression-tested in tests/player-yaw-camera.test.ts):
 *
 *   bodyYaw                THE player heading — single source of truth.
 *   cameraOrbitOffset      bounded horizontal orbit offset (RMB-driven only).
 *   camera yaw ≡ bodyYaw + cameraOrbitOffset   (derived EVERY frame — the
 *                          camera is never an independent yaw system).
 *
 *   Frame order:
 *     input → movement direction → target body yaw → smooth body yaw →
 *     camera yaw (body + offset) → camera position → render.
 *
 *   Movement heading (third person): LATCHED in world space. Whenever the
 *   pressed movement-key set changes, the direction is computed from the
 *   CURRENT camera basis (normalized, diagonals included) and frozen as the
 *   intent until the keys change again. Consequences:
 *     - pressing S retargets the body the same frame and the camera follows
 *       the body DURING the turn (no waiting for a stop),
 *     - holding any direction runs a straight world-fixed line — lateral or
 *       backward holds can never degenerate into a perpetual spin,
 *     - orbiting the camera mid-run never bends the path.
 *   First person keeps classic view-relative movement every frame.
 *
 *   Nothing auto-rotates while idle: releasing the keys freezes both the
 *   body and the camera, so "stop → camera suddenly swings" cannot exist.
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
  private readonly orbitReturnRate: number;
  private readonly bodyTurnRate: number;
  private readonly bodyMaxTurnSpeed: number;
  private readonly stamina: StaminaSystem | null;
  private readonly onLand?: (impactSpeed: number) => void;

  private camera?: THREE.Camera;
  private thirdPersonRig: ThirdPersonCamera | null = null;
  private readonly position: Vec3;
  /**
   * THE player heading (what the visible character faces). Movement turns it
   * smoothly toward the movement intent; first-person look drives it
   * directly. The camera NEVER has a yaw of its own — it is always derived
   * from this plus the bounded orbit offset.
   */
  private bodyYaw: number;
  /** Bounded horizontal camera offset relative to the body (RMB orbit). */
  private cameraOrbitOffset = 0;
  /**
   * World-space movement heading (third person). Re-sampled from the camera
   * basis only when the pressed movement-key set changes; holding keys keeps
   * the heading world-fixed so the run never chases a rotating camera.
   */
  private intentYaw: number;
  /** Latch key of the last sampled movement-key set (null = force re-sample). */
  private lastMoveKeySet: string | null = null;
  /** Whether the right-button look drag is currently live (set by the demo). */
  private lookDragging = false;
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
    this.lookSensitivity = options.lookSensitivity ?? 0.0022;
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
    this.orbitReturnRate = Math.max(0.5, options.orbitReturnRate ?? 3.5);
    this.bodyTurnRate = Math.max(1, options.bodyTurnRate ?? 9);
    this.bodyMaxTurnSpeed = Math.max(0.5, options.bodyMaxTurnSpeed ?? 7);
    this.stamina = options.stamina ?? null;
    this.onLand = options.onLand;
    this.position = { ...(options.initialPosition ?? { x: 0, y: this.eyeHeight, z: 12 }) };
    this.bodyYaw = options.yaw ?? Math.PI;
    this.intentYaw = this.bodyYaw;
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
    }
  }

  isDead(): boolean { return this.dead; }

  /** Teleport to a (safe) point and reset all motion state. */
  respawnAt(position: Vec3): void {
    this.position.x = position.x;
    this.position.y = position.y;
    this.position.z = position.z;
    this.verticalVelocity = 0;
    this.velocity.x = 0;
    this.velocity.z = 0;
    this.grounded = false;
    this.crouching = false;
    this.dead = false;
    this.jumpQueued = false;
    this.cameraOrbitOffset = 0;
    this.lastMoveKeySet = null; // the next input re-samples the intent
    this.thirdPersonRig?.snap();
    this.applyCamera();
  }

  /**
   * Rotate the CAMERA (RMB look). In third person this ONLY moves the
   * bounded orbit offset around the body — the mouse never rotates the
   * character. In first person the body IS the camera, so look drives the
   * heading directly.
   */
  look(deltaX: number, deltaY: number): void {
    this.pitch -= deltaY * this.lookSensitivity;
    this.pitch = clamp(this.pitch, -Math.PI * 0.49, Math.PI * 0.49);
    if (this.cameraMode === 'first_person') {
      this.bodyYaw -= deltaX * this.lookSensitivity;
    } else {
      this.cameraOrbitOffset = clamp(
        this.cameraOrbitOffset - deltaX * this.lookSensitivity,
        -this.maxOrbitOffset,
        this.maxOrbitOffset,
      );
    }
    this.applyCamera();
  }

  /** The demo feeds this every frame: is the right-button look drag live? */
  setLookDragging(active: boolean): void {
    this.lookDragging = active;
  }

  /** Current character body (mesh) yaw — the direction the ranger faces. */
  getBodyYaw(): number {
    return this.bodyYaw;
  }

  /** Force the body yaw (respawn flows). The camera follows automatically. */
  setBodyYaw(yaw: number): void {
    this.bodyYaw = yaw;
  }

  /**
   * Camera yaw — ALWAYS `bodyYaw + cameraOrbitOffset`. The camera has no
   * independent yaw anywhere in this class.
   */
  getYaw(): number {
    return this.bodyYaw + this.cameraOrbitOffset;
  }

  /** Current bounded orbit offset of the camera relative to the body. */
  getCameraOrbitOffset(): number {
    return this.cameraOrbitOffset;
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

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    // (Re)entering a mode puts the camera exactly on the body heading: the
    // offset resets, so the third-person rig starts behind the character and
    // first person starts looking the way the character faces.
    this.cameraOrbitOffset = 0;
    this.lastMoveKeySet = null;
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

    const move = this.dead ? { x: 0, y: 0, z: 0 } : this.computeMovementVector();
    this.updateBodyYaw(dt, move);

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
   * Body yaw logic (third person):
   *   - moving  → the body turns smoothly (exponential + angular-speed cap)
   *               toward the LATCHED movement heading, which was sampled from
   *               the camera when the movement keys changed. The turn starts
   *               the same frame the keys change — S never waits for a stop.
   *   - idle    → the body keeps its heading; nothing rotates.
   *   - camera  → camera yaw ≡ body yaw + orbit offset on EVERY frame, so
   *               the camera rotates with the body during the turn itself.
   *               While moving with the mouse hands-off, the orbit offset
   *               eases back to zero (the camera settles behind); while idle
   *               or while the RMB drag is live the offset is untouched.
   * First person: look() owns the heading; nothing turns here.
   */
  private updateBodyYaw(dt: number, move: Vec3): void {
    if (this.dead) return;
    if (this.cameraMode === 'first_person') return;

    const moving = move.x !== 0 || move.z !== 0;
    if (!moving) return;

    const diff = wrapAngle(this.intentYaw - this.bodyYaw);
    if (diff !== 0) {
      // Exponential approach clamped by a hard angular speed: large turns
      // sweep at constant speed and settle smoothly — never a snap.
      const step = diff * (1 - Math.exp(-this.bodyTurnRate * dt));
      const maxStep = this.bodyMaxTurnSpeed * dt;
      this.bodyYaw += Math.abs(step) <= maxStep ? step : Math.sign(step) * maxStep;
    }

    if (!this.lookDragging) {
      this.cameraOrbitOffset *= Math.exp(-this.orbitReturnRate * dt);
      if (Math.abs(this.cameraOrbitOffset) < 1e-4) this.cameraOrbitOffset = 0;
    }
  }

  /**
   * Movement direction for this frame. Third person runs along the LATCHED
   * world-space intent; first person stays view-relative every frame.
   */
  private computeMovementVector(): Vec3 {
    const keys = this.moveKeySet();
    const anyKey = keys !== '0000';

    if (this.cameraMode === 'third_person' && keys !== this.lastMoveKeySet) {
      this.lastMoveKeySet = keys;
      if (anyKey) {
        // Fresh input: sample the heading from the CURRENT camera basis
        // (normalized — diagonals included), then freeze it in world space.
        const dir = this.cameraRelativeDirection();
        if (dir.x !== 0 || dir.z !== 0) this.intentYaw = Math.atan2(-dir.x, -dir.z);
      }
    }

    if (!anyKey) return { x: 0, y: 0, z: 0 };
    if (this.cameraMode === 'first_person') return this.cameraRelativeDirection();
    return { x: -Math.sin(this.intentYaw), y: 0, z: -Math.cos(this.intentYaw) };
  }

  /** Normalized camera-relative WASD direction (0,0,0 when no keys). */
  private cameraRelativeDirection(): Vec3 {
    const camYaw = this.bodyYaw + this.cameraOrbitOffset;
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
    const camYaw = this.bodyYaw + this.cameraOrbitOffset;
    if (this.cameraMode === 'first_person') {
      this.camera.position.set(this.position.x, this.position.y, this.position.z);
      this.camera.rotation.set(this.pitch, camYaw, 0);
      return;
    }
    // A collision-aware rig owns third-person framing when attached.
    if (this.thirdPersonRig) return;

    // Built-in third person: orbit behind the body yaw + bounded offset.
    const target = this.scratchCamTarget.set(this.position.x, this.position.y - 0.5, this.position.z);
    const cosPitch = Math.cos(this.pitch);
    this.camera.position.set(
      this.position.x + Math.sin(camYaw) * cosPitch * this.thirdPersonDistance,
      this.position.y + (this.thirdPersonHeight - this.eyeHeight) - Math.sin(this.pitch) * this.thirdPersonDistance,
      this.position.z + Math.cos(camYaw) * cosPitch * this.thirdPersonDistance,
    );
    this.camera.lookAt(target);
  }
}
