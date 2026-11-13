/**
 * src/assets/countryside/CountryBuildings.ts
 * -----------------------------------------------------------------------------
 * The countryside's NEW building types (world-expansion round, user spec §2/§3)
 * — built in the EXACT TownExteriorAssetFactory conventions:
 *
 *   • real-size composite builders (walls + roof + details), def scale stays
 *     (1,1,1), MergeStatic buckets them per material → a few draw calls each
 *   • shared TownMaterials singleton — no new shader programs
 *   • every type ships EXACT local collider boxes in the CollisionWorld form
 *     ({ boxes: [{ size, offset }] }) via COUNTRY_COLLIDERS — collision ==
 *     visual, nothing oversized, open sides stay walkable
 *   • headless-safe (materials come from the singleton's flat fallbacks)
 *
 * TYPES
 *   "barn-hay"          big weathered barn: gable roof, sliding doors, loft
 *   "shed-equipment"    open-front equipment shed: 3 walls, shed roof, bench
 *   "cabin-remote"      remote log cabin: low roof, stone chimney, porch
 *   "coop-chicken"      raised chicken coop on posts + ramp + nest boxes
 *   "pig-shelter"       low three-sided open pig shelter
 *   "silo-grain"        tall grain silo: cylinder + dome + ladder
 *
 * The builders face +Z (front) — placement yaw is the ONLY placement math,
 * same contract as the town exteriors.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { AssetRegistry } from '../AssetRegistry.js';
import { getTownMaterials } from '../town/TownMaterials.js';

const M = getTownMaterials();

/** Shared box helper (same shadow-floor convention as TownProps.addBox). */
function box(
  parent: THREE.Object3D,
  material: THREE.Material,
  sx: number, sy: number, sz: number,
  x: number, y: number, z: number,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.castShadow = Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz)) >= 0.25;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Gable roof from two sloped slabs meeting at the ridge (+Z gable ends). */
function gableRoof(
  parent: THREE.Object3D,
  w: number, depth: number, rise: number,
  yBase: number, name: string,
  overhang = 0.3,
): void {
  const slope = Math.hypot(depth / 2 + overhang, rise);
  const angle = Math.atan2(rise, depth / 2 + overhang);
  const midY = yBase + rise / 2;
  const north = box(parent, M.shingleDark, w + overhang * 2, 0.09, slope, 0, midY, -(depth / 4 + overhang / 4), `${name}-roof-n`);
  north.rotation.x = angle;
  const south = box(parent, M.shingleDark, w + overhang * 2, 0.09, slope, 0, midY, depth / 4 + overhang / 4, `${name}-roof-s`);
  south.rotation.x = -angle;
  // gable end infills, buried 15 mm below the wall top — no z-fighting
  const gableGeo = new THREE.BufferGeometry();
  const hw = (w + overhang * 2) / 2;
  gableGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -hw, 0, 0, hw, 0, 0, 0, rise, 0,
  ], 3));
  gableGeo.computeVertexNormals();
  for (const [z, label] of [[-depth / 2, 'n'], [depth / 2, 's']] as const) {
    const gable = new THREE.Mesh(gableGeo, M.plankB);
    gable.position.set(0, yBase - 0.015, z);
    gable.name = `${name}-gable-${label}`;
    gable.castShadow = true;
    parent.add(gable);
  }
}

/* -------------------------------------------------------------------------- */
/* barn-hay — the big working barn                                            */
/* -------------------------------------------------------------------------- */

