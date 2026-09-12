/**
 * src/editor/SelectionInfo.ts
 * -----------------------------------------------------------------------------
 * Pure formatting for the "Selected Object" info panel.
 *
 * The demo panel is DOM, so it can't be unit-tested headless — this module
 * holds ALL the display logic as pure functions so regression tests cover it:
 *   - selected object -> Name / UUID / Position / Rotation / Scale strings
 *   - no selection    -> "None" / "No selection" placeholders
 * Values are formatted from the SceneStateManager definition, and the demo
 * re-renders the panel every frame from live manager state, which is what
 * makes Position/Rotation update the instant a move/rotation key lands.
 * -----------------------------------------------------------------------------
 */

import type { ObjectDefinition, Vec3 } from '../core/types.js';

export interface SelectedObjectInfo {
  /** Display name, or "None" when nothing is selected. */
  name: string;
  /** UUID string, or "—" when nothing is selected. */
  uuid: string;
  /** "X, Y, Z" position string, or "—" when nothing is selected. */
  position: string;
  /** "X, Y, Z" rotation string (degrees), or "—" when nothing is selected. */
  rotation: string;
  /** "X, Y, Z" scale string, or "—" when nothing is selected. */
  scale: string;
}

export const NO_SELECTION_INFO: Readonly<SelectedObjectInfo> = Object.freeze({
  name: 'None',
  uuid: 'No selection',
  position: '—',
  rotation: '—',
  scale: '—',
});

function formatVec3(v: Vec3, precision = 2): string {
  return `${v.x.toFixed(precision)}, ${v.y.toFixed(precision)}, ${v.z.toFixed(precision)}`;
}

/**
 * Format a managed object definition for the info panel.
 * Passing `undefined` (nothing selected / deselected) yields the
 * None / No selection placeholder state.
 */
export function formatSelectedObjectInfo(
  definition: Readonly<ObjectDefinition> | undefined,
): SelectedObjectInfo {
  if (!definition) return { ...NO_SELECTION_INFO };
  return {
    name: definition.metadata.name,
    uuid: definition.uuid,
    position: formatVec3(definition.transform.position),
    rotation: formatVec3(definition.transform.rotation, 1),
    scale: formatVec3(definition.transform.scale),
  };
}
