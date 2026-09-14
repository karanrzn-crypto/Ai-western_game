/**
 * src/assets/saloon/SaloonMaterials.ts
 * -----------------------------------------------------------------------------
 * Shared saloon PALETTE + per-object material sets.
 *
 * Disposal contract: ThreeRendererAdapter.disposeObject3D() disposes every
 * material it finds in a managed object's subtree. Materials must therefore
 * be created PER FACTORY CALL (createSaloonMaterials()) and shared only
 * WITHIN one produced object — never as cross-object module singletons,
 * or deleting one prop would dispose a material still used by another.
 *
 * Performance rules honoured here:
 *   - No textures; MeshStandardMaterial only (DayNightCycle-lit).
 *   - OPAQUE "glass" (dark, semi-smooth) — transparency only where it is
 *     genuinely needed, and the saloon needs it nowhere.
 *   - Low roughness variance; no env maps.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';

/** Shared saloon palette (linear-space hex colors). */
export const SALOON_PALETTE = Object.freeze({
  woodDark: 0x5a3722,
  woodMed: 0x8a5a34,
  woodLight: 0xa9764c,
  brass: 0xb08d3d,
  iron: 0x2b2b2b,
  glassDark: 0x1c2a33,
  feltGreen: 0x225533,
  mirror: 0xbfd8e0,
  paper: 0xe8dcc0,
  ink: 0x2a2016,
  flame: 0xffb066,
});

export interface SaloonMaterials {
  woodDark: THREE.MeshStandardMaterial;
  woodMed: THREE.MeshStandardMaterial;
  woodLight: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  glassDark: THREE.MeshStandardMaterial;
  felt: THREE.MeshStandardMaterial;
  mirror: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  ink: THREE.MeshStandardMaterial;
  /** Emissive flame chip — glows without adding a real light. */
  flame: THREE.MeshStandardMaterial;
  /** Dark lamp glass for lantern bodies. */
  lampGlass: THREE.MeshStandardMaterial;
}

const wood = (color: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.04 });

const metal = (color: number, roughness = 0.35): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.85 });

/**
 * One material set per produced object. Meshes inside the same object share
 * these instances (material reuse within the object — cheap draw setup),
 * while objects never share instances across the registry.
 */
export function createSaloonMaterials(): SaloonMaterials {
  return {
    woodDark: wood(SALOON_PALETTE.woodDark),
    woodMed: wood(SALOON_PALETTE.woodMed),
    woodLight: wood(SALOON_PALETTE.woodLight),
    brass: metal(SALOON_PALETTE.brass, 0.3),
    iron: metal(SALOON_PALETTE.iron, 0.4),
    glassDark: new THREE.MeshStandardMaterial({
      color: SALOON_PALETTE.glassDark,
      roughness: 0.15,
      metalness: 0.55,
    }),
    felt: new THREE.MeshStandardMaterial({
      color: SALOON_PALETTE.feltGreen,
      roughness: 0.95,
      metalness: 0,
    }),
    mirror: new THREE.MeshStandardMaterial({
      color: SALOON_PALETTE.mirror,
      roughness: 0.08,
      metalness: 0.9,
    }),
    paper: new THREE.MeshStandardMaterial({
      color: SALOON_PALETTE.paper,
      roughness: 1,
      metalness: 0,
    }),
    ink: new THREE.MeshStandardMaterial({
      color: SALOON_PALETTE.ink,
      roughness: 0.9,
      metalness: 0,
    }),
    flame: new THREE.MeshStandardMaterial({
      color: SALOON_PALETTE.flame,
      emissive: SALOON_PALETTE.flame,
      emissiveIntensity: 1.6,
      roughness: 0.6,
    }),
    lampGlass: new THREE.MeshStandardMaterial({
      color: 0x3d2f1e,
      emissive: 0xff9a3d,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      metalness: 0.2,
    }),
  };
}
