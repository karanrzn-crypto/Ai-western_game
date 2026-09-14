/**
 * MountChoreography — the single authority for the mount animation.
 *
 * EVERYTHING the mount needs lives here: the 14-step timeline (per-phase
 * durations in SECONDS), the root path, the rider joint choreography and the
 * final seated pose. `game/playable-map.ts` drives it per frame;
 * `scripts/mount-solver.mjs` imports the SAME functions to run the
 * full-timeline swept-clearance verification — the game and the verifier can
 * never drift apart.
 *
 * THE 14 STEPS (final-polish revision — simple, readable, believable physics;
 * every angle is solved against the rig or a deliberate physical keyframe —
 * there are no random rotation values anywhere in this file):
 *
 *   1  walk     approach around the horse to the left stirrup (polar arc,
 *               procedural walk cycle, duration ∝ arc length)
 *   2  orient   stop and square up, facing the horse's flank
 *   3  reach    the LEFT hand leads up to the near seat edge (support point 1)
 *   4  grip     a visible hold — the hand presses the seat edge, the body coils
 *   5  stirrup  the LEFT knee folds up-and-back and the boot swings to the
 *               stirrup zone (support point 2 — the SUPPORT leg is set)
 *   6  load     weight-transfer beat: the hips dip and the RIGHT (ground) knee
 *               bends deeper — the load shifts onto the left boot + left hand
 *   7  push     the right foot drives down and leaves the ground — the rise
 *               begins (the centre of gravity moves up the support line)
 *   8  rise     the body ascends ON the left leg: the boot rides the carry
 *               (folded outboard beside the hip — the only clean branch for
 *               this rig mid-rise); the left arm stays pinned until it is
 *               fully extended, then releases
 *   9  balance  the leg extends and the boot re-seats ONTO the tread —
 *               standing tall on the stirrup, the readable weight moment
 *   10 swing    the RIGHT leg becomes the swing leg: the knee lifts
 *               up-and-outboard, the boot clears the cantle
 *   11 cross    the swing leg carries across over the seat (body still high)
 *   12 turn     the torso twists to face forward high above the saddle — the
 *               left boot simply PIVOTS in the stirrup ring (a per-yaw IK
 *               table keeps the ankle on the tread)
 *   13 land     the left leg FOLDS and lowers the body onto the seat while the
 *               root settles inboard — a controlled descent, never a fall
 *   14 settle   the right boot finds the right tread, the hands take the rein
 *               pose — exact handover to applyRiderPose
 *
 * LEG ROLES: the LEFT leg is the SUPPORT leg (boot pinned to the tread from
 * step 5 through step 13), the RIGHT leg is the push-off then SWING leg. The
 * body's centre of gravity (the hips) follows the action: a load dip before
 * the push, a rise on the support line, a controlled fold into the seat.
 *
 * GEOMETRY TRUTH that shapes the design: the stirrup tread (≈1.065m world)
 * sits ABOVE the standing hip joint (0.96m), so the boot cannot hang onto it
 * from the ground — step 5 folds the knee up-forward-OUTBOARD (a forward
 * fold at the flank facing would drive the knee into the barrel), and the
 * boot then rides the tread while the leg straightens under the rising body.
 *
 * The choreography is driven entirely in SOCKET-LOCAL space (rock-stable
 * relative to the horse) and all geometry derives from HORSE_PROPORTIONS —
 * resizing the horse rescales the choreography with it.
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
 * x must clear the hanging stirrup HARDWARE (straps reach 0.5·S from the
 * axis) plus the rider's torso capsule (0.145, rider-fixed — does not scale
 * with the horse) plus a small margin.
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
 * Mounted facing during approach/stand: the character at the stand point
 * (-x side) faces the horse's flank (+x). Slerps to MOUNT_SEAT_QUATERNION
 * (identity — facing the horse's head, -z) as the body settles into the seat.
 */
export const MOUNT_FACE_HORSE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
export const MOUNT_SEAT_QUATERNION = new THREE.Quaternion();

/**
 * Clearance radius around the saddle axis: keeps the walker outside the
 * horse's silhouette plus the RIDER's body margin (the rider is character-
 * sized and does NOT scale with the horse — hence the fixed +0.26/+0.24).
 */
export function mountSafeRadius(phi: number): number {
  // x half-extent = the stirrup hardware outer face (0.5·S) + the rider's
  // torso capsule + margin — the walk-in must clear the hanging straps.
  const sx = 0.5 * S + 0.175;
  const sz = P.bodyLength + 0.24;
  const s = Math.sin(phi) / sx;
  const c = Math.cos(phi) / sz;
  return 1 / Math.sqrt(s * s + c * c);
}

// ---------------------------------------------------------------------------
// Character metrics (from CharacterProportions — duplicated here as literals
// because the character module owns them; keep in sync via the solver).
// ---------------------------------------------------------------------------
const RIDER = {
  hipYStand: 0.96,     // hips joint y while standing
  hipHalf: 0.105,      // hip joint |x|
  legDrop: 0.06,       // leg joint y below the hips joint
  upperLeg: 0.45,
  lowerLeg: 0.4,
  shoulderUp: 0.51,    // shoulder joint y above the hips joint (0.14+0.18+0.19)
  shoulderHalf: 0.235,
  upperArm: 0.28,
  lowerArm: 0.27,
};

/** Seated hips-joint height: pelvis bottom (hips − 0.09) rests ON the seat. */
export const RIDER_HIPS_SEATED = MOUNT_SEAT_Y + 0.09;

// ---------------------------------------------------------------------------
// Timeline — the 14-step sequence. Per-phase durations in SECONDS. The walk
// phase scales with the approach arc so a near stirrup shortens naturally;
// every other phase is a fixed, deliberate beat.
// ---------------------------------------------------------------------------
export interface MountTimeline {
  /** Cumulative phase ENDS as fractions of the whole (walk → settle). */
  walkEnd: number;
  orientEnd: number;
  reachEnd: number;
  gripEnd: number;
  stirrupEnd: number;
  loadEnd: number;
  pushEnd: number;
  riseEnd: number;
  balanceEnd: number;
  swingEnd: number;
  crossEnd: number;
  turnEnd: number;
  landEnd: number;
  /** Total duration (seconds). */
  total: number;
}