/** 7.6 × 10.8 m barn: plank walls, tall gable, sliding doors, hay loft door. */
export function buildHayBarn(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'barn-hay';
  const W = 7.6;
  const D = 10.8;
  const WALL = 3.6;
  // walls (front +Z has the door opening between the door posts)
  box(g, M.plankA, W, WALL, 0.22, 0, WALL / 2, -D / 2, 'barn-wall-n');
  box(g, M.plankA, 0.22, WALL, D, -W / 2, WALL / 2, 0, 'barn-wall-w');
  box(g, M.plankA, 0.22, WALL, D, W / 2, WALL / 2, 0, 'barn-wall-e');
  // front wall in three pieces around the 3.4 m door opening
  const postW = (W - 3.4) / 2;
  box(g, M.plankA, postW, WALL, 0.22, -(W / 2 - postW / 2), WALL / 2, D / 2, 'barn-wall-front-w');
  box(g, M.plankA, postW, WALL, 0.22, W / 2 - postW / 2, WALL / 2, D / 2, 'barn-wall-front-e');
  box(g, M.plankA, 3.4, WALL - 2.4, 0.22, 0, WALL - (WALL - 2.4) / 2, D / 2, 'barn-wall-front-top');
  // sliding doors (ajar, decor) + rails
  box(g, M.plankB, 1.65, 2.35, 0.08, -0.9, 1.175, D / 2 + 0.05, 'barn-door-l');
  box(g, M.plankB, 1.65, 2.35, 0.08, 1.05, 1.175, D / 2 + 0.05, 'barn-door-r');
  box(g, M.woodDark, W + 0.3, 0.12, 0.12, 0, 2.5, D / 2 + 0.18, 'barn-door-rail');
  // hay loft door + hoist beam up top
  box(g, M.woodDark, 1.3, 1.3, 0.1, 0, WALL + 1.15, D / 2 + 0.03, 'barn-loft-door');
  box(g, M.woodGray, 0.16, 0.16, 1.5, 0, WALL + 2.05, D / 2 + 0.45, 'barn-hoist-beam');
  gableRoof(g, W, D, 2.1, WALL, 'barn');
  // corner trim boards + stone base course — the trim's top buries 2 cm BELOW
  // the wall top plane (anti-coplanar rule; flush tops flicker at y 3.6)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    box(g, M.woodDark, 0.3, WALL - 0.02, 0.3, (sx * W) / 2, (WALL - 0.02) / 2, (sz * D) / 2, `barn-corner-${sx}-${sz}`);
  }
  box(g, M.stone, W + 0.14, 0.35, D + 0.14, 0, 0.175, 0, 'barn-base');
  return g;
}

/* -------------------------------------------------------------------------- */
/* shed-equipment — open-front tool & implement shed                          */
/* -------------------------------------------------------------------------- */

/** 6.2 × 4.6 m shed: back + side walls, shed roof on 3 front posts, bench. */
export function buildEquipmentShed(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'shed-equipment';
  const W = 6.2;
  const D = 4.6;
  const BACK = 2.9;
  const FRONT = 2.3;
  box(g, M.plankC, W, BACK, 0.2, 0, BACK / 2, -D / 2, 'shed-wall-n');
  box(g, M.plankC, 0.2, BACK, D, -W / 2, BACK / 2, 0, 'shed-wall-w');
  box(g, M.plankC, 0.2, BACK, D, W / 2, BACK / 2, 0, 'shed-wall-e');
  // shed roof: high at the back, low at the front — one slab
  const slope = Math.hypot(D + 0.5, BACK - FRONT + 0.35);
  const roof = box(g, M.shingle, W + 0.6, 0.09, slope, 0, (BACK + FRONT) / 2 + 0.15, 0, 'shed-roof');
  roof.rotation.x = Math.atan2(BACK - FRONT, D);
  for (const x of [-W / 2 + 0.25, 0, W / 2 - 0.25]) {
    box(g, M.woodGray, 0.18, FRONT, 0.18, x, FRONT / 2, D / 2 - 0.25, `shed-post-${x}`);
  }
  // workbench + tool wall + crate
  box(g, M.plankB, 3.2, 0.1, 0.8, -1.2, 0.92, -D / 2 + 0.55, 'shed-bench-top');
  box(g, M.woodDark, 0.12, 0.9, 0.12, -2.6, 0.45, -D / 2 + 0.55, 'shed-bench-leg-w');
  box(g, M.woodDark, 0.12, 0.9, 0.12, 0.2, 0.45, -D / 2 + 0.55, 'shed-bench-leg-e');
  box(g, M.iron, 0.09, 0.6, 0.05, -0.6, 1.6, -D / 2 + 0.12, 'shed-tool-rake');
  box(g, M.ironLight, 0.09, 0.5, 0.05, -0.3, 1.55, -D / 2 + 0.12, 'shed-tool-shovel');
  box(g, M.woodMed, 0.7, 0.55, 0.7, 1.9, 0.275, -D / 2 + 0.5, 'shed-crate');
  return g;
}

/* -------------------------------------------------------------------------- */
/* cabin-remote — the lonely log cabin                                        */
/* -------------------------------------------------------------------------- */

