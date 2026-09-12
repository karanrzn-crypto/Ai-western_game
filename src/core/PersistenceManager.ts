/**
 * src/core/PersistenceManager.ts
 * -----------------------------------------------------------------------------
 * Persistence layer for SceneStateManager.
 *
 * Implements exportSceneToJSON() and loadSceneFromJSON(data) per the
 * system directive. This layer is intentionally renderer-agnostic — it
 * serializes registry state into a portable JSON file and restores it
 * later (possibly in a different session/runtime).
 *
 * Cross-session uuid persistence is preserved by storing and replaying
 * the exact uuid values from the source JSON.
 * -----------------------------------------------------------------------------
 */

import type { SceneData, ObjectDefinition } from './types.js';
import type { SceneStateManager } from './SceneStateManager.js';
import { isValidUUID } from '../utils/uuid.js';

export interface PersistenceManagerOptions {
  /** Scene-level metadata stamped onto exports. */
  defaultSceneMetadata?: SceneData['sceneMetadata'];
}

export class PersistenceManager {
  /** Constant schema version for exports. Bump in migrations. */
  static readonly SCENE_SCHEMA_VERSION = 1 as const;

  private readonly defaultSceneMetadata?: SceneData['sceneMetadata'];

  constructor(options: PersistenceManagerOptions = {}) {
    this.defaultSceneMetadata = options.defaultSceneMetadata;
  }

  /**
   * exportSceneToJSON() — produce a portable JSON-serializable scene dump.
   * The return value is a plain object; callers can `JSON.stringify()` it
   * for storage or transmission.
   *
   * @param manager   the live SceneStateManager to dump
   * @param overrides optional scene-level metadata to embed
   */
  exportSceneToJSON(
    manager: SceneStateManager,
    overrides?: SceneData['sceneMetadata'],
  ): SceneData {
    const objects = manager
      .getAllObjects()
      .map((def) => this.serializeDefinition(def));
    return {
      version: PersistenceManager.SCENE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      objects,
      sceneMetadata: { ...this.defaultSceneMetadata, ...overrides },
    };
  }

  /**
   * loadSceneFromJSON(data) — restore a scene dump into the given manager.
   * Behavior:
   *   - Clears the existing registry first.
   *   - Re-registers every object preserving its original uuid.
   *   - Skips malformed entries (logged to console) rather than aborting
   *     the entire load, so a partial scene still comes up.
   *
   * @returns a summary describing what was loaded.
   */
  loadSceneFromJSON(
    data: unknown,
    manager: SceneStateManager,
  ): LoadSummary {
    const parsed = this.validate(data);
    manager.clear();
    let loaded = 0;
    const skipped: Array<{ uuid?: string; reason: string }> = [];
    for (const raw of parsed.objects) {
      try {
        const def = this.deserializeDefinition(raw);
        // registerObject will throw if uuid is malformed or duplicate.
        manager.registerObject(def);
        loaded++;
      } catch (err) {
        skipped.push({
          uuid: typeof raw?.uuid === 'string' ? raw.uuid : undefined,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      loaded,
      skipped,
      schemaVersion: parsed.version,
      exportedAt: parsed.exportedAt,
    };
  }

  /** Convert a registry-frozen definition into a plain-JSON-friendly object. */
  private serializeDefinition(def: ObjectDefinition): ObjectDefinition {
    return {
      uuid: def.uuid,
      assetType: def.assetType,
      transform: {
        position: { ...def.transform.position },
        rotation: { ...def.transform.rotation },
        scale: { ...def.transform.scale },
      },
      metadata: { ...def.metadata },
    };
  }

  /** Convert a raw JSON object back into a validated ObjectDefinition. */
  private deserializeDefinition(raw: unknown): ObjectDefinition {
    if (!raw || typeof raw !== 'object') {
      throw new Error('definition is not an object');
    }
    const r = raw as Record<string, unknown>;
    const uuid = r.uuid;
    if (typeof uuid !== 'string' || !isValidUUID(uuid)) {
      throw new Error(`invalid uuid: ${String(uuid)}`);
    }
    const assetType = r.assetType;
    if (typeof assetType !== 'string' || assetType.length === 0) {
      throw new Error(`invalid assetType for ${uuid}`);
    }
    const transform = this.parseTransform(r.transform, uuid);
    const metadata = this.parseMetadata(r.metadata, uuid);
    return {
      uuid,
      assetType: assetType as ObjectDefinition['assetType'],
      transform,
      metadata,
    };
  }

  private parseTransform(
    raw: unknown,
    uuid: string,
  ): ObjectDefinition['transform'] {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`object ${uuid}: transform missing`);
    }
    const t = raw as Record<string, unknown>;
    return {
      position: this.parseVec3(t.position, `${uuid}.transform.position`),
      rotation: this.parseVec3(t.rotation, `${uuid}.transform.rotation`),
      scale: this.parseVec3(t.scale, `${uuid}.transform.scale`),
    };
  }

  private parseVec3(raw: unknown, ctx: string): { x: number; y: number; z: number } {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`${ctx}: expected {x,y,z} object`);
    }
    const v = raw as Record<string, unknown>;
    const out = { x: 0, y: 0, z: 0 };
    for (const axis of ['x', 'y', 'z'] as const) {
      const n = v[axis];
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        throw new Error(`${ctx}.${axis}: expected finite number, got ${String(n)}`);
      }
      out[axis] = n;
    }
    return out;
  }

  private parseMetadata(
    raw: unknown,
    uuid: string,
  ): ObjectDefinition['metadata'] {
    if (!raw || typeof raw !== 'object') {
      return { name: 'Unnamed' };
    }
    const m = raw as Record<string, unknown>;
    if (typeof m.name !== 'string' || m.name.length === 0) {
      throw new Error(`object ${uuid}: metadata.name required and must be non-empty string`);
    }
    const out: ObjectDefinition['metadata'] = { ...m, name: m.name } as ObjectDefinition['metadata'];
    return out;
  }

  /** Validate the top-level SceneData envelope. */
  private validate(data: unknown): SceneData {
    if (!data || typeof data !== 'object') {
      throw new Error('scene data is not an object');
    }
    const d = data as Record<string, unknown>;
    if (d.version !== PersistenceManager.SCENE_SCHEMA_VERSION) {
      throw new Error(
        `unsupported scene schema version: ${String(d.version)} (expected ${PersistenceManager.SCENE_SCHEMA_VERSION})`,
      );
    }
    if (!Array.isArray(d.objects)) {
      throw new Error('scene data.objects must be an array');
    }
    if (typeof d.exportedAt !== 'string') {
      throw new Error('scene data.exportedAt must be an ISO timestamp string');
    }
    return d as unknown as SceneData;
  }
}

export interface LoadSummary {
  loaded: number;
  skipped: Array<{ uuid?: string; reason: string }>;
  schemaVersion: number;
  exportedAt: string;
}
