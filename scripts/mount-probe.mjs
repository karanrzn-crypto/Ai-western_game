/**
 * mount-probe.mjs — build-time keyframe verification for MountChoreography.
 * Run: npx tsx scripts/mount-probe.mjs
 *
 * Prints the socket-local rider joint paths through the timeline so the
 * hand-authored keys can be tuned against the real rig FK:
 *   - the RIGHT boot/knee arc (must go OVER the cantle, never behind-rise,
 *     never inside the horse silhouette),
 *   - the LEFT boot (must land and stay on the near tread through the climb),
 *   - the left hand vs the pommel grip point,
 * plus a small grid fit that SUGGESTS arm keys for the pommel grip.
 */
import * as THREE from 'three';
import { createCharacterModel } from '../src/player/character/CharacterModel.js';
import { createHorseModel } from '../src/horse/HorseModel.js';
import { HORSE_PROPORTIONS as P } from '../src/horse/HorseProportions.js';
import {
  MOUNT_STAND, MOUNT_GRIP, MOUNT_SEAT_Y, MOUNT_TREAD_Y, MOUNT_STIRRUP_X,
  buildMountTimeline, mountRootPose, poseMountRider,
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
console.log(`timeline: total ${timeline.total.toFixed(2)}s  walk ${timeline.walkEnd.toFixed(3)} reach ${timeline.reachEnd.toFixed(3)} climb ${timeline.climbEnd.toFixed(3)} swing ${timeline.swingEnd.toFixed(3)} seat ${timeline.seatEnd.toFixed(3)}`);
console.log(`grip target (socket): ${[MOUNT_GRIP.x, MOUNT_GRIP.y, MOUNT_GRIP.z].map((v) => v.toFixed(3)).join(', ')}`);
console.log(`CATCH/APEX embedded in module`);

const startState = { startPhi: Math.PI * 0.95, startR: 2.4, startY: -P.riderFeetY, startQuat: new THREE.Quaternion() };
const rootLike = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
const j = character.joints;
const w = (o) => socket.worldToLocal(o.getWorldPosition(new THREE.Vector3()));

console.log('\n--- timeline samples (socket-local) ---');
console.log('t     rootX   rootY   | bootL(x,y,z)          kneeL(x,y,z)          bootR(x,y,z)          kneeR(x,y,z)          handL(x,y,z)');
for (let step = 0; step <= 100; step += 1) {
  const t = step / 100;
  rootLike.position.set(0, 0, 0);
  rootLike.quaternion.identity();
  mountRootPose(rootLike, startState, t, timeline);
  character.root.position.set(rootLike.position.x, rootLike.position.y, rootLike.position.z);
  character.root.quaternion.copy(rootLike.quaternion);
  poseMountRider(j, t, timeline);
  character.root.updateMatrixWorld(true);
  const f = (v) => v.toFixed(2);
  const p = (o) => `${f(o.x)},${f(o.y)},${f(o.z)}`;
  console.log(
    `${t.toFixed(2)} ${f(rootLike.position.x)} ${f(rootLike.position.y)} | ` +
    `${p(w(j.footL))}  ${p(w(j.kneeL))}  ${p(w(j.footR))}  ${p(w(j.kneeR))}  ${p(w(j.handL))}`,
  );
}

// --- Arm fit: analytic shoulder->elbow->hand chain onto the pommel grip ---
const QY = new THREE.Quaternion();
function armFK(rootPos, rootQuat, rx, rz, elbow, shoulderY) {
  const shoulder = new THREE.Vector3(-0.235, shoulderY, 0).applyQuaternion(rootQuat).add(rootPos);
  const armQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz, 'XYZ'));
  const elQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(elbow, 0, 0, 'XYZ'));
  const elbowW = new THREE.Vector3(0, -0.28, 0).applyQuaternion(armQ).applyQuaternion(rootQuat).add(shoulder);
  const handW = new THREE.Vector3(0, -0.27, 0).applyQuaternion(elQ).applyQuaternion(armQ).applyQuaternion(rootQuat).add(elbowW);
  return handW;
}
function fitArm2(rootY, label, shoulderY, rxMin = 1.1) {
  const rootPos = new THREE.Vector3(MOUNT_STAND.x, rootY, MOUNT_STAND.z);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
  let best = { d: Infinity, rx: 0, rz: 0, elbow: 0 };
  for (let rx = rxMin; rx <= 3.14; rx += 0.02) {
    for (let rz = -0.2; rz <= 1.2; rz += 0.02) {
      for (let el = -1.9; el <= -0.02; el += 0.03) {
        const d = armFK(rootPos, q, rx, rz, el, shoulderY).distanceTo(MOUNT_GRIP_L);
        if (d < best.d) best = { d, rx, rz, elbow: el };
      }
    }
  }
  console.log(`${label}: rx ${best.rx.toFixed(2)} rz ${best.rz.toFixed(2)} elbow ${best.elbow.toFixed(2)} -> ${(best.d * 1000).toFixed(0)}mm`);
}
const MOUNT_GRIP_L = new THREE.Vector3(MOUNT_GRIP.x, MOUNT_GRIP.y, MOUNT_GRIP.z);
console.log('\n--- arm fit (suggestions) ---');
fitArm2(-P.riderFeetY, 'GRIP_COIL (root ground, coil hips 0.90 -> shoulder 1.41)', 1.41);
fitArm2(-0.87, 'GRIP_A    (root -0.87, shoulder 1.47)', 1.47);
fitArm2(-0.70, 'GRIP_B    (root -0.70, shoulder 1.47)', 1.47);
fitArm2(-0.55, 'GRIP_C    (root -0.55, shoulder 1.47)', 1.47);
fitArm2(-0.42, 'GRIP_EXT  (root -0.42 catch, shoulder 1.47)', 1.47, 0.4);

