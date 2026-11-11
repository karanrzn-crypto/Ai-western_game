import * as THREE from 'three';
import {
  PersistenceManager,
  CollisionWorld,
  DayNightCycle,
  GameModeController,
  LocalSceneStorage,
  PlayerController,
  ObjectEditorController,
  AuthoredLayout,
  TransformGizmo,
  ContactIndicator,
  makeSceneAxisClamp,
  createDebugAxes,
  configure,
  createCharacterModel,
  CharacterAnimator,
  CharacterStateMachine,
  HealthSystem,
  StaminaSystem,
  InputBindings,
  InteractionSystem,
  ThirdPersonCamera,
  MouseLookController,
  CreativeFlightController,
  findSafeSpawnPosition,
  TOWN_GROUND_SIZE,
  TOWN_RESPAWN,
} from '../src/index.js';
import type { PartialTransform } from '../src/index.js';
import { CHARACTER_PROPORTIONS } from '../src/player/character/CharacterProportions.js';
import { createWorld } from './world.js';
import { createDoorSystem } from './doors.js';
import { createEditorUi } from './editorUi.js';
import { createHorseRig } from './horseRig.js';
import { createTestHooks } from './testHooks.js';

configure({ debug: false, logging: { level: 'info' } });

const world = createWorld();
const { stage, scene, camera, renderer, resolution, shadows, sun, hemisphere, adapter, manager } = world;

// --- The main character ("The Ranger") ----------------------------------
// Procedural western gunslinger: hat + vest + gun belt silhouette.
// Built once, animated procedurally, LOD'd, synced to the controller below.
const character = createCharacterModel();
scene.add(character.root);
const characterAnimator = new CharacterAnimator(character);
const health = new HealthSystem({ max: 100 });
const stamina = new StaminaSystem({ drainPerSecond: 13, regenPerSecond: 17, regenDelaySeconds: 0.8 });
const characterStates = new CharacterStateMachine();
const input = new InputBindings(window);
input.attach();

const grid = new THREE.GridHelper(TOWN_GROUND_SIZE, TOWN_GROUND_SIZE, 0x514b40, 0x6b6252);
grid.position.y = 0.01;
scene.add(grid);

// Coordinate reference: world origin (0,0,0) + X/Y/Z direction axes.
// Purely visual debug overlay — never registered in the manager, so it can
// never be selected or moved; drawn with depthTest off so it reads as an
// overlay instead of "a helper poking out of the ground".
// Shown only while Edit Mode is active.
const debugAxes = createDebugAxes();
debugAxes.visible = false;
scene.add(debugAxes);

// --- Last-object-change log (TEST panel, bottom-right) ---------------------
// Every transform mutation in the game flows through ONE funnel —
// SceneStateManager.updateObjectTransform (gizmo drags, arrow keys, rotation
// shortcuts and the numeric panel all land here). Wrapping that funnel lets
// the debug panel show the EXACT before/after of the last mutation: the
// Before state is a real snapshot pulled from the manager BEFORE the raw
// update runs (never inferred from the patch), and the After state is the
// manager's returned transform. Read-only debug: the wrapper never alters
// what the manager does.
const rawUpdateObjectTransform = manager.updateObjectTransform.bind(manager);
manager.updateObjectTransform = (uuid: string, patch: PartialTransform) => {
  // Real pre-mutation snapshot: getObject deep-clones, so this transform is
  // fully detached from the registry entry the raw update is about to replace.
  const beforeDefinition = manager.getObject(uuid);
  const next = rawUpdateObjectTransform(uuid, patch);
  if (beforeDefinition) {
    ui.noteObjectChange(uuid, beforeDefinition.metadata.name, beforeDefinition.transform, next);
  }
  return next;
};

const persistence = new PersistenceManager();
// Storage key history: v9 moved for the bank's final vault-door interior;
// v11 moved for the stable object split (windows/signs/lanterns/ladder/props
// for the Livery Stable block. Scene load REPLACES the whole registry, so
// old saves would load a scene WITHOUT the stable — the key must move for
// every existing save to pick it up.
// v13 moved for the hanging rope coil's deletion (user request): the def is
// gone from the authored layout, and an OLD save still contains it (saves
// rebuild the registry wholesale), so the key moves to drop the polluted
// v12 saves — the floating coil AND every other editor-moved stray in them.
// v14 moves for the COMPLETE rope-coil deletion («کلا انرا پاک کن»): the
// tack-room coil def and the stall rope extras are gone from the build, and
// a v13 save still carries the 'rope-coil' def the factory no longer knows
// (it would throw on materialisation). The key move drops those saves too.
// v15 moved for the GUN SHOP: a whole new building block (34 defs) joins the
// authored layout, and saves rebuild the registry wholesale — an old save
// would boot a town WITHOUT the gun shop. The key move drops v14 saves so
// every player picks the shop up.
// v16 moves for the ENTRANCE DOORS: the bank gets a real openable front door
// (a NEW def joins the authored layout) and the saloon's swinging doors are
// rebuilt full-height closed-by-default — an old save would boot a bank
// without its door. The key move drops v15 saves so every player picks the
// doors up.
// v17 moves for the TOWN EXPANSION: the spawn/test cube def is DELETED and
// six town-exterior defs (butcher stall + five houses) join the authored
// layout, and the ground/boundary rescale. Saves rebuild the registry
// wholesale — a v16 save would boot the OLD map. The key move drops v16
// saves so every player picks the new town up.
// v18 moves for the 'ساختمان' deletion (user request): the plain cream
// cube-built structure (7 defs, uuid block …030–…036) is gone from the
// authored layout, and a v17 save still carries all 7 defs — the key move
// drops v17 saves so the cream box can never come back.
// v19 moves for the MODEL-FIX round (user request): the four shell houses
// spawn at SCALE 1.3 and the factory/collider fixes are baked into the
// builders — every browser rebuilds the town from the NEW authored layout.
// v20 moved for the TOWN REDESIGN (2026-09): the whole settlement layout —
// 120×120 ground, road network, farm, square, the six town-exterior buildings
// at NEW sites/yaws, rotated sites for the five original buildings.
// v21 moves for the VISUAL-DEFECT round (user bug report): vegetation rebuilt
// (craggy trees/twiggly scrub/blade grass), real troughs (bigger footprint),
// adult benches, structured hitching rails, coplanar-free crates, farm corral
// enlarged, plus the town-props prop round — a v20 save would keep the old
// props, so the key moves and every browser rebuilds from the new layout.
// v22 moves for the FIX-ROUND 3 (user 12-issue report): continuous-route road
// system (old rectangle strips would resurrect from a v21 save), family house
// moved beside the butcher, the two decorative farm-pen horses removed,
// porch/column/railing fixes, sign-face separations — every browser rebuilds.
const storage = new LocalSceneStorage(persistence, { key: 'ai-western-game.playable-map.scene.v22' });

