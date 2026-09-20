/**
 * src/config/GameConfig.ts
 * -----------------------------------------------------------------------------
 * Central, typed configuration object.
 *
 * Every tunable that previously lived as a magic constant inside a module
 * (schema version, scene limits, renderer defaults, debug flags) has a
 * single home here. Modules read from this object rather than holding
 * their own private constants — so changing a value at startup changes it
 * everywhere consistently.
 *
 * Usage:
 *   import { getConfig, configure } from '../config/GameConfig.js';
 *   configure({ debug: true, logging: { level: 'debug' } });
 *   const maxObjects = getConfig().scene.maxObjects;
 *
 * Design notes:
 *  - This is a process-wide singleton, intentionally NOT DI-injected. The
 *    goal is one predictable place to look up runtime configuration, not
 *    a flexible plugin system. If a future module genuinely needs per-
 *    instance config, it can take options in its constructor.
 *  - `configure()` performs a shallow merge on top-level keys and a deep
 *    merge one level deeper. That's enough for our shape.
 * -----------------------------------------------------------------------------
 */

import type { LogLevel } from '../utils/Logger.js';

export interface RendererConfig {
  /** Device pixel ratio cap. `0` means "use the browser default". */
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  /** Background color rendered before any object is drawn. */
  clearColor: number;
}

export interface SceneConfig {
  /** Hard ceiling to prevent runaway registrations during a bug. */
  maxObjects: number;
}

export interface LoggingConfig {
  level: LogLevel;
}

export interface AssetConfig {
  /** Directory (relative to project root) where GLTF/textures live. */
  basePath: string;
}

export interface GameConfig {
  /** Current scene schema version written into exports. */
  schemaVersion: number;
  scene: SceneConfig;
  renderer: RendererConfig;
  logging: LoggingConfig;
  assets: AssetConfig;
  /** Toggles debug-only code paths (e.g. axis helpers). */
  debug: boolean;
}

const DEFAULT_CONFIG_VALUES: GameConfig = {
  schemaVersion: 1,
  scene: { maxObjects: 10_000 },
  renderer: {
    pixelRatio: 0,
    antialias: true,
    shadows: true,
    clearColor: 0x0d0d12,
  },
  logging: { level: 'info' },
  assets: { basePath: '/assets' },
  debug: false,
};

const DEFAULT_CONFIG: Readonly<GameConfig> = Object.freeze(DEFAULT_CONFIG_VALUES);

let currentConfig: GameConfig = clone(DEFAULT_CONFIG);

/** Read the current config. Returns a frozen snapshot. */
export function getConfig(): Readonly<GameConfig> {
  return Object.freeze(clone(currentConfig));
}

/**
 * Patch the config. Performs a deep merge one level deep on each top-level
 * object key; primitives are replaced.
 */
export function configure(patch: Partial<GameConfig>): void {
  const next = clone(currentConfig);
  for (const key of Object.keys(patch) as Array<keyof GameConfig>) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = { ...(next[key] as object), ...(value as object) } as never;
    } else {
      (next as Record<keyof GameConfig, unknown>)[key] = value as never;
    }
  }
  currentConfig = next;
}

/** Reset to defaults. Useful in tests. */
export function resetConfig(): void {
  currentConfig = clone(DEFAULT_CONFIG);
}

/* -------------------------------------------------------------------------- */
/* WORLD BOUNDS — the ONE shared source of truth                              */
/* -------------------------------------------------------------------------- */
/* The town ground is a WORLD_GROUND_SIZE² plane and the four invisible
 * boundary walls stand WORLD_WALL_INSET inside its edges. Every system that
 * needs the playable extent derives it from HERE — never from a local
 * hardcoded number (the horse clamp and the horse-save validator both used
 * to carry a stale ±28.5 from a smaller map, snapping the horse back from
 * the whole southern half of the town).
 *
 *   ground edge        ±(WORLD_HALF_SIZE)                       = ±60
 *   wall inner face    ±(WORLD_HALF_SIZE − WORLD_WALL_INSET)    = ±59.5
 *   movement clamp     ±(WORLD_PLAYABLE_HALF)                   = ±58.5
 *                                                                      */
export const WORLD_GROUND_SIZE = 120;
export const WORLD_HALF_SIZE = WORLD_GROUND_SIZE / 2;
/** The boundary walls' thickness band inside the ground edge (walls are 1 m
 *  thick, centered 0.5 m inside the edge → inner face at HALF − 0.5). */
export const WORLD_WALL_INSET = 0.5;
/** Playable half-extent: the wall inner face minus a full body margin so a
 *  clamped horse (or player) never visually touches the boundary wall. */
export const WORLD_PLAYABLE_HALF = WORLD_HALF_SIZE - WORLD_WALL_INSET - 1;

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
