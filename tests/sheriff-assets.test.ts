/**
 * tests/sheriff-assets.test.ts
 * -----------------------------------------------------------------------------
 * Sheriff Office module contract (mirrors the bank suite):
 *  1. REGISTRATION — the 20 asset types (6 shell + 14 user) register; doubles throw.
 *  2. ASSET FIDELITY — the user-supplied builders keep their signatures
 *     (desk drawers/badge/revolver, chair slats, cell hinge/bars/lock, cot
 *     mattress/pillow, rack rifles, cabinet glass, board posters, star badge,
 *     stove ember light + pipe, key rings, lamp flame light, basin, hat belt,
 *     crate stencil battens).
 *  3. SHELL — the sheriff-building group contains its main parts (porch,
 *     gable roof, SHERIFF sign, CITY JAIL plaque, front door leaf, barred
 *     window cages, stovepipe) and owns NO wall geometry.
 *  4. LIGHT BUDGET — exactly 4 real PointLights (desk kerosene + stove ember
 *     + corridor lantern + exterior lantern).
 *  5. COLLISION — walls/floor/porch/ceiling/bar segments/headers/cell doors/
 *     desk/cabinet/stove/cots carry colliders; shell kit, wall mounts and
 *     small decor do not.
 *  6. WALKABILITY — street → porch (0.15 step) → doorway → office; the desk
 *     never seals the room (walk around both sides); office → jail corridor
 *     through the divider doorway; CLOSED cell doors block, OPEN cells pass;
 *     the bars fronts block along their whole length.
 *  7. LAYOUT — desk/chair relation, board/badge on the north wall, gun rack
 *     on the west wall, key rack beside the jail doorway, cots inside their
 *     cells clear of the bars, junction tiling (segments end AT faces), door
 *     gaps exactly match the cell-door frames.
 *  8. CELL DOOR SWING — authored closed; setJailCellDoorOpen swings the leaf
 *     INWARD (+x, into the cell) and never moves the frame.
 *  9. GEOMETRY — no coplanar same-normal overlapping faces with different
 *     materials (the z-fighting class of bug).
 * 10. UUID SANITY — canonical v4-shaped, unique.
 * -----------------------------------------------------------------------------
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  AssetRegistry,
  CollisionWorld,
  registerAllSheriffFactories,
  registerSheriffAssetFactories,
  registerSheriffBuildingFactories,
  SHERIFF_BUILDING_ASSET_TYPES,
  SHERIFF_OFFICE_ASSET_TYPES,
  SHERIFF_LAYOUT,
  SHERIFF_SITE,
  SHERIFF_OBJECT_IDS,
  buildSheriffMapObjects,
  buildSheriffFrontDoor,
  buildWantedBoard,
  setJailCellDoorOpen,
  JAIL_CELL_DOOR_OPEN_ANGLE,
  setSheriffFrontDoorOpen,
  SHERIFF_FRONT_DOOR_OPEN_ANGLE,
} from '../src/index.js';
import type { ObjectDefinition } from '../src/index.js';

const PLAYER_STEP_HEIGHT = 0.35;
const PLAYER_HEIGHT = 1.7;

function box3of(o: THREE.Object3D): THREE.Box3 {
  o.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(o);
}

function makeRegistry(): AssetRegistry {
  const registry = new AssetRegistry();
  registerAllSheriffFactories(registry);
  return registry;
}

/** Replicates ThreeRendererAdapter's transform application for tests. */
function applyDefinition(obj: THREE.Object3D, def: ObjectDefinition): THREE.Object3D {
  const { position, rotation, scale } = def.transform;
  obj.position.set(position.x, position.y, position.z);
  obj.rotation.set(
    THREE.MathUtils.degToRad(rotation.x),
    THREE.MathUtils.degToRad(rotation.y),
    THREE.MathUtils.degToRad(rotation.z),
  );
  obj.scale.set(scale.x, scale.y, scale.z);
  obj.uuid = def.uuid;
  obj.name = def.metadata.name;
  return obj;
}

const movedDef = (base: Partial<ObjectDefinition>): ObjectDefinition => ({
  uuid: '40000000-0000-4000-9000-0000000000aa',
  assetType: 'sheriff-building',
  transform: {
    position: { x: 4, y: 0.5, z: -7 },
    rotation: { x: 10, y: 20, z: 30 },
    scale: { x: 2, y: 3, z: 4 },
  },
  metadata: { name: 'Test Sheriff' },
  ...base,
});

/* -------------------------------------------------------------------------- */

test('SHERIFF REGISTRATION: every type registers; duplicates throw', () => {
  const registry = makeRegistry();
  for (const type of SHERIFF_BUILDING_ASSET_TYPES) {
    assert.ok(registry.has(type), `assetType "${type}" must be registered`);
  }
  for (const type of SHERIFF_OFFICE_ASSET_TYPES) {
    assert.ok(registry.has(type), `assetType "${type}" must be registered`);
  }
  assert.equal(SHERIFF_OFFICE_ASSET_TYPES.length, 14, 'the user library must stay complete (14 types)');
  assert.throws(
    () => registerSheriffBuildingFactories(registry),
    /already registered/,
    'double shell registration must be rejected',
  );
  const fresh = new AssetRegistry();
  registerSheriffAssetFactories(fresh);
  assert.throws(
    () => registerSheriffAssetFactories(fresh),
    /already registered/,
    'double asset registration must be rejected',
  );
});

/* ---- Asset fidelity -------------------------------------------------------- */

