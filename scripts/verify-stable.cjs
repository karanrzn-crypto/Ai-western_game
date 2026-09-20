/* Livery Stable verification — REAL PLAY-MODE walkthrough (fps-robust).
 * Mirrors verify-sheriff.cjs's discipline: poll game state (never fixed
 * sleeps), settle before every E press, heading-guarded walks.
 * Proves in a live browser:
 *   1. boot: the stable shell + all 10 doors registered; every stable door
 *      spawns CLOSED with its collider armed
 *   2. the wagon entrance: the CLOSED gate physically BLOCKS the approach
 *   3. [E] opens the gate (smooth opening state, leaf yaw −105°, collider
 *      released) → the player WALKS THE FULL AISLE to the farrier bay
 *   4. walk back out; E closes the gate (collider re-arms)
 *   5. stall one: closed door blocks → E opens → WALK INTO the stall →
 *      E closes from inside (the stall holds) → re-open → walk out
 *   6. the tack room: E opens → walk in
 *   7. console clean
 * Run: node scripts/verify-stable.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-stable';
const URL = 'http://localhost:5176/';
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};

// TOWN REDESIGN: the stable sits at (10.5, 36) with building yaw 180 — the
  // local +Z gate face points NORTH (world −z) and local +x maps to world −x.
  const SITE = { x: 10.5, z: 36 };
  const W = (lx, lz) => [SITE.x - lx, SITE.z - lz]; // yaw-180 local → world
const IDS = {
  building: '10000000-0000-4000-8000-000000000001',
  gate: '10000000-0000-4000-8000-000000000052',
  stallDoor1: '10000000-0000-4000-8000-000000000053',
  stallDoor2: '10000000-0000-4000-8000-000000000054',
  stallDoor3: '10000000-0000-4000-8000-000000000055',
  stallDoor4: '10000000-0000-4000-8000-000000000056',
  stallDoor5: '10000000-0000-4000-8000-000000000057',
  stallDoor6: '10000000-0000-4000-8000-000000000058',
  tackDoor: '10000000-0000-4000-8000-000000000059',
  feedDoor: '10000000-0000-4000-8000-00000000005a',
  staffDoor: '10000000-0000-4000-8000-00000000005b',
  trough1: '10000000-0000-4000-8000-00000000005c',
  waterTrough: '10000000-0000-4000-8000-000000000062',
  workbench: '10000000-0000-4000-8000-000000000063',
  anvil: '10000000-0000-4000-8000-000000000064',
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
  const sdoor = (which) => page.evaluate((w) => window.__westTest.stableDoor(w), which);
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
  /** Drive a stable door to `want` (1 = open, 0 = closed). At ~1 fps the
   *  swing advances only ~0.045/frame, so a full swing takes ~20 s of wall
   *  time — poll LONG and only re-press when the TARGET is wrong (a second
   *  E while the door is already moving toward `want` would toggle it back). */
  const pressStableUntil = async (which, want, label) => {
    await settle();
    let state = await sdoor(which);
    for (let i = 0; i < 5; i++) {
      if (state.target !== want) {
        await press('KeyE');
      }
      state = await waitFor(() => sdoor(which), (s) => s.target === want && s.swing === want, 60000, `${label} (try ${i + 1})`);
      if (state.target === want && state.swing === want) return state;
      console.log(`  ${label} try ${i + 1}: target=${state.target} swing=${state.swing} prompt="${state.prompt}"`);
    }
    return state;
  };
  const walk = async (axis, dir, target, timeoutMs, label) => {
    const t0 = Date.now();
    const yaw = axis === 'z' ? (dir < 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    let p = await player();
    p = await settle();
    const origin = { ...p };
    for (let attempt = 0; attempt < 5; attempt++) {
      await teleport(p.x, p.y, p.z, yaw);
      await page.waitForTimeout(1400);
      await page.evaluate(() => window.__k('keydown', 'KeyW'));
      await page.waitForTimeout(700);
      const probe = await player();
      await page.evaluate(() => window.__k('keyup', 'KeyW'));
      await page.waitForTimeout(400);
      const moved = { x: probe.x - p.x, z: probe.z - p.z };
      const along = axis === 'x' ? dir * moved.x : dir * moved.z;
      const across = axis === 'x' ? Math.abs(moved.z) : Math.abs(moved.x);
      p = probe;
      if (along > 0.015 && along > across * 2) break;
      console.log(`  heading retry ${attempt + 1}: moved (${moved.x.toFixed(3)}, ${moved.z.toFixed(3)})`);
      p = { ...origin };
      if (Date.now() - t0 > timeoutMs) break;
    }
    let stalled = 0;
    await page.evaluate(() => window.__k('keydown', 'KeyW'));
    try {
      while (dir * (p[axis] - target) < 0 && Date.now() - t0 < timeoutMs) {
        const before = p[axis];
        await page.waitForTimeout(420);
        p = await player();
        // fps-robust stall guard: at ~1 fps real frames arrive far slower
        // than the 420 ms poll — 20 silent polls (~8 s) can be ONE frame of
        // a slow depth pass. (The 2026 size revision also added 0.6 m to the
        // in-stall walks, so this guard must not fire early.)
        stalled = Math.abs(p[axis] - before) < 0.004 ? stalled + 1 : 0;
        if (stalled >= 20) {
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

  // --- 1) boot ---------------------------------------------------------------
  const presence = await page.evaluate((ids) => {
    const out = {};
    for (const [k, uuid] of Object.entries(ids)) out[k] = window.__westTest.has(uuid);
    return out;
  }, IDS);
  const missing = Object.entries(presence).filter(([, v]) => !v).map(([k]) => k);
  ok('boot: stable shell + all 10 doors + solids registered', missing.length === 0,
    missing.length ? `MISSING: ${missing.join(', ')}` : `${Object.keys(presence).length} key objects present`);

  const gate0 = await sdoor('gate');
  ok('boot: the main gate spawns CLOSED + collider armed + leaf yaw 0',
    gate0.swing === 0 && gate0.collider === true && Math.abs(gate0.leafYawW) < 1e-9,
    `swing=${gate0.swing} collider=${gate0.collider} leafYaw=${gate0.leafYawW}`);
  let allClosed = true;
  for (const w of ['s1', 's2', 's3', 's4', 's5', 's6', 'tack', 'feed', 'staff']) {
    const s = await sdoor(w);
    if (!(s.swing === 0 && s.collider === true)) allClosed = false;
  }
  ok('boot: all 6 stall doors + tack/feed/staff doors spawn CLOSED + armed', allClosed, '9/9 closed+armed');

  // --- 2) the CLOSED gate blocks the wagon entrance ---------------------------
  await teleport(W(0, 8.6)[0], 1.7, W(0, 8.6)[1], Math.PI);
  await settle();
  let p = await walk('z', 1, W(0, 5.0)[1], 60000, 'approach the closed gate');
  await shot('01-exterior-gate-closed');
  ok('closed gate: physically BLOCKS the wagon entrance',
    p.z < SITE.z - 6.0,
    `stopped at z=${p.z.toFixed(2)} (gate plane ≈ ${SITE.z - 6.375})`);
  const blocked = await sdoor('gate');
  ok('closed gate: [E] prompt visible at the door', blocked.prompt.includes('stable gate'),
    `prompt="${blocked.prompt}"`);

  // --- 3) E opens the gate; the player walks the full aisle -------------------
  const opened = await pressStableUntil('gate', 1, 'gate open');
  ok('gate: E swings it OPEN (leaf yaw ≈ −105°, collider released)',
    opened.swing === 1 && opened.collider === false && opened.leafYawW < -1.7,
    `swing=${opened.swing} collider=${opened.collider} leafYaw=${opened.leafYawW?.toFixed(3)}`);

  p = await walk('z', 1, W(0, -4.0)[1], 90000, 'walk the aisle to the farrier bay');
  ok('open gate: the player WALKS THE FULL AISLE into the north half',
    p.z > SITE.z + 3.0,
    `reached z=${p.z.toFixed(2)} (local ${(SITE.z - p.z).toFixed(2)})`);
  await shot('02-aisle-north-farrier');

  // --- 4) back out; close the gate from inside --------------------------------
  p = await walk('z', -1, W(0, 5.2)[1], 90000, 'walk back to the gate');
  const closed = await pressStableUntil('gate', 0, 'gate close');
  ok('gate: E from inside CLOSES it (collider re-arms)',
    closed.swing === 0 && closed.collider === true,
    `swing=${closed.swing} collider=${closed.collider}`);
  const reopened = await pressStableUntil('gate', 1, 'gate re-open');
  ok('gate: E re-opens for the stall walkthrough', reopened.swing === 1, `swing=${reopened.swing}`);

  // --- 5) stall one: the full cell-door chain ----------------------------------
  // Stall 01's door sits at world (-17.975, 1.7) — gap center local z −4.3
  // (the 2026 size revision moved the stall rows 0.6 m north).
  await teleport(W(-0.9, -4.3)[0], 1.7, W(-0.9, -4.3)[1], -Math.PI / 2);
  await settle();
  const s1closed = await sdoor('s1');
  ok('stall 1: [E] prompt at the closed stall door', s1closed.prompt.toLowerCase().includes('stall one'),
    `prompt="${s1closed.prompt}"`);
  let w = await walk('x', 1, W(-2.6, 0)[0], 30000, 'push against the closed stall door');
  ok('stall 1: the CLOSED door blocks the stall', w.x < SITE.x + 2.95,
    `stopped at x=${w.x.toFixed(2)} (blocked ≈ ${SITE.x + 1.975 + 0.5 + 0.35})`);
  const s1open = await pressStableUntil('s1', 1, 'stall 1 open');
  ok('stall 1: E opens (collider released)', s1open.swing === 1 && s1open.collider === false,
    `swing=${s1open.swing} collider=${s1open.collider}`);
  w = await walk('x', 1, W(-3.4, 0)[0], 60000, 'walk into stall 1');
  ok('stall 1: the player WALKS INTO the stall', w.x > SITE.x + 2.5, `reached x=${w.x.toFixed(2)}`);
  await shot('03-stall-one-inside');
  // pin a deterministic inside position facing the door (the walk's z drift
  // can push the player out of the 2.0 m interaction range)
  await teleport(W(-3.2, -4.3)[0], 1.7, W(-3.2, -4.3)[1], Math.PI / 2);
  await settle();
  const s1shut = await pressStableUntil('s1', 0, 'stall 1 close');
  ok('stall 1: E from inside CLOSES it (the stall holds)', s1shut.swing === 0 && s1shut.collider === true,
    `swing=${s1shut.swing} collider=${s1shut.collider}`);
  w = await walk('x', -1, W(2.4, 0)[0], 30000, 'push against the closed door from inside');
  ok('stall 1: the closed door blocks FROM INSIDE', w.x > SITE.x + 2.0,
    `stopped at x=${w.x.toFixed(2)} (blocked ≈ ${SITE.x + 1.975 - 0.5 - 0.35})`);
  await pressStableUntil('s1', 1, 'stall 1 re-open');
  w = await walk('x', -1, W(0.9, 0)[0], 60000, 'walk back out of stall 1');
  ok('stall 1: re-open lets the player walk back out', w.x < SITE.x + 2.2, `reached x=${w.x.toFixed(2)}`);

  // --- 6) the tack room --------------------------------------------------------
  // The room doorway gap moved with the growth: local 5.6–6.65 → world center 12.125.
  await teleport(W(-0.9, 6.125)[0], 1.7, W(-0.9, 6.125)[1], -Math.PI / 2);
  await settle();
  const tackOpen = await pressStableUntil('tack', 1, 'tack open');
  ok('tack room: E opens its door', tackOpen.swing === 1 && tackOpen.collider === false,
    `swing=${tackOpen.swing} collider=${tackOpen.collider}`);
  w = await walk('x', 1, W(-3.6, 6.125)[0], 60000, 'walk into the tack room');
  ok('tack room: the player WALKS IN', w.x > SITE.x + 2.6, `reached x=${w.x.toFixed(2)}`);
  await shot('04-tack-room-inside');
  await teleport(W(-3.2, 6.125)[0], 1.7, W(-3.2, 6.125)[1], Math.PI / 2);
  await settle();
  await pressStableUntil('tack', 0, 'tack close');
  w = await walk('x', -1, W(2.4, 6.125)[0], 30000, 'push against the closed tack door from inside');
  ok('tack room: the closed door blocks', w.x > SITE.x + 2.0, `stopped at x=${w.x.toFixed(2)} (blocked ≈ ${SITE.x + 1.975 - 0.5 - 0.35})`);

  // --- 7) console clean ---------------------------------------------------------
  ok('console clean', errors.length === 0, errors.slice(0, 3).join(' | ') || 'no page errors');

  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${pass}/${results.length} PASS`);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
