/**
 * src/assets/saloon/index.ts
 * -----------------------------------------------------------------------------
 * Public surface of the saloon asset module.
 * -----------------------------------------------------------------------------
 */

export { SALOON_LAYOUT, SALOON_SITE, SALOON_OBJECT_IDS, frontWallSegments, buildSaloonMapObjects } from './SaloonLayout.js';
export { SALOON_PALETTE, createSaloonMaterials } from './SaloonMaterials.js';
export type { SaloonMaterials } from './SaloonMaterials.js';
export {
  buildBarCounter,
  buildBackBar,
  buildBarStool,
  buildPokerTable,
  buildSaloonChair,
  buildPiano,
  buildSwingingDoors,
  buildChandelier,
  buildSpittoon,
  buildWhiskeyBarrel,
  buildWantedPoster,
} from './SaloonProps.js';
export type { PropSizeOptions, ChandelierOptions } from './SaloonProps.js';
export {
  buildSaloonShell,
  SaloonBuildingFactory,
  SaloonWallFactory,
  SaloonBarCounterFactory,
  SaloonBackBarFactory,
  SaloonBarStoolFactory,
  SaloonPokerTableFactory,
  SaloonChairFactory,
  SaloonPianoFactory,
  SaloonSwingingDoorsFactory,
  SaloonChandelierFactory,
  SaloonSpittoonFactory,
  SaloonWhiskeyBarrelFactory,
  SaloonWantedPosterFactory,
  SALOON_ASSET_TYPES,
  registerSaloonFactories,
} from './SaloonBuildingFactory.js';
export type { SaloonAssetType } from './SaloonBuildingFactory.js';