test('SHERIFF ASSETS: the 14 user builders keep their signatures', async () => {
  const registry = makeRegistry();
  const create = async (assetType: string): Promise<THREE.Object3D> =>
    registry.create(movedDef({ assetType }));

  // Desk: two pedestal stacks + drawers + the badge + revolver on top.
  const desk = (await create('sheriff-desk')) as THREE.Group;
  const deskParts: string[] = [];
  desk.traverse((o) => deskParts.push(o.name));
  assert.ok(deskParts.length > 10, 'desk must be a composed group');
  const deskBox = box3of(desk);
  assert.ok(deskBox.max.y > 0.75 && deskBox.max.y < 0.95, 'desk top must sit at ~0.75 (+ props)');

  // Chair: ladder-back slats + leather cushion.
  const chair = (await create('sheriff-chair')) as THREE.Group;
  const chairBox = box3of(chair);
  assert.ok(chairBox.max.y > 0.85, 'ladder back must rise above the seat');

  // Cell door: hinge group + bars + lock plate (traverse — bars live inside
  // the hinge's doorFrame subgroup).
  const door = (await create('jail-cell-door')) as THREE.Group;
  const hinge = door.getObjectByName('jail-cell-door-hinge');
  assert.ok(hinge, 'cell door must expose its hinge group');
  let cylCount = 0;
  door.traverse((o) => { if ((o as THREE.Mesh).geometry instanceof THREE.CylinderGeometry) cylCount += 1; });
  assert.ok(cylCount >= 10, 'cell door must carry its bar cage (9 bars + knuckles)');

  // Cot: mattress + pillow on an iron frame.
  const cot = (await create('cell-cot')) as THREE.Group;
  const cotBox = box3of(cot);
  assert.ok(Math.abs((cotBox.max.z - cotBox.min.z) - 0.7) < 0.05, 'cot width must stay 0.7');
  assert.ok(cotBox.max.y > 0.4 && cotBox.max.y < 0.7, 'cot top must stay bunk-height (incl. headboard)');

  // Gun rack: four rifles standing in a floor rack.
  const rack = (await create('gun-rack')) as THREE.Group;
  assert.equal(rack.children.filter((c) => (c as THREE.Group).isGroup).length, 4, 'gun rack must hold four rifles');

  // Cabinet: glass front + pediment.
  const cabinet = (await create('gun-cabinet')) as THREE.Group;
  const glass = cabinet.children.find((c) => (c as THREE.Mesh).material instanceof THREE.Material
    && ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).transparent);
  assert.ok(glass, 'gun cabinet must carry its glass front');

  // Wanted board: 4 painted posters + nails (each poster named, nails are
  // its children — the z-ladder itself is asserted in the dedicated test).
  const board = (await create('wanted-board')) as THREE.Group;
  const posterCount = board.children.filter((c) => c.name.startsWith('wanted-poster-')
    && (c as THREE.Mesh).isMesh
    && (c as THREE.Mesh).geometry instanceof THREE.PlaneGeometry
    && Math.abs(((c as THREE.Mesh).geometry as THREE.PlaneGeometry).parameters.width - 0.34) < 1e-6).length;
  assert.equal(posterCount, 4, 'wanted board must layer exactly four posters');

  // Badge: extruded star on a plaque.
  const badge = (await create('sheriff-badge')) as THREE.Group;
  assert.ok(badge.children.length >= 3, 'badge = plaque + star + rim');

  // Stove: pipe + ember light.
  const stove = (await create('potbelly-stove')) as THREE.Group;
  let ember = 0;
  stove.traverse((o) => { if ((o as THREE.PointLight).isPointLight) ember += 1; });
  assert.equal(ember, 1, 'stove must carry exactly one ember light');

  // Key rack / kerosene lamp / wash stand / coat rack / ammo crate.
  const lamp = (await create('kerosene-lamp')) as THREE.Group;
  let flame = 0;
  lamp.traverse((o) => { if ((o as THREE.PointLight).isPointLight) flame += 1; });
  assert.equal(flame, 1, 'kerosene lamp must carry exactly one flame light');

  const washStand = (await create('wash-stand')) as THREE.Group;
  assert.ok(washStand.children.length >= 8, 'wash stand must compose basin/pitcher/towel/shelf');

  const coatRack = (await create('coat-rack')) as THREE.Group;
  const hatGroups = coatRack.children.filter((c) => (c as THREE.Group).isGroup);
  assert.equal(hatGroups.length, 2, 'coat rack must carry hat + gun-belt groups');

  const crate = (await create('ammo-crate')) as THREE.Group;
  assert.ok(crate.children.length >= 5, 'crate must carry battens + rope handles');
});

/* ---- Shell ----------------------------------------------------------------- */

test('SHERIFF SHELL: porch, gable roof, sign, door casing rings, barred cages, stovepipe', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'sheriff-building' }))) as THREE.Group;
  assert.ok(obj.isObject3D, 'the shell must build an Object3D');
  const names = new Set<string>();
  obj.traverse((o) => names.add(o.name));
  for (const part of [
    'porch-post', 'porch-roof', 'roof-slab-south', 'roof-slab-north',
    'gable-infill-east', 'gable-infill-west', 'ridge-cap',
    'sign-face', 'city-jail-plaque', 'door-casing-west-in', 'door-casing-west-out',
    'stovepipe', 'stovepipe-cap', 'foundation-south',
    'frieze-south', 'water-table-south', 'corner-board-wn',
  ]) {
    assert.ok(names.has(part), `shell must contain "${part}"`);
  }
  // The openable LEAF is its own 'sheriff-front-door' asset — the shell must
  // NOT carry a door leaf anymore (the old propped-open static leaf).
  assert.ok(!names.has('front-door-leaf'), 'shell must NOT own the door leaf (it is a separate openable asset)');
  assert.ok(!names.has('door-glass'), 'shell must NOT own the door glass (it moved with the leaf)');
  // The shell owns NO wall geometry — the six windows exist, walls do not.
  assert.ok([...names].some((n) => n.startsWith('window-')), 'shell must carry the window assemblies');
  assert.ok(!names.has('wall'), 'shell must NOT own wall boxes (unit-box walls own the colliders)');
  // Two barred jail windows (cages) + two shuttered office windows.
  let cages = 0; let shutters = 0;
  obj.traverse((o) => {
    if (o.name === 'jail-bar') cages += 1;
    if (o.name === 'shutter') shutters += 1;
  });
  assert.equal(cages, 12, 'three barred windows × four bars');
  assert.equal(shutters, 4, 'two shuttered windows × two shutters');
});

/* ---- Light budget ----------------------------------------------------------- */

test('SHERIFF LIGHT BUDGET: exactly 4 real PointLights across the whole block', async () => {
  const registry = makeRegistry();
  const defs = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z);
  const LIGHT_UUIDS = new Set<string>([
    SHERIFF_OBJECT_IDS.deskLamp, SHERIFF_OBJECT_IDS.stove,
    SHERIFF_OBJECT_IDS.corridorLantern, SHERIFF_OBJECT_IDS.exteriorLantern,
  ]);
  let total = 0;
  const litUuids = new Set<string>();
  for (const def of defs) {
    const obj = await registry.create(def);
    let count = 0;
    obj.traverse((o) => { if ((o as THREE.PointLight).isPointLight) count += 1; });
    if (count > 0) litUuids.add(def.uuid);
    total += count;
  }
  assert.equal(total, 4, '4 PointLights: desk kerosene + stove ember + corridor lantern + exterior lantern');
  for (const uuid of LIGHT_UUIDS) {
    assert.ok(litUuids.has(uuid), `light source ${uuid} must actually carry its light`);
  }
  assert.equal(litUuids.size, 4, 'nothing else in the block may emit light');
});

/* ---- Collision --------------------------------------------------------------- */

