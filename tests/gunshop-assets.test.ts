/**
 * Gun Shop asset tests.
 *
 * Locks the contracts the gun shop module promises to the rest of the game
 * (mirrors the saloon/bank/sheriff/stable test suites):
 *
 *  1. REGISTRATION — every `gunshop-` assetType registers exactly once, the
 *     registry refuses duplicates, and NOTHING collides with the sheriff /
 *     bank / stable / saloon / primitive type namespaces.
 *  2. CREATION — the registry materialises every type the layout uses and
 *     mirrors uuid + name; every standalone weapon builder returns a valid
 *     named group.
 *  3. TRANSFORM OWNERSHIP — factories NEVER apply the registry transform.
 *  4. LAYOUT — uuids unique + v4-shaped, every placement finite, wall
 *     segments tile the facade exactly around the doorway, windows inside
 *     the wall segments.
 *  5. SHELL — the building carries the structural kit and does NOT bundle
 *     the door leaf / windows / sign (independent objects now).
 *  6. FRONT DOOR — real hinge pivot, closed pose fills the gap, open pose
 *     swings 100° inward, the STATIC frame never moves, the sweep zone is
 *     clear, and the swing is deterministic (pure pose).
 *  7. COLLIDER POLICY — walls/floor/threshold/door/solids colliders, decor
 *     not; the CLOSED door blocks the doorway, the released (open) door
 *     passes; the full Street → Door → Sales → Workshop path is walkable
 *     (with the project's step-up simulation at the floor slab).
 *  8. GEOMETRY — no coplanar same-normal overlapping faces with different
 *     materials anywhere in the shop (the z-fighting class of bug).
 *  9. PROPS IN PLACE — rack guns hang INSIDE the rack and clear of the
 *     backing/wall; display-case guns sit ON the felt UNDER the glass
 *     without interpenetrating the walls; nothing sinks under the floor or
 *     pokes through the roof; interior props stay inside the building.
 * 10. LIGHT BUDGET — exactly 2 real PointLights (sales + workshop lanterns).
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  AssetRegistry,
  CollisionWorld,
  registerAllGunShopFactories,
  GUNSHOP_ASSET_TYPES,
  GUNSHOP_LAYOUT,
  GUNSHOP_SITE,
  GUNSHOP_OBJECT_IDS,
  GUNSHOP_DOOR_SPEC,
  buildGunShopMapObjects,
  setGunShopFrontDoorOpen,
  buildRevolver,
  buildLeverActionRifle,
  buildDoubleBarrelShotgun,
  buildDerringer,
  buildBowieKnife,
  buildGunshopCounter,
  buildGunshopWorkbench,
  buildGunsmithSign,
  createGunShopMaterials,
} from '../src/index.js';
import type { ObjectDefinition } from '../src/index.js';

const PLAYER_STEP_HEIGHT = 0.35;
const PLAYER_HEIGHT = 1.7;
const AREA_EPS = 1e-4;
const COPLANAR_EPS = 1e-3;

function box3of(o: THREE.Object3D): THREE.Box3 {
  o.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(o);
}

function makeRegistry(): AssetRegistry {
  const registry = new AssetRegistry();
  registerAllGunShopFactories(registry);
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

/** Build every gun shop object placed at the real site (visuals + transforms). */
async function buildWorld(): Promise<{ defs: ObjectDefinition[]; roots: Map<string, THREE.Object3D> }> {
  const registry = makeRegistry();
  const defs = buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z);
  const roots = new Map<string, THREE.Object3D>();
  for (const def of defs) {
    const obj = applyDefinition(await registry.create(def), def);
    roots.set(def.uuid, obj);
  }
  return { defs, roots };
}

const movedDef = (base: Partial<ObjectDefinition>): ObjectDefinition => ({
  uuid: '10000000-0000-4000-9000-0000000000aa',
  assetType: 'gunshop-building',
  transform: {
    position: { x: 4, y: 0.5, z: -7 },
    rotation: { x: 10, y: 20, z: 30 },
    scale: { x: 2, y: 3, z: 4 },
  },
  metadata: { name: 'Test Gun Shop' },
  ...base,
});

/* -------------------------------------------------------------------------- */
/* 1. Registration                                                            */
/* -------------------------------------------------------------------------- */

test('GUNSHOP REGISTRATION: every type registers; duplicates throw', () => {
  const registry = makeRegistry();
  for (const type of GUNSHOP_ASSET_TYPES) {
    assert.ok(registry.has(type), `assetType "${type}" must be registered`);
  }
  assert.throws(
    () => registerAllGunShopFactories(registry),
    /already registered/,
    'double registration must be rejected by the registry',
  );
});

test('GUNSHOP REGISTRATION: no assetType collides with the other buildings', () => {
  const registry = makeRegistry();
  for (const type of GUNSHOP_ASSET_TYPES) {
    assert.ok(type.startsWith('gunshop-'), `assetType "${type}" must live in the gunshop- namespace`);
    for (const foreign of ['wall', 'chair', 'prop', 'door', 'barrel', 'table', 'npc', 'light', 'ground', 'cube']) {
      assert.notEqual(type, foreign, 'primitive types are untouchable');
    }
    // the two names the user file would have shadowed (sheriff owns them)
    assert.notEqual(type, 'gun-rack', 'sheriff owns gun-rack');
    assert.notEqual(type, 'ammo-crate', 'sheriff owns ammo-crate');
    assert.ok(!registry.getRegisteredTypes().some((t) => t === type && !type.startsWith('gunshop-')));
  }
});

/* -------------------------------------------------------------------------- */
/* 2. Creation + asset fidelity                                               */
/* -------------------------------------------------------------------------- */

test('GUNSHOP CREATION: registry creates every type the layout uses; uuid+name mirrored', async () => {
  const registry = makeRegistry();
  const defs = buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z);
  const usedTypes = new Set(defs.map((d) => d.assetType));
  for (const type of usedTypes) {
    assert.ok(registry.has(type), `layout uses unregistered assetType "${type}"`);
  }
  for (const def of defs) {
    const obj = await registry.create(def);
    assert.ok(obj, `registry.create failed for ${def.assetType}`);
    assert.equal(obj.uuid, def.uuid, 'registry must mirror the uuid onto the object');
    assert.equal(obj.name, def.metadata.name, 'registry must mirror the name onto the object');
  }
});