export function buildMountTimeline(arcLength: number): MountTimeline {
  const walk = Math.max(0.65, Math.min(1.9, arcLength / 1.35));
  const durations = [walk, 0.18, 0.75, 0.35, 0.45, 0.22, 0.25, 0.8, 0.25, 0.4, 0.35, 0.4, 0.7, 0.5];
  const total = durations.reduce((a, b) => a + b, 0);
  const bounds: number[] = [];
  let acc = 0;
  for (const d of durations) {
    acc += d;
    bounds.push(acc / total);
  }
  return {
    walkEnd: bounds[0],
    orientEnd: bounds[1],
    reachEnd: bounds[2],
    gripEnd: bounds[3],
    stirrupEnd: bounds[4],
    loadEnd: bounds[5],
    pushEnd: bounds[6],
    riseEnd: bounds[7],
    balanceEnd: bounds[8],
    swingEnd: bounds[9],
    crossEnd: bounds[10],
    turnEnd: bounds[11],
    landEnd: bounds[12],
    total,
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
/** Raw (un-eased) normalized progress — for stacking custom easing. */
const raw = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOutSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));

export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// ---------------------------------------------------------------------------
// Left-arm support IK — precomputed at module init.
//
// During reach → grip → stirrup → load → push → early rise the LEFT hand
// stays pinned to the grip point (the seat edge): the hand is the physical
// support while the body starts rising, so the shoulder angle must
// continuously re-aim the arm chain at the grip as the root lifts. The arm
// is 0.55m long, so the pin is physically exact only up to lift ≈ 0.46m —
// beyond that the choreography RELEASES the hand (the leg is the support
// from there — exactly what real riders do). A 2-link analytic solve is run
// once over the rise range and cached — zero per-frame cost.
// ---------------------------------------------------------------------------

/**
 * Arm FK exactly as the character rig composes it (Euler XYZ: Rz raise-plane
 * tilt first, then Rx pitch; the elbow folds within the shoulder frame).
 * Returns the hand offset from the shoulder joint (character-local).
 */
function armFk(rx: number, rz: number, elbow: number): { x: number; y: number; z: number } {
  const sr = Math.sin(rz), cr = Math.cos(rz);
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const upper = { x: sr, y: -cr * cx, z: -cr * sx };
  const ce = Math.cos(elbow), se = Math.sin(elbow);
  const fore = { x: ce * sr, y: -ce * cr * cx + se * sx, z: -ce * cr * sx - se * cx };
  return {
    x: RIDER.upperArm * upper.x + RIDER.lowerArm * fore.x,
    y: RIDER.upperArm * upper.y + RIDER.lowerArm * fore.y,
    z: RIDER.upperArm * upper.z + RIDER.lowerArm * fore.z,
  };
}

/**
 * Solve the left-arm angles that put the HAND on the grip point while the
 * root is lifted by `lift` meters above the stand root. Numeric minimize at
 * module init (deterministic, zero per-frame cost). The character frame at
 * the stand point: forward = socket +x, character-left = socket −z (head
 * side), up = up.
 */
function solveArmPin(lift: number, targetDy = 0): { rx: number; rz: number; elbow: number; error: number } {
  // The LEFT shoulder sits 0.235m toward character-left (= socket −z at this
  // facing) from the spine axis — ignoring it aimed the arm ~24cm off.
  const shoulder = {
    x: MOUNT_STAND.x,
    y: MOUNT_STAND.y + RIDER.hipYStand + RIDER.shoulderUp + lift,
    z: MOUNT_STAND.z - RIDER.shoulderHalf,
  };
  // Grip target in CHARACTER frame: character-right(+x) = socket +z,
  // character-forward(−z) = socket +x → tz = −(dx socket), tx = dz socket.
  const target = {
    x: MOUNT_GRIP.z - shoulder.z,
    y: MOUNT_GRIP.y + targetDy - shoulder.y,
    z: -(MOUNT_GRIP.x - shoulder.x),
  };
  let best = { rx: 0, rz: 0, elbow: 0, error: Infinity };
  for (let rx = 0; rx <= Math.PI; rx += 0.06) {
    for (let rz = -1.2; rz <= 1.2; rz += 0.06) {
      for (let elbow = -2.4; elbow <= 0.2; elbow += 0.06) {
        const h = armFk(rx, rz, elbow);
        const e = (h.x - target.x) ** 2 + (h.y - target.y) ** 2 + (h.z - target.z) ** 2;
        if (e < best.error) best = { rx, rz, elbow, error: e };
      }
    }
  }
  // Local polish around the coarse best (the 0.06 grid leaves ~2cm of hand
  // error — the grip must land ON the seat edge).
  for (let rx = best.rx - 0.06; rx <= best.rx + 0.06; rx += 0.008) {
    for (let rz = best.rz - 0.06; rz <= best.rz + 0.06; rz += 0.008) {
      for (let elbow = best.elbow - 0.06; elbow <= best.elbow + 0.06; elbow += 0.008) {
        const h = armFk(rx, rz, elbow);
        const e = (h.x - target.x) ** 2 + (h.y - target.y) ** 2 + (h.z - target.z) ** 2;
        if (e < best.error) best = { rx, rz, elbow, error: e };
      }
    }
  }
  return best;
}

/** Arm-pin table over the full rise range (module init — runs once). */
const ARM_PIN_MAX_LIFT = 1.1; // covers the full climb rise (CLIMB_LIFT - MOUNT_STAND.y)
/** Hover key: the hand 12cm ABOVE the grip with the root at the stand point
 * — the descent's mid key, so the hand drops vertically onto the seat edge
 * (a direct REACH_UP→grip blend dips the hand through the chest/skirt). */
const ARM_HOVER = (() => {
  const s = solveArmPin(0, 0.12);
  return { rx: s.rx, rz: s.rz, elbow: s.elbow };
})();
const ARM_PIN_TABLE = (() => {
  const table: Array<{ lift: number; rx: number; rz: number; elbow: number }> = [];
  for (let i = 0; i <= 24; i += 1) {
    const lift = (i / 24) * ARM_PIN_MAX_LIFT;
    const s = solveArmPin(lift);
    table.push({ lift, rx: s.rx, rz: s.rz, elbow: s.elbow });
  }
  return table;
})();