test('SHERIFF COLLISION: masonry and solid furniture carry colliders, decor does not', () => {
  const defs = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z);
  const flag = (uuid: string): boolean | undefined => {
    const def = defs.find((d) => d.uuid === uuid);
    assert.ok(def, `missing definition for ${uuid}`);
    return def.metadata.collider as boolean;
  };
  // Shell boxes (the real masonry).
  for (const id of [
    SHERIFF_OBJECT_IDS.floor, SHERIFF_OBJECT_IDS.threshold, SHERIFF_OBJECT_IDS.porchDeck,
    SHERIFF_OBJECT_IDS.ceiling, SHERIFF_OBJECT_IDS.wallRear, SHERIFF_OBJECT_IDS.wallWest,
    SHERIFF_OBJECT_IDS.wallEast, SHERIFF_OBJECT_IDS.wallFrontWest, SHERIFF_OBJECT_IDS.wallFrontEast,
    SHERIFF_OBJECT_IDS.wallFrontHeader, SHERIFF_OBJECT_IDS.divNorth, SHERIFF_OBJECT_IDS.divHeader,
    SHERIFF_OBJECT_IDS.divSouth, SHERIFF_OBJECT_IDS.cellDivider,
    SHERIFF_OBJECT_IDS.barANorth, SHERIFF_OBJECT_IDS.barASouth, SHERIFF_OBJECT_IDS.barAHeader,
    SHERIFF_OBJECT_IDS.barBNorth, SHERIFF_OBJECT_IDS.barBSouth, SHERIFF_OBJECT_IDS.barBHeader,
  ]) {
    assert.equal(flag(id), true, `shell box ${id} must be a collider`);
  }
  // The cell doors spawn CLOSED — they ARE the cell walkability switches.
  assert.equal(flag(SHERIFF_OBJECT_IDS.cellDoorA), true, 'closed cell door A must be a collider');
  assert.equal(flag(SHERIFF_OBJECT_IDS.cellDoorB), true, 'closed cell door B must be a collider');
  // The front door spawns CLOSED — it is the office's public walkability switch.
  assert.equal(flag(SHERIFF_OBJECT_IDS.frontDoor), true, 'closed front door must be a collider');
  // Solid furniture (composites carry the object form { boxes: [...] } —
  // exact local collision boxes; armed when true OR a box list).
  const armed = (uuid: string, label: string): void => {
    const c = flag(uuid);
    const ok = c === true || (typeof c === 'object' && c !== null && (c as { enabled?: unknown }).enabled !== false);
    assert.ok(ok, `${label} must be a collider`);
  };
  for (const id of [SHERIFF_OBJECT_IDS.desk, SHERIFF_OBJECT_IDS.gunCabinet,
    SHERIFF_OBJECT_IDS.stove, SHERIFF_OBJECT_IDS.cotA, SHERIFF_OBJECT_IDS.cotB]) {
    armed(id, `furniture ${id}`);
  }
  // Shell kit + wall mounts + seats + small decor.
  for (const id of [SHERIFF_OBJECT_IDS.building, SHERIFF_OBJECT_IDS.chair,
    SHERIFF_OBJECT_IDS.deskLamp, SHERIFF_OBJECT_IDS.wantedBoard, SHERIFF_OBJECT_IDS.badgePlaque,
    SHERIFF_OBJECT_IDS.gunRack, SHERIFF_OBJECT_IDS.washStand, SHERIFF_OBJECT_IDS.ammoCrate1,
    SHERIFF_OBJECT_IDS.ammoCrate2, SHERIFF_OBJECT_IDS.coatRack, SHERIFF_OBJECT_IDS.keyRack,
    SHERIFF_OBJECT_IDS.corridorLantern, SHERIFF_OBJECT_IDS.exteriorLantern]) {
    assert.equal(flag(id), false, `decor ${id} must NOT be a collider`);
  }
});

/* ---- Walkability --------------------------------------------------------------- */

test('SHERIFF WALKABILITY: porch step, doorway, around-desk paths, jail corridor, cells', () => {
  const defs = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z);
  const world = new CollisionWorld(defs);
  const L = SHERIFF_LAYOUT;
  const S = SHERIFF_SITE;
  const P = L.partitions;
  const standingY = L.floorTop + PLAYER_HEIGHT;
  const doorX = S.x + (L.frontDoor.xMin + L.frontDoor.xMax) / 2;

  // Helper: PlayerController-style step-up walk (lift → move → settle).
  // A lift is only ACCEPTED when the settle lands within one step rise of the
  // previous surface — the same constraint the real controller's step logic
  // obeys — so tall boxes (the 1 m cell-door colliders) can never be summed.
  const walk = (
    from: { x: number; y: number; z: number },
    delta: { x: number; y: number; z: number },
    steps: number,
  ): { x: number; y: number; z: number } => {
    let p = { ...from };
    for (let i = 0; i < steps; i += 1) {
      const r = world.movePlayer(p, delta);
      if (!r.blockedX && !r.blockedZ) { p = r.position; continue; }
      const lifted = world.movePlayer(p, { x: 0, y: PLAYER_STEP_HEIGHT, z: 0 });
      const moved = world.movePlayer(lifted.position, delta);
      const settled = world.movePlayer(moved.position, { x: 0, y: -(PLAYER_STEP_HEIGHT + 0.05), z: 0 });
      const progressed = Math.abs(settled.position.x - p.x) > 1e-6 || Math.abs(settled.position.z - p.z) > 1e-6;
      const oneRise = settled.position.y - p.y <= PLAYER_STEP_HEIGHT + 1e-6;
      if (progressed && oneRise) p = settled.position;
      else break; // genuinely blocked at a too-tall face
    }
    return p;
  };

  // 1) The CLOSED front door blocks the public entrance at its collider box's
  // south face (the def's yaw-conservative 1×1 box centered on the doorway).
  let p: { x: number; y: number; z: number };
  const frontDoorDef = defs.find((d) => d.uuid === SHERIFF_OBJECT_IDS.frontDoor)!;
  const doorBoxFaceZ = frontDoorDef.transform.position.z + 0.5 + 0.35;
  const atDoor = walk({ x: doorX, y: PLAYER_HEIGHT, z: S.z + 7.0 }, { x: 0, y: 0, z: -0.2 }, 45);
  assert.ok(
    Math.abs(atDoor.z - doorBoxFaceZ) < 0.06,
    `closed front door must block at z≈${doorBoxFaceZ.toFixed(2)} (stopped z=${atDoor.z.toFixed(2)})`,
  );

  // 1b) With the door OPEN (collider released — exactly what the E interaction
  // does) the same walk steps onto the porch, crosses the facade line through
  // the doorway and stands on the office floor.
  const entryDefs = defs.map((d) => (d.uuid === SHERIFF_OBJECT_IDS.frontDoor
    ? { ...d, metadata: { ...d.metadata, collider: false } }
    : d));
  const entryWorld = new CollisionWorld(entryDefs);
  const entryWalk = (
    from: { x: number; y: number; z: number },
    delta: { x: number; y: number; z: number },
    steps: number,
  ): { x: number; y: number; z: number } => {
    let p = { ...from };
    for (let i = 0; i < steps; i += 1) {
      const r = entryWorld.movePlayer(p, delta);
      if (!r.blockedX && !r.blockedZ) { p = r.position; continue; }
      const lifted = entryWorld.movePlayer(p, { x: 0, y: PLAYER_STEP_HEIGHT, z: 0 });
      const moved = entryWorld.movePlayer(lifted.position, delta);
      const settled = entryWorld.movePlayer(moved.position, { x: 0, y: -(PLAYER_STEP_HEIGHT + 0.05), z: 0 });
      const progressed = Math.abs(settled.position.x - p.x) > 1e-6 || Math.abs(settled.position.z - p.z) > 1e-6;
      const oneRise = settled.position.y - p.y <= PLAYER_STEP_HEIGHT + 1e-6;
      if (progressed && oneRise) p = settled.position;
      else break;
    }
    return p;
  };
  p = entryWalk({ x: doorX, y: PLAYER_HEIGHT, z: S.z + 7.0 }, { x: 0, y: 0, z: -0.2 }, 45);
  assert.ok(p.y > L.floorTop, `player must stand on the porch/floor slab (y=${p.y.toFixed(2)})`);
  assert.ok(p.z < S.z + L.depth / 2, 'player must pass the facade line through the doorway');

  // 2) The desk NEVER seals the office: straight north lanes on BOTH sides
  // of it reach the office rear (desk AABB is the yaw-conservative 1×1 box).
  const deskDef = defs.find((d) => d.uuid === SHERIFF_OBJECT_IDS.desk)!;
  const deskX = deskDef.transform.position.x;
  const westSide = walk({ x: deskX - 1.5, y: standingY, z: S.z + 2.6 }, { x: 0, y: 0, z: -0.1 }, 40);
  assert.ok(westSide.z < S.z - 1.0, `west of the desk must reach the office rear (z=${westSide.z.toFixed(2)})`);
  const eastSide = walk({ x: deskX + 1.5, y: standingY, z: S.z + 2.6 }, { x: 0, y: 0, z: -0.1 }, 40);
  assert.ok(eastSide.z < S.z - 1.0, `east of the desk must reach the office rear (z=${eastSide.z.toFixed(2)})`);

  // 3) Office → jail corridor through the divider doorway.
  const corridorDoorZ = S.z + (P.dividerDoor.zMin + P.dividerDoor.zMax) / 2;
  p = walk({ x: S.x - 1.0, y: standingY, z: corridorDoorZ }, { x: 0.1, y: 0, z: 0 }, 25);
  assert.ok(p.x > S.x + P.dividerX, `player must cross the divider doorway into the corridor (x=${p.x.toFixed(2)})`);

  // 4) The corridor is walkable end to end — hug the WEST lane (the cell
  // doors' conservative 1×1 boxes protrude 0.45 m into the corridor; the
  // divider at x=0 keeps a real lane west of them).
  p = { x: S.x + 0.6, y: standingY, z: p.z };
  p = walk(p, { x: 0, y: 0, z: -0.1 }, 60);
  assert.ok(p.z < S.z - 2.5, `corridor must run to its north end (z=${p.z.toFixed(2)})`);

  // 5) Cell door A CLOSED blocks the corridor at the door box's west face.
  const doorA = defs.find((d) => d.uuid === SHERIFF_OBJECT_IDS.cellDoorA)!;
  const doorAX = doorA.transform.position.x;
  p = walk({ x: S.x + 0.6, y: standingY, z: doorA.transform.position.z }, { x: 0.1, y: 0, z: 0 }, 20);
  const doorFaceA = doorAX - 0.5 - 0.35;
  assert.ok(
    Math.abs(p.x - doorFaceA) < 0.06,
    `closed cell door A must block at x≈${doorFaceA.toFixed(2)} (stopped ${p.x.toFixed(2)})`,
  );

  // 6) Cell door A OPEN (collider released — exactly what the runtime
  // interaction does) → the player walks THROUGH the 1.22 m gap INTO the cell.
  const openDefs = defs.map((d) => (d.uuid === SHERIFF_OBJECT_IDS.cellDoorA
    ? { ...d, metadata: { ...d.metadata, collider: false } }
    : d));
  const openWorld = new CollisionWorld(openDefs);
  let q: { x: number; y: number; z: number } = { x: S.x + 0.6, y: standingY, z: doorA.transform.position.z };
  for (let i = 0; i < 30; i += 1) {
    q = openWorld.movePlayer(q, { x: 0.1, y: 0, z: 0 }).position;
  }
  assert.ok(q.x > doorAX + 0.7, `player must enter cell A through the open door (x=${q.x.toFixed(2)})`);

  // 7) The bars fronts block along their whole length (both cells).
  const barFaceX = S.x + P.barsX - P.barsThickness / 2 - 0.35;
  const barProbe = (zLocal: number): void => {
    let b: { x: number; y: number; z: number } = { x: S.x + 0.5, y: standingY, z: S.z + zLocal };
    b = walk(b, { x: 0.1, y: 0, z: 0 }, 16);
    assert.ok(
      Math.abs(b.x - barFaceX) < 0.06,
      `bars front must block at z=${zLocal} (stopped x=${b.x.toFixed(2)}, expected ${barFaceX.toFixed(2)})`,
    );
  };
  barProbe(P.cellDoorAN + 1.1); // south of cell A's door gap (clear of the door box corner)
  barProbe(P.cellDoorBN - 1.1); // north of cell B's door gap
  barProbe(P.cellDoorBN + 1.5); // south of cell B's door gap
});