test('GUNSHOP WEAPONS: the five firearm builders return valid named groups', () => {
  const weapons: Array<[string, THREE.Group, string[]]> = [
    ['revolver', buildRevolver(), ['revolver-frame', 'revolver-barrel', 'revolver-cylinder', 'revolver-cylinder-drum', 'revolver-grip', 'revolver-hammer', 'revolver-trigger-guard', 'revolver-front-sight']],
    ['lever rifle', buildLeverActionRifle(), ['rifle-receiver', 'rifle-barrel', 'rifle-mag-tube', 'rifle-lever', 'rifle-lever-loop', 'rifle-stock', 'rifle-butt-plate', 'rifle-front-sight']],
    ['shotgun', buildDoubleBarrelShotgun(), ['shotgun-barrel-l', 'shotgun-barrel-r', 'shotgun-rib', 'shotgun-receiver', 'shotgun-forend', 'shotgun-hammer-l', 'shotgun-hammer-r', 'shotgun-trigger-a', 'shotgun-trigger-b']],
    ['derringer', buildDerringer(), ['derringer-frame', 'derringer-barrel', 'derringer-grip', 'derringer-hammer']],
    ['bowie knife', buildBowieKnife(), ['knife-blade', 'knife-guard', 'knife-handle', 'knife-pommel', 'knife-sheath']],
  ];
  for (const [label, group, parts] of weapons) {
    assert.ok(group instanceof THREE.Group, `${label} must be a Group`);
    let meshes = 0;
    group.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) meshes += 1;
    });
    assert.ok(meshes >= 3, `${label} must carry real geometry (${meshes} meshes)`);
    for (const part of parts) {
      assert.ok(group.getObjectByName(part), `${label} must contain "${part}"`);
    }
    const bb = box3of(group);
    const size = bb.getSize(new THREE.Vector3());
    for (const axis of ['x', 'y', 'z'] as const) {
      assert.ok(Number.isFinite(size[axis]) && size[axis] > 0.001, `${label} has a degenerate ${axis} extent`);
    }
  }
  // scale parameter works (the display case / rack use sub-scale weapons)
  const big = box3of(buildLeverActionRifle(2));
  const small = box3of(buildLeverActionRifle(0.5));
  assert.ok(
    (big.max.x - big.min.x) > (small.max.x - small.min.x) * 3,
    'rifle scale parameter must drive its size',
  );
});

test('GUNSHOP FIXTURES: counter / display case / rack / workbench / sign build their parts', () => {
  const counter = buildGunshopCounter();
  for (const name of ['gunshop-counter-body', 'gunshop-counter-top']) {
    assert.ok(counter.getObjectByName(name), `counter must contain "${name}"`);
  }

  const workbench = buildGunshopWorkbench();
  for (const name of ['gunshop-workbench-top', 'gunshop-workbench-back-panel', 'gunshop-workbench-shelf']) {
    assert.ok(workbench.getObjectByName(name), `workbench must contain "${name}"`);
  }
  assert.equal(workbench.children.filter((c) => c.name.startsWith('gunshop-workbench-leg')).length, 4, 'workbench stands on 4 legs');

  const sign = buildGunsmithSign();
  for (const name of ['gunshop-sign-board', 'gunshop-sign-frame', 'gunshop-sign-chain-l', 'gunshop-sign-chain-r']) {
    assert.ok(sign.getObjectByName(name), `sign must contain "${name}"`);
  }
  // the sign hangs DOWN from its origin (mount point at the top)
  const board = box3of(sign.getObjectByName('gunshop-sign-board')!);
  assert.ok(board.max.y <= 0.001, 'sign board must hang BELOW the def origin');
});

test('GUNSHOP MATERIALS: the shop shares one process-lifetime cache (headless-safe)', () => {
  const a = createGunShopMaterials();
  const b = createGunShopMaterials();
  assert.equal(a, b, 'createGunShopMaterials must be a singleton');
  // Headless safety: textures fall back to null without DOM — the set builds anyway.
  for (const [key, mat] of Object.entries(a)) {
    assert.ok(mat && typeof mat === 'object', `material "${key}" must exist`);
  }
});

/* -------------------------------------------------------------------------- */
/* 3. Transform ownership                                                     */
/* -------------------------------------------------------------------------- */

test('GUNSHOP TRANSFORM OWNERSHIP: factories never apply the registry transform', async () => {
  const registry = makeRegistry();
  const obj = await registry.create(movedDef({}));
  assert.deepEqual(obj.position.toArray(), [0, 0, 0], 'factory must leave position untouched');
  assert.deepEqual(obj.rotation.toArray().slice(0, 3), [0, 0, 0], 'factory must leave rotation untouched');
  assert.deepEqual(obj.scale.toArray(), [1, 1, 1], 'factory must leave scale untouched');
});

/* -------------------------------------------------------------------------- */
/* 4. Layout                                                                  */
/* -------------------------------------------------------------------------- */

test('GUNSHOP LAYOUT: unique v4 uuids, finite placements, rich scene', () => {
  const defs = buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z);
  const uuids = new Set<string>();
  for (const def of defs) {
    assert.match(def.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, `uuid ${def.uuid} must be v4-shaped`);
    assert.ok(!uuids.has(def.uuid), `duplicate uuid ${def.uuid}`);
    uuids.add(def.uuid);
    const { position, rotation, scale } = def.transform;
    for (const v of [position.x, position.y, position.z, rotation.x, rotation.y, rotation.z, scale.x, scale.y, scale.z]) {
      assert.ok(Number.isFinite(v), `non-finite placement in ${def.metadata.name}`);
    }
  }
  assert.ok(defs.length >= 30, `the gun shop is a rich scene (got ${defs.length} objects)`);
});

test('GUNSHOP LAYOUT: wall segments tile the facade exactly around the doorway', () => {
  const L = GUNSHOP_LAYOUT;
  const segW = (L.width - L.doorWidth) / 2;
  const defs = buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z);
  const frontWalls = defs.filter((d) => d.uuid === GUNSHOP_OBJECT_IDS.wallFrontWest || d.uuid === GUNSHOP_OBJECT_IDS.wallFrontEast);
  assert.equal(frontWalls.length, 2, 'two facade segments flank the door');
  let covered = L.doorWidth;
  for (const seg of frontWalls) {
    assert.equal(seg.transform.scale.x, segW, 'each segment spans half the facade minus the door');
    covered += seg.transform.scale.x;
  }
  assert.equal(covered, L.width, 'segments + doorway span the full facade');
  // windows sit inside the wall segments, clear of the door
  for (const off of L.window.centersFromDoor) {
    assert.ok(off > L.doorWidth / 2 + 0.3, 'window too close to the door');
    assert.ok(off < L.width / 2 - 0.3, 'window exceeds the facade');
  }
});

test('GUNSHOP LAYOUT: the site keeps clear of every other building + spawn', () => {
  const L = GUNSHOP_LAYOUT;
  const gx0 = GUNSHOP_SITE.x - L.width / 2;
  const gx1 = GUNSHOP_SITE.x + L.width / 2;
  const gz0 = GUNSHOP_SITE.z - L.depth / 2;
  // south edge incl. the porch
  const gz1 = GUNSHOP_SITE.z + L.depth / 2 + L.porchDepth;
  // sheriff: footprint x ∈ [7.8, 18.2], z ∈ [−5.2, 2.2] (+ porch ≈ 4.0)
  assert.ok(gz0 > 4.2, `gun shop north edge (${gz0}) must clear the sheriff porch (≈4.0)`);
  // simple building at (14, −12) spans z ∈ [−15, −9] — far north, trivially clear
  // map boundary x = 29.5, spawn cube (0,0) 3×3, spawn point (0, 12)
  assert.ok(gx1 < 29.0, 'gun shop must stay inside the east boundary');
  assert.ok(gx0 > 3.0 && gz1 < 29.0, 'gun shop must not sit on the spawn street');
  const spawnDist = Math.hypot(GUNSHOP_SITE.x - 0, GUNSHOP_SITE.z - 12);
  assert.ok(Math.abs(gx0) > 2.5, 'porch must not cover the spawn point');
  assert.ok(spawnDist > 10, 'spawn point stays well clear of the shop center');
});

