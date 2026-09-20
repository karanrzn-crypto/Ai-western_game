import * as THREE from 'three';
import type { ObjectDefinition } from '../core/types.js';
import type { IAssetFactory } from './IAssetFactory.js';

/**
 * Large flat ground used by the playable movement map.
 *
 * BIOME (reference-image round): warm, yellowish, DUSTY dry soil — compact
 * western dirt, not bright orange sand and not gray concrete. The look is
 * painted ONCE into a shared canvas texture (soft blotches + speckle noise)
 * and stretched over the whole map: at 100 m the blur reads as fine dust,
 * and the dirt-road patches + vegetation carry the sharp detail.
 */

/** Painted once per session — every ground def shares the same texture. */
let groundTexture: THREE.CanvasTexture | null = null;

/** Node/test environments have no DOM — fall back to the flat dirt color. */
function hasDom(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function paintGroundTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Base: yellowish dusty dirt.
  ctx.fillStyle = '#b39a63';
  ctx.fillRect(0, 0, size, size);

  const rng = mulberry32(0xD157);

  // Large soft tint regions (uneven moisture, worn patches).
  const tints = ['#a58a58', '#c2aa74', '#9c844f', '#baa06a', '#8f7b4e'];
  for (let i = 0; i < 26; i++) {
    const x = rng() * size; const y = rng() * size;
    const r = 90 + rng() * 220;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const color = tints[Math.floor(rng() * tints.length)];
    g.addColorStop(0, color + '55');
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Speckle noise: grit and small stones.
  for (let i = 0; i < 2600; i++) {
    const x = rng() * size; const y = rng() * size;
    const a = 0.05 + rng() * 0.12;
    ctx.fillStyle = rng() > 0.5 ? `rgba(70,58,36,${a})` : `rgba(226,206,160,${a})`;
    const s = rng() * 2.4 + 0.6;
    ctx.fillRect(x, y, s, s);
  }

  // Faint dry-grass tinge patches (where prairie vegetation would sit).
  for (let i = 0; i < 14; i++) {
    const x = rng() * size; const y = rng() * size;
    const r = 40 + rng() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(130,132,80,12)');
    g.addColorStop(1, 'rgba(130,132,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Textured dusty ground plane (yellow western soil, see biome note above). */
export class GroundAssetFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const size = Number(definition.metadata.size ?? 80);
    const safeSize = Number.isFinite(size) && size > 0 ? size : 80;
    if (hasDom()) {
      if (!groundTexture) groundTexture = paintGroundTexture();
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(safeSize, safeSize),
        new THREE.MeshStandardMaterial({ color: 0xffffff, map: groundTexture, roughness: 1 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.receiveShadow = true;
      return mesh;
    }
    // Headless fallback (node tests / server-side): same biome color, no map.
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(safeSize, safeSize),
      new THREE.MeshStandardMaterial({ color: 0xb39a63, roughness: 1 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  }
}
