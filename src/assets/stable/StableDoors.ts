/**
 * src/assets/stable/StableDoors.ts
 * -----------------------------------------------------------------------------
 * The livery stable's REAL doors — every one built for animation from the
 * start, each hung on a DoorRoot hinge pivot at its true hinge axis:
 *
 *   stable-gate        the big main entrance: a pair of board-and-batten
 *                      leaves (wagon + horse scale), each leaf its own hinge
 *                      group ('gate-leaf-w-hinge' / 'gate-leaf-e-hinge') at
 *                      the outer jambs, swinging OUTWARD (south) ~105°.
 *   stable-stall-door  six stall doors, each swinging INTO its stall.
 *   stable-room-door   tack room + feed room doors, swinging OUT into the
 *                      aisle (their interiors stay clear of every sweep).
 *   stable-staff-door  the staff door on the south facade, opening INTO the
 *                      feed room.
 *
 * Hierarchy (per the project's door contract, same as the sheriff front
 * door / vault door / cell doors):
 *
 *   def root (managed object, spawns CLOSED)
 *    └── door-hinge / gate-leaf-*-hinge   ← the ONLY thing that rotates
 *         ├── leaf slab + boards + braces (children ride the pivot)
 *         └── handle / straps / panels
 *   hinge knuckles mount on the STATIC root (jamb side), never mid-door.
 *
 * Pose APIs are PURE functions of t ∈ [0,1] — pose is re-derived every frame
 * (never accumulated), so re-triggering mid-swing is deterministic:
 *   setStableGateOpen(root, t)      both leaves, mirrored angles
 *   setStableLeafDoorOpen(root, t)  any single-leaf door (reads the hinge
 *                                   side/sign/angle the layout authored into
 *                                   hinge.userData at build time)
 *
 * Geometry discipline: the closed leaf always FULLY fills its gap (bottom
 * 2 cm over the floor, top 2–5 cm under the header, hinge/latch clearances
 * inside the gap); every mounted part is back-to-back or proud — never a
 * same-normal coplanar pair.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { STABLE_LAYOUT } from './StableLayout.js';
import { createStableMaterials, type StableMaterials } from './StableMaterials.js';
import { addBox, addCyl } from './StableProps.js';

export const STABLE_GATE_OPEN_ANGLE = (105 * Math.PI) / 180;
export const STALL_DOOR_OPEN_ANGLE = (100 * Math.PI) / 180;
export const ROOM_DOOR_OPEN_ANGLE = (100 * Math.PI) / 180;
export const STAFF_DOOR_OPEN_ANGLE = (95 * Math.PI) / 180;


/* -------------------------------------------------------------------------- */
/* Shared leaf furniture                                                      */
/* -------------------------------------------------------------------------- */

/** Wrought strap hinge ON the leaf face (back face exactly ON the board
 *  face — back-to-back, the mounted-hinge look). */
function strapHinge(g: THREE.Object3D, M_: StableMaterials, w: number, y: number, faceZ: number, name: string): void {
  addBox(g, M_.iron, w, 0.06, 0.016, 0, y, faceZ + 0.008, `${name}-strap`);
  addBox(g, M_.iron, 0.05, 0.09, 0.02, 0, y, faceZ + 0.01, `${name}-band`);
}

/** Handle on the latch edge (loop + rose), both sides readable. */
function doorHandle(g: THREE.Object3D, M_: StableMaterials, latchX: number, y: number, thickness: number): void {
  const rose = addCyl(g, M_.iron, 0.045, 0.045, 0.014, 10, latchX, y, thickness / 2 + 0.007, 'door-rose');
  rose.rotation.x = Math.PI / 2;
  const grip = addCyl(g, M_.iron, 0.016, 0.016, 0.13, 8, latchX, y, thickness / 2 + 0.045, 'door-handle');
  grip.rotation.x = Math.PI / 2;
}

/* -------------------------------------------------------------------------- */
/* The main entrance — a pair of swinging barn leaves                          */
/* -------------------------------------------------------------------------- */

/**
 * The big wagon gate. Def root at the doorway center on the south wall's
 * mid-plane, y = floor top. Inside: two hinge groups at the OUTER jambs
 * (2 cm inboard), each carrying one leaf. CLOSED = both leaves fill the
 * 3.4 m opening (8 cm center gap, hinges/latch clearances inside the jambs).
 * OPEN (t=1) = both leaves swung outward ~105° (tips ~1.6 m south of the
 * facade, clear of the wall band and both casings — verified by tests).
 */
