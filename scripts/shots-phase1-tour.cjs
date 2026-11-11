/* PHASE-1 VISUAL TOUR: capture every key vantage point of the CURRENT town
 * for human/AI visual inspection — exterior progression (farm → entrance →
 * main street → gunshop → plaza → market row → far side → stable road →
 * stable → exit), the five enterable interiors, a dusk lamp shot and the
 * editor mode. Camera poses are parked via __westTest.setCamera from
 * measured site coordinates (TownLayout).
 * Run: node scripts/shots-phase1-tour.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, '..', 'shots-phase1');
const URL = 'http://localhost:5176/';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
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
  await page.evaluate(() => window.__westTest.setDayTime(12));
  await page.evaluate(() => window.__k('keydown', 'KeyN'));
  await page.evaluate(() => window.__k('keyup', 'KeyN'));

  // Park the camera: setCamera only holds while the gameplay rig is parked,
  // so the whole tour runs in EDIT MODE (TAB) with the HUD panels hidden.
  await page.evaluate(() => { window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab'); });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.id = 'tour-clean';
    s.textContent = '#hud,#interact-prompt,#selection-panel,#object-log,#status-message,#control-hint{display:none!important}';
    document.head.appendChild(s);
  });

  const shot = async (name, cam, target) => {
    await page.evaluate(([c, t]) => {
      window.__westTest.setCamera(c[0], c[1], c[2], t[0], t[1], t[2]);
    }, [cam, target]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('shot', name);
  };

  // --- Exterior progression (north → south) --------------------------------
  await shot('01-farmstead', [-20, 6, -56], [-10, 1.5, -49]);
  await shot('02-town-entrance', [-1.5, 4, -44], [-1.5, 1.5, -30]);
  await shot('03-main-street-gunshop', [-2, 3.5, -33], [8, 1.8, -25]);
  await shot('04-gunshop-porch', [2.5, 2.2, -22], [7.5, 1.6, -25.2]);
  await shot('05-plaza-fountain', [-2, 4.5, -8], [-4, 1.2, 2]);
  await shot('06-market-row-butcher-family', [-4, 3, 4], [-13, 1.5, -4]);
  await shot('07-worker-house', [4, 3, 6], [12, 1.5, -2.5]);
  await shot('08-far-side-bank-sheriff', [-2, 4, 2], [-2, 2, 14]);
  await shot('09-wealthy-house', [12, 3, 6], [21, 1.8, 13.5]);
  await shot('10-stable-road', [-2, 5, 18], [8, 1.8, 34]);
  await shot('11-stable-front', [4, 3.5, 27], [10.5, 2, 36]);
  await shot('12-town-exit', [0, 3, 46], [0, 1.5, 58]);

  // --- Interiors (camera inside each building) ------------------------------
  await shot('13-saloon-interior', [-11.9, 1.9, -20.6], [-15.1, 1.4, -21]);
  await shot('14-bank-lobby', [-8, 2.2, 10.6], [-8, 1.4, 14.5]);
  await shot('15-bank-office-vault', [-4.5, 2.0, 16.2], [-7.5, 1.2, 17.0]);
  await shot('16-sheriff-interior', [8.5, 1.9, 13.2], [8.5, 1.2, 15.8]);
  await shot('17-stable-aisle', [10.5, 2.0, 33.5], [10.5, 1.4, 37]);
  await shot('18-gunshop-interior', [7.6, 1.9, -25], [11, 1.3, -25]);

  // --- Dusk lamps + editor mode ---------------------------------------------
  await page.evaluate(() => window.__westTest.setDayTime(19.2));
  await shot('19-dusk-plaza-lamps', [-2, 4, -6], [-6, 1.2, 4]);
  await page.evaluate(() => window.__westTest.setDayTime(12));
  // Editor mode WITH the panels visible: select the fountain bench, gizmo on.
  await page.evaluate(() => document.getElementById('tour-clean')?.remove());
  await page.waitForTimeout(500);
  await page.evaluate(([c, t]) => {
    window.__westTest.setCamera(c[0], c[1], c[2], t[0], t[1], t[2]);
  }, [[2.5, 3, 1.5], [3, 0.6, -2.1]]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '20-editor-mode.png') });
  console.log('shot 20-editor-mode');

  console.log(`errors: ${errors.length}`);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
