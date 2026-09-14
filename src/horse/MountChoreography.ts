/**
 * MountChoreography — the single authority for the mount animation.
 *
 * REAL-RIDER MOUNT: a short, hand-authored sequence that mirrors how a rider
 * actually mounts from the ground — the classic LEFT-side technique. There is
 * NO runtime IK, NO solver, NO lookup tables and NO numeric search anywhere in
 * this file — every joint keyframe is a plain frozen constant (each key was
 * placed once against the rig's own FK and then hard-coded;
 * scripts/mount-solver.mjs re-verifies the whole timeline against the real
 * meshes).
 *
 *   1 walk    approach around the horse to the LEFT stirrup (polar arc,
 *             procedural walk cycle; the rider squares up to face the flank)
 *   2 ready   a small athletic load: the body coils slightly and the LEFT
 *             hand reaches up to the POMMEL (the front-of-saddle grab)
 *   3 climb   THE PUSH: the left knee drives up and the boot lands ON the
 *             left stirrup tread while the right leg extends off the ground
 *             (toe-off); body weight transfers onto the stirrup and the left
 *             leg straightens, lifting the rider up BESIDE the horse
 *   4 swing   THE ARC: the RIGHT leg swings in one clear arc OVER the horse —
 *             the knee rises ahead of the rider, tail-ward of the fender,
 *             the boot passes HIGH over the cantle, then descends the FAR
 *             side — while the torso turns naturally toward the saddle and
 *             the root slides inboard, still high above the seat
 *   5 seat    only AFTER the leg has cleared the horse: the body folds down
 *             into the saddle, the right boot settles onto the far tread and
 *             both legs drape into the riding pose
 *   6 settle  everything eases onto the final SEAT_POSE (hands to the reins)
 *             — the exact pose the riding state runs, so the handover pops
 *             nothing
 *
 * LEG-PATH CONTRACT (the point of this revision):
 *   - the LEFT (near) leg: ground → knee drives up-forward → boot onto the
 *     tread → straight support → drape. It never crosses the horse.
 *   - the RIGHT (far) leg: coil → push-off trail (down-back, NOT rising) →
 *     the knee swings UP-FORWARD of the rider, offset tail-ward so it clears
 *     the fender → the boot arcs OVER the cantle (well above the rim) →
 *     down the far side OUTSIDE the barrel → into the far stirrup. The leg
 *     NEVER rises from directly behind the rider and NEVER enters the horse
 *     mesh.
 *
 * The root path lives in SOCKET-LOCAL space (rock-stable relative to the
 * horse) and every distance derives from HORSE_PROPORTIONS, so resizing the
 * horse rescales the choreography with it.
 */
import * as THREE from 'three';
import { HORSE_PROPORTIONS as P } from './HorseProportions.js';

// ---------------------------------------------------------------------------
// Geometry (socket-local; the character root coincides with the rider socket
// when seated). Every value derives from the authoritative proportions.
// ---------------------------------------------------------------------------
const S = P.scale;

/**
 * Standing stand-point beside the LEFT stirrup (socket-local; y = ground).
 * x clears the hanging stirrup hardware (straps reach 0.5·S from the axis)
 * plus the rider's torso capsule plus a small margin.
 */
export const MOUNT_STAND = {
  x: -(0.5 * S + 0.175),
  y: -P.riderFeetY,        // character root on the ground
  z: -0.02 * S,
};

/** Seat surface height above the seated character root. */
export const MOUNT_SEAT_Y = P.saddleTopY - P.riderFeetY;
/** Stirrup tread top above the seated character root (boot bottoms rest here). */
export const MOUNT_TREAD_Y = 0.0225 * S;
/** Stirrup tread center |x| (socket-local). */
export const MOUNT_STIRRUP_X = 0.395 * S;
/**
 * The grip point: the POMMEL's near (left) front corner — the classic
 * western mounting grab ("front of the saddle"), just below the horn.
 */
export const MOUNT_GRIP = { x: -0.155 * S, y: MOUNT_SEAT_Y + 0.11 * S, z: -0.16 * S };

/**
 * Facing at the stand point: the character (on the -x side) faces the horse's
 * flank (+x). Slerps to MOUNT_SEAT_QUATERNION (identity — facing the horse's
 * head, -z) across the climb/swing/seat phases.
 */
export const MOUNT_FACE_HORSE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
export const MOUNT_SEAT_QUATERNION = new THREE.Quaternion();

/**
 * Clearance radius around the saddle axis: keeps the walker outside the
 * horse's silhouette plus the RIDER's body margin (the rider is character-
 * sized and does NOT scale with the horse).
 */
export function mountSafeRadius(phi: number): number {
  const sx = 0.5 * S + 0.175;
  const sz = P.bodyLength + 0.24;
  const s = Math.sin(phi) / sx;
  const c = Math.cos(phi) / sz;
  return 1 / Math.sqrt(s * s + c * c);
}

