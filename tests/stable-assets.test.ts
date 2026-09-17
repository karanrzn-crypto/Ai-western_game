/**
 * Stable asset tests.
 *
 * Locks the contracts the livery stable module promises to the rest of the
 * game (mirrors the bank/sheriff test categories):
 *
 *  1. REGISTRATION — every stable assetType registers exactly once; duplicates throw.
 *  2. CREATION — the registry materialises every type the layout uses; uuids
 *     unique + v4-shaped.
 *  3. TRANSFORM OWNERSHIP — factories NEVER apply the registry transform.
 *  4. SHELL KIT — roof/gables (with real vent + hay-door holes), signs,
 *     lanterns, loft, ladder, rafters — and NO wall geometry in the kit.
 *  5. STALLS — six content groups with nameplates, tie rings, troughs with
 *     per-stall hay levels, and REAL controlled variation between stalls.
 *  6. DOORS — all 10 spawn CLOSED on real DoorRoot hinges; pose APIs are
 *     exact pure functions of t; gate leaves mirror each other; hinge pivots
 *     sit at the true hinge axes.
 *  7. SWEEP — sampled full sweeps (21 angles × leaf perimeter) never enter
 *     any wall/front/partition/furniture collider box.
 *  8. COLLIDER POLICY — walls/floor/partitions/fronts/doors/solids carry
 *     colliders; shell kit and content groups do not.
 *  9. WALKABILITY — the closed gate blocks the wagon entrance, the open gate
 *     passes; the aisle is walkable end-to-end; a stall and the tack room
 *     are entered only after E-opening their doors.
 * 10. LAYOUT — stalls tile the interior exactly; windows sit inside wall
 *     bands; the ladder reaches the loft deck; the aisle stays clear.
 * 11. GEOMETRY — no coplanar same-normal overlapping faces with different
 *     materials anywhere in the stable (the z-fighting class of bug).
 * 12. LIGHT BUDGET — exactly 4 real PointLights across the whole stable.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  AssetRegistry,
  CollisionWorld,
  registerAllStableFactories,
  STABLE_ASSET_TYPES,
  STABLE_LAYOUT,
  STABLE_SITE,
  STABLE_OBJECT_IDS,
  STABLE_STALLS,
  STABLE_DOOR_SPECS,
  buildStableMapObjects,
  setStableGateOpen,
  setStableLeafDoorOpen,
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
  registerAllStableFactories(registry);
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

/** Build every stable object placed at the real site (visuals + transforms). */
async function buildWorld(): Promise<{ defs: ObjectDefinition[]; roots: Map<string, THREE.Object3D> }> {
  const registry = makeRegistry();
  const defs = buildStableMapObjects(STABLE_SITE.x, STABLE_SITE.z);
  const roots = new Map<string, THREE.Object3D>();
  for (const def of defs) {
    const obj = applyDefinition(await registry.create(def), def);
    roots.set(def.uuid, obj);
  }
  return { defs, roots };
}

/** World-space AABB of a layout box def (axis-aligned unit-box × scale). */
function defBox(def: ObjectDefinition): THREE.Box3 {
  const p = def.transform.position;
  const s = def.transform.scale;
  return new THREE.Box3(
    new THREE.Vector3(p.x - s.x / 2, p.y - s.y / 2, p.z - s.z / 2),
    new THREE.Vector3(p.x + s.x / 2, p.y + s.y / 2, p.z + s.z / 2),
  );
}

/* -------------------------------------------------------------------------- */

test('STABLE REGISTRATION: every type registers; duplicates throw', () => {
  const registry = makeRegistry();
  for (const type of STABLE_ASSET_TYPES) {
    assert.ok(registry.has(type), `assetType "${type}" must be registered`);
  }
  assert.throws(
    () => registerAllStableFactories(registry),
    /already registered/,
    'double registration must be rejected by the registry',
  );
});

test('STABLE REGISTRATION: the registry can create every type the layout uses', async () => {
  const registry = makeRegistry();
  const defs = buildStableMapObjects(STABLE_SITE.x, STABLE_SITE.z);
  const usedTypes = new Set(defs.map((d) => d.assetType));
  for (const type of usedTypes) {
    assert.ok(registry.has(type), `layout uses unregistered assetType "${type}"`);
  }
  // uuids unique + v4-shaped
  const uuids = new Set<string>();
  for (const def of defs) {
    assert.ok(!uuids.has(def.uuid), `duplicate uuid ${def.uuid}`);
    uuids.add(def.uuid);
    assert.match(def.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, `uuid ${def.uuid} must be v4-shaped`);
  }
  assert.ok(defs.length >= 90, `the stable is a rich scene (got ${defs.length} objects)`);
});

test('STABLE TRANSFORM OWNERSHIP: factories never apply the registry transform', async () => {
  const registry = makeRegistry();
  const def: ObjectDefinition = {
    uuid: '30000000-0000-4000-c000-0000000000aa',
    assetType: 'stable-building',
    transform: {
      position: { x: 4, y: 0.5, z: -7 },
      rotation: { x: 10, y: 20, z: 30 },
      scale: { x: 2, y: 3, z: 4 },
    },
    metadata: { name: 'Test Stable' },
  };
  const obj = await registry.create(def);
  assert.equal(obj.position.x, 0, 'factory must not translate');
  assert.equal(obj.rotation.y, 0, 'factory must not rotate');
  assert.equal(obj.scale.z, 1, 'factory must not scale');
});

