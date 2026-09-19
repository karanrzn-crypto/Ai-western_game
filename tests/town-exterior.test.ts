/**
 * TownExteriorAssetFactory tests — the review lock (8-section spec).
 *
 *  1. REGISTRY — every type registers on a REAL AssetRegistry, creates,
 *     and the factory never applies the def transform (the adapter owns it).
 *  2. SCALE — real 1.83 m player: every house door leaf ≥ 1.9 m tall and
 *     ≥ 0.8 m wide; ridge ordering wealthy > family ≈ farm > worker ≈
 *     abandoned; nothing reads as a toy next to the player.
 *  3. IDENTITY — each house carries its signature features (porch rail +
 *     flower boxes, columns + balcony + cupola + stone base, shed + fence +
 *     trough, weeds + boards + broken windows, plain worker).
 *  4. PERFORMANCE — the module texture/material caches: building every
 *     house TWICE must not add a single new material; per-house mesh counts
 *     stay bounded (the merge pass folds them at runtime); builds are
 *     deterministic (seeded RNG, no Math.random).
 *  5. ROOFS — the gable eave lands on the wall top, the infill is buried
 *     (never coplanar), the butcher awning's low edge sits on its scallop
 *     line, the porch roof slopes high-at-wall / low-at-street.
 *  6. COLLISION — TOWN_EXTERIOR_COLLIDERS boxes cover each building's body
 *     footprint and never exceed it by more than 25 cm on any side.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  AssetRegistry,
  TOWN_EXTERIOR_ASSET_TYPES,
  TOWN_EXTERIOR_COLLIDERS,
  registerTownExteriorFactories,
  buildButcherStall,
  buildWorkerHouse,
  buildFamilyHouse,
  buildWealthyTownhouse,
  buildFarmhouse,
  buildAbandonedHouse,
} from '../src/index.js';

function stats(root: THREE.Object3D): { meshes: number; vertices: number; materials: Set<THREE.Material>; ridgeY: number } {
  let meshes = 0;
  let vertices = 0;
  const materials = new Set<THREE.Material>();
  let ridgeY = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes += 1;
    if (m.geometry.attributes.position) vertices += m.geometry.attributes.position.count;
    materials.add(Array.isArray(m.material) ? m.material[0]! : m.material);
    ridgeY = Math.max(ridgeY, m.position.y);
  });
  return { meshes, vertices, materials, ridgeY };
}

function bboxOf(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

/** World-space height of the FIRST door-unit's leaf under a house root. */
function doorProbe(root: THREE.Object3D): { height: number; width: number } {
  const door = root.getObjectByName('door-unit');
  assert.ok(door, 'every house carries a door-unit');
  const leaf = door.getObjectByName('door-leaf');
  assert.ok(leaf, 'the door-unit carries a leaf mesh');
  const box = new THREE.Box3().setFromObject(leaf);
  return { height: box.max.y - box.min.y, width: box.max.x - box.min.x };
}

/* ---------- 1. REGISTRY --------------------------------------------------- */

