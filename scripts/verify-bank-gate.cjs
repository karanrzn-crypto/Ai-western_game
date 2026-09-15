/* Bank iron-gate verification v2 — REAL PLAY-MODE walkthrough (fps-robust).
 * The headless SwiftShader harness runs the RAF loop at a very low fps, so
 * every wait POLLS game state instead of sleeping fixed wall times.
 * Proves the full acceptance chain in a live browser:
 *   1. the gate spawns CLOSED (leaves across the doorway, collider armed)
 *   2. the CLOSED gate physically blocks the on-foot player (real collision)
 *   3. the [E] prompt appears; E swings both leaves open and the collider
 *      is released while the bars stand open
 *   4. the player then WALKS THROUGH the opened manager doorway (real
 *      CollisionWorld movement — no teleport past the wall) into the office
 *   5. the player walks through the open vault entrance slot into the
 *      VAULT ROOM (gate not required)
 *   6. E closes the gate again (collider re-arms, leaves re-close)
 * Run: node scripts/verify-bank-gate.cjs   (dev server on :5175)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-bank-gate';
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
  const gate = () => page.evaluate(() => window.__westTest.gate());
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

  /** Hold W in bursts until the player crosses `targetZ` (moving −Z) or the
   *  walk stalls (no progress → blocked by real collision). */
  const walkNorth = async (targetZ, timeoutMs, label) => {
    const t0 = Date.now();
    let p = await player();
    let stalled = 0;
    while (p.z > targetZ && Date.now() - t0 < timeoutMs) {
      const before = p.z;
      await page.evaluate(() => window.__k('keydown', 'KeyW'));
      await page.waitForTimeout(320);
      await page.evaluate(() => window.__k('keyup', 'KeyW'));
      await page.waitForTimeout(160);
      p = await player();
      stalled = Math.abs(p.z - before) < 0.005 ? stalled + 1 : 0;
      if (stalled >= 3) break; // genuinely blocked by the collision world
    }
    console.log(`walk ${label}: z=${p.z.toFixed(3)} (${Date.now() - t0}ms)`);
    return p;
  };

  // --- 1) boot state: gate closed, collider armed, leaves across the plane --
  let g = await gate();
  ok('boot: gate collider armed', g.collider === true, `collider=${g.collider}`);
  ok('boot: gate closed', g.swing === 0 && g.target === 0, `swing=${g.swing} target=${g.target}`);
  ok(
    'boot: leaves authored shut',
    Math.abs(g.leafWYaw) < 1e-6 && Math.abs(g.leafEYaw - Math.PI) < 1e-6,
    `leafW=${g.leafWYaw} leafE=${g.leafEYaw}`,
  );

  // --- 2) CLOSED gate blocks the on-foot player ------------------------------
  await teleport(0.3, 2.3, -22.6, 0);
  await page.waitForTimeout(600);
  g = await gate();
  ok('prompt: [E] shows near the closed gate', g.prompt.includes('Open the iron gate'), `prompt="${g.prompt}"`);
  const blocked = await walkNorth(-25, 9000, 'at the closed gate');
  ok(
    'closed gate BLOCKS the walk (stops at collider face + radius)',
    Math.abs(blocked.z - (-23.75)) < 0.1,
    `player z=${blocked.z.toFixed(3)} (expected stop −23.75 = gate box face −24.1 + radius)`,
  );
  await shot('01-gate-closed-blocking');

  // --- 3) E opens the gate: leaves swing, collider releases ------------------
  await press('KeyE');
  g = await waitFor(gate, (s) => s.swing >= 1 && s.collider === false, 12000, 'gate open');
  ok('open: swing complete + collider off', g.swing >= 1 && g.collider === false, `swing=${g.swing.toFixed(3)} collider=${g.collider}`);
  ok(
    'open: leaves swung toward the lobby',
    Math.abs(g.leafWYaw + 1.396) < 1e-3 && Math.abs(g.leafEYaw - (Math.PI + 1.396)) < 1e-3,
    `leafW=${g.leafWYaw.toFixed(3)} leafE=${g.leafEYaw.toFixed(3)}`,
  );
  await shot('02-gate-open');

  // --- 4) the player WALKS THROUGH the opened doorway into the office --------
  await teleport(0.3, 2.3, -22.6, 0);
  await page.waitForTimeout(400);
  const inOffice = await walkNorth(-24.75, 20000, 'through the open gate');
  ok(
    'walked THROUGH the open gate into the office',
    inOffice.z <= -24.75 && inOffice.z > -27.5 && Math.abs(inOffice.x - 0.3) < 0.3,
    `player (${inOffice.x.toFixed(2)}, ${inOffice.z.toFixed(2)}) — wall line −24.51`,
  );
  await shot('03-office-through-gate');

  // --- 5) the old open vault slot is SEALED (user Final widened the middle
  // segment) — the vault is entered ONLY through the big vault door, which the
  // dedicated verify-bank-vault.cjs proves end-to-end. Here we assert the
  // seal: a lobby-side walk north stops at the widened wall's south face.
  await teleport(2.45, 2.3, -23.85, 0);
  await page.waitForTimeout(400);
  const sealed = await walkNorth(-25.05, 20000, 'into the sealed slot line');
  ok(
    'old vault slot is SEALED masonry (walk stops at the widened wall face)',
    Math.abs(sealed.z - (-24.16)) < 0.1 && sealed.z > -24.7,
    `player (${sealed.x.toFixed(2)}, ${sealed.z.toFixed(2)}) — expected stop −24.16 = south face −24.51 + radius`,
  );
  await shot('04-slot-sealed');

  // --- 6) E closes the gate again (from within interaction range) ------------
  await teleport(0.3, 2.3, -23.3, 0); // back south of the gate, inside range 2.2
  await page.waitForTimeout(500);
  await press('KeyE');
  g = await waitFor(gate, (s) => s.swing <= 0 && s.collider === true, 12000, 'gate re-closed');
  ok('re-closed: collider armed', g.collider === true, `collider=${g.collider}`);
  ok(
    're-closed: leaves back to the shut pose',
    Math.abs(g.leafWYaw) < 1e-3 && Math.abs(g.leafEYaw - Math.PI) < 1e-3,
    `leafW=${g.leafWYaw.toFixed(3)} leafE=${g.leafEYaw.toFixed(3)}`,
  );
  await shot('05-gate-reclosed');

  ok('console clean', errors.length === 0, errors.slice(0, 4).join(' | ') || 'no page errors');

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n== ${results.length - failed.length}/${results.length} checks passed ==`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