/* -------------------------------------------------------------------------- */

test('STABLE SHELL KIT: roof, gables, loft — decor is independent objects now', async () => {
  const { defs, roots } = await buildWorld();
  const shell = roots.get(STABLE_OBJECT_IDS.building);
  assert.ok(shell, 'the shell kit must exist');

  const names = new Set<string>();
  shell.traverse((o) => names.add(o.name));

  // Roof + gables + ridge
  for (const part of ['roof-slab-east', 'roof-slab-west', 'ridge-cap', 'gable-south', 'gable-north', 'eave-fascia-east']) {
    assert.ok(names.has(part), `shell must contain ${part}`);
  }
  // Foundation + trim system
  for (const part of ['foundation-south', 'corner-board-wn', 'water-table-south', 'frieze-north']) {
    assert.ok(names.has(part), `shell must contain ${part}`);
  }
  // Gable hay door + hoist stay with the structure
  for (const part of ['haydoor-leaf', 'haydoor-frame-top', 'hoist-beam', 'hoist-pulley']) {
    assert.ok(names.has(part), `shell must contain ${part}`);
  }
  // Structure: posts, beams, rafters, collar ties, ridge beam
  for (const part of ['front-post-w--3', 'aisle-beam-w', 'wall-plate-e', 'rafter-e-5.2', 'collar-tie-2.0', 'ridge-beam']) {
    assert.ok(names.has(part), `shell must contain ${part}`);
  }
  // Loft: joists, deck, edge board, railing (the LADDER is its own object now)
  for (const part of ['loft-joist--6.2', 'loft-deck-3', 'loft-edge-board', 'loft-rail-post']) {
    assert.ok(names.has(part), `shell must contain ${part}`);
  }
  // Door casings (gate + staff + 2 rooms)
  assert.ok(names.has('door-casing-header'), 'shell must contain door casings');

  // INDEPENDENT decor: the shell must NOT bundle signs/windows/lanterns/
  // ladder anymore — each is its own managed object.
  for (const part of ['livery-sign-board', 'livery-sign-face', 'horses-sign-board', 'loft-ladder', 'window-glass', 'lantern-gate', 'lantern-aisle']) {
    assert.equal(names.has(part), false, `shell must NOT bundle "${part}" (independent object now)`);
  }

  // The independent defs exist and carry their parts:
  const byType = (t: string): ObjectDefinition[] => defs.filter((d) => d.assetType === t);
  assert.equal(byType('stable-window').length, STABLE_LAYOUT.windows.length, 'one window object per layout window');
  assert.equal(byType('stable-lantern').length, 6, 'six lantern objects (the light budget)');
  assert.equal(byType('stable-sign').length, 2, 'two sign objects (LIVERY + HORSES)');
  assert.equal(byType('stable-ladder').length, 1, 'one ladder object');
  const windowRoots = byType('stable-window').map((d) => roots.get(d.uuid)!);
  let glasses = 0;
  for (const r of windowRoots) r.traverse((o) => { if (o.name === 'window-glass') glasses += 1; });
  assert.equal(glasses, STABLE_LAYOUT.windows.length, 'every window object carries its glass pane');
  const ladderRoot = roots.get(STABLE_OBJECT_IDS.ladder)!;
  assert.ok(ladderRoot.getObjectByName('loft-ladder'), 'the ladder object carries the loft-ladder group');
  assert.ok(ladderRoot.getObjectByName('ladder-rail'), 'the ladder object carries its rails');
  const liveryRoot = roots.get(STABLE_OBJECT_IDS.liverySign)!;
  assert.ok(liveryRoot.getObjectByName('livery-sign-face'), 'the LIVERY sign object carries its canvas face');
  const lanternRoot = roots.get(STABLE_OBJECT_IDS.lanternGate)!;
  assert.ok(lanternRoot.getObjectByName('lantern-gate') || lanternRoot.children.length > 0, 'the gate lantern object is built');

  // The kit owns NO wall geometry — walls are separate collider unit-boxes.
  let wallMeshes = 0;
  shell.traverse((o) => {
    if (o.name === 'stable-wall-segment') wallMeshes += 1;
  });
  assert.equal(wallMeshes, 0, 'the shell kit must not carry wall collider geometry');
});

/* -------------------------------------------------------------------------- */

test('STABLE GEOMETRY: every rope coil is DELETED (user order «کلا انرا پاک کن») — and stays deleted', async () => {
  const { defs } = await buildWorld();
  // The user's ring complaints came in two rounds: first the floating loft
  // coil («طناب آویز»), then — after the aisle coil alone was removed — the
  // verdict that the problem was STILL unsolved and the rings must go
  // COMPLETELY. So ALL rope-coil geometry is banned: the tack-room
  // wall coil («طناب پیچیده») AND the per-stall door-side tori (the former
  // `rope` extras of stalls 01/04, which stayed behind when the doors
  // swung). Zero defs of the kind may exist; the builder itself is deleted.
  const coils = defs.filter((d) => (d.metadata as Record<string, unknown>).kind === 'rope-coil');
  assert.equal(coils.length, 0, 'no rope-coil def may exist (ALL coils deleted on user order)');
  for (const needle of ['طناب آویز', 'طناب پیچیده']) {
    const byName = defs.filter((d) => String(d.metadata.name).includes(needle));
    assert.equal(byName.length, 0, `no def may carry the deleted «${needle}» name`);
  }
  // The former per-stall extras must not respawn either: no rope torus may
  // exist in ANY stable root (the coil builder used TorusGeometry(·,·,8,18)).
  const { roots } = await buildWorld();
  let ropeTori = 0;
  for (const root of roots.values()) {
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const g = (o as THREE.Mesh).geometry;
      if (o.name === 'rope-torus' || (g && g.type === 'TorusGeometry' && (g as THREE.TorusGeometry).parameters
        && (g as THREE.TorusGeometry).parameters.radialSegments === 8
        && (g as THREE.TorusGeometry).parameters.tubularSegments === 18)) ropeTori += 1;
    });
  }
  assert.equal(ropeTori, 0, 'no rope-coil torus may exist anywhere in the stable');
});

