/* Probe: actual world boxes of the gun shop door leaf / rack guns / case guns */
import * as THREE from 'three';
import {
  AssetRegistry, registerAllGunShopFactories, buildGunShopMapObjects,
  GUNSHOP_SITE, GUNSHOP_OBJECT_IDS, setGunShopFrontDoorOpen,
} from '../dist/src/index.js';

const registry = new AssetRegistry();
registerAllGunShopFactories(registry);
const defs = buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z);
const roots = new Map();
for (const def of defs) {
  const obj = await registry.create(def);
  const { position, rotation, scale } = def.transform;
  obj.position.set(position.x, position.y, position.z);
  obj.rotation.set(rotation.x * Math.PI / 180, rotation.y * Math.PI / 180, rotation.z * Math.PI / 180);
  obj.scale.set(scale.x, scale.y, scale.z);
  obj.uuid = def.uuid;
  obj.name = def.metadata.name;
  roots.set(def.uuid, obj);
}
const bb = (o) => { o.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(o); };

// Door leaf closed/open
const door = roots.get(GUNSHOP_OBJECT_IDS.frontDoor);
const leaf = door.getObjectByName('gunshop-front-door-leaf');
setGunShopFrontDoorOpen(door, 0);
console.log('leaf CLOSED:', bb(leaf));
setGunShopFrontDoorOpen(door, 1);
console.log('leaf OPEN:', bb(leaf));
setGunShopFrontDoorOpen(door, 0);

// Rack: local vs world axes
const rack = roots.get(GUNSHOP_OBJECT_IDS.rifleRack);
const backing = rack.getObjectByName('gunshop-rack-backing');
const bbk = bb(backing);
console.log('backing:', JSON.stringify({ min: bbk.min.toArray().map(v => +v.toFixed(3)), max: bbk.max.toArray().map(v => +v.toFixed(3)) }));
for (const gun of rack.children.filter(c => c.name.startsWith('gunshop-rack-gun-'))) {
  const gb = bb(gun);
  console.log(gun.name, JSON.stringify({ min: gb.min.toArray().map(v => +v.toFixed(3)), max: gb.max.toArray().map(v => +v.toFixed(3)) }));
}

// Case guns
const caseRoot = roots.get(GUNSHOP_OBJECT_IDS.displayCase);
const felt = bb(caseRoot.getObjectByName('gunshop-display-felt'));
const glass = bb(caseRoot.getObjectByName('gunshop-display-glass'));
console.log('felt top:', felt.max.y.toFixed(4), 'glass bottom:', glass.min.y.toFixed(4));
for (const gun of caseRoot.children.filter(c => c.name.startsWith('gunshop-display-'))) {
  const gb = bb(gun);
  console.log(gun.name, 'minY', gb.min.y.toFixed(4), 'maxY', gb.max.y.toFixed(4), 'z', gb.min.z.toFixed(3), '..', gb.max.z.toFixed(3));
}

// revolver local minY at the exact case transforms
const M = (await import('../dist/src/index.js'));
const rev = M.buildRevolver(0.9);
rev.position.set(0.35, 0.088, -0.03);
rev.rotation.y = Math.PI / 2;
rev.rotation.z = 0.24; // (i-1)*0.12 with i=2? no: revolver-3 i=2 → 0.12
rev.rotation.z = 0.12;
const rb = bb(rev);
console.log('revolver3 local minY:', rb.min.y.toFixed(4));
for (const c of rev.children) {
  const cb = bb(c);
  if (cb.min.y < 0.02) console.log('  low part:', c.name, cb.min.y.toFixed(4));
}
