import * as THREE from 'three';
import type { CollisionBounds, CollisionWorld } from '../src/index.js';

/**
 * game/sheep.ts — the farmyard sheep NPC system (user request).
 * -----------------------------------------------------------------------------
 * Ambient livestock for the farm's livestock pen (the authored "حصار آغل"
 * runs in src/assets/town/TownLayout.ts: fence lines x −14.5/−6.8, z −46/−39.5,
 * west gate gap, water trough at the north fence line). 4–7 seeded sheep spawn
 * inside the pen and live simple autonomous lives: slow wandering, grazing,
 * looking around, and a staggered bedtime after 20:00 game time (spec §4).
 *
 * ARCHITECTURE CONTRACT (mirrors game/horseRig.ts):
 *   • Sheep are NOT managed scene objects — never selectable/editable/saved
 *     by the editor. They live beside the registry in ONE named root group
 *     ('farm-sheep-system'), so a scene save/load can never duplicate or
 *     drop them, and re-initialization disposes the previous system first.
 *   • Movement reuses the EXISTING collision solver — collisionWorld.movePlayer
 *     with a small sheep capsule (radius 0.32, height 0.9) — so fences, the
 *     trough and every prop block sheep exactly like they block the player.
 *     No parallel collision system.
 *   • The pen rectangle itself is a HARD clamp on top of the solver: the west
 *     gate gap has no collider (players walk through it), so sheep are kept
 *     in by geometry (the clamp), not by hoping they avoid the gap.
 *   • The flock SPAWNS on the first update tick — i.e. after loadSavedScene()
 *     has materialized the live registry — so spawn validation sees the
 *     player's actual (possibly editor-moved) fences, not just the authored
 *     ones. Automatic with the farm system's initialization (spec §1).
 *   • ONE shared resource set (4 materials, 4 geometries) serves every sheep;
 *     wool clusters are merged boxes (1 mesh per body / head cluster) to keep
 *     the cost at 7 meshes per sheep — rendered only when the pen is in view
 *     (three.js frustum culling). No new shader programs (MeshStandardMaterial
 *     like every town asset).
 *   • Deterministic: every spawn decision draws from ONE mulberry32 stream
 *     with a fixed seed, so the flock (count, wool mix, positions, bedtime
 *     offsets) is identical on every boot (spec §1).
 *   • ZERO per-frame allocations: the update loop touches only scalars and
 *     preallocated scratch; snapshots() (harness-only) may allocate.
 */

// ---------------------------------------------------------------------------
// Pure, testable core (no THREE, no DOM — unit-tested in tests/sheep-system.test.ts)
// ---------------------------------------------------------------------------

/** Pen fence lines from TownLayout.ts (the single source of the geometry). */
export const PEN_FENCE = {
  westX: -14.5,
  eastX: -6.8,
  northZ: -46,
  southZ: -39.5,
  /** TownLayout FENCE_T — every fence section is 0.2 m thick. */
  thickness: 0.2,
} as const;

/** Sheep capsule (the collider radius/height used with movePlayer). */
export const SHEEP_RADIUS = 0.32;
export const SHEEP_HEIGHT = 0.9;

/**
 * The rectangle sheep CENTERS may occupy: fence line + half thickness + the
 * sheep radius + 0.25 m walking clearance (north keeps extra room for the
 * trough zone at the fence line). The west gate gap (z −42.6…−41.2) has no
 * collider — this clamp is what keeps the flock inside the pen.
 */
export const PEN_INNER_RECT = {
  minX: PEN_FENCE.westX + 0.55,
  maxX: PEN_FENCE.eastX - 0.55,
  minZ: PEN_FENCE.northZ + 0.75,
  maxZ: PEN_FENCE.southZ - 0.55,
} as const;

/** Sheep never bunch closer than this (soft separation at runtime). */
export const SHEEP_MIN_SEPARATION = 0.9;
/** Spawn sampling keeps this spacing between flock members. */
export const SHEEP_SPAWN_SPACING = 1.5;

/** Bedtime: transitions begin after 20:00 and are staggered up to 20:45. */
export const BEDTIME_HOUR = 20;
export const BEDTIME_STAGGER_HOURS = 0.75;
/** Fully awake again from 05:30 (the cycle's night runs 20:00 → ~05:00+). */
export const WAKE_HOUR = 5.5;
/** A full settle (or stand-up) takes ~16 s — "gradually", never a snap. */
export const BEDTIME_EASE_SECONDS = 16;

