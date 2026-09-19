const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 200)); });
  await page.goto('http://localhost:5176/');
  await page.waitForTimeout(3500);
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
  });
  const key = async (code, ms = 120) => {
    await page.evaluate((c) => window.__k('keydown', c), code);
    await page.waitForTimeout(ms);
    await page.evaluate((c) => window.__k('keyup', c), code);
  };
  // walk to the horse until the mount prompt, then E
  for (let i = 0; i < 30; i += 1) {
    const prompt = await page.evaluate(() => document.getElementById('interact-prompt')?.textContent ?? '');
    if (prompt.includes('Mount')) break;
    await key('KeyW', 160);
  }
  await key('KeyE', 200);
  for (let i = 0; i < 100; i += 1) {
    const h = await page.evaluate(() => ({ riding: window.__westTest.horse().riding, anim: window.__westTest.horse().mountAnim }));
    if (h.riding && !h.anim) break;
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => { if (window.__westTest.cameraMode() !== 'first_person') window.__westTest.toggleCameraMode(); });
  await page.waitForTimeout(300);
  console.log('idle rideCam:', JSON.stringify(await page.evaluate(() => window.__westTest.rideCam())));
  await page.evaluate(() => window.__k('keydown', 'KeyW'));
  await page.waitForTimeout(1200);
  const rc = await page.evaluate(() => {
    const r = window.__westTest.rideCam();
    // ALSO capture the raw pre-serialization shape
    return { speed: r.speed, hasMuzzle: 'muzzleNdc' in r, muzzle: r.muzzleNdc, keys: Object.keys(r) };
  });
  console.log('walk rideCam:', JSON.stringify(rc));
  await browser.close();
})();
