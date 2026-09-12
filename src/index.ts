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
export { CharacterStateMachine } from './player/CharacterStateMachine.js';
export type { CharacterState, CharacterStateContext, CharacterStateChangeEvent, CharacterStateThresholds } from './player/CharacterStateMachine.js';
export { HealthSystem, StaminaSystem } from './player/Vitals.js';
export type { HealthSystemOptions, StaminaSystemOptions, HealthEvent } from './player/Vitals.js';
export { InputBindings, DEFAULT_KEY_BINDINGS } from './player/InputBindings.js';
export type { GameAction, InputSnapshot } from './player/InputBindings.js';
export { InteractionSystem } from './player/InteractionSystem.js';
export type { Interactable, InteractionSystemOptions } from './player/InteractionSystem.js';
export { ThirdPersonCamera, rayAabbDistance } from './player/ThirdPersonCamera.js';
export type { ThirdPersonCameraOptions, ThirdPersonCameraInput, ThirdPersonCameraSnapshot } from './player/ThirdPersonCamera.js';
export { findSafeSpawnPosition } from './player/Spawn.js';
export type { SpawnProbeOptions } from './player/Spawn.js';
export { createCharacterModel } from './player/character/CharacterModel.js';
export { CHARACTER_PROPORTIONS, CHARACTER_DETAIL_DISTANCE } from './player/character/index.js';
export type { CharacterMaterials, CharacterJoints, CharacterModel } from './player/character/CharacterModel.js';
export type { CharacterJointName } from './player/character/CharacterProportions.js';
export { CharacterAnimator } from './player/character/CharacterAnimator.js';
export type { AnimatorInput } from './player/character/CharacterAnimator.js';
export { LocalSceneStorage, MemoryStorage } from './persistence/LocalSceneStorage.js';
export type { LocalSceneStorageOptions, StorageLike } from './persistence/LocalSceneStorage.js';
export { ObjectEditorController } from './editor/ObjectEditorController.js';
export type { ObjectEditorControllerOptions, EditorMoveCommand, EditorRotationSign } from './editor/ObjectEditorController.js';
export { createDebugAxes, isDebugHelper, DEBUG_HELPER_KEY } from './editor/DebugAxes.js';
export type { DebugAxesOptions } from './editor/DebugAxes.js';
export { TransformGizmo } from './editor/TransformGizmo.js';
export type { TransformGizmoOptions, GizmoAxis, GizmoHandleId } from './editor/TransformGizmo.js';
export {
  ContactIndicator,
  computeBoxContact,
  DEFAULT_CONTACT_EPSILON,
  DEFAULT_MIN_FACE_OVERLAP,
} from './editor/ContactIndicator.js';
export type {
  BoxContact,
  ContactAxis,
  ContactIndicatorOptions,
  ContactIndicatorUpdateParams,
  ContactIndicatorManagerLike,
} from './editor/ContactIndicator.js';
export {
  clampAxisDelta,
  collectBlockerBoxes,
  makeSceneAxisClamp,
  DEFAULT_LATERAL_OVERLAP_THRESHOLD,
} from './editor/MoveClamp.js';
export type { AxisDeltaClampInput, AxisClampController, ClampAxis } from './editor/MoveClamp.js';
export { closestAxisParamFromRay, rayAngleAroundAxis, wrapAngle, planeBasis } from './editor/GizmoMath.js';
export {
  formatSelectedObjectInfo,
  NO_SELECTION_INFO,
  formatPanelNumber,
  parsePanelNumber,
  buildPanelTransformPatch,
} from './editor/SelectionInfo.js';
export type { SelectedObjectInfo, PanelValueGroup, PanelAxis } from './editor/SelectionInfo.js';
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
