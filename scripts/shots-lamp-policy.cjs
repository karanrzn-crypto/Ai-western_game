/* Visual sanity shots for the lamp policy + coil deletion.
 * Run: node scripts/shots-lamp-policy.cjs (dev server on :5176) */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-coil-lamps';
const URL = 'http://localhost:5176/';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(4500);
  await page.evaluate(() => {
    const neuter = (proto, name) => { const o = proto[name]; proto[name] = function (id) { try { o.call(this, id); } catch (e) {} }; };
    neuter(Element.prototype, 'setPointerCapture');
    neuter(Element.prototype, 'releasePointerCapture');
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
  });

  const shot = async (name, hours, pos, yaw) => {
    await page.evaluate(([h, p, y]) => {
      window.__westTest.setDayTime(h);
      window.__westTest.teleport(p[0], p[1], p[2]);
      window.__westTest.setYaw(y);
    }, [hours, pos, yaw]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log('shot:', name);
  };

  // Town overview from the street (spawn area, looking north at saloon/bank row)
  await shot('town-noon', 12, [-2, 0, 10], Math.PI);
  await shot('town-dusk-1800h', 18, [-2, 0, 10], Math.PI);   // lamps: off (>0.55)
  await shot('town-evening-1930h', 19.5, [-2, 0, 10], Math.PI); // lamps: on (<0.35)
  await shot('town-night', 23, [-2, 0, 10], Math.PI);
  // Stable south facade — the gate area where the lanterns live
  await shot('stable-noon', 12, [-14, 0, 12.5], Math.PI / 2);
  await shot('stable-night', 23, [-14, 0, 12.5], Math.PI / 2);
  // Stable aisle interior looking north (down the aisle, lit by gate/lanterns)
  await shot('aisle-noon', 12, [-16, 0, 9], Math.PI);
  await shot('aisle-night', 23, [-16, 0, 9], Math.PI);
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
