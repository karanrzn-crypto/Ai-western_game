const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));
  await page.goto('http://localhost:5176/');
  await page.waitForTimeout(3500);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const probe = () => ev(() => {
    const all = window.__westTest.boundsNear(0, 12); // near respawn — includes boot bounds
    void all;
    // brute force: walk every bound via a wide boundsNear net is impossible;
    // instead check the player's collision query directly against the worker face
    return {
      total: window.__westTest.boundsNear(0, 12).length,
      worker: window.__westTest.boundsNear(-6.5, 19.5).map((b) => b.uuid.slice(-2)),
      objCount: window.__westTest.objects().length,
    };
  });
  console.log('boot:', JSON.stringify(await probe()));
  for (const b of [
    { id: '01', type: 'house-abandoned', x: -17.5 },
    { id: '02', type: 'butcher-stall', x: -11.5 },
    { id: '03', type: 'house-worker', x: -6.5 },
  ]) {
    const r = await ev((bld) => {
      const c = window.__westTest.townExteriorColliders[bld.type];
      return window.__westTest.spawnTestDef({
        uuid: `70000000-0000-4000-8000-0000000000${bld.id}`,
        assetType: bld.type,
        position: { x: bld.x, y: 0, z: 20 }, rotationY: 0,
        name: `v ${bld.type}`, metadata: { collider: c },
      });
    }, b);
    console.log(`spawn ${b.type}:`, JSON.stringify(r), '→', JSON.stringify(await probe()));
  }
  await browser.close();
})();
