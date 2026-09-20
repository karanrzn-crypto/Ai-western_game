/* VISUAL-DEFECT ROUND beauty + evidence shots.
 * Aims the camera at each FIXED asset's real def position (benches, hitches,
 * troughs, crates, display case, corral, vegetation) — no hand-guessed coords.
 * Run: node scripts/shots-bug-round.cjs   (dev server on :5176) */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/western_game/shots-bug-round';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:5176/';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
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
    // Park the gameplay rig in EDIT mode so setCamera() owns the view.
    window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab');
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    document.querySelectorAll('.panel, .debug, #hint, #interact-prompt').forEach((el) => { el.style.display = 'none'; });
    const r = window.__westTest.scene()?.getObjectByName('character-root');
    if (r) r.visible = false;
    // Park the horse out of every frame.
    window.__k('keydown', 'KeyN'); window.__k('keyup', 'KeyN');
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__westTest.setDayTime(11));

  /** Find a def position by assetType (+optional world bounds filter). */
  const findPos = (type, bounds) => page.evaluate(([type, b]) => {
    const defs = window.__westTest.objects();
    for (const d of defs) {
      if (d.assetType !== type) continue;
      const p = d.transform.position;
      if (b) {
        if (b.minX !== undefined && p.x < b.minX) continue;
        if (b.maxX !== undefined && p.x > b.maxX) continue;
        if (b.minZ !== undefined && p.z < b.minZ) continue;
        if (b.maxZ !== undefined && p.z > b.maxZ) continue;
      }
      return { x: p.x, y: p.y, z: p.z };
    }
    return null;
  }, [type, bounds]);

  /** Camera at target + dir*dist, aimed at target. */
  const shot = async (label, target, dir, dist) => {
    await page.evaluate(([t, d, dist]) => {
      const len = Math.hypot(d[0], d[1], d[2]) || 1;
      const cx = t[0] + (d[0] / len) * dist;
      const cy = t[1] + (d[1] / len) * dist;
      const cz = t[2] + (d[2] / len) * dist;
      window.__westTest.setDayTime(11);
      window.__westTest.setCamera(cx, cy, cz, t[0], t[1], t[2]);
      const r = window.__westTest.scene()?.getObjectByName('character-root');
      if (r) r.visible = false;
    }, [target, dir, dist]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${label}.png` });
    console.log('shot', label);
  };

  /* 1 — town entrance vegetation (bushes + trees around the gate) */
  const bush = await findPos('town-bush', { maxZ: -30, minX: -30, maxX: 20 });
  if (bush) await shot('01-entrance-bush', [bush.x, 0.5, bush.z], [-1.2, 0.8, -1], 3.2);
  const entTree = await findPos('town-tree', { maxZ: -30, minX: -30, maxX: 10 });
  if (entTree) await shot('02-entrance-tree', [entTree.x, 2, entTree.z], [-1.4, 0.6, -0.8], 7);

  /* 2 — tree + bush + grass close-ups (square entrance pair + scatter) */
  const tree = await findPos('town-tree', { minX: -26, maxX: -23, minZ: -48, maxZ: -44 });
  if (tree) await shot('03-tree-closeup', [tree.x, 2.2, tree.z], [2.2, 0.9, 1.6], 6.5);
  const grass = await findPos('town-grass', { minX: -12, maxX: -4, minZ: -38, maxZ: -32 });
  if (grass) await shot('04-grass-closeup', [grass.x, 0.2, grass.z], [1, 0.5, 1], 1.4);
  const bush2 = await findPos('bush', null);
  if (bush2) await shot('05-bush-closeup', [bush2.x, 0.35, bush2.z], [1.3, 0.5, 1.1], 1.8);

  /* 3 — gunshop interior: display case + crates (aim at the case's GLASS front) */
  const displayCase = await findPos('gunshop-pistol-display-case', null);
  if (displayCase) {
    await page.evaluate(([t]) => {
      const scene = window.__westTest.scene();
      const obj = scene.getObjectByName('gunshop-display-case');
      let fx = 0, fz = 1;
      if (obj) {
        obj.updateWorldMatrix(true, false);
        const e = obj.matrixWorld.elements;
        fx = e[8]; fz = e[10]; // world direction of the group's local +Z (the glass front)
      }
      const cx = t[0] + fx * 0.62, cy = t[1] + 0.78, cz = t[2] + fz * 0.62;
      window.__westTest.setDayTime(21.5); // night — the shop lanterns carry the scene
      window.__westTest.setCamera(cx, cy, cz, t[0], t[1] + 0.02, t[2]);
    }, [[displayCase.x, displayCase.y + 0.12, displayCase.z]]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/06-display-case.png` });
    console.log('shot 06-display-case');
  }
  const ammoCrate = await findPos('gunshop-ammo-crate', null);
  if (ammoCrate) {
    await page.evaluate(([t]) => {
      window.__westTest.setDayTime(21.5);
      window.__westTest.setCamera(t[0] - 0.9, t[1] + 0.95, t[2] + 1.55, t[0], t[1] + 0.2, t[2]);
    }, [[ammoCrate.x, ammoCrate.y + 0.26, ammoCrate.z]]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/07-ammo-crates.png` });
    console.log('shot 07-ammo-crates');
  }
  const counter = await findPos('gunshop-counter', null);
  if (counter) {
    await page.evaluate(([t]) => {
      window.__westTest.setDayTime(21.5);
      window.__westTest.setCamera(t[0] - 1.4, t[1] + 1.15, t[2] + 2.7, t[0], t[1] + 0.5, t[2]);
    }, [[counter.x, counter.y + 0.3, counter.z]]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/08-gunshop-counter.png` });
    console.log('shot 08-gunshop-counter');
  }

  /* 4 — town square: well + benches + crate cluster */
  await shot('09-square-bench', [-4.4, 0.55, 0.5], [-2.6, 1.15, 3.2], 3.6);
  await shot('10-square-crate', [-6.6, 0.5, -13.2], [1.6, 0.9, 1.6], 2.6);
  await shot('11-square-overview', [0, 0.8, 1], [0.5, 5.5, -7], 11);

  /* 5 — hitching post (saloon) close-up */
  await shot('12-hitching-post', [-5.4, 0.6, -19.3], [-2.2, 1, 2.6], 3.4);

  /* 6 — water troughs (farm corral + stable corral) */
  await shot('13-trough-farm', [-11.8, 0.35, -45], [-1.5, 0.65, 0.5], 2.5);
  await shot('14-trough-stable', [-11.7, 0.5, -40.3], [1.8, 0.8, 1.6], 2.6);

  /* 7 — farm corral: aerial + interior + gate */
  await shot('15-farm-corral-aerial', [-10.6, 0, -42.7], [3, 24, 10], 28);
  await shot('16-farm-corral-interior', [-11, 0.6, -44], [-4, 1.4, 8], 11);
  await shot('17-farm-corral-gate', [-14.5, 0.8, -41.9], [-0.5, 1, -4.5], 6.5);

  /* 8 — stable corral + the town aerial */
  await shot('18-stable-corral', [12, 0.6, 28], [-2, 7, -9], 13);
  await shot('19-town-aerial', [0, 0, 0], [26, 46, 34], 60);

  const errs = errors.filter((e) => !e.includes('FontFace') && !e.includes('pointerLock') && !e.includes('favicon'));
  console.log(`SHOTS DONE → ${OUT}`);
  console.log(`PAGE ERRORS: ${errs.length === 0 ? 'NONE' : errs.join(' | ')}`);
  await browser.close();
  process.exit(errs.length === 0 ? 0 : 1);
})();
