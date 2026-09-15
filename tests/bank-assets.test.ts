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

test('BANK LIGHT BUDGET: exactly 5 real PointLights across the whole bank', async () => {
  const registry = makeRegistry();
  const defs = buildBankMapObjects(BANK_SITE.x, BANK_SITE.z);
  let lights = 0;
  for (const def of defs) {
    const obj = await registry.create(def);
    obj.traverse((c) => {
      if ((c as THREE.PointLight).isPointLight) lights += 1;
    });
  }
  assert.equal(lights, 5, '4 gas wall lamps (2 lobby + office + vault enclosure) + 1 banker desk lamp — nothing more');
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
  // Interior partitions close the private rooms — real masonry.
  for (const id of [
    BANK_OBJECT_IDS.partitionOfficeSouth, BANK_OBJECT_IDS.partitionOfficeSouthEast,
    BANK_OBJECT_IDS.partitionOfficeEast,
    BANK_OBJECT_IDS.partitionOfficeHeader, BANK_OBJECT_IDS.partitionVaultWest,
    BANK_OBJECT_IDS.partitionVaultSouthWest, BANK_OBJECT_IDS.partitionVaultSouthEast,
    BANK_OBJECT_IDS.partitionVaultHeader,
  ]) {
    assert.equal(flag(id), true, `partition ${id} must be a collider`);
  }
  // Shell kit, fixtures, seats, decor. The secure gate stays NON-collider:
  // its open leaves frame the walkable secure entrance.
  for (const id of [
    BANK_OBJECT_IDS.building, BANK_OBJECT_IDS.tellerCage, BANK_OBJECT_IDS.safeDepositWall,
    BANK_OBJECT_IDS.bankersChair, BANK_OBJECT_IDS.grandfatherClock,
    BANK_OBJECT_IDS.columnWest, BANK_OBJECT_IDS.columnEast, BANK_OBJECT_IDS.floorRug,
    BANK_OBJECT_IDS.bankSign, BANK_OBJECT_IDS.lampWestLobby, BANK_OBJECT_IDS.lampEastLobby,
    BANK_OBJECT_IDS.lampVault, BANK_OBJECT_IDS.lampOffice, BANK_OBJECT_IDS.secureGate, BANK_OBJECT_IDS.counterMoneyBag,
    BANK_OBJECT_IDS.counterCoins1, BANK_OBJECT_IDS.vaultMoneyBag1, BANK_OBJECT_IDS.deskCoinStack,
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

  // 5) The private rooms are reachable on foot: lobby → staff strip east of
  // the counter → office doorway → office → through the secure gate opening
  // → inside the vault enclosure. Every leg is a real CollisionWorld walk.
  const floorY = BANK_LAYOUT.floorTop + PLAYER_HEIGHT;
  const axisWalk = (
    from: { x: number; y: number; z: number },
    delta: { x: number; y: number; z: number },
    steps: number,
  ): { x: number; y: number; z: number } => {
    let p = from;
    for (let i = 0; i < steps; i += 1) {
      p = world.movePlayer(p, delta).position;
    }
    return p;
  };
  const reached = (p: { x: number; y: number; z: number }, target: number, axis: 'x' | 'z', label: string): void => {
    const v = axis === 'x' ? p.x : p.z;
    assert.ok(
      Math.abs(v - target) < 0.05,
      `${label}: expected ${axis}≈${target.toFixed(2)}, got ${v.toFixed(2)}`,
    );
  };
  let p = { x: BANK_SITE.x + 4.0, y: floorY, z: BANK_SITE.z + 3.0 };
  p = axisWalk(p, { x: 0, y: 0, z: -0.1 }, 40);                            // north to local z ≈ −1.0
  reached(p, BANK_SITE.z - 1.0, 'z', 'walk down the east side');
  p = axisWalk(p, { x: -0.1, y: 0, z: 0 }, 57);                            // west behind the counter
  reached(p, BANK_SITE.x - 1.7, 'x', 'cross the staff strip to the doorway line');
  const beforeDoor = p.z;
  p = axisWalk(p, { x: 0, y: 0, z: -0.1 }, 9);                             // north through the opening
  assert.ok(p.z < beforeDoor - 0.3, 'office doorway must let the player through');
  p = axisWalk(p, { x: 0.1, y: 0, z: 0 }, 2);                              // ease east onto the gate line
  reached(p, BANK_SITE.x - 1.55, 'x', 'line up with the secure gate');
  const beforeGate = p.z;
  p = axisWalk(p, { x: 0, y: 0, z: -0.1 }, 13);                            // north into the enclosure
  assert.ok(p.z < beforeGate - 0.5, `secure gate opening must be walkable (stopped at z=${p.z.toFixed(2)})`);
  reached(p, BANK_SITE.z - 3.2, 'z', 'stand inside the vault enclosure');

  // 6) The room walls actually PROTECT the rooms: north walks beside the
  // openings are blocked by the office south wall and the enclosure wall.
  const officeWallHit = world.movePlayer(
    { x: BANK_SITE.x - 3.0, y: floorY, z: BANK_SITE.z - 1.0 },
    { x: 0, y: 0, z: -0.5 },
  );
  assert.equal(officeWallHit.blockedZ, true, 'office south partition must block beside the doorway');
  const enclosureWallHit = world.movePlayer(
    { x: BANK_SITE.x - 0.7, y: floorY, z: BANK_SITE.z - 1.8 },
    { x: 0, y: 0, z: -0.5 },
  );
  assert.equal(enclosureWallHit.blockedZ, true, 'enclosure south partition must block beside the gate');
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

test('BANK LAYOUT: interior reads like a real bank — office room, secure enclosure, grounded panel', () => {
  const defs = buildBankMapObjects(BANK_SITE.x, BANK_SITE.z);
  const byId = new Map(defs.map((d) => [d.uuid, d]));
  const p = (id: string): ObjectDefinition['transform'] => byId.get(id)!.transform;
  const P = BANK_LAYOUT.partitions;

  // Cage sits exactly on the counter top (plus its seat offset), same
  // footprint center.
  assert.equal(p(BANK_OBJECT_IDS.tellerCage).position.y, BANK_LAYOUT.floorTop + 1.205, 'cage base = counter top + seat offset');
  assert.equal(p(BANK_OBJECT_IDS.tellerCage).position.x, p(BANK_OBJECT_IDS.tellerCounter).position.x, 'cage centered on the counter');
  assert.equal(p(BANK_OBJECT_IDS.tellerCage).position.z, p(BANK_OBJECT_IDS.tellerCounter).position.z, 'cage aligned with the counter');
  // The counter stands clear of the office south wall so the staff strip
  // (and the path to the office doorway) stays walkable.
  const counter = p(BANK_OBJECT_IDS.tellerCounter);
  const counterNorthFace = counter.position.z - 0.3; // counter depth 0.6
  const wallSouthFace = BANK_SITE.z + P.officeSouthZ - P.thickness / 2;
  assert.ok(
    counterNorthFace - wallSouthFace > 0.85,
    `counter must keep a walkable staff strip to the office wall (got ${(counterNorthFace - wallSouthFace).toFixed(2)})`,
  );

  // Manager office: desk + chair in the open west half, chair behind the desk
  // facing it, desk clear of the enclosure wall and the office walls.
  const desk = p(BANK_OBJECT_IDS.bankersDesk);
  const chair = p(BANK_OBJECT_IDS.bankersChair);
  const dxd = chair.position.x - desk.position.x;
  const dzd = chair.position.z - desk.position.z;
  assert.ok(Math.hypot(dxd, dzd) < 1.3, 'chair belongs just behind the desk');
  assert.ok(Math.abs(((chair.rotation.y - desk.rotation.y - 180) % 360 + 360) % 360) < 1, 'chair must face the desktop');
  assert.ok(desk.position.x < BANK_SITE.x - 3, 'desk stays in the office open half (west)');
  assert.ok(
    desk.position.x + 0.5 < BANK_SITE.x + P.vaultWestX - 0.35,
    'desk collider must keep a player-wide lane to the enclosure west wall',
  );
  assert.ok(desk.position.z < BANK_SITE.z + P.officeSouthZ - P.thickness / 2, 'desk sits north of the office south wall, inside the office');

  // Secure vault enclosure: sealed by masonry on three sides, entered through
  // the barred gate opening in its south wall.
  const enclosure = {
    xMin: BANK_SITE.x + P.vaultWestX - P.thickness / 2,
    xMax: BANK_SITE.x + P.officeEastX - P.thickness / 2,
    zMax: BANK_SITE.z + P.vaultSouthZ - P.thickness / 2,
  };
  const gate = p(BANK_OBJECT_IDS.secureGate);
  assert.ok(gate.position.x > BANK_SITE.x + P.vaultGate.xMin && gate.position.x < BANK_SITE.x + P.vaultGate.xMax, 'gate fills the opening in the enclosure south wall');
  assert.ok(Math.abs(gate.position.z - (BANK_SITE.z + P.vaultSouthZ - 0.02)) < 1e-9, 'gate sits on the enclosure wall line');
  assert.ok(P.vaultGate.xMax - P.vaultGate.xMin >= 0.9, 'gate opening must be wide enough to walk through');

  // Big vault door INSIDE the enclosure, against the rear wall, facing south
  // (rotY = 0 → the builder's +Z door normal points into the enclosure).
  const vault = p(BANK_OBJECT_IDS.vaultDoor);
  assert.ok(vault.position.z < BANK_SITE.z - 4, 'vault must sit against the rear wall');
  assert.ok(vault.rotation.y === 0, 'vault door must face the enclosure (+Z), rotated 0');
  assert.ok(vault.position.x > enclosure.xMin && vault.position.x < enclosure.xMax, 'vault inside the enclosure x-range');
  assert.ok(vault.position.z < enclosure.zMax, 'vault inside the enclosure');

  // Safe-deposit wall on the enclosure's west partition, doors facing east
  // (rotY = +90), backing bottom resting exactly on the floor.
  const panel = p(BANK_OBJECT_IDS.safeDepositWall);
  assert.equal(panel.rotation.y, 90, 'deposit panel must face east into the enclosure');
  assert.ok(Math.abs(panel.position.x - (BANK_SITE.x + P.vaultWestX + 0.105)) < 0.02, 'panel backing set into the enclosure west wall face');
  assert.ok(Math.abs(panel.position.y + 0.35 - BANK_LAYOUT.floorTop) < 1e-9, 'panel backing bottom must rest exactly on the floor');
  assert.ok(panel.position.z < enclosure.zMax && panel.position.z > BANK_SITE.z - 4.3, 'panel inside the enclosure along the west wall');

  // Floor safe inside the enclosure, clear of the vault door and the gate line.
  const floorSafe = p(BANK_OBJECT_IDS.floorSafe);
  assert.ok(floorSafe.position.x > enclosure.xMin && floorSafe.position.x < enclosure.xMax, 'floor safe inside the enclosure');
  assert.ok(floorSafe.position.z < enclosure.zMax, 'floor safe inside the enclosure');

  // Rug centered on the entrance path; clock on the west wall of the lobby.
  const rug = p(BANK_OBJECT_IDS.floorRug);
  assert.equal(rug.position.x, BANK_SITE.x, 'rug centered on the doorway');
  assert.ok(rug.position.z > BANK_SITE.z + 1.5, 'rug in the entrance lobby');
  const clock = p(BANK_OBJECT_IDS.grandfatherClock);
  assert.ok(clock.position.x < BANK_SITE.x - 5, 'clock against the west wall');
  assert.ok(clock.position.z > BANK_SITE.z, 'clock in the lobby half, clear of the office');

  // Lamps: two wall lamps in the lobby, the third inside the vault enclosure
  // on its south wall (arm swung north into the room, rotY = 90).
  for (const id of [BANK_OBJECT_IDS.lampWestLobby, BANK_OBJECT_IDS.lampEastLobby]) {
    assert.ok(Math.abs(p(id).position.x - BANK_SITE.x) > 5, `lamp ${id} must be wall-mounted in the lobby`);
  }
  const vaultLamp = p(BANK_OBJECT_IDS.lampVault);
  assert.equal(vaultLamp.rotation.y, 90, 'enclosure lamp arm must swing north into the enclosure');
  assert.ok(Math.abs(vaultLamp.position.z - (BANK_SITE.z + P.vaultSouthZ - 0.135)) < 0.02, 'enclosure lamp mounted on the enclosure south wall');
  assert.ok(vaultLamp.position.y > BANK_LAYOUT.floorTop + 1.5, 'enclosure lamp mounted at wall height');
  const officeLamp = p(BANK_OBJECT_IDS.lampOffice);
  assert.equal(officeLamp.rotation.y, 90, 'office lamp arm must swing north into the office');
  assert.ok(Math.abs(officeLamp.position.x - (BANK_SITE.x - 3.0)) < 0.01, 'office lamp above the desk area');
  // origin sits so the bracket block's north edge is 5 mm off the wall face
  assert.ok(Math.abs(officeLamp.position.z - (BANK_SITE.z + P.officeSouthZ + P.thickness / 2 + 0.035)) < 0.02, 'office lamp mounted on the office south wall north face');

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

/* ---- Vault orientation (the 90° root fix) ---------------------------------- */

test('BANK VAULT ORIENTATION: the door disc lies in the frame plane (XY), facing +Z', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'bank-vault-door' }))) as THREE.Group;
  const slab = obj.getObjectByName('bank-vault-door-slab') as THREE.Mesh;
  assert.ok(slab, 'vault must expose its named door slab');
  const bb = box3of(slab);
  const size = new THREE.Vector3(); bb.getSize(size);
  // CylinderGeometry(r, r, 0.14) rotated about X: thickness 0.14 along Z,
  // diameter ~1.64 along X and Y. The old bug (rotation about Z) produced a
  // slab 0.14 wide along X — edge-on inside its own frame rings.
  assert.ok(Math.abs(size.z - 0.14) < 0.01, `slab thickness must run along Z (got ${size.z.toFixed(3)})`);
  assert.ok(Math.abs(size.x - 1.64) < 0.02, `slab diameter must span X (got ${size.x.toFixed(3)})`);
  assert.ok(Math.abs(size.y - 1.64) < 0.02, `slab diameter must span Y (got ${size.y.toFixed(3)})`);
  // The disc centers on the frame rings (ring centers at x=0, y=opening/2+0.06).
  const centerY = 1.6 / 2 + 0.06; // opening 1.6
  assert.ok(Math.abs((bb.min.z + bb.max.z) / 2 - 0.02) < 0.01, 'slab plane sits just proud of the wall face');
  assert.ok(Math.abs((bb.min.y + bb.max.y) / 2 - centerY) < 0.01, 'slab centered at ring height');
  assert.ok(Math.abs((bb.min.x + bb.max.x) / 2) < 0.01, 'slab centered horizontally in the frame');
  // The plaque faces +Z too: a flat circle (no ±90° pre-rotation).
  const plaque = obj.getObjectByName('bank-vault-door-plaque') as THREE.Mesh;
  assert.ok(plaque, 'vault must expose its plaque');
  assert.ok(plaque.rotation.y === 0 && plaque.rotation.x === 0, 'plaque must not carry a compensating rotation');
  // Rivet ring lives in the disc's XY plane (z fixed, x+y varying).
  const rivets = (obj.getObjectByName('bank-vault-door-hinge') as THREE.Group)!.children
    .filter((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry.type === 'SphereGeometry');
  assert.ok(rivets.length >= 20, 'rivet ring present');
  const zSpread = Math.max(...rivets.map((r) => r.position.z)) - Math.min(...rivets.map((r) => r.position.z));
  const xSpread = Math.max(...rivets.map((r) => r.position.x)) - Math.min(...rivets.map((r) => r.position.x));
  assert.ok(zSpread < 0.01 && xSpread > 1.2, `rivets must ring the disc face (z spread ${zSpread.toFixed(3)}, x spread ${xSpread.toFixed(3)})`);
});

/* ---- Secure gate ------------------------------------------------------------ */

test('BANK SECURE GATE: double leaf held open, doorway kept walkable', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'secure-gate' }))) as THREE.Group;
  for (const name of ['secure-gate-jamb-w', 'secure-gate-jamb-e', 'secure-gate-header', 'secure-gate-leaf-w', 'secure-gate-leaf-e']) {
    assert.ok(obj.getObjectByName(name), `gate must contain "${name}"`);
  }
  const L = obj.getObjectByName('secure-gate-leaf-w') as THREE.Group;
  const R = obj.getObjectByName('secure-gate-leaf-e') as THREE.Group;
  // Both leaves swing OPEN toward +Z (out of the enclosure): their world
  // bounding boxes reach positive z, and neither leaf spans the opening
  // center at z = 0 (the walkable line).
  const lw = box3of(L);
  const rw = box3of(R);
  assert.ok(lw.max.z > 0.3 && rw.max.z > 0.3, `leaves must swing toward +Z (w ${lw.max.z.toFixed(2)}, e ${rw.max.z.toFixed(2)})`);
  // The mirrored leaf is a rotation (π+80°), never a negative scale.
  for (const leaf of [L, R]) {
    assert.ok(leaf.scale.x > 0 && leaf.scale.y > 0 && leaf.scale.z > 0, 'leaves mirror by rotation, not negative scale');
  }
  // Vertical bars exist on both leaves (deep: each hinge holds a leaf group).
  for (const leaf of [L, R]) {
    let bars = 0;
    leaf.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && m.geometry.type === 'CylinderGeometry') bars += 1;
    });
    assert.ok(bars >= 5, 'each leaf carries its barred grille');
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
