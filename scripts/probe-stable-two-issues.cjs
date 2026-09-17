/* Probe the TWO user-reported unsolved problems inside the Livery Stable:
 *   1) screenshot at player (-15.3, 1.8, 2.7)  — a big orange TORUS floating
 *      in the aisle near stall four (stall door 4 was last edited by the user)
 *   2) screenshot at player (-19.1, 1.8, 1.8)  — a pink/salmon ∏-shaped frame
 *      floating at head height INSIDE stall one
 * Fresh scene (no user save) — if the objects appear here they are build bugs,
 * if not they are editor-moved strays in the user's localStorage.
 * Dumps a full stable-region census (managed roots, world AABBs, material
 * colors → floaters + pink candidates) and takes POV screenshots.
 * Run: node scripts/probe-stable-two-issues.cjs   (dev server on :5176)
 */
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/Ai-western_game/shots-two-issues';
const URL = 'http://localhost:5176/';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(3500);

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
    window.__hideRanger();
  });

  /* ---------------- 1) FULL STABLE-REGION CENSUS (registry truth) ---------------- */
  const census = await page.evaluate(() => {
    const scene = window.__westTest.scene();
    const defs = window.__westTest.objects();
    const region = { xMin: -23.5, xMax: -8.5, zMin: -2, zMax: 14, yMax: 7 };
    const V3 = scene.position.constructor;
    const out = [];
    for (const d of defs) {
      const root = scene.getObjectByProperty('uuid', d.uuid);
      const p = d.transform.position;
      const inRegion = p.x >= region.xMin && p.x <= region.xMax && p.z >= region.zMin && p.z <= region.zMax;
      // world AABB from real meshes (some defs are logical groups)
      const rec = {
        uuid: d.uuid, name: d.metadata?.name ?? '', assetType: d.assetType,
        editable: d.metadata?.editable !== false, collider: Boolean(d.metadata?.collider),
        defPos: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)],
        found: Boolean(root),
        min: null, max: null, colors: {}, meshes: 0,
      };
      if (root) {
        root.updateWorldMatrix(true, true);
        const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
        root.traverse((o) => {
          if (!o.isMesh) return;
          rec.meshes += 1;
          const g = o.geometry;
          if (!g || !g.attributes.position) return;
          if (!g.boundingBox) g.computeBoundingBox();
          const pos = g.attributes.position;
          const step = Math.max(1, Math.floor(pos.count / 90));
          for (let i = 0; i < pos.count; i += step) {
            const v = new V3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld);
            min[0] = Math.min(min[0], v.x); min[1] = Math.min(min[1], v.y); min[2] = Math.min(min[2], v.z);
            max[0] = Math.max(max[0], v.x); max[1] = Math.max(max[1], v.y); max[2] = Math.max(max[2], v.z);
          }
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (!m) continue;
            const key = (m.color ? '#' + m.color.getHexString() : '#none')
              + (m.emissive && (m.emissiveIntensity ?? 0) > 0 ? '/em#' + m.emissive.getHexString() : '');
            rec.colors[key] = (rec.colors[key] || 0) + 1;
          }
        });
        if (rec.meshes > 0) {
          rec.min = min.map((v) => +v.toFixed(3));
          rec.max = max.map((v) => +v.toFixed(3));
        }
      }
      if (inRegion || (rec.min && rec.min[0] >= region.xMin && rec.min[0] <= region.xMax)) out.push(rec);
      else if (inRegion) out.push(rec);
    }
    out.sort((a, b) => (a.min ? a.min[2] : a.defPos[2]) - (b.min ? b.min[2] : b.defPos[2]));
    return out;
  });
  console.log('=== REGISTERED OBJECTS IN/NEAR STABLE (uuid name assetType defPos worldAABB colors) ===');
  for (const r of census) {
    const colors = Object.entries(r.colors).map(([k, n]) => `${k}×${n}`).join(' ');
    console.log(
      `${r.uuid.slice(-6)} | ${r.name} | ${r.assetType}${r.editable ? '' : ' [static]'}${r.collider ? ' [col]' : ''}`
      + ` | def(${r.defPos}) | aabb(${r.min ? r.min.join(',') : '—'} … ${r.max ? r.max.join(',') : '—'})`
      + ` | ${r.meshes}m | ${colors}`,
    );
  }

  /* ---------------- 2) POV SCREENSHOTS (mode=shots) ---------------- */
  const MODE = process.argv[2] || 'census';
  if (MODE !== 'shots') {
    console.log('errors:', errors.length ? errors : 'none');
    await browser.close();
    return;
  }
  const pose = () => page.evaluate(() => {
    const p = window.__westDebug();
    return { cam: p.cam, yaw: Math.atan2(-p.view[0], -p.view[2]), pitch: Math.asin(Math.max(-1, Math.min(1, p.view[1]))) };
  });
  const drag = async (dx, dy) => {
    await page.evaluate(({ dx, dy }) => {
      const canvas = document.querySelector('canvas');
      const cx = innerWidth / 2, cy = innerHeight / 2;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX: cx, clientY: cy, pointerId: 7, bubbles: true }));
      for (let i = 1; i <= 8; i++) window.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + (dx * i) / 8, clientY: cy + (dy * i) / 8, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { button: 2, bubbles: true }));
    }, { dx, dy });
    await page.waitForTimeout(900);
  };
  const aimAt = async (tx, ty, tz) => {
    for (let iter = 0; iter < 10; iter++) {
      const p = await pose();
      const dx = tx - p.cam[0], dyy = ty - p.cam[1], dz = tz - p.cam[2];
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(dyy, Math.hypot(dx, dz));
      let dyaw = Math.atan2(Math.sin(wantYaw - p.yaw), Math.cos(wantYaw - p.yaw));
      const dpitch = wantPitch - p.pitch;
      if (Math.abs(dyaw) < 0.012 && Math.abs(dpitch) < 0.012) return;
      dyaw = Math.max(-0.4, Math.min(0.4, dyaw));
      const dpc = Math.max(-0.25, Math.min(0.25, dpitch));
      await drag(-dyaw / 0.0018, -dpc / 0.0018);
    }
  };
  const frame = async (px, py, pz, t, label) => {
    await page.evaluate(([x, y, z]) => { window.__westTest.teleport(x, y, z); window.__hideRanger(); }, [px, py, pz]);
    await page.waitForTimeout(1600);
    await page.evaluate(() => window.__hideRanger());
    await aimAt(t[0], t[1], t[2]);
    await page.waitForTimeout(500);
    const p = await pose();
    console.log('shot', label, 'cam=', p.cam.map((v) => +v.toFixed(2)).join(','));
    await page.screenshot({ path: `${OUT}/${label}.png` });
  };

  // reproduce the user's lighting: their shot 1 at in-game 16:34, shot 2 at 18:36
  await page.evaluate(() => window.__westTest.setDayTime(16.57));
  // View 1: player world (-15.3, ·, 2.7) → aisle in front of stall 4's gap.
  await frame(-15.3, 0.15, 2.7, [-14.6, 1.3, 0.2], 'pov1-aisle-stall4');
  await frame(-15.3, 0.15, 2.7, [-16, 1.4, -1.5], 'pov1-aisle-north');
  await page.evaluate(() => window.__westTest.setDayTime(18.6));
  // View 2: player world (-19.1, ·, 1.8) → INSIDE stall 1 (local -3.1, -4.2).
  await frame(-19.1, 0.15, 1.8, [-21.4, 1.4, 1.8], 'pov2-stall1-westwall');
  await frame(-19.1, 0.15, 1.8, [-19.1, 1.2, -0.2], 'pov2-stall1-north');
  await frame(-19.1, 0.15, 1.8, [-17.6, 1.3, 1.8], 'pov2-stall1-east');
  // daylight versions for clean identification
  await page.evaluate(() => window.__westTest.setDayTime(10));
  await frame(-15.3, 0.15, 2.7, [-14.6, 1.3, 0.2], 'day1-aisle-stall4');
  await frame(-19.1, 0.15, 1.8, [-21.4, 1.4, 1.8], 'day2-stall1-westwall');
  await frame(-19.1, 0.15, 1.8, [-19.1, 1.2, -0.2], 'day2-stall1-north');

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
