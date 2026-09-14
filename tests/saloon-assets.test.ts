/**
 * Saloon asset tests.
 *
 * Locks the contracts the saloon module promises to the rest of the game:
 *
 *  1. REGISTRATION — every saloon assetType is registered exactly once and
 *     the registry refuses duplicates.
 *  2. CREATION — the registry can materialise every saloon type, and the
 *     produced object mirrors uuid + name.
 *  3. TRANSFORM OWNERSHIP — factories NEVER apply the registry transform;
 *     the returned root carries the default transform (adapter applies it).
 *  4. SHELL — saloon-building contains its main parts (floor, roof, false
 *     front, sign, porch, corner posts, windows) and is created without
 *     throwing.
 *  5. SWINGING DOORS — two INDEPENDENT, named hinge groups (future
 *     interaction hooks), one leaf each.
 *  6. LIGHT BUDGET — the chandelier adds at most ONE real PointLight.
 *  7. COLLISION — walls carry colliders, decor does not, and the doorway
 *     path is genuinely walkable while the wall next to it blocks.
 *  8. GEOMETRY — no two axis-aligned boxes with different materials expose
 *     coplanar same-normal overlapping faces anywhere in the saloon
 *     (the z-fighting class of bug).
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  AssetRegistry,
  CollisionWorld,
  registerSaloonFactories,
  SALOON_ASSET_TYPES,
  SALOON_LAYOUT,
  SALOON_OBJECT_IDS,
  SALOON_SITE,
  buildSaloonMapObjects,
  frontWallSegments,
} from '../src/index.js';
import type { ObjectDefinition } from '../src/index.js';

function makeRegistry(): AssetRegistry {
  const registry = new AssetRegistry();
  registerSaloonFactories(registry);
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
  uuid: '20000000-0000-4000-a000-0000000000aa',
  assetType: 'saloon-building',
  transform: {
    position: { x: 4, y: 0.5, z: -7 },
    rotation: { x: 10, y: 20, z: 30 },
    scale: { x: 2, y: 3, z: 4 },
  },
  metadata: { name: 'Test Building' },
  ...base,
});

/* -------------------------------------------------------------------------- */

test('SALOON REGISTRATION: every type registers; duplicates throw', () => {
  const registry = makeRegistry();
  for (const type of SALOON_ASSET_TYPES) {
    assert.ok(registry.has(type), `assetType "${type}" must be registered`);
  }
  assert.throws(
    () => registerSaloonFactories(registry),
    /already registered/,
    'double registration must be rejected by the registry',
  );
});

test('SALOON REGISTRATION: the registry can create every saloon type', async () => {
  const registry = makeRegistry();
  const defs = buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z);

  // The layout must only use registered types — otherwise boot would throw.
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

test('SALOON LAYOUT: unique v4 uuids', () => {
  const defs = buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z);
  const uuids = new Set<string>();
  for (const def of defs) {
    assert.match(def.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, `uuid ${def.uuid} must be v4-shaped`);
    assert.ok(!uuids.has(def.uuid), `duplicate uuid ${def.uuid}`);
    uuids.add(def.uuid);
  }
});

test('SALOON FACTORIES: transform is NOT applied by the factory', async () => {
  const registry = makeRegistry();
  const obj = await registry.create(movedDef({}));
  assert.deepEqual(obj.position.toArray(), [0, 0, 0], 'factory must leave position untouched');
  assert.deepEqual(obj.rotation.toArray().slice(0, 3), [0, 0, 0], 'factory must leave rotation untouched');
  assert.deepEqual(obj.scale.toArray(), [1, 1, 1], 'factory must leave scale untouched');
});