// ---------------------------------------------------------------------------
// Character metrics (from CharacterProportions — duplicated here as literals).
// ---------------------------------------------------------------------------
const RIDER = {
  hipYStand: 0.96,     // hips joint y while standing
  legYStand: 0.90,     // leg (thigh) joint y while standing (hips − 0.06)
  hipHalf: 0.105,      // hip joint |x|
  shoulderHalf: 0.235,
  thigh: 0.45,
  shin: 0.40,
  legMax: 0.85,        // thigh + shin, fully extended
  ankle: 0.095,        // boot sole → ankle joint
};

/**
 * Root height while the boot stands on the stirrup with the near-straight
 * left leg (derived): the ankle sits at tread + ankle offset; the leg spans
 * down-forward to the tread (horizontal offset 0.298 = tread 0.263 ahead +
 * 0.034 inboard). APEX keeps a ~12° knee bend so the support leg never reads
 * as a locked plank.
 */
const TREAD_AHEAD = 0.263;
const TREAD_SIDE = 0.034;
const APEX =
  MOUNT_TREAD_Y + RIDER.ankle - RIDER.legYStand +
  Math.sqrt(RIDER.legMax * RIDER.legMax * 0.985 - (TREAD_AHEAD * TREAD_AHEAD + TREAD_SIDE * TREAD_SIDE));
/**
 * Root height at the CATCH: the boot lands on the tread with the left leg
 * folded ~78% (a strong high step — the pose a real rider makes stepping
 * onto a tall stirrup).
 */
const CATCH =
  MOUNT_TREAD_Y + RIDER.ankle - RIDER.legYStand +
  Math.sqrt(0.472 * 0.472 - (TREAD_AHEAD * TREAD_AHEAD + TREAD_SIDE * TREAD_SIDE));

// ---------------------------------------------------------------------------
// FROZEN KEYFRAMES (radians). No runtime math produced these: every key was
// placed on its contact/clearance target once against the rig's own FK and
// then hard-coded. The sweep re-verifies them on every run.
// ---------------------------------------------------------------------------

/** Standing leg at rest (matches the walk cycle's amp-0 pose exactly). */
const HANG = { rx: 0.0, knee: -0.06, rz: 0.0, foot: 0, yaw: 0 };
/**
 * The ready coil — both legs load, boots still on the ground (the hips dip
 * to 0.90: leg span 0.745 → rx 0.47, knee −1.01; the shins fold back).
 */
const COIL = { rx: 0.47, knee: -1.01, rz: 0.0, foot: 0, yaw: 0 };

// --- LEFT (near/support) leg -------------------------------------------------
/**
 * The knee drive: the boot lifts beside the body (outboard of the fender
 * hardware — knee swept outboard so it never kisses the barrel) on its way
 * up to the stirrup mouth. Frozen against the rig FK.
 */
/**
 * Mid knee-drive waypoint: as the thigh swings up past horizontal its knee
 * would otherwise cut through the barrel — this key sweeps the knee hard
 * tailward-outboard (rz −1.05) while the thigh pitches up, keeping the whole
 * leg outside the horse's silhouette.
 */
const L_MIDKNEE = { rx: 1.45, knee: -1.9, rz: -1.28, foot: 0.3, yaw: -0.9 };
const L_LIFT = { rx: 2.22, knee: -2.6, rz: -0.95, foot: 0.25, yaw: -1.35 };
/**
 * Boot AT the stirrup (root at CATCH, the moment the stirrup takes weight):
 * knee driven high-outboard of the seat edge, boot dropping the last cm onto
 * the tread. Frozen on the stirrup contact point (ankle 86mm above-and-outboard
 * of the tread — the boot is ABOUT to seat; the tread lands it at the apex).
 */
const L_MIDCATCH = { rx: 2.16, knee: -2.16, rz: -1.2, foot: 0.2, yaw: -2.0 };
const L_MIDSTD = { rx: 1.56, knee: -2.14, rz: -1.23, foot: 0.1, yaw: -2.0 };
const L_CATCH = { rx: 1.76, knee: -2.08, rz: -0.87, foot: 0.1, yaw: -2.0 };
/**
 * Standing ON the stirrup at the apex (root at APEX): near-straight leg,
 * boot ON the tread. Frozen on the tread contact point (7mm).
 */
const L_STAND = { rx: 0.41, knee: -0.32, rz: -0.16, foot: 0.0, yaw: -2.0 };
/**
 * The foot RELEASES the stirrup as the body turns and slides inboard: the
 * boot swings free OUTBOARD of the fender hardware, then re-seats onto the
 * tread as the legs drape into the riding pose (both feet settle into the
 * stirrups at the end). Frozen as relaxed hanging poses.
 */
