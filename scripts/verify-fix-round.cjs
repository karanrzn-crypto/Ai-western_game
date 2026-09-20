/* Fix-round verification — REAL in-browser proof of the 2026-09 fix package:
 *   1. FP A/D alone TURN the view smoothly (no translation, no snap)
 *   2. bar counter corners physically block; no oversize beyond the ends
 *   3. gunshop counter corners physically block (both ends)
 *   4. stable footprint = the 2026 grown size (12.4 × 14.2)
 *   5. bucket z-fight root fix present (torus rim, water on the body top)
 *   6. dismount from FIRST-PERSON riding: camera switches to THIRD person
 *      for the choreography, then returns to FIRST person (no mode stuck)
 *   7. riding camera follows the horse's rotation while steering (turnRate)
 * Run: node scripts/verify-fix-round.cjs   (dev server on :5177)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-fix-round';
const URL = 'http://localhost:5177/';
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};

const SALOON = { x: -12, z: -12 };
const GUNSHOP = { x: 14, z: 8.5 };
const STABLE = { x: -16, z: 6 };

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL);
  await page.waitForTimeout(3500);

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
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const ev = (fn, ...args) => page.evaluate(fn, ...args);
  const tp = (x, y, z, yaw) => ev(([a, b, c, d]) => {
    window.__westTest.teleport(a, b, c);
    window.__westTest.setYaw(d);
  }, [x, y, z, yaw]);
  const hold = async (code, ms) => {
    await ev((c) => window.__k('keydown', c), code);
    await page.waitForTimeout(ms);
    await ev((c) => window.__k('keyup', c), code);
    await page.waitForTimeout(150);
  };

  /* ---- 1. FP A/D turn --------------------------------------------------- */
  try {
    await ev(() => { if (window.__westTest.cameraMode() !== 'first_person') window.__westTest.toggleCameraMode(); });
    await tp(4, 1.7, 4, 0);
    await page.waitForTimeout(300);
    const before = await ev(() => ({ yaw: window.__westTest.yaw().body, pos: window.__westTest.player() }));
    // Hold D for ~0.6 s (36 frames): the view must rotate right, no walk.
    await ev((c) => window.__k('keydown', c), 'KeyD');
    await page.waitForTimeout(600);
    await ev((c) => window.__k('keyup', c), 'KeyD');
    await page.waitForTimeout(400);
    const after = await ev(() => ({ yaw: window.__westTest.yaw().body, pos: window.__westTest.player() }));
    const turn = after.yaw - before.yaw;
    const moved = Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z);
    ok('1. FP D turns the view (no translation)', turn < -0.3 && moved < 0.05,
      `Δyaw=${turn.toFixed(3)} rad, moved=${moved.toFixed(3)} m`);
    await shot('01-fp-after-d-turn');
    // Release decay: wait and confirm the spin stops (second D press stops where it is).
  } catch (e) { ok('1. FP D turns the view (no translation)', false, String(e)); }

  /* ---- 2. bar counter corners ------------------------------------------- */
  try {
    // Counter box: x ∈ [S−2.05, S+2.05], z ∈ [S−2.596, S−1.776] (S = saloon site).
    const zMid = SALOON.z - 2.186;
    // Stand 0.9 m east of the visual east end, face west, walk forward: must
    // be blocked just outside the end (never inside the counter volume).
    await tp(SALOON.x + 2.95, 1.7, zMid, -Math.PI / 2); // yaw −90° faces −X? (forward = −X at yaw −π/2? forward = (−sin yaw, −cos yaw) = (1, 0) at −π/2 → faces +X. Use +π/2 for −X.)
    await tp(SALOON.x + 2.95, 1.7, zMid, Math.PI / 2);  // forward = (−1, 0) = −X ✓
    await page.waitForTimeout(200);
    await hold('KeyW', 1600);
    const p1 = await ev(() => window.__westTest.player());
    const eastEdge = SALOON.x + 2.05;
    const stoppedOutside = p1.x > eastEdge + 0.2 && p1.x < eastEdge + 0.6;
    ok('2a. bar counter EAST end blocks (corner fix)', stoppedOutside,
      `stopped x=${p1.x.toFixed(3)} (edge ${eastEdge.toFixed(3)} + radius 0.35)`);
    // The old walk-through corner: stand diagonal off the end, walk NW into it.
    await tp(SALOON.x + 2.6, 1.7, SALOON.z - 1.2, Math.PI * 0.75);
    await page.waitForTimeout(200);
    await hold('KeyW', 1400);
    const p2 = await ev(() => window.__westTest.player());
    const insideVolume = p2.x < eastEdge && p2.z < SALOON.z - 1.776;
    ok('2b. bar counter corner approach blocked', !insideVolume,
      `ended at (${p2.x.toFixed(2)}, ${p2.z.toFixed(2)}) — never entered the counter volume`);
    await shot('02-bar-counter-end');
  } catch (e) { ok('2. bar counter corners', false, String(e)); }

  /* ---- 3. gunshop counter corners --------------------------------------- */
  try {
    const cz = GUNSHOP.z + 1.4;
    const eastEdge = GUNSHOP.x - 0.4 + 1.63;
    await tp(eastEdge + 1.2, 1.7, cz, Math.PI / 2); // face −X
    await page.waitForTimeout(200);
    await hold('KeyW', 1600);
    const p = await ev(() => window.__westTest.player());
    ok('3a. gunshop counter EAST end blocks', p.x > eastEdge + 0.2 && p.x < eastEdge + 0.6,
      `stopped x=${p.x.toFixed(3)} (edge ${eastEdge.toFixed(3)})`);
    const westEdge = GUNSHOP.x - 0.4 - 1.63;
    await tp(westEdge - 1.2, 1.7, cz, -Math.PI / 2); // face +X
    await page.waitForTimeout(200);
    await hold('KeyW', 1600);
    const p2 = await ev(() => window.__westTest.player());
    ok('3b. gunshop counter WEST end blocks', p2.x < westEdge - 0.2 && p2.x > westEdge - 0.6,
      `stopped x=${p2.x.toFixed(3)} (edge ${westEdge.toFixed(3)})`);
    await shot('03-gunshop-counter-end');
  } catch (e) { ok('3. gunshop counter corners', false, String(e)); }

  /* ---- 4. stable footprint ---------------------------------------------- */
  try {
    const probe = await ev(([sx, sz]) => {
      const bounds = window.__westTest.boundsNear(sx, sz + 6.9);
      return bounds;
    }, [STABLE.x, STABLE.z]);
    // The south wall band: find the widest wall bounds near the south facade.
    const south = probe.filter((b) => Math.abs(b.max.z - (STABLE.z + 7.1)) < 0.3 || Math.abs(b.min.z - (STABLE.z + 7.1)) < 0.3);
    const xs = [];
    south.forEach((b) => { xs.push(b.min.x, b.max.x); });
    const width = xs.length ? Math.max(...xs) - Math.min(...xs) : -1;
    ok('4. stable grew to 12.4 m width (south wall span)', width >= 12.0 && width <= 12.9,
      `south wall span ${width.toFixed(2)} m across ${south.length} segments`);
    await shot('04-stable-exterior');
  } catch (e) { ok('4. stable footprint', false, String(e)); }

  /* ---- 5. bucket z-fight root fix ---------------------------------------- */
  try {
    const bucket = await ev(() => {
      const body = window.__westTest.scene().getObjectByProperty('name', 'bucket-body');
      const rim = window.__westTest.scene().getObjectByProperty('name', 'bucket-rim');
      const water = window.__westTest.scene().getObjectByProperty('name', 'bucket-water');
      return {
        bodyH: body ? body.geometry.parameters.height : null,
        bodyY: body ? body.position.y : null,
        rimIsTorus: rim ? rim.geometry.type : null,
        rimY: rim ? rim.position.y : null,
        waterY: water ? water.position.y : null,
        water: Boolean(water),
      };
    });
    const bodyTop = bucket.bodyY + bucket.bodyH / 2;
    const waterTop = bucket.waterY + 0.006;
    const geometryOk = bucket.bodyH === 0.2 && bucket.rimIsTorus === 'TorusGeometry'
      && bucket.water && Math.abs(waterTop - bodyTop) < 0.015 && waterTop > bodyTop;
    ok('5. bucket root fix: torus rim + visible water, no coplanar mouth', geometryOk,
      `bodyTop=${bodyTop.toFixed(3)} rim=${bucket.rimIsTorus}@${bucket.rimY.toFixed(3)} waterTop=${waterTop.toFixed(3)}`);
  } catch (e) { ok('5. bucket z-fight root fix', false, String(e)); }

  /* ---- 6. dismount camera (FP riding → TP choreography → FP back) -------- */
  try {
    const waitFor = async (cond, timeoutMs, label) => {
      const t0 = Date.now();
      let last = null;
      while (Date.now() - t0 < timeoutMs) {
        last = await ev(() => window.__westTest.horse());
        if (cond(last)) return last;
        await page.waitForTimeout(250);
      }
      throw new Error('timeout: ' + label + ' | last=' + JSON.stringify(last));
    };
    // Teleport next to the horse, mount (E), and WAIT for the mount
    // choreography to actually finish (it can take ~4 s with the walk-in).
    const horsePose = await ev(() => window.__westTest.horse());
    await tp(horsePose.horsePos.x + 1.4, 1.7, horsePose.horsePos.z + 0.4, horsePose.yaw + Math.PI);
    await page.waitForTimeout(700);
    const promptBefore = await ev(() => document.getElementById('interact-prompt')?.textContent ?? '');
    await hold('KeyE', 900); // mount (mode → third_person, choreography plays)
    await waitFor((s) => s.riding && !s.mountAnim, 45000, "mount choreography finish");
    // V key (edge-guarded in the game loop) → first person while riding.
    await hold('KeyV', 300);
    await waitFor((s) => s.playerMode === "first_person", 10000, "V to first person");
    const modeBefore = await ev(() => window.__westTest.cameraMode());
    await ev((c) => window.__k('keydown', c), 'KeyE'); // dismount → TP NOW
    await page.waitForTimeout(350);
    const during = await ev(() => window.__westTest.horse());
    await ev((c) => window.__k('keyup', c), 'KeyE');
    ok('6a. dismount switches FP riding view to third person', modeBefore === 'first_person' && during.dismountAnim && during.playerMode === 'third_person',
      `mode before=${modeBefore}, during: anim=${during.dismountAnim} mode=${during.playerMode} restore=${during.dismountRestoreMode}`);
    await shot('05-dismount-third-person');
    await waitFor((s) => !s.riding && !s.dismountAnim, 40000, "dismount handover");
    const after = await ev(() => window.__westTest.horse());
    ok('6b. camera returns to FIRST person after the dismount', !after.riding && after.playerMode === 'first_person' && after.dismountRestoreMode === null,
      `riding=${after.riding}, mode=${after.playerMode}, restore=${after.dismountRestoreMode}`);
    await shot('06-after-dismount-first-person');
  } catch (e) { ok('6. dismount camera', false, String(e)); }

  /* ---- 7. riding camera follows the horse's rotation --------------------- */
  try {
    const waitFor = async (cond, timeoutMs, label) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const s = await ev(() => window.__westTest.horse());
        if (cond(s)) return s;
        await page.waitForTimeout(250);
      }
      throw new Error('timeout: ' + label);
    };
    // Mount again (stays third person), then steer: hold W+A — the horse
    // turns left at low speed; rideYaw must chase the horse yaw.
    const pose = await ev(() => window.__westTest.horse());
    await tp(pose.horsePos.x + 1.4, 1.7, pose.horsePos.z + 0.4, pose.yaw + Math.PI);
    await page.waitForTimeout(500);
    await hold('KeyE', 900);
    await waitFor((s) => s.riding && !s.mountAnim, 45000, "mount choreography finish");
    await ev((c) => window.__k('keydown', c), 'KeyW');
    await page.waitForTimeout(350);
    await ev((c) => window.__k('keydown', c), 'KeyA');
    await page.waitForTimeout(1800);
    const turning = await ev(() => window.__westTest.horse());
    await ev((c) => window.__k('keyup', c), 'KeyA');
    await ev((c) => window.__k('keyup', c), 'KeyW');
    await page.waitForTimeout(600);
    const lag = Math.abs(turning.rideYaw - turning.yaw);
    ok('7. ride camera follows the horse rotation while steering', Math.abs(turning.turnRate) > 0.05 && lag < 0.55,
      `turnRate=${turning.turnRate.toFixed(2)} rad/s, |rideYaw−horseYaw|=${lag.toFixed(3)} rad`);
    await shot('07-ride-camera-following-turn');
    // Dismount to leave a clean state (third-person path).
    await hold('KeyE', 900);
    await waitFor((s) => !s.riding, 40000, "final dismount");
  } catch (e) { ok('7. ride camera follow', false, String(e)); }

  ok('8. console clean', errors.length === 0, errors.slice(0, 3).join(' | ') || 'no page errors');

  const failed = results.filter((r) => !r.pass);
  console.log(`\n== fix-round verify: ${results.length - failed.length}/${results.length} passed ==`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
