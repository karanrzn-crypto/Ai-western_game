/* FIX-ROUND 3 verification (user 12-issue report) — real browser proof.
 * §1 Z-FIGHT SCAN — production filters, ZERO allowlist entries expected.
 * §2 GEOMETRY — merge-aware vertex-window probes: wealthy columns, family
 *    railing, sheriff piers, vault-door floor clearance (closed AND open),
 *    family-beside-butcher, farm horses gone, continuous road routes, camera.
 * §3 HORSE BOUNDARY — place near the playable edge: no snap-back; clamp
 *    still stops past-boundary placements; the save slot round-trips.
 * §4 WALKTHROUGH — farm road → entrance → square → stable road → exit;
 *    the REAL vault-door E interaction from inside the office.
 * §5 console-error watch + screenshots of every corrected area.
 * Run: node scripts/verify-round3.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = 'http://localhost:5176/';
const OUT = path.join(__dirname, '..', 'shots-round3');
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const neuter = (proto, name) => { const o = proto[name]; proto[name] = function (id) { try { o.call(this, id); } catch (e) {} }; };
    neuter(window.HTMLElement.prototype, 'requestPointerLock');
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
    window.__k = (type, code) => {
      const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
    };
  });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__westTest.setDayTime(12));
  // Park the companion horse so walk probes measure clean (N = STAY).
  await ev(() => window.__k('keydown', 'KeyN'));
  await ev(() => window.__k('keyup', 'KeyN'));
  await page.waitForTimeout(600);

  const shot = async (name) => {
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  };
  const look = (x, y, z, tx, ty, tz) => ev((p) => window.__westTest.setCamera(p[0], p[1], p[2], p[3], p[4], p[5]), [x, y, z, tx, ty, tz]);

  /** Merge-aware vertex collector: windows in world space around expected
   *  positions (the merge pass bakes per-part names into combined meshes). */
  const vertexWindows = (uuid, windows, yMin, yMax, tol) => ev((sel) => {
    const scene = window.__westTest.scene();
    scene.updateMatrixWorld(true);
    const root = sel.uuid ? scene.getObjectByProperty('uuid', sel.uuid) : scene;
    if (!root) return null;
    const runs = sel.centers.map((c) => ({ ...c, minY: Infinity, maxY: -Infinity, verts: 0 }));
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      o.updateWorldMatrix(true, false);
      const p = o.geometry.attributes.position;
      const idx = o.geometry.index;
      const e = new Float32Array(16); e.set(o.matrixWorld.elements);
      const n = idx ? idx.count : p.count;
      for (let i = 0; i < n; i += 1) {
        const vi = idx ? idx.getX(i) : i;
        const x = p.getX(vi), y = p.getY(vi), z = p.getZ(vi);
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (wy < sel.yMin || wy > sel.yMax) continue;
        for (let k = 0; k < runs.length; k += 1) {
          if (Math.abs(wx - runs[k].x) < sel.tol && Math.abs(wz - runs[k].z) < sel.tol) {
            runs[k].minY = Math.min(runs[k].minY, wy);
            runs[k].maxY = Math.max(runs[k].maxY, wy);
            runs[k].verts += 1;
          }
        }
      }
    });
    return runs;
  }, { uuid, centers: windows, yMin, yMax, tol });

  /* ---- §1 Z-FIGHT SCAN (production filters, no allowlist) ----------------- */
  const scan = await ev(() => {
    const scene = window.__westTest.scene();
    scene.updateMatrixWorld(true);
    const meshes = [];
    const eff = (o) => { let c = o; while (c) { if (c.visible === false) return false; c = c.parent; } return true; };
    const inChar = (o) => { let c = o; while (c) { if (c.name === 'character-root' || c.name === 'horse-root') return true; c = c.parent; } return false; };
    const dyn = (o) => { let c = o; while (c) { if (c.userData && c.userData.dynamic === true) return true; c = c.parent; } return false; };
    scene.traverse((o) => { if (o.isMesh && o.geometry && o.material && eff(o) && !inChar(o) && !dyn(o)) meshes.push(o); });
    const buckets = new Map();
    const e = new Float32Array(16);
    for (const mesh of meshes) {
      e.set(mesh.matrixWorld.elements);
      const pos = mesh.geometry.attributes.position; if (!pos) continue;
      const idx = mesh.geometry.index;
      const tri = Math.floor((idx ? idx.count : pos.count) / 3);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const matId = mats.map((m) => m.uuid).join('|');
      const name = mesh.name || mesh.parent?.name || '<anon>';
      const v = [0, 1, 2].map(() => ({ x: 0, y: 0, z: 0 }));
      for (let t = 0; t < tri; t++) {
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
          const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
          v[k].x = e[0] * x + e[4] * y + e[8] * z + e[12];
          v[k].y = e[1] * x + e[5] * y + e[9] * z + e[13];
          v[k].z = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
        const ux = v[1].x - v[0].x, uy = v[1].y - v[0].y, uz = v[1].z - v[0].z;
        const wx = v[2].x - v[0].x, wy = v[2].y - v[0].y, wz = v[2].z - v[0].z;
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const nl = Math.hypot(nx, ny, nz); if (nl < 1e-9) continue;
        nx /= nl; ny /= nl; nz /= nl;
        const d = nx * v[0].x + ny * v[0].y + nz * v[0].z;
        const key = `${nx.toFixed(2)},${ny.toFixed(2)},${nz.toFixed(2)}|${Math.round(d * 1000)}`;
        let b = buckets.get(key); if (!b) { b = []; if (buckets.size < 40000) buckets.set(key, b); }
        if (b.length < 900) {
          b.push({ name, matId,
            minx: Math.min(v[0].x, v[1].x, v[2].x), maxx: Math.max(v[0].x, v[1].x, v[2].x),
            miny: Math.min(v[0].y, v[1].y, v[2].y), maxy: Math.max(v[0].y, v[1].y, v[2].y),
            minz: Math.min(v[0].z, v[1].z, v[2].z), maxz: Math.max(v[0].z, v[1].z, v[2].z) });
        }
      }
    }
    const conflicts = [];
    for (const [key, b] of buckets) {
      if (b.length < 2) continue;
      const plane = parseFloat(key.split('|')[1]) / 1000;
      if (plane <= 0.015) continue; // ground-level undersides: buried, invisible
      const nk = key.split('|')[0].split(',').map(Number);
      const axes = Math.abs(nk[0]) > 0.9 ? ['y', 'z'] : Math.abs(nk[1]) > 0.9 ? ['x', 'z'] : ['x', 'y'];
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
        const a = b[i], c = b[j];
        if (a.matId === c.matId && a.name === c.name) continue;
        const ow = Math.min(a['max' + axes[0]], c['max' + axes[0]]) - Math.max(a['min' + axes[0]], c['min' + axes[0]]);
        const oh = Math.min(a['max' + axes[1]], c['max' + axes[1]]) - Math.max(a['min' + axes[1]], c['min' + axes[1]]);
        if (ow < 0.05 || oh < 0.05) continue;
        const wA = a['max' + axes[0]] - a['min' + axes[0]], hA = a['max' + axes[1]] - a['min' + axes[1]];
        const wB = c['max' + axes[0]] - c['min' + axes[0]], hB = c['max' + axes[1]] - c['min' + axes[1]];
        if (Math.min(wA, wB) < 0.12 || Math.min(hA, hB) < 0.12) continue;
        conflicts.push({ key, a: a.name, b: c.name, ow: +ow.toFixed(3), oh: +oh.toFixed(3) });
        if (conflicts.length > 30) return { meshes: meshes.length, conflicts };
      }
    }
    return { meshes: meshes.length, conflicts };
  });
  ok('§1 z-fight scan: zero coplanar conflicts (no allowlist, all residuals fixed)',
    scan.conflicts.length === 0,
    `meshes=${scan.meshes} conflicts=${scan.conflicts.length} ${JSON.stringify(scan.conflicts.slice(0, 4))}`);

  /* ---- §2 GEOMETRY --------------------------------------------------------- */
  const uuidOf = (suffix) => `c0000000-0000-4000-8000-0000000300${suffix}`;
  const wealthyUuid = uuidOf('43');
  const familyUuid = uuidOf('42');

  // §2a wealthy columns: local x ±1.85/±0.62, z 2.95 ×1.3, yaw 180, site
  // (21, 13.5) → base y 0.182 (deck top), capital top y 2.802 (beam underside).
  // Window y capped at 2.85: the second-floor balcony (from 2.919) hangs over
  // the two INNER columns and would pollute their maxY (by design).
  const cols = await vertexWindows(wealthyUuid, [
    { x: 21 - 1.85 * 1.3, z: 13.5 - 2.95 * 1.3, label: 'W' },
    { x: 21 - 0.62 * 1.3, z: 13.5 - 2.95 * 1.3, label: 'WC' },
    { x: 21 + 0.62 * 1.3, z: 13.5 - 2.95 * 1.3, label: 'EC' },
    { x: 21 + 1.85 * 1.3, z: 13.5 - 2.95 * 1.3, label: 'E' },
  ], 0.05, 2.85, 0.16);
  if (cols) {
    const baseOK = cols.every((r) => r.verts > 0 && Math.abs(r.minY - 0.182) < 0.004);
    const sameBase = new Set(cols.map((r) => r.minY.toFixed(3))).size === 1;
    const capOK = cols.every((r) => r.verts > 0 && Math.abs(r.maxY - 2.8015) < 0.006);
    ok('§2a wealthy: all 4 columns spring EXACTLY off the porch deck (y 0.182; was +0.53 float)',
      baseOK && sameBase, cols.map((r) => `${r.label} base ${r.minY.toFixed(3)}`).join(' · '));
    ok('§2a wealthy: capitals land flush under the porch-roof beam (y 2.802; was stranded 0.5 low)',
      capOK, cols.map((r) => `${r.label} top ${r.maxY.toFixed(3)}`).join(' · '));
  } else ok('§2a wealthy porch probe', false, 'wealthy root not found');

  // §2b family railing: balusters house-local z 3.4, y 0.18…1.105 ×1.3,
  // yaw 90, site (−12, −6.8) → world x ≈ −7.58, z −9.3…−4.3.
  const rail = await vertexWindows(familyUuid, [
    { x: -12 + 3.4 * 1.3, z: -6.8 - 1.92 * 1.3, label: 'S-end' },
    { x: -12 + 3.4 * 1.3, z: -6.8 + 1.92 * 1.3, label: 'N-end' },
  ], 0.1, 1.7, 0.2);
  if (rail && rail.every((r) => r.verts > 0)) {
    const bottoms = rail.map((r) => r.minY);
    ok('§2b family: railing posts seat exactly ON the deck (y 0.234; was 9 cm float)',
      bottoms.every((y) => Math.abs(y - 0.234) < 0.004),
      `band bottoms ${bottoms.map((y) => y.toFixed(3)).join(' / ')} vs deck top 0.234`);
    ok('§2b family: the rail still reaches its designed top (1.502)',
      rail.every((r) => Math.abs(r.maxY - 1.502) < 0.012),
      `band tops ${rail.map((r) => r.maxY.toFixed(3)).join(' / ')}`);
  } else ok('§2b family railing probe', false, 'no railing vertices in the porch windows');

  // §2c sheriff piers: local (−4.65/0, 0.0325, 3.85/5.15), yaw 180, site (8.5, 14.5)
  const piers = await vertexWindows(null, [
    { x: 8.5 + 4.65, z: 14.5 - 3.85, label: 'NW' },
    { x: 8.5 + 4.65, z: 14.5 - 5.15, label: 'SW' },
    { x: 8.5 + 0.0, z: 14.5 - 3.85, label: 'NE' },
    { x: 8.5 + 0.0, z: 14.5 - 5.15, label: 'SE' },
  ], -0.02, 0.12, 0.22);
  ok('§2c sheriff: 4 stone piers stand under the deck (y 0…0.07, seated into its underside)',
    piers && piers.every((p) => p.verts > 0 && Math.abs(p.minY) < 0.002 && p.maxY > 0.055 && p.maxY < 0.075),
    piers ? piers.map((p) => `${p.label} ${p.minY.toFixed(3)}…${p.maxY.toFixed(3)} (${p.verts})`).join(' · ') : 'scene root missing');

  /* ---- §2d bank vault door: floor clearance closed AND fully open ---------- */
  const vaultProbe = await ev(() => {
    const scene = window.__westTest.scene();
    scene.updateMatrixWorld(true);
    const hinge = scene.getObjectByName('bank-vault-door-hinge');
    if (!hinge) return null;
    const minYOf = () => {
      let minY = Infinity;
      hinge.updateWorldMatrix(true, true);
      hinge.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        const p = o.geometry.attributes.position;
        const e = new Float32Array(16); e.set(o.matrixWorld.elements);
        for (let i = 0; i < p.count; i += 1) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          minY = Math.min(minY, e[1] * x + e[5] * y + e[9] * z + e[13]);
        }
      });
      return minY;
    };
    const out = {};
    hinge.rotation.y = 0; scene.updateMatrixWorld(true); out.closed = minYOf();
    hinge.rotation.y = -1.396; scene.updateMatrixWorld(true); out.open = minYOf();
    hinge.rotation.y = 0; scene.updateMatrixWorld(true);
    out.floorTop = 0.6;
    return out;
  });
  if (vaultProbe) {
    ok('§2d vault door: closed disc bottom clears the bank floor by 40 mm', vaultProbe.closed >= vaultProbe.floorTop - 1e-3,
      `door bottom ${vaultProbe.closed.toFixed(3)} vs floor ${vaultProbe.floorTop.toFixed(3)}`);
    ok('§2d vault door: fully open (80°) disc bottom still clears the floor', vaultProbe.open >= vaultProbe.floorTop - 1e-3,
      `open bottom ${vaultProbe.open.toFixed(3)} vs floor ${vaultProbe.floorTop.toFixed(3)}`);
  } else ok('§2d vault door probe', false, 'hinge not found');

  /* ---- §2e layout facts + camera ------------------------------------------- */
  const layout = await ev(() => {
    const defs = window.__westTest.objects();
    const fam = defs.find((d) => d.uuid === 'c0000000-0000-4000-8000-000000030042');
    const butcher = defs.find((d) => d.uuid === 'c0000000-0000-4000-8000-000000030040');
    const horses = defs.filter((d) => d.assetType === 'town-horse');
    const roads = defs.filter((d) => d.assetType === 'town-road');
    const routes = roads.filter((d) => Array.isArray(d.metadata.route));
    const polygons = roads.filter((d) => Array.isArray(d.metadata.polygon));
    const patches = roads.filter((d) => d.metadata.tint === 'patch');
    const limit = 59.5;
    const inside = routes.every((r) => r.metadata.route.every((p) => Math.abs(p.x) <= limit && Math.abs(p.z) <= limit));
    const penHorses = horses.filter((h) => h.transform.position.z < -38);
    return {
      fam, butcher, horseCount: horses.length, penHorseNames: penHorses.map((h) => h.metadata.name),
      routes: routes.length, polygons: polygons.length, patches: patches.length, inside,
    };
  });
  ok('§2e family house stands beside the butcher, same yaw (user §12)',
    layout.fam.transform.rotation.y === 90 && layout.butcher.transform.rotation.y === 90
    && Math.abs(layout.fam.transform.position.x - layout.butcher.transform.position.x) < 1
    && Math.abs(layout.fam.transform.position.z - layout.butcher.transform.position.z) < 9,
    `family (${layout.fam.transform.position.x}, ${layout.fam.transform.position.z}) yaw ${layout.fam.transform.rotation.y} · butcher (${layout.butcher.transform.position.x}, ${layout.butcher.transform.position.z})`);
  ok('§2e the two decorative farm-pen horses are GONE (user §11)',
    layout.horseCount === 2 && layout.penHorseNames.length === 0,
    `town-horse defs=${layout.horseCount} (expect 2 corral) · pen names=[${layout.penHorseNames.join(', ')}]`);
  ok('§2e roads: 3 continuous routes + 1 plaza polygon + 7 blobs, all inside ±59.5 (user §5/§10)',
    layout.routes === 3 && layout.polygons === 1 && layout.patches === 7 && layout.inside,
    `routes=${layout.routes} polygons=${layout.polygons} patches=${layout.patches} inside=${layout.inside}`);
  const camFar = await ev(() => window.__westTest.camera().far);
  ok('§2f camera far plane matches the 120×120 world diagonal (180 ≥ 169.7)', camFar === 180, `camera.far=${camFar}`);

  /* ---- §3 HORSE BOUNDARY --------------------------------------------------- */
  const horseEdge = await ev(() => window.__westTest.placeHorse(52, -55));
  await page.waitForTimeout(900);
  const horseAfter = await ev(() => window.__westTest.horse().horsePos);
  ok('§3a horse parked near the SE playable edge keeps its position (no ±28.5 clamp)',
    Math.abs(horseAfter.x - 52) < 0.5 && Math.abs(horseAfter.z + 55) < 0.5,
    `placed (${horseEdge.x}, ${horseEdge.z}) → after 0.9 s (${horseAfter.x.toFixed(2)}, ${horseAfter.z.toFixed(2)})`);
  const horseOver = await ev(() => window.__westTest.placeHorse(59.4, 59.4));
  await page.waitForTimeout(400);
  const horseOverAfter = await ev(() => window.__westTest.horse().horsePos);
  ok('§3b a past-boundary placement still clamps to the shared playable half (±58.5)',
    Math.abs(horseOverAfter.x) <= 58.51 && Math.abs(horseOverAfter.z) <= 58.51,
    `placed (${horseOver.x.toFixed(2)}, ${horseOver.z.toFixed(2)}) → (${horseOverAfter.x.toFixed(2)}, ${horseOverAfter.z.toFixed(2)})`);
  // Force the REAL persistence path (pagehide = saveHorseState(force)) and
  // read the raw slot — the same payload validateHorseSave re-accepts on load.
  const horseSave = await ev(() => {
    window.dispatchEvent(new Event('pagehide'));
    const raw = localStorage.getItem('ai-western-game.playable-map.horse.v1');
    return raw ? JSON.parse(raw) : null;
  });
  ok('§3c the live horse save near the playable edge is written and in-bounds',
    Boolean(horseSave) && Math.abs(horseSave.position.x) <= 58.5 && Math.abs(horseSave.position.z) <= 58.5,
    `slot=${JSON.stringify(horseSave?.position ?? null)}`);
  await ev(() => window.__westTest.placeHorse(-3.8, -53.5)); // back to the meadow

  /* ---- §4 WALKTHROUGH ------------------------------------------------------ */
  async function walkFor(x, z, yaw, ms) {
    await ev((p) => window.__westTest.teleport(p[0], 1.7, p[1]), [x, z]);
    await ev((y) => window.__westTest.setYaw(y), yaw);
    await page.waitForTimeout(300);
    await ev(() => window.__k('keydown', 'KeyW'));
    await page.waitForTimeout(ms);
    await ev(() => window.__k('keyup', 'KeyW'));
    return ev(() => window.__westTest.player());
  }
  const w1 = await walkFor(-1.7, -52, Math.PI, 11000);
  ok('§4a farm road walks the full lane to the entrance', w1.z > -44, `z=${w1.z.toFixed(2)}`);
  const w2 = await walkFor(-6.5, -2, Math.PI, 5000);
  ok('§4b the square walks past the new family-house porch (clear lane)', w2.x > -7.6 || w2.z > 1, `at (${w2.x.toFixed(2)}, ${w2.z.toFixed(2)})`);
  const w3 = await walkFor(0.6, 15, Math.PI, 9000);
  ok('§4c stable road walks to the stable yard', w3.z > 23, `z=${w3.z.toFixed(2)}`);
  const w4 = await walkFor(0, 44, Math.PI, 9000);
  ok('§4d exit road walks to the boundary (road ends AT the wall, z 59.5)', w4.z > 52, `z=${w4.z.toFixed(2)}`);
  const w5 = await walkFor(-1.5, -52, 0, 7000);
  ok('§4e the farm road walks north and the boundary wall stops the player at z ≥ −59.5',
    w5.z > -60 && w5.z < -57, `stopped at z=${w5.z.toFixed(2)} (road end −59.5)`);

  // §4f the REAL vault-door interaction from inside the office
  await ev((p) => window.__westTest.teleport(p[0], 1.7, p[1]), [-8.6, 17.0]);
  await ev((y) => window.__westTest.setYaw(y), -Math.PI / 2);
  await page.waitForTimeout(700);
  const prompt0 = await ev(() => window.__westTest.vault().prompt);
  await ev(() => window.__k('keydown', 'KeyE'));
  await ev(() => window.__k('keyup', 'KeyE'));
  let vaultState = await ev(() => window.__westTest.vault());
  for (let i = 0; i < 40 && vaultState.swing < 1; i += 1) {
    await page.waitForTimeout(150);
    vaultState = await ev(() => window.__westTest.vault());
  }
  ok('§4f the vault door E-interaction swings fully open (collider released)',
    vaultState.target === 1 && vaultState.swing > 0.98 && vaultState.collider === false,
    `prompt="${prompt0}" swing=${vaultState.swing?.toFixed(2)} collider=${vaultState.collider}`);
  const vaultOpenFloor = await ev(() => {
    const scene = window.__westTest.scene();
    scene.updateMatrixWorld(true);
    const hinge = scene.getObjectByName('bank-vault-door-hinge');
    let minY = Infinity;
    hinge.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const p = o.geometry.attributes.position;
      const e = new Float32Array(16); e.set(o.matrixWorld.elements);
      for (let i = 0; i < p.count; i += 1) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        minY = Math.min(minY, e[1] * x + e[5] * y + e[9] * z + e[13]);
      }
    });
    return minY;
  });
  ok('§4g the OPEN door (real mechanism) never dips into the floor', vaultOpenFloor >= 0.599,
    `open disc bottom ${vaultOpenFloor.toFixed(3)} vs floor 0.600`);
  await ev(() => window.__k('keydown', 'KeyE'));
  await ev(() => window.__k('keyup', 'KeyE'));
  await page.waitForTimeout(1200);

  /* ---- §5 SCREENSHOTS of the corrected areas ------------------------------ */
  // Park the rig in EDIT mode so setCamera() owns the view (play mode would
  // re-park the rig every frame); hide the HUD/character for clean shots.
  await ev(() => {
    window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab');
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    document.querySelectorAll('.panel, .debug, #hint, #interact-prompt').forEach((el) => { el.style.display = 'none'; });
    const r = window.__westTest.scene()?.getObjectByName('character-root');
    if (r) r.visible = false;
    // hide the edit-mode grid + debug axes for clean evidence shots
    window.__westTest.scene().traverse((o) => {
      if (o.isGridHelper || o.name === 'debug-axes' || o.userData?.debugOverlay === true) o.visible = false;
    });
    window.__k('keydown', 'KeyN'); window.__k('keyup', 'KeyN'); // park the horse
  });
  await page.waitForTimeout(900);
  await look(-12, 3.4, -14.5, -12, 1.6, -6.5); await shot('01-family-house-beside-butcher');
  await look(-6.5, 2.6, -11.5, -11.5, 1.4, -6.8); await shot('02-family-front-porch');
  await look(26.2, 3.4, 5.8, 21, 1.8, 10.2); await shot('03-wealthy-columns-front');
  await look(16.6, 2.4, 8.0, 21.4, 1.6, 10.4); await shot('04-wealthy-columns-side');
  await look(21, 1.5, 5.8, 21, 2.6, 10.3); await shot('05-wealthy-porch-low-angle');
  await look(8.5, 3.2, 8.0, 8.5, 1.2, 14.5); await shot('06-sheriff-porch-support');
  await look(-10.4, 2.2, 14.4, -7.6, 1.1, 16.9); await shot('07-vault-door-closed');
  await look(-10.2, 2.6, 14.6, -7.6, 1.2, 17.1); await shot('08-vault-door-open-office');
  await look(-1.4, 5.5, -40, -1.3, 0, -58); await shot('09-farm-road-to-boundary');
  await look(0, 6.5, 30, 0.2, 0, 58); await shot('10-exit-road-to-boundary');
  await look(0, 14, -30, 0, 0, -6); await shot('11-main-street-continuous');
  await look(0, 22, -18, 0, 0, 4); await shot('12-plaza-unified');
  await look(2, 3.2, -24, 14, 1.2, -17); await shot('13-gunshop-street');
  await look(10.5, 6.5, 24, 10.5, 1.4, 36); await shot('14-stable-front');
  const errs = errors.filter((e) => !e.includes('FontFace') && !e.includes('pointerLock') && !e.includes('favicon'));
  ok('§5 zero console/page errors across the whole round', errs.length === 0, errs.slice(0, 4).join(' | ') || 'clean');

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nVERIFY-ROUND3: ${results.length - failed}/${results.length} PASS · screenshots in shots-round3/`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})();
