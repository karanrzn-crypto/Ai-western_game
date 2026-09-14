import * as THREE from 'three';
import {
  SceneStateManager,
  ThreeRendererAdapter,
  AssetRegistry,
  registerPrimitiveFactories,
  PersistenceManager,
  CollisionWorld,
  DayNightCycle,
  AdaptiveResolution,
  ShadowScheduler,
  GameModeController,
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
  buildDismountTimeline,
  dismountRootPose,
  poseDismountRider,
  registerSaloonFactories,
  buildSaloonMapObjects,
  SALOON_SITE,
} from '../src/index.js';
import type { MountStartState, MountTimeline, DismountTimeline, PartialTransform } from '../src/index.js';
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
// --- Render governor (weak-laptop revision) --------------------------------
// Measured bottleneck matrix (1280×800 software harness + the user's laptop):
// frame time is FILL-BOUND — 1.5 → 166.6ms/6fps, 1.0 → 83.3/12, 0.85 → 66.6/15,
// 0.75 → 50/20 — and the old ladder BOOTED at 1.5, so weak machines started in
// a slideshow for seconds. The governor (src/engine/RenderGovernor.ts) now
// owns every resolution decision: boot at 0.85, ladder TOPS OUT at 1.0, climbs
// only with SUSTAINED ≥50 fps proof of headroom, walks down fast under 21/12.
renderer.setSize(Math.max(stage.clientWidth, 1), Math.max(stage.clientHeight, 1));
renderer.shadowMap.enabled = true;
// Shadow depth pass, measured: ~12ms per 2048² refresh on the harness. Two
// cuts, both requested and A/B-verified: mapSize 2048→768 (0.59MP — the pass
// drops to ~1.4ms; 85m frustum / 768 ≈ 9 texels/m stays readable with
// PCFSoft + normalBias; 512² documented as the next fallback) and on-demand
// refresh via ShadowScheduler (idle world ≈ every 150ms instead of every
// other frame — the orbiting sun moves ~0.02°/frame, so the extra passes
// rebuilt identical shadows).
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);
const resolution = new AdaptiveResolution({
  sink: renderer,
  getDevicePixelRatio: () => window.devicePixelRatio || 1,
});
const shadows = new ShadowScheduler({ idleIntervalSeconds: 0.15, movingIntervalSeconds: 1 / 30 });

const sun = new THREE.DirectionalLight(0xffe7bd, 2.2);
sun.position.set(-25, 35, 15);
sun.castShadow = true;
// 768² / 85m ≈ 9 texels/m — deliberately coarse (weak-laptop revision):
// PCFSoft + normalBias 0.03 keep the soft readable look. 512² is the
// documented next fallback if a future target needs an even cheaper pass.
sun.shadow.mapSize.set(768, 768);
// Shadow frustum sized to the PLAYABLE AREA: the map is a 60×60 ground
// plane, so its farthest point from the light target (the origin) is the
// half-diagonal 30√2 ≈ 42.4m. An ortho box of ±42.5 contains every map
// point for EVERY sun azimuth (a projection never exceeds the vector
// length), while the old hand-waved ±55 wasted 38% of the texel density.
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
registerSaloonFactories(assets);

const adapter = new ThreeRendererAdapter({ scene, assetRegistry: assets });
const manager = new SceneStateManager({ renderer: adapter });

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
    noteObjectChange(uuid, beforeDefinition.metadata.name, beforeDefinition.transform, next);
  }
  return next;
};

const persistence = new PersistenceManager();
// Storage key v6: the default map gained the SALOON (enterable bar building
// + its interior props), so old v5 saves (without it) must not shadow the
// renamed default map.
const storage = new LocalSceneStorage(persistence, { key: 'ai-western-game.playable-map.scene.v6' });
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
    updateSaveStatus();
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
    updateSaveStatus();
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