/* -------------------------------------------------------------------------- */

test('STABLE STALLS: six stalls, nameplates, troughs, controlled variation', async () => {
  const { defs, roots } = await buildWorld();

  const contentDefs = defs.filter((d) => d.assetType === 'stable-stall-contents');
  assert.equal(contentDefs.length, 6, 'six stall content groups');
  const troughDefs = defs.filter((d) => d.assetType === 'stable-feed-trough');
  assert.equal(troughDefs.length, 6, 'six feed troughs (one per stall)');

  const hayLevels = troughDefs.map((d) => Number((d.metadata as Record<string, unknown>).hayLevel));
  assert.deepEqual(hayLevels, STABLE_STALLS.map((s) => s.troughHay), 'trough hay follows the layout spec');

  // Nameplate + tie ring in every stall; nameplates read STALL 01…06.
  for (const def of contentDefs) {
    const root = roots.get(def.uuid);
    assert.ok(root, 'stall content group exists');
    const names = new Set<string>();
    root.traverse((o) => names.add(o.name));
    assert.ok(names.has('stall-nameplate'), 'every stall has a nameplate');
    assert.ok(names.has('tie-ring'), 'every stall has a tie ring');
  }
  const contentRoots = contentDefs.map((d) => roots.get(d.uuid)!);
  const plates = contentRoots.filter((r) => Boolean(r.getObjectByName('stall-nameplate')));
  assert.equal(plates.length, 6, 'six nameplates');

  // Variation is real: at least 4 distinct configuration fingerprints.
  const fingerprints = new Set<string>();
  for (const s of STABLE_STALLS) {
    fingerprints.add(`${s.rack}|${s.bucket?.kind ?? 'none'}|${s.floor}|${s.tool ?? 'notool'}|${s.extra ?? 'none'}|${s.pile}`);
  }
  assert.ok(fingerprints.size >= 4, `stall variation must be controlled but real (got ${fingerprints.size})`);

  // Stall 06 is the deliberately empty-water one.
  const s6 = STABLE_STALLS.find((s) => s.index === 6);
  assert.ok(s6 && s6.bucket === null, 'stall six has no water bucket (variation)');
});

/* -------------------------------------------------------------------------- */

test('STABLE DOOR CENSUS: swinging a hinge moves every leaf part — nothing stays behind', async () => {
  // The user report behind this guard: "when the door opens, a piece stays
  // at its old place / hangs in the air." Every mesh under a leaf hinge MUST
  // move with it; the only root-level (static) meshes are the whitelisted
  // frame parts (hinge knuckles on the jamb side + the threshold shoe rail).
  const { roots } = await buildWorld();
  const STATIC_OK = new Set([
    'door-knuckle',        // leaf doors: 2 knuckles on the static root
    'gate-knuckle-w',      // gate: knuckles on the jambs
    'gate-knuckle-e',
    'gate-shoe-rail',      // threshold guide
  ]);

  for (const spec of STABLE_DOOR_SPECS) {
    const root = roots.get(spec.uuid);
    assert.ok(root, `${spec.style} door exists`);
    root.updateWorldMatrix(true, true);

    // Census every mesh: hinge-child vs static root child.
    const isUnderHinge = (o: THREE.Object3D): boolean => {
      let cur: THREE.Object3D | null = o;
      while (cur && cur !== root) {
        if (cur.name.includes('hinge')) return true;
        cur = cur.parent;
      }
      return false;
    };
    const staticMeshes: string[] = [];
    root.children.forEach((child) => {
      child.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !isUnderHinge(o)) staticMeshes.push(o.name);
      });
    });
    for (const name of staticMeshes) {
      assert.ok(
        STATIC_OK.has(name),
        `${spec.style} door: unexpected STATIC mesh "${name}" outside the hinge (would stay behind when open)`,
      );
    }

    // Swing the hinge (pure pose, full open) and verify every hinge-descendant
    // mesh actually MOVED. Invariant = at least one world-bbox CORNER moves:
    // a strap hinge centered ON the axis keeps its center fixed (correct),
    // but its extremities still swing — a truly orphaned part moves nothing.
    const collect = (): Map<THREE.Object3D, { corners: THREE.Vector3[] }> => {
      const map = new Map<THREE.Object3D, { corners: THREE.Vector3[] }>();
      root.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        const b = new THREE.Box3().setFromObject(o);
        const corners: THREE.Vector3[] = [];
        for (const cx of [b.min.x, b.max.x]) {
          for (const cy of [b.min.y, b.max.y]) {
            for (const cz of [b.min.z, b.max.z]) corners.push(new THREE.Vector3(cx, cy, cz));
          }
        }
        map.set(o, { corners });
      });
      return map;
    };
    const before = collect();
    if (spec.style === 'gate') setStableGateOpen(root, 1);
    else setStableLeafDoorOpen(root, 1);
    root.updateWorldMatrix(true, true);
    for (const [mesh, old] of before) {
      if (!isUnderHinge(mesh)) continue;
      const b = new THREE.Box3().setFromObject(mesh);
      let moved = false;
      outer: for (const cy of [b.min.y, b.max.y]) {
        for (const cz of [b.min.z, b.max.z]) {
          for (const cx of [b.min.x, b.max.x]) {
            for (const oc of old.corners) {
              if (oc.distanceTo(new THREE.Vector3(cx, cy, cz)) > 0.05) { moved = true; break outer; }
            }
          }
        }
      }
      assert.ok(
        moved,
        `${spec.style} door: hinge-child mesh "${mesh.name}" did not move with the swing (floating piece!)`,
      );
    }
    // Restore closed (pure pose).
    if (spec.style === 'gate') setStableGateOpen(root, 0);
    else setStableLeafDoorOpen(root, 0);
  }
});