/* -------------------------------------------------------------------------- */
/* 5. Shell                                                                   */
/* -------------------------------------------------------------------------- */

test('GUNSHOP SHELL: structural kit present; door leaf / windows / sign independent', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'gunshop-building' }))) as THREE.Group;
  for (const name of [
    'gunshop-roof', 'gunshop-false-front', 'gunshop-false-front-cap',
    'gunshop-porch-deck', 'gunshop-porch-roof', 'gunshop-door-casing-west',
    'gunshop-door-casing-east', 'gunshop-door-casing-header',
  ]) {
    assert.ok(obj.getObjectByName(name), `shell must contain "${name}"`);
  }
  assert.equal(obj.children.filter((c) => c.name.startsWith('gunshop-corner-post')).length, 4, '4 corner posts');
  assert.equal(obj.children.filter((c) => c.name.startsWith('gunshop-porch-post')).length, 4, '4 porch posts');
  for (const name of ['gunshop-front-door-leaf', 'gunshop-window-glass', 'gunshop-sign-board']) {
    assert.equal(obj.getObjectByName(name), undefined, `shell must NOT bundle "${name}" (independent object)`);
  }
});

test('GUNSHOP WINDOWS: four independent facade window assemblies', async () => {
  const { defs, roots } = await buildWorld();
  const winDefs = defs.filter((d) => d.assetType === 'gunshop-window');
  assert.equal(winDefs.length, 4, '4 facade windows (2 west + 2 east)');
  for (const def of winDefs) {
    const root = roots.get(def.uuid)!;
    assert.ok(root.getObjectByName('gunshop-window-glass'), 'window carries its glass');
    assert.ok(root.getObjectByName('gunshop-window-sill'), 'window carries its sill');
    assert.equal(def.metadata.collider, false, 'window glass is decor, never a collider');
  }
  const sides = winDefs.map((d) => d.metadata.side);
  assert.deepEqual(sides.filter((s) => s === -1).length, 2, '2 west windows');
  assert.deepEqual(sides.filter((s) => s === 1).length, 2, '2 east windows');
});

/* -------------------------------------------------------------------------- */
/* 6. The front door                                                          */
/* -------------------------------------------------------------------------- */

test('GUNSHOP FRONT DOOR: real hinge pivot; closed fills the gap; open swings 100° inward', async () => {
  const { roots } = await buildWorld();
  const door = roots.get(GUNSHOP_OBJECT_IDS.frontDoor)!;
  const hinge = door.getObjectByName('front-door-hinge') as THREE.Group;
  assert.ok(hinge, 'door must carry the front-door-hinge pivot');
  assert.equal(hinge.userData.dynamic, true, 'the pivot is a runtime-rotated node (MergeStatic contract)');
  assert.ok(door.getObjectByName('gunshop-front-door-leaf'), 'leaf present');
  assert.ok(door.getObjectByName('gunshop-front-door-glass'), 'glazed upper section present');
  assert.ok(door.getObjectByName('gunshop-front-door-knuckle-low'), 'knuckles mount on the STATIC root');

  const L = GUNSHOP_LAYOUT;
  // CLOSED: leaf fills the doorway (hinge seat + SEAL-TIGHT latch clearance —
  // § shadow revision: the old 5 cm latch / 3 cm top gaps let low sun stripe
  // the interior floor through the closed door; the fit is now hairline).
  setGunShopFrontDoorOpen(door, 0);
  assert.equal(hinge.rotation.y, 0, 'closed pose is exactly zero');
  door.updateWorldMatrix(true, true);
  const leaf = door.getObjectByName('gunshop-front-door-leaf')!;
  const leafBox = box3of(leaf);
  const jambWest = GUNSHOP_SITE.x - L.doorWidth / 2;
  const jambEast = GUNSHOP_SITE.x + L.doorWidth / 2;
  assert.ok(leafBox.min.x >= jambWest + 0.025 && leafBox.max.x <= jambEast - 0.008,
    `closed leaf must fill the gap with clearances (x ${leafBox.min.x.toFixed(3)}..${leafBox.max.x.toFixed(3)})`);
  assert.ok(Math.abs(leafBox.min.z - (GUNSHOP_SITE.z + L.depth / 2 - 0.05)) < 0.06,
    'closed leaf sits in the wall band');
  // leaf bottom 1.2 cm over the threshold, top 8 mm under the casing header
  const leafH = leafBox.max.y - leafBox.min.y;
  assert.ok(Math.abs(leafH - (L.doorHeight - 0.02)) < 0.015, `leaf height ${leafH.toFixed(3)}`);
  // § DOOR SEAL: the daylight gaps are hairline (no sun stripe through the
  // closed door at any altitude) — latch ≤ 1.6 cm, top ≤ 1.2 cm.
  const latchGap = jambEast - leafBox.max.x;
  assert.ok(latchGap <= 0.016 && latchGap >= 0.008, `latch gap ${latchGap.toFixed(4)} must be hairline`);
  const doorwayTop = L.floorTop + L.doorHeight;
  assert.ok(doorwayTop - leafBox.max.y <= 0.012, `top gap ${(doorwayTop - leafBox.max.y).toFixed(4)} must be hairline`);

  // OPEN: 100° inward (rotation +y → tip toward −Z). The hinge END stays in
  // the wall band (the pivot lives there); the TIP must reach deep inside.
  setGunShopFrontDoorOpen(door, 1);
  assert.ok(Math.abs(hinge.rotation.y - L.frontDoor.openDeg) < 1e-9, 'open pose is the authored angle');
  const openLeafBox = box3of(leaf);
  assert.ok(openLeafBox.min.z < GUNSHOP_SITE.z + L.depth / 2 - 0.9,
    `the open leaf TIP must swing INWARD deep into the shop (min z ${openLeafBox.min.z.toFixed(2)})`);
  assert.ok(openLeafBox.max.z < GUNSHOP_SITE.z + L.depth / 2 + 0.03,
    `the open leaf must never swing OUT past the wall band (max z ${openLeafBox.max.z.toFixed(2)})`);
  const openMidX = (openLeafBox.min.x + openLeafBox.max.x) / 2;
  assert.ok(openMidX < GUNSHOP_SITE.x - 0.3,
    `the open leaf must clear the doorway westward (mid x ${openMidX.toFixed(2)})`);

  // pure pose: re-deriving the SAME t gives the SAME transform (no drift)
  setGunShopFrontDoorOpen(door, 0.42);
  const mid = hinge.rotation.y;
  setGunShopFrontDoorOpen(door, 0.42);
  assert.equal(hinge.rotation.y, mid, 'pose is pure — no accumulation');
  setGunShopFrontDoorOpen(door, 0);
});