// --- The enterable BUILDING -------------------------------------------------
// One simple walk-in structure, built entirely from managed cubes (the same
// primitive every other map object uses): four walls, a roof and a real
// DOORWAY — a 1.6m gap in the south wall with a header above it — so the
// player walks through the opening into an EMPTY enterable interior. No
// decor, no furniture, no props: exactly walls + roof + door + interior.
// Footprint 8×6m at (14, −12); walls 3m tall, 0.35m thick; roof slab above.
const BUILDING = { x: 14, z: -12, w: 8, d: 6, h: 3, t: 0.35, doorW: 1.6, doorH: 2.3 };
function addBuildingPart(
  uuid: string,
  name: string,
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number,
): void {
  manager.registerObject({
    uuid,
    assetType: 'cube',
    transform: {
      position: { x, y, z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: sx, y: sy, z: sz },
    },
    metadata: { name, editable: true, collider: true },
  });
}
// North wall (back, away from the spawn) + west/east side walls.
addBuildingPart('10000000-0000-4000-a000-000000000030', 'ساختمان - دیوار شمالی', BUILDING.x, BUILDING.h / 2, BUILDING.z - BUILDING.d / 2, BUILDING.w, BUILDING.h, BUILDING.t);
addBuildingPart('10000000-0000-4000-a000-000000000031', 'ساختمان - دیوار غربی', BUILDING.x - BUILDING.w / 2, BUILDING.h / 2, BUILDING.z, BUILDING.t, BUILDING.h, BUILDING.d);
addBuildingPart('10000000-0000-4000-a000-000000000032', 'ساختمان - دیوار شرقی', BUILDING.x + BUILDING.w / 2, BUILDING.h / 2, BUILDING.z, BUILDING.t, BUILDING.h, BUILDING.d);
// South wall (facing the spawn) split around the doorway: two side segments
// + the header above the door. The gap IS the entrance — nothing blocks it.
{
  const segW = (BUILDING.w - BUILDING.doorW) / 2;
  const segCenter = BUILDING.w / 2 - segW / 2;
  addBuildingPart('10000000-0000-4000-a000-000000000033', 'ساختمان - دیوار جنوبی (راست در)', BUILDING.x - segCenter, BUILDING.h / 2, BUILDING.z + BUILDING.d / 2, segW, BUILDING.h, BUILDING.t);
  addBuildingPart('10000000-0000-4000-a000-000000000034', 'ساختمان - دیوار جنوبی (چپ در)', BUILDING.x + segCenter, BUILDING.h / 2, BUILDING.z + BUILDING.d / 2, segW, BUILDING.h, BUILDING.t);
  addBuildingPart('10000000-0000-4000-a000-000000000035', 'ساختمان - بالای در', BUILDING.x, BUILDING.h - (BUILDING.h - BUILDING.doorH) / 2, BUILDING.z + BUILDING.d / 2, BUILDING.doorW, BUILDING.h - BUILDING.doorH, BUILDING.t);
}
// Roof — one slab with a slight overhang; its collider also stops re-entry
// from above.
addBuildingPart('10000000-0000-4000-a000-000000000036', 'ساختمان - سقف', BUILDING.x, BUILDING.h + 0.15, BUILDING.z, BUILDING.w + 0.7, 0.3, BUILDING.d + 0.7);

// --- The SALOON (enterable western bar) -------------------------------------
// A full enterable saloon on the west side of the spawn street, mirroring the
// simple BUILDING across it: false-front facade + SALOON sign + porch face
// south toward the spawn, the doorway gap is the real entrance, and the
// interior carries bar / poker / piano corners as individually managed
// objects (own UUIDs, own colliders). All placement data comes from the
// saloon layout module — the SAME list the saloon tests assert against.
for (const saloonDef of buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z)) {
  manager.registerObject(saloonDef);
}

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
  if (!modes.isEdit()) return;
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
  if (mode) mode.textContent = modes.isEdit() ? 'EDIT MODE' : 'PLAY MODE';
  if (selected) {
    const selectedUuid = editor.getSelectedUuid();
    selected.textContent = selectedUuid ? manager.getObject(selectedUuid)?.metadata.name ?? selectedUuid : 'None';
  }
  if (cameraLabel) {
    // Edit owns the camera whenever it is open (it may sit anywhere a
    // Creative session left it) — reflect ownership, not the player's mode.
    cameraLabel.textContent = modes.isEdit()
      ? 'EDIT CAMERA'
      : modes.isCreative()
        ? 'CREATIVE FLIGHT'
        : isRiding()
          ? (playerController.getCameraMode() === 'third_person' ? 'RIDE · THIRD PERSON' : 'RIDE · FIRST PERSON')
          : playerController.getCameraMode() === 'third_person' ? 'THIRD PERSON' : 'FIRST PERSON';
  }
}

