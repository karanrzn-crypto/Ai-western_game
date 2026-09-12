/**
 * src/core/validators.ts
 * -----------------------------------------------------------------------------
 * Pure helpers that merge and validate ObjectDefinition / Transform patches.
 * Kept in their own module so they can be unit-tested independently.
 * -----------------------------------------------------------------------------
 */

import type {
  PartialTransform,
  Transform,
  Vec3,
} from './types.js';

/** Merge a partial Vec3 onto a base Vec3 — omitted components keep base. */
export function mergeVec3(base: Vec3, patch: Partial<Vec3> | undefined): Vec3 {
  if (!patch) return { ...base };
  return {
    x: typeof patch.x === 'number' ? patch.x : base.x,
    y: typeof patch.y === 'number' ? patch.y : base.y,
    z: typeof patch.z === 'number' ? patch.z : base.z,
  };
}

/** Merge a partial Transform onto a base Transform. */
export function mergeTransform(base: Transform, patch: PartialTransform | undefined): Transform {
  if (!patch) return deepCloneTransform(base);
  return {
    position: mergeVec3(base.position, patch.position),
    rotation: mergeVec3(base.rotation, patch.rotation),
    scale: mergeVec3(base.scale, patch.scale),
  };
}

/**
 * Validate that every component of a transform is a finite number.
 * Throws on NaN / Infinity / non-numbers — these silently corrupt renders.
 */
export function validateTransform(t: PartialTransform): void {
  const groups: Array<[string, Partial<Vec3> | undefined]> = [
    ['position', t.position],
    ['rotation', t.rotation],
    ['scale', t.scale],
  ];
  for (const [groupName, group] of groups) {
    if (group === undefined) continue;
    for (const axis of ['x', 'y', 'z'] as const) {
      const v = group[axis];
      if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) {
        throw new Error(
          `[validators] transform.${groupName}.${axis} must be a finite number, got: ${String(v)}`,
        );
      }
    }
  }
}

/** Helper: clone a Transform without mutating the original. */
function deepCloneTransform(t: Transform): Transform {
  return {
    position: { ...t.position },
    rotation: { ...t.rotation },
    scale: { ...t.scale },
  };
}
