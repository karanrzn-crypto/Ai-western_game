/* BASELINE PROBE — evidence before any change (§7/§8: measure first).
 * 1) Interior/exterior day-shadow screenshots at 3 hours (gunshop/saloon/stable/bank)
 * 2) Prop closeups: display case, workbench, ammo shelf (§1/§3/§4 current state)
 * 3) Perf baseline (draw calls, frame time) with current shadow config.
 * Run: node scripts/probe-shadow-baseline.cjs   (dev server on :5176) */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-shadow-baseline';
const URL = 'http://localhost:5176/';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const boot = async (hour) => {
    await page.goto(URL);
    await page.waitForTimeout(4200);
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
    await page.evaluate((h) => {
      window.__westTest.setDayTime(h);
      window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab'); // park camera rig
      const r = window.__westTest.scene()?.getObjectByName('character-root');
      if (r) r.visible = false;
      window.__westTest.scene().traverse((o) => { if (o.userData && o.userData.isDebugHelper === true) o.visible = false; });
    }, hour);
    await page.waitForTimeout(1200); // let ShadowScheduler rebuild at this hour
  };

  const shot = async (cam, target, label) => {
    await page.evaluate(([c, t]) => {
      window.__westTest.setCamera(c[0], c[1], c[2], t[0], t[1], t[2]);
      const r = window.__westTest.scene()?.getObjectByName('character-root');
      if (r) r.visible = false;
    }, [cam, target]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${label}.png` });
    console.log('shot', label);
  };

  // ---- §5-7 shadow evidence: same interior/exterior views at 3 hours ----
  for (const h of [8, 12, 15]) {
    await boot(h);
    // gunshop interior: wide view from above door toward workshop
    await shot([14, 2.4, 11.2], [14.2, 0.9, 6.4], `h${h}-gunshop-interior-wide`);
    // gunshop interior: floor near entrance (door light patch + building shadow)
    await shot([13.2, 1.9, 10.6], [14.5, 0.35, 8.2], `h${h}-gunshop-entrance-floor`);
    // gunshop exterior: street view (building shadow on ground)
    await shot([9.5, 2.6, 16.5], [15, 1.2, 9.5], `h${h}-gunshop-exterior-street`);
    // saloon interior
    await shot([0, 2.4, 4.5], [0, 1.0, -1], `h${h}-saloon-interior`);
    // stable interior (stall row)
    await shot([-5, 2.2, -4], [-5, 1.2, 0.5], `h${h}-stable-interior`);
    // sheriff office interior
    await shot([-8, 2.2, 10.5], [-8, 1.0, 6.5], `h${h}-sheriff-interior`);
    // town overview from SW high
    await shot([-18, 12, 26], [2, 1.5, 4], `h${h}-town-overview`);
  }

  // ---- §1/§3/§4 prop closeups (10:00 daylight) ----
  await boot(10);
  await shot([12.4, 2.35, 9.0], [12.95, 1.32, 9.9], 'prop-display-case-close');
  await shot([13.9, 2.5, 10.9], [12.95, 1.25, 9.9], 'prop-display-case-top');
  await shot([13.2, 1.85, 6.6], [15.5, 1.15, 4.95], 'prop-workbench-close');
  await shot([16.2, 1.7, 9.9], [18.1, 1.35, 9.9], 'prop-shelf-close');
  await shot([15.2, 2.3, 8.2], [17.6, 0.95, 9.6], 'prop-shelf-angle');

  // ---- perf snapshot with current shadow config ----
  const perf = await page.evaluate(async () => {
    const scene = window.__westTest.scene();
    let tris = 0; const geos = new Set(); const mats = new Set(); let meshCount = 0; let shadowCasters = 0;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      meshCount += 1;
      if (o.castShadow) shadowCasters += 1;
      const g = o.geometry; if (!g) return;
      const p = g.attributes.position; if (!p) return;
      tris += (g.index ? g.index.count : p.count) / 3;
      geos.add(g.uuid);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m && mats.add(m.uuid));
    });
    const measure = async (ms) => new Promise((res) => {
      const t0 = performance.now(); const ts = [];
      const tick = () => { ts.push(performance.now()); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ n: ts.length, med: +d[Math.floor(d.length / 2)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1) }); } };
      requestAnimationFrame(tick);
    });
    const base = await measure(2500);
    const stats = window.__westTest.stats ? window.__westTest.stats() : null;
    return {
      base, stats, meshCount, shadowCasters,
      totalTris: Math.round(tris), uniqueGeos: geos.size, uniqueMats: mats.size,
    };
  });
  console.log('PERF baseline:', JSON.stringify(perf, null, 1));

  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