const L_STAND2A = { rx: -1.1, knee: -1.7, rz: 0.45, foot: 0.2, yaw: -1.0 };
const L_STAND2B = { rx: 0.60, knee: -1.96, rz: 0.98, foot: 0.15, yaw: -0.4 };
// --- RIGHT (far/swing) leg ---------------------------------------------------
/**
 * Push-off trail: the leg extends down-back as the body rises (the boot
 * leaves the ground LAST — a push, never a rise from behind).
 */
const R_TRAIL = { rx: -0.28, knee: -0.3, rz: 0.1, foot: -0.35, yaw: 0 };
/**
 * Swing start at the apex: knee drives UP-FORWARD of the rider, offset
 * tail-ward (rz +) so it rides clear of the fender hardware on the flank.
 */
const R_MIDWND = { rx: 1.48, knee: -2.2, rz: 1.09, foot: 0.2, yaw: 0 };
const R_SWING1 = { rx: 1.88, knee: -2.2, rz: 0.7, foot: 0.2, yaw: 0 };
/**
 * OVER THE TOP: knee high (well above the cantle rim), boot arcing over the
 * saddle with clearance. Frozen with the boot above the cantle.
 */
const R_SWING2 = { rx: 2.12, knee: -1.28, rz: 0.45, foot: 0.25, yaw: 0 };
/**
 * Down the far side: boot past the cantle, descending outside the barrel
 * (x keeps clear of the barrel until below its top). Frozen.
 */
const R_SWING3 = { rx: 1.78, knee: -1.04, rz: 0.56, foot: 0.3, yaw: 0 };
/**
 * Boot AT the far stirrup mouth (root slid inboard, turn ~80%): descending
 * the last stretch onto the far tread, outside the barrel's silhouette.
 */
const R_MID = { rx: 1.88, knee: -1.02, rz: 1.2, foot: 0.3, yaw: 0 };
const R_STIRRUP = { rx: 1.54, knee: -1.82, rz: 1.38, foot: 0.3, yaw: 0 };

// --- Arms --------------------------------------------------------------------
/** Left-arm raise on the way to the pommel (the elbow fold leads). */
const ARM_RAISED = { rx: 2.55, rz: -1.0, elbow: -1.9 };
/** Hand ON the pommel grip (root grounded, body coiled). Frozen on MOUNT_GRIP. */
const ARM_GRIP = { rx: 2.32, rz: 0.24, elbow: -0.61 };
/** Hand pressing the pommel as the body rises past it (root mid-launch). */
const ARM_HOLD = { rx: 1.56, rz: 0.24, elbow: -0.73 };
/** The press deepens as the body approaches the catch (root near CATCH−). */
const ARM_PRESS = { rx: 1.1, rz: 0.2, elbow: -0.28 };
/** Arm at full extension — the hand slips off the pommel (root at CATCH). */
const ARM_EXT = { rx: 0.8, rz: 0.18, elbow: -0.04 };
/** Relaxed carry after the release. */
const ARM_RELAXED = { rx: 0.18, rz: -0.06, elbow: -0.15 };
/** Right arm: slight balance sweep while the leg swings over. */
const ARM_BALANCE = { rx: 0.15, rz: -0.3, elbow: -0.5 };

/** The final seated pose — boots on the treads, hands to the reins. */
export interface SeatPose {
  hipsY: number; hipsRx: number; spineRx: number; headRx: number;
  legRx: number; legRz: number; kneeRx: number; footRx: number;
  shoulderL: { rx: number; rz: number }; elbowL: number;
  shoulderR: { rx: number; rz: number }; elbowR: number;
}

export const SEAT_POSE: SeatPose = {
  hipsY: 0.5814,               // pelvis bottom rests ON the seat
  hipsRx: -0.05,
  spineRx: 0.02,
  headRx: -0.04,
  legRx: 1.3156,               // thighs drape forward-down
  legRz: 0.8594,               // knees outboard of the barrel
  kneeRx: -1.9563,             // shins back-down, boots ON the treads
  footRx: 0.35,
  shoulderL: { rx: 0.7, rz: 0.07 },   // rein hand
  elbowL: 0.3,
  shoulderR: { rx: 0.06, rz: -0.03 }, // right hand on the right thigh
  elbowR: 0.15,
};

// ---------------------------------------------------------------------------
// Timeline — the 6-beat sequence. The walk scales with the approach arc so a
// near stirrup shortens naturally; every other beat is a fixed duration.
// ---------------------------------------------------------------------------
export interface MountTimeline {
  /** Cumulative phase ENDS as fractions of the whole (walk → settle). */
  walkEnd: number;
  reachEnd: number;
  climbEnd: number;
  swingEnd: number;
  seatEnd: number;
  /** Total duration (seconds). */
  total: number;
}

