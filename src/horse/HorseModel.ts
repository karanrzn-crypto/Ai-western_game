/**
 * HorseModel — procedural build of the western horse.
 *
 * Same architecture as CharacterModel: every articulated part is a
 * THREE.Group ("joint") so the animator only ever rotates groups; meshes are
 * rigid children, so nothing can tear or clip. Shared materials, low-poly
 * primitives, a micro-detail layer hidden beyond the LOD distance (bridle,
 * blaze, hooves, stirrups), and a rigid `riderSocket` group on the saddle —
 * the player's character root is attached to that socket while riding, which
 * makes rider position/rotation bit-stable relative to the horse for free
 * (no per-frame lerp, no drift).
 *
 * Face convention: -Z is forward (head), +Z is the tail — identical to the
 * character and the player controller.
 *
 * SCALE SYSTEM (strict revision §6): every hand-coded length in this file is
 * expressed as (reference length × HORSE_SCALE) via the local `L()`
 * multiplier — proportions NEVER drift from HorseProportions, and the
 * rider/saddle/socket/collision systems all read the same scaled metrics.
 */
import * as THREE from 'three';
import { HORSE_PROPORTIONS as P } from './HorseProportions.js';

/** Distance (m) beyond which micro-detail meshes are hidden (LOD switch). */
export const HORSE_DETAIL_DISTANCE = 22;

/** Local length multiplier — the ONE gate every model dimension flows through. */
const L = (v: number): number => v * P.scale;

export interface HorseMaterials {
  coat: THREE.MeshStandardMaterial;
  coatDark: THREE.MeshStandardMaterial;
  mane: THREE.MeshStandardMaterial;
  muzzle: THREE.MeshStandardMaterial;
  hoof: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  leatherDark: THREE.MeshStandardMaterial;
  blanket: THREE.MeshStandardMaterial;
  /** Contrasting woven stripe across the saddle blanket. */
  blanketStripe: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
}

export type HorseJoints = Record<HorseJointName, THREE.Group>;

export type HorseJointName =
  | 'body' | 'neck' | 'head' | 'earL' | 'earR' | 'tail'
  | 'legFL' | 'kneeFL' | 'legFR' | 'kneeFR'
  | 'legBL' | 'kneeBL' | 'legBR' | 'kneeBR';

export interface HorseModel {
  /** Hooves at y=0, facing -Z. Synced from the horse controller every frame. */
  root: THREE.Group;
  joints: HorseJoints;
  materials: HorseMaterials;
  /** Saddle seat — the player's character root is attached here while riding. */
  riderSocket: THREE.Group;
  /** Eye meshes (blink animation scales them). */
  eyes: [THREE.Mesh, THREE.Mesh];
  setDetailVisible(visible: boolean): void;
  updateLOD(cameraPosition: THREE.Vector3, detailDistance?: number): boolean;
  dispose(): void;
}

function createHorseMaterials(): HorseMaterials {
  const std = (color: number, roughness: number, metalness = 0): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    coat: std(0x6d4a2c, 0.82),        // bay body
    coatDark: std(0x4a3018, 0.85),    // lower legs / points
    mane: std(0x1d150c, 0.92),        // black mane & tail
    muzzle: std(0x2e2115, 0.78),
    hoof: std(0x241a10, 0.62),
    leather: std(0x4c3218, 0.7),
    leatherDark: std(0x33220f, 0.72),
    blanket: std(0x7a3b2e, 0.9),      // faded red saddle blanket
    blanketStripe: std(0xd9c9a8, 0.95), // cream woven stripe
    brass: std(0xb08d3f, 0.42, 0.9),
    eye: std(0x120c06, 0.4),
  };
}

