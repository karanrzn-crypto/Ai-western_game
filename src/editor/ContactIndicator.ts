/**
 * src/editor/ContactIndicator.ts
 * -----------------------------------------------------------------------------
 * Edit-mode "flush contact" indicator.
 *
 * While the SELECTED object is being moved (gizmo drag, keyboard, panel
 * numbers) and one of its faces gets flush with another object's face — or
 * with the ground — a small ring marker appears BETWEEN the two facing
 * surfaces, marking that the two are touching.
 *
 * Detection is SURFACE-based, not center-based: the world-space bounds
 * (AABBs) of both objects are compared, and a contact counts only when
 *   - the surface separation along ONE axis is within `epsilon` (a gap or a
 *     slight overlap — both read as "flush" while dragging), and
 *   - the two boxes genuinely overlap on the other two axes by at least
 *     `minOverlap` (so near-corner grazes never fire),
 * with the most flush axis (smallest |gap|) winning when several qualify.
 * The marker sits at the midpoint between the two facing surfaces, centered
 * on their mutual overlap region — for the ground that is exactly the
 * object's own footprint.
 *
 * Separation guarantees (same contract as DebugAxes / TransformGizmo):
 *   - NEVER registered in SceneStateManager -> never saved to scene JSON,
 *     never a collider, never returned by getActiveUUIDs() and therefore
 *     never a raycast candidate for object selection.
 *   - Every node carries the shared debug-helper tag (isDebugHelper()).
 *   - Purely visual: no snapping, no auto-move — it only REPORTS contact.
 *   - update() is meant to be called every frame; that is what makes gizmo
 *     drags update the contact state live and hide the marker the instant
 *     the surfaces separate again.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../core/types.js';
import { DEBUG_HELPER_KEY, isDebugHelper } from './DebugAxes.js';

/** Max surface separation (world units) that still counts as "flush". */
export const DEFAULT_CONTACT_EPSILON = 0.08;
/** Min overlap (world units) required on the two non-contact axes. */
export const DEFAULT_MIN_FACE_OVERLAP = 0.05;

export type ContactAxis = 'x' | 'y' | 'z';

export interface BoxContact {
  /** Axis along which the two surfaces face each other. */
  axis: ContactAxis;
  /** Unit vector pointing from the selected box toward the other box. */
  normal: THREE.Vector3;
  /** Midpoint between the two facing surfaces, centered on their overlap. */
  point: THREE.Vector3;
  /** Signed surface separation along `axis` (0 = touching, <0 = slight overlap). */
  gap: number;
  /** Smallest overlap extent on the two non-contact axes. */
  overlap: number;
}

const OTHER_AXES: Record<ContactAxis, readonly [ContactAxis, ContactAxis]> = {
  x: ['y', 'z'],
  y: ['x', 'z'],
  z: ['x', 'y'],
};

const AXIS_NORMALS: Record<ContactAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

function getComponent(v: THREE.Vector3Like, axis: ContactAxis): number {
  return axis === 'x' ? v.x : axis === 'y' ? v.y : v.z;
}

function setComponent(v: THREE.Vector3, axis: ContactAxis, value: number): void {
  if (axis === 'x') v.x = value;
  else if (axis === 'y') v.y = value;
  else v.z = value;
}

/**
 * Detect face-to-face ("flush") contact between two world-space bounds.
 *
 * Returns the most flush contact (smallest |gap|) or null when the boxes are
 * separated beyond `epsilon`, only graze each other near a corner/edge
 * (overlap < `minOverlap` on some axis), or interpenetrate deeply (all three
 * axes overlap — merged, not touching).
 */
export function computeBoxContact(
  selected: THREE.Box3,
  other: THREE.Box3,
  epsilon: number = DEFAULT_CONTACT_EPSILON,
  minOverlap: number = DEFAULT_MIN_FACE_OVERLAP,
): BoxContact | null {
  let best: BoxContact | null = null;

  for (const axis of ['x', 'y', 'z'] as const) {
    const selMin = getComponent(selected.min, axis);
    const selMax = getComponent(selected.max, axis);
    const othMin = getComponent(other.min, axis);
    const othMax = getComponent(other.max, axis);

    // Two ways the boxes can face each other along `axis`:
    //   sign +1: selected on the negative side, other in the + direction.
    //   sign -1: selected on the positive side, other in the - direction.
    // gap 0 = exactly touching; slightly negative = surfaces crossed.
    const facings = [
      { gap: othMin - selMax, sign: 1 as const, faceA: selMax, faceB: othMin },
      { gap: selMin - othMax, sign: -1 as const, faceA: selMin, faceB: othMax },
    ];

    for (const facing of facings) {
      if (facing.gap < -epsilon || facing.gap > epsilon) continue;

      const [b1, b2] = OTHER_AXES[axis];
      const lo1 = Math.max(getComponent(selected.min, b1), getComponent(other.min, b1));
      const hi1 = Math.min(getComponent(selected.max, b1), getComponent(other.max, b1));
      const lo2 = Math.max(getComponent(selected.min, b2), getComponent(other.min, b2));
      const hi2 = Math.min(getComponent(selected.max, b2), getComponent(other.max, b2));
      const overlap = Math.min(hi1 - lo1, hi2 - lo2);
      if (overlap < minOverlap) continue; // corner/edge graze, not a face contact

      const point = new THREE.Vector3();
      setComponent(point, axis, (facing.faceA + facing.faceB) / 2); // between the two surfaces
      setComponent(point, b1, (lo1 + hi1) / 2); // centered on the overlap region
      setComponent(point, b2, (lo2 + hi2) / 2);

      const contact: BoxContact = {
        axis,
        normal: AXIS_NORMALS[axis].clone().multiplyScalar(facing.sign),
        point,
        gap: facing.gap,
        overlap,
      };
      if (!best || Math.abs(contact.gap) < Math.abs(best.gap)) best = contact;
    }
  }

  return best;
}