test('TOWN EXTERIOR: every type registers on the real registry and creates', async () => {
  const registry = new AssetRegistry();
  registerTownExteriorFactories(registry);
  for (const t of TOWN_EXTERIOR_ASSET_TYPES) {
    assert.ok(registry.has(t), `${t} registered`);
    const obj = await registry.create({
      uuid: `70000000-0000-4000-8000-0000000000${Math.floor(Math.random() * 9)}`,
      assetType: t,
      transform: { position: { x: 5, y: 0, z: 5 }, rotation: { x: 0, y: 33, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      metadata: { name: t },
    });
    assert.ok(obj, `${t} creates`);
  }
});

test('TOWN EXTERIOR: factories never apply the def transform (adapter owns it)', async () => {
  const registry = new AssetRegistry();
  registerTownExteriorFactories(registry);
  const obj = await registry.create({
    uuid: '70000000-0000-4000-8000-0000000000aa',
    assetType: 'house-worker',
    transform: { position: { x: 42, y: 3, z: -17 }, rotation: { x: 0, y: 90, z: 0 }, scale: { x: 2, y: 2, z: 2 } },
    metadata: { name: 'unmoved' },
  });
  assert.equal(obj.position.x, 0, 'position untouched');
  assert.equal(obj.scale.x, 1, 'scale untouched');
  assert.equal(obj.rotation.y, 0, 'rotation untouched');
});

/* ---------- 2. SCALE ------------------------------------------------------ */

test('TOWN EXTERIOR: every house door is real-person scale (≥1.9 m × ≥0.8 m)', () => {
  for (const build of [buildWorkerHouse, buildFamilyHouse, buildWealthyTownhouse, buildFarmhouse, buildAbandonedHouse]) {
    const house = build();
    const probe = doorProbe(house);
    assert.ok(probe.height >= 1.9, `${house.name} door height ${probe.height.toFixed(2)}m ≥ 1.9 (the 1.83 m Ranger clears it)`);
    assert.ok(probe.width >= 0.8, `${house.name} door width ${probe.width.toFixed(2)}m ≥ 0.8`);
  }
});

test('TOWN EXTERIOR: nothing reads as a toy — heights vs the 1.83 m player', () => {
  const heightOf = (root: THREE.Object3D): number => {
    const box = bboxOf(root);
    return box.max.y;
  };
  const worker = heightOf(buildWorkerHouse());
  const family = heightOf(buildFamilyHouse());
  const wealthy = heightOf(buildWealthyTownhouse());
  const farm = heightOf(buildFarmhouse());
  const abandoned = heightOf(buildAbandonedHouse());
  // the smallest house is well over twice the player's stature
  assert.ok(Math.min(worker, abandoned) > 3.5, `worker/abandoned ridge ${Math.min(worker, abandoned).toFixed(2)}m — not toy scale`);
  assert.ok(wealthy > family && family > worker, `landmark ordering: wealthy ${wealthy.toFixed(2)} > family ${family.toFixed(2)} > worker ${worker.toFixed(2)}`);
  assert.ok(farm > worker, `farm reads taller than the worker house: ${farm.toFixed(2)} vs ${worker.toFixed(2)}`);
});

test('TOWN EXTERIOR: the identity SCALE GAP is real (footprints differ per house)', () => {
  const footprint = (root: THREE.Object3D): number => {
    const box = bboxOf(root);
    return (box.max.x - box.min.x) * (box.max.z - box.min.z);
  };
  const worker = footprint(buildWorkerHouse());
  const family = footprint(buildFamilyHouse());
  const wealthy = footprint(buildWealthyTownhouse());
  assert.ok(wealthy > family && family > worker, `footprints: wealthy > family > worker (${wealthy.toFixed(1)} / ${family.toFixed(1)} / ${worker.toFixed(1)} m²)`);
});

/* ---------- 3. IDENTITY --------------------------------------------------- */

test('TOWN EXTERIOR: each house carries its signature features', () => {
  const family = buildFamilyHouse();
  assert.ok(family.getObjectByName('porch'), 'family: covered porch');
  assert.ok(family.getObjectByName('porch-deck'), 'family: porch deck');
  assert.ok(family.getObjectByName('flower-box'), 'family: flower boxes (decorated, tidy)');
  assert.ok(family.getObjectByName('chimney-shaft'), 'family: chimney');

  const wealthy = buildWealthyTownhouse();
  assert.ok(wealthy.getObjectByName('stone-base'), 'wealthy: stone base (landmark weight)');
  assert.ok(wealthy.getObjectByName('balcony-floor'), 'wealthy: balcony');
  assert.ok(wealthy.getObjectByName('cupola-base'), 'wealthy: cupola');
  const columns = wealthy.children.filter((c) => (c as THREE.Mesh).isMesh && ((c as THREE.Mesh).geometry as THREE.CylinderGeometry).parameters?.radiusTop !== undefined).length;
  void columns;
  let capitalCount = 0;
  wealthy.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === 'CylinderGeometry') capitalCount += 1; });
  assert.ok(capitalCount >= 8, `wealthy: column+capital cylinders (${capitalCount})`);

  const farm = buildFarmhouse();
  assert.ok(farm.getObjectByName('shed-body'), 'farm: lean-to shed');
  let fenceSections = 0;
  farm.traverse((o) => { if (o.name === 'fence-section') fenceSections += 1; });
  assert.ok(fenceSections >= 4, `farm: fenced yard (${fenceSections} sections)`);
  assert.ok(farm.getObjectByName('water-trough') || farm.getObjectByName('trough-water'), 'farm: water trough');
  assert.ok(farm.getObjectByName('firewood-stack'), 'farm: firewood');

  const abandoned = buildAbandonedHouse();
  let weeds = 0;
  let boards = 0;
  abandoned.traverse((o) => {
    if (o.name === 'weed-clump') weeds += 1;
    if ((o as THREE.Mesh).isMesh && o.name.startsWith('window-') === false && (o as THREE.Mesh).geometry.type === 'BoxGeometry') {
      const box = o as THREE.Mesh;
      const p = (box.geometry as THREE.BoxGeometry).parameters;
      if (p && p.height < 0.2 && p.width < 0.8 && p.depth < 0.06) boards += 1;
    }
  });
  assert.ok(weeds >= 6, `abandoned: overgrown weeds (${weeds} clumps)`);
  assert.ok(boards >= 3, `abandoned: patch boards (${boards})`);
  const boarded = abandoned.getObjectByName('window-pane');
  assert.ok(boarded, 'abandoned: broken/boarded windows present');

  const worker = buildWorkerHouse();
  assert.ok(!worker.getObjectByName('porch'), 'worker: NO porch (plain identity)');
  assert.ok(!worker.getObjectByName('balcony-floor'), 'worker: no balcony');
});