test('GUNSHOP FRONT DOOR: the static frame never moves; the sweep zone is empty', async () => {
  const { roots } = await buildWorld();
  const door = roots.get(GUNSHOP_OBJECT_IDS.frontDoor)!;
  const knuckles = door.children.filter((c) => c.name.startsWith('gunshop-front-door-knuckle'));
  assert.equal(knuckles.length, 2, 'two knuckles on the static root');
  for (const k of knuckles) {
    const before = box3of(k);
    setGunShopFrontDoorOpen(door, 1);
    const after = box3of(k);
    assert.ok(before.min.distanceTo(after.min) < 1e-9, 'knuckles (static frame side) never move');
  }
  setGunShopFrontDoorOpen(door, 0);

  // No interior prop may sit in the leaf's swept disc (x ∈ [−0.65, 0.6] local,
  // z ∈ [2.35, 3.5] local, anything above the floor).
  const L = GUNSHOP_LAYOUT;
  const defs = buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z);
  const sweep: string[] = [];
  for (const def of defs) {
    if (def.uuid === GUNSHOP_OBJECT_IDS.frontDoor) continue;
    if (def.uuid === GUNSHOP_OBJECT_IDS.building) continue; // porch roof hangs above
    if (def.uuid === GUNSHOP_OBJECT_IDS.threshold) continue; // the walk surface under the leaf
    if (def.uuid === GUNSHOP_OBJECT_IDS.floor) continue; // ditto
    const p = def.transform.position;
    const lx = p.x - GUNSHOP_SITE.x;
    const lz = p.z - GUNSHOP_SITE.z;
    if (p.y > L.floorTop + 2.45) continue; // above the leaf top
    if (lx > -0.65 && lx < 0.6 && lz > 2.35 && lz < 3.5) sweep.push(def.metadata.name);
  }
  assert.deepEqual(sweep, [], `the door sweep zone must stay empty (found: ${sweep.join(', ')})`);
});

/* -------------------------------------------------------------------------- */
/* 7. Collider policy + walkability                                           */
/* -------------------------------------------------------------------------- */

test('GUNSHOP COLLIDER POLICY: walls/floor/solids colliders; decor not', () => {
  const defs = buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z);
  const byId = new Map(defs.map((d) => [d.uuid, d]));

  for (const id of [
    GUNSHOP_OBJECT_IDS.floor, GUNSHOP_OBJECT_IDS.threshold,
    GUNSHOP_OBJECT_IDS.wallRear, GUNSHOP_OBJECT_IDS.wallWest, GUNSHOP_OBJECT_IDS.wallEast,
    GUNSHOP_OBJECT_IDS.wallFrontWest, GUNSHOP_OBJECT_IDS.wallFrontEast, GUNSHOP_OBJECT_IDS.wallFrontHeader,
    GUNSHOP_OBJECT_IDS.frontDoor, GUNSHOP_OBJECT_IDS.counter,
    GUNSHOP_OBJECT_IDS.workbench, GUNSHOP_OBJECT_IDS.shelfUnit,
    GUNSHOP_OBJECT_IDS.powderKeg, GUNSHOP_OBJECT_IDS.ammoCrate1, GUNSHOP_OBJECT_IDS.ammoCrate2,
  ]) {
    assert.equal(byId.get(id)?.metadata.collider, true, `solid ${id} must be a collider`);
  }

  for (const id of [
    GUNSHOP_OBJECT_IDS.building, GUNSHOP_OBJECT_IDS.sign,
    GUNSHOP_OBJECT_IDS.parapetSign, GUNSHOP_OBJECT_IDS.porchShingle, GUNSHOP_OBJECT_IDS.repairsBoard,
    GUNSHOP_OBJECT_IDS.windowWest1, GUNSHOP_OBJECT_IDS.windowEast2,
    GUNSHOP_OBJECT_IDS.lanternSales, GUNSHOP_OBJECT_IDS.lanternWorkshop,
    GUNSHOP_OBJECT_IDS.displayCase, GUNSHOP_OBJECT_IDS.cashRegister, GUNSHOP_OBJECT_IDS.brassScale,
    GUNSHOP_OBJECT_IDS.ammoBox1, GUNSHOP_OBJECT_IDS.ammoBox2, GUNSHOP_OBJECT_IDS.cartridgeStand,
    GUNSHOP_OBJECT_IDS.rifleRack, GUNSHOP_OBJECT_IDS.bowieKnife, GUNSHOP_OBJECT_IDS.holsterDisplay,
    GUNSHOP_OBJECT_IDS.vise, GUNSHOP_OBJECT_IDS.toolRack,
  ]) {
    assert.equal(byId.get(id)?.metadata.collider, false, `decor ${id} must NOT be a collider`);
  }
});