export function createHorseModel(): HorseModel {
  const materials = createHorseMaterials();
  const root = new THREE.Group();
  root.name = 'horse-root';
  // YXZ: yaw first, then the death roll — the horse rolls onto its side
  // relative to its own facing, whatever the yaw is.
  root.rotation.order = 'YXZ';

  const joints = {} as HorseJoints;
  const detailParts: THREE.Object3D[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const group = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const mesh = (
    parent: THREE.Object3D,
    material: THREE.Material,
    w: number, h: number, d: number,
    x = 0, y = 0, z = 0,
    detail = false,
    name = '',
  ): THREE.Mesh => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    if (name) m.name = name;
    parent.add(m);
    if (detail) detailParts.push(m);
    return m;
  };
  const cylinder = (
    parent: THREE.Object3D,
    material: THREE.Material,
    radiusTop: number, radiusBottom: number, height: number,
    x = 0, y = 0, z = 0,
    detail = false,
    segments = 9,
    name = '',
  ): THREE.Mesh => {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    if (name) m.name = name;
    parent.add(m);
    if (detail) detailParts.push(m);
    return m;
  };

  // --- Hindquarters anchor geometry ------------------------------------------
  // The tail attachment is DERIVED from the actual hindquarters box, not a
  // hand-tuned offset: the box is declared ONCE here, the hindquarters mesh
  // and the tail joint both read it, and the tail root is sunk a small,
  // intentional overlap into the box's rear face. Result: no visible gap
  // between dock and rump, the dock is never swallowed by the body, and the
  // root cannot drift when the proportions change — the anchor follows the
  // geometry by construction.
  const HINDQUARTERS = {
    width: P.bodyWidth * 0.96,
    height: P.bodyHeight * 0.92,
    depth: L(0.5),
    y: L(0.03),
    z: L(0.58),
  } as const;
  /** How deep the tail root disk sits INSIDE the hindquarters' rear face. */
  const TAIL_ROOT_OVERLAP = L(0.035);
  /** Root-space z of the tail joint: rear face minus the deliberate overlap. */
  const tailAnchorZ = HINDQUARTERS.z + HINDQUARTERS.depth / 2 - TAIL_ROOT_OVERLAP;

  // --- Rig skeleton ---------------------------------------------------------
  // `body` is the whole-torso joint (bob / pitch / roll of the barrel).
  const body = group('body', root, 0, P.bodyCenterY, 0);
  const neck = group('neck', root, 0, P.neckBaseY, P.neckBaseZ);
  const head = group('head', neck, 0, L(0.62), L(-0.12));
  const earL = group('earL', head, L(-0.09), L(0.14), L(0.02));
  const earR = group('earR', head, L(0.09), L(0.14), L(0.02));
  const tail = group('tail', root, 0, P.tailBaseY, tailAnchorZ);
  const legFL = group('legFL', root, -P.legHalfWidth, P.frontLegY, P.frontLegZ);
  const legFR = group('legFR', root, P.legHalfWidth, P.frontLegY, P.frontLegZ);
  const legBL = group('legBL', root, -P.legHalfWidth, P.hindLegY, P.hindLegZ);
  const legBR = group('legBR', root, P.legHalfWidth, P.hindLegY, P.hindLegZ);
  const kneeFL = group('kneeFL', legFL, 0, -P.upperLeg, 0);
  const kneeFR = group('kneeFR', legFR, 0, -P.upperLeg, 0);
  const kneeBL = group('kneeBL', legBL, 0, -P.upperLeg, 0);
  const kneeBR = group('kneeBR', legBR, 0, -P.upperLeg, 0);
  Object.assign(joints, { body, neck, head, earL, earR, tail, legFL, kneeFL, legFR, kneeFR, legBL, kneeBL, legBR, kneeBR });

  // --- Torso (barrel) ---------------------------------------------------------
  // A tapered chest → rounded hindquarters read, built from 3 boxes. The
  // overlay masses stay BARELY wider than the barrel (a lean riding horse,
  // not a draft animal) — the slim silhouette lives in these multipliers.
  mesh(body, materials.coat, P.bodyWidth, P.bodyHeight * 0.94, L(0.7), 0, L(0.02), L(-0.42), false, 'chest');   // chest
  mesh(body, materials.coat, P.bodyWidth, P.bodyHeight, L(0.62), 0, 0, L(0.12), false, 'barrel');             // barrel
  mesh(body, materials.coat, HINDQUARTERS.width, HINDQUARTERS.height, HINDQUARTERS.depth, 0, HINDQUARTERS.y, HINDQUARTERS.z, false, 'hindquarters'); // hindquarters
  // Belly shading + shoulder/haunch muscle masses.
  // The shade slab is deliberately NARROWER than the barrel/chest (which are
  // both exactly P.bodyWidth wide): an exactly-flush side face would be
  // coplanar with their side faces (same normals, overlapping area) and
  // z-fight between the bay and dark-bay materials. Inset sides stay strictly
  // inside the barrel; the shade still reads from below — its bottom pokes
  // ~3cm beneath the barrel's bottom face (non-coplanar planes).
  mesh(body, materials.coatDark, P.bodyWidth * 0.98, L(0.16), L(1.2), 0, -P.bodyHeight * 0.44, L(0.05), false, 'belly-shade');
  mesh(body, materials.coat, P.bodyWidth * 1.03, L(0.3), L(0.32), 0, L(0.1), L(-0.5), false, 'shoulder-mass');
  mesh(body, materials.coat, P.bodyWidth * 1.02, L(0.32), L(0.34), 0, L(0.12), L(0.62), false, 'haunch-mass');

  // --- Western saddle (rigid — never animated) ---------------------------------
  // The saddle must sit ON TOP of the back, never inside it. The barrel top
  // is at bodyCenterY + bodyHeight/2; the stack is layered upward from there
  // — every layer's underside either touches the layer below or is hidden
  // inside the barrel top edge (intentional contact):
  //
  //   blanket  barrelTop-0.015 .. +0.025   (drapes past the barrel sides)
  //   skirt    blanketTop .. +0.075        (leather base slab)
  //   seat     skirtTop .. saddleTopY      (top face IS saddleTopY)
  //   pommel   seat .. +0.11  + horn → +0.17 (western signature, front rise)
  //   cantle   seat .. +0.13  + brass rim  (rear rise, taller than the pommel)
  //
  // Fenders hang OUTSIDE the barrel silhouette and the stirrup tread top
  // lands exactly at the seated boot bottoms (riderFeetY + 0.0225·scale).
  const saddleY = P.saddleTopY - P.bodyCenterY; // seat top, body-local
  // 1) Saddle blanket: slab over the back + short rear side flaps (the flaps
  //    stop well behind the rider's knee zone so nothing can clip the leg).
  //    The woven stripe rides just above the blanket's bottom edge and is
  //    slightly WIDER than the blanket: flush side faces z-fought
  //    red↔cream, and the leather skirt buries the blanket's top face, so a
  //    top-face stripe would be invisible — the lower edge is the one place
  //    the band stays visible on both sides.
  mesh(body, materials.blanket, L(0.70), L(0.04), L(0.70), 0, saddleY - L(0.115), L(0.05), false, 'blanket');
  mesh(body, materials.blanketStripe, L(0.72), L(0.014), L(0.12), 0, saddleY - L(0.125), L(0.05), true, 'blanket-stripe');
  mesh(body, materials.blanket, L(0.02), L(0.24), L(0.28), -L(0.335), saddleY - L(0.26), L(0.24), false, 'blanket-flap-l');
  mesh(body, materials.blanket, L(0.02), L(0.24), L(0.28), L(0.335), saddleY - L(0.26), L(0.24), false, 'blanket-flap-r');
  // 2) Leather skirt — the wide base slab that carries the whole saddle.
  mesh(body, materials.leatherDark, L(0.69), L(0.05), L(0.62), 0, saddleY - L(0.09), L(0.05), false, 'skirt');
  // 3) Cinch strap under the belly (reads as a wrapped girth; ends emerge
  //    just past the barrel sides so it visibly wraps, not hides).
  mesh(body, materials.leatherDark, L(0.68), L(0.05), L(0.09), 0, -P.bodyHeight / 2 - L(0.02), L(0.06), false, 'cinch');
  // 4) Seat pad — top face IS saddleTopY (rider sits here).
  mesh(body, materials.leather, L(0.60), L(0.05), L(0.52), 0, saddleY - L(0.025), L(0.06), false, 'seat');
  // 5) Pommel fork (front rise) + horn — the western signature.
  mesh(body, materials.leatherDark, L(0.34), L(0.11), L(0.13), 0, saddleY + L(0.055), L(-0.165), false, 'pommel');
  const horn = cylinder(body, materials.leatherDark, L(0.028), L(0.05), L(0.12), 0, saddleY + L(0.165), L(-0.165), false, 8, 'horn');
  horn.rotation.x = -0.22;
  cylinder(body, materials.brass, L(0.032), L(0.032), L(0.03), 0, saddleY + L(0.215), L(-0.172), true, 8, 'horn-cap'); // horn cap
  // 6) Cantle (rear rise) — taller than the pommel, with a brass rim. The rim
  //    is slightly WIDER than the leather: flush side faces z-fought
  //    leather↔brass; a proud rim reads as a wrapped brass edging.
  mesh(body, materials.leatherDark, L(0.40), L(0.13), L(0.11), 0, saddleY + L(0.065), L(0.30), false, 'cantle');
  mesh(body, materials.brass, L(0.42), L(0.03), L(0.115), 0, saddleY + L(0.13), L(0.30), true, 'cantle-rim');
  // 7) Fenders hang from the skirt's outer edge straight down (clear of the
  //    barrel; behind the rider's ankle). Their tops stop 1cm BELOW the
  //    blanket's top plane — flush tops z-fought leather↔blanket along the
  //    seam. Each stirrup = two side straps straddling the boot + the tread
  //    bar whose TOP face is exactly the seated boot bottoms
  //    (riderFeetY + 0.0225·scale).
  mesh(body, materials.leatherDark, L(0.09), L(0.39), L(0.05), -L(0.375), saddleY - L(0.30), L(0.145), false, 'fender-l');
  mesh(body, materials.leatherDark, L(0.09), L(0.39), L(0.05), L(0.375), saddleY - L(0.30), L(0.145), false, 'fender-r');
  const treadTop = P.riderFeetY + 0.0225 * P.scale - P.bodyCenterY; // body-local y of the boot bottoms
  const stirrupBuild = (side: -1 | 1): void => {
    // Outer strap stands PROUD of the tread's outer face (0.492 vs 0.50 half
    // width would be flush at the old 0.485 → coplanar leather pair).
    for (const lx of [0.492, 0.3]) {
      mesh(body, materials.leatherDark, L(0.03), L(0.06), L(0.05), side * L(lx), treadTop + L(0.0225), L(0.10), side === -1, side === -1 ? 'stirrup-strap-l' : 'stirrup-strap-r');
    }
    const tread = mesh(body, materials.leather, L(0.21), L(0.045), L(0.17), side * L(0.395), treadTop - L(0.0225), L(0.02), false, side === -1 ? 'stirrup-l' : 'stirrup-r');
    tread.name = side === -1 ? 'stirrup-l' : 'stirrup-r';
  };
  stirrupBuild(-1);
  stirrupBuild(1);
  // 8) Skirt tie strings (detail flavor) at the skirt's REAR side edges —
  //    behind the seated thigh's path (the thigh spans z 0..-0.33 body-local).
  //    Named for the clearance sweep: the folding shin brushes them (loose
  //    leather, designed contact class).
  mesh(body, materials.leather, L(0.03), L(0.12), L(0.02), -L(0.36), saddleY - L(0.17), L(-0.3), true, 'skirt-tie-l');
  mesh(body, materials.leather, L(0.03), L(0.12), L(0.02), L(0.36), saddleY - L(0.17), L(-0.3), true, 'skirt-tie-r');

  // Rider socket: the character root attaches here while mounted. Local
  // offset = stirrup-level feet, centered on the seat.
  const riderSocket = group('rider-socket', root, 0, P.riderFeetY, P.riderZ);

  // --- Neck, mane, head --------------------------------------------------------
  // The neck is NOT a single cylinder: it is a chain of overlapping
  // elliptical sections along an arched centerline — wide where it leaves
  // the shoulders/chest, tapering through the middle, narrow at the poll,
  // with the crest (top line) convex and the throat line concave. The
  // sections overlap so the union reads as ONE continuous form, and every
  // section is a rigid child of the `neck` joint, so all existing neck/head
  // animation (look, graze, head-low, steering carriage, fear, flinch,
  // death) keeps working unchanged.
  //
  // Centerline (neck-local, scaled; the head joint sits at (0, neckLength, -0.12)):
  //   P0 (-0.06, 0.16)  base — buried inside the withers/chest mass
  //   P1 ( 0.28,-0.02)  mid-lower — climbing forward
  //   P2 ( 0.52,-0.14)  mid-upper
  //   P3 ( 0.72,-0.15)  poll — inside the skull volume (continuous join)
  // Cross-sections are ELLIPSES: zr = half-depth (crest↔throat, the long
  // axis), xr = zr * NECK_X_RATIO (side-to-side, the short axis) — a real
  // horse neck is deeper than it is wide.
  const NECK_X_RATIO = 0.62;
  const neckPath: Array<{ y: number; z: number; zr: number }> = [
    { y: L(-0.06), z: L(0.16), zr: L(0.235) },
    { y: L(0.28), z: L(-0.02), zr: L(0.205) },
    { y: L(0.52), z: L(-0.14), zr: L(0.16) },
    { y: L(0.72), z: L(-0.15), zr: L(0.115) },
  ];
  const NECK_SEGMENTS: Array<{ from: number; to: number; rFrom: number; rTo: number; detail?: boolean }> = [
    { from: 0, to: 1, rFrom: L(0.235), rTo: L(0.19) },
    { from: 1, to: 2, rFrom: L(0.205), rTo: L(0.15) },
    { from: 2, to: 3, rFrom: L(0.16), rTo: L(0.115) },
  ];
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  for (const seg of NECK_SEGMENTS) {
    const a = neckPath[seg.from];
    const b = neckPath[seg.to];
    dir.set(0, b.y - a.y, b.z - a.z);
    const length = dir.length();
    dir.normalize();
    // Extend both ends so consecutive sections overlap into a continuous form.
    const ext = L(0.055);
    const midY = (a.y + b.y) / 2 - dir.y * 0; // midpoint of the chord
    const midZ = (a.z + b.z) / 2;
    const geoLen = length + ext * 2;
    const cyl = cylinder(neck, materials.coat, seg.rTo, seg.rFrom, geoLen, 0, midY, midZ, seg.detail === true, 11, `neck-${seg.from}`);
    cyl.quaternion.setFromUnitVectors(up, dir);
    cyl.scale.x = NECK_X_RATIO;
    // Recenter the mesh on the true segment midpoint (cylinder() positioned at
    // (midY, midZ) already; orientation pivots around the mesh origin).
    cyl.position.set(0, midY, midZ);
  }
  // Chest blend wedge: a flattened section that spreads the base into the
  // shoulders so the widest part of the neck melts into the torso silhouette.
  const baseBlend = cylinder(neck, materials.coat, L(0.19), L(0.235), L(0.34), 0, L(-0.115), L(0.205), false, 11);
  baseBlend.quaternion.setFromUnitVectors(up, new THREE.Vector3(0, 0.94, 0.34).normalize());
  baseBlend.scale.set(NECK_X_RATIO * 1.12, 1, 1.06);
  // Mane: thin boxes riding the CREST (back-top edge) of the arch, oriented
  // along the local segment direction — repositions the old straight-line mane
  // onto the new curved crest.
  const crestTs = [0.06, 0.24, 0.42, 0.6, 0.78, 0.93];
  for (let i = 0; i < crestTs.length; i += 1) {
    const t = crestTs[i];
    const segIndex = t < 1 / 3 ? 0 : t < 2 / 3 ? 1 : 2;
    const a = neckPath[segIndex];
    const b = neckPath[segIndex + 1];
    const local = (t - segIndex / 3) * 3; // 0..1 within the segment
    dir.set(0, b.y - a.y, b.z - a.z).normalize();
    const py = a.y + (b.y - a.y) * local;
    const pz = a.z + (b.z - a.z) * local;
    const zr = a.zr + (b.zr - a.zr) * local;
    const tuft = mesh(
      neck, materials.mane,
      L(0.075), L(0.16 + 0.05 * Math.sin(t * Math.PI)), L(0.1),
      0, py + dir.y * L(0.02) + zr * 0.32, pz + dir.z * L(0.02) + zr * 0.88,
      i % 2 === 0,
    );
    tuft.rotation.x = Math.atan2(dir.z, dir.y); // lean along the crest toward the poll
  }
  // Head: skull box + tapered muzzle + jaw.
  // SURFACE PLANES (head-local z, face forward = -Z) — keep this map in sync:
  //   skull   front -0.29  top +0.19  bottom -0.11  sides ±(headWidth/2)
  //   bridge  front -0.47  top +0.04  bottom -0.16
  //   muzzle  front -0.525 top -0.01  bottom -0.17
  // The old blaze was a full-depth slab (z -0.44..-0.14) whose TOP face sat
  // EXACTLY at the skull's top plane (+0.19) — two coplanar, same-normal,
  // overlapping faces with different materials → hard z-fighting flicker on
  // the forehead; its forward half also floated ~12cm off the skull face as
  // a buried wedge. The rebuilt blaze is a proper OVERLAY of the skull front
  // face: front face pushed 0.03 FORWARD of the skull plane (-Z, the face's
  // own outward direction — no world-space nudge), back buried 0.07 inside,
  // top held 0.035 CLEAR of the skull top plane, lower end sinking into the
  // bridge box (its top is at +0.04). Zero coplanar pairs by construction.
  mesh(head, materials.coat, P.headWidth, L(0.3), L(0.42), 0, L(0.04), L(-0.08), false, 'skull');
  mesh(head, materials.coat, P.headWidth * 0.78, L(0.2), L(0.3), 0, L(-0.06), L(-0.32), false, 'nose-bridge');
  mesh(head, materials.muzzle, P.headWidth * 0.6, L(0.16), L(0.14), 0, L(-0.09), L(-0.46), false, 'muzzle');
  mesh(head, materials.coatDark, L(0.18), L(0.2), L(0.12), 0, L(-0.08), L(0.12), false, 'jaw'); // jaw
  // Blaze (detail) + eyes + forelock + ears.
  mesh(head, materials.muzzle, L(0.06), L(0.22), L(0.1), 0, L(0.045), L(-0.27), true, 'blaze');
  const eyeL = mesh(head, materials.eye, L(0.05), L(0.05), L(0.05), -P.headWidth / 2, L(0.08), L(-0.1), true, 'eye-l');
  const eyeR = mesh(head, materials.eye, L(0.05), L(0.05), L(0.05), P.headWidth / 2, L(0.08), L(-0.1), true, 'eye-r');
  eyeL.name = 'eye-l';
  eyeR.name = 'eye-r';
  mesh(head, materials.mane, L(0.16), L(0.1), L(0.08), 0, L(0.19), L(-0.02), true, 'forelock'); // forelock
  const earBuild = (ear: THREE.Group): void => {
    const cone = new THREE.CylinderGeometry(L(0.008), L(0.055), P.earHeight, 6);
    geometries.push(cone);
    const m = new THREE.Mesh(cone, materials.coat);
    m.position.y = P.earHeight / 2;
    m.castShadow = true;
    ear.add(m);
    const inner = new THREE.CylinderGeometry(L(0.004), L(0.03), P.earHeight * 0.7, 6);
    geometries.push(inner);
    const innerMesh = new THREE.Mesh(inner, materials.muzzle);
    innerMesh.position.set(0, P.earHeight / 2, L(0.03));
    ear.add(innerMesh);
    detailParts.push(innerMesh);
  };
  earBuild(earL);
  earBuild(earR);
  // Bridle (detail): noseband + cheek strap + rein stubs toward the saddle.
  mesh(head, materials.leatherDark, P.headWidth * 0.8, L(0.05), L(0.05), 0, L(-0.04), L(-0.4), true, 'noseband');
  mesh(head, materials.leatherDark, L(0.04), L(0.3), L(0.05), -P.headWidth / 2, L(0.0), L(-0.18), true, 'cheek-strap-l');
  mesh(head, materials.leatherDark, L(0.04), L(0.3), L(0.05), P.headWidth / 2, L(0.0), L(-0.18), true, 'cheek-strap-r');

  // --- Tail ----------------------------------------------------------------------
  // Both tail meshes hang from the tail joint, whose anchor is DERIVED from
  // the hindquarters box (see HINDQUARTERS / tailAnchorZ above): the joint is
  // sunk ~3cm inside the rump's rear face, so the tapered dock crosses the
  // body's rear plane — embedded at the root, visibly emerging below it. The
  // root tuft straddles the seam to hide the intersection line. The animator
  // only ever ROTATES this joint, and rotation about a pivot buried inside
  // the body can never open a gap at the attachment.
  cylinder(tail, materials.mane, L(0.05), L(0.09), P.tailLength, 0, -P.tailLength / 2 + L(0.05), 0, false, 7, 'tail-dock');
  mesh(tail, materials.mane, L(0.14), L(0.3), L(0.08), 0, L(-0.14), L(0.02), false, 'tail-root-tuft'); // tail root tuft

  // --- Legs: upper + lower + hoof --------------------------------------------------
  const buildLeg = (upper: THREE.Group, knee: THREE.Group, dark: boolean): void => {
    cylinder(upper, dark ? materials.coatDark : materials.coat, L(0.095), L(0.08), P.upperLeg, 0, -P.upperLeg / 2, 0, false, 8);
    // Chestnut + joint bulge (detail).
    cylinder(upper, materials.coatDark, L(0.1), L(0.1), L(0.08), 0, L(-0.04), 0, true, 8);
    cylinder(knee, dark ? materials.coatDark : materials.coat, L(0.072), L(0.06), P.lowerLeg, 0, -P.lowerLeg / 2, 0, false, 8);
    mesh(knee, materials.hoof, L(0.12), P.hoofHeight, L(0.15), 0, -P.lowerLeg - P.hoofHeight / 2 + L(0.02), L(-0.01));
  };
  buildLeg(legFL, kneeFL, true);
  buildLeg(legFR, kneeFR, true);
  buildLeg(legBL, kneeBL, false);
  buildLeg(legBR, kneeBR, false);

  return {
    root,
    joints,
    materials,
    riderSocket,
    eyes: [eyeL, eyeR],
    setDetailVisible(visible: boolean): void {
      for (const part of detailParts) part.visible = visible;
    },
    updateLOD(cameraPosition: THREE.Vector3, detailDistance = HORSE_DETAIL_DISTANCE): boolean {
      const distance = cameraPosition.distanceTo(root.position);
      const visible = distance <= detailDistance;
      this.setDetailVisible(visible);
      return visible;
    },
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      root.removeFromParent();
    },
  };
}
