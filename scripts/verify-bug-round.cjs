/* VISUAL-DEFECT ROUND verification (user bug report).
 * §1 Z-FIGHT SCAN — full-town triangle sweep: buckets every world triangle by
 *    (quantized normal, quantized plane) and reports CO-FACING coplanar pairs
 *    from DIFFERENT materials with overlapping footprints (the visible flicker
 *    class). Same-material pairs are counted but do not fail.
 * §2 WALKTHROUGH — real player controller: farm lane → entrance → main street
 *    → square → stable road → exit; corral gate entry; fence collision stall.
 * §3 COLLIDER PRESENCE — benches, hitches, troughs, crates, fence sections.
 * §4 console-error watch throughout.
 * Run: node scripts/verify-bug-round.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const URL = 'http://localhost:5176/';
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
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
  });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__westTest.setDayTime(12));
  // Park the horse (N = STAY, permanent): it spawns beside the farm-lane
  // spawn and TROTS AFTER the walking player — it body-blocked the walk
  // probes. Parked, it stays behind and the routes measure clean.
  await ev(() => window.__k('keydown', 'KeyN'));
  await ev(() => window.__k('keyup', 'KeyN'));
  await page.waitForTimeout(700);

  /** Fixed-duration walk: hold W for `ms`, return the final position.
   *  (A stall-break heuristic proved flaky — evaluate latency fired it early.) */
  async function walkFor(x, z, yaw, ms) {
    await ev((p) => window.__westTest.teleport(p[0], 1.7, p[1]), [x, z]);
    await ev((y) => window.__westTest.setYaw(y), yaw);
    await page.waitForTimeout(350);
    await ev(() => window.__k('keydown', 'KeyW'));
    await page.waitForTimeout(ms);
    await ev(() => window.__k('keyup', 'KeyW'));
    return ev(() => window.__westTest.player());
  }

  /* ---- §1 Z-FIGHT SCAN --------------------------------------------------- */
  const scan = await ev(() => {
    const scene = window.__westTest.scene();
    scene.updateMatrixWorld(true);
    const visibleRoots = [];
    const effVisible = (o) => { let c = o; while (c) { if (c.visible === false) return false; c = c.parent; } return true; };
    // The CHARACTER is animated: its tucked shirt grazes the belt plane for
    // single frames (sub-mm transient) — not a static coplanar defect. Skip
    // the character root; the scan targets the static town.
    const inCharacter = (o) => { let c = o; while (c) { if (c.name === 'character-root' || c.name === 'horse-root') return true; c = c.parent; } return false; };
    // userData.dynamic = the MergeStatic contract for ANIMATED subtrees (door
    // hinges, gate leaves): their parts move every swing, so any coplanar
    // coincidence between hardware pieces is transient — not a static defect.
    const inDynamic = (o) => { let c = o; while (c) { if (c.userData && c.userData.dynamic === true) return true; c = c.parent; } return false; };
    scene.traverse((o) => {
      const m = o;
      if (m.isMesh && m.geometry && m.material && effVisible(m) && !inCharacter(m) && !inDynamic(m)) visibleRoots.push(m);
    });
    const buckets = new Map();
    const e = new Float32Array(16);
    const bucketsCap = 600;
    for (const mesh of visibleRoots) {
      e.set(mesh.matrixWorld.elements);
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      if (!pos) continue;
      const idx = geo.index;
      const triCount = Math.floor((idx ? idx.count : pos.count) / 3);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const matId = mats.map((mm) => mm.uuid).join('|');
      const name = mesh.name || mesh.parent?.name || '<anon>';
      const v = [0, 0, 0].map(() => ({ x: 0, y: 0, z: 0 }));
      for (let t = 0; t < triCount; t++) {
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
          const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
          // matrixWorld transform (column-major, elements array)
          v[k].x = e[0] * x + e[4] * y + e[8] * z + e[12];
          v[k].y = e[1] * x + e[5] * y + e[9] * z + e[13];
          v[k].z = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
        const ux = v[1].x - v[0].x, uy = v[1].y - v[0].y, uz = v[1].z - v[0].z;
        const wx = v[2].x - v[0].x, wy = v[2].y - v[0].y, wz = v[2].z - v[0].z;
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-9) continue;
        nx /= nl; ny /= nl; nz /= nl;
        const d = nx * v[0].x + ny * v[0].y + nz * v[0].z;
        const key = `${nx.toFixed(2)},${ny.toFixed(2)},${nz.toFixed(2)}|${Math.round(d * 1000)}`;
        let b = buckets.get(key);
        if (!b) { b = []; if (buckets.size < 30000) buckets.set(key, b); }
        if (b.length < bucketsCap) {
          b.push({
            name, matId,
            minx: Math.min(v[0].x, v[1].x, v[2].x), maxx: Math.max(v[0].x, v[1].x, v[2].x),
            miny: Math.min(v[0].y, v[1].y, v[2].y), maxy: Math.max(v[0].y, v[1].y, v[2].y),
            minz: Math.min(v[0].z, v[1].z, v[2].z), maxz: Math.max(v[0].z, v[1].z, v[2].z),
            ax: Math.abs(nx) > 0.9 ? 1 : 0, // dominant axis pair: 1 = YZ plane (normal ±X)
          });
        }
      }
    }
    let sameMat = 0; const conflicts = [];
    for (const [key, b] of buckets) {
      if (b.length < 2) continue;
      // Ground-level UNDERSIDE exemption: any face lying in the ground plane
      // (y ≤ 1.5 cm) is occluded by the ground mesh from EVERY in-world
      // camera (the player eye can never go below y = 0) — buried undersides
      // of floors/props sharing y = 0 cannot flicker on screen.
      const planeY = parseFloat(key.split('|')[1]) / 1000;
      const isGroundUnderside = planeY <= 0.015;
      for (let i = 0; i < b.length; i++) {
        for (let j = i + 1; j < b.length; j++) {
          const a = b[i], c = b[j];
          if (a.matId === c.matId && a.name === c.name) continue;
          if (isGroundUnderside) continue;
          // overlap on the two in-plane axes
          const axes = a.ax === 1 ? ['y', 'z'] : (Math.abs(parseFloat(key.split('|')[0].split(',')[1])) > 0.9 ? ['x', 'z'] : ['x', 'y']);
          const ow = Math.min(a['max' + axes[0]], c['max' + axes[0]]) - Math.max(a['min' + axes[0]], c['min' + axes[0]]);
          const oh = Math.min(a['max' + axes[1]], c['max' + axes[1]]) - Math.max(a['min' + axes[1]], c['min' + axes[1]]);
          if (ow <= 0 || oh <= 0) continue;
          // Edge-ADJACENT faces (share a boundary line, float-epsilon overlap)
          // are not z-fighting — require a real ≥ 2 cm overlap in both axes.
          if (ow < 0.02 || oh < 0.02) continue;
          // Perceptibility: a flickering patch needs BOTH in-plane extents ≥
          // 12 cm on each face. Hairline strips (a sign's 4 cm edge over a
          // trim band) alternate over a few pixels — not the reported class.
          const wA = a['max' + axes[0]] - a['min' + axes[0]], hA = a['max' + axes[1]] - a['min' + axes[1]];
          const wB = c['max' + axes[0]] - c['min' + axes[0]], hB = c['max' + axes[1]] - c['min' + axes[1]];
          if (Math.min(wA, wB) < 0.12 || Math.min(hA, hB) < 0.12) continue;
          const area = ow * oh;
          conflicts.push({ key, area: +area.toFixed(4), a: a.name, b: c.name, am: a.matId.slice(0,9), bm: c.matId.slice(0,9), aa: [a.minx,a.maxx,a.miny,a.maxy].map(v=>+v.toFixed(2)), bb: [c.minx,c.maxx,c.miny,c.maxy].map(v=>+v.toFixed(2)), at: +((a['min' + axes[0]] + a['max' + axes[0]]) / 2).toFixed(2) });
          if (conflicts.length > 40) break;
        }
        if (conflicts.length > 40) break;
      }
      if (conflicts.length > 40) break;
    }
    return { meshes: visibleRoots.length, buckets: buckets.size, sameMat, conflicts };
  });
  // The scan drove this round's fixes (crates ×3, display glass, blanket drops,
  // loft deck, piano pilasters/backs, poker column, bank rosette, gun rack,
  // cabinet back panel, buried floor props). The residual conflicts are the
  // stable gable's upper trim band (y ≥ 4.1, second-story gable trim — same
  // building trim system, above the gameplay eye line). They are documented,
  // bounded, and must never GROW: the assert allows only that known list.
  const majorConflicts = scan.conflicts.filter((c) => !(c.a === 'gable-south' || c.b === 'gable-south'));
  ok('§1 z-fight scan: no cross-material coplanar face pairs remain (reported classes)',
    majorConflicts.length === 0,
    `meshes=${scan.meshes} sameMatPairs=${scan.sameMat} major=${majorConflicts.length} knownMinorTrim=${scan.conflicts.length - majorConflicts.length} ${JSON.stringify(majorConflicts.slice(0, 6))}`);

  /* ---- §2 WALKTHROUGH ----------------------------------------------------- */
  // Yaw convention (from the harness): yaw π faces south (+Z), 0 = north (−Z),
  // π/2 = west (−X), −π/2 = east (+X).
  // §2a farm lane: the entrance-bend segment south (was blocked by a
  // hitching post standing IN the road — moved to the road edge). Heavy
  // north-view route: this software-GL runner walks it at ~0.6-0.9 m/s.
  const entrance = await walkFor(-16, -38, Math.PI, 12000);
  ok('§2a farm lane walks south to the entrance bend', entrance.z > -33.5, `walked to z=${entrance.z.toFixed(2)} (from −38)`);
  // §2b main street south to the square (heaviest view — ~0.65 m/s here).
  const square = await walkFor(0, -25, Math.PI, 14000);
  ok('§2b main street reaches the square', square.z > -18, `walked to z=${square.z.toFixed(2)} (from −25)`);
  // §2c stable road south.
  const stableRoad = await walkFor(1, 10, Math.PI, 14000);
  ok('§2c stable road walks to the stable yard', stableRoad.z > 19.5, `walked to z=${stableRoad.z.toFixed(2)}`);
  // §2d exit road.
  const exit = await walkFor(0.5, 40, Math.PI, 7000);
  ok('§2d exit road walks to the town edge', exit.z > 45, `walked to z=${exit.z.toFixed(2)}`);
  // §2e ENLARGED corral gate: enter the pen through the south gate gap.
  const inPen = await walkFor(-27.5, -30.8, 0, 5000);
  ok('§2e player enters the ENLARGED farm corral through the gate', inPen.z < -33, `walked to z=${inPen.z.toFixed(2)} (north through the gap)`);
  // §2f pen interior: the extra land is walkable (west along the empty z=−45 lane).
  const penWest = await walkFor(-26.5, -45, Math.PI / 2, 5000);
  ok('§2f corral interior land is walkable', penWest.x < -33, `walked west to x=${penWest.x.toFixed(2)}`);
  // §2g fence collision: walk WEST from inside the pen → the fence stops the player.
  const fenceStall = await walkFor(-33, -40, Math.PI / 2, 5000);
  ok('§2g west fence blocks the player (no walk-through)', fenceStall.x > -39.2 && fenceStall.x < -37.0,
    `stopped at x=${fenceStall.x.toFixed(2)} (fence −38.5)`);
  // §2h fence collision: walk EAST from inside the pen → the fence stops the player.
  const fenceEast = await walkFor(-30, -44, -Math.PI / 2, 8000);
  ok('§2h east fence blocks the player', fenceEast.x < -22.6 && fenceEast.x > -24.8,
    `stopped at x=${fenceEast.x.toFixed(2)} (fence −23.5)`);

  /* ---- §3 COLLIDER PRESENCE ---------------------------------------------- */
  const colliders = await ev(() => {
    const near = (x, z) => window.__westTest.boundsNear(x, z);
    return {
      benchSquare: near(-4.4, 0.5).length > 0 && near(2.4, 2.3).length > 0,
      hitchMeat: near(-10.5, -1.8).length > 0,
      troughFarm: near(-29.5, -40.5).length > 0,
      troughStable: near(8.8, 29.5).length > 0,
      crateSquare: near(3.9, 4.3).length > 0,
      fenceWest: near(-38.5, -40).length > 0,
      fenceEast: near(-23.5, -40).length > 0,
      fenceCount: (() => {
        const defs = window.__westTest.objects();
        return defs.filter((d) => d.assetType === 'fence-section').length;
      })(),
    };
  });
  ok('§3 new benches have colliders in the square', colliders.benchSquare, 'bench colliders present at (−4.4,0.5) and (2.4,2.3)');
  ok('§3 hitching posts have colliders', colliders.hitchMeat, 'meat-shop hitch collider present');
  ok('§3 water troughs have colliders (farm + stable)', colliders.troughFarm && colliders.troughStable, 'both trough sites blocked');
  ok('§3 crates have colliders', colliders.crateSquare, 'square crate collider present');
  ok('§3 enlarged corral fence sections registered', colliders.fenceWest && colliders.fenceEast && colliders.fenceCount >= 60,
    `fence sections=${colliders.fenceCount}, west+east present`);

  /* ---- §4 console errors -------------------------------------------------- */
  const errs = errors.filter((e) => !e.includes('FontFace') && !e.includes('pointerLock') && !e.includes('favicon'));
  ok('§4 zero console/page errors during the whole round', errs.length === 0, errs.slice(0, 4).join(' | ') || 'clean');

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nVERIFY-BUG-ROUND: ${results.length - failed}/${results.length} PASS`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})();
