/**
 * ThirdPersonCamera — collision-aware orbit camera for the main character.
 *
 * Features: follow with exponential smoothing (no popping), mouse yaw/pitch,
 * over-the-shoulder offset, occlusion against the CollisionWorld's AABBs
 * (ray/AABB slab test pulls the camera in front of walls), crouch-aware
 * target height, and hard clamps that keep the character (not the hat) in
 * frame. Pure math against CollisionBounds so it is testable headless.
 */
import * as THREE from 'three';
import type { CollisionBounds } from '../physics/CollisionWorld.js';

export interface ThirdPersonCameraOptions {
  /** Eye/target height above the feet while standing. */
  targetHeight?: number;
  /** Eye/target height while crouched. */
  crouchTargetHeight?: number;
  defaultDistance?: number;
  minDistance?: number;
  /** Horizontal offset toward the character's right (over-the-shoulder). */
  shoulderOffset?: number;
  /** Exponential smoothing rate for the follow point. */
  followSmoothing?: number;
  /** Exponential smoothing rate for the orbit distance. */
  distanceSmoothing?: number;
  pitchLimitMin?: number;
  pitchLimitMax?: number;
}

export interface ThirdPersonCameraInput {
  /** Character feet position (world). */
  targetPosition: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  /** 1 = standing, 0 = fully crouched (smoothed externally). */
  crouchFactor?: number;
  deltaSeconds: number;
}

export interface ThirdPersonCameraSnapshot {
  appliedDistance: number;
  desiredDistance: number;
  occluded: boolean;
}

/** Slab-test ray/AABB hit distance along a normalized direction, or null. */
export function rayAabbDistance(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  bounds: CollisionBounds,
): number | null {
  let tMin = -Number.POSITIVE_INFINITY;
  let tMax = Number.POSITIVE_INFINITY;
  const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
  for (const axis of axes) {
    const o = origin[axis];
    const d = dir[axis];
    const lo = bounds.min[axis];
    const hi = bounds.max[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const t1 = (lo - o) / d;
    const t2 = (hi - o) / d;
    const near = Math.min(t1, t2);
    const far = Math.max(t1, t2);
    tMin = Math.max(tMin, near);
    tMax = Math.min(tMax, far);
    if (tMin > tMax) return null;
  }
  if (tMax < 0) return null; // box entirely behind the ray
  if (tMin < 0) return 0;    // origin inside the box
  return tMin;
}

const damp = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-rate * Math.max(dt, 1e-5)));

export class ThirdPersonCamera {
  private readonly camera: THREE.Camera;
  private readonly boundsProvider: (() => readonly CollisionBounds[]) | null;
  private readonly targetHeight: number;
  private readonly crouchTargetHeight: number;
  private readonly defaultDistance: number;
  private readonly minDistance: number;
  private readonly shoulderOffset: number;
  private readonly followSmoothing: number;
  private readonly distanceSmoothing: number;
  private readonly pitchLimitMin: number;
  private readonly pitchLimitMax: number;
  private readonly followPoint = new THREE.Vector3();
  private appliedDistance: number;
  private initialized = false;

  constructor(
    camera: THREE.Camera,
    boundsProvider: (() => readonly CollisionBounds[]) | null,
    options: ThirdPersonCameraOptions = {},
  ) {
    this.camera = camera;
    this.boundsProvider = boundsProvider;
    this.targetHeight = options.targetHeight ?? 1.58;
    this.crouchTargetHeight = options.crouchTargetHeight ?? 1.02;
    this.defaultDistance = Math.max(1, options.defaultDistance ?? 4.6);
    this.minDistance = Math.max(0.5, options.minDistance ?? 0.9);
    this.shoulderOffset = options.shoulderOffset ?? 0.32;
    this.followSmoothing = Math.max(0.1, options.followSmoothing ?? 14);
    this.distanceSmoothing = Math.max(0.1, options.distanceSmoothing ?? 9);
    this.pitchLimitMin = options.pitchLimitMin ?? -1.15;
    this.pitchLimitMax = options.pitchLimitMax ?? 1.25;
    this.appliedDistance = this.defaultDistance;
  }

  getSnapshot(): ThirdPersonCameraSnapshot {
    return {
      appliedDistance: this.appliedDistance,
      desiredDistance: this.defaultDistance,
      occluded: this.appliedDistance < this.defaultDistance - 0.05,
    };
  }

  /** Snap instantly to the target (teleport/respawn) — no smoothing trail. */
  snap(): void {
    this.initialized = false;
  }

  update(input: ThirdPersonCameraInput): ThirdPersonCameraSnapshot {
    const dt = Math.max(0, input.deltaSeconds);
    const pitch = Math.max(this.pitchLimitMin, Math.min(this.pitchLimitMax, input.pitch));
    const crouchFactor = Math.max(0, Math.min(1, input.crouchFactor ?? 1));
    const height = this.crouchTargetHeight + (this.targetHeight - this.crouchTargetHeight) * crouchFactor;

    const desired = new THREE.Vector3(input.targetPosition.x, input.targetPosition.y + height, input.targetPosition.z);
    if (!this.initialized) {
      this.followPoint.copy(desired);
      this.appliedDistance = this.defaultDistance;
      this.initialized = true;
    } else {
      this.followPoint.x = damp(this.followPoint.x, desired.x, this.followSmoothing, dt);
      this.followPoint.y = damp(this.followPoint.y, desired.y, this.followSmoothing, dt);
      this.followPoint.z = damp(this.followPoint.z, desired.z, this.followSmoothing, dt);
    }

    // Orbit direction: behind the character at (yaw, pitch) — same handedness
    // as PlayerController's third-person math so both agree on "behind".
    const cosPitch = Math.cos(pitch);
    const back = new THREE.Vector3(
      Math.sin(input.yaw) * cosPitch,
      -Math.sin(pitch),
      Math.cos(input.yaw) * cosPitch,
    ).normalize();
    const right = new THREE.Vector3(Math.cos(input.yaw), 0, -Math.sin(input.yaw));

    let distance = this.defaultDistance;
    let occluded = false;
    if (this.boundsProvider) {
      const origin = { x: this.followPoint.x, y: this.followPoint.y, z: this.followPoint.z };
      const dir = { x: back.x, y: back.y, z: back.z };
      let nearest = Number.POSITIVE_INFINITY;
      for (const bounds of this.boundsProvider()) {
        const hit = rayAabbDistance(origin, dir, bounds);
        if (hit !== null && hit < nearest) nearest = hit;
      }
      if (nearest < distance) {
        occluded = true;
        distance = Math.max(this.minDistance, nearest - 0.28);
      }
    }
    // Pull in fast when occluded, ease back out when clear (no rubber band).
    this.appliedDistance = occluded
      ? Math.min(this.appliedDistance, distance)
      : damp(this.appliedDistance, distance, this.distanceSmoothing, dt);
    if (occluded) this.appliedDistance = Math.max(this.appliedDistance, this.minDistance);

    const offset = back.clone().multiplyScalar(this.appliedDistance).addScaledVector(right, this.shoulderOffset);
    this.camera.position.copy(this.followPoint).add(offset);
    this.camera.lookAt(this.followPoint.x + right.x * this.shoulderOffset * 0.35, this.followPoint.y, this.followPoint.z + right.z * this.shoulderOffset * 0.35);
    return this.getSnapshot();
  }
}
