/* Focused diagnostic: lamp policy + material census.
 * Run: node scripts/probe-lamp-debug.cjs (dev server on :5176) */
const { chromium } = require('playwright');
const URL = 'http://localhost:5176/';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('pageerror: ' + e));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(5000);

  const diag = await page.evaluate(() => {
    const scene = window.__westTest.scene();
    const lights = [];
    scene.traverse((o) => {
      if (o.isPointLight) lights.push({ name: o.name, visible: o.visible, intensity: o.intensity });
    });
    const mats = new Set();
    const matByName = {};
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const arr = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of arr) {
        mats.add(m);
        const key = `${m.type}|${m.color ? m.color.getHexString() : ''}|rough=${m.roughness}|metal=${m.metalness}|map=${m.map ? 'T' : 'f'}|emi=${m.emissive ? m.emissive.getHexString() : ''}`;
        matByName[key] = (matByName[key] || 0) + 1;
      }
    });
    return {
      pointLights: lights.length,
      visiblePointLights: lights.filter((l) => l.visible).length,
      uniqueMaterials: mats.size,
      topMaterialKeys: Object.entries(matByName).sort((a, b) => b[1] - a[1]).slice(0, 12),
    };
  });
  console.log(JSON.stringify(diag, null, 2));
  console.log('LOG LINES:', logs.filter((l) => l.includes('lamp') || l.includes('error')).slice(0, 5));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