// --- Leg fit: grid-search module-convention (rx, knee, rz) for a boot target ---
function legFK(rootPos, rootQuat, side, rx, knee, rzModule, hipsY) {
  const s = side === 'L' ? -1 : 1;
  const jointZ = s * rzModule;           // setLeg writes rotation.z = s*rz
  const legQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, jointZ, 'XYZ'));
  const kneeQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(knee, 0, 0, 'XYZ'));
  const q = rootQuat;
  const legJoint = new THREE.Vector3(s * 0.105, hipsY - 0.06, 0).applyQuaternion(q).add(rootPos);
  const kneeWorld = new THREE.Vector3(0, -0.45, 0).applyQuaternion(legQ).applyQuaternion(q).add(legJoint);
  const ankleWorld = new THREE.Vector3(0, -0.40, 0).applyQuaternion(kneeQ).applyQuaternion(legQ).applyQuaternion(q).add(kneeWorld);
  const kneeDir = new THREE.Vector3(0, -0.45, 0).applyQuaternion(legQ).applyQuaternion(q).normalize();
  return { ankle: ankleWorld, knee: kneeWorld, kneeDir };
}
function fitLeg(label, rootPos, rootQuat, side, hipsY, target, pr) {
  let best = { d: Infinity, rx: 0, knee: 0, rz: 0, cost: Infinity };
  for (let rx = pr.rxMin; rx <= pr.rxMax; rx += 0.02) {
    for (let knee = pr.kneeMin; knee <= pr.kneeMax; knee += 0.04) {
      for (let rz = pr.rzMin; rz <= pr.rzMax; rz += 0.02) {
        const f = legFK(rootPos, rootQuat, side, rx, knee, rz, hipsY);
        const d = f.ankle.distanceTo(target);
        let cost = d;
        if (pr.kneeFwd !== undefined) {
          const kneeLocalZ = f.kneeDir.clone().applyQuaternion(rootQuat.clone().invert()).z;
          if (kneeLocalZ > -pr.kneeFwd) cost += (kneeLocalZ + pr.kneeFwd) * 1.5 + 0.25;
        }
        if (pr.kneeMinY !== undefined && f.knee.y < pr.kneeMinY) cost += (pr.kneeMinY - f.knee.y) * 1.5;
        if (pr.kneeStraight) cost += Math.abs(knee) * 0.06;
        if (pr.kneeOutX !== undefined && f.knee.x > pr.kneeOutX) cost += (f.knee.x - pr.kneeOutX) * 8 + 0.6;
        if (pr.kneeMinX !== undefined && f.knee.x < pr.kneeMinX) cost += (pr.kneeMinX - f.knee.x) * 8 + 0.6;
        if (pr.kneeZmax !== undefined && f.knee.z > pr.kneeZmax) cost += (f.knee.z - pr.kneeZmax) * 8 + 0.6;
        if (cost < best.cost) best = { d, rx, knee, rz, cost };
      }
    }
  }
  console.log(`${label}: rx ${best.rx.toFixed(3)} knee ${best.knee.toFixed(3)} rz ${best.rz.toFixed(3)} -> ankle ${(best.d * 1000).toFixed(0)}mm`);
}
const treadAnkle = new THREE.Vector3(-MOUNT_STIRRUP_X, MOUNT_TREAD_Y + 0.095, 0.017);
const faceHorse = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
const standRoot = new THREE.Vector3(MOUNT_STAND.x, MOUNT_STAND.y, MOUNT_STAND.z);
console.log('\n--- leg fit (suggestions, module rz convention) ---');
fitLeg('L_MIDCAT t0.497 (root -0.555), boot outboard of barrel',
  new THREE.Vector3(MOUNT_STAND.x, -0.555, MOUNT_STAND.z), faceHorse, 'L', 0.96,
  new THREE.Vector3(-0.37, 0.144, 0.12),
  { rxMin: 1.7, rxMax: 2.4, kneeMin: -2.6, kneeMax: -1.7, rzMin: -1.2, rzMax: -0.5 });
fitLeg('L_MIDSTD t0.545 (root -0.359), boot out-tailward, knee out',
  new THREE.Vector3(MOUNT_STAND.x, -0.359, MOUNT_STAND.z), faceHorse, 'L', 0.96,
  new THREE.Vector3(-0.52, 0.20, 0.10),
  { rxMin: 0.5, rxMax: 1.8, kneeMin: -2.3, kneeMax: -0.8, rzMin: -1.35, rzMax: -0.55, kneeOutX: -0.38 });
