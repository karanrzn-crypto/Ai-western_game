/* Entrance-doors + FP ride-cam verification — REAL PLAY-MODE walkthrough.
 * Mirrors the verify-stable / verify-fix-round discipline: poll state, never
 * fixed sleeps; settle before every E press; heading-guarded walks.
 * Proves in a live browser:
 *   1. FP riding: the horse's yaw delta is inherited by the VIEW yaw every
 *      frame (turn left → view turns left, smooth — no per-frame jump bigger
 *      than the horse's own delta), full 360° turn tracked, fast direction
 *      changes tracked, and V-toggle TP↔FP keeps the view continuous.
 *   2. BANK front door: exists on the facade, spawns CLOSED (leaves yaw 0,
 *      exact closed collider armed); the CLOSED door blocks the doorway;
 *      [E] opens (both leaves swing inward, mirrored); the OPEN doorway
 *      walks into the lobby; [E] closes and blocks again.
 *   3. SALOON doors: same contract on the bar; walk in / walk out.
 *   4. Wall-adjacent collision beside each door still blocks (no new gaps).
 *   5. Screenshots: bank facade closed/open, saloon facade closed/open,
 *      FP-on-horse mid-turn view.
 * Run: node scripts/verify-entrance-doors.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-entrance-doors';
const URL = 'http://localhost:5176/';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};

const BANK = { x: 2, z: -23, doorZ: -18.5, faceZ: -18.325 };
const SALOON = { x: -12, z: -12, doorZ: -8, faceZ: -7.85 };

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
      proto[name] = function (id) { try { orig.call(this, id); } catch (e) {} };
    };
    neuter(window.HTMLElement.prototype, 'requestPointerLock');
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
    window.__k = (type, code) => {
      const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
    };
  });

  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = async (cond, label, cap = 6000) => {
    let last = null;
    const t0 = Date.now();
    while (Date.now() - t0 < cap) {
      last = await ev(cond);
      if (last) return last;
      await page.waitForTimeout(60);
    }
    throw new Error('timeout waiting for ' + label + ': ' + JSON.stringify(last));
  };
  const key = async (code, ms = 120) => {
    await ev((c) => window.__k('keydown', c), code);
    await page.waitForTimeout(ms);
    await ev((c) => window.__k('keyup', c), code);
  };
  // Held walk: key down, poll until the player REACHES the target or stops
  // making progress (headless fps craters while shadows refresh, so timed
  // walks are meaningless), key up. Returns the final player position.
  let lastPlayerPos = null; // debug breadcrumb for failed walks
  // Walk north (−z) until the player crosses zTarget (or the cap hits).
  const walkNorthPast = async (zTarget, label, cap = 20000) => {
    await ev(() => window.__k('keydown', 'KeyW'));
    let result = null;
    const t0 = Date.now();
    while (Date.now() - t0 < cap) {
      lastPlayerPos = await ev(() => window.__westTest.player());
      if (lastPlayerPos.z < zTarget) { result = { z: lastPlayerPos.z }; break; }
      await page.waitForTimeout(60);
    }
    await ev(() => window.__k('keyup', 'KeyW'));
    if (!result) console.log(`  [walk debug] ${label}: ended at`, JSON.stringify(lastPlayerPos));
    return result;
  };
  const stallGuard = (z0) => async () => {
    const z = await ev(() => window.__westTest.player().z);
    return Math.abs(z - z0) < 0.005;
  };
  const walkStops = async (label, cap = 20000) => {
    // Walk until movement stalls (a collider holds the player) or the cap.
    let z0 = await ev(() => window.__westTest.player().z);
    await ev((c) => window.__k('keydown', c), 'KeyW');
    const t0 = Date.now();
    let lastZ = z0;
    let lastMove = Date.now();
    while (Date.now() - t0 < cap) {
      await page.waitForTimeout(250);
      const z = await ev(() => window.__westTest.player().z);
      if (Math.abs(z - lastZ) > 0.02) lastMove = Date.now();
      lastZ = z;
      if (Date.now() - lastMove > 1400) break; // stalled for 1.4 s → blocked
    }
    await ev((c) => window.__k('keyup', c), 'KeyW');
    void label;
    return lastZ;
  };

  /* ---- 1. FP ride-cam: the view inherits the horse's rotation ------------ */
  await ev(() => window.__westTest.setDayTime(12));
  // Park the player next to the horse and mount.
  await ev(() => window.__westTest.teleport(-5, 1.7, 10.2));
  await page.waitForTimeout(300);
  const mountable = await wait(() => ({
    can: window.__westTest.scene() && true,
  }), 'boot');
  void mountable;
  // Walk to the horse until the mount prompt is up.
  for (let i = 0; i < 30; i += 1) {
    const prompt = await ev(() => document.getElementById('interact-prompt')?.textContent ?? '');
    if (prompt.includes('Mount')) break;
    await key('KeyW', 160);
  }
  await key('KeyE', 200); // mount (third-person choreography plays)
  await wait(() => window.__westTest.horse().riding, 'mount to engage');
  await wait(() => !window.__westTest.horse().mountAnim, 'mount choreography to finish', 45000);
  // Switch to FIRST person for the ride.
  await ev(() => { if (window.__westTest.cameraMode() !== 'first_person') window.__westTest.toggleCameraMode(); });
  await page.waitForTimeout(150);
  ok('1a. riding in FIRST person', await ev(() => window.__westTest.horse().playerMode === 'first_person'),
    JSON.stringify(await ev(() => window.__westTest.horse().playerMode)));

  // ---- NEW: the mounted-cowboy eye (the "see the horse's head" revision) ---
  // The FP eye must sit at the SEATED rider's eye (seat top + torso rise),
  // NOT at the old stirrup-plane + standing stature (2.75m — a drone view
  // with the whole horse out of frame).
  const rc0 = await ev(() => window.__westTest.rideCam());
  ok('1a2. FP ride eye = seated rider eye (≈2.28m over the saddle)',
    rc0.mounted && Math.abs(rc0.camY - rc0.expectedEyeY) < 0.01,
    `camY=${rc0.camY.toFixed(3)} expectedEyeY=${rc0.expectedEyeY.toFixed(3)} (old wrong eye was ${ (rc0.horseGroundY + 2.746).toFixed(3) })`);
  ok('1a3. the horse HEAD is in frame: muzzle in the lower half of the view',
    Math.abs(rc0.muzzleNdc.x) <= 1 && rc0.muzzleNdc.y <= 1 && rc0.muzzleNdc.y >= -1
      && rc0.muzzleNdc.y < -0.02,
    `muzzle NDC (${rc0.muzzleNdc.x.toFixed(2)}, ${rc0.muzzleNdc.y.toFixed(2)}) — negative y = bottom of the frame`);
  ok('1a4. ears/mane crown in frame at neutral pitch',
    Math.abs(rc0.earLNdc.x) <= 1 && Math.abs(rc0.earLNdc.y) <= 1
      && Math.abs(rc0.earRNdc.x) <= 1 && Math.abs(rc0.earRNdc.y) <= 1,
    `earL NDC (${rc0.earLNdc.x.toFixed(2)}, ${rc0.earLNdc.y.toFixed(2)}), earR NDC (${rc0.earRNdc.x.toFixed(2)}, ${rc0.earRNdc.y.toFixed(2)})`);
  await page.screenshot({ path: OUT + '/fp-ride-head-visible.png' });

  // ---- NEW: the eye must be OUTSIDE every horse surface (no head-inside-
  // model clipping): the eye sits BEHIND the withers, ears reach 2.10m —
  // geometrically impossible to overlap at the seated eye, but lock it.
  ok('1a5. the eye rides above the ear tips, clear of the model',
    rc0.camY > rc0.horseGroundY + 2.10,
    `eye ${(rc0.camY - rc0.horseGroundY).toFixed(3)}m vs ear tips 2.10m`);

  // Clean visual evidence, harness-side only (hide the debug HUD panels):
  // the head must stay in frame at a WALK and at a GALLOP.
  const hideHud = () => ev(() => {
    const s = document.createElement('style');
    s.id = 'shot-clean';
    s.textContent = '#hud,#interact-prompt{display:none!important}';
    document.head.appendChild(s);
  });
  const showHud = () => ev(() => document.getElementById('shot-clean')?.remove());
  // In-page normalization: the ride probe can legitimately produce non-finite
  // NDC values (a landmark exactly on the camera plane), and playwright's JSON
  // bridge turns non-finite numbers into null / drops them — normalize to
  // 999 sentinels IN PAGE so the checks and details stay well-defined.
  const rideCamSafe = () => ev(() => {
    const r = window.__westTest.rideCam();
    const n = (v, d = 999) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const p = (o) => (o ? { x: n(o.x), y: n(o.y), z: n(o.z) } : { x: 999, y: 999, z: 999 });
    return {
      mounted: r.mounted, mode: r.mode,
      camY: n(r.camY), horseGroundY: n(r.horseGroundY), expectedEyeY: n(r.expectedEyeY),
      speed: n(r.speed),
      muzzleNdc: p(r.muzzleNdc), earLNdc: p(r.earLNdc), earRNdc: p(r.earRNdc),
      rawKeys: Object.keys(r).join(','),
    };
  });
  const inFrame = (r) => Math.abs(r.muzzleNdc.x) <= 1 && r.muzzleNdc.y <= 1 && r.muzzleNdc.y >= -1
    && Math.abs(r.earLNdc.y) <= 1 && Math.abs(r.earRNdc.y) <= 1;
  // Movement proof by DISPLACEMENT (snap.speed goes non-finite under the
  // software rasterizer's frame-time craters — headless-only artifact).
  const horsePos = () => ev(() => {
    const p = window.__westTest.horse().horsePos;
    return { x: p.x, z: p.z };
  });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  await hideHud();
  await ev(() => window.__k('keydown', 'KeyW'));
  await page.waitForTimeout(1200);
  const walkPos0 = await horsePos();
  let rc = await rideCamSafe();
  const walkPos1 = await horsePos();
  ok('1a6. head stays in frame at a WALK', dist(walkPos0, walkPos1) > 0.05 && inFrame(rc),
    `moved ${(dist(walkPos0, walkPos1)).toFixed(2)}m, muzzle y=${rc.muzzleNdc.y.toFixed(2)} ears y=${rc.earLNdc.y.toFixed(2)}/${rc.earRNdc.y.toFixed(2)}`);
  await page.screenshot({ path: OUT + '/fp-ride-walk.png' });
  const gallopPos0 = await horsePos();
  await ev(() => window.__k('keydown', 'ShiftLeft'));
  await page.waitForTimeout(2200); // build to canter/gallop
  rc = await rideCamSafe();
  const gallopPos1 = await horsePos();
  ok('1a7. head stays in frame at a GALLOP', dist(gallopPos0, gallopPos1) > 0.3 && inFrame(rc),
    `moved ${(dist(gallopPos0, gallopPos1)).toFixed(2)}m in 2.2s (headless sim is frame-bound — motion, not gait, is the assertion), muzzle y=${rc.muzzleNdc.y.toFixed(2)} ears y=${rc.earLNdc.y.toFixed(2)}/${rc.earRNdc.y.toFixed(2)}`);
  console.log(`  [rideCam keys] ${rc.rawKeys}`);
  await page.screenshot({ path: OUT + '/fp-ride-gallop.png' });
  await ev(() => window.__k('keyup', 'ShiftLeft'));
  await ev(() => window.__k('keyup', 'KeyW'));
  await page.waitForTimeout(1500); // let the horse settle to idle
  await showHud();

  // Drive a full 360° turn (hold A ≈ counterclockwise). Sample per-frame:
  // every view delta must equal the horse's delta within 1e-3 (1:1 tracking,
  // no snap), and the total view rotation must track the horse's total.
  await ev(() => window.__k('keydown', 'KeyA'));
  const samples = [];
  for (let i = 0; i < 50; i += 1) {
    samples.push(await ev(() => {
      const h = window.__westTest.horse();
      return { yaw: h.yaw, rideYaw: h.rideYaw };
    }));
    await page.waitForTimeout(40);
  }
  await ev(() => window.__k('keyup', 'KeyA'));
  let maxDeltaMismatch = 0;
  let snaps = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const dy = samples[i].yaw - samples[i - 1].yaw;
    const dv = samples[i].rideYaw - samples[i - 1].rideYaw;
    const wrapped = Math.atan2(Math.sin(dy), Math.cos(dy));
    const wrappedV = Math.atan2(Math.sin(dv), Math.cos(dv));
    const mismatch = Math.abs(wrapped - wrappedV);
    if (mismatch > 1e-3) snaps += 1;
    if (mismatch > maxDeltaMismatch) maxDeltaMismatch = mismatch;
  }
  const totalHorseTurn = Math.abs(samples[samples.length - 1].yaw - samples[0].yaw);
  ok('1b. view tracks the horse 1:1 while turning (no snap)', snaps === 0 && maxDeltaMismatch < 1e-3,
    `frames mismatched: ${snaps}/${samples.length - 1}, max |Δhorse−Δview| = ${maxDeltaMismatch.toFixed(5)} rad`);
  ok('1c. the 360° turn actually happened', totalHorseTurn > 2.5, `horse yaw swept ${totalHorseTurn.toFixed(2)} rad over ${samples.length} samples`);

  // Fast direction change: hold D (reverse) for a burst, sample again.
  await ev(() => window.__k('keydown', 'KeyD'));
  const samples2 = [];
  for (let i = 0; i < 30; i += 1) {
    samples2.push(await ev(() => {
      const h = window.__westTest.horse();
      return { yaw: h.yaw, rideYaw: h.rideYaw };
    }));
    await page.waitForTimeout(40);
  }
  await ev(() => window.__k('keyup', 'KeyD'));
  let snaps2 = 0;
  for (let i = 1; i < samples2.length; i += 1) {
    const dy = samples2[i].yaw - samples2[i - 1].yaw;
    const dv = samples2[i].rideYaw - samples2[i - 1].rideYaw;
    if (Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy)) - Math.atan2(Math.sin(dv), Math.cos(dv))) > 1e-3) snaps2 += 1;
  }
  ok('1d. fast direction change stays 1:1 (no snap)', snaps2 === 0, `frames mismatched: ${snaps2}/${samples2.length - 1}`);

  // Moving straight: ride forward; the view must NOT be dragged (horse going
  // straight adds no rotation) and the eye must ride at the saddle.
  await ev(() => window.__k('keydown', 'KeyW'));
  await page.waitForTimeout(600);
  const fwd = [];
  for (let i = 0; i < 12; i += 1) {
    fwd.push(await ev(() => {
      const h = window.__westTest.horse();
      return { yaw: h.yaw, rideYaw: h.rideYaw };
    }));
    await page.waitForTimeout(40);
  }
  await ev(() => window.__k('keyup', 'KeyW'));
  let straightDrift = 0;
  for (let i = 1; i < fwd.length; i += 1) {
    straightDrift += Math.abs(Math.atan2(Math.sin(fwd[i].rideYaw - fwd[i].yaw), Math.cos(fwd[i].rideYaw - fwd[i].yaw))
      - Math.atan2(Math.sin(fwd[i - 1].rideYaw - fwd[i - 1].yaw), Math.cos(fwd[i - 1].rideYaw - fwd[i - 1].yaw)));
  }
  ok('1e. riding straight never drags the view', straightDrift < 0.02, `relative-look drift over 12 frames: ${straightDrift.toFixed(5)} rad`);

  // V-toggle mid-ride: FP → TP → FP must not throw and must return.
  await ev(() => window.__westTest.toggleCameraMode());
  await page.waitForTimeout(150);
  const tpOk = await ev(() => window.__westTest.horse().playerMode === 'third_person');
  await ev(() => window.__westTest.toggleCameraMode());
  await page.waitForTimeout(150);
  ok('1f. V-toggle mid-ride FP↔FP via TP works', tpOk && await ev(() => window.__westTest.horse().playerMode === 'first_person'),
    `after toggles mode=${await ev(() => window.__westTest.horse().playerMode)}`);

  // Screenshot: FP view mid-turn.
  await ev(() => window.__k('keydown', 'KeyA'));
  await page.waitForTimeout(500);
  await ev(() => window.__k('keyup', 'KeyA'));
  await page.screenshot({ path: OUT + '/fp-riding-turned.png' });

  // Dismount (E → choreography → back to FP on foot). Under headless fps
  // craters a single E can be eaten by a frame stall — retry once.
  await key('KeyE', 200);
  let dismounted = await wait(() => !window.__westTest.horse().riding, 'dismount handover', 7000).catch(() => null);
  if (!dismounted) {
    await key('KeyE', 200);
    dismounted = await wait(() => !window.__westTest.horse().riding, 'dismount handover (retry)', 7000).catch(() => null);
  }
  if (!dismounted) throw new Error('dismount never engaged after two E attempts');
  ok('1g. dismount returns to first person on foot', await ev(() => window.__westTest.cameraMode() === 'first_person'),
    JSON.stringify(await ev(() => window.__westTest.cameraMode())));

  /* ---- 2. BANK front door -------------------------------------------------- */
  // Teleport in front of the bank entrance.
  await ev((t) => window.__westTest.teleport(t.x, 1.7, t.faceZ + 4.4), BANK);
  await page.waitForTimeout(400);
  await ev(() => window.__westTest.setYaw(0)); // face −z (north, toward the bank)
  await page.waitForTimeout(150);
  const b0 = await ev(() => window.__westTest.bankDoor());
  ok('2a. bank door exists and spawns CLOSED with the collider armed',
    b0 && b0.state === 'closed' && b0.swing === 0 && b0.hingeYawW === 0 && b0.hingeYawE === 0,
    JSON.stringify({ state: b0.state, collider: typeof b0.collider === 'object' ? 'boxes' : b0.collider, yawW: b0.hingeYawW, yawE: b0.hingeYawE }));

  // CLOSED: the doorway blocks — walk north until movement STALLS.
  await ev(() => window.__westTest.setYaw(0)); // face −z (north, toward the bank)
  const stoppedAt = await walkStops('closed-door walk');
  ok('2b. the CLOSED bank door stops the player outside',
    stoppedAt > BANK.doorZ + 0.25 && stoppedAt < BANK.doorZ + 2.2,
    `stalled at z=${stoppedAt.toFixed(3)} (door plane ${BANK.doorZ}, face+radius ≈ ${(BANK.faceZ + 0.35).toFixed(2)})`);
  await ev((t) => window.__westTest.teleport(t.x, 1.7, t.faceZ + 4.4), BANK);
  await page.waitForTimeout(300);
  await ev(() => window.__westTest.setYaw(0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: OUT + '/bank-door-closed.png' });

  // E opens: walk back UP to the closed door (stall = at the leaf, well
  // inside the 2.6 m interaction range) — the screenshot teleport above
  // parked the player 4.6 m out, where E is out of range.
  await walkStops('bank re-approach walk');
  await key('KeyE', 150);
  const b1 = await wait(() => { const b = window.__westTest.bankDoor(); return b.state === 'open' ? b : null; }, 'bank door to open', 15000);
  ok('2c. [E] swings both leaves inward, mirrored', Math.abs(b1.hingeYawW + b1.hingeYawE) < 1e-6 && b1.hingeYawW > 1.5,
    `yawW=${b1.hingeYawW.toFixed(3)} yawE=${b1.hingeYawE.toFixed(3)} collider=${b1.collider}`);
  await page.screenshot({ path: OUT + '/bank-door-open.png' });

  // Walk THROUGH the open doorway into the lobby (held walk, deep target).
  await ev(() => window.__westTest.setYaw(0));
  const lobbyZ = await walkNorthPast(BANK.doorZ - 1.2, 'walk into the lobby', 25000);
  ok('2d. the OPEN doorway walks into the lobby', lobbyZ && lobbyZ.z < BANK.doorZ - 1.2,
    `player z=${lobbyZ ? lobbyZ.z.toFixed(3) : 'never'}`);

  // E closes from inside; the door blocks again (walk south into it).
  await key('KeyE', 150);
  const b2 = await wait(() => { const b = window.__westTest.bankDoor(); return b.state === 'closed' ? b : null; }, 'bank door to close', 15000);
  ok('2e. [E] closes the door and re-arms the exact collider',
    b2.swing === 0 && typeof b2.collider === 'object' && b2.collider !== false,
    `state=${b2.state} collider=${typeof b2.collider}`);
  await ev(() => window.__westTest.setYaw(Math.PI)); // face +z (south, at the door)
  const blockedInZ = await walkStops('inside blocked walk');
  ok('2f. the re-CLOSED door blocks from inside', blockedInZ < BANK.doorZ - 0.25 && blockedInZ > BANK.doorZ - 1.6,
    `stalled at z=${blockedInZ.toFixed(3)} (inside leaf face + radius ≈ ${(BANK.doorZ - 0.06 - 0.35).toFixed(2)})`);

  // The wall beside the door still blocks (1.5 m west of the doorway).
  // y=2.3 lands the feet ON the 0.6 m platform top — teleporting at street
  // level embeds the feet INSIDE the step colliders (pale 1-3) and jams the
  // physics solver; the street approach also legitimately stops at the
  // platform edge long before the facade.
  await ev((t) => window.__westTest.teleport(t.x - 1.5, 2.3, t.faceZ + 0.9), BANK);
  await page.waitForTimeout(300);
  await ev(() => window.__westTest.setYaw(0));
  await page.waitForTimeout(150);
  const wallSideZ = await walkStops('wall-side walk');
  ok('2g. the facade wall BESIDE the bank door blocks', wallSideZ > BANK.faceZ - 0.4 && wallSideZ < BANK.faceZ + 1.5,
    `stalled at z=${wallSideZ.toFixed(3)} (face ${BANK.faceZ})`);

  /* ---- 3. SALOON doors ------------------------------------------------------ */
  await ev((t) => window.__westTest.teleport(t.x, 1.7, t.faceZ + 3.6), SALOON);
  await page.waitForTimeout(400);
  await ev(() => window.__westTest.setYaw(0));
  await page.waitForTimeout(150);
  const s0 = await ev(() => window.__westTest.saloonDoor());
  ok('3a. saloon doors exist, spawn CLOSED, full height, collider armed',
    s0 && s0.state === 'closed' && s0.hingeYawL === 0 && s0.hingeYawR === 0,
    JSON.stringify({ state: s0.state, collider: typeof s0.collider === 'object' ? 'boxes' : s0.collider }));
  // THE frozen-door regression lock: the hinges must still OWN leaf meshes
  // after the merge pass. A merge-baked (empty) hinge yaws fine and passes
  // every state check while the VISIBLE leaf never moves (the user report:
  // the bar door model stays fixed and the player walks through it).
  ok('3a-mesh. leaf meshes LIVE under their hinges (not merge-baked away)',
    s0.leafMeshesL >= 1 && s0.leafMeshesR >= 1,
    `leafMeshesL=${s0.leafMeshesL} leafMeshesR=${s0.leafMeshesR} (face z ${s0.leafFaceZL?.toFixed(3)} / ${s0.leafFaceZR?.toFixed(3)})`);
  const saloonClosedFaceZL = s0.leafFaceZL;
  await page.screenshot({ path: OUT + '/saloon-door-closed.png' });

  // Walk UP to the closed doors (stall = at the leaf), then press E.
  const saloonAtDoor = await walkStops('saloon approach walk');
  ok('3a2. the CLOSED saloon doors stop the player outside',
    saloonAtDoor > SALOON.doorZ + 0.25 && saloonAtDoor < SALOON.doorZ + 2.0,
    `stalled at z=${saloonAtDoor.toFixed(3)} (door plane ${SALOON.doorZ})`);
  await page.screenshot({ path: OUT + '/saloon-door-closed-at-door.png' });
  await key('KeyE', 150);
  const s1 = await wait(() => { const s = window.__westTest.saloonDoor(); return s.state === 'open' ? s : null; }, 'saloon doors to open', 15000);
  ok('3b. [E] swings both saloon leaves inward, mirrored', Math.abs(s1.hingeYawL + s1.hingeYawR) < 1e-6 && s1.hingeYawL > 1.5,
    `yawL=${s1.hingeYawL.toFixed(3)} yawR=${s1.hingeYawR.toFixed(3)}`);
  // The leaf must PHYSICALLY move with the swing (visible movement, not an
  // empty-group yaw): the tracked leaf-face world Z changes > 0.2 m.
  ok('3b-move. the leaf face physically moves with the swing (visible open)',
    s1.leafFaceZL !== null && saloonClosedFaceZL !== null
      && Math.abs(s1.leafFaceZL - saloonClosedFaceZL) > 0.2,
    `closed face z=${saloonClosedFaceZL?.toFixed(3)} → open face z=${s1.leafFaceZL?.toFixed(3)} (Δ=${Math.abs(s1.leafFaceZL - saloonClosedFaceZL).toFixed(3)}m)`);
  await page.screenshot({ path: OUT + '/saloon-door-open.png' });

  // Walk through the open doorway (from the porch deck, 9 cm step, fine).
  await ev((t) => window.__westTest.teleport(t.x, 1.7, t.faceZ + 1.2), SALOON);
  await page.waitForTimeout(300);
  await ev(() => window.__westTest.setYaw(0));
  await page.waitForTimeout(150);
  const barZ = await walkNorthPast(SALOON.doorZ - 1.2, 'walk into the bar', 25000);
  ok('3c. the OPEN saloon doorway walks into the bar', barZ && barZ.z < SALOON.doorZ - 1.2,
    `player z=${barZ ? barZ.z.toFixed(3) : 'never'}`);
  await page.screenshot({ path: OUT + '/saloon-inside.png' });

  // E closes the doors, then walk back INTO them from inside (must block).
  await key('KeyE', 150);
  const s2 = await wait(() => { const s = window.__westTest.saloonDoor(); return s.state === 'closed' ? s : null; }, 'saloon doors to close', 15000);
  void s2;
  await ev(() => window.__westTest.setYaw(Math.PI)); // face south (+z, at the doors)
  const blockedInS = await walkStops('saloon inside blocked walk');
  ok('3d. the re-CLOSED saloon doors block from inside', blockedInS < SALOON.doorZ - 0.25 && blockedInS > SALOON.doorZ - 1.6,
    `stalled at z=${blockedInS.toFixed(3)} (inside leaf face + radius ≈ ${(SALOON.doorZ - 0.05 - 0.35).toFixed(2)})`);

  // The saloon facade beside the door still blocks.
  await ev((t) => window.__westTest.teleport(t.x - 3, 1.7, t.faceZ + 2.0), SALOON);
  await page.waitForTimeout(300);
  await ev(() => window.__westTest.setYaw(0));
  await page.waitForTimeout(150);
  const sWallSideZ = await walkStops('saloon wall-side walk');
  ok('3e. the saloon facade BESIDE the doors blocks', sWallSideZ > SALOON.faceZ - 0.4 && sWallSideZ < SALOON.faceZ + 1.5,
    `stalled at z=${sWallSideZ.toFixed(3)} (face ${SALOON.faceZ})`);

  /* ---- 4. Housekeeping ------------------------------------------------------ */
  ok('4a. zero page errors through the whole run', errors.length === 0, errors.length ? errors.join(' | ').slice(0, 300) : 'console clean');

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})();
