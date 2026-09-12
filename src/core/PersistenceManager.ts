/**
 * src/core/PersistenceManager.ts
 * -----------------------------------------------------------------------------
 * Persistence layer for SceneStateManager.
 * -----------------------------------------------------------------------------
 */

import type { SceneData, ObjectDefinition } from './types.js';
import type { SceneStateManager } from './SceneStateManager.js';
import { isValidUUID } from '../utils/uuid.js';
import { getSceneMigrations } from '../migrations/SceneMigrations.js';
import { getConfig } from '../config/GameConfig.js';
import { logger } from '../utils/Logger.js';

export interface PersistenceManagerOptions {
  migrations?: typeof getSceneMigrations extends () => infer M ? M : never;
}

export interface SkippedEntry { uuid?: string; reason: string; index: number; }
export interface LoadSummary { loaded: number; skipped: SkippedEntry[]; schemaVersion: number; exportedAt: string; }

export class SceneLoadError extends Error {
  readonly skipped: SkippedEntry[];
  constructor(message: string, skipped: SkippedEntry[]) { super(message); this.name = 'SceneLoadError'; this.skipped = skipped; }
}

export interface LoadOptions { mode?: 'atomic' | 'lenient'; }

export class PersistenceManager {
  private readonly log = logger.child('persistence');
  private readonly migrations?: ReturnType<typeof getSceneMigrations>;

  constructor(options: PersistenceManagerOptions = {}) { this.migrations = options.migrations ?? getSceneMigrations(); }

