/* Sheriff close-ups v8 — teleport + RIGHT-DRAG AIM SERVO.
 * Key insight from the v6/v7 review: the camera POSITION follows teleports
 * but its YAW is fully decoupled from setBodyYaw (MouseLook owns it). So:
 * teleport places the boom, then a synthetic right-button drag servo turns
 * the camera onto the target (2–3 resynced iterations, ±0.0018 rad/px). */
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
    if (hud) hud.style.display = 'none'; // clean inspection frames — no DOM panels
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
    return {
      cam: p.cam,
      yaw: Math.atan2(-p.view[0], -p.view[2]),
      pitch: Math.asin(Math.max(-1, Math.min(1, p.view[1]))),
    };
  });

  /** One right-drag of (dx, dy) pixels, split into 8 sub-moves. */
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
    await page.waitForTimeout(1500); // ~4 frames at the harness's 2 fps — the look applies fully
  };

  /** Turn the camera onto (tx, ty, tz) from wherever it currently is.
   *  Steps are clamped to ±0.15 rad (≈83 px — the probe-validated linear
   *  scale) and every step fully settles before the next resync. */
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
      // +px turns yaw NEGATIVE, +py turns pitch NEGATIVE (screen-natural).
      await drag(-dyaw / 0.0018, -dpc / 0.0018);
    }
  };

  /** Wait until the camera POSITION comes to rest (3 consecutive <2 cm
   *  samples) — the third-person rig lerps teleports for many seconds and
   *  its follow-look overrides aim drags while still moving. */
  const settleCam = async () => {
    let last = await pose();
    let still = 0;
    for (let i = 0; i < 40 && still < 3; i++) {
      await page.waitForTimeout(600);
      const p = await pose();
      const d = Math.hypot(p.cam[0] - last.cam[0], p.cam[1] - last.cam[1], p.cam[2] - last.cam[2]);
      if (d < 0.02) still += 1; else still = 0;
      last = p;
    }
  };

  /** Teleport → wait for the camera to come to rest → hide the ranger →
   *  aim servo (retry once if the residual is visible) → shoot. */
  const frame = async (px, pz, t, label, py = 2.3) => {
    await page.evaluate(([x, y, z]) => {
      window.__westTest.teleport(x, y, z);
      window.__hideRanger();
    }, [px, py, pz]);
    await settleCam();
    await page.evaluate(() => window.__hideRanger());
    await aimAt(t[0], t[1], t[2]);
    await page.waitForTimeout(600);
    await aimAt(t[0], t[1], t[2]);
    await page.waitForTimeout(800);
    const dbg = await pose();
    const err = Math.atan2(
      Math.sin(Math.atan2(-(t[0] - dbg.cam[0]), -(t[2] - dbg.cam[2])) - dbg.yaw),
      Math.cos(Math.atan2(-(t[0] - dbg.cam[0]), -(t[2] - dbg.cam[2])) - dbg.yaw));
    console.log(`    cam=(${dbg.cam.map((v) => v.toFixed(1)).join(', ')}) yawErr=${(err * 180 / Math.PI).toFixed(1)}°`);
    await page.screenshot({ path: `${OUT}/${label}.png` });
    console.log(`  shot ${label}`);
  };

  const openDoor = async (px, pz, yaw) => {
    await page.evaluate(([x, y, z, w]) => {
      window.__westTest.teleport(x, y, z);
      window.__westTest.setYaw(w);
      window.__hideRanger();
    }, [px, 2.3, pz, yaw]);
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__k('keydown', 'KeyE'));
    await page.waitForTimeout(160);
    await page.evaluate(() => window.__k('keyup', 'KeyE'));
    await page.waitForTimeout(2800);
  };

  // --- exterior ------------------------------------------------------------------
  await frame(10.5, 8.2, [10.5, 3.6, 2.2], '01-exterior-facade');
  await frame(15.7, 6.8, [15.7, 2.5, 2.2], '14b-south-jail-plaque');
  await frame(4.6, 1.6, [7.875, 2.1, 1.6], '13-west-window-outside');
  await frame(21.3, 0.1, [18.125, 2.0, 0.1], '14-east-window-outside');

  // --- office interior -------------------------------------------------------------
  await frame(12.41, -0.4, [12.41, 1.0, -4.87], '10-gun-cabinet');
  await frame(11.1, -1.5, [12.41, 0.8, -4.87], '10b-gun-cabinet-diag');
  await frame(10.6, 0.3, [7.96, 1.0, 0.3], '11-gun-rack');
  await frame(10.4, 1.6, [7.875, 2.1, 1.6], '12-west-window-inside');
  await frame(10.5, -0.2, [10.5, 1.5, -5.03], '16-wanted-board-badge');
  await frame(8.8, 3.2, [12.6, 1.0, -2.8], '17-office-wide');

  // --- jail (diagonal booms — never due-east inside the 1.45 m corridor) -----------
  await openDoor(13.6, -2.0, -Math.PI / 2);                           // E opens cell A
  await frame(13.45, 0.9, [14.7, 1.4, -2.0], '04-cellA-open');        // office → doorway → open gap
  await frame(15.6, -2.0, [14.2, 1.4, -2.0], '18-cellA-open-frominside');
  await frame(13.5, -0.9, [14.7, 1.1, -3.3], '03-jail-corridor');
  await openDoor(13.6, 1.15, -Math.PI / 2);                            // E opens cell B
  await frame(13.45, 1.9, [14.7, 1.4, 1.15], '05-cellB-open');

  await browser.close();
  console.log('close-ups v8 done');
})().catch((e) => { console.error(e); process.exit(2); });
