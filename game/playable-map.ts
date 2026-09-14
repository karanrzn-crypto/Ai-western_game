import * as THREE from 'three';
import {
  SceneStateManager,
  ThreeRendererAdapter,
  AssetRegistry,
  registerPrimitiveFactories,
  PersistenceManager,
  CollisionWorld,
  DayNightCycle,
  LocalSceneStorage,
  PlayerController,
  ObjectEditorController,
  TransformGizmo,
  ContactIndicator,
  makeSceneAxisClamp,
  createDebugAxes,
  formatSelectedObjectInfo,
  formatPanelNumber,
  parsePanelNumber,
  buildPanelTransformPatch,
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
  createHorseModel,
  HorseAnimator,
  HorseController,
  mountEnterCameraMode,
  HorsePersistence,
  HORSE_PROPORTIONS,
  buildMountTimeline,
  mountRootPose,
  poseMountRider,
  applyRiderPose,
  mountSafeRadius,
  MOUNT_STAND,
  MOUNT_SEAT_QUATERNION,
} from '../src/index.js';
import type { MountStartState, MountTimeline } from '../src/index.js';
import type { PanelAxis, PanelValueGroup } from '../src/index.js';
import { CHARACTER_PROPORTIONS } from '../src/player/character/CharacterProportions.js';

configure({ debug: false, logging: { level: 'info' } });

const stage = document.getElementById('stage');
if (!stage) throw new Error('Missing #stage');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9a8d72);
scene.fog = new THREE.Fog(0x9a8d72, 35, 90);

