/**
 * src/migrations/SceneMigrations.ts
 * -----------------------------------------------------------------------------
 * Migration registry for SceneData schema.
 *
 * The SceneData envelope is stamped with `version: N`. When the schema
 * changes, instead of breaking all existing saves:
 *   1. Bump `LATEST_SCENE_VERSION` in GameConfig.
 *   2. Write a migration function: `migrate_v1_to_v2(oldData) => newData`.
 *   3. Register it via `sceneMigrations.register(1, 2, fn)`.
 *
 * PersistenceManager.loadSceneFromJSON() will walk the chain from the
 * loaded data's version up to LATEST before validation, so old saves
 * keep loading forever.
 *
 * Migration contract:
 *  - Input: a raw, already-JSON-parsed object whose `version` field
 *    equals the "from" version.
 *  - Output: a plain object whose `version` field equals the "to"
 *    version.
 *  - Migrations MUST be pure (no I/O, no Date.now(), no randomness)
 *    so they are deterministic and replayable in tests.
 *
 * Currently there is only version 1, so no migrations are registered.
 * The mechanism exists so the FIRST schema change does not require an
 * emergency refactor of PersistenceManager.
 * -----------------------------------------------------------------------------
 */

import { logger } from '../utils/Logger.js';

export type MigrationFn = (data: unknown) => unknown;

interface MigrationStep {
  from: number;
  to: number;
  fn: MigrationFn;
}

export class MigrationRegistry {
  private readonly steps = new Map<number, MigrationStep>();
  private readonly latest: number;

  constructor(latest: number) {
    if (latest < 1) throw new Error(`MigrationRegistry: latest must be ≥ 1, got ${latest}`);
    this.latest = latest;
  }

  /** Register a migration from one version to the next (or a jump). */
  register(from: number, to: number, fn: MigrationFn): void {
    if (from >= to) {
      throw new Error(`MigrationRegistry: from (${from}) must be < to (${to})`);
    }
    if (this.steps.has(from)) {
      throw new Error(
        `MigrationRegistry: a migration from version ${from} is already registered`,
      );
    }
    this.steps.set(from, { from, to, fn });
    logger.debug('migration registered', { from, to });
  }

  /** The latest version this registry can produce. */
  get latestVersion(): number {
    return this.latest;
  }

  /**
   * Walk the chain: starting from `data.version`, apply each migration
   * in turn until `data.version === latestVersion`.
   *
   * Throws if a needed migration is not registered, or if the input
   * version is GREATER than the latest (downgrades are unsupported).
   */
  migrate<T = unknown>(data: unknown): T {
    if (!data || typeof data !== 'object') {
      throw new Error('MigrationRegistry: input is not an object');
    }
    const d = data as { version?: unknown };
    if (typeof d.version !== 'number' || !Number.isFinite(d.version)) {
      throw new Error(
        `MigrationRegistry: data.version must be a finite number, got ${String(d.version)}`,
      );
    }
    if (d.version > this.latest) {
      throw new Error(
        `MigrationRegistry: data.version ${d.version} is newer than latest known ${this.latest} (downgrades are unsupported)`,
      );
    }
    let current: unknown = data;
    let v = d.version;
    let safety = 0; // hard cap to prevent infinite loops on bad migration chains
    while (v < this.latest) {
      const step = this.steps.get(v);
      if (!step) {
        throw new Error(
          `MigrationRegistry: no migration registered from version ${v} (latest ${this.latest})`,
        );
      }
      current = step.fn(current);
      // Each migration MUST stamp the new version onto the data.
      const after = current as { version?: unknown };
      if (typeof after.version !== 'number' || after.version !== step.to) {
        throw new Error(
          `MigrationRegistry: migration ${step.from}→${step.to} did not stamp version=${step.to} (got ${String(after.version)})`,
        );
      }
      v = step.to;
      if (++safety > 100) {
        throw new Error('MigrationRegistry: chain exceeded 100 steps (bug in registrations)');
      }
    }
    return current as T;
  }
}

/**
 * Singleton instance bound to the schema version declared in GameConfig.
 * Keep using this rather than constructing a fresh registry — every
 * migration ever written should land here.
 */
import { getConfig } from '../config/GameConfig.js';
import { logger as appLogger } from '../utils/Logger.js';

let _sceneMigrations: MigrationRegistry | null = null;

export function getSceneMigrations(): MigrationRegistry {
  if (_sceneMigrations === null) {
    _sceneMigrations = new MigrationRegistry(getConfig().schemaVersion);
    appLogger.debug('scene migration registry initialised', {
      latest: _sceneMigrations.latestVersion,
    });
  }
  return _sceneMigrations;
}

/** Test-only escape hatch to reset the singleton. */
export function _resetSceneMigrationsForTests(): void {
  _sceneMigrations = null;
}
