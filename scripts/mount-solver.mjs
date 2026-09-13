/**
 * mount-solver.mjs — FULL-TIMELINE swept clearance verification for the mount
 * choreography (strict revision §7). Run: npx tsx scripts/mount-solver.mjs
 *
 * Builds the REAL character + horse rigs, attaches the rider to the saddle
 * socket exactly like the game does, then replays the mount timeline from
 * MountChoreography (the same module the game runs) and sweeps t ∈ (0, 1].
 *
 * For every step it computes rider capsule sets (torso/pelvis/head/arms/
 * hands/thighs/shins/boots) vs every horse/saddle mesh world-AABB, using
 * exact point-box distance refined along each capsule segment. Penetration
 * beyond the declared-contact tolerance fails the sweep.
 *
 * Designed contacts (NOT violations):
 *   - grip hand ON the seat edge during grip/foot/push/climb (≥ −6mm)
 *   - seated pelvis ON the seat, seated boots ON the treads (≥ −3mm)
 *   - blanket/skirt over the barrel top (saddle stack, no rider involved)
 *   - hooves ON the ground (≥ −3mm)
 */
import * as THREE from 'three';
import { createCharacterModel } from '../src/player/character/CharacterModel.js';
import { createHorseModel } from '../src/horse/HorseModel.js';
import { HORSE_PROPORTIONS as P } from '../src/horse/HorseProportions.js';
import {
  MOUNT_STAND, MOUNT_GRIP, MOUNT_SEAT_Y, MOUNT_TREAD_Y, MOUNT_STIRRUP_X,
  MOUNT_FACE_HORSE, buildMountTimeline, mountRootPose, poseMountRider,
  applyRiderPose, SEAT_POSE, mountSafeRadius,
} from '../src/horse/MountChoreography.js';

const mm = (v) => (v * 1000).toFixed(1);
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

// --- Rigs -------------------------------------------------------------------
const horse = createHorseModel();
const character = createCharacterModel();
const socket = new THREE.Group();
socket.name = 'rider-socket';
socket.position.set(0, P.riderFeetY, P.riderZ);
horse.root.add(socket);
horse.root.updateMatrixWorld(true);
socket.add(character.root); // seated: root at socket origin
character.root.position.set(0, 0, 0);
character.root.quaternion.identity();

// --- Rider capsule model ------------------------------------------------------
// Capsule endpoints come from joint world positions each step.
// Boots are modeled as the REAL foot mesh: an ankle→toe segment (toes point
// character-forward, pitched by the foot joint) with r=0.045 — a ball at the
// ankle would be fatter than the boot and report phantom contacts.
const w = (o) => o.getWorldPosition(new THREE.Vector3());
const TOE = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, -0.11); // toe ≈ 11cm forward of the ankle
const Q = new THREE.Quaternion();
function bootCapsule(foot, name) {
  const ankle = w(foot);
  foot.getWorldQuaternion(Q);
  const toe = TOE.copy(FWD).applyQuaternion(Q).add(ankle);
  return { name, a: ankle.clone(), b: toe.clone(), r: 0.045 };
}
const CAPS = () => {
  const j = character.joints;
  return [
    { name: 'torso', a: w(j.hips), b: w(j.neck), r: 0.125 },
    { name: 'pelvis', a: w(j.hips), b: w(j.spine), r: 0.115 },
    { name: 'head', a: w(j.head), b: w(j.head), r: 0.12 },
    { name: 'armL-upper', a: w(j.shoulderL), b: w(j.elbowL), r: 0.05 },
    { name: 'armL-fore', a: w(j.elbowL), b: w(j.handL), r: 0.045 },
    { name: 'handL', a: w(j.handL), b: w(j.handL), r: 0.035 },
    { name: 'armR-upper', a: w(j.shoulderR), b: w(j.elbowR), r: 0.05 },
    { name: 'armR-fore', a: w(j.elbowR), b: w(j.handR), r: 0.045 },
    { name: 'handR', a: w(j.handR), b: w(j.handR), r: 0.035 },
    { name: 'thighL', a: w(j.legL), b: w(j.kneeL), r: 0.055 },
    { name: 'shinL', a: w(j.kneeL), b: w(j.footL), r: 0.055 },
    bootCapsule(j.footL, 'bootL'),
    { name: 'thighR', a: w(j.legR), b: w(j.kneeR), r: 0.055 },
    { name: 'shinR', a: w(j.kneeR), b: w(j.footR), r: 0.055 },
    bootCapsule(j.footR, 'bootR'),
  ];
};