/** Deterministic PRNG (mulberry32) — tiny, fast, seedable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The fixed flock seed — same seed → the same flock on every boot. */
export const SHEEP_SEED = 0x5EEB1E5;

/** Flock size decision: 4–7 sheep, seeded. */
export function flockSize(rng: () => number): number {
  return 4 + Math.floor(rng() * 4);
}

/** Per-sheep bedtime thresholds: 20:00 + a seeded 0–45 min stagger. */
export function bedtimeThresholds(rng: () => number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push(BEDTIME_HOUR + rng() * BEDTIME_STAGGER_HOURS);
  return out;
}

/** Clamp a center point into the walkable pen rectangle. */
export function clampToPen(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(PEN_INNER_RECT.maxX, Math.max(PEN_INNER_RECT.minX, x)),
    z: Math.min(PEN_INNER_RECT.maxZ, Math.max(PEN_INNER_RECT.minZ, z)),
  };
}

/** Is (x, z) clear of every collider AABB (expanded by `pad`)? */
export function pointClearOfColliders(
  x: number,
  z: number,
  pad: number,
  colliders: readonly CollisionBounds[],
): boolean {
  for (const b of colliders) {
    if (x > b.min.x - pad && x < b.max.x + pad && z > b.min.z - pad && z < b.max.z + pad) return false;
  }
  return true;
}

/**
 * Seeded rejection sampling of `count` spawn points: inside the pen rect,
 * clear of every collider, and spaced apart. Deterministic for a given rng.
 * The pen is ~6.6 × 5.2 m of walkable interior — 4–7 sheep at 1.5 m spacing
 * fit with room to spare; the attempt cap keeps this infallible.
 */
export function sampleSpawnPoints(
  rng: () => number,
  count: number,
  colliders: readonly CollisionBounds[],
  spacing = SHEEP_SPAWN_SPACING,
): { x: number; z: number }[] {
  const points: { x: number; z: number }[] = [];
  let attempts = 0;
  while (points.length < count && attempts < 400) {
    attempts += 1;
    const x = PEN_INNER_RECT.minX + rng() * (PEN_INNER_RECT.maxX - PEN_INNER_RECT.minX);
    const z = PEN_INNER_RECT.minZ + rng() * (PEN_INNER_RECT.maxZ - PEN_INNER_RECT.minZ);
    if (!pointClearOfColliders(x, z, SHEEP_RADIUS + 0.25, colliders)) continue;
    let crowded = false;
    for (const p of points) {
      if (Math.hypot(p.x - x, p.z - z) < spacing) { crowded = true; break; }
    }
    if (crowded) continue;
    points.push({ x, z });
  }
  // Fallback (never needed on the real pen): a deterministic grid sweep.
  if (points.length < count) {
    for (let ix = 0; ix < 4 && points.length < count; ix += 1) {
      for (let iz = 0; iz < 3 && points.length < count; iz += 1) {
        const x = PEN_INNER_RECT.minX + 0.8 + ix * 1.8;
        const z = PEN_INNER_RECT.minZ + 0.8 + iz * 1.7;
        if (!pointClearOfColliders(x, z, SHEEP_RADIUS + 0.25, colliders)) continue;
        if (points.some((p) => Math.hypot(p.x - x, p.z - z) < 1.2)) continue;
        points.push({ x, z });
      }
    }
  }
  return points;
}

/**
 * Pick a wander destination: inside the pen, clear of colliders, and not too
 * close to any flock member's CURRENT spot. Returns null when the pen is
 * momentarily crowded (the caller grazes instead — natural, not an error).
 */
export function pickDestination(
  rng: () => number,
  colliders: readonly CollisionBounds[],
  flockSpots: readonly { x: number; z: number }[],
  selfIndex: number,
): { x: number; z: number } | null {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const x = PEN_INNER_RECT.minX + rng() * (PEN_INNER_RECT.maxX - PEN_INNER_RECT.minX);
    const z = PEN_INNER_RECT.minZ + rng() * (PEN_INNER_RECT.maxZ - PEN_INNER_RECT.minZ);
    if (!pointClearOfColliders(x, z, SHEEP_RADIUS + 0.2, colliders)) continue;
    let crowded = false;
    for (let i = 0; i < flockSpots.length; i += 1) {
      if (i === selfIndex) continue;
      if (Math.hypot(flockSpots[i].x - x, flockSpots[i].z - z) < SHEEP_MIN_SEPARATION + 0.4) { crowded = true; break; }
    }
    if (crowded) continue;
    return { x, z };
  }
  return null;
}

