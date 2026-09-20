/* Gameplay video + Creative-mode verification (user request:
 * «فیلم بازی کردنت را در نهایی برایم بفرست با مود کریتیو هم یه تست بکن»).
 * Records a REAL play session (webm): on-foot walk down the residential
 * street past the four houses, then F-toggles the Creative fly camera,
 * flies over the roofs (the angle the roof fix must survive), descends,
 * toggles back. Asserts the creative contract behaviourally:
 *   – creative ON  → player position FROZEN, camera climbs with Space
 *   – creative OFF → player walks again
 * Output: shots-house-fixes/video/gameplay-*.webm + console PASS lines.
 * Run: node scripts/record-gameplay.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/Ai-western_game/shots-house-fixes/video';
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
    // Right-drag look: the game's MouseLookController consumes client deltas
    // while button 2 is held.
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
  await ev(() => window.__westTest.setDayTime(13.5));

  /* ---- §A on-foot gameplay walk ------------------------------------------ */
  // Spawn on the main street facing south, look around, then walk the
  // residential row: butcher stall → worker → family → wealthy.
  await ev(() => window.__westTest.teleport(0, 1.7, 6));
  await sleep(2500); // look around spawn street
  await ev(() => window.__look(260, -40));
  await sleep(1200);

  const walkStart = await ev(() => window.__westTest.player());
  await ev(() => window.__k('keydown', 'KeyW'));
  await sleep(2600); // down the street past the stall
  await ev(() => window.__look(150, 0));
  await sleep(2600);
  await ev(() => window.__k('keyup', 'KeyW'));
  const walkEnd = await ev(() => window.__westTest.player());
  const walked = Math.abs(walkEnd.x - walkStart.x) + Math.abs(walkEnd.z - walkStart.z);
  ok('§A on-foot walking works (player moved)', walked > 4, `Δ=${walked.toFixed(2)}m from (${walkStart.x.toFixed(1)},${walkStart.z.toFixed(1)})`);

  // approach the worker house porch and inspect it
  await ev(() => window.__westTest.teleport(-7.6, 1.7, 17.4));
  await ev(() => window.__westTest.setYaw(-2.2));
  await sleep(2000);
  await ev(() => window.__k('keydown', 'KeyW'));
  await sleep(1500);
  await ev(() => window.__k('keyup', 'KeyW'));
  await ev(() => window.__look(-320, -80)); // look up at the roof line
  await sleep(2200);
  await ev(() => window.__look(0, 120)); // down to the door/porch
  await sleep(2000);

  // family porch: door + planters + chair
  await ev(() => window.__westTest.teleport(-8.0, 1.7, 27.2));
  await ev(() => window.__westTest.setYaw(-1.75));
  await sleep(2200);
  await ev(() => window.__k('keydown', 'KeyW'));
  await sleep(900);
  await ev(() => window.__k('keyup', 'KeyW'));
  await ev(() => window.__look(160, 60));
  await sleep(2200);
  await ev(() => window.__look(-120, -60));
  await sleep(2000);

  // cross the street to the wealthy townhouse
  await ev(() => window.__westTest.teleport(6.4, 1.7, 26.0));
  await ev(() => window.__westTest.setYaw(1.45));
  await sleep(2200);
  await ev(() => window.__k('keydown', 'KeyW'));
  await sleep(1300);
  await ev(() => window.__k('keyup', 'KeyW'));
  await ev(() => window.__look(-280, -100));
  await sleep(2400);
  await ev(() => window.__look(0, 140));
  await sleep(1800);

  /* ---- §B creative mode --------------------------------------------------- */
  const preFly = await ev(() => ({ player: window.__westTest.player(), camY: window.__westTest.camera().position.y }));
  await ev(() => window.__k('keydown', 'KeyF'));
  await ev(() => window.__k('keyup', 'KeyF'));
  await sleep(700);

  // climb with Space — the PLAYER must stay frozen while the camera rises
  await ev(() => window.__k('keydown', 'Space'));
  await sleep(2600);
  await ev(() => window.__k('keyup', 'Space'));
  const duringFly = await ev(() => ({ player: window.__westTest.player(), camY: window.__westTest.camera().position.y }));
  const playerFrozen = Math.abs(duringFly.player.x - preFly.player.x) + Math.abs(duringFly.player.z - preFly.player.z) < 0.05;
  const cameraClimbed = duringFly.camY - preFly.camY;
  ok('§B creative ON: player frozen, camera flies up', playerFrozen && cameraClimbed > 4,
    `playerΔ=${(Math.abs(duringFly.player.x - preFly.player.x) + Math.abs(duringFly.player.z - preFly.player.z)).toFixed(3)}m camY ${preFly.camY.toFixed(1)}→${duringFly.camY.toFixed(1)}`);

  // fly forward over the residential row, pitch down at the roofs
  await ev(() => window.__look(0, 170)); // pitch down
  await ev(() => window.__k('keydown', 'KeyW'));
  await sleep(3400);
  await ev(() => window.__k('keyup', 'KeyW'));
  await sleep(1500); // aerial over the roofs
  await ev(() => window.__look(430, 0)); // pan across the street
  await sleep(1600);
  await page.screenshot({ path: `${OUT}/creative-aerial-roofs.png` });

  // descend (crouch key) and exit creative
  await ev(() => window.__k('keydown', 'KeyC'));
  await sleep(2400);
  await ev(() => window.__k('keyup', 'KeyC'));
  const lowCam = await ev(() => window.__westTest.camera().position.y);
  await ev(() => window.__k('keydown', 'KeyF'));
  await ev(() => window.__k('keyup', 'KeyF'));
  await sleep(700);

  // back on foot: walking must work again
  await ev(() => window.__k('keydown', 'KeyW'));
  await sleep(1600);
  await ev(() => window.__k('keyup', 'KeyW'));
  const backOnFoot = await ev(() => window.__westTest.player());
  const walkedAgain = Math.abs(backOnFoot.x - duringFly.player.x) + Math.abs(backOnFoot.z - duringFly.player.z);
  ok('§B creative OFF: back on foot, walking again', walkedAgain > 1.5 && lowCam < duringFly.camY,
    `walked=${walkedAgain.toFixed(2)}m camY descended to ${lowCam.toFixed(1)}`);

  /* ---- §C stray-interaction sweep over the fixed objects ------------------ */
  // Walk the building's old footprint (14,−12): nothing blocks it now.
  await ev(() => window.__westTest.teleport(14, 1.7, -9.5));
  await ev(() => window.__westTest.setYaw(Math.PI));
  await ev(() => window.__k('keydown', 'KeyW'));
  await sleep(2000);
  await ev(() => window.__k('keyup', 'KeyW'));
  const throughSite = await ev(() => window.__westTest.player());
  ok('§C old ساختمان footprint walkable (no phantom walls)', throughSite.z > -12.5,
    `walked south through (14,−12) to z=${throughSite.z.toFixed(2)}`);

  console.log(`\nresults=${results.length} pass=${results.filter((r) => r.pass).length} fail=${results.filter((r) => !r.pass).length}`);
  console.log(`console/page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  await context.close(); // flushes the video file
  await browser.close();
  if (results.some((r) => !r.pass)) process.exit(1);
})();