// --- Authored-layout snapshot (the editor's "put it back" source) -----------
// Captured in loadSavedScene() AFTER every building module registered its
// default defs and BEFORE a saved scene replaces the registry. Restores go
// through SceneStateManager.updateObjectTransform — the ONE mutation funnel —
// so a reset is renderer-synced, change-logged and autosaved like any edit.
const authoredLayout = new AuthoredLayout();

/**
 * Restore ONE object to its authored layout transform. UI + harness path:
 * goes through AuthoredLayout.restore (manager.updateObjectTransform), then
 * persists, pulses the shadow refresh and refreshes every selection UI.
 */
function resetObjectToAuthored(uuid: string): boolean {
  if (!authoredLayout.restore(manager, uuid)) return false;
  storage.saveFromManager(manager, { map: 'playable-map', mode: 'development' });
  ui.updateSaveStatus();
  editShadowPulse = 0.25;
  ui.refreshSelectionHelper();
  ui.updateSelectionPanel();
  ui.updateEditorHud();
  return true;
}

/** Restore EVERY deviating object; returns how many actually moved. */
function resetAllToAuthored(): number {
  const restored = authoredLayout.restoreAll(manager);
  if (restored > 0) {
    storage.saveFromManager(manager, { map: 'playable-map', mode: 'development' });
    ui.updateSaveStatus();
    editShadowPulse = 0.25;
    ui.refreshSelectionHelper();
    ui.updateSelectionPanel();
    ui.updateEditorHud();
  }
  return restored;
}

const collisionWorld = new CollisionWorld(() => manager.getAllObjects(), { floorY: 0, events: manager.bus });
// Respawn at the farm road's north end (the redesigned town's progression
// starts at the farm and leads south — TownLayout is the single source).
const RESPAWN_POINT = { x: TOWN_RESPAWN.x, y: CHARACTER_PROPORTIONS.eyeHeight, z: TOWN_RESPAWN.z };
const playerController = new PlayerController(collisionWorld, {
  camera,
  initialPosition: { ...RESPAWN_POINT },
  cameraMode: 'third_person',
  stamina,
  crouchSpeed: 2.6,
  // Camera heights come from ONE source (CharacterProportions) — no local
  // copies of the eye height anywhere in this file.
  crouchEyeHeight: CHARACTER_PROPORTIONS.crouchEyeHeight,
  minEyeHeight: CHARACTER_PROPORTIONS.minEyeHeight,
  accelerationTime: 0.16,
  decelerationTime: 0.12,
  stepHeight: 0.35,
  jumpStaminaCost: 10,
  // Landing feeds the animator's impulse and (future) fall damage.
  onLand: (impactSpeed) => {
    characterAnimator.notifyLanding(impactSpeed);
    health.applyFallImpact(impactSpeed);
  },
});
const thirdPersonCamera = new ThirdPersonCamera(camera, () => collisionWorld.getCollisionBounds(), {
  // Framing heights derive from the same eye metrics (slightly below the eye
  // so the hat stays in frame without the camera staring over the head).
  targetHeight: CHARACTER_PROPORTIONS.eyeHeight - 0.15,
  crouchTargetHeight: CHARACTER_PROPORTIONS.crouchEyeHeight - 0.12,
  defaultDistance: 4.8,
  minDistance: 0.9,
  shoulderOffset: 0.34,
});
playerController.setThirdPersonRig(thirdPersonCamera);
const dayNight = new DayNightCycle(scene, sun, hemisphere, {
  dayDurationSeconds: 180,
  startTime: 8,
});

// Shadow-governor inputs: an edit transform (gizmo drag, keyboard nudge,
// panel value) marks the light frustum dirty for a short pulse so the map
// refreshes promptly even though the player/horse stand still. Declared
// BEFORE the editor wiring that pulses it (module top-to-bottom order).
let editShadowPulse = 0;
// HUD/panel DOM writes are throttled to 10Hz (see animate()).
let hudTimer = 0;

const editor = new ObjectEditorController(manager, {
  onObjectModified: () => {
    storage.saveFromManager(manager, { map: 'playable-map', mode: 'development' });
    ui.updateSaveStatus();
    editShadowPulse = 0.25; // edited object → its shadow needs a refresh
  },
});

