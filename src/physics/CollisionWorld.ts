import type { ObjectDefinition, ObjectMetadata, Vec3 } from '../core/types.js';

export interface PlayerCollisionResult {
  position: Vec3;
  grounded: boolean;
  blockedX: boolean;
  blockedY: boolean;
  blockedZ: boolean;
}
export interface CollisionWorldOptions { floorY?: number; }
export interface CollisionBounds { uuid: string; min: Vec3; max: Vec3; }
type DefinitionSource = readonly Readonly<ObjectDefinition>[] | (() => readonly Readonly<ObjectDefinition>[]);
const EPSILON = 1e-6;
function abs(value: number): number { return Math.abs(value); }
function normalizeDegrees(degrees: number): number { const wrapped = ((degrees % 360) + 360) % 360; return wrapped > 180 ? wrapped - 360 : wrapped; }
function isColliderEnabled(metadata: ObjectMetadata, assetType: ObjectDefinition['assetType']): boolean {
  if (assetType === 'ground') return false;
  if (metadata.collider === false) return false;
  if (metadata.collider && typeof metadata.collider === 'object' && 'enabled' in metadata.collider) return metadata.collider.enabled !== false;
  return true;
}

/** Lightweight reusable AABB collision world. Y-rotated boxes use conservative containing AABBs. */
export class CollisionWorld {
  private readonly definitions: () => readonly Readonly<ObjectDefinition>[];
  private readonly floorY: number;
  constructor(definitions: DefinitionSource, optionsOrFloorY: CollisionWorldOptions | number = 0) {
    this.definitions = typeof definitions === 'function' ? definitions : () => definitions;
    this.floorY = typeof optionsOrFloorY === 'number' ? optionsOrFloorY : (optionsOrFloorY.floorY ?? 0);
  }
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
    const out: CollisionBounds[] = [];
    for (const definition of this.definitions()) if (isColliderEnabled(definition.metadata, definition.assetType)) out.push(this.toCollisionBounds(definition));
    return Object.freeze(out);
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
  private toCollisionBounds(definition: Readonly<ObjectDefinition>): CollisionBounds {
    const { position, rotation, scale } = definition.transform;
    const halfY = abs(scale.y) * 0.5; const halfX = abs(scale.x) * 0.5; const halfZ = abs(scale.z) * 0.5;
    const yaw = (normalizeDegrees(rotation.y) * Math.PI) / 180; const cos = abs(Math.cos(yaw)); const sin = abs(Math.sin(yaw));
    const extentX = cos * halfX + sin * halfZ; const extentZ = sin * halfX + cos * halfZ;
    return { uuid: definition.uuid, min: { x: position.x - extentX, y: position.y - halfY, z: position.z - extentZ }, max: { x: position.x + extentX, y: position.y + halfY, z: position.z + extentZ } };
  }
}
