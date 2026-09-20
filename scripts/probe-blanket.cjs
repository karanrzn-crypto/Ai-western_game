/* Probe 2: normals + owners of every triangle at plane y≈1.45 near x −8.5, z 32.2..33. */
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
    scene.traverse((o) => {
      const m = o;
      if (!m.isMesh || !m.geometry || !effVisible(m)) return;
      const geo = m.geometry; const pos = geo.attributes.position; if (!pos) return;
      const idx = geo.index;
      const e = m.matrixWorld.elements;
      const triCount = Math.floor((idx ? idx.count : pos.count) / 3);
      for (let t = 0; t < triCount; t++) {
        const vs = [0, 1, 2].map((k) => {
          const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
          const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
          return { x: e[0] * x + e[4] * y + e[8] * z + e[12], y: e[1] * x + e[5] * y + e[9] * z + e[13], z: e[2] * x + e[6] * y + e[10] * z + e[14] };
        });
        if (!vs.every((v) => Math.abs(v.y - 1.45) < 0.002)) continue;
        const cx = (vs[0].x + vs[1].x + vs[2].x) / 3, cz = (vs[0].z + vs[1].z + vs[2].z) / 3;
        if (cx < -12 || cx > -5 || cz < 30 || cz > 35) continue;
        const ux = vs[1].x - vs[0].x, uy = vs[1].y - vs[0].y, uz = vs[1].z - vs[0].z;
        const wx = vs[2].x - vs[0].x, wy = vs[2].y - vs[0].y, wz = vs[2].z - vs[0].z;
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        hits.push({
          mesh: m.name || '<anon>', parent: m.parent?.name || '<anon>',
          n: [+(nx / nl).toFixed(2), +(ny / nl).toFixed(2), +(nz / nl).toFixed(2)],
          cx: +cx.toFixed(2), cz: +cz.toFixed(2),
          ext: [ +(Math.max(vs[0].x, vs[1].x, vs[2].x) - Math.min(vs[0].x, vs[1].x, vs[2].x)).toFixed(2),
                 +(Math.max(vs[0].z, vs[1].z, vs[2].z) - Math.min(vs[0].z, vs[1].z, vs[2].z)).toFixed(2) ],
        });
      }
    });
    return hits.slice(0, 12);
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