  exportSceneToJSON(manager: SceneStateManager, overrides?: SceneData['sceneMetadata']): SceneData {
    const objects = manager.getAllObjects().map((def) => this.serializeDefinition(def));
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

  loadSceneFromJSON(data: unknown, manager: SceneStateManager, options: LoadOptions = {}): LoadSummary {
    const mode = options.mode ?? 'atomic';
    const validated = this.validateEnvelope(data);
    let working: SceneData = validated;
    if (validated.version !== getConfig().schemaVersion) {
      if (!this.migrations) throw new Error(`[PersistenceManager] schema version ${validated.version} is not supported (current: ${getConfig().schemaVersion}) and no migrations are configured`);
      working = this.migrations.migrate<SceneData>(validated);
      this.log.info('scene migrated', { from: validated.version, to: working.version });
    }

    const temp: Array<{ ok: true; def: ObjectDefinition } | { ok: false; entry: SkippedEntry }> = [];
    const seenUuids = new Set<string>();
    working.objects.forEach((raw, index) => {
      try {
        const def = this.deserializeDefinition(raw);
        if (seenUuids.has(def.uuid)) throw new Error(`duplicate uuid within scene: ${def.uuid}`);
        seenUuids.add(def.uuid);
        temp.push({ ok: true, def });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const uuid = typeof raw?.uuid === 'string' ? raw.uuid : undefined;
        temp.push({ ok: false, entry: { uuid, reason, index } });
      }
    });

    const skipped = temp.filter((t): t is { ok: false; entry: SkippedEntry } => !t.ok).map((t) => t.entry);
    if (mode === 'atomic' && skipped.length > 0) {
      const reasonList = skipped.map((s) => `  #${s.index}${s.uuid ? ` (${s.uuid})` : ''}: ${s.reason}`).join('\n');
      throw new SceneLoadError(`[PersistenceManager] atomic load failed: ${skipped.length} malformed entr${skipped.length === 1 ? 'y' : 'ies'}\n${reasonList}`, skipped);
    }

    // Envelope-level ceiling check BEFORE touching the manager: without this,
    // a scene larger than scene.maxObjects would clear() the manager and then
    // throw mid-registration, leaving it partially loaded (broken atomicity).
    const validCount = temp.length - skipped.length;
    const max = getConfig().scene.maxObjects;
    if (validCount > max) {
      throw new SceneLoadError(
        `[PersistenceManager] scene contains ${validCount} valid objects which exceeds the configured maxObjects ceiling (${max}) — refusing to load`,
        skipped,
      );
    }

    manager.clear();
    let loaded = 0;
    for (const t of temp) if (t.ok) { manager.registerObject(t.def); loaded++; }
    manager.bus.emit('scene:loaded', { loaded, skipped: skipped.length });
    this.log.info('scene loaded', { loaded, skipped: skipped.length, mode });
    return { loaded, skipped, schemaVersion: working.version, exportedAt: working.exportedAt };
  }

  /** Validate arbitrary scene data and return a canonical JSON-safe scene object. */
  validateSceneData(data: unknown): SceneData {
    const validated = this.validateEnvelope(data);
    let working: SceneData = validated;
    if (validated.version !== getConfig().schemaVersion) {
      if (!this.migrations) throw new Error(`[PersistenceManager] schema version ${validated.version} is not supported (current: ${getConfig().schemaVersion}) and no migrations are configured`);
      working = this.migrations.migrate<SceneData>(validated);
    }
    const objects: ObjectDefinition[] = [];
    const seenUuids = new Set<string>();
    working.objects.forEach((raw, index) => {
      const def = this.deserializeDefinition(raw);
      if (seenUuids.has(def.uuid)) throw new Error(`[PersistenceManager] duplicate uuid within scene at index ${index}: ${def.uuid}`);
      seenUuids.add(def.uuid);
      objects.push(this.serializeDefinition(def));
    });
    return {
      version: working.version,
      exportedAt: working.exportedAt,
      sceneMetadata: working.sceneMetadata ? { ...working.sceneMetadata } : undefined,
      objects,
    };
  }

  private serializeDefinition(def: ObjectDefinition): ObjectDefinition {
    return { uuid: def.uuid, assetType: def.assetType, transform: { position: { ...def.transform.position }, rotation: { ...def.transform.rotation }, scale: { ...def.transform.scale } }, metadata: { ...def.metadata } };
  }

  private deserializeDefinition(raw: unknown): ObjectDefinition {
    if (!raw || typeof raw !== 'object') throw new Error('definition is not an object');
    const r = raw as Record<string, unknown>;
    const uuid = r.uuid;
    if (typeof uuid !== 'string' || !isValidUUID(uuid)) throw new Error(`invalid uuid: ${String(uuid)}`);
    const assetType = r.assetType;
    if (typeof assetType !== 'string' || assetType.length === 0) throw new Error(`invalid assetType for ${uuid}`);
    return { uuid, assetType: assetType as ObjectDefinition['assetType'], transform: this.parseTransform(r.transform, uuid), metadata: this.parseMetadata(r.metadata, uuid) };
  }

  private parseTransform(raw: unknown, uuid: string): ObjectDefinition['transform'] {
    if (!raw || typeof raw !== 'object') throw new Error(`object ${uuid}: transform missing`);
    const t = raw as Record<string, unknown>;
    return { position: this.parseVec3(t.position, `${uuid}.transform.position`), rotation: this.parseVec3(t.rotation, `${uuid}.transform.rotation`), scale: this.parseVec3(t.scale, `${uuid}.transform.scale`) };
  }

  private parseVec3(raw: unknown, ctx: string): { x: number; y: number; z: number } {
    if (!raw || typeof raw !== 'object') throw new Error(`${ctx}: expected {x,y,z} object`);
    const v = raw as Record<string, unknown>;
    const out = { x: 0, y: 0, z: 0 };
    for (const axis of ['x', 'y', 'z'] as const) {
      const n = v[axis];
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`${ctx}.${axis}: expected finite number, got ${String(n)}`);
      out[axis] = n;
    }
    return out;
  }

  private parseMetadata(raw: unknown, uuid: string): ObjectDefinition['metadata'] {
    if (!raw || typeof raw !== 'object') return { name: 'Unnamed' };
    const m = raw as Record<string, unknown>;
    if (typeof m.name !== 'string' || m.name.length === 0) throw new Error(`object ${uuid}: metadata.name required and must be non-empty string`);
    return { ...m, name: m.name } as ObjectDefinition['metadata'];
  }

  private validateEnvelope(data: unknown): SceneData {
    if (!data || typeof data !== 'object') throw new Error('[PersistenceManager] scene data is not an object');
    const d = data as Record<string, unknown>;
    if (typeof d.version !== 'number' || !Number.isFinite(d.version)) throw new Error(`[PersistenceManager] scene data.version must be a finite number, got ${String(d.version)}`);
    if (!Array.isArray(d.objects)) throw new Error('[PersistenceManager] scene data.objects must be an array');
    if (typeof d.exportedAt !== 'string') throw new Error('[PersistenceManager] scene data.exportedAt must be an ISO timestamp string');
    return d as unknown as SceneData;
  }
}
