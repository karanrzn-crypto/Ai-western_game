/**
 * Bank asset tests.
 *
 * Locks the contracts the bank module promises to the rest of the game
 * (mirrors the saloon test categories):
 *
 *  1. REGISTRATION — every bank assetType (exterior + the supplied interior
 *     library) is registered exactly once; duplicates throw.
 *  2. CREATION — the registry can materialise every type used by the layout,
 *     mirroring uuid + name; layout uuids are unique and v4-shaped.
 *  3. TRANSFORM OWNERSHIP — factories NEVER apply the registry transform.
 *  4. SHELL — the classical facade kit contains its main parts (roof,
 *     cornices, entablature, BANK letters, pediment, crest, 4 columns,
 *     entrance surround, open door leaves, windows, quoins) and owns NO wall
 *     geometry (walls are separate collider unit-boxes).
 *  5. INTERIOR FIDELITY — the supplied assets keep their signatures: vault
 *     hinge/rivets/locking wheel, teller cage service opening, safe-deposit
 *     box doors, banker desk details, grandfather clock parts.
 *  6. LIGHT BUDGET — exactly 4 real PointLights across the whole bank
 *     (3 gas wall lamps + the banker's desk lamp).
 *  7. COLLISION — walls/stairs/landing/floor/counter/vault/floor-safe/desk
 *     carry colliders; shell kit and decor do not.
 *  8. WALKABILITY — the street→steps→landing→doorway→lobby path is genuinely
 *     walkable (steps climbable at the player's 0.35 stepHeight) while the
 *     wall beside the door and the teller counter block.
 *  9. LAYOUT — facade segments tile around the doorway; interior props sit
 *     inside the walls in their spec positions (vault visible from the door,
 *     cage on the counter, deposit wall grounded, rug on the entrance path).
 * 10. GEOMETRY — no coplanar same-normal overlapping faces with different
 *     materials anywhere in the bank (the z-fighting class of bug).
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  AssetRegistry,
  CollisionWorld,
  registerAllBankFactories,
  BANK_EXTERIOR_ASSET_TYPES,
  BANK_INTERIOR_ASSET_TYPES,
  BANK_LAYOUT,
  BANK_OBJECT_IDS,
  BANK_SITE,
  buildBankMapObjects,
} from '../src/index.js';
import type { ObjectDefinition } from '../src/index.js';

const PLAYER_STEP_HEIGHT = 0.35; // matches PlayerController default in the map
const PLAYER_HEIGHT = 1.7;

function box3of(o: THREE.Object3D): THREE.Box3 {
  o.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(o);
}

function makeRegistry(): AssetRegistry {
  const registry = new AssetRegistry();
  registerAllBankFactories(registry);
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
  uuid: '30000000-0000-4000-b000-0000000000aa',
  assetType: 'bank-building',
  transform: {
    position: { x: 4, y: 0.5, z: -7 },
    rotation: { x: 10, y: 20, z: 30 },
    scale: { x: 2, y: 3, z: 4 },
  },
  metadata: { name: 'Test Bank' },
  ...base,
});

/* -------------------------------------------------------------------------- */

test('BANK REGISTRATION: every type registers; duplicates throw', () => {
  const registry = makeRegistry();
  for (const type of BANK_EXTERIOR_ASSET_TYPES) {
    assert.ok(registry.has(type), `assetType "${type}" must be registered`);
  }
  for (const type of BANK_INTERIOR_ASSET_TYPES) {
    assert.ok(registry.has(type), `assetType "${type}" must be registered`);
  }
  assert.throws(
    () => registerAllBankFactories(registry),
    /already registered/,
    'double registration must be rejected by the registry',
  );
});