function updateControlHint(): void {
  const hint = document.getElementById('control-hint');
  if (!hint) return;
  if (modes.isEdit()) {
    hint.textContent = 'TAB play · drag gizmo axes/rings · type values in panel · arrows move · PageUp/Down height · Q/E R/F T/G rotate 15° (Shift 45°)';
    return;
  }
  if (isRiding()) {
    hint.textContent = 'W walk · W+Shift gallop · hold S brake · S at stop = reverse · A/D steer · RMB look · V camera · E dismount';
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

// --- Last-object-change panel (TEST panel, bottom-right) --------------------
// Populated by the updateObjectTransform wrapper above. The panel shows ONLY
// what is needed to reconstruct the object's exact state across the last
// mutation: Name, UUID, the full Initial transform (before the mutation) and
// the full Final transform (after it) — position, rotation and scale in full,
// even when the patch touched just one group. No change/action line, no
// timestamp. The COPY button places the panel's entire visible content in the
// clipboard (same strings, same fixed 3-decimal precision), so the text can
// be handed to another AI to reproduce the change 1:1.
interface Vec3Like {
  x: number;
  y: number;
  z: number;
}
interface ObjectChangeRecord {
  name: string;
  uuid: string;
  before: { position: Vec3Like; rotation: Vec3Like; scale: Vec3Like };
  after: { position: Vec3Like; rotation: Vec3Like; scale: Vec3Like };
}
let lastObjectChange: ObjectChangeRecord | null = null;

/** Fixed 3-decimal formatting — stable for display AND clipboard round-trips. */
const vecText = (v: Vec3Like): string => `x=${v.x.toFixed(3)} y=${v.y.toFixed(3)} z=${v.z.toFixed(3)}`;
const rotText = (v: Vec3Like): string => `x=${v.x.toFixed(3)}° y=${v.y.toFixed(3)}° z=${v.z.toFixed(3)}°`;

const sameVec3 = (a: Vec3Like, b: Vec3Like): boolean =>
  a.x === b.x && a.y === b.y && a.z === b.z;
const sameTransform = (
  a: { position: Vec3Like; rotation: Vec3Like; scale: Vec3Like },
  b: { position: Vec3Like; rotation: Vec3Like; scale: Vec3Like },
): boolean =>
  sameVec3(a.position, b.position) && sameVec3(a.rotation, b.rotation) && sameVec3(a.scale, b.scale);

function noteObjectChange(
  uuid: string,
  name: string,
  before: Readonly<{ position: Vec3Like; rotation: Vec3Like; scale: Vec3Like }>,
  after: Readonly<{ position: Vec3Like; rotation: Vec3Like; scale: Vec3Like }>,
): void {
  // The wrapper hands us the manager's own snapshots, so `before` is the
  // transform BEFORE the mutation and `after` the one AFTER it. A deduped
  // no-op call (before === after) is not a mutation — keep the panel as-is.
  if (sameTransform(before, after)) return;
  // The record must survive the call — re-clone so later mutations of the
  // registry can never rewrite the panel's history.
  const cloneVec = (v: Vec3Like): Vec3Like => ({ x: v.x, y: v.y, z: v.z });
  const cloneState = (t: Readonly<{ position: Vec3Like; rotation: Vec3Like; scale: Vec3Like }>) => ({
    position: cloneVec(t.position),
    rotation: cloneVec(t.rotation),
    scale: cloneVec(t.scale),
  });
  lastObjectChange = {
    name,
    uuid,
    before: cloneState(before),
    after: cloneState(after),
  };
  updateObjectLogPanel();
}

/**
 * The panel's visible content, as plain text. This ONE formatter feeds both
 * the DOM rows and the clipboard, so what the user sees is byte-for-byte
 * what gets copied — nothing invisible is ever added, nothing visible is
 * ever left out.
 */
function formatObjectLogText(record: ObjectChangeRecord): string {
  const block = (label: string, t: ObjectChangeRecord['before']): string[] => [
    `${label}:`,
    `Position: ${vecText(t.position)}`,
    `Rotation: ${rotText(t.rotation)}`,
    `Scale: ${vecText(t.scale)}`,
  ];
  return [
    `Name: ${record.name}`,
    `UUID: ${record.uuid}`,
    '',
    ...block('Initial', record.before),
    '',
    ...block('Final', record.after),
  ].join('\n');
}

function updateObjectLogPanel(): void {
  const record = lastObjectChange;
  const empty = document.getElementById('object-log-empty');
  const body = document.getElementById('object-log');
  if (!body || !record) return;
  if (empty) empty.hidden = true;
  body.hidden = false;
  const set = (id: string, text: string): void => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set('objlog-name', record.name);
  set('objlog-uuid', record.uuid);
  set('objlog-ipos', vecText(record.before.position));
  set('objlog-irot', rotText(record.before.rotation));
  set('objlog-iscl', vecText(record.before.scale));
  set('objlog-fpos', vecText(record.after.position));
  set('objlog-frot', rotText(record.after.rotation));
  set('objlog-fscl', vecText(record.after.scale));
}

// COPY button: places the panel's ENTIRE visible content (Name, UUID, Initial
// block, Final block) on the clipboard via the async Clipboard API, with a
// textarea/execCommand fallback for non-secure contexts. Button text flashes
// "COPIED ✓" so the click is confirmed without a console.
const objLogCopyButton = document.getElementById('objlog-copy') as HTMLButtonElement | null;
let objLogCopyResetTimer = 0;
function flashCopyFeedback(): void {
  if (!objLogCopyButton) return;
  objLogCopyButton.textContent = 'COPIED ✓';
  objLogCopyButton.classList.add('copied');
  window.clearTimeout(objLogCopyResetTimer);
  objLogCopyResetTimer = window.setTimeout(() => {
    objLogCopyButton.textContent = 'COPY';
    objLogCopyButton.classList.remove('copied');
  }, 1400);
}
function copyObjectLogFallback(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
objLogCopyButton?.addEventListener('click', () => {
  const record = lastObjectChange;
  if (!record || !objLogCopyButton) return;
  const text = formatObjectLogText(record);
  const done = (ok: boolean): void => {
    if (ok) flashCopyFeedback();
    else objLogCopyButton.textContent = 'COPY FAILED';
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => done(true))
      .catch(() => done(copyObjectLogFallback(text)));
  } else {
    done(copyObjectLogFallback(text));
  }
});

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

    if (!modes.isEdit()) {
      // Entering Edit Mode (from Play OR Creative). The rider dismounts
      // first — the editor owns the world, nobody rides during editing —
      // and INSTANTLY: the editor must not wait for the choreography.
      if (isRiding()) dismountHorse({ instant: true });
      modes.enterEdit(); // parks the camera EXACTLY where it is — no snap
    } else {
      // Leaving Edit Mode hands the camera back to the session's ORIGIN
      // (GameModeController contract): a play-origin edit reconnects the
      // gameplay camera (the normal Play→Edit→Play path), a creative-origin
      // edit RESUMES the fly camera where it left off — no player snap.
      modes.exitEdit();
    }

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
  if (modes.isPlay()) {
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
  if (handled) { event.preventDefault(); refreshSelectionHelper(); updateEditorHud(); editShadowPulse = 0.25; }
});

// --- Mouse look: RIGHT-button drag only ----------------------------------
// The camera rotates ONLY while the right mouse button is held. Left click
// never rotates, and there is no pointer-lock look path at all — a locked
// pointer without the right button held must stay inert.
const mouseLook = new MouseLookController();

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
  if (!modes.isEdit() || event.button !== 0) return;
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
  if (isRiding()) dismountHorse({ instant: true }); // never die in the saddle
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
  characterAnimator.notifyLanding(4);
  mountAnim = null;
  dismountAnim = null;
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

function updateRideLook(deltaX: number, deltaY: number): void {
  const sensitivity = 0.0018;
  ridePitch = Math.max(-1.25, Math.min(1.25, ridePitch - deltaY * sensitivity));
  rideYaw -= deltaX * sensitivity;
}

/** Riding input map (spec §19, controls revision §20) — W = walk,
 *  W+Shift = run (the controller walks first from a standstill), S = brake. */
function buildRidingInput() {
  return {
    throttle: input.isDown('forward'),
    brake: input.isDown('backward'),
    steer: (input.isDown('left') ? 1 : 0) - (input.isDown('right') ? 1 : 0),
    sprint: input.isDown('sprint'),
  };
}

function syncRider(delta: number, snap: ReturnType<HorseController['getSnapshot']>): void {
  updateMountAnim(delta);
  updateDismountAnim(delta);
  // The dismount handover may have detached the rider THIS frame — the world
  // is on-foot now (the prompt was already rewritten by finishDismount), so
  // the riding camera/prompt must not run one last stale frame.
  if (!isRiding()) return;
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

function syncHorse(delta: number, snap: ReturnType<HorseController['getSnapshot']>): void {
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

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.05);
  // Right-drag look FIRST: the accumulated pixel delta becomes yaw/pitch
  // before the player updates, so movement and the camera agree this frame.
  const lookDelta = mouseLook.consumeLookDelta();
  if (!modes.isEdit() && (lookDelta.x !== 0 || lookDelta.y !== 0)) {
    if (modes.isCreative()) creativeFlight.look(lookDelta.x, lookDelta.y);
    else if (isRiding()) updateRideLook(lookDelta.x, lookDelta.y);
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
  if (modes.isPlay()) {
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
  const horseSnap = horse.getSnapshot();
  if (isRiding()) syncRider(delta, horseSnap);
  else {
    syncCharacter(delta, previousBodyYaw);
    previousBodyYaw = playerController.getBodyYaw();
  }
  syncHorse(delta, horseSnap);
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
  const castersMoving = mountAnim !== null
    || dismountAnim !== null
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
  if (modes.isEdit() || selectionBox.visible) refreshSelectionHelper();
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
    updateSelectionPanel();
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
applyModeState(); // boot: play mode → input ENABLED (the movement fix)
setHud();
updateSelectionPanel();
animate();
