import * as THREE from 'three';
import {
  SceneStateManager,
  ThreeRendererAdapter,
  AssetRegistry,
  registerPrimitiveFactories,
  PersistenceManager,
  CollisionWorld,
  DayNightCycle,
  configure,
} from '../src/index.js';
import { GroundAssetFactory } from '../src/assets/GroundAssetFactory.js';

configure({ debug: false, logging: { level: 'info' } });

const stage = document.getElementById('stage');
if (!stage) throw new Error('Missing #stage');

// -----------------------------------------------------------------------------
// Renderer / world
// -----------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9a8d72);
scene.fog = new THREE.Fog(0x9a8d72, 35, 90);

const camera = new THREE.PerspectiveCamera(
  70,
  Math.max(stage.clientWidth, 1) / Math.max(stage.clientHeight, 1),
  0.05,
  120,
);
camera.rotation.order = 'YXZ';

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

// -----------------------------------------------------------------------------
// State / assets
// -----------------------------------------------------------------------------
const assets = new AssetRegistry();
registerPrimitiveFactories(assets);
assets.register('ground', new GroundAssetFactory(), 'World Ground');

const adapter = new ThreeRendererAdapter({ scene, assetRegistry: assets });
const manager = new SceneStateManager({ renderer: adapter });
const persistence = new PersistenceManager();
const collisionWorld = new CollisionWorld(() => manager.getAllObjects(), 0);
const dayNight = new DayNightCycle(scene, sun, hemisphere, {
  dayDurationSeconds: 180,
  startTime: 8,
});
const SAVE_KEY = 'ai-western-game.playable-map.scene.v2';

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

function addBoundary(
  uuid: string,
  name: string,
  position: THREE.Vector3,
  scale: THREE.Vector3,
): void {
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

addBoundary(
  '10000000-0000-4000-a000-000000000010',
  'North Map Boundary',
  new THREE.Vector3(0, 1.5, -29.5),
  new THREE.Vector3(60, 3, 1),
);
addBoundary(
  '10000000-0000-4000-a000-000000000011',
  'South Map Boundary',
  new THREE.Vector3(0, 1.5, 29.5),
  new THREE.Vector3(60, 3, 1),
);
addBoundary(
  '10000000-0000-4000-a000-000000000012',
  'West Map Boundary',
  new THREE.Vector3(-29.5, 1.5, 0),
  new THREE.Vector3(1, 3, 60),
);
addBoundary(
  '10000000-0000-4000-a000-000000000013',
  'East Map Boundary',
  new THREE.Vector3(29.5, 1.5, 0),
  new THREE.Vector3(1, 3, 60),
);

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

// -----------------------------------------------------------------------------
// Player state / controls
// -----------------------------------------------------------------------------
const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;
const WALK_SPEED = 6;
const SPRINT_SPEED = 11;
const JUMP_SPEED = 6.5;
const GRAVITY = 18;
const THIRD_PERSON_DISTANCE = 5.5;
const THIRD_PERSON_HEIGHT = 2.2;

const player = new THREE.Vector3(0, EYE_HEIGHT, 12);
let yaw = Math.PI;
let pitch = 0;
let verticalVelocity = 0;
let grounded = true;
let pointerLocked = false;
let editMode = false;
let thirdPerson = false;
let selectedUuid: string | null = null;

const keys = new Set<string>();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd166);
selectionBox.visible = false;
scene.add(selectionBox);

function saveScene(): void {
  const data = persistence.exportSceneToJSON(manager, {
    map: 'playable-map',
    mode: 'development',
  });
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  const saved = document.getElementById('save-status');
  if (saved) saved.textContent = `Saved ${new Date().toLocaleTimeString()}`;
}

function loadSavedScene(): void {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  try {
    persistence.loadSceneFromJSON(JSON.parse(raw), manager);
  } catch (error) {
    console.warn('[playable-map] saved scene ignored:', error);
    localStorage.removeItem(SAVE_KEY);
  }
}

function refreshSelectionHelper(): void {
  if (!selectedUuid) {
    selectionBox.visible = false;
    return;
  }
  const mesh = scene.getObjectByProperty('uuid', selectedUuid);
  if (!mesh) {
    selectionBox.visible = false;
    return;
  }
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
  if (!editMode) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const candidates = adapter
    .getActiveUUIDs()
    .map((uuid) => scene.getObjectByProperty('uuid', uuid))
    .filter((obj): obj is THREE.Object3D => Boolean(obj));
  const hits = raycaster.intersectObjects(candidates, true);
  const hit = hits[0]?.object;
  const uuid = hit ? findManagedUuid(hit) : null;

  selectedUuid =
    uuid && manager.getObject(uuid)?.metadata.editable !== false ? uuid : null;
  refreshSelectionHelper();
  updateEditorHud();
}