test('SALOON BUILDING: shell builds and contains its main parts', async () => {
  const registry = makeRegistry();
  const def = movedDef({ assetType: 'saloon-building' });
  const obj = await registry.create(def);
  const group = obj as THREE.Group;

  const required = [
    'saloon-floor',
    'saloon-roof',
    'saloon-false-front',
    'saloon-sign-board',
    'saloon-sign-band',
    'saloon-porch-deck',
    'saloon-porch-roof',
  ];
  for (const name of required) {
    assert.ok(group.getObjectByName(name), `shell must contain "${name}"`);
  }
  assert.ok(group.getObjectByName('saloon-sign-letter-0'), 'sign must carry letter blocks');
  assert.ok(group.getObjectByName('saloon-sign-letter-5'), 'sign must spell 6 letter blocks');
  const cornerPosts = group.children.filter((c) => c.name.startsWith('saloon-corner-post'));
  assert.equal(cornerPosts.length, 4, 'shell must have 4 corner posts');
  const glassPanes = group.children.filter((c) => c.name.startsWith('saloon-window-glass'));
  assert.equal(glassPanes.length, 4, 'facade must have 4 visible window panes (2 per side)');
  const frameTops = group.children.filter((c) => c.name.startsWith('saloon-window-frame-top'));
  assert.equal(frameTops.length, 4, 'every pane must carry a real frame');
});

test('SALOON BUILDING: shell owns NO walls (walls are separate collider objects)', async () => {
  const registry = makeRegistry();
  const obj = await registry.create(movedDef({ assetType: 'saloon-building' }));
  const wallish = obj.children.filter((c) => /wall/i.test(c.name));
  assert.equal(wallish.length, 0, 'shell must not bundle wall geometry');
});

test('SALOON SWINGING DOORS: two independent named hinges, one leaf each', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'saloon-swinging-doors' }))) as THREE.Group;

  const left = obj.getObjectByName('swinging-door-left-hinge');
  const right = obj.getObjectByName('swinging-door-right-hinge');
  assert.ok(left, 'left hinge group must exist');
  assert.ok(right, 'right hinge group must exist');
  assert.notEqual(left, right);
  // Each hinge carries exactly one leaf, and each leaf hangs INSIDE the
  // doorway gap (|x| ≤ 0.78 at the object origin): an outward offset would
  // bury the leaves in the wall solids — the bug a browser run caught.
  for (const hinge of [left!, right!]) {
    const leaves = hinge.children.filter((c) => c.name.startsWith('door-leaf'));
    assert.equal(leaves.length, 1, 'each hinge carries exactly one leaf');
    const leafBox = new THREE.Box3().setFromObject(leaves[0]);
    assert.ok(
      leafBox.max.x <= 0.8 && leafBox.min.x >= -0.8,
      `leaf must sit inside the doorway gap (got x [${leafBox.min.x.toFixed(3)}, ${leafBox.max.x.toFixed(3)}])`,
    );
    assert.ok(leafBox.max.y <= 1.2, 'leaf must stay a half-door (top ≤ 1.2m)');
  }
});

test('SALOON CHANDELIER: real-light budget is at most one PointLight', async () => {
  const registry = makeRegistry();

  const lit = (await registry.create(movedDef({
    assetType: 'saloon-chandelier',
    metadata: { name: 'lit', lights: 1 },
  }))) as THREE.Group;
  const litLights = lit.children.filter((c) => (c as THREE.PointLight).isPointLight);
  assert.equal(litLights.length, 1, 'lit chandelier carries exactly one PointLight');

  const dark = (await registry.create(movedDef({
    assetType: 'saloon-chandelier',
    metadata: { name: 'dark', lights: 0 },
  }))) as THREE.Group;
  const darkLights = dark.children.filter((c) => (c as THREE.PointLight).isPointLight);
  assert.equal(darkLights.length, 0, 'lights:0 chandelier must be mesh-only');
});

