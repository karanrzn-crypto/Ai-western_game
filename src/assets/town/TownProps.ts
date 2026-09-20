/**
 * src/assets/town/TownProps.ts
 * -----------------------------------------------------------------------------
 * The TOWN prop factory library — every object the redesigned settlement needs
 * beyond the six building blocks: fences, lamps, benches, barrels, crates,
 * troughs, hay, rocks, wood piles, hitching posts, wagons, signs, vegetation,
 * the static horses, the windmill and the roads/ground.
 *
 * COLLIDER CONTRACT (the project-wide one — see CollisionWorld):
 * A def's collider is the def transform's scale box (yaw-conservative AABB).
 * Therefore EVERY prop that blocks the player is built in UNIT SPACE
 * (geometry inside [−0.5, 0.5]³) and sized by its def scale, so the visual
 * extents and the collider box coincide EXACTLY (no gap, no invisible wall).
 * Purely decorative parts (lantern glass, wheels, canopies, crops) build at
 * real size and carry `collider: false` explicitly.
 *
 * FENCE CONTRACT (user spec §4): every fence section is its OWN def — post +
 * rails as one selectable/movable object. Nothing merges across defs; the
 * sections are never combined into one mesh. Section geometry is unit-space:
 * rails span the full unit X, so the def scale (len, h, t) sizes the section
 * and its collider in one motion (yaw ∈ {0, 90} keeps the AABB exact).
 *
 * All materials come from the shared TownMaterials singleton (headless-safe).
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { IAssetFactory } from '../IAssetFactory.js';
import { getTownMaterials, townSignTexture } from './TownMaterials.js';

const M = getTownMaterials();

/** Shared box helper. Shadow-casting follows the weak-laptop size floor. */
export function addBox(
  parent: THREE.Object3D,
  material: THREE.Material,
  sx: number, sy: number, sz: number,
  x: number, y: number, z: number,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.name = name;
  const biggest = Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz));
  mesh.castShadow = biggest >= 0.25;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Shared cylinder helper (unit-space friendly: pass real local dims). */
export function addCylinder(
  parent: THREE.Object3D,
  material: THREE.Material,
  rTop: number, rBottom: number, h: number, seg: number,
  x: number, y: number, z: number,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material);
  mesh.position.set(x, y, z);
  mesh.name = name;
  const biggest = Math.max(rTop, rBottom, h);
  mesh.castShadow = biggest >= 0.25;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Small deterministic PRNG (mulberry32) for the seeded prop variation. */
function townRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Craggy low-poly blob: detail-0 icosahedron with POSITION-HASHED radial
 *  jitter — identical positions always get identical offsets, so the
 *  non-indexed geometry stays watertight across seams (no cracks) while the
 *  silhouette stops reading as a clean primitive. ~20 tris. */
function townCraggyBlob(radius: number, salt: number, jitter = 0.12): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 0);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const hash = (x: number, y: number, z: number, k: number): number => {
    const t = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 53.13) * 43758.5453;
    return t - Math.floor(t);
  };
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const h1 = hash(v.x, v.y, v.z, salt);
    const h2 = hash(v.x, v.y, v.z, salt + 7);
    v.multiplyScalar(1 + (h1 - 0.5) * 2 * jitter + (h2 - 0.5) * jitter);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/* -------------------------------------------------------------------------- */
/* Ground + roads                                                             */
/* -------------------------------------------------------------------------- */

/** The town ground plane: mottled dusty-dirt canvas texture (metadata.size).
 *  The mesh is wrapped in a GROUP — the adapter applies the def transform to
 *  the returned root, which would overwrite a factory-baked rotation on the
 *  mesh itself (the exact bug that stood the first ground plane on edge). */
export class TownGroundFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'town-ground-root';
    const size = Number(definition.metadata.size ?? 120);
    const safe = Number.isFinite(size) && size > 0 ? size : 120;
    const map = M.ground.map ?? null;
    if (map) {
      map.repeat.set(safe / 12, safe / 12);
    }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(safe, safe),
      M.ground,
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.name = 'town-ground-surface';
    group.add(mesh);
    return group;
  }
}

/** Road/plaza/dirt-patch strips: flat tinted planes, factory-baked flat so
 *  the def rotation stays zero (visual only, never a collider, y offset via
 *  def position). */
export class TownRoadFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const group = new THREE.Group();
    const w = Number(definition.metadata.width ?? 8);
    const d = Number(definition.metadata.depth ?? 8);
    const tint = String(definition.metadata.tint ?? 'road');
    const material = tint === 'plaza' ? M.plaza : tint === 'patch' ? M.dirtPatch : M.road;
    const map = material.map ?? null;
    const geo = new THREE.PlaneGeometry(w, d);
    if (map) {
      // texture density: ~1 tile per 8 m keeps the ruts human-scale. UVs are
      // scaled per-geometry (NEVER per-texture) — the road material is shared
      // by every strip, so mutating map.repeat here would fight other strips.
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < uv.count; i += 1) {
        uv.setXY(i, uv.getX(i) * (w / 8), uv.getY(i) * (d / 8));
      }
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.name = 'town-road-surface';
    group.add(mesh);
    return group;
  }
}

