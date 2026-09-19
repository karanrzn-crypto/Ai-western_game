/* LOW-SUN SHADOW PROBE — the user's §5/§6 complaint is about building shadows
 * falling INSIDE rooms. The sun orbit's altitude floor (0.16) keeps the sun at
 * ~10° from 18:00-20:00 & dawn — long raking shadows. Evidence at those hours:
 * inside the gunshop (door patch + interior), street shadows, neighbor walls.
 * Run: node scripts/probe-shadow-lowsun.cjs   (dev server on :5176) */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-shadow-lowsun';
const URL = 'http://localhost:5176/';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

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
    await page.waitForTimeout(1400);
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

  // h17.5 — sun ~15° west-of-south; h18.5 — altitude floor ~10°, warm dusk.
  for (const h of [17.5, 18.5, 6.5]) {
    await boot(h);
    // inside the shop: the entrance floor + front wall (door light patch)
    await shot([13.0, 2.0, 7.6], [14.4, 0.3, 10.6], `h${h}-inside-looking-at-door`);
    // inside: west wall + aisle (neighbor-building shadow direction)
    await shot([15.5, 1.9, 9.5], [10.5, 0.9, 9.9], `h${h}-inside-west-aisle`);
    // outside: the west side of the gunshop + street (long building shadows)
    await shot([20.5, 2.2, 16.5], [12, 1.4, 9.0], `h${h}-street-facing-gunshop`);
    // town overview
    await shot([-18, 12, 26], [2, 1.5, 4], `h${h}-town-overview`);
  }

  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
