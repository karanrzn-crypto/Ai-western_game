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
 *  9. BACK BAR LAYERING — open-shelf construction: the mirror sits BEHIND
 *     every bottle, every glass sits IN FRONT of every bottle, and the old
 *     solid full-depth frame (which buried the glassware inside its own
 *     volume) is gone.
 * 10. BOTTLE/Glass SILHOUETTES — bottles carry base/body/shoulder/neck/lip/
 *     cork in stair-step order; wine glasses carry bowl/stem/foot with the
 *     liquid INSIDE the bowl and BELOW the rim; decanter liquid below the
 *     shoulder; the whole saloon keeps a 2-PointLight budget.
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
  setSaloonDoorsOpen,
  frontWallSegments,
  buildSaloonBottle,
  buildDecanter,
  buildCarafe,
  buildTumbler,
  buildWineGlass,
  buildShotGlass,
  buildInvertedTumbler,
  createSaloonMaterials,
} from '../src/index.js';
import type { ObjectDefinition } from '../src/index.js';

/** World-box helper for builder-local geometry assertions. */
function box3of(o: THREE.Object3D): THREE.Box3 {
  o.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(o);
}

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

  // The shell is the STRUCTURAL kit only — the sign and the windows are
  // independent managed objects now (selectable/movable on their own).
  const required = [
    'saloon-floor',
    'saloon-roof',
    'saloon-false-front',
    'saloon-porch-deck',
    'saloon-porch-roof',
  ];
  for (const name of required) {
    assert.ok(group.getObjectByName(name), `shell must contain "${name}"`);
  }
  const cornerPosts = group.children.filter((c) => c.name.startsWith('saloon-corner-post'));
  assert.equal(cornerPosts.length, 4, 'shell must have 4 corner posts');
  for (const name of ['saloon-sign-board', 'saloon-sign-band', 'saloon-window-glass']) {
    assert.equal(group.getObjectByName(name), undefined, `shell must NOT bundle "${name}" (independent object now)`);
  }
});

test('SALOON SIGN: independent assembly with board, band and 6 letters', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'saloon-sign' }))) as THREE.Group;
  for (const name of ['saloon-sign-board', 'saloon-sign-band']) {
    assert.ok(obj.getObjectByName(name), `sign must contain "${name}"`);
  }
  assert.ok(obj.getObjectByName('saloon-sign-letter-0'), 'sign must carry letter blocks');
  assert.ok(obj.getObjectByName('saloon-sign-letter-5'), 'sign must spell 6 letter blocks');
  // The board's back must reach INTO the false front (buried junction) and
  // the front stand proud — the sign def origin sits at (0, signY, 0).
  const board = obj.getObjectByName('saloon-sign-board')!;
  const bb = new THREE.Box3().setFromObject(board);
  const wallFace = SALOON_LAYOUT.depth / 2 + SALOON_LAYOUT.wallThickness / 2;
  assert.ok(bb.min.z < wallFace + 0.09 && bb.max.z > wallFace + 0.1, 'sign board bridges the false front face');
});