test('SALOON POKER TABLE: full prop fidelity — nothing simplified to a plain table', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'saloon-poker-table' }))) as THREE.Group;

  // Structure: pedestal tiers, turned column with collars + capital.
  for (const name of [
    'poker-pedestal-lower', 'poker-pedestal-upper', 'poker-column',
    'poker-collar-low', 'poker-collar-high', 'poker-capital',
    'poker-tabletop', 'poker-baize', 'poker-armrest',
  ]) {
    assert.ok(obj.getObjectByName(name), `poker table must contain "${name}"`);
  }
  // 24 brass studs around the rim.
  for (const name of ['poker-stud-0', 'poker-stud-11', 'poker-stud-23']) {
    assert.ok(obj.getObjectByName(name), `armrest must carry stud "${name}"`);
  }
  // 5 fanned cards + deck + dealer button.
  for (const name of ['poker-card-0', 'poker-card-4', 'poker-deck', 'poker-dealer-button']) {
    assert.ok(obj.getObjectByName(name), `table must carry "${name}"`);
  }
  // 3 chip stacks of 8/6/10 chips = 24 chips.
  for (const name of ['poker-chip-0-0', 'poker-chip-0-7', 'poker-chip-1-5', 'poker-chip-2-9']) {
    assert.ok(obj.getObjectByName(name), `chip stacks must include "${name}"`);
  }
  // Whiskey glass + liquid + ashtray; and NO real lights on the table.
  for (const name of ['poker-whiskey-glass', 'poker-whiskey', 'poker-ashtray']) {
    assert.ok(obj.getObjectByName(name), `table must carry "${name}"`);
  }
  const lights: THREE.Object3D[] = [];
  obj.traverse((c) => { if ((c as THREE.PointLight).isPointLight) lights.push(c); });
  assert.equal(lights.length, 0, 'poker table must not add lights');
});

test('SALOON PIANO: full furniture fidelity — cabinet, pilasters, silk, lattice, keyboard, lyre', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'saloon-piano' }))) as THREE.Group;

  // Multi-layer cabinet + lid + pilasters.
  for (const name of [
    'piano-bottom-board', 'piano-cabinet', 'piano-top-band', 'piano-lid',
    'piano-pilaster-l', 'piano-pilaster-r',
  ]) {
    assert.ok(obj.getObjectByName(name), `piano must contain "${name}"`);
  }
  // Silk panel + 9 lattice slats over it.
  assert.ok(obj.getObjectByName('piano-silk-panel'), 'piano must have the silk panel');
  for (const name of ['piano-lattice-0', 'piano-lattice-4', 'piano-lattice-8']) {
    assert.ok(obj.getObjectByName(name), `lattice must include "${name}"`);
  }
  // Fallboard, keybed, 21 white keys, black keys in octave pattern (< 20 → 15).
  for (const name of ['piano-fallboard', 'piano-keybed']) {
    assert.ok(obj.getObjectByName(name), `piano must contain "${name}"`);
  }
  const whiteKeys = obj.children.filter((c) => c.name.startsWith('piano-key-white-'));
  assert.equal(whiteKeys.length, 21, 'keyboard must have 21 individual white keys');
  const blackKeys = obj.children.filter((c) => c.name.startsWith('piano-key-black-'));
  assert.equal(blackKeys.length, 15, 'black keys must follow the octave pattern (15 keys)');
  // Music desk + paper, pedal lyre (2 legs + 3 pedals), sconces with flames.
  for (const name of [
    'piano-music-desk', 'piano-music-paper',
    'piano-lyre-leg-l', 'piano-lyre-leg-r', 'piano-pedal-0', 'piano-pedal-2',
    'piano-sconce-l', 'piano-flame-r',
  ]) {
    assert.ok(obj.getObjectByName(name), `piano must contain "${name}"`);
  }
  const lights: THREE.Object3D[] = [];
  obj.traverse((c) => { if ((c as THREE.PointLight).isPointLight) lights.push(c); });
  assert.equal(lights.length, 0, 'piano flames must be emissive mesh, not real lights');
});

