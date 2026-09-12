import * as THREE from 'three';
import type { Vec3 } from '../core/types.js';
import { CollisionWorld } from '../physics/CollisionWorld.js';

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

  private camera?: THREE.Camera;
  private readonly position: Vec3;
  private yaw: number;
  private pitch: number;
  private verticalVelocity = 0;
  private grounded = true;
  private cameraMode: CameraMode;
  private jumpQueued = false;
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
    this.position = { ...(options.initialPosition ?? { x: 0, y: this.eyeHeight, z: 12 }) };
    this.yaw = options.yaw ?? Math.PI;
    this.pitch = options.pitch ?? 0;
    this.cameraMode = options.cameraMode ?? 'first_person';
    this.camera = options.camera;
    this.applyCamera();
  }

  attachCamera(camera: THREE.Camera): void {
    this.camera = camera;
    this.applyCamera();
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
    if (!this.grounded) return false;
    this.jumpQueued = true;
    return true;
  }

  look(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * this.lookSensitivity;
    this.pitch -= deltaY * this.lookSensitivity;
    this.pitch = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, this.pitch));
    this.applyCamera();
  }

  update(deltaSeconds: number, input?: PlayerInputState): void {
    if (input) this.setInput(input);

    if (this.jumpQueued && this.grounded) {
      this.verticalVelocity = this.jumpSpeed;
      this.grounded = false;
    }
    this.jumpQueued = false;

    const move = this.computeMovementVector();
    if (move.x !== 0 || move.z !== 0) {
      const speed = this.input.sprint ? this.sprintSpeed : this.walkSpeed;
      const result = this.collisionWorld.movePlayer(
        this.position,
        { x: move.x * speed * deltaSeconds, y: 0, z: move.z * speed * deltaSeconds },
        this.radius,
        this.eyeHeight,
      );
      this.position.x = result.position.x;
      this.position.z = result.position.z;
    }

    this.verticalVelocity -= this.gravity * deltaSeconds;
    const vertical = this.collisionWorld.movePlayer(
      this.position,
      { x: 0, y: this.verticalVelocity * deltaSeconds, z: 0 },
      this.radius,
      this.eyeHeight,
    );
    this.position.y = vertical.position.y;
    this.grounded = vertical.grounded;
    if (this.grounded && this.verticalVelocity < 0) {
      this.verticalVelocity = 0;
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

  getEyeHeight(): number {
    return this.eyeHeight;
  }

  getRadius(): number {
    return this.radius;
  }

  getCameraMode(): CameraMode {
    return this.cameraMode;
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

    const backward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const target = new THREE.Vector3(this.position.x, this.position.y - 0.5, this.position.z);
    this.camera.position.set(this.position.x, this.position.y, this.position.z);
    this.camera.position.addScaledVector(backward, this.thirdPersonDistance);
    this.camera.position.y += this.thirdPersonHeight - this.eyeHeight;
    this.camera.lookAt(target);
  }
}
