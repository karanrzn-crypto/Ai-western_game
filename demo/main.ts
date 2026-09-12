/**
 * demo/main.ts
 * -----------------------------------------------------------------------------
 * Visual demo for the SceneStateManager.
 *
 * Loads examples/default-scene.json into a SceneStateManager wired up
 * to a ThreeRendererAdapter, lets the user shuffle chair transforms,
 * export the scene back to JSON, and verify the registry's state with
 * the in-panel snapshot card.
 *
 * Run with:  npm run dev
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  SceneStateManager,
  PersistenceManager,
  ThreeRendererAdapter,
} from '../src/index.js';
import defaultScene from '../examples/default-scene.json' assert { type: 'json' };

// --- Three.js bootstrap ----------------------------------------------------
const stageEl = document.getElementById('stage')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d12);
scene.fog = new THREE.Fog(0x0d0d12, 12, 36);

const camera = new THREE.PerspectiveCamera(
  55,
  stageEl.clientWidth / stageEl.clientHeight,
  0.1,
  200,
);
camera.position.set(10, 8, 12);
camera.lookAt(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(stageEl.clientWidth, stageEl.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stageEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

// Hemisphere + directional so the saloon reads even before lamps light it.
scene.add(new THREE.HemisphereLight(0xb3a97a, 0x403426, 0.6));
const sun = new THREE.DirectionalLight(0xffeebb, 0.9);
sun.position.set(8, 16, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
scene.add(sun);

const grid = new THREE.GridHelper(40, 40, 0x3a3240, 0x1f1f25);
scene.add(grid);

// --- Wire up our SceneStateManager ----------------------------------------
const adapter = new ThreeRendererAdapter({ scene });
const manager = new SceneStateManager({ renderer: adapter });
const persistence = new PersistenceManager();

function refreshSnapshot() {
  const snap = manager.getSnapshot();
  document.getElementById('stat-count')!.textContent = String(snap.objectCount);
  document.getElementById('stat-render')!.textContent = String(adapter.getActiveObjectCount());
  const typeSummary = Object.entries(snap.byAssetType)
    .map(([k, v]) => `${k}×${v}`)
    .join(', ') || '—';
  document.getElementById('stat-bytype')!.textContent = typeSummary;

  // List
  const list = document.getElementById('obj-list')!;
  list.innerHTML = '';
  for (const def of manager.getAllObjects()) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="name">${escapeHTML(def.metadata.name)}</span>
      <span class="type">${escapeHTML(def.assetType)}</span>
      <span class="uuid">${escapeHTML(def.uuid.slice(0, 8))}</span>
    `;
    list.appendChild(li);
  }
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

function toast(msg: string): void {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// --- Action buttons --------------------------------------------------------
document.getElementById('btn-load')!.addEventListener('click', () => {
  const summary = persistence.loadSceneFromJSON(defaultScene, manager);
  toast(
    `Loaded ${summary.loaded} objects (skipped: ${summary.skipped.length})`,
  );
  refreshSnapshot();
});

document.getElementById('btn-export')!.addEventListener('click', () => {
  const data = persistence.exportSceneToJSON(manager);
  const pretty = JSON.stringify(data, null, 2);
  (document.getElementById('export-output') as HTMLTextAreaElement).value = pretty;
  navigator.clipboard?.writeText(pretty).catch(() => {});
  toast(`Exported ${data.objects.length} objects — JSON copied to clipboard`);
});

document.getElementById('btn-clear')!.addEventListener('click', () => {
  manager.clear();
  (document.getElementById('export-output') as HTMLTextAreaElement).value = '';
  toast('Registry cleared');
  refreshSnapshot();
});

document.getElementById('btn-shuffle')!.addEventListener('click', () => {
  // Demonstrate the updateObjectTransform API: rotate every chair by 15°.
  const chairs = manager.getObjectsByAssetType('chair');
  if (chairs.length === 0) {
    toast('No chairs to shuffle — load the scene first.');
    return;
  }
  for (const chair of chairs) {
    const newRotY = (chair.transform.rotation.y + 15) % 360;
    manager.updateObjectTransform(chair.uuid, {
      rotation: { ...chair.transform.rotation, y: newRotY },
    });
  }
  toast(`Rotated ${chairs.length} chairs by +15°`);
  refreshSnapshot();
});

// --- Bootstrap: load the default scene on startup -------------------------
persistence.loadSceneFromJSON(defaultScene, manager);
refreshSnapshot();

// --- Resize handler --------------------------------------------------------
window.addEventListener('resize', () => {
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// --- Render loop -----------------------------------------------------------
function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
