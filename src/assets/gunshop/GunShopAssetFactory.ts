/**
 * src/assets/gunshop/GunShopAssetFactory.ts
 * -----------------------------------------------------------------------------
 * The Gun Shop registration surface — every assetType the module owns plus
 * the one-call registerAllGunShopFactories() (mirrors registerSaloonFactories
 * / registerAllBankFactories / registerAllSheriffFactories /
 * registerAllStableFactories).
 *
 * Contract (identical to every other module):
 *  - Factories implement IAssetFactory.create(definition) and build ONLY
 *    mesh-level state; the registry transform is applied by the renderer
 *    adapter, UUID/name mirroring by AssetRegistry.create().
 *  - registerAllGunShopFactories composes with the other modules' calls and
 *    throws on duplicate registration (the registry enforces explicit intent).
 *  - All type strings live in the `gunshop-` namespace: the user file's bare
 *    `gun-rack` / `ammo-crate` names collide with EXISTING sheriff assets
 *    and are deliberately re-namespaced here.
 * -----------------------------------------------------------------------------
 */

import type * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { IAssetFactory } from '../IAssetFactory.js';
import type { AssetRegistry } from '../AssetRegistry.js';
import { GUNSHOP_LAYOUT } from './GunShopLayout.js';
import {
  buildGunShopShell,
  buildGunShopWindowAssembly,
  buildGunShopFrontDoor,
  frontDoorMetaOf,
  GunShopWallFactory,
  GunShopFloorFactory,
} from './GunShopArchitecture.js';
import {
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

/* ========================================================================== */
/* Factory classes                                                            */
/* ========================================================================== */

/** The shell — reads width/depth/height/doorWidth from metadata. */
export class GunShopBuildingFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    return buildGunShopShell(shellDimsOf(definition));
  }
}

function shellDimsOf(definition: ObjectDefinition): { width: number; depth: number; height: number; doorWidth: number } {
  const meta = definition.metadata as Record<string, unknown>;
  const num = (key: string, fallback: number): number => {
    const v = Number(meta[key]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    width: num('width', GUNSHOP_LAYOUT.width),
    depth: num('depth', GUNSHOP_LAYOUT.depth),
    height: num('height', GUNSHOP_LAYOUT.height),
    doorWidth: num('doorWidth', GUNSHOP_LAYOUT.doorWidth),
  };
}

/** The openable front door — swing metadata rides the def (stable pattern). */
export class GunShopFrontDoorFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    return buildGunShopFrontDoor(frontDoorMetaOf(definition));
  }
}

/** One facade window (metadata: side −1/+1, offset from the doorway center). */
export class GunShopWindowFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const meta = definition.metadata as Record<string, unknown>;
    const side = Number(meta.side) < 0 ? -1 : 1;
    const offset = Number(meta.offset);
    return buildGunShopWindowAssembly(
      side,
      Number.isFinite(offset) && offset > 0 ? offset : GUNSHOP_LAYOUT.window.centersFromDoor[0],
    );
  }
}

/** The hanging GUNSMITH sign. */
export class GunShopSignFactory implements IAssetFactory {
  create(_definition: ObjectDefinition): THREE.Object3D {
    return buildGunsmithSign();
  }
}

/** Interior lantern — metadata `lit` gates the ONE real PointLight. */
export class GunShopLanternFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const meta = definition.metadata as Record<string, unknown>;
    return buildGunshopLantern(meta.lit === true);
  }
}

/** Small shared helper for parameterless prop builders. */
class BuilderFactory implements IAssetFactory {
  constructor(private readonly build: () => THREE.Object3D) {}
  create(_definition: ObjectDefinition): THREE.Object3D {
    return this.build();
  }
}

/** Ammo crate — caliber rides the def metadata (layout pins it per def). */
export class GunShopAmmoCrateFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const meta = definition.metadata as Record<string, unknown>;
    const caliber = typeof meta.caliber === 'string' && meta.caliber.length > 0 ? meta.caliber : '.44-40 WCF';
    return buildGunshopAmmoCrate(caliber);
  }
}

/** Ammo box — caliber rides the def metadata. */
export class GunShopAmmoBoxFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const meta = definition.metadata as Record<string, unknown>;
    const caliber = typeof meta.caliber === 'string' && meta.caliber.length > 0 ? meta.caliber : '.45 COLT';
    return buildGunshopAmmoBox(caliber);
  }
}

/* ========================================================================== */
/* Registration                                                               */
/* ========================================================================== */