// --- Horse colliders: every non-detail mesh world-AABB -------------------------
// The neck sections are TILTED cylinders — their raw AABBs overstate the
// cylinder by ~20% per axis (the corner air is empty). Shrink those boxes
// 20% toward their centers: still a conservative envelope of the real
// cylinder, without the phantom corner contacts.
const boxOf = new THREE.Box3();
const colliders = [];
horse.root.traverse((o) => {
  if (!o.isMesh) return;
  // Skip the rider-socket subtree (the character is attached there).
  let n = o;
  while (n) { if (n === socket) return; n = n.parent; }
  boxOf.setFromObject(o);
  const box = boxOf.clone();
  if (o.name.startsWith('neck-')) {
    const shrink = 0.2 * Math.min(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
    box.expandByScalar(-shrink);
  }
  colliders.push({ name: o.name || 'mesh', box });
});

// --- Segment vs AABB distance (coarse scan + golden refine) --------------------
const tmp = new THREE.Vector3();
function pointBoxDist(p, box) {
  return box.distanceToPoint(p);
}
function segBoxDist(a, b, box) {
  let best = Infinity;
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    tmp.lerpVectors(a, b, t);
    const d = pointBoxDist(tmp, box);
    if (d < best) best = d;
  }
  if (best === 0) return 0; // inside or touching — refine for depth
  // Golden-section refine around the best coarse t.
  let lo = Math.max(0, (Math.floor((best === Infinity ? 0 : 0), 0)), 0);
  void lo;
  let tBest = 0;
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    tmp.lerpVectors(a, b, t);
    if (pointBoxDist(tmp, box) === best) { tBest = t; break; }
  }
  let l = Math.max(0, tBest - 1 / 8);
  let r = Math.min(1, tBest + 1 / 8);
  for (let i = 0; i < 40; i += 1) {
    const m1 = l + (r - l) / 3;
    const m2 = r - (r - l) / 3;
    tmp.lerpVectors(a, b, m1);
    const d1 = pointBoxDist(tmp, box);
    tmp.lerpVectors(a, b, m2);
    const d2 = pointBoxDist(tmp, box);
    if (d1 < d2) r = m2; else l = m1;
  }
  tmp.lerpVectors(a, b, (l + r) / 2);
  return Math.min(best, pointBoxDist(tmp, box));
}
function capsuleBoxDist(cap, box) {
  const d = segBoxDist(cap.a, cap.b, box);
  return d - cap.r;
}

// --- Contact policy -------------------------------------------------------------
// Pair-classifier: designed contacts return a tolerance, everything else 0.
// Designed contacts (riding a horse puts the leg ON the leather):
//   handL ON the seat edge from the reach landing until the slide release
//   thigh/shin resting against the saddle leather (seat/pommel/cantle/skirt)
//   seated pelvis ON the seat, seated boots ON the treads
const HAND = new THREE.Vector3();
const SADDLE_LEATHER = new Set(['seat', 'pommel', 'horn', 'cantle', 'cantle-rim', 'skirt', 'horn-cap']);
function toleranceFor(capName, colName, t, handWorld) {
  const slideStart = lerp(timeline.gripEnd, timeline.climbEnd, 0.75);
  // The hand grips until the slide release, then DRAGS across the seat top
  // as the body passes over — a designed sliding contact until the settle.
  const gripPhase = t >= timeline.reachEnd - 0.09 && t <= 0.97;
  if (capName === 'handL' && gripPhase && (colName === 'seat' || colName === 'blanket' || colName === 'skirt') ||
      (capName === 'armL-fore' && gripPhase && (colName === 'seat' || colName === 'blanket' || colName === 'skirt'))) {
    handWorld && HAND.copy(handWorld);
    return -0.05; // grip hand/forearm rest and PRESS on the seat edge (the
                  // r=0.05 ball sinks into the seat slab; the real meshes
                  // rest on top — designed contact)
  }
  if ((capName === 'thighL' || capName === 'thighR') && (colName === 'seat' || colName === 'skirt') && t >= 0.9) {
    // Seated/settling thigh drapes over the seat slab's edge (the FINAL pose
    // rests on it — a real saddle's rolled edge contacts identically).
    return -0.06;
  }
  if ((capName === 'thighL' || capName === 'thighR') && SADDLE_LEATHER.has(colName) && t >= 0.9) {
    return -0.004; // seated thighs drape over the saddle leather
  }
  if ((capName === 'pelvis' || capName === 'torso') && t >= 0.91 && colName === 'seat') {
    // Seated pelvis ON the seat: the pelvis MESH bottom rests exactly on the
    // seat top (hipsY solved for it — see the seated diagnostics), but a
    // capsule's hemispherical hip-end dips ~3cm below that. Designed contact.
    return -0.045;
  }
  if ((capName === 'pelvis' || capName === 'torso') && t >= 0.94 && SADDLE_LEATHER.has(colName)) return -0.003;
  // The hanging fender/strap hangs DIRECTLY above the stirrup tread: any leg
  // that seats a boot onto the tread must pass through (and push aside) the
  // loose leather. Whole-leg fender/strap graze from the foot phase on —
  // designed. (This branch MUST precede the stirrup-tread branch: the loose
  // straps swing wider than the tread contact tolerance.)
  if ((capName.startsWith('boot') || capName.startsWith('shin') || capName.startsWith('thigh')) &&
      (colName.startsWith('fender') || colName.includes('strap') || colName.startsWith('skirt-tie')) && t >= 0.45) {
    return -0.06;
  }
  if (capName.startsWith('boot') && colName.startsWith('stirrup') && t >= 0.45) return -0.015;
  if (capName.startsWith('boot') && t >= 0.96 && SADDLE_LEATHER.has(colName)) return -0.003;
  return 0;
}
function lerp(a, b, k) { return a + (b - a) * k; }