/** Left-arm angles that keep the hand ON the grip point at a given lift. */
function armPinAt(lift: number): { rx: number; rz: number; elbow: number } {
  const k = clamp01(lift / ARM_PIN_MAX_LIFT) * (ARM_PIN_TABLE.length - 1);
  const i = Math.floor(k);
  const j = Math.min(ARM_PIN_TABLE.length - 1, i + 1);
  const f = k - i;
  return {
    rx: lerp(ARM_PIN_TABLE[i].rx, ARM_PIN_TABLE[j].rx, f),
    rz: lerp(ARM_PIN_TABLE[i].rz, ARM_PIN_TABLE[j].rz, f),
    elbow: lerp(ARM_PIN_TABLE[i].elbow, ARM_PIN_TABLE[j].elbow, f),
  };
}

/** Relaxed standing arm — the post-release carry (the hand trails the body). */
const ARM_RELAXED = { rx: 0.18, rz: -0.06, elbow: -0.15 };

// ---------------------------------------------------------------------------
// Leg IK — the SUPPORT (left) boot pinned to the tread.
//
// From the stirrup step to the seat the left ankle rests ON the left tread
// while the body first rises (leg straightening) and later folds down into
// the seat. The ankle target is FIXED in socket space, so the leg angles are
// a function of (root height, body yaw). Two tables are precomputed at
// module init:
//   LIFT table — the flank facing (yaw −90°), root height from the ground to
//                the climb apex: steps 5-11.
//   YAW table  — the apex height, body yaw from the flank facing to the seat
//                facing: step 12 (the boot pivots in the stirrup ring while
//                the torso turns above it — the straight leg makes the yaw
//                sweep trivial for the SHIN, and the table keeps the ANKLE
//                exactly on the tread).
// The land (step 13) blends the last yaw row into the solved SEAT_POSE —
// both are identity-facing tread-on solutions, so the boot never leaves the
// stirrup.
// ---------------------------------------------------------------------------

/**
 * Leg FK exactly as the character rig composes it (Euler order XYZ →
 * Rz splay first, then Rx pitch; the knee folds around the thigh frame).
 * Returns the ankle position relative to the leg joint (character-local).
 */
function legFk(rx: number, rz: number, knee: number): { x: number; y: number; z: number } {
  const sr = Math.sin(rz), cr = Math.cos(rz);
  const cx = Math.cos(rx), sx = Math.sin(rx);
  // Rz(rz) then Rx(rx) (Euler XYZ: R = Rx·Rz on the vector).
  const thigh = { x: sr, y: -cr * cx, z: -cr * sx };
  // Knee folds in the leg frame BEFORE the hip's pitch: R = Rx(rx)·Rz(rz)·Rx(knee).
  const ck = Math.cos(knee), sk = Math.sin(knee);
  const shin = { x: ck * sr, y: -ck * cr * cx + sk * sx, z: -ck * cr * sx - sk * cx };
  return {
    x: RIDER.upperLeg * thigh.x + RIDER.lowerLeg * shin.x,
    y: RIDER.upperLeg * thigh.y + RIDER.lowerLeg * shin.y,
    z: RIDER.upperLeg * thigh.z + RIDER.lowerLeg * shin.z,
  };
}

/** Boot-bottom height above the ankle joint at the seated foot pitch. */
const BOOT_DROP = 0.095;
/** Ankle target (per side): boot bottoms on the tread, foot centered on it. */
const ANKLE_TARGET = {
  x: MOUNT_STIRRUP_X,
  // Boot bottoms at MOUNT_TREAD_Y → ankle above it by BOOT_DROP (foot pitch 0.35).
  y: MOUNT_TREAD_Y + BOOT_DROP,
  z: 0.02 * S - P.riderZ - 0.045,
};

/** Climb apex: the root's PEAK height in socket-local units (seated root = 0,
 * stand root = −riderFeetY). +0.02 lifts the hips to ~2.03m world — the
 * LOWEST crossing that still clears the seat with the pelvis capsule. */
const CLIMB_LIFT = 0.02;
/** Full rise distance (stand root → apex root). */
const RISE_DISTANCE = CLIMB_LIFT - MOUNT_STAND.y;

/**
 * Solve the LEFT-leg angles putting the ankle on the LEFT tread, for a root
 * at (rootX, rootY, rootZ) with body yaw `yaw` (Euler Y). Character frame at
 * yaw: forward = R_y(yaw)·(−z), left = R_y(yaw)·(−x).
 */
