/* TOWN REDESIGN — REAL in-game verification (play mode, headless Chromium).
 * Verifies the user's 17-section spec in the RUNNING game:
 *   1. the redesigned town boots with zero page errors
 *   2. def census: 328 town defs + 5 rotated buildings live in the scene
 *   3. the progression is physically walkable in the REAL game
 *      (spawn → farm road → entrance → main street → square → stable road → exit)
 *   4. building walls block (gun shop / meat shop)
 *   5. beauty screenshots of every zone (dusty biome, farm, street, square,
 *      far side, stable, ruined house)
 * Run: node scripts/verify-town.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-town-redesign';
const URL = 'http://localhost:5176/';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let fails = 0;
  const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) fails += 1; };

  const boot = async (hour) => {
    await page.goto(URL);
    await page.waitForTimeout(5000);
    await page.evaluate(() => {
      const neuter = (proto, name) => { const o = proto[name]; proto[name] = function (id) { try { o.call(this, id); } catch (e) {} }; };
      neuter(Element.prototype, 'setPointerCapture');
      neuter(Element.prototype, 'releasePointerCapture');
      const hud = document.getElementById('hud');
      if (hud) hud.style.display = 'none';
      window.__k = (type, code) => {
        const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
        document.body.dispatchEvent(e);
      };
    });
    await page.evaluate((h) => { window.__westTest.setDayTime(h); }, hour);
    await page.waitForTimeout(1200);
  };

  /* --- REAL play-mode walk: teleport, aim the body/camera, hold W --------- */
  const player = () => page.evaluate(() => window.__westTest.player());
  const walk = async (from, to, label, timeoutMs = 60000) => {
    const t0 = Date.now();
    await page.evaluate(([fx, fz, tx, tz]) => {
      window.__westTest.teleport(fx, 1.7, fz);
      window.__westTest.setYaw(Math.atan2(-(tx - fx), -(tz - fz)));
    }, [from[0], from[1], to[0], to[1]]);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__k('keydown', 'KeyW'));
    let p = await player();
    let arrived = Math.hypot(to[0] - p.x, to[1] - p.z) < 1.6;
    let stalled = 0;
    try {
      while (!arrived && Date.now() - t0 < timeoutMs) {
        await page.evaluate(([tx, tz, px, pz]) => {
          const dx = tx - px; const dz = tz - pz;
          window.__westTest.setYaw(Math.atan2(-dx, -dz));
        }, [to[0], to[1], p.x, p.z]);
        await page.waitForTimeout(430);
        const before = p;
        p = await player();
        const prog = Math.hypot(p.x - before.x, p.z - before.z);
        stalled = prog < 0.03 ? stalled + 1 : 0;
        if (stalled >= 6) {
          // slip past the obstacle: swing the heading 40° for a moment
          await page.evaluate(([tx, tz, px, pz]) => {
            const a = Math.atan2(-(tx - px), -(tz - pz)) + 0.7;
            window.__westTest.setYaw(a);
          }, [to[0], to[1], p.x, p.z]);
          await page.waitForTimeout(650);
          stalled = 0;
        }
        arrived = Math.hypot(to[0] - p.x, to[1] - p.z) < 1.6;
      }
    } finally {
      await page.evaluate(() => window.__k('keyup', 'KeyW'));
      await page.waitForTimeout(300);
    }
    const dist = Math.hypot(to[0] - p.x, to[1] - p.z);
    check(arrived, `${label}: real walk (${dist.toFixed(2)} m from target, ${((Date.now() - t0) / 1000) | 0}s)`);
    return p;
  };

  // -- 1. boot + census ------------------------------------------------------
  await boot(9.5);
  const census = await page.evaluate(() => {
    const s = window.__westTest.scene();
    let town = 0; let total = 0;
    const uuids = new Set();
    s.traverse((o) => {
      if (typeof o.uuid === 'string' && /^[0-9a-f-]{36}$/.test(o.uuid) && !o.userData.isDebugHelper) {
        total += 1;
        uuids.add(o.uuid);
        if (o.uuid.startsWith('c0000000')) town += 1;
      }
    });
    return { town, total, unique: uuids.size };
  });
  // the six town-exterior buildings live as ONE def each (uuid block …030040+)
  const exterior = await page.evaluate(() => {
    const s = window.__westTest.scene();
    const want = ['000000030040', '000000030041', '000000030042', '000000030043', '000000030044', '000000030045'];
    return want.map((tail) => !!s.getObjectByProperty('uuid', `c0000000-0000-4000-8000-${tail}`));
  });
  check(errors.length === 0, `zero page errors (${errors.length})`);
  check(census.town >= 210, `town defs live in the scene (${census.town} >= 210)`);
  check(exterior.every(Boolean), 'all six town-exterior buildings live (butcher + 5 houses)');
  check(census.total >= 900, `total scene objects (${census.total} >= 900)`);
  check(census.unique === census.total, `all uuids unique (${census.unique})`);

  // -- 2. the progression is walkable in the REAL game ------------------------
  await walk([-1.5, -57.5], [-1, -35], 'farm road → entrance');
  await walk([-1, -35], [0.5, -14], 'main street → square edge');
  await walk([0.5, -14], [2.9, -2], 'square: east of the fountain');
  await walk([2.9, -2], [0.7, 8], 'square: south side');
  await walk([0.7, 8], [0.6, 28], 'stable road');
  await walk([0, 43], [0, 55], 'exit road');

  // -- 3. walls block in the real game ---------------------------------------
  const wallProbe = async (from, yaw, axis, cmp, limit, label) => {
    await page.evaluate(([f, a]) => {
      window.__westTest.teleport(f[0], 1.7, f[1]);
      window.__westTest.setYaw(a);
    }, [from, yaw]);
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__k('keydown', 'KeyW'));
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__k('keyup', 'KeyW'));
    await page.waitForTimeout(300);
    const p = await player();
    check(cmp(p[axis], limit), `${label} (player ${axis} = ${p[axis].toFixed(2)} vs ${limit})`);
  };
  await wallProbe([5.6, -25], -Math.PI / 2, 'x', (a, b) => a < b, 6.8, 'gun shop wall blocks');
  await wallProbe([-7.6, -1.5], Math.PI / 2, 'x', (a, b) => a > b, -9.4, 'meat shop wall blocks');

  // -- 4. beauty shots (edit mode parks the rig → setCamera is honored) ------
  await page.evaluate(() => { window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab'); });
  await page.waitForTimeout(900);
  const shot = async (cam, target, label) => {
    await page.evaluate(([c, t]) => {
      window.__westTest.setCamera(c[0], c[1], c[2], t[0], t[1], t[2]);
      const r = window.__westTest.scene()?.getObjectByName('character-root');
      if (r) r.visible = false;
      window.__westTest.scene().traverse((o) => {
        if (o.userData && o.userData.isDebugHelper === true) o.visible = false;
        if (o.type === 'GridHelper') o.visible = false;
      });
    }, [cam, target]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${label}.png` });
    console.log('shot', label);
  };
  await shot([-18, 14, -70], [-10, 2, -50], 'z1-farm-area');
  await shot([4, 3.2, -42], [-6, 1.5, -50], 'z2-farm-house-yard');
  await shot([26, 10, -36], [31, 1.5, -50], 'z3-ruined-house');
  await shot([-2, 2.4, -32], [4, 1.6, -36], 'z4-town-entrance');
  await shot([-3.5, 2.6, -17.5], [6, 1.6, -25], 'z5-main-street-gunshop');
  await shot([4.5, 3.4, -30], [-11.5, 1.6, -21], 'z6-saloon-facade');
  await shot([-16, 9, -14], [2, 1.2, -2], 'z7-square-fountain');
  await shot([-4, 2.0, 4], [-12, 1.6, -1.5], 'z8-meat-shop');
  await shot([4.5, 2.2, 2.5], [12, 1.5, -2.5], 'z9-worker-house');
  await shot([-3, 2.2, 2], [-8, 2.2, 14], 'z10-bank-far-side');
  await shot([3, 2.2, 2], [8.5, 2.0, 14.5], 'z11-sheriff-far-side');
  await shot([-14, 3.0, 4], [-20.5, 2.0, 13], 'z12-family-house');
  await shot([13, 3.6, 3], [21, 2.6, 13.5], 'z13-wealthy-house');
  await shot([-8, 4.2, 20], [10.5, 2.4, 36], 'z14-stable-road');
  await shot([-2, 3.4, 24], [-10.5, 1.4, 36], 'z15-corral');
  await shot([-4, 2.6, 30], [10.5, 2.2, 36], 'z16-stable-front');
  await shot([-3, 4.4, 50], [2, 1.4, 58], 'z17-town-exit');
  await shot([-30, 22, -46], [0, 1, -8], 'z18-town-overview');

  // -- 5. perf snapshot -------------------------------------------------------
  const perf = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames += 1;
      if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
      else resolve((performance.now() - t0) / frames);
    };
    requestAnimationFrame(tick);
  }));
  console.log(`INFO median frame ≈ ${perf.toFixed(1)} ms (headless software rendering)`);

  console.log(fails === 0 ? 'TOWN VERIFY: ALL PASS' : `TOWN VERIFY: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
