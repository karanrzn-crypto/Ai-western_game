/**
 * src/editor/TransformGizmo.ts
 * -----------------------------------------------------------------------------
 * Unity-style mouse transform gizmo for Edit Mode.
 *
 * Handles (exactly 3 + 3):
 *   - move:x / move:y / move:z  — axis shaft + cone tip, attached to the
 *     SELECTED OBJECT's position (the whole gizmo rides the object's
 *     position AND rotation — local-space gizmo, never the world origin).
 *   - rotate:x / rotate:y / rotate:z — three orthogonal rings around the
 *     object's own origin; dragging spins the object around ITS OWN local
 *     axis (continuous, via core/RotationMath quaternion post-multiply).
 *
 * Separation guarantees (the previous "duplicate object" bug must never
 * recur):
 *   - The gizmo is NEVER registered in SceneStateManager -> never saved to
 *     scene JSON, never a collider, never returned by getActiveUUIDs() and
 *     therefore never a raycast candidate for object selection.
 *   - Every node carries the shared debug-helper tag, so any picking code
 *     can filter it out defensively (isDebugHelper()).
 *   - pickHandle() returns null while the gizmo is hidden, so it cannot be
 *     interacted with outside Edit Mode + selection.
 *
 * Transform routing guarantee:
 *   - Drags apply changes EXCLUSIVELY through
 *     SceneStateManager.updateObjectTransform(). The gizmo only reads state;
 *     it never mutates definitions directly.
 *
 * Move direction guarantee (fixed behaviour):
 *   - MOVE drags travel along the WORLD X/Y/Z axis named by the handle —
 *     never along the object's rotated local axis, its geometry tips or its
 *     rotated bounding box — so dragging X changes ONLY position.x even when
 *     the object carries a 45° rotation. The move arms are counter-rotated
 *     so they always RENDER on those same world axes. Rotation rings stay
 *     attached to the object's local axes, untouched.
 *   - The optional clampMoveDelta hook (see editor/MoveClamp.ts) lets the
 *     host stop a move drag exactly at the contact boundary instead of
 *     letting the object sink into the ground or a neighbouring object.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { Vec3 } from '../core/types.js';
import type { SceneStateManager } from '../core/SceneStateManager.js';
import { applyLocalRotationDegrees } from '../core/RotationMath.js';
import { DEBUG_HELPER_KEY } from './DebugAxes.js';
import {
  closestAxisParamFromRay,
  rayAngleAroundAxis,
  wrapAngle,
} from './GizmoMath.js';

export type GizmoAxis = 'x' | 'y' | 'z';
export type GizmoHandleId = `move:${GizmoAxis}` | `rotate:${GizmoAxis}`;

export interface TransformGizmoOptions {
  manager: SceneStateManager;
  /** Length of the move-axis arms in world units. Default 1.4. */
  size?: number;
  /** Radius of the rotation rings. Default 0.55. */
  ringRadius?: number;
  /** Fired ONCE per completed drag, after the final transform is applied. */
  onTransformCommitted?: (uuid: string) => void;
  /**
   * Optional penetration guard for MOVE drags (see editor/MoveClamp.ts).
   * Receives the desired signed step along the world drag axis and returns
   * the clamped step; movement then stops at the contact boundary instead
   * of sinking into the ground or another object. No snapping is performed.
   */
  clampMoveDelta?: (uuid: string, axis: GizmoAxis, delta: number) => number;
}

interface DragState {
  uuid: string;
  handle: GizmoHandleId;
  kind: 'move' | 'rotate';
  axis: GizmoAxis;
  /** Frozen at drag start. */
  startPosition: Vec3;
  startRotation: Vec3;
  /** move: unit world direction of the object's local axis at drag start. */
  axisDir: Vec3;
  /** move: parameter of the pointer ray on the axis line at drag start. */
  startParam: number;
  /** rotate: frozen ring plane (center + world-space local axis normal). */
  planeCenter: Vec3;
  planeNormal: Vec3;
  /** rotate: last pointer angle on the frozen ring plane (radians). */
  lastAngle: number;
}

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
const AXIS_VECTORS: Record<GizmoAxis, Vec3> = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};
const AXIS_COLORS: Record<GizmoAxis, number> = {
  x: 0xff5f6d,
  y: 0x8ce99a,
  z: 0x74c0fc,
};