test('GUNSHOP WALKABILITY: closed door blocks; open door passes; Street→Sales→Workshop runs', () => {
  const defs = buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z);
  const L = GUNSHOP_LAYOUT;
  const doorX = GUNSHOP_SITE.x;
  const facadeZ = GUNSHOP_SITE.z + L.depth / 2; // 12.0

  // 1) The CLOSED door blocks the doorway.
  const closed = new CollisionWorld(defs);
  let pos: { x: number; y: number; z: number } = { x: doorX, y: PLAYER_HEIGHT, z: facadeZ + 0.9 };
  const r = closed.movePlayer(pos, { x: 0, y: 0, z: -1.4 });
  assert.ok(r.position.z > facadeZ - 0.6,
    `the closed door must stop the player at the facade (stopped at z=${r.position.z.toFixed(2)})`);

  // 2) Release the door collider (exactly what the map updater does when the
  //    leaf passes half-open) and walk Street → Porch → Door into the shop;
  //    the sales counter faces the entrance 1.6 m ahead (by design), so the
  //    target is the free zone between the door and the counter front.
  const openDefs: ObjectDefinition[] = defs.map((d) =>
    d.uuid === GUNSHOP_OBJECT_IDS.frontDoor
      ? { ...d, metadata: { ...d.metadata, collider: false } }
      : d,
  );
  const open = new CollisionWorld(openDefs);
  pos = { x: doorX, y: PLAYER_HEIGHT, z: facadeZ + 2.5 } as { x: number; y: number; z: number };
  const targetZ = GUNSHOP_SITE.z + 2.2; // just inside, before the counter front
  let guard = 0;
  while (pos.z > targetZ && guard < 40) {
    const before = pos.z;
    let step = open.movePlayer(pos, { x: 0, y: 0, z: -0.4 });
    if (step.blockedZ) {
      // step-up simulation (the PlayerController's 35 cm step contract)
      const lifted = open.movePlayer(pos, { x: 0, y: PLAYER_STEP_HEIGHT, z: 0 });
      const moved = open.movePlayer(lifted.position, { x: 0, y: 0, z: -0.4 });
      const settled = open.movePlayer(moved.position, { x: 0, y: -(PLAYER_STEP_HEIGHT + 0.05), z: 0 });
      if (Math.abs(settled.position.z - before) > Math.abs(step.position.z - before) + 1e-6) step = settled;
    }
    pos = step.position;
    if (Math.abs(pos.z - before) < 1e-6) break;
    guard += 1;
  }
  assert.ok(pos.z <= targetZ + 0.05,
    `the open door must let the player into the sales area (stopped at z=${pos.z.toFixed(2)}, target ${targetZ.toFixed(2)})`);

  // 3) Sales → around the counter's east end → back workshop: the full route.
  pos = { x: GUNSHOP_SITE.x + 2.6, y: PLAYER_HEIGHT, z: GUNSHOP_SITE.z + 0.4 } as { x: number; y: number; z: number };
  guard = 0;
  let reachedWorkshop = false;
  while (guard < 60) {
    const before = { ...pos };
    let step = open.movePlayer(pos, { x: 0, y: 0, z: -0.4 });
    if (step.blockedZ) {
      const lifted = open.movePlayer(pos, { x: 0, y: PLAYER_STEP_HEIGHT, z: 0 });
      const moved = open.movePlayer(lifted.position, { x: 0, y: 0, z: -0.4 });
      const settled = open.movePlayer(moved.position, { x: 0, y: -(PLAYER_STEP_HEIGHT + 0.05), z: 0 });
      if (Math.abs(settled.position.z - before.z) > Math.abs(step.position.z - before.z) + 1e-6) step = settled;
    }
    pos = step.position;
    if (pos.z < GUNSHOP_SITE.z - 1.8) { reachedWorkshop = true; break; }
    if (Math.abs(pos.z - before.z) < 1e-6 && Math.abs(pos.x - before.x) < 1e-6) break;
    guard += 1;
  }
  assert.ok(reachedWorkshop, `Street→Door→Sales→Workshop must be walkable (stuck at ${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);

  // 4) The wall beside the door still blocks.
  const wallHit = closed.movePlayer({ x: GUNSHOP_SITE.x - 2.2, y: PLAYER_HEIGHT, z: facadeZ + 0.9 }, { x: 0, y: 0, z: -2.5 });
  assert.equal(wallHit.blockedZ, true, 'front wall beside the doorway must block');
});

/* -------------------------------------------------------------------------- */
/* 8. Geometry (z-fighting)                                                   */
/* -------------------------------------------------------------------------- */

test('GUNSHOP GEOMETRY: no coplanar same-normal overlapping faces with different materials', async () => {
  const { defs, roots } = await buildWorld();
  const worldBoxes: Array<{ name: string; material: THREE.Material; box: THREE.Box3 }> = [];
  for (const def of defs) {
    const obj = roots.get(def.uuid)!;
    obj.updateWorldMatrix(true, true);
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
      if ((mesh.geometry as THREE.BufferGeometry).type !== 'BoxGeometry') return;
      const q = mesh.getWorldQuaternion(new THREE.Quaternion());
      if (q.angleTo(new THREE.Quaternion()) > 1e-6) return;
      worldBoxes.push({
        name: `${def.metadata.name} / ${mesh.name}`,
        material: mesh.material as THREE.Material,
        box: new THREE.Box3().setFromObject(mesh),
      });
    });
  }
  assert.ok(worldBoxes.length >= 60, `expected a rich shop to scan (got ${worldBoxes.length} boxes)`);

  const axes = ['x', 'y', 'z'] as const;
  const others = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] } as const;
  const fights: string[] = [];
  for (let i = 0; i < worldBoxes.length; i += 1) {
    for (let j = i + 1; j < worldBoxes.length; j += 1) {
      const a = worldBoxes[i];
      const b = worldBoxes[j];
      if (a.material === b.material) continue; // same instance → same surface
      for (const axis of axes) {
        const [m1, m2] = others[axis];
        const overlapsOn = (m: 'x' | 'y' | 'z'): boolean =>
          Math.min(a.box.max[m], b.box.max[m]) - Math.max(a.box.min[m], b.box.min[m]) > AREA_EPS;
        if (!overlapsOn(m1) || !overlapsOn(m2)) continue;
        if (Math.abs(a.box.max[axis] - b.box.max[axis]) < COPLANAR_EPS) {
          fights.push(`${a.name} ↔ ${b.name}: coplanar +${axis} at ${a.box.max[axis].toFixed(4)}`);
        }
        if (Math.abs(a.box.min[axis] - b.box.min[axis]) < COPLANAR_EPS) {
          fights.push(`${a.name} ↔ ${b.name}: coplanar −${axis} at ${a.box.min[axis].toFixed(4)}`);
        }
      }
    }
  }
  assert.deepEqual(fights, [], `z-fighting coplanar pairs found:\n  ${fights.join('\n  ')}`);
});

/* -------------------------------------------------------------------------- */
/* 9. Props in place                                                          */
/* -------------------------------------------------------------------------- */

test('GUNSHOP PROPS: rack guns hang inside the rack, clear of backing and wall', async () => {
  const { roots } = await buildWorld();
  const rack = roots.get(GUNSHOP_OBJECT_IDS.rifleRack)!;
  const backing = rack.getObjectByName('gunshop-rack-backing')!;
  const backingBox = box3of(backing);
  const guns = rack.children.filter((c) => c.name.startsWith('gunshop-rack-gun-'));
  assert.equal(guns.length, 7, '7 long guns on the rack');
  // The rack def carries rotY 90°, so the rack's LOCAL +z (mount depth) is
  // world +x, and its width runs along world z.
  for (const gun of guns) {
    const gb = box3of(gun);
    // muzzle-up: every gun is TALLER than deep, and proud of the backing
    assert.ok(gb.min.x > backingBox.max.x - 0.001,
      `${gun.name} must sit clear IN FRONT of the backing (${gb.min.x.toFixed(3)} vs ${backingBox.max.x.toFixed(3)})`);
    assert.ok(gb.max.x - gb.min.x < 0.1, `${gun.name} must hug the rack plane (no perpendicular pierce)`);
    assert.ok(gb.min.y > backingBox.min.y - 0.01 && gb.max.y < backingBox.max.y + 0.02,
      `${gun.name} must hang within the backing's height`);
    // gun must stay within the rack's width (world z)
    assert.ok(gb.min.z > backingBox.min.z - 0.01 && gb.max.z < backingBox.max.z + 0.01,
      `${gun.name} must stay inside the rack width`);
  }
  // the whole rack sits against the west wall — nothing may cross the wall's inner face
  const L = GUNSHOP_LAYOUT;
  const wallInnerX = GUNSHOP_SITE.x - L.width / 2 + L.wallThickness / 2;
  const rackBox = box3of(rack);
  assert.ok(rackBox.min.x >= wallInnerX - 0.03, `rack must not pierce the west wall (${rackBox.min.x.toFixed(3)})`);
});

