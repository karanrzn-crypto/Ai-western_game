/**
 * src/editor/GizmoMath.ts
 * -----------------------------------------------------------------------------
 * Pure (THREE-free) math for gizmo mouse dragging.
 *
 * Two primitives drive the whole gizmo:
 *  1. Axis-constrained MOVEMENT: the pointer ray and the drag axis (a line
 *     through the object position) are two 3D lines; the point on the axis
 *     line closest to the ray is the natural "where is the mouse along this
 *     axis" measure. Movement = delta of that parameter -> continuous.
 *  2. Rotation: the pointer ray is intersected with the frozen plane through
 *     the object position whose normal is the drag axis; the angle of that
 *     hit point around the center is the "where is the mouse on this ring"
 *     measure. Rotation = signed delta of that angle -> continuous.
 *
 * Everything is deterministic so unit tests can construct exact rays.
 * -----------------------------------------------------------------------------
 */

import type { Vec3 } from '../core/types.js';

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l < 1e-12) return { x: 0, y: 0, z: 0 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Orthonormal right-handed plane basis (u, v) for a unit normal n: u×v = n. */
export function planeBasis(normal: Vec3): { u: Vec3; v: Vec3 } {
  const ref = Math.abs(normal.y) < 0.999 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const u = normalize(cross(ref, normal));
  const v = cross(normal, u);
  return { u, v };
}

/**
 * Parameter `s` of the point on the axis line (axisOrigin + s*axisDir) that is
 * closest to the given pointer ray. Returns null when the lines are parallel
 * (drag would be meaningless).
 */
export function closestAxisParamFromRay(
  axisOrigin: Vec3,
  axisDir: Vec3,
  rayOrigin: Vec3,
  rayDir: Vec3,
): number | null {
  const w0 = {
    x: axisOrigin.x - rayOrigin.x,
    y: axisOrigin.y - rayOrigin.y,
    z: axisOrigin.z - rayOrigin.z,
  };
  const a = dot(axisDir, axisDir);
  const b = dot(axisDir, rayDir);
  const c = dot(rayDir, rayDir);
  const d = dot(axisDir, w0);
  const e = dot(rayDir, w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-12) return null;
  return (b * e - c * d) / denom;
}

/**
 * Angle (radians, in the (u,v) basis of `normal`) of the point where the
 * pointer ray pierces the plane through `center` with normal `normal`.
 * Returns null when the ray is parallel to the plane or the plane is behind
 * the ray origin. Only ANGLE DIFFERENCES within one drag are meaningful.
 */
export function rayAngleAroundAxis(
  center: Vec3,
  normal: Vec3,
  rayOrigin: Vec3,
  rayDir: Vec3,
): number | null {
  const denom = dot(rayDir, normal);
  if (Math.abs(denom) < 1e-9) return null;
  const toCenter = {
    x: center.x - rayOrigin.x,
    y: center.y - rayOrigin.y,
    z: center.z - rayOrigin.z,
  };
  const t = dot(toCenter, normal) / denom;
  if (t < 0) return null; // plane intersection behind the pointer ray
  const hit = {
    x: rayOrigin.x + rayDir.x * t,
    y: rayOrigin.y + rayDir.y * t,
    z: rayOrigin.z + rayDir.z * t,
  };
  const p = { x: hit.x - center.x, y: hit.y - center.y, z: hit.z - center.z };
  const { u, v } = planeBasis(normal);
  return Math.atan2(dot(p, v), dot(p, u));
}

/** Wrap a radian delta into (-PI, PI] — keeps ring drags free of 2π jumps. */
export function wrapAngle(delta: number): number {
  let d = delta;
  const twoPi = Math.PI * 2;
  while (d > Math.PI) d -= twoPi;
  while (d <= -Math.PI) d += twoPi;
  return d;
}
