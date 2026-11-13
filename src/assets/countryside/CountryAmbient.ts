/**
 * src/assets/countryside/CountryAmbient.ts
 * -----------------------------------------------------------------------------
 * The countryside's INSTANCED ambient layer (world-expansion round, user
 * spec §5/§7). Everything that repeats across hundreds of square meters —
 * wild trees, bushes, rocks, grass tufts, stumps, fence sections, horizon
 * hills — renders as a handful of InstancedMesh draw calls instead of
 * hundreds of managed defs:
 *
 *   • placement is SEEDED (mulberry32, fixed per zone×species) → the exact
 *     same countryside on every boot, bit-for-bit (tested)
 *   • keep-out is authoritative: the town rectangle, every road corridor
 *     (town + countryside routes), every managed collider AABB (inflated),
 *     ponds and the fenced habitat interiors (thinned, never tree-filled)
 *   • trees, big rocks and EVERY fence section return exact static AABBs —
 *     merged into the ONE CollisionWorld source (no parallel collision
 *     system): the player, the horse and the sheep all collide with them
 *   • static after boot: ZERO per-frame update cost, zero allocations
 *   • non-managed (never editable/saveable — same contract as the sheep
 *     system); dispose() frees every geometry it created
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { CollisionBounds } from '../../physics/CollisionWorld.js';
import { getTownMaterials } from '../town/TownMaterials.js';
import { TOWN_ROUTE_CORRIDORS } from '../town/TownLayout.js';
import {
  COUNTRY_FENCE_RUNS,
  COUNTRY_FENCE_STYLES,
  COUNTRY_HABITAT_RECTS,
  COUNTRY_HILLS,
  COUNTRY_ROAD_CORRIDORS,
  COUNTRY_ZONES,
  DEER_MEADOW,
  ZONE_DENSITY,
} from './CountryLayout.js';

const M = getTownMaterials();

/** Deterministic PRNG — the same mulberry32 the sheep system and TownProps use. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string hash for per-zone×species seeds. */
function zoneSeed(zoneName: string, species: string): number {
  let h = 2166136261;
  const s = `${zoneName}·${species}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* -------------------------------------------------------------------------- */
/* Keep-out geometry                                                          */
/* -------------------------------------------------------------------------- */

/** Distance from a point to a segment (2-D). */
function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

interface RoadCorridor { pts: Array<{ x: number; z: number; w: number }> }

/** The town rectangle (the town owns its own vegetation) + legacy scenery. */
const TOWN_RECT = { x0: -34, z0: -62, x1: 34, z1: 59.5 };
/** The existing farm's crop field (non-collider scenery — never overgrown). */
const TOWN_CROP_FIELD: Rect = { x0: 2.25, z0: -57, x1: 13.25, z1: -46 };
/** The countryside's ponds (the town pond is its own keep-out below). */
const COUNTRY_POND_KEEP_OUTS = [
  { x: -42, z: 108, rx: 4.2, rz: 2.7 },
  { x: -84, z: -93, rx: 1.8, rz: 1.3 },
];
/** The town's own pond (non-collider). */
const TOWN_POND = { x: -18.5, z: -35.2, rx: 2.6, rz: 1.8 };

interface Rect { x0: number; z0: number; x1: number; z1: number }

const inRect = (x: number, z: number, r: Rect, pad = 0): boolean =>
  x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

/* -------------------------------------------------------------------------- */
/* Shared low-poly geometries (created ONCE, instanced, disposed together)    */
/* -------------------------------------------------------------------------- */

function craggyBlobGeometry(radius: number, salt: number, jitter = 0.12): THREE.BufferGeometry {
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

/** ONE grass tuft: 6 tapered bent blades (2 tris each) merged — the wild
 *  twin of TownGrassFactory's tuft at cone-level cost. */
function grassTuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const rng = mulberry32(0x0EE7);
  for (let b = 0; b < 6; b += 1) {
    const h = 0.24 + rng() * 0.3;
    const lean = 0.3 + rng() * 0.55;
    const yaw = rng() * Math.PI * 2;
    const w = 0.03;
    const geo = new THREE.PlaneGeometry(w, h, 1, 1);
    geo.translate(0, h / 2, 0);
    const pos = geo.attributes.position;
    for (let vi = 0; vi < pos.count; vi += 1) {
      const t = pos.getY(vi) / h;
      pos.setX(vi, pos.getX(vi) * (1 - t * 0.8));
      pos.setZ(vi, ((rng() - 0.5) * 0.5) * t * t * h);
    }
    geo.computeVertexNormals();
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const leanCos = Math.cos(lean);
    const leanSin = Math.sin(lean);
    for (let vi = 0; vi < p.count; vi += 1) {
      const x = p.getX(vi);
      const y = p.getY(vi) * leanCos - p.getZ(vi) * leanSin;
      const z = p.getY(vi) * leanSin + p.getZ(vi) * leanCos;
      positions.push(x * cos - z * sin, y, x * sin + z * cos);
      normals.push(n.getX(vi), n.getY(vi), n.getZ(vi));
    }
    geo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

/** ONE fence section in unit space (rails span unit X) — the instance scale
 *  (secLen, height, thickness) sizes visual AND collider in one motion, the
 *  exact TownProps fence contract. */
function fenceSectionGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const push = (sx: number, sy: number, sz: number, x: number, y: number, z: number): void => {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    geo.translate(x, y, z);
    parts.push(geo);
  };
  push(0.07, 0.96, 0.5, -0.46, 0.48, 0);
  push(0.07, 0.96, 0.5, 0.46, 0.48, 0);
  push(0.98, 0.07, 0.32, 0, 0.78, 0);
  push(0.98, 0.06, 0.3, 0, 0.45, 0);
  push(0.98, 0.08, 0.34, 0, 0.12, 0);
  const merged = mergeGeometries(parts);
  return merged;
}

/** Minimal position+normal merge (no UVs needed — plain materials). */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
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
/* Placement data                                                             */
/* -------------------------------------------------------------------------- */

interface Instance { x: number; z: number; scale: number; yaw: number; variant: number }

export interface CountryAmbientStats {
  trees: number;
  bushes: number;
  rocks: number;
  bigRocks: number;
  grass: number;
  stumps: number;
  fenceSections: number;
  hills: number;
  staticColliders: number;
}

export interface CountryAmbient {
  group: THREE.Group;
  /** Exact static AABBs (fences + trees + big rocks) for the ONE CollisionWorld. */
  staticColliders: () => readonly CollisionBounds[];
  stats: () => CountryAmbientStats;
  dispose: () => void;
}

export interface CountryAmbientOptions {
  scene: THREE.Scene;
  /** Every managed def's world AABB (town + countryside) — vegetation keeps
   *  clear of buildings, fences, props with a walking margin. */
  colliderKeepOuts: readonly CollisionBounds[];
}

export const COUNTRY_AMBIENT_ROOT = 'country-ambient-root';

export function createCountryAmbient({ scene, colliderKeepOuts }: CountryAmbientOptions): CountryAmbient {
  const group = new THREE.Group();
  group.name = COUNTRY_AMBIENT_ROOT;

  // duplicate-guard (re-init safety — same contract as the sheep system)
  const previous = scene.getObjectByName(COUNTRY_AMBIENT_ROOT);
  if (previous) previous.removeFromParent();
  scene.add(group);

  const createdGeometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(geo: T): T => {
    createdGeometries.push(geo);
    return geo;
  };

  /* -- road corridor list (town + countryside, one source each) --------------- */
  const corridors: RoadCorridor[] = [
    ...Object.values(TOWN_ROUTE_CORRIDORS).map((pts) => ({ pts: pts.map(([x, z, w]) => ({ x, z, w })) })),
    ...COUNTRY_ROAD_CORRIDORS.map((road) => ({ pts: road.pts.map(([x, z, w]) => ({ x, z, w })) })),
  ];
  const nearAnyRoad = (x: number, z: number, pad: number): boolean => {
    for (const road of corridors) {
      for (let i = 1; i < road.pts.length; i += 1) {
        const a = road.pts[i - 1];
        const b = road.pts[i];
        if (distToSegment(x, z, a.x, a.z, b.x, b.z) < b.w / 2 + pad) return true;
      }
    }
    return false;
  };
  const inColliderKeepOut = (x: number, z: number, pad: number): boolean => {
    for (const b of colliderKeepOuts) {
      if (b.max.y < 0.3) continue; // flat ground decor never blocks placement
      if (x > b.min.x - pad && x < b.max.x + pad && z > b.min.z - pad && z < b.max.z + pad) return true;
    }
    return false;
  };
  const inAnyPond = (x: number, z: number, pad: number): boolean => {
    if (Math.abs(x - TOWN_POND.x) < TOWN_POND.rx + pad && Math.abs(z - TOWN_POND.z) < TOWN_POND.rz + pad) return true;
    for (const pond of COUNTRY_POND_KEEP_OUTS) {
      if (Math.abs(x - pond.x) < pond.rx + pad && Math.abs(z - pond.z) < pond.rz + pad) return true;
    }
    return false;
  };
  const inHabitat = (x: number, z: number): boolean =>
    COUNTRY_HABITAT_RECTS.some((r) => inRect(x, z, r, 0));

  /* -- seeded zone sampling ---------------------------------------------------- */
  const placed: Record<string, Instance[]> = { tree: [], bush: [], rock: [], bigRock: [], grass: [], stump: [] };
  const minSpacing: Record<string, number> = { tree: 3.4, bush: 1.3, rock: 2.2, bigRock: 5, grass: 0.55, stump: 3 };
  const tooClose = (species: string, x: number, z: number): boolean => {
    const list = placed[species];
    const min = minSpacing[species];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const p = list[i];
      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz < min * min) return true;
    }
    return false;
  };

  for (const zone of COUNTRY_ZONES) {
    const areaHa = ((zone.x1 - zone.x0) * (zone.z1 - zone.z0)) / 10_000;
    const density = ZONE_DENSITY[zone.kind];
    const rng = mulberry32(zoneSeed(zone.name, 'all'));
    const sample = (species: string, count: number, spawn: () => { scale: number; variant?: number }): void => {
      const target = Math.round(count * areaHa);
      let accepted = 0;
      let attempts = 0;
      while (accepted < target && attempts < target * 30) {
        attempts += 1;
        const x = zone.x0 + rng() * (zone.x1 - zone.x0);
        const z = zone.z0 + rng() * (zone.z1 - zone.z0);
        if (Math.abs(x) > 138 || Math.abs(z) > 138) continue;
        if (inRect(x, z, TOWN_RECT, 1.5)) continue;
        if (inRect(x, z, TOWN_CROP_FIELD, 1)) continue;
        if (nearAnyRoad(x, z, 1.3)) continue;
        if (inColliderKeepOut(x, z, 1.6)) continue;
        if (inAnyPond(x, z, 1.4)) continue;
        const habitat = inHabitat(x, z);
        if (habitat && (species === 'tree' || species === 'bigRock')) continue;
        if (habitat && rng() > 0.25) continue; // fenced yards stay short
        if (species === 'tree' && Math.hypot(x - DEER_MEADOW.x, z - DEER_MEADOW.z) < DEER_MEADOW.r) continue;
        if (tooClose(species, x, z)) continue;
        const { scale, variant } = spawn();
        placed[species].push({ x, z, scale, yaw: rng() * Math.PI * 2, variant: variant ?? 0 });
        accepted += 1;
      }
    };

    sample('tree', density.tree, () => ({ scale: 0.8 + rng() * 0.75, variant: Math.floor(rng() * 3) }));
    sample('bush', density.bush, () => ({ scale: 0.7 + rng() * 0.8 }));
    sample('rock', density.rock, () => ({ scale: 0.45 + rng() * 0.5 }));
    sample('bigRock', density.bigRock, () => ({ scale: 0.8 + rng() * 0.7 }));
    sample('grass', density.grass, () => ({ scale: 0.8 + rng() * 0.7, variant: rng() > 0.5 ? 1 : 0 }));
    sample('stump', density.stump, () => ({ scale: 0.7 + rng() * 0.5 }));
  }

  /* -- instanced meshes --------------------------------------------------------- */
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  function addInstanced(
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    instances: Instance[],
    opts: { castShadow: boolean; yBase?: (s: number) => number; squashY?: boolean },
  ): void {
    if (instances.length === 0) return;
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    mesh.name = name;
    mesh.castShadow = opts.castShadow;
    mesh.receiveShadow = true;
    for (let i = 0; i < instances.length; i += 1) {
      const inst = instances[i];
      pos.set(inst.x, opts.yBase ? opts.yBase(inst.scale) : 0, inst.z);
      quat.setFromAxisAngle(up, inst.yaw);
      const sy = opts.squashY ? inst.scale * (0.66 + (i % 5) * 0.06) : inst.scale;
      scl.set(inst.scale, sy, inst.scale);
      matrix.compose(pos, quat, scl);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  // trees: one trunk stream + three canopy streams. Each variant owns its OWN
  // jittered blob geometry (different salt) — sharing one geometry across
  // hundreds of near-identical instances put EXACT coplanar faces in the
  // z-fight scanner and would flicker in-game (the fix-round3 §1 rule).
  const trunkGeo = track(new THREE.CylinderGeometry(0.13, 0.26, 2.4, 6).translate(0, 1.2, 0));
  const canopyMaterials = [M.leafDry, M.leafOlive, M.leafOliveDark];
  const canopyGeos = canopyMaterials.map((_, v) => track(craggyBlobGeometry(1.05, 31 + v * 17, 0.14)));
  addInstanced('country-tree-trunks', trunkGeo, M.bark, placed.tree, { castShadow: true });
  for (let v = 0; v < 3; v += 1) {
    addInstanced(`country-tree-canopy-${v}`, canopyGeos[v], canopyMaterials[v],
      placed.tree.filter((t) => t.variant === v),
      { castShadow: true, yBase: (s) => 2.15 * s + v * 0.05, squashY: true });
  }

  // bushes / rocks / stumps / grass
  const bushGeo = track(craggyBlobGeometry(0.42, 57, 0.1));
  addInstanced('country-bushes', bushGeo, M.leafOliveDark, placed.bush, { castShadow: false, yBase: (s) => 0.26 * s, squashY: true });
  const rockGeo = track(craggyBlobGeometry(0.38, 83, 0.16));
  addInstanced('country-rocks', rockGeo, M.stone, placed.rock, { castShadow: false, yBase: (s) => 0.16 * s, squashY: true });
  const bigRockGeo = track(craggyBlobGeometry(0.95, 97, 0.18));
  addInstanced('country-big-rocks', bigRockGeo, M.stoneDark, placed.bigRock, { castShadow: true, yBase: (s) => 0.3 * s, squashY: true });
  const stumpGeo = track(new THREE.CylinderGeometry(0.3, 0.38, 0.34, 7).translate(0, 0.17, 0));
  addInstanced('country-stumps', stumpGeo, M.bark, placed.stump, { castShadow: false });
  const tuftGeo = track(grassTuftGeometry());
  addInstanced('country-grass-dry', tuftGeo, M.grassDry, placed.grass.filter((g) => g.variant === 0), { castShadow: false });
  addInstanced('country-grass-olive', tuftGeo, M.leafOliveDark, placed.grass.filter((g) => g.variant === 1), { castShadow: false });

  /* -- fence sections (instanced, exact per-section colliders) ------------------ */
  interface Section { x: number; z: number; len: number; height: number; thickness: number; alongX: boolean }
  const sections: Section[] = [];
  for (const run of COUNTRY_FENCE_RUNS) {
    const style = COUNTRY_FENCE_STYLES[run.style];
    const alongX = run.from[1] === run.to[1];
    const a = alongX ? run.from[0] : run.from[1];
    const b = alongX ? run.to[0] : run.to[1];
    const fixed = alongX ? run.from[1] : run.from[0];
    const sorted = [...(run.gaps ?? [])].sort((p, q) => p[0] - q[0]);
    const intervals: Array<[number, number]> = [];
    let cursor = Math.min(a, b);
    const end = Math.max(a, b);
    for (const [g0, g1] of sorted) {
      if (g0 > cursor) intervals.push([cursor, Math.min(g0, end)]);
      cursor = Math.max(cursor, g1);
    }
    if (cursor < end) intervals.push([cursor, end]);
    const rng = mulberry32(zoneSeed(run.name, 'fence'));
    for (const [i0, i1] of intervals) {
      const len = i1 - i0;
      if (len < 0.35) continue;
      const count = Math.max(1, Math.round(len / (run.section ?? 2.2)));
      const secLen = len / count;
      for (let i = 0; i < count; i += 1) {
        const c = i0 + secLen * (i + 0.5);
        sections.push({
          x: alongX ? c : fixed,
          z: alongX ? fixed : c,
          len: secLen,
          height: style.height * (0.985 + rng() * 0.03),
          thickness: style.thickness,
          alongX,
        });
      }
    }
  }
  const fenceGeo = track(fenceSectionGeometry());
  addInstanced('country-fences', fenceGeo, M.woodMed, sections.map((s) => ({
    x: s.x, z: s.z, scale: s.len, yaw: s.alongX ? 0 : Math.PI / 2, variant: 0,
  })), {
    castShadow: true,
    yBase: () => 0,
  });
  // fence section heights vary per run style — bake via a second pass with
  // per-instance Y scale (the shared addInstanced scales uniformly, so the
  // fence stream gets its own loop here)
  const fenceMesh = group.getObjectByName('country-fences') as THREE.InstancedMesh | undefined;
  if (fenceMesh) {
    for (let i = 0; i < sections.length; i += 1) {
      const s = sections[i];
      pos.set(s.x, 0, s.z);
      quat.setFromAxisAngle(up, s.alongX ? 0 : Math.PI / 2);
      scl.set(s.len, s.height, s.thickness);
      matrix.compose(pos, quat, scl);
      fenceMesh.setMatrixAt(i, matrix);
    }
    fenceMesh.instanceMatrix.needsUpdate = true;
  }

  /* -- horizon hills (visual only, OUTSIDE the walls) --------------------------- */
  const hillGeo = track(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  const hillMesh = new THREE.InstancedMesh(hillGeo, M.dirtPatch, COUNTRY_HILLS.length);
  hillMesh.name = 'country-hills';
  hillMesh.castShadow = false;
  hillMesh.receiveShadow = false;
  hillMesh.matrixAutoUpdate = false;
  for (let i = 0; i < COUNTRY_HILLS.length; i += 1) {
    const h = COUNTRY_HILLS[i];
    pos.set(h.x, -h.ry * 0.22, h.z);
    quat.identity();
    scl.set(h.rx, h.ry, h.rz);
    matrix.compose(pos, quat, scl);
    hillMesh.setMatrixAt(i, matrix);
  }
  hillMesh.instanceMatrix.needsUpdate = true;
  group.add(hillMesh);

  /* -- static colliders: fences (exact) + trees + big rocks ---------------------- */
  const staticBounds: CollisionBounds[] = [];
  let sectionIndex = 0;
  for (const s of sections) {
    const hx = s.alongX ? s.len / 2 : s.thickness / 2;
    const hz = s.alongX ? s.thickness / 2 : s.len / 2;
    staticBounds.push({
      uuid: `country-fence-${sectionIndex}`,
      min: { x: s.x - hx, y: 0, z: s.z - hz },
      max: { x: s.x + hx, y: s.height, z: s.z + hz },
    });
    sectionIndex += 1;
  }
  for (const t of placed.tree) {
    const r = 0.55 * t.scale;
    staticBounds.push({
      uuid: `country-tree-${t.x.toFixed(2)},${t.z.toFixed(2)}`,
      min: { x: t.x - r, y: 0, z: t.z - r },
      max: { x: t.x + r, y: 2.4 * t.scale, z: t.z + r },
    });
  }
  for (const r of placed.bigRock) {
    const half = 0.95 * r.scale;
    staticBounds.push({
      uuid: `country-rock-${r.x.toFixed(2)},${r.z.toFixed(2)}`,
      min: { x: r.x - half, y: 0, z: r.z - half },
      max: { x: r.x + half, y: 0.9 * r.scale, z: r.z + half },
    });
  }

  const frozenBounds = (): readonly CollisionBounds[] => staticBounds;

  function dispose(): void {
    group.removeFromParent();
    for (const geo of createdGeometries) geo.dispose();
    createdGeometries.length = 0;
    staticBounds.length = 0;
  }

  const stats: CountryAmbientStats = {
    trees: placed.tree.length,
    bushes: placed.bush.length,
    rocks: placed.rock.length,
    bigRocks: placed.bigRock.length,
    grass: placed.grass.length,
    stumps: placed.stump.length,
    fenceSections: sections.length,
    hills: COUNTRY_HILLS.length,
    staticColliders: staticBounds.length,
  };

  return { group, staticColliders: frozenBounds, stats: () => ({ ...stats }), dispose };
}
