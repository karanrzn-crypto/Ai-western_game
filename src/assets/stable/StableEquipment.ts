/**
 * src/assets/stable/StableEquipment.ts
 * -----------------------------------------------------------------------------
 * Per-kind UNIT builders for the stable's zone props — every tack/feed/
 * farrier/water/loft prop is its OWN managed object now ('stable-prop', kind
 * in metadata) so the Object Editor can select and move each logical entity
 * (a saddle, a bale, a crate, a tool, a sign) independently.
 *
 * Placement data lives in STABLE_LAYOUT.STABLE_PROPS (the ONE source of
 * truth). Every builder here constructs its unit AT THE LOCAL ORIGIN — the
 * registry transform (applied by the renderer adapter) carries the position.
 *
 * UNIT RULE (logical objects, not thousands): micro-parts with no independent
 * use ride their host — tins ride the shelf, shoes ride their rack, the scoop
 * rides the grain bin, the dipper rides the water barrel, scrap iron rides
 * its box, the loft rope rides its hook.
 *
 * CONTACT discipline (unchanged from the old zone groups): every unit sits
 * flush ON its surface (floor slab top at STABLE_LAYOUT.floorTop, bench top,
 * deck top) or mounts back-to-back on a wall face — never floating, never
 * coplanar-intersecting.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { ObjectDefinition } from '../../core/types.js';
import type { IAssetFactory } from '../IAssetFactory.js';
import { STABLE_LAYOUT, type StablePropKind } from './StableLayout.js';
import { createStableMaterials } from './StableMaterials.js';
import {
  addBox,
  addCyl,
  boardSign,
  hayBale,
  hayPile,
  strawScatter,
  woodCrate,
  smallBarrel,
  bucket,
  grainBox,
  grainSack,
  toolBox,
  hammer,
  tongs,
  horseshoe,
  saddle,
  saddleRack,
  bridleHanging,
  horseCollar,
  leatherStrap,
  drapedBlanket,
  foldedBlanket,
} from './StableProps.js';

const FLOOR = STABLE_LAYOUT.floorTop;

/* -------------------------------------------------------------------------- */
/* Composite unit builders (a host + the micro-parts that ride it)            */
/* -------------------------------------------------------------------------- */

/** The tack display board (bare board — bridles/collar/strap are own objects). */
function buildTackBoard(): THREE.Group {
  const M_ = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'tack-board-unit';
  const board = addBox(g, M_.trim, 1.9, 1.05, 0.035, 0, 0, 0, 'tack-board');
  board.receiveShadow = true;
  return g;
}

/** Wall shelf with two tin cans (tins ride the shelf). */
function buildTackShelf(): THREE.Group {
  const M_ = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'tack-shelf-unit';
  addBox(g, M_.plankDark, 0.5, 0.03, 0.16, 0, 0, 0, 'tack-shelf');
  addCyl(g, M_.tin, 0.045, 0.045, 0.11, 8, -0.1, 0.07, 0, 'tack-tin-1');
  addCyl(g, M_.tin, 0.04, 0.04, 0.09, 8, 0.05, 0.06, 0, 'tack-tin-2');
  return g;
}

/** Horseshoe display rack; shoes ride the board. side: which wall it faces. */
function buildShoeRack(side: 'south' | 'north'): THREE.Group {
  const M_ = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'shoe-rack-unit';
  const board = addBox(g, M_.trim, 0.95, 0.3, 0.035, 0, 0, 0, side === 'south' ? 'shoe-rack-board' : 'farrier-shoe-rack');
  board.receiveShadow = true;
  // Shoe z-offset relative to the board: the shoes hang on the room-facing
  // side (south wall rack → shoes at −z; north wall rack → +z). The twist
  // pattern matches the original hand-placed per-rack variety.
  const zOff = side === 'south' ? -0.028 : 0.028;
  for (let i = 0; i < 4; i++) {
    const shoe = horseshoe();
    shoe.position.set(-0.35 + i * 0.24, 0.03, zOff);
    shoe.rotation.z = side === 'south' ? (i % 2 ? 0.3 : -0.2) : (i % 2 ? -0.25 : 0.35);
    g.add(shoe);
  }
  return g;
}

/** Iron scraps box — the loose scraps ride the box. */
function buildScrapsBox(): THREE.Group {
  const M_ = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'scraps-box-unit';
  const box = addBox(g, M_.rust, 0.5, 0.22, 0.36, 0, 0, 0, 'iron-scraps-box');
  box.receiveShadow = true;
  for (let i = 0; i < 3; i++) {
    const scrap = addBox(g, M_.iron, 0.16, 0.02, 0.03, -0.1 + i * 0.09, 0.12, 0.03 - (i % 2) * 0.06, `iron-scrap-${i}`);
    scrap.rotation.y = i * 0.7;
    g.add(scrap);
  }
  return g;
}

