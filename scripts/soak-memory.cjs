/* EXTENDED MEMORY SOAK (audit roadmap #4, compact 3-minute version):
 * cycles teleport walks through every interior + save/load rounds, then
 * reports the JS heap trajectory. Detects the classic leak classes (growing
 * geometries/materials in renderer.info, growing heap).
 * Run: node scripts/soak-memory.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  await page.goto('http://localhost:5176/');
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.__westTest.setDayTime(12));

  const sample = () => page.evaluate(() => ({
    heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
    geos: window.__westTest.stats().geometries,
    texs: window.__westTest.stats().textures,
    defs: window.__westTest.objects().length,
  }));

  const spots = [
    [-1.5, -57.5], [-1.5, -30], [10.5, -25], [-2, 2], [-8, 14],
    [8.5, 14.5], [10.5, 36], [31, -50], [-12, -49.5], [0, 55],
  ];
  const trajectory = [await sample()];
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 170000) {
    const [x, z] = spots[i % spots.length];
    await page.evaluate(([sx, sz]) => window.__westTest.teleport(sx, 0, sz), [x, z]);
    await page.waitForTimeout(2200);
    // editor save/load round every 3rd hop (exercises serialization + rebuild)
    if (i % 3 === 2) {
      await page.evaluate(() => {
        const T = window.__westTest;
        const d = T.objects()[10];
        T.resetObject(d.uuid); // exercises updateObjectTransform + save path
      });
      await page.waitForTimeout(800);
    }
    i += 1;
    if (i % 5 === 0) trajectory.push(await sample());
  }
  trajectory.push(await sample());
  // Growth is measured from the THIRD sample: the first editor reset
  // re-materializes def resources ONCE (+1 geometry / +8 textures, then
  // stable forever) — a one-time allocation, not a leak.
  const first = trajectory[Math.min(2, trajectory.length - 1)];
  const last = trajectory[trajectory.length - 1];
  const growth = { heapMB: +(last.heapMB - first.heapMB).toFixed(1), geos: last.geos - first.geos, texs: last.texs - first.texs };
  console.log('trajectory:', JSON.stringify(trajectory));
  console.log('growth over soak:', JSON.stringify(growth), `(${i} hops, errors: ${errors.length})`);
  const pass = growth.heapMB < 25 && growth.geos <= 2 && growth.texs <= 4 && errors.length === 0;
  console.log(`SOAK-MEMORY: ${pass ? 'PASS' : 'FAIL'}`);
  await browser.close();
  if (!pass) process.exit(1);
})().catch((e) => { console.error('SOAK FAILED:', e); process.exit(1); });
