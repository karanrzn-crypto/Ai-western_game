import type { SceneData } from '../core/types.js';
import type { SceneStateManager } from '../core/SceneStateManager.js';
import { PersistenceManager, type LoadOptions, type LoadSummary } from '../core/PersistenceManager.js';
import { logger } from '../utils/Logger.js';

export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
export interface LocalSceneStorageOptions { key: string; storage?: StorageLike; }

export class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

export class LocalSceneStorage {
  private readonly key: string;
  private readonly persistence: PersistenceManager;
  private readonly storage: StorageLike;
  private readonly log = logger.child('storage');

  constructor(persistence: PersistenceManager, options: LocalSceneStorageOptions) {
    if (!options.key) throw new Error('[LocalSceneStorage] key is required');
    this.key = options.key;
    this.persistence = persistence;
    this.storage = options.storage ?? browserStorage();
  }

  save(data: SceneData): void {
    const validated = this.persistence.validateSceneData(data);
    this.storage.setItem(this.key, JSON.stringify(validated));
  }

  saveFromManager(manager: SceneStateManager, sceneMetadata?: SceneData['sceneMetadata']): SceneData {
    const data = this.persistence.exportSceneToJSON(manager, sceneMetadata);
    this.save(data);
    return data;
  }

  load(): SceneData | null {
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    try { return this.persistence.validateSceneData(JSON.parse(raw)); }
    catch (err) {
      // NEVER destroy the user's save here — the data may be from a newer
      // schema version (app downgrade) or transiently unreadable, and a
      // future/patched build may still recover it. Keep the raw payload,
      // surface the problem through the logger, and report "no scene".
      this.log.warn('saved scene failed validation — keeping raw data, returning null', {
        key: this.key,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  loadInto(manager: SceneStateManager, options?: LoadOptions): LoadSummary | null {
    const data = this.load();
    if (!data) return null;
    return this.persistence.loadSceneFromJSON(data, manager, options);
  }

  clear(): void { this.storage.removeItem(this.key); }
  hasSavedScene(): boolean { return this.storage.getItem(this.key) !== null; }
}

function browserStorage(): StorageLike {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error('[LocalSceneStorage] browser localStorage is not available; provide a StorageLike implementation');
  return storage;
}
