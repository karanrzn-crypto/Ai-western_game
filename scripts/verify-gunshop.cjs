/* BROWSER VERIFICATION (§29 final gates) — the Gun Shop must:
 *   1. boot with every key object registered, console clean
 *   2. the front door spawns CLOSED + collider armed + hinge yaw 0
 *   3. the CLOSED door physically blocks the entrance (real walk)
 *   4. E opens the door (closed → opening → open), collider released
 *   5. the player walks IN through the doorway (real play-mode walk)
 *   6. the player walks Sales → deep aisle → Workshop (no stuck)
 *   7. E closes the door from inside (collider re-arms), it blocks again
 *   8. geometry: rack guns clear of the wall, case guns under the glass,
 *      nothing of the shop under the ground / through the roof
 *   9. draw-call sanity: the merged gunshop adds a modest call count
 *  10. no page errors; screenshots (exterior / interior / workshop / door)
 * RE-MAPPED 2026-11 to the REDESIGNED town: the shop now stands at
 * GUNSHOP_SITE (10.5, −25) yaw −90° — the front (door plane x ≈ 7.0) faces
 * WEST onto the main street, the interior runs EAST (+X). All walk targets
 * and camera poses below were re-derived from the live def boxes
 * (door leaf x 6.925–7.05 · z −25.55…−24.47; floor x 7.175–13.825 ·
 * z −29.325–−20.675). Axis mapping from the old placement: old −Z (into
 * the shop) → new +X; old +X (across) → new +Z.
 * Run: node scripts/verify-gunshop.cjs (dev server on :5176 or :5173)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-gunshop';
const PORT = process.argv[2] || '5176';
const URL = `http://localhost:${PORT}/`;
const fs = require('fs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const IDS = {
  building: '10000000-0000-4000-9000-000000000001',
  floor: '10000000-0000-4000-9000-000000000002',
  frontDoor: '10000000-0000-4000-9000-00000000000a',
  sign: '10000000-0000-4000-9000-00000000000b',
  windowWest1: '10000000-0000-4000-9000-00000000000c',
  lanternSales: '10000000-0000-4000-9000-000000000010',
  counter: '10000000-0000-4000-9000-000000000012',
  displayCase: '10000000-0000-4000-9000-000000000013',
  rifleRack: '10000000-0000-4000-9000-000000000014',
  shelfUnit: '10000000-0000-4000-9000-000000000015',
  holsterDisplay: '10000000-0000-4000-9000-00000000001c',
  workbench: '10000000-0000-4000-9000-00000000001d',
  vise: '10000000-0000-4000-9000-00000000001e',
  toolRack: '10000000-0000-4000-9000-00000000001f',
  powderKeg: '10000000-0000-4000-9000-000000000020',
  ammoCrate1: '10000000-0000-4000-9000-000000000021',
  ammoCrate2: '10000000-0000-4000-9000-000000000022',
};

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL);
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const neuter = (proto, name) => { try { proto[name] = () => {}; } catch { /* noop */ } };
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
    window.__k = (type, code) => {
      const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
    };
  });
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const player = () => page.evaluate(() => window.__westTest.player());
  const gdoor = () => page.evaluate(() => window.__westTest.gunshopDoor());
  const teleport = (x, y, z, yaw) => page.evaluate(([a, b, c, d]) => {
    window.__westTest.teleport(a, b, c);
    window.__westTest.setYaw(d);
  }, [x, y, z, yaw]);
  const press = async (code) => {
    await page.evaluate((c) => window.__k('keydown', c), code);
    await page.waitForTimeout(1200);
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
  const pressDoorUntil = async (want, label) => {
    await settle();
    let state = await gdoor();
    for (let i = 0; i < 5; i++) {
      if (state.target !== want) await press('KeyE');
      state = await waitFor(gdoor, (s) => s.target === want && s.swing === want, 60000, `${label} (try ${i + 1})`);
      if (state.target === want && state.swing === want) return state;
      console.log(`  ${label} try ${i + 1}: target=${state.target} swing=${state.swing} prompt="${state.prompt}"`);
    }
    return state;
  };
  const walk = async (axis, dir, target, timeoutMs, label) => {
    const t0 = Date.now();
    const yaw = axis === 'z' ? (dir < 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    let p = await settle();
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
        stalled = Math.abs(p[axis] - before) < 0.004 ? stalled + 1 : 0;
        if (stalled >= 10) {
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

  const results = [];
  const ok = (name, pass, detail = '') => {
    results.push({ name, pass });
    console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  [' + detail + ']' : ''));
  };

  // --- 1) boot ----------------------------------------------------------------
  await page.evaluate(() => window.__westTest.setDayTime(10));
  const presence = await page.evaluate((ids) => {
    const out = {};
    for (const [k, uuid] of Object.entries(ids)) out[k] = window.__westTest.has(uuid);
    return out;
  }, IDS);
  const missing = Object.entries(presence).filter(([, v]) => !v).map(([k]) => k);
  ok('boot: shell + door + windows + sign + full interior registered', missing.length === 0,
    missing.length ? `MISSING: ${missing.join(', ')}` : `${Object.keys(presence).length} key objects present`);
  ok('boot: the whole 9000-block def set is live (authored layout, no stale save)',
    await page.evaluate(() => window.__westTest.objects().filter((d) => String(d.uuid).startsWith('10000000-0000-4000-9000')).length >= 34));

  // --- 2) the door spawns CLOSED ------------------------------------------------
  const d0 = await gdoor();
  ok('door spawns CLOSED + collider armed + hinge yaw 0',
    d0.swing === 0 && d0.collider === true && Math.abs(d0.hingeYaw) < 1e-9,
    `swing=${d0.swing} collider=${d0.collider} yaw=${d0.hingeYaw}`);

  // --- 3) the CLOSED door blocks the entrance (real walk) -----------------------
  // The door plane is x ≈ 7.0 (faces west); the porch is west of it. The
  // closed def spawns the yaw-conservative 1×1 box (x 6.5–7.5) — the player
  // circle (r ≈ 0.35) must stop at x ≈ 6.15.
  await teleport(6.0, 1.7, -25.0, -Math.PI / 2); // on the porch, facing the door (east)
  await settle();
  const blocked = await walk('x', 1, 8.0, 30000, 'toward the CLOSED door');
  ok('the CLOSED door physically blocks the entrance', blocked.x < 6.7,
    `stopped at x=${blocked.x.toFixed(2)} (door plane 7.0)`);

  // --- 4) E opens the door -------------------------------------------------------
  const opened = await pressDoorUntil(1, 'E opens the gun shop door');
  ok('door: E opens it — 4-state machine reaches OPEN + collider released',
    opened.swing === 1 && opened.state === 'open' && opened.collider === false,
    `state=${opened.state} collider=${opened.collider} yaw=${(opened.hingeYaw ?? 0).toFixed(3)}`);

  // --- 5) walk IN through the doorway --------------------------------------------
  await teleport(6.1, 1.7, -25.0, -Math.PI / 2);
  await settle();
  let p = await walk('x', 1, 8.1, 60000, 'through the doorway into the sales area');
  ok('the player walks IN through the open doorway', p.x > 7.7,
    `reached x=${p.x.toFixed(2)} (inside = east of 7.4)`);
  await shot('gunshop-interior-sales');

  // --- 6) Sales → deep aisle → Workshop -------------------------------------------
  await teleport(8.1, 1.8, -22.1, -Math.PI / 2);
  await settle();
  p = await walk('x', 1, 12.4, 60000, 'deep aisle back to the workshop');
  ok('Sales → Workshop corridor is walkable (no stuck)', p.x > 11.6,
    `reached x=${p.x.toFixed(2)} (workshop zone)`);
  await shot('gunshop-workshop');

  // --- 7) back to the door, E closes, it blocks again ------------------------------
  await teleport(7.65, 1.8, -25.0, Math.PI / 2);
  await settle();
  const closed = await pressDoorUntil(0, 'E closes the door from inside');
  ok('door: E closes it — collider re-arms', closed.swing === 0 && closed.state === 'closed' && closed.collider === true,
    `state=${closed.state} collider=${closed.collider}`);
  await teleport(8.0, 1.8, -25.0, Math.PI / 2); // clear of the armed 1×1 door box (x ∈ [6.5, 7.5])
  await settle();
  const blockedAgain = await walk('x', -1, 6.2, 30000, 'into the CLOSED door (inside)');
  ok('the re-closed door blocks the way out', blockedAgain.x > 7.6,
    `stopped at x=${blockedAgain.x.toFixed(2)} (inflated box edge 7.5 + radius)`);

  // --- 8) geometry probes (pure-JS world AABBs — THREE is not on window) ---------
  const geo = await page.evaluate((ids) => {
    const scene = window.__westTest.scene();
    // world AABB of an Object3D without THREE: transform the 8 corners of its
    // geometry boundingBox by matrixWorld.
    const boxOf = (obj) => {
      obj.updateWorldMatrix(true, false);
      const bb = obj.geometry.boundingBox;
      if (!bb) obj.geometry.computeBoundingBox();
      const b = obj.geometry.boundingBox;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      const m = obj.matrixWorld.elements;
      for (let i = 0; i < 8; i++) {
        const x = i & 1 ? b.max.x : b.min.x;
        const y = i & 2 ? b.max.y : b.min.y;
        const z = i & 4 ? b.max.z : b.min.z;
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        min[0] = Math.min(min[0], wx); max[0] = Math.max(max[0], wx);
        min[1] = Math.min(min[1], wy); max[1] = Math.max(max[1], wy);
        min[2] = Math.min(min[2], wz); max[2] = Math.max(max[2], wz);
      }
      return { min, max };
    };
    const groupBox = (uuid) => {
      const root = scene.getObjectByProperty('uuid', uuid);
      const out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      root.updateWorldMatrix(true, true);
      root.traverse((o) => {
        if (!o.isMesh) return;
        const b = boxOf(o);
        for (let i = 0; i < 3; i++) {
          out.min[i] = Math.min(out.min[i], b.min[i]);
          out.max[i] = Math.max(out.max[i], b.max[i]);
        }
      });
      return out;
    };
    const find = (uuid, name) => {
      const root = scene.getObjectByProperty('uuid', uuid);
      return root.getObjectByName(name);
    };
    // Merge-aware part measurement: the perf merge pass replaces ≥2
    // same-material static boxes of a def with ONE mesh named
    // `<first source>+merged`, whose userData.mergedFrom lists the source
    // part names in bucket order. Every merged gunshop source is an addBox
    // (24-vertex indexed BoxGeometry), so a part's original world box is
    // reconstructed from its 24-vertex chunk of the merged position
    // attribute (bucket order == mergedFrom order == chunk order), baked in
    // mount-local space — the host's matrixWorld maps it back to the world.
    const partBox = (uuid, name) => {
      const root = scene.getObjectByProperty('uuid', uuid);
      const exact = root.getObjectByName(name);
      if (exact) return boxOf(exact);
      let host = null; let idx = -1;
      root.traverse((o) => {
        if (host || !o.userData || !o.userData.mergedFrom) return;
        const i = o.userData.mergedFrom.indexOf(name);
        if (i >= 0) { host = o; idx = i; }
      });
      if (!host) return undefined;
      const parts = host.userData.mergedFrom.length;
      const pos = host.geometry.attributes.position;
      if (pos.count % parts !== 0) throw new Error('merge chunk mismatch: ' + host.name + ' ' + pos.count + ' verts / ' + parts + ' parts');
      const per = pos.count / parts;
      if (per !== 24) throw new Error('non-box merge chunk (' + per + ' verts) in ' + host.name + ' — chunk math assumes addBox sources');
      const start = idx * per;
      const lmin = [Infinity, Infinity, Infinity]; const lmax = [-Infinity, -Infinity, -Infinity];
      for (let v = start; v < start + per; v++) {
        const x = pos.getX(v); const y = pos.getY(v); const z = pos.getZ(v);
        lmin[0] = Math.min(lmin[0], x); lmax[0] = Math.max(lmax[0], x);
        lmin[1] = Math.min(lmin[1], y); lmax[1] = Math.max(lmax[1], y);
        lmin[2] = Math.min(lmin[2], z); lmax[2] = Math.max(lmax[2], z);
      }
      host.updateWorldMatrix(true, false);
      const m = host.matrixWorld.elements;
      const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < 8; i++) {
        const x = i & 1 ? lmax[0] : lmin[0];
        const y = i & 2 ? lmax[1] : lmin[1];
        const z = i & 4 ? lmax[2] : lmin[2];
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        min[0] = Math.min(min[0], wx); max[0] = Math.max(max[0], wx);
        min[1] = Math.min(min[1], wy); max[1] = Math.max(max[1], wy);
        min[2] = Math.min(min[2], wz); max[2] = Math.max(max[2], wz);
      }
      return { min, max };
    };
    const backing = partBox(ids.rifleRack, 'gunshop-rack-backing');
    let gunsClear = 0;
    let gunsPlane = 0;
    const gunRoot = scene.getObjectByProperty('uuid', ids.rifleRack);
    for (const c of gunRoot.children) {
      if (!c.name.startsWith('gunshop-rack-gun-')) continue;
      const gb = groupBox2(c);
      function groupBox2(g) {
        const out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        g.updateWorldMatrix(true, true);
        g.traverse((o) => {
          if (!o.isMesh) return;
          const b = boxOf(o);
          for (let i = 0; i < 3; i++) {
            out.min[i] = Math.min(out.min[i], b.min[i]);
            out.max[i] = Math.max(out.max[i], b.max[i]);
          }
        });
        return out;
      }
      if (gb.min[2] > backing.max[2] - 0.001) gunsClear += 1; // guns protrude along local +X → world +Z (yaw −90)
      if (gb.max[2] - gb.min[2] < 0.1) gunsPlane += 1;
    }
    const felt = partBox(ids.displayCase, 'gunshop-display-felt');
    const glass = partBox(ids.displayCase, 'gunshop-display-glass');
    const caseRoot = scene.getObjectByProperty('uuid', ids.displayCase);
    let caseGuns = 0;
    let caseGunsFit = 0;
    for (const c of caseRoot.children) {
      if (!c.name.startsWith('gunshop-display-revolver') && c.name !== 'gunshop-display-derringer') continue;
      caseGuns += 1;
      const cb = groupBox3(c);
      function groupBox3(g) {
        const out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        g.updateWorldMatrix(true, true);
        g.traverse((o) => {
          if (!o.isMesh) return;
          const b = boxOf(o);
          for (let i = 0; i < 3; i++) {
            out.min[i] = Math.min(out.min[i], b.min[i]);
            out.max[i] = Math.max(out.max[i], b.max[i]);
          }
        });
        return out;
      }
      if (cb.min[1] >= felt.max[1] - 0.005 && cb.max[1] < glass.min[1] && cb.max[0] < felt.max[0] + 0.02) caseGunsFit += 1;
    }
    let sunk = 0;
    let skyHigh = 0;
    let counted = 0;
    for (const def of window.__westTest.objects()) {
      if (!String(def.uuid).startsWith('10000000-0000-4000-9000')) continue;
      const root = scene.getObjectByProperty('uuid', def.uuid);
      if (!root) continue;
      counted += 1;
      const b = groupBox4(root);
      function groupBox4(g) {
        const out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        g.updateWorldMatrix(true, true);
        g.traverse((o) => {
          if (!o.isMesh) return;
          const b = boxOf(o);
          for (let i = 0; i < 3; i++) {
            out.min[i] = Math.min(out.min[i], b.min[i]);
            out.max[i] = Math.max(out.max[i], b.max[i]);
          }
        });
        return out;
      }
      if (b.min[1] < -0.07) sunk += 1; // corner posts legitimately sink 6 cm (planted-timber look)
      if (b.max[1] > 4.6) skyHigh += 1;
    }
    return {
      backingMaxX: +backing.max[0].toFixed(3),
      gunsClear, gunsPlane, caseGuns, caseGunsFit, sunk, skyHigh, counted,
      glassBottom: +glass.min[1].toFixed(3), feltTop: +felt.max[1].toFixed(3),
    };
  }, IDS);
  ok('rack: all 7 guns clear of the backing + hugging the rack plane',
    geo.gunsClear === 7 && geo.gunsPlane === 7, `clear=${geo.gunsClear}/7 plane=${geo.gunsPlane}/7 backing maxX=${geo.backingMaxX}`);
  ok('display case: all 4 guns seated on the felt, under the glass',
    geo.caseGunsFit === 4 && geo.caseGuns === 4, `fit=${geo.caseGunsFit}/${geo.caseGuns} felt ${geo.feltTop} < glass ${geo.glassBottom}`);
  ok('envelope: nothing of the shop under the ground or over the false front',
    geo.sunk === 0 && geo.skyHigh === 0, `checked=${geo.counted} sunk=${geo.sunk} skyHigh=${geo.skyHigh}`);

  // --- 9) draw calls + shots ---------------------------------------------------------
  const stats = await page.evaluate(() => window.__westTest.stats());
  // Budget re-baselined 2026-11: the redesigned town draws 882–1624 calls
  // outdoors (verify-perf census); this interior view must stay well under.
  ok('draw calls stay in the merged-pass budget', stats.calls > 0 && stats.calls < 1500,
    `calls=${stats.calls} tris=${stats.tris} geos=${stats.geometries} mats≈programs=${stats.programs}`);

  await page.evaluate(() => window.__westTest.setDayTime(10));
  await teleport(1.6, 2.6, -20.2, -2.35); // SW of the porch, looking NE at the west facade
  await page.waitForTimeout(1600);
  await shot('gunshop-exterior');
  await teleport(7.4, 1.8, -25.0, -Math.PI / 2); // just inside, facing the counter (east)
  await page.waitForTimeout(1600);
  await shot('gunshop-counter-view');
  await teleport(10.8, 1.8, -28.5, -2.77); // south side, looking at the rack
  await page.waitForTimeout(1600);
  await shot('gunshop-rack-view');
  await shot('gunshop-door-midnight');

  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
