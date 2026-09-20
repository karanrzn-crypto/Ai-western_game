/**
 * src/assets/environment/index.ts — public surface of the environment layer.
 */

export {
  mulberry32,
  buildDirtRoad,
  buildTownWell,
  buildBench,
  buildStreetLamp,
  buildHitchingPost,
  buildWagon,
  buildTownSign,
  buildHayBale,
  buildWindmill,
  buildCropRow,
  ENV_PROP_COLLIDERS,
  registerEnvPropFactories,
} from './EnvPropsAssetFactory.js';

export {
  buildTree,
  buildDeadTree,
  buildBush,
  buildGrassTuft,
  buildRock,
  registerEnvNatureFactories,
} from './EnvNatureAssetFactory.js';

export type { EnvPlacement, Footprint } from './TownEnvironmentLayout.js';
export {
  BUILDING_FOOTPRINTS,
  ROAD_PLACEMENTS,
  PROP_PLACEMENTS,
  SIGN_PLACEMENTS,
  CROP_ROW_PLACEMENTS,
  FARM_FENCE_PLACEMENTS,
  CORRAL_FENCE_PLACEMENTS,
  RUIN_FENCE_PLACEMENTS,
  VEGETATION_PLACEMENTS,
  collectEnvironmentPlacements,
  pointInFootprint,
} from './TownEnvironmentLayout.js';