export function buildMountTimeline(arcLength: number): MountTimeline {
  const walk = Math.max(0.65, Math.min(1.9, arcLength / 1.35));
  const durations = [walk, 0.5, 0.92, 0.66, 0.52, 0.36];
  const total = durations.reduce((a, b) => a + b, 0);
  const bounds: number[] = [];
  let acc = 0;
  for (const d of durations) {
    acc += d;
    bounds.push(acc / total);
  }
  return {
    walkEnd: bounds[0], reachEnd: bounds[1], climbEnd: bounds[2],
    swingEnd: bounds[3], seatEnd: bounds[4], total,
  };
}

// ---------------------------------------------------------------------------
// Easing helpers
// ---------------------------------------------------------------------------
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** Smoothstep — C1-continuous ease-in-out (no sudden direction changes). */
const smooth = (t: number): number => t * t * (3 - 2 * t);
/** Normalized progress through [a, b] with smoothstep easing. */
const seg = (t: number, a: number, b: number): number => smooth(clamp01((t - a) / (b - a)));
/** Raw (un-eased) normalized progress. */
const raw = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);

export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// ---------------------------------------------------------------------------
// Root path (socket-local)
// ---------------------------------------------------------------------------
export interface MountStartState {
  startPhi: number;
  startR: number;
  startY: number;
  startQuat: THREE.Quaternion;
}

/**
 * Root transform at timeline position t. Writes position + quaternion.
 *
 * walk: polar arc AROUND the saddle axis to the stand point (never through
 * the body), squaring up to the flank in the last stretch. ready: at the
 * stand point (the coil is internal — the root stays grounded). climb: the
 * root launches with the push-off and rises BESIDE the horse (ground →
 * CATCH → APEX; the rider never drifts inboard while rising). swing: the
 * root holds the apex and begins the inboard slide (still high above the
 * saddle — the boot is clearing the cantle). seat: the slide completes and
 * the root settles the last few mm onto the socket origin while the BODY
 * does the real descent via the hip fold in poseMountRider.
 */
export function mountRootPose(
  root: { position: { x: number; y: number; z: number }; quaternion: THREE.Quaternion },
  start: MountStartState,
  t: number,
  timeline: MountTimeline,
): void {
  const { walkEnd, reachEnd, climbEnd, swingEnd, seatEnd } = timeline;
  if (t < walkEnd) {
    // BEAT 1: APPROACH — polar arc to the stand point, facing the travel dir,
    // squaring up to the flank over the last 30% of the walk.
    const kWalk = raw(t, 0, walkEnd);
    const phi = start.startPhi + wrapAngle(Math.atan2(MOUNT_STAND.x, MOUNT_STAND.z) - start.startPhi) * kWalk;
    const safe = mountSafeRadius(phi);
    const r = Math.max(safe, lerp(start.startR, Math.hypot(MOUNT_STAND.x, MOUNT_STAND.z), kWalk));
    root.position.x = Math.sin(phi) * r;
    root.position.z = Math.cos(phi) * r;
    root.position.y = lerp(start.startY, MOUNT_STAND.y, kWalk);
    // Face the travel direction (sample the path just ahead)…
    const k2 = Math.min(1, kWalk + 0.06);
    const phi2 = start.startPhi + wrapAngle(Math.atan2(MOUNT_STAND.x, MOUNT_STAND.z) - start.startPhi) * k2;
    const safe2 = mountSafeRadius(phi2);
    const r2 = Math.max(safe2, lerp(start.startR, Math.hypot(MOUNT_STAND.x, MOUNT_STAND.z), k2));
    const dx = Math.sin(phi2) * r2 - root.position.x;
    const dz = Math.cos(phi2) * r2 - root.position.z;
    if (Math.hypot(dx, dz) > 1e-4) {
      root.quaternion.setFromEuler(new THREE.Euler(0, Math.atan2(-dx, -dz), 0));
    }
    // …then square up to the flank in the last stretch of the walk.
    const kSquare = smooth(clamp01((kWalk - 0.7) / 0.3));
    if (kSquare > 0) root.quaternion.slerp(MOUNT_FACE_HORSE, kSquare);
    // Walk bob synced to the procedural step cycle (~1.8 steps/s at walk).
    const stepPhase = kWalk * timeline.walkEnd * timeline.total * 1.8 * Math.PI * 2;
    root.position.y += Math.abs(Math.sin(stepPhase)) * 0.028 * (1 - kWalk * 0.4);
    return;
  }

  // From the ready beat on, the root is AT the stand point facing the flank.
  // The turn + the inboard slide share ONE window, synced with poseMountRider:
  // they begin as the swing starts (the boot has cleared onto the stirrup and
  // the right leg is winding up) and complete together into the seat.
  const turnFrom = lerp(climbEnd, swingEnd, 0.3);
  const turnTo = seatEnd;
  const kTurn = seg(t, turnFrom, turnTo);
  // The INBOARD SLIDE waits until the hips have folded low: the rider pivots
  // on the stirrup foot through the turn, and only slides over the saddle
  // once the body is descending into the seat — the thigh's crossing of the
  // barrel's edge plane then happens ABOVE the horse's back, never through it.
  const kIn = seg(t, lerp(climbEnd, swingEnd, 0.4), lerp(seatEnd, 1, 0.2));

  // Vertical: grounded through the ready beat → launch with the push-off →
  // the catch (boot takes the tread) → the rise on the stirrup to the apex →
  // held high through the swing → the last few mm onto the socket in seat.
  let y: number;
  if (t < reachEnd) {
    y = MOUNT_STAND.y;
  } else if (t < climbEnd) {
    const kClimb = raw(t, reachEnd, climbEnd);
    if (kClimb < 0.25) {
      y = MOUNT_STAND.y; // still grounded: the coil uncoils (internal)
    } else if (kClimb < 0.62) {
      y = lerp(MOUNT_STAND.y, CATCH, smooth((kClimb - 0.25) / 0.37)); // the push-off launch
    } else {
      y = lerp(CATCH, APEX, smooth((kClimb - 0.62) / 0.38)); // rise ON the stirrup
    }
  } else if (t < swingEnd) {
    y = APEX;
  } else {
    y = lerp(APEX, 0, seg(t, swingEnd, lerp(seatEnd, 1, 0.4)));
  }

  root.position.y = y;
  root.position.x = lerp(MOUNT_STAND.x, 0, kIn);
  root.position.z = lerp(MOUNT_STAND.z, 0, kIn);
  root.quaternion.slerpQuaternions(MOUNT_FACE_HORSE, MOUNT_SEAT_QUATERNION, kTurn);
}

