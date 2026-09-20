import type { ObjectDefinition, ObjectMetadata, Vec3 } from '../core/types.js';
import type { EventBus } from '../core/EventBus.js';

export interface PlayerCollisionResult {
  position: Vec3;
  grounded: boolean;
  blockedX: boolean;
  blockedY: boolean;
  blockedZ: boolean;
}
export interface CollisionWorldOptions { floorY?: number; /** Event bus used to invalidate the cached collision bounds. */ events?: EventBus; }
export interface CollisionBounds { uuid: string; min: Vec3; max: Vec3; }

/**
 * One EXACT collision box for a composite (multi-mesh) asset, in the def's
 * LOCAL space: `size` is the full box size, `offset` its center relative to
 * the def origin (before the def's yaw rotation AND scale). Composite assets
 * are built at real-world size while their transform scale stays (1,1,1) —
 * the default transform-derived AABB would then cover only a 1 m cube at the
 * anchor and leave the rest of the visual volume walk-through (the bar/gunshop
 * counters bug). Authored layouts state these boxes from the builder's real
 * dims, so collision == visual without any oversize.
 *
 * SCALE CONTRACT (do not break): the renderer adapter applies the def's
 * transform scale to the visual group, so CollisionWorld MUST apply the SAME
 * scale to these local boxes (size AND offset, per axis) — otherwise any
 * scaled def keeps scale-1 colliders and the player walks straight through
 * the visually enlarged walls (the reported scaled-houses bug).
 */
export interface ColliderLocalBox { size: Vec3; offset?: Vec3 }
type DefinitionSource = readonly Readonly<ObjectDefinition>[] | (() => readonly Readonly<ObjectDefinition>[]);
const EPSILON = 1e-6;
function abs(value: number): number { return Math.abs(value); }
function normalizeDegrees(degrees: number): number { const wrapped = ((degrees % 360) + 360) % 360; return wrapped > 180 ? wrapped - 360 : wrapped; }
function isColliderEnabled(metadata: ObjectMetadata, assetType: ObjectDefinition['assetType']): boolean {
  if (assetType === 'ground') return false;
  if (metadata.collider === false) return false;
  if (metadata.collider && typeof metadata.collider === 'object') {
    const c = metadata.collider as { enabled?: unknown; boxes?: unknown };
    // { boxes: [...] } without an explicit `enabled` key arms the collider —
    // listing boxes IS the intent to collide.
    if ('enabled' in c) return c.enabled !== false;
    if (Array.isArray(c.boxes) && c.boxes.length > 0) return true;
    return true;
  }
  return true;
}

/** The def's local collider boxes when the object form carries them. */
function localColliderBoxes(metadata: ObjectMetadata): readonly ColliderLocalBox[] | null {
  if (!metadata.collider || typeof metadata.collider !== 'object') return null;
  const boxes = (metadata.collider as { boxes?: unknown }).boxes;
  if (!Array.isArray(boxes) || boxes.length === 0) return null;
  return boxes as readonly ColliderLocalBox[];
}

/** Lightweight reusable AABB collision world. Y-rotated boxes use conservative containing AABBs. */
export class CollisionWorld {
  private readonly definitions: () => readonly Readonly<ObjectDefinition>[];
  private readonly floorY: number;
  /** Cached bounds — rebuilt only when the scene actually changes. */
  private cachedBounds: readonly CollisionBounds[] | null = null;
  private readonly unsubscribe?: () => void;

  constructor(definitions: DefinitionSource, optionsOrFloorY: CollisionWorldOptions | number = 0) {
    this.definitions = typeof definitions === 'function' ? definitions : () => definitions;
    const options = typeof optionsOrFloorY === 'number' ? {} : optionsOrFloorY;
    this.floorY = typeof optionsOrFloorY === 'number' ? optionsOrFloorY : (optionsOrFloorY.floorY ?? 0);
    // When an event bus is wired up, bounds are cached and invalidated on
    // every scene mutation. This removes the per-frame O(N) deep-clone that
    // definitions() (e.g. manager.getAllObjects()) otherwise causes.
    const bus = options.events;
    if (bus) {
      const invalidate = (): void => { this.cachedBounds = null; };
      const offs = [
        bus.on('object:registered', invalidate),
        bus.on('object:unregistered', invalidate),
        bus.on('object:transform-updated', invalidate),
        bus.on('object:metadata-updated', invalidate),
        bus.on('scene:cleared', invalidate),
        bus.on('scene:loaded', invalidate),
      ];
      this.unsubscribe = () => offs.forEach((off) => off());
    }
  }

