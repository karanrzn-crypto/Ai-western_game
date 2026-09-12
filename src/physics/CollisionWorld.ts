import type { ObjectDefinition, Vec3 } from '../core/types.js';

export interface PlayerCollisionResult {
  position: Vec3;
  grounded: boolean;
  blockedX: boolean;
  blockedZ: boolean;
}

/**
 * Lightweight axis-aligned collision world for the foundation player.
 * Static scene objects opt into collision unless metadata.collider === false.
 * Cube-like objects are represented by their world-space AABB; this keeps the
 * foundation deterministic and gives future buildings a reusable collision path.
 */
export class CollisionWorld {
  private readonly definitions: () => readonly ObjectDefinition[];
  private readonly floorY: number;

  constructor(definitions: () => readonly ObjectDefinition[], floorY = 0) {
    this.definitions = definitions;
    this.floorY = floorY;
  }

  movePlayer(
    position: Vec3,
    delta: Vec3,
    radius = 0.35,
    height = 1.7,
  ): PlayerCollisionResult {
    const next: Vec3 = { ...position };
    let blockedX = false;
    let blockedZ = false;

    next.x += delta.x;
    if (this.intersectsSolid(next, radius, height)) {
      next.x = position.x;
      blockedX = true;
    }

    next.z += delta.z;
    if (this.intersectsSolid(next, radius, height)) {
      next.z = position.z;
      blockedZ = true;
    }

    // Apply the requested vertical movement, then clamp to the floor.
    // The foundation player is a vertical capsule approximation; gravity
    // is supplied by the caller as delta.y, and collision resolves the
    // feet against the floor.
    next.y += delta.y;
    const feetY = next.y - height;
    if (feetY < this.floorY) next.y = this.floorY + height;

    return {
      position: next,
      grounded: Math.abs(next.y - (this.floorY + height)) < 1e-4,
      blockedX,
      blockedZ,
    };
  }

  private intersectsSolid(position: Vec3, radius: number, height: number): boolean {
    const feet = position.y - height;
    const head = position.y;

    for (const definition of this.definitions()) {
      if (definition.assetType === 'ground') continue;
      if (definition.metadata.collider === false) continue;
      if (definition.metadata.mapBoundary === false && definition.metadata.collider !== true && definition.assetType !== 'cube' && definition.assetType !== 'wall') continue;

      const p = definition.transform.position;
      const s = definition.transform.scale;
      const halfX = Math.abs(s.x) * 0.5;
      const halfZ = Math.abs(s.z) * 0.5;
      const minY = p.y - Math.abs(s.y) * 0.5;
      const maxY = p.y + Math.abs(s.y) * 0.5;

      if (head <= minY || feet >= maxY) continue;

      const closestX = Math.max(p.x - halfX, Math.min(position.x, p.x + halfX));
      const closestZ = Math.max(p.z - halfZ, Math.min(position.z, p.z + halfZ));
      const dx = position.x - closestX;
      const dz = position.z - closestZ;

      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }
}