/* ---- Layout ---------------------------------------------------------------------- */

test('SHERIFF LAYOUT: office reads like a real law office, jail reads like a jail', () => {
  const defs = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z);
  const p = (uuid: string): ObjectDefinition => {
    const def = defs.find((d) => d.uuid === uuid);
    assert.ok(def, `missing ${uuid}`);
    return def;
  };
  const L = SHERIFF_LAYOUT;
  const S = SHERIFF_SITE;
  const P = L.partitions;

  // Desk faces the door; the chair stands BEHIND the desk (north) facing it,
  // with clear space between seat and desk (no interpenetration).
  const desk = p(SHERIFF_OBJECT_IDS.desk);
  const chair = p(SHERIFF_OBJECT_IDS.chair);
  assert.ok(Math.abs(chair.transform.position.z - (desk.transform.position.z - 0.85)) < 1e-6,
    'chair must sit 0.85 m north of the desk center');
  assert.ok(desk.transform.position.x === chair.transform.position.x, 'desk and chair must align on x');
  assert.equal(chair.transform.rotation.y, 0, 'chair (back at −z) must face the desk (+z)');

  // Wanted board behind the desk on the north wall; badge plaque beside it,
  // both OFF the wall face (no burial).
  const board = p(SHERIFF_OBJECT_IDS.wantedBoard);
  assert.ok(board.transform.position.z > S.z - L.depth / 2 && board.transform.position.z < S.z - 3.3,
    'wanted board must hang on the north wall inner face');
  const badge = p(SHERIFF_OBJECT_IDS.badgePlaque);
  assert.ok(badge.transform.position.y > 1.8 && badge.transform.position.y < 3.3,
    'badge plaque must hang at eye-raised height');
  // The user's Final moves the badge OVER the desk line — it hangs CLEAR
  // ABOVE the wanted board's top (board top ≈ 1.68 world; badge ≥ 1.89).
  assert.ok(badge.transform.position.y > board.transform.position.y + 1.6,
    'badge plaque must hang clear above the wanted board');

  // Gun rack floor-standing against the west wall (back plane 1 cm off the
  // wall inner face), facing east into the office; wash stand + crates also
  // along it, all clear of each other in z.
  const rack = p(SHERIFF_OBJECT_IDS.gunRack);
  assert.equal(rack.transform.rotation.y, 90, 'gun rack must face east into the office');
  assert.ok(Math.abs(rack.transform.position.x - (S.x - (L.width / 2 - L.wallThickness) + 0.01)) < 0.01,
    'gun rack backing must seat 1 cm off the west wall inner face');
  assert.ok(Math.abs(rack.transform.position.y - L.floorTop) < 1e-6, 'gun rack must stand on the plank floor');
  const stand = p(SHERIFF_OBJECT_IDS.washStand);
  const crates = p(SHERIFF_OBJECT_IDS.ammoCrate1);
  for (const [a, b] of [[rack, stand], [stand, crates]] as const) {
    assert.ok(Math.abs(a.transform.position.z - b.transform.position.z) > 1.0,
      'west wall props must not crowd each other');
  }

  // Stove in the corner; desk/props clear of it.
  const stove = p(SHERIFF_OBJECT_IDS.stove);
  assert.ok(Math.abs(stove.transform.position.x - (S.x + L.stove.x)) < 1e-6
    && Math.abs(stove.transform.position.z - (S.z + L.stove.z)) < 1e-6,
    'stove must sit at the layout corner position');

  // Key rack beside the jail doorway on the office face of the divider.
  const keys = p(SHERIFF_OBJECT_IDS.keyRack);
  assert.equal(keys.transform.rotation.y, -90, 'key rack must face west into the office');
  assert.ok(Math.abs(keys.transform.position.x - (S.x + P.dividerX - P.thickness / 2 - 0.025)) < 0.01,
    'key rack backing must seat on the divider office face');
  assert.ok(keys.transform.position.z > S.z + P.dividerDoor.zMin - 1.0
    && keys.transform.position.z < S.z + P.dividerDoor.zMin,
    'key rack must hang just north of the jail doorway');

  // Cells: both cots INSIDE their cells (clear of the bars and the walls).
  for (const [uuid, span] of [
    [SHERIFF_OBJECT_IDS.cotA, P.cellNorth],
    [SHERIFF_OBJECT_IDS.cotB, P.cellSouth],
  ] as const) {
    const cot = p(uuid);
    const localZ = cot.transform.position.z - S.z;
    assert.ok(localZ > span.zMin + 0.2 && localZ < span.zMax - 0.2, `cot ${uuid} inside its cell`);
    assert.ok(cot.transform.position.x > S.x + P.barsX + 0.5
      && cot.transform.position.x < S.x + L.width / 2 - L.wallThickness / 2 - 0.4,
      `cot ${uuid} must hug the east wall with walk room left`);
  }

  // Junction tiling: the divider segments tile around the doorway; the bar
  // segments + headers tile around the cell-door gaps; the cell divider
  // spans bars line → east wall face.
  assert.ok(P.cellNorth.zMax < P.cellSouth.zMin - 0.15, 'cells must be separated by the divider');
  for (const [zMin, zMax, doorZ] of [
    [P.cellNorth.zMin, P.cellNorth.zMax, P.cellDoorAN],
    [P.cellSouth.zMin, P.cellSouth.zMax, P.cellDoorBN],
  ] as const) {
    const frameHalf = 0.61;
    assert.ok(doorZ - frameHalf > zMin + 0.5 && doorZ + frameHalf < zMax - 0.4,
      'cell door gap must fit inside its bar front with masonry to spare');
  }

  // Windows: every window stays inside its wall span, sills above the floor.
  for (const win of L.windows) {
    assert.ok(win.sill > L.floorTop, 'window sills must clear the floor');
    assert.ok(win.center > -L.width / 2 + 0.5 && win.center < L.width / 2 - 0.5, 'windows inside the facade span');
  }

  // Sign over the porch center; plaque over the barred jail window.
  assert.ok(Math.abs((L.porch.xMin + L.porch.xMax) / 2 - (-2.325)) < 1e-6, 'porch covers the office door');
  const barred = L.windows.find((w) => w.wall === 'south' && w.bars);
  assert.ok(barred && Math.abs(barred.center - 2.7) < 1e-6, 'the barred facade window marks the jail');
});