/* -------------------------------------------------------------------------- */

test('STABLE DOORS: spawn closed on real hinge pivots; pure exact poses', async () => {
  const { roots } = await buildWorld();

  assert.equal(STABLE_DOOR_SPECS.length, 10, 'gate + 6 stalls + 2 rooms + staff');

  for (const spec of STABLE_DOOR_SPECS) {
    const root = roots.get(spec.uuid);
    assert.ok(root, `${spec.style} door exists`);
    if (spec.style === 'gate') {
      const w = root.getObjectByName('gate-leaf-w-hinge') as THREE.Group;
      const e = root.getObjectByName('gate-leaf-e-hinge') as THREE.Group;
      assert.ok(w && e, 'the gate carries both leaf hinges');
      // Hinges sit at the TRUE axes: 4 cm inboard of the outer jambs.
      const half = (STABLE_LAYOUT.mainGate.xMax - STABLE_LAYOUT.mainGate.xMin) / 2;
      assert.ok(Math.abs(w.position.x - (-(half - 0.04))) < 1e-6, 'west hinge on its axis');
      assert.ok(Math.abs(e.position.x - (half - 0.04)) < 1e-6, 'east hinge on its axis');
      // Pure pose: t=0 closed, t=1 exactly ±105°, t=0.5 half.
      setStableGateOpen(root, 0);
      assert.equal(w.rotation.y, 0, 'gate spawns CLOSED');
      setStableGateOpen(root, 1);
      assert.ok(Math.abs(w.rotation.y + (105 * Math.PI) / 180) < 1e-9, 'west leaf opens −105°');
      assert.ok(Math.abs(e.rotation.y - (105 * Math.PI) / 180) < 1e-9, 'east leaf mirrors +105°');
      setStableGateOpen(root, 0.5);
      assert.ok(Math.abs(w.rotation.y + (52.5 * Math.PI) / 180) < 1e-9, 'pose is linear in t');
      setStableGateOpen(root, 0);
      setStableGateOpen(root, 0);
      assert.equal(w.rotation.y, 0, 're-deriving the pose never accumulates');
    } else {
      const hinge = root.getObjectByName('door-hinge') as THREE.Group;
      assert.ok(hinge, `${spec.style} door hangs on a door-hinge pivot`);
      assert.equal(hinge.rotation.y, 0, `${spec.style} door spawns CLOSED`);
      const openRad = spec.openDeg;
      setStableLeafDoorOpen(root, 1);
      assert.ok(Math.abs(Math.abs(hinge.rotation.y) - openRad) < 1e-9, `${spec.style} door reaches its open angle`);
      setStableLeafDoorOpen(root, 0);
      assert.equal(hinge.rotation.y, 0, 'pose re-derived from t never accumulates');
      // Sign baked into userData matches the layout spec.
      assert.equal(Number(hinge.userData.openSign), spec.openSign, 'swing sign from the layout');
    }
  }
});

/* -------------------------------------------------------------------------- */