// --- Interaction foundation (Part 2): generic, reusable for doors/NPCs/items.
let statusMessageTimer = 0;
function showStatusMessage(message: string): void {
  const element = document.getElementById('status-message');
  if (!element) return;
  element.textContent = message;
  statusMessageTimer = 2.4;
}
const interactions = new InteractionSystem({
  defaultRange: 2.8,
  onPromptChange: (interactable) => {
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.textContent = interactable ? `[E] ${interactable.label}` : '';
  },
});

// Mouse transform gizmo (primary editor control). Purely an editor tool:
// never registered in the manager, never saved, never selectable, never a
// collider — every node carries the debug-helper tag.
const gizmo = new TransformGizmo({
  manager,
  // Penetration guard: a move drag stops exactly at the contact boundary
  // with the ground or another object (world-AABB based) instead of sinking
  // into it. No snapping — only the penetration direction is clamped.
  clampMoveDelta: makeSceneAxisClamp(scene, manager),
  onTransformCommitted: () => {
    // One save per completed drag keeps localStorage write volume sane while
    // the pointer moves continuously.
    storage.saveFromManager(manager, { map: 'playable-map', mode: 'development' });
    ui.updateSaveStatus();
    editShadowPulse = 0.25; // drag settled → refresh the parked shadows
  },
});
gizmo.root.visible = false;
scene.add(gizmo.root);

// Flush-contact indicator: while dragging the selected object, a small ring
// appears BETWEEN the two facing surfaces (object-object or object-ground)
// as soon as they are flush. Surface/bounds based (world AABBs), never
// center-distance. Purely visual — never registered, never saved, never a
// collider, never selectable; updated per frame so gizmo drags are live and
// the marker vanishes the instant the surfaces separate.
const contactIndicator = new ContactIndicator();
scene.add(contactIndicator.group);

// --- Every E-openable door in town (one system, one contract) ---------------
// The full door contract (spawn closed / target-flip E / pose re-derived from
// t / collider released past half-open) lives in game/doors.ts; the
// composition root owns only the wiring and the per-frame tick.
const doorSystem = createDoorSystem({ scene, manager, interactions, showStatusMessage });

// Dev verification hook (write-capable, harness-only): teleports, day-pinning,
// camera parking, door/ride/geometry probes. The full probe contract lives in
// game/testHooks.ts — the composition root only wires the context together.
// The horse rig is declared later in this module, so its two providers stay
// lazy (evaluated at probe time, never at installation time).
(window as unknown as Record<string, unknown>).__westTest = createTestHooks({
  scene,
  camera,
  renderer,
  manager,
  adapter,
  collisionWorld,
  playerController,
  dayNight,
  horse: () => rig.horse,
  horseModelHead: () => rig.horseModel.joints.head,
  authoredLayout,
  resetObjectToAuthored,
  resetAllToAuthored,
  isRiding,
  doors: doorSystem.harness,
  rideState: () => rig.getRideState(),
});

function loadSavedScene(): void {
  // Snapshot the AUTHORED layout first: at this point every building module
  // has registered its default defs and nothing user-made has been applied.
  // The editor's reset actions restore exactly these transforms.
  authoredLayout.capture(manager.getAllObjects());
  try {
    storage.loadInto(manager);
  } catch (err) {
    // A broken/incompatible save must never take the whole game down at boot.
    // LocalSceneStorage keeps the raw payload, so a newer build can recover it.
    console.warn('[playable-map] failed to load saved scene — starting with the default map', err);
  }
  // Doors rebuild closed every boot; force saved metadata to match so a
  // save taken mid-open can never leave a closed-looking door walkable.
  doorSystem.rearmClosedAfterLoad();
  ui.updateSaveStatus();
}

/**
 * Lamp registration sweep (weak-laptop perf revision). Forward rendering
 * pays for EVERY visible PointLight in EVERY fragment — count, not range.
 * The boot build carries 16 real point lights (stable lanterns, saloon
 * chandeliers, sheriff stove/desk/lanterns, bank lamps); the DayNightCycle's
 * lamp policy burns them only while the sun is down (their emissive flame
 * chips keep them visibly "lit" in daylight).
 *
 * ASYNC MESH MATERIALIZATION: AssetRegistry.create() awaits every factory
 * result, so adapter meshes — and the lights inside them — land on
 * microtasks AFTER this module's bottom executes. The sweep therefore runs
 * on requestAnimationFrame (microtask queue guaranteed flushed) and retries
 * until it actually owns lights (capped), self-healing against any future
 * genuinely-async asset (GLTF). After success it never runs again — the
 * editor moves whole groups and never spawns or deletes lights.
 */
function registerSceneLamps(): number {
  let registered = 0;
  scene.traverse((o) => {
    if (o instanceof THREE.PointLight) {
      dayNight.registerLamp(o);
      registered += 1;
    }
  });
  console.debug(`[playable-map] lamp policy: ${registered} point light(s) registered`);
  return registered;
}

function scheduleLampSweep(attempt = 0): void {
  requestAnimationFrame(() => {
    if (registerSceneLamps() > 0 || attempt >= 10) return;
    scheduleLampSweep(attempt + 1);
  });
}

