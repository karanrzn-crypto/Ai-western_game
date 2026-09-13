/**
 * MountChoreography — the single authority for the mount animation.
 *
 * EVERYTHING the mount needs lives here: the timeline (per-phase durations in
 * SECONDS), the root path (polar approach → stand → climb → settle), the
 * rider joint choreography (hand-led reach, stirrup engagement, push-off,
 * leg swing) and the final seated pose. `game/playable-map.ts` drives it per
 * frame; `scripts/mount-solver.mjs` imports the SAME functions to run the
 * full-timeline swept-clearance verification — the game and the verifier can
 * never drift apart.
 *
 * TIMING (strict revision §1/§2): the mount is a real, weighty human action
 * (~4.2–5.4s depending on the approach arc). Phases are deliberate and
 * individually eased — never a uniform stretch of a fast animation:
 *
 *   approach  walk around the horse to the left stirrup (speed ≈ 1.35 m/s,
 *             duration ∝ arc length; procedural walk cycle, root bob)
 *   orient    stop, square the body to the horse (short beat)
 *   reach     the HAND leads — arcs up to the near seat edge; torso leans in
 *             only at the end
 *   grip      a visible hold: the hand presses the seat, the body coils
 *   foot      the left knee folds up-out to the CARRY — the tread sits ABOVE
 *             the standing hip, so the boot cannot engage it from the ground;
 *             the right foot takes the rider's weight
 *   push      anticipation dip — the body loads the arm before leaving the
 *             ground
 *   climb     the hips rise (arm pinned to the seat = the support point),
 *             the root slides over while lifted, the right leg tucks and
 *             swings across, visibly readable
 *   settle    a controlled drop into the saddle with a small weight
 *             overshoot, then the exact seated pose (no pop at handover)
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
 * with the horse) plus a small margin. The boot still reaches the tread
 * easily during the foot phase (the hip→tread line is far shorter than the
 * leg chain).
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
// Timeline — per-phase durations in SECONDS. The walk phase scales with the
// approach arc so a near stirrup shortens naturally; everything else is a
// fixed, deliberate beat.
// ---------------------------------------------------------------------------
export interface MountTimeline {
  /** Cumulative phase ends as fractions of the whole. */
  walkEnd: number;
  orientEnd: number;
  reachEnd: number;
  gripEnd: number;
  footEnd: number;
  pushEnd: number;
  climbEnd: number;
  /** Total duration (seconds). */
  total: number;
}

