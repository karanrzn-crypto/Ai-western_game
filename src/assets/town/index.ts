/**
 * src/assets/town/index.ts — public surface of the town module.
 */

export { registerAllTownFactories } from './TownAssetFactory.js';
export {
  buildTownMapObjects,
  TOWN_GROUND_SIZE,
  TOWN_HALF,
  TOWN_SITES,
  TOWN_RESPAWN,
  TOWN_HORSE_SPAWN,
} from './TownLayout.js';
export { TOWN_PALETTE, getTownMaterials, createTownMaterials } from './TownMaterials.js';
export type { TownMaterials } from './TownMaterials.js';
export { emitHouseShell, emitFountain, emitRuinedHouse } from './TownBuildings.js';
export type { HouseShellSpec, TownDefSink } from './TownBuildings.js';
