/**
 * MountChoreography — the single authority for the mount animation.
 *
 * SIMPLIFIED MOUNT (readability revision): a short, hand-authored 5-beat
 * sequence. There is NO runtime IK, NO solver, NO lookup tables and NO
 * numeric search anywhere in this file — every joint keyframe is a plain
 * frozen constant (the grip arm and the seated pose were placed once against
 * the rig and then hard-coded; scripts/mount-solver.mjs re-verifies the whole
 * timeline against the real meshes).
 *
 *   1 walk    approach around the horse to the left stirrup (polar arc,
 *             procedural walk cycle; in the last stretch the rider squares
 *             up to face the horse's flank)
 *   2 reach   the LEFT hand comes up to the seat-edge grip (support point)
 *   3 climb   the body rises straight up AND turns toward the saddle; both
 *             legs fold UP-and-back OUTBOARD of the flank (knees kicked out,
 *             boots tucked clear of the barrel — they never cross the body)
 *   4 seat    still high above the saddle the rider slides INBOARD, finishes
 *             the turn, then folds down onto the seat: hips sink from
 *             standing to seated while the legs sweep down through a wide
 *             splay (clear of the skirt band) and the boots land on the
 *             stirrup treads
 *   5 settle  everything eases onto the final SEAT_POSE (hands to the reins)
 *             — the exact pose the riding state runs, so the handover pops
 *             nothing
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
/** The grip point: the near (left) edge of the seat — a real contact point. */
export const MOUNT_GRIP = { x: -0.30 * S, y: MOUNT_SEAT_Y + 0.02, z: 0.05 * S };

/**
 * Facing at the stand point: the character (on the -x side) faces the horse's
 * flank (+x). Slerps to MOUNT_SEAT_QUATERNION (identity — facing the horse's
 * head, -z) across the climb/seat phases.
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
  hipHalf: 0.105,      // hip joint |x|
  shoulderHalf: 0.235,
};

/** Seated hips-joint height: pelvis bottom (hips − 0.09) rests ON the seat. */
export const RIDER_HIPS_SEATED = MOUNT_SEAT_Y + 0.09;

// ---------------------------------------------------------------------------
// FROZEN KEYFRAMES (radians). No runtime math produced these: the grip arm
// and the seated legs were placed on their contact points once against the
// rig's own FK and then hard-coded. The sweep re-verifies them on every run.
// ---------------------------------------------------------------------------
/** Standing leg at rest (matches the walk cycle's amp-0 pose exactly). */
const HANG = { rx: 0.0, knee: -0.06, foot: 0 };
/**
 * The climb fold — BOTH legs: knee pitched up-and-back (rx −1.2) so the thigh
 * kicks OUTBOARD of the flank (away from the barrel), shin folded, boot
 * tucked up beside the hip. Held splayed outboard by ±RZ_FOLD. Mirrored per
 * leg; everything stays outside the horse at every height of the climb.
 */
const FOLD = { rx: -1.2, knee: -1.7, rz: 0.55, foot: 0.1 };
/** The drop's wide splay — keeps the descending thigh outside the skirt band
 *  while it pitches from the fold into the seated drape. */
const RZ_WIDE = 1.32;

/** Left-arm keys: walk-end → raised beside the body → HOVER above the seat
 *  edge (a vertical drop onto the grip — a direct raised→grip blend cuts the
 *  corner through the horse's flank) → hand ON the grip. */
const ARM_RAISED = { rx: 2.55, rz: -1.0, elbow: -1.9 };
const ARM_HOVER = { rx: 2.68, rz: 0.72, elbow: -0.9 };
/** Hand ON the seat-edge grip point (root at the stand point, ~2mm error). */
const ARM_GRIP = { rx: 2.60, rz: 0.86, elbow: -1.16 };
/** Relaxed carry after the hand slides off the grip during the climb. */
const ARM_RELAXED = { rx: 0.18, rz: -0.06, elbow: -0.15 };
/** Right-arm brace: forearm tucked to the torso, clear of the cantle corner. */
const ARM_BRACE = { rx: 0.3, rz: -0.03, elbow: -1.15 };

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
// Timeline — the 5-beat sequence. The walk scales with the approach arc so a
// near stirrup shortens naturally; every other beat is a fixed duration.
// ---------------------------------------------------------------------------
export interface MountTimeline {
  /** Cumulative phase ENDS as fractions of the whole (walk → settle). */
  walkEnd: number;
  reachEnd: number;
  climbEnd: number;
  seatEnd: number;
  /** Total duration (seconds). */
  total: number;
}