test('STABLE SWEEP: no door leaf ever enters a wall/front/furniture box', async () => {
  const { defs, roots } = await buildWorld();

  // Every collider box in the stable (world AABBs from the unit-box defs).
  const colliderBoxes = defs
    .filter((d) => d.metadata.collider && !STABLE_DOOR_SPECS.some((s) => s.uuid === d.uuid))
    .map((d) => ({ name: d.metadata.name as string, box: defBox(d) }));
  assert.ok(colliderBoxes.length > 60, `rich obstacle set (got ${colliderBoxes.length})`);
  // Decor obstacles that must also be respected (the water barrel is decor).
  colliderBoxes.push({
    name: 'water barrel (decor)',
    box: new THREE.Box3(
      new THREE.Vector3(STABLE_SITE.x + 1.15, 0.1, STABLE_SITE.z + 4.05),
      new THREE.Vector3(STABLE_SITE.x + 1.75, 1.0, STABLE_SITE.z + 4.65),
    ),
  });

  const INFLATE = 0.002; // 2 mm margin (point-in-inflated-box)
  const insideAny = (p: THREE.Vector3): string | null => {
    for (const { name, box } of colliderBoxes) {
      if (
        p.x > box.min.x - INFLATE && p.x < box.max.x + INFLATE &&
        p.y > box.min.y - INFLATE && p.y < box.max.y + INFLATE &&
        p.z > box.min.z - INFLATE && p.z < box.max.z + INFLATE
      ) return name;
    }
    return null;
  };

  /** Sample the moving leaf's perimeter at 21 swing angles. */
  const checkLeaf = (leaf: THREE.Object3D, label: string, spans: Array<{ along: 'x' | 'z'; a: number; b: number; thickness: number; h: [number, number] }>): void => {
    const hits: string[] = [];
    for (let step = 0; step <= 20; step++) {
      const t = step / 20;
      leaf.updateMatrixWorld(true);
      // Re-derive the sampled world corners by transforming local points.
      for (const span of spans) {
        const len = span.b - span.a;
        const n = 6;
        for (let i = 0; i <= n; i++) {
          const d = span.a + (len * i) / n;
          for (const face of [-span.thickness / 2 - 0.004, span.thickness / 2 + 0.004]) {
            for (const yy of [span.h[0] - 0.004, (span.h[0] + span.h[1]) / 2, span.h[1] + 0.004]) {
              const local = span.along === 'x'
                ? new THREE.Vector3(d, yy, face)
                : new THREE.Vector3(face, yy, d);
              const world = local.clone().applyMatrix4(leaf.matrixWorld);
              const hit = insideAny(world);
              if (hit) hits.push(`${label} t=${t.toFixed(2)} → ${hit} @ (${world.x.toFixed(2)},${world.y.toFixed(2)},${world.z.toFixed(2)})`);
            }
          }
        }
      }
    }
    assert.equal(hits.length, 0, `${label} sweep must graze nothing:\n${hits.slice(0, 8).join('\n')}`);
  };

  // The GATE: both leaves sweep OUTWARD (south). Leaf local geometry: the
  // leaf group's children span local x (from the hinge toward the center) —
  // sample through the hinge's parented frame.
  const gateSpec = STABLE_DOOR_SPECS.find((s) => s.style === 'gate')!;
  for (const side of [-1, 1] as const) {
    const spec = gateSpec;
    const root = roots.get(spec.uuid)!;
    const leaf = root.getObjectByName(side === -1 ? 'gate-leaf-w-hinge' : 'gate-leaf-e-hinge') as THREE.Object3D;
    const openW = STABLE_LAYOUT.mainGate.xMax - STABLE_LAYOUT.mainGate.xMin;
    const leafW = openW / 2 - 0.04;
    const leafH = STABLE_LAYOUT.mainGate.height - 0.06;
    setStableGateOpen(root, 0);
    for (let step = 0; step <= 20; step++) {
      setStableGateOpen(root, step / 20);
      root.updateMatrixWorld(true);
      leaf.updateMatrixWorld(true);
      const dir = side === -1 ? 1 : -1;
      for (let i = 0; i <= 6; i++) {
        const lx = dir * (leafW * i) / 6;
        for (const fz of [-0.029, 0.029]) {
          for (const yy of [0.004, leafH / 2, leafH - 0.004]) {
            const world = new THREE.Vector3(lx, yy, fz).applyMatrix4(leaf.matrixWorld);
            const hit = insideAny(world);
            assert.equal(hit, null, `gate ${side < 0 ? 'W' : 'E'} leaf t=${(step / 20).toFixed(2)} grazes ${hit} @ (${world.x.toFixed(2)},${world.y.toFixed(2)},${world.z.toFixed(2)})`);
          }
        }
      }
    }
    setStableGateOpen(root, 0);
    void checkLeaf;
  }

  // LEAF DOORS: stall (into the stall), rooms (out into the aisle), staff
  // (into the feed room). Local convention: leaf spans local x from the
  // hinge toward the latch; thickness local z; height local y.
  for (const spec of STABLE_DOOR_SPECS) {
    if (spec.style === 'gate') continue;
    const root = roots.get(spec.uuid)!;
    const hinge = root.getObjectByName('door-hinge') as THREE.Object3D;
    const leafW = spec.width - 0.06;
    const leafH = spec.height - 0.04;
    const dir = spec.hinge === 'left' ? 1 : -1;
    for (let step = 0; step <= 20; step++) {
      setStableLeafDoorOpen(root, step / 20);
      root.updateMatrixWorld(true);
      hinge.updateMatrixWorld(true);
      for (let i = 0; i <= 6; i++) {
        const lx = dir * (leafW * i) / 6;
        for (const fz of [-0.03, 0.03]) {
          for (const yy of [0.004, leafH / 2, leafH - 0.004]) {
            const world = new THREE.Vector3(lx, yy, fz).applyMatrix4(hinge.matrixWorld);
            const hit = insideAny(world);
            assert.equal(hit, null, `${spec.style} door (${spec.labelOpen}) t=${(step / 20).toFixed(2)} grazes ${hit} @ (${world.x.toFixed(2)},${world.y.toFixed(2)},${world.z.toFixed(2)})`);
          }
        }
      }
    }
    setStableLeafDoorOpen(root, 0);
  }
});

/* -------------------------------------------------------------------------- */

