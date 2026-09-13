/**
 * CreativeFlightController — an independent Development-mode fly camera
 * ("Creative Mode"), toggled with F from the demo wiring.
 *
 * ARCHITECTURE CONTRACT (regression-tested in tests/creative-flight.test.ts):
 *
 *   - The controller owns ONLY the camera while active. It never reads or
 *     writes player state: position, velocity, animation and collision stay
 *     exactly where the gameplay loop left them (the wiring simply stops
 *     calling PlayerController.update while creative is on — gravity and
 *     collision are therefore off by construction, not by special cases).
 *   - Movement is relative to the fly camera's OWN yaw every frame:
 *     W/S = forward/back, A/D = left/right (horizontal), Space = up,
 *     Ctrl = down, Shift = ×fastMultiplier. Nothing is latched: rotating
 *     the view changes where W carries the camera on the very next frame.
 *   - There is no gravity, no collision and no ground clamp — the camera
 *     flies through walls and buildings and can go above the rooftops.
 *   - look() consumes the SAME right-button-drag pixel deltas the gameplay
 *     camera uses, so the "hold RMB to look" contract is identical.
 *   - Exit is stateless: the wiring just stops calling update() and
 *     reconnects the third-person rig. The PLAYER is never teleported and
 *     the controller never moves the camera on exit — the game camera
 *     simply resumes its own framing (behind the player).
 *
 * The class is deliberately free of any player/gameplay imports: creative
 * flight must never be entangled with the movement systems.
 */
import * as THREE from 'three';

export interface CreativeFlightInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  /** Space — move the camera up along world Y. */
  up: boolean;
  /** Ctrl — move the camera down along world Y. */
  down: boolean;
  /** Shift — ~2× speed multiplier. */
  fast: boolean;
}

export interface CreativeFlightOptions {
  /** Base horizontal/vertical fly speed (m/s). */
  speed?: number;
  /** Speed multiplier while Shift is held. */
  fastMultiplier?: number;
  /** Exponential smoothing rate of the fly velocity (start/stop feel). */
  smoothing?: number;
  /** Hard bound (rad) on the fly pitch, symmetric around the horizon. */
  maxPitch?: number;
}

export class CreativeFlightController {
  private active = false;
  private readonly speed: number;
  private readonly fastMultiplier: number;
  private readonly smoothing: number;
  private readonly maxPitch: number;
  private yaw = 0;
  private pitch = 0;
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();

  constructor(options: CreativeFlightOptions = {}) {
    this.speed = Math.max(0.1, options.speed ?? 12);
    this.fastMultiplier = Math.max(1, options.fastMultiplier ?? 2);
    this.smoothing = Math.max(0.1, options.smoothing ?? 9);
    this.maxPitch = Math.min(Math.PI / 2 - 0.05, Math.max(0.1, Math.abs(options.maxPitch ?? 1.5)));
  }

  isActive(): boolean {
    return this.active;
  }

  /** Detach the camera at its CURRENT position/orientation — no jump cut. */
  begin(camera: THREE.Camera, yaw: number, pitch: number): void {
    this.active = true;
    this.position.copy(camera.position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = THREE.MathUtils.clamp(pitch, -this.maxPitch, this.maxPitch);
    this.applyTo(camera);
  }

  /** Leave creative mode: the controller simply stops owning the camera. */
  end(): void {
    this.active = false;
    this.velocity.set(0, 0, 0);
  }

  /** Rotate the fly view (same right-drag pixel deltas the gameplay uses). */
  look(deltaX: number, deltaY: number, sensitivity = 0.0018): void {
    if (!this.active) return;
    this.yaw -= deltaX * sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - deltaY * sensitivity,
      -this.maxPitch,
      this.maxPitch,
    );
  }

  /**
   * Fly the camera for this frame. The direction basis is rebuilt from the
   * CURRENT yaw every frame (nothing cached), velocity is exponentially
   * smoothed (fast start, smooth stop, no jerk), and the result is written
   * straight to the camera — no collision, no gravity, no clamping.
   */
  update(deltaSeconds: number, input: CreativeFlightInput, camera: THREE.Camera): void {
    if (!this.active) return;
    const dt = Math.max(0, deltaSeconds);

    // Same yaw convention as the gameplay movement basis: forward looks
    // toward -Z at yaw 0, so W/A/S/D feel identical to normal movement.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const moveX = -sin * ((input.forward ? 1 : 0) - (input.backward ? 1 : 0))
      + cos * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
    const moveZ = -cos * ((input.forward ? 1 : 0) - (input.backward ? 1 : 0))
      - sin * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
    const length = Math.hypot(moveX, moveZ);
    const speed = this.speed * (input.fast ? this.fastMultiplier : 1);
    const targetX = length > 0 ? (moveX / length) * speed : 0;
    const targetZ = length > 0 ? (moveZ / length) * speed : 0;
    const targetY = ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * speed;

    const blend = 1 - Math.exp(-this.smoothing * Math.max(dt, 1e-5));
    this.velocity.x += (targetX - this.velocity.x) * blend;
    this.velocity.y += (targetY - this.velocity.y) * blend;
    this.velocity.z += (targetZ - this.velocity.z) * blend;
    if (Math.abs(this.velocity.x) < 1e-4) this.velocity.x = 0;
    if (Math.abs(this.velocity.y) < 1e-4) this.velocity.y = 0;
    if (Math.abs(this.velocity.z) < 1e-4) this.velocity.z = 0;

    this.position.addScaledVector(this.velocity, dt);
    this.applyTo(camera);
  }

  private applyTo(camera: THREE.Camera): void {
    camera.rotation.order = 'YXZ';
    camera.position.copy(this.position);
    camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
