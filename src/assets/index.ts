/**
 * src/assets/index.ts
 * -----------------------------------------------------------------------------
 * Public surface of the asset layer.
 * -----------------------------------------------------------------------------
 */

export type { IAssetFactory, AssetFactoryFn } from './IAssetFactory.js';
export { AssetRegistry } from './AssetRegistry.js';
export { CubeAssetFactory, GroundAssetFactory, registerPrimitiveFactories } from './PrimitiveAssetFactory.js';
export * from './saloon/index.js';
export * from './bank/index.js';
export * from './sheriff/index.js';
export * from './stable/index.js';
export * from './gunshop/index.js';
export * from './SiteTransform.js';
export * from './town/index.js';
export {
  TOWN_EXTERIOR_ASSET_TYPES,
  TOWN_EXTERIOR_COLLIDERS,
  registerTownExteriorFactories,
  buildButcherStall,
  buildWorkerHouse,
  buildFamilyHouse,
  buildWealthyTownhouse,
  buildFarmhouse,
  buildAbandonedHouse,
  buildTownExteriorScene,
  buildWoodCrate,
  buildBarrelProp,
  buildFirewoodStack,
  buildAnimalHide,
  buildHangingMeatCut,
  buildWeedClump,
  buildFenceSection,
  buildWaterTrough,
} from './TownExteriorAssetFactory.js';
export type { TownExteriorAssetType, ColliderBoxSpec } from './TownExteriorAssetFactory.js';

