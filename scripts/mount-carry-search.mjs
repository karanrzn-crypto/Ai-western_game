/**
 * mount-carry-search.mjs — parameter search for the left-leg CARRY choreography.
 *
 * For each candidate (turn window, CARRY pose, drop window) it replays the
 * mount timeline with the candidate's left-leg override + root-turn override
 * and runs the SAME capsule-vs-collider sweep as mount-solver.mjs over the
 * climb window. Reports the candidates ranked by (violations, worst depth).
 */
import * as THREE from 'three';
import { createCharacterModel } from '../src/player/character/CharacterModel.js';
import { createHorseModel } from '../src/horse/HorseModel.js';
import { HORSE_PROPORTIONS as P } from '../src/horse/HorseProportions.js';
import {
  MOUNT_STAND, buildMountTimeline, mountRootPose, poseMountRider, SEAT_POSE,
  MOUNT_FACE_HORSE, MOUNT_SEAT_QUATERNION,
} from '../src/horse/MountChoreography.js';

const horse = createHorseModel();
const character = createCharacterModel();
const socket = new THREE.Group();
socket.name = 'rider-socket';
socket.position.set(0, P.riderFeetY, P.riderZ);
horse.root.add(socket);
horse.root.updateMatrixWorld(true);
socket.add(character.root);
character.root.position.set(0, 0, 0);
character.root.quaternion.identity();

const timeline = buildMountTimeline(1.35);
const { gripEnd, footEnd, climbEnd } = timeline;
const fallEnd = 0.885 + 0.55 * (1 - 0.885) * (climbEnd === timeline.climbEnd ? 1 : 1); // recompute below
const fe = timeline.climbEnd + 0.55 * (1 - timeline.climbEnd);
void fallEnd;

const startState = {
  startPhi: Math.PI * 0.95, startR: 2.4, startY: -P.riderFeetY,
  startQuat: new THREE.Quaternion(),
};
const rootLike = { position: { x: 0, y: 0, z: 0 }, quaternion: new THREE.Quaternion() };
const j = character.joints;
const w = (o) => o.getWorldPosition(new THREE.Vector3());

