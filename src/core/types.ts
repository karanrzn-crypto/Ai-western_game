/**
 * src/core/types.ts
 * -----------------------------------------------------------------------------
 * Canonical type definitions for the Ai-western_game scene registry.
 *
 * Every object in the 3D scene MUST conform to `ObjectDefinition` below.
 * These types are the single source of truth — the SceneStateManager,
 * PersistenceManager and renderer adapters all reference them.
 * -----------------------------------------------------------------------------
 */

/** A 3-component vector (position, rotation in degrees, or scale). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Transform payload applied to (or read from) a scene object. */
export interface Transform {
  position: Vec3;
  rotation: Vec3; // Euler angles in degrees for human readability
  scale: Vec3;
}

/**
 * Asset type discriminator.
 * Open-ended union — extend as new asset categories are introduced
 * (e.g. "door", "barrel", "horse", "npc"). Do NOT use a raw string.
 */
export type AssetType =
  | 'wall'
  | 'chair'
  | 'prop'
  | 'door'
  | 'barrel'
  | 'table'
  | 'npc'
  | 'light'
  | 'ground'
  | 'cube'
  | (string & {}); // allow forward-compat for unknown types

/**
 * Per-object metadata. `name` is required; the rest is open-ended
 * so engine-specific or game-specific data can be attached without
 * breaking the registry schema.
 */
export interface ObjectMetadata {
  name: string;
  [key: string]: unknown;
}

/**
 * Canonical object definition stored in the registry.
 * This is the EXACT shape persisted to JSON via exportSceneToJSON().
 */
export interface ObjectDefinition {
  uuid: string;
  assetType: AssetType;
  transform: Transform;
  metadata: ObjectMetadata;
}

/**
 * A partial transform used by updateObjectTransform().
 * Any omitted component preserves the existing value.
 */
export type PartialTransform = DeepPartial<Transform>;

/** Recursive partial helper. */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** A partial object definition used when patching an existing object. */
export type PartialObjectDefinition = DeepPartial<Omit<ObjectDefinition, 'uuid'>>;

/**
 * Top-level scene file format written by exportSceneToJSON().
 * `version` allows future migrations inside loadSceneFromJSON().
 */
export interface SceneData {
  version: 1;
  exportedAt: string; // ISO 8601 timestamp
  objects: ObjectDefinition[];
  sceneMetadata?: {
    name?: string;
    description?: string;
    [key: string]: unknown;
  };
}

/** Default transform used when a new object omits transform data. */
export const DEFAULT_TRANSFORM: Readonly<Transform> = Object.freeze({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

/** Factory for an empty metadata block. */
export function emptyMetadata(name = 'Unnamed'): ObjectMetadata {
  return { name };
}