test('SALOON WINDOWS: four independent assemblies, one per layout entry', async () => {
  const registry = makeRegistry();
  const defs = buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z);
  const windowDefs = defs.filter((d) => d.assetType === 'saloon-window');
  assert.equal(windowDefs.length, 4, 'the layout emits exactly 4 window defs (2 per side)');

  for (const def of windowDefs) {
    const obj = (await registry.create(def)) as THREE.Group;
    assert.ok(obj.getObjectByName('saloon-window-glass'), 'window carries a glass pane');
    assert.ok(obj.getObjectByName('saloon-window-frame-top'), 'window carries a real frame');
    assert.ok(obj.getObjectByName('saloon-window-sill'), 'window carries a protruding sill');
    // Glass back face must sit ON the wall's outer face (back-to-back, the
    // old z-fight discipline), never floating off the facade. The factory
    // builds in the def's LOCAL frame, so compare building-local values.
    obj.updateWorldMatrix(true, true);
    const glass = obj.getObjectByName('saloon-window-glass')!;
    const gb = new THREE.Box3().setFromObject(glass);
    const wallFace = SALOON_LAYOUT.depth / 2 + SALOON_LAYOUT.wallThickness / 2;
    assert.ok(Math.abs(gb.min.z - wallFace) < 0.01, `glass back stacked on the wall face (got ${gb.min.z.toFixed(3)} vs ${wallFace.toFixed(3)})`);
  }
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
  // ENTRANCE-DOOR REVISION: full-height leaves (the old 1.1 m half-doors
  // vanished against the 2.3 m opening). Each hinge carries exactly one
  // leaf, and each leaf hangs INSIDE the doorway gap (|x| ≤ 0.8 at the
  // object origin): an outward offset would bury the leaves in the wall
  // solids — the bug a browser run caught.
  for (const hinge of [left!, right!] as const) {
    const leaves = hinge.children.filter((c) => c.name.startsWith('door-leaf'));
    assert.equal(leaves.length, 1, 'each hinge carries exactly one leaf');
    // box3of composes the full parent chain first — a raw setFromObject
    // would read the leaf against a STALE parent matrixWorld (identity) and
    // report hinge-local numbers (the −0.0000 that failed this assert once).
    const leafBox = box3of(leaves[0]);
    assert.ok(
      leafBox.max.x <= 0.8 && leafBox.min.x >= -0.8,
      `leaf must sit inside the doorway gap (got x [${leafBox.min.x.toFixed(3)}, ${leafBox.max.x.toFixed(3)}])`,
    );
    assert.ok(leafBox.max.y >= 2.1, `leaf must be FULL height (top ${leafBox.max.y.toFixed(2)} ≥ 2.1m)`);
    assert.ok(leafBox.min.y >= 0.0, `leaf bottom stays above the object origin (no ground burial) (got y ${leafBox.min.y.toFixed(4)})`);
    // Pure-pose contract: the built pose is DEAD CLOSED; the runtime yaw
    // comes solely from setSaloonDoorsOpen.
    assert.equal(hinge.rotation.y, 0, 'leaves spawn closed (hinge yaw 0)');
  }
  // The pose function: t=0 closed, t=1 both leaves swung inward 100°, and
  // re-deriving at t=0.5 is deterministic (pure, never accumulated).
  setSaloonDoorsOpen(obj, 1);
  const lOpen = left!.rotation.y;
  const rOpen = right!.rotation.y;
  assert.ok(Math.abs(Math.abs(lOpen) - 100 * Math.PI / 180) < 1e-9, 'left leaf opens 100°');
  assert.ok(Math.abs(lOpen + rOpen) < 1e-9, 'the two leaves mirror each other');
  assert.ok(lOpen > 0, 'the left leaf swings INWARD (−z)');
  setSaloonDoorsOpen(obj, 0);
  assert.equal(left!.rotation.y, 0, 't=0 restores dead closed');
  assert.equal(right!.rotation.y, 0, 't=0 restores dead closed (right)');
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

/* ---- Back bar layering (glassware visibility root fix) ------------------- */

test('SALOON BACK BAR: open-shelf layering — mirror behind bottles, glassware in front', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'saloon-back-bar' }))) as THREE.Group;

  // The old SOLID full-depth frame (which buried every bottle and glass
  // inside its own volume) is gone — replaced by named open-shelf parts.
  assert.ok(!obj.getObjectByName('backbar-frame'), 'solid frame slab must be gone');
  for (const name of [
    'backbar-back-panel', 'backbar-mirror', 'backbar-base-cabinet',
    'backbar-countertop', 'backbar-shelf-0', 'backbar-shelf-1',
    'backbar-shelf-2', 'backbar-crown',
  ]) {
    assert.ok(obj.getObjectByName(name), `back bar must contain "${name}"`);
  }

  const mirrorBox = box3of(obj.getObjectByName('backbar-mirror')!);

  // Bottles: 17 across three shelves, every one standing clear IN FRONT of
  // the mirror, base exactly on a shelf top.
  const shelfTops = [1.44, 1.9, 2.34];
  const bottles = obj.children.filter((c) => c.name.startsWith('backbar-bottle-'));
  assert.equal(bottles.length, 17, '17 bottles across the three shelves');
  let maxBottleFrontZ = -Infinity;
  for (const b of bottles) {
    const bb = box3of(b);
    assert.ok(
      bb.min.z > mirrorBox.max.z + 0.004,
      `${b.name} must stand clear in front of the mirror (min z ${bb.min.z.toFixed(3)} vs mirror ${mirrorBox.max.z.toFixed(3)})`,
    );
    assert.ok(
      shelfTops.some((t) => Math.abs(bb.min.y - t) < 0.002),
      `${b.name} must sit exactly on a shelf top (base y ${bb.min.y.toFixed(3)})`,
    );
    maxBottleFrontZ = Math.max(maxBottleFrontZ, bb.max.z);
  }

  // Glassware: 11 items on the shelf FRONT edges — in front of every bottle.
  const glasses = obj.children.filter((c) => c.name.startsWith('backbar-glassware-'));
  assert.equal(glasses.length, 11, '11 glassware items on the shelf fronts');
  for (const gl of glasses) {
    const gb = box3of(gl);
    assert.ok(gb.min.z > maxBottleFrontZ, `${gl.name} must sit fully in front of the bottle row`);
    assert.ok(gb.min.z > mirrorBox.max.z, `${gl.name} must stand clear of the mirror`);
  }

  // Countertop hero row: decanter, carafe, wine glasses, whiskey tumbler,
  // register and mantle clock — all ON the countertop (y = 0.97).
  for (const name of ['saloon-decanter', 'saloon-carafe', 'saloon-wine-glass', 'saloon-tumbler', 'saloon-cash-register', 'saloon-mantle-clock']) {
    const item = obj.getObjectByName(name);
    assert.ok(item, `back-bar countertop must carry "${name}"`);
    const ib = box3of(item);
    assert.ok(Math.abs(ib.min.y - 0.97) < 0.01, `${name} must rest on the countertop (base y ${ib.min.y.toFixed(3)})`);
  }
});

