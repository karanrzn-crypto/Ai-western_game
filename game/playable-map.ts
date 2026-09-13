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
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(Math.max(stage.clientWidth, 1), Math.max(stage.clientHeight, 1));
renderer.shadowMap.enabled = true;
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
    cameraLabel.textContent = creativeActive
      ? 'CREATIVE FLIGHT'
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
  hint.textContent = 'WASD move · Hold RIGHT mouse = look · Shift sprint · Space jump · C/Ctrl crouch · E interact · V camera · F creative fly · H/J damage/heal (debug) · R respawn · TAB edit';
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
 */
function applyModeState(): void {
  const editMode = editor.isEditMode();
  input.setEnabled(!editMode); // character controls only live in play mode
  debugAxes.visible = editMode;
  if (editMode && creativeActive) setCreativeMode(false); // editor owns the keyboard
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
    editor.toggleEditMode();
    applyModeState();
    refreshSelectionHelper();
    return;
  }

  // NOTE: KeyV (camera) and Space (jump) are intentionally NOT handled here.
  // They are edge actions of InputBindings consumed once per frame in
  // animate() — handling them here as well toggled/applied every action
  // TWICE (the camera toggle cancelled itself out and never switched).

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
  if (editor.isEditMode() || creativeActive) return;
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
  // In creative mode neither runs — the fly camera owns the frame and the
  // character keeps its last pose (frozen in place).
  if (!creativeActive && playerController.getCameraMode() === 'third_person') {
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
  if (position) position.textContent = `${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)}`;
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
  if (stateLabel) stateLabel.textContent = characterStates.current.toUpperCase();
}

const clock = new THREE.Clock();
let previousBodyYaw = playerController.getBodyYaw();
function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.05);
  // Right-drag look FIRST: the accumulated pixel delta becomes yaw/pitch
  // before the player updates, so movement and the camera agree this frame.
  const lookDelta = mouseLook.consumeLookDelta();
  if (!editor.isEditMode() && (lookDelta.x !== 0 || lookDelta.y !== 0)) {
    if (creativeActive) creativeFlight.look(lookDelta.x, lookDelta.y);
    else playerController.look(lookDelta.x, lookDelta.y);
  }
  updatePlayer(delta);
  // F toggles the Development fly camera (edge action, consumed once).
  if (input.consumePressed('creativeToggle')) setCreativeMode(!creativeActive);
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
  } else if (!editor.isEditMode()) {
    const dead = playerController.isDead();
    if (!dead && input.consumePressed('jump')) playerController.requestJump();
    if (!dead && input.consumePressed('crouch')) playerController.toggleCrouch();
    if (!dead && input.consumePressed('interact') && interactions.tryInteract()) interactHold = 0.5;
    if (input.consumePressed('cameraToggle')) { playerController.toggleCameraMode(); updateEditorHud(); }
    if (!dead && input.consumePressed('debugDamage')) health.damage(30);
    if (!dead && input.consumePressed('debugHeal')) health.heal(35);
    if (dead && input.consumePressed('respawn')) respawnCountdown = 0;
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
  syncCharacter(delta, previousBodyYaw);
  previousBodyYaw = playerController.getBodyYaw();
  if (!editor.isEditMode()) interactions.update(
    { x: playerController.getPosition().x, y: playerController.getPosition().y - 1, z: playerController.getPosition().z },
    { x: -Math.sin(playerController.getYaw()), y: 0, z: -Math.cos(playerController.getYaw()) },
  );
  dayNight.update(delta);
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
