/**
 * src/editor/DebugAxes.ts
 * -----------------------------------------------------------------------------
 * Edit-mode coordinate reference: the world origin (0,0,0) plus the X/Y/Z
 * direction axes.
 *
 * Contract with the rest of the engine:
 *  - PURELY VISUAL. These helpers are NEVER registered in the SceneStateManager
 *    and NEVER appear in IRendererAdapter.getActiveUUIDs(), so the editor's
 *    raycast candidate list (built from managed UUIDs only) can never select
 *    or move them. `isDebugHelper()` is the defensive tag any future picking
 *    code can filter on.
 *  - Rendered as a transparent overlay (depthTest disabled + high render
 *    order). This is deliberate: an overlay that draws on top of every
 *    surface can never be mistaken for a physical object "poking out of" a
 *    mesh — the exact confusion that got the previous AxesHelper removed.
 *  - The demo shows the group ONLY while Edit Mode is active.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';

/** userData key marking an Object3D as a non-interactive debug helper. */
export const DEBUG_HELPER_KEY = 'isDebugHelper';

export interface DebugAxesOptions {
  /** Length of the positive axis arms in world units. Default 2.5. */
  size?: number;
}

/** True if `obj` (or any of its ancestors) carries the debug-helper tag. */
export function isDebugHelper(obj: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = obj;
  while (current) {
    if (current.userData?.[DEBUG_HELPER_KEY] === true) return true;
    current = current.parent;
  }
  return false;
}

function makeAxisLine(from: THREE.Vector3, to: THREE.Vector3, color: number, opacity: number): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 999;
  line.userData[DEBUG_HELPER_KEY] = true;
  return line;
}

/**
 * Build the origin + axes debug overlay.
 *
 * The group sits EXACTLY at the world origin (0,0,0):
 *  - a small white origin marker so the origin point itself is visible,
 *  - a red X arm (positive +X), green Y arm (+Y), blue Z arm (+Z),
 *  - short dimmer stubs on the negative side of each axis for readability.
 */
export function createDebugAxes(options: DebugAxesOptions = {}): THREE.Group {
  const size = options.size ?? 2.5;
  const group = new THREE.Group();
  group.name = 'debug-origin-axes';
  group.userData[DEBUG_HELPER_KEY] = true;
  group.position.set(0, 0, 0);

  const origin = 0;
  const arms: Array<{ dir: THREE.Vector3; color: number }> = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xff5f6d }, // X — red
    { dir: new THREE.Vector3(0, 1, 0), color: 0x8ce99a }, // Y — green
    { dir: new THREE.Vector3(0, 0, 1), color: 0x74c0fc }, // Z — blue
  ];

  for (const { dir, color } of arms) {
    group.add(makeAxisLine(
      new THREE.Vector3(origin, origin, origin),
      dir.clone().multiplyScalar(size),
      color,
      0.95,
    ));
    group.add(makeAxisLine(
      new THREE.Vector3(origin, origin, origin),
      dir.clone().multiplyScalar(-size * 0.35),
      color,
      0.3,
    ));
  }

  // Small origin marker so (0,0,0) itself reads as a point, not a guess.
  const markerGeometry = new THREE.OctahedronGeometry(size * 0.045);
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const marker = new THREE.Mesh(markerGeometry, markerMaterial);
  marker.renderOrder = 999;
  marker.userData[DEBUG_HELPER_KEY] = true;
  group.add(marker);

  return group;
}