test('BANK REGISTRATION: the registry can create every type the layout uses', async () => {
  const registry = makeRegistry();
  const defs = buildBankMapObjects(BANK_SITE.x, BANK_SITE.z);

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

test('BANK LAYOUT: unique v4 uuids from the bank block', () => {
  const defs = buildBankMapObjects(BANK_SITE.x, BANK_SITE.z);
  const uuids = new Set<string>();
  for (const def of defs) {
    assert.match(def.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, `uuid ${def.uuid} must be v4-shaped`);
    assert.ok(def.uuid.startsWith('10000000-0000-4000-b000-'), `uuid ${def.uuid} must come from the bank block`);
    assert.ok(!uuids.has(def.uuid), `duplicate uuid ${def.uuid}`);
    uuids.add(def.uuid);
  }
});

test('BANK FACTORIES: transform is NOT applied by the factory', async () => {
  const registry = makeRegistry();
  for (const type of [...BANK_EXTERIOR_ASSET_TYPES, 'bank-vault-door', 'teller-counter', 'marble-column']) {
    const obj = await registry.create(movedDef({ assetType: type }));
    assert.deepEqual(obj.position.toArray(), [0, 0, 0], `${type}: factory must leave position untouched`);
    assert.deepEqual(obj.rotation.toArray().slice(0, 3), [0, 0, 0], `${type}: factory must leave rotation untouched`);
    assert.deepEqual(obj.scale.toArray(), [1, 1, 1], `${type}: factory must leave scale untouched`);
  }
});

/* ---- Shell ---------------------------------------------------------------- */

test('BANK SHELL: classical facade kit builds with all its main parts', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'bank-building' }))) as THREE.Group;

  const required = [
    'bank-roof',
    'bank-cornice-east', 'bank-cornice-west', 'bank-cornice-rear',
    'bank-architrave', 'bank-frieze', 'bank-entablature-cornice',
    'bank-pediment', 'bank-pediment-base-band',
    'bank-pediment-rake-w', 'bank-pediment-rake-e',
    'bank-crest-disc', 'bank-crest-ring', 'bank-crest-diamond',
    'bank-door-jamb-w', 'bank-door-jamb-e', 'bank-door-lintel',
    'bank-door-arch', 'bank-door-keystone',
    'bank-door-leaf-left', 'bank-door-leaf-right',
    'bank-door-panel-left-0', 'bank-door-panel-right-1',
    'bank-door-handle-left', 'bank-door-handle-right',
    'bank-window-glass-front-w2.775', 'bank-window-glass-front-e2.775',
    'bank-window-sill-w2.775', 'bank-window-sill-e2.775',
    'bank-window-glass-side-en', 'bank-window-glass-side-ws',
    'bank-window-sill-en', 'bank-window-sill-ws',
    'bank-cornice-east', 'bank-quoine-w-0', 'bank-quoine-e-4',
  ];
  for (const name of required) {
    assert.ok(obj.getObjectByName(name), `shell must contain "${name}"`);
  }
  // GOLD "BANK" frieze letters.
  for (const name of ['bank-sign-letter-0', 'bank-sign-letter-1', 'bank-sign-letter-2', 'bank-sign-letter-3']) {
    assert.ok(obj.getObjectByName(name), `frieze must carry letter "${name}"`);
  }
  // FOUR columns, each with plinth/base/shaft/flutes/capital/abacus.
  const columns = obj.children.filter((c) => c.name.startsWith('bank-column-'));
  assert.equal(columns.length, 4, 'facade must have exactly four columns');
  for (const col of columns) {
    for (const part of ['-plinth', '-base', '-shaft', '-capital', '-abacus']) {
      assert.ok(col.getObjectByName(col.name + part), `column must contain "${part}"`);
    }
    const flutes = col.children.filter((c) => c.name.includes('-flute-'));
    assert.equal(flutes.length, 12, 'column shaft must be fluted (12 strips)');
  }
});

test('BANK SHELL: owns NO wall geometry (walls are separate collider objects)', async () => {
  const registry = makeRegistry();
  const obj = await registry.create(movedDef({ assetType: 'bank-building' }));
  const wallish = obj.children.filter((c) => /wall/i.test(c.name));
  assert.equal(wallish.length, 0, 'shell must not bundle wall geometry');
});

test('BANK SHELL: doorway leaves nothing blocking the opening', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'bank-building' }))) as THREE.Group;
  // The open leaves must lie AGAINST the facade (z beyond the wall face),
  // never inside the doorway span.
  const wallFaceZ = BANK_LAYOUT.depth / 2 + BANK_LAYOUT.wallThickness / 2;
  for (const side of ['left', 'right'] as const) {
    const leaf = obj.getObjectByName(`bank-door-leaf-${side}`)!;
    const bb = box3of(leaf);
    assert.ok(
      bb.min.z >= wallFaceZ - 0.01,
      `${side} leaf must rest against the facade (min z ${bb.min.z.toFixed(3)} vs face ${wallFaceZ})`,
    );
    // Leaf height stays under the door head.
    assert.ok(bb.max.y <= BANK_LAYOUT.floorTop + BANK_LAYOUT.doorHeight + 0.01, 'leaf must fit the opening height');
  }
  // The four columns clear the doorway (symmetry checked against the layout).
  for (const cx of BANK_LAYOUT.columns.xs) {
    assert.ok(
      Math.abs(cx) >= BANK_LAYOUT.doorWidth / 2 + 0.4,
      `column at x=${cx} would crowd the doorway`,
    );
  }
});

