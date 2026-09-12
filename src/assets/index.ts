/**
 * src/assets/index.ts
 * -----------------------------------------------------------------------------
 * Public surface of the asset layer.
 * -----------------------------------------------------------------------------
 */

export type { IAssetFactory, AssetFactoryFn } from './IAssetFactory.js';
export { AssetRegistry } from './AssetRegistry.js';
export { CubeAssetFactory, registerPrimitiveFactories } from './PrimitiveAssetFactory.js';
