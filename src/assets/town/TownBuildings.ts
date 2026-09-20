/**
 * src/assets/town/TownBuildings.ts
 * -----------------------------------------------------------------------------
 * Shared def-sink type + the central square's fountain.
 *
 * HISTORY NOTE (2026-09 merge): this module originally ALSO emitted the six
 * new buildings from scratch. The parallel model-defect round (scale-1.3
 * houses, butcher stall with DoubleSide hides, fixed lean-to/awnings/roofs)
 * landed richer, user-approved builders in
 * src/assets/TownExteriorAssetFactory.ts — the redesigned town now places
 * THOSE buildings (one def each, composite collider boxes, CollisionWorld
 * scales+rotates them) at the TownLayout sites. This module keeps only the
 * shared sink type and the fountain landmark.
 * -----------------------------------------------------------------------------
 */

import type { Vec3 } from '../../core/types.js';

export type TownDefSink = (
  assetType: string,
  name: string,
  transform: { position: Vec3; rotation: Vec3; scale: Vec3 },
  metadata: Record<string, unknown>,
) => void;

const identity = (): Vec3 => ({ x: 0, y: 0, z: 0 });

/* -------------------------------------------------------------------------- */
/* The fountain — the central square's landmark (user spec §8)                */
/* -------------------------------------------------------------------------- */

export function emitFountain(sink: TownDefSink, ox: number, oz: number): void {
  const box = (
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
    suffix: string, tint: string, collider: boolean,
  ): void => {
    sink(
      'town-box', `آب‌نمای میدان — ${suffix}`,
      { position: { x: ox + x, y, z: oz + z }, rotation: identity(), scale: { x: sx, y: sy, z: sz } },
      { tint, collider, editable: true },
    );
  };
  // square stone basin: 4 exact wall boxes + water + pedestal
  box(0, 0.07, 0, 3.4, 0.14, 3.4, 'سکوی سنگی', 'stoneDark', true);
  box(0, 0.41, -1.35, 3.0, 0.55, 0.3, 'جداره شمالی', 'stone', true);
  box(0, 0.41, 1.35, 3.0, 0.55, 0.3, 'جداره جنوبی', 'stone', true);
  box(-1.35, 0.41, 0, 0.3, 0.55, 2.4, 'جداره غربی', 'stone', true);
  box(1.35, 0.41, 0, 0.3, 0.55, 2.4, 'جداره شرقی', 'stone', true);
  box(0, 0.3, 0, 2.4, 0.32, 2.4, 'کف حوض', 'stoneDark', true);
  box(0, 0.47, 0, 2.36, 0.06, 2.36, 'آب حوض', 'water', false);
  box(0, 0.85, 0, 0.55, 0.85, 0.55, 'ستون میانی', 'stone', true);
  box(0, 1.32, 0, 0.95, 0.16, 0.95, 'طشت بالایی', 'stoneDark', true);
  box(0, 1.42, 0, 0.8, 0.06, 0.8, 'آب طشت', 'water', false);
}