function solveLegPin(rootX: number, rootY: number, rootZ: number, yaw: number): { rx: number; rz: number; knee: number; error: number } {
  // The LEFT leg joint: char offset (−hipHalf, hipY−legDrop, 0) from the root.
  // R_y(yaw)·(−h, 0, 0) = (−h·cos yaw, 0, +h·sin yaw).
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const joint = {
    x: rootX - RIDER.hipHalf * cosY,
    y: rootY + RIDER.hipYStand - RIDER.legDrop,
    z: rootZ + RIDER.hipHalf * sinY,
  };
  // Socket-space ankle target for the LEFT tread (x mirrored). MID-RISE
  // SLIP: while the body rises past the saddle's edge band the boot rides
  // the tread's OUTER-FRONT quadrant (a real stirrup slips the same way —
  // the boot presses the outer half of the tread). Centered on the tread
  // the mid-rise knee has NO clean branch (it would cross the skirt slab);
  // 4cm outboard keeps the knee outside the leather band at every height.
  const lift = rootY - MOUNT_STAND.y;
  const slip = Math.sin(Math.PI * clamp01(lift / RISE_DISTANCE));
  const targetSocket = {
    x: -(ANKLE_TARGET.x + 0.04 * slip),
    y: ANKLE_TARGET.y,
    z: ANKLE_TARGET.z - 0.02 * slip,
  };
  // To the character frame: char = R_y(−yaw)·(target − joint).
  const dx = targetSocket.x - joint.x;
  const dy = targetSocket.y - joint.y;
  const dz = targetSocket.z - joint.z;
  const target = {
    x: dx * cosY - dz * sinY,
    y: dy,
    z: dx * sinY + dz * cosY,
  };
  let best = { rx: 0, rz: 0, knee: 0, error: Infinity };
  // Knee-placement filter + tie-break: the KNEE (not just the ankle) must
  // stay outside the horse — the thigh's socket |x| ≥ 0.33 rejects the
  // inboard-down branch (the knee would drive through the barrel), and
  // among the clean branches the HEAD-ward knee (toward the horse's neck —
  // the natural "step up" look) wins ties.
  let bestHeadward = Infinity;
  // rx reaches 3.5: with this rig (no hip yaw) the ONLY clean boot-on-tread
  // pose from the ground folds the knee HIGH and slightly back (rx ≈ 3.36 —
  // a real "hook the stirrup from behind" motion); the forward-knee branch
  // drives the knee through the barrel and is rejected by the filter below.
  for (let rx = -0.6; rx <= 3.5; rx += 0.05) {
    for (let rz = -1.6; rz <= 1.2; rz += 0.05) {
      for (let knee = -2.9; knee <= -0.2; knee += 0.05) {
        const f = legFk(rx, rz, knee);
        const e = (f.x - target.x) ** 2 + (f.y - target.y) ** 2 + (f.z - target.z) ** 2;
        if (e > 0.01) continue; // not a reach solution — skip early (the polish refines)
        // Knee socket x at this yaw: the knee = joint + R_y(yaw)·(0.45·thigh).
        const tx = RIDER.upperLeg * Math.sin(rz);
        const tz = RIDER.upperLeg * -(Math.cos(rz) * Math.sin(rx));
        const kneeSocketX = joint.x + tx * cosY + tz * sinY;
        if (Math.abs(kneeSocketX) < 0.36) continue; // would clip the barrel/blanket band
        const kneeSocketZ = joint.z - tx * sinY + tz * cosY;
        if (e < best.error - 1e-6 || (e < best.error + 0.0015 && kneeSocketZ < bestHeadward)) {
          best = { rx, rz, knee, error: e };
          bestHeadward = kneeSocketZ;
        }
      }
    }
  }
  if (best.error === Infinity) {
    // Fallback (never expected): relax the knee filter and take the best
    // reach solution so the table can never contain NaN.
    for (let rx = -0.6; rx <= 3.5; rx += 0.05) {
      for (let rz = -1.6; rz <= 1.2; rz += 0.05) {
        for (let knee = -2.9; knee <= -0.2; knee += 0.05) {
          const f = legFk(rx, rz, knee);
          const e = (f.x - target.x) ** 2 + (f.y - target.y) ** 2 + (f.z - target.z) ** 2;
          if (e < best.error) best = { rx, rz, knee, error: e };
        }
      }
    }
  }
  // Local polish around the coarse best (keeps the same filters).
  for (let rx = best.rx - 0.08; rx <= best.rx + 0.08; rx += 0.008) {
    for (let rz = best.rz - 0.08; rz <= best.rz + 0.08; rz += 0.008) {
      for (let knee = best.knee - 0.08; knee <= best.knee + 0.08; knee += 0.008) {
        const f = legFk(rx, rz, knee);
        const e = (f.x - target.x) ** 2 + (f.y - target.y) ** 2 + (f.z - target.z) ** 2;
        const tx = RIDER.upperLeg * Math.sin(rz);
        const tz = RIDER.upperLeg * -(Math.cos(rz) * Math.sin(rx));
        const kneeSocketX = Math.abs(joint.x + tx * cosY + tz * sinY);
        if (kneeSocketX < 0.36) continue;
        if (e < best.error) best = { rx, rz, knee, error: e };
      }
    }
  }
  return best;
}

const LEG_PIN_STEPS = 20;
/**
 * Flank-facing lift table: (root height) → leg angles. Steps 5-11.
 *
 * RIG TRUTH (verified by exhaustive FK search): with this rig (no hip yaw)
 * the boot cannot stay on the tread through the mid-rise — the knee would
 * cross the skirt slab's volume. So the leg carries the boot OUTBOARD (rx
 * −1.2: the knee up-and-back, the boot beside the hip — clear of the horse)
 * while the body rises on the right leg + hand, and in the last rows the
 * leg extends and the boot re-seats onto the tread for the balance beat
 * (the rx blends −1.2 → ≈0.55 — the knee stays outboard of the leather
 * band at every intermediate height).
 */
const LEG_LIFT_TABLE = (() => {
  const table: Array<{ rx: number; rz: number; knee: number }> = [];
  for (let i = 0; i <= LEG_PIN_STEPS; i += 1) {
    const k = i / LEG_PIN_STEPS;
    if (k < 0.7) {
      table.push({ rx: -1.2, rz: -0.55, knee: -1.7 });
    } else {
      const lift = (i / LEG_PIN_STEPS) * RISE_DISTANCE;
      const s = solveLegPin(MOUNT_STAND.x, MOUNT_STAND.y + lift, MOUNT_STAND.z, -Math.PI / 2);
      const f = smooth((k - 0.7) / 0.3);
      table.push({
        rx: lerp(-1.2, s.rx, f),
        rz: lerp(-0.55, s.rz, f),
        knee: lerp(-1.7, s.knee, f),
      });
    }
  }
  return table;
})();

/** Yaw steps across the turn (flank −90° → seat 0°) at the apex height. */
const TURN_YAW_STEPS = 6;
const TURN_YAW_TABLE = (() => {
  const table: Array<{ rx: number; rz: number; knee: number }> = [];
  for (let i = 0; i <= TURN_YAW_STEPS; i += 1) {
    const yaw = (-Math.PI / 2) * (1 - i / TURN_YAW_STEPS);
    const s = solveLegPin(MOUNT_STAND.x, CLIMB_LIFT, MOUNT_STAND.z, yaw);
    table.push({ rx: s.rx, rz: s.rz, knee: s.knee });
  }
  return table;
})();

/** Leg angles for the pinned boot at root lift `lift` (flank facing). */
function legPinAtLift(lift: number): { rx: number; rz: number; knee: number } {
  const k = clamp01(lift / RISE_DISTANCE) * LEG_PIN_STEPS;
  const i = Math.floor(k);
  const j = Math.min(LEG_PIN_STEPS, i + 1);
  const f = k - i;
  return {
    rx: lerp(LEG_LIFT_TABLE[i].rx, LEG_LIFT_TABLE[j].rx, f),
    rz: lerp(LEG_LIFT_TABLE[i].rz, LEG_LIFT_TABLE[j].rz, f),
    knee: lerp(LEG_LIFT_TABLE[i].knee, LEG_LIFT_TABLE[j].knee, f),
  };
}

/** Leg angles for the pinned boot at turn progress k (0 = flank, 1 = seat). */
function legPinAtYaw(k: number): { rx: number; rz: number; knee: number } {
  const kk = clamp01(k) * TURN_YAW_STEPS;
  const i = Math.floor(kk);
  const j = Math.min(TURN_YAW_STEPS, i + 1);
  const f = kk - i;
  return {
    rx: lerp(TURN_YAW_TABLE[i].rx, TURN_YAW_TABLE[j].rx, f),
    rz: lerp(TURN_YAW_TABLE[i].rz, TURN_YAW_TABLE[j].rz, f),
    knee: lerp(TURN_YAW_TABLE[i].knee, TURN_YAW_TABLE[j].knee, f),
  };
}

