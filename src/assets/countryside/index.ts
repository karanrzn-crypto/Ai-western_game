/**
 * src/assets/countryside/index.ts — the living countryside module surface.
 */
export {
  COUNTRY_BUILDING_TYPES,
  COUNTRY_COLLIDERS,
  buildHayBarn,
  buildEquipmentShed,
  buildRemoteCabin,
  buildChickenCoop,
  buildPigShelter,
  buildGrainSilo,
  createCountryFieldFactory,
  registerCountryFactories,
  type CountryBuildingType,
} from './CountryBuildings.js';
export {
  COUNTRY_SITES,
  COUNTRY_FENCE_RUNS,
  COUNTRY_FENCE_STYLES,
  COUNTRY_ROADS,
  COUNTRY_ROAD_CORRIDORS,
  COUNTRY_PONDS,
  COUNTRY_FIELDS,
  COUNTRY_HABITAT_RECTS,
  COUNTRY_ZONES,
  COUNTRY_HILLS,
  DEER_MEADOW,
  ZONE_DENSITY,
  buildCountryMapObjects,
  countryColliderFor,
  type CountrySite,
  type CountryFenceRun,
  type CountryFenceStyle,
  type CountryRoad,
  type CountryPond,
  type CountryField,
  type CountryZone,
  type CountryZoneKind,
  type HillSpec,
} from './CountryLayout.js';
export {
  COUNTRY_AMBIENT_ROOT,
  createCountryAmbient,
  type CountryAmbient,
  type CountryAmbientOptions,
  type CountryAmbientStats,
} from './CountryAmbient.js';