// colliders
const boxOf = new THREE.Box3();
const colliders = [];
horse.root.traverse((o) => {
  if (!o.isMesh) return;
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

const TOE = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, -0.11);
const Q = new THREE.Quaternion();
function bootCapsule(foot, name) {
  const ankle = w(foot);
  foot.getWorldQuaternion(Q);
  const toe = TOE.copy(FWD).applyQuaternion(Q).add(ankle);
  return { name, a: ankle.clone(), b: toe.clone(), r: 0.045 };
}
const CAPS = () => {
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

function segBoxDist(a, b, box) {
  let best = Infinity;
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= 6; i += 1) {
    tmp.lerpVectors(a, b, i / 6);
    best = Math.min(best, box.distanceToPoint(tmp));
  }
  return best;
}
function capsuleBoxDist(cap, box) { return segBoxDist(cap.a, cap.b, box) - cap.r; }

const SADDLE_LEATHER = new Set(['seat', 'pommel', 'horn', 'cantle', 'cantle-rim', 'skirt', 'horn-cap']);
function toleranceFor(capName, colName, t) {
  if ((capName === 'handL' || capName === 'armL-fore') && t >= timeline.reachEnd - 0.09 && t <= 0.97 &&
      (colName === 'seat' || colName === 'blanket' || colName === 'skirt')) return -0.05;
  if ((capName === 'thighL' || capName === 'thighR') && (colName === 'seat' || colName === 'skirt') && t >= 0.9) return -0.06;
  if ((capName === 'thighL' || capName === 'thighR') && SADDLE_LEATHER.has(colName) && t >= 0.9) return -0.004;
  if ((capName === 'pelvis' || capName === 'torso') && t >= 0.91 && colName === 'seat') return -0.045;
  if ((capName === 'pelvis' || capName === 'torso') && t >= 0.94 && SADDLE_LEATHER.has(colName)) return -0.003;
  if (capName.startsWith('boot') && colName.startsWith('stirrup') && t >= 0.45) return -0.015;
  if ((capName.startsWith('boot') || capName.startsWith('shin') || capName.startsWith('thigh')) &&
      (colName.startsWith('fender') || colName.includes('strap')) && t >= 0.45) return -0.06;
  if (capName.startsWith('boot') && t >= 0.96 && SADDLE_LEATHER.has(colName)) return -0.003;
  return 0;
}

// --- candidate left-leg override ---------------------------------------------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (t) => t * t * (3 - 2 * t);
const seg = (t, a, b) => smooth(clamp01((t - a) / (b - a)));

function sweep(cand) {
  const [turnA, turnB] = cand.turn;
  const dropA = cand.dropStart;
  const dropB = dropA + cand.dropLen * (1 - dropA);
  let violations = 0;
  let worst = 0;
  const bad = [];
  for (let step = Math.ceil(0.6 * 200); step <= 200; step += 1) {
    const t = step / 200;
    rootLike.position.x = 0; rootLike.position.y = 0; rootLike.position.z = 0;
    rootLike.quaternion.identity();
    mountRootPose(rootLike, startState, t, timeline);
    character.root.position.set(rootLike.position.x, rootLike.position.y, rootLike.position.z);
    // root turn override
    const kTurn = seg(t, turnA, turnB);
    character.root.quaternion.slerpQuaternions(MOUNT_FACE_HORSE, MOUNT_SEAT_QUATERNION, kTurn);
    poseMountRider(j, t, timeline);
    // left-leg override
    const kLiftL = seg(t, gripEnd, footEnd);
    const kDropL = seg(t, dropA, dropB);
    const C = cand.carry;
    const kSplay = smooth(clamp01(kDropL / 0.35)); // splay leads
    const kRest = clamp01((kDropL - 0.35) / 0.65); // then pitch/knee follow
    j.legL.rotation.x = lerp(lerp(0.05, C.rx, kLiftL), SEAT_POSE.legRx, kRest);
    j.legL.rotation.z = lerp(lerp(-0.02, C.rz, kLiftL), -SEAT_POSE.legRz, kSplay)
      - cand.overshoot * Math.sin(Math.PI * clamp01(kDropL)) * (1 - kDropL * 0.5);
    j.kneeL.rotation.x = lerp(lerp(-0.06, C.knee, kLiftL), SEAT_POSE.kneeRx, kRest);
    j.footL.rotation.x = lerp(lerp(0, C.foot, kLiftL), SEAT_POSE.footRx, kDropL);
    character.root.updateMatrixWorld(true);
    horse.root.updateMatrixWorld(true);
    for (const cap of CAPS()) {
      for (const col of colliders) {
        const d = capsuleBoxDist(cap, col.box);
        const tol = toleranceFor(cap.name, col.name, t);
        if (d < tol - 0.0005) {
          violations += 1;
          if (d < worst) worst = d;
          if (violations <= 6) bad.push(`t=${t.toFixed(3)} ${cap.name}|${col.name} ${(d * 1000).toFixed(1)}mm`);
        }
      }
    }
  }
  return { violations, worst, bad };
}

const candidates = [];
for (const turn of [[climbEnd, climbEnd + 0.55 * (1 - climbEnd)], [0.9, 0.958], [0.87, 0.945]]) {
  for (const rx of [-1.25, -1.05, -0.9, -0.75, -0.6]) {
    for (const rz of [-0.55, -0.4, -0.25]) {
      for (const knee of [-1.8, -1.5, -1.2]) {
        for (const dropStart of [0.9, fe]) {
          candidates.push({
            turn, dropStart, dropLen: 0.75, overshoot: 0.28,
            carry: { rx, rz, knee, foot: 0.25 },
          });
        }
      }
    }
  }
}

const results = [];
for (const cand of candidates) {
  const r = sweep(cand);
  results.push({ cand, ...r });
}
results.sort((a, b) => a.violations - b.violations || a.worst - b.worst);
console.log(`candidates: ${results.length}`);
for (const r of results.slice(0, 8)) {
  console.log(`turn[${r.cand.turn.map((v) => v.toFixed(3))}] drop@${r.cand.dropStart.toFixed(3)} carry{rx ${r.cand.carry.rx} rz ${r.cand.carry.rz} knee ${r.cand.carry.knee}} → violations ${r.violations} worst ${(r.worst * 1000).toFixed(1)}mm`);
  for (const b of r.bad.slice(0, 4)) console.log(`   ${b}`);
}

// --- deep dump of the best candidate ---
console.log('\n--- ALL violations for the best candidate ---');
{
  const r = results[0];
  const cand = r.cand;
  const [turnA, turnB] = cand.turn;
  const dropA = cand.dropStart;
  const dropB = dropA + cand.dropLen * (1 - dropA);
  for (let step = Math.ceil(0.6 * 200); step <= 200; step += 1) {
    const t = step / 200;
    rootLike.position.x = 0; rootLike.position.y = 0; rootLike.position.z = 0;
    rootLike.quaternion.identity();
    mountRootPose(rootLike, startState, t, timeline);
    character.root.position.set(rootLike.position.x, rootLike.position.y, rootLike.position.z);
    const kTurn = seg(t, turnA, turnB);
    character.root.quaternion.slerpQuaternions(MOUNT_FACE_HORSE, MOUNT_SEAT_QUATERNION, kTurn);
    poseMountRider(j, t, timeline);
    const kLiftL = seg(t, gripEnd, footEnd);
    const kDropL = seg(t, dropA, dropB);
    const C = cand.carry;
    const kSplay = smooth(clamp01(kDropL / 0.35));
    const kRest = clamp01((kDropL - 0.35) / 0.65);
    j.legL.rotation.x = lerp(lerp(0.05, C.rx, kLiftL), SEAT_POSE.legRx, kRest);
    j.legL.rotation.z = lerp(lerp(-0.02, C.rz, kLiftL), -SEAT_POSE.legRz, kSplay)
      - cand.overshoot * Math.sin(Math.PI * clamp01(kDropL)) * (1 - kDropL * 0.5);
    j.kneeL.rotation.x = lerp(lerp(-0.06, C.knee, kLiftL), SEAT_POSE.kneeRx, kRest);
    j.footL.rotation.x = lerp(lerp(0, C.foot, kLiftL), SEAT_POSE.footRx, kDropL);
    character.root.updateMatrixWorld(true);
    horse.root.updateMatrixWorld(true);
    const caps = CAPS();
    for (const cap of caps) {
      for (const col of colliders) {
        const d = capsuleBoxDist(cap, col.box);
        const tol = toleranceFor(cap.name, col.name, t);
        if (d < tol - 0.0005) {
          console.log(`t=${t.toFixed(3)} ${cap.name}(${cap.a.toArray().map((v)=>+v.toFixed(2))}→${cap.b.toArray().map((v)=>+v.toFixed(2))}) vs ${col.name}: ${(d*1000).toFixed(1)}mm`);
        }
      }
    }
  }
}