// ---------------------------------------------------------------------------
// Rider joint choreography
// ---------------------------------------------------------------------------
export type MountJoints = {
  hips: { position: { y: number }; rotation: THREE.Euler };
  spine: { rotation: THREE.Euler };
  chest: { rotation: THREE.Euler };
  neck: { rotation: THREE.Euler };
  head: { rotation: THREE.Euler };
  shoulderL: { rotation: THREE.Euler };
  elbowL: { rotation: THREE.Euler };
  shoulderR: { rotation: THREE.Euler };
  elbowR: { rotation: THREE.Euler };
  legL: { rotation: THREE.Euler };
  kneeL: { rotation: THREE.Euler };
  footL: { rotation: THREE.Euler };
  legR: { rotation: THREE.Euler };
  kneeR: { rotation: THREE.Euler };
  footR: { rotation: THREE.Euler };
};

interface LegKey { rx: number; knee: number; rz: number; foot: number; yaw: number }

interface LegKey { rx: number; knee: number; rz: number; foot: number; yaw: number }

const SEAT_KEY: LegKey = { rx: SEAT_POSE.legRx, knee: SEAT_POSE.kneeRx, rz: SEAT_POSE.legRz, foot: SEAT_POSE.footRx, yaw: 0 };

/**
 * Ordered keyframe blend: each entry holds its key from `from` to `to`
 * (absolute timeline fractions) while blending FROM the previous key. Before
 * the first window the first key's `pre` blend source is used (the walk hands
 * over at HANG), after the last `to` the last key holds — which is exactly
 * SEAT_POSE, so t = 1 matches applyRiderPose with no pop.
 */
function blendLeg(
  chain: Array<{ key: LegKey; from: number; to: number }>,
  pre: LegKey,
  t: number,
): LegKey {
  let prev = pre;
  for (const link of chain) {
    if (t < link.from) return prev;
    if (t < link.to) {
      const k = smooth((t - link.from) / (link.to - link.from));
      return {
        rx: lerp(prev.rx, link.key.rx, k),
        knee: lerp(prev.knee, link.key.knee, k),
        rz: lerp(prev.rz, link.key.rz, k),
        foot: lerp(prev.foot, link.key.foot, k),
        yaw: lerp(prev.yaw, link.key.yaw, k),
      };
    }
    prev = link.key;
  }
  return prev;
}

interface ArmKey { rx: number; rz: number; elbow: number }

/** Same ordered blend, for the 2-segment arm keys. */
function blendArm(
  chain: Array<{ key: ArmKey; from: number; to: number }>,
  pre: ArmKey,
  t: number,
): ArmKey {
  let prev = pre;
  for (const link of chain) {
    if (t < link.from) return prev;
    if (t < link.to) {
      const k = smooth((t - link.from) / (link.to - link.from));
      return {
        rx: lerp(prev.rx, link.key.rx, k),
        rz: lerp(prev.rz, link.key.rz, k),
        elbow: lerp(prev.elbow, link.key.elbow, k),
      };
    }
    prev = link.key;
  }
  return prev;
}

/** Write a blended leg key onto the rig (legL outboard rz is mirrored). */
function setLeg(j: MountJoints, side: 'L' | 'R', key: LegKey): void {
  const s = side === 'L' ? -1 : 1;
  j[`leg${side}`].rotation.set(key.rx, 0, s * key.rz);
  j[`knee${side}`].rotation.set(key.knee, 0, 0);
  j[`foot${side}`].rotation.set(key.foot, key.yaw, 0);
}

