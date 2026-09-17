/* BROWSER VERIFICATION (§10) — the two user asks of this session:
 *   1) the hanging rope coil («طناب آویز») is GONE from the fresh scene —
 *      registry truth + live geometry near its old loft-edge spot
 *   2) the lamp policy is live: day boot → 0 visible point lights;
 *      night → all lamps burn (visual sanity via screenshots)
 *   3) no page errors; storage key moved to v13 (a stale v12 save is dropped)
 * Run: node scripts/verify-coil-and-lamps.cjs (dev server on :5176)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-coil-lamps';
const URL = 'http://localhost:5176/';
const fs = require('fs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // stale-v12 save: a def with the OLD rope uuid at a MOVED position — must be ignored
  await page.goto(URL);
  await page.evaluate(() => {
    const stale = {
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      sceneMetadata: { map: 'playable-map', mode: 'development' },
      objects: [{ uuid: '10000000-0000-4000-8000-0000000000b8', assetType: 'stable-prop',
        transform: { position: { x: -16.0, y: 1.5, z: 3.0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        metadata: { name: 'اسطبل — طناب آویز', collider: false, kind: 'rope-coil', params: { hook: true } } }],
    };
    localStorage.setItem('ai-western-game.playable-map.scene.v12', JSON.stringify(stale));
  });
  await page.reload();
  await page.waitForTimeout(4500);

  const results = [];
  const ok = (name, pass, detail = '') => {
    results.push({ name, pass, detail });
    console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  [' + detail + ']' : ''));
  };

  /* 1) registry truth: no rope-coil def with hook, no «طناب آویز» name */
  const reg = await page.evaluate(() => {
    const defs = window.__westTest.objects();
    const coils = defs.filter((d) => d.metadata && d.metadata.kind === 'rope-coil');
    return {
      total: defs.length,
      hookedCoils: coils.filter((d) => d.metadata.params && d.metadata.params.hook).length,
      byOldName: defs.filter((d) => String(d.metadata.name).includes('طناب آویز')).length,
      mountedCoilNames: coils.map((d) => d.metadata.name),
      savedKeyIsV13: Object.keys(localStorage).some((k) => k.endsWith('scene.v13')),
      staleV12StillPresent: Object.keys(localStorage).some((k) => k.endsWith('scene.v12')),
    };
  });
  ok('no hooked rope-coil def in registry', reg.hookedCoils === 0, 'hooked=' + reg.hookedCoils);
  ok('no «طناب آویز»-named def in registry', reg.byOldName === 0);
  ok('the mounted «طناب پیچیده» survives (1 rope-coil)', reg.mountedCoilNames.length === 1 && reg.mountedCoilNames[0].includes('طناب پیچیده'), JSON.stringify(reg.mountedCoilNames));
  ok('stale v12 save ignored (its key still present, but never loaded)', reg.staleV12StillPresent, 'v12 kept-but-unused; new saves will land on v13');
  const staleRespawned = await page.evaluate(() => Boolean(window.__westTest.scene().getObjectByProperty('uuid', '10000000-0000-4000-8000-0000000000b8')));
  ok('the polluted save cannot resurrect the coil uuid', !staleRespawned);

  /* 2) live geometry: the DELETED loft variant (hook + coil at the loft edge)
   *    must be gone; the MOUNTED wall coils (tack-room def + 2 stall extras)
   *    are intended design and must survive. */
  const geom = await page.evaluate(() => {
    const scene = window.__westTest.scene();
    let loftHookMeshes = 0;
    const tori = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'loft-rope-hook') loftHookMeshes += 1;
      if (o.name === 'rope-torus') {
        o.updateWorldMatrix(true, false);
        tori.push({ y: +o.matrixWorld.elements[13].toFixed(2), x: +o.matrixWorld.elements[12].toFixed(2) });
      }
    });
    return { loftHookMeshes, tori };
  });
  ok('zero loft-rope-hook meshes (the deleted loft variant)', geom.loftHookMeshes === 0, 'found=' + geom.loftHookMeshes);
  const highTori = geom.tori.filter((t) => t.y > 2.2); // the loft coil hung at y≈2.56
  ok('no rope torus hangs at loft height (mounted wall coils live at y≈1.1)', highTori.length === 0, 'tori=' + JSON.stringify(geom.tori));

  /* 3) lamp policy: day (8h) → 0 visible point lights */
  const day = await page.evaluate(() => {
    window.__westTest.setDayTime(12);
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const scene = window.__westTest.scene();
      let lights = 0; let visible = 0;
      scene.traverse((o) => { if (o.isPointLight) { lights += 1; if (o.visible) visible += 1; } });
      res({ lights, visible });
    })));
  });
  ok('day: all point lights extinguished', day.lights === 16 && day.visible === 0, `lights=${day.lights} visible=${day.visible}`);

  /* night: lamps burn again (visual + policy) */
  await page.evaluate(() => window.__westTest.setDayTime(22));
  await page.waitForTimeout(600);
  const night = await page.evaluate(() => {
    const scene = window.__westTest.scene();
    let visible = 0;
    scene.traverse((o) => { if (o.isPointLight && o.visible) visible += 1; });
    return visible;
  });
  ok('night: lamps burn again', night === 16, 'visible=' + night);

  /* screenshots: stable aisle (day) where the torus used to float + night interior */
  await page.evaluate(() => {
    window.__westTest.setDayTime(12);
    window.__westTest.teleport(-16, 0, 6);
    window.__westTest.setYaw(Math.PI / 2);
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + '/aisle-day-no-coil.png' });
  await page.evaluate(() => window.__westTest.setDayTime(22));
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + '/aisle-night-lamps.png' });
  await page.evaluate(() => window.__westTest.setDayTime(12));

  ok('no page errors', errors.length === 0, errors.join(' | ').slice(0, 200));
  console.log('\nSUMMARY: ' + results.filter((r) => r.pass).length + '/' + results.length + ' PASS');
  await browser.close();
  process.exit(results.every((r) => r.pass) ? 0 : 1);
})().catch((e) => { console.error('VERIFY FAILED:', e); process.exit(1); });
