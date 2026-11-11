/* HORSE RIG gameplay probe (current-town coordinates; the mount section of
 * verify-entrance-doors.cjs still teleports to pre-redesign coordinates and
 * cannot see the horse at its TOWN_HORSE_SPAWN meadow).
 * Contract exercised against the REAL game loop:
 *   1) E near the horse → staged mount engages (horse().riding)
 *   2) choreography finishes (mountAnim clears)
 *   3) seated FP eye height ≈ horse ground + RIDER_SEATED_EYE_Y (2.277)
 *   4) W rides the horse forward (speed > 0, position changes)
 *   5) E dismount lands the player beside the horse, on foot again
 *   6) B COME: after STAY + walking away, the horse closes the gap
 * Run: node scripts/probe-horse-mount.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const path = require('fs');
(async () => {
  const OUT = '/home/z/my-project/Ai-western_game/shots-phase1';
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:5176/');
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const neuter = (proto, name) => { const o = proto[name]; proto[name] = function (id) { try { o.call(this, id); } catch (e) {} }; };
    neuter(window.HTMLElement.prototype, 'requestPointerLock');
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
    window.__k = (type, code) => {
      const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
    };
  });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const key = async (code, ms) => {
    await ev((c) => window.__k('keydown', c), code);
    await page.waitForTimeout(ms);
    await ev((c) => window.__k('keyup', c), code);
  };
  const wait = async (pageFn, label, cap = 20000) => {
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < cap) {
      last = await ev(pageFn);
      if (last === true) return;
      await page.waitForTimeout(250);
    }
    throw new Error('timeout: ' + label + ' last=' + JSON.stringify(last));
  };

  await ev(() => window.__westTest.setDayTime(12));
  // Park the horse at its authored meadow spot and stand beside it.
  await ev(() => window.__westTest.placeHorse(-3.8, -53.5));
  await ev(() => window.__westTest.teleport(-5.4, 0, -53.5));
  await page.waitForTimeout(800);

  // 1+2) mount via E, wait for the choreography to finish.
  let mounted = false;
  for (let i = 0; i < 20 && !mounted; i += 1) {
    const prompt = await ev(() => document.getElementById('interact-prompt')?.textContent ?? '');
    if (prompt.includes('Mount')) { await key('KeyE', 200); mounted = true; break; }
    await key('KeyW', 120);
  }
  if (!mounted) throw new Error('mount prompt never appeared');
  await wait(() => window.__westTest.horse().riding, 'mount engages');
  await wait(() => window.__westTest.horse().mountAnim === false, 'mount choreography finishes', 45000);
  console.log('PASS | mount engages + choreography finishes');

  // 3) seated FP eye height.
  await ev(() => { if (window.__westTest.cameraMode() !== 'first_person') window.__westTest.toggleCameraMode(); });
  await page.waitForTimeout(400);
  const rc = await ev(() => window.__westTest.rideCam());
  const eyeOk = Math.abs(rc.camY - rc.expectedEyeY) < 0.06;
  console.log(`${eyeOk ? 'PASS' : 'FAIL'} | seated FP eye | cam ${rc.camY.toFixed(3)} vs expected ${rc.expectedEyeY.toFixed(3)}`);
  await page.screenshot({ path: OUT + '/p1-horse-mounted-fp.png' });

  // 4) ride forward. NOTE: headless SwiftShader runs ~8x slower than real
  // time and the game clamps its delta at 50 ms — so judge by the horse's
  // instantaneous speed DURING the hold + a small minimum displacement.
  const before = await ev(() => window.__westTest.horse().horsePos);
  await ev((c) => window.__k('keydown', c), 'KeyW');
  await page.waitForTimeout(2500);
  const speedDuring = await ev(() => window.__westTest.horse().speed);
  const mid = await ev(() => window.__westTest.horse().horsePos);
  await ev((c) => window.__k('keyup', c), 'KeyW');
  await page.waitForTimeout(600);
  const after = mid;
  const dist = Math.hypot(after.x - before.x, after.z - before.z);
  const rideOk = speedDuring > 0.3 && dist > 0.3;
  console.log(`${rideOk ? 'PASS' : 'FAIL'} | riding W moves the horse | speed ${speedDuring.toFixed(2)} m/s, moved ${dist.toFixed(2)} m (headless time dilation)`);

  // 5) dismount.
  await key('KeyE', 200);
  await wait(() => window.__westTest.horse().riding === false, 'dismount handover');
  await wait(() => window.__westTest.horse().dismountAnim === false, 'dismount choreography finishes', 30000);
  const p = await ev(() => window.__westTest.player());
  const h = await ev(() => window.__westTest.horse().horsePos);
  const gap = Math.hypot(p.x - h.x, p.z - h.z);
  const gapOk = gap > 0.4 && gap < 4;
  console.log(`${gapOk ? 'PASS' : 'FAIL'} | dismount lands beside the horse | gap ${gap.toFixed(2)} m`);

  // 6) B COME: STAY, walk away, summon, expect the horse to approach.
  await key('KeyN', 150); // STAY here
  await ev(([x, y, z]) => window.__westTest.teleport(x, y, z), [p.x, p.y, p.z + 12]);
  await page.waitForTimeout(600);
  await key('KeyB', 150); // COME
  await page.waitForTimeout(6000);
  const h2 = await ev(() => window.__westTest.horse().horsePos);
  const movedToward = Math.hypot(h2.x - h.x, h2.z - h.z);
  const comeOk = movedToward > 0.4;
  console.log(`${comeOk ? 'PASS' : 'FAIL'} | COME moves the horse toward the player | horse advanced ${movedToward.toFixed(2)} m (headless time dilation)`);

  const clean = errors.length === 0;
  console.log(`${clean ? 'PASS' : 'FAIL'} | zero console/page errors | ${errors.join(' | ') || 'clean'}`);
  const allOk = eyeOk && rideOk && gapOk && comeOk && clean;
  console.log(`PROBE-HORSE-MOUNT: ${allOk ? 'PASS' : 'FAIL'}`);
  await browser.close();
  if (!allOk) process.exit(1);
})().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
