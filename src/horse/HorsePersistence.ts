/**
 * HorsePersistence — save/restore the owned horse's state (spec §17).
 *
 * Stored under its own localStorage key (separate from the scene schema, so
 * no scene migration is needed): position, yaw, health, stamina and the
 * alive/dead flag. Validation is strict — a corrupted or future-schema
 * payload is discarded and the horse respawns at its default spot rather
 * than breaking the boot.
 */
import type { Vec3 } from '../core/types.js';
import { WORLD_PLAYABLE_HALF } from '../config/GameConfig.js';

export interface HorseSaveData {
  version: number;
  position: Vec3;
  yaw: number;
  health: number;
  stamina: number;
  alive: boolean;
}

export interface HorsePersistenceOptions {
  key?: string;
  storage?: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void };
}

export const HORSE_SAVE_KEY = 'ai-western-game.playable-map.horse.v1';
// SHARED world bounds (src/config/GameConfig.ts) — the same derived playable
// half the horse's movement clamp uses. The old hardcoded ±28.5 rejected
// every save from the whole southern half of the current town (the horse
// silently snapped back to its spawn on load).
const MAX_COORD = WORLD_PLAYABLE_HALF;

function browserStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } | null {
  try {
    const storage = (globalThis as { localStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void } }).localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

function isFiniteObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Validate a parsed payload; returns null when it must be discarded. */
export function validateHorseSave(data: unknown): HorseSaveData | null {
  if (!isFiniteObject(data)) return null;
  if (data.version !== 1) return null;
  const position = isFiniteObject(data.position) ? data.position : null;
  if (!position) return null;
  const x = finiteNumber(position.x);
  const y = finiteNumber(position.y);
  const z = finiteNumber(position.z);
  const yaw = finiteNumber(data.yaw);
  const health = finiteNumber(data.health);
  const stamina = finiteNumber(data.stamina);
  if (x === null || y === null || z === null || yaw === null || health === null || stamina === null) return null;
  if (Math.abs(x) > MAX_COORD || Math.abs(z) > MAX_COORD || y < 0 || y > 30) return null;
  if (typeof data.alive !== 'boolean') return null;
  if (health < 0 || stamina < 0) return null;
  return {
    version: 1,
    position: { x, y, z },
    yaw,
    health: Math.min(health, 100),
    stamina: Math.min(stamina, 100),
    alive: data.alive,
  };
}

export class HorsePersistence {
  private readonly key: string;
  private readonly storage: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void } | null;

  constructor(options: HorsePersistenceOptions = {}) {
    this.key = options.key ?? HORSE_SAVE_KEY;
    this.storage = options.storage ?? browserStorage();
  }

  save(data: HorseSaveData): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, JSON.stringify(data));
    } catch {
      // Quota/private-mode failures must never break gameplay.
    }
  }

  load(): HorseSaveData | null {
    if (!this.storage) return null;
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    try {
      return validateHorseSave(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  clear(): void {
    if (!this.storage) return;
    if (typeof this.storage.removeItem === 'function') this.storage.removeItem(this.key);
    else this.storage.setItem(this.key, '');
  }
}
