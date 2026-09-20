/**
 * tests/coplanar-regression.test.ts
 * -----------------------------------------------------------------------------
 * Z-FIGHT REGRESSION (user bug round — flickering boxes).
 *
 * The town-square crate, the gunshop ammo crate and the sheriff ammo crate
 * all shared the same construction defect: corner battens EXACTLY as tall as
 * the body, so every batten TOP face was coplanar with the body top face in
 * a DIFFERENT material → visible color flicker at all four top corners.
 *
 * These tests lock the fix at the SOURCE: in every crate builder, no
 * secondary mesh may END exactly at the body's top plane (co-facing coplanar
 * pair). Battens must rise PROUD of the body (≥ 5 mm) and sink below it.
 * The display-case glass must also clear the wall tops (≥ 2 mm).
 * -----------------------------------------------------------------------------
 */

import * as assert from 'node:assert/strict';
import * as THREE from 'three';
import { test } from 'node:test';

import { buildWoodCrate, buildWaterTrough } from '../src/assets/TownExteriorAssetFactory.js';
import { buildGunshopAmmoCrate, buildPistolDisplayCase } from '../src/assets/gunshop/GunShopProps.js';
import { buildAmmoCrate } from '../src/assets/sheriff/SheriffOfficeAssetFactory.js';

interface MeshPlane { mesh: THREE.Mesh; top: number; bottom: number }

/** Collect every mesh's top/bottom extent (local space — builders own it).
 *  Crate/trough/display-case parts are unrotated boxes, so position+bb is exact. */
function collectPlanes(root: THREE.Object3D): MeshPlane[] {
  const out: MeshPlane[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox!;
    out.push({ mesh: m, top: bb.max.y + m.position.y, bottom: bb.min.y + m.position.y });
  });
  return out;
}

/** Generic crate contract: pick the body (largest footprint mesh), then
 *  forbid any other mesh from ending exactly (±0.5 mm) on the body top. */
function assertNoCoplanarTops(root: THREE.Object3D, label: string): void {
  const planes = collectPlanes(root);
  assert.ok(planes.length >= 2, `${label}: has meshes`);
  // Body = the mesh with the largest XZ footprint (the crate shell itself).
  const area = (p: MeshPlane) => {
    p.mesh.geometry.computeBoundingBox();
    const bb = p.mesh.geometry.boundingBox!;
    return (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z);
  };
  const body = planes.reduce<MeshPlane>((a, b) => (area(b) > area(a) ? b : a), planes[0]);
  for (const p of planes) {
    if (p.mesh === body.mesh) continue;
    const coplanar = Math.abs(p.top - body.top) < 5e-4;
    assert.ok(!coplanar,
      `${label}: mesh "${p.mesh.name || '<unnamed>'}" top face is coplanar with the body top (${p.top.toFixed(4)} vs ${body.top.toFixed(4)}) — z-fight defect`);
  }
  // And the fix is the PROUD-trim construction: something rises above the body.
  const proudest = Math.max(...planes.filter((p) => p.mesh !== body.mesh).map((p) => p.top));
  assert.ok(proudest > body.top + 0.005,
    `${label}: trim rises proud of the body (proudest ${proudest.toFixed(4)} vs body ${body.top.toFixed(4)})`);
}

test('coplanar: town-square wood crate has no coplanar top faces', () => {
  assertNoCoplanarTops(buildWoodCrate(), 'wood-crate');
});

test('coplanar: gunshop ammo crate has no coplanar top faces', () => {
  assertNoCoplanarTops(buildGunshopAmmoCrate(), 'gunshop-ammo-crate');
});

test('coplanar: sheriff ammo crate has no coplanar top faces', () => {
  assertNoCoplanarTops(buildAmmoCrate(), 'sheriff-ammo-crate');
});

test('coplanar: display-case glass floats clear of the wall tops', () => {
  const g = buildPistolDisplayCase();
  const planes = collectPlanes(g);
  const glass = planes.find((p) => p.mesh.name === 'gunshop-display-glass');
  assert.ok(glass, 'glass lid exists');
  const wallTops = planes.filter((p) => p.mesh.name.startsWith('gunshop-display-wall')).map((p) => p.top);
  assert.ok(wallTops.length === 4, 'four case walls');
  for (const t of wallTops) {
    assert.ok(glass.bottom > t + 0.002,
      `glass bottom ${glass.bottom.toFixed(4)} clears wall top ${t.toFixed(4)} (≥ 2 mm, no coplanar pair)`);
  }
});

test('coplanar: water trough interior surfaces all clear of each other', () => {
  const trough = buildWaterTrough();
  const planes = collectPlanes(trough);
  const water = planes.find((p) => p.mesh.name === 'trough-water');
  assert.ok(water, 'trough water surface exists');
  const rims = planes.filter((p) => p.mesh.name.startsWith('trough-rim'));
  assert.ok(rims.length === 4, 'four rim caps');
  for (const rim of rims) {
    // Water sits well below the rim top (visible interior, no contact).
    assert.ok(water.top < rim.top - 0.02, `water ${water.top.toFixed(3)} below rim ${rim.top.toFixed(3)}`);
    // And the rim actually caps the walls (no wall poking through the rim top).
    const walls = planes.filter((p) => p.mesh.name.startsWith('trough-wall') || p.mesh.name.startsWith('trough-end'));
    for (const wall of walls) assert.ok(wall.top < rim.top + 1e-6, `wall ${wall.mesh.name} under rim top`);
  }
});
