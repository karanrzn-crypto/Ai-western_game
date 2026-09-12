/**
 * src/core/TransformOps.ts
 * -----------------------------------------------------------------------------
 * Pure helper functions for the Transform type.
 *
 * Why this module exists:
 *  - Single source of truth for the IDENTITY transform.
 *  - Equality predicate for use in de-duplication (already used internally
 *    by SceneStateManager; exposing it lets tests and future systems share
 *    the same definition).
 *  - Explicit clone() so callers don't accidentally mutate a shared
 *    transform object.
 *
 * Transform convention (documented ONCE here, enforced everywhere):
 *  - position: world-space XYZ in scene units (meters by convention).
 *  - rotation: Euler angles in DEGREES. Order is XYZ (Three.js default).
 *    We chose degrees (not radians) because scene JSON is human-authored
 *    and humans author rotations like "90°" not "π/2". The renderer
 *    adapter converts to radians at the boundary.
 *  - scale: multiplicative; 1 = original size.
 *
 * Do NOT introduce a parallel quaternion representation in this module
 * without first ensuring that the JSON/persistence format stays in Euler
 * degrees (so the wire format remains human-readable).
 * -----------------------------------------------------------------------------
 */

import type { Transform, Vec3 } from './types.js';

/** Canonical identity transform. Frozen so callers cannot mutate it. */
export const IDENTITY_TRANSFORM: Readonly<Transform> = Object.freeze({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

/** Value equality on Vec3. */
export function vec3Equal(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** Value equality on Transform. */
export function transformsEqual(a: Transform, b: Transform): boolean {
  return (
    vec3Equal(a.position, b.position) &&
    vec3Equal(a.rotation, b.rotation) &&
    vec3Equal(a.scale, b.scale)
  );
}

/** Deep-clone a Transform (so the caller can mutate the copy freely). */
export function cloneTransform(t: Transform): Transform {
  return {
    position: { ...t.position },
    rotation: { ...t.rotation },
    scale: { ...t.scale },
  };
}

/** Recursive partial helper — same shape as in types.ts but local. */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Convenience constructor — accepts partial position/rotation/scale. */
export function makeTransform(partial: DeepPartial<Transform> = {}): Transform {
  return {
    position: { ...IDENTITY_TRANSFORM.position, ...partial.position },
    rotation: { ...IDENTITY_TRANSFORM.rotation, ...partial.rotation },
    scale: { ...IDENTITY_TRANSFORM.scale, ...partial.scale },
  };
}