/* -------------------------------------------------------------------------- */
/* The universal box (walls / decks / roofs / pads / water / slabs)           */
/* -------------------------------------------------------------------------- */

const BOX_TINTS: Record<string, THREE.MeshStandardMaterial> = {
  plankA: M.plankA,
  plankB: M.plankB,
  plankC: M.plankC,
  woodDark: M.woodDark,
  woodMed: M.woodMed,
  woodLight: M.woodLight,
  woodGray: M.woodGray,
  shingle: M.shingle,
  shingleDark: M.shingleDark,
  stone: M.stone,
  stoneDark: M.stoneDark,
  canvas: M.canvasAwning,
  hay: M.hay,
  iron: M.iron,
  water: M.water,
  hide: M.hide,
  cream: M.creamPaint,
};

/** Unit box (unit cube geometry) — the def transform scale sizes it EXACTLY,
 *  so `collider: true` defs collide precisely like they look. */
export class TownBoxFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const tint = String(definition.metadata.tint ?? 'plankA');
    const material = BOX_TINTS[tint] ?? M.plankA;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'town-box';
    return mesh;
  }
}

/* -------------------------------------------------------------------------- */
/* Fence section (ONE selectable/movable object per section — user spec §4)   */
/* -------------------------------------------------------------------------- */

/** Unit-space fence section: 2 posts + 2 rails (+1 mid rail), rails spanning
 *  the full unit X. Def scale (len, height, thickness) sizes it and its
 *  collider exactly. metadata.style: 'broken' drops the top rail and tilts a
 *  rail for weathered runs. */
export class TownFenceFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-fence';
    const broken = definition.metadata.style === 'broken';
    const wood = definition.metadata.style === 'corral' ? M.woodGray : M.woodMed;
    // posts (thin in unit space → proportionate after the section scale)
    addBox(g, wood, 0.07, 0.96, 0.5, -0.46, 0.48, 0, 'town-fence-post-a');
    addBox(g, wood, 0.07, 0.96, 0.5, 0.46, 0.48, 0, 'town-fence-post-b');
    // rails
    addBox(g, wood, 0.98, 0.07, 0.32, 0, 0.78, 0, 'town-fence-rail-top');
    if (!broken) addBox(g, wood, 0.98, 0.06, 0.3, 0, 0.45, 0, 'town-fence-rail-mid');
    addBox(g, wood, 0.98, 0.08, 0.34, 0, 0.12, 0, 'town-fence-rail-base');
    if (broken) {
      g.children[g.children.length - 1].rotation.z = 0.06;
    }
    return g;
  }
}

/* -------------------------------------------------------------------------- */
/* Street props                                                               */
/* -------------------------------------------------------------------------- */

/** Wooden street lamp: unit-space POST only (collider) — the lantern head is
 *  a separate decor def parked at the top (compound shapes cannot share the
 *  section scale without blobbing). */
export class TownLampPostFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-lamp-post';
    addBox(g, M.woodDark, 0.42, 0.1, 0.42, 0, 0.05, 0, 'town-lamp-base');
    addBox(g, M.woodDark, 0.16, 0.88, 0.16, 0, 0.53, 0, 'town-lamp-pole');
    return g;
  }
}

/** Lantern head (real size, decor): glass box + iron cap + top finial. */
export class TownLampHeadFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-lamp-head';
    addBox(g, M.iron, 0.34, 0.06, 0.34, 0, 0.03, 0, 'town-lamp-cap-bottom');
    addBox(g, M.lanternGlass, 0.24, 0.3, 0.24, 0, 0.21, 0, 'town-lamp-glass');
    addBox(g, M.iron, 0.3, 0.05, 0.3, 0, 0.39, 0, 'town-lamp-cap-top');
    addBox(g, M.iron, 0.06, 0.1, 0.06, 0, 0.46, 0, 'town-lamp-finial');
    return g;
  }
}

