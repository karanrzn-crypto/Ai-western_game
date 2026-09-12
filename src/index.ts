/**
 * src/index.ts
 * -----------------------------------------------------------------------------
 * Public API surface of the Ai-western_game scene management library.
 *
 * Import paths (consumers can either use this barrel or import directly
 * from individual modules):
 *
 *   import { SceneStateManager, PersistenceManager } from '@/index';
 *
 * -----------------------------------------------------------------------------
 */

export * from './core/types.js';
export * from './core/clone.js';
export * from './core/validators.js';
export { SceneStateManager } from './core/SceneStateManager.js';
export type { SceneSnapshot, SceneStateManagerOptions } from './core/SceneStateManager.js';
export { PersistenceManager } from './core/PersistenceManager.js';
export type { LoadSummary, PersistenceManagerOptions } from './core/PersistenceManager.js';
export * from './engine/IRendererAdapter.js';
export { ThreeRendererAdapter, DefaultAssetFactory } from './engine/ThreeRendererAdapter.js';
export type { ThreeRendererAdapterOptions, AssetFactory } from './engine/ThreeRendererAdapter.js';
export { HeadlessRendererAdapter } from './engine/HeadlessRendererAdapter.js';
export type { HeadlessChangeRecord } from './engine/HeadlessRendererAdapter.js';
export { generateUUID, isValidUUID } from './utils/uuid.js';