test('TOWN EXTERIOR: the butcher stall reads AS a butcher (§3)', () => {
  const stall = buildButcherStall();
  assert.ok(stall.getObjectByName('cutting-board'), 'big cutting board');
  assert.ok(stall.getObjectByName('cleaver-blade'), 'cleaver');
  assert.ok(stall.getObjectByName('scale-pan'), 'balance scale');
  assert.ok(stall.getObjectByName('price-board'), 'hand-written price board');
  let hides = 0;
  stall.traverse((o) => { if (o.name.startsWith('stall-hide-')) hides += 1; });
  assert.ok(hides >= 3, `multiple hides, varied (${hides})`);
  let blood = 0;
  stall.traverse((o) => { if (o.name.startsWith('blood-stain-')) blood += 1; });
  assert.ok(blood >= 2, `subtle blood stains present (${blood})`);
  let cuts = 0;
  stall.traverse((o) => { if (o.name === 'hanging-meat-cut') cuts += 1; });
  assert.ok(cuts >= 4, `hanging meat cuts (${cuts})`);
});

/* ---------- 4. PERFORMANCE ------------------------------------------------ */

test('TOWN EXTERIOR: material cache — building everything TWICE adds zero materials', () => {
  const before = new Set<THREE.Material>();
  const builders = [buildButcherStall, buildWorkerHouse, buildFamilyHouse, buildWealthyTownhouse, buildFarmhouse, buildAbandonedHouse];
  for (const build of builders) {
    stats(build()).materials.forEach((m) => before.add(m));
  }
  const after = new Set<THREE.Material>(before);
  for (const build of builders) {
    stats(build()).materials.forEach((m) => after.add(m));
  }
  assert.equal(after.size, before.size, `second pass added ${after.size - before.size} new materials (cache must absorb every repeat)`);
});

test('TOWN EXTERIOR: mesh counts stay bounded (merge pass folds them at runtime)', () => {
  const budget: Record<string, number> = {
    'butcher-stall': 150,
    'house-worker': 60,
    'house-family': 110,
    'house-wealthy': 160,
    'house-farmstead': 140,
    'house-abandoned': 160,
  };
  const builds: Array<[string, () => THREE.Group]> = [
    ['butcher-stall', buildButcherStall],
    ['house-worker', buildWorkerHouse],
    ['house-family', buildFamilyHouse],
    ['house-wealthy', buildWealthyTownhouse],
    ['house-farmstead', buildFarmhouse],
    ['house-abandoned', buildAbandonedHouse],
  ];
  for (const [name, build] of builds) {
    const s = stats(build());
    assert.ok(s.meshes <= budget[name]!, `${name}: ${s.meshes} meshes ≤ ${budget[name]}`);
  }
});