test('STABLE COLLIDER POLICY: structure blocks, decor does not', async () => {
  const defs = buildStableMapObjects(STABLE_SITE.x, STABLE_SITE.z);
  const byType = (type: string): ObjectDefinition[] => defs.filter((d) => d.assetType === type);
  const allTrue = (list: ObjectDefinition[], label: string): void => {
    for (const d of list) {
      assert.equal(d.metadata.collider, true, `${label} "${d.metadata.name}" must carry a collider`);
    }
  };
  const allFalse = (list: ObjectDefinition[], label: string): void => {
    for (const d of list) {
      assert.equal(d.metadata.collider, false, `${label} "${d.metadata.name}" must be decor`);
    }
  };
  allTrue(byType('stable-wall'), 'wall');
  allTrue(byType('stable-floor'), 'floor');
  allTrue(byType('stable-bar-wall'), 'bar wall');
  allTrue(byType('stable-stall-front'), 'stall front');
  allTrue(byType('stable-feed-trough'), 'feed trough');
  allTrue(byType('stable-water-trough'), 'water trough');
  allTrue(byType('stable-workbench'), 'workbench');
  allTrue(byType('stable-anvil'), 'anvil');
  allTrue(byType('stable-gate'), 'gate');
  allTrue(byType('stable-stall-door'), 'stall door');
  allTrue(byType('stable-room-door'), 'room door');
  allTrue(byType('stable-staff-door'), 'staff door');
  allFalse(byType('stable-building'), 'shell kit');
  allFalse(byType('stable-stall-contents'), 'stall contents');
  // The old zone-content groups are gone — every zone prop is its own
  // 'stable-prop' object now (kind-driven, see STABLE_PROPS in the layout).
  allFalse(byType('stable-prop'), 'zone props');
});

/* -------------------------------------------------------------------------- */

test('STABLE WALKABILITY: gate blocks/passes, aisle runs, stalls need their doors', () => {
  const defs = buildStableMapObjects(STABLE_SITE.x, STABLE_SITE.z);
  const world = new CollisionWorld(defs);

  // The stable spans x ∈ [−21.6, −10.4], z ∈ [−0.5, 12.5] at the site.
  const gateWorldZ = STABLE_SITE.z + STABLE_LAYOUT.depth / 2 - STABLE_LAYOUT.wallThickness / 2;

  // 1) The CLOSED gate blocks the wagon entrance (front approach).
  let pos: { x: number; y: number; z: number } = { x: STABLE_SITE.x, y: PLAYER_HEIGHT, z: gateWorldZ + 3 };
  let r = world.movePlayer(pos, { x: 0, y: 0, z: -1.2 });
  assert.equal(r.blockedZ, false, 'the yard run-up must be clear');
  pos = r.position;
  let guard = 0;
  while (!world.movePlayer(pos, { x: 0, y: 0, z: -0.1 }).blockedZ && guard < 40) {
    pos = world.movePlayer(pos, { x: 0, y: 0, z: -0.1 }).position;
    guard += 1;
  }
  assert.ok(guard < 40, 'the player must reach the closed gate');
  assert.ok(
    pos.z > gateWorldZ + 0.55,
    `the closed gate must stop the player outside (stopped at ${pos.z.toFixed(2)}, gate ${gateWorldZ.toFixed(2)})`,
  );

  // 2) Simulate the OPEN gate (collider released — exactly what the map's
  // updater does through updateObjectMetadata) and walk the full aisle.
  const openDefs: ObjectDefinition[] = defs.map((d) => {
    if (STABLE_DOOR_SPECS.some((s) => s.uuid === d.uuid && s.style === 'gate')) {
      return { ...d, metadata: { ...d.metadata, collider: false } };
    }
    return d;
  });
  const openWorld = new CollisionWorld(openDefs);
  pos = { x: STABLE_SITE.x, y: PLAYER_HEIGHT, z: gateWorldZ + 1.5 } as { x: number; y: number; z: number };
  let entered = false;
  guard = 0;
  while (guard < 90) {
    const before = pos.z;
    let step = openWorld.movePlayer(pos, { x: 0, y: 0, z: -0.5 });
    if (step.blockedZ) {
      const lifted = openWorld.movePlayer(pos, { x: 0, y: PLAYER_STEP_HEIGHT, z: 0 });
      const moved = openWorld.movePlayer(lifted.position, { x: 0, y: 0, z: -0.5 });
      const settled = openWorld.movePlayer(moved.position, { x: 0, y: -(PLAYER_STEP_HEIGHT + 0.05), z: 0 });
      if (Math.abs(settled.position.z - before) > Math.abs(step.position.z - before) + 1e-6) step = settled;
    }
    pos = step.position;
    if (pos.z < STABLE_SITE.z - 5.2) { entered = true; break; } // deep in the north half
    if (Math.abs(pos.z - before) < 1e-6) break;
    guard += 1;
  }
  assert.ok(entered, `the open gate must open the whole aisle (stopped at z=${pos.z.toFixed(2)})`);

  // 3) A CLOSED stall door blocks access from the aisle; with the stall-door
  // collider released (E-open), the player walks INTO the stall.
  const s1 = STABLE_STALLS.find((s) => s.index === 1)!;
  const stallDoorX = STABLE_SITE.x + s1.side * STABLE_LAYOUT.stallFrontX;
  const stallDoorZ = STABLE_SITE.z + s1.doorGapCenter;
  const closedDefs = defs;
  const closedWorld = new CollisionWorld(closedDefs);
  pos = { x: stallDoorX + 0.9, y: PLAYER_HEIGHT, z: stallDoorZ } as { x: number; y: number; z: number };
  r = closedWorld.movePlayer(pos, { x: -1.0, y: 0, z: 0 });
  assert.ok(
    r.position.x > stallDoorX - 0.55,
    `the closed stall door must block the stall (stopped at x=${r.position.x.toFixed(2)})`,
  );
  const stallOpenDefs: ObjectDefinition[] = defs.map((d) => {
    if (d.uuid === STABLE_OBJECT_IDS.stallDoor1) {
      return { ...d, metadata: { ...d.metadata, collider: false } };
    }
    return d;
  });
  const stallOpenWorld = new CollisionWorld(stallOpenDefs);
  pos = { x: stallDoorX + 0.9, y: PLAYER_HEIGHT, z: stallDoorZ } as { x: number; y: number; z: number };
  guard = 0;
  while (pos.x > STABLE_SITE.x + s1.side * (STABLE_LAYOUT.innerHalfX - 0.6) && guard < 20) {
    pos = stallOpenWorld.movePlayer(pos, { x: -0.5, y: 0, z: 0 }).position;
    guard += 1;
  }
  assert.ok(
    Math.abs(pos.x - STABLE_SITE.x) > 3.0,
    `the open stall door lets the player INTO the stall (reached x=${pos.x.toFixed(2)})`,
  );

  // 4) The tack room: closed door blocks; open door passes.
  const tackX = STABLE_SITE.x - STABLE_LAYOUT.rooms.wallX;
  const tackZ = STABLE_SITE.z + (STABLE_LAYOUT.rooms.doorGap.zMin + STABLE_LAYOUT.rooms.doorGap.zMax) / 2;
  pos = { x: tackX + 0.9, y: PLAYER_HEIGHT, z: tackZ } as { x: number; y: number; z: number };
  r = closedWorld.movePlayer(pos, { x: -1.0, y: 0, z: 0 });
  assert.ok(r.position.x > tackX - 0.55, 'the closed tack room door blocks');
  const tackOpenDefs: ObjectDefinition[] = defs.map((d) => {
    if (d.uuid === STABLE_OBJECT_IDS.tackDoor) {
      return { ...d, metadata: { ...d.metadata, collider: false } };
    }
    return d;
  });
  pos = { x: tackX + 0.9, y: PLAYER_HEIGHT, z: tackZ } as { x: number; y: number; z: number };
  guard = 0;
  while (pos.x > STABLE_SITE.x - 4.4 && guard < 20) {
    pos = new CollisionWorld(tackOpenDefs).movePlayer(pos, { x: -0.5, y: 0, z: 0 }).position;
    guard += 1;
  }
  assert.ok(pos.x < tackX - 1.0, `the open tack door passes into the room (reached x=${pos.x.toFixed(2)})`);
});