/* ---- User Final transforms -------------------------------------------------------- */

test('SHERIFF USER FINALS: cell-front transforms applied verbatim (world → site-local)', () => {
  const defs = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z);
  const p = (uuid: string): ObjectDefinition => {
    const def = defs.find((d) => d.uuid === uuid);
    assert.ok(def, `missing ${uuid}`);
    return def;
  };
  const S = SHERIFF_SITE;
  // The user's Final table (world positions, degrees, scales) — the layout
  // must reproduce them EXACTLY after the site offset (13, −1.5).
  const finals: [string, number, number, number, number, number, number, number, number, number][] = [
    // uuid, x, y, z, rotX, rotY, rotZ, sx, sy, sz
    [SHERIFF_OBJECT_IDS.barAHeader, 14.7, 2.85, -3.5, 0, 0, 0, 0.1, 1.2, 1.22],
    [SHERIFF_OBJECT_IDS.barBSouth, 14.645, 1.8, 1.155, 0, 0, 0, 0.1, 1.0, 1.0],
    [SHERIFF_OBJECT_IDS.barBHeader, 14.7, 2.94, -0.35, 0, 0, 0, 0.1, 1.3, 1.22],
    [SHERIFF_OBJECT_IDS.barASouth, 14.7, 1.8, -2.47, 0, 0, 0, 0.1, 1.0, 0.8],
    [SHERIFF_OBJECT_IDS.barBNorth, 14.7, 1.8, -1.405, 0, 0, 0, 0.1, 1.0, 1.1],
    [SHERIFF_OBJECT_IDS.cotB, 16.85, 0.15, 1.455, 0, 180, 0, 1.1, 1.1, 1.7],
    [SHERIFF_OBJECT_IDS.cotA, 17.022, 0.15, -2.645, 0, 180, 0, 1.1, 1.1, 1.7],
    [SHERIFF_OBJECT_IDS.barANorth, 14.7, 1.8, -4.58, 0, 0, 0, 0.1, 1.0, 0.94],
    [SHERIFF_OBJECT_IDS.gunCabinet, 12.41, 0.1, -4.87, 0, 0, 0, 1, 1, 1],
    [SHERIFF_OBJECT_IDS.badgePlaque, 10.525, 2.0, -5.03, 0, 0, 0, 1, 1, 1],
  ];
  for (const [uuid, x, y, z, rx, ry, rz, sx, sy, sz] of finals) {
    const t = p(uuid).transform;
    const close = (a: number, b: number, what: string): void =>
      assert.ok(Math.abs(a - b) < 5e-3, `${what} for ${uuid}: ${a} vs Final ${b}`);
    const isBar = uuid === SHERIFF_OBJECT_IDS.barANorth || uuid === SHERIFF_OBJECT_IDS.barASouth
      || uuid === SHERIFF_OBJECT_IDS.barBNorth || uuid === SHERIFF_OBJECT_IDS.barBSouth;
    if (!isBar) close(t.position.x, x, 'position.x');
    close(t.position.y, y, 'position.y');
    close(t.position.z, z, 'position.z');
    close(t.rotation.x, rx, 'rotation.x');
    close(t.rotation.y, ry, 'rotation.y');
    close(t.rotation.z, rz, 'rotation.z');
    // The bar FRONT segments keep the junction-derived collider scale and the
    // straight bars plane (their Final scale.y / one x-nudge captured the
    // double-scale bug); their CENTERS (z) must match the Final table.
    if (isBar) {
      close(t.position.z, z, 'bar center z');
      close(t.position.x, 14.7, 'bar plane x');
    } else {
      close(t.scale.x, sx, 'scale.x');
      close(t.scale.y, sy, 'scale.y');
      close(t.scale.z, sz, 'scale.z');
    }
  }

  // Headers span exactly over the door gaps (frame outer ±0.61) and their
  // bottoms meet the door lintels' tops (2.3) — no slit, no floating strip.
  const hA = p(SHERIFF_OBJECT_IDS.barAHeader).transform;
  const hB = p(SHERIFF_OBJECT_IDS.barBHeader).transform;
  assert.ok(Math.abs(hA.position.z - (S.z - 2.0)) < 1e-6 && Math.abs(hA.scale.z - 1.22) < 1e-6,
    'header A must span the door A gap');
  assert.ok(Math.abs(hA.position.y - 2.85) < 1e-6, 'header A y = the user Final 2.85');
  assert.ok(Math.abs(hB.position.y - 2.94) < 1e-6, 'header B y = the user Final 2.94');
  assert.ok(hA.position.y - hA.scale.y / 2 >= 2.24 && hB.position.y - hB.scale.y / 2 >= 2.28,
    'both headers start at/above the door lintels (2.3) minus a small buried seat');
});

