const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto('http://localhost:5176/');
  await page.waitForTimeout(4200);
  await page.evaluate(() => {
    window.__k = (type, code) => {
      const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
    };
    window.__westTest.setDayTime(22); // night — the lamp policy lights the lanterns
    window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab'); // park the rig (edit mode)
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    window.__westTest.setCamera(14.2, 1.9, 11.6, 13.2, 1.15, 9.9);
    const scene = window.__westTest.scene();
    scene.traverse((o) => { if (o.userData && o.userData.isDebugHelper === true) o.visible = false; });
    const r = scene.getObjectByName('character-root');
    if (r) r.visible = false;
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: '/home/z/my-project/Ai-western_game/shots-gunshop/10-interior-night.png' });
  console.log('night shot done');
  await browser.close();
})();