// --- Mode state machine (camera-ownership revision) -----------------------
// ONE owner of "which mode is the game in and who moves the camera":
//   play → gameplay rig · creative → fly camera · edit → nobody (parked).
// The full transition contract lives in src/core/GameModeController.ts;
// this wiring only translates delegate hooks into concrete systems:
//   • F (play↔creative): attach from the gameplay pose / reconnect the rig.
//   • TAB (enter edit): the camera PARKS wherever it is — from creative the
//     flight ends WITHOUT reconnecting anything; the camera never snaps.
//   • TAB (exit edit): back to the session's ORIGIN — play-origin reconnects
//     the gameplay rig (unchanged Play→Edit→Play), creative-origin RESUMES
//     the fly session (saved yaw/pitch, zero jump cut). The camera only
//     ever returns to the player when the USER presses F themselves.
const creativeFlight = new CreativeFlightController({ speed: 12 });
const modes = new GameModeController({
  delegate: {
    onPlayCameraReconnect: (source) => {
      playerController.setCameraMode(playerController.getCameraMode());
      if (source === 'creative-exit') showStatusMessage('Back to normal third person.');
    },
    onCreativeCameraAttach: (source) => {
      playerController.freezeMotion(); // stop in place: no run-in-place pose
      if (source === 'edit-resume') creativeFlight.resume(camera);
      else creativeFlight.begin(camera, playerController.getYaw(), playerController.getPitch());
      showStatusMessage('Creative mode: WASD fly · Space up · Ctrl down · Shift fast · F exit');
    },
    onEditEnter: (from) => {
      // From creative: release fly ownership but KEEP the session pose
      // (resume() continues it later). From play: the gameplay rig simply
      // stops being updated — both paths park the camera untouched.
      if (from === 'creative') creativeFlight.end();
    },
    onModeChanged: () => applyModeState(),
  },
});

// --- Editor UI (selection, panels, hints, object log, gizmo mouse) ----------
// One module owns every editor-facing DOM surface + the gizmo pointer
// interaction; see game/editorUi.ts. `isRiding` is late-bound — the horse
// rig exists further down this module and the closures only run post-boot.
const ui = createEditorUi({
  scene,
  camera,
  rendererDomElement: renderer.domElement,
  manager,
  adapter,
  editor,
  gizmo,
  modes,
  playerController,
  isRiding: () => isRiding(),
  authoredLayout,
  storage,
  showStatusMessage,
  resetObjectToAuthored,
  resetAllToAuthored,
});

const mouseLook = new MouseLookController();

// --- Horse system (Part 3) ---------------------------------------------------
// The full companion-horse rig (model/animator/AI/persistence, riding camera,
// staged mount/dismount choreography, rider + horse sync, periodic save) lives
// in game/horseRig.ts. `isRiding` stays a hoisted module function so the
// editor-UI closure above and every gameplay path below read the live state.
const rig = createHorseRig({
  scene,
  camera,
  collisionWorld,
  playerController,
  input,
  interactions,
  mouseLook,
  character,
  characterAnimator,
  characterStates,
  thirdPersonCamera,
  showStatusMessage,
  notifyEditorHud: () => ui.updateEditorHud(),
  notifyControlHint: () => ui.updateControlHint(),
});

/** The rider is mounted exactly when the character root is parented to the
 *  saddle socket — delegated to the rig (single source of truth). */
function isRiding(): boolean {
  return rig.isRiding();
}

/**
 * Mode wiring — the ONE place that mirrors the game mode into the input
 * systems and HUD. Every transition funnels through GameModeController's
 * onModeChanged → here, so boot and every TAB/F toggle stay in sync and the
 * character can never sit in play mode with a dead keyboard again.
 *
 * MODE PRIORITY CONTRACT: Edit Mode owns the keyboard/camera above
 * gameplay AND creative. This function only MIRRORS the current mode into
 * the input systems — it never performs mode transitions itself.
 */
function applyModeState(): void {
  const editMode = modes.isEdit();
  // Mirror the mode into the editor controller too: without this, the
  // editor's own editMode flag stays false forever and EVERY gizmo-less
  // edit path (arrow keys, rotation shortcuts, numeric panel inputs)
  // silently dead-checks in setSelectedTransform/moveSelected. Regression
  // from the camera-ownership refactor, which dropped the explicit
  // setEditMode calls from the TAB handler — the mirror belongs HERE, the
  // one funnel every transition flows through.
  editor.setEditMode(editMode);
  input.setEnabled(!editMode); // gameplay + creative controls live outside edit
  debugAxes.visible = editMode;
  // The editor's graph-paper aid never renders in play mode: over the 120 m
  // dusty map it reads as a modern grid, not a frontier town (town redesign
  // biome contract). Edit mode keeps it for placement reference.
  grid.visible = editMode;
  if (editMode) mouseLook.cancel(); // a held right-drag must not survive the mode switch
  ui.updateEditorHud();
  ui.updateControlHint();
}

