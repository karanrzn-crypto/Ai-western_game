const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto('http://localhost:5176/');
  await page.waitForTimeout(4200);
  await page.evaluate(() => {
    const neuter = (proto, name) => { const o = proto[name]; proto[name] = function (id) { try { o.call(this, id); } catch (e) {} }; };
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
  });
  const pose = () => page.evaluate(() => {
    const p = window.__westDebug();
    return { cam: p.cam, view: p.view, yaw: Math.atan2(-p.view[0], -p.view[2]), pitch: Math.asin(Math.max(-1, Math.min(1, p.view[1]))) };
  });
  const drag = async (dx, dy) => {
    await page.evaluate(({ dx, dy }) => {
      const canvas = document.querySelector('canvas');
      const cx = innerWidth / 2, cy = innerHeight / 2;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX: cx, clientY: cy, pointerId: 7, bubbles: true }));
      for (let i = 1; i <= 8; i++) {
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + (dx * i) / 8, clientY: cy + (dy * i) / 8, bubbles: true }));
      }
      window.dispatchEvent(new PointerEvent('pointerup', { button: 2, bubbles: true }));
    }, { dx, dy });
    await page.waitForTimeout(1100);
  };
  await page.evaluate(() => window.__westTest.teleport(14, 2.6, 19.6));
  await page.waitForTimeout(2500);
  const t = [14, 2.4, 12.0];
  for (let iter = 0; iter < 14; iter++) {
    const p = await pose();
    const dx = t[0] - p.cam[0], dyy = t[1] - p.cam[1], dz = t[2] - p.cam[2];
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dyy, Math.hypot(dx, dz));
    let dyaw = Math.atan2(Math.sin(wantYaw - p.yaw), Math.cos(wantYaw - p.yaw));
    const dpitch = wantPitch - p.pitch;
    console.log(`iter ${iter}: yaw=${p.yaw.toFixed(3)} want=${wantYaw.toFixed(3)} err=${dyaw.toFixed(3)} cam=(${p.cam.map(v=>v.toFixed(1))})`);
    if (Math.abs(dyaw) < 0.012 && Math.abs(dpitch) < 0.012) { console.log('CONVERGED'); break; }
    dyaw = Math.max(-0.5, Math.min(0.5, dyaw));
    const dpc = Math.max(-0.3, Math.min(0.3, dpitch));
    await drag(-dyaw / 0.0018, -dpc / 0.0018);
  }
  console.log('final:', JSON.stringify(await pose()));
  await page.screenshot({ path: '/home/z/my-project/Ai-western_game/shots-gunshop/probe-facade.png' });
  await browser.close();
})();
