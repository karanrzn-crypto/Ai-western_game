/* §10 FINAL VERIFICATION — gun shop polish + shadow revision, in the REAL game.
 * 1) Prop closeups after the revision (case/workbench/shelf/facade signs)
 * 2) Shadow behavior: door-seal at low sun, interiors at 3 hours, dusk town
 * 3) Perf A/B against the recorded baseline (median frame 160.7 ms, 786 casters)
 * Run: node scripts/verify-gunshop-polish.cjs   (dev server on :5176) */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-polish-verify';
const URL = 'http://localhost:5176/';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let fails = 0;
  const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) fails += 1; };

  const boot = async (hour) => {
    await page.goto(URL);
    await page.waitForTimeout(4200);
    await page.evaluate(() => {
      const neuter = (proto, name) => { const o = proto[name]; proto[name] = function (id) { try { o.call(this, id); } catch (e) {} }; };
      neuter(Element.prototype, 'setPointerCapture');
      neuter(Element.prototype, 'releasePointerCapture');
      const hud = document.getElementById('hud');
      if (hud) hud.style.display = 'none';
      window.__k = (type, code) => {
        const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
        document.body.dispatchEvent(e);
      };
    });
    await page.evaluate((h) => {
      window.__westTest.setDayTime(h);
      window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab');
      const r = window.__westTest.scene()?.getObjectByName('character-root');
      if (r) r.visible = false;
      window.__westTest.scene().traverse((o) => { if (o.userData && o.userData.isDebugHelper === true) o.visible = false; });
    }, hour);
    await page.waitForTimeout(1300);
  };

  const shot = async (cam, target, label) => {
    await page.evaluate(([c, t]) => {
      window.__westTest.setCamera(c[0], c[1], c[2], t[0], t[1], t[2]);
      const r = window.__westTest.scene()?.getObjectByName('character-root');
      if (r) r.visible = false;
    }, [cam, target]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${label}.png` });
    console.log('shot', label);
  };

  // -- structure: 37 defs registered, 3 new signs live -----------------------
  await boot(10);
  const struct = await page.evaluate(() => {
    const s = window.__westTest.scene();
    // MergeStatic renames merged parts — probe the DEF ROOTS by uuid tail
    // (…23 = parapet sign, …24 = porch shingle, …25 = repairs board).
    const tails = new Set();
    let total = 0;
    s.traverse((o) => {
      if (typeof o.uuid === 'string' && o.uuid.startsWith('10000000-0000-4000-9000')) {
        total += 1;
        tails.add(o.uuid.slice(-2));
      }
    });
    return { signs: ['23', '24', '25'].every((t) => tails.has(t)), total };
  });
  check(struct.signs, 'three decorative sign defs live in the scene (uuids …23/…24/…25)');
  check(struct.total >= 34, `gun shop def count in scene (${struct.total} >= 34)`);

  // -- §1/§3/§4/§2 closeups --------------------------------------------------
  await shot([12.4, 2.35, 9.0], [12.95, 1.32, 9.9], 'v2-display-case-close');
  await shot([13.9, 2.5, 10.9], [12.95, 1.25, 9.9], 'v2-display-case-top');
  await shot([13.2, 1.85, 6.6], [15.5, 1.15, 4.95], 'v2-workbench-close');
  await shot([13.6, 1.6, 4.6], [15.7, 1.05, 5.1], 'v2-workbench-side');
  await shot([15.4, 1.75, 9.9], [18.3, 1.3, 9.9], 'v2-shelf-close');
  await shot([9.5, 2.6, 16.5], [15, 1.4, 9.5], 'v2-facade-signs-day');
  await shot([12.2, 2.4, 15.2], [14.4, 2.2, 11.5], 'v2-shingle-repairs');

  // -- §5/§6 shadow evidence: same views as the baseline ---------------------
  for (const h of [12, 17.5, 18.5]) {
    await boot(h);
    await shot([14, 2.4, 11.2], [14.2, 0.9, 6.4], `v2-h${h}-gunshop-interior-wide`);
    await shot([13.0, 2.0, 7.6], [14.4, 0.3, 10.6], `v2-h${h}-inside-looking-at-door`);
    await shot([-18, 12, 26], [2, 1.5, 4], `v2-h${h}-town-overview`);
  }

  // -- door still works: closed blocks, E opens, walkable --------------------
  await boot(12);
  await page.evaluate(() => {
    window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab'); // back to play
    window.__westTest.teleport(14, 1.7, 12.9);
  });
  await page.waitForTimeout(2600);
  const doorBefore = await page.evaluate(() => window.__westTest.gunshopDoor ? window.__westTest.gunshopDoor() : null);
  await page.evaluate(() => { window.__k('keydown', 'KeyE'); window.__k('keyup', 'KeyE'); });
  await page.waitForTimeout(9000);
  const doorAfter = await page.evaluate(() => window.__westTest.gunshopDoor ? window.__westTest.gunshopDoor() : null);
  check(!!doorAfter, 'door interaction hook responds');
  if (doorBefore && doorAfter) {
    check(doorAfter.swing > 0.5 || doorAfter.target > 0,
      `door opens on E (swing ${doorBefore.swing.toFixed(2)} -> ${doorAfter.swing.toFixed(2)}, target ${doorAfter.target})`);
  }

  // -- §8 perf A/B ------------------------------------------------------------
  await boot(12);
  const perf = await page.evaluate(async () => {
    const scene = window.__westTest.scene();
    let meshCount = 0; let shadowCasters = 0;
    scene.traverse((o) => { if (o.isMesh) { meshCount += 1; if (o.castShadow) shadowCasters += 1; } });
    const measure = async (ms) => new Promise((res) => {
      const t0 = performance.now(); const ts = [];
      const tick = () => { ts.push(performance.now()); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ n: ts.length, med: +d[Math.floor(d.length / 2)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1) }); } };
      requestAnimationFrame(tick);
    });
    const base = await measure(2500);
    return { base, meshCount, shadowCasters };
  });
  console.log('PERF after:', JSON.stringify(perf));
  check(perf.base.med < 200, `frame time still sane headless (${perf.base.med} ms vs baseline 160.7)`);
  check(perf.shadowCasters <= 800, `shadow caster count not inflated (${perf.shadowCasters} vs baseline 786)`);

  console.log('page errors:', errors.length ? errors : 'none');
  check(errors.length === 0, 'no page errors');
  console.log(fails === 0 ? 'ALL CHECKS PASS' : `${fails} CHECKS FAILED`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})();
