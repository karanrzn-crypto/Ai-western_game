/* Bank big-vault-door verification — REAL PLAY-MODE walkthrough (fps-robust).
 * The headless SwiftShader harness runs the RAF loop at a very low fps, so
 * every wait POLLS game state instead of sleeping fixed wall times.
 * Proves the full acceptance chain in a live browser:
 *   1. the big vault door spawns CLOSED on the divider's office face
 *      (hinge at 0, collider armed) and the new divider segments + lamps exist
 *   2. the [E] prompt appears; the CLOSED door physically blocks the on-foot
 *      player (real collision stop at the collider face + radius)
 *   3. E swings the disc outward (hinge → −80°), the collider releases while
 *      the door stands open, and the mounting plate stays fixed
 *   4. the player then WALKS THROUGH the masonry doorway (real CollisionWorld
 *      movement — no teleport past the wall) INTO THE VAULT ROOM
 *   5. E closes the door again from inside the vault (collider re-arms)
 *   6. the widened south-line middle segment seals the old open vault slot —
 *      a lobby-side walk north now stops at its masonry face
 * Run: node scripts/verify-bank-vault.cjs   (dev server on :5175)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-bank-vault';
const URL = 'http://localhost:5175/';
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
  await page.waitForTimeout(3000);

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
  const vault = () => page.evaluate(() => window.__westTest.vault());
  const player = () => page.evaluate(() => window.__westTest.player());
  const teleport = (x, y, z, yaw) => page.evaluate(([a, b, c, d]) => {
    window.__westTest.teleport(a, b, c);
    window.__westTest.setYaw(d);
  }, [x, y, z, yaw]);
  const press = async (code) => {
    await page.evaluate((c) => window.__k('keydown', c), code);
    await page.waitForTimeout(60);
    await page.evaluate((c) => window.__k('keyup', c), code);
  };

  /** Poll until pred(state) holds or the timeout expires. */
  const waitFor = async (read, pred, timeoutMs, label) => {
    const t0 = Date.now();
    let state = await read();
    while (!pred(state) && Date.now() - t0 < timeoutMs) {
      await page.waitForTimeout(180);
      state = await read();
    }
    console.log(`poll ${label}: ${pred(state) ? 'reached' : 'TIMEOUT'} after ${Date.now() - t0}ms`);
    return state;
  };

  /** Hold W in bursts while walking along the body yaw (yaw 0 = north −Z,
   *  yaw −π/2 = east +X) until crossing `target` on that axis or stalling
   *  (no progress → genuinely blocked by the collision world). */
  const walk = async (axis, dir, target, timeoutMs, label) => {
    const t0 = Date.now();
    const yaw = axis === 'z' ? (dir < 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    await teleport((await player()).x, (await player()).y, (await player()).z, yaw);
    let p = await player();
    let stalled = 0;
    while (dir * (p[axis] - target) < 0 && Date.now() - t0 < timeoutMs) {
      const before = p[axis];
      await page.evaluate(() => window.__k('keydown', 'KeyW'));
      await page.waitForTimeout(320);
      await page.evaluate(() => window.__k('keyup', 'KeyW'));
      await page.waitForTimeout(160);
      p = await player();
      stalled = Math.abs(p[axis] - before) < 0.005 ? stalled + 1 : 0;
      if (stalled >= 3) break; // genuinely blocked by the collision world
    }
    console.log(`walk ${label}: ${axis}=${p[axis].toFixed(3)} (${Date.now() - t0}ms)`);
    return p;
  };

  // --- 1) boot state: new objects exist, door closed, collider armed --------
  const objects = await page.evaluate(() => ({
    westSouth: window.__westTest.has('10000000-0000-4000-b000-000000000030'),
    header: window.__westTest.has('10000000-0000-4000-b000-000000000031'),
    westLamp: window.__westTest.has('10000000-0000-4000-b000-000000000032'),
  }));
  ok('boot: divider south segment exists', objects.westSouth, JSON.stringify(objects));
  ok('boot: divider doorway header exists', objects.header, JSON.stringify(objects));
  ok('boot: west divider lamp exists', objects.westLamp, JSON.stringify(objects));
  let v = await vault();
  ok('boot: vault collider armed', v.collider === true, `collider=${v.collider}`);
  ok('boot: vault closed', v.swing === 0 && v.target === 0 && Math.abs(v.hingeYaw) < 1e-6,
    `swing=${v.swing} target=${v.target} hinge=${v.hingeYaw}`);

  // --- 2) prompt + CLOSED door blocks the eastward walk ----------------------
  await teleport(0.4, 2.3, -26.0, -Math.PI / 2);
  await page.waitForTimeout(600);
  v = await vault();
  ok('prompt: [E] shows near the closed vault door', v.prompt.includes('Open the vault door'), `prompt="${v.prompt}"`);
  const blocked = await walk('x', 1, 2.3, 9000, 'at the closed vault door');
  ok(
    'closed vault door BLOCKS the walk (stops at collider face + radius)',
    Math.abs(blocked.x - 0.625) < 0.1,
    `player x=${blocked.x.toFixed(3)} (expected stop 0.625 = door box west face 0.975 − radius)`,
  );
  await shot('01-vault-closed-blocking');

  // --- 3) E opens the door: disc swings outward, collider releases ----------
  await press('KeyE');
  v = await waitFor(vault, (s) => s.swing >= 1 && s.collider === false, 12000, 'vault open');
  ok('open: swing complete + collider off', v.swing >= 1 && v.collider === false,
    `swing=${v.swing.toFixed(3)} collider=${v.collider}`);
  ok('open: hinge at the −80° outward pose', Math.abs(v.hingeYaw + 1.396) < 1e-3, `hinge=${v.hingeYaw.toFixed(3)}`);
  await shot('02-vault-open');

  // --- 4) the player WALKS THROUGH the doorway INTO THE VAULT ROOM ----------
  await teleport(0.4, 2.3, -26.0, -Math.PI / 2);
  await page.waitForTimeout(400);
  const inVault = await walk('x', 1, 2.3, 20000, 'through the open vault door');
  ok(
    'walked THROUGH the open vault door INTO THE VAULT ROOM',
    inVault.x >= 2.3 && inVault.x < 4.0 && Math.abs(inVault.z + 26.0) < 0.6,
    `player (${inVault.x.toFixed(2)}, ${inVault.z.toFixed(2)}) — doorway lane z −26.0, room x ≥ 2.3`,
  );
  await shot('03-inside-vault-room');

  // --- 5) E closes the door again (from inside the vault, within range) -----
  await press('KeyE');
  v = await waitFor(vault, (s) => s.swing <= 0 && s.collider === true, 12000, 'vault re-closed');
  ok('re-closed: collider armed', v.collider === true, `collider=${v.collider}`);
  ok('re-closed: hinge back to the shut pose', Math.abs(v.hingeYaw) < 1e-3, `hinge=${v.hingeYaw.toFixed(3)}`);
  await shot('04-vault-reclosed');

  // --- 6) the widened middle segment SEALS the old open slot ----------------
  await teleport(2.45, 2.3, -23.5, 0); // the old slot lane, lobby side
  await page.waitForTimeout(400);
  const sealed = await walk('z', -1, -25.2, 12000, 'into the sealed slot');
  ok(
    'old vault slot is SEALED masonry (lobby walk stops at the widened wall)',
    Math.abs(sealed.z - (-24.16)) < 0.12,
    `player z=${sealed.z.toFixed(3)} (expected stop −24.16 = south face −24.51 + radius)`,
  );
  await shot('05-slot-sealed');

  ok('console clean', errors.length === 0, errors.slice(0, 4).join(' | ') || 'no page errors');

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n== ${results.length - failed.length}/${results.length} checks passed ==`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
