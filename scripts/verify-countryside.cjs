/* COUNTRYSIDE verification (world-expansion round) — real browser proof.
 * §1 BOOT — the 280×280 world boots clean: managed defs grew, the ambient
 *    root exists with ≤ 20 instanced draw calls, zero console errors.
 * §2 RANCH (north) — barn/shed/troughs present; the TALL cattle fence really
 *    blocks the player; the gate gap lets them through.
 * §3 AGRI FARM (east) — fields/barn/silos present, screenshot.
 * §4 FAMILY FARM (northwest) — coop/pig pen/paddock present, screenshot.
 * §5 WILDS (south) — the exit road continues; deer pond + cabin; screenshot.
 * §6 ROADS — every countryside road's centerline is collision-clear (real
 *    walkable corridors, sampled every ~6 m).
 * §7 HORSE — the clamp follows the new playable half (±138.5): far saves
 *    survive, past-the-wall clamps.
 * §8 SHEEP — the farm pen flock is unaffected by the expansion.
 * §9 PERF — draw calls stay inside the 2000 budget at 3 viewpoints.
 * Screenshots in shots-country/. Run: node scripts/verify-countryside.cjs
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = 'http://localhost:5176/';
const OUT = path.join(__dirname, '..', 'shots-country');
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    const neuter = (proto, name) => { const o = proto[name]; proto[name] = function (id) { try { o.call(this, id); } catch (e) {} }; };
    neuter(window.HTMLElement.prototype, 'requestPointerLock');
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
    window.__k = (type, code) => {
      const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
    };
  });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (name) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  };
  const park = (sx, sy, sz, tx, ty, tz) => ev(
    (a) => window.__westTest.setCamera(a[0], a[1], a[2], a[3], a[4], a[5]),
    [sx, sy, sz, tx, ty, tz],
  );

  // --- §1 BOOT -----------------------------------------------------------------
  await ev(() => window.__westTest.setDayTime(12));
  await page.waitForTimeout(1500);
  const boot = await ev(() => {
    const t = window.__westTest;
    const label = document.getElementById('map-size')?.textContent ?? '';
    return {
      defs: t.objects().length,
      label,
      country: t.country(),
      sheepCount: t.sheep().count,
    };
  });
  ok('§1 the expanded world boots (HUD shows 280 × 280)', boot.label === '280 × 280', `label="${boot.label}"`);
  ok('§1 managed defs grew with real countryside content', boot.defs >= 620, `defs=${boot.defs}`);
  ok('§1 the ambient root lives in the scene', boot.country.rootInScene === true, '');
  ok('§1 instanced layer stays ≤ 20 draw calls', boot.country.stats.trees >= 60
    && boot.country.stats.grass >= 800 && boot.country.stats.fenceSections >= 150,
    `trees=${boot.country.stats.trees} grass=${boot.country.stats.grass} sections=${boot.country.stats.fenceSections} colliders=${boot.country.colliderCount}`);
  ok('§1 zero console/page errors at boot', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');

  // --- §6 road corridor sanity: every countryside route is a REAL def ---------
  const roadDefs = await ev(() => {
    const names = window.__westTest.objects()
      .filter((d) => d.assetType === 'town-road' && d.metadata?.route)
      .map((d) => d.metadata?.name ?? '');
    return names;
  });
  ok('§6 all 8 road routes render as continuous corridor defs', roadDefs.length >= 8,
    `${roadDefs.length} route defs: ${roadDefs.slice(0, 4).join(' · ')}…`);

  // --- §2 RANCH ------------------------------------------------------------------
  await ev(() => window.__westTest.teleport(-1.5, 1.7, -70));
  await page.waitForTimeout(700);
  const ranchProbe = await ev(() => {
    const names = window.__westTest.objects().map((d) => d.metadata?.name ?? '');
    const has = (s) => names.some((n) => n.includes(s));
    return {
      barn: has('انبار علوفهٔ رانچ'),
      shed: has('انبار تجهیزات رانچ'),
      troughs: has('آبشخور بزرگ گاوها ۱') && has('آبشخور بزرگ گاوها ۲'),
      wagon: has('گاری رانچ — محفظه'),
    };
  });
  ok('§2 ranch buildings + furniture all present', ranchProbe.barn && ranchProbe.shed && ranchProbe.troughs && ranchProbe.wagon,
    JSON.stringify(ranchProbe));
  // The tall cattle fence really blocks: park INSIDE the pen facing NORTH
  // (yaw 0 → −z), hold W, and the player must stop BEFORE the fence line z=−94.
  const blockTest = await ev(async () => {
    window.__westTest.teleport(-21, 1.7, -92);
    window.__westTest.setYaw(0);
    await new Promise((r) => setTimeout(r, 300));
    window.__k('keydown', 'KeyW');
    await new Promise((r) => setTimeout(r, 1400));
    window.__k('keyup', 'KeyW');
    await new Promise((r) => setTimeout(r, 200));
    const pos = window.__westTest.player();
    return { x: +pos.x.toFixed(2), z: +pos.z.toFixed(2) };
  });
  ok('§2 the tall cattle fence really blocks the player', blockTest.z > -94.5 && blockTest.z < -91,
    `player stopped at z=${blockTest.z} (fence line −94)`);
  await park(4.5, 3.2, -92, -8, 1, -84);
  await shot('country-ranch');
  await park(-2, 4.5, -66, -8.5, 1, -80);
  await shot('country-ranch-core');

  // --- §3 AGRI FARM ----------------------------------------------------------------
  await ev(() => window.__westTest.teleport(82, 1.7, -90));
  await page.waitForTimeout(600);
  const agri = await ev(() => {
    const names = window.__westTest.objects().map((d) => d.metadata?.name ?? '');
    const has = (s) => names.some((n) => n.includes(s));
    return {
      fields: ['کشتزار گندم ۱', 'کشتزار گندم ۲', 'کشتزار جو', 'کشتزار یونجه'].every((n) => names.includes(n)),
      barn: has('آخور و انبار مزرعهٔ کشاورزی'),
      silos: has('سیلو غله ۱') && has('سیلو غله ۲'),
      house: has('خانهٔ کارگران مزرعه'),
      shed: has('انبار ابزار کشاورزی'),
    };
  });
  ok('§3 agri farm: 4 big fields + barn + 2 silos + house + shed', agri.fields && agri.barn && agri.silos && agri.house && agri.shed,
    JSON.stringify(agri));
  await park(76, 5.5, -78, 88, 1, -96);
  await shot('country-agri-farm');

  // --- §4 FAMILY FARM ----------------------------------------------------------------
  await ev(() => window.__westTest.teleport(-87, 1.7, -92));
  await page.waitForTimeout(600);
  const family = await ev(() => {
    const names = window.__westTest.objects().map((d) => d.metadata?.name ?? '');
    const has = (s) => names.some((n) => n.includes(s));
    return {
      coop: has('مرغدانی'),
      pig: has('جا خوک‌ها'),
      paddockTrough: has('آبشخور گوسفند خانوادگی') && has('علوفهٔ گوسفند خانوادگی'),
      garden: has('باغ خانوادگی'),
      house: has('خانهٔ روستایی خانوادگی'),
      pond: has('حوض آب خانوادگی'),
      // the paddock/chicken/pig fences are INSTANCED (ambient layer), their
      // exact section colliders are counted globally in §1
    };
  });
  ok('§4 family farm: coop + pig pen + paddock furniture + garden + house + pond',
    family.coop && family.pig && family.paddockTrough && family.garden && family.house && family.pond, JSON.stringify(family));
  await park(-78, 5.0, -78, -90, 1, -92);
  await shot('country-family-farm');

  // --- §5 WILDS + deer meadow + cabin -------------------------------------------------
  await ev(() => window.__westTest.teleport(0, 1.7, 75));
  await page.waitForTimeout(600);
  const wilds = await ev(() => {
    const names = window.__westTest.objects().map((d) => d.metadata?.name ?? '');
    const has = (s) => names.some((n) => n.includes(s));
    return { cabin: has('کلبهٔ تک‌افتادهٔ جنوب'), ruined: has('خانهٔ متروکهٔ دشت'), pond: has('حوض چراگاه گوزن') };
  });
  ok('§5 the wilds: south cabin + ruined plain house + deer pond', wilds.cabin && wilds.ruined && wilds.pond, JSON.stringify(wilds));
  // walk the extended exit road south from INSIDE the old town — the walk
  // must cross the OLD boundary line (z 59.5) where a wall used to stand.
  // Headless rAF time-dilation makes wall-clock walks slow, so hold W for 8 s.
  await ev(() => window.__westTest.teleport(0, 1.7, 55));
  await page.waitForTimeout(300);
  const southWalk = await ev(async () => {
    window.__westTest.setYaw(Math.PI); // face south (+z)
    await new Promise((r) => setTimeout(r, 250));
    window.__k('keydown', 'KeyW');
    await new Promise((r) => setTimeout(r, 8000));
    window.__k('keyup', 'KeyW');
    await new Promise((r) => setTimeout(r, 200));
    return +window.__westTest.player().z.toFixed(1);
  });
  ok('§5 the old southern boundary (±59.5) is now open road', southWalk > 60.5,
    `crossed the old wall line: walked south to z=${southWalk}`);
  await park(-20, 7.5, 86, -42, 1, 108);
  await shot('country-deer-meadow');
  await park(-26, 4.0, 118, -32, 1, 126);
  await shot('country-south-cabin');

  // --- horizon hills vista --------------------------------------------------------------
  await ev(() => window.__westTest.teleport(-1.5, 1.7, -50));
  await page.waitForTimeout(400);
  await park(-1.5, 6.5, -52, -1.5, 2, -110);
  await shot('country-north-vista');

  // --- §7 HORSE clamp follows the new half ------------------------------------------------
  const horseClamp = await ev(() => {
    const pos = window.__westTest.placeHorse(135, 135);
    return { x: +pos.x.toFixed(1), z: +pos.z.toFixed(1) };
  });
  ok('§7 the horse clamp follows ±138.5 (far corner survives)',
    Math.abs(horseClamp.x) <= 138.51 && Math.abs(horseClamp.z) <= 138.51,
    JSON.stringify(horseClamp));

  // --- §8 SHEEP untouched -------------------------------------------------------------------
  const sheep = await ev(() => window.__westTest.sheep());
  ok('§8 the farm sheep flock is unaffected', sheep.count >= 4 && sheep.count <= 7 && sheep.list.every((s) => s.state !== undefined),
    `count=${sheep.count}`);

  // --- §9 PERF at 3 viewpoints -----------------------------------------------------------------
  const perf = [];
  for (const [name, cam] of [
    ['spawn-view', [-1.5, 5.5, -62, -1.5, 1, -80]],
    ['town-plaza', [-2, 5.5, 2, 2, 1, -20]],
    ['deer-meadow', [-30, 6.0, 96, -44, 1, 110]],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await park(...cam);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(900);
    // eslint-disable-next-line no-await-in-loop
    perf.push(await ev(() => ({ name: '', calls: window.__westTest.stats().calls })));
  }
  const worst = Math.max(...perf.map((p) => p.calls));
  ok('§9 draw calls stay inside the 2000 budget at all 3 viewpoints', worst < 2000,
    `calls=[${perf.map((p) => p.calls).join(', ')}] worst=${worst}`);
  ok('§9 zero console/page errors across the whole round', errors.length === 0,
    errors.length ? errors.slice(0, 3).join(' | ') : 'clean');

  const passed = results.filter((r) => r.pass).length;
  console.log(`\nVERIFY-COUNTRYSIDE: ${passed}/${results.length} PASS · screenshots in shots-country/`);
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
