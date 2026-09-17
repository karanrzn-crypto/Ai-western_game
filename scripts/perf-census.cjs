/* Per-managed-object mesh census: which defs explode into the most meshes
 * (draw-call budget)? Also count sibling-shareable merges per material.
 * Run: node scripts/perf-census.cjs [port]
 */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`http://localhost:${process.argv[2] || '5173'}/`);
  await page.waitForTimeout(4500);
  const rows = await page.evaluate(() => {
    const scene = window.__westTest.scene();
    const defs = window.__westTest.objects();
    const out = [];
    for (const d of defs) {
      const root = scene.getObjectByProperty('uuid', d.uuid);
      if (!root) continue;
      let meshes = 0; const matSet = new Set();
      root.traverse((o) => {
        if (!o.isMesh) return;
        meshes += 1;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m && matSet.add(m.uuid));
      });
      if (meshes > 0) out.push({ name: String(d.metadata?.name ?? d.assetType), type: d.assetType, meshes, mats: matSet.size });
    }
    out.sort((a, b) => b.meshes - a.meshes);
    return { total: out.reduce((s, r) => s + r.meshes, 0), defs: out.length, top: out.slice(0, 30), sum: out.reduce((s, r) => s + r.meshes * Math.max(1, r.mats), 0) };
  });
  console.log(`total meshes ${rows.total} across ${rows.defs} defs; theoretical merged calls ≈ ${rows.sum}`);
  for (const t of rows.top) console.log(`${String(t.meshes).padStart(4)} meshes / ${String(t.mats).padStart(2)} mats | ${t.type} | ${t.name}`);
  await browser.close();
})();
