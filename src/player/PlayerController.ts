import * as THREE from 'three';
import type { Vec3 } from '../core/types.js';
import { CollisionWorld } from '../physics/CollisionWorld.js';
import type { StaminaSystem } from './Vitals.js';
import type { ThirdPersonCamera } from './ThirdPersonCamera.js';

export type CameraMode = 'first_person' | 'third_person';

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
  /** Time to reach full speed (0 = legacy instant velocity). */
  accelerationTime?: number;
  /** Time to stop when input releases (0 = legacy instant stop). */
  decelerationTime?: number;
  /** Max ledge height the controller can step onto while grounded. */
  stepHeight?: number;
  /** Optional stamina pool: sprint degrades to walk when it runs out. */
  stamina?: StaminaSystem;
  /** Fired when the controller lands after being airborne. */
  onLand?: (impactSpeed: number) => void;
}

export interface PlayerControllerSnapshot {
  position: Vec3;
  yaw: number;
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
  private readonly accelerationTime: number;
  private readonly decelerationTime: number;
  private readonly stepHeight: number;
  private readonly stamina: StaminaSystem | null;
  private readonly onLand?: (impactSpeed: number) => void;

  private camera?: THREE.Camera;
  private thirdPersonRig: ThirdPersonCamera | null = null;
  private readonly position: Vec3;
  private yaw: number;
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
    this.accelerationTime = Math.max(0, options.accelerationTime ?? 0);
    this.decelerationTime = Math.max(0, options.decelerationTime ?? 0);
    this.stepHeight = Math.max(0, options.stepHeight ?? 0);
    this.stamina = options.stamina ?? null;
    this.onLand = options.onLand;
    this.position = { ...(options.initialPosition ?? { x: 0, y: this.eyeHeight, z: 12 }) };
    this.yaw = options.yaw ?? Math.PI;
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
    this.thirdPersonRig?.snap();
    this.applyCamera();
  }

  look(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * this.lookSensitivity;
    this.pitch -= deltaY * this.lookSensitivity;
    this.pitch = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, this.pitch));
    this.applyCamera();
  }

  update(deltaSeconds: number, input?: PlayerInputState): void {
    if (input) this.setInput(input);
    const dt = Math.max(0, deltaSeconds);

    if (this.jumpQueued && this.grounded && !this.dead && !this.crouching) {
      this.verticalVelocity = this.jumpSpeed;
      this.grounded = false;
    }
    this.jumpQueued = false;

    const move = this.dead ? { x: 0, y: 0, z: 0 } : this.computeMovementVector();
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

    const targetEye = this.crouching ? this.eyeHeight * this.crouchEyeFactor : this.eyeHeight;
    this.currentEyeHeight += (targetEye - this.currentEyeHeight) * (1 - Math.exp(-12 * dt));

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
    this.applyCamera();
  }

  toggleCameraMode(): CameraMode {
    this.cameraMode = this.cameraMode === 'first_person' ? 'third_person' : 'first_person';
    this.applyCamera();
    return this.cameraMode;
  }

  getSnapshot(): PlayerControllerSnapshot {
    return {
      position: this.getPosition(),
      yaw: this.yaw,
      pitch: this.pitch,
      verticalVelocity: this.verticalVelocity,
      grounded: this.grounded,
      cameraMode: this.cameraMode,
    };
  }

  private computeMovementVector(): Vec3 {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const direction = new THREE.Vector3();

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
    const target = new THREE.Vector3(this.position.x, this.position.y - 0.5, this.position.z);
    const cosPitch = Math.cos(this.pitch);
    this.camera.position.set(
      this.position.x + Math.sin(this.yaw) * cosPitch * this.thirdPersonDistance,
      this.position.y + (this.thirdPersonHeight - this.eyeHeight) - Math.sin(this.pitch) * this.thirdPersonDistance,
      this.position.z + Math.cos(this.yaw) * cosPitch * this.thirdPersonDistance,
    );
    this.camera.lookAt(target);
  }
}