window.addEventListener('keydown', (event) => {
  // While typing in a panel input the editor shortcuts must stay silent
  // ("1e5" would otherwise trigger the KeyE rotation, arrows would move the
  // object instead of moving the text caret).
  const eventTarget = event.target;
  if (eventTarget instanceof HTMLElement && (eventTarget.tagName === 'INPUT' || eventTarget.tagName === 'TEXTAREA')) return;

  if (event.code === 'Tab') {
    event.preventDefault();

    if (!modes.isEdit()) {
      // Entering Edit Mode (from Play OR Creative). The rider dismounts
      // first — the editor owns the world, nobody rides during editing —
      // and INSTANTLY: the editor must not wait for the choreography.
      if (isRiding()) rig.dismountHorse({ instant: true });
      modes.enterEdit(); // parks the camera EXACTLY where it is — no snap
    } else {
      // Leaving Edit Mode hands the camera back to the session's ORIGIN
      // (GameModeController contract): a play-origin edit reconnects the
      // gameplay camera (the normal Play→Edit→Play path), a creative-origin
      // edit RESUMES the fly camera where it left off — no player snap.
      modes.exitEdit();
    }

    ui.refreshSelectionHelper();
    return;
  }

  // NOTE: KeyV (camera) and Space (jump) are intentionally NOT handled here.
  // They are edge actions of InputBindings consumed once per frame in
  // animate() — handling them here as well toggled/applied every action
  // TWICE (the camera toggle cancelled itself out and never switched).

  // Horse commands (COME / STAY) + debug vitals — play mode only (in Edit
  // Mode the editor keeps T/G/Q/E/R/F for its rotate shortcuts, and the world
  // is paused anyway).
  //
  // COMMAND MODEL (controls revision §1/§2):
  //   B = COME   — the horse explicitly navigates to the player.
  //   N = STAY   — the horse parks; PERMANENT until N again (release) or B.
  //   No command = NO autonomous follow — the horse never closes the gap on
  //   its own, no matter how far the player walks.
  //   Horse damage/heal are DEBUG-ONLY actions on [ / ] — keys with NO other
  //   meaning anywhere in the game (a Shift-modified B/N would collide with
  //   sprint+command and leave one key carrying two meanings).
  if (modes.isPlay()) {
    if (event.code === 'KeyB' && !rig.horse.isMounted()) {
      if (rig.horse.summon()) showStatusMessage('COME — your horse makes its way to you.');
      else showStatusMessage(`COME ready in ${rig.horse.summonCooldown.toFixed(1)}s`);
    }
    if (event.code === 'KeyN' && !rig.horse.isMounted()) {
      if (rig.horse.stay()) showStatusMessage(rig.horse.isStaying() ? 'STAY — your horse waits here.' : 'Stay released.');
      else showStatusMessage(rig.horse.isStaying() ? 'STAY — your horse waits here.' : 'Your horse cannot stay right now.');
    }
    if (event.code === 'BracketLeft') {
      // DEBUG ONLY: exercise horse damage/flee/death without combat.
      const p = playerController.getPosition();
      rig.horse.damage(25, p.x, p.z);
    }
    if (event.code === 'BracketRight') rig.horse.heal(35); // DEBUG ONLY
  }

  if (!modes.isEdit()) return;

  const fast = event.shiftKey;
  let handled = false;
  if (event.code === 'ArrowLeft') handled = editor.moveSelected('left', fast);
  if (event.code === 'ArrowRight') handled = editor.moveSelected('right', fast);
  if (event.code === 'ArrowUp') handled = editor.moveSelected('forward', fast);
  if (event.code === 'ArrowDown') handled = editor.moveSelected('backward', fast);
  if (event.code === 'PageUp') handled = editor.moveSelected('up', fast);
  if (event.code === 'PageDown') handled = editor.moveSelected('down', fast);
  // Local-axis rotation: Q/E = Y, R/F = X, T/G = Z (Shift = 45° instead of 15°).
  if (event.code === 'KeyQ') handled = editor.rotateSelected('y', 1, fast);
  if (event.code === 'KeyE') handled = editor.rotateSelected('y', -1, fast);
  if (event.code === 'KeyR') handled = editor.rotateSelected('x', 1, fast);
  if (event.code === 'KeyF') handled = editor.rotateSelected('x', -1, fast);
  if (event.code === 'KeyT') handled = editor.rotateSelected('z', 1, fast);
  if (event.code === 'KeyG') handled = editor.rotateSelected('z', -1, fast);
  if (handled) { event.preventDefault(); ui.refreshSelectionHelper(); ui.updateEditorHud(); editShadowPulse = 0.25; }
});

// --- Mouse look: RIGHT-button drag only ----------------------------------
// The camera rotates ONLY while the right mouse button is held. Left click
// never rotates, and there is no pointer-lock look path at all — a locked
// pointer without the right button held must stay inert.
// (The controller itself is constructed next to the horse rig above, which
// reads `mouseLook.isDragging` for the ride-cam chase behaviour.)

renderer.domElement.addEventListener('pointerdown', (event: PointerEvent) => {
  if (modes.isEdit()) return; // the editor owns the mouse in edit mode
  if (event.button !== 2) return;  // left/middle clicks never touch the camera
  if (mouseLook.beginDrag(event.button, event.clientX, event.clientY)) {
    // Capture so the release outside the window still ends the drag.
    renderer.domElement.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }
});

// The context menu would steal the right button's pointerup and leave the
// drag stuck — suppress it in play mode.
renderer.domElement.addEventListener('contextmenu', (event) => {
  if (!modes.isEdit()) event.preventDefault();
});

window.addEventListener('pointermove', (event: PointerEvent) => {
  // Right-drag look accumulates pixel deltas; consumed once per frame so a
  // burst of mouse events applies smoothly and nothing is processed twice.
  // (The gizmo drag has its own pointermove listener in game/editorUi.ts —
  // the two are mode-exclusive: look is play/creative, gizmo is edit.)
  if (mouseLook.isDragging) mouseLook.updateMove(event.clientX, event.clientY);
});

window.addEventListener('pointerup', (event: PointerEvent) => {
  if (mouseLook.isDragging && mouseLook.endDrag(event.button)) {
    renderer.domElement.releasePointerCapture?.(event.pointerId);
  }
});

window.addEventListener('blur', () => {
  mouseLook.cancel();
});

function updatePlayer(delta: number): void {
  // Creative mode: the player is frozen in place — no update means no
  // movement, no gravity and no collision. The fly camera owns the frame.
  // Riding: the player is attached to the saddle — the horse owns the frame.
  if (!modes.isPlay() || isRiding()) return;
  playerController.update(delta, input.getMoveInput());
}

