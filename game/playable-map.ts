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
} from '../src/index.js';
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
// PERFORMANCE (controls revision §6 — measured, not blind): the frame cost is
// FILL-BOUND (software raster: ~22ms of the main pass scales linearly with
// pixel count; see the A/B matrix in the worklog). Capping the pixel ratio at
// 1.5 keeps HiDPI displays (dpr 2 = 4× fragments) from multiplying the
// dominant cost; the output is identical at dpr ≤ 1.5. antialias (≈2ms),
// shadow filter type and the 2048² map were A/B-tested and stay as they are.
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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
// Wide, static shadow frustum: the three.js default ±5 ortho box only covers
// a 10x10 patch around the origin, so shadows of everything else popped in
// and out as the sun orbited. Static settings — no time-based switching.
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55;
sun.shadow.camera.bottom = -55;
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
// Mount animation: a staged choreography (approach → reach → GRIP the saddle
// → climb → settle) — the rider visibly grabs the horn before sitting.
// The character root is attached to the saddle socket immediately (the horse
// stands still for the whole timeline via mount lock), and the animation is
// driven entirely in SOCKET-LOCAL space, so it stays rock-stable relative to
// the horse no matter where the mount happens.
//
// Revision issue 3: the approach is a POLAR ARC around the saddle axis — the
// rider always walks AROUND the horse to the left stirrup, never straight
// through its body, no matter which side the mount was triggered from. The
// grip phase rests the left hand ON the near seat edge (a real, contact-
// checked grip), and the climb lifts the rider HIGH before the slide so the
// folded/swinging legs pass above the barrel — all verified by the P4
// full-frame swept clearance check (scripts/mount-solver.mjs + live probe).
const RIDER_SEAT_QUATERNION = new THREE.Quaternion();
const MOUNT_DURATION = 2.1; // seconds
// Phase boundaries as FRACTIONS of the timeline:
const MOUNT_WALK_END = 0.4;   // arrived at the left stirrup, facing the horse
const MOUNT_REACH_END = 0.58; // hand rests ON the near seat edge
const MOUNT_GRIP_END = 0.72;  // grip held, body coiled for the climb
const MOUNT_CLIMB_END = 0.9;  // up and over
// --- Mount timeline tuning (P4 full-frame swept clearance) -----------------
// Solved OFFLINE against the horse+saddle collider set with the real rig
// (scripts/mount-solver.mjs): every rider capsule (torso, arms, hands,
// thighs, shins, boots) stays clear of the barrel/chest/saddle across the
// ENTIRE timeline, and the grip hand rests ON the near seat edge. The old
// straight-arm horn reach swept the forearm THROUGH the chest (up to 8cm)
// and the low climb slide dragged both legs through the barrel (up to 19cm).
const MOUNT_REACH_LEAN = -0.08;   // slight lean-in; the arm does the reaching
const MOUNT_REACH_UP_END = 0.5;   // arm fully raised, elbow folded
const MOUNT_REACH_RX_UP = 2.3;    // shoulder rx raised on the side diagonal
const MOUNT_REACH_RZ_UP = -1.0;   // raise-plane toward the head side (clears the chest face)
const MOUNT_REACH_RX = 2.1;       // rx at the grip — hand ON the seat edge
const MOUNT_REACH_RZ_PLACE = -0.15;
const MOUNT_REACH_ELBOW_BEND = -1.9; // folded while traversing up
const MOUNT_REACH_ELBOW_END = 0.35;  // extended onto the seat edge
const MOUNT_STAND_OFF = 0.3;      // step-out while reaching (elbow arc clears the chest)
const MOUNT_LIFT_PEAK = 0.22;     // root rides ABOVE the socket at the lift peak
const MOUNT_LIFT_RISE_END = 0.84; // rise complete (hips clear the barrel top)
const MOUNT_LIFT_FALL_START = 0.88; // descend into the seat
const MOUNT_SLIDE_START = 0.82;   // root x/z slide to the seat center, while lifted
const MOUNT_SLIDE_END = 0.94;
const MOUNT_LEG_L_FOLD_START = 0.73; // left leg folds while the root lifts
const MOUNT_LEG_L_FOLD_END = 0.86;
const MOUNT_SWING_START = 0.84;   // right leg swings over the cantle, hard-tucked
const MOUNT_SWING_PEAK_AT = 0.875;
const MOUNT_SWING_RX = 2.25;
const MOUNT_SWING_RZ = 0.62;
const MOUNT_SWING_KNEE = -1.7;
const MOUNT_ARM_R_RX = 0.14;      // right arm stays close to the torso
const MOUNT_ARM_R_RZ = -0.14;
const MOUNT_ARM_R_ELBOW = 0.22;
const MOUNT_STAND = new THREE.Vector3(-0.45, -HORSE_PROPORTIONS.riderFeetY, -0.02); // on the ground, left side, beside the stirrup
const MOUNT_STAND_PHI = Math.atan2(MOUNT_STAND.x, MOUNT_STAND.z); // polar angle of the stand point
const MOUNT_STAND_R = Math.hypot(MOUNT_STAND.x, MOUNT_STAND.z);
const MOUNT_FACE_HORSE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
/** Clearance radius around the saddle axis: keeps the walker outside the
 *  horse's silhouette (head to tail) plus a body margin. */
