/* Saloon Final verification v4 — CLOSED-LOOP creative fly.
 * Reads the live camera pose via window.__westDebug() and servos to each
 * pose (move -> read -> correct until within tolerance). No blind odometry.
 * Run: node /home/z/my-project/Ai-western_game/scripts/verify-saloon-final.cjs
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-saloon-final';
const URL = 'http://localhost:5174/';
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL);
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

  // view dir horizontal = (-sin yaw, -cos yaw) -> yaw = atan2(-dx, -dz)
  let yaw = Math.PI, pitch = 0; // creative inherits the player boot yaw (PI)
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
    // Fly along a world-space offset using view-relative keys.
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.05) return;
    // Exact displacement model: v ramps as 12*(1-e^-9t) -> disp(T)=12*(T-(1-e^-9T)/9).
    // Solve T for target displacement by bisection (ms).
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
  // Servo: repeatedly fly the remaining world offset until converged.
  const servo = async (tx, ty, tz, tol, label) => {
    for (let i = 0; i < 8; i += 1) {
      const p = await pose();
      const dx = tx - p.cam[0], dy = ty - p.cam[1], dz = tz - p.cam[2];
      const dist = Math.hypot(dx, dy, dz);
      if (dist <= tol) { console.log(`servo ${label}: at (${p.cam[0].toFixed(2)}, ${p.cam[1].toFixed(2)}, ${p.cam[2].toFixed(2)})`); return true; }
      // Exact ramp model in flyVec handles overshoot; just fly the remainder.
      await flyVec(dx, dy, dz);
      console.log(`servo ${label}: it${i} d=${dist.toFixed(2)}`);
    }
    const p = await pose();
    console.log(`servo ${label}: FINAL (${p.cam[0].toFixed(2)}, ${p.cam[1].toFixed(2)}, ${p.cam[2].toFixed(2)})`);
    return Math.hypot(tx - p.cam[0], ty - p.cam[1], tz - p.cam[2]) <= tol * 2;
  };

  const statCount = await page.evaluate(() => document.getElementById('stat-count').textContent);
  ok('boot: object count', parseInt(statCount, 10) >= 42, `stat-count=${statCount}`);

  await page.evaluate(() => window.__k('keydown', 'KeyF'));
  await page.evaluate(() => window.__k('keyup', 'KeyF'));
  await page.waitForTimeout(400);
  const camMode = () => page.evaluate(() => document.getElementById('camera-mode').textContent);
  ok('creative: entered', /CREATIVE FLIGHT/i.test(await camMode()), `camera=${await camMode()}`);

  // ---- Pose 1: wide interior bar view (camera between stools and door) ------
  await servo(-12, 1.75, -11.8, 0.35, 'bar-wide');
  await lookAbs(Math.PI, -0.07); // face NORTH?? view north = yaw 0
  // view north: dir (0,-1) -> yaw 0. (creative yaw convention: dir=(-sin,-cos))
  await lookAbs(0, -0.07);
  await shot('01-interior-bar-wide');

  // ---- Pose 2: shelves + mirror pitched up ----------------------------------
  await lookAbs(0, 0.45);
  await shot('02-backbar-shelves-up');
  await lookAbs(0, -0.07);

  // ---- Pose 3/4: back-bar straight-on close-up ------------------------------
  await servo(-12, 1.75, -14.15, 0.3, 'backbar-close');
  await lookAbs(0, -0.02);
  await shot('03-backbar-closeup');
  await lookAbs(0, 0.5);
  await shot('04-backbar-shelves-closeup');
  await lookAbs(0, -0.05);

  // ---- Pose 5/6: counter dressing ends --------------------------------------
  await servo(-12, 1.8, -12.4, 0.3, 'counter-mid');
  await lookAbs(Math.atan2(0.75, 1.75), -0.16); // NNW at register/tray end
  await shot('05-counter-west-end');
  await lookAbs(Math.atan2(-0.75, 1.75), -0.16); // NNE at tin/bell end
  await shot('06-counter-east-end');
  await lookAbs(0, -0.07);

  // ---- Pose 7: poker corner --------------------------------------------------
  await servo(-10.1, 1.7, -9.7, 0.35, 'poker');
  await lookAbs(Math.atan2(-1.5, 1.4), -0.22); // at table (-8.6,-11.1)
  await shot('07-poker-final-chairs');

  // ---- Pose 8: music corner --------------------------------------------------
  await servo(-14.3, 1.8, -10.7, 0.35, 'music');
  await lookAbs(Math.atan2(2.2, 0.5), -0.06); // at piano (-16.5,-11.2)
  await shot('08-piano-tucked');

  // ---- Pose 9: reverse wide over the counter ---------------------------------
  await servo(-12, 2.7, -14.6, 0.4, 'reverse');
  await lookAbs(Math.PI, -0.12); // view south (dir (0,1) -> yaw PI)
  await shot('09-reverse-over-counter');

  // ---- Exit creative; console status ----------------------------------------
  await page.evaluate(() => window.__k('keydown', 'KeyF'));
  await page.evaluate(() => window.__k('keyup', 'KeyF'));
  await page.waitForTimeout(400);
  ok('creative: exited clean', !/CREATIVE FLIGHT/i.test(await camMode()), `camera=${await camMode()}`);
  ok('console clean', errors.length === 0, errors.slice(0, 4).join(' | ') || 'no page errors');

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n== ${results.length - failed.length}/${results.length} checks passed ==`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