/** The bedtime decision for one sheep at game-hour `hour` (wrap-safe). */
export function isBedtimeHour(hour: number, threshold: number): boolean {
  return hour >= threshold || hour <= WAKE_HOUR;
}

// ---------------------------------------------------------------------------
// Model (THREE) — shared, merged, low-poly
// ---------------------------------------------------------------------------

export const SHEEP_ROOT_NAME = 'farm-sheep-system';

/** Wool variants (spec §2): white, light gray, dark gray. */
const WOOL_COLORS = [0xf1ede2, 0xcfc9bd, 0x9a948a] as const;
/** Faces/legs — the warm dark brown-gray the town palette uses. */
const DARK_COLOR = 0x453e36;

interface BoxPart { size: [number, number, number]; pos: [number, number, number]; rotX?: number; rotZ?: number }

/**
 * Merge transformed box parts into ONE BufferGeometry (create-time only —
 * never per frame). Keeps every sheep at 3 static meshes (body cluster, head
 * cluster, topknot) + 4 animatable legs, all sharing 4 system-wide geometries.
 */
function mergeBoxParts(parts: readonly BoxPart[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  for (const part of parts) {
    const geo = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]).toNonIndexed();
    euler.set(part.rotX ?? 0, 0, part.rotZ ?? 0);
    quat.setFromEuler(euler);
    pos.set(part.pos[0], part.pos[1], part.pos[2]);
    matrix.compose(pos, quat, one);
    geo.applyMatrix4(matrix);
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    const u = geo.getAttribute('uv');
    for (let i = 0; i < p.count; i += 1) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      uvs.push(u.getX(i), u.getY(i));
    }
    geo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return merged;
}

/** The sheep body cluster (facing +Z): fleece main + shoulder hump + rump + tail. */
function bodyParts(): BoxPart[] {
  return [
    { size: [0.58, 0.58, 0.92], pos: [0, 0.62, 0] },
    { size: [0.5, 0.22, 0.42], pos: [0, 0.88, -0.08] },
    { size: [0.52, 0.16, 0.3], pos: [0, 0.86, -0.28] },
    { size: [0.12, 0.14, 0.12], pos: [0, 0.8, -0.52], rotX: 0.5 },
  ];
}

/** The dark head cluster: angled neck + head + two droopy side ears. */
function headParts(): BoxPart[] {
  return [
    { size: [0.14, 0.18, 0.26], pos: [0, 0.02, -0.06], rotX: -0.45 },
    { size: [0.24, 0.26, 0.3], pos: [0, 0.02, 0.14] },
    { size: [0.14, 0.05, 0.09], pos: [-0.17, 0.1, 0.06], rotZ: 0.6 },
    { size: [0.14, 0.05, 0.09], pos: [0.17, 0.1, 0.06], rotZ: -0.6 },
  ];
}

/** Wool topknot on the forehead — the "clearly a sheep" silhouette chip. */
const TOPKNOT_PART: BoxPart = { size: [0.18, 0.12, 0.24], pos: [0, 0.2, 0.06] };

interface SheepModel {
  root: THREE.Group;
  head: THREE.Group;
  legs: [THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh];
}

interface SheepShared {
  bodyGeo: THREE.BufferGeometry;
  headGeo: THREE.BufferGeometry;
  topknotGeo: THREE.BufferGeometry;
  legGeo: THREE.BufferGeometry;
  wool: THREE.MeshStandardMaterial[];
  dark: THREE.MeshStandardMaterial;
}

