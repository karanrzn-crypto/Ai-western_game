/**
 * src/assets/stable/StableAssetFactory.ts
 * -----------------------------------------------------------------------------
 * The stable module's REGISTRATION SURFACE (kept deliberately small — the
 * builders live in their own modules):
 *
 *   StableMaterials.ts      procedural palette + textures
 *   StableProps.ts          the prop library (hay, buckets, tools, tack…)
 *   StableDoors.ts          the 10 real doors + their pose APIs
 *   StableStalls.ts         per-stall content groups + controlled variation
 *   StableEquipment.ts      tack/feed/farrier/water/loft zone contents
 *   StableArchitecture.ts   the shell kit + unit-box collider factories
 *   StableLayout.ts         THE placement source of truth (defs + tables)
 *
 * `StableAssetFactory` is the generic group adapter (builds a group via a
 * callback, never touches the registry transform) and
 * `registerAllStableFactories()` registers every stable asset type exactly
 * once — the playable map calls it during boot.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { IAssetFactory } from '../IAssetFactory.js';
import type { AssetRegistry } from '../AssetRegistry.js';
import { buildStallContents } from './StableStalls.js';
import {
  buildTackRoomContents,
  buildFeedRoomContents,
  buildFarrierContents,
  buildWaterContents,
  buildLoftContents,
} from './StableEquipment.js';
import {
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
import { buildStableGate, buildStableLeafDoor, STABLE_DOOR_ASSET_TYPES, type LeafDoorMeta } from './StableDoors.js';
import { STABLE_LAYOUT, STABLE_STALLS } from './StableLayout.js';

/** Generic group adapter: wraps a builder into an IAssetFactory. */
export class StableAssetFactory implements IAssetFactory {
  constructor(private readonly build: (definition: ObjectDefinition) => THREE.Object3D) {}
  create(definition: ObjectDefinition): THREE.Object3D {
    return this.build(definition);
  }
}

/** The shell dims come from the def's metadata (never drifts from the layout). */
function shellFromDefinition(definition: ObjectDefinition): THREE.Object3D {
  const meta = definition.metadata as Record<string, unknown>;
  const num = (key: string, fallback: number): number => {
    const v = Number(meta[key]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return buildStableShell({
    width: num('width', STABLE_LAYOUT.width),
    depth: num('depth', STABLE_LAYOUT.depth),
    height: num('height', STABLE_LAYOUT.wallHeight),
    gateWidth: num('gateWidth', STABLE_LAYOUT.mainGate.xMax - STABLE_LAYOUT.mainGate.xMin),
    gateHeight: num('gateHeight', STABLE_LAYOUT.mainGate.height),
  });
}

const stallByIndex = new Map(STABLE_STALLS.map((s) => [s.index, s]));

/** Leaf-door build parameters ride in the def metadata (see StableLayout). */
function leafDoorFromDefinition(definition: ObjectDefinition): THREE.Object3D {
  const meta = definition.metadata as Record<string, unknown>;
  const leafMeta: LeafDoorMeta = {
    width: Number(meta.width) || 1,
    height: Number(meta.height) || 2.2,
    style: (meta.style as LeafDoorMeta['style']) || 'stall',
    hinge: (meta.hinge as LeafDoorMeta['hinge']) || 'left',
    openSign: (Number(meta.openSign) || 1) as 1 | -1,
    openDeg: Number(meta.openDeg) || (100 * Math.PI) / 180,
  };
  return buildStableLeafDoor(leafMeta);
}

/** All group-content asset types (the unit factories register separately). */
export const STABLE_CONTENT_ASSET_TYPES = Object.freeze([
  'stable-stall-contents',
  'stable-tack-contents',
  'stable-feed-contents',
  'stable-farrier-contents',
  'stable-water-contents',
  'stable-loft-contents',
] as const);

export type StableContentAssetType = (typeof STABLE_CONTENT_ASSET_TYPES)[number];

/** Every stable asset type (architecture + doors + content groups). */
export const STABLE_ASSET_TYPES = Object.freeze([
  ...STABLE_ARCH_ASSET_TYPES,
  ...STABLE_DOOR_ASSET_TYPES,
  ...STABLE_CONTENT_ASSET_TYPES,
] as const);

/**
 * Register every stable asset type. Throws on duplicates — call ONCE during
 * boot (the playable map does, right after the saloon/bank/sheriff blocks).
 */
export function registerAllStableFactories(registry: AssetRegistry): void {
  // Architecture: shell kit + unit-box collider factories + solids.
  registry.register('stable-building', new StableAssetFactory(shellFromDefinition), 'Stable Building');
  registry.register('stable-wall', new StableWallFactory(), 'Stable Wall');
  registry.register('stable-floor', new StableFloorFactory(), 'Stable Floor');
  registry.register('stable-bar-wall', new StableBarWallFactory(), 'Stable Bar Wall');
  registry.register('stable-stall-front', new StableStallFrontFactory(), 'Stable Stall Front');
  registry.register('stable-feed-trough', new StableTroughFactory(), 'Stable Feed Trough');
  registry.register('stable-water-trough', new StableTroughFactory(), 'Stable Water Trough');
  registry.register('stable-workbench', new StableWorkbenchFactory(), 'Stable Workbench');
  registry.register('stable-anvil', new StableAnvilFactory(), 'Stable Anvil');

  // Doors (each builder reads its def metadata — hinge/sign/angle baked in).
  registry.register('stable-gate', new StableAssetFactory(() => buildStableGate()), 'Stable Gate');
  registry.register('stable-stall-door', new StableAssetFactory(leafDoorFromDefinition), 'Stable Stall Door');
  registry.register('stable-room-door', new StableAssetFactory(leafDoorFromDefinition), 'Stable Room Door');
  registry.register('stable-staff-door', new StableAssetFactory(leafDoorFromDefinition), 'Stable Staff Door');

  // Content groups.
  registry.register('stable-stall-contents', new StableAssetFactory((d) => {
    const stall = Number((d.metadata as Record<string, unknown>).stall) || 1;
    const spec = stallByIndex.get(stall);
    if (!spec) throw new Error(`stable stall contents: unknown stall ${stall}`);
    return buildStallContents(spec);
  }), 'Stable Stall Contents');
  registry.register('stable-tack-contents', new StableAssetFactory(() => buildTackRoomContents()), 'Stable Tack Contents');
  registry.register('stable-feed-contents', new StableAssetFactory(() => buildFeedRoomContents()), 'Stable Feed Contents');
  registry.register('stable-farrier-contents', new StableAssetFactory(() => buildFarrierContents()), 'Stable Farrier Contents');
  registry.register('stable-water-contents', new StableAssetFactory(() => buildWaterContents()), 'Stable Water Contents');
  registry.register('stable-loft-contents', new StableAssetFactory(() => buildLoftContents()), 'Stable Loft Contents');
}
