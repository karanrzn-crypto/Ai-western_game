/* Gameplay video for the REDESIGNED town (reference-image round).
 * Records a REAL session walking the full progression:
 *   farm lane (spawn) → past the farmstead → town entrance → main street
 *   (gun shop / saloon) → central square (well) → far side (bank/sheriff)
 *   → stable road → stable yard → exit — then F-creative aerial over the
 *   town and back on foot.
 * Output: shots-town-redesign/video/gameplay-*.webm + PASS summary lines.
 * Run: node scripts/record-town-redesign.cjs   (dev server on :5176) */
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/western_game/shots-town-redesign/video';
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:5176/';
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(4500);

  await page.evaluate(() => {
    const neuter = (proto, name) => {
      const orig = proto[name];
      proto[name] = function (id) { try { orig.call(this, id); } catch (e) {} };
    };
    neuter(window.HTMLElement.prototype, 'requestPointerLock');
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
    window.__k = (type, code) => {
      const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
    };
    window.__look = (dx, dy, steps = 12) => {
      const stage = document.querySelector('#stage canvas') || document.body;
      const x0 = innerWidth / 2, y0 = innerHeight / 2;
      stage.dispatchEvent(new MouseEvent('mousedown', { button: 2, clientX: x0, clientY: y0, bubbles: true }));
      for (let i = 1; i <= steps; i++) {
        document.dispatchEvent(new MouseEvent('mousemove', {
          button: 2, clientX: x0 + (dx * i) / steps, clientY: y0 + (dy * i) / steps, bubbles: true,
        }));
      }
      document.dispatchEvent(new MouseEvent('mouseup', { button: 2, clientX: x0 + dx, clientY: y0 + dy, bubbles: true }));
    };
  });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__westTest.setDayTime(12));

  /* ---- §A on-foot: the full town progression ----------------------------- */
  // 1) Spawn IS the farm lane (no teleport) — look around, walk past the farm.
  await sleep(3000);
  await ev(() => window.__look(200, -30)); // glance at the farmstead + corral
  await sleep(2200);
  await ev(() => window.__look(-200, 30));
  await sleep(1800);
  const p0 = await ev(() => window.__westTest.player());
  await ev(() => window.__k('keydown', 'KeyW'));
  await sleep(3200); // down the lane toward the entrance
  await ev(() => window.__look(120, 0));
  await sleep(2600);
  await ev(() => window.__k('keyup', 'KeyW'));
  const p1 = await ev(() => window.__westTest.player());
  // Headless rAF throttling caps the effective walk speed at ~0.7–0.9 m/s
  // (the same calibration the previous record-gameplay.cjs thresholds used).
  const walked1 = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  ok('§A farm-lane walk works', walked1 > 2.2, `moved ${walked1.toFixed(1)}m from (${p0.x.toFixed(1)},${p0.z.toFixed(1)})`);

  // 2) Town entrance → main street: pass the gun shop (east) + saloon (west).
  await ev(() => window.__westTest.teleport(0, 1.7, -29));
  await ev(() => window.__westTest.setYaw(Math.PI));
  await sleep(1600);
  await ev(() => window.__k('keydown', 'KeyW'));
  await sleep(3400); // down the main street
  await ev(() => window.__look(140, -20)); // look at the gun shop facade
  await sleep(2200);
  await ev(() => window.__look(-260, 0)); // pan across to the saloon
  await sleep(2000);
  await ev(() => window.__k('keyup', 'KeyW'));

  // 3) Central square: walk in from the entrance, circle the well.
  await ev(() => window.__westTest.teleport(0, 1.7, -9));
  await ev(() => window.__westTest.setYaw(Math.PI));
  await sleep(1500);
  await ev(() => window.__k('keydown', 'KeyW'));
  await sleep(2400); // into the square, up to the well
  await ev(() => window.__k('keyup', 'KeyW'));
  await ev(() => window.__look(-240, 0)); // sweep the far side: sheriff/bank
  await sleep(2600);
  await ev(() => window.__look(300, 0)); // sweep back across the square
  await sleep(2400);

  // 4) Stable road → stable yard.
  await ev(() => window.__westTest.teleport(1, 1.7, 10));
  await ev(() => window.__westTest.setYaw(Math.PI));
  await sleep(1400);
  const p2 = await ev(() => window.__westTest.player());
  await ev(() => window.__k('keydown', 'KeyW'));
  await sleep(4200); // straight down the stable road past the corral
  await ev(() => window.__look(-160, -15)); // look at the stable gate
  await sleep(2400);
  await ev(() => window.__k('keyup', 'KeyW'));
  const p3 = await ev(() => window.__westTest.player());
  const walked2 = Math.hypot(p3.x - p2.x, p3.z - p2.z);
  ok('§A stable road walk works', walked2 > 2.2, `moved ${walked2.toFixed(1)}m down the road`);

  /* ---- §B creative aerial over the town ---------------------------------- */
  const preFly = await ev(() => ({ player: window.__westTest.player(), camY: window.__westTest.camera().position.y }));
  await ev(() => window.__k('keydown', 'KeyF'));
  await ev(() => window.__k('keyup', 'KeyF'));
  await sleep(700);
  await ev(() => window.__k('keydown', 'Space'));
  await sleep(2800);
  await ev(() => window.__k('keyup', 'Space'));
  const duringFly = await ev(() => ({ player: window.__westTest.player(), camY: window.__westTest.camera().position.y }));
  const playerFrozen = Math.abs(duringFly.player.x - preFly.player.x) + Math.abs(duringFly.player.z - preFly.player.z) < 0.2;
  ok('§B creative ON: player frozen, camera climbs', playerFrozen && duringFly.camY - preFly.camY > 3,
    `camY ${preFly.camY.toFixed(1)}→${duringFly.camY.toFixed(1)}`);

  // Cinematic aerial: flyTo the big overview, then a second town-centre pass.
  await ev(() => window.__westTest.flyTo(26, 38, -34, -2, 0, 4));
  await sleep(4200);
  await ev(() => window.__westTest.flyTo(20, 26, 40, -4, 0, -8));
  await sleep(4200);
  await page.screenshot({ path: `${OUT}/creative-aerial-town.png` });

  // Descend + exit creative; walking must work again.
  await ev(() => window.__k('keydown', 'KeyC'));
  await sleep(2200);
  await ev(() => window.__k('keyup', 'KeyC'));
  await ev(() => window.__k('keydown', 'KeyF'));
  await ev(() => window.__k('keyup', 'KeyF'));
  await sleep(700);
  await ev(() => window.__westTest.teleport(1, 1.7, 24));
  await ev(() => window.__westTest.setYaw(Math.PI));
  await sleep(500);
  await ev(() => window.__k('keydown', 'KeyW'));
  await sleep(2600);
  await ev(() => window.__k('keyup', 'KeyW'));
  const backOnFoot = await ev(() => window.__westTest.player());
  const walkedAgain = Math.hypot(backOnFoot.x - 1, backOnFoot.z - 24);
  ok('§B creative OFF: back on foot, walking again', walkedAgain > 1.0,
    `walked ${walkedAgain.toFixed(2)}m on the stable road`);

  console.log(`\nresults=${results.length} pass=${results.filter((r) => r.pass).length} fail=${results.filter((r) => !r.pass).length}`);
  console.log(`console/page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  await context.close(); // flushes the video file
  await browser.close();
  if (results.some((r) => !r.pass)) process.exit(1);
})();
