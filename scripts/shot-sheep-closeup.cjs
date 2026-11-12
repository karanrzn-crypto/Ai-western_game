/* Extra evidence shot: a head-on sheep close-up in daylight (the verify-sheep
 * closeup framed the flank; this one frames the head/ears/topknot).
 * Run: node scripts/shot-sheep-closeup.cjs   (dev server on :5176) */
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'shots-sheep');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  await page.goto('http://localhost:5176/');
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
  await page.evaluate(() => window.__westTest.setDayTime(12));
  await page.waitForTimeout(1500);
  // Edit mode parks the gameplay rig so setCamera holds.
  await page.evaluate(() => { window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab'); });
  const pose = await page.evaluate(() => {
    const sheep = window.__westTest.scene().getObjectByName('farm-sheep-system').children[0];
    // Head world position = root position + the head pivot offset (0, 0.72, 0.42)
    // rotated by the sheep's yaw (plain scalar math — no THREE needed here).
    const sx = sheep.position.x;
    const sz = sheep.position.z;
    const yaw = sheep.rotation.y;
    return { hx: sx + Math.sin(yaw) * 0.42, hy: 0.72, hz: sz + Math.cos(yaw) * 0.42, yaw };
  });
  // Park 2.6 m in front of the sheep's head, at head height, looking at it.
  await page.evaluate((p) => window.__westTest.setCamera(
    p.hx + Math.sin(p.yaw) * 2.6, p.hy + 0.45, p.hz + Math.cos(p.yaw) * 2.6, p.hx, p.hy - 0.05, p.hz,
  ), pose);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'sheep-head-closeup.png') });
  console.log(`shot saved · head at (${pose.hx.toFixed(2)}, ${pose.hy.toFixed(2)}, ${pose.hz.toFixed(2)}) yaw ${pose.yaw.toFixed(2)}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