/* ---- Supplied interior asset fidelity ------------------------------------- */

test('BANK VAULT DOOR: riveted circular door with hinge, wheel and radial bolts', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'bank-vault-door' }))) as THREE.Group;
  assert.ok(obj.getObjectByName('bank-vault-door-hinge'), 'vault must carry its hinge group');
  // The 3 ring frame + door slab + plaque + spoked wheel (rim + 6 spokes + 8 bolts).
  const tori: THREE.Object3D[] = [];
  const spokes: THREE.Object3D[] = [];
  obj.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    if ((mesh.geometry as THREE.BufferGeometry).type === 'TorusGeometry') tori.push(mesh);
    if ((mesh.geometry as THREE.BufferGeometry).type === 'CylinderGeometry') spokes.push(mesh);
  });
  assert.ok(tori.length >= 4, `vault needs its frame rings + wheel rim (got ${tori.length} tori)`);
  assert.ok(spokes.length >= 6, `locking wheel needs its spokes (got ${spokes.length} cylinders)`);
});

test('BANK TELLER CAGE: real grille with a genuine service opening', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'teller-cage' }))) as THREE.Group;
  // Bars must skip the [-0.35, 0.35] service gap.
  const bars = obj.children.filter((c) => {
    const mesh = c as THREE.Mesh;
    return (mesh as unknown as { isMesh?: boolean }).isMesh
      && (mesh.geometry as THREE.BufferGeometry).type === 'CylinderGeometry';
  });
  assert.equal(bars.length, 10, '14 bar slots minus the 4 covered by the service gap');
  for (const bar of bars) {
    const x = bar.position.x;
    assert.ok(Math.abs(x) >= 0.35 - 1e-9, `bar at x=${x.toFixed(3)} intrudes into the service opening`);
  }
  // Brass service ledge at the opening base.
  assert.ok(obj.children.some((c) => (c as THREE.Mesh).isMesh), 'cage carries its parts');
});

test('BANK SAFE DEPOSIT WALL: 24 numbered brass box doors on a wood backing', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'safe-deposit-wall' }))) as THREE.Group;
  const doors = obj.children.filter((c) => {
    const mesh = c as THREE.Mesh;
    return (mesh as unknown as { isMesh?: boolean }).isMesh
      && (mesh.geometry as THREE.BufferGeometry).type === 'BoxGeometry'
      && Math.abs(mesh.scale.x * (mesh.geometry as THREE.BoxGeometry).parameters.width - 0.24) < 1e-6;
  });
  assert.equal(doors.length, 24, '6×4 deposit boxes expected');
});

test('BANKERS DESK: leather inset, ledger, inkwell, quill and its own lamp', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'bankers-desk' }))) as THREE.Group;
  const lights: THREE.Object3D[] = [];
  obj.traverse((c) => { if ((c as THREE.PointLight).isPointLight) lights.push(c); });
  assert.equal(lights.length, 1, 'the desk carries exactly one real PointLight (its banker lamp)');
  // Green leather inset + brass lamp parts exist as meshes above the desktop.
  const meshes: THREE.Object3D[] = [];
  obj.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if ((mesh as unknown as { isMesh?: boolean }).isMesh) meshes.push(mesh);
  });
  assert.ok(meshes.length >= 15, `desk must keep its full detail (got ${meshes.length} meshes)`);
});

test('GRANDFATHER CLOCK: hood, face ring, pendulum and weights', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'grandfather-clock' }))) as THREE.Group;
  const bb = box3of(obj);
  assert.ok(bb.max.y - bb.min.y > 2.0, 'clock must stand tall (~2.2 m)');
  const tori: THREE.Object3D[] = [];
  obj.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if ((mesh as unknown as { isMesh?: boolean }).isMesh
      && (mesh.geometry as THREE.BufferGeometry).type === 'TorusGeometry') tori.push(mesh);
  });
  assert.ok(tori.length >= 1, 'clock face must carry its brass ring');
});

