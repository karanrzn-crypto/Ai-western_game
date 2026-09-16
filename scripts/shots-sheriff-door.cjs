/* Sheriff FRONT DOOR + WANTED BOARD closeups — clean (HUD off, ranger hidden).
 * Proves visually: the closed door reads as a real door in its casing; the
 * open leaf swings INWARD around the west hinge; the mid-swing interpolation;
 * the wanted board posters stack on DISTINCT planes (no flicker pair).
 * Run: node scripts/shots-sheriff-door.cjs   (dev server on :5176) */
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
    await page.waitForTimeout(500);
    await aimAt(t[0], t[1], t[2]);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${label}.png` });
    console.log(`  shot ${label}`);
  };

  /** Long-press E near the front door until its state matches pred. */
  const frontDoorUntil = async (pred, label, px = 10.5, pz = 3.4) => {
    await page.evaluate(([x, y, z]) => {
      window.__westTest.teleport(x, y, z);
      window.__westTest.setYaw(0);
      window.__hideRanger();
    }, [px, 2.3, pz]);
    await page.waitForTimeout(2200); // full stop — residual glide breaks the 2 m range
    for (let i = 0; i < 4; i++) {
      const st = await page.evaluate(() => window.__westTest.door());
      console.log(`  [frontDoor ${label}] try ${i}: swing=${st.swing.toFixed(2)} target=${st.target} collider=${st.collider} prompt="${st.prompt}" player=${JSON.stringify(await page.evaluate(() => window.__westTest.player()))}`);
      if (pred(st)) { console.log(`  front door ${label} (try ${i})`); return st; }
      await page.evaluate(() => window.__k('keydown', 'KeyE'));
      await page.waitForTimeout(1200); // a short press falls between frames and is LOST
      await page.evaluate(() => window.__k('keyup', 'KeyE'));
      // The RAF runs ~1-3 fps with a clamped delta — the 0.9 s swing takes
      // several REAL seconds. Poll until the swing SETTLES (value === target)
      // before re-reading; a blind fixed wait would re-press mid-swing and
      // retoggle the door.
      for (let w = 0; w < 60; w++) {
        const s2 = await page.evaluate(() => window.__westTest.door());
        if (s2.swing === s2.target) break;
        await page.waitForTimeout(400);
      }
    }
    throw new Error(`front door failed to reach ${label}`);
  };

  const doorState = () => page.evaluate(() => window.__westTest.door());

  // --- CLOSED door: exterior street view + porch closeup ---------------------
  await frontDoorUntil((s) => s.swing <= 0 && s.collider === true, 'closed');
  await frame(10.5, 6.4, [10.5, 1.25, 2.125], '10-front-door-closed');
  await frame(10.5, 4.6, [10.5, 1.25, 2.125], '11-front-door-closed-closeup');

  // --- MID-SWING capture: step in range, press E, shoot mid-interpolation ----
  await page.evaluate(() => {
    window.__westTest.teleport(10.5, 2.3, 3.4);
    window.__westTest.setYaw(0);
    window.__hideRanger();
  });
  await page.waitForTimeout(2200);
  await page.evaluate(() => window.__k('keydown', 'KeyE'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__k('keyup', 'KeyE'));
  let midShot = false;
  for (let i = 0; i < 75; i++) {
    const st = await doorState();
    if (st.swing > 0.25 && st.swing < 0.75) {
      await page.evaluate(() => window.__hideRanger());
      await page.screenshot({ path: `${OUT}/12-front-door-midswing.png` });
      console.log(`  shot 12-front-door-midswing (swing ${st.swing.toFixed(2)}, state ${st.state})`);
      midShot = true;
      break;
    }
    if (st.swing >= 1 && st.target === 1) break;
    await page.waitForTimeout(200);
  }
  if (!midShot) console.log('  mid-swing skipped (completed inside a frame gap)');
  await frontDoorUntil((s) => s.swing >= 1 && s.collider === false, 'open');

  // --- OPEN door: exterior (leaf visible swung into the office) + interior ---
  await frame(10.5, 5.4, [10.5, 1.25, 2.125], '13-front-door-open-exterior');
  await frame(10.9, 0.1, [10.5, 1.25, 2.125], '14-front-door-interior-open');

  // --- CLOSED door interior + the wanted board (3 angles) ---------------------
  await frontDoorUntil((s) => s.swing <= 0 && s.collider === true, 'closed', 10.5, 0.9);
  await frame(10.5, -0.4, [10.5, 1.25, 2.125], '15-front-door-closed-interior');
  await frame(10.5, -2.4, [10.5, 1.15, -5.0], '16-wanted-board');
  await frame(11.7, -2.1, [10.5, 1.15, -5.0], '17-wanted-board-angle2');
  await frame(9.1, -2.5, [10.5, 1.15, -5.0], '18-wanted-board-angle3');

  await browser.close();
  console.log('door/board closeups done');
})().catch((e) => { console.error(e); process.exit(2); });