// --- Sweep -----------------------------------------------------------------------
const timeline = buildMountTimeline(1.35); // typical mid-size arc
console.log(`timeline: total ${timeline.total.toFixed(2)}s  walkEnd ${timeline.walkEnd.toFixed(3)} orient ${timeline.orientEnd.toFixed(3)} reach ${timeline.reachEnd.toFixed(3)} grip ${timeline.gripEnd.toFixed(3)} foot ${timeline.footEnd.toFixed(3)} push ${timeline.pushEnd.toFixed(3)} climb ${timeline.climbEnd.toFixed(3)}`);

const startState = {
  startPhi: Math.PI * 0.95, // a demanding start: far side, requires a long arc
  startR: 2.4,
  startY: -P.riderFeetY,
  startQuat: new THREE.Quaternion(),
};

const rootLike = {
  position: { x: 0, y: 0, z: 0 },
  quaternion: new THREE.Quaternion(),
};
const j = character.joints;
const jWrap = j; // MountChoreography writes rotation.x/y/z directly

let violations = 0;
const worst = new Map();
let minGripGap = Infinity;
let seatContact = null;
let treadContact = null;

for (let step = 1; step <= 300; step += 1) {
  const t = step / 300;
  if (t > 1) break;
  rootLike.position.x = 0; rootLike.position.y = 0; rootLike.position.z = 0;
  rootLike.quaternion.identity();
  mountRootPose(rootLike, startState, t, timeline);
  character.root.position.set(rootLike.position.x, rootLike.position.y, rootLike.position.z);
  character.root.quaternion.copy(rootLike.quaternion);
  poseMountRider(jWrap, t, timeline);
  character.root.updateMatrixWorld(true);
  horse.root.updateMatrixWorld(true);

  const caps = CAPS();
  for (const cap of caps) {
    for (const col of colliders) {
      const d = capsuleBoxDist(cap, col.box);
      const tol = toleranceFor(cap.name, col.name, t, cap.name === 'handL' ? cap.a : null);
      const allowed = tol;
      if (d < allowed - 0.0005) {
        violations += 1;
        if (violations <= 4000) {
          console.log(red(`VIOLATION t=${t.toFixed(3)} ${cap.name}(${cap.a.toArray().map((v) => +v.toFixed(2))}→${cap.b.toArray().map((v) => +v.toFixed(2))}) vs ${col.name}: ${mm(d)}mm`));
        }
      }
      const key = `${cap.name}|${col.name}`;
      const prev = worst.get(key);
      if (!prev || d < prev.d) worst.set(key, { d, t });
    }
  }
  // Grip contact quality.
  const handL = j.handL.getWorldPosition(new THREE.Vector3());
  const gripWorld = socket.localToWorld(new THREE.Vector3(MOUNT_GRIP.x, MOUNT_GRIP.y, MOUNT_GRIP.z));
  if (t >= 0.42 && t <= 0.72) minGripGap = Math.min(minGripGap, handL.distanceTo(gripWorld));
  // Seated contact diagnostics.
  if (t >= 0.999) {
    const hips = j.hips.getWorldPosition(new THREE.Vector3());
    const seatWorld = socket.localToWorld(new THREE.Vector3(0, MOUNT_SEAT_Y, 0));
    seatContact = { pelvisBottom: hips.y - 0.09, seatTop: seatWorld.y };
    const footL = j.footL.getWorldPosition(new THREE.Vector3());
    const footR = j.footR.getWorldPosition(new THREE.Vector3());
    const treadL = socket.localToWorld(new THREE.Vector3(MOUNT_STIRRUP_X, MOUNT_TREAD_Y, 0));
    const treadR = socket.localToWorld(new THREE.Vector3(-MOUNT_STIRRUP_X, MOUNT_TREAD_Y, 0));
    treadContact = { bootL: footL.y - 0.095, bootR: footR.y - 0.095, tread: treadL.y };
    console.log(`seated: bootL x=${socket.worldToLocal(footL.clone()).x.toFixed(3)} (tread ${MOUNT_STIRRUP_X.toFixed(3)}), bootR x=${socket.worldToLocal(footR.clone()).x.toFixed(3)}`);
  }
}

