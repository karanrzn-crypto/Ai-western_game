/* PERF BASELINE PROBE (§9 — measure before changing anything).
 * Boots the game FRESH (localStorage cleared), then:
 *   1) scene census: defs / meshes / visible meshes / unique materials /
 *      geometries / REAL lights / shadow casters
 *   2) renderer.info: draw calls + triangles (last rendered frame)
 *   3) frame-time EMA at 3 camera spots (spawn view / stable interior /
 *      town center) — headless SwiftShader is fill-bound, so ABSOLUTE fps
 *      differs from user hardware; RELATIVE before/after comparisons are
 *      what this probe is for.
 *   4) light-tax experiment: all PointLights off vs on (same spot) —
 *      quantifies the per-fragment light multiplier.
 * Run: node scripts/probe-perf.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const URL = 'http://localhost:5176/';

async function measure(page, ms) {
  return page.evaluate((dur) => new Promise((resolve) => {
    const frames = [];
    let last = performance.now();
    let raf = 0;
    const loop = (t) => {
      frames.push(t - last);
      last = t;
      if (t - start < dur) raf = requestAnimationFrame(loop);
      else {
        frames.shift(); // drop the first bogus delta
        const sorted = [...frames].sort((a, b) => a - b);
        const mean = frames.reduce((s, v) => s + v, 0) / frames.length;
        resolve({
          frames: frames.length,
          meanMs: +mean.toFixed(2),
          medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
          p90Ms: +sorted[Math.floor(sorted.length * 0.9)].toFixed(2),
        });
      }
    };
    const start = performance.now();
    raf = requestAnimationFrame(loop);
    void raf;
  }), ms);
}

(async () => {
  const browser = await chromium.launch({ args: ['--enable-gpu', '--use-gl=angle', '--use-angle=swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));

  // FRESH boot: no user save.
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(4000);

  /* ---------------- 1) SCENE CENSUS ---------------- */
  const census = await page.evaluate(() => {
    const scene = window.__westTest.scene();
    const defs = window.__westTest.objects();
    const meshes = { total: 0, visible: 0, shadowCasters: 0 };
    const materials = new Set();
    const geometries = new Set();
    const lights = [];
    let objects = 0;
    scene.traverse((o) => {
      objects += 1;
      if (o.isMesh) {
        meshes.total += 1;
        if (o.visible) meshes.visible += 1;
        if (o.castShadow) meshes.shadowCasters += 1;
        if (o.geometry) geometries.add(o.geometry);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m) materials.add(m);
      }
      if (o.isLight) {
        lights.push({ kind: o.type, intensity: +o.intensity.toFixed(2), castShadow: Boolean(o.castShadow), visible: o.visible, name: o.name || '(anon)' });
      }
    });
    const colliderDefs = defs.filter((d) => d.metadata && d.metadata.collider).length;
    return {
      defs: defs.length,
      sceneObjects: objects,
      meshes,
      uniqueMaterials: materials.size,
      uniqueGeometries: geometries.size,
      lights,
      realPointLights: lights.filter((l) => l.kind === 'PointLight' && l.visible).length,
      shadowLights: lights.filter((l) => l.castShadow).length,
      colliderDefs,
    };
  });

  /* ---------------- 2) renderer.info snapshot ---------------- */
  const stats = await page.evaluate(() => window.__westTest.stats());

  /* ---------------- 3) frame-time at spots ---------------- */
  const spots = [
    { name: 'spawn-view (default cam)', pos: null },
    { name: 'stable-interior', pos: [-16, 0, 6], yaw: Math.PI / 2 },
    { name: 'town-center', pos: [-2, 0, 2], yaw: Math.PI },
  ];
  const spotResults = [];
  for (const s of spots) {
    if (s.pos) {
      await page.evaluate(([x, y, z, yaw]) => {
        window.__westTest.teleport(x, y, z);
        window.__westTest.setYaw(yaw);
      }, [s.pos[0], s.pos[1], s.pos[2], s.yaw]);
      await page.waitForTimeout(700); // camera settle
    }
    const m = await measure(page, 4000);
    const st = await page.evaluate(() => window.__westTest.stats());
    spotResults.push({ name: s.name, ...m, drawCalls: st.calls, tris: st.tris });
  }

  /* ---------------- 4) LIGHT TAX EXPERIMENT ---------------- */
  const lightTax = {};
  const stableSpot = spots[1];
  await page.evaluate(([x, y, z, yaw]) => {
    window.__westTest.teleport(x, y, z);
    window.__westTest.setYaw(yaw);
  }, [stableSpot.pos[0], stableSpot.pos[1], stableSpot.pos[2], stableSpot.yaw]);
  await page.waitForTimeout(700);
  lightTax.lightsOn = await measure(page, 3000);
  await page.evaluate(() => {
    const scene = window.__westTest.scene();
    scene.traverse((o) => { if (o.isPointLight) o.visible = false; });
  });
  await page.waitForTimeout(300);
  lightTax.lightsOff = await measure(page, 3000);
  await page.evaluate(() => {
    const scene = window.__westTest.scene();
    scene.traverse((o) => { if (o.isPointLight) o.visible = true; });
  });

  console.log(JSON.stringify({ census, stats, spotResults, lightTax, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