/** 4.8 × 4.0 m cabin: stacked-log walls, low gable, stone chimney, porch. */
export function buildRemoteCabin(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cabin-remote';
  const W = 4.8;
  const D = 4.0;
  const WALL = 2.5;
  // stacked-log walls: 6 courses per side (cheap boxes, MergeStatic merges)
  const course = WALL / 6;
  for (let i = 0; i < 6; i += 1) {
    const y = course * (i + 0.5);
    const logM = i % 2 ? M.woodMed : M.plankC;
    box(g, logM, W, course, 0.24, 0, y, -D / 2, `cabin-log-n-${i}`);
    if (i > 3) box(g, logM, W, course, 0.24, 0, y, D / 2, `cabin-log-s-${i}`); // door gap below
    box(g, logM, 0.24, course, D, -W / 2, y, 0, `cabin-log-w-${i}`);
    box(g, logM, 0.24, course, D, W / 2, y, 0, `cabin-log-e-${i}`);
  }
  // door (blocking slab handled by collider) + one window
  box(g, M.woodDark, 0.95, 1.95, 0.08, 0.6, 0.975, D / 2 + 0.02, 'cabin-door');
  box(g, M.woodDark, 0.95, 0.85, 0.1, -1.2, 1.35, D / 2 + 0.02, 'cabin-window');
  box(g, M.ironLight, 0.8, 0.7, 0.03, -1.2, 1.35, D / 2 + 0.09, 'cabin-window-pane');
  gableRoof(g, W, D, 1.25, WALL, 'cabin', 0.45);
  // stone chimney, outside the east wall
  box(g, M.stone, 0.85, WALL + 1.5, 0.85, W / 2 + 0.55, (WALL + 1.5) / 2, -0.7, 'cabin-chimney');
  // tiny stoop + lantern post
  box(g, M.plankB, 1.6, 0.14, 1.0, 0.6, 0.07, D / 2 + 0.5, 'cabin-stoop');
  box(g, M.woodDark, 0.12, 1.6, 0.12, 1.7, 0.8, D / 2 + 0.7, 'cabin-lamp-post');
  box(g, M.lanternGlass, 0.16, 0.22, 0.16, 1.7, 1.7, D / 2 + 0.7, 'cabin-lamp');
  // firewood against the west wall
  box(g, M.bark, 0.5, 0.85, 1.3, -W / 2 - 0.35, 0.425, 0.9, 'cabin-firewood');
  return g;
}

/* -------------------------------------------------------------------------- */
/* coop-chicken — the raised henhouse                                         */
/* -------------------------------------------------------------------------- */

/** 2.0 × 2.8 m coop on 4 posts + ramp + nest boxes + feed tray. */
export function buildChickenCoop(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'coop-chicken';
  const W = 2.0;
  const D = 2.8;
  const FLOOR = 0.62;
  const H = 0.95;
  box(g, M.plankB, W, H, D, 0, FLOOR + H / 2, 0, 'coop-body');
  // shed roof
  const roof = box(g, M.shingle, W + 0.35, 0.07, D + 0.4, 0, FLOOR + H + 0.28, -0.05, 'coop-roof');
  roof.rotation.x = Math.atan2(0.32, D);
  // dark doorway facing +Z + ramp
  box(g, M.woodDark, 0.42, 0.5, 0.06, -0.4, FLOOR + 0.25, D / 2 + 0.02, 'coop-door');
  const ramp = box(g, M.plankC, 0.5, 0.06, 1.5, -0.4, FLOOR / 2, D / 2 + 0.85, 'coop-ramp');
  ramp.rotation.x = -Math.atan2(FLOOR, 1.45);
  // nest boxes sticking out the east side
  box(g, M.woodMed, 0.55, 0.5, 1.1, W / 2 + 0.3, FLOOR + 0.45, -0.5, 'coop-nests');
  // posts
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    box(g, M.woodDark, 0.16, FLOOR, 0.16, (sx * (W - 0.3)) / 2, FLOOR / 2, (sz * (D - 0.3)) / 2, `coop-post-${sx}-${sz}`);
  }
  box(g, M.woodMed, 0.7, 0.1, 0.5, 0.7, 0.05, D / 2 + 0.5, 'coop-feed-tray');
  return g;
}

/* -------------------------------------------------------------------------- */
/* pig-shelter — the low three-sided sty                                      */
/* -------------------------------------------------------------------------- */

