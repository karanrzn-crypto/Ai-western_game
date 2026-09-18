/* Gun Shop BEAUTY SHOTS v3 — deterministic camera: TAB (edit mode) parks the
 * gameplay rig, then the harness-only setCamera() poses each shot exactly.
 * Run: node scripts/shots-gunshop.cjs   (dev server on :5176) */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-gunshop';
const URL = 'http://localhost:5176/';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto(URL);
  await page.waitForTimeout(4200);
  const inject = async () => {
    await page.evaluate(() => {
      const neuter = (proto, name) => { const o = proto[name]; proto[name] = function (id) { try { o.call(this, id); } catch (e) {} }; };
      neuter(Element.prototype, 'setPointerCapture');
      neuter(Element.prototype, 'releasePointerCapture');
      const hud = document.getElementById('hud');
      if (hud) hud.style.display = 'none';
      window.__k = (type, code) => {
        const e = new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true });
        document.body.dispatchEvent(e);
      };
      window.__hideRanger = () => {
        const r = window.__westTest.scene()?.getObjectByName('character-root');
        if (r) r.visible = false;
      };
      // hide every edit-mode helper (debug axes, gizmo, contact ring)
      window.__hideHelpers = () => {
        const scene = window.__westTest.scene();
        if (!scene) return;
        scene.traverse((o) => {
          if (o.userData && o.userData.isDebugHelper === true) o.visible = false;
        });
      };
      window.__hideRanger();
      window.__hideHelpers();
    });
  };
  await inject();

  /** Fresh daylight + enter EDIT mode (camera parks) + hide the ranger. */
  const fresh = async () => {
    await page.reload();
    await page.waitForTimeout(4200);
    await inject();
    await page.evaluate(() => {
      window.__westTest.setDayTime(10);
      window.__k('keydown', 'Tab');
      window.__k('keyup', 'Tab');
    });
    await page.waitForTimeout(800);
  };

  /** Park the camera at (px,py,pz) aimed at (tx,ty,tz) and shoot. */
  const frame = async (cam, target, label) => {
    await page.evaluate(([c, t]) => {
      window.__westTest.setDayTime(10);
      window.__westTest.setCamera(c[0], c[1], c[2], t[0], t[1], t[2]);
      window.__hideRanger();
      window.__hideHelpers();
    }, [cam, target]);
    await page.waitForTimeout(1700);
    await page.screenshot({ path: `${OUT}/${label}.png` });
    console.log('shot', label);
  };

  // 1) Exterior facade — GUNSMITH sign, porch, windows, casing (front-south, high)
  await fresh();
  await frame([14, 3.2, 20.5], [14, 2.2, 12.0], '01-exterior-facade');
  // 2) Sign + porch closeup
  await frame([13.2, 2.2, 15.8], [14, 2.3, 12.6], '02-sign-porch');
  // 3) Door open — swing E first (play mode), then park the camera
  await page.evaluate(() => {
    window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab'); // back to play for E
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => { window.__westTest.teleport(14, 1.7, 12.9); window.__hideRanger(); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__k('keydown', 'KeyE'); window.__k('keyup', 'KeyE'); });
  await page.waitForTimeout(9000);
  await page.evaluate(() => {
    window.__k('keydown', 'Tab'); window.__k('keyup', 'Tab'); // park again
  });
  await page.waitForTimeout(800);
  await frame([14.6, 2.6, 16.4], [13.7, 1.4, 11.4], '03-door-open');

  // 4) Interior sales area — counter + glass display case + register + scale
  await fresh();
  await frame([14.2, 1.9, 11.6], [13.2, 1.15, 9.9], '04-counter-display');
  // 5) Rifle rack wall (west wall, guns muzzle-up)
  await frame([14.4, 1.7, 10.4], [9.7, 1.5, 10.4], '05-rifle-rack');
  // 6) Ammo shelf (east wall)
  await frame([14.2, 1.7, 9.9], [18.1, 1.3, 9.9], '06-shelf');
  // 6b) Holster board (front wall interior)
  await frame([16.4, 1.6, 8.7], [16.4, 1.5, 11.8], '06b-holster');
  // 7) Workshop — bench, vise, tool rack, crates, keg
  await fresh();
  await frame([12.2, 1.9, 8.6], [15.6, 1.1, 5.4], '07-workshop');
  // 8) Town placement — the shop on the street's east side (aerial-ish)
  await frame([2, 8.0, 14.0], [14, 2.2, 8.5], '08-town-placement');
  // 9) Street view — the shop from the town center
  await frame([4, 1.8, 10.0], [14, 2.0, 9.5], '09-from-street');

  await browser.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