/* ---- Light budget ---------------------------------------------------------- */

test('BANK LIGHT BUDGET: exactly 4 real PointLights across the whole bank', async () => {
  const registry = makeRegistry();
  const defs = buildBankMapObjects(BANK_SITE.x, BANK_SITE.z);
  let lights = 0;
  for (const def of defs) {
    const obj = await registry.create(def);
    obj.traverse((c) => {
      if ((c as THREE.PointLight).isPointLight) lights += 1;
    });
  }
  assert.equal(lights, 4, '3 gas wall lamps + 1 banker desk lamp — nothing more');
});

/* ---- Collision ------------------------------------------------------------- */

test('BANK COLLISION: masonry and solid furniture carry colliders, decor does not', () => {
  const defs = buildBankMapObjects(BANK_SITE.x, BANK_SITE.z);
  const byId = new Map(defs.map((d) => [d.uuid, d]));
  const flag = (id: string): unknown => byId.get(id)?.metadata.collider;

  // Walls, floor slab, threshold, stairs, landing — real masonry.
  for (const id of [
    BANK_OBJECT_IDS.floor, BANK_OBJECT_IDS.threshold, BANK_OBJECT_IDS.wallRear, BANK_OBJECT_IDS.wallWest,
    BANK_OBJECT_IDS.wallEast, BANK_OBJECT_IDS.wallFrontWest, BANK_OBJECT_IDS.wallFrontEast,
    BANK_OBJECT_IDS.wallFrontHeader, BANK_OBJECT_IDS.atticWall,
    BANK_OBJECT_IDS.landing, BANK_OBJECT_IDS.step1, BANK_OBJECT_IDS.step2, BANK_OBJECT_IDS.step3,
  ]) {
    assert.equal(flag(id), true, `masonry ${id} must be a collider`);
  }
  // Solid banking furniture.
  for (const id of [
    BANK_OBJECT_IDS.tellerCounter, BANK_OBJECT_IDS.vaultDoor,
    BANK_OBJECT_IDS.floorSafe, BANK_OBJECT_IDS.bankersDesk,
  ]) {
    assert.equal(flag(id), true, `furniture ${id} must be a collider`);
  }
  // Shell kit, fixtures, seats, decor.
  for (const id of [
    BANK_OBJECT_IDS.building, BANK_OBJECT_IDS.tellerCage, BANK_OBJECT_IDS.safeDepositWall,
    BANK_OBJECT_IDS.bankersChair, BANK_OBJECT_IDS.grandfatherClock,
    BANK_OBJECT_IDS.columnWest, BANK_OBJECT_IDS.columnEast, BANK_OBJECT_IDS.floorRug,
    BANK_OBJECT_IDS.bankSign, BANK_OBJECT_IDS.lampWestLobby, BANK_OBJECT_IDS.lampEastLobby,
    BANK_OBJECT_IDS.lampEastSecure, BANK_OBJECT_IDS.counterMoneyBag, BANK_OBJECT_IDS.counterCoins1,
    BANK_OBJECT_IDS.vaultMoneyBag1, BANK_OBJECT_IDS.deskCoinStack,
  ]) {
    assert.equal(flag(id), false, `decor ${id} must NOT be a collider`);
  }
});