// --- Death & respawn ------------------------------------------------------
let respawnCountdown = 0;
function respawn(): void {
  const safe = findSafeSpawnPosition(collisionWorld, { candidates: [{ ...RESPAWN_POINT }] });
  playerController.respawnAt(safe);
  health.reset();
  stamina.reset();
  characterAnimator.reset();
  characterStates.force('idle');
  respawnCountdown = 0;
  showStatusMessage('Back in the saddle.');
}
health.on((event) => {
  if (event !== 'died') return;
  if (isRiding()) rig.dismountHorse({ instant: true }); // never die in the saddle
  playerController.setDead(true);
  characterStates.force('dead');
  respawnCountdown = 2.6;
});

function syncCharacter(delta: number, previousBodyYaw: number): void {
  const feet = playerController.getFeetPosition();
  character.root.position.set(feet.x, feet.y, feet.z);
  // The MESH follows the BODY yaw (smoothed, movement/camera decoupled) —
  // never the raw camera yaw, which would snap the whole body with the mouse.
  const bodyYaw = playerController.getBodyYaw();
  character.root.rotation.y = bodyYaw;
  const speed = playerController.getHorizontalSpeed();
  const yawRate = (bodyYaw - previousBodyYaw) / Math.max(delta, 1e-4);
  characterStates.evaluate({
    dead: playerController.isDead(),
    grounded: playerController.isGrounded(),
    verticalVelocity: playerController.getVerticalVelocity(),
    speed,
    crouching: playerController.isCrouching(),
    sprinting: playerController.isSprinting(),
    interacting: interactHold > 0,
  });
  characterStates.tick(delta);
  characterAnimator.update({
    state: characterStates.current,
    deltaSeconds: delta,
    speed,
    turnRate: yawRate,
    // Head-look: the gaze layer tracks the camera (clamped + smoothed by the
    // controller) while the body keeps its own course.
    lookYaw: playerController.getHeadLookYaw(),
    lookPitch: playerController.getHeadLookPitch(),
  });
  // Stamina only drains while actually sprinting forward.
  stamina.update(delta, playerController.isSprinting() && speed > 0.5 && playerController.isGrounded());
  // Camera: the rig owns third person; the controller keeps first person.
  // In creative mode neither runs — the fly camera owns the frame. In edit
  // mode neither runs either: the editor keeps whatever camera transform it
  // inherited (gameplay framing from play, or the fly camera's framing from
  // a Creative session) and must never be dragged back to the player.
  if (modes.isPlay() && playerController.getCameraMode() === 'third_person') {
    // Crouch factor from the CONTROLLER's own eye metrics (single source) —
    // 1 = standing, 0 = fully crouched.
    const standEye = playerController.getStandingEyeHeight();
    const crouchEye = playerController.getCrouchEyeHeight();
    const eye = playerController.getEyeHeight();
    const crouchFactor = Math.max(0, Math.min(1, (eye - crouchEye) / Math.max(1e-5, standEye - crouchEye)));
    thirdPersonCamera.update({
      targetPosition: feet,
      yaw: playerController.getYaw(),
      pitch: playerController.getPitch(),
      crouchFactor,
      deltaSeconds: delta,
    });
  }
  // First person hides the head AND the neck stub under the camera.
  character.setFirstPerson(playerController.getCameraMode() === 'first_person');
  character.updateLOD(camera.position);
}

let interactHold = 0;