export function buildStableGate(): THREE.Group {
  const M_ = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'stable-gate';

  const opening = STABLE_LAYOUT.mainGate; // xMin/xMax/height (building-local)
  const openW = opening.xMax - opening.xMin; // 3.4
  const openH = opening.height; // 3.05
  const leafW = openW / 2 - 0.04; // 1.06 — 4 cm hinge seat, leaves meet at center
  const leafH = openH - 0.06; // 2.99 — top 6 cm under the header, bottom rides the threshold
  const t = 0.05;
  const hingeSeat = 0.04; // hinge axis 4 cm inboard — the outward sweep clears
  // the jamb wall corners by sector (graze-free, verified by tests).

  const boardW = leafW / 5;

  const buildLeaf = (side: -1 | 1, name: string): THREE.Group => {
    const hinge = new THREE.Group();
    hinge.name = name;
    // Runtime-rotated pivot (setStableGateOpen) — the merge pass buckets this
    // subtree to ITSELF so nothing static ever bakes across the swing axis.
    hinge.userData.dynamic = true;
    // hinge axis: outer jamb, 2 cm inboard
    hinge.position.set(side * (openW / 2 - hingeSeat), 0.03, 0);
    // leaf extends TOWARD THE CENTER: local +x for the west leaf, -x for east
    const dir = side === -1 ? 1 : -1;
    // vertical boards (leaf slab as board striping — one slab + seams)
    const slab = addBox(hinge, M_.plankDark, leafW, leafH, t, dir * leafW / 2, leafH / 2, 0, `${name}-leaf`);
    slab.castShadow = true;
    slab.receiveShadow = true;
    for (let i = 1; i < 5; i++) {
      addBox(hinge, M_.timber, 0.012, leafH - 0.01, t + 0.006, dir * (i * boardW), leafH / 2, 0, `${name}-board-seam`);
    }
    // Z-brace: top rail + bottom rail + diagonal, on the aisle face (+z local
    // = inside face); the aisle face is what visitors see from the yard? The
    // gate's street face (south, +z world) carries the braces — the def has
    // no rotation, local +z = world +z = south (outward). Braces OUT.
    // CENTER-GAP FIX (z-scan): the rails/diagonal spanned the FULL leaf and
    // met their mirror leaf at the center seam on the SAME plane — co-facing
    // coplanar overlap 12.7 cm × 2.3 m when closed. Each brace now stops
    // 8 cm short of the seam (flush at the hinge jamb), so the two leaves'
    // hardware never share a plane or overlap again.
    const braceZ = t / 2 + 0.022;
    const braceLen = leafW - 0.08;
    const braceCx = dir * (braceLen / 2); // stops 8 cm short of the center seam
    addBox(hinge, M_.trim, braceLen, 0.16, 0.04, braceCx, leafH - 0.28, braceZ, `${name}-brace-top`);
    addBox(hinge, M_.trim, braceLen, 0.16, 0.04, braceCx, 0.26, braceZ, `${name}-brace-bottom`);
    const diag = addBox(hinge, M_.trim, Math.hypot(braceLen, leafH - 0.72), 0.14, 0.04, braceCx, leafH / 2, braceZ, `${name}-brace-diag`);
    diag.rotation.z = dir * Math.atan2(leafH - 0.72, braceLen) * (side === -1 ? -1 : 1);
    // street-face strap hinges (back-to-back on the leaf) + handle
    strapHinge(hinge, M_, 0.5, 0.4, t / 2, `${name}-strap-low`);
    strapHinge(hinge, M_, 0.5, leafH - 0.5, t / 2, `${name}-strap-high`);
    doorHandle(hinge, M_, dir * (leafW - 0.12), leafH / 2, t);
    // latch bar across the center gap (west leaf only, on the inside face)
    if (side === -1) {
      addBox(hinge, M_.iron, 0.42, 0.07, 0.03, dir * (leafW - 0.2), 1.15, -t / 2 - 0.015, 'gate-latch-bar');
    }
    return hinge;
  };

  g.add(buildLeaf(-1, 'gate-leaf-w-hinge'));
  g.add(buildLeaf(1, 'gate-leaf-e-hinge'));

  // Hinge KNUCKLES on the static root at the hinge axes (jamb side).
  for (const [side, name] of [[-1, 'w'], [1, 'e']] as const) {
    for (const ky of [0.4, leafH - 0.5]) {
      const knuckle = addCyl(g, M_.iron, 0.026, 0.026, 0.12, 10, side * (openW / 2 - hingeSeat), ky + 0.03, 0, `gate-knuckle-${name}`);
      knuckle.rotation.z = Math.PI / 2;
    }
  }
  // Iron shoe rails along the threshold (the leaves' bottom guide look).
  addBox(g, M_.iron, openW - 0.1, 0.02, 0.06, 0, 0.012, 0, 'gate-shoe-rail');

  return g;
}