/* ---- Bottle / glassware silhouettes --------------------------------------- */

test('SALOON BOTTLES: real silhouette — base/body/shoulder/neck/lip/cork in stair-step order', () => {
  const M = createSaloonMaterials();
  const heights: Record<string, number> = {};
  for (const kind of ['whiskey', 'tall', 'short'] as const) {
    const b = buildSaloonBottle(kind, M);
    for (const part of ['bottle-base', 'bottle-body', 'bottle-shoulder', 'bottle-neck', 'bottle-lip', 'bottle-cork']) {
      assert.ok(b.getObjectByName(part), `${kind} bottle must contain "${part}"`);
    }
    const minY = (part: string): number => box3of(b.getObjectByName(part)!).min.y;
    assert.ok(minY('bottle-body') < minY('bottle-shoulder'), `${kind}: shoulder above body`);
    assert.ok(minY('bottle-shoulder') < minY('bottle-neck'), `${kind}: neck above shoulder`);
    assert.ok(minY('bottle-neck') < minY('bottle-lip'), `${kind}: lip above neck`);
    assert.ok(minY('bottle-lip') < minY('bottle-cork'), `${kind}: cork on top`);
    const bb = box3of(b);
    heights[kind] = bb.max.y - bb.min.y;
  }
  // Three genuinely different silhouettes.
  assert.ok(heights.tall! > heights.whiskey!, 'tall bottle taller than whiskey');
  assert.ok(heights.whiskey! > heights.short!, 'whiskey taller than short squat bottle');

  const labeled = buildSaloonBottle('whiskey', M, undefined, { label: 'band' });
  assert.ok(labeled.getObjectByName('bottle-label'), 'labelled bottle carries a label');
  assert.ok(labeled.getObjectByName('bottle-label-band'), 'band variant carries the ink band');
});

test('SALOON WINE GLASS: bowl/stem/foot, liquid INSIDE the bowl and BELOW the rim', () => {
  const M = createSaloonMaterials();
  for (const fill of ['empty', 'half', 'full'] as const) {
    const g = buildWineGlass(M, undefined, fill);
    for (const part of ['glass-bowl', 'glass-stem', 'glass-foot']) {
      assert.ok(g.getObjectByName(part), `wine glass must contain "${part}"`);
    }
    const liquid = g.getObjectByName('wine-liquid');
    if (fill === 'empty') {
      assert.ok(!liquid, 'empty glass carries no liquid');
      continue;
    }
    assert.ok(liquid, `${fill} glass must carry wine`);
    const lb = box3of(liquid!);
    const bowlB = box3of(g.getObjectByName('glass-bowl')!);
    assert.ok(lb.min.y >= bowlB.min.y - 1e-6, 'liquid starts inside the bowl');
    assert.ok(lb.max.y < bowlB.max.y - 0.005, 'liquid surface sits below the rim');
    assert.ok(
      lb.max.x - lb.min.x < bowlB.max.x - bowlB.min.x,
      'liquid fits inside the bowl walls',
    );
  }
  const half = box3of(buildWineGlass(M, undefined, 'half').getObjectByName('wine-liquid')!);
  const full = box3of(buildWineGlass(M, undefined, 'full').getObjectByName('wine-liquid')!);
  assert.ok(full.max.y > half.max.y, 'fuller glass has a higher liquid surface');
});

