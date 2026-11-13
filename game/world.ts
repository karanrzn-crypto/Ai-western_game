import * as THREE from 'three';
import {
  SceneStateManager,
  ThreeRendererAdapter,
  AdaptiveResolution,
  ShadowScheduler,
} from '../src/index.js';
import {
  AssetRegistry,
  registerPrimitiveFactories,
  registerTownExteriorFactories,
  TOWN_EXTERIOR_COLLIDERS,
  TOWN_EXTERIOR_SITES,
  TOWN_SITES,
  TOWN_GROUND_SIZE,
  SALOON_SITE,
  BANK_SITE,
  SHERIFF_SITE,
  STABLE_SITE,
  GUNSHOP_SITE,
  registerSaloonFactories,
  buildSaloonMapObjects,
  registerAllBankFactories,
  buildBankMapObjects,
  registerAllSheriffFactories,
  buildSheriffMapObjects,
  registerAllStableFactories,
  buildStableMapObjects,
  registerAllGunShopFactories,
  buildGunShopMapObjects,
  registerAllTownFactories,
  buildTownMapObjects,
  rotateSiteDefs,
  registerCountryFactories,
  buildCountryMapObjects,
  createCountryAmbient,
  type CountryAmbient,
} from '../src/index.js';
import { CollisionWorld } from '../src/physics/CollisionWorld.js';

export interface WorldHandles {
  stage: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  resolution: AdaptiveResolution;
  shadows: ShadowScheduler;
  sun: THREE.DirectionalLight;
  hemisphere: THREE.HemisphereLight;
  adapter: ThreeRendererAdapter;
  manager: SceneStateManager;
  /** The instanced countryside layer (trees/bushes/rocks/grass/fences/hills)
   *  — its static colliders merge into the ONE CollisionWorld source. */
  countryAmbient: CountryAmbient;
}

/**
 * WORLD BOOT in one module: the stage, the scene (warm dusty frontier
 * haze — the reference-image biome; the DayNightCycle owns the live sky/fog),
 * the camera (far plane sized to the CURRENT 120×120 world), the renderer
 * with the render-governor/shadow-scheduler pair, the sun + hemisphere
 * lights, the asset registry + renderer adapter + scene state manager, the
 * ground def + the four invisible boundary walls, and the registration of
 * EVERY building/town module's defs at their TownLayout sites.
 *
 * Pure construction — no gameplay wiring lives here. The composition root
 * (game/playable-map.ts) receives the handles and attaches player, doors,
 * editor, horse and the main loop.
 */
