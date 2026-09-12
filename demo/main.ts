/**
 * demo/main.ts
 * -----------------------------------------------------------------------------
 * Minimal architecture validation demo.
 *
 * Deliberately tiny: ONE cube, ONE camera, ONE light. No gameplay, no
 * player controller, no western world content — exists ONLY to prove the
 * foundation runs end-to-end:
 *
 *   1. registerObject(cube)               — SceneStateManager.add
 *   2. ThreeRendererAdapter mirrors cube — mesh appears in three.js scene
 *   3. exportSceneToJSON()                — registry → portable JSON
 *   4. manager.clear()                    — registry + meshes emptied
 *   5. loadSceneFromJSON()                — JSON → registry (uuid preserved)
 *
 * The full round-trip runs automatically on page load and can be re-triggered
 * from the side panel button.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import {
  SceneStateManager,
  PersistenceManager,
  ThreeRendererAdapter,
} from '../src/index.js';
import minimalScene from '../examples/minimal-scene.json' assert { type: 'json' };

// ---------------------------------------------------------------------------
// Three.js bootstrap — one camera, one light, one renderer.
// ---------------------------------------------------------------------------
const stageEl = document.getElementById('stage')!;
const threeScene = new THREE.Scene();
threeScene.background = new THREE.Color(0x0d0d12);

const camera = new THREE.PerspectiveCamera(
  55,
  stageEl.clientWidth / stageEl.clientHeight,
  0.1,
  100,
);
camera.position.set(3, 3, 5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(stageEl.clientWidth, stageEl.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stageEl.appendChild(renderer.domElement);

// ONE light.
const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(5, 8, 6);
light.castShadow = true;
threeScene.add(light);

// Subtle ambient so the unlit side of the cube isn't pure black.
threeScene.add(new THREE.AmbientLight(0x404050, 0.6));

// ---------------------------------------------------------------------------
// Wire up SceneStateManager + PersistenceManager.
// ---------------------------------------------------------------------------
const adapter = new ThreeRendererAdapter({ scene: threeScene });
const manager = new SceneStateManager({ renderer: adapter });
const persistence = new PersistenceManager();

// ---------------------------------------------------------------------------
// UI helpers.
// ---------------------------------------------------------------------------
function setStatus(stepId: string, ok: boolean): void {
  const el = document.getElementById(stepId);
  if (!el) return;
  el.classList.remove('ok', 'pending');
  el.classList.add(ok ? 'ok' : 'pending');
}

function refreshSnapshot(): void {
  const snap = manager.getSnapshot();
  document.getElementById('stat-count')!.textContent = String(snap.objectCount);
  document.getElementById('stat-render')!.textContent = String(
    adapter.getActiveObjectCount(),
  );
  const firstUuid = snap.uuids[0] ?? '—';
  document.getElementById('stat-uuid')!.textContent =
    firstUuid === '—' ? '—' : firstUuid.slice(0, 13) + '…';
}

function toast(msg: string): void {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

function writeExport(text: string): void {
  (document.getElementById('export-output') as HTMLTextAreaElement).value = text;
}

function resetStatuses(): void {
  for (const id of ['step-register', 'step-render', 'step-export', 'step-clear', 'step-load']) {
    const el = document.getElementById(id);
    el?.classList.remove('ok');
    el?.classList.add('pending');
  }
}

// ---------------------------------------------------------------------------
// The full architecture-validation round-trip.
// ---------------------------------------------------------------------------
async function runRoundTrip(): Promise<void> {
  resetStatuses();
  writeExport('');
  manager.clear();
  refreshSnapshot();

  // --- Step 1: register one cube via SceneStateManager --------------
  // We register it programmatically (not by loading JSON) so this demo
  // also exercises the registerObject() API path, not just loadSceneFromJSON.
  manager.registerObject({
    uuid: '00000000-0000-4000-a000-000000000001',
    assetType: 'cube',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    metadata: { name: 'Demo Cube' },
  });
  setStatus('step-register', true);

  // --- Step 2: ThreeRendererAdapter should have mirrored the cube ---
  // (no explicit call needed — syncObject ran during registerObject)
  setStatus('step-render', adapter.getActiveObjectCount() === 1);
  refreshSnapshot();

  // Yield a frame so the user sees the cube before we destroy it.
  await new Promise((r) => setTimeout(r, 700));

  // --- Step 3: exportSceneToJSON() ----------------------------------
  const dump = persistence.exportSceneToJSON(manager);
  writeExport(JSON.stringify(dump, null, 2));
  setStatus('step-export', dump.objects.length === 1);
  toast(`Exported ${dump.objects.length} object(s)`);

  await new Promise((r) => setTimeout(r, 700));

  // --- Step 4: clear() ----------------------------------------------
  manager.clear();
  setStatus('step-clear', manager.getObjectCount() === 0);
  refreshSnapshot();
  toast('Registry cleared — cube removed');

  await new Promise((r) => setTimeout(r, 700));

  // --- Step 5: loadSceneFromJSON() restores the cube with same uuid --
  const summary = persistence.loadSceneFromJSON(dump, manager);
  setStatus(
    'step-load',
    summary.loaded === 1 &&
      manager.has('00000000-0000-4000-a000-000000000001'),
  );
  refreshSnapshot();
  toast(`Loaded ${summary.loaded} object(s) — uuid preserved`);

  // Also exercise loadSceneFromJSON from the on-disk minimal-scene.json
  // so we prove the JSON file is interchangeable with the in-memory dump.
  await new Promise((r) => setTimeout(r, 700));
  manager.clear();
  persistence.loadSceneFromJSON(minimalScene, manager);
  refreshSnapshot();
  toast('Loaded from examples/minimal-scene.json');
}

// ---------------------------------------------------------------------------
// Boot.
// ---------------------------------------------------------------------------
document.getElementById('btn-rerun')!.addEventListener('click', () => {
  runRoundTrip().catch((err) => {
    console.error('Round-trip failed:', err);
    toast(`Round-trip error: ${err.message ?? err}`);
  });
});

void runRoundTrip();

// ---------------------------------------------------------------------------
// Resize + render loop.
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

function animate(): void {
  renderer.render(threeScene, camera);
  requestAnimationFrame(animate);
}
animate();
