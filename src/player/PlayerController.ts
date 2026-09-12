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
   * Max body-to-camera yaw offset (rad) while idle in third person. Beyond it
   * the character smoothly turns to follow the camera direction.
   */
  maxBodyYawOffset?: number;
  /** Exponential turn rate of the body toward its target yaw (rad/s blend). */
  bodyTurnRate?: number;
  /** Hard cap on the body's angular speed (rad/s) — turns never snap. */
  bodyMaxTurnSpeed?: number;
  /** Rate at which the camera eases behind the turning body (RMB released). */
  cameraFollowRate?: number;
  /** Camera auto-follow refuses offsets larger than this (rad) — no 180° flips. */
  cameraFollowMaxAngle?: number;
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
  yaw: number;
  /** Character body (mesh) yaw — differs from `yaw` in third person. */
  bodyYaw: number;
  pitch: number;
  verticalVelocity: number;
  grounded: boolean;
  cameraMode: CameraMode;
}

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
  private readonly maxBodyYawOffset: number;
  private readonly bodyTurnRate: number;
  private readonly bodyMaxTurnSpeed: number;
  private readonly cameraFollowRate: number;
  private readonly cameraFollowMaxAngle: number;
  private readonly stamina: StaminaSystem | null;
  private readonly onLand?: (impactSpeed: number) => void;

  private camera?: THREE.Camera;
  private thirdPersonRig: ThirdPersonCamera | null = null;
  private readonly position: Vec3;
  /** Camera/look yaw — driven by the mouse, shared movement basis. */
  private yaw: number;
  /**
   * Character BODY yaw — what the visible ranger faces. In third person it
   * turns smoothly toward the movement direction (speed-capped) and follows
   * the camera once their offset exceeds `maxBodyYawOffset`; in first person
   * it is locked to the camera yaw. Never snaps.
   */
  private bodyYaw: number;
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
    this.maxBodyYawOffset = Math.max(0.3, Math.min(Math.PI, options.maxBodyYawOffset ?? 1.75));
    this.bodyTurnRate = Math.max(1, options.bodyTurnRate ?? 9);
    this.bodyMaxTurnSpeed = Math.max(0.5, options.bodyMaxTurnSpeed ?? 7);
    // Gentle on purpose: with camera-relative movement a fast auto-follow
    // chases the turning body and produces a tight perpetual circle. A slow
    // rate gives the classic wide arc that settles behind after a turn.
    this.cameraFollowRate = Math.max(0.5, options.cameraFollowRate ?? 1.6);
    this.cameraFollowMaxAngle = Math.max(0.5, Math.min(Math.PI, options.cameraFollowMaxAngle ?? 2.1));
    this.stamina = options.stamina ?? null;
    this.onLand = options.onLand;
    this.position = { ...(options.initialPosition ?? { x: 0, y: this.eyeHeight, z: 12 }) };
    this.yaw = options.yaw ?? Math.PI;
    this.bodyYaw = this.yaw;
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
    this.bodyYaw = this.yaw;
    this.thirdPersonRig?.snap();
    this.applyCamera();
  }

  /**
   * Rotate the CAMERA (RMB look). In third person this never rotates the body
   * directly — the body follows through update() (movement direction or the
   * idle offset limit), so the ranger never snaps with the mouse.
   */
  look(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * this.lookSensitivity;
    this.pitch -= deltaY * this.lookSensitivity;
    this.pitch = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, this.pitch));
    if (this.cameraMode === 'first_person') this.bodyYaw = this.yaw;
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

  /** Force the body yaw (respawn flows). */
  setBodyYaw(yaw: number): void {
    this.bodyYaw = yaw;
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

  getYaw(): number {
    return this.yaw;
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
    // First person shows the body straight under the camera; keep them
    // locked so a mode switch can never leave the mesh visually turned.
    if (mode === 'first_person') this.bodyYaw = this.yaw;
    // Entering third person hands the camera to the rig: snap it to the
    // character so it never glides in from a stale follow point.
    if (mode === 'third_person') this.thirdPersonRig?.snap();
    this.applyCamera();
  }

  toggleCameraMode(): CameraMode {
    this.setCameraMode(this.cameraMode === 'first_person' ? 'third_person' : 'first_person');
    return this.cameraMode;
  }

  getSnapshot(): PlayerControllerSnapshot {
    return {
      position: this.getPosition(),
      yaw: this.yaw,
      bodyYaw: this.bodyYaw,
      pitch: this.pitch,
      verticalVelocity: this.verticalVelocity,
      grounded: this.grounded,
      cameraMode: this.cameraMode,
    };
  }

  /**
   * Body yaw logic (third person):
   *   - moving      → the body turns smoothly toward the movement direction
   *                   (camera-relative WASD), capped by bodyMaxTurnSpeed, so
   *                   strafing with A/D reads as a natural turn, not a snap.
   *   - idle        → the body may lag the camera up to maxBodyYawOffset;
   *                   past it, the body smoothly trails the camera direction
   *                   at the limit while the camera keeps orbiting.
   *   - camera      → while the right-button drag is NOT live, the camera
   *                   eases behind the body (settles behind without
   *                   teleporting; offsets beyond cameraFollowMaxAngle are
   *                   refused so the rig can never spin forever).
   * First person keeps the body locked to the camera yaw.
   */
  private updateBodyYaw(dt: number, move: Vec3): void {
    if (this.dead) return;
    if (this.cameraMode === 'first_person') {
      this.bodyYaw = this.yaw;
      return;
    }

    const moving = move.x !== 0 || move.z !== 0;
    let target = this.bodyYaw;
    if (moving) {
      // Yaw whose forward (-sin, -cos) equals the movement direction.
      target = Math.atan2(-move.x, -move.z);
    } else {
      const cameraAhead = wrapAngle(this.yaw - this.bodyYaw);
      if (Math.abs(cameraAhead) > this.maxBodyYawOffset) {
        // Trail the orbiting camera at the allowed offset — the character
        // follows the camera direction for as long as it stays past the limit.
        target = this.yaw - Math.sign(cameraAhead) * this.maxBodyYawOffset;
      }
    }

    const diff = wrapAngle(target - this.bodyYaw);
    if (diff !== 0) {
      // Exponential approach clamped by a hard angular speed: large turns
      // sweep at constant speed and settle smoothly — never a snap.
      const step = diff * (1 - Math.exp(-this.bodyTurnRate * dt));
      const maxStep = this.bodyMaxTurnSpeed * dt;
      this.bodyYaw += Math.abs(step) <= maxStep ? step : Math.sign(step) * maxStep;
    }

    if (!this.lookDragging) {
      const behind = wrapAngle(this.bodyYaw - this.yaw);
      if (Math.abs(behind) <= this.cameraFollowMaxAngle) {
        this.yaw += behind * (1 - Math.exp(-this.cameraFollowRate * dt));
      }
    }
  }

  private computeMovementVector(): Vec3 {
    // Camera-relative: forward/right derive from the shared yaw, so WASD
    // always moves the way the camera looks in BOTH first and third person.
    const forward = this.scratchForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = this.scratchRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const direction = this.scratchDirection.set(0, 0, 0);

    if (this.input.forward) direction.add(forward);
    if (this.input.backward) direction.sub(forward);
    if (this.input.right) direction.add(right);
    if (this.input.left) direction.sub(right);

    if (direction.lengthSq() > 0) direction.normalize();
    return { x: direction.x, y: 0, z: direction.z };
  }

  private applyCamera(): void {
    if (!this.camera) return;
    this.camera.rotation.order = 'YXZ';
    if (this.cameraMode === 'first_person') {
      this.camera.position.set(this.position.x, this.position.y, this.position.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      return;
    }
    // A collision-aware rig owns third-person framing when attached.
    if (this.thirdPersonRig) return;

    // Third person: orbit the camera behind the player using BOTH yaw and
    // pitch, so looking up/down actually raises/lowers the camera instead of
    // leaving it fixed (the old behaviour ignored pitch entirely).
    // At pitch = 0 this reproduces the legacy neutral pose exactly.
    const target = this.scratchCamTarget.set(this.position.x, this.position.y - 0.5, this.position.z);
    const cosPitch = Math.cos(this.pitch);
    this.camera.position.set(
      this.position.x + Math.sin(this.yaw) * cosPitch * this.thirdPersonDistance,
      this.position.y + (this.thirdPersonHeight - this.eyeHeight) - Math.sin(this.pitch) * this.thirdPersonDistance,
      this.position.z + Math.cos(this.yaw) * cosPitch * this.thirdPersonDistance,
    );
    this.camera.lookAt(target);
  }
}