const mountSafeRadius = (phi: number): number => {
  const s = Math.sin(phi) / 0.58;
  const c = Math.cos(phi) / 1.55;
  return 1 / Math.sqrt(s * s + c * c) + 0.24;
};
let mountAnim: {
  age: number;
  startPhi: number;
  startR: number;
  startY: number;
  startQuat: THREE.Quaternion;
} | null = null;

const smooth = (t: number): number => t * t * (3 - 2 * t);
/** Normalized progress through [a, b] with smoothstep easing. */
const seg = (t: number, a: number, b: number): number => smooth(Math.max(0, Math.min(1, (t - a) / (b - a))));
const lerpNum = (a: number, b: number, k: number): number => a + (b - a) * k;

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
  horse.mount(MOUNT_DURATION + 0.25);
  riderSocket.attach(character.root);
  // Socket-local starting transform of the character (attach preserved the
  // world pose, so root.position/quaternion now ARE the socket-local values).
  // The approach is polar: remember the START angle/radius so the walk-in can
  // arc AROUND the horse instead of cutting through it.
  const p = character.root.position;
  mountAnim = {
    age: 0,
    startPhi: Math.atan2(p.x, p.z),
    startR: Math.max(Math.hypot(p.x, p.z), MOUNT_STAND_R),
    startY: p.y,
    startQuat: character.root.quaternion.clone(),
  };
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

/**
 * Static seated pose while mounted (the character animator is paused).
 * Numbers SOLVED against the rig chains (see scripts/horse-geometry-probe.mjs):
 *   pelvis bottom  = 1.05 + 0.87 - 0.09 = 1.83 = saddleTopY  (rests on the seat)
 *   knee center    = (+-0.375, 1.48) — cylinder edge tangent to the barrel (0.32)
 *   boot bottom    = 1.072 = stirrup tread top (riderFeetY + 0.0225)
 *   rein hand      = (-0.20, 1.92, -0.38) — above the withers, ahead of the horn
 * Thighs roll 37° outward so the knees/boots stay OUTSIDE the barrel; the
 * right hand rests on the right thigh; the torso keeps an upright seat.
 */
function applyRiderPose(): void {
  const j = character.joints;
  j.hips.position.y = 0.675;
  j.hips.rotation.set(-0.05, 0, 0);
  j.spine.rotation.set(0.02, 0, 0);
  j.chest.rotation.set(0, 0, 0);
  j.neck.rotation.set(0, 0, 0);
  j.head.rotation.set(-0.04, 0, 0);
  j.legL.rotation.set(1.1, 0, -0.6435);
  j.kneeL.rotation.set(-1.45, 0, 0);
  j.footL.rotation.set(0.35, 0, 0);
  j.legR.rotation.set(1.1, 0, 0.6435);
  j.kneeR.rotation.set(-1.45, 0, 0);
  j.footR.rotation.set(0.35, 0, 0);
  j.shoulderL.rotation.set(0.7, 0, 0.07);
  j.elbowL.rotation.set(0.3, 0, 0);
  j.shoulderR.rotation.set(0.06, 0, -0.03);
  j.elbowR.rotation.set(0.15, 0, 0);
}

/**
 * Mount choreography pose (per frame, while mountAnim is active). Phases:
 *   approach [0, walk)   polar arc around the horse to the left stirrup
 *   reach    [walk, reach) step out, raise the arm along the head-side and
 *                        rest the hand ON the near seat edge (a real grip)
 *   grip     [reach, grip) hold, body coils for the climb
 *   climb    [grip, climb) root rises HIGH (hips clear the barrel), then
 *                        slides to the seat center while the left leg folds
 *                        and the right leg swings over, hard-tucked
 *   settle   [climb, 1]    ease into the seat, sit-dip, final riding pose
 * All joint targets end exactly on applyRiderPose's values (no pop at handover).
 * Trajectory solved against the horse/saddle colliders — see the MOUNT_*
 * constants above and scripts/mount-solver.mjs.
 */