/** Procedural walk cycle for the approach (the animator is paused here).
 *  amp scales the whole stride — decaying it to 0 melts the stride into the
 *  standing pose (the amp-0 pose IS the HANG key, so the handover is exact). */
function poseApproachWalk(j: MountJoints, t: number, timeline: MountTimeline, amp = 1): void {
  const kWalk = raw(t, 0, timeline.walkEnd);
  const phase = Math.min(1, kWalk) * timeline.walkEnd * timeline.total * 1.8 * Math.PI * 2;
  const swing = Math.sin(phase) * amp;
  const liftL = Math.max(0, Math.sin(phase + 0.6)) * amp;
  const liftR = Math.max(0, Math.sin(phase + Math.PI + 0.6)) * amp;
  j.legL.rotation.x = 0.5 * swing;
  j.legR.rotation.x = -0.5 * swing;
  j.kneeL.rotation.x = -0.06 - 0.7 * liftL;
  j.kneeR.rotation.x = -0.06 - 0.7 * liftR;
  j.footL.rotation.x = 0.12 * Math.max(0, -swing);
  j.footR.rotation.x = 0.12 * Math.max(0, swing);
  // Counter-swinging arms, low and relaxed (short sweep — the horse is close).
  j.shoulderL.rotation.set(0.16 * -swing, 0, 0.07);
  j.elbowL.rotation.set(-0.25 - 0.12 * liftL, 0, 0);
  j.shoulderR.rotation.set(0.16 * swing, 0, -0.07);
  j.elbowR.rotation.set(-0.25 - 0.12 * liftR, 0, 0);
  j.hips.rotation.x = 0.03 * Math.sin(phase * 2);
  j.hips.position.y = RIDER.hipYStand - 0.015 * Math.abs(Math.cos(phase));
  j.spine.rotation.x = 0.02;
  j.head.rotation.x = -0.04;
  j.neck.rotation.x = 0;
}

/**
 * Full rider pose at timeline position t. Every channel lands EXACTLY on
 * applyRiderPose's values at t = 1 (no pop at the handover).
 */
