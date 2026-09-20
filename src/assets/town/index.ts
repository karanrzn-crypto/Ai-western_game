/**
 * src/assets/town/index.ts — public surface of the town module.
 */

export { registerAllTownFactories } from './TownAssetFactory.js';
export {
  buildTownMapObjects,
  TOWN_GROUND_SIZE,
  TOWN_HALF,
  TOWN_SITES,
  TOWN_EXTERIOR_SITES,
  TOWN_RESPAWN,
  TOWN_HORSE_SPAWN,
} from './TownLayout.js';
export { TOWN_PALETTE, getTownMaterials, createTownMaterials } from './TownMaterials.js';
export type { TownMaterials } from './TownMaterials.js';
export { emitFountain } from './TownBuildings.js';
export type { TownDefSink } from './TownBuildings.js';
