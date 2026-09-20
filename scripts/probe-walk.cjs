/* Probe 15: count gun-cabinet + gun-rack defs and their positions. */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  await page.goto('http://localhost:5176/');
  await page.waitForTimeout(4500);
  const out = await page.evaluate(() => {
    const defs = window.__westTest.objects();
    const cab = defs.filter((d) => d.assetType === 'gun-cabinet').map((d) => ({ uuid: d.uuid.slice(-6), p: d.transform.position, ry: d.transform.rotation?.y }));
    const rack = defs.filter((d) => d.assetType === 'gun-rack').map((d) => ({ uuid: d.uuid.slice(-6), p: d.transform.position }));
    return { cab, rack };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
