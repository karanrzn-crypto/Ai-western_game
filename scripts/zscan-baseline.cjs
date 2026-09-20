/* Baseline z-fight dump: full-town triangle sweep + near-plane (decal gap) report.
 * Prints EVERY coplanar conflict (incl. the documented known-minors) with
 * geometry details, plus co-facing pairs separated by 1–15 mm (the "sign text
 * too close to backing" class the user wants probed). Run against :5176. */
const { chromium } = require('playwright');
const URL = 'http://localhost:5176/';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 800, height: 500 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(4500);
  await page.evaluate(() => {
    const neuter = (proto, name) => { const o = proto[name]; proto[name] = function (id) { try { o.call(this, id); } catch (e) {} }; };
    neuter(window.HTMLElement.prototype, 'requestPointerLock');
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
  });
  await page.evaluate(() => window.__westTest.setDayTime(12));
  await page.waitForTimeout(400);

  const scan = await page.evaluate(() => {
    const scene = window.__westTest.scene();
    scene.updateMatrixWorld(true);
    const meshes = [];
    const effVisible = (o) => { let c = o; while (c) { if (c.visible === false) return false; c = c.parent; } return true; };
    const skip = (o, names) => { let c = o; while (c) { if (names.includes(c.name)) return true; c = c.parent; } return false; };
    scene.traverse((o) => {
      if (o.isMesh && o.geometry && o.material && effVisible(o) && !skip(o, ['character-root', 'horse-root']) && !(o.userData && o.userData.dynamic === true)) meshes.push(o);
    });
    const e = new Float32Array(16);
    const buckets = new Map(); // exact-plane coplanar: key normal(2dp)|plane(1mm)
    const nearBuckets = new Map(); // co-facing near: key normal(2dp)|plane(5mm)
    for (const mesh of meshes) {
      e.set(mesh.matrixWorld.elements);
      const geo = mesh.geometry; const pos = geo.attributes.position; if (!pos) continue;
      const idx = geo.index;
      const triCount = Math.floor((idx ? idx.count : pos.count) / 3);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const matId = mats.map((mm) => mm.uuid).join('|');
      const name = mesh.name || mesh.parent?.name || '<anon>';
      const v = [0, 1, 2].map(() => ({ x: 0, y: 0, z: 0 }));
      for (let t = 0; t < triCount; t++) {
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
          const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
          v[k].x = e[0] * x + e[4] * y + e[8] * z + e[12];
          v[k].y = e[1] * x + e[5] * y + e[9] * z + e[13];
          v[k].z = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
        const ux = v[1].x - v[0].x, uy = v[1].y - v[0].y, uz = v[1].z - v[0].z;
        const wx = v[2].x - v[0].x, wy = v[2].y - v[0].y, wz = v[2].z - v[0].z;
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const nl = Math.hypot(nx, ny, nz); if (nl < 1e-9) continue;
        nx /= nl; ny /= nl; nz /= nl;
        const d = nx * v[0].x + ny * v[0].y + nz * v[0].z;
        const nkey = `${nx.toFixed(2)},${ny.toFixed(2)},${nz.toFixed(2)}`;
        const rec = {
          name, matId,
          minx: Math.min(v[0].x, v[1].x, v[2].x), maxx: Math.max(v[0].x, v[1].x, v[2].x),
          miny: Math.min(v[0].y, v[1].y, v[2].y), maxy: Math.max(v[0].y, v[1].y, v[2].y),
          minz: Math.min(v[0].z, v[1].z, v[2].z), maxz: Math.max(v[0].z, v[1].z, v[2].z),
        };
        const put = (map, key) => {
          let b = map.get(key); if (!b) { b = []; if (map.size < 40000) map.set(key, b); }
          if (b.length < 900) b.push(rec);
        };
        put(buckets, `${nkey}|${Math.round(d * 1000)}`);
        put(nearBuckets, `${nkey}|${Math.round(d * 200)}`);
      }
    }
    const axesOf = (nkey) => {
      const n = nkey.split(',').map(Number);
      return Math.abs(n[0]) > 0.9 ? ['y', 'z'] : Math.abs(n[1]) > 0.9 ? ['x', 'z'] : ['x', 'y'];
    };
    const collect = (map, minOverlap, minFace) => {
      const out = [];
      for (const [key, b] of map) {
        if (b.length < 2) continue;
        const [nkey, planeStr] = key.split('|');
        const planeY = parseFloat(nkey.split(',')[1]) > 0.5 ? parseFloat(planeStr) / (map === buckets ? 1000 : 200) : null;
        if (planeY !== null && planeY <= 0.015) continue; // ground undersides
        const axes = axesOf(nkey);
        for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
          const a = b[i], c = b[j];
          if (a.matId === c.matId && a.name === c.name) continue;
          const ow = Math.min(a['max' + axes[0]], c['max' + axes[0]]) - Math.max(a['min' + axes[0]], c['min' + axes[0]]);
          const oh = Math.min(a['max' + axes[1]], c['max' + axes[1]]) - Math.max(a['min' + axes[1]], c['min' + axes[1]]);
          if (ow < minOverlap || oh < minOverlap) continue;
          const wA = a['max' + axes[0]] - a['min' + axes[0]], hA = a['max' + axes[1]] - a['min' + axes[1]];
          const wB = c['max' + axes[0]] - c['min' + axes[0]], hB = c['max' + axes[1]] - c['min' + axes[1]];
          if (Math.min(wA, wB) < minFace || Math.min(hA, hB) < minFace) continue;
          out.push({ key, a: a.name, b: c.name, ow: +ow.toFixed(3), oh: +oh.toFixed(3) });
          if (out.length > 300) return out;
        }
      }
      return out;
    };
    const dedupe = (list) => {
      const seen = new Set();
      return list.filter((c) => {
        const k = [c.a, c.b].sort().join(' ↔ ') + '|' + c.key.split('|')[0] + '|' + c.ow.toFixed(1);
        if (seen.has(k)) return false; seen.add(k); return true;
      });
    };
    return {
      meshes: meshes.length,
      coplanar: dedupe(collect(buckets, 0.05, 0.12)),
      nearPlane: dedupe(collect(nearBuckets, 0.05, 0.12)),
    };
  });

  console.log(`meshes=${scan.meshes}`);
  console.log(`\n=== COPLANAR CONFLICTS (exact same plane, cross-name) : ${scan.coplanar.length} ===`);
  for (const c of scan.coplanar) console.log(JSON.stringify(c));
  console.log(`\n=== NEAR-PLANE CO-FACING PAIRS (≤5 mm apart — decal/sign gap class) : ${scan.nearPlane.length} ===`);
  for (const c of scan.nearPlane) console.log(JSON.stringify(c));
  if (errors.length) console.log('\nERRORS:', errors.slice(0, 4).join(' | '));
  await browser.close();
})();