test('GUNSHOP PROPS: display case guns sit on the felt under the glass, inside the walls', async () => {
  const { roots } = await buildWorld();
  const caseRoot = roots.get(GUNSHOP_OBJECT_IDS.displayCase)!;
  const felt = caseRoot.getObjectByName('gunshop-display-felt')!;
  const glass = caseRoot.getObjectByName('gunshop-display-glass')!;
  const feltBox = box3of(felt);
  const glassBox = box3of(glass);
  const wallFront = caseRoot.getObjectByName('gunshop-display-wall-front')!;
  const wallBack = caseRoot.getObjectByName('gunshop-display-wall-back')!;
  const wallFrontBox = box3of(wallFront);
  const wallBackBox = box3of(wallBack);

  const guns = caseRoot.children.filter((c) => c.name.startsWith('gunshop-display-revolver') || c.name === 'gunshop-display-derringer');
  assert.equal(guns.length, 4, '3 revolvers + 1 derringer in the case');
  for (const gun of guns) {
    const gb = box3of(gun);
    assert.ok(gb.min.y >= feltBox.max.y - 0.004, `${gun.name} must rest ON the felt`);
    assert.ok(gb.max.y < glassBox.min.y - 0.02, `${gun.name} must clear the glass lid`);
    assert.ok(gb.min.z > wallBackBox.max.z && gb.max.z < wallFrontBox.min.z,
      `${gun.name} must sit between the case walls (no interpenetration)`);
  }
  // guns must not overlap each other
  for (let i = 0; i < guns.length; i++) {
    for (let j = i + 1; j < guns.length; j++) {
      const a = box3of(guns[i]);
      const b = box3of(guns[j]);
      const overlap = a.min.x < b.max.x - 0.005 && a.max.x > b.min.x + 0.005
        && a.min.y < b.max.y - 0.005 && a.max.y > b.min.y + 0.005
        && a.min.z < b.max.z - 0.005 && a.max.z > b.min.z + 0.005;
      assert.ok(!overlap, `${guns[i].name} and ${guns[j].name} must not interpenetrate`);
    }
  }

  // § presentation revision: the revolvers LIE ON THEIR SIDES in a gentle
  // fan (no mechanical parallel row), the hero gun rests on a felt riser.
  const riser = caseRoot.getObjectByName('gunshop-display-riser');
  assert.ok(riser, 'the hero revolver displays on a felt riser');
  const riserBox = box3of(riser!);
  const revs = caseRoot.children.filter((c) => c.name.startsWith('gunshop-display-revolver-')) as THREE.Group[];
  assert.equal(revs.length, 3, 'three revolvers');
  const yaws = revs.map((r) => r.rotation.y);
  assert.ok(Math.abs(yaws[0] - yaws[1]) > 0.05 && Math.abs(yaws[1] - yaws[2]) > 0.05,
    'the revolvers are fanned (distinct presentation yaws), not a parallel row');
  for (const rev of revs) {
    assert.equal(rev.rotation.order, 'YXZ', 'roll applies after the yaw (lying on its flank)');
    assert.ok(Math.abs(rev.rotation.x - Math.PI / 2) < 1e-9, 'each revolver lies on its side (90° roll)');
    const rb = box3of(rev);
    assert.ok(rb.max.y - rb.min.y < 0.07, `lying revolver reads flat, not edge-balanced (${(rb.max.y - rb.min.y).toFixed(3)})`);
  }
  const hero = box3of(revs[1]);
  assert.ok(Math.abs(hero.min.y - riserBox.max.y) < 0.004, 'the hero revolver sits ON the riser');
  // real risers are shorter than the gun — the body rests on it, the muzzle
  // and grip may overhang; require a genuine horizontal overlap, not containment
  assert.ok(hero.min.x < riserBox.max.x && hero.max.x > riserBox.min.x
    && hero.min.z < riserBox.max.z && hero.max.z > riserBox.min.z,
    'the hero revolver rests on the riser footprint (overlapping, not beside it)');
  assert.ok(caseRoot.getObjectByName('gunshop-display-riser-label'), 'brass label plate present');
});

test('GUNSHOP PROPS: nothing under the floor, through the roof, or outside the building', async () => {
  const { roots } = await buildWorld();
  const L = GUNSHOP_LAYOUT;
  const innerMinX = GUNSHOP_SITE.x - L.width / 2;
  const innerMaxX = GUNSHOP_SITE.x + L.width / 2;
  const innerMinZ = GUNSHOP_SITE.z - L.depth / 2;
  const innerMaxZ = GUNSHOP_SITE.z + L.depth / 2;
  const roofBottom = L.height;

  const interiorIds = new Set<string>([
    GUNSHOP_OBJECT_IDS.counter, GUNSHOP_OBJECT_IDS.displayCase, GUNSHOP_OBJECT_IDS.cashRegister,
    GUNSHOP_OBJECT_IDS.brassScale, GUNSHOP_OBJECT_IDS.ammoBox1, GUNSHOP_OBJECT_IDS.ammoBox2,
    GUNSHOP_OBJECT_IDS.cartridgeStand, GUNSHOP_OBJECT_IDS.rifleRack, GUNSHOP_OBJECT_IDS.shelfUnit,
    GUNSHOP_OBJECT_IDS.bowieKnife, GUNSHOP_OBJECT_IDS.holsterDisplay, GUNSHOP_OBJECT_IDS.workbench,
    GUNSHOP_OBJECT_IDS.vise, GUNSHOP_OBJECT_IDS.toolRack, GUNSHOP_OBJECT_IDS.powderKeg,
    GUNSHOP_OBJECT_IDS.ammoCrate1, GUNSHOP_OBJECT_IDS.ammoCrate2,
    GUNSHOP_OBJECT_IDS.lanternSales, GUNSHOP_OBJECT_IDS.lanternWorkshop,
  ]);

  const violations: string[] = [];
  for (const [uuid, root] of roots) {
    if (!interiorIds.has(uuid)) continue;
    const bb = box3of(root);
    const def = root.name;
    if (bb.min.y < L.floorTop - 0.06 && uuid !== GUNSHOP_OBJECT_IDS.rifleRack && uuid !== GUNSHOP_OBJECT_IDS.bowieKnife
      && uuid !== GUNSHOP_OBJECT_IDS.holsterDisplay && uuid !== GUNSHOP_OBJECT_IDS.toolRack) {
      violations.push(`${def}: sinks under the floor (min y ${bb.min.y.toFixed(3)})`);
    }
    if (bb.max.y > roofBottom + 0.01 && uuid !== GUNSHOP_OBJECT_IDS.lanternSales && uuid !== GUNSHOP_OBJECT_IDS.lanternWorkshop) {
      violations.push(`${def}: pokes through the ceiling (max y ${bb.max.y.toFixed(3)})`);
    }
    if (bb.min.x < innerMinX - 0.05 || bb.max.x > innerMaxX + 0.05
      || bb.min.z < innerMinZ - 0.05 || bb.max.z > innerMaxZ + 0.05) {
      // wall-mounted pieces legitimately bury a few cm INTO the wall band;
      // anything past 5 cm is a real piercing.
      violations.push(`${def}: leaves the building envelope`);
    }
  }
  assert.deepEqual(violations, [], `interior placement violations:\n  ${violations.join('\n  ')}`);
});

