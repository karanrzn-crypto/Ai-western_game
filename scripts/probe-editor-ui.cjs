/* LAYOUT-INDEPENDENT editor-UI probe (the verify-restore-layout coordinates
 * are pre-redesign; this probe exercises the SAME contract at a CURRENT site:
 * enter edit mode → click-select a plaza bench → pollute via the numeric
 * panel → assert «بازنشانی شیء» arms → reset → assert restore).
 * Run: node scripts/probe-editor-ui.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:5176/');
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
  });
  const out = {};

  // 1) find a managed def at the plaza (fountain-adjacent bench) by name.
  out.target = await page.evaluate(() => {
    const defs = window.__westTest.objects();
    const bench = defs.find((d) => String(d.metadata?.name).includes('نیمکت'));
    return bench ? { uuid: bench.uuid, name: bench.metadata.name, pos: bench.transform.position } : null;
  });
  if (!out.target) throw new Error('no bench def found');

  // 2) park the camera in edit mode looking at the bench, then click it.
  await page.evaluate(([x, , z]) => {
    window.__westTest.teleport(x, 0, z + 4);
  }, [out.target.pos.x, 0, out.target.pos.z]);
  await page.waitForTimeout(700);
  // enter edit mode (TAB) — the camera parks; then aim at the bench.
  await page.evaluate(() => window.__k('keydown', 'Tab'));
  await page.evaluate(() => window.__k('keyup', 'Tab'));
  await page.waitForTimeout(500);
  const aim = await page.evaluate(([tx, ty, tz]) => {
    const cam = window.__westTest.camera();
    cam.position.set(tx, ty + 2.2, tz + 4.5);
    cam.lookAt(tx, ty, tz);
  }, [out.target.pos.x, out.target.pos.y ?? 0.5, out.target.pos.z]);
  void aim;
  await page.waitForTimeout(300);
  const screen = await page.evaluate(([x, y, z]) => {
    const cam = window.__westTest.camera();
    const v = new (window.__westTest.scene().position.constructor)(x, y, z).project(cam);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  }, [out.target.pos.x, (out.target.pos.y ?? 0.5), out.target.pos.z]);
  await page.mouse.click(screen.x, screen.y);
  await page.waitForTimeout(900);
  out.selected = await page.evaluate(() => document.getElementById('editor-selection')?.textContent ?? '');
  out.selectOk = out.selected.length > 0 && out.selected !== 'None';

  // 3) pollute via the numeric panel.
  await page.evaluate(() => { const el = document.getElementById('sel-pos-x'); el.focus(); el.value = ''; });
  await page.type('#sel-pos-x', String(out.target.pos.x + 3));
  await page.waitForTimeout(400);
  out.modified = await page.evaluate((u) => window.__westTest.isModifiedVsAuthored(u), out.target.uuid);
  out.resetArmed = await page.evaluate(() => !document.getElementById('sel-reset')?.disabled);

  // 4) reset and verify restore.
  await page.click('#sel-reset');
  await page.waitForTimeout(900);
  out.restoredUnmodified = await page.evaluate((u) => window.__westTest.isModifiedVsAuthored(u), out.target.uuid) === false;
  out.posAfter = await page.evaluate((u) => {
    const d = window.__westTest.objects().find((o) => o.uuid === u);
    return d.transform.position;
  }, out.target.uuid);

  const pass = out.selectOk && out.modified === true && out.resetArmed && out.restoredUnmodified
    && Math.abs(out.posAfter.x - out.target.pos.x) < 1e-6;
  console.log(JSON.stringify(out, null, 2));
  console.log(`PROBE-EDITOR-UI: ${pass && errors.length === 0 ? 'PASS' : 'FAIL'} (errors: ${errors.length})`);
  await browser.close();
  if (!(pass && errors.length === 0)) process.exit(1);
})().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