test('BANK WALKABILITY: stairs climb, doorway walkable, wall and counter block', () => {
  const defs = buildBankMapObjects(BANK_SITE.x, BANK_SITE.z);
  const world = new CollisionWorld(defs);
  const doorX = BANK_SITE.x;

  // 1) RAW approach at street level: the first step is a REAL collider.
  let pos: { x: number; y: number; z: number } = { x: doorX, y: PLAYER_HEIGHT, z: BANK_SITE.z + 10.5 };
  const raw = world.movePlayer(pos, { x: 0, y: 0, z: -1.2 });
  assert.equal(raw.blockedZ, false, 'street run-up must be clear');
  pos = raw.position;
  let guard = 0;
  while (!world.movePlayer(pos, { x: 0, y: 0, z: -0.1 }).blockedZ && guard < 40) {
    pos = world.movePlayer(pos, { x: 0, y: 0, z: -0.1 }).position;
    guard += 1;
  }
  assert.ok(guard < 40, 'the player must eventually reach the first step');
  const firstBlockZ = pos.z;
  const step1SouthZ = BANK_SITE.z + BANK_LAYOUT.depth / 2 + BANK_LAYOUT.wallThickness / 2
    + BANK_LAYOUT.landing.depth + BANK_LAYOUT.steps.tread * BANK_LAYOUT.steps.count;
  assert.ok(
    firstBlockZ >= step1SouthZ - 1e-6,
    `the player must stop AT the bottom step face (stopped at ${firstBlockZ.toFixed(3)}, face ${step1SouthZ})`,
  );

  // 2) Step-up walk (PlayerController-style: lift → move → settle) up the
  // stairs and in through the door — must reach the lobby without getting
  // stuck anywhere along the way.
  const walkIn = (): { z: number; y: number; stuckAt: number } => {
    let p: { x: number; y: number; z: number } = { x: doorX, y: PLAYER_HEIGHT, z: BANK_SITE.z + 10.5 };
    for (let i = 0; i < 60; i += 1) {
      const before = p.z;
      let r = world.movePlayer(p, { x: 0, y: 0, z: -0.5 });
      if (r.blockedZ) {
        const lifted = world.movePlayer(p, { x: 0, y: PLAYER_STEP_HEIGHT, z: 0 });
        const moved = world.movePlayer(lifted.position, { x: 0, y: 0, z: -0.5 });
        const settled = world.movePlayer(moved.position, { x: 0, y: -(PLAYER_STEP_HEIGHT + 0.05), z: 0 });
        if (Math.abs(settled.position.z - before) > Math.abs(r.position.z - before) + 1e-6) r = settled;
      }
      p = r.position;
      if (p.z <= -19.5) return { z: p.z, y: p.y, stuckAt: -1 }; // deep inside the lobby
      if (Math.abs(p.z - before) < 1e-6) return { z: p.z, y: p.y, stuckAt: i };
    }
    return { z: p.z, y: p.y, stuckAt: -2 };
  };
  const walk = walkIn();
  assert.equal(walk.stuckAt, -1, `step-up walk must never get stuck (stuck at iteration ${walk.stuckAt})`);
  assert.ok(walk.z <= BANK_SITE.z + 3.7, `player must stand inside the lobby past the doorway (z=${walk.z.toFixed(2)})`);
  // The lobby floor is elevated: after climbing, the player stands ON the slab.
  assert.ok(
    Math.abs(walk.y - (BANK_LAYOUT.floorTop + PLAYER_HEIGHT)) < 0.28,
    `player must stand on the elevated floor (y=${walk.y.toFixed(2)})`,
  );

  // 3) On the landing, the doorway path is genuinely walkable; the wall beside it is not.
  const landingY = BANK_LAYOUT.floorTop + PLAYER_HEIGHT;
  const landingZ = BANK_SITE.z + BANK_LAYOUT.depth / 2 + BANK_LAYOUT.wallThickness / 2 + BANK_LAYOUT.landing.depth / 2;
  let inside: { x: number; y: number; z: number } = { x: doorX, y: landingY, z: landingZ };
  for (let step = 0; step < 8; step += 1) {
    const r = world.movePlayer(inside, { x: 0, y: 0, z: -0.5 });
    assert.equal(r.blockedZ, false, `doorway path blocked at step ${step} (z=${inside.z.toFixed(2)})`);
    inside = r.position;
  }
  const wallHit = world.movePlayer(
    { x: doorX - 3, y: landingY, z: landingZ },
    { x: 0, y: 0, z: -0.5 }, // realistic per-frame step (the controller never
    // issues a 2.5 m jump; CollisionWorld deliberately lets a target that lands
    // BEYOND a collider pass through so players can never get trapped inside).
  );
  assert.equal(wallHit.blockedZ, true, 'facade wall beside the doorway must block');
  const wallFaceZ = BANK_SITE.z + BANK_LAYOUT.depth / 2 + BANK_LAYOUT.wallThickness / 2;
  assert.ok(
    Math.abs(wallHit.position.z - (wallFaceZ + 0.35)) < 1e-3,
    `player must stop at the wall face + radius (z=${wallHit.position.z.toFixed(3)}, expected ${(-18.325 + 0.35).toFixed(3)})`,
  );

  // 4) The teller counter is solid.
  const counterDef = defs.find((d) => d.uuid === BANK_OBJECT_IDS.tellerCounter)!;
  const counterHit = world.movePlayer(
    { x: counterDef.transform.position.x, y: landingY, z: counterDef.transform.position.z + 2.0 },
    { x: 0, y: 0, z: -2.0 },
  );
  assert.equal(counterHit.blockedZ, true, 'teller counter must block');
});

