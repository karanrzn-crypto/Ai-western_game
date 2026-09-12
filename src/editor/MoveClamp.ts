/**
 * src/editor/MoveClamp.ts
 * -----------------------------------------------------------------------------
 * Drag-time penetration guard for the move gizmo.
 *
 * While a move drag would push the selected object into another object or
 * into the ground, the desired step along the world drag axis is clamped so
 * the moving object's world bounds NEVER penetrate that surface: movement is
 * allowed exactly up to the contact boundary and stopped in the penetration
 * direction. Deliberately NOT implemented:
 *   - no snapping (the object is never moved onto a grid or a face),
 *   - no auto-separation (an object already sunk — e.g. via typed panel
 *     numbers — is never pushed out; a drag just cannot push it DEEPER).
 *
 * Rules per blocker (world AABBs), for a drag along world axis `a`:
 *   - lateral overlap on the two non-`a` axes below `lateralThreshold`
 *     means the faces are flush/parallel — sliding along the contact plane
 *     must stay FREE (also makes float noise unable to freeze a drag);
 *   - separated along `a`  -> movement is limited to the other face;
 *   - one box contains the other along `a` -> sliding neither creates nor
 *     deepens a face contact, so the step passes;
 *   - partially overlapped along `a` -> the step that would deepen the
 *     penetration is clamped to 0, the exit direction stays free.
 *
 * Pure AABB math plus a thin scene-wiring helper; no state is registered
 * anywhere and nothing is persisted.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ContactIndicatorManagerLike } from './ContactIndicator.js';
import { isDebugHelper } from './DebugAxes.js';

export type ClampAxis = 'x' | 'y' | 'z';

/**
 * Lateral overlap (on the two non-move axes) required before a box counts as
 * a blocker. Two cubes flush side-by-side overlap by ~0 laterally — sliding
 * one along the contact plane must never be blocked, and float noise (≈1e-15)
 * must never freeze a drag either.
 */
export const DEFAULT_LATERAL_OVERLAP_THRESHOLD = 0.001;

export interface AxisDeltaClampInput {
  /** Current world AABB of the moving object. */
  selected: THREE.Box3;
  /** World axis the movement is constrained to. */
  axis: ClampAxis;
  /** Desired signed step along `axis`, measured from the box's current spot. */
  delta: number;
  /** World AABBs of everything the object must not penetrate (ground included). */
  blockers: readonly THREE.Box3[];
  /** Min lateral overlap for a box to count as a blocker. Default 0.001. */
  lateralThreshold?: number;
}

/**
 * Clamp a signed movement step along one world axis so it never penetrates
 * any blocker. Returns a step with the same sign-or-zero: approach stops at
 * the contact boundary, retreat always passes through unchanged.
 */
export function clampAxisDelta(input: AxisDeltaClampInput): number {
  const { axis, delta } = input;
  const threshold = input.lateralThreshold ?? DEFAULT_LATERAL_OVERLAP_THRESHOLD;
  if (delta === 0) return 0;

  const [j1, j2]: readonly [ClampAxis, ClampAxis] =
    axis === 'x' ? ['y', 'z'] : axis === 'y' ? ['x', 'z'] : ['x', 'y'];

  let limitPlus = Infinity; // max allowed positive step
  let limitMinus = -Infinity; // min allowed negative step

  for (const blocker of input.blockers) {
    // Fixed during an axis drag: the lateral intervals do not move.
    const lat1 = Math.min(input.selected.max[j1], blocker.max[j1]) - Math.max(input.selected.min[j1], blocker.min[j1]);
    const lat2 = Math.min(input.selected.max[j2], blocker.max[j2]) - Math.max(input.selected.min[j2], blocker.min[j2]);
    if (lat1 < threshold || lat2 < threshold) continue; // flush/parallel — free slide

    const sMin = input.selected.min[axis];
    const sMax = input.selected.max[axis];
    const bMin = blocker.min[axis];
    const bMax = blocker.max[axis];

    if (sMax <= bMin || sMin >= bMax) {
      // Separated along the move axis — only the approaching side is limited.
      if (sMax <= bMin) limitPlus = Math.min(limitPlus, bMin - sMax); // stop AT the face
      else limitMinus = Math.max(limitMinus, bMax - sMin);
    } else if ((bMin <= sMin && sMax <= bMax) || (sMin <= bMin && bMax <= sMax)) {
      // Containment either way — sliding changes no face contact; free.
      continue;
    } else if (sMin <= bMin) {
      // Overlapping, entered from the - side: + would deepen penetration.
      limitPlus = Math.min(limitPlus, 0);
    } else {
      // Overlapping, entered from the + side: - would deepen penetration.
      limitMinus = Math.max(limitMinus, 0);
    }
  }

  if (delta > 0) return Math.max(0, Math.min(delta, limitPlus));
  return Math.min(0, Math.max(delta, limitMinus));
}

/** Signature of the per-drag clamp hook consumed by TransformGizmo. */
export type AxisClampController = (uuid: string, axis: ClampAxis, delta: number) => number;

/**
 * Collect the world AABBs of every managed object except `excludeUuid`
 * (the ground is a managed object, so it is included automatically).
 */
export function collectBlockerBoxes(
  scene: THREE.Scene,
  manager: ContactIndicatorManagerLike,
  excludeUuid: string,
  out: THREE.Box3[] = [],
): THREE.Box3[] {
  out.length = 0;
  for (const definition of manager.getAllObjects()) {
    if (definition.uuid === excludeUuid) continue;
    const mesh = scene.getObjectByProperty('uuid', definition.uuid);
    if (!mesh || isDebugHelper(mesh)) continue;
    out.push(new THREE.Box3().setFromObject(mesh));
  }
  return out;
}

/**
 * Build the clamp callback for TransformGizmo's `clampMoveDelta` option.
 * The dragged object's bounds are re-read from the scene on every call, so
 * the clamp is always relative to wherever the object currently is — which
 * is what keeps a clamped drag stable at the boundary without sticking when
 * the pointer moves back.
 */
export function makeSceneAxisClamp(
  scene: THREE.Scene,
  manager: ContactIndicatorManagerLike,
  lateralThreshold?: number,
): AxisClampController {
  const selectedBox = new THREE.Box3();
  return (uuid, axis, delta) => {
    if (delta === 0) return 0;
    const mesh = scene.getObjectByProperty('uuid', uuid);
    if (!mesh || isDebugHelper(mesh)) return delta;
    const definition = manager.getObject(uuid);
    if (!definition || definition.metadata.editable === false) return delta;
    selectedBox.setFromObject(mesh);
    const blockers = collectBlockerBoxes(scene, manager, uuid);
    return clampAxisDelta({ selected: selectedBox, axis, delta, blockers, lateralThreshold });
  };
}