function setHud(): void {
  const player = playerController.getPosition();
  const position = document.getElementById('player-position');
  const managed = document.getElementById('stat-count');
  const rendered = document.getElementById('stat-render');
  const time = document.getElementById('time-of-day');
  const riding = isRiding() || rig.horse.isMounted();
  if (position) {
    // While riding the HUD tracks the horse — the rider has no independent
    // position until dismounting.
    position.textContent = riding
      ? `${rig.horse.getPosition().x.toFixed(1)}, ${rig.horse.getPosition().y.toFixed(1)}, ${rig.horse.getPosition().z.toFixed(1)} · riding`
      : `${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)}`;
  }
  if (managed) managed.textContent = String(manager.getObjectCount());
  if (rendered) rendered.textContent = String(adapter.getActiveObjectCount());
  if (time) {
    const hours = dayNight.getTimeOfDay();
    const hour = Math.floor(hours);
    const minute = Math.floor((hours - hour) * 60);
    time.textContent = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  // Vitals + character state panel.
  const healthFill = document.getElementById('health-fill') as HTMLDivElement | null;
  const staminaFill = document.getElementById('stamina-fill') as HTMLDivElement | null;
  const healthNum = document.getElementById('health-num');
  const staminaNum = document.getElementById('stamina-num');
  const stateLabel = document.getElementById('char-state');
  if (healthFill) healthFill.style.width = `${(health.ratio * 100).toFixed(0)}%`;
  if (staminaFill) {
    staminaFill.style.width = `${(stamina.ratio * 100).toFixed(0)}%`;
    staminaFill.classList.toggle('locked', stamina.isSprintLocked);
  }
  if (healthNum) healthNum.textContent = String(Math.ceil(health.current));
  if (staminaNum) staminaNum.textContent = String(Math.ceil(stamina.current));
  if (stateLabel) stateLabel.textContent = riding ? 'RIDING' : characterStates.current.toUpperCase();
  // Horse panel (Part 3): the player↔horse relationship at a glance.
  const snap = rig.horse.getSnapshot();
  const rel = rig.horse.getRelationship();
  const horseHealthFill = document.getElementById('horse-health-fill') as HTMLDivElement | null;
  const horseStaminaFill = document.getElementById('horse-stamina-fill') as HTMLDivElement | null;
  const horseHealthNum = document.getElementById('horse-health-num');
  const horseStaminaNum = document.getElementById('horse-stamina-num');
  const horseState = document.getElementById('horse-state');
  const horseGait = document.getElementById('horse-gait');
  const horseDist = document.getElementById('horse-dist');
  if (horseHealthFill) horseHealthFill.style.width = `${(snap.healthRatio * 100).toFixed(0)}%`;
  if (horseStaminaFill) {
    horseStaminaFill.style.width = `${(snap.staminaRatio * 100).toFixed(0)}%`;
    horseStaminaFill.classList.toggle('locked', snap.fatigued);
  }
  if (horseHealthNum) horseHealthNum.textContent = String(Math.ceil(snap.health));
  if (horseStaminaNum) horseStaminaNum.textContent = String(Math.ceil(snap.stamina));
  if (horseState) horseState.textContent = (rel.player === 'riding' ? 'RIDING' : rel.horse).toUpperCase();
  if (horseGait) {
    horseGait.textContent = (rel.player === 'riding' ? snap.targetGait : snap.gait).toUpperCase()
      + (snap.reversing ? ' · REV' : '')
      + (snap.fatigued ? ' · TIRED' : '');
  }
  if (horseDist) {
    horseDist.textContent = rel.player === 'riding'
      ? '0.0m'
      : `${Math.hypot(snap.position.x - player.x, snap.position.z - player.z).toFixed(1)}m`;
  }
}

const clock = new THREE.Clock();
let previousBodyYaw = playerController.getBodyYaw();

// --- FPS + frame-time counter (controls revision §6) -----------------------
// Always visible in the PLAY MODE panel (the game runs in development mode).
// Sampled over 0.5s windows so the text stays readable; the frame-time figure
// is an exponential moving average over the LAST frames (spike-sensitive).
// NOTE: this uses REAL wall-clock deltas (performance.now), NOT the game's
// clamped delta (animate caps it at 50ms — the counter must still report
// frame costs beyond that clamp honestly).
const fpsValueEl = document.getElementById('fps-value');
const frameValueEl = document.getElementById('frame-value');
const dprValueEl = document.getElementById('dpr-value');
let perfWindowStart = performance.now();
let perfFrames = 0;
let frameEma = 1 / 60;
let perfLast = perfWindowStart;
function updatePerfCounter(): void {
  const now = performance.now();
  const wallDelta = Math.max(0, now - perfLast) / 1000;
  perfLast = now;
  frameEma += (wallDelta - frameEma) * 0.05;
  perfFrames += 1;
  const elapsed = (now - perfWindowStart) / 1000;
  if (elapsed >= 0.5 && fpsValueEl && frameValueEl) {
    fpsValueEl.textContent = (perfFrames / elapsed).toFixed(0);
    frameValueEl.textContent = (frameEma * 1000).toFixed(1);
    if (dprValueEl) dprValueEl.textContent = resolution.getPixelRatio().toFixed(2);
    perfWindowStart = now;
    perfFrames = 0;
  }
  // The render governor (DPR ladder) runs on this real wall clock — no
  // clamped game delta, no clamped rung changes.
  resolution.update(now, frameEma);
}

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.05);
  // Right-drag look FIRST: the accumulated pixel delta becomes yaw/pitch
  // before the player updates, so movement and the camera agree this frame.
  const lookDelta = mouseLook.consumeLookDelta();
  if (!modes.isEdit() && (lookDelta.x !== 0 || lookDelta.y !== 0)) {
    if (modes.isCreative()) creativeFlight.look(lookDelta.x, lookDelta.y);
    else if (isRiding()) rig.updateRideLook(lookDelta.x, lookDelta.y);
    else playerController.look(lookDelta.x, lookDelta.y);
  }
  updatePlayer(delta);
  // F toggles the Development fly camera (edge action, consumed once).
  if (input.consumePressed('creativeToggle')) {
    if (isRiding()) showStatusMessage('Dismount first (E).');
    else modes.toggleCreative();
  }
  // Edge-triggered play actions (death gates everything but respawn).
  if (modes.isCreative()) {
    // Creative owns the movement keys: discard the play edges so nothing
    // (jump queue, crouch, camera toggle…) leaks in or out of the mode.
    input.consumePressed('jump');
    input.consumePressed('crouch');
    input.consumePressed('interact');
    input.consumePressed('cameraToggle');
    input.consumePressed('debugDamage');
    input.consumePressed('debugHeal');
    input.consumePressed('respawn');
    input.consumePressed('forward');
    input.consumePressed('backward');
  } else if (modes.isPlay()) {
    if (isRiding() && rig.horse.isMounted()) {
      // Riding: movement keys ARE the horse's reins; the rest is consumed
      // so nothing leaks into the (paused) player controller.
      input.consumePressed('jump');
      input.consumePressed('crouch');
      input.consumePressed('respawn');
      if (input.consumePressed('interact')) rig.dismountHorse();
      // The camera stays THIRD PERSON for the whole mount AND dismount
      // choreography — a V press during either animation is dropped, not
      // queued (it would yank the view off the playing dismount).
      if (!rig.isMountAnimating() && !rig.isDismountAnimating() && input.consumePressed('cameraToggle')) { playerController.toggleCameraMode(); ui.updateEditorHud(); }
      if (input.consumePressed('debugDamage')) health.damage(30);
      if (input.consumePressed('debugHeal')) health.heal(35);
    } else {
      const dead = playerController.isDead();
      // On foot the movement keys are hold-states: drain their edges.
      input.consumePressed('forward');
      input.consumePressed('backward');
      if (!dead && input.consumePressed('jump')) playerController.requestJump();
      if (!dead && input.consumePressed('crouch')) playerController.toggleCrouch();
      if (!dead && input.consumePressed('interact') && interactions.tryInteract()) interactHold = 0.5;
      // The mount forces THIRD PERSON (mountEnterCameraMode) — a V press in
      // the SAME frame as the E-mount must not flip it back (edge consumed
      // after the interact). Drop it when a mount just started.
      if (input.consumePressed('cameraToggle') && !rig.isMountAnimating()) { playerController.toggleCameraMode(); ui.updateEditorHud(); }
      if (!dead && input.consumePressed('debugDamage')) health.damage(30);
      if (!dead && input.consumePressed('debugHeal')) health.heal(35);
      if (dead && input.consumePressed('respawn')) respawnCountdown = 0;
    }
  }
  if (respawnCountdown > 0) {
    respawnCountdown -= delta;
    if (respawnCountdown <= 0) respawn();
  }
  if (interactHold > 0) interactHold -= delta;
  if (statusMessageTimer > 0) {
    statusMessageTimer -= delta;
    if (statusMessageTimer <= 0) {
      const element = document.getElementById('status-message');
      if (element) element.textContent = '';
    }
  }
  // Horse world update: AI decisions, gaits, collision. The horse must run
  // BEFORE the HUD but AFTER the player moved, so its player-overlap push-out
  // uses this frame's position (spec §14: no hard player↔horse overlap).
  if (modes.isPlay()) {
    const riding = isRiding() && rig.horse.isMounted() ? rig.buildRidingInput() : undefined;
    const playerPos = playerController.getPosition();
    rig.horse.update({
      deltaSeconds: delta,
      playerX: playerPos.x,
      playerY: playerPos.y,
      playerZ: playerPos.z,
      playerMoving: !isRiding() && playerController.getHorizontalSpeed() > 0.5,
    }, riding);
    const separation = rig.horse.takePlayerSeparation();
    if (separation && !isRiding()) {
      playerController.setPosition({ x: separation.x, y: playerController.getPosition().y, z: separation.z });
    }
    // Periodic persistence: save when the horse actually changed (spec §17).
    rig.tickPersistence(delta);
  }
  // Fly the creative camera AFTER the (skipped) player update: Space/Ctrl
  // drive vertical motion, Shift doubles the speed.
  if (modes.isCreative()) {
    const move = input.getMoveInput();
    creativeFlight.update(delta, {
      forward: move.forward,
      backward: move.backward,
      left: move.left,
      right: move.right,
      up: input.isDown('jump'),
      down: input.isDown('crouch'),
      fast: move.sprint,
    }, camera);
  }
  // Rider and horse sync: while mounted the character root is a child of the
  // saddle socket (bit-stable relative to the horse) and the riding camera
  // rig owns the frame; otherwise the normal on-foot sync runs. ONE horse
  // snapshot per frame feeds both syncs AND the shadow governor below.
  const horseSnap = rig.horse.getSnapshot();
  if (isRiding()) rig.syncRider(delta, horseSnap);
  else {
    syncCharacter(delta, previousBodyYaw);
    previousBodyYaw = playerController.getBodyYaw();
  }
  rig.syncHorse(delta, horseSnap);
  doorSystem.update(delta); // every door swing + collider/walkability sync
  if (modes.isPlay() && !isRiding()) interactions.update(
    { x: playerController.getPosition().x, y: playerController.getPosition().y - 1, z: playerController.getPosition().z },
    { x: -Math.sin(playerController.getYaw()), y: 0, z: -Math.cos(playerController.getYaw()) },
  );
  dayNight.update(delta);
  // Shadow maps refresh ON DEMAND (RenderGovernor): the depth pass is real
  // money (~12ms per 2048² pass on the harness; ~1.4ms at 768²), so the
  // scheduler fires it only when the cooldown expires — fast cadence while
  // casters move (player/horse/mount/DEmount/edit drags), slow cadence when
  // only the sun drifts (~0.02°/frame — identical shadows between passes).
  const castersMoving = rig.isMountAnimating()
    || rig.isDismountAnimating()
    || gizmo.isDragging()
    || editShadowPulse > 0
    || playerController.getHorizontalSpeed() > 0.25
    || Math.abs(playerController.getVerticalVelocity()) > 0.5
    || Math.abs(horseSnap.speed) > 0.25;
  renderer.shadowMap.needsUpdate = shadows.update(delta, castersMoving);
  if (editShadowPulse > 0) editShadowPulse -= delta;
  gizmo.sync(modes.isEdit(), editor.getSelectedUuid());
  // The selection box only needs to track transforms in edit mode; the one
  // frame after leaving edit mode hides it for good.
  if (modes.isEdit() || ui.isSelectionBoxVisible()) ui.refreshSelectionHelper();
  contactIndicator.update({
    editMode: modes.isEdit(),
    selectedUuid: editor.getSelectedUuid(),
    scene,
    manager,
  });
  // HUD + selection panel at 10Hz instead of every frame: ~25 DOM writes
  // per frame were a measurable CPU tax on weak laptops (the render itself
  // dominates the GPU, but THIS trims the main thread). The perf counter
  // above keeps its own faster windows.
  hudTimer -= delta;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    ui.updateSelectionPanel();
    setHud();
  }
  updatePerfCounter();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
  const width = Math.max(stage.clientWidth, 1);
  const height = Math.max(stage.clientHeight, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

loadSavedScene();
scheduleLampSweep(); // deferred: adapter meshes (and their lights) materialize on microtasks
applyModeState(); // boot: play mode → input ENABLED (the movement fix)
setHud();
ui.updateSelectionPanel();
animate();
