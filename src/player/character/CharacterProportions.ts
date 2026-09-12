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
} as const;

/** Joint names of the character rig (animator targets). */
export type CharacterJointName =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'shoulderL' | 'elbowL' | 'handL'
  | 'shoulderR' | 'elbowR' | 'handR'
  | 'legL' | 'kneeL' | 'footL'
  | 'legR' | 'kneeR' | 'footR';