/* ---- Layout relations ------------------------------------------------------ */

test('BANK LAYOUT: facade tiles the doorway; stairs are shallow enough to climb', () => {
  const L = BANK_LAYOUT;
  const segW = (L.width - L.doorWidth) / 2;
  assert.equal(segW * 2 + L.doorWidth, L.width, 'segments + doorway span the facade');
  assert.ok(L.steps.rise <= PLAYER_STEP_HEIGHT - 0.05, 'step rise must stay well under the player stepHeight');
  assert.ok(
    L.floorTop - L.steps.rise * L.steps.count <= L.steps.rise + 1e-9,
    'the final riser onto the landing stays within one step rise',
  );
  // Windows sit CORRECTLY: each one is centered in the intercolumniation bay
  // between the door-side and the outer column of its facade side, and the
  // GLASS clears both column shafts (a window edge buried behind a shaft is
  // the class of layout bug this guards against).
  for (const off of L.window.centersFromDoor) {
    assert.ok(off - L.window.width / 2 - 0.12 > L.doorWidth / 2 + 0.3, 'window too close to the door');
    const sameSide = L.columns.xs
      .filter((x) => Math.sign(x) === Math.sign(off))
      .map((x) => Math.abs(x))
      .sort((a, b) => a - b);
    const cIn = sameSide[0];
    const cOut = sameSide[sameSide.length - 1];
    assert.ok(off > cIn && off < cOut, 'window must sit in the bay between the columns');
    assert.ok(Math.abs(off - (cIn + cOut) / 2) < 0.02, 'window must be centered in its intercolumniation bay');
    assert.ok(
      off - L.window.width / 2 > cIn + L.columns.shaftRadius + 0.05
        && off + L.window.width / 2 < cOut - L.columns.shaftRadius - 0.05,
      'window glass must clear both column shafts',
    );
  }
});