export function createWorld(): WorldHandles {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('Missing #stage');

  const scene = new THREE.Scene();
  // Warm dusty frontier haze (the reference-image biome; the DayNightCycle
  // owns the live sky/fog and its daytime palette is retuned to these tones).
  const SKY_DUST = 0xd8c7a2;
  scene.background = new THREE.Color(SKY_DUST);
  // WORLD EXPANSION (280×280): the haze band grew with the horizon — the fog
  // still hides the map edge from any in-world vantage point (farthest corner
  // diagonal ≈ 396 m; from the center the edge sits ~140-198 m out) while
  // keeping mid-range reading crisp for gameplay.
  scene.fog = new THREE.Fog(SKY_DUST, 55, 175);

  const camera = new THREE.PerspectiveCamera(
    70,
    Math.max(stage.clientWidth, 1) / Math.max(stage.clientHeight, 1),
    0.05,
    // Far plane sized to the CURRENT world: the 280×280 ground's farthest
    // corner from any vantage point is the full diagonal 280√2 ≈ 396 m, so
    // 420 clears the whole map with margin.
    420,
  );

  // Dev verification hook (read-only): headless check scripts read the live
  // camera pose to servo the creative-fly camera. Never written by the game.
  (window as unknown as Record<string, unknown>).__westDebug = () => {
    const dir = camera.getWorldDirection(new THREE.Vector3());
    return {
      cam: [camera.position.x, camera.position.y, camera.position.z],
      view: [dir.x, dir.y, dir.z],
    };
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  // --- Render governor (weak-laptop revision) --------------------------------
  // Measured bottleneck matrix (1280×800 software harness + the user's laptop):
  // frame time is FILL-BOUND — 1.5 → 166.6ms/6fps, 1.0 → 83.3/12, 0.85 → 66.6/15,
  // 0.75 → 50/20 — and the old ladder BOOTED at 1.5, so weak machines started in
  // a slideshow for seconds. The governor (src/engine/RenderGovernor.ts) now
  // owns every resolution decision: boot at 0.85, ladder TOPS OUT at 1.0, climbs
  // only with SUSTAINED ≥50 fps proof of headroom, walks down fast under 21/12.
  renderer.setSize(Math.max(stage.clientWidth, 1), Math.max(stage.clientHeight, 1));
  renderer.shadowMap.enabled = true;
  // Shadow depth pass, measured: ~12ms per 2048² refresh on the harness. Two
  // cuts, both requested and A/B-verified: mapSize 2048→768 (0.59MP — the pass
  // drops to ~1.4ms; 85m frustum / 768 ≈ 9 texels/m stays readable with
  // PCFSoft + normalBias; 512² documented as the next fallback) and on-demand
  // refresh via ShadowScheduler (idle world ≈ every 150ms instead of every
  // other frame — the orbiting sun moves ~0.02°/frame, so the extra passes
  // rebuilt identical shadows).
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);
  const resolution = new AdaptiveResolution({
    sink: renderer,
    getDevicePixelRatio: () => window.devicePixelRatio || 1,
  });
  const shadows = new ShadowScheduler({ idleIntervalSeconds: 0.15, movingIntervalSeconds: 1 / 30 });

  const sun = new THREE.DirectionalLight(0xffe7bd, 2.2);
  sun.position.set(-25, 35, 15);
  sun.castShadow = true;
  // WORLD EXPANSION: the shadow frustum now FOLLOWS THE PLAYER. A fixed box
  // cannot cover a 280×280 map at useful texel density, so the composition
  // root recenters this ±48 box on the player every frame (DayNightCycle
  // still owns the orbit direction — the follow only translates the rig).
  // 1024² over 96 m ≈ 10.7 texels/m — SHARPER than the old fixed ±85 box
  // (6 texels/m) everywhere the player actually is, at the same depth-pass
  // cost. Distant unshadowed ground sits well inside the fog band.
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -48;
  sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 48;
  sun.shadow.camera.bottom = -48;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.00035;
  // § shadow revision: normalBias 0.03 → 0.06. At the deliberate texel
  // density, interior surfaces sample the roof's occluders through the same
  // map — the old 3 cm normalBias left self-shadow acne bands on interior
  // walls/floors. 6 cm ≈ 0.55 texel kills the acne inside without visibly
  // detaching the exterior contact shadows (verified against the horse/lamp
  // probes).
  sun.shadow.normalBias = 0.06;
  scene.add(sun);

  const hemisphere = new THREE.HemisphereLight(0xf0e0bf, 0x4b493d, 1.2);
  scene.add(hemisphere);

  const assets = new AssetRegistry();
  registerPrimitiveFactories(assets);
  registerSaloonFactories(assets);
  registerAllBankFactories(assets);
  registerAllSheriffFactories(assets);
  registerAllStableFactories(assets);
  registerAllGunShopFactories(assets);
  registerAllTownFactories(assets);
  // Town exteriors (user-approved scale-1.3 buildings: farmstead, worker,
  // family, wealthy, abandoned + butcher stall) — the six REDesigned-town
  // buildings, placed per-def with TOWN_EXTERIOR_COLLIDERS at the town sites.
  registerTownExteriorFactories(assets);
  // Countryside buildings (world expansion: barn, sheds, cabin, coop, pig
  // shelter, silo, merged crop fields) — exact local colliders per type.
  registerCountryFactories(assets);

  const adapter = new ThreeRendererAdapter({ scene, assetRegistry: assets });
  const manager = new SceneStateManager({ renderer: adapter });

  const groundUuid = '10000000-0000-4000-a000-000000000001';
  manager.registerObject({
    uuid: groundUuid,
    assetType: 'town-ground',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    metadata: { name: 'زمین نقشه اصلی', size: TOWN_GROUND_SIZE, collider: false, editable: false },
  });

  function addBoundary(uuid: string, name: string, position: THREE.Vector3, scale: THREE.Vector3): void {
    manager.registerObject({
      uuid,
      assetType: 'cube',
      transform: {
        position: { x: position.x, y: position.y, z: position.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: scale.x, y: scale.y, z: scale.z },
      },
      metadata: { name, mapBoundary: true, editable: false, collider: true },
    });
  }

  const half = TOWN_GROUND_SIZE / 2;
  // CORNER-SEAM FIX (z-fight scan round): the N/S walls run the full ground so
  // their end caps sit EXACTLY coplanar with the E/W walls' outer faces
  // (co-facing pair at the map corners). The N/S walls are 2 m shorter: their
  // end caps bury INSIDE the E/W wall volumes and no outer faces overlap any
  // more. The player is still sealed by the inner faces.
  addBoundary('10000000-0000-4000-a000-000000000010', 'دیوار مرزی شمالی', new THREE.Vector3(0, 1.5, -half + 0.5), new THREE.Vector3(TOWN_GROUND_SIZE - 2, 3, 1));
  addBoundary('10000000-0000-4000-a000-000000000011', 'دیوار مرزی جنوبی', new THREE.Vector3(0, 1.5, half - 0.5), new THREE.Vector3(TOWN_GROUND_SIZE - 2, 3, 1));
  addBoundary('10000000-0000-4000-a000-000000000012', 'دیوار مرزی غربی', new THREE.Vector3(-half + 0.5, 1.5, 0), new THREE.Vector3(1, 3, TOWN_GROUND_SIZE));
  addBoundary('10000000-0000-4000-a000-000000000013', 'دیوار مرزی شرقی', new THREE.Vector3(half - 0.5, 1.5, 0), new THREE.Vector3(1, 3, TOWN_GROUND_SIZE));

  // (The old yellow spawn cube + the empty demo "BUILDING" box were removed
  // with the town redesign: the cube sat where the fountain plaza now is and
  // the nameless box stood on the worker-house lot. Both were dev scaffolding,
  // not gameplay — the fountain square + the six town-exterior buildings
  // replace them, and every wall in town still collides through the registry.)

  // --- The SALOON (enterable western bar) -------------------------------------
  // West side of the redesigned main street, facing EAST onto the street (yaw
  // +90° applied to the whole building via SiteTransform — exact quaternion
  // composition, collider-exact at 90°). Door/interact contracts unchanged:
  // door swings live in building-local space inside each def, so the yawed
  // building opens exactly like it always did.
  {
    const yaw = TOWN_SITES.saloon.yaw;
    for (const saloonDef of rotateSiteDefs(buildSaloonMapObjects(SALOON_SITE.x, SALOON_SITE.z), SALOON_SITE.x, SALOON_SITE.z, yaw)) {
      manager.registerObject(saloonDef);
    }
  }

  // --- The BANK (grand western frontier bank) ----------------------------------
  // FAR side of the central square (west of the stable-road gap), yawed 180° so
  // the stair/columns/pediment face NORTH onto the square. Same rotation
  // mechanism as the saloon.
  {
    const yaw = TOWN_SITES.bank.yaw;
    for (const bankDef of rotateSiteDefs(buildBankMapObjects(BANK_SITE.x, BANK_SITE.z), BANK_SITE.x, BANK_SITE.z, yaw)) {
      manager.registerObject(bankDef);
    }
  }

  // --- The SHERIFF OFFICE (western law building + two-cell jail) ---------------
  // FAR side of the square (east of the stable-road gap), yawed 180° so the
  // porch + SHERIFF sign face north onto the square.
  {
    const yaw = TOWN_SITES.sheriff.yaw;
    for (const sheriffDef of rotateSiteDefs(buildSheriffMapObjects(SHERIFF_SITE.x, SHERIFF_SITE.z), SHERIFF_SITE.x, SHERIFF_SITE.z, yaw)) {
      manager.registerObject(sheriffDef);
    }
  }

  // --- The LIVERY STABLE (working western horse stable + tack/feed/farrier) ---
  // South of town on the stable road, yawed 180° so the big wagon gate + LIVERY
  // STABLE sign face NORTH toward the arriving player (the reference layout:
  // stable near the exit, corral across the road).
  {
    const yaw = TOWN_SITES.stable.yaw;
    for (const stableDef of rotateSiteDefs(buildStableMapObjects(STABLE_SITE.x, STABLE_SITE.z), STABLE_SITE.x, STABLE_SITE.z, yaw)) {
      manager.registerObject(stableDef);
    }
  }

  // --- The GUN SHOP (enterable western gunsmith store) -------------------------
  // FIRST important building on the main street's EAST side (the player passes
  // it right after the town entrance, before the square — spec §7), yawed −90°
  // so the false front + porch face WEST onto the street.
  {
    const yaw = TOWN_SITES.gunshop.yaw;
    for (const gunshopDef of rotateSiteDefs(buildGunShopMapObjects(GUNSHOP_SITE.x, GUNSHOP_SITE.z), GUNSHOP_SITE.x, GUNSHOP_SITE.z, yaw)) {
      manager.registerObject(gunshopDef);
    }
  }

  // --- THE TOWN (redesigned settlement — ground, roads, farm, square, houses) --
  // Every def the town module emits: the mottled dusty ground, the road network
  // (farm road → entrance → main street → plaza → stable road → exit), the farm
  // area (house + individually-movable fence sections + livestock pen + crops +
  // pond + windmill), the ruined house on the outskirts, the central square
  // (fountain + benches + lamps + props), the six NEW buildings (farm/worker/
  // family/wealthy/meat-shop/ruined) and all street furniture + vegetation.
  // Placement source: src/assets/town/TownLayout.ts — the SAME list the town
  // tests assert against.
  for (const townDef of buildTownMapObjects()) {
    manager.registerObject(townDef);
  }

  // --- TOWN EXPANSION: butcher stall + five house facades ----------------------
  // The designed-but-unplaced town-exterior assets enter the REAL map here, as
  // individually managed defs so each carries its exact collider payload from
  // TOWN_EXTERIOR_COLLIDERS (the same table the tests assert against — a bare
  // array would silently fall back to a 1 m³ box). The factory builds every
  // facade facing +Z (south), so yaw is the ONLY placement math: yaw 90 turns
  // a west-row front EAST toward the main street, yaw -90 turns an east-row
  // front WEST. Sites were audited against the measured per-building AABBs
  // (saloon z ≤ -7.5 · stable z ≥ -1.5 west, sheriff z ≥ -5.5 · gunshop z ≤
  // 14.1 east, bank north end) — no overlap, market-row gaps 1.2–4.5 m, the
  // ~17 m street corridor continues south into the enlarged map and the
  // farmstead/abandoned house sit alone on the east/west outskirts.
  // Sites live in TownLayout.TOWN_EXTERIOR_SITES — the SAME table the town
  // tests assert against (six buildings, scale-1.3 model round, composite
  // colliders rotate/scale with the def).
  for (const placement of TOWN_EXTERIOR_SITES) {
    const s = placement.scale ?? 1;
    manager.registerObject({
      uuid: placement.uuid,
      assetType: placement.type,
      transform: {
        position: { x: placement.x, y: 0, z: placement.z },
        rotation: { x: 0, y: placement.yaw, z: 0 },
        scale: { x: s, y: s, z: s },
      },
      metadata: {
        name: placement.name,
        editable: true,
        collider: TOWN_EXTERIOR_COLLIDERS[placement.type],
      },
    });
  }

  // --- THE LIVING COUNTRYSIDE (world expansion) --------------------------------
  // Ranch (north), agri farm (east), family farm (northwest), the southern
  // wilds with their roads/ponds/fields/props — every def from
  // CountryLayout.buildCountryMapObjects() with exact per-type colliders.
  for (const countryDef of buildCountryMapObjects()) {
    manager.registerObject(countryDef);
  }

  // The instanced ambient layer (wild trees/bushes/rocks/grass/stumps, all
  // fence runs, the horizon hills). Its placement keeps clear of every road
  // corridor and every managed collider AABB (snapshot below), and it hands
  // back exact static AABBs for its fences/trees/big rocks — the composition
  // root merges them into the ONE CollisionWorld source.
  const keepOutProbe = new CollisionWorld(() => manager.getAllObjects());
  const countryAmbient = createCountryAmbient({
    scene,
    colliderKeepOuts: keepOutProbe.getCollisionBounds(),
  });

  return {
    stage, scene, camera, renderer, resolution, shadows, sun, hemisphere, adapter, manager,
    countryAmbient,
  };
}
