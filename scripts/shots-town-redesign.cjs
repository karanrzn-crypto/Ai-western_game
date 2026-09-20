/* REDESIGNED TOWN beauty shots (reference-image round).
 * Creative-mode (F) + the new __westTest.flyTo harness pose = free camera.
 * Covers the full progression: aerial overview, farm, entrance, main street,
 * square (+ centerpiece), far side (bank/sheriff), stable road, stable yard,
 * exit, ruined house.
 * Run: node scripts/shots-town-redesign.cjs   (dev server on :5176) */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/western_game/shots-town-redesign';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:5176/';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(5000);

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
    // Hide the ranger so he never occludes the composed shot.
    const r = window.__westTest.scene()?.getObjectByName('character-root');
    if (r) r.visible = false;
  });

  // Pin noon lighting + hide the horse (it follows the whistle radius and
  // would photobomb street shots from its farm-lane spawn).
  await page.evaluate(() => window.__westTest.setDayTime(12));
  await page.waitForTimeout(600);

  // Enter Creative mode (F) — the fly camera now owns the view.
  await page.evaluate(() => window.__k('keydown', 'KeyF'));
  await page.evaluate(() => window.__k('keyup', 'KeyF'));
  await page.waitForTimeout(700);

  const poses = [
    // [name, camX, camY, camZ, lookX, lookY, lookZ]
    ['01-aerial-overview-north', 34, 52, -66, -4, 0, 0],
    ['02-aerial-overview-town', 26, 40, 38, -2, 0, -6],
    ['03-farm-area', -4, 10, -28, -24, 1, -41],
    ['04-town-entrance', 2, 6, -35, 0, 1.5, -22],
    ['05-main-street', 0, 7, -25, 0, 2, -8],
    ['06-square-overview', 0, 20, -18, -1, 1, 3],
    ['07-square-from-entrance', 0, 3.4, -9.5, -1, 1.8, 4],
    ['08-far-side-bank-sheriff', 0, 5.5, 2, -3, 2.5, 14],
    ['09-stable-road', 2, 9, 12, 0, 1.5, 30],
    ['10-stable-yard', -1, 7, 17, -13, 2.5, 30],
    ['11-exit-road', 2, 6.5, 34, 0, 1, 47],
    ['12-ruined-house', 18, 5, -24, 27, 1.5, -37],
  ];
  const shots = [];
  for (const [name, cx, cy, cz, lx, ly, lz] of poses) {
    await page.evaluate(({ cx, cy, cz, lx, ly, lz }) => {
      window.__westTest.flyTo(cx, cy, cz, lx, ly, lz);
    }, { cx, cy, cz, lx, ly, lz });
    await page.waitForTimeout(420);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    shots.push(name);
    console.log('shot', name);
  }

  const errs = errors.filter((e) => !e.includes('FontFace') && !e.includes('pointerLock'));
  console.log(`SHOTS: ${shots.length}/${poses.length} captured → ${OUT}`);
  console.log(`PAGE ERRORS: ${errs.length === 0 ? 'NONE' : errs.join(' | ')}`);
  await browser.close();
  process.exit(errs.length === 0 ? 0 : 1);
})();