// --- SEAT POSE ---------------------------------------------------------------
export interface SeatPose {
  hipsY: number; hipsRx: number; spineRx: number; headRx: number;
  legRx: number; legRz: number; kneeRx: number; footRx: number;
  shoulderL: { rx: number; rz: number }; elbowL: number;
  shoulderR: { rx: number; rz: number }; elbowR: number;
}

export const SEAT_POSE: SeatPose = {
  hipsY: RIDER_HIPS_SEATED,      // pelvis bottom rests ON the seat
  hipsRx: -0.05,
  spineRx: 0.02,
  headRx: -0.04,
  legRx: 1.3,                    // replaced by the init-time solve
  legRz: 0.68,                   // replaced by the init-time solve
  kneeRx: -1.7,                  // replaced by the init-time solve
  footRx: 0.35,
  shoulderL: { rx: 0.7, rz: 0.07 },   // rein hand
  elbowL: 0.3,
  shoulderR: { rx: 0.06, rz: -0.03 }, // right hand on the right thigh
  elbowR: 0.15,
};

// Leg-joint origin relative to the character root when seated (hipsY is a
// constant — the seat solve below only refines the leg ANGLES).
const LEG_JOINT = { x: RIDER.hipHalf, y: SEAT_POSE.hipsY - RIDER.legDrop, z: 0 };

/** Solve (legRx, legRz, kneeRx) so the ankle lands on the tread target. */
function solveLegPose(): void {
  let best: { e: number; rx: number; rz: number; knee: number } | null = null;
  for (let rx = 0.7; rx <= 1.75; rx += 0.025) {
    for (let rz = 0.15; rz <= 1.1; rz += 0.025) {
      for (let knee = -2.3; knee <= -0.7; knee += 0.025) {
        const f = legFk(rx, rz, knee);
        const dx = f.x - (ANKLE_TARGET.x - LEG_JOINT.x);
        const dy = f.y - (ANKLE_TARGET.y - LEG_JOINT.y);
        const dz = f.z - ANKLE_TARGET.z;
        const e = dx * dx + dy * dy + dz * dz;
        if (!best || e < best.e) best = { e, rx, rz, knee };
      }
    }
  }
  if (best && best.e < 0.003) {
    // Local polish around the coarse best (nails the tread contact).
    let polished = best;
    for (let rx = best.rx - 0.025; rx <= best.rx + 0.025; rx += 0.003125) {
      for (let rz = best.rz - 0.025; rz <= best.rz + 0.025; rz += 0.003125) {
        for (let knee = best.knee - 0.025; knee <= best.knee + 0.025; knee += 0.003125) {
          const f = legFk(rx, rz, knee);
          const dx = f.x - (ANKLE_TARGET.x - LEG_JOINT.x);
          const dy = f.y - (ANKLE_TARGET.y - LEG_JOINT.y);
          const dz = f.z - ANKLE_TARGET.z;
          const e = dx * dx + dy * dy + dz * dz;
          if (e < polished.e) polished = { e, rx, rz, knee };
        }
      }
    }
    SEAT_POSE.legRx = polished.rx;
    SEAT_POSE.legRz = polished.rz;
    SEAT_POSE.kneeRx = polished.knee;
  }
}
solveLegPose();

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
 * 14-step path: the polar approach arcs AROUND the saddle axis (never through
 * the body) to the stand point; the body then rises STRAIGHT UP on the pinned
 * boot (no lateral slide — the boot must stay on the tread), turns IN PLACE
 * above the saddle (the boot pivots in the stirrup ring), and finally sits
 * diagonally inboard onto the seat — the land simultaneously drops the root
 * to the socket origin and folds the support leg, which is what physically
 * allows the inboard travel.
 */
