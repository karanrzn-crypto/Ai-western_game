/* Countryside hero shots (world expansion) — free-camera evidence.
 * Edit mode (Tab) parks the gameplay camera rig so setCamera holds; each
 * shot frames one new area. Run: node scripts/shot-countryside.cjs
 */
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'shots-country');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  await page.goto('http://localhost:5176/');
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
  await ev(() => window.__westTest.setDayTime(12));
  await ev(() => { window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab'); }); // edit mode parks the rig
  const park = (sx, sy, sz, tx, ty, tz) => ev(
    (a) => window.__westTest.setCamera(a[0], a[1], a[2], a[3], a[4], a[5]),
    [sx, sy, sz, tx, ty, tz],
  );
  const shot = async (name) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log(`shot ${name}`);
  };
  // ranch core: barn + cattle pen + troughs, framed from the road
  await park(6.5, 7.5, -70, -8, 1, -85);
  await shot('hero-ranch-core');
  // agri farm: fields + barn + silos from the northwest corner
  await park(64, 8.5, -80, 88, 1, -102);
  await shot('hero-agri-farm');
  // family farm: house + coop + pens from the east
  await park(-72, 7.0, -80, -90, 1, -93);
  await shot('hero-family-farm');
  // deer meadow + pond in the southern wilds
  await park(-28, 8.0, 96, -44, 1, 110);
  await shot('hero-deer-meadow');
  // the wilds road with the horizon hills behind the south cabin
  await park(-8, 6.0, 84, -32, 2, 128);
  await shot('hero-south-wilds');
  // world overview: from high above the town toward the ranch (the scale shot)
  await park(-1.5, 42, -30, -6, 0, -105);
  await shot('hero-world-overview');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
