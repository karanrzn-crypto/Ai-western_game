/**
 * src/index.ts
 * -----------------------------------------------------------------------------
 * Public API surface of the Ai-western_game scene management library.
 * -----------------------------------------------------------------------------
 */

// --- Core state + persistence -------------------------------------------
export * from './core/types.js';
export * from './core/TransformOps.js';
export * from './core/clone.js';
export * from './core/validators.js';
export { SceneStateManager } from './core/SceneStateManager.js';
export type { SceneSnapshot, SceneStateManagerOptions } from './core/SceneStateManager.js';
export { PersistenceManager, SceneLoadError } from './core/PersistenceManager.js';
export type { LoadSummary, LoadOptions, SkippedEntry, PersistenceManagerOptions } from './core/PersistenceManager.js';
export { EventBus } from './core/EventBus.js';
export type { SceneEvents, EventName, Handler } from './core/EventBus.js';

// --- Engine adapters ----------------------------------------------------
export * from './engine/IRendererAdapter.js';
export { ThreeRendererAdapter } from './engine/ThreeRendererAdapter.js';
export type { ThreeRendererAdapterOptions } from './engine/ThreeRendererAdapter.js';
export { HeadlessRendererAdapter } from './engine/HeadlessRendererAdapter.js';
export type { HeadlessChangeRecord } from './engine/HeadlessRendererAdapter.js';

// --- Asset layer --------------------------------------------------------
export * from './assets/index.js';

// --- World / physics foundation ---------------------------------------
export { CollisionWorld } from './physics/CollisionWorld.js';
export type { PlayerCollisionResult } from './physics/CollisionWorld.js';
export { DayNightCycle } from './world/DayNightCycle.js';
export type { DayNightCycleOptions } from './world/DayNightCycle.js';

// --- Config & migrations & utils ---------------------------------------
export { getConfig, configure, resetConfig } from './config/GameConfig.js';
export type { GameConfig, RendererConfig, SceneConfig, LoggingConfig, AssetConfig } from './config/GameConfig.js';
export { getSceneMigrations, MigrationRegistry, _resetSceneMigrationsForTests } from './migrations/SceneMigrations.js';
export type { MigrationFn } from './migrations/SceneMigrations.js';
export { generateUUID, isValidUUID } from './utils/uuid.js';
export { Logger, logger } from './utils/Logger.js';
export type { LogLevel, LogEntry, LogSink } from './utils/Logger.js';
