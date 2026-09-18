/**
 * src/assets/gunshop/index.ts
 * -----------------------------------------------------------------------------
 * Public surface of the Gun Shop asset module (mirrors the saloon / bank /
 * sheriff / stable index contracts):
 *
 *   GunShopLayout.ts       THE placement source of truth (layout, site,
 *                          object ids, door spec, map-object emission)
 *   GunShopMaterials.ts    procedural palette + memoized canvas textures +
 *                          the shared material cache
 *   GunShopProps.ts        the weapon + fixture prop library
 *   GunShopArchitecture.ts shell kit + unit-box collider factories + the
 *                          real openable front door + its pure pose API
 *   GunShopAssetFactory.ts registration surface (registerAllGunShopFactories)
 * -----------------------------------------------------------------------------
 */

export {
  GUNSHOP_LAYOUT,
  GUNSHOP_SITE,
  GUNSHOP_OBJECT_IDS,
  GUNSHOP_DOOR_SPEC,
  buildGunShopMapObjects,
} from './GunShopLayout.js';
// NOTE: `frontWallSegments` stays module-internal — the saloon index already
// exports that exact name and the barrel `export *` forbids duplicates.

export {
  GUNSHOP_PALETTE,
  createGunShopMaterials,
  woodTexture,
  steelTexture,
  checkeringTexture,
  feltTexture,
  ammoLabelTexture,
  signTexture,
} from './GunShopMaterials.js';
export type { GunShopMaterials } from './GunShopMaterials.js';

export {
  buildRevolver,
  buildLeverActionRifle,
  buildDoubleBarrelShotgun,
  buildDerringer,
  buildBowieKnife,
  buildGunshopCounter,
  buildPistolDisplayCase,
  buildRifleWallRack,
  buildGunShelfUnit,
  buildCashRegister,
  buildBrassScale,
  buildCartridgeStand,
  buildGunshopAmmoBox,
  buildGunshopAmmoCrate,
  buildPowderKeg,
  buildGunsmithSign,
  buildHolsterDisplay,
  buildGunshopWorkbench,
  buildGunshopVise,
  buildGunshopToolRack,
  buildGunshopLantern,
} from './GunShopProps.js';

export {
  buildGunShopShell,
  buildGunShopWindowAssembly,
  buildGunShopFrontDoor,
  setGunShopFrontDoorOpen,
  frontDoorMetaOf,
  GunShopWallFactory,
  GunShopFloorFactory,
} from './GunShopArchitecture.js';
export type { GunShopFrontDoorMeta } from './GunShopArchitecture.js';

export {
  GunShopBuildingFactory,
  GunShopFrontDoorFactory,
  GunShopWindowFactory,
  GunShopSignFactory,
  GunShopLanternFactory,
  GunShopAmmoBoxFactory,
  GunShopAmmoCrateFactory,
  GUNSHOP_ASSET_TYPES,
  registerAllGunShopFactories,
} from './GunShopAssetFactory.js';
export type { GunShopAssetType } from './GunShopAssetFactory.js';
