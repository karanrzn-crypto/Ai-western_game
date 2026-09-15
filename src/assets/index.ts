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