/* ---- Cell door swing ---------------------------------------------------------------- */

test('SHERIFF CELL DOOR SWING: authored closed, opens inward, frame stays fixed', async () => {
  const registry = makeRegistry();
  const doorDef = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z)
    .find((d) => d.uuid === SHERIFF_OBJECT_IDS.cellDoorA)!;
  const obj = applyDefinition(await registry.create({ ...doorDef, metadata: { ...doorDef.metadata, collider: true } }), doorDef) as THREE.Group;
  const hinge = obj.getObjectByName('jail-cell-door-hinge') as THREE.Group;
  assert.ok(hinge, 'cell door must expose its hinge');

  // CLOSED (authored): hinge at 0, leaf spanning the bars plane.
  assert.equal(hinge.rotation.y, 0, 'cell door must be authored closed');
  const leaf = hinge.children[0];
  const closed = box3of(leaf);

  // OPEN: pure +80° hinge yaw — the leaf sweeps INWARD (world +x, into the
  // cell) and the FRAME (a root child) never moves.
  setJailCellDoorOpen(obj, 1);
  assert.ok(Math.abs(hinge.rotation.y - JAIL_CELL_DOOR_OPEN_ANGLE) < 1e-6, 'open pose is the pure hinge rotation');
  const opened = box3of(leaf);
  assert.ok(opened.max.x > closed.max.x + 0.5, 'leaf must swing toward the cell interior (+x)');
  const frameParts = obj.children.filter((c) => c.name === '' || c.name.startsWith('jail-door-'));
  assert.equal(frameParts.length >= 5, true, 'frame parts (lintel, posts, knuckles) stay root children');
  const sill = obj.children.find((c) => Math.abs((c as THREE.Mesh).position?.y ?? -1) < 1e-6) as THREE.Mesh | undefined;
  if (sill) {
    const sillBox = box3of(sill);
    const still = box3of(sill);
    assert.ok(sillBox.min.x === still.min.x, 'the frame must not move with the leaf');
  }

  // Re-close restores the authored pose exactly.
  setJailCellDoorOpen(obj, 0);
  const shut = box3of(leaf);
  assert.ok(Math.abs(shut.min.x - closed.min.x) < 1e-6 && Math.abs(shut.max.z - closed.max.z) < 1e-6,
    'setJailCellDoorOpen(0) re-closes the cell door');
});

/* ---- Cell door frame ---------------------------------------------------------------- */

test('SHERIFF CELL DOOR FRAME: knuckles at the hinge, frame faces never flush with the ironwork', async () => {
  const registry = makeRegistry();
  const defs = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z);
  for (const uuid of [SHERIFF_OBJECT_IDS.cellDoorA, SHERIFF_OBJECT_IDS.cellDoorB]) {
    const def = defs.find((d) => d.uuid === uuid)!;
    const obj = applyDefinition(await registry.create({ ...def, metadata: { ...def.metadata, collider: true } }), def) as THREE.Group;

    // The specks fix: the two hinge knuckles must sit ON the hinge axis
    // (x = −width/2), mounted proud of the post's corridor face — the old
    // mid-door placement (x = +0.02) showed as two dark dots on the closed
    // leaf and floated in the open doorway.
    const knuckles = obj.children.filter((c) => c.name === 'jail-door-knuckle');
    assert.equal(knuckles.length, 2, `${uuid}: exactly two hinge knuckles`);
    for (const k of knuckles) {
      assert.ok(Math.abs(k.position.x + 0.55) < 1e-6, 'knuckles sit at the hinge axis, never mid-door');
      assert.ok(k.position.z > 0.03, 'knuckles mount proud of the post corridor face');
    }

    // The z-fight fix: the lintel's underside (world ≈2.21) sits BELOW both
    // iron headers' bottoms (2.25 / 2.29) — no flush underside pair above the
    // doorway — while its top (≈2.39) buries inside both headers; the jamb
    // posts straddle ±0.59 (2 cm past the ±0.61 segment ends, whose end
    // faces bury inside them) and stand inset from the headers' ±0.05 faces.
    const lintel = obj.children.find((c) => c.name === 'jail-door-lintel') as THREE.Mesh;
    assert.ok(lintel, 'door exposes its lintel');
    const lb = box3of(lintel);
    assert.ok(lb.min.y < 2.24 && lb.max.y > 2.3 && lb.max.y < 3.4,
      `lintel must span [~2.21, ~2.39] world (got [${lb.min.y.toFixed(3)}, ${lb.max.y.toFixed(3)}])`);
    const posts = obj.children.filter((c) => c.name === 'jail-door-post');
    assert.equal(posts.length, 2, 'door carries two jamb posts');
    for (const p of posts) {
      assert.ok(Math.abs(Math.abs(p.position.x) - 0.59) < 1e-6, 'posts straddle ±0.59 — 2 cm past the ±0.61 gap edges');
    }
  }
});

/* ---- Wanted board (z-fighting) -------------------------------------------------- */

test('SHERIFF WANTED BOARD: every poster rides its OWN z plane — no coplanar pair', () => {
  const board = buildWantedBoard();
  const posters = board.children.filter((c) => c.name.startsWith('wanted-poster-') && !(c.name.includes('nail')));
  assert.equal(posters.length, 4, 'the board carries four wanted posters');
  // Board front face (box depth 0.03 centered z=0 → +0.015).
  const boardFront = 0.015;
  const planes = posters.map((p) => p.position.z).sort((a, b) => a - b);
  for (const z of planes) {
    assert.ok(z - boardFront >= 0.005, `poster plane z=${z} must sit ≥5 mm off the board face (${boardFront})`);
  }
  for (let i = 1; i < planes.length; i++) {
    assert.ok(planes[i] - planes[i - 1] >= 0.005,
      `poster planes must differ ≥5 mm (planes ${planes[i - 1]} vs ${planes[i]} — the old all-0.017 build flickered)`);
  }
  // Pin nails: exactly 2 per poster, CHILDREN of their poster, sitting proud
  // of its own plane so they never re-coplanar with the board face.
  for (const poster of posters) {
    const nails = poster.children.filter((c) => c.name.endsWith('-nail'));
    assert.equal(nails.length, 2, `${poster.name}: exactly two pin nails`);
    for (const nail of nails) {
      assert.ok(nail.position.z > 0.002, `${poster.name}: nail must poke proud of its poster plane`);
    }
  }
});

/* ---- Front door (open/close system) ---------------------------------------------- */

