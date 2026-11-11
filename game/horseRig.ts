import * as THREE from 'three';
import type {
  CameraMode,
  CharacterAnimator,
  CharacterStateMachine,
  CollisionWorld,
  InputBindings,
  InteractionSystem,
  MouseLookController,
  MountStartState,
  MountTimeline,
  DismountTimeline,
  PlayerController,
} from '../src/index.js';
import {
  HorseController,
  ThirdPersonCamera,
  createCharacterModel,
  createHorseModel,
  HorseAnimator,
  HorsePersistence,
  findSafeSpawnPosition,
  mountEnterCameraMode,
  dismountCameraPlan,
  buildMountTimeline,
  mountRootPose,
  poseMountRider,
  applyRiderPose,
  mountSafeRadius,
  MOUNT_STAND,
  MOUNT_SEAT_QUATERNION,
  buildDismountTimeline,
  dismountRootPose,
  poseDismountRider,
  RIDER_SEATED_EYE_Y,
  RIDER_SEATED_EYE_Z,
  TOWN_HORSE_SPAWN,
} from '../src/index.js';
import { CHARACTER_PROPORTIONS } from '../src/player/character/CharacterProportions.js';
import type { RideHarnessState } from './testHooks.js';

export interface HorseRigDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  collisionWorld: CollisionWorld;
  playerController: PlayerController;
  input: InputBindings;
  interactions: InteractionSystem;
  mouseLook: MouseLookController;
  character: ReturnType<typeof createCharacterModel>;
  characterAnimator: CharacterAnimator;
  characterStates: CharacterStateMachine;
  thirdPersonCamera: ThirdPersonCamera;
  showStatusMessage: (message: string) => void;
  /** Editor UI refresh hooks (the UI module is created before this rig). */
  notifyEditorHud: () => void;
  notifyControlHint: () => void;
}

export interface RidingInput {
  throttle: boolean;
  brake: boolean;
  steer: number;
  sprint: boolean;
}

export type HorseSnapshot = ReturnType<HorseController['getSnapshot']>;

export interface HorseRig {
  horse: HorseController;
  horseModel: ReturnType<typeof createHorseModel>;
  horseAnimator: HorseAnimator;
  isRiding(): boolean;
  isMountAnimating(): boolean;
  isDismountAnimating(): boolean;
  mountHorse(): void;
  dismountHorse(options?: { instant?: boolean }): void;
  updateRideLook(deltaX: number, deltaY: number): void;
  buildRidingInput(): RidingInput;
  syncRider(delta: number, snap: HorseSnapshot): void;
  syncHorse(delta: number, snap: HorseSnapshot): void;
  /** Periodic persistence: save when the horse actually changed (spec §17). */
  tickPersistence(delta: number): void;
  /** The harness-visible ride state snapshot (game/testHooks.ts probes). */
  getRideState(): RideHarnessState;
}

/** Shortest signed angular distance of `angle` into (-π, π]. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * The complete companion-horse rig in one module: model + animator + AI
 * controller + persistence, the riding camera, the staged mount/dismount
 * choreography drivers, the rider sync and the horse's own scene sync. The
 * horse is NOT a managed scene object (never selectable/editable/saved by
 * the editor) — it lives beside the scene with its own save slot.
 */