export function mountRootPose(
  root: { position: { x: number; y: number; z: number }; quaternion: THREE.Quaternion },
  start: MountStartState,
  t: number,
  timeline: MountTimeline,
): void {
  const { walkEnd, orientEnd, turnEnd, riseEnd, pushEnd, landEnd } = timeline;
  if (t < walkEnd) {
    // STEPS 1: APPROACH — polar arc to the stand point, facing the travel dir.
    const kWalk = raw(t, 0, walkEnd);
    const phi = start.startPhi + wrapAngle(Math.atan2(MOUNT_STAND.x, MOUNT_STAND.z) - start.startPhi) * kWalk;
    const safe = mountSafeRadius(phi);
    const r = Math.max(safe, lerp(start.startR, Math.hypot(MOUNT_STAND.x, MOUNT_STAND.z), kWalk));
    root.position.x = Math.sin(phi) * r;
    root.position.z = Math.cos(phi) * r;
    root.position.y = lerp(start.startY, MOUNT_STAND.y, kWalk);
    // Face the travel direction (sample the path just ahead).
    const k2 = Math.min(1, kWalk + 0.06);
    const phi2 = start.startPhi + wrapAngle(Math.atan2(MOUNT_STAND.x, MOUNT_STAND.z) - start.startPhi) * k2;
    const safe2 = mountSafeRadius(phi2);
    const r2 = Math.max(safe2, lerp(start.startR, Math.hypot(MOUNT_STAND.x, MOUNT_STAND.z), k2));
    const dx = Math.sin(phi2) * r2 - root.position.x;
    const dz = Math.cos(phi2) * r2 - root.position.z;
    if (Math.hypot(dx, dz) > 1e-4) {
      root.quaternion.setFromEuler(new THREE.Euler(0, Math.atan2(-dx, -dz), 0));
    }
    // Walk bob synced to the procedural step cycle (~1.8 steps/s at walk).
    const stepPhase = kWalk * timeline.walkEnd * timeline.total * 1.8 * Math.PI * 2;
    root.position.y += Math.abs(Math.sin(stepPhase)) * 0.028 * (1 - kWalk * 0.4);
    return;
  }
  // From orient on: at the stand point. Facing timeline (all slerps C1):
  //   orient    walk-end travel yaw → face the horse's flank   (step 2)
  //   reach..cross  HOLD the flank facing (the rider climbs facing the horse)
  //   turn      flank facing → seat facing, high above the saddle (step 12)
  const kOrientRaw = raw(t, walkEnd, orientEnd);
  const kTurn = seg(t, timeline.crossEnd, turnEnd);
  // Walk-end yaw: the same forward-sample the walk branch ends on (k=1).
  {
    const phi1 = start.startPhi + wrapAngle(Math.atan2(MOUNT_STAND.x, MOUNT_STAND.z) - start.startPhi);
    const safe1 = mountSafeRadius(phi1);
    const r1 = Math.max(safe1, lerp(start.startR, Math.hypot(MOUNT_STAND.x, MOUNT_STAND.z), 1));
    const phi0 = start.startPhi + wrapAngle(Math.atan2(MOUNT_STAND.x, MOUNT_STAND.z) - start.startPhi) * (1 - 0.06);
    const safe0 = mountSafeRadius(phi0);
    const r0 = Math.max(safe0, lerp(start.startR, Math.hypot(MOUNT_STAND.x, MOUNT_STAND.z), 1 - 0.06));
    const dx = Math.sin(phi1) * r1 - Math.sin(phi0) * r0;
    const dz = Math.cos(phi1) * r1 - Math.cos(phi0) * r0;
    const qWalkEnd = Math.hypot(dx, dz) > 1e-4
      ? new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-dx, -dz), 0))
      : MOUNT_FACE_HORSE;
    if (t < orientEnd) {
      root.quaternion.slerpQuaternions(qWalkEnd, MOUNT_FACE_HORSE, smooth(kOrientRaw));
    } else {
      root.quaternion.slerpQuaternions(MOUNT_FACE_HORSE, MOUNT_SEAT_QUATERNION, kTurn);
    }
  }

  // VERTICAL path: rise from the ground to the apex ON the support leg
  // (steps 6-8: the push starts the lift, the rise completes it), a hold at
  // the apex (steps 9-11 balance/swing/cross + step 12 turn), then the
  // controlled seat-in (step 13: the root settles the last 2cm to the socket
  // origin while the HIPS fold — the real descent lives in the hip crouch).
  const kRise = seg(t, lerp(timeline.loadEnd, pushEnd, 0.7), riseEnd);
  const kSeatIn = seg(t, turnEnd, landEnd);
  root.position.y = lerp(MOUNT_STAND.y, CLIMB_LIFT, easeInOutSine(kRise))
    - (CLIMB_LIFT) * smooth(kSeatIn);
  // The stand-off bump lives inside the reach window only (step 3: a small
  // weight shift toward the horse as the hand reaches up) — the root is back
  // at the stand point when the hand lands (the pin is solved there).
  const kReachRaw = raw(t, orientEnd, timeline.reachEnd);
  const standOff = 0.18 * smooth(kReachRaw) * (1 - smooth(clamp01((kReachRaw - 0.45) / 0.55)));
  // STEP 13 (land): the root settles INBOARD onto the seat while the support
  // leg folds — the fold is what physically allows the inboard travel. The
  // vertical seat-in and the horizontal slide share the same eased window.
  root.position.x = lerp(MOUNT_STAND.x - standOff, 0, kSeatIn);
  root.position.z = lerp(MOUNT_STAND.z, 0, kSeatIn);
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

// --- Choreography keys -------------------------------------------------------
// Reach keys (the hand leads; the arm arcs to the near seat edge).
const REACH_REST = { rx: 0.1, rz: -0.06, elbow: -0.08 };
/** Mid-reach key: the arm raised UP beside the body (folded elbow) — the
 * hand climbs OUTSIDE the barrel silhouette before descending onto the seat
 * edge (a straight rest→grip blend cuts the corner through the barrel). */
const REACH_UP = { rx: 2.55, rz: -1.0, elbow: -1.9 };

// Right-leg keys.
/** The TUCK — the swing leg folded under the rising body: up-forward-
 * OUTBOARD (the outboard splay keeps the boot clear of the skirt slab; a
 * forward-only tuck would park the boot against the skirt edge). */
const TUCK = { rx: 0.85, rz: -1.0, knee: -2.0 };
const SWING_PEAK_RX = 2.6;            // right leg up-and-over (boot clears
                                      // the cantle and the neck envelope)
const SWING_PEAK_RZ = 0.62;
/** The rise keeps the leg nearly STRAIGHT (a pendulum side-swing): the boot
 * rides beside the knee, far outside the haunch's corner. */
const SWING_PEAK_KNEE = -0.2;
/** The CARRY — the boot held HIGH above the saddle while the body turns
 * (step 12): the thigh nearly vertical keeps the boot ~0.8m above the hip
 * (≈2.8m world), so the yaw sweep passes over the horse, never through it. */
const CROSS_RX = 2.95;
const CROSS_KNEE = -0.15;
/** The land's wide splay (the LEFT leg): the thigh segment crosses the
 * blanket/skirt bands at slope ≥2.2 only under a near-full side splay —
 * swept-verified guard for the fold-down. */
const RZ_WIDE = -1.32;
/** The left boot's hang pose before the stirrup step. */
const HANG = { rx: 0.05, rz: -0.02, knee: -0.06, foot: 0 };
/** Left-arm carry after the grip release (the hand trails the body). */
// (ARM_RELAXED above)

