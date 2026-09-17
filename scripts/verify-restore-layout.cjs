/* VERIFY: authored-layout restore — the fix for the two user-reported floaters.
 *
 * Reproduces the user's polluted save IN BROWSER (the exact strays their
 * screenshots show), proves the new editor "put it back" buttons clean it,
 * and checks the fresh-build rope-hook mount + an FPS baseline.
 *
 *   1. boot: authored snapshot == registry size (nothing lost)
 *   2. pollute like the user's save through the REAL UI path (click-select +
 *     numeric panel): rope coil → mid-aisle near stall 4 at eye height;
 *     hanging blanket → inside stall 1 at head height
 *   3. POV screenshots match the user's two reports (torus + salmon ∏)
 *   4. «بازنشانی شیء» returns the selected object to its authored spot
 *   5. «بازگردانی همه» → EVERY def reads unmodified vs authored; screenshot
 *   6. live geometry: the rope hook overlaps the loft-edge board
 *   7. FPS baseline at the stable POV (play mode, no editor)
 * Run: node scripts/verify-restore-layout.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-two-issues';
const URL = 'http://localhost:5176/';

const ROPE = '10000000-0000-4000-8000-0000000000b8';
const BLANKET = '10000000-0000-4000-8000-00000000008e';

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass });
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
  await page.waitForTimeout(3500);

  await page.evaluate(() => {
    const neuter = (proto, name) => { const o = proto[name]; proto[name] = function (id) { try { o.call(this, id); } catch (e) {} }; };
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
    window.__k = (type, code) => {
      const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
    };
    window.__hideRanger = () => {
      const r = window.__westTest.scene()?.getObjectByName('character-root');
      if (r) r.visible = false;
    };
  });

  const defPos = (uuid) => page.evaluate((u) => {
    const d = window.__westTest.objects().find((o) => o.uuid === u);
    return d ? { x: +d.transform.position.x.toFixed(3), y: +d.transform.position.y.toFixed(3), z: +d.transform.position.z.toFixed(3) } : null;
  }, uuid);
  const modified = (uuid) => page.evaluate((u) => window.__westTest.isModifiedVsAuthored(u), uuid);
  const toggleEdit = async () => {
    await page.evaluate(() => window.__k('keydown', 'Tab'));
    await page.waitForTimeout(350);
    await page.evaluate(() => window.__k('keyup', 'Tab'));
    await page.waitForTimeout(700);
  };

  const managedCount = await page.evaluate(() => window.__westTest.objects().length);
  const authoredCount = await page.evaluate(() => window.__westTest.authoredCount());
  ok('boot: authored snapshot covers the whole registry', authoredCount === managedCount, `authored=${authoredCount} managed=${managedCount}`);

  /* ---------- aiming helpers (PLAY mode only — edit parks the camera) ------ */
  const pose = () => page.evaluate(() => {
    const p = window.__westDebug();
    return { cam: p.cam, yaw: Math.atan2(-p.view[0], -p.view[2]), pitch: Math.asin(Math.max(-1, Math.min(1, p.view[1]))) };
  });
  const drag = async (dx, dy) => {
    await page.evaluate(({ dx, dy }) => {
      const canvas = document.querySelector('canvas');
      const cx = innerWidth / 2, cy = innerHeight / 2;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX: cx, clientY: cy, pointerId: 7, bubbles: true }));
      for (let i = 1; i <= 8; i++) window.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + (dx * i) / 8, clientY: cy + (dy * i) / 8, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { button: 2, bubbles: true }));
    }, { dx, dy });
    await page.waitForTimeout(650);
  };
  const aimAt = async (tx, ty, tz) => {
    for (let iter = 0; iter < 9; iter++) {
      const p = await pose();
      const dx = tx - p.cam[0], dyy = ty - p.cam[1], dz = tz - p.cam[2];
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(dyy, Math.hypot(dx, dz));
      const dyaw = Math.atan2(Math.sin(wantYaw - p.yaw), Math.cos(wantYaw - p.yaw));
      const dpitch = wantPitch - p.pitch;
      if (Math.abs(dyaw) < 0.02 && Math.abs(dpitch) < 0.02) return;
      await drag(-Math.max(-0.4, Math.min(0.4, dyaw)) / 0.0018, -Math.max(-0.25, Math.min(0.25, dpitch)) / 0.0018);
    }
  };
  /** EDIT mode: click the world point currently under the parked camera. */
  const clickWorldPoint = async (wx, wy, wz) => {
    const screen = await page.evaluate(([x, y, z]) => {
      const cam = window.__westTest.camera();
      const v = new (window.__westTest.scene().position.constructor)(x, y, z).project(cam);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
    }, [wx, wy, wz]);
    await page.mouse.click(screen.x, screen.y);
    await page.waitForTimeout(900);
  };
  const setPanel = async (id, value) => {
    await page.evaluate((sel) => { const el = document.getElementById(sel); el.focus(); el.value = ''; }, id);
    await page.type(`#${id}`, value);
    await page.waitForTimeout(350);
    await page.evaluate((sel) => document.getElementById(sel).blur(), id);
  };

  await page.evaluate(() => window.__westTest.setDayTime(18.6));

  /* ---------- 2a) ROPE: aim (play) → TAB → click-select → panel-pollute ----- */
  await page.evaluate(() => { window.__westTest.teleport(-15.9, 0.12, 8.6); window.__hideRanger(); });
  await page.waitForTimeout(1000);
  // aim + click the coil's BOTTOM TUBE (a ray through the ring's center would
  // pass through the hole and select the wall behind it)
  await aimAt(-16.25, 2.43, 5.5);
  await toggleEdit(); // enter edit mode; the camera parks on the rope view
  await clickWorldPoint(-16.25, 2.43, 5.5);
  const selName = await page.evaluate(() => document.getElementById('editor-selection')?.textContent ?? '');
  ok('edit: the rope coil is click-selectable', selName.includes('طناب'), `selected="${selName}"`);

  await setPanel('sel-pos-x', '-14.6');
  await setPanel('sel-pos-y', '1.45');
  await setPanel('sel-pos-z', '1.5');
  await page.waitForTimeout(500);
  ok('pollute: rope moved off its authored spot (the user\'s torus)', await modified(ROPE) === true, `pos=${JSON.stringify(await defPos(ROPE))}`);

  const resetArmed = await page.evaluate(() => !document.getElementById('sel-reset')?.disabled);
  ok('UI: «بازنشانی شیء» armed for a deviating selection', resetArmed === true, `disabled=${!resetArmed}`);
  await page.click('#sel-reset');
  await page.waitForTimeout(900);
  const ropeBack = await defPos(ROPE);
  ok('restore: rope back at its authored hook', await modified(ROPE) === false
    && Math.abs(ropeBack.x - (-16.25)) < 1e-6 && Math.abs(ropeBack.y - 2.56) < 1e-6,
    `pos=${JSON.stringify(ropeBack)}`);
  await toggleEdit(); // back to play for the next aim

  /* ---------- 2b) BLANKET: same UI pollution path --------------------------- */
  await page.evaluate(() => { window.__westTest.teleport(-20.4, 0.15, 11.3); window.__hideRanger(); });
  await page.waitForTimeout(1000);
  // The tack room is a closed box: a third-person camera outside its south
  // wall lets the WALL eat the click. First person keeps the camera inside.
  await page.evaluate(() => window.__k('keydown', 'KeyV'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__k('keyup', 'KeyV'));
  await page.waitForTimeout(800);
  await aimAt(-21.28, 1.645, 11.8);
  await toggleEdit();
  await clickWorldPoint(-21.28, 1.645, 11.8);
  const selName2 = await page.evaluate(() => document.getElementById('editor-selection')?.textContent ?? '');
  ok('edit: the hanging blanket is click-selectable', selName2.includes('پتو'), `selected="${selName2}"`);
  await setPanel('sel-pos-x', '-19.5');
  await setPanel('sel-pos-y', '1.5');
  await setPanel('sel-pos-z', '1.2');
  await page.waitForTimeout(500);
  ok('pollute: blanket moved into stall 1 (the user\'s pink ∏)', await modified(BLANKET) === true, `pos=${JSON.stringify(await defPos(BLANKET))}`);
  await toggleEdit(); // play mode for POV screenshots

  /* ---------- 3) POV screenshots = the user's two reports ------------------- */
  await page.evaluate(() => { window.__westTest.teleport(-15.3, 0.15, 2.7); window.__hideRanger(); });
  await page.waitForTimeout(900);
  await aimAt(-14.6, 1.45, 1.5);
  await page.evaluate(() => window.__hideRanger());
  await page.screenshot({ path: `${OUT}/verify1-user-torus.png` });
  await page.evaluate(() => { window.__westTest.teleport(-19.1, 0.15, 1.8); window.__hideRanger(); });
  await page.waitForTimeout(900);
  await aimAt(-19.5, 1.5, 1.2);
  await page.evaluate(() => window.__hideRanger());
  await page.screenshot({ path: `${OUT}/verify2-user-blanket.png` });

  /* ---------- 5) «بازگردانی همه» fixes the whole map ------------------------- */
  await toggleEdit();
  await page.click('#sel-reset-all');
  await page.waitForTimeout(1300);
  const anyModified = await page.evaluate(() => window.__westTest.objects().some((d) => window.__westTest.isModifiedVsAuthored(d.uuid) === true));
  ok('restore-all: zero objects deviate from the authored layout', anyModified === false, 'isModifiedVsAuthored false everywhere');
  ok('restore-all: blanket back on its bar', await modified(BLANKET) === false, `pos=${JSON.stringify(await defPos(BLANKET))}`);
  await page.screenshot({ path: `${OUT}/verify3-restored.png` });
  await toggleEdit();

  /* ---------- 6) live geometry: hook mounts on the edge board --------------- */
  const hookLive = await page.evaluate(() => {
    const scene = window.__westTest.scene();
    const ropeRoot = scene.getObjectByProperty('uuid', '10000000-0000-4000-8000-0000000000b8');
    const shell = scene.getObjectByProperty('uuid', '10000000-0000-4000-8000-000000000001');
    const hook = ropeRoot?.getObjectByName('loft-rope-hook');
    const board = shell?.getObjectByName('loft-edge-board');
    if (!hook || !board) return { ok: false };
    hook.updateWorldMatrix(true, true); board.updateWorldMatrix(true, true);
    const boxOf = (o) => {
      o.geometry.computeBoundingBox();
      return o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    };
    const h = boxOf(hook), b = boxOf(board);
    const ov = (c) => Math.min(h.max[c], b.max[c]) - Math.max(h.min[c], b.min[c]);
    return { ok: true, x: ov('x'), y: ov('y'), z: ov('z') };
  });
  ok('geometry: rope hook embedded in the loft-edge board',
    hookLive.ok && hookLive.x > 0 && hookLive.y >= 0.02 && hookLive.z > 0,
    `overlap x=${hookLive.x?.toFixed(3)} y=${hookLive.y?.toFixed(3)} z=${hookLive.z?.toFixed(3)}`);

  /* ---------- 7) FPS baseline at the stable (play mode) ---------------------- */
  await page.evaluate(() => { window.__westTest.teleport(-15.3, 0.15, 2.7); window.__hideRanger(); });
  await page.waitForTimeout(1200);
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0; const start = performance.now();
    const tick = () => {
      frames += 1;
      if (performance.now() - start < 3000) requestAnimationFrame(tick);
      else resolve({ fps: +(frames / ((performance.now() - start) / 1000)).toFixed(1) });
    };
    requestAnimationFrame(tick);
  }));
  ok('perf: baseline captured (§9 reference)', fps.fps > 0, `${fps.fps} FPS (headless)`);

  ok('console clean', errors.length === 0, errors.slice(0, 3).join(' | ') || 'no page errors');
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