test('SALOON PIANO STOOL: registered, creatable, placed in front of the keyboard, non-collider', async () => {
  assert.ok(
    (SALOON_ASSET_TYPES as readonly string[]).includes('saloon-piano-stool'),
    'saloon-piano-stool must be a registered asset type',
  );
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'saloon-piano-stool' }))) as THREE.Group;
  for (const name of ['pianostool-seat', 'pianostool-pole', 'pianostool-foot']) {
    assert.ok(obj.getObjectByName(name), `piano stool must contain "${name}"`);
  }

  // Layout: exactly one stool, standing EAST of the piano (the keybed side).
  const defs = buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z);
  const stools = defs.filter((d) => d.assetType === 'saloon-piano-stool');
  assert.equal(stools.length, 1, 'layout must place exactly one piano stool');
  assert.equal(stools[0]!.uuid, SALOON_OBJECT_IDS.pianoStool, 'stool uuid must come from the saloon block');
  assert.equal(stools[0]!.metadata.collider, false, 'stool is a seat, not a collider');
  const piano = defs.find((d) => d.assetType === 'saloon-piano')!;
  assert.ok(
    stools[0]!.transform.position.x > piano.transform.position.x,
    'stool must sit in front of the keyboard (east of the west-wall piano)',
  );
  assert.ok(
    Math.abs(stools[0]!.transform.position.z - piano.transform.position.z) < 0.3,
    'stool must be aligned with the keyboard',
  );
});

/* ---- Collision ----------------------------------------------------------- */

test('SALOON COLLISION: walls carry colliders, decor does not', () => {
  const defs = buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z);
  const byId = new Map(defs.map((d) => [d.uuid, d]));

  const wallIds = [
    SALOON_OBJECT_IDS.wallRear, SALOON_OBJECT_IDS.wallWest, SALOON_OBJECT_IDS.wallEast,
    SALOON_OBJECT_IDS.wallFrontWest, SALOON_OBJECT_IDS.wallFrontEast, SALOON_OBJECT_IDS.wallFrontHeader,
  ];
  for (const id of wallIds) {
    assert.equal(byId.get(id)?.metadata.collider, true, `wall ${id} must be a collider`);
  }

  const decorIds = [
    SALOON_OBJECT_IDS.building, SALOON_OBJECT_IDS.swingingDoors,
    SALOON_OBJECT_IDS.stool1, SALOON_OBJECT_IDS.stool4,
    SALOON_OBJECT_IDS.chair1, SALOON_OBJECT_IDS.chair4,
    SALOON_OBJECT_IDS.pianoStool,
    SALOON_OBJECT_IDS.chandelierWest, SALOON_OBJECT_IDS.chandelierEast,
    SALOON_OBJECT_IDS.spittoon1, SALOON_OBJECT_IDS.spittoon2,
    SALOON_OBJECT_IDS.wantedPoster,
  ];
  for (const id of decorIds) {
    assert.equal(byId.get(id)?.metadata.collider, false, `decor ${id} must NOT be a collider`);
  }

  // Solid furniture stays solid.
  for (const id of [
    SALOON_OBJECT_IDS.barCounter, SALOON_OBJECT_IDS.backBar, SALOON_OBJECT_IDS.pokerTable,
    SALOON_OBJECT_IDS.piano, SALOON_OBJECT_IDS.barrel1, SALOON_OBJECT_IDS.barrel3,
  ]) {
    assert.equal(byId.get(id)?.metadata.collider, true, `furniture ${id} must be a collider`);
  }
});

