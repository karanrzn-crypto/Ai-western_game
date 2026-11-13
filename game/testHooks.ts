import * as THREE from 'three';
import type {
  CameraMode,
  CollisionWorld,
  DayNightCycle,
  HorseController,
  PlayerController,
  SceneStateManager,
  ThreeRendererAdapter,
  AuthoredLayout,
  MountStartState,
  MountTimeline,
  DismountTimeline,
} from '../src/index.js';
import {
  SHERIFF_OBJECT_IDS,
  STABLE_OBJECT_IDS,
  TOWN_EXTERIOR_COLLIDERS,
  RIDER_SEATED_EYE_Y,
} from '../src/index.js';
import type { SheepSystem } from './sheep.js';
import type { CountryAmbientStats } from '../src/assets/countryside/CountryAmbient.js';

/** One door swing interpolator (value animates toward target at speed/s). */
export interface Swing {
  value: number;
  target: number;
  speed: number;
}

/** Per-door harness handle: which def + which swing interpolator drives it. */
export interface DoorHarnessEntry {
  uuid: string;
  swing: Swing;
}

/** The door state the verify harnesses read. Produced by the door system
 *  (game/doors.ts) and consumed read-only here. */
export interface DoorHarnessState {
  gate: DoorHarnessEntry;
  vault: DoorHarnessEntry;
  sheriffFront: DoorHarnessEntry;
  gunshop: DoorHarnessEntry;
  bank: DoorHarnessEntry;
  saloon: DoorHarnessEntry;
  cells: Map<string, Swing>;
  stables: Map<string, Swing>;
}

/** Riding/mount state the harness reads at call time (the mutable ride rig
 *  lives in the composition root; this snapshots the fields it probes). */
export interface RideHarnessState {
  rideYaw: number;
  mountAnim: { age: number; start: MountStartState; timeline: MountTimeline } | null;
  dismountAnim: { age: number; timeline: DismountTimeline } | null;
  dismountRestoreMode: CameraMode | null;
}

export interface TestHookContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  manager: SceneStateManager;
  adapter: ThreeRendererAdapter;
  collisionWorld: CollisionWorld;
  playerController: PlayerController;
  dayNight: DayNightCycle;
  // The horse rig and the sheep system are declared LATER in the composition
  // root than the hook installation, so both come as lazy providers (evaluated
  // at probe time).
  horse: () => HorseController;
  horseModelHead: () => THREE.Object3D;
  sheep: () => SheepSystem;
  /** The countryside ambient layer (world expansion) — read-only stats. */
  countryAmbient: () => { stats: CountryAmbientStats; colliderCount: number };
  authoredLayout: AuthoredLayout;
  resetObjectToAuthored: (uuid: string) => boolean;
  resetAllToAuthored: () => number;
  isRiding: () => boolean;
  doors: DoorHarnessState;
  rideState: () => RideHarnessState;
}

const at4State = (v: number, t: number): 'open' | 'closed' | 'opening' | 'closing' =>
  v === t ? (t > 0.5 ? 'open' : 'closed') : t > 0.5 ? 'opening' : 'closing';

/**
 * Dev verification hook surface (write-capable, harness-only). Production
 * gameplay never calls any of it; every verify-*.cjs script depends on it.
 * Teleports/day-pinning/camera parking are gameplay-safe edits through the
 * REAL controller APIs; everything else is read-only probing.
 */
