/* Before/after identification shots for the two user floaters (daylight).
 * Run: node scripts/shots-restore-proof.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-two-issues';
const URL = 'http://localhost:5176/';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(URL);
  await page.waitForTimeout(3500);
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
    window.__hideRanger = () => {
      const r = window.__westTest.scene()?.getObjectByName('character-root');
      if (r) r.visible = false;
    };
  });
  await page.evaluate(() => { window.__westTest.setDayTime(10); window.__westTest.teleport(-15.9, 0.12, 8.2); window.__hideRanger(); });

  const pose = () => page.evaluate(() => {
    const p = window.__westDebug();
    return { cam: p.cam, yaw: Math.atan2(-p.view[0], -p.view[2]), pitch: Math.asin(Math.max(-1, Math.min(1, p.view[1]))) };
  });
  const drag = async (dx, dy) => {
    await page.evaluate(({ dx, dy }) => {
      const canvas = document.querySelector('canvas');
      const cx = innerWidth / 2, cy = innerHeight / 2;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX: cx, clientY: cy, pointerId: 7, bubbles: true }));
      for (let i = 1; i <= 8; i++) window.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + (dx * i) / 8, clientY: cy + (dy * i) / 8, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { button: 2, bubbles: true }));
    }, { dx, dy });
    await page.waitForTimeout(2200);
  };
  const aimAt = async (tx, ty, tz) => {
    for (let iter = 0; iter < 16; iter++) {
      const p = await pose();
      const dx = tx - p.cam[0], dyy = ty - p.cam[1], dz = tz - p.cam[2];
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(dyy, Math.hypot(dx, dz));
      const dyaw = Math.atan2(Math.sin(wantYaw - p.yaw), Math.cos(wantYaw - p.yaw));
      const dpitch = wantPitch - p.pitch;
      if (Math.abs(dyaw) < 0.015 && Math.abs(dpitch) < 0.015) return;
      await drag(-Math.max(-0.35, Math.min(0.35, dyaw)) / 0.0018, -Math.max(-0.22, Math.min(0.22, dpitch)) / 0.0018);
    }
  };
  const move = async (x, z) => { await page.evaluate(([a, b]) => { window.__westTest.teleport(a, 0.12, b); window.__hideRanger(); }, [x, z]); await page.waitForTimeout(2500); };
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

  // 1) the rope coil on its fascia mount (daylight close-up)
  await move(-16.1, 8.0);
  await aimAt(-16.25, 2.56, 5.49);
  await shot('proof-rope-mounted');

  // 2) the hanging blanket on its bar in the tack room (through the doorway)
  await move(-17.3, 10.5);
  await aimAt(-21.28, 1.645, 11.8);
  await shot('proof-blanket-its-bar');

  console.log('done');
  await browser.close();
})();