export interface ContactIndicatorOptions {
  /** Max surface separation that still counts as flush. Default 0.08. */
  epsilon?: number;
  /** Min overlap required on the two non-contact axes. Default 0.05. */
  minOverlap?: number;
  /** Marker color. Default amber 0xffd166 (matches the selection box). */
  color?: number;
}

/**
 * Minimal manager surface the indicator needs. Structural on purpose, so
 * SceneStateManager satisfies it directly and tests can pass plain stubs.
 */
export interface ContactIndicatorManagerLike {
  getObject(uuid: string): Readonly<ObjectDefinition> | undefined;
  getAllObjects(): readonly Readonly<ObjectDefinition>[];
}

export interface ContactIndicatorUpdateParams {
  editMode: boolean;
  selectedUuid: string | null;
  scene: THREE.Scene;
  manager: ContactIndicatorManagerLike;
}

/** Ring/Circle geometries face +Z by default; this is the "flat" direction. */
const RING_NORMAL = new THREE.Vector3(0, 0, 1);

export class ContactIndicator {
  /** The only node that enters the render scene. Never registered anywhere. */
  readonly group: THREE.Group;

  private readonly epsilon: number;
  private readonly minOverlap: number;
  private readonly selectedBox = new THREE.Box3();
  private readonly candidateBox = new THREE.Box3();

  constructor(options: ContactIndicatorOptions = {}) {
    this.epsilon = options.epsilon ?? DEFAULT_CONTACT_EPSILON;
    this.minOverlap = options.minOverlap ?? DEFAULT_MIN_FACE_OVERLAP;
    const color = options.color ?? 0xffd166;

    this.group = new THREE.Group();
    this.group.name = 'contact-indicator';
    this.group.userData[DEBUG_HELPER_KEY] = true;
    this.group.visible = false;

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Unit-size ring + center dot; place() scales the group so the marker
    // roughly matches the size of the touching faces.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 40), material);
    ring.renderOrder = 1000;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), material);
    dot.renderOrder = 1001;
    this.group.add(this.tag(ring), this.tag(dot));
  }

  private tag<T extends THREE.Object3D>(node: T): T {
    node.userData[DEBUG_HELPER_KEY] = true;
    return node;
  }

  /**
   * Per-frame update. Shows the marker ONLY while Edit Mode is active AND an
   * editable object is selected AND one of its faces is flush (within
   * epsilon) with another managed object or the ground. Hides the marker the
   * moment any of those stops holding. Call every frame — this is what makes
   * gizmo drags update the contact state live.
   */
  update(params: ContactIndicatorUpdateParams): void {
    if (!params.editMode || !params.selectedUuid) {
      this.group.visible = false;
      return;
    }
    const selected = params.scene.getObjectByProperty('uuid', params.selectedUuid);
    if (!selected || isDebugHelper(selected)) {
      this.group.visible = false;
      return;
    }
    const definition = params.manager.getObject(params.selectedUuid);
    if (!definition || definition.metadata.editable === false) {
      this.group.visible = false;
      return;
    }

    const selectedBox = this.selectedBox.setFromObject(selected);
    if (selectedBox.isEmpty()) {
      this.group.visible = false;
      return;
    }

    let best: BoxContact | null = null;
    for (const other of params.manager.getAllObjects()) {
      if (other.uuid === params.selectedUuid) continue;
      const mesh = params.scene.getObjectByProperty('uuid', other.uuid);
      if (!mesh || isDebugHelper(mesh)) continue;
      const otherBox = this.candidateBox.setFromObject(mesh);
      const contact = computeBoxContact(selectedBox, otherBox, this.epsilon, this.minOverlap);
      if (contact && (!best || Math.abs(contact.gap) < Math.abs(best.gap))) best = contact;
    }

    if (!best) {
      this.group.visible = false;
      return;
    }
    this.place(best);
  }

  /** Position/orient the marker between the two touching surfaces. */
  private place(contact: BoxContact): void {
    this.group.position.copy(contact.point);
    this.group.quaternion.setFromUnitVectors(RING_NORMAL, contact.normal);
    this.group.scale.setScalar(THREE.MathUtils.clamp(contact.overlap * 0.35, 0.1, 0.45));
    this.group.visible = true;
  }
}
