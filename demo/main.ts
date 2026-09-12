import * as THREE from 'three';
import {
  SceneStateManager,
  PersistenceManager,
  ThreeRendererAdapter,
  AssetRegistry,
  registerPrimitiveFactories,
  configure,
  logger,
} from '../src/index.js';

configure({ debug: false, logging: { level: 'info' } });

const stageEl = document.getElementById('stage')!;
const threeScene = new THREE.Scene();
threeScene.background = new THREE.Color(0x0d0d12);

const camera = new THREE.PerspectiveCamera(
  55,
  Math.max(stageEl.clientWidth, 1) / Math.max(stageEl.clientHeight, 1),
  0.1,
  100,
);
camera.position.set(3, 3, 5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(Math.max(stageEl.clientWidth, 1), Math.max(stageEl.clientHeight, 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stageEl.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(5, 8, 6);
light.castShadow = true;
threeScene.add(light);
threeScene.add(new THREE.AmbientLight(0x404050, 0.6));

// Debug helpers are deliberately outside SceneStateManager and are therefore
// never serialized into scene JSON.
const grid = new THREE.GridHelper(20, 20, 0x555555, 0x25252d);
grid.position.y = -0.5;
threeScene.add(grid);
const axes = new THREE.AxesHelper(4);
axes.position.set(0, -0.49, 0);
threeScene.add(axes);

const assets = new AssetRegistry();
registerPrimitiveFactories(assets);

const adapter = new ThreeRendererAdapter({ scene: threeScene, assetRegistry: assets });
const manager = new SceneStateManager({ renderer: adapter });
const persistence = new PersistenceManager();

manager.bus.on('object:registered', ({ definition }) => {
  logger.debug('event:object:registered', { uuid: definition.uuid });
});
manager.bus.on('scene:loaded', ({ loaded, skipped }) => {
  logger.debug('event:scene:loaded', { loaded, skipped });
});

function setStatus(id: string, ok: boolean, label?: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('ok', 'pending', 'muted');
  el.classList.add(ok ? 'ok' : 'pending');
  el.textContent = label ?? (ok ? 'OK' : 'FAIL');
}

function setPendingStatuses(): void {
  for (const id of [
    'check-register',
    'check-asset',
    'check-render',
    'check-save',
    'check-clear',
    'check-load',
  ]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.classList.remove('ok');
    el.classList.add('pending');
    el.textContent = 'RUNNING';
  }
}

function refreshSnapshot(): void {
  const snap = manager.getSnapshot();
  const countEl = document.getElementById('stat-count');
  const renderEl = document.getElementById('stat-render');
  const assetEl = document.getElementById('stat-asset');
  const idEl = document.getElementById('stat-id');

  if (countEl) countEl.textContent = String(snap.objectCount);
  if (renderEl) renderEl.textContent = String(adapter.getActiveObjectCount());

  const firstUuid = snap.uuids[0] ?? '—';
  if (idEl) idEl.textContent = firstUuid === '—' ? '—' : `${firstUuid.slice(0, 18)}…`;

  const first = snap.uuids[0] ? manager.getObject(snap.uuids[0]) : undefined;
  if (assetEl) assetEl.textContent = first?.assetType ?? '—';
}

function toast(msg: string): void {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  window.setTimeout(() => t.classList.remove('show'), 2400);
}

function writeExport(text: string): void {
  const area = document.getElementById('export-output') as HTMLTextAreaElement | null;
  if (area) area.value = text;
}

let roundTripRunning = false;

async function runRoundTrip(): Promise<void> {
  if (roundTripRunning) return;
  roundTripRunning = true;
  const button = document.getElementById('btn-rerun') as HTMLButtonElement | null;
  if (button) button.disabled = true;

  try {
    setPendingStatuses();
    writeExport('');

    manager.clear();
    refreshSnapshot();
    setStatus('check-clear', manager.getObjectCount() === 0 && adapter.getActiveObjectCount() === 0);

    const uuid = '00000000-0000-4000-a000-000000000001';

    manager.registerObject({
      uuid,
      assetType: 'cube',
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      metadata: { name: 'Demo Cube' },
    });
    refreshSnapshot();
    setStatus('check-register', manager.getObjectCount() === 1);
    setStatus('check-asset', assets.has('cube'));

    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    const renderedAfterRegister = adapter.getActiveObjectCount() === 1;
    setStatus('check-render', renderedAfterRegister);
    refreshSnapshot();

    const dump = persistence.exportSceneToJSON(manager);
    writeExport(JSON.stringify(dump, null, 2));
    setStatus('check-save', dump.version === 1 && dump.objects.length === 1 && dump.objects[0]?.uuid === uuid);
    toast(`Saved ${dump.objects.length} object(s)`);

    await new Promise((resolve) => setTimeout(resolve, 350));

    manager.clear();
    refreshSnapshot();
    const cleared = manager.getObjectCount() === 0 && adapter.getActiveObjectCount() === 0;
    setStatus('check-clear', cleared);
    toast('Registry + renderer cleared');

    await new Promise((resolve) => setTimeout(resolve, 350));

    const summary = persistence.loadSceneFromJSON(dump, manager);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    refreshSnapshot();
    const restored =
      summary.loaded === 1 &&
      manager.has(uuid) &&
      adapter.getActiveObjectCount() === 1;
    setStatus('check-load', restored);
    toast(restored ? 'Cube restored — uuid preserved' : 'Cube restore failed');

    // Validate the real on-disk JSON file too, without relying on browser JSON
    // import assertions that can differ across Vite/browser versions.
    const response = await fetch('./examples/minimal-scene.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to fetch minimal-scene.json (${response.status})`);
    const minimalScene: unknown = await response.json();

    await new Promise((resolve) => setTimeout(resolve, 250));
    const diskSummary = persistence.loadSceneFromJSON(minimalScene, manager);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    refreshSnapshot();

    const diskRestored =
      diskSummary.loaded === 1 &&
      manager.getObjectCount() === 1 &&
      adapter.getActiveObjectCount() === 1 &&
      manager.has(uuid);
    if (!diskRestored) {
      throw new Error('On-disk scene did not restore the expected cube');
    }

    setStatus('check-load', true, 'OK');
    toast('Loaded examples/minimal-scene.json — cube visible');
  } finally {
    roundTripRunning = false;
    if (button) button.disabled = false;
  }
}

document.getElementById('btn-rerun')?.addEventListener('click', () => {
  void runRoundTrip().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Round-trip failed', { error: message });
    toast(`Round-trip error: ${message}`);
    for (const id of ['check-register', 'check-asset', 'check-render', 'check-save', 'check-clear', 'check-load']) {
      setStatus(id, false);
    }
  });
});

void runRoundTrip().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('Initial round-trip failed', { error: message });
  toast(`Round-trip error: ${message}`);
  for (const id of ['check-register', 'check-asset', 'check-render', 'check-save', 'check-clear', 'check-load']) {
    setStatus(id, false);
  }
});

window.addEventListener('resize', () => {
  const w = Math.max(stageEl.clientWidth, 1);
  const h = Math.max(stageEl.clientHeight, 1);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

function animate(): void {
  renderer.render(threeScene, camera);
  requestAnimationFrame(animate);
}
animate();