export function createHorseRig({
  scene, camera, collisionWorld, playerController, input, interactions, mouseLook,
  character, characterAnimator, characterStates, thirdPersonCamera,
  showStatusMessage, notifyEditorHud, notifyControlHint,
}: HorseRigDeps): HorseRig {
  const horseModel = createHorseModel();
  scene.add(horseModel.root);
  const horseAnimator = new HorseAnimator(horseModel);
  const horsePersistence = new HorsePersistence();
  const horse = new HorseController(collisionWorld, {
    position: { x: TOWN_HORSE_SPAWN.x, y: 0, z: TOWN_HORSE_SPAWN.z },
    yaw: TOWN_HORSE_SPAWN.yaw,
  });
  const riderSocket = horseModel.riderSocket;

  // Restore the persisted horse (position/vitals/alive) — before the first
  // sync so a dead horse boots straight into its death pose.
  const savedHorse = horsePersistence.load();
  if (savedHorse) horse.restore(savedHorse);

  // Riding camera: the same collision-aware orbit rig, tuned for the higher
  // rider vantage. Only ONE rig drives the camera per frame — the on-foot rig
  // while on foot, this one while mounted.
  const ridingCamera = new ThirdPersonCamera(camera, () => collisionWorld.getCollisionBounds(), {
    targetHeight: 2.1,
    crouchTargetHeight: 2.1,
    defaultDistance: 6.2,
    minDistance: 1.4,
    shoulderOffset: 0.55,
  });
  let rideYaw = horse.getYaw();
  let ridePitch = 0;
  // The horse's yaw at the previous riding frame. The FIRST-PERSON ride-cam
  // fix: the FP view used to read `rideYaw`, which only the mouse ever
  // updated — the horse turned under a frozen view and riding felt like
  // fighting a broken control. Every frame the horse's OWN yaw delta is
  // inherited by the view (below), so steering the horse steers the gaze
  // with it; the horse yaw is integrated from a bounded turn rate, so the
  // inherited motion is smooth by construction (no snap is possible).
  let lastRideHorseYaw = horse.getYaw();

  // Mount animation: a SHORT, simple 5-beat sequence — approach walk (polar
  // arc) → the left hand grips the seat edge → the body rises and turns while
  // both legs fold up-and-back OUTBOARD of the flank → the rider slides
  // inboard above the saddle and folds down onto the seat → settle onto the
  // riding pose. The whole thing lives in src/horse/MountChoreography.ts as
  // plain hand-authored keyframes — NO runtime IK, NO solver, NO tables — and
  // scripts/mount-solver.mjs re-verifies the swept clearance (0 violations)
  // against the real meshes on every change. Every mount constant derives from
  // HORSE_PROPORTIONS, so the horse scale rescales the choreography.
  //
  // The character root is attached to the saddle socket immediately (the horse
  // stands still for the whole timeline via mount lock), and the animation is
  // driven entirely in SOCKET-LOCAL space, so it stays rock-stable relative to
  // the horse no matter where the mount happens. The approach is a POLAR ARC
  // around the saddle axis — the rider always walks AROUND the horse to the
  // left stirrup, never straight through its body.
  let mountAnim: {
    age: number;
    start: MountStartState;
    timeline: MountTimeline;
  } | null = null;

  // Dismount animation (controls revision §21): the short reverse choreography —
  // the hand grips the saddle edge, the rider stands on the stirrups, the right
  // leg sweeps back OVER the cantle, the body descends the left flank and
  // settles BESIDE the horse. Same contract as the mount: a few hand-authored
  // key poses + smooth interpolation, NO IK/solver, driven entirely in
  // SOCKET-LOCAL space. During the animation the rider stays attached to the
  // socket (isRiding() stays true) and the horse holds still (mount lock), so
  // the riding camera keeps framing the move; the on-foot handover runs once,
  // at the very end, at the exact final pose.
  let dismountAnim: {
    age: number;
    timeline: DismountTimeline;
  } | null = null;

  /** Dismount camera (first-person dismount revision): the viewing mode the
   *  rider had when the animated dismount started — restored to first person
   *  the instant the on-foot handover completes. Null = no switch happened
   *  (the rider already viewed third person; nothing to restore). */
  let dismountRestoreMode: CameraMode | null = null;

  /** Geometric length of the polar approach path (start → stand point), used
   *  to size the walk phase (walk duration = arc / walk speed). */
  function mountApproachArc(startPhi: number, startR: number): number {
    const standPhi = Math.atan2(MOUNT_STAND.x, MOUNT_STAND.z);
    const standR = Math.hypot(MOUNT_STAND.x, MOUNT_STAND.z);
    let length = 0;
    let px = Math.sin(startPhi) * startR;
    let pz = Math.cos(startPhi) * startR;
    for (let i = 1; i <= 16; i += 1) {
      const k = i / 16;
      const phi = startPhi + wrapAngle(standPhi - startPhi) * k;
      const r = Math.max(mountSafeRadius(phi), startR + (standR - startR) * k);
      const x = Math.sin(phi) * r;
      const z = Math.cos(phi) * r;
      length += Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
    }
    return length;
  }

  const horseInteractableUuid = 'horse-owned-rig';
  interactions.register({
    uuid: horseInteractableUuid,
    label: 'Mount horse',
    range: 2.6,
    getPosition: () => horse.getPosition(),
    canInteract: () => horse.isAlive() && !horse.isMounted() && horse.getAiState() !== 'flee' && !playerController.isDead(),
    onInteract: () => mountHorse(),
  });

  function isRiding(): boolean {
    return character.root.parent === riderSocket;
  }

  function saveHorseState(force = false): void {
    if (!force && !horseDirty) return;
    horsePersistence.save(horse.serialize());
    horseDirty = false;
  }
  let horseDirty = true;
  let horseSaveTimer = 0;
  let lastHorseSave: ReturnType<HorseController['serialize']> | null = null;

  function mountHorse(): void {
    if (isRiding() || !horse.isAlive() || playerController.isDead()) return;
    const feet = playerController.getFeetPosition();
    if (!horse.canMount(feet)) return;
    // MOUNT CAMERA (controls revision §3): the choreography always plays in
    // THIRD PERSON. A first-person mount switches BEFORE the animation begins
    // (the rig snaps behind the character, framing the whole mount) and stays
    // third person after the rider settles. V still works once riding.
    const enterMode = mountEnterCameraMode(playerController.getCameraMode());
    if (playerController.getCameraMode() !== enterMode) {
      playerController.setCameraMode(enterMode);
    }
    playerController.freezeMotion();
    playerController.setCrouching(false);
    riderSocket.attach(character.root);
    // Socket-local starting transform of the character (attach preserved the
    // world pose, so root.position/quaternion now ARE the socket-local values).
    // The approach is polar: remember the START angle/radius so the walk-in can
    // arc AROUND the horse instead of cutting through it, and size the walk
    // phase from the rider's actual approach arc.
    const p = character.root.position;
    const start: MountStartState = {
      startPhi: Math.atan2(p.x, p.z),
      startR: Math.max(Math.hypot(p.x, p.z), Math.hypot(MOUNT_STAND.x, MOUNT_STAND.z)),
      startY: p.y,
      startQuat: character.root.quaternion.clone(),
    };
    const timeline = buildMountTimeline(mountApproachArc(start.startPhi, start.startR));
    horse.mount(timeline.total + 0.25);
    mountAnim = { age: 0, start, timeline };
    rideYaw = horse.getYaw();
    // Seed the delta tracker to the SAME yaw — the first riding frame must
    // inherit ZERO delta (a stale value from a previous ride would yaw-snap
    // the first-person view the instant the player mounts).
    lastRideHorseYaw = horse.getYaw();
    ridePitch = Math.max(-1.1, Math.min(1.1, playerController.getPitch()));
    ridingCamera.snap();
    notifyEditorHud();
    notifyControlHint();
    saveHorseState(true);
    showStatusMessage('Riding: W walk · W+Shift gallop · hold S brake · A/D steer · E dismount');
  }

  function dismountHorse(options: { instant?: boolean } = {}): void {
    if (mountAnim) return; // never yank the rider out of the mount choreography
    if (dismountAnim) {
      if (!options.instant) return; // already dismounting — extra E presses do nothing
      dismountAnim = null; // emergency (death / Tab): cancel and drop instantly
    }
    if (isRiding()) {
      if (!options.instant) {
        // ANIMATED DISMOUNT: grip → leg over the cantle → slide down the flank
        // → settle. The horse holds still for the whole choreography (the
        // already-mounted mount() call just extends the stand lock).
        // DISMOUNT CAMERA (the first-person dismount revision): a dismount that
        // starts in FIRST PERSON temporarily switches to THIRD PERSON so the
        // whole choreography is actually SEEN, then returns to first person at
        // the handover (dismountCameraPlan, mirrored on the mount's contract).
        // The orbit is seeded from the rider's CURRENT view yaw/pitch, so the
        // third-person cut keeps the same view direction — no rotation jump.
        dismountRestoreMode = dismountCameraPlan(playerController.getCameraMode()).after;
        if (playerController.getCameraMode() === 'first_person') {
          rideYaw = playerController.getYaw();
          ridePitch = Math.max(-1.25, Math.min(1.25, playerController.getPitch()));
          playerController.setCameraMode('third_person');
          ridingCamera.snap();
        }
        notifyEditorHud(); // the HUD camera label follows the temporary TP view
        dismountAnim = { age: 0, timeline: buildDismountTimeline() };
        horse.mount(dismountAnim.timeline.total + 0.3);
        showStatusMessage('Dismounting…');
        return;
      }
      finishDismount(horse.computeDismountFeet());
    } else {
      horse.dismount();
    }
  }

  /** The one-way on-foot handover, shared by the instant and animated paths. */
  function finishDismount(feet: { x: number; y: number; z: number }): void {
    scene.attach(character.root); // keep the world transform for a beat
    horse.dismount();
    // Place the player at the validated spot (left side first). respawnAt
    // resets motion state and hands the camera back to the gameplay rig.
    playerController.respawnAt({ x: feet.x, y: feet.y + CHARACTER_PROPORTIONS.eyeHeight, z: feet.z });
    // DISMOUNT CAMERA handover: the character's on-foot heading picks up the
    // rider's current VIEW direction (what the player was actually looking at
    // through the third-person orbit) — the return to first person therefore
    // keeps the view direction continuous: no rotation snap, no glitch.
    if (dismountRestoreMode) {
      playerController.setBodyYaw(rideYaw);
      playerController.setCameraMode(dismountRestoreMode);
      dismountRestoreMode = null;
    }
    characterAnimator.notifyLanding(4);
    mountAnim = null;
    dismountAnim = null;
    characterAnimator.reset();
    characterStates.force('idle');
    if (playerController.getCameraMode() === 'third_person') thirdPersonCamera.snap();
    notifyEditorHud();
    notifyControlHint();
    saveHorseState(true);
    showStatusMessage('Dismounted.');
    // The interaction system only re-fires its prompt when the TARGET
    // changes — and the horse was already the target before mounting. Rewrite
    // the prompt here so "[E] Dismount" can't stick after landing.
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.textContent = horse.canMount(playerController.getFeetPosition()) ? '[E] Mount horse' : '';
  }

  /** Per-frame mount animation driver: root transform + rider pose. The whole
   *  choreography (root path, joint keyframes, timeline easing) lives in
   *  MountChoreography — this is a thin clock + handover. At t = 1 the root
   *  lands exactly on the socket origin and the solved seat pose. */
  function updateMountAnim(delta: number): void {
    if (!mountAnim) return;
    mountAnim.age += delta;
    const t = Math.min(1, mountAnim.age / mountAnim.timeline.total);
    mountRootPose(character.root, mountAnim.start, t, mountAnim.timeline);
    poseMountRider(character.joints, t, mountAnim.timeline);
    if (t >= 1) {
      mountAnim = null;
      character.root.position.set(0, 0, 0);
      character.root.quaternion.copy(MOUNT_SEAT_QUATERNION);
      applyRiderPose(character.joints);
    }
  }

  /** Per-frame dismount animation driver. At t = 1 the root sits exactly on
   *  DISMOUNT_STAND (socket-local, standing rest pose) — the world position is
   *  validated against the collision world (with the classic dismount spots as
   *  fallback) and the shared instant handover runs. The root's animated end
   *  spot is already clear of the horse capsule, so the normal case has ZERO
   *  position pop. */
  function updateDismountAnim(delta: number): void {
    if (!dismountAnim) return;
    dismountAnim.age += delta;
    const t = Math.min(1, dismountAnim.age / dismountAnim.timeline.total);
    dismountRootPose(character.root, t, dismountAnim.timeline);
    poseDismountRider(character.joints, t, dismountAnim.timeline);
    if (t >= 1) {
      const world = riderSocket.localToWorld(character.root.position.clone());
      const fallback = horse.computeDismountFeet();
      const eye = CHARACTER_PROPORTIONS.eyeHeight;
      const safe = findSafeSpawnPosition(collisionWorld, {
        candidates: [
          { x: world.x, y: world.y + eye, z: world.z },
          { x: fallback.x, y: fallback.y + eye, z: fallback.z },
        ],
      });
      finishDismount({ x: safe.x, y: safe.y - eye, z: safe.z });
    }
  }

  // Horse events → animation flinch, rider safety, persistence.
  horse.on((event) => {
    if (event === 'damage') {
      horseAnimator.notifyDamage();
      return;
    }
    if (event === 'death') {
      if (isRiding() || mountAnim || dismountAnim) {
        mountAnim = null; // the saddle collapsed mid-choreography — emergency dismount
        dismountHorse({ instant: true });
      }
      saveHorseState(true);
      showStatusMessage('Your horse has fallen.');
    }
    if (event === 'revived') {
      saveHorseState(true);
      showStatusMessage('Your horse is back on its feet.');
    }
  });
  window.addEventListener('pagehide', () => saveHorseState(true));

  return {
    horse,
    horseModel,
    horseAnimator,
    isRiding,
    isMountAnimating: () => mountAnim !== null,
    isDismountAnimating: () => dismountAnim !== null,
    mountHorse,
    dismountHorse,
    getRideState: () => ({ rideYaw, mountAnim, dismountAnim, dismountRestoreMode }),

    updateRideLook(deltaX: number, deltaY: number): void {
      const sensitivity = 0.0018;
      ridePitch = Math.max(-1.25, Math.min(1.25, ridePitch - deltaY * sensitivity));
      rideYaw -= deltaX * sensitivity;
    },

    /** Riding input map (spec §19, controls revision §20) — W = walk,
     *  W+Shift = run (the controller walks first from a standstill), S = brake. */
    buildRidingInput() {
      return {
        throttle: input.isDown('forward'),
        brake: input.isDown('backward'),
        steer: (input.isDown('left') ? 1 : 0) - (input.isDown('right') ? 1 : 0),
        sprint: input.isDown('sprint'),
      };
    },

    syncRider(delta: number, snap: HorseSnapshot): void {
      updateMountAnim(delta);
      updateDismountAnim(delta);
      // The dismount handover may have detached the rider THIS frame — the world
      // is on-foot now (the prompt was already rewritten by finishDismount), so
      // the riding camera/prompt must not run one last stale frame.
      if (!isRiding()) return;
      // The horse's rotation THIS frame (wrap-safe). Both camera modes inherit
      // it: third person eases the orbit behind the horse (below), first person
      // hands the delta straight to the view — the mounted camera must never
      // stay decoupled from the horse's transform.
      const horseYawDelta = wrapAngle(snap.yaw - lastRideHorseYaw);
      lastRideHorseYaw = snap.yaw;
      if (playerController.getCameraMode() === 'third_person') {
        // Chase-cam: while rolling OR TURNING and not dragging, the camera eases
        // back behind the horse (the horse-rotation follow fix: the old condition
        // keyed on speed alone, so steering/turning IN PLACE or at crawl speed
        // left the camera frozen on the old heading while the horse rotated away
        // up to the ±2.8 rad clamp); RMB can still orbit freely within the clamp.
        // The ease is exponential (rate 2.2/s) — smooth by construction, no snap.
        if (!mouseLook.isDragging
          && (Math.abs(snap.speed) > 0.5 || Math.abs(snap.turnRate) > 0.05)) {
          rideYaw += wrapAngle(snap.yaw - rideYaw) * Math.min(1, 2.2 * delta);
        }
        const offset = wrapAngle(rideYaw - snap.yaw);
        if (offset > 2.8) rideYaw = snap.yaw + 2.8;
        else if (offset < -2.8) rideYaw = snap.yaw - 2.8;
        ridingCamera.update({
          targetPosition: { x: snap.position.x, y: snap.position.y + 0.55, z: snap.position.z },
          yaw: rideYaw,
          pitch: ridePitch,
          deltaSeconds: delta,
        });
      } else {
        // First person: the eye rides where the SEATED rider's head actually is —
        // pelvis on the saddle seat + the seated torso rise (RIDER_SEATED_EYE_Y
        // ≈ 2.28m). The old formula reused the STANDING stature on the STIRRUP
        // plane (riderFeetY + eyeHeight = 2.75m), floating the eye ≈0.65m above
        // the ear tips: at neutral pitch the whole head sat ~38° below the view
        // axis vs a 35° half-FOV — the horse vanished and riding read as drone
        // flight (user report: «صورت و سر اسب دیده نمی‌شود»). From the seated eye
        // the muzzle/ears/mane land in the lower third of the frame — the natural
        // cowboy view — and the eye stays clear of every horse surface. The
        // horse's own yaw delta is STILL inherited EVERY frame (wrap-safe, smooth
        // by construction), so steering turns the view 1:1; mouse look moves
        // freely on top. Walking first person never touches this branch.
        rideYaw += horseYawDelta;
        camera.position.set(
          snap.position.x + Math.sin(snap.yaw) * RIDER_SEATED_EYE_Z,
          snap.position.y + RIDER_SEATED_EYE_Y,
          snap.position.z + Math.cos(snap.yaw) * RIDER_SEATED_EYE_Z,
        );
        camera.rotation.set(ridePitch, rideYaw, 0);
      }
      character.setFirstPerson(playerController.getCameraMode() === 'first_person');
      character.updateLOD(camera.position);
      const prompt = document.getElementById('interact-prompt');
      if (prompt) prompt.textContent = '[E] Dismount';
    },

    syncHorse(delta: number, snap: HorseSnapshot): void {
      horseModel.root.position.set(snap.position.x, snap.position.y, snap.position.z);
      horseModel.root.rotation.y = snap.yaw;
      horseModel.root.rotation.x = snap.pitch;
      horseModel.root.rotation.z = snap.roll;
      horseAnimator.update({
        deltaSeconds: delta,
        speed: Math.abs(snap.speed),
        gait: snap.alive ? snap.gait : 'dead',
        turnRate: snap.turnRate,
        fear: snap.fear,
        injured: snap.injured,
        mounted: snap.mounted,
        idleAction: snap.idleAction,
      });
      horseModel.updateLOD(camera.position);
    },

    tickPersistence(delta: number): void {
      horseSaveTimer += delta;
      if (horseSaveTimer < 5) return;
      horseSaveTimer = 0;
      const snap = horse.serialize();
      const last = lastHorseSave;
      if (!last
        || Math.abs(last.position.x - snap.position.x) > 0.5
        || Math.abs(last.position.z - snap.position.z) > 0.5
        || Math.ceil(last.health) !== Math.ceil(snap.health)
        || Math.ceil(last.stamina) !== Math.ceil(snap.stamina)
        || last.alive !== snap.alive) {
        lastHorseSave = snap;
        saveHorseState(true);
      }
    },
  };
}