export function buildMountTimeline(arcLength: number): MountTimeline {
  const walk = Math.max(0.65, Math.min(1.9, arcLength / 1.35));
  const durations = [walk, 0.22, 0.85, 0.42, 0.5, 0.3, 0.95, 0.55];
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
    footEnd: bounds[4],
    pushEnd: bounds[5],
    climbEnd: bounds[6],
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
// During reach → grip → foot → push → climb the LEFT hand stays pinned to
// the grip point (the seat edge): the hand is the physical support while the
// body rises, so the shoulder angle must continuously re-aim the arm chain
// at the grip as the root lifts. A 2-link analytic solve is run once over
// the rise range and cached — zero per-frame cost, no per-frame allocation.
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
/** Release key: the hand 35cm ABOVE the grip — clears the horn top (+22cm)
 * before the arm swings out to the rein position. */
const ARM_RELEASE = (() => {
  const s = solveArmPin(0, 0.35);
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
 * The polar approach arcs AROUND the saddle axis (never through the body),
 * the climb rises HIGH before sliding over, the settle drops with weight.
 */
export function mountRootPose(
  root: { position: { x: number; y: number; z: number }; quaternion: THREE.Quaternion },
  start: MountStartState,
  t: number,
  timeline: MountTimeline,
): void {
  const { walkEnd, orientEnd, climbEnd } = timeline;
  if (t < walkEnd) {
    // APPROACH: polar arc to the stand point, facing the travel direction.
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
  //   orient    walk-end travel yaw → face the horse's flank
  //   reach..climb  HOLD the flank facing (the rider climbs facing the horse)
  //   climbEnd..~0.94  flank facing → seat facing, completing with the fall
  const kOrientRaw = raw(t, walkEnd, orientEnd);
  const kSeatTurn = seg(t, climbEnd, lerp(climbEnd, 1, 0.55));
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
      root.quaternion.slerpQuaternions(MOUNT_FACE_HORSE, MOUNT_SEAT_QUATERNION, kSeatTurn);
    }
  }

  // CLIMB path: rise from the ground to LIFT above the socket, slide over
  // while lifted, then a controlled fall INTO the seat (root lands on the
  // socket origin — the seated position). The arm pin models exactly this
  // rise (same easing, indexed by the same lift) — no extra dip/bounce
  // terms (they would desync the pinned hand from the grip point).
  const kRise = seg(t, timeline.gripEnd, climbEnd);
  const kFall = seg(t, climbEnd, fallEnd(timeline));
  const y = lerp(MOUNT_STAND.y, CLIMB_LIFT, easeInOutSine(kRise))
    - CLIMB_LIFT * smooth(kFall);
  // Step-out while reaching (weight onto the far foot; the elbow arc clears
  // the chest) — a bump fully INSIDE the reach window so the root is back at
  // the stand point when the hand lands (the pin is solved there).
  const kReachRaw = raw(t, orientEnd, timeline.reachEnd);
  const standOff = 0.18 * smooth(kReachRaw) * (1 - smooth(clamp01((kReachRaw - 0.45) / 0.55)));
  const x = MOUNT_STAND.x - standOff;
  // Slide over: starts late (the boots are already above the saddle) and
  // completes with the fall.
  const kSlide = seg(t, lerp(timeline.gripEnd, climbEnd, 0.82), lerp(climbEnd, 1, 0.2));
  root.position.x = lerp(x, 0, kSlide);
  root.position.z = lerp(MOUNT_STAND.z, 0, kSlide);
  root.position.y = y;
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

// --- Choreography constants -------------------------------------------------
// The seated LEG pose is SOLVED numerically at module init against the
// character's exact joint chain (see solveLegs below) — boots land ON the
// treads, knees outside the barrel — so the pose stays correct for ANY
// HORSE_SCALE. scripts/mount-solver.mjs verifies the result against the real
// rig meshes.
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
// Leg-joint origin relative to the character root when seated.
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
// Climb geometry. The left boot is NOT pinned to the tread mid-climb: from
// the ground the tread is ABOVE hip height (the leg chain cannot fold the
// boot onto it until the body has risen), and the character frame rotates
// during the seat turn — so the left leg carries the boot clear of the flank
// (knee out, shin trailing) and lands it via the solved SEAT_POSE at the
// handover. `scripts/mount-solver.mjs` sweeps the whole timeline to verify.
// ---------------------------------------------------------------------------

// Reach keys (the hand leads; the arm arcs to the near seat edge).
const REACH_REST = { rx: 0.1, rz: -0.06, elbow: -0.08 };
/** Mid-reach key: the arm raised UP beside the body (folded elbow) — the
 * hand climbs OUTSIDE the barrel silhouette before descending onto the seat
 * edge (a straight rest→grip blend cuts the corner through the barrel). */
const REACH_UP = { rx: 2.55, rz: -1.0, elbow: -1.9 };

// Climb geometry.
// CLIMB_LIFT is the root's PEAK height in socket-local units (seated root =
// 0, stand root = -riderFeetY). +0.02 lifts the hips to ~2.03m — the LOWEST
// crossing that still clears the seat with the pelvis capsule (the seat top
// is 1.537m; the pelvis capsule needs ≥1.69m at the slide) — a vigorous
// real-world vault, not a leap. (The old +0.40 was a 1.45m launch with a
// 0.78m free-fall into the seat: the rider visibly FLEW.)
const CLIMB_LIFT = 0.02;
const SWING_PEAK_RX = 2.45;           // right leg up-and-over (boot clears
                                      // the cantle with margin)
const SWING_PEAK_RZ = 0.62;
/** The rise keeps the leg nearly STRAIGHT (a pendulum side-swing): the boot
 * rides beside the knee, far outside the haunch's corner — a folded knee
 * would hang the boot back into the hindquarters during the rise. */
const SWING_PEAK_KNEE = -0.2;
/**
 * The CARRY — the left leg's pose through the whole climb. GEOMETRY TRUTH at
 * this saddle: the tread top (0.019 socket-local ≈ 1.06m world) sits ABOVE
 * the standing hip (0.96m), so the boot CANNOT step onto it from the ground.
 * Instead the leg folds the boot up BEHIND-OUTBOARD (thigh pitched back,
 * heel to the butt — everything stays outside the barrel's x-band at every
 * root height and through the whole seat turn) and holds it there until the
 * body has turned over the saddle; only then does the boot drop onto the
 * tread via the solved SEAT_POSE. A forward thigh pitch (rx > ~0.3) is
 * FORBIDDEN until the facing has turned: at the flank facing, forward =
 * inboard, and the knee would drive straight into the chest.
 */
const CARRY = { rx: -1.2, rz: -0.55, knee: -1.7, foot: 0.25 };

/** End of the root FALL window as a t value (shared by root/hips). */
function fallEnd(timeline: MountTimeline): number {
  return lerp(timeline.climbEnd, 1, 0.55);
}
function kRiseOf(t: number, timeline: MountTimeline): number {
  return seg(t, timeline.gripEnd, timeline.climbEnd);
}

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
  const { walkEnd, orientEnd, reachEnd, gripEnd, footEnd, pushEnd, climbEnd } = timeline;

  if (t < orientEnd) {
    // Walk, then a short amplitude decay through orient (stop, square up).
    const amp = t < walkEnd ? 1 : 1 - smooth(raw(t, walkEnd, orientEnd));
    poseApproachWalk(j, t, timeline, amp);
    return;
  }

  // Torso phases.
  const kReachRaw = raw(t, orientEnd, reachEnd);
  const kReach = seg(t, orientEnd, reachEnd);          // arm rise (hand leads)
  const kReachLate = smooth(kReachRaw) * (1 - smooth(clamp01((kReachRaw - 0.55) / 0.45))); // lean bump
  const kGrip = raw(t, reachEnd, gripEnd);
  const kPush = seg(t, footEnd, pushEnd);
  const kRise = kRiseOf(t, timeline);
  const kFallN = raw(t, climbEnd, fallEnd(timeline));
  const kSettle = seg(t, climbEnd, 1);

  // --- Torso ---------------------------------------------------------------
  // Upright walk stance → a lean-in BUMP mid-reach (torso follows the hand,
  // then straightens as the hand lands — the pin is solved UPRIGHT) → the
  // lean HOLDS through the climb (a mounting rider keeps tipping toward the
  // horse — it also keeps the grip hand within arm's reach at the apex) →
  // upright seat with the settle.
  const lean = -0.1 * kReachLate - 0.12 * kRise * (1 - kSettle) + SEAT_POSE.hipsRx * kSettle;
  j.hips.rotation.x = lean;
  j.hips.rotation.y = 0;
  j.hips.rotation.z = 0;
  j.spine.rotation.x = lerp(lean * 0.5, SEAT_POSE.spineRx, kSettle);
  j.chest.rotation.set(0, 0, 0);
  j.neck.rotation.set(0, 0, 0);
  // Head: forward through the reach → glances DOWN at the boot/stirrup during
  // the push (the anticipation read — the torso itself stays quiet so the
  // pinned hand is never disturbed) → neutral seated gaze.
  const headDip = 0.12 * Math.sin(clamp01(kPush) * Math.PI) * (1 - kRise);
  j.head.rotation.x = lerp(-0.06 + headDip, SEAT_POSE.headRx, kSettle);
  j.head.rotation.y = 0;
  j.head.rotation.z = 0;

  // --- Hips height ----------------------------------------------------------
  // Stand tall through reach/grip/foot/push-rise → the body crouches INTO
  // the seat exactly while the body TWISTS into the seat facing (the crouch
  // is deliberately AFTER the turn: a hip descending through the cantle-rim
  // band mid-turn sweeps the right thigh root through the brass rim — the
  // turn completes high, then the rider sinks into the seat).
  const kCrouch = seg(t, fallEnd(timeline), lerp(fallEnd(timeline), 1, 0.55));
  const crouch = lerp(0, RIDER.hipYStand - SEAT_POSE.hipsY, easeOutCubic(kCrouch));
  j.hips.position.y = RIDER.hipYStand - crouch;

  // --- LEFT arm: reach → grip hold → pinned support while in reach → the arm
  // extends down as the body rises past the arm's length → releases with the
  // settle into the low rein hand ------------------------------------------
  // liftNow MUST equal mountRootPose's root rise above the STAND point (the
  // same easing PLUS the fall term) — the pin table is indexed by exactly
  // this height, so the hand stays pinned while the body rises AND tracks
  // the body back down through the fall (a static pin would drag the arm
  // through the horn as the rider drops into the seat).
  const liftNow = (CLIMB_LIFT - MOUNT_STAND.y) * easeInOutSine(kRise)
    - CLIMB_LIFT * smooth(kFallN);
  if (kRise <= 0) {
    // Pre-climb: rest → raise UP beside the body → hover above the seat edge
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
    // Pinned to the seat edge while the body rises AND falls (the support
    // point); the release lifts the hand OVER the horn first (ARM_RELEASE —
    // 35cm above the grip, horn top is +22cm), then out to the rein hand.
    // A direct pin→seat blend sweeps the forearm through the horn column.
    const pin = armPinAt(Math.max(0, liftNow));
    const kArmUp = seg(t, climbEnd, lerp(climbEnd, 1, 0.35));
    const kArmSeat = seg(t, lerp(climbEnd, 1, 0.35), lerp(climbEnd, 1, 0.8));
    j.shoulderL.rotation.set(
      lerp(lerp(pin.rx, ARM_RELEASE.rx, kArmUp), SEAT_POSE.shoulderL.rx, kArmSeat), 0,
      lerp(lerp(pin.rz, ARM_RELEASE.rz, kArmUp), SEAT_POSE.shoulderL.rz, kArmSeat),
    );
    j.elbowL.rotation.set(
      lerp(lerp(pin.elbow, ARM_RELEASE.elbow, kArmUp), SEAT_POSE.elbowL, kArmSeat), 0, 0,
    );
  }

  // --- RIGHT arm: balance at the side → brace toward the pommel in the
  // push/climb → HOLD the tight brace through the fall (an early release
  // sweeps the extending forearm through the cantle corner) → release onto
  // the right thigh only after the body is down -----------------------------
  const kBrace = seg(t, footEnd, lerp(pushEnd, climbEnd, 0.6));
  const kRelR = seg(t, fallEnd(timeline), lerp(fallEnd(timeline), 1, 0.8));
  const braceRx = 0.3;
  const braceElbow = -1.15; // tight tuck: the forearm hugs the torso, clear of
                            // the cantle corner during the drop
  j.shoulderR.rotation.set(
    lerp(lerp(0.12, braceRx, kBrace), SEAT_POSE.shoulderR.rx, kRelR), 0,
    lerp(-0.07, SEAT_POSE.shoulderR.rz, kRelR),
  );
  j.elbowR.rotation.set(
    lerp(lerp(-0.08, braceElbow, kBrace), SEAT_POSE.elbowR, kRelR), 0, 0,
  );

  // --- LEFT leg -------------------------------------------------------------
  // grip → foot: the knee folds from the hang to the CARRY (up-and-back;
  // a forward pitch would drive the knee into the chest at the flank
  // facing). The CARRY holds through rise, slide and seat turn — the boot
  // rides behind-outboard, outside the barrel band at every height. After
  // the fall (the body turned over the seat) the boot DROPS onto the tread:
  // the angles blend to the solved SEAT_POSE with an outboard splay
  // overshoot mid-blend, so the knee crosses the barrel edge OUTSIDE it.
  const kLiftL = seg(t, gripEnd, footEnd);   // hang → carry
  // The drop is SPLAY-FIRST and the wide splay HOLDS through the whole
  // pitch-down: the thigh segment starts at the INBOARD hip, so its
  // blanket-band crossing slope must exceed ~2.2 (outboard run / drop) —
  // only a near-full side splay delivers it. The splay goes wide during the
  // seat turn (the back-swung carry knee would otherwise arc through the
  // cantle zone as the body twists), holds while the thigh pitches down,
  // and relaxes to the solved seat splay in the last beats as the boot
  // lands on the tread. A pitch-first or early-relax blend drags the thigh
  // THROUGH the blanket/skirt edge band inboard (swept-verified −55mm).
  const kWide = seg(t, lerp(gripEnd, climbEnd, 0.9), lerp(climbEnd, 1, 0.45));
  const kSeatL = seg(t, lerp(climbEnd, 1, 0.5), lerp(fallEnd(timeline), 1, 0.7));
  const kRelax = seg(t, lerp(climbEnd, 1, 0.78), 0.998);
  const RZ_WIDE = -1.32;
  const rzCarryL = lerp(lerp(-0.02, CARRY.rz, kLiftL), RZ_WIDE, kWide);
  j.legL.rotation.x = lerp(lerp(0.05, CARRY.rx, kLiftL), SEAT_POSE.legRx, kSeatL);
  j.legL.rotation.z = lerp(rzCarryL, -SEAT_POSE.legRz, kRelax);
  j.kneeL.rotation.x = lerp(lerp(-0.06, CARRY.knee, kLiftL), SEAT_POSE.kneeRx, kSeatL);
  j.footL.rotation.x = lerp(lerp(0, CARRY.foot, kLiftL), SEAT_POSE.footRx, kSeatL);

  // --- RIGHT leg: planted (the push-off leg) → the load bend deepens in the
  // push → the heel leaves as the body rises → the knee swings OUT-AND-UP
  // (rz opens toward the tail side, so the knee never pitches forward into
  // the barrel at hip height) → at the lift peak the leg EXTENDS and carries
  // ACROSS over the cantle at ~2m → folds down into the seated stirrup pose
  // (the splay completes before the thigh lowers). -----------------------
  const kLoad = kPush;                                   // load bend in the push
  const kOff = smooth(clamp01((kRise - 0.42) / 0.18));   // heel leaves after the push
  const kSwingUpRx = easeOutCubic(clamp01((kRise - 0.35) / 0.32));   // rise (out-and-up)
  const kSwingAcross = easeInOutSine(clamp01((kRise - 0.78) / 0.2)); // carry at the lift peak
  // The fold starts only after the fall (the thigh crosses the cantle band
  // while the body is already low — an early fold sweeps it through the
  // cantle corner mid-turn).
  const kDown = seg(t, fallEnd(timeline), lerp(fallEnd(timeline), 1, 0.7));
  const kDownOut = smooth(clamp01(kDown / 0.5));               // splay completes first
  const plantRx = lerp(0.05, 0.02, kOff) + 0.1 * kLoad;
  const plantKnee = lerp(-0.12, -0.04, kOff) - 0.28 * kLoad;
  // Out-and-up: the splay LEADS the rise (rz reaches full before the thigh
  // pitches up — the knee exits the barrel's z-footprint sideways, so the
  // forward pitch never crosses the barrel face at hip height), then eases
  // to the cross splay as the leg extends overhead. The descent is owned
  // entirely by kDown (no pre-collapse — the fold starts from the cross pose).
  const RISE_RZ = 1.75;
  const CROSS_RX = 2.85;
  const CROSS_KNEE = -0.3;
  const rzRise = RISE_RZ * smooth(clamp01(kSwingUpRx * 2.2));
  const swingRx = lerp(SWING_PEAK_RX, CROSS_RX, kSwingAcross) * kSwingUpRx;
  const swingRz = lerp(rzRise, SWING_PEAK_RZ, kSwingAcross) * kSwingUpRx;
  const swingKnee = lerp(SWING_PEAK_KNEE * kSwingUpRx, CROSS_KNEE, kSwingAcross);
  // The settle fold's splay also overshoots outward mid-fold (the boot
  // passes the cantle/haunch band wide, then settles onto the tread).
  const foldRzR = lerp(swingRz, SEAT_POSE.legRz, kDownOut)
    + 0.22 * Math.sin(Math.PI * clamp01(kDown / 0.75)) * (1 - 0.4 * kDownOut);
  j.legR.rotation.x = lerp(lerp(plantRx, swingRx, kSwingUpRx), SEAT_POSE.legRx, kDown);
  j.legR.rotation.z = foldRzR;
  j.kneeR.rotation.x = lerp(lerp(plantKnee, swingKnee, kSwingUpRx), SEAT_POSE.kneeRx, kDownOut);
  j.footR.rotation.x = SEAT_POSE.footRx * kDown;
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
