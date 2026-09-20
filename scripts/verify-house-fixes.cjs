/* House-defect fixes — REAL in-game verification + screenshot evidence.
 * Covers the user's 4 reported defects:
 *   §1 pitched-roof gap (worker/family/wealthy/abandoned)  — roof must SIT on walls
 *   §2 family+wealthy doors floating in front of the wall (dark frame protrusion)
 *   §3 family porch planters floating in the air past the deck edge
 *   §4 the cream 'ساختمان' cube building deleted from the map
 * Modes:  node scripts/verify-house-fixes.cjs --before   (evidence only)
 *         node scripts/verify-house-fixes.cjs            (asserts + evidence)
 * Run with the dev server on :5176.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const MODE = process.argv.includes('--before') ? 'before' : 'after';
const OUT = `/home/z/my-project/Ai-western_game/shots-house-fixes/${MODE}`;
const URL = 'http://localhost:5176/';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};

const PLACEMENTS = {
  worker: { uuid: 'c0000000-0000-4000-8000-000000030041', x: 12, z: -2.5, yaw: -90 },
  family: { uuid: 'c0000000-0000-4000-8000-000000030042', x: -20.5, z: 13, yaw: 180 },
  wealthy: { uuid: 'c0000000-0000-4000-8000-000000030043', x: 21, z: 13.5, yaw: 180 },
  abandoned: { uuid: 'c0000000-0000-4000-8000-000000030045', x: 31, z: -50, yaw: 0 },
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
    const neuter = (proto, name) => {
      const orig = proto[name];
      proto[name] = function (id) { try { orig.call(this, id); } catch (e) {} };
    };
    neuter(window.HTMLElement.prototype, 'requestPointerLock');
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
    window.__k = (type, code) => {
      const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
    };
  });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__westTest.setDayTime(12));
  // Park the gameplay rig: TAB edit mode so setCamera is authoritative.
  await ev(() => window.__k('keydown', 'Tab'));
  await ev(() => window.__k('keyup', 'Tab'));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'shot-hud-hide';
    style.textContent = '#hud, #selection-panel, #object-log-panel, #control-hint, #status-message, #interact-prompt, #crosshair { display: none !important; }';
    document.head.appendChild(style);
  });

  // Per-part world boxes for a def: traverse real meshes, world-AABB each via
  // its 8 transformed geometry corners (no THREE import needed — the Vector3
  // constructor comes from any object's `position`).
  const measure = (uuid) => ev((u) => {
    const root = window.__westTest.scene().getObjectByProperty('uuid', u);
    if (!root) return null;
    root.updateMatrixWorld(true);
    const out = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      const V3 = o.position.constructor;
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const w = o.localToWorld(new V3(
          i & 1 ? bb.max.x : bb.min.x,
          i & 2 ? bb.max.y : bb.min.y,
          i & 4 ? bb.max.z : bb.min.z,
        ));
        pts.push({ x: w.x, y: w.y, z: w.z });
      }
      const min = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)), z: Math.min(...pts.map((p) => p.z)) };
      const max = { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)), z: Math.max(...pts.map((p) => p.z)) };
      out.push({ name: o.name || o.parent?.name || 'mesh', min, max });
    });
    return out;
  }, uuid);

  const shots = [
    // [name, cam, target]
    ['worker-34view', [7.5, 2.3, -6.2], [12, 1.7, -2.5]],
    ['worker-side', [12, 2.2, -7.5], [12, 1.8, -2.5]],
    ['family-34view', [-20.5, 2.4, 7.0], [-20.5, 1.9, 13]],
    ['family-door-close', [-18.4, 1.55, 9.8], [-20.2, 1.15, 11.2]],
    ['family-planters', [-17.8, 1.1, 10.0], [-19.4, 0.5, 11.4]],
    ['wealthy-34view', [21, 2.6, 6.0], [21, 2.1, 13.5]],
    ['wealthy-door-close', [21, 1.8, 9.2], [21, 1.5, 11.4]],
    ['abandoned-34view', [35.5, 2.3, -45.5], [31, 1.7, -50]],
    ['building-site', [7.5, 2.6, -6.5], [14, 1.8, -12]],
    ['aerial-residential', [0, 42, 40], [0, 0, 12]],
  ];
  for (const [name, cam, tgt] of shots) {
    await ev((c) => window.__westTest.setCamera(c[0], c[1], c[2], c[3], c[4], c[5]), [...cam, ...tgt]);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }

  /* ---- measured part boxes ------------------------------------------------ */
  const mWorker = await measure(PLACEMENTS.worker.uuid);
  const mFamily = await measure(PLACEMENTS.family.uuid);
  const mWealthy = await measure(PLACEMENTS.wealthy.uuid);
  const mAband = await measure(PLACEMENTS.abandoned.uuid);
  fs.writeFileSync(`${OUT}/part-boxes.json`, JSON.stringify({ mWorker, mFamily, mWealthy, mAband }, null, 2));

  if (MODE === 'after') {
    /* The four shell houses now spawn at SCALE 1.3 (user request) — every
     * world-space expectation below is scaled by HOUSE_SCALE. */
    const HOUSE_SCALE = 1.3;

    /* §4 the building is GONE */
    const buildingState = await ev(() => {
      const defs = window.__westTest.objects();
      const parts = defs.filter((o) => typeof o.metadata?.name === 'string' && o.metadata.name.startsWith('ساختمان'));
      const mesh030 = window.__westTest.scene().getObjectByProperty('uuid', '10000000-0000-4000-a000-000000000030');
      return { partCount: parts.length, mesh030: !!mesh030, total: defs.length };
    });
    ok('§4 ساختمان removed (0 defs, no mesh)', buildingState.partCount === 0 && !buildingState.mesh030,
      `parts=${buildingState.partCount} mesh030=${buildingState.mesh030} objects=${buildingState.total}`);

    /* §2 doors flush on the wall face.
     * The merge pass renames parts ('door-leaf+merged'), so match by prefix.
     * The known wall faces (def position ± depth/2 · 1.3, front facing the
     * street):
     *   family (−12,28)   depth 4.0·1.3 yaw+90  → face x = −12+2.6 = −9.4
     *   wealthy (11.5,26) depth 4.8·1.3 yaw−90  → face x = 11.5−3.12 = 8.38
     * The leaf may sit ≤10 cm proud (frame + leaf face, scaled) — never metres. */
    /* TOWN REDESIGN: family/wealthy sit at yaw 180 on the far side of the
     * square — the door faces NORTH (world −z), so the flush check runs
     * along z. Front wall face z = site.z − (depth·S)/2. */
    const doorFlush = (boxes, label, wallFace) => {
      const leaves = boxes.filter((b) => b.name.startsWith('door-leaf'));
      if (!leaves.length) return ok(`§2 ${label} door leaf found`, false, 'no door-leaf* part');
      const face = Math.min(...leaves.map((b) => b.min.z)); // proud toward the street (−z)
      const proud = Math.abs(face - wallFace);
      ok(`§2 ${label} door flush on wall face (≤10cm, was 1.42/0.58m)`, proud <= 0.10,
        `leaf-face=${face.toFixed(3)} wall-face=${wallFace.toFixed(3)} proud=${proud.toFixed(3)}m`);
    };
    doorFlush(mFamily, 'family', PLACEMENTS.family.z - 2.0 * HOUSE_SCALE);
    doorFlush(mWealthy, 'wealthy', PLACEMENTS.wealthy.z - 2.4 * HOUSE_SCALE);

    /* §3 planters seated ON the deck (deck top y = 0.18·1.3 = 0.234; deck
     * world x −9.4..−7.45, z 25.3..30.7 for the scaled family def).
     * Post-merge the pots live in small 'part+merged' buckets: bottom must
     * sit AT the deck top, inside the deck footprint — and nothing pot-sized
     * may float above the deck any more. */
    const planter = (boxes, label) => {
      const deckTop = 0.18 * HOUSE_SCALE;
      // deck world window for the REDESIGN site: family at (−20.5, 13) yaw 180
      // → deck local x [−2.7, 2.7] z [2.6, 4.55] maps to world x [−23.2, −17.8],
      // z [8.45, 10.4].
      const pots = boxes.filter((b) => (b.max.y - b.min.y) <= 0.35 && (b.max.y - b.min.y) > 0.12
        && Math.abs(b.min.y - deckTop) < 0.02
        && b.min.x > -23.4 && b.max.x < -17.6 && b.min.z > 8.2 && b.max.z < 10.6);
      // floating POT heights only (deck 0.234 + pot ≤ ~0.5); the door knob
      // (a legit 8 cm part at 1.3 m) must not count.
      const floaters = boxes.filter((b) => (b.max.y - b.min.y) <= 0.45 && b.min.y > deckTop + 0.03 && b.min.y < 1.0
        && (b.max.x - b.min.x) < 0.55
        && b.min.x > -23.4 && b.max.x < -17.6 && b.min.z > 8.2 && b.max.z < 10.6);
      ok(`§3 ${label} pots seated on deck (bottom == deck top ${deckTop.toFixed(3)})`, pots.length >= 1 && floaters.length === 0,
        `seatedBuckets=${pots.length} bottoms=[${pots.map((p) => p.min.y.toFixed(3)).join(', ')}] floaters=${floaters.length}`);
    };
    planter(mFamily, 'family');

    /* §1 roof seated: post-merge the panels are inside 'part+merged' buckets,
     * but the gable INFILL groups keep the 'gable-roof' name and their base
     * sits exactly at the eave. Assert base == SCALE·(wallTop − dip) (±1cm)
     * and clearly below the scaled wall top. Dip: ridge·(overhang/run) — the
     * band is CENTRED on the wall-top plane at the face (the anti-poke
     * contract; the old +5 cm oversink let wall corners pierce the roof). */
    const roofSeat = (boxes, label, wallTop, ridge, overhang, halfW) => {
      const run = halfW + overhang;
      const dip = ridge * (overhang / run);
      const infills = boxes.filter((b) => b.name === 'gable-roof');
      if (!infills.length) return ok(`§1 ${label} infills found`, false, 'no gable-roof parts');
      const base = Math.min(...infills.map((b) => b.min.y));
      const apex = Math.max(...infills.map((b) => b.max.y));
      const baseOk = Math.abs(base - HOUSE_SCALE * (wallTop - dip)) <= 0.015;
      const sunkOk = base < HOUSE_SCALE * wallTop - 0.05;
      const apexOk = Math.abs(apex - HOUSE_SCALE * (wallTop - dip + ridge)) <= 0.03;
      ok(`§1 ${label} roof sunk onto walls (base=SCALE·(wallTop−dip))`, baseOk && sunkOk && apexOk,
        `base=${base.toFixed(3)} expected=${(HOUSE_SCALE * (wallTop - dip)).toFixed(3)} wallTop×s=${(HOUSE_SCALE * wallTop).toFixed(3)} apex=${apex.toFixed(3)} expected=${(HOUSE_SCALE * (wallTop - dip + ridge)).toFixed(3)}`);
    };
    roofSeat(mWorker, 'worker', 2.75, 1.15, 0.32, 2.0);
    roofSeat(mFamily, 'family', 3.0, 1.5, 0.42, 2.5);
    roofSeat(mWealthy, 'wealthy', 4.4, 1.75, 0.45, 2.7);
    roofSeat(mAband, 'abandoned', 2.75, 1.15, 0.32, 2.0);
  }

  console.log(`\nmode=${MODE} results=${results.length} pass=${results.filter((r) => r.pass).length} fail=${results.filter((r) => !r.pass).length}`);
  console.log(`console/page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  await browser.close();
  if (MODE === 'after' && results.some((r) => !r.pass)) process.exit(1);
})();
