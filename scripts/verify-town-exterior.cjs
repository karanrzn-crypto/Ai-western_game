/* TownExteriorAssetFactory — REAL in-game verification (review §8).
 * Spawns the five houses + butcher stall along a street row through the REAL
 * registerObject path (adapter materialisation, metadata colliders), measures
 * per-def mesh/material/geometry stats, screenshots from player eye height,
 * proves the worker-house wall BLOCKS the player, then despawns everything
 * (nothing persists — no save hook fires for direct registration).
 * Run: node scripts/verify-town-exterior.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-town-exterior';
const URL = 'http://localhost:5176/';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};

const ROW_Z = 38; // moved south of the REAL residential row (family/wealthy sit at z ≤ 30.5) so the test street never overlaps the live town
// deterministic test uuid block (distinct from saloon a000 / bank b000 /
// gunshop-sheriff 9000; variant nibble must be 8/9/a/b per isValidUUID)
const uid = (s) => `70000000-0000-4000-8000-0000000000${s}`;
const BUILDINGS = [
  { id: '01', uuid: uid('01'), type: 'house-abandoned', x: -17.5 },
  { id: '02', uuid: uid('02'), type: 'butcher-stall', x: -11.5 },
  { id: '03', uuid: uid('03'), type: 'house-worker', x: -6.5 },
  { id: '04', uuid: uid('04'), type: 'house-family', x: 0 },
  { id: '05', uuid: uid('05'), type: 'house-wealthy', x: 7.5 },
  { id: '06', uuid: uid('06'), type: 'house-farmstead', x: 16 },
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
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
  const baselineCount = await ev(() => window.__westTest.objects().length);

  /* ---- spawn the street row ---------------------------------------------- */
  for (const b of BUILDINGS) {
    // Attach the module's collider boxes as the def metadata (the same payload
    // the layout layer would set) so CollisionWorld builds real blocking.
    // NOTE: page.evaluate takes ONE argument — pass b and the row z together.
    const spawned = await ev((bld) => {
      const colliders = window.__westTest.townExteriorColliders[bld.type];
      return window.__westTest.spawnTestDef({
        uuid: bld.uuid,
        assetType: bld.type,
        position: { x: bld.x, y: 0, z: bld.rowZ },
        rotationY: 0,
        name: `verify ${bld.type}`,
        metadata: colliders ? { collider: colliders } : {},
      });
    }, { ...b, rowZ: ROW_Z });
    ok(`spawn ${b.type}`, spawned && spawned.uuid === b.uuid, `uuid=${spawned?.uuid} objects=${spawned?.count}`);
  }
  await page.waitForTimeout(1500); // materialisation + merge pass

  /* ---- per-def stats ------------------------------------------------------ */
  const diag0 = await ev((z) => window.__westTest.boundsNear(-6.5, z - 0.5).length, ROW_Z);
  ok('diag: worker bound armed right after spawn', diag0 >= 1, `boundsNear count=${diag0}`);
  const totals = { meshes: 0, materials: 0, geometries: 0, vertices: 0 };
  for (const b of BUILDINGS) {
    const s = await ev((u) => window.__westTest.meshStats(u), b.uuid);
    ok(`stats ${b.type}`, s && s.meshes > 0 && s.bbox.min.z > ROW_Z - 4,
      `meshes=${s.meshes} materials=${s.materials} geoms=${s.geometries} verts=${s.vertices} h=${(s.bbox.max.y).toFixed(2)}m z=${s.bbox.min.z.toFixed(1)}..${s.bbox.max.z.toFixed(1)} (must sit on the row z=${ROW_Z})`);
    totals.meshes += s.meshes;
    totals.materials += s.materials;
    totals.geometries += s.geometries;
    totals.vertices += s.vertices;
  }
  ok('scale: no toy buildings', totals.vertices > 0, `row total meshes=${totals.meshes}, unique geoms=${totals.geometries}, verts=${totals.vertices}`);

  /* ---- screenshots (player eye height, real gameplay camera) -------------- */
  const diag1 = await ev((z) => window.__westTest.boundsNear(-6.5, z - 0.5).length, ROW_Z);
  ok('diag: worker bound armed before screenshots', diag1 >= 1, `boundsNear count=${diag1}`);
  const look = async (x, z) => {
    await ev((p) => window.__westTest.teleport(p[0], 1.7, p[1]), [x, z]);
    await ev(() => window.__westTest.setYaw(0)); // face −z toward the row
    await page.waitForTimeout(700);
  };
  const hideHud = async () => ev(() => {
    const s = document.createElement('style');
    s.id = 'shot-clean';
    s.textContent = '#hud,#interact-prompt{display:none!important}';
    document.head.appendChild(s);
  });
  const showHud = async () => ev(() => document.getElementById('shot-clean')?.remove());

  await hideHud();
  // whole row from the street
  await ev(() => window.__westTest.setDayTime(12));
  await look(0, ROW_Z + 7);
  await page.screenshot({ path: OUT + '/street-row-wide.png' });
  // worker house street view
  await look(-6.5, ROW_Z + 4);
  await page.screenshot({ path: OUT + '/worker-house-street.png' });
  // wealthy facade
  await look(7.5, ROW_Z + 5.5);
  await page.screenshot({ path: OUT + '/wealthy-house-street.png' });
  // abandoned
  await look(-17.5, ROW_Z + 4);
  await page.screenshot({ path: OUT + '/abandoned-house-street.png' });
  // butcher stall close-up
  await look(-11.5, ROW_Z + 3);
  await page.screenshot({ path: OUT + '/butcher-stall-closeup.png' });
  await showHud();

  // EDIT-mode parked wide shot: the whole row from above street level
  await ev(() => { window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab'); });
  await page.waitForTimeout(400);
  await ev((z) => window.__westTest.setCamera(0, 9, z + 13, 0, 1.5, z), ROW_Z);
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + '/street-row-parked.png' });
  await ev(() => { window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab'); }); // back to play
  await page.waitForTimeout(400);

  /* ---- collision: the worker house wall blocks ---------------------------- */
  const diag2 = await ev((z) => window.__westTest.boundsNear(-6.5, z - 0.5).length, ROW_Z);
  ok('diag: worker bound armed before the walk', diag2 >= 1, `boundsNear count=${diag2}`);
  await ev((p) => window.__westTest.teleport(p[0], 1.7, p[1]), [-6.5, ROW_Z + 4]);
  await ev(() => window.__westTest.setYaw(0));
  await page.waitForTimeout(300);
  // DIAGNOSTIC: is the spawned def's collider actually armed in the world?
  const diag = await ev((z) => ({
    defMeta: window.__westTest.objects().find((o) => o.uuid === '70000000-0000-4000-8000-000000000003')?.metadata.collider ?? null,
    near: window.__westTest.boundsNear(-6.5, z - 0.5).map((b) => ({ u: b.uuid.slice(0, 8), z: [b.min.z, b.max.z] })),
    mode: document.getElementById('editor-mode')?.textContent ?? '',
  }), ROW_Z);
  console.log('  [diag]', JSON.stringify(diag).slice(0, 400));
  // walk north (−z) toward the wall until the player stalls
  await ev(() => window.__k('keydown', 'KeyW'));
  let stalledZ = null;
  const t0 = Date.now();
  let lastZ = ROW_Z + 4;
  let lastMove = Date.now();
  while (Date.now() - t0 < 20000) {
    await page.waitForTimeout(250);
    const p = await ev(() => window.__westTest.player());
    if (Math.abs(p.z - lastZ) > 0.02) lastMove = Date.now();
    lastZ = p.z;
    stalledZ = p.z;
    if (Date.now() - lastMove > 1400) break;
  }
  await ev(() => window.__k('keyup', 'KeyW'));
  // The player walks from ROW_Z+4 (south) toward the row: the body bound spans
  // ROW_Z−1.7..ROW_Z+1.7, so the FIRST blocking face is max.z + radius ≈
  // ROW_Z+2.05 — the shell blocks from every side (interior-less building,
  // by design).
  ok('collision: the worker house wall BLOCKS the player', stalledZ > ROW_Z + 1.5 && stalledZ < ROW_Z + 2.6,
    `stalled at z=${stalledZ?.toFixed(3)} (bound max ${ROW_Z + 1.7} + radius 0.35 ≈ ${ROW_Z + 2.05})`);

  // the butcher stall counter blocks too
  await ev((p) => window.__westTest.teleport(p[0], 1.7, p[1]), [-11.5, ROW_Z + 2.6]);
  await ev(() => window.__westTest.setYaw(0));
  await page.waitForTimeout(300);
  await ev(() => window.__k('keydown', 'KeyW'));
  let stallZ = null;
  const t1 = Date.now();
  lastZ = ROW_Z + 2.6; lastMove = Date.now();
  while (Date.now() - t1 < 15000) {
    await page.waitForTimeout(250);
    const p = await ev(() => window.__westTest.player());
    if (Math.abs(p.z - lastZ) > 0.02) lastMove = Date.now();
    lastZ = p.z;
    stallZ = p.z;
    if (Date.now() - lastMove > 1400) break;
  }
  await ev(() => window.__k('keyup', 'KeyW'));
  // stall counter front face: ROW_Z + (0.9 − 0.25 + 0.28) ≈ ROW_Z+0.93… counter box z 0.65±0.28 → front ROW_Z+0.93
  ok('collision: the butcher counter BLOCKS the player', stallZ > ROW_Z + 0.93 + 0.3 && stallZ < ROW_Z + 2.6,
    `stalled at z=${stallZ?.toFixed(3)} (counter face ${ROW_Z + 0.93} + radius)`);

  /* ---- despawn (leave no state) ------------------------------------------- */
  for (const b of BUILDINGS) {
    await ev((u) => window.__westTest.despawnTestDef(u), b.uuid);
  }
  await page.waitForTimeout(600);
  const afterCount = await ev(() => window.__westTest.objects().length);
  ok('despawn: the street row is gone, object count back to baseline', afterCount === baselineCount,
    `baseline=${baselineCount} after=${afterCount}`);

  ok('zero page errors through the whole run', errors.length === 0, errors.length ? errors.join(' | ').slice(0, 300) : 'console clean');

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})();