/** Procedural walk cycle for the approach (the animator is paused here).
 * amp scales the whole stride — the orient phase decays it to 0 so the
 * walk-end pose melts into the stand (never a snap mid-stride). */
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
  const { walkEnd, orientEnd, reachEnd, gripEnd, stirrupEnd, loadEnd, pushEnd, riseEnd, balanceEnd, swingEnd, crossEnd, turnEnd, landEnd } = timeline;

  if (t < orientEnd) {
    // Steps 1-2: walk, then a short amplitude decay through orient (stop,
    // square up).
    const amp = t < walkEnd ? 1 : 1 - smooth(raw(t, walkEnd, orientEnd));
    poseApproachWalk(j, t, timeline, amp);
    return;
  }

  // Phase keys (steps 3-14).
  const kReachRaw = raw(t, orientEnd, reachEnd);
  const kReach = seg(t, orientEnd, reachEnd);          // step 3 (hand leads)
  const kReachLate = smooth(kReachRaw) * (1 - smooth(clamp01((kReachRaw - 0.55) / 0.45))); // lean bump
  const kGrip = raw(t, reachEnd, gripEnd);             // step 4 (press hold)
  const kStir = seg(t, gripEnd, stirrupEnd);           // step 5 (boot → tread)
  const kLoad = seg(t, stirrupEnd, loadEnd);           // step 6 (weight shift)
  const kPush = seg(t, loadEnd, pushEnd);              // step 7 (push off)
  const kRise = seg(t, lerp(loadEnd, pushEnd, 0.7), riseEnd); // steps 7-8, root-synced
  const liftNow = RISE_DISTANCE * easeInOutSine(kRise);
  const kTurn = seg(t, crossEnd, turnEnd);             // step 12, root-synced
  const kSeatIn = seg(t, turnEnd, landEnd);            // step 13, root-synced
  const kSettle = seg(t, landEnd, 1);                  // step 14

  // --- Torso ---------------------------------------------------------------
  // Upright stance → a lean-in BUMP mid-reach (the torso follows the hand,
  // then straightens as the hand lands — the pin is solved UPRIGHT) → the
  // lean HOLDS through the climb (a mounting rider keeps tipping toward the
  // horse) → upright seat with the settle.
  const lean = -0.1 * kReachLate - 0.12 * kRise * (1 - kSeatIn) + SEAT_POSE.hipsRx * kSettle;
  j.hips.rotation.x = lean;
  j.hips.rotation.y = 0;
  j.hips.rotation.z = 0;
  j.spine.rotation.x = lerp(lean * 0.5, SEAT_POSE.spineRx, kSettle);
  j.chest.rotation.set(0, 0, 0);
  j.neck.rotation.set(0, 0, 0);
  // Head: forward through the reach → glances DOWN at the boot while it
  // finds the stirrup and again at the push (the anticipation read — the
  // torso itself stays quiet so the pinned hand is never disturbed) →
  // neutral seated gaze.
  const headDip = 0.14 * Math.sin(clamp01(kStir) * Math.PI)
    + 0.1 * Math.sin(clamp01(kPush) * Math.PI) * (1 - kRise);
  j.head.rotation.x = lerp(-0.06 + headDip, SEAT_POSE.headRx, kSettle);
  j.head.rotation.y = 0;
  j.head.rotation.z = 0;

  // --- Hips height (the centre of gravity) ----------------------------------
  // Standing height through the reach/grip/stirrup → a small dip as the
  // weight shifts onto the boot+hand (step 6) → back to tall as the push
  // extends the body (step 7; the ROOT then does the vertical work) → the
  // body folds INTO the seat exactly while the root settles inboard (step
  // 13: a controlled fold of the support leg — never a free fall).
  const kCrouch = seg(t, turnEnd, lerp(landEnd, 1, 0.55));
  const crouch = lerp(0, RIDER.hipYStand - SEAT_POSE.hipsY, easeOutCubic(kCrouch));
  const dip = 0.045 * smooth(kLoad) * (1 - smooth(kPush));
  j.hips.position.y = RIDER.hipYStand - dip - crouch;

  // --- LEFT arm: reach → grip hold → pinned support while the arm still
  // reaches → RELEASES once fully extended (the leg is the support from
  // there) → relaxed carry → the low rein hand at the settle -----------------
  if (kRise <= 0) {
    // Pre-rise: rest → raise UP beside the body → hover above the seat edge
    // → drop vertically onto the grip. The hand ARRIVES first (the arm
    // completes ~80% of its arc before the torso leans).
    const kUp = easeOutCubic(kReach);
    const kUpA = clamp01(kUp / 0.5);             // rest → raised
    const kUpB = clamp01((kUp - 0.5) / 0.3);     // raised → hover
    const kUpC = clamp01((kUp - 0.8) / 0.2);     // hover → grip
    const pin0 = armPinAt(0);
    // The elbow fold LEADS the raise (the hand tucks up beside the arm
    // early — a lagging fold hangs the hand into the horse's shoulder).
    const elbowUp = lerp(REACH_REST.elbow, REACH_UP.elbow, smooth(clamp01(kUpA * 2)));
    const rx = lerp(lerp(lerp(REACH_REST.rx, REACH_UP.rx, smooth(kUpA)), ARM_HOVER.rx, smooth(kUpB)), pin0.rx, smooth(kUpC));
    const rz = lerp(lerp(lerp(REACH_REST.rz, REACH_UP.rz, smooth(kUpA)), ARM_HOVER.rz, smooth(kUpB)), pin0.rz, smooth(kUpC));
    const elbow = lerp(lerp(elbowUp, ARM_HOVER.elbow, smooth(kUpB)), pin0.elbow, smooth(kUpC));
    // Micro grip press during the hold (a ~4mm visible press-and-settle —
    // kept inside the sweep's grip-contact tolerance).
    const press = 0.12 * Math.sin(clamp01(kGrip) * Math.PI);
    j.shoulderL.rotation.set(rx + press * 0.06, 0, rz);
    j.elbowL.rotation.set(elbow - press * 0.12, 0, 0);
  } else {
    // Pinned to the seat edge while the arm still reaches; the pin is
    // physically exact only to lift ≈ 0.46 (the 0.55m arm), so the hand
    // releases at 0.42→0.64 and the arm relaxes at the side — the body
    // keeps rising ON THE LEG alone (exactly what a real mount does).
    const pin = armPinAt(Math.min(liftNow, ARM_PIN_MAX_LIFT));
    const kRelease = smooth(clamp01((liftNow - 0.42) / 0.22));
    const rxRel = lerp(pin.rx, ARM_RELAXED.rx, kRelease);
    const rzRel = lerp(pin.rz, ARM_RELAXED.rz, kRelease);
    const elbowRel = lerp(pin.elbow, ARM_RELAXED.elbow, kRelease);
    // The rein hand settles in during the land (the body is already facing
    // forward, the seat is close — a short low reach).
    const kArmSeat = seg(t, lerp(turnEnd, landEnd, 0.35), lerp(landEnd, 1, 0.5));
    j.shoulderL.rotation.set(lerp(rxRel, SEAT_POSE.shoulderL.rx, kArmSeat), 0, lerp(rzRel, SEAT_POSE.shoulderL.rz, kArmSeat));
    j.elbowL.rotation.set(lerp(elbowRel, SEAT_POSE.elbowL, kArmSeat), 0, 0);
  }

  // --- RIGHT arm: balance at the side → brace toward the pommel in the
  // load/push (the second support) → HOLD the tight brace through the rise,
  // swing and turn → release onto the right thigh once the body is down ----
  const kBrace = seg(t, stirrupEnd, lerp(pushEnd, riseEnd, 0.6));
  const kRelR = seg(t, lerp(turnEnd, landEnd, 0.3), lerp(landEnd, 1, 0.6));
  const braceRx = 0.3;
  const braceElbow = -1.15; // tight tuck: the forearm hugs the torso, clear
                            // of the cantle corner during the descent
  j.shoulderR.rotation.set(
    lerp(lerp(0.12, braceRx, kBrace), SEAT_POSE.shoulderR.rx, kRelR), 0,
    lerp(-0.07, SEAT_POSE.shoulderR.rz, kRelR),
  );
  j.elbowR.rotation.set(
    lerp(lerp(-0.08, braceElbow, kBrace), SEAT_POSE.elbowR, kRelR), 0, 0,
  );

  // --- LEFT leg — the SUPPORT leg ------------------------------------------
  // Step 5: the knee folds from the hang to the pin pose THROUGH the splay-
  // first mid key (the knee swings head-ward-outboard before the thigh
  // pitches up — the boot lands ON the tread, solved). Steps 6-11: the pin
  // ADVANCES with the root lift (the boot stays on the tread while the leg
  // straightens under the rising body). Step 12: the yaw table keeps the
  // ankle on the tread while the torso turns above it (the boot pivots in
  // the stirrup ring). Step 13: the angles blend to the solved SEAT_POSE —
  // both are identity-facing tread-on solutions — with the wide splay held
  // through the pitch-down so the knee crosses the blanket/skirt band
  // OUTBOARD. The foot yaws to keep the toe pointing along the horse's body
  // (head-ward) at every facing — a foot in a stirrup never toes inboard.
  const kPin = seg(t, gripEnd, stirrupEnd);
  // The fold swings the boot BACK-outboard to the carry, the lift table holds
  // it through the rise, and the yaw table pivots the boot in the stirrup
  // ring while the body turns; the re-seat blends in as the leg extends.
  const pinPose = kTurn <= 0 ? legPinAtLift(liftNow) : legPinAtYaw(kTurn);
  const baseRx = lerp(HANG.rx, pinPose.rx, kPin);
  const baseRz = lerp(HANG.rz, pinPose.rz, kPin);
  const baseKnee = lerp(HANG.knee, pinPose.knee, kPin);
  const kWide = seg(t, turnEnd, lerp(turnEnd, landEnd, 0.45));
  const kSeatL = seg(t, lerp(turnEnd, landEnd, 0.55), lerp(landEnd, 1, 0.65));
  const kRelax = seg(t, lerp(landEnd, 1, 0.6), 0.998);
  j.legL.rotation.x = lerp(baseRx, SEAT_POSE.legRx, kSeatL);
  j.legL.rotation.z = lerp(lerp(baseRz, RZ_WIDE, kWide), -SEAT_POSE.legRz, kRelax);
  j.kneeL.rotation.x = lerp(baseKnee, SEAT_POSE.kneeRx, kSeatL);
  j.footL.rotation.x = lerp(lerp(HANG.foot, 0.25, kPin), SEAT_POSE.footRx, kSeatL);
  // Toe along the horse's body: the local yaw unwinds as the root turns.
  j.footL.rotation.y = (Math.PI / 2) * (1 - kTurn) * kPin;

  // --- RIGHT leg — the push-off, then the SWING leg -------------------------
  // Planted through the stirrup step → the load bend deepens in the load
  // (the weight-shift read) → the heel leaves as the rise starts → the knee
  // TUCKS up-forward-outboard under the rising body → at the apex the knee
  // swings UP-AND-OUTBOARD → the CARRY holds the boot HIGH above the saddle
  // through the turn (the yaw sweep passes over the horse) → once the facing
  // is complete and the root has settled inboard, the fold brings the boot
  // down the horse's far side (the splay leads, the boot outside the barrel
  // band) into the seated stirrup pose.
  const kOff = smooth(clamp01((kRise - 0.1) / 0.18));   // the heel leaves early
  const kTuck = seg(t, pushEnd, lerp(riseEnd, balanceEnd, 0.5));
  const kSwingUp = seg(t, balanceEnd, swingEnd);
  const kAcross = seg(t, swingEnd, crossEnd);
  // The fold waits for the turn AND most of the inboard settle — the boot
  // descends the +x side only once the root is inboard (else it drags
  // through the barrel band).
  const kDown = seg(t, lerp(turnEnd, landEnd, 0.5), lerp(landEnd, 1, 0.45));
  const kDownOut = smooth(clamp01(kDown / 0.35));       // the splay leads hard
  // The plant straightens slightly as the heel leaves, then the tuck takes over.
  const plantRx = lerp(0.05 + 0.1 * kLoad, 0.02, kOff);
  const plantKnee = lerp(-0.12 - 0.3 * kLoad, -0.04, kOff);
  const rxTuck = lerp(plantRx, TUCK.rx, kTuck);
  const rxSwing = lerp(rxTuck, lerp(SWING_PEAK_RX, CROSS_RX, kAcross), kSwingUp);
  // The splay HOLDS WIDE while the thigh sweeps up past vertical (the same
  // outboard-arc rule as the support leg) and only opens to the tail-side
  // splay in the last stretch — an early rz crossing sweeps the shin through
  // the barrel at chest height.
  const kRzLate = smooth(clamp01((kSwingUp - 0.55) / 0.45));
  const rzTuck = lerp(-0.02, TUCK.rz, kTuck);
  const rzSwing = lerp(rzTuck, SWING_PEAK_RZ, kRzLate);
  const kneeTuck = lerp(plantKnee, TUCK.knee, kTuck);
  const kKneeLate = smooth(clamp01((kSwingUp - 0.4) / 0.6));
  const kneeSwing = lerp(kneeTuck, lerp(SWING_PEAK_KNEE, CROSS_KNEE, kAcross), kKneeLate);
  // The settle fold's splay overshoots outward mid-fold (the boot swings
  // wide of the barrel/neck, then settles onto the tread).
  const foldRzR = lerp(rzSwing, SEAT_POSE.legRz, kDownOut)
    + 0.35 * Math.sin(Math.PI * clamp01(kDown / 0.8)) * (1 - 0.3 * kDownOut);
  j.legR.rotation.x = lerp(rxSwing, SEAT_POSE.legRx, kDown);
  j.legR.rotation.z = foldRzR;
  j.kneeR.rotation.x = lerp(kneeSwing, SEAT_POSE.kneeRx, kDownOut);
  j.footR.rotation.x = SEAT_POSE.footRx * kDown;
  j.footR.rotation.y = 0;
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