function poseMountRider(t: number): void {
  const j = character.joints;
  const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
  const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
  const easeOutPow3 = (k: number): number => 1 - Math.pow(1 - clamp01(k), 3);
  const kUpRaw = seg(t, MOUNT_WALK_END * 0.75, MOUNT_REACH_UP_END);
  const kUp = easeOutPow3(kUpRaw);
  const kPlace = seg(t, MOUNT_REACH_UP_END, MOUNT_REACH_END);
  const kClimb = seg(t, MOUNT_GRIP_END, MOUNT_CLIMB_END);
  const kSettle = seg(t, MOUNT_CLIMB_END, 1);
  const kHold = Math.max(kClimb, kSettle);
  const seated = kHold;
  // Torso: upright walk → slight lean-in → straighten on the climb → seated.
  const lean = lerp(0, MOUNT_REACH_LEAN, kUpRaw) * (1 - kSettle) + -0.05 * seated;
  j.hips.rotation.x = lean;
  j.spine.rotation.x = lerp(lean * 0.5, 0.02, kSettle);
  j.chest.rotation.set(0, 0, 0);
  j.head.rotation.set(lerp(-0.1, -0.04, kSettle), 0, 0);
  j.neck.rotation.set(0, 0, 0);
  // Stand TALL through approach/reach/grip, then sink to the seated hip
  // height over the climb + settle.
  j.hips.position.y = lerpNum(CHARACTER_PROPORTIONS.hipY, 0.675, seated);
  // LEFT arm — rises along the rider's LEFT side (head-side diagonal, clear
  // of the chest face) with a folded elbow, then the hand arcs over the chest
  // top and rests ON the near seat edge; releases along the climb into the
  // low rein hand.
  const rxUp = lerp(0.1, MOUNT_REACH_RX_UP, kUp);
  const rzUp = lerp(-0.06, MOUNT_REACH_RZ_UP, kUp);
  const rxPlace = lerp(MOUNT_REACH_RX_UP, MOUNT_REACH_RX, kPlace);
  const rzPlace = lerp(MOUNT_REACH_RZ_UP, MOUNT_REACH_RZ_PLACE, kPlace);
  const elbowUp = lerp(-0.08, MOUNT_REACH_ELBOW_BEND, kUp);
  j.shoulderL.rotation.set(lerp(lerp(rxUp, rxPlace, kPlace), 0.7, kHold), 0, lerp(lerp(rzUp, rzPlace, kPlace), 0.07, kHold));
  j.elbowL.rotation.set(lerp(lerp(elbowUp, MOUNT_REACH_ELBOW_END, kPlace), 0.3, kHold), 0, 0);
  // RIGHT arm — stays close to the body for balance during the climb, then
  // rests on the right thigh.
  j.shoulderR.rotation.set(lerp(0.12, MOUNT_ARM_R_RX, kClimb) * (1 - kSettle) + 0.06 * kSettle, 0, lerp(lerp(-0.05, MOUNT_ARM_R_RZ, kClimb), -0.03, kSettle));
  j.elbowR.rotation.set(lerp(-0.08, MOUNT_ARM_R_ELBOW, kClimb) * (1 - kSettle) + 0.15 * kSettle, 0, 0);
  // LEFT leg — folds to the seat pose while the root LIFTS (the foot rises
  // outside the flank; folding at low root height dragged it through the
  // barrel — solved in the P4 sweep).
  const kFold = seg(t, MOUNT_LEG_L_FOLD_START, MOUNT_LEG_L_FOLD_END);
  j.legL.rotation.set(lerp(0.05, 1.1, kFold), 0, lerp(-0.06, -0.6435, kFold));
  j.kneeL.rotation.set(lerp(-0.12, -1.45, kFold), 0, 0);
  j.footL.rotation.set(lerp(0, 0.35, kFold), 0, 0);
  // RIGHT leg — swings up and WIDE over the cantle with a hard tuck (shin and
  // boot stay above the barrel top while crossing), then folds down into the
  // seated stirrup pose.
  const kSwing = easeOutPow3(seg(t, MOUNT_SWING_START, MOUNT_SWING_PEAK_AT));
  j.legR.rotation.set(lerp(lerp(0.05, MOUNT_SWING_RX, kSwing), 1.1, kSettle), 0, lerp(lerp(0.02, MOUNT_SWING_RZ, kSwing), 0.6435, kSettle));
  j.kneeR.rotation.set(lerp(lerp(-0.12, MOUNT_SWING_KNEE, kSwing), -1.45, kSettle), 0, 0);
  j.footR.rotation.set(lerp(0, 0.35, kSettle), 0, 0);
}

