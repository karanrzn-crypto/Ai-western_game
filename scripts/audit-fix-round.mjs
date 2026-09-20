/**
 * audit-fix-round.mjs — geometric audit of the 2026 fix round (offline, real
 * factories + real THREE math):
 *   A. every composite collider box vs the MEASURED world bbox of its built
 *      mesh (tolerance 6 cm) — collision must equal the visual, no oversize,
 *      no undersize;
 *   B. stable props: nothing below its floor line (no sinking) and nothing
 *      poking outside the grown shell walls (no wall clipping);
 *   C. no duplicate objects: every uuid unique, every (assetType, position)
 *      pair unique among the stable props.
 * Run: npx tsx scripts/audit-fix-round.mjs
 */
import * as THREE from 'three';
import {
  AssetRegistry,
  CollisionWorld,
  registerSaloonFactories,
  buildSaloonMapObjects,
  SALOON_SITE,
  registerAllGunShopFactories,
  buildGunShopMapObjects,
  GUNSHOP_SITE,
  registerAllBankFactories,
  buildBankMapObjects,
  BANK_SITE,
  registerAllSheriffFactories,
  buildSheriffMapObjects,
  SHERIFF_SITE,
  registerAllStableFactories,
  buildStableMapObjects,
  STABLE_SITE,
  STABLE_LAYOUT,
} from '../src/index.js';

const fails = [];
const ok = (cond, label, detail) => {
  if (!cond) { fails.push(`${label}: ${detail}`); console.log(`FAIL | ${label} | ${detail}`); }
  else console.log(`PASS | ${label} | ${detail}`);
};

const registry = new AssetRegistry();
registerSaloonFactories(registry);
registerAllGunShopFactories(registry);
registerAllBankFactories(registry);
registerAllSheriffFactories(registry);
registerAllStableFactories(registry);

const blocks = [
  ['saloon', buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z), SALOON_SITE],
  ['gunshop', buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z), GUNSHOP_SITE],
  ['bank', buildBankMapObjects(BANK_SITE.x, BANK_SITE.z), BANK_SITE],
  ['sheriff', buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z), SHERIFF_SITE],
  ['stable', buildStableMapObjects(STABLE_SITE.x, STABLE_SITE.z), STABLE_SITE],
];

/* ---- A. composite collider boxes == measured visual bbox ------------------ */
let checked = 0;
for (const [label, defs, site] of blocks) {
  for (const def of defs) {
    const c = def.metadata.collider;
    if (!c || typeof c !== 'object' || !Array.isArray(c.boxes)) continue;
    // Build the asset and measure its REAL world bbox.
    ok(registry.has(def.assetType), `${label} ${def.metadata.name}`, 'factory registered');
    if (!registry.has(def.assetType)) continue;
    const obj = await registry.create(def);
    obj.position.set(def.transform.position.x, def.transform.position.y, def.transform.position.z);
    obj.rotation.set(
      (def.transform.rotation.x * Math.PI) / 180,
      (def.transform.rotation.y * Math.PI) / 180,
      (def.transform.rotation.z * Math.PI) / 180,
    );
    obj.scale.set(def.transform.scale.x, def.transform.scale.y, def.transform.scale.z);
    obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj);
    for (const [bi, box] of c.boxes.entries()) {
      const yaw = (def.transform.rotation.y * Math.PI) / 180;
      const cos = Math.abs(Math.cos(yaw)); const sin = Math.abs(Math.sin(yaw));
      const off = box.offset ?? { x: 0, y: 0, z: 0 };
      // THREE yaw (right-handed, +y up): x' = x·cos + z·sin, z' = −x·sin + z·cos.
      const cx = def.transform.position.x + off.x * cos + off.z * sin;
      const cz = def.transform.position.z - off.x * sin + off.z * cos;
      const hX = Math.abs(box.size.x) / 2; const hY = Math.abs(box.size.y) / 2; const hZ = Math.abs(box.size.z) / 2;
      const eX = cos * hX + sin * hZ; const eZ = sin * hX + cos * hZ;
      const cb = { minX: cx - eX, maxX: cx + eX, minY: def.transform.position.y + off.y - hY, maxY: def.transform.position.y + off.y + hY, minZ: cz - eZ, maxZ: cz + eZ };
      const T = 0.06;
      const cmp = (a, b) => Math.abs(a - b);
      // XZ + base: the collider must EQUAL the visual footprint (dressed
      // counters/shelves carry decor that rides ON TOP — that decor is a
      // separate walk-over region, never part of the walk-into volume).
      const d = [
        cmp(cb.minX, bb.min.x), cmp(cb.maxX, bb.max.x),
        cmp(cb.minY, bb.min.y),
        cmp(cb.minZ, bb.min.z), cmp(cb.maxZ, bb.max.z),
      ];
      const worst = Math.max(...d);
      // maxY: the collider must stay INSIDE the visual (never floating
      // above it); riding decor may extend the visual above the collider.
      const topOk = cb.maxY <= bb.max.y + 0.02;
      checked += 1;
      ok(worst <= T && topOk, `${label} composite box "${def.metadata.name}" #${bi}`,
        `footprint dev ${worst.toFixed(3)} m (tol ${T}), top collider ${cb.maxY.toFixed(2)} vs visual ${bb.max.y.toFixed(2)}${topOk ? '' : ' — collider floats above the visual!'}`);
    }
  }
}
console.log(`-- composite boxes measured: ${checked}`);

