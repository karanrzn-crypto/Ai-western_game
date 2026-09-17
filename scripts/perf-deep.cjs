/* Deep perf A/B: what dominates the frame? shadows? materials? Measure
 * frame time with renderer.info + a shadow off/on toggle through the
 * __westTest.stats() hook (no direct renderer handle exposed).
 * Run: node scripts/perf-deep.cjs [port]
 */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  await page.goto(`http://localhost:${process.argv[2] || '5173'}/`);
  await page.waitForTimeout(4500);
  await page.evaluate(() => window.__westTest.teleport(-4, 0.15, -8));
  await page.waitForTimeout(2000);
  const r = await page.evaluate(async () => {
    const scene = window.__westTest.scene();
    let tris = 0; const geos = new Set(); const mats = new Set(); let meshCount = 0;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      meshCount += 1;
      const g = o.geometry; if (!g) return;
      const p = g.attributes.position; if (!p) return;
      tris += (g.index ? g.index.count : p.count) / 3;
      geos.add(g.uuid);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m && mats.add(m.uuid));
    });
    const measure = async (ms) => new Promise((res) => {
      const t0 = performance.now(); const ts = [];
      const tick = () => { ts.push(performance.now()); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ n: ts.length, med: +d[Math.floor(d.length / 2)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1) }); } };
      requestAnimationFrame(tick);
    });
    const base = await measure(2500);
    const after = window.__westTest.stats();
    return {
      base, stats: after, meshCount,
      totalTris: Math.round(tris), uniqueGeos: geos.size, uniqueMats: mats.size,
    };
  });
  console.log(JSON.stringify(r, null, 1), 'errors:', errors.length ? errors : 'none');
  await browser.close();
})();