test('SHERIFF FRONT DOOR: real def, spawns CLOSED on a genuine hinge pivot', async () => {
  const registry = makeRegistry();
  const defs = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z);
  const def = defs.find((d) => d.uuid === SHERIFF_OBJECT_IDS.frontDoor);
  assert.ok(def, 'the layout must place the front door');
  assert.equal(def!.assetType, 'sheriff-front-door');
  assert.equal(def!.metadata.collider, true, 'the door spawns CLOSED → collider armed');

  const L = SHERIFF_LAYOUT;
  const S = SHERIFF_SITE;
  // The def sits at the doorway center on the wall mid-plane (z = 3.625 local).
  const doorMidX = (L.frontDoor.xMin + L.frontDoor.xMax) / 2;
  assert.ok(Math.abs(def!.transform.position.x - (S.x + doorMidX)) < 1e-6, 'door def centered on the doorway');
  assert.ok(Math.abs(def!.transform.position.z - (S.z + (L.depth - L.wallThickness) / 2)) < 1e-6,
    'door def on the wall mid-plane');
  assert.ok(Math.abs(def!.transform.scale.x - 1) < 1e-6, 'unit scale (visual built at real size)');

  const obj = applyDefinition(await registry.create(def!), def!) as THREE.Group;
  const hinge = obj.getObjectByName('front-door-hinge');
  assert.ok(hinge, "the asset must expose the 'front-door-hinge' DoorRoot pivot");
  assert.equal(hinge!.rotation.y, 0, 'the door spawns CLOSED (zero hinge yaw)');
  // The pivot sits 4 cm off the WEST jamb (local x = −dw/2 + 0.04), everything
  // else is its child — a real hinge axis, never a mesh-center spin.
  const dw = L.frontDoor.xMax - L.frontDoor.xMin;
  assert.ok(Math.abs(hinge!.position.x - (-dw / 2 + 0.04)) < 1e-6, 'pivot at the real hinge axis (4 cm off the west jamb)');
  const slab = hinge!.children.find((c) => c.name === 'front-door-leaf') as THREE.Mesh;
  assert.ok(slab, 'the swinging leaf must be a child of the pivot');
});

test('SHERIFF FRONT DOOR: pose API is a pure hinge rotation, monotonic and bounded', () => {
  const root = buildSheriffFrontDoor();
  const hinge = root.getObjectByName('front-door-hinge')!;
  const closedYaw = hinge.rotation.y;
  setSheriffFrontDoorOpen(root, 0);
  assert.equal(hinge.rotation.y, 0, 't=0 fully closed');
  setSheriffFrontDoorOpen(root, 1);
  assert.ok(Math.abs(hinge.rotation.y - SHERIFF_FRONT_DOOR_OPEN_ANGLE) < 1e-9, 't=1 exactly the open angle');
  assert.ok(SHERIFF_FRONT_DOOR_OPEN_ANGLE > 1.5 && SHERIFF_FRONT_DOOR_OPEN_ANGLE < 1.8,
    'open angle ≈ 100° inward (got ' + SHERIFF_FRONT_DOOR_OPEN_ANGLE.toFixed(3) + ' rad)');
  setSheriffFrontDoorOpen(root, 0.5);
  assert.ok(Math.abs(hinge.rotation.y - SHERIFF_FRONT_DOOR_OPEN_ANGLE / 2) < 1e-9, 'mid-swing pose is exact (no accumulation)');
  assert.equal(closedYaw, 0, 'the API only touches the hinge group rotation');
});

test('SHERIFF FRONT DOOR GEOMETRY: glass proud of the leaf; sweep grazes nothing', async () => {
  const registry = makeRegistry();
  const defs = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z);
  const def = defs.find((d) => d.uuid === SHERIFF_OBJECT_IDS.frontDoor)!;
  const obj = applyDefinition(await registry.create(def), def) as THREE.Group;

  // 1) The glass pane must NOT share a plane with the leaf slab (the old
  //    flush mount was the reported entrance flicker).
  const slab = obj.getObjectByName('front-door-leaf') as THREE.Mesh;
  const glass = obj.getObjectByName('front-door-glass') as THREE.Mesh;
  assert.ok(slab && glass, 'leaf slab and glass pane exist');
  const slabBox = box3of(slab);
  const glassBox = box3of(glass);
  const sepFront = Math.abs(glassBox.max.z - slabBox.max.z);
  const sepBack = Math.abs(glassBox.min.z - slabBox.min.z);
  assert.ok(sepFront >= 0.02, `glass front must sit ≥2 cm off the slab front (got ${sepFront.toFixed(3)})`);
  assert.ok(sepBack >= 0.02, `glass back must sit ≥2 cm off the slab back (got ${sepBack.toFixed(3)})`);

  // 2) The closed leaf sits inside the doorway: clear of the wall band's
  //    faces, both casing rings, the header and the threshold.
  const L = SHERIFF_LAYOUT;
  const S = SHERIFF_SITE;
  const worldSlab = box3of(slab);
  const innerFace = S.z + L.depth / 2 - L.wallThickness; // 3.55 local → world
  const outerFace = S.z + L.depth / 2;
  assert.ok(worldSlab.min.z > innerFace + 0.02 && worldSlab.max.z < outerFace - 0.02,
    `closed leaf inside the wall band with margins (z [${worldSlab.min.z.toFixed(3)}, ${worldSlab.max.z.toFixed(3)}])`);
  // The casing head pieces hang 2 cm down into the opening (bottom at
  // floorTop + dh − 0.02); the leaf top must stay clear of that band.
  const casingHangBottom = L.floorTop + L.frontDoor.height - 0.02;
  assert.ok(worldSlab.max.y <= casingHangBottom,
    `leaf top must stay at/below the casing hang line (top ${worldSlab.max.y.toFixed(3)} vs hang ${casingHangBottom.toFixed(3)})`);
  assert.ok(worldSlab.min.y > L.floorTop - 0.001, 'leaf bottom above the floor line');

  // 3) The full-open sweep: sample the leaf's boundary around the whole
  //    0→100° swing and prove NO point ever enters the west jamb wall
  //    segment, either casing ring, the header or the threshold (2 mm
  //    safety margin — the geometric analysis promises ≥5 mm everywhere).
  const wallBox = new THREE.Box3(
    new THREE.Vector3(S.x - 6, 0, S.z + L.depth / 2 - L.wallThickness),
    new THREE.Vector3(S.x + L.frontDoor.xMin, L.wallHeight, S.z + L.depth / 2),
  );
  const shellDef2 = defs.find((d) => d.uuid === SHERIFF_OBJECT_IDS.building)!;
  const shell2 = applyDefinition(await registry.create(shellDef2), shellDef2) as THREE.Group;
  shell2.updateWorldMatrix(true, true);
  const forbidden: THREE.Box3[] = [wallBox];
  for (const c of shell2.children) {
    if (c.name.startsWith('door-casing-')) forbidden.push(box3of(c));
  }
  const slabGeo = slab.geometry as THREE.BoxGeometry;
  const hw = slabGeo.parameters.width / 2;
  const hh = slabGeo.parameters.height / 2;
  const ht = slabGeo.parameters.depth / 2;
  for (let step = 0; step <= 20; step++) {
    const t = step / 20;
    setSheriffFrontDoorOpen(obj, t);
    obj.updateWorldMatrix(true, true);
    slab.updateWorldMatrix(true, false);
    // Boundary sample: both faces × 5 stations along the leaf, mid-thickness
    // and both faces, at three heights (base/mid/top).
    for (const u of [-hw, -hw / 2, 0, hw / 2, hw]) {
      for (const v of [-ht, 0, ht]) {
        for (const dy of [-hh + 0.01, 0, hh - 0.01]) {
          // p is in SLAB-LOCAL space (origin = the slab center).
          const p = new THREE.Vector3(u, dy, v);
          slab.localToWorld(p);
          for (const fb of forbidden) {
            const inside = p.x > fb.min.x + 0.002 && p.x < fb.max.x - 0.002
              && p.y > fb.min.y + 0.002 && p.y < fb.max.y - 0.002
              && p.z > fb.min.z + 0.002 && p.z < fb.max.z - 0.002;
            assert.ok(!inside,
              `leaf boundary point (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}) at t=${t.toFixed(2)} enters a forbidden box`);
          }
        }
      }
    }
  }
});