  /** Detach from the event bus (when caching is enabled). */
  dispose(): void { this.unsubscribe?.(); }

  movePlayer(position: Vec3, delta: Vec3, radius = 0.35, height = 1.7): PlayerCollisionResult {
    const colliders = this.getCollisionBounds();
    const next: Vec3 = { ...position };
    let blockedX = false; let blockedY = false; let blockedZ = false;
    if (delta.x !== 0) {
      next.x += delta.x;
      const resolvedX = this.resolveHorizontalAxis('x', next, position, colliders, radius, height, delta.x);
      blockedX = resolvedX !== next.x; next.x = resolvedX;
    }
    if (delta.z !== 0) {
      next.z += delta.z;
      const resolvedZ = this.resolveHorizontalAxis('z', next, position, colliders, radius, height, delta.z);
      blockedZ = resolvedZ !== next.z; next.z = resolvedZ;
    }
    const vertical = this.resolveVertical(position, next, colliders, delta.y, radius, height);
    next.y = vertical.y; blockedY = vertical.blockedY;
    return { position: next, grounded: vertical.grounded, blockedX, blockedY, blockedZ };
  }
  getCollisionBounds(): readonly CollisionBounds[] {
    if (this.cachedBounds) return this.cachedBounds;
    const out: CollisionBounds[] = [];
    for (const definition of this.definitions()) {
      if (!isColliderEnabled(definition.metadata, definition.assetType)) continue;
      // A def with explicit local boxes contributes ONE bounds per box; the
      // legacy transform path contributes exactly one.
      for (const bounds of this.toCollisionBounds(definition)) out.push(bounds);
    }
    const frozen = Object.freeze(out);
    if (this.unsubscribe) this.cachedBounds = frozen;
    return frozen;
  }
  private resolveHorizontalAxis(axis: 'x' | 'z', candidate: Vec3, previous: Vec3, colliders: readonly CollisionBounds[], radius: number, height: number, movement: number): number {
    let resolved = axis === 'x' ? candidate.x : candidate.z;
    const feet = candidate.y - height; const head = candidate.y;
    for (const bounds of colliders) {
      if (head <= bounds.min.y + EPSILON || feet >= bounds.max.y - EPSILON) continue;
      const overlapsOtherAxis = axis === 'x'
        ? candidate.z + radius > bounds.min.z + EPSILON && candidate.z - radius < bounds.max.z - EPSILON
        : candidate.x + radius > bounds.min.x + EPSILON && candidate.x - radius < bounds.max.x - EPSILON;
      if (!overlapsOtherAxis) continue;
      const min = axis === 'x' ? bounds.min.x - radius : bounds.min.z - radius;
      const max = axis === 'x' ? bounds.max.x + radius : bounds.max.z + radius;
      if (resolved <= min || resolved >= max) continue;
      const previousAxis = axis === 'x' ? previous.x : previous.z;
      if (movement > 0 && previousAxis <= min + EPSILON) resolved = min;
      else if (movement < 0 && previousAxis >= max - EPSILON) resolved = max;
    }
    return resolved;
  }
  private resolveVertical(previous: Vec3, horizontalResolved: Vec3, colliders: readonly CollisionBounds[], deltaY: number, radius: number, height: number): { y: number; grounded: boolean; blockedY: boolean } {
    let nextY = previous.y + deltaY; let grounded = false; let blockedY = false;
    const currentFeet = previous.y - height; const targetFeet = nextY - height; const targetHead = nextY;
    let bestFloor = this.floorY;
    for (const bounds of colliders) {
      if (!this.overlapsHorizontal(horizontalResolved, radius, bounds)) continue;
      const top = bounds.max.y;
      if (currentFeet >= top - EPSILON && targetFeet <= top + EPSILON) bestFloor = Math.max(bestFloor, top);
    }
    if (targetFeet <= bestFloor + EPSILON) { nextY = bestFloor + height; grounded = true; blockedY = deltaY < 0; }
    if (deltaY > 0) {
      for (const bounds of colliders) {
        if (!this.overlapsHorizontal(horizontalResolved, radius, bounds)) continue;
        const underside = bounds.min.y;
        if (previous.y <= underside + EPSILON && targetHead >= underside - EPSILON) { nextY = Math.min(nextY, underside); blockedY = true; }
      }
    }
    return { y: nextY, grounded, blockedY };
  }
  private overlapsHorizontal(position: Vec3, radius: number, bounds: CollisionBounds): boolean {
    return position.x + radius > bounds.min.x + EPSILON && position.x - radius < bounds.max.x - EPSILON && position.z + radius > bounds.min.z + EPSILON && position.z - radius < bounds.max.z - EPSILON;
  }
  private toCollisionBounds(definition: Readonly<ObjectDefinition>): CollisionBounds[] {
    const { position, rotation, scale } = definition.transform;
    const yaw = (normalizeDegrees(rotation.y) * Math.PI) / 180;
    // SIGNED trig for the center offset — it must match the renderer's
    // rotation.y exactly (three.js: x' = x·cosθ + z·sinθ, z' = −x·sinθ + z·cosθ).
    // The OLD code used |sin| here too, which MIRRORED every offset box to the
    // wrong side for negative yaw (e.g. the farmstead's shed collider landed
    // in empty field 6 m from the actual shed — an invisible wall the player
    // could not cross). |sin| stays ONLY for the conservative extents below.
    const cos = Math.cos(yaw); const sin = Math.sin(yaw);
    const acos = abs(cos); const asin = abs(sin);
    // Composite assets may carry EXACT local boxes (collider == visual).
    const boxes = localColliderBoxes(definition.metadata);
    if (boxes) {
      // One world AABB per local box: the center is the def position plus the
      // yaw-rotated, SCALED offset; the extents are the yaw-conservative size
      // extents (for yaw = 0/90/180/270 the box is EXACT — no growth).
      // SCALE: local boxes live in the def's local space and the def transform
      // scales that space — size AND offset scale per-axis first, or a scaled
      // def keeps scale-1 colliders and the visual walls become walk-through.
      return boxes.map((box) => {
        const off = box.offset ?? { x: 0, y: 0, z: 0 };
        const ox = off.x * scale.x; const oy = off.y * scale.y; const oz = off.z * scale.z;
        // THREE yaw (right-handed, +y up): x' = x·cos + z·sin, z' = −x·sin + z·cos.
        const cx = position.x + ox * cos + oz * sin;
        const cz = position.z - ox * sin + oz * cos;
        const halfX = abs(box.size.x * scale.x) * 0.5; const halfY = abs(box.size.y * scale.y) * 0.5; const halfZ = abs(box.size.z * scale.z) * 0.5;
        const extentX = acos * halfX + asin * halfZ; const extentZ = asin * halfX + acos * halfZ;
        return { uuid: definition.uuid, min: { x: cx - extentX, y: position.y + oy - halfY, z: cz - extentZ }, max: { x: cx + extentX, y: position.y + oy + halfY, z: cz + extentZ } };
      });
    }
    return [this.transformBounds(definition, position, scale, acos, asin)];
  }

  /** The legacy path: one conservative AABB from the transform itself. */
  private transformBounds(definition: Readonly<ObjectDefinition>, position: Vec3, scale: Vec3, cos: number, sin: number): CollisionBounds {
    const halfY = abs(scale.y) * 0.5; const halfX = abs(scale.x) * 0.5; const halfZ = abs(scale.z) * 0.5;
    const extentX = cos * halfX + sin * halfZ; const extentZ = sin * halfX + cos * halfZ;
    return { uuid: definition.uuid, min: { x: position.x - extentX, y: position.y - halfY, z: position.z - extentZ }, max: { x: position.x + extentX, y: position.y + halfY, z: position.z + extentZ } };
  }
}
