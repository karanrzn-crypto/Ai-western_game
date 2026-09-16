/**
 * src/assets/sheriff/index.ts
 * -----------------------------------------------------------------------------
 * Public surface of the Sheriff Office asset module.
 *
 * The 14 INTERIOR asset builders (user-supplied library: sheriff desk/chair,
 * wanted board, badge, potbelly stove, gun rack/cabinet, key rack, kerosene
 * lamp, wash stand, coat rack, ammo crate, jail cell door, cell cot) live in
 * SheriffOfficeAssetFactory.ts VERBATIM — only the adapter block was rewritten
 * against the real AssetRegistry contract, plus the additive
 * setJailCellDoorOpen hinge API. The EXTERIOR (gable shell, porch, SHERIFF
 * sign, windows, bar fronts, lantern) lives in SheriffBuildingFactory.ts.
 * ALL placement data lives in SheriffLayout.ts — the ONE source of truth the
 * playable map and the tests share.
 * -----------------------------------------------------------------------------
 */

export {
  SHERIFF_LAYOUT,
  SHERIFF_SITE,
  SHERIFF_OBJECT_IDS,
  buildSheriffMapObjects,
} from './SheriffLayout.js';
export {
  SHERIFF_PALETTE,
  createSheriffMaterials,
  makeCanvas,
  toTexture,
  rand,
} from './SheriffMaterials.js';
export type { SheriffMaterials } from './SheriffMaterials.js';
export {
  buildSheriffDesk,
  buildSheriffChair,
  buildJailCellDoor,
  buildCellCot,
  buildGunRack,
  buildGunCabinet,
  buildWantedBoard,
  buildSheriffBadge,
  buildPotbellyStove,
  buildKeyRack,
  buildKeroseneLamp,
  buildWashStand,
  buildCoatRack,
  buildAmmoCrate,
  buildSheriffOfficeScene,
  SheriffAssetFactory,
  SHERIFF_OFFICE_ASSET_TYPES,
  registerSheriffAssetFactories,
  JAIL_CELL_DOOR_OPEN_ANGLE,
  setJailCellDoorOpen,
} from './SheriffOfficeAssetFactory.js';
export type { SheriffOfficeAssetType } from './SheriffOfficeAssetFactory.js';
export {
  buildSheriffShell,
  buildSheriffLantern,
  SheriffBuildingFactory,
  SheriffWallFactory,
  SheriffFloorFactory,
  SheriffCeilingFactory,
  SheriffBarSegmentFactory,
  SHERIFF_BUILDING_ASSET_TYPES,
  registerSheriffBuildingFactories,
} from './SheriffBuildingFactory.js';
export type { SheriffBuildingAssetType } from './SheriffBuildingFactory.js';

import type { AssetRegistry } from '../AssetRegistry.js';
import { registerSheriffAssetFactories } from './SheriffOfficeAssetFactory.js';
import { registerSheriffBuildingFactories } from './SheriffBuildingFactory.js';

/**
 * Register every Sheriff Office asset type (shell/masonry/planks/bar fronts +
 * the 14 user-supplied interior assets). Throws on duplicates — call ONCE
 * during boot.
 */
export function registerAllSheriffFactories(registry: AssetRegistry): void {
  registerSheriffBuildingFactories(registry);
  registerSheriffAssetFactories(registry);
}