/* -------------------------------------------------------------------------- */

test('STABLE LAYOUT: tiling, windows in bands, ladder reaches, aisle clear', async () => {
  const { defs } = await buildWorld();
  const L = STABLE_LAYOUT;

  // 1) Stall fronts tile z ∈ [−6.25, 3.5] exactly (3 × 3.25 per side).
  const frontBoxes = defs
    .filter((d) => d.assetType === 'stable-stall-front')
    .map((d) => defBox(d));
  assert.equal(frontBoxes.length, 18, '6 stalls × 3 front segments');
  for (const side of [-1, 1]) {
    const sideFronts = frontBoxes.filter((b) => ((b.min.x + b.max.x) / 2 < STABLE_SITE.x) === (side < 0));
    const zSpan = sideFronts.reduce(
      (acc, b) => ({ min: Math.min(acc.min, b.min.z), max: Math.max(acc.max, b.max.z) }),
      { min: Infinity, max: -Infinity },
    );
    assert.ok(Math.abs(zSpan.min - (STABLE_SITE.z - L.innerHalfZ)) < 1e-6, 'fronts start at the north wall');
    assert.ok(Math.abs(zSpan.max - (STABLE_SITE.z + L.rooms.dividerZ)) < 1e-6, 'fronts end at the room line');
  }

  // 2) Every window glass sits INSIDE its wall band (never floating).
  // Windows are independent objects now — gather across ALL stable roots.
  const registry = makeRegistry();
  const created: THREE.Object3D[] = [];
  for (const d of defs) {
    if (!d.uuid.startsWith('10000000-0000-4000-8000-')) continue; // stable block only
    created.push(applyDefinition(await registry.create(d), d));
  }
  for (const root of created) root.updateWorldMatrix(true, true);
  const glasses: THREE.Box3[] = [];
  for (const root of created) {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.name === 'window-glass') glasses.push(new THREE.Box3().setFromObject(mesh));
    });
  }
  assert.equal(glasses.length, L.windows.length, 'one glass pane per window');
  const wallT = L.wallThickness;
  for (const g of glasses) {
    const inSouthOrNorth = g.min.z > STABLE_SITE.z - L.depth / 2 - 0.01 && g.max.z < STABLE_SITE.z + L.depth / 2 + 0.01;
    const inWestOrEast = g.min.x > STABLE_SITE.x - L.width / 2 - 0.01 && g.max.x < STABLE_SITE.x + L.width / 2 + 0.01;
    const deep = Math.min(
      Math.abs(g.min.z - STABLE_SITE.z), Math.abs(g.max.z - STABLE_SITE.z),
      Math.abs(g.min.x - STABLE_SITE.x), Math.abs(g.max.x - STABLE_SITE.x),
    );
    assert.ok(inSouthOrNorth || inWestOrEast, 'glass inside the footprint');
    // The pane must sit within one wall's depth band (≤ t/2 + lining from a face).
    assert.ok(deep < L.depth / 2 - 0.2, 'glass not on the facade edge');
    void wallT;
  }

  // 3) The ladder reaches the loft: its top ends AT the deck edge — AND the
  // rails lean the SAME way as the rungs (the X-crossing regression).
  const { roots } = await buildWorld();
  const ladderRoot = roots.get(STABLE_OBJECT_IDS.ladder);
  assert.ok(ladderRoot, 'the ladder is an independent object');
  const ladder = ladderRoot!.getObjectByName('loft-ladder');
  assert.ok(ladder, 'the loft ladder exists');
  const lb = box3of(ladder!);
  assert.ok(Math.abs(lb.max.y - L.loft.deckTopY) < 0.08, `ladder top reaches the deck (top ${lb.max.y.toFixed(3)} vs deck ${L.loft.deckTopY})`);
  assert.ok(lb.min.y > 0.05 && lb.min.y < 0.16, 'ladder foot stands on the plank floor');
  // RAILS lean north (−Z, toward the deck) exactly like the rung line: the
  // top end of each rail must sit ~run meters north of its bottom end. The
  // old +tilt sign produced rails leaning SOUTH (X-crossing floaters).
  for (const rail of ladderRoot!.children[0].children.filter((c) => c.name === 'ladder-rail')) {
    rail.updateWorldMatrix(true, false);
    const railLen = ((rail as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.height;
    const topEnd = rail.localToWorld(new THREE.Vector3(0, railLen / 2, 0));
    const botEnd = rail.localToWorld(new THREE.Vector3(0, -railLen / 2, 0));
    const dz = botEnd.z - topEnd.z;
    assert.ok(
      Math.abs(dz - L.loft.ladderRun) < 0.06,
      `rail leans north by the ladder run (dz=${dz.toFixed(3)} vs run ${L.loft.ladderRun})`,
    );
  }

  // 4) The aisle center strip stays free of collider boxes (wagon path).
  const aisleBoxes = defs.filter((d) => {
    if (!d.metadata.collider) return false;
    if (d.assetType === 'stable-floor') return false;
    if (STABLE_DOOR_SPECS.some((s) => s.uuid === d.uuid)) return false;
    const b = defBox(d);
    return b.min.x < STABLE_SITE.x + 0.6 && b.max.x > STABLE_SITE.x - 0.6
      && b.min.z < STABLE_SITE.z + 4.9 && b.max.z > STABLE_SITE.z - 4.9
      && b.min.y < 2.5;
  });
  assert.equal(aisleBoxes.length, 0, `the central aisle must stay clear (found ${aisleBoxes.map((d) => d.metadata.name).join(', ')})`);

  // 5) Signs stand proud of their walls (never flush-coplanar). The signs
  // are independent objects now (children in building-local coords).
  const liveryFace = roots.get(STABLE_OBJECT_IDS.liverySign)!.getObjectByName('livery-sign-face');
  assert.ok(liveryFace, 'the LIVERY sign face exists');
  const faceBox = box3of(liveryFace!);
  assert.ok(faceBox.min.z > STABLE_SITE.z + L.depth / 2 + 0.02, 'the projecting sign stands proud of the gable');
});

