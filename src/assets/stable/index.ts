/**
 * src/assets/stable/index.ts
 * -----------------------------------------------------------------------------
 * Public surface of the Livery Stable asset module (mirrors the saloon /
 * bank / sheriff index contracts):
 *
 *   StableLayout.ts          THE placement source of truth (defs, stalls,
 *                            door specs, prop catalog, site, UUID block)
 *   StableMaterials.ts       procedural palette + textures + sign painter
 *   StableProps.ts           the prop library
 *   StableDoors.ts           the 10 real doors + pure pose APIs
 *   StableStalls.ts          stall content groups + controlled variation
 *   StableEquipment.ts       per-kind zone-prop unit builders + prop factory
 *   StableArchitecture.ts    the shell kit + unit-box collider factories
 *   StableAssetFactory.ts    registration surface (registerAllStableFactories)
 * -----------------------------------------------------------------------------
 */

export {
  STABLE_LAYOUT,
  STABLE_SITE,
  STABLE_OBJECT_IDS,
  STABLE_STALLS,
  STABLE_DOOR_SPECS,
  STABLE_WALL_SEGMENT_UUIDS,
  STABLE_FRONT_SEGMENT_UUIDS,
  STABLE_PROPS,
  buildStableMapObjects,
} from './StableLayout.js';
export type { StableStallSpec, StableDoorSpec, StablePropSpec, StablePropKind } from './StableLayout.js';

export {
  STABLE_PALETTE,
  createStableMaterials,
  stableSignTexture,
} from './StableMaterials.js';
export type { StableMaterials } from './StableMaterials.js';

export {
  addBox,
  addCyl,
  signFace,
  hayBale,
  hayPile,
  hayClump,
  strawScatter,
  grainSack,
  woodCrate,
  smallBarrel,
  bucket,
  grainBox,
  pitchfork,
  shovel,
  broom,
  wallHook,
  hammer,
  tongs,
  horseshoe,
  anvil,
  saddle,
  saddleRack,
  bridleHanging,
  horseCollar,
  leatherStrap,
  drapedBlanket,
  horseBrush,
  woodenStool,
  toolBox,
  stableLantern,
  ladder,
  boardSign,
} from './StableProps.js';

export {
  buildStableGate,
  buildStableLeafDoor,
  setStableGateOpen,
  setStableLeafDoorOpen,
  STABLE_GATE_OPEN_ANGLE,
  STALL_DOOR_OPEN_ANGLE,
  ROOM_DOOR_OPEN_ANGLE,
  STAFF_DOOR_OPEN_ANGLE,
  STABLE_DOOR_ASSET_TYPES,
} from './StableDoors.js';
export type { LeafDoorMeta, StableDoorAssetType } from './StableDoors.js';

export { buildStallContents } from './StableStalls.js';

export {
  StablePropFactory,
  STABLE_FLOOR_TOP,
} from './StableEquipment.js';

export {
  buildStableShell,
  StableWallFactory,
  StableFloorFactory,
  StableBarWallFactory,
  StableStallFrontFactory,
  StableTroughFactory,
  StableWorkbenchFactory,
  StableAnvilFactory,
  STABLE_ARCH_ASSET_TYPES,
} from './StableArchitecture.js';
export type { StableArchAssetType } from './StableArchitecture.js';

export {
  StableAssetFactory,
  registerAllStableFactories,
  STABLE_ASSET_TYPES,
  STABLE_CONTENT_ASSET_TYPES,
} from './StableAssetFactory.js';
export type { StableContentAssetType } from './StableAssetFactory.js';
