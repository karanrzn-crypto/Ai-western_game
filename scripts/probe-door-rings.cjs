/* Find EVERY torus/ring-like mesh in the live scene (world position + parent
 * chain), measure real FPS, and reproduce the user's stall-1 / stall-4 door
 * views with doors closed AND open. Answers: what are «حلقه های در»?
 * Run: node scripts/probe-door-rings.cjs [port]
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-door-rings';
const PORT = process.argv[2] || '5173';
const URL = `http://localhost:${PORT}/`;
const fs = require('fs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(4500);

  /* 1) FPS + frame time (real rAF measurement over 3s) */
  const perf = await page.evaluate(() => new Promise((res) => {
    const t0 = performance.now();
    let frames = 0;
    const times = [];
    const tick = () => {
      frames += 1;
      times.push(performance.now());
      if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
      else {
        const dt = [];
        for (let i = 1; i < times.length; i++) dt.push(times[i] - times[i - 1]);
        dt.sort((a, b) => a - b);
        res({
          fps: +(frames / 3).toFixed(1),
          medianMs: +dt[Math.floor(dt.length / 2)].toFixed(1),
          p95Ms: +dt[Math.floor(dt.length * 0.95)].toFixed(1),
          dpr: window.devicePixelRatio,
          calls: null,
        });
      }
    };
    requestAnimationFrame(tick);
  }));

  /* 2) Census of every torus geometry mesh in the scene */
  const tori = await page.evaluate(() => {
    const scene = window.__westTest.scene();
    const out = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      if (!g || !g.attributes.position) return;
      // torus = many vertices, no vertex exactly at origin... simpler: track constructor name via parameters
      const params = g.parameters || {};
      const isTorus = g.type === 'TorusGeometry' || (params.radialSegments !== undefined && params.tubularSegments !== undefined);
      if (!isTorus) return;
      o.updateWorldMatrix(true, false);
      const wp = new (o.position.constructor)();
      o.getWorldPosition(wp);
      const chain = [];
      let p = o;
      while (p) { chain.push(p.name || p.type || '?'); p = p.parent; }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      out.push({
        name: o.name,
        world: [+wp.x.toFixed(2), +wp.y.toFixed(2), +wp.z.toFixed(2)],
        parents: chain.slice(1, 5).join(' < '),
        mat: mats.map((m) => (m.color ? '#' + m.color.getHexString() : '?')).join(','),
      });
    });
    return out;
  });
  console.log('=== ALL TORUS MESHES (world pos) ===');
  for (const t of tori) console.log(`${t.name} @ (${t.world}) mat=${t.mat} | in: ${t.parents}`);

  /* 3) Renderer stats */
  const stats = await page.evaluate(() => {
    const r = window.__westTest.renderer ? window.__westTest.renderer() : null;
    const scene = window.__westTest.scene();
    let meshes = 0, lights = 0, visible = 0;
    scene.traverse((o) => {
      if (o.isMesh) { meshes += 1; if (o.visible) visible += 1; }
      if (o.isLight && o.visible) lights += 1;
    });
    return { meshes, visible, lights };
  });
  console.log('=== STATS ===');
  console.log(JSON.stringify({ perf, stats }, null, 1));

  /* 4) Daytime, teleport to the aisle in front of stall 4's door, screenshot closed */
  await page.evaluate(() => {
    const neuter = (proto, name) => { const o = proto[name]; if (o) proto[name] = function (id) { try { o.call(this, id); } catch (e) {} }; };
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    window.__westTest.setDayTime(10);
    window.__k = (type, code) => {
      const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
    };
    window.__hideRanger = () => {
      const r = window.__westTest.scene()?.getObjectByName('character-root');
      if (r) r.visible = false;
    };
  });
  await page.evaluate(() => window.__westTest.teleport(-15.3, 0.15, 2.7));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__hideRanger());
  await page.screenshot({ path: `${OUT}/01-stall4-door-closed.png` });

  /* 5) OPEN stall door 4 with E, catch mid-swing + final */
  await page.keyboard.press('e');
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/02-stall4-door-mid.png` });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/03-stall4-door-open.png` });

  /* 6) close it again */
  await page.keyboard.press('e');
  await page.waitForTimeout(2200);

  /* 7) stall 1 door: teleport in front of it (west row) */
  await page.evaluate(() => window.__westTest.teleport(-19.4, 0.15, 2.2));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__hideRanger());
  await page.screenshot({ path: `${OUT}/04-stall1-door-closed.png` });
  await page.keyboard.press('e');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/05-stall1-door-open.png` });

  /* 8) after opening, list any meshes near the stall-4 doorway that are far from every managed def root */
  const strays = await page.evaluate(() => {
    const scene = window.__westTest.scene();
    const defs = window.__westTest.objects();
    const V3 = scene.position.constructor;
    // world AABB per def
    const boxes = [];
    for (const d of defs) {
      const root = scene.getObjectByProperty('uuid', d.uuid);
      if (!root) continue;
      root.updateWorldMatrix(true, true);
      const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
      let has = false;
      root.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry;
        if (!g || !g.attributes.position) return;
        if (!g.boundingBox) g.computeBoundingBox();
        has = true;
        // local corners → world (8 corners is enough)
        const bb = g.boundingBox;
        for (const cx of [bb.min.x, bb.max.x]) for (const cy of [bb.min.y, bb.max.y]) for (const cz of [bb.min.z, bb.max.z]) {
          const v = new V3(cx, cy, cz).applyMatrix4(o.matrixWorld);
          min[0] = Math.min(min[0], v.x); min[1] = Math.min(min[1], v.y); min[2] = Math.min(min[2], v.z);
          max[0] = Math.max(max[0], v.x); max[1] = Math.max(max[1], v.y); max[2] = Math.max(max[2], v.z);
        }
      });
      if (has) boxes.push({ name: d.metadata?.name ?? d.assetType, min, max });
    }
    // find meshes whose world position is NOT inside any def box (loose strays)
    const strays = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      o.updateWorldMatrix(true, false);
      const wp = new V3(); o.getWorldPosition(wp);
      if (wp.x < -30 || wp.x > -2 || wp.z < -6 || wp.z > 18) return; // stable region only
      const inAny = boxes.some((b) => wp.x >= b.min[0] - 0.05 && wp.x <= b.max[0] + 0.05 && wp.y >= b.min[1] - 0.05 && wp.y <= b.max[1] + 0.05 && wp.z >= b.min[2] - 0.05 && wp.z <= b.max[2] + 0.05);
      if (!inAny) strays.push({ name: o.name, world: [+wp.x.toFixed(2), +wp.y.toFixed(2), +wp.z.toFixed(2)] });
    });
    return strays;
  });
  console.log('=== MESHES OUTSIDE EVERY DEF AABB (stable region) ===');
  console.log(JSON.stringify(strays, null, 1));

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