/** 3.2 × 2.8 m open-front shelter, half-height side walls, mud pad. */
export function buildPigShelter(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'pig-shelter';
  const W = 3.2;
  const D = 2.8;
  const BACK = 1.5;
  const FRONT = 1.1;
  box(g, M.plankC, W, BACK, 0.18, 0, BACK / 2, -D / 2, 'pig-wall-n');
  box(g, M.plankC, 0.18, BACK, D, -W / 2, BACK / 2, 0, 'pig-wall-w');
  box(g, M.plankC, 0.18, BACK, D, W / 2, BACK / 2, 0, 'pig-wall-e');
  const slope = Math.hypot(D + 0.4, BACK - FRONT);
  const roof = box(g, M.shingle, W + 0.4, 0.07, slope, 0, (BACK + FRONT) / 2 + 0.05, 0, 'pig-roof');
  roof.rotation.x = Math.atan2(BACK - FRONT, D);
  box(g, M.dirtPatch, W - 0.6, 0.05, D + 1.4, 0, 0.025, 0.7, 'pig-mud-pad');
  box(g, M.woodMed, 0.8, 0.18, 0.5, -0.8, 0.09, -D / 2 + 0.5, 'pig-trough');
  return g;
}

/* -------------------------------------------------------------------------- */
/* silo-grain — the tall silo                                                 */
/* -------------------------------------------------------------------------- */

/** r 1.7 × 7.2 m silo: 12-segment cylinder body + dome cap + ladder rails. */
export function buildGrainSilo(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'silo-grain';
  const H = 7.2;
  const R = 1.7;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 12), M.plankB);
  body.position.y = H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  body.name = 'silo-body';
  g.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.ironLight);
  dome.position.y = H;
  dome.castShadow = true;
  dome.name = 'silo-dome';
  g.add(dome);
  box(g, M.stone, R * 2.1, 0.3, R * 2.1, 0, 0.15, 0, 'silo-base');
  // ladder rails
  box(g, M.iron, 0.06, H * 0.8, 0.06, R + 0.12, H * 0.4, 0, 'silo-ladder-a');
  box(g, M.iron, 0.06, H * 0.8, 0.06, R + 0.12, H * 0.4, 0.4, 'silo-ladder-b');
  for (let i = 1; i < 7; i += 1) box(g, M.iron, 0.05, 0.05, 0.4, R + 0.12, i * H * 0.8 / 7, 0.2, `silo-rung-${i}`);
  return g;
}

/* -------------------------------------------------------------------------- */
/* Collision — exact local boxes (the CollisionWorld { size, offset } form)   */
/* -------------------------------------------------------------------------- */

export interface ColliderBoxSpec {
  size: { x: number; y: number; z: number };
  offset: { x: number; y: number; z: number };
}

const bodyBox = (x: number, z: number, wallHeight: number): ColliderBoxSpec =>
  ({ size: { x, y: wallHeight, z }, offset: { x: 0, y: wallHeight / 2, z: 0 } });

/**
 * Per-type collider payloads attached as metadata.collider. Open-front sheds
 * only collide where walls/bench actually are (the open side stays walkable);
 * the barn's tall body blocks through wall height (the roof air stays free).
 */
export const COUNTRY_COLLIDERS: Readonly<Record<string, { readonly boxes: readonly ColliderBoxSpec[] }>> = Object.freeze({
  'barn-hay': Object.freeze({
    boxes: Object.freeze([bodyBox(7.6, 10.8, 3.6)]),
  }),
  'shed-equipment': Object.freeze({
    boxes: Object.freeze([
      { size: { x: 6.2, y: 2.9, z: 0.2 }, offset: { x: 0, y: 1.45, z: -2.2 } },
      { size: { x: 0.2, y: 2.9, z: 4.6 }, offset: { x: -3.0, y: 1.45, z: 0 } },
      { size: { x: 0.2, y: 2.9, z: 4.6 }, offset: { x: 3.0, y: 1.45, z: 0 } },
      { size: { x: 3.2, y: 1.0, z: 0.8 }, offset: { x: -1.2, y: 0.5, z: -1.75 } },
    ]),
  }),
  'cabin-remote': Object.freeze({
    boxes: Object.freeze([
      bodyBox(4.8, 4.0, 2.5),
      { size: { x: 0.85, y: 4.0, z: 0.85 }, offset: { x: 2.95, y: 2.0, z: -0.7 } },
    ]),
  }),
  'coop-chicken': Object.freeze({
    boxes: Object.freeze([
      { size: { x: 2.0, y: 1.62, z: 2.8 }, offset: { x: 0, y: 0.81, z: 0 } },
    ]),
  }),
  'pig-shelter': Object.freeze({
    boxes: Object.freeze([
      { size: { x: 3.2, y: 1.5, z: 0.18 }, offset: { x: 0, y: 0.75, z: -1.31 } },
      { size: { x: 0.18, y: 1.5, z: 2.8 }, offset: { x: -1.51, y: 0.75, z: 0 } },
      { size: { x: 0.18, y: 1.5, z: 2.8 }, offset: { x: 1.51, y: 0.75, z: 0 } },
    ]),
  }),
  'silo-grain': Object.freeze({
    boxes: Object.freeze([
      { size: { x: 3.4, y: 7.2, z: 3.4 }, offset: { x: 0, y: 3.6, z: 0 } },
    ]),
  }),
});