export function buildMountTimeline(arcLength: number): MountTimeline {
  const walk = Math.max(0.65, Math.min(1.9, arcLength / 1.35));
  const durations = [walk, 0.45, 1.0, 0.7, 0.4];
  const total = durations.reduce((a, b) => a + b, 0);
  const bounds: number[] = [];
  let acc = 0;
  for (const d of durations) {
    acc += d;
    bounds.push(acc / total);
  }
  return { walkEnd: bounds[0], reachEnd: bounds[1], climbEnd: bounds[2], seatEnd: bounds[3], total };
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
 * the body), squaring up to the flank in the last stretch. climb: straight
 * UP to the apex. seat: slide INBOARD over the saddle (the root is above the
 * seat the whole way — the folded legs clear the horse) then the last 2cm
 * down onto the socket origin while the BODY does the real descent via the
 * hip fold in poseMountRider.
 */
export function mountRootPose(
  root: { position: { x: number; y: number; z: number }; quaternion: THREE.Quaternion },
  start: MountStartState,
  t: number,
  timeline: MountTimeline,
): void {
  const { walkEnd, reachEnd, climbEnd, seatEnd } = timeline;
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

  // From the reach on, the root is AT the stand point facing the flank.
  //   climb  rise straight UP (beat 3) and start the turn toward the saddle
  //   seat   slide INBOARD (beat 4), finish the turn, settle the last 2cm
  const kRise = seg(t, reachEnd, climbEnd);
  const kTurn = seg(t, reachEnd, lerp(climbEnd, seatEnd, 0.5));
  const kIn = seg(t, lerp(reachEnd, climbEnd, 0.55), seatEnd);
  const kSeatIn = seg(t, lerp(climbEnd, seatEnd, 0.45), lerp(seatEnd, 1, 0.6));

  // Apex: the root's PEAK height (seated root = 0, stand root = −riderFeetY).
  // +0.02 keeps the pelvis well clear of the seat while crossing.
  const APEX = 0.02;
  root.position.y = lerp(MOUNT_STAND.y, APEX, kRise) - APEX * kSeatIn;
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
  const { walkEnd, reachEnd, climbEnd, seatEnd } = timeline;

  if (t < reachEnd) {
    // BEATS 1-2: walk, then the stride melts into the stand while the LEFT
    // hand leads up to the seat-edge grip (raised beside the body first —
    // a straight rest→grip blend would cut the corner through the barrel).
    const amp = t < walkEnd ? 1 : 1 - seg(t, walkEnd, lerp(walkEnd, reachEnd, 0.4));
    poseApproachWalk(j, t, timeline, amp);
    const kReach = seg(t, walkEnd, reachEnd);
    const kUpA = clamp01(kReach / 0.5);              // stand → raised
    const kUpB = clamp01((kReach - 0.5) / 0.3);      // raised → hover
    const kUpC = clamp01((kReach - 0.8) / 0.2);      // hover → grip
    // The elbow fold LEADS the raise (the hand tucks up beside the arm early
    // — a lagging fold hangs the hand into the horse's shoulder).
    j.shoulderL.rotation.set(
      lerp(lerp(lerp(0, ARM_RAISED.rx, smooth(kUpA)), ARM_HOVER.rx, smooth(kUpB)), ARM_GRIP.rx, smooth(kUpC)),
      0,
      lerp(lerp(lerp(0.07, ARM_RAISED.rz, smooth(kUpA)), ARM_HOVER.rz, smooth(kUpB)), ARM_GRIP.rz, smooth(kUpC)),
    );
    j.elbowL.rotation.set(
      lerp(lerp(lerp(-0.25, ARM_RAISED.elbow, smooth(clamp01(kUpA * 2))), ARM_HOVER.elbow, smooth(kUpB)), ARM_GRIP.elbow, smooth(kUpC)),
      0, 0,
    );
    // Head dips toward the grip as the hand lands (the reach read).
    j.head.rotation.x = lerp(-0.04, -0.14, Math.sin(clamp01(kReach) * Math.PI));
    return;
  }

  // Phase keys (beats 3-5).
  const kClimb = raw(t, reachEnd, climbEnd);
  const kTurn = seg(t, reachEnd, lerp(climbEnd, seatEnd, 0.5));   // root-synced
  const kSeatIn = seg(t, lerp(climbEnd, seatEnd, 0.45), lerp(seatEnd, 1, 0.6));
  const kSettle = seg(t, seatEnd, 1);

  // --- Torso ---------------------------------------------------------------
  // Upright stance → a lean-in toward the horse through the climb (a mounting
  // rider tips toward the animal) → upright seat with the settle.
  const lean = lerp(0, -0.12, kTurn) * (1 - 0.6 * kSettle) + SEAT_POSE.hipsRx * kSettle;
  j.hips.rotation.x = lean;
  j.hips.rotation.y = 0;
  j.hips.rotation.z = 0;
  j.spine.rotation.x = lerp(lean * 0.5, SEAT_POSE.spineRx, kSettle);
  j.chest.rotation.set(0, 0, 0);
  j.neck.rotation.set(0, 0, 0);
  j.head.rotation.x = lerp(-0.06, SEAT_POSE.headRx, kSettle);
  j.head.rotation.y = 0;
  j.head.rotation.z = 0;

  // --- Hips height (the centre of gravity) ----------------------------------
  // Standing height through the climb (the ROOT does the vertical work) —
  // then the body folds INTO the seat while the root settles (beat 4: a
  // controlled fold, never a free fall).
  const crouch = lerp(0, RIDER.hipYStand - SEAT_POSE.hipsY, easeOutCubic(kSeatIn));
  j.hips.position.y = RIDER.hipYStand - crouch;

  // --- LEFT arm: grip hold → slides off the seat edge as the body rises past
  // arm extension → relaxed carry → the low rein hand at the settle ---------
  const kRelease = smooth(clamp01((kClimb - 0.35) / 0.35));
  const kArmSeat = seg(t, lerp(seatEnd, 1, 0.35), 0.998);
  const rxL = lerp(lerp(ARM_GRIP.rx, ARM_RELAXED.rx, kRelease), SEAT_POSE.shoulderL.rx, kArmSeat);
  const rzL = lerp(lerp(ARM_GRIP.rz, ARM_RELAXED.rz, kRelease), SEAT_POSE.shoulderL.rz, kArmSeat);
  const elL = lerp(lerp(ARM_GRIP.elbow, ARM_RELAXED.elbow, kRelease), SEAT_POSE.elbowL, kArmSeat);
  j.shoulderL.rotation.set(rxL, 0, rzL);
  j.elbowL.rotation.set(elL, 0, 0);

  // --- RIGHT arm: balance at the side → brace toward the pommel through the
  // climb and seat → release onto the right thigh once the body is down -----
  const kRelR = seg(t, lerp(seatEnd, 1, 0.3), lerp(seatEnd, 1, 0.7));
  j.shoulderR.rotation.set(
    lerp(ARM_BRACE.rx, SEAT_POSE.shoulderR.rx, kRelR), 0,
    lerp(ARM_BRACE.rz, SEAT_POSE.shoulderR.rz, kRelR),
  );
  j.elbowR.rotation.set(
    lerp(ARM_BRACE.elbow, SEAT_POSE.elbowR, kRelR), 0, 0,
  );

  // --- BOTH legs — fold up-and-back OUTBOARD, then sweep down into the seat.
  // climb: HANG → FOLD (knees kicked outboard of the flank, boots tucked —
  //        they never cross the horse's body).
  // seat:  the thighs pitch from the fold down into the seated drape THROUGH
  //        a wide outboard splay (clear of the skirt band), the boots land on
  //        the treads, and the splay relaxes to the seated width (beat 5).
  const kFold = seg(t, reachEnd, lerp(reachEnd, climbEnd, 0.8));
  const kWide = seg(t, lerp(climbEnd, seatEnd, 0.35), lerp(seatEnd, 1, 0.4));
  const kSeatL = seg(t, lerp(climbEnd, seatEnd, 0.55), lerp(seatEnd, 1, 0.55));
  const kRelax = seg(t, lerp(seatEnd, 1, 0.55), 0.998);
  // Mirrored: rz < 0 splays the LEFT leg outboard, rz > 0 the RIGHT.
  const foldRz = lerp(FOLD.rz, RZ_WIDE, kWide);

  j.legL.rotation.x = lerp(lerp(HANG.rx, FOLD.rx, kFold), SEAT_POSE.legRx, kSeatL);
  j.legR.rotation.x = lerp(lerp(HANG.rx, FOLD.rx, kFold), SEAT_POSE.legRx, kSeatL);
  j.kneeL.rotation.x = lerp(lerp(HANG.knee, FOLD.knee, kFold), SEAT_POSE.kneeRx, kSeatL);
  j.kneeR.rotation.x = lerp(lerp(HANG.knee, FOLD.knee, kFold), SEAT_POSE.kneeRx, kSeatL);
  j.legL.rotation.z = -lerp(foldRz, SEAT_POSE.legRz, kRelax);
  j.legR.rotation.z = lerp(foldRz, SEAT_POSE.legRz, kRelax);
  j.footL.rotation.x = lerp(lerp(HANG.foot, FOLD.foot, kFold), SEAT_POSE.footRx, kSeatL);
  j.footR.rotation.x = lerp(lerp(HANG.foot, FOLD.foot, kFold), SEAT_POSE.footRx, kSeatL);
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
