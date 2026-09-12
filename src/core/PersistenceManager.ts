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
 *
 * Scene loading lifecycle (per directive §8):
 *
 *     JSON → envelope validation → migration → per-object validation
 *         → (atomic) clear + commit → renderer sync (via manager)
 *
 * Failure modes:
 *   - Bad envelope (missing version / objects[] / exportedAt) → throws.
 *   - Unknown schema version with no migration path → throws.
 *   - Atomic mode (default): any malformed object → throws SceneLoadError
 *     WITHOUT mutating the target registry.
 *   - Lenient mode: malformed objects are skipped and reported in the
 *     returned LoadSummary.skipped[].
 * -----------------------------------------------------------------------------
 */

import type { SceneData, ObjectDefinition } from './types.js';
import type { SceneStateManager } from './SceneStateManager.js';
import { isValidUUID } from '../utils/uuid.js';
import { getSceneMigrations } from '../migrations/SceneMigrations.js';
import { getConfig } from '../config/GameConfig.js';
import { logger } from '../utils/Logger.js';

export interface PersistenceManagerOptions {
  /**
   * Override the migration registry. By default uses the global
   * scene-migration singleton bound to the schema version from config.
   */
  migrations?: typeof getSceneMigrations extends () => infer M ? M : never;
}

/** A single failed object during load. */
export interface SkippedEntry {
  uuid?: string;
  reason: string;
  index: number;
}

/** Result of a load operation. */
export interface LoadSummary {
  loaded: number;
  skipped: SkippedEntry[];
  schemaVersion: number;
  exportedAt: string;
}

/** Thrown in atomic mode when one or more objects fail validation. */
export class SceneLoadError extends Error {
  readonly skipped: SkippedEntry[];
  constructor(message: string, skipped: SkippedEntry[]) {
    super(message);
    this.name = 'SceneLoadError';
    this.skipped = skipped;
  }
}

export interface LoadOptions {
  /**
   * 'atomic' (default): any malformed entry aborts the whole load; the
   *   target registry is left untouched.
   * 'lenient': malformed entries are skipped and reported in the summary.
   */
  mode?: 'atomic' | 'lenient';
}

export class PersistenceManager {
  private readonly log = logger.child('persistence');
  // We import the MigrationRegistry type lazily to avoid a circular type
  // dependency; in practice the default singleton is fine.
  private readonly migrations?: ReturnType<typeof getSceneMigrations>;

  constructor(options: PersistenceManagerOptions = {}) {
    this.migrations = options.migrations ?? getSceneMigrations();
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
    const out: SceneData = {
      version: getConfig().schemaVersion,
      exportedAt: new Date().toISOString(),
      objects,
      sceneMetadata: overrides ? { ...overrides } : undefined,
    };
    manager.bus.emit('scene:exported', { count: objects.length });
    this.log.debug('scene exported', { count: objects.length });
    return out;
  }

  /**
   * loadSceneFromJSON(data, manager, options) — restore a scene dump.
   *
   * Flow:
   *   1. Validate envelope (version, objects[], exportedAt).
   *   2. If version != current schemaVersion, run migrations.
   *   3. Deserialize + validate every object into a temp list (no mutation).
   *   4. If atomic mode and any failure: throw SceneLoadError.
   *   5. Atomically: clear the manager, then commit every valid object.
   *   6. Renderer sync happens via the manager's per-register notification.
   *
   * @returns a summary of what was loaded (and what was skipped in lenient mode).
   */
  loadSceneFromJSON(
    data: unknown,
    manager: SceneStateManager,
    options: LoadOptions = {},
  ): LoadSummary {
    const mode = options.mode ?? 'atomic';

    // --- Step 1: envelope validation -------------------------------
    const validated = this.validateEnvelope(data);

    // --- Step 2: migration if needed ------------------------------
    let working: SceneData = validated;
    if (validated.version !== getConfig().schemaVersion) {
      if (!this.migrations) {
        throw new Error(
          `[PersistenceManager] schema version ${validated.version} is not supported (current: ${getConfig().schemaVersion}) and no migrations are configured`,
        );
      }
      const migrated = this.migrations.migrate<SceneData>(validated);
      working = migrated;
      this.log.info('scene migrated', {
        from: validated.version,
        to: working.version,
      });
    }

    // --- Step 3: deserialize every object into a temp list --------
    const temp: Array<{ ok: true; def: ObjectDefinition } | { ok: false; entry: SkippedEntry }> = [];
    const seenUuids = new Set<string>();
    working.objects.forEach((raw, index) => {
      try {
        const def = this.deserializeDefinition(raw);
        if (seenUuids.has(def.uuid)) {
          throw new Error(`duplicate uuid within scene: ${def.uuid}`);
        }
        seenUuids.add(def.uuid);
        temp.push({ ok: true, def });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const uuid = typeof raw?.uuid === 'string' ? raw.uuid : undefined;
        temp.push({ ok: false, entry: { uuid, reason, index } });
      }
    });

    const skipped = temp
      .filter((t): t is { ok: false; entry: SkippedEntry } => !t.ok)
      .map((t) => t.entry);

    // --- Step 4: atomic abort if any malformed --------------------
    if (mode === 'atomic' && skipped.length > 0) {
      const reasonList = skipped
        .map((s) => `  #${s.index}${s.uuid ? ` (${s.uuid})` : ''}: ${s.reason}`)
        .join('\n');
      throw new SceneLoadError(
        `[PersistenceManager] atomic load failed: ${skipped.length} malformed entr${skipped.length === 1 ? 'y' : 'ies'}\n${reasonList}`,
        skipped,
      );
    }

    // --- Step 5: atomic commit ------------------------------------
    manager.clear();
    let loaded = 0;
    for (const t of temp) {
      if (t.ok) {
        manager.registerObject(t.def);
        loaded++;
      }
    }

    // --- Step 6: done ---------------------------------------------
    manager.bus.emit('scene:loaded', {
      loaded,
      skipped: skipped.length,
    });
    this.log.info('scene loaded', {
      loaded,
      skipped: skipped.length,
      mode,
    });
    return {
      loaded,
      skipped,
      schemaVersion: working.version,
      exportedAt: working.exportedAt,
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
    return { ...m, name: m.name } as ObjectDefinition['metadata'];
  }

  /** Validate the top-level SceneData envelope. Returns the (still-typed) data. */
  private validateEnvelope(data: unknown): SceneData {
    if (!data || typeof data !== 'object') {
      throw new Error('[PersistenceManager] scene data is not an object');
    }
    const d = data as Record<string, unknown>;
    if (typeof d.version !== 'number' || !Number.isFinite(d.version)) {
      throw new Error(
        `[PersistenceManager] scene data.version must be a finite number, got ${String(d.version)}`,
      );
    }
    if (!Array.isArray(d.objects)) {
      throw new Error('[PersistenceManager] scene data.objects must be an array');
    }
    if (typeof d.exportedAt !== 'string') {
      throw new Error(
        '[PersistenceManager] scene data.exportedAt must be an ISO timestamp string',
      );
    }
    return d as unknown as SceneData;
  }
}
