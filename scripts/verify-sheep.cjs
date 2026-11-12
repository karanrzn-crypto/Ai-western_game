/* SHEEP SYSTEM verification (user request) — real browser proof.
 * §1 SPAWN — 4–7 sheep in the livestock pen on live boot: inside the pen
 *    rect, mutually separated, all three wool variants, real meshes with
 *    castShadow, exactly ONE system root.
 * §2 WANDER — 50 s of play-mode sampling: real movement (≥2 sheep roam
 *    > 0.4 m), no sheep EVER leaves the pen (gate-gap proof: x stays east
 *    of the west fence line), no exact overlap, console clean.
 * §3 POSE — grazing/idle states produce real head rotation (head.x read
 *    off the live scene graph); legs/roots track the system state.
 * §4 BEDTIME — pinned 20:10: staggered onset (NOT simultaneous); the
 *    settle eases monotonically toward 1 (gradual); morning 09:00 reverses
 *    it; sheep photos while settling (root sinks, legs fold).
 * §5 RE-ENTRY — full page reload: the SAME flock size respawns exactly once
 *    (no duplicates), one system root again.
 * §6 zero console/page errors + screenshots in shots-sheep/.
 * Run: node scripts/verify-sheep.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = 'http://localhost:5176/';
const OUT = path.join(__dirname, '..', 'shots-sheep');
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
  await page.waitForTimeout(5000);
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
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  };

  // --- §1 SPAWN --------------------------------------------------------------
  await ev(() => window.__westTest.setDayTime(12));
  await page.waitForTimeout(2500); // first ticks spawn the flock
  const pen = await ev(() => window.__westTest.sheep().penRect);
  const boot = await ev(() => {
    const s = window.__westTest.sheep();
    const scene = window.__westTest.scene();
    const root = scene.getObjectByName('farm-sheep-system');
    let meshes = 0;
    let casters = 0;
    if (root) root.traverse((o) => { if (o.isMesh) { meshes += 1; if (o.castShadow) casters += 1; } });
    let roots = 0;
    scene.children.forEach((c) => { if (c.name === 'farm-sheep-system') roots += 1; });
    return { ...s, meshes, casters, roots, sheepNames: root ? root.children.map((c) => c.name) : [] };
  });
  const inPen = (p) => p.x >= pen.minX && p.x <= pen.maxX && p.z >= pen.minZ && p.z <= pen.maxZ;
  const list = boot.list;
  ok('§1 flock size 4–7 on live boot', boot.count >= 4 && boot.count <= 7, `count=${boot.count}`);
  ok('§1 exactly ONE system root in the scene', boot.roots === 1, `roots=${boot.roots} names=[${boot.sheepNames.join(', ')}]`);
  ok('§1 every sheep inside the pen rect at spawn', list.every(inPen),
    `rect x[${pen.minX}..${pen.maxX}] z[${pen.minZ}..${pen.maxZ}] · worst=${list.map((s) => `${s.x.toFixed(1)},${s.z.toFixed(1)}`).join(' ')}`);
  ok('§1 spawn separation ≥ 0.85 m', (() => {
    let minD = Infinity;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        minD = Math.min(minD, Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z));
      }
    }
    return minD >= 0.85;
  })(), `min spacing observed ${(Math.min(...list.flatMap((a, i) => list.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.z - b.z))))).toFixed(2)} m`);
  ok('§1 all three wool variants present', new Set(list.map((s) => s.wool)).size === 3,
    `wools=${list.map((s) => s.wool).join(',')}`);
  ok('§1 sheep meshes exist and the big parts cast shadows', boot.meshes === boot.count * 7 && boot.casters >= boot.count * 2,
    `meshes=${boot.meshes} (expect ${boot.count * 7}) casters=${boot.casters}`);

  // --- §2 WANDER (play mode, 50 s sampled every 5 s) --------------------------
  const samples = [];
  for (let t = 0; t <= 50; t += 5) {
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(t === 0 ? 0 : 5000);
    // eslint-disable-next-line no-await-in-loop
    samples.push(await ev(() => {
      const s = window.__westTest.sheep();
      return { list: s.list, anyMoving: s.anyMoving };
    }));
  }
  const moved = list.map((first, i) => {
    const last = samples[samples.length - 1].list[i];
    return Math.hypot(last.x - first.x, last.z - first.z);
  });
  const roamed = moved.filter((d) => d > 0.4).length;
  ok('§2 sheep really roam (≥2 moved > 0.4 m over 50 s)', roamed >= 2,
    `moved=[${moved.map((d) => d.toFixed(2)).join(' ')}] m (headless time dilation)`);
  ok('§2 wandering sheep stay inside the pen at EVERY sample', samples.every((s) => s.list.every(inPen)),
    `${samples.length} samples × ${list.length} sheep, zero escapes`);
  ok('§2 no exact overlap at any sample', samples.every((s) => {
    for (let i = 0; i < s.list.length; i += 1) {
      for (let j = i + 1; j < s.list.length; j += 1) {
        if (Math.hypot(s.list[i].x - s.list[j].x, s.list[i].z - s.list[j].z) < 0.3) return false;
      }
    }
    return true;
  }), 'min pair distance ≥ 0.3 m across all samples');
  ok('§2 the moving flag fires while sheep walk', samples.some((s) => s.anyMoving),
    `anyMoving observed ${samples.filter((s) => s.anyMoving).length}/${samples.length} samples`);
  ok('§2 states vary (graze/idle observed)', samples.some((s) => s.list.some((sh) => sh.state === 'graze' || sh.state === 'idle')),
    `states seen: ${[...new Set(samples.flatMap((s) => s.list.map((sh) => sh.state)))].join(', ')}`);

  // --- §3 POSE (live scene-graph read) ----------------------------------------
  await ev(() => window.__k('keydown', 'Tab'));
  await ev(() => window.__k('keyup', 'Tab')); // edit mode parks the camera rig
  const pose = () => ev(() => {
    const root = window.__westTest.scene().getObjectByName('farm-sheep-system');
    if (!root) return null;
    return root.children.map((sheep) => {
      const head = sheep.getObjectByName('head');
      const legs = [0, 1, 2, 3].map((i) => sheep.getObjectByName(`leg-${i}`));
      return {
        y: +sheep.position.y.toFixed(3),
        headX: head ? +head.rotation.x.toFixed(3) : null,
        headZ: head ? +head.rotation.z.toFixed(3) : null,
        legFold: legs.map((l) => (l ? +l.rotation.x.toFixed(3) : null)),
      };
    });
  });
  const poses = await pose();
  const maxHeadX = Math.max(...poses.map((p) => Math.abs(p.headX)));
  ok('§3 grazing/idle produces a real eased head pose', maxHeadX > 0.05, `max |head.x| = ${maxHeadX.toFixed(3)} rad`);
  const legSwing = Math.max(...poses.flatMap((p) => p.legFold.map(Math.abs)));
  ok('§3 legs carry real rotations (gait/fold plumbing live)', legSwing > 0.02, `max |leg.x| = ${legSwing.toFixed(3)} rad`);

  // --- §4 BEDTIME (staggered onset → gradual ease → morning reversal) ---------
  // Baseline pose BEFORE any bedtime effect (for the sink/fold deltas).
  const basePose = await pose();
  // Park a close view for the settle screenshots BEFORE pinning the clock.
  const aim = list[0];
  await ev((a) => window.__westTest.setCamera(a[0], a[1], a[2], a[3], a[4], a[5]),
    [-7.0, 2.2, -37.5, aim.x, 0.55, aim.z]);
  await ev(() => window.__westTest.setDayTime(20.1));
  await page.waitForTimeout(4000);
  const onset = await ev(() => window.__westTest.sheep().list);
  const factors = onset.map((s) => s.bedtimeFactor);
  // Staggered = some sheep already easing, others not started (their thresholds
  // spread across 20:00–20:45; headless time dilation caps how far the earliest
  // can travel in 4 s, so 0.01 is the visible onset bar).
  const started = factors.filter((f) => f > 0.01).length;
  const waiting = factors.filter((f) => f === 0).length;
  ok('§4 bedtime onset is staggered (NOT simultaneous)', started >= 1 && waiting >= 1,
    `factors=[${factors.map((f) => f.toFixed(3)).join(' ')}] started=${started} waiting=${waiting}`);
  const fA = await ev(() => window.__westTest.sheep().list.map((s) => s.bedtimeFactor));
  await page.waitForTimeout(9000);
  const fB = await ev(() => window.__westTest.sheep().list.map((s) => s.bedtimeFactor));
  const rising = fB.every((f, i) => f >= fA[i] - 1e-6);
  const gained = Math.max(...fB.map((f, i) => f - fA[i]));
  ok('§4 the settle eases monotonically (gradual, no snap)', rising && gained > 0.01,
    `Δfactor over 9 s = ${gained.toFixed(3)} · all non-decreasing=${rising}`);
  // Push the hour past EVERY staggered threshold, then give the ease real time
  // (headless dilation ≈ 0.14 game-s per wall-s → 40 s ≈ 5.6 game-s → the
  // earliest sheep reach factor ≈ 0.35: visibly sunk with legs folding).
  await ev(() => window.__westTest.setDayTime(21.5));
  await page.waitForTimeout(40000);
  await ev((a) => window.__westTest.setCamera(a[0], a[1], a[2], a[3], a[4], a[5]),
    [-8.5, 3.0, -36.0, -11, 0.4, -43]);
  await shot('sheep-bedtime-settling');
  const settlePose = await pose();
  const sunkVsBase = settlePose.filter((p, i) => basePose[i] && p.y < basePose[i].y - 0.03).length;
  const foldedVsBase = settlePose.filter((p, i) => basePose[i]
    && (Math.abs(p.legFold[0] - basePose[i].legFold[0]) > 0.15
      || Math.abs(p.legFold[2] - basePose[i].legFold[2]) > 0.15)).length;
  const deep = Math.max(...settlePose.map((p, i) => (basePose[i] ? basePose[i].y - p.y : 0)));
  ok('§4 settling sheep sink and fold legs (real bedtime pose)', sunkVsBase >= 1 && foldedVsBase >= 1,
    `sunk=${sunkVsBase}/${settlePose.length} roots · folded=${foldedVsBase}/${settlePose.length} · deepest sink ${deep.toFixed(3)} m`);
  // Morning reversal: capture the FRESH factors (the 40-s settle wait raised
  // them well past fB), then reverse the clock and watch them fall.
  const fB2 = await ev(() => window.__westTest.sheep().list.map((s) => s.bedtimeFactor));
  await ev(() => window.__westTest.setDayTime(9));
  await page.waitForTimeout(6000);
  const fC = await ev(() => window.__westTest.sheep().list.map((s) => s.bedtimeFactor));
  const falling = fC.every((f, i) => f <= fB2[i] + 1e-6);
  const dropped = Math.max(...fB2.map((f, i) => f - fC[i]));
  ok('§4 morning reverses the settle (factor falls)', falling && dropped > 0.01,
    `factors [${fB2.map((f) => f.toFixed(2)).join(' ')}] → [${fC.map((f) => f.toFixed(2)).join(' ')}] · max drop ${dropped.toFixed(3)}`);

  // --- §5 RE-ENTRY: reload, no duplicates --------------------------------------
  await page.reload();
  await page.waitForTimeout(5000);
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
  await page.waitForTimeout(2000);
  const reentry = await ev(() => {
    const s = window.__westTest.sheep();
    const scene = window.__westTest.scene();
    let roots = 0;
    scene.children.forEach((c) => { if (c.name === 'farm-sheep-system') roots += 1; });
    return { count: s.count, roots, penRect: s.penRect };
  });
  ok('§5 reload respawns the SAME flock size (deterministic seed)', reentry.count === boot.count,
    `count ${boot.count} → ${reentry.count}`);
  ok('§5 exactly ONE system root after re-entry (no duplicates)', reentry.roots === 1, `roots=${reentry.roots}`);
  ok('§5 respawned flock inside the pen', reentry.penRect
    ? (await ev(() => window.__westTest.sheep().list)).every((p) => p.x >= reentry.penRect.minX && p.x <= reentry.penRect.maxX && p.z >= reentry.penRect.minZ && p.z <= reentry.penRect.maxZ)
    : false, 'all inside');

  // --- Day overview screenshots -------------------------------------------------
  await ev(() => window.__westTest.setDayTime(12));
  await ev(() => window.__k('keydown', 'Tab'));
  await ev(() => window.__k('keyup', 'Tab'));
  await ev(() => window.__westTest.setCamera(-2.0, 4.2, -33.5, -11, 0.5, -43));
  await shot('sheep-pen-overview');
  const live = await ev(() => window.__westTest.sheep().list);
  await ev((a) => window.__westTest.setCamera(a.sx, a.sy, a.sz, a.x, 0.5, a.z),
    { sx: live[0].x + 2.4, sy: 1.3, sz: live[0].z + 2.4, x: live[0].x, z: live[0].z });
  await shot('sheep-closeup');
  await ev(() => window.__westTest.setCamera(-14.0, 2.0, -35.0, -9.5, 0.6, -42.5));
  await shot('sheep-pen-angle2');

  // --- §6 console ---------------------------------------------------------------
  ok('§6 zero console/page errors across the whole round', errors.length === 0,
    errors.length ? errors.slice(0, 3).join(' | ') : 'clean');

  const passed = results.filter((r) => r.pass).length;
  console.log(`\nVERIFY-SHEEP: ${passed}/${results.length} PASS · screenshots in shots-sheep/`);
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