/**
 * Pure pose for the double gate: t=0 → both leaves CLOSED (leaf yaws 0),
 * t=1 → both leaves OPEN ~105° outward (west leaf −105°, east leaf +105°).
 * The pose is derived ONLY from t — never accumulated.
 */
export function setStableGateOpen(root: THREE.Object3D, t: number): void {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const w = root.getObjectByName('gate-leaf-w-hinge');
  const e = root.getObjectByName('gate-leaf-e-hinge');
  // `0 - x` (never `-x`) keeps t=0 at +0 — no negative-zero quirks.
  if (w) w.rotation.y = 0 - clamped * STABLE_GATE_OPEN_ANGLE;
  if (e) e.rotation.y = clamped * STABLE_GATE_OPEN_ANGLE;
}

/* -------------------------------------------------------------------------- */
/* Single-leaf doors (stall / room / staff)                                    */
/* -------------------------------------------------------------------------- */

export interface LeafDoorMeta {
  /** Clear opening width the leaf must fill. */
  width: number;
  /** Clear opening height (from the floor top). */
  height: number;
  /** Visual style. */
  style: 'stall' | 'room' | 'staff';
  /** Which local-x edge carries the hinge ('left' = local −x). */
  hinge: 'left' | 'right';
  /** +1 / −1 multiplier on the open rotation (bakes the swing direction). */
  openSign: 1 | -1;
  /** Open angle in RADIANS (layout picks the constant per door kind). */
  openDeg: number;
}

/**
 * One real hinged door. Local convention (the layout's def rotation orients
 * the whole assembly):
 *   • leaf slab spans local X (width), thickness local Z, front face +Z;
 *   • hinge child 'door-hinge' sits at the chosen edge, 3 cm inboard;
 *   • openSign/openDeg are stored on hinge.userData so the pose API needs
 *     nothing but the root.
 */