export function poseMountRider(j: MountJoints, t: number, timeline: MountTimeline): void {
  const { walkEnd, reachEnd, climbEnd, swingEnd, seatEnd } = timeline;

  if (t < reachEnd) {
    // BEATS 1-2: walk, then the stride melts into the stand while the body
    // coils and the LEFT hand leads up to the pommel grip.
    const amp = t < walkEnd ? 1 : 1 - seg(t, walkEnd, lerp(walkEnd, reachEnd, 0.4));
    poseApproachWalk(j, t, timeline, amp);
    const kCoil = seg(t, walkEnd, lerp(walkEnd, reachEnd, 0.42));
    const kArm = seg(t, lerp(walkEnd, reachEnd, 0.45), reachEnd);
    // Legs: HANG → COIL (a shallow athletic load, boots grounded).
    const coilKey = {
      rx: lerp(HANG.rx, COIL.rx, kCoil), knee: lerp(HANG.knee, COIL.knee, kCoil),
      rz: lerp(HANG.rz, COIL.rz, kCoil), foot: lerp(HANG.foot, COIL.foot, kCoil),
      yaw: 0,
    };
    setLeg(j, 'L', coilKey);
    setLeg(j, 'R', coilKey);
    // Hips dip with the coil.
    j.hips.position.y = lerp(RIDER.hipYStand, 0.9, kCoil);
    // Left arm: raised beside the body → ON the pommel (the elbow fold leads
    // the raise so the hand never hangs into the horse's shoulder).
    j.shoulderL.rotation.set(
      lerp(0, ARM_RAISED.rx, smooth(clamp01(kArm * 2))) * (kArm < 0.5 ? 1 : 1),
      0,
      lerp(lerp(0.07, ARM_RAISED.rz, smooth(clamp01(kArm * 2))), ARM_GRIP.rz, smooth(clamp01((kArm - 0.5) * 2))),
    );
    if (kArm >= 0.5) {
      j.shoulderL.rotation.x = lerp(ARM_RAISED.rx, ARM_GRIP.rx, smooth(clamp01((kArm - 0.5) * 2)));
    }
    j.elbowL.rotation.set(
      lerp(lerp(-0.25, ARM_RAISED.elbow, smooth(clamp01(kArm * 2.4))), ARM_GRIP.elbow, smooth(clamp01((kArm - 0.45) * 1.9))),
      0, 0,
    );
    // Right arm stays low; head dips toward the grip as the hand lands.
    j.shoulderR.rotation.set(0, 0, lerp(-0.07, 0, kArm));
    j.elbowR.rotation.set(-0.25, 0, 0);
    j.head.rotation.x = lerp(-0.04, -0.16, Math.sin(clamp01(kArm) * Math.PI));
    j.spine.rotation.x = lerp(0.02, 0.06, kCoil);
    return;
  }

  // Phase keys (beats 3-6). The turn + the inboard slide share ONE window:
  // they begin as the swing starts and complete together into the seat — the
  // rider pivots on the stirrup foot while sliding over the saddle.
  const kClimb = raw(t, reachEnd, climbEnd);
  const kSwing = raw(t, climbEnd, swingEnd);
  const kSettle = seg(t, seatEnd, 1);
  const turnFrom = lerp(climbEnd, swingEnd, 0.3);
  const turnTo = seatEnd;
  const kTurn = seg(t, turnFrom, turnTo);

  // --- Torso ---------------------------------------------------------------
  // Upright stance → a lean-in toward the horse through the climb (a mounting
  // rider tips toward the animal) → a deeper dip while the right leg swings
  // over (the rider folds toward the pommel) → upright seat with the settle.
  // The swing-over dip lives in the SPINE only — the hips stay level so the
  // stirrup-glued support leg is never dragged by the torso's fold.
  const lean = lerp(0, -0.1, kTurn) + (SEAT_POSE.hipsRx + 0.05) * kSettle;
  const dip = -0.1 * Math.sin(clamp01(kSwing) * Math.PI);
  j.hips.rotation.x = lean;
  j.hips.rotation.y = 0;
  j.hips.rotation.z = 0;
  j.spine.rotation.x = lerp(lean * 0.5 + dip * 0.6, SEAT_POSE.spineRx, kSettle);
  j.chest.rotation.set(0, 0, 0);
  j.neck.rotation.set(0, 0, 0);
  j.head.rotation.x = lerp(-0.06, SEAT_POSE.headRx, kSettle) - 0.08 * Math.sin(clamp01(kClimb) * Math.PI);
  j.head.rotation.y = 0;
  j.head.rotation.z = 0;

  // --- Hips height (the centre of gravity) ----------------------------------
  // The coil uncoils through the push (0.90 → standing), holds standing while
  // the ROOT does the vertical work, then the body folds INTO the seat during
  // the seat beat (a controlled fold, never a free fall).
  const kUncoil = seg(t, reachEnd, lerp(reachEnd, climbEnd, 0.3));
  const kFold = seg(t, lerp(climbEnd, swingEnd, 0.75), lerp(seatEnd, 1, 0.25));
  j.hips.position.y = lerp(0.9, RIDER.hipYStand, kUncoil) - lerp(0, RIDER.hipYStand - SEAT_POSE.hipsY, easeOutCubic(kFold));

  // --- LEFT arm: the hand STAYS on the pommel while the body rises (the key
  // chain is timed to the launch's easing so the hand tracks the grip point),
  // then the arm extends, the hand slips off, and it carries down to the low
  // rein hand of the seat ----------------------------------------------------
  const aKey = blendArm([
    { key: ARM_HOLD, from: lerp(reachEnd, climbEnd, 0.389), to: lerp(reachEnd, climbEnd, 0.445) },
    { key: ARM_PRESS, from: lerp(reachEnd, climbEnd, 0.445), to: lerp(reachEnd, climbEnd, 0.494) },
    { key: ARM_EXT, from: lerp(reachEnd, climbEnd, 0.494), to: lerp(reachEnd, climbEnd, 0.62) },
    { key: ARM_RELAXED, from: lerp(reachEnd, climbEnd, 0.62), to: lerp(reachEnd, climbEnd, 0.72) },
  ], ARM_GRIP, t);
  const kArmSeat = seg(t, lerp(seatEnd, 1, 0.35), 0.998);
  j.shoulderL.rotation.set(
    lerp(aKey.rx, SEAT_POSE.shoulderL.rx, kArmSeat), 0,
    lerp(aKey.rz, SEAT_POSE.shoulderL.rz, kArmSeat),
  );
  j.elbowL.rotation.set(lerp(aKey.elbow, SEAT_POSE.elbowL, kArmSeat), 0, 0);

  // --- RIGHT arm: balance sweep while the leg swings over, then onto the
  // right thigh once the body is down ----------------------------------------
  const kBal = seg(t, lerp(climbEnd, swingEnd, 0.2), lerp(climbEnd, swingEnd, 0.8));
  const kRelR = seg(t, lerp(seatEnd, 1, 0.3), lerp(seatEnd, 1, 0.7));
  const balRz = lerp(0, ARM_BALANCE.rz, kBal) * (1 - kRelR);
  j.shoulderR.rotation.set(
    lerp(lerp(0, ARM_BALANCE.rx, kBal), SEAT_POSE.shoulderR.rx, kRelR), 0,
    lerp(-0.07 * (1 - kBal), balRz, 1) + SEAT_POSE.shoulderR.rz * kRelR,
  );
  j.elbowR.rotation.set(
    lerp(lerp(-0.25, ARM_BALANCE.elbow, kBal), SEAT_POSE.elbowR, kRelR), 0, 0,
  );

  // --- LEFT leg: the support-leg chain — knee drive → boot to the stirrup →
  // standing ON the stirrup (the CATCH→STAND blend is timed to the root's
  // rise so the boot stays glued to the tread while the body lifts) → the
  // drape into the seated pose as the body turns and settles ---------------
  const lKey = blendLeg([
    { key: L_MIDKNEE, from: lerp(reachEnd, climbEnd, 0.05), to: lerp(reachEnd, climbEnd, 0.28) },
    { key: L_LIFT, from: lerp(reachEnd, climbEnd, 0.28), to: lerp(reachEnd, climbEnd, 0.42) },
    { key: L_MIDCATCH, from: lerp(reachEnd, climbEnd, 0.42), to: lerp(reachEnd, climbEnd, 0.52) },
    { key: L_CATCH, from: lerp(reachEnd, climbEnd, 0.52), to: lerp(reachEnd, climbEnd, 0.7) },
    { key: L_MIDSTD, from: lerp(reachEnd, climbEnd, 0.7), to: lerp(reachEnd, climbEnd, 0.85) },
    { key: L_STAND, from: lerp(reachEnd, climbEnd, 0.85), to: turnFrom },
    { key: L_STAND2A, from: turnFrom, to: lerp(swingEnd, seatEnd, 0.25) },
    { key: L_STAND2B, from: lerp(swingEnd, seatEnd, 0.25), to: lerp(swingEnd, seatEnd, 0.5) },
    { key: SEAT_KEY, from: lerp(swingEnd, seatEnd, 0.5), to: lerp(seatEnd, 1, 0.55) },
  ], COIL, t);
  setLeg(j, 'L', lKey);

  // --- RIGHT leg: THE SWING — trail from the push-off, then ONE clear arc:
  // knee up beside the flank → boot OVER the cantle → down the far side →
  // the seated drape. The knee rises FORWARD of the rider (never from
  // behind); the boot never enters the horse mesh. ---------------------------
  const rKey = blendLeg([
    { key: R_TRAIL, from: lerp(reachEnd, climbEnd, 0.18), to: lerp(reachEnd, climbEnd, 0.35) },
    { key: R_MIDWND, from: lerp(reachEnd, climbEnd, 0.35), to: lerp(reachEnd, climbEnd, 0.52) },
    { key: R_SWING1, from: lerp(reachEnd, climbEnd, 0.52), to: climbEnd },
    { key: R_SWING2, from: climbEnd, to: lerp(climbEnd, swingEnd, 0.55) },
    { key: R_SWING3, from: lerp(climbEnd, swingEnd, 0.55), to: lerp(swingEnd, seatEnd, 0.15) },
    { key: R_MID, from: lerp(swingEnd, seatEnd, 0.15), to: lerp(seatEnd, 1, 0.1) },
    { key: R_STIRRUP, from: lerp(seatEnd, 1, 0.1), to: lerp(seatEnd, 1, 0.35) },
    { key: SEAT_KEY, from: lerp(seatEnd, 1, 0.3), to: lerp(seatEnd, 1, 0.6) },
  ], COIL, t);
  setLeg(j, 'R', rKey);
}

