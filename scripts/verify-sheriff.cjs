/* Sheriff Office verification — REAL PLAY-MODE walkthrough (fps-robust).
 * The headless SwiftShader harness runs the RAF loop at a very low fps, so
 * every wait POLLS game state instead of sleeping fixed wall times.
 * Proves the full acceptance chain in a live browser:
 *   1. boot: the building + the 14 user assets exist; both cell doors spawn
 *      CLOSED with their colliders armed
 *   2. the public path works: street → porch → front doorway → office,
 *      where the desk physically blocks the straight-on approach
 *   3. the office → jail corridor path works (divider doorway), and the
 *      corridor lane is clear between the two CLOSED cell doors
 *   4. cell A: [E] prompt, closed door blocks, E opens (collider released),
 *      the player WALKS INTO the cell, E closes (collider re-arms), the
 *      closed door now blocks FROM INSIDE (the cell holds), E re-opens and
 *      the player walks back out
 *   5. cell B: same chain, abbreviated
 *   6. console clean
 * Run: node scripts/verify-sheriff.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-sheriff';
const URL = 'http://localhost:5176/';
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
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
  const player = () => page.evaluate(() => window.__westTest.player());
  const cell = (which) => page.evaluate((w) => window.__westTest.cell(w), which);
  const teleport = (x, y, z, yaw) => page.evaluate(([a, b, c, d]) => {
    window.__westTest.teleport(a, b, c);
    window.__westTest.setYaw(d);
  }, [x, y, z, yaw]);
  const press = async (code) => {
    await page.evaluate((c) => window.__k('keydown', c), code);
    await page.waitForTimeout(1200); // at ~1 fps a short press falls between frames and is LOST
    await page.evaluate((c) => window.__k('keyup', c), code);
    await page.waitForTimeout(250);
  };

  /** Press E until the cell door state flips to pred. The player must be
   *  FULLY STOPPED first — the engine decays W velocity exponentially for
   *  ~1-2 s after keyup, and that residual glide can carry the player out
   *  of the interaction's 2 m range (prompt="" → the press does nothing). */
  const settle = async (maxMs = 8000) => {
    const t0 = Date.now();
    let still = 0;
    let p = await player();
    while (still < 3 && Date.now() - t0 < maxMs) {
      await page.waitForTimeout(350);
      const q = await player();
      const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y) + Math.abs(q.z - p.z);
      p = q;
      still = d < 0.002 ? still + 1 : 0;
    }
    return p;
  };

  /** Press E until the cell door state flips to pred. Logs the prompt on
   *  every failed try so a null candidate (lost interaction target) is
   *  visible instead of silent. */
  const pressUntil = async (which, pred, label) => {
    await settle();
    let state = await cell(which);
    for (let i = 0; i < 4 && !pred(state); i++) {
      await press('KeyE');
      state = await waitFor(() => cell(which), pred, 9000, `${label} (try ${i + 1})`);
      if (!pred(state)) console.log(`  ${label} try ${i + 1} failed: prompt="${state.prompt}" swing=${state.swing} collider=${state.collider}`);
    }
    if (!pred(state)) state = await waitFor(() => cell(which), pred, 30000, label);
    return state;
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

  /** Walk along the body yaw (yaw 0 = north −Z, yaw −π/2 = east +X, yaw π =
   *  south +Z) until crossing `target` on that axis or stalling. HOLD W for
   *  the whole walk (separate bursts fall between ~1 fps frames). A HEADING
   *  GUARD probes the first confirmed movement: if the player moves the wrong
   *  way (a stale movement-heading sample — the sampler only re-samples on
   *  key-set changes), release, re-teleport, retry up to 5×. Real collider
   *  stops repeat exactly; 10 dead reads (~4.2 s) = blocked. */
  const walk = async (axis, dir, target, timeoutMs, label) => {
    const t0 = Date.now();
    const yaw = axis === 'z' ? (dir < 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    let p = await player();
    p = await settle(); // kill the previous walk's residual velocity first
    const origin = { ...p };
    // --- heading guard: confirm the actual first movement direction ---------
    for (let attempt = 0; attempt < 5; attempt++) {
      await teleport(p.x, p.y, p.z, yaw);
      await page.waitForTimeout(1400); // full turn-in-place settle
      await page.evaluate(() => window.__k('keydown', 'KeyW'));
      await page.waitForTimeout(700); // span at least one frame
      const probe = await player();
      await page.evaluate(() => window.__k('keyup', 'KeyW'));
      await page.waitForTimeout(400);
      const moved = { x: probe.x - p.x, z: probe.z - p.z };
      const along = axis === 'x' ? dir * moved.x : dir * moved.z;
      const across = axis === 'x' ? Math.abs(moved.z) : Math.abs(moved.x);
      p = probe;
      if (along > 0.015 && along > across * 2) break; // heading confirmed along the intended axis
      console.log(`  heading retry ${attempt + 1}: moved (${moved.x.toFixed(3)}, ${moved.z.toFixed(3)})`);
      p = { ...origin }; // restart from the stable start — never chase a wedge
      if (Date.now() - t0 > timeoutMs) break;
    }
    let stalled = 0;
    await page.evaluate(() => window.__k('keydown', 'KeyW'));
    try {
      while (dir * (p[axis] - target) < 0 && Date.now() - t0 < timeoutMs) {
        const before = p[axis];
        await page.waitForTimeout(420);
        p = await player();
        stalled = Math.abs(p[axis] - before) < 0.004 ? stalled + 1 : 0;
        if (stalled >= 10) { // ~4.2 s of zero progress — a real collider stop, not a frame spike
          console.log(`  stall at (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`);
          break;
        }
      }
    } finally {
      await page.evaluate(() => window.__k('keyup', 'KeyW'));
      await page.waitForTimeout(300);
    }
    console.log(`walk ${label}: ${axis}=${p[axis].toFixed(3)} (${Date.now() - t0}ms)`);
    return p;
  };

  // --- 1) boot: shell + user assets exist, cell doors closed -----------------
  const ids = {
    building: '90000000-0000-4000-9000-000000000001',
    porchDeck: '90000000-0000-4000-9000-000000000004',
    desk: '90000000-0000-4000-9000-00000000001a',
    chair: '90000000-0000-4000-9000-00000000001b',
    wantedBoard: '90000000-0000-4000-9000-00000000001d',
    stove: '90000000-0000-4000-9000-000000000025',
    gunCabinet: '90000000-0000-4000-9000-00000000001f',
    gunRack: '90000000-0000-4000-9000-000000000020',
    cotA: '90000000-0000-4000-9000-000000000018',
    cotB: '90000000-0000-4000-9000-000000000019',
    cellDoorA: '90000000-0000-4000-9000-000000000016',
    cellDoorB: '90000000-0000-4000-9000-000000000017',
    coatRack: '90000000-0000-4000-9000-000000000024',
    washStand: '90000000-0000-4000-9000-000000000021',
    keyRack: '90000000-0000-4000-9000-000000000026',
    ammoCrate: '90000000-0000-4000-9000-000000000022',
    badge: '90000000-0000-4000-9000-00000000001e',
    deskLamp: '90000000-0000-4000-9000-00000000001c',
  };
  const presence = await page.evaluate((ids) => {
    const out = {};
    for (const [k, uuid] of Object.entries(ids)) out[k] = window.__westTest.has(uuid);
    return out;
  }, ids);
  const missing = Object.entries(presence).filter(([, v]) => !v).map(([k]) => k);
  ok('boot: building + all 14 user assets registered', missing.length === 0,
    missing.length ? `MISSING: ${missing.join(', ')}` : `${Object.keys(presence).length} key objects present`);
  let a = await cell('a');
  let b = await cell('b');
  ok('boot: cell door A closed + collider armed', a.swing === 0 && a.collider === true && Math.abs(a.hingeYaw) < 1e-6,
    `swing=${a.swing} collider=${a.collider} hinge=${a.hingeYaw}`);
  ok('boot: cell door B closed + collider armed', b.swing === 0 && b.collider === true && Math.abs(b.hingeYaw) < 1e-6,
    `swing=${b.swing} collider=${b.collider} hinge=${b.hingeYaw}`);

  // --- 1b) WINDOWS: every glass pane must sit INSIDE its wall band ----------
  // (the old build mounted the west/east assemblies at the facade offset —
  // they floated mid-room at x 9.3 / 16.7 facing INWARD)
  const glassPanes = await page.evaluate(() => window.__westTest.windowGlass());
  const bandOf = (n) => n.startsWith('window-south-') ? ['z', 2.125]
    : n.startsWith('window-north-') ? ['z', -5.125]
      : n.startsWith('window-west-') ? ['x', 7.875]
        : n.startsWith('window-east-') ? ['x', 18.125] : null;
  const offGlass = (glassPanes ?? []).filter((g) => {
    const band = bandOf(g.name);
    return !band || Math.abs(g[band[0]] - band[1]) > 0.02;
  });
  ok('windows: all 6 glass panes lined INTO their wall openings (none floating mid-room)',
    glassPanes && glassPanes.length === 6 && offGlass.length === 0,
    offGlass.length ? `OFF-PLANE: ${JSON.stringify(offGlass)}` : glassPanes.map((g) => `${g.name} @ ${bandOf(g.name)[0]}=${g[bandOf(g.name)[0]]}`).join(' | '));

  // --- 1c) DOOR FRAMES: no floating strip (the old "two stains") ------------
  // The removed frame header floated at world y [2.22, 2.28] and the sill at
  // [0.12, 0.18]. The lintel now spans [2.21, 2.39]: its underside sits BELOW
  // both masonry headers (2.25 / 2.29 — no flush pair → no z-fight) while its
  // top buries inside them, bridging posts → masonry exactly as before.
  const frameCheck = async (which, label) => {
    const uuid = which === 'a' ? ids.cellDoorA : ids.cellDoorB;
    const probe = await page.evaluate((u) => window.__westTest.probe(u), uuid);
    const floats = probe.parts.filter((p) => (p.y[0] > 2.2 && p.y[1] < 2.32) || (p.y[0] > 0.1 && p.y[1] < 0.2));
    const lintel = probe.parts.some((p) => p.y[0] > 2.15 && p.y[0] < 2.24 && p.y[1] > 2.3 && p.y[1] < 2.5);
    ok(`${label}: frame has a real lintel and NO floating strip (no stain objects)`,
      lintel && floats.length === 0,
      floats.length ? `FLOATING PARTS: ${JSON.stringify(floats)}` : `lintel bridged ${lintel}`);
  };
  await frameCheck('a', 'cell A frame (closed)');
  await frameCheck('b', 'cell B frame (closed)');

  /** Census the door gap box; every mesh inside must belong to the door. */
  const gapCensus = async (which, label) => {
    const box = which === 'a' ? [[14.62, 0.2, -4.08], [14.78, 2.2, -2.92]] : [[14.62, 0.2, -0.93], [14.78, 2.2, 0.23]];
    const census = await page.evaluate(([lo, hi]) => window.__westTest.strays(lo, hi), box);
    const doorName = which === 'a' ? 'در سلول ۱' : 'در سلول ۲';
    const foreign = Object.keys(census).filter((k) => !k.includes(doorName));
    ok(`${label}: gap census — only door-owned meshes in the opening`, foreign.length === 0,
      foreign.length ? `FOREIGN: ${foreign.join(' ; ').slice(0, 300)}` : `${Object.keys(census).length} door parts, all owned`);
  };

  /** Best-effort mid-swing census: press E and catch the leaf between 15–85%. */
  const midSwingCensus = async (which) => {
    await press('KeyE');
    for (let i = 0; i < 14; i++) {
      const s = await cell(which);
      if (s.swing > 0.15 && s.swing < 0.85) {
        await gapCensus(which, `cell ${which.toUpperCase()} MID-SWING (${s.swing.toFixed(2)})`);
        return true;
      }
      if (s.swing >= 1 || s.swing <= 0) break;
      await page.waitForTimeout(60);
    }
    console.log(`  mid-swing census skipped (swing moved too fast)`);
    return false;
  };

  // --- 2) exterior shot + the public path: street → porch → front door -------
  await teleport(10.5, 2.3, 9.5, 0);
  await page.waitForTimeout(700);
  await shot('01-exterior-facade');
  await teleport(10.5, 2.3, 6.0, 0);
  await page.waitForTimeout(500);
  const atDesk = await walk('z', -1, -1.0, 45000, 'street → porch → office, at the desk');
  ok(
    'public path: walked in through the front doorway; the desk BLOCKS straight-on',
    Math.abs(atDesk.z - (-0.2)) < 0.16 && atDesk.z < 0,
    `player z=${atDesk.z.toFixed(3)} (expected stop −0.2 = desk's yaw-conservative 1×1 box south face −0.55 + radius)`,
  );
  await shot('02-office-desk');
  // Office interior: the rebuilt gun cabinet + gun rack + badge line.
  await teleport(12.1, 2.3, 0.4, -Math.PI / 2 + 0.5);
  await page.waitForTimeout(600);
  await shot('02b-office-cabinet-rack');

  // --- 3) walk around the desk, then office → jail corridor ------------------
  await teleport(11.9, 2.3, 0.2, 0);
  await page.waitForTimeout(400);
  const deskBack = await walk('z', -1, -2.6, 45000, 'around the desk east side');
  ok('office: walked around the desk to the chair/board line', deskBack.z <= -2.4,
    `player (${deskBack.x.toFixed(2)}, ${deskBack.z.toFixed(2)}) — open floor behind the desk`);
  await teleport(12.0, 2.3, 0.7, -Math.PI / 2); // 0.9 m run-up — the turn blend must never wedge the door jamb
  await page.waitForTimeout(400);
  const inCorr = await walk('x', 1, 13.5, 45000, 'through the divider doorway');
  ok('office → jail: walked through the divider doorway into the corridor', inCorr.x >= 13.45,
    `player x=${inCorr.x.toFixed(3)} — crossed the divider's east face + radius (13.45)`);
  await teleport(13.65, 2.3, Math.max((await player()).z, 0.55), 0); // lane x=13.65: 0.55 m off BOTH faces (divider 13.1 / door-B box 14.2) — circle+skin clear
  await page.waitForTimeout(400);
  const corrN = await walk('z', -1, -2.6, 45000, 'north up the corridor');
  ok('corridor: walked north between the two CLOSED cell doors', corrN.z <= -2.4,
    `player (${corrN.x.toFixed(2)}, ${corrN.z.toFixed(2)}) — lane clear of both door colliders`);
  await shot('03-jail-corridor');

  // --- 4) CELL A: closed blocks → E opens → walk in → E closes → holds -------
  await teleport(13.65, 2.3, -3.5, -Math.PI / 2);
  await page.waitForTimeout(600);
  a = await cell('a');
  ok('cell A: [E] prompt shows at the closed door', a.prompt.includes('Open cell one'), `prompt="${a.prompt}"`);
  const blockedA = await walk('x', 1, 14.6, 20000, 'at the closed cell A door');
  ok(
    'cell A: CLOSED door BLOCKS the walk (stops at collider face + radius)',
    Math.abs(blockedA.x - 13.85) < 0.1,
    `player x=${blockedA.x.toFixed(3)} (expected stop 13.85 = door box west face 14.2 − radius)`,
  );
  await pressUntil('a', (s) => s.swing >= 1 && s.collider === false, 'cell A open');
  a = await cell('a');
  ok('cell A: open — swing complete + collider off + hinge +80° inward',
    a.swing >= 1 && a.collider === false && Math.abs(a.hingeYaw - 1.396) < 1e-3,
    `swing=${a.swing.toFixed(3)} collider=${a.collider} hinge=${a.hingeYaw.toFixed(3)}`);
  await shot('04-cellA-open');
  await gapCensus('a', 'cell A OPEN');
  await pressUntil('a', (s) => s.swing <= 0.02, 'cell A re-closed for mid-swing probe');
  await midSwingCensus('a');
  await pressUntil('a', (s) => s.swing <= 0 && s.collider === true, 'cell A closed again');
  await gapCensus('a', 'cell A CLOSED');
  await pressUntil('a', (s) => s.swing >= 1 && s.collider === false, 'cell A reopened for walk-in');
  await teleport(13.65, 2.3, -3.5, -Math.PI / 2);
  await page.waitForTimeout(400);
  const inA = await walk('x', 1, 15.6, 45000, 'through the open cell A door');
  ok('cell A: walked THROUGH the open doorway INTO the cell', inA.x >= 15.4 && inA.x < 16.4,
    `player (${inA.x.toFixed(2)}, ${inA.z.toFixed(2)}) — inside cell A, clear of the cot`);
  await teleport(15.55, 2.3, -3.5, Math.PI / 2); // deterministic in-range re-face (the walk's momentum coast is out of range at 1 fps)
  await page.waitForTimeout(1400);
  await pressUntil('a', (s) => s.swing <= 0 && s.collider === true, 'cell A re-closed'); // close from inside — the cell now holds the player
  a = await cell('a');
  ok('cell A: re-closed — collider re-armed', a.collider === true && Math.abs(a.hingeYaw) < 1e-3,
    `collider=${a.collider} hinge=${a.hingeYaw.toFixed(3)}`);
  const heldA = await walk('x', -1, 14.6, 20000, 'west from inside the closed cell');
  ok(
    'cell A: the CLOSED door holds the player INSIDE (blocked from the cell side)',
    Math.abs(heldA.x - 15.55) < 0.12,
    `player x=${heldA.x.toFixed(3)} (expected stop 15.55 = door box east face 15.2 + radius)`,
  );
  await pressUntil('a', (s) => s.swing >= 1 && s.collider === false, 'cell A re-opened');
  await teleport(15.6, 2.3, -3.5, Math.PI / 2);
  await page.waitForTimeout(400);
  const outA = await walk('x', -1, 13.6, 45000, 'back out of cell A');
  ok('cell A: walked back OUT through the open doorway', outA.x <= 13.75,
    `player x=${outA.x.toFixed(3)}`);
  await pressUntil('a', (s) => s.swing <= 0 && s.collider === true, 'cell A final closed');

  // --- 5) CELL B: same chain, abbreviated -------------------------------------
  await teleport(13.65, 2.3, -0.35, -Math.PI / 2);
  await page.waitForTimeout(600);
  b = await cell('b');
  ok('cell B: [E] prompt shows at the closed door', b.prompt.includes('Open cell two'), `prompt="${b.prompt}"`);
  const blockedB = await walk('x', 1, 14.6, 20000, 'at the closed cell B door');
  ok(
    'cell B: CLOSED door BLOCKS the walk',
    Math.abs(blockedB.x - 13.85) < 0.1,
    `player x=${blockedB.x.toFixed(3)} (expected stop 13.85)`,
  );
  await pressUntil('b', (s) => s.swing >= 1 && s.collider === false, 'cell B open');
  b = await cell('b');
  ok('cell B: open — swing complete + collider off', b.swing >= 1 && b.collider === false,
    `swing=${b.swing.toFixed(3)} collider=${b.collider}`);
  await gapCensus('b', 'cell B OPEN');
  await pressUntil('b', (s) => s.swing <= 0.02, 'cell B re-closed for mid-swing probe');
  await midSwingCensus('b');
  await pressUntil('b', (s) => s.swing <= 0 && s.collider === true, 'cell B closed again');
  await gapCensus('b', 'cell B CLOSED');
  await pressUntil('b', (s) => s.swing >= 1 && s.collider === false, 'cell B reopened for walk-in');
  await teleport(13.65, 2.3, -0.35, -Math.PI / 2);
  await page.waitForTimeout(400);
  const inB = await walk('x', 1, 15.6, 45000, 'through the open cell B door');
  ok('cell B: walked THROUGH the open doorway INTO the cell', inB.x >= 15.4 && inB.x < 16.4,
    `player (${inB.x.toFixed(2)}, ${inB.z.toFixed(2)}) — inside cell B`);
  await shot('05-cellB-interior');
  await teleport(15.55, 2.3, -0.35, Math.PI / 2); // deterministic in-range re-face (no cot in cell B's path to catch the coast)
  await page.waitForTimeout(1400);
  await pressUntil('b', (s) => s.swing <= 0 && s.collider === true, 'cell B re-closed'); // close from inside
  b = await cell('b');
  const heldB = await walk('x', -1, 14.6, 20000, 'west from inside the closed cell B');
  ok('cell B: the CLOSED door holds the player INSIDE', Math.abs(heldB.x - 15.55) < 0.12,
    `player x=${heldB.x.toFixed(3)} (expected stop 15.55)`);
  await pressUntil('b', (s) => s.swing >= 1 && s.collider === false, 'cell B re-opened');
  await teleport(15.6, 2.3, -0.35, Math.PI / 2);
  await page.waitForTimeout(400);
  const outB = await walk('x', -1, 13.6, 45000, 'back out of cell B');
  ok('cell B: walked back OUT through the open doorway', outB.x <= 13.75, `player x=${outB.x.toFixed(3)}`);
  await pressUntil('b', (s) => s.swing <= 0 && s.collider === true, 'cell B final closed');

  // --- 6) final states + console ----------------------------------------------
  a = await cell('a');
  b = await cell('b');
  ok('final: both cell doors CLOSED with colliders armed',
    a.swing === 0 && b.swing === 0 && a.collider === true && b.collider === true,
    `A(swing=${a.swing}, col=${a.collider}) B(swing=${b.swing}, col=${b.collider})`);
  ok('console clean', errors.length === 0, errors.slice(0, 4).join(' | ') || 'no page errors');

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n== ${results.length - failed.length}/${results.length} checks passed ==`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