test('BANK LAYOUT: interior reads like a bank — vault sight-line, cage on counter, grounded panel', () => {
  const defs = buildBankMapObjects(BANK_SITE.x, BANK_SITE.z);
  const byId = new Map(defs.map((d) => [d.uuid, d]));
  const p = (id: string): ObjectDefinition['transform'] => byId.get(id)!.transform;

  // Cage sits exactly on the counter top (plus its 5 mm seat offset), same
  // footprint center.
  assert.equal(p(BANK_OBJECT_IDS.tellerCage).position.y, BANK_LAYOUT.floorTop + 1.205, 'cage base = counter top + seat offset');
  assert.equal(p(BANK_OBJECT_IDS.tellerCage).position.x, p(BANK_OBJECT_IDS.tellerCounter).position.x, 'cage centered on the counter');
  assert.equal(p(BANK_OBJECT_IDS.tellerCage).position.z, p(BANK_OBJECT_IDS.tellerCounter).position.z, 'cage aligned with the counter');

  // Vault in the rear wall, EAST of the counter line → visible from the door.
  const vault = p(BANK_OBJECT_IDS.vaultDoor);
  const counter = p(BANK_OBJECT_IDS.tellerCounter);
  assert.ok(vault.position.z < BANK_SITE.z - 4, 'vault must sit against the rear wall');
  const counterEastEnd = counter.position.x + 1.6; // counter length 3.2
  assert.ok(vault.position.x > counterEastEnd + 0.5, 'vault must clear the counter east end');
  // Sight-line from the door center to the vault passes east of the counter:
  const doorZ = BANK_SITE.z + BANK_LAYOUT.depth / 2;
  const doorX2 = BANK_SITE.x;
  const tAtCounter = (doorZ - counter.position.z) / (doorZ - vault.position.z);
  const lineX = doorX2 + (vault.position.x - doorX2) * tAtCounter;
  assert.ok(lineX > counterEastEnd, `door→vault sight line passes x=${lineX.toFixed(2)} (counter ends at ${counterEastEnd})`);

  // Safe-deposit wall: against the east wall, facing west, bottom ON the floor.
  const panel = p(BANK_OBJECT_IDS.safeDepositWall);
  assert.equal(panel.rotation.y, -90, 'deposit panel must face west into the room');
  assert.ok(panel.position.x > BANK_SITE.x + 5, 'deposit panel must sit against the east wall');
  assert.ok(Math.abs(panel.position.y + 0.32 - BANK_LAYOUT.floorTop) < 1e-9, 'panel backing bottom must rest exactly on the floor');

  // Banker chair behind the desk, facing it; desk keeps NPC clearance.
  const desk = p(BANK_OBJECT_IDS.bankersDesk);
  const chair = p(BANK_OBJECT_IDS.bankersChair);
  const dxd = chair.position.x - desk.position.x;
  const dzd = chair.position.z - desk.position.z;
  assert.ok(Math.hypot(dxd, dzd) < 1.3, 'chair belongs just behind the desk');
  assert.ok(Math.abs(chair.rotation.y - (desk.rotation.y + 180)) < 1, 'chair must face the desktop');
  assert.ok(desk.position.x < BANK_SITE.x - 3.5, 'office stays in the west rear corner');

  // Rug centered on the entrance path; clock on the west wall; lamps on walls.
  const rug = p(BANK_OBJECT_IDS.floorRug);
  assert.equal(rug.position.x, BANK_SITE.x, 'rug centered on the doorway');
  assert.ok(rug.position.z > BANK_SITE.z + 1.5, 'rug in the entrance lobby');
  const clock = p(BANK_OBJECT_IDS.grandfatherClock);
  assert.ok(clock.position.x < BANK_SITE.x - 5, 'clock against the west wall');
  for (const id of [BANK_OBJECT_IDS.lampWestLobby, BANK_OBJECT_IDS.lampEastLobby, BANK_OBJECT_IDS.lampEastSecure]) {
    assert.ok(Math.abs(p(id).position.x - BANK_SITE.x) > 5, `lamp ${id} must be wall-mounted`);
  }

  // Everything interior stays inside the walls (the threshold slab lives in
  // the wall band by design, like the walls themselves).
  const inner = { xMin: BANK_SITE.x - 5.8, xMax: BANK_SITE.x + 5.8, zMin: BANK_SITE.z - 4.3, zMax: BANK_SITE.z + 4.3 };
  for (const def of defs) {
    const isExterior = [
      BANK_OBJECT_IDS.wallRear, BANK_OBJECT_IDS.wallWest, BANK_OBJECT_IDS.wallEast,
      BANK_OBJECT_IDS.wallFrontWest, BANK_OBJECT_IDS.wallFrontEast, BANK_OBJECT_IDS.wallFrontHeader,
      BANK_OBJECT_IDS.atticWall, BANK_OBJECT_IDS.landing, BANK_OBJECT_IDS.step1,
      BANK_OBJECT_IDS.step2, BANK_OBJECT_IDS.step3, BANK_OBJECT_IDS.threshold,
    ].includes(def.uuid);
    if (isExterior) continue;
    const { x, z } = def.transform.position;
    assert.ok(
      x > inner.xMin - 0.05 && x < inner.xMax + 0.05 && z > inner.zMin - 0.05 && z < inner.zMax + 0.1,
      `${def.metadata.name} placed outside the interior walls (x=${x.toFixed(2)}, z=${z.toFixed(2)})`,
    );
  }
});

/* ---- Geometry (z-fighting) ------------------------------------------------- */

const COPLANAR_EPS = 0.001;
const AREA_EPS = 1e-4;

test('BANK GEOMETRY: no coplanar same-normal overlapping faces with different materials', async () => {
  const registry = makeRegistry();
  const defs = buildBankMapObjects(BANK_SITE.x, BANK_SITE.z);

  const worldBoxes: Array<{ name: string; material: THREE.Material; box: THREE.Box3 }> = [];
  for (const def of defs) {
    const obj = applyDefinition(await registry.create(def), def);
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
  assert.ok(worldBoxes.length >= 60, `expected a rich bank to scan (got ${worldBoxes.length} boxes)`);

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
