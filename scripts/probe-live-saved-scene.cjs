/* Live returning-player probe: does the LIVE site boot correctly when a saved
 * scene (and horse save) already sit in localStorage — the exact state every
 * returning player is in after playing before the sheep deploy?
 * 1. boot live → edit mode → nudge one object → auto-save fires (scene.v22)
 * 2. also write a plausible horse save (the key the game reads)
 * 3. reload → the boot path the returning player takes
 * 4. assert: zero errors, 644 defs (world expansion), sheep spawn once, console clean
 * Run: node scripts/probe-live-saved-scene.cjs https://western-game-psi.vercel.app
 */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'https://western-game-psi.vercel.app';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // --- visit 1: make a saved scene the way a player does ----------------------
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
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
  // Edit mode, select the first managed object through the editor API, nudge it.
  const saved = await page.evaluate(() => {
    window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab');
    const t = window.__westTest;
    const objs = t.objects();
    if (!objs.length) return { ok: false, why: 'no managed objects' };
    // Select + move via the editor: the same path the editor UI uses.
    const uuid = objs[0].uuid;
    t.editorSelect?.(uuid);
    t.editorMove?.(uuid, { x: 0.3 });
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('ai-western-game'));
    return { ok: true, keys, sceneBytes: (localStorage.getItem(keys.find((k) => k.includes('scene')) || '') || '').length };
  });
  console.log('visit1 saved-scene keys:', JSON.stringify(saved));
  // A horse save too (returning players have one).
  await page.evaluate(() => {
    localStorage.setItem('ai-western-game.playable-map.horse.v1',
      JSON.stringify({ version: 1, state: 'companion', position: { x: 2, y: 0, z: -52 } }));
  });

  // --- visit 2: the returning player's boot -----------------------------------
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(6000);
  const boot = await page.evaluate(() => {
    const t = window.__westTest;
    const s = t ? t.sheep() : null;
    const scene = t ? t.scene() : null;
    let roots = 0;
    if (scene) scene.children.forEach((c) => { if (c.name === 'farm-sheep-system') roots += 1; });
    return {
      hooksLive: !!t,
      defCount: t ? t.objects().length : -1,
      sheepCount: s ? s.count : -1,
      sheepRoots: roots,
      savedKeys: Object.keys(localStorage).filter((k) => k.startsWith('ai-western-game')),
    };
  });
  console.log('visit2 boot:', JSON.stringify(boot));
  const checks = [
    ['boot hooks live (no crash)', boot.hooksLive],
    ['expanded world defs load (644 managed + countryside)', boot.defCount === 644],
    ['sheep spawn on saved-scene boot', boot.sheepCount >= 4 && boot.sheepCount <= 7],
    ['exactly ONE sheep root', boot.sheepRoots === 1],
    ['zero console/page errors', errors.length === 0],
  ];
  let fail = 0;
  for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}`); if (!ok) fail += 1; }
  if (errors.length) console.log('errors:', errors.slice(0, 5).join(' | '));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