test('SALOON GLASSWARE: decanter below-shoulder liquid, carafe, tumbler, shot, inverted tumbler', () => {
  const M = createSaloonMaterials();

  const dec = buildDecanter(M);
  for (const part of ['decanter-body', 'decanter-liquid', 'decanter-shoulder', 'decanter-neck', 'decanter-stopper']) {
    assert.ok(dec.getObjectByName(part), `decanter must contain "${part}"`);
  }
  const decL = box3of(dec.getObjectByName('decanter-liquid')!);
  const decS = box3of(dec.getObjectByName('decanter-shoulder')!);
  assert.ok(decL.max.y < decS.min.y, 'decanter liquid surface below the shoulder');

  const car = buildCarafe(M);
  assert.ok(car.getObjectByName('carafe-body'), 'carafe has a body');
  assert.ok(car.getObjectByName('carafe-liquid'), 'carafe carries liquid');

  const tum = buildTumbler(M, undefined, { whiskey: true });
  assert.ok(tum.getObjectByName('glass-shell'), 'tumbler has a shell');
  const liq = box3of(tum.getObjectByName('glass-liquid')!);
  const shell = box3of(tum.getObjectByName('glass-shell')!);
  assert.ok(liq.max.y < shell.max.y - 0.005, 'whiskey surface below the tumbler rim');

  assert.ok(buildShotGlass(M).getObjectByName('glass-shell'), 'shot glass builds');

  const inv = buildInvertedTumbler(M);
  const ib = box3of(inv);
  assert.ok(ib.min.y > -0.005 && ib.max.y <= 0.085, 'inverted tumbler stays anchored at its base');
});

/* ---- Counter dressing ------------------------------------------------------ */

test('SALOON BAR COUNTER: dressed in clusters with a deliberately empty strip', async () => {
  const registry = makeRegistry();
  const obj = (await registry.create(movedDef({ assetType: 'saloon-bar-counter' }))) as THREE.Group;

  for (const name of ['saloon-cash-register', 'bar-bottle-tray', 'bar-towel', 'bar-coaster-1', 'bar-cork-2', 'bar-tin', 'bar-bell-dome']) {
    assert.ok(obj.getObjectByName(name), `counter dressing must include "${name}"`);
  }
  // Bottles on the tray carry the full silhouette.
  const tray = obj.getObjectByName('bar-bottle-tray')!;
  const trayBottles = tray.children.filter((c) => c.name.startsWith('saloon-bottle-'));
  assert.equal(trayBottles.length, 2, 'two whiskey bottles on the tray');
  assert.ok(trayBottles[0]!.getObjectByName('bottle-shoulder'), 'tray bottles are full-silhouette bottles');

  // ~40-50 % of the counter stays empty: NOTHING may occupy the x strip
  // [1.12, 1.42] above the countertop (y > 1.17, i.e. above the back lip's
  // bottom edge at 1.16) — a deliberate clear gap between the coaster
  // cluster and the tin+bell cluster.
  const TOP = 1.17;
  const intruders: string[] = [];
  obj.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const bb = box3of(mesh);
    if (bb.min.y <= TOP) return;
    if (bb.max.x > 1.12 && bb.min.x < 1.42) intruders.push(mesh.name);
  });
  assert.deepEqual(intruders, [], `counter strip [1.12, 1.42] must stay empty (found: ${intruders.join(', ')})`);
});

/* ---- Light budget ----------------------------------------------------------- */

test('SALOON LIGHT BUDGET: exactly 2 real PointLights across the whole saloon', async () => {
  const registry = makeRegistry();
  const defs = buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z);
  let lights = 0;
  for (const def of defs) {
    const obj = await registry.create(def);
    obj.traverse((c) => {
      if ((c as THREE.PointLight).isPointLight) lights += 1;
    });
  }
  assert.equal(lights, 2, 'only the two chandeliers may carry real PointLights');
});

/* ---- Collision ----------------------------------------------------------- */

