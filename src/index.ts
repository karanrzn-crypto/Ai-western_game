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

// --- Reusable world, player, editor, and persistence foundation ---------
export { CollisionWorld } from './physics/CollisionWorld.js';
export type { PlayerCollisionResult, CollisionWorldOptions, CollisionBounds } from './physics/CollisionWorld.js';
export { DayNightCycle } from './world/DayNightCycle.js';
export type { DayNightCycleOptions, DayNightSnapshot } from './world/DayNightCycle.js';
export { PlayerController } from './player/PlayerController.js';
export type { PlayerControllerOptions, PlayerControllerSnapshot, PlayerInputState, CameraMode } from './player/PlayerController.js';
export { LocalSceneStorage, MemoryStorage } from './persistence/LocalSceneStorage.js';
export type { LocalSceneStorageOptions, StorageLike } from './persistence/LocalSceneStorage.js';
export { ObjectEditorController } from './editor/ObjectEditorController.js';
export type { ObjectEditorControllerOptions, EditorMoveCommand, EditorRotationSign } from './editor/ObjectEditorController.js';
export { createDebugAxes, isDebugHelper, DEBUG_HELPER_KEY } from './editor/DebugAxes.js';
export type { DebugAxesOptions } from './editor/DebugAxes.js';
export { formatSelectedObjectInfo, NO_SELECTION_INFO } from './editor/SelectionInfo.js';
export type { SelectedObjectInfo } from './editor/SelectionInfo.js';
export {
  applyLocalRotationDegrees,
  eulerDegreesToQuaternion,
  quaternionToEulerDegrees,
  quaternionMultiply,
  axisAngleQuaternion,
} from './core/RotationMath.js';
export type { Quaternion, RotationAxis } from './core/RotationMath.js';

// --- Config & migrations & utils ---------------------------------------
export { getConfig, configure, resetConfig } from './config/GameConfig.js';
export type { GameConfig, RendererConfig, SceneConfig, LoggingConfig, AssetConfig } from './config/GameConfig.js';
export { getSceneMigrations, MigrationRegistry, _resetSceneMigrationsForTests } from './migrations/SceneMigrations.js';
export type { MigrationFn } from './migrations/SceneMigrations.js';
export { generateUUID, isValidUUID } from './utils/uuid.js';
export { Logger, logger } from './utils/Logger.js';
export type { LogLevel, LogEntry, LogSink } from './utils/Logger.js';