export function buildStableLeafDoor(meta: LeafDoorMeta): THREE.Group {
  const M_ = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'stable-leaf-door';

  const w = meta.width;
  const h = meta.height;
  const t = meta.style === 'stall' ? 0.05 : 0.055;
  const leafW = w - 0.08; // 5 cm hinge seat + 3 cm latch clearance
  const leafH = h - 0.04; // top 4 cm under the header
  const hingeX = (meta.hinge === 'left' ? -1 : 1) * (w / 2 - 0.05);
  const dir = meta.hinge === 'left' ? 1 : -1; // leaf extends this way from the hinge

  const hinge = new THREE.Group();
  hinge.name = 'door-hinge';
  // Runtime-rotated pivot (setStableLeafDoorOpen) — see MergeStatic contract.
  hinge.userData.dynamic = true;
  hinge.position.set(hingeX, 0.025, 0);
  hinge.userData.openSign = meta.openSign;
  hinge.userData.openDeg = meta.openDeg;
  hinge.userData.leafSpan = dir * leafW;
  g.add(hinge);

  if (meta.style === 'room') {
    // Panelled door: slab + two recessed panel faces (proud frames, never
    // coplanar: the field sits 8 mm INSIDE the face plane).
    const slab = addBox(hinge, M_.trim, leafW, leafH, t, dir * leafW / 2, leafH / 2, 0, 'room-door-slab');
    slab.castShadow = true;
    slab.receiveShadow = true;
    for (const [py, ph] of [[leafH * 0.3, leafH * 0.42], [leafH * 0.72, leafH * 0.34]] as const) {
      for (const sz of [-1, 1] as const) {
        addBox(hinge, M_.trim, leafW - 0.22, ph, 0.012, dir * leafW / 2, py, sz * (t / 2 + 0.004), 'room-door-panel-frame');
        addBox(hinge, M_.plankDark, leafW - 0.3, ph - 0.08, 0.01, dir * leafW / 2, py, sz * (t / 2 + 0.002), 'room-door-panel-field');
      }
    }
    doorHandle(hinge, M_, dir * (leafW - 0.1), leafH * 0.45, t);
    strapHinge(hinge, M_, 0.26, 0.32, t / 2, 'room-strap-low');
    strapHinge(hinge, M_, 0.26, leafH - 0.32, t / 2, 'room-strap-high');
  } else {
    // Board + brace door (stall & staff): vertical boards + Z-brace.
    const slab = addBox(hinge, M_.plankDark, leafW, leafH, t, dir * leafW / 2, leafH / 2, 0, `${meta.style}-door-slab`);
    slab.castShadow = true;
    slab.receiveShadow = true;
    const nSeams = meta.style === 'stall' ? 3 : 4;
    for (let i = 1; i <= nSeams; i++) {
      addBox(hinge, M_.timber, 0.012, leafH - 0.01, t + 0.006, dir * (i * leafW / (nSeams + 1)), leafH / 2, 0, `${meta.style}-board-seam`);
    }
    const braceZ = t / 2 + 0.02;
    addBox(hinge, M_.trim, leafW, 0.13, 0.035, dir * leafW / 2, leafH - 0.22, braceZ, `${meta.style}-brace-top`);
    addBox(hinge, M_.trim, leafW, 0.13, 0.035, dir * leafW / 2, 0.22, braceZ, `${meta.style}-brace-bottom`);
    const diag = addBox(hinge, M_.trim, Math.hypot(leafW, leafH - 0.58), 0.11, 0.035, dir * leafW / 2, leafH / 2, braceZ, `${meta.style}-brace-diag`);
    diag.rotation.z = dir * Math.atan2(leafH - 0.58, leafW) * (meta.hinge === 'left' ? -1 : 1);
    if (meta.style === 'stall') {
      // iron latch peg on the aisle face + a viewing gap? keep a simple peg.
      addBox(hinge, M_.iron, 0.16, 0.05, 0.025, dir * (leafW - 0.14), 1.1, t / 2 + 0.012, 'stall-latch-peg');
      strapHinge(hinge, M_, 0.34, 0.35, t / 2, 'stall-strap-low');
      strapHinge(hinge, M_, 0.34, leafH - 0.35, t / 2, 'stall-strap-high');
    } else {
      doorHandle(hinge, M_, dir * (leafW - 0.1), leafH * 0.45, t);
      strapHinge(hinge, M_, 0.24, 0.3, t / 2, 'staff-strap-low');
      strapHinge(hinge, M_, 0.24, leafH - 0.3, t / 2, 'staff-strap-high');
    }
  }

  // Hinge knuckles on the STATIC root, ON the hinge axis (jamb side).
  for (const ky of [0.3, meta.height - 0.3]) {
    const knuckle = addCyl(g, M_.iron, 0.02, 0.02, 0.1, 8, hingeX, ky + 0.025, 0, 'door-knuckle');
    knuckle.rotation.z = Math.PI / 2;
  }

  return g;
}

/**
 * Pure pose for any single-leaf door. Reads the swing side/angle the layout
 * baked into hinge.userData at build time; the pose is derived ONLY from
 * t ∈ [0,1] (never accumulated, deterministic mid-swing re-trigger).
 */
export function setStableLeafDoorOpen(root: THREE.Object3D, t: number): void {
  const hinge = root.getObjectByName('door-hinge') as THREE.Group | null;
  if (!hinge) return;
  const sign = Number(hinge.userData.openSign ?? 1) || 1;
  const deg = Number(hinge.userData.openDeg ?? STALL_DOOR_OPEN_ANGLE) || STALL_DOOR_OPEN_ANGLE;
  // `+ 0` normalizes −0 (negative sign × t=0) to +0 — pure pose, no quirks.
  hinge.rotation.y = THREE.MathUtils.clamp(t, 0, 1) * deg * sign + 0;
}

/* -------------------------------------------------------------------------- */
/* Registration                                                                */
/* -------------------------------------------------------------------------- */

export const STABLE_DOOR_ASSET_TYPES = Object.freeze([
  'stable-gate',
  'stable-stall-door',
  'stable-room-door',
  'stable-staff-door',
] as const);

export type StableDoorAssetType = (typeof STABLE_DOOR_ASSET_TYPES)[number];
