/**
 * HorseProportions — the single source of truth for the horse's body metrics
 * and gait table. All values are meters / seconds / radians.
 *
 * The build faces -Z at yaw = 0 (same convention as the character model and
 * PlayerController's forward), so the head points to -Z and the left flank
 * is on +X.
 *
 * Identity: a slim western riding quarter-horse, bay coat with a dark
 * blaze, black mane/tail, leather saddle with brass fittings. ~2.5m to the
 * ear tips, ~2.4m nose-to-tail — big enough to read as a horse next to the
 * 1.83m Ranger without dwarfing him, and deliberately LEAN: a narrow neck,
 * a shallow chest and a slim barrel (a riding horse, not a draft animal).
 */
export const HORSE_PROPORTIONS = {
  /** Total height to the ear tips. */
  totalHeight: 2.5,
  /** Nose-to-tail body length (torso only, head/tail extra). */
  bodyLength: 1.55,
  /** Slim riding-horse barrel — visually distinct from a draft horse. */
  bodyWidth: 0.64,
  bodyHeight: 0.78,
  /** Torso center height above the ground (feet at y=0). */
  bodyCenterY: 1.32,
  // --- Legs (front pair slightly longer than the hind pair) ----------------
  frontLegY: 1.26,
  hindLegY: 1.3,
  upperLeg: 0.62,
  lowerLeg: 0.52,
  hoofHeight: 0.14,
  /** Half distance between left/right legs (tucked under the slim barrel). */
  legHalfWidth: 0.23,
  /** Front legs at -Z, hind legs at +Z (relative to the torso center). */
  frontLegZ: -0.52,
  hindLegZ: 0.55,
  // --- Neck & head ----------------------------------------------------------
  /** Neck base on the torso front-top. */
  neckBaseY: 1.62,
  neckBaseZ: -0.72,
  neckLength: 0.62,
  headY: 2.12,
  headLength: 0.62,
  headWidth: 0.26,
  earHeight: 0.16,
  // --- Tail -----------------------------------------------------------------
  tailBaseY: 1.5,
  tailBaseZ: 0.82,
  tailLength: 0.85,
  // --- Rider socket ----------------------------------------------------------
  /** Saddle top surface height (rider sits on this). */
  saddleTopY: 1.62,
  /** Rider root (feet) height while mounted — feet hang at stirrup level. */
  riderFeetY: 1.02,
  /** Rider root sits slightly behind the torso center, on the saddle. */
  riderZ: 0.08,
  // --- Physics capsule --------------------------------------------------------
  /** Collision capsule radius (body half-width + mane margin). */
  collisionRadius: 0.55,
  /** Collision capsule height above the feet. */
  collisionHeight: 1.9,
  /** Step-up limit (matches the player's 0.35 + a small hoof margin). */
  stepHeight: 0.4,
} as const;

/** The four forward gaits + reverse + standstill. */
export type HorseGait = 'idle' | 'walk' | 'trot' | 'canter' | 'gallop';

export interface GaitSpec {
  /** Steady-state speed (m/s). */
  speed: number;
  /** Acceleration toward this gait's speed (m/s²). */
  acceleration: number;
  /** Ground stride length (m) — drives the leg-cycle rate = speed / stride. */
  stride: number;
  /** Leg swing amplitude (rad). */
  swing: number;
  /** Body bob amplitude (m). */
  bob: number;
}

export const HORSE_GAITS: Record<HorseGait, GaitSpec> = {
  idle: { speed: 0, acceleration: 0, stride: 1, swing: 0, bob: 0 },
  walk: { speed: 1.7, acceleration: 2.6, stride: 1.7, swing: 0.4, bob: 0.018 },
  trot: { speed: 4.2, acceleration: 3.1, stride: 2.8, swing: 0.56, bob: 0.042 },
  canter: { speed: 7.0, acceleration: 3.6, stride: 3.8, swing: 0.72, bob: 0.05 },
  gallop: { speed: 11.5, acceleration: 4.2, stride: 4.9, swing: 0.95, bob: 0.085 },
};

/** Reverse crawl — far slower than any forward gait (spec §4). */
export const HORSE_REVERSE_SPEED = 1.1;
/** Braking deceleration (m/s²) — stronger than natural decel: stop < gait change. */
export const HORSE_BRAKE_DECELERATION = 6.5;
/** Natural deceleration when easing down (m/s²). */
export const HORSE_NATURAL_DECELERATION = 2.6;

/** Turn rates (rad/s) while steering — tighter at low speed. */
export const HORSE_TURN_RATES = {
  stand: 1.1,
  walk: 2.0,
  trot: 1.75,
  canter: 1.35,
  gallop: 1.0,
} as const;

/** Stamina economy per gait (points/second; negative = drain). */
export const HORSE_STAMINA = {
  max: 100,
  gallopDrain: 9,
  canterDrain: 2.5,
  /** Walk regenerates slowly (reduced consumption, spec §5). */
  walkRegen: 4,
  /** Standing still regenerates fast. */
  idleRegen: 13,
  /** Trot is neutral: neither drains nor recovers. */
  trotRegen: 0,
  /** Seconds of no drain required before any regeneration starts. */
  regenDelay: 1.0,
  /** Gallop locks when stamina falls to/below this. */
  fatigueLock: 8,
  /** Gallop unlocks again at this threshold (hysteresis). */
  fatigueRecover: 35,
} as const;

/** AI tuning (distances in meters, timers in seconds). */
export const HORSE_AI = {
  /** Start following when the player is farther than this. */
  followStart: 6.5,
  /** Keep this distance from the player while following. */
  followStop: 3.0,
  /** Never step closer than this to the player (no bumping). */
  followHardStop: 2.2,
  /** Summon arrives at this distance. */
  summonArrive: 3.0,
  /** Whistle cooldown. */
  summonCooldown: 3,
  /** Flee duration after a scare. */
  fleeDuration: 4.2,
  /** Health ratio below which the horse reads as injured. */
  injuredRatio: 0.3,
  /** Brain decision tick (Hz) — AI must not run heavy math per frame. */
  tickHz: 10,
  /** Stuck watchdog: expected min displacement over the window. */
  stuckWindow: 1.4,
  stuckMinDisplacement: 0.3,
} as const;
