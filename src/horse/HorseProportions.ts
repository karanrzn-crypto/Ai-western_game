/**
 * HorseProportions — the single source of truth for the horse's body metrics
 * and gait table. All values are meters / seconds / radians.
 *
 * The build faces -Z at yaw = 0 (same convention as the character model and
 * PlayerController's forward), so the head points to -Z and the left flank
 * is on +X.
 *
 * Identity: a slim western riding quarter-horse, bay coat with a dark
 * blaze, black mane/tail, leather saddle with brass fittings — big enough
 * to read as a horse next to the 1.83m Ranger without dwarfing him, and
 * deliberately LEAN: a narrow neck, a shallow chest and a slim barrel (a
 * riding horse, not a draft animal).
 *
 * SCALE SYSTEM (strict revision §6): HORSE_SCALE is the ONE authoritative
 * size multiplier for the whole animal. Every length metric below is
 * expressed as (reference value × HORSE_SCALE), and every dependent system
 * derives from these constants — the model build (HorseModel), the saddle
 * stack, the rider socket height, the physics capsule, the mount
 * choreography and the riding camera. NOTHING may scale horse.root after
 * the fact (that breaks sockets/collision/mount solving). The gait STRIDE
 * lengths scale too (a smaller animal covers less ground per footfall), so
 * the leg-cycle rate = speed / stride stays physically consistent; gait
 * SPEEDS are gameplay tuning and stay unchanged.
 */
export const HORSE_SCALE = 0.84;

/** Reference dimensions at scale 1 → all multiplied by HORSE_SCALE. */
export const HORSE_PROPORTIONS = {
  scale: HORSE_SCALE,
  /** Total height to the ear tips: 2.5 × 0.84 = 2.10m. */
  totalHeight: 2.5 * HORSE_SCALE,
  /** Nose-to-tail body length (torso only, head/tail extra): 1.30m. */
  bodyLength: 1.55 * HORSE_SCALE,
  /** Slim riding-horse barrel — visually distinct from a draft horse. */
  bodyWidth: 0.64 * HORSE_SCALE,
  bodyHeight: 0.78 * HORSE_SCALE,
  /** Torso center height above the ground (feet at y=0): 1.11m. */
  bodyCenterY: 1.32 * HORSE_SCALE,
  // --- Legs (front pair slightly longer than the hind pair) ----------------
  frontLegY: 1.26 * HORSE_SCALE,
  hindLegY: 1.3 * HORSE_SCALE,
  upperLeg: 0.62 * HORSE_SCALE,
  lowerLeg: 0.52 * HORSE_SCALE,
  hoofHeight: 0.14 * HORSE_SCALE,
  /** Half distance between left/right legs (tucked under the slim barrel). */
  legHalfWidth: 0.23 * HORSE_SCALE,
  /** Front legs at -Z, hind legs at +Z (relative to the torso center). */
  frontLegZ: -0.52 * HORSE_SCALE,
  hindLegZ: 0.55 * HORSE_SCALE,
  // --- Neck & head ----------------------------------------------------------
  /** Neck base on the torso front-top. */
  neckBaseY: 1.62 * HORSE_SCALE,
  neckBaseZ: -0.72 * HORSE_SCALE,
  neckLength: 0.62 * HORSE_SCALE,
  headY: 2.12 * HORSE_SCALE,
  headLength: 0.62 * HORSE_SCALE,
  headWidth: 0.26 * HORSE_SCALE,
  earHeight: 0.16 * HORSE_SCALE,
  // --- Tail -----------------------------------------------------------------
  // Tail-attachment revision: the tail root is no longer placed by a
  // hand-tuned z offset. The anchor is DERIVED in HorseModel from the actual
  // hindquarters box (its rear face minus a small, intentional root overlap —
  // see HINDQUARTERS / TAIL_ROOT_OVERLAP / tailAnchorZ there), so the dock
  // always crosses the body's rear surface: no visible gap, never buried.
  // Only the croup HEIGHT stays a proportion here.
  tailBaseY: 1.56 * HORSE_SCALE,
  tailLength: 0.85 * HORSE_SCALE,
  // --- Rider socket ----------------------------------------------------------
  /**
   * Saddle seat top surface (rider sits on this): 1.54m — the barrel top is
   * bodyCenterY + bodyHeight/2 = 1.44m, and the whole saddle stack (blanket
   * → skirt → seat) lives between that line and here, so nothing sinks into
   * the horse. The seated 1.83m Ranger's back now reads at his chest/waist
   * height, like a real riding horse.
   */
  saddleTopY: 1.83 * HORSE_SCALE,
  /**
   * Stirrup-tread reference height (tread top = boot bottom): 1.046m.
   * Derived from the SOLVED seated leg chain against this scaled geometry —
   * see MountChoreography.applyRiderPose and scripts/mount-solver.mjs (the
   * solver verifies pelvis-on-seat / boots-on-treads / knees-outside for
   * every shipped constant).
   */
  riderFeetY: 1.245 * HORSE_SCALE,
  /** Rider root sits slightly behind the torso center, on the saddle. */
  riderZ: 0.08 * HORSE_SCALE,
  // --- Physics capsule --------------------------------------------------------
  /** Collision capsule radius (body half-width + mane margin). */
  collisionRadius: 0.55 * HORSE_SCALE,
  /** Collision capsule height above the feet. */
  collisionHeight: 1.9 * HORSE_SCALE,
  /** Step-up limit (matches the player's 0.35 + a small hoof margin).
   *  Gameplay ability — deliberately NOT scaled. */
  stepHeight: 0.4,
} as const;

