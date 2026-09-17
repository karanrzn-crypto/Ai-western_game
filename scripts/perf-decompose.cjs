/* Decompose the frame: sky view (≈0 draws) vs town view vs stable interior.
 * The DELTA sky→town ≈ geometry rendering cost; sky-view time ≈ per-frame
 * JS + fixed pipeline overhead. Also toggles the shadow map on/off in the
 * town view to price the depth pass.
 * Run: node scripts/perf-decompose.cjs [port]
 */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`http://localhost:${process.argv[2] || '5173'}/`);
  await page.waitForTimeout(4500);
  const r = await page.evaluate(async () => {
    const measure = async (ms) => new Promise((res) => {
      const t0 = performance.now(); const ts = [];
      const tick = () => { ts.push(performance.now()); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ n: ts.length, med: +d[Math.floor(d.length / 2)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1) }); } };
      requestAnimationFrame(tick);
    });
    const look = window.__westDebug ? window.__westDebug() : null;
    const results = {};
    // 1) SKY: teleport high above town, pitch down? No — look UP so nothing is in frustum.
    window.__westTest.teleport(0, 40, 0);
    results.sky = await measure(1500);
    // 2) TOWN CENTER
    window.__westTest.teleport(-4, 0.15, -8);
    await new Promise((r2) => setTimeout(r2, 800));
    results.town = await measure(2000);
    results.townStats = window.__westTest.stats();
    // 3) STABLE INTERIOR
    window.__westTest.teleport(-16, 0.15, 2);
    await new Promise((r2) => setTimeout(r2, 800));
    results.stable = await measure(2000);
    results.stableStats = window.__westTest.stats();
    // 4) SALOON INTERIOR
    window.__westTest.teleport(-12, 0.15, -12);
    await new Promise((r2) => setTimeout(r2, 800));
    results.saloon = await measure(2000);
    results.saloonStats = window.__westTest.stats();
    return results;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
