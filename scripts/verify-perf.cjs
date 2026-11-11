/* CANONICAL PERFORMANCE HARNESS (audit roadmap #1 — the perf regression gate).
 * Boots the game FRESH (localStorage cleared), then measures at real camera
 * spots of the CURRENT town layout (TownLayout.ts sites, verified 2026-11):
 *   1) scene census — defs / meshes / visible / shadow casters / unique
 *      materials+geometries / real point lights
 *   2) renderer.info per spot — draw calls + triangles of the last frame
 *   3) frame-time mean/median/p90 per spot (4 s window, rAF wall clock)
 *   4) light tax — all PointLights off vs on (stable interior)
 *   5) shadow depth-pass tax — forced every-frame shadow refresh vs the
 *      scheduled default (spawn view)
 *   6) heap — usedJSHeapSize at boot and after a teleport soak
 * Headless SwiftShader is fill-bound: ABSOLUTE fps is NOT user hardware —
 * RELATIVE before/after comparisons of calls/tris/frame-ms are the signal.
 * Budgets (loose regression guard): draw calls < 2000 per spot, zero page
 * errors, heap < 300 MB. Override with PERF_BUDGET_CALLS env.
 * Run: node scripts/verify-perf.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const URL = 'http://localhost:5176/';
const BUDGET_CALLS = Number(process.env.PERF_BUDGET_CALLS || 2000);
const results = [];
const ok = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};

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
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // FRESH boot: no user save, day pinned to noon for stable lighting.
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(4500);
  await page.evaluate(() => window.__westTest.setDayTime(12));
  ok('boot', true, 'fresh boot complete');

  /* ---------------- 1) SCENE CENSUS ---------------- */
  const census = await page.evaluate(() => {
    const scene = window.__westTest.scene();
    const defs = window.__westTest.objects();
    const meshes = { total: 0, visible: 0, shadowCasters: 0 };
    const materials = new Set();
    const geometries = new Set();
    let lights = 0, pointLights = 0;
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
      if (o.isLight) lights += 1;
      if (o.isPointLight) pointLights += 1;
    });
    return {
      defs: defs.length,
      sceneObjects: objects,
      meshes,
      uniqueMaterials: materials.size,
      uniqueGeometries: geometries.size,
      lights,
      pointLights,
      heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
    };
  });
  console.log('census:', JSON.stringify(census));

  /* ---------------- 2+3) PER-SPOT stats + frame time ---------------- */
  // Spots are CURRENT-town coordinates (TownLayout sites):
  //   spawn-view        — respawn at the farm road's north end
  //   main-street       — street north end, facing south (gunshop → plaza)
  //   plaza-far-side    — plaza center, facing north (bank/sheriff/family)
  //   stable-interior   — inside the stable block facing the wagon gate
  //   bank-interior     — inside the bank hall facing the counter
  const spots = [
    { name: 'spawn-view', pos: null },
    { name: 'main-street', pos: [-1.5, 0, -30], yaw: Math.PI },
    { name: 'plaza-far-side', pos: [-2, 0, 2], yaw: 0 },
    { name: 'stable-interior', pos: [10.5, 0, 36], yaw: Math.PI },
    { name: 'bank-interior', pos: [-8, 0, 14], yaw: Math.PI },
  ];
  const spotResults = [];
  for (const s of spots) {
    if (s.pos) {
      await page.evaluate(([x, y, z, yaw]) => {
        window.__westTest.teleport(x, y, z);
        window.__westTest.setYaw(yaw);
      }, [s.pos[0], s.pos[1], s.pos[2], s.yaw]);
      await page.waitForTimeout(800); // camera settle
    }
    const m = await measure(page, 4000);
    const st = await page.evaluate(() => window.__westTest.stats());
    spotResults.push({ name: s.name, ...m, drawCalls: st.calls, tris: st.tris, programs: st.programs });
    ok(`budget ${s.name}`, st.calls < BUDGET_CALLS, `draw calls ${st.calls} < ${BUDGET_CALLS}`);
  }
  console.log('spots:', JSON.stringify(spotResults, null, 2));

  /* ---------------- 4) LIGHT TAX (stable interior) ---------------- */
  const stableSpot = spots[3];
  await page.evaluate(([x, y, z, yaw]) => {
    window.__westTest.teleport(x, y, z);
    window.__westTest.setYaw(yaw);
  }, [stableSpot.pos[0], stableSpot.pos[1], stableSpot.pos[2], stableSpot.yaw]);
  await page.waitForTimeout(800);
  const lightsOn = await measure(page, 3000);
  await page.evaluate(() => {
    const scene = window.__westTest.scene();
    scene.traverse((o) => { if (o.isPointLight) o.visible = false; });
  });
  await page.waitForTimeout(400);
  const lightsOff = await measure(page, 3000);
  await page.evaluate(() => {
    const scene = window.__westTest.scene();
    scene.traverse((o) => { if (o.isPointLight) o.visible = true; });
  });
  const lightTax = {
    lightsOnMs: lightsOn.meanMs,
    lightsOffMs: lightsOff.meanMs,
    deltaMs: +(lightsOn.meanMs - lightsOff.meanMs).toFixed(2),
  };
  console.log('lightTax:', JSON.stringify(lightTax));

  /* ---------------- 5) SHADOW DEPTH-PASS TAX (spawn view) ---------------- */
  await page.evaluate(() => window.__westTest.teleport(-1.5, 0, -57.5));
  await page.evaluate(() => window.__westTest.setYaw(Math.PI));
  await page.waitForTimeout(800);
  const shadowScheduled = await measure(page, 3000); // default: scheduled refresh
  await page.evaluate(() => {
    // Harness-only: force the shadow depth pass EVERY frame (worst case).
    const r = window.__westTest.renderer();
    r.shadowMap.needsUpdate = true;
    window.__forceShadow = setInterval(() => { r.shadowMap.needsUpdate = true; }, 0);
  });
  await page.waitForTimeout(400);
  const shadowEveryFrame = await measure(page, 3000);
  await page.evaluate(() => { clearInterval(window.__forceShadow); });
  const shadowTax = {
    scheduledMs: shadowScheduled.meanMs,
    everyFrameMs: shadowEveryFrame.meanMs,
    deltaMs: +(shadowEveryFrame.meanMs - shadowScheduled.meanMs).toFixed(2),
  };
  console.log('shadowTax:', JSON.stringify(shadowTax));

  /* ---------------- 6) TELEPORT SOAK + HEAP ---------------- */
  for (let i = 0; i < 6; i += 1) {
    const s = spots[1 + (i % 4)];
    await page.evaluate(([x, y, z, yaw]) => {
      window.__westTest.teleport(x, y, z);
      window.__westTest.setYaw(yaw);
    }, [s.pos[0], s.pos[1], s.pos[2], s.yaw]);
    await page.waitForTimeout(1500);
  }
  const heapAfter = await page.evaluate(() => +(performance.memory.usedJSHeapSize / 1048576).toFixed(1));
  ok('heap soak', heapAfter < 300, `heap ${census.heapMB} MB → ${heapAfter} MB after soak (< 300)`);
  ok('zero page errors', errors.length === 0, errors.length === 0 ? 'no console/page errors' : errors.join(' | '));

  const pass = results.every(Boolean);
  console.log(`\nVERIFY-PERF: ${pass ? 'ALL PASS' : 'FAILURES PRESENT'} (${results.filter(Boolean).length}/${results.length})`);
  console.log(JSON.stringify({ census, spots: spotResults, lightTax, shadowTax, heapAfterMB: heapAfter, errors }, null, 2));
  await browser.close();
  if (!pass) process.exit(1);
})().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