/** Bench (unit space; def scale = extents). Two end frames + 3 slats. */
export class TownBenchFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-bench';
    // ADULT-SCALE proportions in unit space (visual-defect round — the old
    // slab-back bench read as child furniture): full-length back posts to
    // y 1.0, raked two-slat back + cap, armrests on the side frames, four
    // seat slats, lower stretchers. The def scale (2.3, 1.05, 0.72) sizes
    // the real bench AND its collider in one motion.
    for (const sx of [-1, 1]) {
      const x = sx * 0.42;
      addBox(g, M.woodGray, 0.045, 0.44, 0.14, x, 0.22, 0.36, `town-bench-leg-front-${sx < 0 ? 'w' : 'e'}`);
      addBox(g, M.woodGray, 0.045, 1, 0.14, x, 0.5, -0.36, `town-bench-post-back-${sx < 0 ? 'w' : 'e'}`);
      addBox(g, M.woodGray, 0.055, 0.06, 0.84, x, 0.45, 0, `town-bench-seat-rail-${sx < 0 ? 'w' : 'e'}`);
      addBox(g, M.woodGray, 0.035, 0.05, 0.7, x, 0.15, 0, `town-bench-stretcher-${sx < 0 ? 'w' : 'e'}`);
      addBox(g, M.woodMed, 0.06, 0.05, 0.9, x, 0.72, 0.02, `town-bench-armrest-${sx < 0 ? 'w' : 'e'}`);
      addBox(g, M.woodGray, 0.03, 0.17, 0.05, x, 0.645, 0.32, `town-bench-arm-post-${sx < 0 ? 'w' : 'e'}`);
    }
    for (let i = 0; i < 4; i += 1) {
      const z = 0.37 - i * 0.155;
      addBox(g, M.woodMed, 1, 0.05, 0.14, 0, 0.525, z, `town-bench-seat-${i}`);
    }
    for (const y of [0.66, 0.84]) {
      const slat = addBox(g, M.woodMed, 1, 0.14, 0.045, 0, y, -0.36, `town-bench-back-${y === 0.66 ? 'low' : 'high'}`);
      slat.rotation.x = -0.16;
    }
    const cap = addBox(g, M.woodGray, 1, 0.06, 0.1, 0, 0.97, -0.36, 'town-bench-back-cap');
    cap.rotation.x = -0.16;
    return g;
  }
}

/** Barrel (unit space; non-uniform scale gives natural barrel variety). */
export class TownBarrelFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-barrel';
    addCylinder(g, M.barrel, 0.34, 0.28, 0.92, 10, 0, 0.46, 0, 'town-barrel-body');
    addCylinder(g, M.barrelBand, 0.355, 0.355, 0.05, 10, 0, 0.2, 0, 'town-barrel-band-a');
    addCylinder(g, M.barrelBand, 0.355, 0.355, 0.05, 10, 0, 0.72, 0, 'town-barrel-band-b');
    return g;
  }
}

/** Crate (unit space; plank box + corner trim read).
 *  Z-FIGHT ROOT FIX (visual-defect round): the corner trims used to end
 *  EXACTLY at the body top plane (0.94) — coplanar co-facing top faces in
 *  two different woods → visible flicker at the corners. The trims now rise
 *  3% proud of the body and sink 0.5% below it (still inside the unit
 *  collider box), all FOUR corners get trim, and a mid band wraps the body. */
export class TownCrateFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-crate';
    addBox(g, M.plankB, 0.94, 0.94, 0.94, 0, 0.47, 0, 'town-crate-body');
    addBox(g, M.woodDark, 0.98, 0.08, 0.98, 0, 0.92, 0, 'town-crate-lid-trim');
    for (const [sx, sz, tag] of [[-1, -1, 'a'], [1, -1, 'b'], [-1, 1, 'c'], [1, 1, 'd']] as const) {
      addBox(g, M.woodDark, 0.1, 0.965, 0.1, sx * 0.44, 0.4775, sz * 0.44, `town-crate-corner-${tag}`);
    }
    addBox(g, M.woodDark, 0.97, 0.05, 0.97, 0, 0.26, 0, 'town-crate-band');
    return g;
  }
}

/** Water trough (unit space; the def scale y 0.47 / z 0.62 + x sx sizes it).
 *  REAL LIVESTOCK TROUGH (visual-defect round — the old 4-wall box read as a
 *  plain cube): plank walls on log skids, a protruding rim cap whose bottom
 *  edge buries inside the walls, iron hoops hugging the body, a dark visible
 *  interior floor and an inset water slab ~4.5 unit-% below the rim. Every
 *  face pair either interpenetrates or keeps a real gap — nothing coplanar.
 *  Unit box: length 1.0 (x ±0.5) · height 0.81 (y 0…0.81) · depth 0.69. */
