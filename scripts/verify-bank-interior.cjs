/* Bank interior verification v1 — CLOSED-LOOP creative fly.
 * Reuses the saloon-final harness: reads the live camera pose via
 * window.__westDebug() and servos to each pose (move -> read -> correct).
 * Poses cover the bank checklist for the manager-office revision:
 * facade, portico, doorway, lobby, counter+cage, dressing, staff strip,
 * office doorway, office desk/sign, secure gate, vault door (90° fix),
 * safe-deposit wall, floor safe, enclosure reverse, lamps, FPS, console.
 * Run: node scripts/verify-bank-interior.cjs
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-bank-interior';
const URL = 'http://localhost:5173/';
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
      const dist = Math.hypot(dx, dy, dz);
      if (dist <= tol) { console.log(`servo ${label}: ok`); return true; }
      await flyVec(dx, dy, dz);
      console.log(`servo ${label}: it${i} d=${dist.toFixed(2)}`);
    }
    const p = await pose();
    console.log(`servo ${label}: FINAL (${p.cam[0].toFixed(2)}, ${p.cam[1].toFixed(2)}, ${p.cam[2].toFixed(2)})`);
    return Math.hypot(tx - p.cam[0], ty - p.cam[1], tz - p.cam[2]) <= tol * 2;
  };

  const statCount = await page.evaluate(() => document.getElementById('stat-count').textContent);
  ok('boot: object count', parseInt(statCount, 10) >= 80, `stat-count=${statCount}`);

  await page.evaluate(() => window.__k('keydown', 'KeyF'));
  await page.evaluate(() => window.__k('keyup', 'KeyF'));
  await page.waitForTimeout(400);
  const camMode = () => page.evaluate(() => document.getElementById('camera-mode').textContent);
  ok('creative: entered', /CREATIVE FLIGHT/i.test(await camMode()), `camera=${await camMode()}`);

  // 1 — street view: full classical facade (steps → columns → pediment → BANK)
  await servo(2, 2.3, -11.5, 0.4, 'street');
  await lookAbs(0, -0.05);
  await shot('01-street-facade');

  // 2 — portico: stairs, landing, four columns, entrance surround
  await servo(2, 1.7, -15.3, 0.35, 'portico');
  await lookAbs(0, -0.03);
  await shot('02-portico-columns');

  // 3 — doorway: through the open walnut leaves into the lobby
  await servo(2, 1.8, -17.4, 0.3, 'doorway');
  await lookAbs(0, -0.02);
  await shot('03-doorway-lobby');

  // 4 — lobby wide: rug, columns, counter + cage ahead
  await servo(2, 2.0, -19.6, 0.35, 'lobby');
  await lookAbs(0, -0.05);
  await shot('04-lobby-wide');

  // 5 — lobby west: grandfather clock on the west wall
  await servo(-0.2, 1.8, -19.9, 0.35, 'lobby-west');
  await lookAbs(Math.atan2(3.4, -2.7) + Math.PI, -0.06); // face WNW at the clock
  await shot('05-lobby-clock');
  await lookAbs(0, -0.05);

  // 6 — teller counter close: marble top, dressing, cage grille
  await servo(2, 2.3, -21.7, 0.3, 'counter');
  await lookAbs(0, -0.12);
  await shot('06-counter-cage');

  // 7 — cage service window straight-on
  await servo(2, 2.5, -22.5, 0.25, 'cage');
  await lookAbs(0, -0.05);
  await shot('07-cage-window');

  // 8 — staff strip behind the counter (walkability read): closed iron gate
  // west, open vault slot east
  await servo(2.6, 1.8, -23.4, 0.3, 'strip');
  await lookAbs(Math.PI, -0.1); // face south over the counter
  await shot('08-staff-strip');

  // 9 — the barred iron gate CLOSED across the manager doorway
  await servo(0.3, 1.8, -23.4, 0.25, 'gate-closed');
  await lookAbs(0, -0.02);
  await shot('09-gate-closed');

  // 10 — manager office interior: desk + chair + BANK sign under the lamp
  await servo(0.6, 1.85, -25.2, 0.3, 'office');
  await lookAbs(Math.atan2(2.62, 0.5), -0.1); // WSW toward the desk
  await shot('10-office-desk-sign');

  // 11 — desk close-up (user Final arrangement, yaw 246°)
  await servo(-1.1, 1.7, -25.6, 0.25, 'desk');
  await lookAbs(Math.atan2(0.92, 0.1), -0.14);
  await shot('11-office-desk-close');

  // 12 — secure gate from the OFFICE side (open leaves toward the lobby)
  await servo(0.2, 1.8, -25.3, 0.25, 'gate-office-side');
  await lookAbs(Math.PI, -0.03);
  await shot('12-secure-gate-office-side');

  // 13 — THE VAULT DOOR (90° fix): round iron door on the office rear wall
  await servo(0.65, 1.8, -25.9, 0.25, 'vault');
  await lookAbs(0, -0.02);
  await shot('13-vault-door-front');

  // 14 — vault room: safe-deposit wall on the east wall (doors facing west)
  await servo(3.2, 1.7, -26.0, 0.25, 'deposit');
  await lookAbs(-1.505, -0.05); // face east at the panel
  await shot('14-safe-deposit-wall');

  // 15 — floor safe + money bags in the vault room
  await servo(2.45, 1.6, -26.5, 0.25, 'safe');
  await lookAbs(-2.58, -0.12); // NNE toward the safe and the bags
  await shot('15-floor-safe-bags');

  // 16 — reverse: over the suite into the lobby (spatial read)
  await servo(2.6, 2.5, -26.8, 0.3, 'reverse');
  await lookAbs(Math.PI, -0.16);
  await shot('16-reverse-into-lobby');

  // FPS samples — SwiftShader software harness, so ABSOLUTE numbers are low;
  // the meaningful check is the BANK vs SALOON-interior ratio (same session,
  // same renderer): the bank must not be an outlier.
  const sampleFps = () => page.evaluate(() => new Promise((res) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames += 1;
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
      else res(Math.round(frames / ((performance.now() - t0) / 1000)));
    };
    requestAnimationFrame(tick);
  }));
  await servo(2, 2.3, -11.5, 0.6, 'fps-street');
  const fpsStreet = await sampleFps();
  await servo(-12, 1.75, -11.8, 0.6, 'fps-saloon'); // the shipped saloon interior
  const fpsSaloon = await sampleFps();
  await servo(0.6, 1.8, -25.7, 0.6, 'fps-bank');    // deepest bank interior
  const fpsBank = await sampleFps();
  const ratio = fpsSaloon > 0 ? fpsBank / fpsSaloon : 0;
  ok('fps', fpsBank >= 2 && ratio >= 0.35, `street ${fpsStreet} · saloon ${fpsSaloon} · bank ${fpsBank} (ratio ${(ratio).toFixed(2)})`);

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
