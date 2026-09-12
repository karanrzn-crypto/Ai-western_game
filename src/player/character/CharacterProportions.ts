/**
 * CharacterProportions — the single source of truth for the main character's
 * body metrics. All values are meters. The build faces -Z (the player
 * controller's forward at yaw = 0), so a toe points to -Z and the right hand
 * sits on +X.
 *
 * Identity summary ("The Ranger", western gunslinger):
 *   height 1.83m (~7.6 heads), slim athletic build, broad-ish shoulders,
 *   long legs — proportions that read instantly from behind via the hat +
 *   duster coat + bandana silhouette and stay animation-friendly (no extreme
 *   volumes, normal joint pivots, no crossed deformation zones).
 */
export const CHARACTER_PROPORTIONS = {
  /** Total height to the top of the hair (hat excluded). */
  totalHeight: 1.83,
  headHeight: 0.23,
  headWidth: 0.185,
  headDepth: 0.22,
  shoulderY: 1.47,
  shoulderHalfWidth: 0.235,
  hipY: 0.96,
  hipHalfWidth: 0.105,
  upperArm: 0.28,
  lowerArm: 0.27,
  upperLeg: 0.45,
  lowerLeg: 0.4,
  footHeight: 0.1,
  footLength: 0.27,
  // --- Camera eye metrics (the SINGLE source for every camera height) ------
  /** Camera eye line above the feet while standing (≈93% of body height). */
  eyeHeight: 1.7,
  /**
   * Camera eye line while fully crouched. Matches the crouch pose's actual
   * head/eye height (hips drop to 0.62, torso pitches forward → eyes ≈1.2m),
   * so the first-person camera always reads as "looking through his eyes",
   * never the neck or chest.
   */
  crouchEyeHeight: 1.2,
  /**
   * Hard floor for the camera eye — well above chest height for both poses,
   * so no state (transition glitch, broken save, physics oddity) can sink
   * the first-person camera toward the neck/chest.
   */
  minEyeHeight: 1.1,
  // --- Animation amplitude caps (clipping guards) ---------------------------
  /**
   * Max hip swing of the legs during locomotion (rad). Keeps the thighs
   * inside the pelvis volume and clear of the coat/holster at full sprint.
   */
  maxLegSwing: 0.95,
  /** Max shoulder swing of the arms during locomotion (rad). */
  maxArmSwing: 0.56,
} as const;

/** Joint names of the character rig (animator targets). */
export type CharacterJointName =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head' | 'coat'
  | 'shoulderL' | 'elbowL' | 'handL'
  | 'shoulderR' | 'elbowR' | 'handR'
  | 'legL' | 'kneeL' | 'footL'
  | 'legR' | 'kneeR' | 'footR';
