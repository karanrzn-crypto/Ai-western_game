/**
 * Spawn helpers — safe respawn point selection against the CollisionWorld.
 */
import type { Vec3 } from '../core/types.js';
import type { CollisionWorld } from '../physics/CollisionWorld.js';

export interface SpawnProbeOptions {
  radius?: number;
  height?: number;
  /** Candidate positions tried in order; each may be nudged automatically. */
  candidates: readonly Vec3[];
  /** Extra ring offsets (m) attempted around each candidate. */
  nudges?: readonly Vec3[];
}

const DEFAULT_NUDGES: readonly Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 0.8, y: 0, z: 0 },
  { x: -0.8, y: 0, z: 0 },
  { x: 0, y: 0, z: 0.8 },
  { x: 0, y: 0, z: -0.8 },
  { x: 1.6, y: 0, z: 1.6 },
  { x: -1.6, y: 0, z: -1.6 },
];

/**
 * Returns the first candidate (plus nudge offsets) where the player fits:
 * not intersecting any collider and grounded after settling. Falls back to
 * the first candidate when nothing validates (best effort).
 */
export function findSafeSpawnPosition(
  collisionWorld: CollisionWorld,
  options: SpawnProbeOptions,
): Vec3 {
  const radius = options.radius ?? 0.35;
  const height = options.height ?? 1.7;
  const nudges = options.nudges ?? DEFAULT_NUDGES;
  const bounds = collisionWorld.getCollisionBounds();
  const intersectsWorld = (probe: Vec3): boolean => {
    const feetY = probe.y - height;
    for (const b of bounds) {
      const overlapX = probe.x + radius > b.min.x && probe.x - radius < b.max.x;
      const overlapZ = probe.z + radius > b.min.z && probe.z - radius < b.max.z;
      const overlapY = feetY < b.max.y && probe.y > b.min.y;
      if (overlapX && overlapZ && overlapY) return true;
    }
    return false;
  };
  let fallback = options.candidates[0] ?? { x: 0, y: height, z: 0 };
  for (const candidate of options.candidates) {
    for (const nudge of nudges) {
      const probe: Vec3 = { x: candidate.x + nudge.x, y: candidate.y + 0.05, z: candidate.z + nudge.z };
      if (intersectsWorld(probe)) continue;
      const settled = collisionWorld.movePlayer(probe, { x: 0, y: -0.2, z: 0 }, radius, height);
      if (!settled.grounded) continue;
      const stable = collisionWorld.movePlayer(settled.position, { x: 0, y: 0, z: 0 }, radius, height);
      if (stable.blockedX || stable.blockedY || stable.blockedZ) continue;
      return settled.position;
    }
  }
  return fallback;
}