export class TownTroughFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-trough';
    const H = 0.81;        // wall top (y)
    const T = 0.08;        // plank thickness
    const DEP = 0.69;      // opening depth (z)
    const RIM = 0.07;      // rim cap height
    const baseY = 0.14;    // wall bottom (sunk into the skids)
    const bodyH = H - baseY - RIM * 0.5; // walls stop under the rim cap
    // log skids under the body
    for (const sx of [-1, 1]) {
      const skid = addCylinder(g, M.woodDark, 0.045, 0.045, DEP - 0.02, 8, sx * 0.3, 0.045, 0, `town-trough-skid-${sx < 0 ? 'w' : 'e'}`);
      skid.rotation.x = Math.PI / 2;
    }
    // plank walls (N/S full length; E/W nested between with a 1 cm gap)
    for (const sz of [-1, 1]) {
      addBox(g, M.woodGray, 1, bodyH, T, 0, baseY + bodyH / 2, sz * (DEP / 2 - T / 2), `town-trough-wall-${sz < 0 ? 'n' : 's'}`);
    }
    for (const sx of [-1, 1]) {
      addBox(g, M.woodGray, T, bodyH, DEP - 2 * T - 0.02, sx * (0.5 - T / 2), baseY + bodyH / 2, 0, `town-trough-end-${sx < 0 ? 'w' : 'e'}`);
    }
    // dark interior floor
    addBox(g, M.woodDark, 1 - 2 * T - 0.05, 0.02, DEP - 2 * T - 0.05, 0, baseY + 0.01, 0, 'town-trough-floor');
    // protruding rim cap (bottom edge buried inside the walls)
    const rimY = baseY + bodyH + RIM / 2 - 0.005;
    for (const sz of [-1, 1]) {
      addBox(g, M.woodGray, 1.04, RIM, T + 0.025, 0, rimY, sz * (DEP / 2 + 0.002), `town-trough-rim-${sz < 0 ? 'n' : 's'}`);
    }
    for (const sx of [-1, 1]) {
      addBox(g, M.woodGray, T + 0.025, RIM, DEP + 0.04, sx * (0.5 + 0.002), rimY, 0, `town-trough-rim-${sx < 0 ? 'w' : 'e'}`);
    }
    // iron hoops (inside the wall band, hugging the walls)
    for (const sx of [-1, 1]) {
      const hoop = addCylinder(g, M.ironLight, DEP / 2 + 0.012, DEP / 2 + 0.012, 0.024, 14, sx * 0.28, baseY + bodyH * 0.45, 0, `town-trough-hoop-${sx < 0 ? 'w' : 'e'}`);
      hoop.rotation.z = Math.PI / 2;
      hoop.scale.y = 1;
    }
    // water slab: top ~4.5% of the unit height below the rim, clear of walls
    addBox(g, M.water, 1 - 2 * T - 0.05, 0.03, DEP - 2 * T - 0.05, 0, H - 0.075, 0, 'town-trough-water');
    return g;
  }
}

/** Hay bale (unit space). */
export class TownHayFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-hay';
    addBox(g, M.hay, 0.96, 0.62, 0.92, 0, 0.31, 0, 'town-hay-body');
    addBox(g, M.woodDark, 0.98, 0.05, 0.1, 0, 0.31, 0, 'town-hay-tie');
    return g;
  }
}

/** Rock (unit space; non-uniform scale + irregular geometry = natural). */
export class TownRockFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-rock';
    const geo = new THREE.IcosahedronGeometry(0.52, 0);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      pos.setXYZ(
        i,
        pos.getX(i) * (0.82 + ((i * 37) % 10) * 0.035),
        pos.getY(i) * (0.62 + ((i * 53) % 10) * 0.03),
        pos.getZ(i) * (0.85 + ((i * 71) % 10) * 0.03),
      );
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, M.stone);
    mesh.position.set(0, 0.3, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'town-rock-body';
    g.add(mesh);
    return g;
  }
}

/** Firewood pile (unit space): stacked log ends. */
export class TownWoodpileFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-woodpile';
    const rows: Array<[number, number]> = [[0.14, 6], [0.42, 5], [0.68, 3]];
    for (const [y, count] of rows) {
      for (let i = 0; i < count; i += 1) {
        const x = -0.36 + (i + (y > 0.3 ? 0.5 : 0)) * (0.72 / count);
        addCylinder(g, M.woodMed, 0.07, 0.07, 0.72, 7, x, y, 0, `town-log-${y}-${i}`).rotation.x = Math.PI / 2;
      }
    }
    return g;
  }
}

/** Hitching post (unit space): 2 posts + cross rail + ring studs. */
export class TownHitchingFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-hitching';
    // REAL WESTERN HITCH RAIL (visual-defect round — the old two bare blocks
    // read as primitive slabs): chamfered square posts with dome caps and
    // buried feet, top + lower rails, diagonal end braces and an iron ring
    // for the lead rope. Unit space; the def scale (2.0, 1.1, 0.35) sizes
    // rails at ~0.93 m and the whole structure matches its collider exactly.
    for (const sx of [-1, 1]) {
      const x = sx * 0.4;
      addBox(g, M.woodDark, 0.055, 0.95, 0.31, x, 0.475, 0, `town-hitch-post-${sx < 0 ? 'a' : 'b'}`);
      addBox(g, M.woodGray, 0.075, 0.04, 0.34, x, 0.955, 0, `town-hitch-cap-${sx < 0 ? 'a' : 'b'}`);
      const brace = addBox(g, M.woodGray, 0.025, 0.38, 0.09, x - sx * 0.085, 0.72, 0, `town-hitch-brace-${sx < 0 ? 'a' : 'b'}`);
      brace.rotation.z = sx * 0.6;
      const ring = addCylinder(g, M.ironLight, 0.045, 0.045, 0.09, 8, x + sx * 0.14, 0.62, 0, `town-hitch-ring-${sx < 0 ? 'a' : 'b'}`);
      ring.rotation.z = Math.PI / 2;
    }
    addBox(g, M.woodMed, 0.98, 0.082, 0.145, 0, 0.845, 0, 'town-hitch-rail-top');
    addBox(g, M.woodGray, 0.98, 0.064, 0.115, 0, 0.565, 0, 'town-hitch-rail-low');
    return g;
  }
}

/** Wagon undercarriage (real size, decor): wheels + axle + tongue. The cargo
 *  bed is a separate town-box def that carries the collider. */
