/* ENVIRONMENT EXPANSION — REAL in-game verification (user 5-section spec).
 * §1 spawn cube removed (no def, no cube mesh at origin; BUILDING intact)
 * §2 map enlarged (ground 100, walls ±49.5, south boundary blocks, prairie walk)
 * §3 butcher stall placed on the commercial row (def + collider + counter blocks)
 * §4 five houses placed (defs + colliders + wall blocking + on-ground AABBs)
 * §5 final sweep: pairwise overlap audit, zero console errors, screenshots
 * Run: node scripts/verify-env-expansion.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-env-expansion';
const URL = 'http://localhost:5176/';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};

const NEW_DEFS = [
  { id: '40', type: 'butcher-stall', name: 'دکه قصابی' },
  { id: '41', type: 'house-worker', name: 'خانه کارگری' },
  { id: '42', type: 'house-family', name: 'خانه خانوادگی' },
  { id: '43', type: 'house-wealthy', name: 'خانه ثروتمند' },
  { id: '44', type: 'house-farmstead', name: 'خانه مزرعه‌ای' },
  { id: '45', type: 'house-abandoned', name: 'خانه متروکه' },
];
const DEFS_UUID = (id) => `c0000000-0000-4000-8000-0000000000${id}`;

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
  await page.waitForTimeout(800);

  /** Teleport, face a direction, walk forward until the player stalls. */
  async function walkUntilStall(x, z, yaw, maxMs = 16000) {
    await ev((p) => window.__westTest.teleport(p[0], 1.7, p[1]), [x, z]);
    await ev((y) => window.__westTest.setYaw(y), yaw);
    await page.waitForTimeout(350);
    await ev(() => window.__k('keydown', 'KeyW'));
    const t0 = Date.now();
    let last = await ev(() => window.__westTest.player());
    let lastMove = Date.now();
    let cur = last;
    while (Date.now() - t0 < maxMs) {
      await page.waitForTimeout(250);
      cur = await ev(() => window.__westTest.player());
      if (Math.abs(cur.x - last.x) + Math.abs(cur.z - last.z) > 0.02) lastMove = Date.now();
      last = cur;
      if (Date.now() - lastMove > 1400) break;
    }
    await ev(() => window.__k('keyup', 'KeyW'));
    return cur;
  }

  /* ---- §1 spawn cube removed -------------------------------------------- */
  const cubeState = await ev(() => {
    const defs = window.__westTest.objects();
    const cube = defs.find((o) => o.metadata && o.metadata.name === 'مکعب اسپاون');
    const oldUuid = defs.find((o) => o.uuid === '10000000-0000-4000-a000-000000000020');
    const meshAtOldUuid = window.__westTest.scene().getObjectByProperty('uuid', '10000000-0000-4000-a000-000000000020');
    const buildingParts = defs.filter((o) => typeof o.metadata?.name === 'string' && o.metadata.name.startsWith('ساختمان'));
    // any surviving mesh at the old building uuid block …030–…036
    const buildingMeshes = ['30', '31', '32', '33', '34', '35', '36']
      .filter((s) => window.__westTest.scene().getObjectByProperty('uuid', `10000000-0000-4000-a000-0000000000${s}`));
    return {
      cubeGone: !cube && !oldUuid && !meshAtOldUuid,
      buildingPartCount: buildingParts.length,
      buildingMeshCount: buildingMeshes.length,
    };
  });
  ok('§1 spawn cube removed (def + uuid + mesh all gone)', cubeState.cubeGone, 'no مکعب اسپاون def, no …020 def, no mesh');
  // UPDATED (user request, round 2): the cream 'ساختمان' cube building is
  // DELETED — no defs, no meshes at its uuid block, and the player can walk
  // its old footprint unblocked.
  ok('§1 ساختمان building removed (0 defs, 0 meshes)',
    cubeState.buildingPartCount === 0 && cubeState.buildingMeshCount === 0,
    `parts=${cubeState.buildingPartCount} meshes=${cubeState.buildingMeshCount}`);

  /* ---- §2 map enlarged ---------------------------------------------------- */
  const mapState = await ev(() => {
    const defs = window.__westTest.objects();
    const ground = defs.find((o) => o.assetType === 'town-ground' || o.assetType === 'ground');
    const wall = (n) => defs.find((o) => o.metadata && o.metadata.name === n);
    const north = wall('دیوار مرزی شمالی');
    const south = wall('دیوار مرزی جنوبی');
    const west = wall('دیوار مرزی غربی');
    const east = wall('دیوار مرزی شرقی');
    return {
      groundSize: ground ? ground.metadata.size : null,
      wallZ: [north && north.transform.position.z, south && south.transform.position.z],
      wallX: [west && west.transform.position.x, east && east.transform.position.x],
      wallLen: north ? north.transform.scale.x : null,
    };
  });
  // TOWN REDESIGN: the map is 120×120 (the 100×100 expansion superseded)
  ok('§2 ground plane 120×120', mapState.groundSize === 120, `ground size=${mapState.groundSize}`);
  ok('§2 boundary walls moved to ±59.5 (length 120; N/S shortened by the corner-seam fix)',
    mapState.wallZ.every((v) => Math.abs(Math.abs(v) - 59.5) < 0.01) &&
    mapState.wallX.every((v) => Math.abs(Math.abs(v) - 59.5) < 0.01) &&
    mapState.wallLen === 118,
    `z=${JSON.stringify(mapState.wallZ)} x=${JSON.stringify(mapState.wallX)} len=${mapState.wallLen}`);

  // §2a the south boundary BLOCKS: walk south from mid-prairie (z=44) →
  // stalls against the wall's inner face (49 − player radius ≈ 48.65).
  const southStall = await walkUntilStall(0, 44, Math.PI);
  ok('§2 south boundary wall blocks the player', southStall.z > 57.5 && southStall.z < 59.2,
    `stalled at z=${southStall.z.toFixed(2)} (inner face 59 − radius)`);
  // §2b the prairie is WALKABLE (no phantom walls in the open south):
  // walk west across open ground from (0, 40) — must travel ≥ 8 m.
  const openWest = await walkUntilStall(0, 43.5, Math.PI / 2, 6000);
  ok('§2 open prairie stays walkable (no phantom blockers)', openWest.x < -7.5,
    `walked west to x=${openWest.x.toFixed(2)} from 0`);

  /* ---- §3+§4 the six new structures -------------------------------------- */
  const defState = await ev((list) => list.map((d) => {
    const defs = window.__westTest.objects();
    const uuid = `c0000000-0000-4000-8000-0000000300${d.id}`;
    const def = defs.find((o) => o.uuid === uuid);
    const stats = window.__westTest.meshStats(uuid);
    return {
      type: d.type,
      present: !!def,
      colliderArmed: !!(def && def.metadata && def.metadata.collider && Array.isArray(def.metadata.collider.boxes) && def.metadata.collider.boxes.length > 0),
      name: def ? def.metadata.name : null,
      pos: def ? def.transform.position : null,
      yaw: def ? def.transform.rotation.y : null,
      bbox: stats ? stats.bbox : null,
      meshes: stats ? stats.meshes : 0,
    };
  }), NEW_DEFS);
  for (const d of defState) {
    ok(`§3/4 placed: ${d.type}`, d.present && d.colliderArmed,
      `name=${d.name} pos=(${d.pos && d.pos.x},${d.pos && d.pos.z}) yaw=${d.yaw} meshes=${d.meshes} collider=boxes[]`);
  }
  const onGround = defState.every((d) => d.bbox && d.bbox.min.y > -0.4 && d.bbox.max.y > 1.5);
  ok('§5 all six structures rise from the ground (min.y > −0.4 seated, max.y > 1.5)', onGround,
    defState.map((d) => `${d.type}:[${d.bbox ? d.bbox.min.y.toFixed(3) : 'n/a'}, ${d.bbox ? d.bbox.max.y.toFixed(2) : 'n/a'}]`).join(' '));

  const overlaps = await ev((ids) => {
    const boxes = ids.map((id) => {
      const s = window.__westTest.meshStats(`c0000000-0000-4000-8000-0000000300${id}`);
      return { id, min: s.bbox.min, max: s.bbox.max };
    });
    const hits = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const sep = a.max.x < b.min.x || b.max.x < a.min.x || a.max.z < b.min.z || b.max.z < a.min.z;
        if (!sep) hits.push(`${a.id}∩${b.id}`);
      }
    }
    return hits;
  }, NEW_DEFS.map((d) => d.id));
  ok('§5 no AABB interpenetration among the six structures', overlaps.length === 0, overlaps.join(',') || 'clean');

  /* ---- REAL player blocking probes --------------------------------------- */
  // Butcher counter front face: local z 0.93 → world x = −12 + 0.93 = −11.07
  // (the redesigned stall site, yaw 90, counter facing the plaza); approaching
  // from the plaza (+x) the player stalls at face + radius ≈ −10.72.
  const stallBlock = await walkUntilStall(-9.6, -1.5, Math.PI / 2);
  ok('§3 butcher counter BLOCKS the player', stallBlock.x > -11.1 && stallBlock.x < -10.3,
    `stalled at x=${stallBlock.x.toFixed(3)} (counter face −11.07 + radius ≈ −10.72)`);
  // Worker house east wall: site (12, −2.5) yaw −90, SCALE 1.3 (model-fix
  // round) → world x = 12 + 1.7·1.3 = 14.21; the player approaches from the
  // plaza (+x) side walking WEST, so the stall is face + radius ≈ 14.56.
  // Shell house → blocks from every side; CollisionWorld scales the box.
  const workerBlock = await walkUntilStall(16.0, -2.5, Math.PI / 2);
  ok('§4 worker-house wall BLOCKS the player', workerBlock.x > 14.3 && workerBlock.x < 14.9,
    `stalled at x=${workerBlock.x.toFixed(3)} (scaled wall face 14.21 + radius ≈ 14.56)`);

  /* ---- screenshots ------------------------------------------------------- */
  // Deterministic framing needs the gameplay rig PARKED: TAB → edit mode
  // (input.setEnabled(false) stops the third-person rig fighting setCamera),
  // hide the debug axes overlay directly on the scene graph, pose, shoot.
  await ev(() => {
    window.__k('keydown', 'Tab');
    window.__k('keyup', 'Tab');
    const scene = window.__westTest.scene();
    scene.traverse((o) => { if (o.userData && (o.userData.isDebugHelper || o.userData.isDebugAxes)) o.visible = false; });
    scene.children.forEach((o) => { if (o.type === 'GridHelper') o.visible = false; });
    // beauty shots: park the HUD panels + hint bar (restored on reload —
    // this only touches the live page, never the game or the save).
    const style = document.createElement('style');
    style.id = 'shot-hud-hide';
    style.textContent = '#hud, #selection-panel, #object-log-panel, #control-hint, #status-message, #interact-prompt, #crosshair { display: none !important; }';
    document.head.appendChild(style);
  });
  await page.waitForTimeout(600);
  const shot = async (name, cam) => {
    await ev((c) => window.__westTest.setCamera(c[0], c[1], c[2], c[3], c[4], c[5]), cam);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  };
  await ev(() => window.__westTest.setDayTime(12));
  await shot('01-map-overview', [6, 46, 58, 0, 0, 4]);
  await shot('02-street-vista-from-spawn', [-1.5, 2.4, -56, 0, 1.6, -46]);
  await shot('03-butcher-stall-street', [-8.5, 1.9, -0.2, -12, 1.2, -1.5]);
  await shot('04-butcher-stall-closeup', [-9.6, 1.5, -0.6, -12, 1.0, -1.6]);
  await shot('05-residential-row', [-2, 3.0, 9.5, -20, 1.6, 13]);
  await shot('06-worker-house', [7.5, 2.2, -6.0, 12, 1.6, -2.5]);
  await shot('07-wealthy-house', [21, 2.3, 6.8, 21, 2.2, 13.5]);
  await shot('08-farmstead-east', [-5.5, 2.6, -46.5, -12, 1.4, -49.5]);
  await shot('09-abandoned-west', [35.5, 2.2, -45.5, 31, 1.3, -50]);
  // gameplay-framed shots: back to PLAY mode, teleport the Ranger, let the
  // third-person rig frame the street the way a player actually sees it.
  await ev(() => {
    window.__k('keydown', 'Tab');
    window.__k('keyup', 'Tab');
  });
  await page.waitForTimeout(600);
  const playShot = async (name, at, yawDeg) => {
    await ev((p) => { window.__westTest.teleport(p[0], 1.7, p[1]); window.__westTest.setYaw(p[2] * Math.PI / 180); }, [at[0], at[1], at[2]]);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  };
  await playShot('10-gameplay-spawn-vista', [0, 12, 0]);
  await playShot('11-gameplay-butcher-visit', [-5.6, -4.2, 90]);
  await playShot('12-gameplay-residential-walk', [-2.5, 21, -35]);
  await ev(() => { window.__westTest.setDayTime(18.4); }); // dusk glow shot
  await page.waitForTimeout(900);
  await playShot('13-gameplay-dusk-street', [0, 20, 0]);

  ok('§5 zero page/console errors through the whole run', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');
  const counts = await ev(() => ({ objects: window.__westTest.objects().length }));
  ok('summary', true, `managed objects=${counts.objects}`);

  const fails = results.filter((r) => !r.pass).length;
  console.log(`\n=== verify-env-expansion: ${results.length - fails}/${results.length} PASS ===`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