test('GUNSHOP WORKSHOP: the back area reads as a workshop, not a warehouse', async () => {
  const { roots } = await buildWorld();
  const bench = roots.get(GUNSHOP_OBJECT_IDS.workbench)!;
  const benchTop = bench.getObjectByName('gunshop-workbench-top')!;
  const benchBox = box3of(benchTop);
  // the bench backs against the north wall, front face south into the room
  const L = GUNSHOP_LAYOUT;
  assert.ok(benchBox.min.z < GUNSHOP_SITE.z - L.depth / 2 + L.wallThickness + 0.1,
    'the workbench must sit against the north wall');
  assert.ok(benchBox.max.z < GUNSHOP_SITE.z - 1.5, 'the workbench must keep the workshop walkway south of it clear');

  const vise = box3of(roots.get(GUNSHOP_OBJECT_IDS.vise)!);
  assert.ok(vise.min.y >= benchBox.max.y - 0.01, 'the vise must be mounted ON the bench top');
  assert.ok(vise.min.x > benchBox.min.x && vise.max.x < benchBox.max.x, 'the vise must sit within the bench');

  const rack = box3of(roots.get(GUNSHOP_OBJECT_IDS.toolRack)!);
  assert.ok(rack.min.z < GUNSHOP_SITE.z - L.depth / 2 + L.wallThickness + 0.05, 'the tool rack hangs on the north wall');
  assert.ok(rack.min.x > benchBox.max.x - 0.05 || rack.max.x < benchBox.min.x + 0.05 || rack.min.y > benchBox.max.y,
    'the tool rack must not clash with the bench volume');
});

/* -------------------------------------------------------------------------- */
/* 9b. § revisions — facade signs, workbench dressing, ammo-shelf stocking     */
/* -------------------------------------------------------------------------- */

test('GUNSHOP FACADE SIGNS: three period signs, mounted proud, in their bands, overlapping nothing', async () => {
  const { roots } = await buildWorld();
  const L = GUNSHOP_LAYOUT;
  const wallFaceZ = GUNSHOP_SITE.z + L.depth / 2 + L.wallThickness / 2;

  const parapet = roots.get(GUNSHOP_OBJECT_IDS.parapetSign)!;
  const shingle = roots.get(GUNSHOP_OBJECT_IDS.porchShingle)!;
  const repairs = roots.get(GUNSHOP_OBJECT_IDS.repairsBoard)!;

  // PARAPET BOARD — on the false front, west of center, 5 mm off its face.
  const parapetFaceZ = wallFaceZ + 0.09; // false-front front face
  const pb = box3of(parapet.getObjectByName('gunshop-parapet-sign-board')!);
  assert.ok(Math.abs(pb.min.z - (parapetFaceZ + 0.005)) < 0.003,
    `parapet board mounts 5 mm off the false front (min z ${pb.min.z.toFixed(4)})`);
  assert.ok(pb.min.y > L.height + 0.2 && pb.max.y < L.falseFrontTop - 0.2,
    'parapet board lives inside the false-front band');
  assert.ok(pb.max.x < GUNSHOP_SITE.x - 0.4 && pb.min.x > GUNSHOP_SITE.x - L.width / 2,
    'parapet board sits west of center, inside the facade');
  assert.ok(parapet.getObjectByName('gunshop-parapet-sign-frame-top')
    && parapet.getObjectByName('gunshop-parapet-sign-bolt-w-hi'), 'parapet sign is framed and bolted');

  // PORCH SHINGLE — hangs from the porch-roof underside, above head height.
  const sb = box3of(shingle.getObjectByName('gunshop-shingle-board')!);
  assert.ok(sb.max.y < L.porchRoofTopY - 0.12 + 0.004, 'shingle hangs below the porch-roof underside');
  assert.ok(sb.min.y > 1.95, `shingle bottom stays above head height (${sb.min.y.toFixed(2)})`);
  const chainW = box3of(shingle.getObjectByName('gunshop-shingle-chain-w')!);
  assert.ok(chainW.max.y > L.porchRoofTopY - 0.13, 'the chain tops bury into the porch roof (no floating sign)');
  assert.ok(sb.min.x > GUNSHOP_SITE.x - 3.1 && sb.max.x < GUNSHOP_SITE.x - 2.1,
    'shingle hangs between the west windows, clear of the porch posts');
  assert.ok(shingle.getObjectByName('gunshop-shingle-face-south')
    && shingle.getObjectByName('gunshop-shingle-face-north'), 'shingle is double-sided');

  // REPAIRS BOARD — between the door casing and the first east window.
  const rb = box3of(repairs.getObjectByName('gunshop-repairs-board-board')!);
  const casingOuter = GUNSHOP_SITE.x + L.doorWidth / 2 + 0.07; // casing strip outer edge
  const winFrameWest = GUNSHOP_SITE.x + L.window.centersFromDoor[0] - (L.window.width / 2 + 0.12);
  assert.ok(rb.min.x > casingOuter + 0.01, `repairs board clear of the door casing (${rb.min.x.toFixed(3)} > ${casingOuter.toFixed(3)})`);
  assert.ok(rb.max.x < winFrameWest - 0.01, `repairs board clear of the window frame (${rb.max.x.toFixed(3)} < ${winFrameWest.toFixed(3)})`);
  assert.ok(Math.abs(rb.min.z - (wallFaceZ + 0.01)) < 0.003, 'repairs board mounts just off the wall face (bolt standoff)');

  // The three new signs overlap NOTHING on the facade (3D bbox test against
  // the main sign and all four window assemblies). The shell def is checked
  // through its false-front CAP (the parapet board legitimately sits within
  // the false front's own band — the mount check above covers that seam).
  const building = roots.get(GUNSHOP_OBJECT_IDS.building)!;
  const cap = building.getObjectByName('gunshop-false-front-cap')!;
  const facadeNeighbours = [
    roots.get(GUNSHOP_OBJECT_IDS.sign)!, roots.get(GUNSHOP_OBJECT_IDS.windowWest1)!,
    roots.get(GUNSHOP_OBJECT_IDS.windowWest2)!, roots.get(GUNSHOP_OBJECT_IDS.windowEast1)!,
    roots.get(GUNSHOP_OBJECT_IDS.windowEast2)!, cap,
  ];
  const capBox = box3of(cap);
  const pRoot = box3of(parapet);
  assert.ok(pRoot.max.y < capBox.min.y - 0.01, 'parapet sign stays below the cap trim');
  for (const signRoot of [parapet, shingle, repairs]) {
    const sbb = box3of(signRoot);
    for (const n of facadeNeighbours) {
      if (n === signRoot) continue;
      const nb = box3of(n);
      const overlap = sbb.min.x < nb.max.x - 0.005 && sbb.max.x > nb.min.x + 0.005
        && sbb.min.y < nb.max.y - 0.005 && sbb.max.y > nb.min.y + 0.005
        && sbb.min.z < nb.max.z - 0.005 && sbb.max.z > nb.min.z + 0.005;
      assert.ok(!overlap, `${signRoot.name} must not interpenetrate ${n.name}`);
    }
  }
});