fitLeg('L_CATCH  root -0.42 flank, boot on tread, knee clear of seat', new THREE.Vector3(MOUNT_STAND.x, -0.42, MOUNT_STAND.z), faceHorse, 'L', 0.96, treadAnkle,
  { rxMin: 1.2, rxMax: 2.2, kneeMin: -2.6, kneeMax: -1.3, rzMin: -1.25, rzMax: -0.25, kneeMaxX: -0.31 });
fitLeg('L_STAND  root apex flank, boot on tread OUTER edge', new THREE.Vector3(MOUNT_STAND.x, 0.0147, MOUNT_STAND.z), faceHorse, 'L', 0.96,
  new THREE.Vector3(-0.385, 0.114, 0.017),
  { rxMin: 0.25, rxMax: 1.0, kneeMin: -1.2, kneeMax: -0.05, rzMin: -0.7, rzMax: 0.12, kneeOutX: -0.40, kneeFwd: 0.1 });
fitLeg('L_STD2A t0.744 (root -0.45 yaw -1.05), boot hanging outboard',
  new THREE.Vector3(-0.45, 0.0147, MOUNT_STAND.z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -1.05, 0)), 'L', 0.95,
  new THREE.Vector3(-0.62, 0.28, -0.02),
  { rxMin: -0.4, rxMax: 1.2, kneeMin: -2.0, kneeMax: -0.4, rzMin: -0.9, rzMax: 0.2, kneeOutX: -0.32 });
fitLeg('L_STD2B t0.837 (root -0.18 yaw -0.33 hips 0.625), boot hanging',
  new THREE.Vector3(-0.18, 0.0147, MOUNT_STAND.z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.33, 0)), 'L', 0.625,
  new THREE.Vector3(-0.60, 0.26, 0.05),
  { rxMin: 0.5, rxMax: 1.3, kneeMin: -2.4, kneeMax: -1.2, rzMin: 0.3, rzMax: 1.0, kneeOutX: -0.37 });
fitLeg('L_LIFT   root ground, boot beside hip, knee outboard', standRoot, faceHorse, 'L', 0.96,
  new THREE.Vector3(-0.42, -0.28, -0.12),
  { rxMin: 1.6, rxMax: 2.8, kneeMin: -2.6, kneeMax: -1.5, rzMin: -1.1, rzMax: 0.2, kneeMaxX: -0.34 });
fitLeg('L_DRPMID t0.855 (root -0.077 yaw -0.34 hips 0.65), boot on tread knee wide',
  new THREE.Vector3(-0.077, 0.0147, MOUNT_STAND.z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.34, 0)), 'L', 0.648,
  new THREE.Vector3(-0.42, 0.30, 0.0),
  { rxMin: 0.5, rxMax: 1.3, kneeMin: -2.6, kneeMax: -1.2, rzMin: -1.05, rzMax: -0.7, kneeOutX: -0.30 });
fitLeg('R_DOWN t0.78 (root -0.43 yaw -1.15 hips 0.85), knee headward, boot outboard-high',
  new THREE.Vector3(-0.43, 0.0147, MOUNT_STAND.z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -1.15, 0)), 'R', 0.846,
  new THREE.Vector3(0.38, 0.55, 0.15),
  { rxMin: 0.9, rxMax: 1.9, kneeMin: -2.4, kneeMax: -1.0, rzMin: 0.3, rzMax: 1.0 });
fitLeg('R_STIR   t0.875 (root -0.10 yaw -0.267 hips 0.62), boot above far tread',
  new THREE.Vector3(-0.10, 0.0147, MOUNT_STAND.z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.267, 0)), 'R', 0.615,
  new THREE.Vector3(MOUNT_STIRRUP_X + 0.02, MOUNT_TREAD_Y + 0.095 + 0.08, 0.05),
  { rxMin: 1.1, rxMax: 1.8, kneeMin: -2.7, kneeMax: -1.5, rzMin: 0.6, rzMax: 1.4 });

console.log('\n--- key reference geometry (socket-local) ---');
console.log(`seat top y ${MOUNT_SEAT_Y.toFixed(3)}  tread y ${MOUNT_TREAD_Y.toFixed(3)}  tread |x| ${MOUNT_STIRRUP_X.toFixed(3)}`);
// debug: STAND2B pose knee/boot positions
{
  const f = legFK(new THREE.Vector3(-0.18, 0.0147, MOUNT_STAND.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.33, 0)), 'L', 0.58, -1.98, 0.58, 0.625);
  console.log(`STAND2B(0.58,-1.98,0.58): knee world (${f.knee.x.toFixed(3)}, ${f.knee.y.toFixed(3)}, ${f.knee.z.toFixed(3)})  ankle (${f.ankle.x.toFixed(3)}, ${f.ankle.y.toFixed(3)}, ${f.ankle.z.toFixed(3)})`);
}