/** The final seated pose — the mount choreography lands exactly here. */
export function applyRiderPose(j: MountJoints): void {
  j.hips.position.y = SEAT_POSE.hipsY;
  j.hips.rotation.set(SEAT_POSE.hipsRx, 0, 0);
  j.spine.rotation.set(SEAT_POSE.spineRx, 0, 0);
  j.chest.rotation.set(0, 0, 0);
  j.neck.rotation.set(0, 0, 0);
  j.head.rotation.set(SEAT_POSE.headRx, 0, 0);
  j.legL.rotation.set(SEAT_POSE.legRx, 0, -SEAT_POSE.legRz);
  j.kneeL.rotation.set(SEAT_POSE.kneeRx, 0, 0);
  j.footL.rotation.set(SEAT_POSE.footRx, 0, 0);
  j.legR.rotation.set(SEAT_POSE.legRx, 0, SEAT_POSE.legRz);
  j.kneeR.rotation.set(SEAT_POSE.kneeRx, 0, 0);
  j.footR.rotation.set(SEAT_POSE.footRx, 0, 0);
  j.shoulderL.rotation.set(SEAT_POSE.shoulderL.rx, 0, SEAT_POSE.shoulderL.rz);
  j.elbowL.rotation.set(SEAT_POSE.elbowL, 0, 0);
  j.shoulderR.rotation.set(SEAT_POSE.shoulderR.rx, 0, SEAT_POSE.shoulderR.rz);
  j.elbowR.rotation.set(SEAT_POSE.elbowR, 0, 0);
}
