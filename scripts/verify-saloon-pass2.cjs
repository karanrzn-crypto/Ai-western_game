/* Saloon verification — second pass: piano+stool framing, wine-glass and
 * spittoon close-ups. Requires the v4 servo helpers (same approach).
 * Run: node /home/z/my-project/Ai-western_game/scripts/verify-saloon-pass2.cjs
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-saloon-final';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('http://localhost:5174/');
  await page.waitForTimeout(2600);
  await page.evaluate(() => {
    const neuter = (proto, name) => {
      const orig = proto[name];
      proto[name] = function (id) { try { orig.call(this, id); } catch (e) { /* synthetic */ } };
    };
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
    window.__k = (type, code) => {
      const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
    };
  });
  const hold = (code, ms) => page.evaluate((c) => window.__k('keydown', c), code)
    .then(() => page.waitForTimeout(ms))
    .then(() => page.evaluate((c) => window.__k('keyup', c), code));
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const pose = () => page.evaluate(() => window.__westDebug());

  let yaw = Math.PI, pitch = 0;
  const lookAbs = async (ny, np) => {
    const dYaw = Math.atan2(Math.sin(ny - yaw), Math.cos(ny - yaw));
    await page.evaluate(({ dx, dy }) => {
      const canvas = document.querySelector('canvas');
      const cx = innerWidth / 2, cy = innerHeight / 2;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX: cx, clientY: cy, pointerId: 7, bubbles: true }));
      for (let i = 1; i <= 6; i++) {
        window.dispatchEvent(new PointerEvent('pointermove', {
          clientX: cx + (dx * i) / 6, clientY: cy + (dy * i) / 6, bubbles: true,
        }));
      }
      window.dispatchEvent(new PointerEvent('pointerup', { button: 2, bubbles: true }));
    }, { dx: -dYaw / 0.0018, dy: (pitch - np) / 0.0018 });
    yaw = ny; pitch = np;
    await page.waitForTimeout(240);
  };
  const flyVec = async (dx, dy, dz) => {
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.05) return;
    const dispOf = (Ts) => 12 * (Ts - (1 - Math.exp(-9 * Ts)) / 9);
    const timeFor = (d) => {
      let lo = 0.01, hi = Math.max(0.2, d / 12 + 0.2);
      for (let i = 0; i < 30; i += 1) {
        const mid = (lo + hi) / 2;
        if (dispOf(mid) < d) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const h = Math.hypot(dx, dz);
    if (h > 1e-4) {
      await lookAbs(Math.atan2(-dx, -dz), pitch);
      await hold('KeyW', timeFor(h) * 1000);
      await page.waitForTimeout(170);
    }
    if (Math.abs(dy) > 1e-4) {
      await hold(dy > 0 ? 'Space' : 'ControlLeft', timeFor(Math.abs(dy)) * 1000);
      await page.waitForTimeout(170);
    }
  };
  const servo = async (tx, ty, tz, tol, label) => {
    for (let i = 0; i < 8; i += 1) {
      const p = await pose();
      const dx = tx - p.cam[0], dy = ty - p.cam[1], dz = tz - p.cam[2];
      if (Math.hypot(dx, dy, dz) <= tol) { console.log(`servo ${label}: ok`); return; }
      await flyVec(dx, dy, dz);
    }
    console.log(`servo ${label}: tolerance missed`);
  };
  // Aim the view at a world point (used after servoing the camera position).
  const aimAt = async (px, py, pz) => {
    const p = await pose();
    const dx = px - p.cam[0], dyy = py - p.cam[1], dz = pz - p.cam[2];
    const h = Math.hypot(dx, dz);
    const ny = h > 1e-4 ? Math.atan2(-dx, -dz) : yaw;
    const np = Math.atan2(dyy, h);
    await lookAbs(ny, np);
  };

  await page.evaluate(() => window.__k('keydown', 'KeyF'));
  await page.evaluate(() => window.__k('keyup', 'KeyF'));
  await page.waitForTimeout(400);

  // 10: piano + stool, low framing
  await servo(-14.55, 1.45, -10.95, 0.3, 'piano2');
  await aimAt(-15.6, 0.55, -11.2);
  await shot('10-piano-with-stool');

  // 11: back-bar countertop wine glasses close-up
  await servo(-11.85, 1.4, -14.75, 0.3, 'wineglass');
  await aimAt(-11.85, 1.02, -15.68);
  await shot('11-wine-glass-closeup');

  // 12: spittoon close-up (bowl / dark interior / thick rim)
  await servo(-9.55, 0.85, -13.15, 0.3, 'spittoon');
  await aimAt(-9.55, 0.1, -14.05);
  await shot('12-spittoon-closeup');

  await page.evaluate(() => window.__k('keydown', 'KeyF'));
  await page.evaluate(() => window.__k('keyup', 'KeyF'));
  await page.waitForTimeout(300);
  if (errors.length) console.log('ERRORS:', errors.slice(0, 3).join(' | '));
  else console.log('console clean');
  await browser.close();
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