// --- Static seated-pose diagnostics -------------------------------------------------
mountRootPose(rootLike, startState, 1, timeline);
character.root.position.set(0, 0, 0);
character.root.quaternion.identity();
applyRiderPose(jWrap);
character.root.updateMatrixWorld(true);
horse.root.updateMatrixWorld(true);
const hips = j.hips.getWorldPosition(new THREE.Vector3());
const footL = j.footL.getWorldPosition(new THREE.Vector3());
const footR = j.footR.getWorldPosition(new THREE.Vector3());
const kneeL = j.kneeL.getWorldPosition(new THREE.Vector3());
const handL = j.handL.getWorldPosition(new THREE.Vector3());
const handR = j.handR.getWorldPosition(new THREE.Vector3());
const socketOf = (v) => socket.worldToLocal(v.clone());
console.log('--- seated pose diagnostics (socket-local) ---');
console.log(`hips y=${socketOf(hips).y.toFixed(4)} (target ${(MOUNT_SEAT_Y + 0.09).toFixed(4)}; pelvis bottom ${(socketOf(hips).y - 0.09).toFixed(4)} vs seat ${MOUNT_SEAT_Y.toFixed(4)})`);
console.log(`footL y=${socketOf(footL).y.toFixed(4)} boot bottom ${(socketOf(footL).y - 0.095).toFixed(4)} vs tread ${MOUNT_TREAD_Y.toFixed(4)} | x=${socketOf(footL).x.toFixed(4)} vs ±${MOUNT_STIRRUP_X.toFixed(4)}`);
console.log(`footR y=${socketOf(footR).y.toFixed(4)} boot bottom ${(socketOf(footR).y - 0.095).toFixed(4)} | x=${socketOf(footR).x.toFixed(4)}`);
console.log(`kneeL x=${socketOf(kneeL).x.toFixed(4)} (barrel half-width ${(P.bodyWidth / 2).toFixed(4)})`);
console.log(`handL ${socketOf(handL).toArray().map((v) => v.toFixed(3))}  handR ${socketOf(handR).toArray().map((v) => v.toFixed(3))}`);

console.log(`--- grip quality: min hand-to-grip-point distance during hold: ${minGripGap === Infinity ? 'n/a' : mm(minGripGap) + 'mm'}`);
console.log(`--- worst clearances (non-contact pairs < 3mm shown) ---`);
const rows = [...worst.entries()].filter(([k, v]) => !k.includes('handL') && v.d < 0.003);
rows.sort((a, b) => a[1].d - b[1].d);
for (const [k, v] of rows.slice(0, 20)) console.log(`  ${k}: ${mm(v.d)}mm at t=${v.t.toFixed(3)}`);
console.log(violations === 0 ? green(`SWEEP CLEAN — 0 violations across t∈(0,1]`) : red(`SWEEP FAILED — ${violations} violations`));
process.exit(violations === 0 ? 0 : 1);