export class TransformGizmo {
  /** The only node that enters the render scene. Never registered anywhere. */
  readonly root: THREE.Group;

  private readonly manager: SceneStateManager;
  private readonly onTransformCommitted?: (uuid: string) => void;
  private readonly clampMoveDelta?: (uuid: string, axis: GizmoAxis, delta: number) => number;
  private readonly proxies = new Map<GizmoHandleId, THREE.Mesh>();
  /** Move-handle groups, counter-rotated so the arms always render on world axes. */
  private readonly moveGroups = new Map<GizmoAxis, THREE.Group>();
  private readonly picker = new THREE.Raycaster();
  private readonly size: number;
  private readonly ringRadius: number;

  private attachedUuid: string | null = null;
  private drag: DragState | null = null;

  constructor(options: TransformGizmoOptions) {
    this.manager = options.manager;
    this.onTransformCommitted = options.onTransformCommitted;
    this.clampMoveDelta = options.clampMoveDelta;
    this.size = options.size ?? 1.4;
    this.ringRadius = options.ringRadius ?? 0.55;

    this.root = new THREE.Group();
    this.root.name = 'transform-gizmo';
    this.root.userData[DEBUG_HELPER_KEY] = true;
    this.root.visible = false;
    this.root.renderOrder = 1000;

    for (const axis of ['x', 'y', 'z'] as const) {
      this.buildMoveHandle(axis);
      this.buildRotateHandle(axis);
    }
  }

  // -------------------------------------------------- construction ----

  private tag<T extends THREE.Object3D>(node: T, handle?: GizmoHandleId): T {
    node.userData[DEBUG_HELPER_KEY] = true;
    if (handle) node.userData.gizmoHandle = handle;
    return node;
  }