export class TownWagonFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-wagon';
    for (const [x, z, r] of [[-0.85, -0.55, 0.55], [0.85, -0.55, 0.55], [-0.85, 0.75, 0.45], [0.85, 0.75, 0.45]] as const) {
      const wheel = addCylinder(g, M.woodDark, r, r, 0.09, 12, x, r, z, `town-wagon-wheel-${x}-${z}`);
      wheel.rotation.z = Math.PI / 2;
    }
    addBox(g, M.woodMed, 1.9, 0.1, 0.14, 0, 0.62, -0.55, 'town-wagon-axle-front');
    addBox(g, M.woodMed, 1.9, 0.1, 0.14, 0, 0.62, 0.75, 'town-wagon-axle-back');
    addBox(g, M.woodMed, 0.12, 0.1, 1.4, 0, 0.6, -1.35, 'town-wagon-tongue');
    return g;
  }
}

/** Painted/trail sign (real size, decor): posts + board, optional text. */
export class TownSignFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-sign';
    const w = Number(definition.metadata.width ?? 1.4);
    const h = Number(definition.metadata.height ?? 0.6);
    addBox(g, M.woodDark, 0.12, 2.0, 0.12, -w / 2 + 0.1, 1.0, 0, 'town-sign-post-a');
    addBox(g, M.woodDark, 0.12, 2.0, 0.12, w / 2 - 0.1, 1.0, 0, 'town-sign-post-b');
    const text = String(definition.metadata.text ?? '');
    const board = addBox(g, M.plankB, w, h, 0.07, 0, 1.55, 0, 'town-sign-board');
    const texture = text ? townSignTexture(text) : null;
    if (texture) {
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.96, h * 0.86),
        new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }),
      );
      face.position.set(0, 1.55, 0.045);
      face.name = 'town-sign-face';
      g.add(face);
      const back = face.clone();
      back.rotation.y = Math.PI;
      back.position.z = -0.045;
      back.name = 'town-sign-face-back';
      g.add(back);
    }
    board.castShadow = true;
    return g;
  }
}

/* -------------------------------------------------------------------------- */
/* Vegetation (sparse — the biome must feel alive, never a forest)            */
/* -------------------------------------------------------------------------- */

/** Tree: bent tapered trunk + root flare + branches reaching into a crown of
 *  craggy blobs (visual-defect round — the old clean icosahedra read as
 *  primitive). Position-hashed vertex jitter keeps the low-poly blobs
 *  watertight while breaking the silhouette. Def scale 0.8–1.3 varies size. */
export class TownTreeFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-tree';
    const seed = Number(definition.metadata.seed ?? 1);
    const rng = townRng(seed);
    const h = 2.1 + (seed % 5) * 0.22;
    const canopyMat = seed % 3 === 0 ? M.leafDry : seed % 3 === 1 ? M.leafOlive : M.leafOliveDark;
    const barkMat = seed % 4 === 0 ? M.woodGray : M.bark;
    const bendX = (rng() - 0.5) * 0.4;
    const bendZ = (rng() - 0.5) * 0.4;
    // bent trunk: two tapered segments + a base flare
    const midH = h * 0.52;
    const seg1 = addCylinder(g, barkMat, 0.14, 0.26, midH, 7, bendX * 0.1, midH / 2, bendZ * 0.1, 'town-tree-trunk-low');
    seg1.rotation.z = -bendX * 0.1;
    seg1.rotation.x = bendZ * 0.1;
    const seg2 = addCylinder(g, barkMat, 0.1, 0.14, h - midH, 7, bendX * 0.55, midH + (h - midH) / 2, bendZ * 0.55, 'town-tree-trunk-up');
    seg2.rotation.z = -bendX * 0.3;
    seg2.rotation.x = bendZ * 0.3;
    for (let i = 0; i < 3; i += 1) {
      const a = rng() * Math.PI * 2;
      const prong = addCylinder(g, barkMat, 0.03, 0.13, 0.3 + rng() * 0.12, 5, Math.cos(a) * 0.16, 0.14, Math.sin(a) * 0.16, `town-tree-flare-${i}`);
      prong.rotation.z = Math.cos(a) * 0.5;
      prong.rotation.x = -Math.sin(a) * 0.5;
    }
    // primary branches reaching into the crown
    const crownY = h + 0.35;
    for (let i = 0; i < 2 + (seed % 2); i += 1) {
      const a = (i / 3) * Math.PI * 2 + rng() * 1.2;
      const fromY = h * (0.62 + rng() * 0.2);
      const to = new THREE.Vector3(Math.cos(a) * (0.6 + rng() * 0.4), crownY + (rng() - 0.3) * 0.5, Math.sin(a) * (0.6 + rng() * 0.4));
      const from = new THREE.Vector3(bendX * fromY * 0.5, fromY, bendZ * fromY * 0.5);
      const dir = to.clone().sub(from);
      const branch = addCylinder(g, barkMat, 0.045, 0.09, dir.length(), 5, 0, 0, 0, `town-tree-branch-${i}`);
      branch.position.copy(from.clone().add(to).multiplyScalar(0.5));
      branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    }
    // craggy crown: 4-5 jittered blobs (position-hashed — watertight)
    const blobs = 4 + (seed % 2);
    for (let i = 0; i < blobs; i += 1) {
      const r = (i === 0 ? 1.05 : 0.5 + rng() * 0.45);
      const a = rng() * Math.PI * 2;
      const spread = i === 0 ? 0.12 : 0.4 + rng() * 0.5;
      const mesh = new THREE.Mesh(townCraggyBlob(r, seed * 7 + i * 11, 0.14), canopyMat);
      mesh.position.set(
        Math.cos(a) * spread + bendX * 0.4,
        crownY + (i === 0 ? 0.3 : (rng() - 0.4) * 0.8),
        Math.sin(a) * spread + bendZ * 0.4,
      );
      mesh.scale.y = 0.72 + rng() * 0.28;
      mesh.rotation.y = rng() * Math.PI;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `town-tree-canopy-${i}`;
      g.add(mesh);
    }
    return g;
  }
}

