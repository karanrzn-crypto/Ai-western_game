/* PRODUCTION BUNDLE smoke test: loads the BUILT site/ bundle over plain
 * http (no vite), asserts the canvas renders, the HUD is live, the world
 * materialised (managed defs + harness hook present) and collects every
 * console/page error. Exit 1 on any error or missing surface.
 * Usage: node scripts/smoke-site.cjs [url]   (default http://localhost:8199/)
 */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8199/';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(8000);
  const state = await page.evaluate(() => ({
    canvas: Boolean(document.querySelector('#stage canvas')),
    hud: Boolean(document.getElementById('hud')),
    objects: document.getElementById('stat-count')?.textContent ?? '',
    hook: typeof window.__westTest === 'object',
    defCount: typeof window.__westTest === 'object' ? window.__westTest.objects().length : 0,
    playerPos: typeof window.__westTest === 'object'
      ? (() => { const p = window.__westTest.player(); return `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`; })()
      : '',
    stats: typeof window.__westTest === 'object' ? window.__westTest.stats() : null,
  }));
  const pass = state.canvas && state.hud && state.hook && state.defCount > 400 && errors.length === 0;
  console.log(JSON.stringify(state, null, 2));
  console.log(`SMOKE-SITE: ${pass ? 'PASS' : 'FAIL'} | defs=${state.defCount} errors=${errors.length}`);
  if (errors.length) console.log('errors:', errors.slice(0, 10));
  await browser.close();
  if (!pass) process.exit(1);
})().catch((e) => { console.error('SMOKE FAILED:', e); process.exit(1); });
