/* Probe 3: the spine/hips coplanar pair — full triangle detail. */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  await page.goto('http://localhost:5176/');
  await page.waitForTimeout(4500);
  const out = await page.evaluate(() => {
    const scene = window.__westTest.scene();
    scene.updateMatrixWorld(true);
    const hits = [];
    const effVisible = (o) => { let c = o; while (c) { if (c.visible === false) return false; c = c.parent; } return true; };
    const chain = (o) => { const p = []; let c = o; while (c && p.length < 5) { p.unshift(c.name || c.type); c = c.parent; } return p.join('/'); };
    scene.traverse((o) => {
      const m = o;
      if (!m.isMesh || !m.geometry || !effVisible(m)) return;
      const nm = m.name || m.parent?.name || '';
      if (!['spine', 'hips', 'chest'].includes(nm)) return;
      const geo = m.geometry; const pos = geo.attributes.position; const idx = geo.index;
      const e = m.matrixWorld.elements;
      const triCount = Math.floor((idx ? idx.count : pos.count) / 3);
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (let t = 0; t < triCount; t++) {
        const vs = [0, 1, 2].map((k) => {
          const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
          const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
          return { x: e[0] * x + e[4] * y + e[8] * z + e[12], y: e[1] * x + e[5] * y + e[9] * z + e[13], z: e[2] * x + e[6] * y + e[10] * z + e[14] };
        });
        const ux = vs[1].x - vs[0].x, uy = vs[1].y - vs[0].y, uz = vs[1].z - vs[0].z;
        const wx = vs[2].x - vs[0].x, wy = vs[2].y - vs[0].y, wz = vs[2].z - vs[0].z;
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        if (Math.abs(nx) < 0.99) continue; // X-normal side faces
        const d = nx * vs[0].x + ny * vs[0].y + nz * vs[0].z;
        hits.push({
          n: [ +nx.toFixed(2), +ny.toFixed(2), +nz.toFixed(2) ], d: +d.toFixed(4),
          mesh: nm, path: chain(m), mat: mats[0]?.uuid?.slice(0, 8),
          x: [ +Math.min(vs[0].x, vs[1].x, vs[2].x).toFixed(3), +Math.max(vs[0].x, vs[1].x, vs[2].x).toFixed(3) ],
          y: [ +Math.min(vs[0].y, vs[1].y, vs[2].y).toFixed(3), +Math.max(vs[0].y, vs[1].y, vs[2].y).toFixed(3) ],
          z: [ +Math.min(vs[0].z, vs[1].z, vs[2].z).toFixed(3), +Math.max(vs[0].z, vs[1].z, vs[2].z).toFixed(3) ],
        });
      }
    });
    // group by (d rounded, sign)
    const seen = {};
    for (const h of hits) { const k = `${h.mesh}|${h.d.toFixed(2)}|${h.n[0]}`; seen[k] = (seen[k] || 0) + 1; }
    return { unique: Object.keys(seen).length, sample: hits.filter((_, i) => i < 40).map((h) => ({ m: h.mesh, d: h.d, n: h.n, y: h.y, z: h.z, mat: h.mat, path: h.path })) };
  });
  console.log(JSON.stringify(out.sample, null, 1));
  await browser.close();
})();