/** Grain bin with the scoop resting on top (the scoop rides the bin). */
function buildGrainBin(): THREE.Group {
  const M_ = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'grain-bin-unit';
  g.add(grainBox());
  const scoop = addBox(g, M_.tin, 0.12, 0.05, 0.18, -0.2, 0.86, 0.15, 'feed-scoop');
  scoop.rotation.z = 0.2;
  return g;
}

/** Water barrel with the dipper resting IN the water (the dipper rides the
 *  barrel). Dipper bottom y = h+0.007 dips through the water surface top
 *  (h+0.015) — it lies in the water instead of hovering above it. */
function buildWaterBarrel(r: number, h: number): THREE.Group {
  const M_ = createStableMaterials();
  const g = new THREE.Group();
  g.name = 'water-barrel-unit';
  g.add(smallBarrel(r, h, true));
  const dipper = addCyl(g, M_.tin, 0.05, 0.04, 0.03, 8, 0, h + 0.032, -0.22, 'water-dipper');
  dipper.rotation.x = Math.PI / 2;
  dipper.castShadow = true;
  return g;
}

/* -------------------------------------------------------------------------- */
/* The generic prop factory                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Builds ONE zone prop from its def metadata (`kind` + params). The registry
 * transform positions it — the builder only assembles mesh-level state at
 * the local origin (the house factory contract).
 */
export class StablePropFactory implements IAssetFactory {
  create(definition: ObjectDefinition): THREE.Object3D {
    const meta = definition.metadata as Record<string, unknown>;
    const kind = meta.kind as StablePropKind;
    // Params ride the nested `params` key (a flat spread would let a bucket's
    // params.kind='metal' clobber the def's discriminant kind — caught by the
    // geometry tests).
    const params = (meta.params ?? {}) as Record<string, unknown>;
    const p = (key: string): unknown => params[key];
    const num = (key: string, fallback: number): number => {
      const v = Number(params[key]);
      return Number.isFinite(v) ? v : fallback;
    };

    switch (kind) {
      case 'saddle-rack': return saddleRack();
      case 'saddle': return saddle();
      case 'bridle': return bridleHanging();
      case 'collar': return horseCollar();
      case 'strap': return leatherStrap(num('len', 0.5));
      case 'tack-board': return buildTackBoard();
      case 'tack-shelf': return buildTackShelf();
      case 'blanket-bar': {
        const M_ = createStableMaterials();
        const g = new THREE.Group();
        g.name = 'blanket-bar-unit';
        addBox(g, M_.timber, 0.05, 0.05, 0.8, 0, 0, 0, 'blanket-bar');
        return g;
      }
      case 'blanket': {
        // folded blankets lie FLAT (no drops → nothing coplanar with the
        // surface below); draped blankets take the host wall's thickness so
        // the drops hug its faces (z-fight scan fix).
        if (p('folded')) return foldedBlanket(num('w', 0.6), Number(p('color')) || 0x5d5a4a);
        return drapedBlanket(num('w', 0.6), Number(p('color')) || 0x7a4a3a, num('wallT', 0.5));
      }
      case 'shoe-rack': return buildShoeRack(p('side') === 'north' ? 'north' : 'south');
      case 'crate': return woodCrate(num('w', 0.5), num('h', 0.5));
      case 'tool-box': return toolBox();
      case 'sign': {
        const sub = typeof p('sub') === 'string' ? (p('sub') as string) : undefined;
        return boardSign(
          typeof p('text') === 'string' ? (p('text') as string) : 'SIGN',
          num('w', 0.62), num('h', 0.26),
          { sub, dark: Boolean(p('dark')) },
        );
      }
      case 'hay-bale': return hayBale();
      case 'grain-sack': return grainSack(Boolean(p('standing')), num('seed', 1));
      case 'grain-bin': return buildGrainBin();
      case 'bucket': return bucket(p('kind') === 'metal' ? 'metal' : 'wood', Boolean(p('full')));
      case 'straw': return strawScatter(num('w', 1.5), num('d', 1.2), num('seed', 1));
      case 'small-barrel': return buildWaterBarrel(num('r', 0.3), num('h', 0.9));
      case 'hay-pile': return hayPile(num('radius', 0.5), num('height', 0.3), num('seed', 1));
      case 'hammer': return hammer();
      case 'tongs': return tongs();
      case 'horseshoe': return horseshoe();
      case 'nail-tin': {
        const M_ = createStableMaterials();
        const g = new THREE.Group();
        g.name = 'nail-tin-unit';
        const tin = addCyl(g, M_.tin, 0.06, 0.06, 0.1, 10, 0, 0, 0, 'nail-tin');
        tin.castShadow = true;
        return g;
      }
      case 'scraps-box': return buildScrapsBox();
      default:
        throw new Error(`stable-prop: unknown kind "${String(kind)}"`);
    }
  }
}

/** Kept for the stall variation — the per-stall interior remains ONE unit. */
export const STABLE_FLOOR_TOP = FLOOR;
