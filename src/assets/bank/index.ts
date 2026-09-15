/**
 * src/assets/bank/index.ts
 * -----------------------------------------------------------------------------
 * Public surface of the bank asset module.
 *
 * The INTERIOR asset builders/factories live in BankInteriorAssetFactory.ts —
 * the user-supplied visual asset library, used verbatim (vault door, teller
 * counter/cage, banker desk/chair, safe-deposit wall, floor safe, grandfather
 * clock, gas wall lamp, marble column, money bag, coin stack, floor rug,
 * bank sign). The EXTERIOR (classical shell + masonry unit boxes) lives in
 * BankExterior.ts. registerAllBankFactories() registers BOTH groups in one
 * call — the playable map calls it once during boot.
 * -----------------------------------------------------------------------------
 */

export { BANK_PALETTE, createBankMaterials } from './BankMaterials.js';
export type { BankMaterials } from './BankMaterials.js';
export {
  BANK_LAYOUT,
  BANK_SITE,
  BANK_OBJECT_IDS,
  buildBankMapObjects,
} from './BankLayout.js';
export {
  buildBankShell,
  BankBuildingFactory,
  BankWallFactory,
  BankStairFactory,
  BankFloorFactory,
  BANK_EXTERIOR_ASSET_TYPES,
  registerBankExteriorFactories,
} from './BankExterior.js';
export {
  buildBankVaultDoor,
  buildTellerCounter,
  buildTellerCage,
  buildBankersDesk,
  buildBankersChair,
  buildSafeDepositWall,
  buildFloorSafe,
  buildGrandfatherClock,
  buildGasWallLamp,
  buildMarbleColumn,
  buildMoneyBag,
  buildCoinStack,
  buildFloorRug,
  buildBankSign,
  buildBankInteriorScene,
  BANK_INTERIOR_ASSET_TYPES,
  registerBankFactories,
} from './BankInteriorAssetFactory.js';
export type { BankInteriorAssetType } from './BankInteriorAssetFactory.js';

import type { AssetRegistry } from '../AssetRegistry.js';
import { registerBankExteriorFactories } from './BankExterior.js';
import { registerBankFactories } from './BankInteriorAssetFactory.js';

/**
 * Register every bank asset type (exterior shell/masonry + the supplied
 * interior library). Throws on duplicates — call ONCE during boot.
 */
export function registerAllBankFactories(registry: AssetRegistry): void {
  registerBankExteriorFactories(registry);
  registerBankFactories(registry);
}