/** Bush: 5-7 clustered sage lobes + twiggy branches (visual-defect round —
 *  the old 1-2 clean blobs read as rocks). Ground-hugging, seed-varied. */
export class TownBushFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-bush';
    const seed = Number(definition.metadata.seed ?? 1);
    const rng = townRng(seed);
    const puffs = 5 + (seed % 3);
    for (let i = 0; i < puffs; i += 1) {
      const r = i === 0 ? 0.3 : 0.15 + rng() * 0.15;
      const mat = i % 2 ? M.leafDry : M.leafOliveDark;
      const a = rng() * Math.PI * 2;
      const rad = i === 0 ? 0 : 0.12 + rng() * 0.26;
      const mesh = new THREE.Mesh(townCraggyBlob(r, seed * 5 + i * 13, 0.09), mat);
      mesh.position.set(Math.cos(a) * rad, (i === 0 ? 0.24 : 0.13 + rng() * 0.22), Math.sin(a) * rad);
      mesh.scale.y = 0.66 + rng() * 0.22;
      mesh.rotation.y = rng() * Math.PI;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `town-bush-${i}`;
      g.add(mesh);
    }
    for (let i = 0; i < 2 + (seed % 2); i += 1) {
      const a = rng() * Math.PI * 2;
      const lean = 0.35 + rng() * 0.5;
      const h = 0.36 + rng() * 0.3;
      const twig = addCylinder(g, M.bark, 0.008, 0.02, h, 4, Math.cos(a) * 0.12, h * 0.42, Math.sin(a) * 0.12, `town-bush-twig-${i}`);
      twig.rotation.z = Math.cos(a) * lean;
      twig.rotation.x = -Math.sin(a) * lean;
    }
    return g;
  }
}

/** Dry-grass cluster: ~14 BLADE TUFTS (visual-defect round — the old cones
 *  read as traffic cones). Each tuft is 5-7 tapered bent strips (4 tris each,
 *  DoubleSide) in one of three deterministic archetypes — a real grass read
 *  at cone-level cost. Decorative ground cover, never a collider. */
export class TownGrassFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-grass';
    const count = Number(definition.metadata.count ?? 14);
    const spread = Number(definition.metadata.spread ?? 3.2);
    const seed = Number(definition.metadata.seed ?? 1);
    for (let i = 0; i < count; i += 1) {
      const a = (i * 137.5 + seed * 31) * (Math.PI / 180);
      const r = spread * Math.sqrt(((i * 61 + seed * 17) % 100) / 100);
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const rng = townRng(seed * 100 + i);
      const archetype = i % 3; // fan · clump · windswept
      const windYaw = rng() * Math.PI * 2;
      const blades = 5 + Math.floor(rng() * 3);
      for (let b = 0; b < blades; b += 1) {
        const h = 0.2 + rng() * 0.24;
        const la = rng() * Math.PI * 2;
        let lean: number;
        let yaw: number;
        if (archetype === 0) {
          lean = 0.35 + rng() * 0.55;
          yaw = la;
        } else if (archetype === 1) {
          lean = 0.3 + rng() * 0.45;
          yaw = (b % 2) * Math.PI + (rng() - 0.5) * 1.1;
        } else {
          lean = 0.5 + rng() * 0.6;
          yaw = windYaw + (rng() - 0.5) * 0.9;
        }
        const w = 0.026;
        const geo = new THREE.PlaneGeometry(w, h, 1, 2);
        geo.translate(0, h / 2, 0);
        const pos = geo.attributes.position;
        for (let vi = 0; vi < pos.count; vi += 1) {
          const t = pos.getY(vi) / h;
          pos.setX(vi, pos.getX(vi) * (1 - t * 0.85));
          pos.setZ(vi, ((rng() - 0.5) * 0.5) * t * t * h);
        }
        geo.computeVertexNormals();
        const blade = new THREE.Mesh(geo, M.grassDry);
        blade.rotation.y = yaw;
        blade.rotation.x = lean;
        blade.position.set(cx + (rng() - 0.5) * 0.18, 0, cz + (rng() - 0.5) * 0.18);
        blade.receiveShadow = true;
        blade.name = `town-grass-tuft-${i}-${b}`;
        g.add(blade);
      }
    }
    return g;
  }
}