// --- First-person ride-cam eye (the mounted-cowboy view) ---------------------
/**
 * Eye rise above the pelvis for the upright seated 1.83m Ranger:
 * standing eye 1.70 (CharacterProportions.eyeHeight) − standing hip 0.96
 * (CharacterProportions.hipY) = 0.74. Duplicated here as a literal (same
 * convention as MountChoreography — no cross-package import): the mounted
 * pelvis sits ON the saddle seat, so the mounted eye is seat-relative.
 */
export const RIDER_SEATED_EYE_RISE = 0.74;
/**
 * FP ride-cam eye height above the HORSE's feet: pelvis on the seat
 * (saddleTopY) + the seated torso rise = 1.5372 + 0.74 ≈ 2.277m.
 *
 * ROOT CAUSE this fixes (user report: «صورت و سر اسب دیده نمی‌شود»): the old
 * FP eye used the STANDING formula on the STIRRUP plane —
 * riderFeetY + eyeHeight = 1.046 + 1.70 = 2.746m, ≈0.65m ABOVE the ear tips
 * (totalHeight 2.10). At neutral pitch the muzzle sat ~38° below the view
 * axis vs a 35° half-FOV: the whole head/ears/mane were out of the frustum
 * and riding felt like drone flight. The seated eye (2.277m) rides just
 * above the poll, so the head/ears/mane/neck crest fill the bottom of the
 * frame — a real cowboy's view — while the eye stays clear of every horse
 * surface (ears reach 2.10 at z ≈ −0.75; the eye is at z ≈ +0.07 behind the
 * withers). Walking first person is untouched: this constant only feeds the
 * riding branch of the camera code.
 */
export const RIDER_SEATED_EYE_Y = HORSE_PROPORTIONS.saddleTopY + RIDER_SEATED_EYE_RISE;
/**
 * FP ride-cam horizontal offset from the horse's yaw axis (behind the torso
 * center, above the seat center): the same seat anchor the rider socket and
 * the mount pose use — the eye sits where the seated head actually is.
 */
export const RIDER_SEATED_EYE_Z = HORSE_PROPORTIONS.riderZ;

/** The four forward gaits + reverse + standstill. */
export type HorseGait = 'idle' | 'walk' | 'trot' | 'canter' | 'gallop';

export interface GaitSpec {
  /** Steady-state speed (m/s) — gameplay tuning, NOT scaled. */
  speed: number;
  /** Acceleration toward this gait's speed (m/s²) — not scaled. */
  acceleration: number;
  /** Ground stride length (m) — scales with the animal (drives the
   *  leg-cycle rate = speed / stride). */
  stride: number;
  /** Leg swing amplitude (rad) — angular, scale-invariant. */
  swing: number;
  /** Body bob amplitude (m) — scales with the animal. */
  bob: number;
}

export const HORSE_GAITS: Record<HorseGait, GaitSpec> = {
  idle: { speed: 0, acceleration: 0, stride: 1, swing: 0, bob: 0 },
  walk: { speed: 1.7, acceleration: 2.6, stride: 1.7 * HORSE_SCALE, swing: 0.4, bob: 0.018 * HORSE_SCALE },
  trot: { speed: 4.2, acceleration: 3.1, stride: 2.8 * HORSE_SCALE, swing: 0.56, bob: 0.042 * HORSE_SCALE },
  canter: { speed: 7.0, acceleration: 3.6, stride: 3.8 * HORSE_SCALE, swing: 0.72, bob: 0.05 * HORSE_SCALE },
  gallop: { speed: 11.5, acceleration: 4.2, stride: 4.9 * HORSE_SCALE, swing: 0.95, bob: 0.085 * HORSE_SCALE },
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

/** AI tuning (distances in meters, timers in seconds).
 *  COMMAND MODEL note: there are NO follow distances — the horse never
 *  autonomously follows the player (controls revision §1). AI distances are
 *  PLAYER-space gameplay radii — deliberately NOT scaled. */
export const HORSE_AI = {
  /** Summon arrives at this distance — inside the 2.6m mount range so a
   *  summon can always be answered with an immediate mount (final-polish
   *  revision: closes the long-noted 2.7-vs-2.6 arrival gap). */
  summonArrive: 2.4,
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