export function createTestHooks(ctx: TestHookContext): Record<string, unknown> {
  const {
    scene, camera, renderer, manager, adapter, collisionWorld,
    playerController, dayNight, horse, horseModelHead, sheep, countryAmbient, authoredLayout,
    resetObjectToAuthored, resetAllToAuthored, isRiding, doors, rideState,
  } = ctx;

  // Scratch objects for the harness-only rideCam probe (zero per-frame cost —
  // the probe runs only when a verify harness calls it).
  const headBox = new THREE.Box3();
  const headCenter = new THREE.Vector3();

  return {
    teleport: (x: number, y: number, z: number) => {
      playerController.setPosition({ x, y, z });
      // setPosition intentionally preserves momentum (editor placement API) —
      // a harness teleport must NOT: the previous walk's residual velocity
      // survives the jump and wedges the player circle into door jambs.
      playerController.freezeMotion();
      playerController.setBodyYaw(Math.PI); // face +Z (south, the camera default)
    },
    setYaw: (yaw: number) => playerController.setBodyYaw(yaw),
    // Harness-only day/night pin: the 3-minute cycle rolls past noon in ~40 s,
    // which makes deterministic screenshot lighting impossible without it.
    setDayTime: (hours: number) => dayNight.setTimeOfDay(hours),
    player: () => playerController.getPosition(),
    yaw: () => ({ camera: playerController.getYaw(), body: playerController.getBodyYaw() }),
    // Read-only scene handle for screenshot harnesses (spectator close-ups:
    // hide the character root so it never occludes the inspected object).
    scene: () => scene,
    // Read-only camera handle for selection/verify harnesses: real projection
    // math (fov/aspect/ matrices) instead of reconstructed bases. Never mutated.
    camera: () => camera,
    // Harness-ONLY camera pose (screenshot/verify servo): parks the camera at a
    // pose aimed at a target. Effective while the gameplay rig is parked (edit
    // mode) — gameplay frames never call it, and play mode re-parks the rig.
    setCamera: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
      camera.position.set(x, y, z);
      camera.lookAt(tx, ty, tz);
    },
    boundsNear: (x: number, z: number) => collisionWorld
      .getCollisionBounds()
      .filter((b) => b.min.x - 0.6 <= x && x <= b.max.x + 0.6 && b.min.z - 0.6 <= z && z <= b.max.z + 0.6)
      .map((b) => ({
        uuid: b.uuid,
        name: manager.getObject(b.uuid)?.metadata.name ?? '',
        min: { x: +b.min.x.toFixed(3), y: +b.min.y.toFixed(3), z: +b.min.z.toFixed(3) },
        max: { x: +b.max.x.toFixed(3), y: +b.max.y.toFixed(3), z: +b.max.z.toFixed(3) },
      })),
    gateBounds: () => collisionWorld
      .getCollisionBounds()
      .filter((b) => b.uuid === doors.gate.uuid)
      .map((b) => ({ min: b.min, max: b.max })),
    gate: () => {
      const root = scene.getObjectByProperty('uuid', doors.gate.uuid);
      const leafW = root?.getObjectByName('secure-gate-leaf-w');
      const leafE = root?.getObjectByName('secure-gate-leaf-e');
      return {
        swing: doors.gate.swing.value,
        target: doors.gate.swing.target,
        collider: manager.getObject(doors.gate.uuid)?.metadata.collider ?? null,
        leafWYaw: leafW ? leafW.rotation.y : null,
        leafEYaw: leafE ? leafE.rotation.y : null,
        prompt: document.getElementById('interact-prompt')?.textContent ?? '',
      };
    },
    vaultBounds: () => collisionWorld
      .getCollisionBounds()
      .filter((b) => b.uuid === doors.vault.uuid)
      .map((b) => ({ min: b.min, max: b.max })),
    vault: () => {
      const root = scene.getObjectByProperty('uuid', doors.vault.uuid);
      const hinge = root?.getObjectByName('bank-vault-door-hinge');
      return {
        swing: doors.vault.swing.value,
        target: doors.vault.swing.target,
        collider: manager.getObject(doors.vault.uuid)?.metadata.collider ?? null,
        hingeYaw: hinge ? hinge.rotation.y : null,
        prompt: document.getElementById('interact-prompt')?.textContent ?? '',
      };
    },
    cell: (which: 'a' | 'b') => {
      const uuid = which === 'a' ? SHERIFF_OBJECT_IDS.cellDoorA : SHERIFF_OBJECT_IDS.cellDoorB;
      const root = scene.getObjectByProperty('uuid', uuid);
      const hinge = root?.getObjectByName('jail-cell-door-hinge');
      return {
        swing: doors.cells.get(uuid)?.value ?? null,
        target: doors.cells.get(uuid)?.target ?? null,
        collider: manager.getObject(uuid)?.metadata.collider ?? null,
        hingeYaw: hinge ? hinge.rotation.y : null,
        prompt: document.getElementById('interact-prompt')?.textContent ?? '',
      };
    },
    // The office front door: swing + explicit 4-state machine readout for the
    // verify harness (closed → opening → open → closing → closed).
    door: () => {
      const root = scene.getObjectByProperty('uuid', doors.sheriffFront.uuid);
      const hinge = root?.getObjectByName('front-door-hinge');
      return {
        swing: doors.sheriffFront.swing.value,
        target: doors.sheriffFront.swing.target,
        state: at4State(doors.sheriffFront.swing.value, doors.sheriffFront.swing.target),
        collider: manager.getObject(doors.sheriffFront.uuid)?.metadata.collider ?? null,
        hingeYaw: hinge ? hinge.rotation.y : null,
        prompt: document.getElementById('interact-prompt')?.textContent ?? '',
      };
    },
    // The stable doors: 'gate' | 's1'…'s6' | 'tack' | 'feed' | 'staff' — swing
    // + 4-state readout + collider + hinge/leaf yaw for the verify harness.
    stableDoor: (which: string) => {
      const uuid = which === 'gate'
        ? STABLE_OBJECT_IDS.gate
        : which.startsWith('s') && which.length === 2
          ? [STABLE_OBJECT_IDS.stallDoor1, STABLE_OBJECT_IDS.stallDoor2, STABLE_OBJECT_IDS.stallDoor3,
             STABLE_OBJECT_IDS.stallDoor4, STABLE_OBJECT_IDS.stallDoor5, STABLE_OBJECT_IDS.stallDoor6][Number(which[1]) - 1]
          : which === 'tack'
            ? STABLE_OBJECT_IDS.tackDoor
            : which === 'feed'
              ? STABLE_OBJECT_IDS.feedDoor
              : which === 'staff' ? STABLE_OBJECT_IDS.staffDoor : null;
      if (!uuid) return null;
      const swing = doors.stables.get(uuid);
      const root = scene.getObjectByProperty('uuid', uuid);
      const leafW = root?.getObjectByName('gate-leaf-w-hinge');
      const hinge = root?.getObjectByName('door-hinge');
      return {
        swing: swing ? swing.value : null,
        target: swing ? swing.target : null,
        state: swing ? at4State(swing.value, swing.target) : null,
        collider: manager.getObject(uuid)?.metadata.collider ?? null,
        leafYawW: leafW ? leafW.rotation.y : null,
        hingeYaw: hinge ? hinge.rotation.y : null,
        prompt: document.getElementById('interact-prompt')?.textContent ?? '',
      };
    },
    has: (uuid: string) => Boolean(scene.getObjectByProperty('uuid', uuid)),
    // --- Fix-round harness hooks (read-only state probes) ---------------------
    // Camera mode + a mode toggle the verify harness can drive (mirrors V).
    cameraMode: () => playerController.getCameraMode(),
    toggleCameraMode: () => playerController.toggleCameraMode(),
    // Horse + riding camera state: yaw/speed/turnRate snapshot, the ride-cam
    // yaw, the dismount camera plan flag and the mount/dismount anim clocks.
    horse: () => {
      const snap = horse().getSnapshot();
      const ride = rideState();
      return {
        yaw: snap.yaw,
        speed: snap.speed,
        turnRate: snap.turnRate,
        mounted: snap.mounted,
        rideYaw: ride.rideYaw,
        riding: isRiding(),
        mountAnim: ride.mountAnim !== null,
        dismountAnim: ride.dismountAnim !== null,
        dismountRestoreMode: ride.dismountRestoreMode,
        playerMode: playerController.getCameraMode(),
        bodyYaw: playerController.getBodyYaw(),
        horsePos: snap.position,
      };
    },
    // Harness-ONLY horse teleport (boundary round): parks the horse at a spot
    // through the REAL restore path (the same clamp the save/load uses), so
    // the verify script can prove a horse placed near the playable boundary
    // survives its first update WITHOUT snapping back toward the center.
    placeHorse: (x: number, z: number) => {
      const h = horse();
      h.restore({ position: { x, y: 0, z }, yaw: 0, health: 100, stamina: 100, alive: true });
      return h.getPosition();
    },
    // FP ride-cam probe (the mounted-eye revision): camera world pose + the
    // head landmark projections that prove the horse's head is IN the frustum
    // at the BOTTOM of the view. All read-only real projection math.
    rideCam: () => {
      const snap = horse().getSnapshot();
      headBox.setFromObject(horseModelHead());
      headBox.getCenter(headCenter);
      // Muzzle region: front-bottom-center of the head subtree box (the head
      // faces −Z at neutral pose). Ears: top corners of the same box.
      const muzzle = new THREE.Vector3(headCenter.x, headBox.min.y + 0.10, headBox.min.z).project(camera);
      const earL = new THREE.Vector3(headBox.min.x + 0.04, headBox.max.y, headCenter.z).project(camera);
      const earR = new THREE.Vector3(headBox.max.x - 0.04, headBox.max.y, headCenter.z).project(camera);
      return {
        mounted: snap.mounted,
        mode: playerController.getCameraMode(),
        camY: camera.position.y,
        camX: camera.position.x,
        camZ: camera.position.z,
        horseGroundY: snap.position.y,
        expectedEyeY: snap.position.y + RIDER_SEATED_EYE_Y,
        camPitch: camera.rotation.x,
        camYaw: camera.rotation.y,
        muzzleNdc: { x: muzzle.x, y: muzzle.y, z: muzzle.z },
        earLNdc: { x: earL.x, y: earL.y, z: earL.z },
        earRNdc: { x: earR.x, y: earR.y, z: earR.z },
      };
    },
    // Harness-ONLY object spawn/despawn (verify-town-exterior): registers a
    // full definition through the REAL registerObject path (adapter
    // materialises it, CollisionWorld picks up metadata colliders, the editor
    // save hook does NOT fire). Despawn mirrors it. Nothing here persists —
    // only editor mutations trigger storage.saveFromManager.
    spawnTestDef: (def: { uuid: string; assetType: string; position: { x: number; y: number; z: number }; rotationY?: number; scale?: number; name: string; metadata?: Record<string, unknown> }) => {
      const created = manager.registerObject({
        uuid: def.uuid,
        assetType: def.assetType,
        transform: {
          position: def.position,
          rotation: { x: 0, y: def.rotationY ?? 0, z: 0 },
          scale: { x: def.scale ?? 1, y: def.scale ?? 1, z: def.scale ?? 1 },
        },
        metadata: { name: def.name, editable: true, ...(def.metadata ?? {}) },
      });
      return { uuid: created.uuid, count: manager.getObjectCount() };
    },
    despawnTestDef: (uuid: string) => manager.unregisterObject(uuid),
    // The town-exterior collider table (single source of truth) so harnesses
    // can attach the exact metadata colliders when spawning test defs.
    townExteriorColliders: TOWN_EXTERIOR_COLLIDERS,
    meshStats: (uuid: string) => {
      const root = scene.getObjectByProperty('uuid', uuid);
      if (!root) return null;
      let meshes = 0;
      let vertices = 0;
      const materials = new Set<string>();
      const geometries = new Set<string>();
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        meshes += 1;
        if (m.geometry.attributes.position) vertices += m.geometry.attributes.position.count;
        materials.add((Array.isArray(m.material) ? m.material[0] : m.material).uuid);
        geometries.add(m.geometry.uuid);
      });
      const box = new THREE.Box3().setFromObject(root);
      return {
        meshes, vertices,
        materials: materials.size,
        geometries: geometries.size,
        bbox: {
          min: { x: +box.min.x.toFixed(3), y: +box.min.y.toFixed(3), z: +box.min.z.toFixed(3) },
          max: { x: +box.max.x.toFixed(3), y: +box.max.y.toFixed(3), z: +box.max.z.toFixed(3) },
        },
      };
    },
    // The gun shop front door: swing + 4-state readout + collider + hinge yaw
    // for the verify harness (same contract as the office `door` hook).
    gunshopDoor: () => {
      const root = scene.getObjectByProperty('uuid', doors.gunshop.uuid);
      const hinge = root?.getObjectByName('front-door-hinge');
      return {
        swing: doors.gunshop.swing.value,
        target: doors.gunshop.swing.target,
        state: at4State(doors.gunshop.swing.value, doors.gunshop.swing.target),
        collider: manager.getObject(doors.gunshop.uuid)?.metadata.collider ?? null,
        hingeYaw: hinge ? hinge.rotation.y : null,
        prompt: document.getElementById('interact-prompt')?.textContent ?? '',
      };
    },
    // The bank + saloon entrance doors: swing + 4-state readout + collider +
    // BOTH leaf hinge yaws (the entrance-door revision harness contract).
    bankDoor: () => {
      const root = scene.getObjectByProperty('uuid', doors.bank.uuid);
      const hw = root?.getObjectByName('bank-front-door-hinge-w');
      const he = root?.getObjectByName('bank-front-door-hinge-e');
      return {
        swing: doors.bank.swing.value,
        target: doors.bank.swing.target,
        state: at4State(doors.bank.swing.value, doors.bank.swing.target),
        collider: manager.getObject(doors.bank.uuid)?.metadata.collider ?? null,
        hingeYawW: hw ? hw.rotation.y : null,
        hingeYawE: he ? he.rotation.y : null,
        prompt: document.getElementById('interact-prompt')?.textContent ?? '',
      };
    },
    saloonDoor: () => {
      const root = scene.getObjectByProperty('uuid', doors.saloon.uuid);
      const hl = root?.getObjectByName('swinging-door-left-hinge');
      const hr = root?.getObjectByName('swinging-door-right-hinge');
      // Leaf VISIBILITY probes (the frozen-door regression): a hinge whose leaf
      // meshes were merge-baked into a static bucket still rotates EMPTY — yaw
      // checks alone cannot catch it. Count the meshes living under each hinge
      // and measure the leaf face's world Z so the harness can assert the leaf
      // physically moves when the door opens.
      const leafProbe = (hinge: THREE.Object3D | null | undefined) => {
        if (!hinge) return { meshes: 0, faceZ: null as number | null, faceX: null as number | null };
        let meshes = 0;
        let faceZ: number | null = null;
        let faceX: number | null = null;
        hinge.updateMatrixWorld(true);
        hinge.traverse((o) => {
          if (!(o as THREE.Mesh).isMesh) return;
          meshes += 1;
          const g = (o as THREE.Mesh).geometry;
          if (!faceZ || faceX === null) {
            if (!g.boundingBox) g.computeBoundingBox();
            const p = new THREE.Vector3(
              (g.boundingBox!.min.x + g.boundingBox!.max.x) / 2,
              (g.boundingBox!.min.y + g.boundingBox!.max.y) / 2,
              (g.boundingBox!.min.z + g.boundingBox!.max.z) / 2,
            ).applyMatrix4(o.matrixWorld);
            if (faceZ === null) faceZ = p.z;
            if (faceX === null) faceX = p.x;
          }
        });
        return { meshes, faceZ, faceX };
      };
      const pl = leafProbe(hl);
      const pr = leafProbe(hr);
      return {
        swing: doors.saloon.swing.value,
        target: doors.saloon.swing.target,
        state: at4State(doors.saloon.swing.value, doors.saloon.swing.target),
        collider: manager.getObject(doors.saloon.uuid)?.metadata.collider ?? null,
        hingeYawL: hl ? hl.rotation.y : null,
        hingeYawR: hr ? hr.rotation.y : null,
        leafMeshesL: pl.meshes,
        leafMeshesR: pr.meshes,
        leafFaceZL: pl.faceZ,
        leafFaceZR: pr.faceZ,
        leafFaceXL: pl.faceX,
        leafFaceXR: pr.faceX,
        prompt: document.getElementById('interact-prompt')?.textContent ?? '',
      };
    },
    // Read-only registry dump for the harness probes: every managed definition
    // (uuid/assetType/transform/metadata) exactly as the editor sees it.
    objects: () => manager.getAllObjects(),
    // Farm sheep probe (read-only): flock size, per-sheep states/positions,
    // the pen rect and the moving flag for the verify-sheep harness.
    sheep: () => {
      const system = sheep();
      return {
        count: system.count(),
        penRect: system.penRect(),
        anyMoving: system.anyMoving(),
        list: system.snapshots(),
      };
    },
    // Countryside probe (read-only): instanced layer counts + static collider
    // count for the verify-countryside harness (world expansion).
    country: () => {
      const probe = countryAmbient();
      return {
        stats: probe.stats,
        colliderCount: probe.colliderCount,
        rootInScene: scene.getObjectByName('country-ambient-root') !== undefined,
      };
    },
    // Read-only renderer.info snapshot for the perf harness (§9 baseline):
    // last-frame draw calls / points / triangles exactly as the driver saw them.
    stats: () => ({
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      lines: renderer.info.render.lines,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
    }),
    // Read-only renderer handle for perf harnesses (shadow-cost experiments:
    // toggling shadowMap.needsUpdate). Never mutated by gameplay code paths.
    renderer: () => renderer,
    // --- Authored-layout reset (the editor's "put it back" action) ------------
    // Same code path as the selection panel's reset buttons: restore through
    // updateObjectTransform, then persist. Harness-only mirror for the probes.
    authoredCount: () => authoredLayout.size,
    isModifiedVsAuthored: (uuid: string) => {
      const def = manager.getObject(uuid);
      return def ? authoredLayout.isModified(def) : null;
    },
    // Read-only authored transform clone (restore-verify harness compares the
    // restored position against it).
    authoredTransform: (uuid: string) => authoredLayout.getTransform(uuid),
    resetObject: (uuid: string) => resetObjectToAuthored(uuid),
    resetAll: () => resetAllToAuthored(),
    // --- geometry-verify probes (read-only, harness-only) ---------------------
    // World AABB of one managed object + the y-span of every mesh part — used
    // to prove the cell-door frames carry NO floating strip (the old header at
    // y≈2.25 and the floor sill read as two stray "stains" once open).
    probe: (uuid: string) => {
      const root = scene.getObjectByProperty('uuid', uuid);
      if (!root) return null;
      root.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(root);
      const parts: { name: string; y: [number, number] }[] = [];
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const b = new THREE.Box3().setFromObject(m);
        parts.push({ name: m.name || m.parent?.name || '<part>', y: [+b.min.y.toFixed(3), +b.max.y.toFixed(3)] });
      });
      return {
        min: { x: +box.min.x.toFixed(3), y: +box.min.y.toFixed(3), z: +box.min.z.toFixed(3) },
        max: { x: +box.max.x.toFixed(3), y: +box.max.y.toFixed(3), z: +box.max.z.toFixed(3) },
        parts,
      };
    },
    // Census of every MESH whose world position falls inside a box, attributed
    // to its managed object — proves nothing foreign floats in a door gap.
    strays: (min: [number, number, number], max: [number, number, number]) => {
      const out: Record<string, number> = {};
      for (const uuid of adapter.getActiveUUIDs()) {
        const root = scene.getObjectByProperty('uuid', uuid);
        if (!root) continue;
        root.updateWorldMatrix(true, true);
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const p = m.getWorldPosition(new THREE.Vector3());
          if (p.x < min[0] || p.x > max[0] || p.y < min[1] || p.y > max[1] || p.z < min[2] || p.z > max[2]) return;
          const key = `${manager.getObject(uuid)?.metadata.name ?? uuid} / ${m.name || '<part>'}`;
          out[key] = (out[key] ?? 0) + 1;
        });
      }
      return out;
    },
    // World centers of every window-glass mesh in the sheriff shell — proves
    // the panes sit INSIDE their wall bands (east/west used to float mid-room).
    windowGlass: () => {
      const shell = scene.getObjectByProperty('uuid', SHERIFF_OBJECT_IDS.building);
      if (!shell) return null;
      shell.updateWorldMatrix(true, true);
      const out: { name: string; x: number; y: number; z: number }[] = [];
      shell.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.name !== 'window-glass') return;
        const p = m.getWorldPosition(new THREE.Vector3());
        out.push({ name: m.parent?.name ?? '', x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) });
      });
      return out;
    },
  };
}
