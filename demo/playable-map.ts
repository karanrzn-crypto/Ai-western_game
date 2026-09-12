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
  configure,
} from '../src/index.js';

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
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const hemisphere = new THREE.HemisphereLight(0xf0e0bf, 0x4b493d, 1.2);
scene.add(hemisphere);

const grid = new THREE.GridHelper(60, 60, 0x514b40, 0x6b6252);
grid.position.y = 0.01;
scene.add(grid);

const axes = new THREE.AxesHelper(3);
axes.position.set(0, 0.03, 0);
scene.add(axes);

const assets = new AssetRegistry();
registerPrimitiveFactories(assets);

const adapter = new ThreeRendererAdapter({ scene, assetRegistry: assets });
const manager = new SceneStateManager({ renderer: adapter });
const persistence = new PersistenceManager();
const storage = new LocalSceneStorage(persistence, { key: 'ai-western-game.playable-map.scene.v3' });
const collisionWorld = new CollisionWorld(() => manager.getAllObjects(), { floorY: 0 });
const playerController = new PlayerController(collisionWorld, {
  camera,
  initialPosition: { x: 0, y: 1.7, z: 12 },
});
const dayNight = new DayNightCycle(scene, sun, hemisphere, {
  dayDurationSeconds: 180,
  startTime: 8,
});

let pointerLocked = false;
const editor = new ObjectEditorController(manager, {
  onObjectModified: () => {
    storage.saveFromManager(manager, { map: 'playable-map', mode: 'development' });
    updateSaveStatus();
  },
});

const groundUuid = '10000000-0000-4000-a000-000000000001';
manager.registerObject({
  uuid: groundUuid,
  assetType: 'ground',
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: -90, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  },
  metadata: { name: 'Main Map Ground', size: 60, collider: false, editable: false },
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

addBoundary('10000000-0000-4000-a000-000000000010', 'North Map Boundary', new THREE.Vector3(0, 1.5, -29.5), new THREE.Vector3(60, 3, 1));
addBoundary('10000000-0000-4000-a000-000000000011', 'South Map Boundary', new THREE.Vector3(0, 1.5, 29.5), new THREE.Vector3(60, 3, 1));
addBoundary('10000000-0000-4000-a000-000000000012', 'West Map Boundary', new THREE.Vector3(-29.5, 1.5, 0), new THREE.Vector3(1, 3, 60));
addBoundary('10000000-0000-4000-a000-000000000013', 'East Map Boundary', new THREE.Vector3(29.5, 1.5, 0), new THREE.Vector3(1, 3, 60));

const spawnUuid = '10000000-0000-4000-a000-000000000020';
manager.registerObject({
  uuid: spawnUuid,
  assetType: 'cube',
  transform: {
    position: { x: 0, y: 0.75, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 3, y: 1.5, z: 3 },
  },
  metadata: { name: 'Spawn Landmark', editable: true, collider: true },
});

const keys = new Set<string>();
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

function selectObjectFromPointer(event: MouseEvent): void {
  if (!editor.isEditMode()) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
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
  if (cameraLabel) cameraLabel.textContent = playerController.getCameraMode() === 'third_person' ? 'THIRD PERSON' : 'FIRST PERSON';
}

function updateControlHint(): void {
  const hint = document.getElementById('control-hint');
  if (!hint) return;
  if (editor.isEditMode()) {
    hint.textContent = 'TAB play/edit · click object · arrows move · Shift = 1m · PageUp/PageDown height';
    return;
  }
  hint.textContent = pointerLocked
    ? 'WASD move · Mouse look · Shift sprint · Space jump · V camera · TAB edit · Esc release'
    : 'Click map · WASD move · Mouse look · Space jump · V camera · TAB edit';
}

function updateSaveStatus(): void {
  const saved = document.getElementById('save-status');
  if (!saved) return;
  saved.textContent = storage.hasSavedScene() ? `Saved ${new Date().toLocaleTimeString()}` : 'No saved scene';
}

function loadSavedScene(): void {
  storage.loadInto(manager);
  updateSaveStatus();
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Tab') {
    event.preventDefault();
    const enabled = editor.toggleEditMode();
    if (enabled && document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    refreshSelectionHelper();
    updateEditorHud();
    updateControlHint();
    return;
  }

  if (event.code === 'KeyV' && !editor.isEditMode()) {
    playerController.toggleCameraMode();
    updateEditorHud();
    return;
  }

  keys.add(event.code);
  if (event.code === 'Space' && !editor.isEditMode()) {
    playerController.requestJump();
    event.preventDefault();
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
  if (handled) { event.preventDefault(); refreshSelectionHelper(); updateEditorHud(); }
});

window.addEventListener('keyup', (event) => keys.delete(event.code));

renderer.domElement.addEventListener('click', (event: MouseEvent) => {
  if (editor.isEditMode()) { selectObjectFromPointer(event); return; }
  renderer.domElement.requestPointerLock?.();
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  updateControlHint();
});

document.addEventListener('mousemove', (event) => {
  if (!pointerLocked || editor.isEditMode()) return;
  playerController.look(event.movementX, event.movementY);
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && pointerLocked) {
    document.exitPointerLock();
    pointerLocked = false;
    updateControlHint();
  }
}, true);

function updatePlayer(delta: number): void {
  if (editor.isEditMode()) return;
  playerController.update(delta, {
    forward: keys.has('KeyW'),
    backward: keys.has('KeyS'),
    left: keys.has('KeyA'),
    right: keys.has('KeyD'),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  });
}

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
}

const clock = new THREE.Clock();
function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.05);
  updatePlayer(delta);
  dayNight.update(delta);
  refreshSelectionHelper();
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
setHud();
updateEditorHud();
updateControlHint();
animate();