/** All assetType strings the gun shop module registers (UI lists / tests). */
export const GUNSHOP_ASSET_TYPES = Object.freeze([
  'gunshop-building',
  'gunshop-wall',
  'gunshop-floor',
  'gunshop-front-door',
  'gunshop-window',
  'gunshop-sign',
  'gunshop-lantern',
  'gunshop-counter',
  'gunshop-pistol-display-case',
  'gunshop-rifle-wall-rack',
  'gunshop-shelf-unit',
  'gunshop-cash-register',
  'gunshop-brass-scale',
  'gunshop-cartridge-stand',
  'gunshop-ammo-box',
  'gunshop-ammo-crate',
  'gunshop-powder-keg',
  'gunshop-bowie-knife',
  'gunshop-holster-display',
  'gunshop-workbench',
  'gunshop-vise',
  'gunshop-tool-rack',
  'gunshop-revolver',
  'gunshop-lever-rifle',
  'gunshop-shotgun',
  'gunshop-derringer',
] as const);

export type GunShopAssetType = (typeof GUNSHOP_ASSET_TYPES)[number];

/**
 * Register every gun shop asset type. Throws on duplicate registration (the
 * registry enforces explicit intent), so call it ONCE during boot — it
 * composes cleanly with the other modules' register* calls.
 */
export function registerAllGunShopFactories(registry: AssetRegistry): void {
  registry.register('gunshop-building', new GunShopBuildingFactory(), 'Gun Shop Building');
  registry.register('gunshop-wall', new GunShopWallFactory(), 'Gun Shop Wall');
  registry.register('gunshop-floor', new GunShopFloorFactory(), 'Gun Shop Floor');
  registry.register('gunshop-front-door', new GunShopFrontDoorFactory(), 'Gun Shop Front Door');
  registry.register('gunshop-window', new GunShopWindowFactory(), 'Gun Shop Window');
  registry.register('gunshop-sign', new GunShopSignFactory(), 'Gun Shop Sign');
  registry.register('gunshop-lantern', new GunShopLanternFactory(), 'Gun Shop Lantern');
  registry.register('gunshop-counter', new BuilderFactory(() => buildGunshopCounter()), 'Gun Shop Counter');
  registry.register('gunshop-pistol-display-case', new BuilderFactory(() => buildPistolDisplayCase()), 'Gun Shop Pistol Display Case');
  registry.register('gunshop-rifle-wall-rack', new BuilderFactory(() => buildRifleWallRack()), 'Gun Shop Rifle Wall Rack');
  registry.register('gunshop-shelf-unit', new BuilderFactory(() => buildGunShelfUnit()), 'Gun Shop Shelf Unit');
  registry.register('gunshop-cash-register', new BuilderFactory(() => buildCashRegister()), 'Gun Shop Cash Register');
  registry.register('gunshop-brass-scale', new BuilderFactory(() => buildBrassScale()), 'Gun Shop Brass Scale');
  registry.register('gunshop-cartridge-stand', new BuilderFactory(() => buildCartridgeStand()), 'Gun Shop Cartridge Stand');
  registry.register('gunshop-ammo-box', new GunShopAmmoBoxFactory(), 'Gun Shop Ammo Box');
  registry.register('gunshop-ammo-crate', new GunShopAmmoCrateFactory(), 'Gun Shop Ammo Crate');
  registry.register('gunshop-powder-keg', new BuilderFactory(() => buildPowderKeg()), 'Gun Shop Powder Keg');
  registry.register('gunshop-bowie-knife', new BuilderFactory(() => buildBowieKnife()), 'Gun Shop Bowie Knife');
  registry.register('gunshop-holster-display', new BuilderFactory(() => buildHolsterDisplay()), 'Gun Shop Holster Display');
  registry.register('gunshop-workbench', new BuilderFactory(() => buildGunshopWorkbench()), 'Gun Shop Workbench');
  registry.register('gunshop-vise', new BuilderFactory(() => buildGunshopVise()), 'Gun Shop Vise');
  registry.register('gunshop-tool-rack', new BuilderFactory(() => buildGunshopToolRack()), 'Gun Shop Tool Rack');
  registry.register('gunshop-revolver', new BuilderFactory(() => buildRevolver()), 'Gun Shop Revolver');
  registry.register('gunshop-lever-rifle', new BuilderFactory(() => buildLeverActionRifle()), 'Gun Shop Lever Rifle');
  registry.register('gunshop-shotgun', new BuilderFactory(() => buildDoubleBarrelShotgun()), 'Gun Shop Shotgun');
  registry.register('gunshop-derringer', new BuilderFactory(() => buildDerringer()), 'Gun Shop Derringer');
}
