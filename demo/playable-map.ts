import * as THREE from 'three';
import {
  SceneStateManager,
  ThreeRendererAdapter,
  AssetRegistry,
  registerPrimitiveFactories,
  PersistenceManager,
  configure,
} from '../src/index.js';
import { GroundAssetFactory } from '../src/assets/GroundAssetFactory.js';

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
const player = new THREE.Vector3(0, 1.7, 12);
let yaw = Math.PI;
let pitch = 0;
camera.position.copy(player);
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
scene.add(new THREE.HemisphereLight(0xf0e0bf, 0x4b493d, 1.2));

const grid = new THREE.GridHelper(60, 60, 0x514b40, 0x6b6252);
grid.position.y = 0.01;
scene.add(grid);

const axes = new THREE.AxesHelper(3);
axes.position.set(0, 0.03, 0);
scene.add(axes);

const assets = new AssetRegistry();
registerPrimitiveFactories(assets);
assets.register('ground', new GroundAssetFactory(), 'World Ground');

const adapter = new ThreeRendererAdapter({ scene, assetRegistry: assets });
const manager = new SceneStateManager({ renderer: adapter });
const persistence = new PersistenceManager();
const SAVE_KEY = 'ai-western-game.playable-map.scene.v1';

const groundUuid = '10000000-0000-4000-a000-000000000001';
manager.registerObject({
  uuid: groundUuid,
  assetType: 'ground',
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: -90, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  },
  metadata: { name: 'Main Map Ground', size: 60 },
});

function addBoundary(uuid: string, name: string, position: THREE.Vector3, scale: THREE.Vector3) {
  manager.registerObject({
    uuid,
    assetType: 'cube',
    transform: {
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: scale.x, y: scale.y, z: scale.z },
    },
    metadata: { name, mapBoundary: true, editable: false },
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
  metadata: { name: 'Spawn Landmark', editable: true },
});

const keys = new Set<string>();
let pointerLocked = false;
let editMode = false;
let selectedUuid: string | null = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd166);
selectionBox.visible = false;
scene.add(selectionBox);

function saveScene(): void {
  const data = persistence.exportSceneToJSON(manager, { map: 'playable-map', mode: 'development' });
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

function selectObjectFromPointer(event: MouseEvent): void {
  if (!editMode) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const candidates = adapter.getActiveUUIDs()
    .map((uuid) => scene.getObjectByProperty('uuid', uuid))
    .filter((obj): obj is THREE.Object3D => Boolean(obj));
  const hits = raycaster.intersectObjects(candidates, true);
  const hit = hits[0]?.object;
  const uuid = hit ? findManagedUuid(hit) : null;
  if (uuid && manager.getObject(uuid)?.metadata.editable !== false) {
    selectedUuid = uuid;
  } else {
    selectedUuid = null;
  }
  refreshSelectionHelper();
  updateEditorHud();
}

function findManagedUuid(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const candidate = current.uuid;
    if (manager.has(candidate)) return candidate;
    current = current.parent;
  }
  return null;
}

function updateEditorHud(): void {
  const mode = document.getElementById('editor-mode');
  const selected = document.getElementById('editor-selection');
  if (mode) mode.textContent = editMode ? 'EDIT MODE' : 'PLAY MODE';
  if (selected) selected.textContent = selectedUuid ? (manager.getObject(selectedUuid)?.metadata.name ?? selectedUuid) : 'None';
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Tab') {
    event.preventDefault();
    editMode = !editMode;
    if (editMode && document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    if (!editMode) selectedUuid = null;
    refreshSelectionHelper();
    updateEditorHud();
    return;
  }
  keys.add(event.code);

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
  const hint = document.getElementById('control-hint');
  if (hint) {
    hint.textContent = editMode
      ? 'TAB play/edit · click object · arrows move · Shift = 1m · PageUp/PageDown height'
      : pointerLocked
        ? 'WASD move · mouse look · Shift sprint · Esc release · TAB edit mode'
        : 'Click map · WASD move · mouse look · TAB edit mode';
  }
});

document.addEventListener('mousemove', (event) => {
  if (!pointerLocked || editMode) return;
  const sensitivity = 0.0022;
  yaw -= event.movementX * sensitivity;
  pitch -= event.movementY * sensitivity;
  pitch = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, pitch));
});

function setHud(): void {
  const position = document.getElementById('player-position');
  const managed = document.getElementById('stat-count');
  const rendered = document.getElementById('stat-render');
  if (position) position.textContent = `${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)}`;
  if (managed) managed.textContent = String(manager.getObjectCount());
  if (rendered) rendered.textContent = String(adapter.getActiveObjectCount());
}

const clock = new THREE.Clock();
function updateMovement(delta: number): void {
  if (editMode) {
    camera.position.copy(player);
    camera.rotation.set(pitch, yaw, 0);
    return;
  }

  // Camera looks along local -Z. These vectors therefore make W = forward
  // and S = backward for every yaw, including the initial yaw of PI.
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const direction = new THREE.Vector3();

  if (keys.has('KeyW')) direction.add(forward);
  if (keys.has('KeyS')) direction.sub(forward);
  if (keys.has('KeyD')) direction.add(right);
  if (keys.has('KeyA')) direction.sub(right);

  if (direction.lengthSq() > 0) {
    direction.normalize();
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = sprint ? 11 : 6;
    player.addScaledVector(direction, speed * delta);
  }

  const limit = 27.5;
  player.x = Math.max(-limit, Math.min(limit, player.x));
  player.z = Math.max(-limit, Math.min(limit, player.z));
  player.y = 1.7;

  camera.position.copy(player);
  camera.rotation.set(pitch, yaw, 0);
}

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.05);
  updateMovement(delta);
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
animate();