const camera = new THREE.PerspectiveCamera(
  70,
  Math.max(stage.clientWidth, 1) / Math.max(stage.clientHeight, 1),
  0.05,
  120,
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
// --- Adaptive resolution ladder (final-polish perf revision) ----------------
// The frame cost is FILL-BOUND — measured matrix (forced pixelRatio on the
// 1280×800 harness): 1.5 → 166.6ms/6fps, 1.25 → 116.6/8.6, 1.0 → 83.3/12,
// 0.85 → 66.6/15, 0.75 → 50/20 (frame time is linear in pixels). Shadow-map
// size (2048→768), update frequency (every 1–4 frames) and frustum shrink
// were A/B-measured as noise on this scene (≤1ms) — resolution is THE lever.
// The ladder starts at the best quality and walks DOWN only while the
// already-shipped wall-clock frame EMA reads a bad framerate, and back UP
// when there is headroom. Real-GPU machines never leave the top rung;
// software-rendered machines converge to the fastest readable rung.
const DPR_LADDER = [1.5, 1.25, 1.0, 0.85, 0.75] as const;
let dprRung = 0;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_LADDER[0]));
renderer.setSize(Math.max(stage.clientWidth, 1), Math.max(stage.clientHeight, 1));
renderer.shadowMap.enabled = true;
// Shadow depth pass (4.2MP at 2048²) costs ~10.5ms per frame — re-rendering
// it EVERY frame is wasted work while the sun orbits a barely-visible
// 0.02°/frame (180s day). autoUpdate off + needsUpdate every other frame
// (set in animate()) halves that cost with an invisible one-frame shadow lag.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const sun = new THREE.DirectionalLight(0xffe7bd, 2.2);
sun.position.set(-25, 35, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// Shadow frustum sized to the PLAYABLE AREA (final-polish perf revision):
// the map is a 60×60 ground plane, so its farthest point from the light
// target (the origin) is the half-diagonal 30√2 ≈ 42.4m. An ortho box of
// ±42.5 contains every map point for EVERY sun azimuth (a projection never
// exceeds the vector length), while the old hand-waved ±55 wasted 38% of
// the shadow map's texel density. 2048² / 85m ≈ 24 texels/m (was 18.6).
// Map size (2048→768) and update frequency (1–4 frames) were A/B-measured
// as nearly free on the depth pass — 2048² every-other-frame stays.
sun.shadow.camera.left = -42.5;
sun.shadow.camera.right = 42.5;
sun.shadow.camera.top = 42.5;
sun.shadow.camera.bottom = -42.5;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.03;
scene.add(sun);

const hemisphere = new THREE.HemisphereLight(0xf0e0bf, 0x4b493d, 1.2);
scene.add(hemisphere);

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

const grid = new THREE.GridHelper(60, 60, 0x514b40, 0x6b6252);
grid.position.y = 0.01;
scene.add(grid);

// Coordinate reference: world origin (0,0,0) + X/Y/Z direction axes.
// Purely visual debug overlay — never registered in the manager, so it can
// never be selected or moved; drawn with depthTest off so it reads as an
// overlay instead of "an object poking out of the spawn cube".
// Shown only while Edit Mode is active.
const debugAxes = createDebugAxes();
debugAxes.visible = false;
scene.add(debugAxes);

const assets = new AssetRegistry();
registerPrimitiveFactories(assets);

const adapter = new ThreeRendererAdapter({ scene, assetRegistry: assets });
const manager = new SceneStateManager({ renderer: adapter });
const persistence = new PersistenceManager();
// Storage key v4: the map objects received human-readable Persian names, so
// old v3 saves (previous names) must not shadow the renamed default map.
const storage = new LocalSceneStorage(persistence, { key: 'ai-western-game.playable-map.scene.v4' });
const collisionWorld = new CollisionWorld(() => manager.getAllObjects(), { floorY: 0, events: manager.bus });
const RESPAWN_POINT = { x: 0, y: CHARACTER_PROPORTIONS.eyeHeight, z: 12 };
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

const editor = new ObjectEditorController(manager, {
  onObjectModified: () => {
    storage.saveFromManager(manager, { map: 'playable-map', mode: 'development' });
    updateSaveStatus();
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
    updateSaveStatus();
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

const groundUuid = '10000000-0000-4000-a000-000000000001';
manager.registerObject({
  uuid: groundUuid,
  assetType: 'ground',
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: -90, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  },
  metadata: { name: 'زمین نقشه اصلی', size: 60, collider: false, editable: false },
});

function addBoundary(uuid: string, name: string, position: THREE.Vector3, scale: THREE.Vector3): void {
  manager.registerObject({
    uuid,
    assetType: 'cube',
    transform: {
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: scale.x, y: scale.y, z: scale.z },
    },
    metadata: { name, mapBoundary: true, editable: false, collider: true },
  });
}

addBoundary('10000000-0000-4000-a000-000000000010', 'دیوار مرزی شمالی', new THREE.Vector3(0, 1.5, -29.5), new THREE.Vector3(60, 3, 1));
addBoundary('10000000-0000-4000-a000-000000000011', 'دیوار مرزی جنوبی', new THREE.Vector3(0, 1.5, 29.5), new THREE.Vector3(60, 3, 1));
addBoundary('10000000-0000-4000-a000-000000000012', 'دیوار مرزی غربی', new THREE.Vector3(-29.5, 1.5, 0), new THREE.Vector3(1, 3, 60));
addBoundary('10000000-0000-4000-a000-000000000013', 'دیوار مرزی شرقی', new THREE.Vector3(29.5, 1.5, 0), new THREE.Vector3(1, 3, 60));

const spawnUuid = '10000000-0000-4000-a000-000000000020';
manager.registerObject({
  uuid: spawnUuid,
  assetType: 'cube',
  transform: {
    position: { x: 0, y: 0.75, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 3, y: 1.5, z: 3 },
  },
  metadata: { name: 'مکعب اسپاون', editable: true, collider: true },
});

// A demo interactable for the generic interaction system (E key).
interactions.register({
  uuid: spawnUuid,
  label: 'Inspect supply crate',
  getPosition: () => ({ x: 0, y: 0.75, z: 0 }),
  onInteract: () => showStatusMessage('The crate holds jerky, rifle rounds and a worn tin star.'),
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd166);
selectionBox.visible = false;
scene.add(selectionBox);

function refreshSelectionHelper(): void {
  const selectedUuid = editor.getSelectedUuid();
  if (!selectedUuid) { selectionBox.visible = false; return; }
  const mesh = scene.getObjectByProperty('uuid', selectedUuid);
  if (!mesh) { selectionBox.visible = false; return; }
  selectionBox.box.setFromObject(mesh);
  selectionBox.visible = true;
}

function findManagedUuid(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (manager.has(current.uuid)) return current.uuid;
    current = current.parent;
  }
  return null;
}

function updatePointerFromEvent(event: MouseEvent): void {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function selectObjectFromPointer(event: MouseEvent): void {
  if (!editor.isEditMode()) return;
  updatePointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const candidates = adapter.getActiveUUIDs()
    .map((uuid) => scene.getObjectByProperty('uuid', uuid))
    .filter((obj): obj is THREE.Object3D => Boolean(obj));
  const hit = raycaster.intersectObjects(candidates, true)[0]?.object;
  const uuid = hit ? findManagedUuid(hit) : null;
  editor.select(uuid);
  refreshSelectionHelper();
  updateEditorHud();
}

function updateEditorHud(): void {
  const mode = document.getElementById('editor-mode');
  const selected = document.getElementById('editor-selection');
  const cameraLabel = document.getElementById('camera-mode');
  if (mode) mode.textContent = editor.isEditMode() ? 'EDIT MODE' : 'PLAY MODE';
  if (selected) {
    const selectedUuid = editor.getSelectedUuid();
    selected.textContent = selectedUuid ? manager.getObject(selectedUuid)?.metadata.name ?? selectedUuid : 'None';
  }
  if (cameraLabel) {
    // Edit owns the camera whenever it is open (it may sit anywhere a
    // Creative session left it) — reflect ownership, not the player's mode.
    cameraLabel.textContent = editor.isEditMode()
      ? 'EDIT CAMERA'
      : creativeActive
        ? 'CREATIVE FLIGHT'
        : isRiding()
          ? (playerController.getCameraMode() === 'third_person' ? 'RIDE · THIRD PERSON' : 'RIDE · FIRST PERSON')
          : playerController.getCameraMode() === 'third_person' ? 'THIRD PERSON' : 'FIRST PERSON';
  }
}

function updateControlHint(): void {
  const hint = document.getElementById('control-hint');
  if (!hint) return;
  if (editor.isEditMode()) {
    hint.textContent = 'TAB play · drag gizmo axes/rings · type values in panel · arrows move · PageUp/Down height · Q/E R/F T/G rotate 15° (Shift 45°)';
    return;
  }
  if (isRiding()) {
    hint.textContent = 'tap W/S = gait up/down · hold W ride · hold S brake · S at stop = reverse · A/D steer · RMB look · V camera · E dismount';
    return;
  }
  hint.textContent = 'WASD move · Hold RIGHT mouse = look · Shift sprint · Space jump · C/Ctrl crouch · E interact/mount · B come · N stay · V camera · F creative fly · H/J player debug · [ ] horse debug · R respawn · TAB edit';
}

function updateSelectionPanel(): void {
  const selectedUuid = editor.getSelectedUuid();
  const definition = selectedUuid ? manager.getObject(selectedUuid) : undefined;
  const info = formatSelectedObjectInfo(definition);
  const panel = document.getElementById('selection-panel');
  const name = document.getElementById('sel-name');
  const uuid = document.getElementById('sel-uuid');
  if (panel) panel.classList.toggle('no-selection', !definition);
  if (name) name.textContent = info.name;
  if (uuid) {
    // The UUID stays a debug-only annotation next to the human-readable name.
    uuid.textContent = definition ? `debug: ${info.uuid}` : 'No selection';
    uuid.title = definition ? `debug uuid: ${info.uuid}` : '';
  }
  for (const binding of PANEL_INPUTS) {
    const input = document.getElementById(binding.id) as HTMLInputElement | null;
    if (!input) continue;
    if (!definition) {
      input.value = '';
      input.disabled = true;
      continue;
    }
    input.disabled = false;
    // Never clobber the field the user is currently typing in; every other
    // field refreshes live from manager state (gizmo/keyboard/numeric edits
    // all land in the same place).
    if (document.activeElement === input) continue;
    input.value = formatPanelNumber(definition.transform[binding.group][binding.axis]);
  }
}

// Editable numeric fields of the selection panel (Position/Rotation/Scale).
const PANEL_INPUTS: Array<{ id: string; group: PanelValueGroup; axis: PanelAxis }> = [
  { id: 'sel-pos-x', group: 'position', axis: 'x' },
  { id: 'sel-pos-y', group: 'position', axis: 'y' },
  { id: 'sel-pos-z', group: 'position', axis: 'z' },
  { id: 'sel-rot-x', group: 'rotation', axis: 'x' },
  { id: 'sel-rot-y', group: 'rotation', axis: 'y' },
  { id: 'sel-rot-z', group: 'rotation', axis: 'z' },
  { id: 'sel-scl-x', group: 'scale', axis: 'x' },
  { id: 'sel-scl-y', group: 'scale', axis: 'y' },
  { id: 'sel-scl-z', group: 'scale', axis: 'z' },
];

function applyPanelInput(binding: { group: PanelValueGroup; axis: PanelAxis }, input: HTMLInputElement): void {
  const value = parsePanelNumber(input.value);
  if (value === null) return; // empty / partial draft — ignore, keep current value
  if (editor.setSelectedTransform(buildPanelTransformPatch(binding.group, binding.axis, value))) {
    refreshSelectionHelper();
    updateEditorHud();
  }
}

for (const binding of PANEL_INPUTS) {
  const input = document.getElementById(binding.id) as HTMLInputElement | null;
  if (!input) continue;
  // 'input' fires on typing AND on the spinner arrows, so edits apply
  // immediately through ObjectEditorController -> updateObjectTransform.
  input.addEventListener('input', () => applyPanelInput(binding, input));
}

function updateSaveStatus(): void {
  const saved = document.getElementById('save-status');
  if (!saved) return;
  saved.textContent = storage.hasSavedScene() ? `Saved ${new Date().toLocaleTimeString()}` : 'No saved scene';
}

function loadSavedScene(): void {
  try {
    storage.loadInto(manager);
  } catch (err) {
    // A broken/incompatible save must never take the whole game down at boot.
    // LocalSceneStorage keeps the raw payload, so a newer build can recover it.
    console.warn('[playable-map] failed to load saved scene — starting with the default map', err);
  }
  updateSaveStatus();
}

// --- Creative Mode (Development fly camera, F key) ------------------------
// A separate, self-contained Development mode: the CreativeFlightController
// owns ONLY the camera while active. The player stays exactly where he is
// (position/velocity/animation untouched, gravity + collision off because
// PlayerController.update simply isn't called) and the third-person rig is
// disconnected so nothing else can move the camera either. Exiting just
// reconnects the normal Third Person system — the player is NEVER teleported
// to the camera or vice versa.
const creativeFlight = new CreativeFlightController({ speed: 12 });
let creativeActive = false;

function setCreativeMode(active: boolean): void {
  if (active === creativeActive) return;
  creativeActive = active;
  if (active) {
    playerController.freezeMotion(); // stop in place: no run-in-place pose
    creativeFlight.begin(camera, playerController.getYaw(), playerController.getPitch());
    showStatusMessage('Creative mode: WASD fly · Space up · Ctrl down · Shift fast · F exit');
  } else {
    creativeFlight.end();
    // Reconnect the camera the player's mode already uses — without moving
    // the player. Third person re-snaps behind the character; first person
    // re-derives the eye from the untouched player state.
    playerController.setCameraMode(playerController.getCameraMode());
    showStatusMessage('Back to normal third person.');
  }
  updateEditorHud();
  updateControlHint();
}

/**
 * Mode wiring — the ONE place that mirrors the game mode into the input
 * systems. Boot and every Tab toggle go through this, so the character can
 * never sit in play mode with a dead keyboard again (the original movement
 * bug: input stayed disabled until the player pressed Tab twice).
 *
 * MODE PRIORITY CONTRACT: Edit Mode owns the keyboard/camera above
 * gameplay AND creative. This function only MIRRORS the current mode into
 * the input systems — it never performs mode transitions itself. The
 * transitions live explicitly in the TAB handler below: Creative→Edit
 * stops the flight WITHOUT touching the camera (the editor inherits the
 * fly camera's exact transform), while Edit→Play reconnects the gameplay
 * camera. F only toggles creative during normal Play Mode: in Edit Mode
 * the bindings are disabled (edges dropped below) so F can never re-enter
 * creative, and F keeps its editor rotate-shortcut role.
 */
function applyModeState(): void {
  const editMode = editor.isEditMode();
  input.setEnabled(!editMode); // character controls only live in play mode
  debugAxes.visible = editMode;
  if (editMode) mouseLook.cancel(); // a held right-drag must not survive the mode switch
  updateEditorHud();
  updateControlHint();
}

window.addEventListener('keydown', (event) => {
  // While typing in a panel input the editor shortcuts must stay silent
  // ("1e5" would otherwise trigger the KeyE rotation, arrows would move the
  // object instead of moving the text caret).
  const eventTarget = event.target;
  if (eventTarget instanceof HTMLElement && (eventTarget.tagName === 'INPUT' || eventTarget.tagName === 'TEXTAREA')) return;

  if (event.code === 'Tab') {
    event.preventDefault();

    if (!editor.isEditMode()) {
      // Entering Edit Mode (from Play OR Creative). The rider dismounts
      // first — the editor owns the world, nobody rides during editing.
      if (isRiding()) dismountHorse();
      // From Creative: stop the flight/input ownership but do NOT reconnect
      // or snap the gameplay camera — Edit Mode inherits the camera exactly
      // where the fly camera left it (same position AND rotation), so the
      // user can select/edit whatever they flew to. Only the F-exit path
      // (setCreativeMode(false)) reconnects the gameplay camera.
      if (creativeActive) {
        creativeFlight.end();
        creativeActive = false;
      }

      editor.setEditMode(true);
    } else {
      // Leaving Edit Mode always returns to normal Play Mode — never
      // re-enter Creative automatically. Reconnect the normal gameplay
      // camera: third person re-snaps behind the character, first person
      // re-derives the eye — the camera must not stay parked where a
      // Creative session left it.
      editor.setEditMode(false);
      playerController.setCameraMode(playerController.getCameraMode());
    }

    applyModeState();
    refreshSelectionHelper();
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
  if (!editor.isEditMode() && !creativeActive) {
    if (event.code === 'KeyB' && !horse.isMounted()) {
      if (horse.summon()) showStatusMessage('COME — your horse makes its way to you.');
      else showStatusMessage(`COME ready in ${horse.summonCooldown.toFixed(1)}s`);
    }
    if (event.code === 'KeyN' && !horse.isMounted()) {
      if (horse.stay()) showStatusMessage(horse.isStaying() ? 'STAY — your horse waits here.' : 'Stay released.');
      else showStatusMessage(horse.isStaying() ? 'STAY — your horse waits here.' : 'Your horse cannot stay right now.');
    }
    if (event.code === 'BracketLeft') {
      // DEBUG ONLY: exercise horse damage/flee/death without combat.
      const p = playerController.getPosition();
      horse.damage(25, p.x, p.z);
    }
    if (event.code === 'BracketRight') horse.heal(35); // DEBUG ONLY
  }

  if (!editor.isEditMode()) return;

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
  if (handled) { event.preventDefault(); refreshSelectionHelper(); updateEditorHud(); }
});

// --- Mouse look: RIGHT-button drag only ----------------------------------
// The camera rotates ONLY while the right mouse button is held. Left click
// never rotates, and there is no pointer-lock look path at all — a locked
// pointer without the right button held must stay inert.
const mouseLook = new MouseLookController();

renderer.domElement.addEventListener('pointerdown', (event: PointerEvent) => {
  if (editor.isEditMode()) return; // the editor owns the mouse in edit mode
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
  if (!editor.isEditMode()) event.preventDefault();
});

window.addEventListener('pointerup', (event: PointerEvent) => {
  if (mouseLook.isDragging && mouseLook.endDrag(event.button)) {
    renderer.domElement.releasePointerCapture?.(event.pointerId);
  }
});

window.addEventListener('blur', () => {
  mouseLook.cancel();
});

// --- Gizmo mouse interaction -------------------------------------------
// Selection moved to pointerdown: gizmo handles are checked FIRST; if one is
// hit the drag starts and object selection is skipped for this press, so the
// gizmo can never select/move anything but its own target.
renderer.domElement.addEventListener('pointerdown', (event: PointerEvent) => {
  if (!editor.isEditMode() || event.button !== 0) return;
  updatePointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const handle = gizmo.pickHandle(raycaster.ray);
  if (handle) {
    // preventDefault() suppresses the browser's focus-change default, so a
    // field left focused after typing would freeze mid-drag — blur it
    // explicitly so the panel keeps refreshing live while dragging.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    gizmo.beginDrag(handle, raycaster.ray);
    event.preventDefault();
    return;
  }
  selectObjectFromPointer(event);
});

window.addEventListener('pointermove', (event: PointerEvent) => {
  // Right-drag look accumulates pixel deltas; consumed once per frame so a
  // burst of mouse events applies smoothly and nothing is processed twice.
  if (mouseLook.isDragging) mouseLook.updateMove(event.clientX, event.clientY);
  if (!gizmo.isDragging()) return;
  updatePointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  gizmo.updateDrag(raycaster.ray);
  refreshSelectionHelper();
});

window.addEventListener('pointerup', () => {
  if (gizmo.isDragging()) gizmo.endDrag();
});

function updatePlayer(delta: number): void {
  // Creative mode: the player is frozen in place — no update means no
  // movement, no gravity and no collision. The fly camera owns the frame.
  // Riding: the player is attached to the saddle — the horse owns the frame.
  if (editor.isEditMode() || creativeActive || isRiding()) return;
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
  if (isRiding()) dismountHorse(); // never die in the saddle
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
  if (!creativeActive && !editor.isEditMode() && playerController.getCameraMode() === 'third_person') {
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
  const riding = isRiding() || horse.isMounted();
  if (position) {
    // While riding the HUD tracks the horse — the rider has no independent
    // position until dismounting.
    position.textContent = riding
      ? `${horse.getPosition().x.toFixed(1)}, ${horse.getPosition().y.toFixed(1)}, ${horse.getPosition().z.toFixed(1)} · riding`
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
  const snap = horse.getSnapshot();
  const rel = horse.getRelationship();
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
/** Alternates each frame — drives the every-other-frame shadow map refresh. */
let shadowFrame = 0;

// --- FPS + frame-time counter (controls revision §6) -----------------------
// Always visible in the PLAY MODE panel (the game runs in development mode).
// Sampled over 0.5s windows so the text stays readable; the frame-time figure
// is an exponential moving average over the LAST frames (spike-sensitive).
// NOTE: this uses REAL wall-clock deltas (performance.now), NOT the game's
// clamped delta (animate caps it at 50ms — the counter must still report
// frame costs beyond that clamp honestly).
const fpsValueEl = document.getElementById('fps-value');
const frameValueEl = document.getElementById('frame-value');
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
    perfWindowStart = now;
    perfFrames = 0;
  }
  updateAdaptiveResolution(now);
}

// --- Adaptive resolution stepping -------------------------------------------
// Runs inside updatePerfCounter (real wall clock, no clamped delta). Every
// 1.5s of wall time the frame EMA decides a rung change: below 21 fps step
// DOWN one rung (below 12 fps step DOWN two — a slideshow should reach the
// readable rungs fast), above 40 fps step back UP. The first check waits
// 4s so boot-time shader compilation can't fake a slow machine. A rung
// change reallocates the drawing buffer once (one-frame hiccup, at most
// every 1.5s while adapting, never in steady state).
const FPS_STEP_DOWN = 21;
const FPS_STEP_DOWN_FAST = 12;
const FPS_STEP_UP = 40;
let dprCheckAt = performance.now() + 4000;
function updateAdaptiveResolution(now: number): void {
  if (now < dprCheckAt) return;
  dprCheckAt = now + 1500;
  const fps = 1 / frameEma;
  // DPR_LADDER is indexed best→fastest, so a SLOW machine steps the rung UP
  // (toward the smaller pixelRatio) and a fast machine steps it back DOWN.
  let step = 0;
  if (fps < FPS_STEP_DOWN_FAST) step = 2;
  else if (fps < FPS_STEP_DOWN) step = 1;
  else if (fps > FPS_STEP_UP) step = -1;
  if (step === 0) return;
  const next = Math.max(0, Math.min(DPR_LADDER.length - 1, dprRung + step));
  if (next === dprRung) return;
  dprRung = next;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_LADDER[dprRung]));
}

/** Shortest signed angular distance of `angle` into (-π, π]. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// --- Horse system (Part 3) ------------------------------------------------
// The player's owned horse: independent movement/AI/vitals, mount & ride,
// whistle summon, follow behavior, world collision and persistence. The
// horse is NOT a managed scene object (never selectable/editable/saved by
// the editor) — it lives beside the scene with its own save slot.
const horseModel = createHorseModel();
scene.add(horseModel.root);
const horseAnimator = new HorseAnimator(horseModel);
const horsePersistence = new HorsePersistence();
const horse = new HorseController(collisionWorld, {
  position: { x: -5, y: 0, z: 9 },
  yaw: 0.6,
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
// Mount animation: a staged, weighty choreography — approach (polar arc,
// procedural walk) → orient → reach (the HAND leads) → grip (a real hold on
// the seat edge) → foot (boot finds the stirrup) → push (anticipation dip) →
// climb (hips rise, body passes over, leg swings across) → settle (a
// controlled drop into the saddle). The whole thing lives in
// src/horse/MountChoreography.ts — the single authority that
// scripts/mount-solver.mjs imports to run the full-timeline swept-clearance
// verification, so the game and the verifier can never drift apart. Every
// mount constant derives from HORSE_PROPORTIONS, so the horse scale
// rescales the choreography automatically; the timeline is built from the
// rider's ACTUAL approach arc (a longer walk never stretches the fixed beats).
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
  ridePitch = Math.max(-1.1, Math.min(1.1, playerController.getPitch()));
  ridingCamera.snap();
  updateEditorHud();
  updateControlHint();
  saveHorseState(true);
  showStatusMessage('Riding: tap W/S gait · hold W ride · hold S brake · A/D steer · E dismount');
}

function dismountHorse(): void {
  if (mountAnim) return; // never yank the rider out of the mount choreography
  if (isRiding()) {
    const feet = horse.computeDismountFeet();
    scene.attach(character.root); // keep the world transform for a beat
    horse.dismount();
    // Place the player at the validated spot (left side first). respawnAt
    // resets motion state and hands the camera back to the gameplay rig.
    playerController.respawnAt({ x: feet.x, y: feet.y + CHARACTER_PROPORTIONS.eyeHeight, z: feet.z });
    characterAnimator.notifyLanding(4);
    mountAnim = null;
    characterAnimator.reset();
    characterStates.force('idle');
    if (playerController.getCameraMode() === 'third_person') thirdPersonCamera.snap();
    updateEditorHud();
    updateControlHint();
    saveHorseState(true);
    showStatusMessage('Dismounted.');
    // The interaction system only re-fires its prompt when the TARGET
    // changes — and the horse was already the target before mounting. Rewrite
    // the prompt here so "[E] Dismount" can't stick after landing.
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.textContent = horse.canMount(playerController.getFeetPosition()) ? '[E] Mount horse' : '';
  } else {
    horse.dismount();
  }
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

function updateRideLook(deltaX: number, deltaY: number): void {
  const sensitivity = 0.0018;
  ridePitch = Math.max(-1.25, Math.min(1.25, ridePitch - deltaY * sensitivity));
  rideYaw -= deltaX * sensitivity;
}

/** Riding input map (spec §19) — W/S tap = gait ladder, hold = throttle/brake. */
function buildRidingInput() {
  return {
    throttle: input.isDown('forward'),
    brake: input.isDown('backward'),
    steer: (input.isDown('left') ? 1 : 0) - (input.isDown('right') ? 1 : 0),
    tapGaitUp: input.consumePressed('forward'),
    tapGaitDown: input.consumePressed('backward'),
  };
}

function syncRider(delta: number): void {
  const snap = horse.getSnapshot();
  updateMountAnim(delta);
  if (playerController.getCameraMode() === 'third_person') {
    // Chase-cam: while rolling and not dragging, the camera eases back behind
    // the horse; RMB can still orbit freely within a wide clamp.
    if (!mouseLook.isDragging && Math.abs(snap.speed) > 0.5) {
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
    // First person: the eye rides at the rider's head, view = ride yaw/pitch.
    camera.position.set(
      snap.position.x + Math.sin(snap.yaw) * HORSE_PROPORTIONS.riderZ,
      snap.position.y + HORSE_PROPORTIONS.riderFeetY + CHARACTER_PROPORTIONS.eyeHeight,
      snap.position.z + Math.cos(snap.yaw) * HORSE_PROPORTIONS.riderZ,
    );
    camera.rotation.set(ridePitch, rideYaw, 0);
  }
  character.setFirstPerson(playerController.getCameraMode() === 'first_person');
  character.updateLOD(camera.position);
  const prompt = document.getElementById('interact-prompt');
  if (prompt) prompt.textContent = '[E] Dismount';
}

function syncHorse(delta: number): void {
  const snap = horse.getSnapshot();
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
}

// Horse events → animation flinch, rider safety, persistence.
horse.on((event) => {
  if (event === 'damage') {
    horseAnimator.notifyDamage();
    return;
  }
  if (event === 'death') {
    if (isRiding() || mountAnim) {
      mountAnim = null; // the saddle collapsed mid-mount — emergency dismount
      dismountHorse();
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

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.05);
  // Right-drag look FIRST: the accumulated pixel delta becomes yaw/pitch
  // before the player updates, so movement and the camera agree this frame.
  const lookDelta = mouseLook.consumeLookDelta();
  if (!editor.isEditMode() && (lookDelta.x !== 0 || lookDelta.y !== 0)) {
    if (creativeActive) creativeFlight.look(lookDelta.x, lookDelta.y);
    else if (isRiding()) updateRideLook(lookDelta.x, lookDelta.y);
    else playerController.look(lookDelta.x, lookDelta.y);
  }
  updatePlayer(delta);
  // F toggles the Development fly camera (edge action, consumed once).
  if (input.consumePressed('creativeToggle')) {
    if (isRiding()) showStatusMessage('Dismount first (E).');
    else setCreativeMode(!creativeActive);
  }
  // Edge-triggered play actions (death gates everything but respawn).
  if (creativeActive) {
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
  } else if (!editor.isEditMode()) {
    if (isRiding() && horse.isMounted()) {
      // Riding: movement keys ARE the horse's reins; the rest is consumed
      // so nothing leaks into the (paused) player controller.
      input.consumePressed('jump');
      input.consumePressed('crouch');
      input.consumePressed('respawn');
      if (input.consumePressed('interact')) dismountHorse();
      // The camera stays THIRD PERSON for the whole mount choreography —
      // a V press during the animation is dropped, not queued.
      if (!mountAnim && input.consumePressed('cameraToggle')) { playerController.toggleCameraMode(); updateEditorHud(); }
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
      if (input.consumePressed('cameraToggle') && !mountAnim) { playerController.toggleCameraMode(); updateEditorHud(); }
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
  if (!editor.isEditMode() && !creativeActive) {
    const riding = isRiding() && horse.isMounted() ? buildRidingInput() : undefined;
    const playerPos = playerController.getPosition();
    horse.update({
      deltaSeconds: delta,
      playerX: playerPos.x,
      playerY: playerPos.y,
      playerZ: playerPos.z,
      playerMoving: !isRiding() && playerController.getHorizontalSpeed() > 0.5,
    }, riding);
    const separation = horse.takePlayerSeparation();
    if (separation && !isRiding()) {
      playerController.setPosition({ x: separation.x, y: playerController.getPosition().y, z: separation.z });
    }
    // Periodic persistence: save when the horse actually changed (spec §17).
    horseSaveTimer += delta;
    if (horseSaveTimer >= 5) {
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
    }
  }
  // Fly the creative camera AFTER the (skipped) player update: Space/Ctrl
  // drive vertical motion, Shift doubles the speed.
  if (creativeActive) {
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
  // rig owns the frame; otherwise the normal on-foot sync runs.
  if (isRiding()) syncRider(delta);
  else {
    syncCharacter(delta, previousBodyYaw);
    previousBodyYaw = playerController.getBodyYaw();
  }
  syncHorse(delta);
  if (!editor.isEditMode() && !isRiding()) interactions.update(
    { x: playerController.getPosition().x, y: playerController.getPosition().y - 1, z: playerController.getPosition().z },
    { x: -Math.sin(playerController.getYaw()), y: 0, z: -Math.cos(playerController.getYaw()) },
  );
  dayNight.update(delta);
  // Shadow maps refresh every OTHER frame (performance revision §6): the
  // orbiting sun moves ~0.02° per frame, so the one-frame shadow lag is
  // invisible, while the 4.2MP depth pass no longer runs on every frame.
  // (Final-polish matrix: freq 1/2/4 measured as ≤1ms apart; 2 stays.)
  shadowFrame ^= 1;
  renderer.shadowMap.needsUpdate = shadowFrame === 0;
  gizmo.sync(editor.isEditMode(), editor.getSelectedUuid());
  // The selection box only needs to track transforms in edit mode; the one
  // frame after leaving edit mode hides it for good.
  if (editor.isEditMode() || selectionBox.visible) refreshSelectionHelper();
  contactIndicator.update({
    editMode: editor.isEditMode(),
    selectedUuid: editor.getSelectedUuid(),
    scene,
    manager,
  });
  updateSelectionPanel();
  setHud();
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
applyModeState(); // boot: play mode → input ENABLED (the movement fix)
setHud();
updateSelectionPanel();
animate();