/** Crop field: furrow ridges + sprout rows (one def — pure decor). */
export class TownCropsFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-crops';
    const rows = Number(definition.metadata.rows ?? 7);
    const rowGap = Number(definition.metadata.rowGap ?? 1.4);
    const length = Number(definition.metadata.length ?? 10);
    for (let r = 0; r < rows; r += 1) {
      const z = (r - (rows - 1) / 2) * rowGap;
      addBox(g, M.dirtPatch, length, 0.16, 0.42, 0, 0.08, z, `town-crop-ridge-${r}`);
      const tufts = Math.floor(length / 0.55);
      for (let i = 0; i < tufts; i += 1) {
        const x = -length / 2 + 0.3 + i * 0.55;
        const h = 0.2 + ((r * 7 + i * 13) % 6) * 0.035;
        const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.11, h, 5), M.crop);
        sprout.position.set(x, 0.16 + h / 2, z);
        sprout.name = `town-crop-sprout-${r}-${i}`;
        sprout.castShadow = false;
        g.add(sprout);
      }
    }
    return g;
  }
}

/** Pond: dark rim ellipse + water disc (shallow — walkable, no collider). */
export class TownPondFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-pond';
    const rx = Number(definition.metadata.rx ?? 2.4);
    const rz = Number(definition.metadata.rz ?? 1.7);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.06, 22), M.dirtPatch);
    rim.scale.set(rx + 0.5, 1, rz + 0.5);
    rim.position.y = 0.02;
    rim.receiveShadow = true;
    rim.name = 'town-pond-rim';
    g.add(rim);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 22), M.water);
    water.scale.set(rx, 1, rz);
    water.position.y = 0.05;
    water.receiveShadow = true;
    water.name = 'town-pond-water';
    g.add(water);
    return g;
  }
}

/* -------------------------------------------------------------------------- */
/* Static horse + windmill (decor landmarks)                                  */
/* -------------------------------------------------------------------------- */

/** Simple standing horse (real size, decor, collider false — documented in
 *  TownLayout: corral/pen fences carry the area's real collision). */
export class TownHorseFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-horse';
    const tint = String(definition.metadata.tint ?? 'horse');
    const body = tint === 'hide' ? M.hide : M.horse;
    // body + neck + head
    addBox(g, body, 0.62, 0.68, 1.7, 0, 1.06, 0, 'town-horse-body');
    addBox(g, body, 0.34, 0.62, 0.4, 0, 1.6, -0.86, 'town-horse-neck').rotation.x = 0.35;
    addBox(g, body, 0.3, 0.34, 0.62, 0, 1.94, -1.18, 'town-horse-head');
    addBox(g, M.horseMane, 0.1, 0.5, 0.34, 0, 1.88, -0.7, 'town-horse-mane');
    // legs
    for (const [x, z] of [[-0.22, -0.62], [0.22, -0.62], [-0.22, 0.66], [0.22, 0.66]] as const) {
      addBox(g, body, 0.15, 0.76, 0.17, x, 0.38, z, `town-horse-leg-${x}-${z}`);
    }
    // tail + saddle blanket
    addBox(g, M.horseMane, 0.12, 0.55, 0.14, 0, 1.0, 0.92, 'town-horse-tail').rotation.x = -0.25;
    addBox(g, M.canvasAwning, 0.66, 0.06, 0.8, 0, 1.42, 0.1, 'town-horse-blanket');
    return g;
  }
}

/** Farm windmill (real size, decor, static): tapered 4-leg tower + platform
 *  + 12-blade fan + tail vane. A pure landmark — no animation system. */
export class TownWindmillFactory implements IAssetFactory {
  create(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-windmill';
    const topY = 6.2;
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as const) {
      const leg = addBox(g, M.woodGray, 0.16, topY, 0.16, x, topY / 2, z, `town-windmill-leg-${x}-${z}`);
      leg.rotation.z = -x * 0.045;
      leg.rotation.x = z * 0.045;
    }
    // cross braces
    addBox(g, M.woodGray, 1.9, 0.1, 0.1, 0, 2.2, -0.8, 'town-windmill-brace-a');
    addBox(g, M.woodGray, 1.9, 0.1, 0.1, 0, 2.2, 0.8, 'town-windmill-brace-b');
    addBox(g, M.woodGray, 0.1, 0.1, 1.9, -0.8, 3.6, 0, 'town-windmill-brace-c');
    addBox(g, M.woodGray, 0.1, 0.1, 1.9, 0.8, 3.6, 0, 'town-windmill-brace-d');
    // platform + hub
    addBox(g, M.plankA, 2.0, 0.14, 2.0, 0, topY, 0, 'town-windmill-platform');
    addBox(g, M.woodDark, 0.5, 0.5, 0.5, 0, topY + 0.5, -0.55, 'town-windmill-hub-house');
    const hub = new THREE.Group();
    hub.name = 'town-windmill-fan';
    hub.position.set(0, topY + 0.5, -0.92);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const blade = addBox(hub, M.plankB, 0.26, 1.05, 0.03, Math.sin(a) * 0.82, Math.cos(a) * 0.82, 0, `town-windmill-blade-${i}`);
      blade.rotation.z = -a;
      blade.rotation.y = 0.4;
    }
    addCylinder(hub, M.woodDark, 0.12, 0.12, 0.2, 8, 0, 0, 0.1, 'town-windmill-hub').rotation.x = Math.PI / 2;
    g.add(hub);
    // tail vane
    addBox(g, M.plankB, 0.06, 0.5, 1.5, 0.45, topY + 0.5, 0.35, 'town-windmill-tail');
    return g;
  }
}