test('GUNSHOP WORKBENCH DRESSING: bench tools seated on the top, non-overlapping, real scale', async () => {
  const { roots } = await buildWorld();
  const bench = roots.get(GUNSHOP_OBJECT_IDS.workbench)!;
  const topBox = box3of(bench.getObjectByName('gunshop-workbench-top')!);
  const surface = topBox.max.y;

  const itemNames = [
    'gunshop-bench-part-barrel-group', 'gunshop-bench-part-cylinder-group', 'gunshop-bench-part-grip-group',
    'gunshop-bench-hammer', 'gunshop-bench-screwdriver-1', 'gunshop-bench-screwdriver-2',
    'gunshop-bench-file', 'gunshop-bench-oil-bottle', 'gunshop-bench-parts-tray',
    'gunshop-bench-cartridge-1-group', 'gunshop-bench-cartridge-2-group', 'gunshop-bench-cartridge-3-group',
    'gunshop-bench-rag-group',
  ];
  const boxes: THREE.Box3[] = [];
  for (const name of itemNames) {
    const item = bench.getObjectByName(name);
    assert.ok(item, `bench item "${name}" missing`);
    const bb = box3of(item!);
    boxes.push(bb);
    assert.ok(bb.min.y >= surface - 0.002 && bb.min.y <= surface + 0.004,
      `${name} must sit ON the bench top (min y ${bb.min.y.toFixed(4)} vs surface ${surface.toFixed(4)})`);
    assert.ok(bb.min.x > topBox.min.x + 0.005 && bb.max.x < topBox.max.x - 0.005,
      `${name} stays on the bench (x ${bb.min.x.toFixed(3)}..${bb.max.x.toFixed(3)})`);
    assert.ok(bb.min.z > topBox.min.z + 0.005 && bb.max.z < topBox.max.z - 0.005,
      `${name} stays on the bench (z)`);
  }
  assert.ok(itemNames.length >= 12, 'the bench carries a real tool set');
  // no two bench items interpenetrate
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = a.min.x < b.max.x - 0.002 && a.max.x > b.min.x + 0.002
        && a.min.y < b.max.y - 0.002 && a.max.y > b.min.y + 0.002
        && a.min.z < b.max.z - 0.002 && a.max.z > b.min.z + 0.002;
      assert.ok(!overlap, `bench items ${itemNames[i]} ↔ ${itemNames[j]} overlap`);
    }
  }
  // the vise def zone (west end) stays clear of the bench dressing
  const vise = roots.get(GUNSHOP_OBJECT_IDS.vise)!;
  const viseBox = box3of(vise);
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    const overlap = a.min.x < viseBox.max.x && a.max.x > viseBox.min.x
      && a.min.y < viseBox.max.y && a.max.y > viseBox.min.y
      && a.min.z < viseBox.max.z && a.max.z > viseBox.min.z;
    assert.ok(!overlap, `bench item ${itemNames[i]} collides with the vise`);
  }
  // hanging tools ride the back-panel pegs; toolbox sits on the lower shelf
  const wrench = box3of(bench.getObjectByName('gunshop-bench-hanging-wrench')!);
  assert.ok(wrench.min.y > surface && wrench.max.y < topBox.max.y + 0.6, 'wrench hangs on a peg above the bench');
  assert.ok(bench.getObjectByName('gunshop-bench-wire-coil'), 'wire coil hangs on a peg');
  const toolbox = box3of(bench.getObjectByName('gunshop-bench-toolbox')!);
  const shelfBox = box3of(bench.getObjectByName('gunshop-workbench-shelf')!);
  assert.ok(Math.abs(toolbox.min.y - shelfBox.max.y) < 0.004, 'toolbox rests on the lower shelf');
});

test('GUNSHOP AMMO SHELF: mostly stocked with varied arrangement, everything contained', async () => {
  const { roots } = await buildWorld();
  const unit = roots.get(GUNSHOP_OBJECT_IDS.shelfUnit)!;
  const unitBox = box3of(unit);
  const floorY = GUNSHOP_LAYOUT.floorTop;
  const boardTops = [0.05, 0.55, 1.05, 1.55].map((y) => floorY + y + 0.015);
  const LID_STEP = 0.047 + 0.0012;

  const boxes = unit.children.filter((c) => c.name.startsWith('gunshop-shelf-box-')) as THREE.Group[];
  assert.ok(boxes.length >= 28, `the shelf must be MOSTLY stocked (got ${boxes.length} boxes)`);

  const perShelf = [0, 0, 0, 0];
  let stacks = 0;
  let depthVaried = 0;
  for (const box of boxes) {
    const bb = box3of(box);
    // containment: inside the unit — no through-back, no side poke, no float
    assert.ok(bb.min.x > unitBox.min.x - 0.001 && bb.max.x < unitBox.max.x + 0.001,
      `${box.name} pierces the shelf front/back`);
    assert.ok(bb.min.z > unitBox.min.z + 0.03 && bb.max.z < unitBox.max.z - 0.03,
      `${box.name} pokes through a shelf side`);
    assert.ok(bb.min.y > floorY - 0.001, `${box.name} sinks under the shelf`);
    // seating: the base rests on a board top or on a stacked lid
    const seat = boardTops.findIndex((t) => Math.abs(bb.min.y - t) < 0.003);
    const stackSeat = boardTops.findIndex((t) => Math.abs(bb.min.y - (t + LID_STEP)) < 0.003);
    assert.ok(seat >= 0 || stackSeat >= 0,
      `${box.name} floats (min y ${bb.min.y.toFixed(4)}, board tops ${boardTops.map((t) => t.toFixed(3)).join('/')})`);
    if (seat >= 0) perShelf[seat] += 1;
    if (stackSeat >= 0) { stacks += 1; perShelf[stackSeat] += 1; }
    // depth variation across the shelf depth
    const midX = (bb.min.x + bb.max.x) / 2;
    if (Math.abs(midX - (unitBox.min.x + unitBox.max.x) / 2) > 0.03) depthVaried += 1;
  }
  assert.ok(perShelf[0] >= 8 && perShelf[1] >= 7 && perShelf[2] >= 9,
    `the three lower shelves are full (${perShelf.join(', ')})`);
  assert.ok(perShelf[3] >= 3 && perShelf[3] <= 6, `the top shelf stays PARTIAL by design (${perShelf[3]})`);
  assert.ok(stacks >= 2, `boxes stack in places (${stacks} stacked)`);
  assert.ok(depthVaried >= 3, `some boxes stand forward/back (${depthVaried} offset)`);
  // the spare rifle still lies along the top
  assert.ok(unit.getObjectByName('gunshop-shelf-rifle'), 'spare rifle kept on the unit top');
});



test('GUNSHOP LIGHT BUDGET: exactly 2 real PointLights across the whole shop', async () => {
  const registry = makeRegistry();
  const defs = buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z);
  let lights = 0;
  for (const def of defs) {
    const obj = await registry.create(def);
    obj.traverse((c) => {
      if ((c as THREE.PointLight).isPointLight) lights += 1;
    });
  }
  assert.equal(lights, 2, 'only the sales + workshop lanterns may carry real PointLights');
});

test('GUNSHOP DOOR SPEC: the map contract matches the layout ids', () => {
  assert.equal(GUNSHOP_DOOR_SPEC.uuid, GUNSHOP_OBJECT_IDS.frontDoor);
  assert.ok(GUNSHOP_DOOR_SPEC.range > 1.5 && GUNSHOP_DOOR_SPEC.range <= 2.6, 'interaction reach is sensible');
  assert.ok(GUNSHOP_DOOR_SPEC.labelOpen.length > 0 && GUNSHOP_DOOR_SPEC.labelClose.length > 0);
});