  private overlayMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
    });
  }

  private buildMoveHandle(axis: GizmoAxis): void {
    const handle: GizmoHandleId = `move:${axis}`;
    const color = AXIS_COLORS[axis];
    const len = this.size;

    // Shaft: cylinder along the axis.
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, len, 8),
      this.overlayMaterial(color, 0.95),
    );
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.2, 12),
      this.overlayMaterial(color, 0.95),
    );

    // Fat invisible(ish) hit proxy so thin arms are easy to grab. Kept as
    // small as grab-ability allows (0.07): the proxies are transparent but
    // still raycastable, so every extra centimetre of radius silently steals
    // clicks from managed objects behind them (see pickHandleHit).
    const proxy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, len + 0.2, 8),
      this.overlayMaterial(color, 0),
    );

    const group = new THREE.Group();
    group.add(this.tag(shaft), this.tag(tip), this.tag(proxy, handle));

    if (axis === 'x') {
      shaft.rotation.z = -Math.PI / 2; shaft.position.x = len / 2;
      tip.rotation.z = -Math.PI / 2; tip.position.x = len + 0.1;
      proxy.rotation.z = -Math.PI / 2; proxy.position.x = len / 2;
    } else if (axis === 'y') {
      shaft.position.y = len / 2;
      tip.position.y = len + 0.1;
      proxy.position.y = len / 2;
    } else {
      shaft.rotation.x = Math.PI / 2; shaft.position.z = len / 2;
      tip.rotation.x = Math.PI / 2; tip.position.z = len + 0.1;
      proxy.rotation.x = Math.PI / 2; proxy.position.z = len / 2;
    }
    shaft.renderOrder = tip.renderOrder = 1000;
    this.root.add(this.tag(group));
    this.proxies.set(handle, proxy);
    this.moveGroups.set(axis, group);
  }

  private buildRotateHandle(axis: GizmoAxis): void {
    const handle: GizmoHandleId = `rotate:${axis}`;
    const color = AXIS_COLORS[axis];
    const r = this.ringRadius;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.018, 8, 64),
      this.overlayMaterial(color, 0.9),
    );
    const proxy = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.08, 8, 64),
      this.overlayMaterial(color, 0),
    );

    // TorusGeometry lies in the XY plane (normal +Z); orient per axis.
    if (axis === 'x') { ring.rotation.y = Math.PI / 2; proxy.rotation.y = Math.PI / 2; }
    else if (axis === 'y') { ring.rotation.x = Math.PI / 2; proxy.rotation.x = Math.PI / 2; }
    ring.renderOrder = 1000;

    this.root.add(this.tag(ring), this.tag(proxy, handle));
    this.proxies.set(handle, proxy);
  }

  // -------------------------------------------------- state sync ------

  /** Currently attached object uuid, or null when the gizmo is hidden. */
  getAttachedUuid(): string | null { return this.attachedUuid; }
  isDragging(): boolean { return this.drag !== null; }
  getActiveHandle(): GizmoHandleId | null { return this.drag?.handle ?? null; }

  /** Inspection/test access to a move-handle group (kept world-aligned). */
  getMoveHandleGroup(axis: GizmoAxis): THREE.Group | undefined {
    return this.moveGroups.get(axis);
  }

  /**
   * Per-frame sync. Shows the gizmo ONLY when edit mode is active AND an
   * editable object is selected; rides the object's position + rotation.
   */
  sync(editMode: boolean, selectedUuid: string | null): void {
    const definition = editMode && selectedUuid ? this.manager.getObject(selectedUuid) : undefined;
    if (!definition || definition.metadata.editable === false) {
      if (this.drag) this.endDrag();
      this.attachedUuid = null;
      this.root.visible = false;
      return;
    }
    this.attachedUuid = definition.uuid;
    this.root.visible = true;
    const t = definition.transform;
    this.root.position.set(t.position.x, t.position.y, t.position.z);
    this.root.quaternion.setFromEuler(
      new THREE.Euler(t.rotation.x * DEG2RAD, t.rotation.y * DEG2RAD, t.rotation.z * DEG2RAD, 'XYZ'),
    );
    // Move arms ride the object's POSITION but not its rotation: they are
    // counter-rotated so they always render along the world X/Y/Z axes the
    // move drags actually travel on. The rotation rings keep the local axes.
    const inverse = this.root.quaternion.clone().invert();
    for (const group of this.moveGroups.values()) group.quaternion.copy(inverse);
  }

  // -------------------------------------------------- picking ---------

  /** Map a pointer ray to a gizmo handle. Null when hidden or missing. */
  pickHandle(ray: THREE.Ray): GizmoHandleId | null {
    return this.pickHandleHit(ray)?.handle ?? null;
  }

  /**
   * Map a pointer ray to a gizmo handle WITH the ray-hit distance so the
   * host can arbitrate against managed-object hits.
   *
   * Why the distance matters: the hit proxies are transparent (opacity 0)
   * but still raycastable. A click whose ray passes through a proxy volume
   * must NOT silently start a drag when the user actually aimed at a managed
   * object in front of the handle (the old behaviour made selection appear
   * dead whenever the gizmo happened to float near the click line — worst
   * for big objects whose origin sits far from their visible geometry).
   * The host compares this distance with the closest managed hit and only
   * then decides drag-vs-select (see the editor wiring in playable-map).
   */
  pickHandleHit(ray: THREE.Ray): { handle: GizmoHandleId; distance: number } | null {
    if (!this.root.visible || !this.attachedUuid) return null;
    this.root.updateMatrixWorld(true);
    this.picker.ray.copy(ray);
    this.picker.far = Infinity;
    const proxies = [...this.proxies.values()];
    const hit = this.picker.intersectObjects(proxies, false)[0];
    if (!hit) return null;
    const handle = (hit.object.userData.gizmoHandle as GizmoHandleId) ?? null;
    if (!handle) return null;
    return { handle, distance: hit.distance };
  }

  // -------------------------------------------------- dragging --------

  private objectQuaternion(rotation: Vec3): THREE.Quaternion {
    return new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation.x * DEG2RAD, rotation.y * DEG2RAD, rotation.z * DEG2RAD, 'XYZ'),
    );
  }

  private worldAxisDir(rotation: Vec3, axis: GizmoAxis): Vec3 {
    const local = AXIS_VECTORS[axis];
    const out = new THREE.Vector3(local.x, local.y, local.z)
      .applyQuaternion(this.objectQuaternion(rotation));
    return { x: out.x, y: out.y, z: out.z };
  }

  /**
   * Start dragging a handle with the given pointer ray.
   * Freezes the drag frame (axis line / ring plane) at the current transform.
   */
  beginDrag(handle: GizmoHandleId, ray: THREE.Ray): boolean {
    if (this.drag || !this.attachedUuid) return false;
    const definition = this.manager.getObject(this.attachedUuid);
    if (!definition || definition.metadata.editable === false) return false;

    const uuid = definition.uuid;
    const position = { ...definition.transform.position };
    const rotation = { ...definition.transform.rotation };
    const rayOrigin = { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z };
    const rayDir = { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z };

    if (handle.startsWith('move:')) {
      const axis = handle.slice(5) as GizmoAxis;
      // Move along the WORLD axis named by the handle — NEVER along the
      // object's rotated local axis or its bounding box — so dragging X
      // changes only position.x regardless of the object's rotation.
      const axisDir = AXIS_VECTORS[axis];
      const startParam = closestAxisParamFromRay(position, axisDir, rayOrigin, rayDir);
      if (startParam === null) return false;
      this.drag = {
        uuid, handle, kind: 'move', axis, startPosition: position, startRotation: rotation,
        axisDir, startParam, planeCenter: position, planeNormal: AXIS_VECTORS[axis], lastAngle: 0,
      };
      return true;
    }

    const axis = handle.slice(7) as GizmoAxis;
    const planeNormal = this.worldAxisDir(rotation, axis);
    const lastAngle = rayAngleAroundAxis(position, planeNormal, rayOrigin, rayDir);
    if (lastAngle === null) return false;
    this.drag = {
      uuid, handle, kind: 'rotate', axis, startPosition: position, startRotation: rotation,
      axisDir: AXIS_VECTORS[axis], startParam: 0,
      planeCenter: position, planeNormal, lastAngle,
    };
    return true;
  }

  /**
   * Continue the drag with a new pointer ray. Applies the continuous
   * position/rotation delta through SceneStateManager.updateObjectTransform().
   */
  updateDrag(ray: THREE.Ray): void {
    const drag = this.drag;
    if (!drag) return;
    const definition = this.manager.getObject(drag.uuid);
    if (!definition || definition.metadata.editable === false) { this.endDrag(); return; }

    const rayOrigin = { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z };
    const rayDir = { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z };

    if (drag.kind === 'move') {
      const param = closestAxisParamFromRay(drag.startPosition, drag.axisDir, rayOrigin, rayDir);
      if (param === null) return;
      // Target measured along the world axis from the drag-start position;
      // the step is measured from wherever the object CURRENTLY is, so a
      // clamped drag stays pinned at the boundary yet releases instantly
      // when the pointer moves back.
      const targetAlong = drag.startPosition[drag.axis] + (param - drag.startParam);
      const current = definition.transform.position;
      let step = targetAlong - current[drag.axis];
      if (step === 0) return;
      if (this.clampMoveDelta) step = this.clampMoveDelta(drag.uuid, drag.axis, step);
      if (step === 0) return;
      const position = { x: current.x, y: current.y, z: current.z };
      position[drag.axis] = current[drag.axis] + step;
      this.manager.updateObjectTransform(drag.uuid, { position });
      return;
    }

    const angle = rayAngleAroundAxis(drag.planeCenter, drag.planeNormal, rayOrigin, rayDir);
    if (angle === null) return;
    const deltaDeg = wrapAngle(angle - drag.lastAngle) * RAD2DEG;
    drag.lastAngle = angle;
    if (deltaDeg === 0) return;
    const rotation = applyLocalRotationDegrees(definition.transform.rotation, drag.axis, deltaDeg);
    this.manager.updateObjectTransform(drag.uuid, { rotation });
  }

  /** Finish the drag (pointerup). Fires the commit callback exactly once. */
  endDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    this.onTransformCommitted?.(drag.uuid);
  }
}