/** Butcher's meat rail (real size, decor): wall-mounted rail + hanging cuts. */
export class TownMeatRailFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-meat-rail';
    const width = Number(definition.metadata.width ?? 1.8);
    addBox(g, M.iron, width, 0.06, 0.06, 0, 0, 0, 'town-meat-rail-bar');
    const cuts = Math.max(2, Math.floor(width / 0.45));
    for (let i = 0; i < cuts; i += 1) {
      const x = -width / 2 + (i + 0.5) * (width / cuts);
      addBox(g, M.ironLight, 0.02, 0.22, 0.02, x, -0.14, 0, `town-meat-hook-${i}`);
      const h = 0.34 + ((i * 31) % 3) * 0.08;
      addBox(g, M.hide, 0.16, h, 0.16, x, -0.14 - 0.1 - h / 2, 0, `town-meat-cut-${i}`);
    }
    return g;
  }
}

/* -------------------------------------------------------------------------- */
/* Architectural detail pieces (windows / door trim / painted boards)          */
/* -------------------------------------------------------------------------- */

/** Window assembly (real size, decor): frame + cross bars + dark pane +
 *  optional shutters. Built around its own origin; the def transform places
 *  and yaws it onto the wall face. */
export class TownWindowFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-window';
    const w = Number(definition.metadata.winWidth ?? 0.9);
    const h = Number(definition.metadata.winHeight ?? 1.2);
    addBox(g, M.woodDark, w + 0.12, 0.08, 0.09, 0, h / 2 + 0.04, 0, 'town-window-head');
    addBox(g, M.woodDark, w + 0.12, 0.08, 0.09, 0, -h / 2 - 0.04, 0, 'town-window-sill');
    addBox(g, M.woodDark, 0.08, h, 0.09, -w / 2 - 0.04, 0, 0, 'town-window-jamb-w');
    addBox(g, M.woodDark, 0.08, h, 0.09, w / 2 + 0.04, 0, 0, 'town-window-jamb-e');
    addBox(g, M.ironLight, w, h, 0.03, 0, 0, -0.02, 'town-window-pane');
    addBox(g, M.woodDark, 0.05, h, 0.05, 0, 0, 0.01, 'town-window-mullion-v');
    addBox(g, M.woodDark, w, 0.05, 0.05, 0, 0, 0.01, 'town-window-mullion-h');
    if (definition.metadata.shutters === true) {
      addBox(g, M.woodMed, 0.05, h + 0.1, w * 0.42, -w / 2 - 0.12, 0, 0.02, 'town-window-shutter-w').rotation.x = Math.PI / 2;
      addBox(g, M.woodMed, 0.05, h + 0.1, w * 0.42, w / 2 + 0.12, 0, 0.02, 'town-window-shutter-e').rotation.x = Math.PI / 2;
    }
    return g;
  }
}

/** Door trim kit (real size, decor): casing + handle. The BLOCKING door slab
 *  is a separate town-box def — this kit dresses it. */
export class TownDoorTrimFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-door-trim';
    const w = Number(definition.metadata.doorWidth ?? 1.05);
    const h = Number(definition.metadata.doorHeight ?? 2.05);
    addBox(g, M.woodDark, w + 0.22, 0.1, 0.1, 0, h + 0.03, 0, 'town-door-casing-top');
    addBox(g, M.woodDark, 0.1, h + 0.1, 0.1, -w / 2 - 0.06, h / 2, 0, 'town-door-casing-w');
    addBox(g, M.woodDark, 0.1, h + 0.1, 0.1, w / 2 + 0.06, h / 2, 0, 'town-door-casing-e');
    addBox(g, M.ironLight, 0.06, 0.16, 0.05, w / 2 - 0.16, 1.02, 0.06, 'town-door-handle');
    return g;
  }
}

/** Painted flat board (real size, decor): thin box + text faces both sides. */
export class TownBoardFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'town-board';
    const w = Number(definition.metadata.width ?? 1.6);
    const h = Number(definition.metadata.height ?? 0.5);
    const text = String(definition.metadata.text ?? '');
    addBox(g, M.plankB, w, h, 0.07, 0, 0, 0, 'town-board-backing');
    const texture = text ? townSignTexture(text) : null;
    if (texture) {
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.96, h * 0.88),
        new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }),
      );
      face.position.z = 0.042;
      face.name = 'town-board-face';
      g.add(face);
      const back = face.clone();
      back.rotation.y = Math.PI;
      back.position.z = -0.042;
      back.name = 'town-board-face-back';
      g.add(back);
    }
    return g;
  }
}
