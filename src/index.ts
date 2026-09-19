/**
 * src/index.ts
 * -----------------------------------------------------------------------------
 * Public API surface of the Ai-western_game scene management library.
 * -----------------------------------------------------------------------------
 */

// --- Core state ---------------------------------------------------------
export * from './core/types.js';
export * from './core/TransformOps.js';
export * from './core/clone.js';
export * from './core/validators.js';
export { SceneStateManager } from './core/SceneStateManager.js';
export type { SceneSnapshot, SceneStateManagerOptions } from './core/SceneStateManager.js';
export { PersistenceManager, SceneLoadError } from './persistence/PersistenceManager.js';
export type { LoadSummary, LoadOptions, SkippedEntry, PersistenceManagerOptions } from './persistence/PersistenceManager.js';
export { EventBus } from './core/EventBus.js';
export type { SceneEvents, EventName, Handler } from './core/EventBus.js';
export { GameModeController } from './core/GameModeController.js';
export type {
  GameMode,
  EditOrigin,
  CameraOwner,
  CreativeAttachSource,
  PlayReturnSource,
  GameModeDelegate,
  GameModeOptions,
} from './core/GameModeController.js';

// --- Engine adapters ----------------------------------------------------
export * from './engine/IRendererAdapter.js';
export { ThreeRendererAdapter } from './engine/ThreeRendererAdapter.js';
export type { ThreeRendererAdapterOptions } from './engine/ThreeRendererAdapter.js';
export { HeadlessRendererAdapter } from './engine/HeadlessRendererAdapter.js';
export type { HeadlessChangeRecord } from './engine/HeadlessRendererAdapter.js';
export { AdaptiveResolution, ShadowScheduler, DEFAULT_DPR_LADDER } from './engine/RenderGovernor.js';
export type {
  ResolutionSink,
  AdaptiveResolutionOptions,
  ShadowSchedulerOptions,
} from './engine/RenderGovernor.js';

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
export { MouseLookController, MOUSE_LOOK_BUTTON } from './player/MouseLookController.js';
export type { MouseLookDelta } from './player/MouseLookController.js';
export { CreativeFlightController } from './player/CreativeFlightController.js';
export type { CreativeFlightInput, CreativeFlightOptions } from './player/CreativeFlightController.js';
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
export { AuthoredLayout } from './editor/AuthoredLayout.js';
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

// --- Horse system (Part 3) ----------------------------------------------
export {
  HORSE_PROPORTIONS,
  HORSE_GAITS,
  HORSE_REVERSE_SPEED,
  HORSE_BRAKE_DECELERATION,
  HORSE_NATURAL_DECELERATION,
  HORSE_TURN_RATES,
  HORSE_STAMINA,
  HORSE_AI,
  RIDER_SEATED_EYE_RISE,
  RIDER_SEATED_EYE_Y,
  RIDER_SEATED_EYE_Z,
} from './horse/HorseProportions.js';
export type { HorseGait, GaitSpec } from './horse/HorseProportions.js';
export { createHorseModel, HORSE_DETAIL_DISTANCE } from './horse/HorseModel.js';
export type { HorseModel, HorseJoints, HorseJointName, HorseMaterials } from './horse/HorseModel.js';
export { HorseAnimator, GAIT_PHASES } from './horse/HorseAnimator.js';
export type { HorseAnimatorInput, HorseIdleAction } from './horse/HorseAnimator.js';
export { HorseStamina } from './horse/HorseVitals.js';
export { HorseBrain } from './horse/HorseBrain.js';
export type { HorseAiState, HorseBrainContext, HorseBrainOrder, HorseBrainOptions, HorseIdleActionName } from './horse/HorseBrain.js';
export { HorseController, mountEnterCameraMode, dismountCameraPlan, HORSE_RUN_WINDUP_SECONDS } from './horse/HorseController.js';
export type { HorseRidingInput, HorseWorldContext, HorseSnapshot, HorseEvent, DismountCameraPlan } from './horse/HorseController.js';
export { HorsePersistence, validateHorseSave, HORSE_SAVE_KEY } from './horse/HorsePersistence.js';
export type { HorseSaveData, HorsePersistenceOptions } from './horse/HorsePersistence.js';
export {
  buildMountTimeline, mountRootPose, poseMountRider, applyRiderPose,
  mountSafeRadius, MOUNT_STAND, MOUNT_SEAT_QUATERNION, MOUNT_FACE_HORSE, SEAT_POSE,
  buildDismountTimeline, dismountRootPose, poseDismountRider, DISMOUNT_STAND,
} from './horse/MountChoreography.js';
export type { MountTimeline, MountStartState, MountJoints, SeatPose, DismountTimeline } from './horse/MountChoreography.js';

// --- Config & migrations & utils ---------------------------------------
export { getConfig, configure, resetConfig } from './config/GameConfig.js';
export type { GameConfig, RendererConfig, SceneConfig, LoggingConfig, AssetConfig } from './config/GameConfig.js';
export { getSceneMigrations, MigrationRegistry, _resetSceneMigrationsForTests } from './migrations/SceneMigrations.js';
export type { MigrationFn } from './migrations/SceneMigrations.js';
export { generateUUID, isValidUUID } from './utils/uuid.js';
export { Logger, logger } from './utils/Logger.js';
export type { LogLevel, LogEntry, LogSink } from './utils/Logger.js';