function createShared(): SheepShared {
  const std = (color: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
  return {
    bodyGeo: mergeBoxParts(bodyParts()),
    headGeo: mergeBoxParts(headParts()),
    topknotGeo: mergeBoxParts([TOPKNOT_PART]),
    legGeo: new THREE.BoxGeometry(0.11, 0.4, 0.11).translate(0, -0.2, 0),
    wool: WOOL_COLORS.map(std),
    dark: std(DARK_COLOR),
  };
}

/** Build ONE sheep model from the shared resources (woolVariant ∈ 0..2). */
function buildSheepModel(shared: SheepShared, woolVariant: number): SheepModel {
  const wool = shared.wool[woolVariant];
  const root = new THREE.Group();

  const body = new THREE.Mesh(shared.bodyGeo, wool);
  body.name = 'body';
  body.castShadow = true; // TownProps convention: only the big parts cast
  root.add(body);

  // Head group: pivot at the neck so graze/look/sleep rotate the whole head.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.72, 0.42);
  const headMesh = new THREE.Mesh(shared.headGeo, shared.dark);
  headMesh.castShadow = true;
  head.add(headMesh);
  const topknot = new THREE.Mesh(shared.topknotGeo, wool);
  head.add(topknot);
  root.add(head);

  // Legs: hip pivots (geometry hangs down from the pivot so rotation.x swings
  // them from the hip like the real gait). Diagonal pairs animate together.
  const legPositions: [number, number, number][] = [
    [-0.2, 0.4, 0.3],  // front-left
    [0.2, 0.4, 0.3],   // front-right
    [-0.2, 0.4, -0.3], // back-left
    [0.2, 0.4, -0.3],  // back-right
  ];
  const legs = legPositions.map((p, li) => {
    const leg = new THREE.Mesh(shared.legGeo, shared.dark);
    leg.name = `leg-${li}`;
    leg.position.set(p[0], p[1], p[2]);
    root.add(leg);
    return leg;
  }) as unknown as [THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh];

  return { root, head, legs };
}

// ---------------------------------------------------------------------------
// Behavior + system
// ---------------------------------------------------------------------------

type SheepState = 'wander' | 'graze' | 'idle' | 'settling' | 'sleeping';

interface Sheep {
  model: SheepModel;
  woolVariant: number;
  x: number;
  z: number;
  yaw: number;
  state: SheepState;
  /** Wander target (null while grazing/idling). */
  dest: { x: number; z: number } | null;
  /** Seconds left in the current graze/idle hold. */
  holdTimer: number;
  /** Bedtime threshold (game hour) — staggered per sheep. */
  bedtimeThreshold: number;
  /** 0 = fully awake, 1 = fully settled (eased, never snapped). */
  bedtimeFactor: number;
  /** Walk gait phase (leg swing) — advances with actual movement. */
  gaitPhase: number;
  /** Eased walk amount 0..1 (legs blend in/out — no pose snap). */
  walkAmount: number;
  /** Current walk speed (m/s) — eases toward the target. */
  speed: number;
  /** Idle look-around state: eased head yaw target. */
  lookYaw: number;
  lookYawTarget: number;
  lookTimer: number;
  /** Continuous blocked time — a wedged wander repicks its destination. */
  blockedTimer: number;
  /** Per-sheep base walk speed (0.38–0.62 m/s, seeded). */
  baseSpeed: number;
  /** Preallocated scratch for movePlayer — zero per-frame garbage. */
  movePos: { x: number; y: number; z: number };
  moveDelta: { x: number; y: number; z: number };
}

/** Shortest signed angular distance of `angle` into (−π, π]. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export interface SheepSnapshot {
  index: number;
  x: number;
  z: number;
  yaw: number;
  state: SheepState;
  wool: number;
  bedtimeFactor: number;
  moving: boolean;
}

export interface SheepSystem {
  /** Advance the flock. `paused` = editor/creative owns the world: movement
   *  and AI decisions freeze, but the (time-driven) bedtime pose easing
   *  continues exactly like the day/night cycle itself does. */
  update(delta: number, paused: boolean): void;
  count(): number;
  anyMoving(): boolean;
  penRect(): { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Harness/HUD-only snapshot (allocates — never called per frame). */
  snapshots(): SheepSnapshot[];
  /** Remove every sheep from the scene and dispose all shared resources. */
  dispose(): void;
}

export interface SheepSystemDeps {
  scene: THREE.Scene;
  collisionWorld: CollisionWorld;
  /** The game-clock hour (DayNightCycle.getTimeOfDay) — the existing cycle. */
  getTimeOfDay: () => number;
}

/**
 * Create the farm sheep system. The flock spawns on the FIRST update tick
 * (after loadSavedScene has materialized the live registry). Re-init safe: a
 * previous 'farm-sheep-system' group is disposed first — no duplicate
 * spawning on scene re-entry (spec §1).
 */
export function createSheepSystem({ scene, collisionWorld, getTimeOfDay }: SheepSystemDeps): SheepSystem {
  // Duplicate-spawn guard: dispose any previous system group (dev hot-reload,
  // future scene re-entry paths) before a fresh flock can exist.
  const previous = scene.getObjectByName(SHEEP_ROOT_NAME);
  if (previous) {
    const priorDispose = previous.userData.dispose as (() => void) | undefined;
    previous.removeFromParent();
    priorDispose?.();
  }

  const root = new THREE.Group();
  root.name = SHEEP_ROOT_NAME;
  root.userData.dispose = () => dispose();
  scene.add(root);

  const flock: Sheep[] = [];
  let shared: SheepShared | null = null;
  let spawned = false;
  let anyMoving = false;
  let disposed = false;
  // The flock's ONE deterministic stream — created at spawn time, then shared
  // by every behavioral decision (destinations, holds) in fixed flock order.
  let rng: () => number = Math.random;

  /** Spawn the seeded flock (exactly once, on the first update tick). */
  function spawnFlock(): void {
    if (spawned || disposed) return;
    spawned = true;
    rng = mulberry32(SHEEP_SEED);
    const colliders = collisionWorld.getCollisionBounds();
    const count = flockSize(rng);
    const spawnPoints = sampleSpawnPoints(rng, count, colliders);
    const thresholds = bedtimeThresholds(rng, count);
    // Wool mix: guarantee all three variants appear, then fill seeded.
    const variantPool: number[] = [0, 1, 2];
    while (variantPool.length < count) variantPool.push(Math.floor(rng() * 3));
    for (let i = variantPool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = variantPool[i];
      variantPool[i] = variantPool[j];
      variantPool[j] = tmp;
    }
    shared = createShared();
    for (let i = 0; i < spawnPoints.length; i += 1) {
      const p = spawnPoints[i];
      const model = buildSheepModel(shared, variantPool[i]);
      model.root.name = `sheep-${i}`;
      model.root.position.set(p.x, 0, p.z);
      const yaw = rng() * Math.PI * 2;
      model.root.rotation.y = yaw;
      root.add(model.root);
      flock.push({
        model,
        woolVariant: variantPool[i],
        x: p.x,
        z: p.z,
        yaw,
        state: 'idle',
        dest: null,
        holdTimer: 1 + rng() * 5, // staggered first move — the flock doesn't start in step
        bedtimeThreshold: thresholds[i],
        bedtimeFactor: 0,
        gaitPhase: rng() * Math.PI * 2,
        walkAmount: 0,
        speed: 0,
        lookYaw: 0,
        lookYawTarget: 0,
        lookTimer: 1 + rng() * 2,
        blockedTimer: 0,
        baseSpeed: 0.38 + rng() * 0.24,
        movePos: { x: p.x, y: SHEEP_HEIGHT, z: p.z },
        moveDelta: { x: 0, y: 0, z: 0 },
      });
    }
  }

  /** Wander → a hold state (graze 55% / idle 45%). */
  function arriveOrHold(sheep: Sheep): void {
    const r = rng();
    sheep.state = r < 0.55 ? 'graze' : 'idle';
    sheep.holdTimer = sheep.state === 'graze' ? 4 + rng() * 5 : 2.5 + rng() * 3.5;
    sheep.dest = null;
    sheep.lookYawTarget = 0;
  }

  /** Pick a new wander destination; graze instead when the pen is crowded. */
  function startWander(sheep: Sheep, index: number, collidersNow: readonly CollisionBounds[]): void {
    const spots = flock.map((s) => ({ x: s.x, z: s.z }));
    const dest = pickDestination(rng, collidersNow, spots, index);
    if (dest) {
      sheep.dest = dest;
      sheep.state = 'wander';
      sheep.blockedTimer = 0;
    } else {
      sheep.state = 'graze';
      sheep.holdTimer = 3 + rng() * 4;
    }
  }

  /** Pose application — the ONLY place meshes are touched. Eases everything
   *  (walk blend, bedtime sink, head angles) so no pose ever snaps. */
  function applyPose(sheep: Sheep, delta: number): void {
    const m = sheep.model;
    const f = sheep.bedtimeFactor;
    const settle = f * f * (3 - 2 * f); // smoothstep — the settle reads organic
    // Walk cycle: diagonal pairs (FL+BR / FR+BL), blended by walkAmount and
    // faded out as the settle folds the legs under the body.
    const swing = Math.sin(sheep.gaitPhase) * 0.38 * sheep.walkAmount * (1 - settle);
    const fold = 1.35 * settle;
    m.legs[0].rotation.x = swing - fold;        // front-left
    m.legs[1].rotation.x = -swing - fold;       // front-right
    m.legs[2].rotation.x = -swing + fold;       // back-left
    m.legs[3].rotation.x = swing + fold;        // back-right
    // Bedtime settle: body sinks to the ground; asleep, a slow breathing bob.
    const breathe = f >= 0.98 ? Math.sin(performance.now() * 0.0016 + sheep.gaitPhase) * 0.009 : 0;
    m.root.position.y = -0.26 * settle + breathe;
    // Head: graze lowers the muzzle, idle scans, sleep rests it down and a
    // little to the side. Every angle eases — never snaps.
    let headX = 0;
    let headZ = 0;
    if (f > 0.6) {
      headX = 1.1 * f;
      headZ = 0.16 * f;
    } else if (sheep.state === 'graze') {
      headX = 1.25;
    } else if (sheep.state === 'idle') {
      headX = 0.08;
    }
    const ease = Math.min(1, 3 * delta);
    m.head.rotation.x += (headX - m.head.rotation.x) * ease;
    m.head.rotation.z += (headZ - m.head.rotation.z) * ease;
    m.head.rotation.y += (sheep.lookYaw - m.head.rotation.y) * ease;
  }

  function update(delta: number, paused: boolean): void {
    if (disposed) return;
    if (!spawned) spawnFlock();
    if (flock.length === 0) return; // spawn found no room — never loop on it
    const hour = getTimeOfDay();

    // Bedtime ease FIRST (time-driven — runs even while the editor is open,
    // exactly like the day/night cycle itself does).
    for (const sheep of flock) {
      const target = isBedtimeHour(hour, sheep.bedtimeThreshold) ? 1 : 0;
      const step = delta / BEDTIME_EASE_SECONDS;
      if (sheep.bedtimeFactor < target) sheep.bedtimeFactor = Math.min(target, sheep.bedtimeFactor + step);
      else if (sheep.bedtimeFactor > target) sheep.bedtimeFactor = Math.max(target, sheep.bedtimeFactor - step);
    }

    if (!paused) {
      const collidersNow = collisionWorld.getCollisionBounds();
      for (let i = 0; i < flock.length; i += 1) {
        const sheep = flock[i];

        // --- bedtime drives the state machine from 20:00 (staggered) --------
        if (sheep.bedtimeFactor > 0.02) {
          // Movement dies out with the factor; the sheep settles where it
          // stands (every standing spot is already validated) — staggered
          // thresholds mean they never all stop at once.
          sheep.speed = 0;
          sheep.walkAmount = Math.max(0, sheep.walkAmount - delta * 2);
          sheep.state = sheep.bedtimeFactor >= 0.98 ? 'sleeping' : 'settling';
          continue;
        }
        if (sheep.state === 'sleeping' || sheep.state === 'settling') {
          // Bedtime just ended (morning) — stand up and resume.
          sheep.state = 'idle';
          sheep.holdTimer = 1 + rng() * 2;
        }

        // --- state machine ---------------------------------------------------
        if (sheep.state === 'wander' && sheep.dest) {
          // Smooth steering: yaw eases toward the destination bearing at a
          // bounded rate; movement follows the CURRENT yaw (smooth arcs).
          const dx = sheep.dest.x - sheep.x;
          const dz = sheep.dest.z - sheep.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.35) {
            arriveOrHold(sheep);
          } else {
            const bearing = Math.atan2(dx, dz);
            const turn = wrapAngle(bearing - sheep.yaw);
            const maxTurn = 1.6 * delta;
            sheep.yaw += Math.max(-maxTurn, Math.min(maxTurn, turn));
            // Speed eases in/out (never instant); turns slow the sheep down.
            const targetSpeed = sheep.baseSpeed * (1 - Math.min(1, Math.abs(turn)));
            sheep.speed += (targetSpeed - sheep.speed) * Math.min(1, 4 * delta);
            sheep.walkAmount += ((sheep.speed > 0.05 ? 1 : 0) - sheep.walkAmount) * Math.min(1, 5 * delta);
            sheep.gaitPhase += sheep.speed * delta * 9;
            sheep.lookYaw += (0 - sheep.lookYaw) * Math.min(1, 3 * delta);
            // Move through the REAL collision solver — fences/trough/props
            // block the sheep exactly like they block the player.
            sheep.movePos.x = sheep.x;
            sheep.movePos.z = sheep.z;
            sheep.moveDelta.x = Math.sin(sheep.yaw) * sheep.speed * delta;
            sheep.moveDelta.z = Math.cos(sheep.yaw) * sheep.speed * delta;
            const result = collisionWorld.movePlayer(sheep.movePos, sheep.moveDelta, SHEEP_RADIUS, SHEEP_HEIGHT);
            sheep.x = result.position.x;
            sheep.z = result.position.z;
            const blockedXZ = result.blockedX || result.blockedZ;
            sheep.blockedTimer = blockedXZ ? sheep.blockedTimer + delta : 0;
            // Wedged against something for half a second → pick another spot.
            if (sheep.blockedTimer > 0.5) startWander(sheep, i, collidersNow);
          }
        } else if (sheep.state === 'graze' || sheep.state === 'idle') {
          sheep.speed += (0 - sheep.speed) * Math.min(1, 5 * delta);
          sheep.walkAmount = Math.max(0, sheep.walkAmount - delta * 2);
          sheep.holdTimer -= delta;
          if (sheep.state === 'idle') {
            // Look-around beats: an eased head yaw target, re-rolled while idle.
            sheep.lookTimer -= delta;
            if (sheep.lookTimer <= 0) {
              sheep.lookYawTarget = (rng() - 0.5) * 1.4;
              sheep.lookTimer = 1.5 + rng() * 2.5;
            }
            sheep.lookYaw += (sheep.lookYawTarget - sheep.lookYaw) * Math.min(1, 3 * delta);
          }
          if (sheep.holdTimer <= 0) startWander(sheep, i, collidersNow);
        } else {
          // 'wander' without a destination (crowded pick) → hold instead.
          arriveOrHold(sheep);
        }

        if (sheep.speed > 0.05 && sheep.walkAmount > 0.1) anyMoving = true;
      }

      // --- soft flock separation (no bunching / no exact overlaps) ----------
      for (let a = 0; a < flock.length; a += 1) {
        for (let b = a + 1; b < flock.length; b += 1) {
          const sa = flock[a];
          const sb = flock[b];
          const dx = sb.x - sa.x;
          const dz = sb.z - sa.z;
          const dist = Math.hypot(dx, dz);
          if (dist >= SHEEP_MIN_SEPARATION || dist < 1e-5) continue;
          const push = (SHEEP_MIN_SEPARATION - dist) * 0.5 * Math.min(1, 3 * delta);
          const nx = dx / dist;
          const nz = dz / dist;
          sa.x -= nx * push;
          sa.z -= nz * push;
          sb.x += nx * push;
          sb.z += nz * push;
        }
      }

      // Hard pen clamp (last) — the gate gap can never leak a sheep out.
      for (const sheep of flock) {
        const clamped = clampToPen(sheep.x, sheep.z);
        sheep.x = clamped.x;
        sheep.z = clamped.z;
        sheep.model.root.position.x = sheep.x;
        sheep.model.root.position.z = sheep.z;
        sheep.model.root.rotation.y = sheep.yaw;
      }
    } else {
      // Paused (editor/creative): movement frozen, pose still alive.
      anyMoving = false;
      for (const sheep of flock) {
        sheep.walkAmount = Math.max(0, sheep.walkAmount - delta * 2);
      }
    }

    // Pose runs every frame (bedtime easing + idle life continue while the
    // editor owns the world, matching the day/night cycle's own behavior).
    for (const sheep of flock) applyPose(sheep, delta);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    if (shared) {
      shared.bodyGeo.dispose();
      shared.headGeo.dispose();
      shared.topknotGeo.dispose();
      shared.legGeo.dispose();
      for (const mat of shared.wool) mat.dispose();
      shared.dark.dispose();
    }
    flock.length = 0;
  }

  return {
    update,
    count: () => flock.length,
    anyMoving: () => anyMoving,
    penRect: () => ({ ...PEN_INNER_RECT }),
    snapshots: () => flock.map((s, i) => ({
      index: i,
      x: +s.x.toFixed(3),
      z: +s.z.toFixed(3),
      yaw: +s.yaw.toFixed(3),
      state: s.state,
      wool: s.woolVariant,
      bedtimeFactor: +s.bedtimeFactor.toFixed(3),
      moving: s.speed > 0.05 && s.walkAmount > 0.1,
    })),
    dispose,
  };
}
