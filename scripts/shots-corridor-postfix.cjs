/* One post-fix corridor-axis shot (the boom stays along the corridor lane). */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-sheriff';
const URL = 'http://localhost:5176/';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  await page.goto(URL);
  await page.waitForTimeout(3200);
  await page.evaluate(() => {
    const neuter = (proto, name) => {
      const orig = proto[name];
      proto[name] = function (id) { try { orig.call(this, id); } catch (e) {} };
    };
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
    window.__hideRanger();
  });
  const pose = () => page.evaluate(() => {
    const p = window.__westDebug();
    return { cam: p.cam, yaw: Math.atan2(-p.view[0], -p.view[2]), pitch: Math.asin(Math.max(-1, Math.min(1, p.view[1]))) };
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
    await page.waitForTimeout(1200);
  };
  const aimAt = async (tx, ty, tz) => {
    for (let iter = 0; iter < 10; iter++) {
      const p = await pose();
      const dx = tx - p.cam[0], dyy = ty - p.cam[1], dz = tz - p.cam[2];
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(dyy, Math.hypot(dx, dz));
      let dyaw = Math.atan2(Math.sin(wantYaw - p.yaw), Math.cos(wantYaw - p.yaw));
      const dpitch = wantPitch - p.pitch;
      if (Math.abs(dyaw) < 0.012 && Math.abs(dpitch) < 0.012) return;
      dyaw = Math.max(-0.4, Math.min(0.4, dyaw));
      const dpc = Math.max(-0.25, Math.min(0.25, dpitch));
      await drag(-dyaw / 0.0018, -dpc / 0.0018);
    }
  };
  const settleCam = async () => {
    let last = await pose();
    let still = 0;
    for (let i = 0; i < 24 && still < 3; i++) {
      await page.waitForTimeout(500);
      const p = await pose();
      const d = Math.hypot(p.cam[0] - last.cam[0], p.cam[1] - last.cam[1], p.cam[2] - last.cam[2]);
      if (d < 0.02) still += 1; else still = 0;
      last = p;
    }
  };
  const openDoor = async (which, px, pz, yaw) => {
    await page.evaluate(([x, y, z, w]) => {
      window.__westTest.teleport(x, y, z);
      window.__westTest.setYaw(w);
      window.__hideRanger();
    }, [px, 2.3, pz, yaw]);
    await page.waitForTimeout(2000);
    for (let i = 0; i < 4; i++) {
      const st = await page.evaluate((w) => window.__westTest.cell(w), which);
      if (st && (st.swing > 0 || Math.abs(st.hingeYaw) > 1e-6)) { console.log(`  cell ${which} OPEN (try ${i})`); return; }
      await page.evaluate(() => window.__k('keydown', 'KeyE'));
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.__k('keyup', 'KeyE'));
      await page.waitForTimeout(2500);
    }
    throw new Error(`cell ${which} failed to open`);
  };

  await openDoor('a', 13.7, -3.5, -Math.PI / 2);
  await page.evaluate(([x, y, z]) => {
    window.__westTest.teleport(x, y, z);
    window.__hideRanger();
  }, [13.45, 2.3, -3.4]);
  await settleCam();
  await page.evaluate(() => window.__hideRanger());
  await aimAt(14.2, 1.2, 0.8);
  await page.waitForTimeout(600);
  await aimAt(14.2, 1.2, 0.8);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/fix-corridor-postfix.png` });
  console.log('  shot fix-corridor-postfix');

  await browser.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(2); });