function updateEditorHud(): void {
  const mode = document.getElementById('editor-mode');
  const selected = document.getElementById('editor-selection');
  const cameraLabel = document.getElementById('camera-mode');
  if (mode) mode.textContent = editMode ? 'EDIT MODE' : 'PLAY MODE';
  if (selected) {
    selected.textContent = selectedUuid
      ? manager.getObject(selectedUuid)?.metadata.name ?? selectedUuid
      : 'None';
  }
  if (cameraLabel) cameraLabel.textContent = thirdPerson ? 'THIRD PERSON' : 'FIRST PERSON';
}

function updateControlHint(): void {
  const hint = document.getElementById('control-hint');
  if (!hint) return;
  if (editMode) {
    hint.textContent =
      'TAB play/edit · click object · arrows move · Shift = 1m · PageUp/PageDown height';
    return;
  }
  hint.textContent = pointerLocked
    ? 'WASD move · Mouse look · Shift sprint · Space jump · V camera · TAB edit · Esc release'
    : 'Click map · WASD move · Mouse look · Space jump · V camera · TAB edit';
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Tab') {
    event.preventDefault();
    editMode = !editMode;
    if (editMode && document.pointerLockElement === renderer.domElement) {
      document.exitPointerLock();
    }
    if (!editMode) selectedUuid = null;
    refreshSelectionHelper();
    updateEditorHud();
    updateControlHint();
    return;
  }

  if (event.code === 'KeyV') {
    if (!editMode) {
      thirdPerson = !thirdPerson;
      updateEditorHud();
    }
    return;
  }

  keys.add(event.code);

  if (event.code === 'Space' && !editMode && grounded) {
    verticalVelocity = JUMP_SPEED;
    grounded = false;
    event.preventDefault();
  }

  if (!editMode || !selectedUuid) return;
  const current = manager.getObject(selectedUuid);
  if (!current || current.metadata.editable === false) return;

  const step = event.shiftKey ? 1 : 0.25;
  let dx = 0;
  let dy = 0;
  let dz = 0;
  if (event.code === 'ArrowLeft') dx -= step;
  if (event.code === 'ArrowRight') dx += step;
  if (event.code === 'ArrowUp') dz -= step;
  if (event.code === 'ArrowDown') dz += step;
  if (event.code === 'PageUp') dy += step;
  if (event.code === 'PageDown') dy -= step;

  if (dx !== 0 || dy !== 0 || dz !== 0) {
    event.preventDefault();
    manager.updateObjectTransform(selectedUuid, {
      position: {
        x: current.transform.position.x + dx,
        y: current.transform.position.y + dy,
        z: current.transform.position.z + dz,
      },
    });
    saveScene();
    refreshSelectionHelper();
    updateEditorHud();
  }
});

window.addEventListener('keyup', (event) => keys.delete(event.code));

renderer.domElement.addEventListener('click', (event) => {
  if (editMode) {
    selectObjectFromPointer(event);
    return;
  }
  renderer.domElement.requestPointerLock?.();
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  updateControlHint();
});

document.addEventListener('mousemove', (event) => {
  if (!pointerLocked || editMode) return;
  const sensitivity = 0.0022;
  yaw -= event.movementX * sensitivity;
  pitch -= event.movementY * sensitivity;
  pitch = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, pitch));
});

function updatePlayer(delta: number): void {
  if (editMode) return;

  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const direction = new THREE.Vector3();

  if (keys.has('KeyW')) direction.add(forward);
  if (keys.has('KeyS')) direction.sub(forward);
  if (keys.has('KeyD')) direction.add(right);
  if (keys.has('KeyA')) direction.sub(right);

  if (direction.lengthSq() > 0) {
    direction.normalize();
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED;
    const result = collisionWorld.movePlayer(
      { x: player.x, y: player.y, z: player.z },
      { x: direction.x * speed * delta, y: 0, z: direction.z * speed * delta },
      PLAYER_RADIUS,
      EYE_HEIGHT,
    );
    player.x = result.position.x;
    player.z = result.position.z;
  }

  verticalVelocity -= GRAVITY * delta;
  const verticalResult = collisionWorld.movePlayer(
    { x: player.x, y: player.y, z: player.z },
    { x: 0, y: verticalVelocity * delta, z: 0 },
    PLAYER_RADIUS,
    EYE_HEIGHT,
  );
  player.y = verticalResult.position.y;
  if (verticalResult.grounded) {
    grounded = true;
    verticalVelocity = 0;
  } else {
    grounded = false;
  }

  camera.rotation.order = 'YXZ';
  if (!thirdPerson) {
    camera.position.copy(player);
    camera.rotation.set(pitch, yaw, 0);
    return;
  }

  const backward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const target = new THREE.Vector3(player.x, player.y - 0.5, player.z);
  camera.position.copy(player).addScaledVector(backward, THIRD_PERSON_DISTANCE);
  camera.position.y += THIRD_PERSON_HEIGHT - EYE_HEIGHT;
  camera.lookAt(target);
}

function setHud(): void {
  const position = document.getElementById('player-position');
  const managed = document.getElementById('stat-count');
  const rendered = document.getElementById('stat-render');
  const time = document.getElementById('time-of-day');
  if (position) {
    position.textContent = `${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)}`;
  }
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