test('TOWN EXTERIOR: headless builds paint ZERO canvases and stay deterministic', () => {
  const builders = [buildButcherStall, buildWorkerHouse, buildFamilyHouse, buildWealthyTownhouse, buildFarmhouse, buildAbandonedHouse];
  const first = builders.map((b) => stats(b()));
  const second = builders.map((b) => stats(b()));
  first.forEach((s, i) => {
    assert.equal(s.meshes, second[i]!.meshes, `deterministic mesh count for build ${i}`);
    assert.equal(s.vertices, second[i]!.vertices, `deterministic vertex count for build ${i}`);
    s.materials.forEach((m) => {
      const std = m as THREE.MeshStandardMaterial;
      assert.ok(!std.map, 'headless textures fall back to flat colors (no DOM)');
    });
  });
});

/* ---------- 5. ROOFS ------------------------------------------------------ */

test('TOWN EXTERIOR: gable eave lands on the wall top; infill buried, not coplanar', () => {
  const house = buildWorkerHouse();
  const body = house.getObjectByName('house-body') as THREE.Mesh;
  assert.ok(body, 'worker body box present');
  const wallTop = body.position.y + (body.geometry as THREE.BoxGeometry).parameters.height / 2;
  const roof = house.getObjectByName('gable-roof')!;
  assert.ok(roof, 'gable roof present');
  // the ridge cap sits at wallHeight + ridgeRise
  const cap = roof.getObjectByName('ridge-cap') as THREE.Mesh;
  assert.ok(Math.abs(cap.position.y - (wallTop + 1.15)) < 1e-6, 'ridge cap at wallHeight + ridgeRise');
  // the infill base is BURIED below the wall top (overlap, never coplanar)
  let infillMinY = Infinity;
  roof.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry.type === 'ExtrudeGeometry') infillMinY = Math.min(infillMinY, m.position.y);
  });
  assert.ok(infillMinY < wallTop - 0.008, `infill base buried ${(wallTop - infillMinY).toFixed(3)}m below the wall top`);
  assert.ok(infillMinY > wallTop - 0.03, 'infill is buried, not sunk (≤3 cm)');
});

test('TOWN EXTERIOR: the butcher awning low edge sits on its scallop line', () => {
  const stall = buildButcherStall();
  const awning = stall.getObjectByName('shed-roof')!;
  assert.ok(awning, 'awning shed roof present');
  const scallops: THREE.Mesh[] = [];
  stall.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry.type === 'ConeGeometry') scallops.push(m);
  });
  assert.ok(scallops.length >= 8, 'scalloped trim present');
  const avgScallopZ = scallops.reduce((s, m) => s + m.position.z, 0) / scallops.length;
  const avgScallopY = scallops.reduce((s, m) => s + m.position.y, 0) / scallops.length;
  // the awning panel's low edge in WORLD space: group offset + panel + half run
  const panel = awning.children[0] as THREE.Mesh;
  const slopeLen = (panel.geometry as THREE.BoxGeometry).parameters.depth;
  const angle = Math.abs(panel.rotation.x);
  const halfRun = (slopeLen / 2) * Math.cos(angle);
  const halfDrop = (slopeLen / 2) * Math.sin(angle);
  const lowEdgeZ = awning.position.z + panel.position.z + halfRun;
  const lowEdgeY = panel.position.y - halfDrop;
  assert.ok(Math.abs(lowEdgeZ - avgScallopZ) < 0.15, `awning low edge z=${lowEdgeZ.toFixed(3)} vs scallop line z=${avgScallopZ.toFixed(3)}`);
  assert.ok(Math.abs(lowEdgeY - avgScallopY) < 0.2, `awning low edge y=${lowEdgeY.toFixed(3)} vs scallop y=${avgScallopY.toFixed(3)}`);
});