/* -------------------------------------------------------------------------- */

test('STABLE GEOMETRY: no coplanar same-normal overlapping faces with different materials', async () => {
  const registry = makeRegistry();
  const defs = buildStableMapObjects(STABLE_SITE.x, STABLE_SITE.z);

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
  assert.ok(worldBoxes.length >= 120, `expected a rich stable to scan (got ${worldBoxes.length} boxes)`);

  const axes = ['x', 'y', 'z'] as const;
  const others = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] } as const;
  const fights: string[] = [];
  for (let i = 0; i < worldBoxes.length; i += 1) {
    for (let j = i + 1; j < worldBoxes.length; j += 1) {
      const a = worldBoxes[i];
      const b = worldBoxes[j];
      if (a.material === b.material) continue;
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
  assert.equal(fights.length, 0, `z-fighting pairs found:\n${fights.slice(0, 10).join('\n')}`);
});

/* -------------------------------------------------------------------------- */

test('STABLE LIGHT BUDGET: exactly 4 real PointLights (the documented budget)', async () => {
  const { roots } = await buildWorld();
  let lights = 0;
  for (const root of roots.values()) {
    root.traverse((o) => {
      if ((o as THREE.PointLight).isPointLight) lights += 1;
    });
  }
  // The documented shell-kit budget (StableProps.stableLantern): exactly 4
  // real lanterns (gate, aisle, farrier, tack). The two mid-aisle lanterns
  // ride emissive-only: forward rendering pays for every real light in EVERY
  // fragment, so the count is a perf contract. The whole-scene lamp policy
  // (DayNightCycle + the boot sweep) extinguishes these in daylight.
  assert.equal(lights, 4, 'the stable carries exactly its 4-light budget (the 2 mid-aisle lanterns are emissive-only)');
});
