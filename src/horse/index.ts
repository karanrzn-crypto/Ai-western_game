/**
 * Horse system (Part 3) — model, animation, AI, movement, riding, persistence.
 */
export { HORSE_PROPORTIONS, HORSE_GAITS, HORSE_REVERSE_SPEED, HORSE_BRAKE_DECELERATION, HORSE_NATURAL_DECELERATION, HORSE_TURN_RATES, HORSE_STAMINA, HORSE_AI } from './HorseProportions.js';
export type { HorseGait, GaitSpec } from './HorseProportions.js';
export { createHorseModel, HORSE_DETAIL_DISTANCE } from './HorseModel.js';
export type { HorseModel, HorseJoints, HorseJointName, HorseMaterials } from './HorseModel.js';
export { HorseAnimator } from './HorseAnimator.js';
export type { HorseAnimatorInput, HorseIdleAction } from './HorseAnimator.js';
export { HorseStamina } from './HorseVitals.js';
export { HorseBrain } from './HorseBrain.js';
export type { HorseAiState, HorseBrainContext, HorseBrainOrder, HorseBrainOptions, HorseIdleActionName } from './HorseBrain.js';
export { HorseController } from './HorseController.js';
export type { HorseRidingInput, HorseWorldContext, HorseSnapshot, HorseEvent } from './HorseController.js';
export { HorsePersistence, validateHorseSave, HORSE_SAVE_KEY } from './HorsePersistence.js';
export type { HorseSaveData, HorsePersistenceOptions } from './HorsePersistence.js';