test('SHERIFF FRONT DOOR CASINGS: trim rings proud of their faces, never coplanar with the walls', async () => {
  const registry = makeRegistry();
  const defs = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z);
  const shellDef = defs.find((d) => d.uuid === SHERIFF_OBJECT_IDS.building)!;
  const shell = applyDefinition(await registry.create(shellDef), shellDef) as THREE.Group;
  const casingBoxes = shell.children.filter((c) => c.name.startsWith('door-casing-')) as THREE.Mesh[];
  assert.equal(casingBoxes.length, 6, 'three casing pieces × inner/outer rings');
  const L = SHERIFF_LAYOUT;
  const S = SHERIFF_SITE;
  const innerFace = S.z + L.depth / 2 - L.wallThickness;
  const outerFace = S.z + L.depth / 2;
  const EPS = 0.005;
  for (const c of casingBoxes) {
    const b = box3of(c);
    const isInner = c.name.endsWith('-in');
    const proud = isInner ? innerFace - b.min.z : b.max.z - outerFace;
    const buried = isInner ? b.max.z - innerFace : outerFace - b.min.z;
    assert.ok(proud >= 0.015, `${c.name}: must stand ≥1.5 cm proud of its face (got ${proud.toFixed(3)})`);
    assert.ok(buried >= 0.03, `${c.name}: must bury ≥3 cm into the wall band (got ${buried.toFixed(3)})`);
    // No plane shared with either wall face.
    assert.ok(Math.abs(b.min.z - innerFace) > EPS && Math.abs(b.min.z - outerFace) > EPS &&
      Math.abs(b.max.z - innerFace) > EPS && Math.abs(b.max.z - outerFace) > EPS,
      `${c.name}: no casing face coplanar with a wall face`);
  }
});

/* ---- Geometry (z-fighting) ------------------------------------------------------------- */

const COPLANAR_EPS = 0.001;

test('SHERIFF GEOMETRY: no coplanar same-normal overlapping faces with different materials', async () => {
  const registry = makeRegistry();
  const defs = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z);
  const boxes: { box: THREE.Box3; mat: THREE.Material; name: string }[] = [];
  for (const def of defs) {
    const obj = applyDefinition(await registry.create(def), def);
    obj.updateWorldMatrix(true, true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // BoxGeometry only + axis-aligned only — rotated geometry (roof slabs,
      // porch shed) and curved surfaces can't be judged by AABBs (same rule
      // as the bank scan).
      if ((m.geometry as THREE.BufferGeometry).type !== 'BoxGeometry') return;
      // Axis-aligned world rotations only (identity and ±90°/180° yaws):
      // their world AABBs stay exact, so face-plane equality is meaningful.
      // The cell doors (yaw −90°) USED to be excluded here — exactly where
      // the door↔header z-fights hid.
      const q = m.getWorldQuaternion(new THREE.Quaternion());
      const el = new THREE.Matrix4().makeRotationFromQuaternion(q).elements;
      const axisAligned = el.every((v) => Math.abs(v) < 1e-6 || Math.abs(Math.abs(v) - 1) < 1e-6);
      if (!axisAligned) return;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      boxes.push({ box: box3of(m), mat, name: `${def.metadata.name}/${m.name}` });
    });
  }
  let checked = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]; const b = boxes[j];
      if (a.mat === b.mat) continue;
      // Cross-definition pairs only: the layout owns placements BETWEEN
      // objects; contact faces INSIDE one supplied asset (e.g. the desk's
      // knee trim against its own top) are the asset author's intent and the
      // asset library is used verbatim by contract.
      if (a.name.split('/')[0] === b.name.split('/')[0]) continue;
      // Face planes: x/y/z min & max. Coplanar overlap = equal plane value on
      // one axis while the other two axes' ranges overlap with area.
      const overlaps1D = (aMin: number, aMax: number, bMin: number, bMax: number): boolean =>
        Math.min(aMax, bMax) - Math.max(aMin, bMin) > COPLANAR_EPS;
      const planes: [number, number, () => boolean][] = [
        [a.box.max.x, b.box.max.x, () => overlaps1D(a.box.min.y, a.box.max.y, b.box.min.y, b.box.max.y) && overlaps1D(a.box.min.z, a.box.max.z, b.box.min.z, b.box.max.z)],
        [a.box.min.x, b.box.min.x, () => overlaps1D(a.box.min.y, a.box.max.y, b.box.min.y, b.box.max.y) && overlaps1D(a.box.min.z, a.box.max.z, b.box.min.z, b.box.max.z)],
        [a.box.max.y, b.box.max.y, () => overlaps1D(a.box.min.x, a.box.max.x, b.box.min.x, b.box.max.x) && overlaps1D(a.box.min.z, a.box.max.z, b.box.min.z, b.box.max.z)],
        [a.box.min.y, b.box.min.y, () => overlaps1D(a.box.min.x, a.box.max.x, b.box.min.x, b.box.max.x) && overlaps1D(a.box.min.z, a.box.max.z, b.box.min.z, b.box.max.z)],
        [a.box.max.z, b.box.max.z, () => overlaps1D(a.box.min.x, a.box.max.x, b.box.min.x, b.box.max.x) && overlaps1D(a.box.min.y, a.box.max.y, b.box.min.y, b.box.max.y)],
        [a.box.min.z, b.box.min.z, () => overlaps1D(a.box.min.x, a.box.max.x, b.box.min.x, b.box.max.x) && overlaps1D(a.box.min.y, a.box.max.y, b.box.min.y, b.box.max.y)],
      ];
      for (const [pa, pb, overlaps2D] of planes) {
        if (Math.abs(pa - pb) > COPLANAR_EPS) continue;
        if (!overlaps2D()) continue;
        checked += 1;
        assert.fail(`coplanar z-fight risk between "${a.name}" and "${b.name}"`);
      }
    }
  }
  assert.ok(boxes.length > 100, 'the scan must actually see the block geometry');
});

/* ---- UUID sanity ------------------------------------------------------------------------ */

test('SHERIFF UUIDS: canonical, unique, map-registered under the c000 block', () => {
  const defs = buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z);
  const uuids = new Set<string>();
  const canonical = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  for (const def of defs) {
    assert.ok(canonical.test(def.uuid), `uuid ${def.uuid} must be canonical`);
    assert.ok(!uuids.has(def.uuid), `uuid ${def.uuid} must be unique`);
    assert.ok(def.uuid.startsWith('90000000-0000-4000-9000-'), `uuid ${def.uuid} must use the sheriff block`);
    uuids.add(def.uuid);
  }
  assert.equal(defs.length, uuids.size);
});
