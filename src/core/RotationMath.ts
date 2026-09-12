/**
 * src/core/RotationMath.ts
 * -----------------------------------------------------------------------------
 * Pure (THREE-free) rotation math for the scene registry.
 *
 * Why this module exists:
 *  - The editor must rotate objects around their OWN (local) axes, not orbit
 *    them around the world center. True local-axis rotation is a quaternion
 *    post-multiply: q' = q ⊗ q_axis(Δ). Euler increments alone cannot express
 *    this for arbitrary orientations.
 *  - The wire format stays Euler degrees (human-readable scene JSON) — this
 *    module converts to a quaternion, applies the local rotation, and converts
 *    back, so PersistenceManager keeps serializing plain degrees.
 *
 * Convention compatibility (CRITICAL):
 *  - These functions reproduce Three.js `Euler` order 'XYZ' EXACTLY:
 *      setFromEuler('XYZ')  ->  q = qx ⊗ qy ⊗ qz
 *      Euler.setFromQuaternion(q, 'XYZ') -> matrix-branch extraction with a
 *      0.9999999 gimbal-lock threshold, identical to Three.js r161.
 *  - The renderer adapter converts stored degrees with THREE itself, so any
 *    drift here would desync state vs. visuals. A regression test cross-checks
 *    this module against THREE.Quaternion for random rotations.
 * -----------------------------------------------------------------------------
 */

import type { Vec3 } from './types.js';

/** Minimal quaternion (Hamilton convention, w-last storage like THREE). */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type RotationAxis = 'x' | 'y' | 'z';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
/** Same gimbal-lock threshold as Three.js Euler.setFromRotationMatrix. */
const GIMBAL_THRESHOLD = 0.9999999;
/** Snap converted degrees to 1e-6 to keep scene JSON stable across cycles. */
const ROUND_FACTOR = 1e6;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function roundDegrees(v: number): number {
  // Avoid "-0" in scene JSON.
  const r = Math.round(v * ROUND_FACTOR) / ROUND_FACTOR;
  return r === 0 ? 0 : r;
}

function normalizeHalfTurn(v: number): number {
  let out = v;
  while (out <= -180) out += 360;
  while (out > 180) out -= 360;
  return out;
}

/**
 * Euler degrees (XYZ order) -> quaternion.
 * Matches THREE.Quaternion.setFromEuler(new THREE.Euler(x, y, z, 'XYZ')).
 * q = qx ⊗ qy ⊗ qz  (Hamilton product).
 */
export function eulerDegreesToQuaternion(deg: Vec3): Quaternion {
  const hx = (deg.x * DEG2RAD) / 2;
  const hy = (deg.y * DEG2RAD) / 2;
  const hz = (deg.z * DEG2RAD) / 2;

  const c1 = Math.cos(hx), s1 = Math.sin(hx);
  const c2 = Math.cos(hy), s2 = Math.sin(hy);
  const c3 = Math.cos(hz), s3 = Math.sin(hz);

  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  };
}

/**
 * Quaternion -> Euler degrees (XYZ order).
 * Matches THREE.Euler.setFromQuaternion(q, 'XYZ') including the gimbal-lock
 * branch (folds Z into X and zeroes Z when |m13| >= 0.9999999).
 */
export function quaternionToEulerDegrees(q: Quaternion): Vec3 {
  // Rotation matrix R = RX·RY·RZ built from the quaternion (row-major):
  const m11 = 1 - 2 * (q.y * q.y + q.z * q.z);
  const m12 = 2 * (q.x * q.y - q.w * q.z);
  const m13 = 2 * (q.x * q.z + q.w * q.y);
  const m23 = 2 * (q.y * q.z - q.w * q.x);
  const m32 = 2 * (q.y * q.z + q.w * q.x);
  const m33 = 1 - 2 * (q.x * q.x + q.y * q.y);
  const m22 = 1 - 2 * (q.x * q.x + q.z * q.z);

  const sy = clamp(m13, -1, 1);
  let xDeg: number;
  let yDeg: number = Math.asin(sy) * RAD2DEG;
  let zDeg: number;

  if (Math.abs(sy) < GIMBAL_THRESHOLD) {
    xDeg = Math.atan2(-m23, m33) * RAD2DEG;
    zDeg = Math.atan2(-m12, m11) * RAD2DEG;
  } else {
    // Gimbal lock: Y is ±90°. Fold Z into X, exactly like Three.js.
    xDeg = Math.atan2(m32, m22) * RAD2DEG;
    zDeg = 0;
  }

  return {
    x: roundDegrees(normalizeHalfTurn(xDeg)),
    y: roundDegrees(normalizeHalfTurn(yDeg)),
    z: roundDegrees(normalizeHalfTurn(zDeg)),
  };
}

/** Quaternion Hamilton product a ⊗ b. */
export function quaternionMultiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/** Unit-axis quaternion for a rotation of `rad` radians around X, Y or Z. */
export function axisAngleQuaternion(axis: RotationAxis, rad: number): Quaternion {
  const s = Math.sin(rad / 2);
  const c = Math.cos(rad / 2);
  switch (axis) {
    case 'x': return { x: s, y: 0, z: 0, w: c };
    case 'y': return { x: 0, y: s, z: 0, w: c };
    case 'z': return { x: 0, y: 0, z: s, w: c };
  }
}

/**
 * Rotate `rotation` (Euler degrees, XYZ) by `deltaDegrees` around the object's
 * OWN local axis — i.e. the axis as the object itself experiences it, no
 * matter how it is currently oriented.
 *
 * Math: q' = q ⊗ q_axis(Δ)  (post-multiply = local frame).
 * Proof of locality: the object's local axis a points along R·a in world
 * space; a world-space rotation about R·a is R·A(Δ)·R⁻¹, so the new
 * orientation is (R·A(Δ)·R⁻¹)·R = R·A(Δ) — the current orientation with the
 * axis rotation applied in its own frame. Position is never touched, so the
 * object always spins in place (never orbits the world origin).
 *
 * @returns the new rotation as Euler degrees (XYZ), rounded to 1e-6.
 */
export function applyLocalRotationDegrees(
  rotation: Vec3,
  axis: RotationAxis,
  deltaDegrees: number,
): Vec3 {
  const q = eulerDegreesToQuaternion(rotation);
  const delta = axisAngleQuaternion(axis, deltaDegrees * DEG2RAD);
  return quaternionToEulerDegrees(quaternionMultiply(q, delta));
}