/** Per-frame mount animation driver: root transform + rider pose. */
function updateMountAnim(delta: number): void {
  if (!mountAnim) return;
  mountAnim.age += delta;
  const t = Math.min(1, mountAnim.age / MOUNT_DURATION);
  const kIn = seg(t, 0, MOUNT_WALK_END);
  if (t < MOUNT_WALK_END) {
    // POLAR APPROACH: arc around the saddle axis to the left stirrup — the
    // radius never dips inside the horse's silhouette (mountSafeRadius), so
    // the rider walks AROUND the body from any starting side.
    const phi = mountAnim.startPhi + wrapAngle(MOUNT_STAND_PHI - mountAnim.startPhi) * kIn;
    const safe = mountSafeRadius(phi);
    const r = Math.max(safe, lerpNum(mountAnim.startR, MOUNT_STAND_R, kIn));
    character.root.position.set(Math.sin(phi) * r, lerpNum(mountAnim.startY, MOUNT_STAND.y, kIn), Math.cos(phi) * r);
    // Face the travel direction (sample the path just ahead), with a walk bob.
    const phi2 = mountAnim.startPhi + wrapAngle(MOUNT_STAND_PHI - mountAnim.startPhi) * Math.min(1, kIn + 0.06);
    const safe2 = mountSafeRadius(phi2);
    const r2 = Math.max(safe2, lerpNum(mountAnim.startR, MOUNT_STAND_R, Math.min(1, kIn + 0.06)));
    const dx = Math.sin(phi2) * r2 - character.root.position.x;
    const dz = Math.cos(phi2) * r2 - character.root.position.z;
    if (Math.hypot(dx, dz) > 1e-4) {
      const faceYaw = Math.atan2(-dx, -dz);
      character.root.quaternion.setFromEuler(new THREE.Euler(0, faceYaw, 0));
    }
    character.root.position.y += Math.abs(Math.sin(kIn * Math.PI * 4)) * 0.035 * (1 - kIn);
  } else {
    // At the stirrup: stand facing the horse, then CLIMB — the root rises
    // HIGH first (hips clear the barrel top with the legs folded/tucked),
    // THEN slides to the seat center while lifted, and finally descends into
    // the seat over the settle. The old low slide dragged both legs through
    // the barrel (P4 sweep: up to 19cm) — solved by lift-before-slide.
    const kClimb = seg(t, MOUNT_GRIP_END, MOUNT_CLIMB_END);
    const kSettle = seg(t, MOUNT_CLIMB_END, 1);
    const kRise = seg(t, MOUNT_GRIP_END, MOUNT_LIFT_RISE_END);
    const kFall = seg(t, MOUNT_LIFT_FALL_START, 1);
    const kSlide = seg(t, MOUNT_SLIDE_START, MOUNT_SLIDE_END);
    const standOff = MOUNT_STAND_OFF * seg(t, 0.3, 0.42) * (1 - seg(t, 0.72, 0.8));
    const standX = MOUNT_STAND.x - standOff;
    const y = lerpNum(MOUNT_STAND.y, MOUNT_LIFT_PEAK, kRise)
      + lerpNum(0, -MOUNT_LIFT_PEAK, kFall * kFall * (3 - 2 * kFall));
    character.root.position.set(lerpNum(standX, 0, kSlide), y, lerpNum(MOUNT_STAND.z, 0, kSlide));
    // Face the horse through the climb; the rotation completes by the settle
    // (a half-blend here left the seat-pose feet swung 45° off into the chest).
    const quatBlend = Math.min(1, kClimb + kSettle);
    character.root.quaternion.slerpQuaternions(MOUNT_FACE_HORSE, RIDER_SEAT_QUATERNION, quatBlend);
    const sitDip = Math.sin(kSettle * Math.PI) * -0.01;
    character.root.position.y += sitDip;
  }
  poseMountRider(t);
  if (t >= 1) {
    mountAnim = null;
    character.root.position.set(0, 0, 0);
    character.root.quaternion.copy(RIDER_SEAT_QUATERNION);
    applyRiderPose();
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
      if (input.consumePressed('cameraToggle')) { playerController.toggleCameraMode(); updateEditorHud(); }
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