test('SALOON COLLISION: walls carry colliders, decor does not', () => {
  const defs = buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z);
  const byId = new Map(defs.map((d) => [d.uuid, d]));
  // Composite solids carry the object form { boxes: [...] } (exact local
  // collision boxes) — armed when true OR a box list without enabled:false.
  const armed = (id: string, label: string): void => {
    const c = byId.get(id)?.metadata.collider;
    const ok = c === true || (typeof c === 'object' && c !== null && (c as { enabled?: unknown }).enabled !== false);
    assert.ok(ok, `${label} must be a collider`);
  };

  const wallIds = [
    SALOON_OBJECT_IDS.wallRear, SALOON_OBJECT_IDS.wallWest, SALOON_OBJECT_IDS.wallEast,
    SALOON_OBJECT_IDS.wallFrontWest, SALOON_OBJECT_IDS.wallFrontEast, SALOON_OBJECT_IDS.wallFrontHeader,
  ];
  for (const id of wallIds) {
    assert.equal(byId.get(id)?.metadata.collider, true, `wall ${id} must be a collider`);
  }

  const decorIds = [
    SALOON_OBJECT_IDS.building,
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
  // ENTRANCE-DOOR REVISION: the swinging doors are the street walkability
  // switch now — they spawn CLOSED armed with the exact closed-leaf box.
  armed(SALOON_OBJECT_IDS.swingingDoors, 'closed saloon doors');

  // Solid furniture stays solid (composites now carry exact box colliders).
  for (const id of [
    SALOON_OBJECT_IDS.barCounter, SALOON_OBJECT_IDS.backBar, SALOON_OBJECT_IDS.pokerTable,
    SALOON_OBJECT_IDS.piano, SALOON_OBJECT_IDS.barrel1, SALOON_OBJECT_IDS.barrel3,
  ]) {
    armed(id, `furniture ${id}`);
  }
});

test('SALOON COLLISION: the doorway is genuinely walkable, the wall beside it is not', () => {
  const defs = buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z);
  // ENTRANCE-DOOR REVISION: the full-height doors spawn CLOSED and ARE the
  // street walkability switch — two worlds (closed blocks / open walks),
  // mirroring the bank gate/vault discipline.
  const world = new CollisionWorld(defs);
  const openDefs = defs.map((d) => d.uuid === SALOON_OBJECT_IDS.swingingDoors
    ? { ...d, metadata: { ...d.metadata, collider: false } }
    : d);
  const openWorld = new CollisionWorld(openDefs as typeof defs);

  // CLOSED: the doorway blocks exactly at the leaf plane + radius.
  {
    const p = { x: SALOON_SITE.x, y: 1.7, z: SALOON_SITE.z + SALOON_LAYOUT.depth / 2 + 0.8 };
    const hit = world.movePlayer(p, { x: 0, y: 0, z: -0.5 });
    assert.equal(hit.blockedZ, true, 'the CLOSED saloon doors must block the doorway');
    const leafFace = SALOON_SITE.z + SALOON_LAYOUT.depth / 2 + 0.05;
    assert.ok(Math.abs(hit.position.z - (leafFace + 0.35)) < 1e-3, `player stops at the leaf face + radius (z=${hit.position.z.toFixed(3)})`);
  }

  // OPEN: walk straight in through the door center (x = SITE.x): from the
  // porch into the interior, NEVER blocked. All z coordinates are
  // SITE-relative (the redesign moved the site; the old absolutes −5.5/−12
  // were OLD_SITE(−12)+6.5 and OLD_SITE+0).
  let pos: { x: number; y: number; z: number } = { x: SALOON_SITE.x, y: 1.7, z: SALOON_SITE.z + 6.5 };
  for (let step = 0; step < 14; step += 1) {
    const result = openWorld.movePlayer(pos, { x: 0, y: 0, z: -0.5 });
    assert.equal(result.blockedZ, false, `doorway path blocked at step ${step} (z=${pos.z.toFixed(2)})`);
    pos = result.position;
  }
  assert.ok(pos.z <= SALOON_SITE.z, `player must stand inside the saloon (got z=${pos.z.toFixed(2)})`);

  // The SAME approach one wall-width to the west hits solid wall (the move
  // target lands WELL inside the wall band, not exactly on its boundary).
  const wallHit = world.movePlayer({ x: SALOON_SITE.x - 3, y: 1.7, z: SALOON_SITE.z + 6.5 }, { x: 0, y: 0, z: -2.5 });
  assert.equal(wallHit.blockedZ, true, 'front wall beside the doorway must block');

  // Interior is roomy: from the door to the bar counter must be walkable.
  let inside: { x: number; y: number; z: number } = { x: SALOON_SITE.x, y: 1.7, z: SALOON_SITE.z + 3 };
  for (let step = 0; step < 8; step += 1) {
    const result = openWorld.movePlayer(inside, { x: 0, y: 0, z: -0.5 });
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