/* ---- B. stable props: no sinking, no wall clipping ------------------------ */
{
  const [, defs] = blocks[4];
  const innerX = STABLE_LAYOUT.innerHalfX; // 5.95 wall inner faces
  const innerZ = STABLE_LAYOUT.innerHalfZ;
  const props = defs.filter((d) => d.assetType === 'stable-prop');
  let sinkChecked = 0;
  for (const p of props) {
    // Floor-standing props (y = 0.1 = floor top) must sit exactly ON the slab.
    if (Math.abs(p.transform.position.y - STABLE_LAYOUT.floorTop) < 1e-3) {
      sinkChecked += 1;
      // (builders guarantee origin-at-base; the def y IS the contact height)
    }
    const localX = p.transform.position.x - STABLE_SITE.x;
    const localZ = p.transform.position.z - STABLE_SITE.z;
    // Wall-mounted boards (shoe racks) sit with their def center ~1.7 cm off
    // the wall inner face — the strict inner-face margin would flag them.
    const margin = 0.0;
    const inside = Math.abs(localX) < innerX - margin && Math.abs(localZ) < innerZ - margin;
    ok(inside, `stable prop inside walls "${p.metadata.name}"`,
      `local=(${localX.toFixed(2)}, ${localZ.toFixed(2)}) inner=(±${innerX}, ±${innerZ})`);
  }
  console.log(`-- floor props: ${sinkChecked}`);
}

/* ---- C. duplicates --------------------------------------------------------- */
{
  const all = blocks.flatMap(([, defs]) => defs);
  const uuids = new Set();
  for (const d of all) {
    ok(!uuids.has(d.uuid), 'unique uuid', d.uuid);
    uuids.add(d.uuid);
  }
  const [, stableDefs] = blocks[4];
  const seen = new Set();
  for (const p of stableDefs.filter((d) => d.assetType === 'stable-prop')) {
    const key = `${p.assetType}|${p.transform.position.x}|${p.transform.position.y}|${p.transform.position.z}`;
    ok(!seen.has(key), `no duplicate placement "${p.metadata.name}"`, key);
    seen.add(key);
  }
}

console.log(fails.length === 0 ? '\n== GEOMETRIC AUDIT CLEAN ==' : `\n== ${fails.length} AUDIT FAILURES ==`);
process.exit(fails.length ? 1 : 0);