/* -------------------------------------------------------------------------- */
/* country-field — merged-geometry crop field (2 draw calls per field)        */
/* -------------------------------------------------------------------------- */

/**
 * A BIG crop field: all furrow ridges merge into ONE mesh (dirt) and all
 * sprouts merge into ONE mesh (crop green) — the town's TownCropsFactory
 * emits ~300 separate cone meshes per field, which is exactly what the
 * countryside must NOT do at this scale. Metadata: rows / rowGap / length.
 */
export function createCountryFieldFactory(): { create: (definition: ObjectDefinitionLike) => THREE.Group } {
  return {
    create(definition: ObjectDefinitionLike): THREE.Group {
      const g = new THREE.Group();
      g.name = 'country-field';
      const rows = Number(definition.metadata.rows ?? 7);
      const rowGap = Number(definition.metadata.rowGap ?? 1.4);
      const length = Number(definition.metadata.length ?? 10);
      const ridgeParts: THREE.BufferGeometry[] = [];
      const sproutParts: THREE.BufferGeometry[] = [];
      for (let r = 0; r < rows; r += 1) {
        const z = (r - (rows - 1) / 2) * rowGap;
        const ridge = new THREE.BoxGeometry(length, 0.16, 0.42);
        ridge.translate(0, 0.08, z);
        ridgeParts.push(ridge);
        const tufts = Math.floor(length / 0.62);
        for (let i = 0; i < tufts; i += 1) {
          const x = -length / 2 + 0.35 + i * 0.62;
          const h = 0.2 + ((r * 7 + i * 13) % 6) * 0.035;
          const sprout = new THREE.ConeGeometry(0.12, h, 5);
          // base buried 15 mm INTO the ridge top — the anti-coplanar rule
          // (the town gable infills use the same overlap, never flush)
          sprout.translate(x, 0.145 + h / 2, z);
          sproutParts.push(sprout);
        }
      }
      const ridgeMesh = new THREE.Mesh(mergeParts(ridgeParts), M.dirtPatch);
      ridgeMesh.receiveShadow = true;
      ridgeMesh.name = 'country-field-ridges';
      g.add(ridgeMesh);
      const sproutMesh = new THREE.Mesh(mergeParts(sproutParts), M.crop);
      sproutMesh.name = 'country-field-sprouts';
      sproutMesh.castShadow = false;
      g.add(sproutMesh);
      return g;
    },
  };
}

interface ObjectDefinitionLike { metadata: Record<string, unknown> }

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const geo of parts) {
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    for (let i = 0; i < p.count; i += 1) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    geo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

/* -------------------------------------------------------------------------- */
/* Registry wiring                                                            */
/* -------------------------------------------------------------------------- */

export const COUNTRY_BUILDING_TYPES = Object.freeze([
  'barn-hay',
  'shed-equipment',
  'cabin-remote',
  'coop-chicken',
  'pig-shelter',
  'silo-grain',
] as const);

export type CountryBuildingType = (typeof COUNTRY_BUILDING_TYPES)[number];

const builders: Readonly<Record<string, () => THREE.Group>> = {
  'barn-hay': () => buildHayBarn(),
  'shed-equipment': () => buildEquipmentShed(),
  'cabin-remote': () => buildRemoteCabin(),
  'coop-chicken': () => buildChickenCoop(),
  'pig-shelter': () => buildPigShelter(),
  'silo-grain': () => buildGrainSilo(),
};

/** Register every countryside building type with the game's AssetRegistry. */
export function registerCountryFactories(registry: AssetRegistry): void {
  for (const [assetType, build] of Object.entries(builders)) {
    registry.register(assetType, { create: () => build() }, assetType);
  }
  registry.register('country-field', createCountryFieldFactory(), 'Country Crop Field');
}