test('SALOON COLLISION: the doorway is genuinely walkable, the wall beside it is not', () => {
  const defs = buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z);
  const world = new CollisionWorld(defs);

  // Walk straight in through the door center (x = −12): from the porch into
  // the interior, NEVER blocked.
  let pos: { x: number; y: number; z: number } = { x: SALOON_SITE.x, y: 1.7, z: -5.5 };
  for (let step = 0; step < 14; step += 1) {
    const result = world.movePlayer(pos, { x: 0, y: 0, z: -0.5 });
    assert.equal(result.blockedZ, false, `doorway path blocked at step ${step} (z=${pos.z.toFixed(2)})`);
    pos = result.position;
  }
  assert.ok(pos.z <= -12, `player must stand inside the saloon (got z=${pos.z.toFixed(2)})`);

  // The SAME approach one wall-width to the west hits solid wall (the move
  // target lands WELL inside the wall band, not exactly on its boundary).
  const wallHit = world.movePlayer({ x: SALOON_SITE.x - 3, y: 1.7, z: -5.5 }, { x: 0, y: 0, z: -2.5 });
  assert.equal(wallHit.blockedZ, true, 'front wall beside the doorway must block');

  // Interior is roomy: from the door to the bar counter must be walkable.
  let inside: { x: number; y: number; z: number } = { x: SALOON_SITE.x, y: 1.7, z: -9 };
  for (let step = 0; step < 8; step += 1) {
    const result = world.movePlayer(inside, { x: 0, y: 0, z: -0.5 });
    assert.equal(result.blockedZ, false, `interior path blocked at z=${inside.z.toFixed(2)}`);
    inside = result.position;
  }
});

test('SALOON LAYOUT: wall segments tile the facade exactly around the doorway', () => {
  const segs = frontWallSegments();
  const total = segs.reduce((sum, s) => sum + s.width, 0) + SALOON_LAYOUT.doorWidth;
  assert.equal(total, SALOON_LAYOUT.width, 'segments + doorway must span the full facade');
  for (const seg of segs) {
    const inner = Math.abs(seg.cx) - seg.width / 2;
    assert.ok(
      Math.abs(inner - SALOON_LAYOUT.doorWidth / 2) < 1e-9,
      'each segment must start exactly at the doorway edge',
    );
  }
  // Windows sit inside the wall segments, clear of the door.
  for (const off of SALOON_LAYOUT.window.centersFromDoor) {
    assert.ok(off > SALOON_LAYOUT.doorWidth / 2 + 0.3, 'window too close to the door');
    assert.ok(off < SALOON_LAYOUT.width / 2 - 0.3, 'window exceeds the facade');
  }
});

/* ---- Geometry (z-fighting) ------------------------------------------------ */

const COPLANAR_EPS = 0.001;
const AREA_EPS = 1e-4;

test('SALOON GEOMETRY: no coplanar same-normal overlapping faces with different materials', async () => {
  const registry = makeRegistry();
  const defs = buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z);

  const worldBoxes: Array<{ name: string; material: THREE.Material; box: THREE.Box3 }> = [];
  for (const def of defs) {
    const obj = applyDefinition(await registry.create(def), def);
    obj.updateWorldMatrix(true, true);
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
      if ((mesh.geometry as THREE.BufferGeometry).type !== 'BoxGeometry') return;
      // Rotated boxes (yaw) break the axis-aligned guarantee of this scan.
      const q = mesh.getWorldQuaternion(new THREE.Quaternion());
      if (q.angleTo(new THREE.Quaternion()) > 1e-6) return;
      worldBoxes.push({
        name: `${def.metadata.name} / ${mesh.name}`,
        material: mesh.material as THREE.Material,
        box: new THREE.Box3().setFromObject(mesh),
      });
    });
  }
  assert.ok(worldBoxes.length >= 40, `expected a rich saloon to scan (got ${worldBoxes.length} boxes)`);

  const axes = ['x', 'y', 'z'] as const;
  const others = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] } as const;
  const fights: string[] = [];

  for (let i = 0; i < worldBoxes.length; i += 1) {
    for (let j = i + 1; j < worldBoxes.length; j += 1) {
      const a = worldBoxes[i];
      const b = worldBoxes[j];
      if (a.material === b.material) continue; // same instance → same surface, no flicker
      for (const axis of axes) {
        const [m1, m2] = others[axis];
        const overlapsOn = (m: 'x' | 'y' | 'z'): boolean =>
          Math.min(a.box.max[m], b.box.max[m]) - Math.max(a.box.min[m], b.box.min[m]) > AREA_EPS;
        if (!overlapsOn(m1) || !overlapsOn(m2)) continue;
        // Same-normal faces only (max-vs-max / min-vs-min). max-vs-min is
        // back-to-back contact and can never both face the viewer.
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
