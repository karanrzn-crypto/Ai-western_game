/* Evidence screenshots — bank & saloon entrances (street-level views). */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-doors-evidence';
const URL = 'http://localhost:5176/';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  await page.goto(URL);
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    const neuter = (proto, name) => {
      const orig = proto[name];
      proto[name] = function (id) { try { orig.call(this, id); } catch (e) {} };
    };
    neuter(window.HTMLElement.prototype, 'requestPointerLock');
    neuter(window.HTMLElement.prototype, 'focus');
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    window.__k = (type, code) => {
      const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
    };
    const r = window.__westTest.scene()?.getObjectByName('character-root');
    if (r) r.visible = false;
    window.__westTest.setDayTime(12);
    // EDIT mode parks the gameplay rig so setCamera holds.
    window.__k('keydown', 'Tab');
    window.__k('keyup', 'Tab');
  });
  await page.waitForTimeout(800);

  const anchors = await page.evaluate(() => {
    // Sites from the layout modules (BANK_SITE/SALOON_SITE + +Z facades).
    return {
      bankFacade: { x: 2, z: -23 + 4.5 + 0.175 },  // BANK_SITE + depth/2 + wall/2
      saloonFacade: { x: -12, z: -12 + 4 + 0.15 }, // SALOON_SITE + depth/2 + wall/2
    };
  });
  console.log('ANCHORS', JSON.stringify(anchors));

  const shot = async (name, cam, tgt) => {
    await page.evaluate(([c, t]) => window.__westTest.setCamera(c[0], c[1], c[2], t[0], t[1], t[2]), [cam, tgt]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log('SHOT', name);
  };

  {
    const { x, z } = anchors.bankFacade;
    await shot('bank-facade-far', [x, 2.6, z + 10], [x, 2.0, z]);
    await shot('bank-entrance-close', [x, 2.0, z + 3.4], [x, 1.7, z]);
  }
  {
    const { x, z } = anchors.saloonFacade;
    await shot('saloon-facade-far', [x, 2.2, z + 10], [x, 1.8, z]);
    await shot('saloon-entrance-close', [x, 1.5, z + 3.0], [x, 1.2, z]);
  }
  console.log('ERRORS', errors.length ? errors : 'none');
  await browser.close();
})();
