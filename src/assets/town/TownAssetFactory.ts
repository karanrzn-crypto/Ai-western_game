/**
 * src/assets/town/TownAssetFactory.ts
 * -----------------------------------------------------------------------------
 * Registers every town asset type. One type per factory, the saloon/stable/
 * bank/gunshop pattern. Namespaced `town-` — the other buildings' namespaces
 * are untouched (registration throws on duplicates, so a collision can never
 * slip through silently).
 * -----------------------------------------------------------------------------
 */

import type { AssetRegistry } from '../AssetRegistry.js';
import {
  TownGroundFactory,
  TownRoadFactory,
  TownBoxFactory,
  TownFenceFactory,
  TownLampPostFactory,
  TownLampHeadFactory,
  TownBenchFactory,
  TownBarrelFactory,
  TownCrateFactory,
  TownTroughFactory,
  TownHayFactory,
  TownRockFactory,
  TownWoodpileFactory,
  TownHitchingFactory,
  TownWagonFactory,
  TownSignFactory,
  TownTreeFactory,
  TownBushFactory,
  TownGrassFactory,
  TownCropsFactory,
  TownPondFactory,
  TownHorseFactory,
  TownWindmillFactory,
  TownMeatRailFactory,
  TownWindowFactory,
  TownDoorTrimFactory,
  TownBoardFactory,
} from './TownProps.js';

/** Register every town factory under its stable assetType name. */
export function registerAllTownFactories(registry: AssetRegistry): void {
  registry.register('town-ground', new TownGroundFactory(), 'Town Ground');
  registry.register('town-road', new TownRoadFactory(), 'Town Road Strip');
  registry.register('town-box', new TownBoxFactory(), 'Town Box');
  registry.register('town-fence', new TownFenceFactory(), 'Town Fence Section');
  registry.register('town-lamp-post', new TownLampPostFactory(), 'Town Lamp Post');
  registry.register('town-lamp-head', new TownLampHeadFactory(), 'Town Lamp Head');
  registry.register('town-bench', new TownBenchFactory(), 'Town Bench');
  registry.register('town-barrel', new TownBarrelFactory(), 'Town Barrel');
  registry.register('town-crate', new TownCrateFactory(), 'Town Crate');
  registry.register('town-trough', new TownTroughFactory(), 'Town Trough');
  registry.register('town-hay', new TownHayFactory(), 'Town Hay Bale');
  registry.register('town-rock', new TownRockFactory(), 'Town Rock');
  registry.register('town-woodpile', new TownWoodpileFactory(), 'Town Wood Pile');
  registry.register('town-hitching', new TownHitchingFactory(), 'Town Hitching Post');
  registry.register('town-wagon', new TownWagonFactory(), 'Town Wagon');
  registry.register('town-sign', new TownSignFactory(), 'Town Sign');
  registry.register('town-tree', new TownTreeFactory(), 'Town Tree');
  registry.register('town-bush', new TownBushFactory(), 'Town Bush');
  registry.register('town-grass', new TownGrassFactory(), 'Town Grass Cluster');
  registry.register('town-crops', new TownCropsFactory(), 'Town Crop Field');
  registry.register('town-pond', new TownPondFactory(), 'Town Pond');
  registry.register('town-horse', new TownHorseFactory(), 'Town Horse');
  registry.register('town-windmill', new TownWindmillFactory(), 'Town Windmill');
  registry.register('town-meat-rail', new TownMeatRailFactory(), 'Town Meat Rail');
  registry.register('town-window', new TownWindowFactory(), 'Town Window');
  registry.register('town-door', new TownDoorTrimFactory(), 'Town Door Trim');
  registry.register('town-board', new TownBoardFactory(), 'Town Painted Board');
}
