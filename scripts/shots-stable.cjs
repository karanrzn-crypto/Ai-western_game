/* Livery Stable BEAUTY SHOTS — clean (HUD off, ranger hidden, aimed camera).
 * Covers: facade + gate (closed/open), the aisle, stall fronts, a stall
 * interior, the tack room, the feed room, the farrier bay and the loft edge.
 * Run: node scripts/shots-stable.cjs   (dev server on :5176) */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-stable';
const URL = 'http://localhost:5176/';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto(URL);
  await page.waitForTimeout(3200);
  const inject = async () => {
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
      window.__hideRanger();
    });
  };
  await inject();
  await page.evaluate(() => window.__westTest.setDayTime(10));

  const pose = () => page.evaluate(() => {
    const p = window.__westDebug();
    return {
      cam: p.cam,
      yaw: Math.atan2(-p.view[0], -p.view[2]),
      pitch: Math.asin(Math.max(-1, Math.min(1, p.view[1]))),
    };
  });

  const drag = async (dx, dy) => {
    await page.evaluate(({ dx, dy }) => {
      const canvas = document.querySelector('canvas');
      const cx = innerWidth / 2, cy = innerHeight / 2;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX: cx, clientY: cy, pointerId: 7, bubbles: true }));
      for (let i = 1; i <= 8; i++) {
        window.dispatchEvent(new PointerEvent('pointermove', {
          clientX: cx + (dx * i) / 8, clientY: cy + (dy * i) / 8, bubbles: true,
        }));
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

  const frame = async (px, pz, t, label, py = 2.3) => {
    await page.evaluate(([x, y, z]) => {
      window.__westTest.teleport(x, y, z);
      window.__hideRanger();
    }, [px, py, pz]);
    await settleCam();
    await page.evaluate(() => window.__hideRanger());
    await aimAt(t[0], t[1], t[2]);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${label}.png` });
    console.log('shot', label);
  };

  const pressE = async () => {
    await page.evaluate(() => window.__k('keydown', 'KeyE'));
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__k('keyup', 'KeyE'));
    await page.waitForTimeout(9000); // let the swing finish at ~1 fps
  };

  // 1) Exterior facade (gate closed)
  await frame(-16, 19.5, [-16, 3.4, 12.3], '01-exterior-facade', 2.6);
  // 2) Gate closeup closed
  await frame(-16, 15.6, [-16, 2.0, 12.35], '02-gate-closed', 2.2);
  // 3) Open the gate + exterior open
  await page.evaluate(() => { window.__westTest.teleport(-16, 1.7, 13.3); window.__hideRanger(); });
  await page.waitForTimeout(2500);
  await pressE();
  await frame(-16, 17.5, [-16, 2.0, 12.2], '03-gate-open', 2.4);
  // 4) Aisle from the entrance looking north
  await frame(-16, 10.8, [-16, 1.6, 1.0], '04-aisle-south', 2.4);
  // 5) Farrier bay + loft from mid-aisle
  await frame(-16, 4.6, [-15.8, 1.4, -0.2], '05-aisle-north', 2.5);
  // 6) West stall fronts (nameplates + grill)
  await frame(-15.9, 4.2, [-17.9, 1.6, 1.4], '06-stall-fronts', 2.2);
  // RELOAD — the 3-minute day/night cycle has rolled to night by now; reset
  // to morning 8am so the second half of the shots is daylight too.
  await page.reload();
  await page.waitForTimeout(3600);
  await inject();
  await page.evaluate(() => window.__westTest.setDayTime(10));

  // 7) Inside stall 1 (trough, rack, nameplate from inside)
  await frame(-19.6, 1.6, [-18.2, 1.1, 0.8], '07-stall-interior', 2.0);
  // 8) Tack room (door opened first — the aisle lanterns spill inside)
  await page.evaluate(() => { window.__westTest.teleport(-16.9, 1.7, 11.525); window.__hideRanger(); });
  await page.waitForTimeout(2500);
  await pressE();
  await page.waitForTimeout(6000);
  await frame(-19.8, 11.6, [-20.2, 1.5, 9.8], '08-tack-room', 2.1);
  // 9) Feed room
  await frame(-12.3, 11.4, [-12.4, 1.2, 9.6], '09-feed-room', 2.1);
  // 10) Farrier bay close
  await frame(-16, 2.2, [-14.6, 0.9, 0.3], '10-farrier-bay', 2.0);
  // 11) Loft edge + HORSES sign from below
  await frame(-16, 7.4, [-15.2, 3.1, -0.4], '11-loft-edge', 2.2);
  // 12) Water station + barrel
  await frame(-15.2, 3.4, [-16.9, 0.7, -0.1], '12-water-station', 1.9);

  console.log('done');
  await browser.close();
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