test('TOWN EXTERIOR: the family porch roof slopes high-at-wall / low-at-street', () => {
  const house = buildFamilyHouse();
  const porch = house.getObjectByName('porch')!;
  const roofGroup = porch.getObjectByName('shed-roof')!;
  assert.ok(roofGroup, 'porch carries its shed roof');
  const panel = roofGroup.children[0] as THREE.Mesh;
  const slopeLen = (panel.geometry as THREE.BoxGeometry).parameters.depth;
  const angle = Math.abs(panel.rotation.x);
  // world z of the two edges (porch sits at +z of the house; roof rotated 0)
  const halfRun = (slopeLen / 2) * Math.cos(angle);
  const highZ = roofGroup.position.z + panel.position.z - halfRun;
  const lowZ = roofGroup.position.z + panel.position.z + halfRun;
  assert.ok(lowZ > highZ + 0.8, `roof runs ${((lowZ - highZ)).toFixed(2)}m toward the street`);
  const highY = panel.position.y + (slopeLen / 2) * Math.sin(angle);
  const lowY = panel.position.y - (slopeLen / 2) * Math.sin(angle);
  assert.ok(highY > lowY + 0.3, 'the HIGH edge is at the house (water runs away from the door)');
});

/* ---------- 6. COLLISION -------------------------------------------------- */

test('TOWN EXTERIOR: collider boxes cover each building BODY without ballooning', () => {
  // The collider protects the SHELL (walls) — yard props (crates, fences,
  // rakes) deliberately stick out and stay decorative, exactly like the
  // saloon's collider:false chairs. Measure the named body meshes only.
  const cases: Array<[string, () => THREE.Group, string[]]> = [
    ['house-worker', buildWorkerHouse, ['house-body']],
    ['house-family', buildFamilyHouse, ['stone-base', 'wood-upper']],
    ['house-wealthy', buildWealthyTownhouse, ['stone-base', 'house-body']],
    ['house-farmstead', buildFarmhouse, ['house-body', 'shed-body']],
    ['house-abandoned', buildAbandonedHouse, ['house-body']],
    ['butcher-stall', buildButcherStall, ['stall-back-wall', 'stall-side-wall-w', 'stall-side-wall-e', 'stall-counter']],
  ];
  for (const [type, build, bodyNames] of cases) {
    const payload = TOWN_EXTERIOR_COLLIDERS[type];
    assert.ok(payload && payload.boxes.length >= 1, `${type} ships collider boxes`);
    const boxes = payload.boxes;
    const root = build();
    const body = new THREE.Box3();
    for (const name of bodyNames) {
      const meshNode = root.getObjectByName(name) as THREE.Mesh | null;
      assert.ok(meshNode, `${type}: body mesh "${name}" present`);
      body.union(new THREE.Box3().setFromObject(meshNode));
    }
    // union of the collider boxes (XZ) must COVER the body footprint…
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.offset.x - b.size.x / 2);
      maxX = Math.max(maxX, b.offset.x + b.size.x / 2);
      minZ = Math.min(minZ, b.offset.z - b.size.z / 2);
      maxZ = Math.max(maxZ, b.offset.z + b.size.z / 2);
    }
    assert.ok(minX <= body.min.x + 0.06 && maxX >= body.max.x - 0.06, `${type} colliders span X (${minX.toFixed(2)}..${maxX.toFixed(2)} vs body ${body.min.x.toFixed(2)}..${body.max.x.toFixed(2)})`);
    assert.ok(minZ <= body.min.z + 0.06 && maxZ >= body.max.z - 0.06, `${type} colliders span Z (${minZ.toFixed(2)}..${maxZ.toFixed(2)} vs body ${body.min.z.toFixed(2)}..${body.max.z.toFixed(2)})`);
    // …and never BALLOON past the body footprint by more than 25 cm
    assert.ok(body.min.x - minX <= 0.25 && maxX - body.max.x <= 0.25, `${type} collider X not oversized`);
    assert.ok(body.min.z - minZ <= 0.25 && maxZ - body.max.z <= 0.25, `${type} collider Z not oversized`);
    // the box top never floats absurdly above the walls (no roof slab)
    let topY = -Infinity;
    for (const b of boxes) topY = Math.max(topY, b.offset.y + b.size.y / 2);
    assert.ok(topY <= body.max.y + 0.3, `${type} collider top ${topY.toFixed(2)}m hugs the walls (≤ body top + 0.3)`);
  }
});
