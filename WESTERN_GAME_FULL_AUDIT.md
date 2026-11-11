# WESTERN GAME — Complete Project Audit & Handoff Report

**Audit date:** 2026-11-11 (session date; all evidence gathered fresh in this session)
**Audited commit:** `1cb969d406803d091815d28d77f02da0ea0008ad` — "Fix-round 3: twelve town/environment fixes (user report)"
**Repository:** `karanrzn-crypto/Ai-western_game` (local path `/home/z/my-project/Ai-western_game`, branch `main`)
**Audit scope:** read-only. No source file was modified, no commit was created, nothing was pushed. The only file created is this report.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Complete Development History](#2-complete-development-history)
3. [Complete Feature Inventory](#3-complete-feature-inventory)
4. [Architecture and Code Quality Audit](#4-architecture-and-code-quality-audit)
5. [World and Environment Audit](#5-world-and-environment-audit)
6. [Player Controls and Gameplay Audit](#6-player-controls-and-gameplay-audit)
7. [Testing and Quality Assurance](#7-testing-and-quality-assurance)
8. [Performance Audit](#8-performance-audit)
9. [Known Bugs and Outstanding Issues](#9-known-bugs-and-outstanding-issues)
10. [Incomplete and Missing Features](#10-incomplete-and-missing-features)
11. [Git and Deployment Status](#11-git-and-deployment-status)
12. [Professional Evaluation](#12-professional-evaluation)
13. [Development Roadmap](#13-development-roadmap)
14. [HANDOFF FOR NEXT AI](#14-handoff-for-next-ai)
15. [Development Constraints and User Preferences](#15-development-constraints-and-user-preferences)
16. [Reporting Notes](#16-reporting-notes)

---

## 1. Project Overview

### 1.1 Purpose and Vision

A **single-player, browser-based, low-poly 3D western (cowboy) game** built with Three.js, controlled in Persian-language UI context (the user communicates in Persian; in-world editor object names are Persian, HUD control hints are English). The game world is a western town laid out per the user's "17-section" design spec: a farm with individually-movable fences before the town → town entrance → main street → gun shop → central plaza → butcher stall right / worker house left → bank/sheriff/family/wealthy houses on the far side → direct stable road → livery stable near the exit → town exit, plus an abandoned homestead on the outskirts. The player walks, rides a horse with a staged mount animation, opens real doors (E), enters five enterable buildings (saloon, bank, sheriff office, stable, gun shop), and can reshape the world in an edit mode (TAB) with a transform gizmo, object selection panel, and persisted transforms.

The user's stated intent is a **lightweight game that runs on weak laptops**; they repeatedly emphasize: no unnecessary features, no parallel/duplicate systems, real-browser verification before any feature is called done.

### 1.2 Technologies

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Language | TypeScript | ^5.3.3 | Strict; `scripts/typecheck.mjs` runs tsc |
| Rendering | three | ^0.161.0 | **Only runtime dependency** |
| Bundler | esbuild | ^0.19.12 | Production build via `scripts/build.mjs` → `site/` |
| Dev server | vite | ^5.1.0 | Dev only (`npm run dev`, port 5173) |
| Test runner | node:test | Node built-in | `scripts/test.mjs`, deterministic |
| Browser automation | playwright | (sandbox-installed, not in `package.json` devDeps) | Used by 51 `scripts/*.cjs` verify/probe/shot harnesses |
| Type defs | @types/three ^0.161.0, @types/node ^20.11.0 | | |
| Hosting | Vercel (Hobby plan) | — | Project name `western-game`, connected to GitHub repo `western_game`, auto-deploys on push to `main` |

There is **no audio engine, no physics engine library, no asset pipeline (no GLTF/textures on disk — all geometry and canvas textures are generated in code)**.

### 1.3 Architecture Summary

Data-driven scene: **asset factories** produce `ObjectDefinition`s (uuid, type, name, transform, metadata incl. collision boxes); an **AssetRegistry** registers factory functions by type; a **SceneStateManager** is the single mutation funnel (spawn/despawn/transform) over a **ThreeRendererAdapter**; **MergeStatic** merges per-def static meshes to cut draw calls (dynamic things — door leaves, guns — opt out via `userData.dynamic` / `noMerge`); **CollisionWorld** maintains an AABB collider set derived from def metadata (scaled + yaw-rotated, signed-yaw offsets) and resolves the player capsule per-axis; **LocalSceneStorage** (key `ai-western-game.playable-map.scene.v22`) persists the authored layout + editor deltas, with an **AuthoredLayout** boot snapshot enabling "reset object / reset all" restores.

The composition root is `game/playable-map.ts` (2,807 lines): boots renderer, camera rig, player, horse, doors, day/night, editor UI, HUD, and the main `animate()` loop.

### 1.4 Entry Points, Launch, Build, Deploy

| What | How |
|---|---|
| Dev run | `npm install` then `npm run dev` (vite, `http://localhost:5173`, entry `index.html` → `game/playable-map.ts`) |
| Production build | `npm run build` → esbuild bundles to `site/` (single self-contained `site/game/playable-map.js`, 1,823,926 bytes at this commit) |
| Typecheck | `npm run typecheck` |
| Tests | `npm test` (node:test, 550 tests, ~8 s) |
| Live site | `https://western-game-psi.vercel.app` (Vercel auto-deploys the `western_game` mirror repo's `main`; build command `npm run build`, output `site/`, per `vercel.json`) |
| Browser harnesses | Start `npx vite --port 5176 --strictPort`, then `node scripts/verify-*.cjs` |

### 1.5 Current Development Status

Playable sandbox at "vertical-slice" maturity: full movement + horse + interactions + editor + 5 enterable interiors + an organic town. **No mission/progression/game-loop systems, no audio, no NPCs beyond the horse.** All reported visual bugs through 2026-09-20 are fixed and regression-locked. Development has been paused since 2026-09-20 (user returned 2026-11-10; this audit is part of the handoff).

---

## 2. Complete Development History

114 commits, 2026-09-12 → 2026-09-20 (9 active days), linear `main` (no rebase history). Phases below are verifiable from commit subjects/bodies; every claim below traces to the cited commit hashes.

### 2.1 Phase A — Foundation (2026-09-12, ~50 commits, `27c1e52`…`a7786b4`)

- Playable map, ground asset, editor mode + HUD, persistent object transforms (`784d65d`), Unity-style transform gizmo (`31a4499`), Persian object names (`c5792dd`), day/night cycle with continuous interpolation (`ab08d3b`).
- Reusable `PlayerController`, `CollisionWorld` (per-axis resolution incl. vertical delta `4350780`), `LocalSceneStorage` + scene validation (`66d190a`, `87b9303`), canonical test scaffolding (deterministic runner `254e08e`), Vercel output pointed to generated `site/` (`aceaa8c`).
- **Architectural decision (from commit texts):** centralized `GameConfig` singleton instead of scattered magic constants; factories never apply transforms; adapter applies def transforms.

### 2.2 Phase B — Character, camera, movement (2026-09-12/13, `a3e1d5f`…`7a42720`)

- Part 2 character: procedural rig + animation, TPS controller (`a3e1d5f`); single-source eye heights (`12cd0fb`); unified player/camera yaw architecture (`8b23e61`); camera-relative movement with BODY/HEAD/CAMERA layers (`83cb4a5`); A/D turn-in-place with camera lockstep (`de0b886`); creative fly mode F (`a75fc8b`); camera ownership state machine Creative→Edit→exit (`2103abd`, later refined `5074707`, `c0535f6`).

### 2.3 Phase C — Horse system (2026-09-13/14, `d7f1357`…`551fea5`, `baeddfe`, `1c92fd7`)

- Part 3 horse: model, gaits, riding, stamina/health, AI follow/summon/fear, collision, idle life, persistence (`d7f1357`).
- Several revision rounds (user feedback): slim proportions + full saddle + staged mount (`8975412`), visual-quality pass — arched neck, saddle stack, seated rider (`a841dff`), controls revision — COME/STAY absolute commands, no autonomous follow, FP→TP mount switch (`d8ad1cd`), keep-it-simple mount rewrite as a ~4–6 s physical vault with swept-clearance verification (`f1e9c9c` — "full-timeline swept clearance 0 violations (was 155)"), 14-step natural mount + adaptive resolution ladder (`1c92fd7`), real-rider technique mount (`551fea5`), controls §20/§21 (`baeddfe`).
- Perf work starts here: DPR cap, every-other-frame shadow depth (`d8ad1cd`), render governor (`2103abd`).

### 2.4 Phase D — Enterable buildings (2026-09-14/15, `52dafcf`…`d04d429`, `58212dc`)

- Saloon: 13 asset factories, full interior (poker table, upright piano, back-bar glassware) (`52dafcf`, `40653b1`, `69a5e9e`).
- Bank: classical facade + user-supplied interior library (`048788a`), interior redesign with manager office + vault (`c75ccf3`), openable iron gate with collider sync (`d04d429`), vault door as the vault's only entrance (`58212dc`).

### 2.5 Phase E — Sheriff, stable, gun shop (2026-09-16/18, `57843c2`…`d706ed1`)

- Sheriff office redesign (zoned office/jail/entry, openable cell door, `57843c2`), then three fix rounds for the user's 7-section report: real z-fight offsets, true window openings, gun rack, jail-door z-fighting root-cause (`0637002`, `f6f6298`, `c252665` — front door became a real hinged door with pose-derived collider).
- Livery stable: 6 stalls, central aisle, hay loft, 10 E-openable doors, 12 test suites (`b46b3bc`); editor selection root-causes (`220dead` — gizmo proxies ate clicks; ladder rails wrong-way sign error; monolithic shells split into selectable objects); "سالن means STALL" fix + authored-layout restore system (`70fa06b`).
- Weak-laptop FPS overhaul + rope-coil deletions with draw-call merge system: 1731→613 draw calls, 3190→901 meshes (`95fe190`, `01564c2`) — **the MergeStatic system**.
- Gun shop building (`d706ed1`); gunshop polish + shadow root-cause round (`8b02fd3` — transposed revolver frame box fix, 3 trade signs, dressed workbench, 34 ammo boxes, door seal + dusk altitude floor + bias tuning), in-game perf measured then: **frame median 46.5 ms headless** (lighter scene than today).

### 2.6 Phase F — Doors, camera, townsfolk buildings (2026-09-19, `a08e832`…`7659961`)

- Fix round: FP dismount camera, A/D turn, ride-cam rotation follow, exact counter colliders, stable growth (`a08e832`).
- Bank double door + saloon full-height leaves + **InteractionSystem HUD prompt re-render root fix** + MergeStatic dynamic contract locked by `tests/merge-static.test.ts` (all 9 real doors) (`c872378`).
- Mounted FP eye = seated rider's eye (RIDER_SEATED_EYE_Y 2.277 m); saloon bar-door root fix (missing `userData.dynamic`) (`801d096`).
- `TownExteriorAssetFactory` integrated with 8-section quality review: real 2.0–2.2 m doors, deterministic RNG, module-level material caches, exact `{boxes:[{size,offset}]}` collider payloads (`29d03a7`).
- Environment expansion: map 60×60 → 100×100, spawn cube removed, 5 houses + butcher enter the world (`7659961`).

### 2.7 Phase G — Model-defect + scale-1.3 round (2026-09-20, `594cd41`, `f0c86dd`)

- `594cd41`: floating-roof root fix (gable panels sunk by geometric dip), flush doors, planters seated, cream 'ساختمان' cube building deleted (storage v17→v18).
- `f0c86dd`: **systemic CollisionWorld fix** — collider boxes now scale with the def transform (size AND offset per axis) and rotate with SIGNED yaw (the old `|sin|` mirroring put the farmstead shed collider ~6 m from its shed = the reported "invisible wall"); worker/family/wealthy/abandoned at scale 1.3; awning posts cut to end inside the roof band; butcher hides DoubleSide + ground ring deleted; farmstead lean-to rebuilt, trough/fence clearance; gable sink straddle on all five houses (storage v18→v19).

### 2.8 Phase H — Town redesign per 17-section spec + parallel merge (2026-09-20, `d573768`, `a988cd7`, `d7fa73d`, `0ea09cf`)

- Full settlement rebuilt around its road: farm → entrance → main street → gun shop → plaza (fountain) → butcher right/worker left → bank/sheriff/family/wealthy far side → stable road → stable + corral → exit; ~68 **individually-spawned fence sections** (each independently selectable/movable); 120×120 world; dusty biome; sparse vegetation (`d573768`).
- A **parallel session** produced its own redesign (`a988cd7`) with the scale-1.3 model round integrated; merged so "one town ships, zero parallel systems" — the model-round assets ARE the six redesigned buildings at `TOWN_EXTERIOR_SITES`; the alternative plan's environment modules were dropped as superseded and remain retrievable verbatim from `a988cd7` (`d7fa73d`, `0ea09cf`).

### 2.9 Phase I — Visual-defect + fix-round 3 (2026-09-20, `7dcc6a5`, `9ab5d86`, `d6f75da`, `5745a3b`, `1cb969d`)

- `7dcc6a5`/`d6f75da`: user's 10 confirmed bugs re-applied to the shipped town module — real trees (bent trunk + branches + blob crown), bush/grass blades (cones eliminated), z-fight root sweep via a browser scanner (crate trims, boundary-wall seam, saddles, sign faces), hitching rails/benches/troughs rebuilt at real proportions, livestock pen 26→50 m².
- `5745a3b`: Telegram evidence-delivery script.
- `1cb969d` (current HEAD): twelve fixes — wealthy columns deck→beam exact, family railing seated, sheriff piers under deck, vault-door floor clearance verified closed+open, farm road ends at boundary, **full z-fight re-scan zero conflicts with no allowlist**, horse boundary from ONE shared `WORLD_*` source of truth, camera far 180, unique sheriff editor names, **continuous-route road system** (one mitered ribbon per street from a shared centerline; the 22-rectangle pile deleted), decorative pen horses removed, family house moved beside the butcher (storage v21→v22). Tests 550/550; `verify-round3.cjs` 23/23.

### 2.10 Historical regressions and their resolutions (verified)

| Regression | Root cause | Resolution |
|---|---|---|
| Scaled houses walk-through (user report) | CollisionWorld kept unit-scale collider boxes for scaled defs; `|sin|` mirrored offset boxes for negative yaw | `f0c86dd` scaled+signed-yaw boxes; regression-locked in tests + `verify-scale-and-fixes` 28/28 |
| Frozen saloon bar door (visual closed while state open) | Hinges lacked `userData.dynamic` → MergeStatic baked leaves into the static mesh | `801d096` flag added; contract LOCKED by `tests/merge-static.test.ts` (9 doors) |
| HUD prompt froze on stale door action | InteractionSystem re-rendered only on candidate change | `c872378` re-render on label change |
| Roof/wall daylight gaps on 5 houses | Gable panels seated by tolerance, not intersection | `594cd41` geometric sink + full infill; test contract rewritten |
| "Invisible wall" in empty field | Shed collider mirrored by negative-yaw bug (see above) | Same `f0c86dd` fix |
| Rope coils "unremovable" (user asked to delete completely) | They were editor-moved props persisted in the user's save | `70fa06b` authored-layout restore system; `95fe190`/`01564c2` deleted all coils at source |
| Gizmo ate clicks / wrong-way ladder rails | Invisible proxy distance not arbitrated; sign error | `220dead` |

---

## 3. Complete Feature Inventory

Legend: **✅ implemented (tested)** · **🟡 partial** · **❌ missing/not started**. "Tested" = covered by unit tests and/or an in-browser harness named below.

### 3.1 Player character & movement — ✅

- Files: `src/player/PlayerController.ts` (942 lines, class at L195), `src/player/character/CharacterAnimator.ts`, `src/player/CharacterStateMachine.ts`, `src/player/Spawn.ts` (`findSafeSpawnPosition`), `src/player/Vitals.ts` (`HealthSystem` L25, `StaminaSystem` L144).
- Responsibilities: capsule move with per-axis collision resolution, jump, crouch, sprint (stamina-drained), body yaw vs camera yaw separation (BODY/HEAD/CAMERA layers), death/respawn (`RESPAWN_POINT` = farm road north end, `TownLayout.ts` L90).
- Fully implemented: walk/run/jump/crouch/sprint, wall slide, edge-triggered stamina knock (wall-grind pump fixed `d8ad1cd`), respawn, freeze motion (used by creative/edit).
- Partially implemented: character is procedural low-poly (no external assets); no hand IK, no seated-variant beyond the horse rider socket.
- Tested: `tests/player-yaw-camera.test.ts` (641 lines), `tests/character-systems.test.ts`, `tests/character-camera-polish.test.ts`; in-browser walk probes inside `verify-round3.cjs` §4 (real pathing farm→exit) — fresh run this session: 23/23 PASS.

### 3.2 Cameras — ✅

- Files: `src/player/ThirdPersonCamera.ts` (yaw-leash, collision-aware boom via `rayAabbDistance`), `src/player/MouseLookController.ts`, `src/player/CreativeFlightController.ts`, mount/dismount camera paths in `game/playable-map.ts` (L2236 riding camera, `mountApproachArc` L2297, `updateMountAnim` L2455, `updateDismountAnim` L2475).
- Fully implemented: TP third-person with occlusion pull-in; FP first-person; FP↔TP on mount/dismount; camera-ownership state machine (Play/Edit/Creative) so mode exits keep the fly camera; ride-cam inherits horse yaw 1:1 every frame (`801d096`); seated FP eye at 2.277 m with muzzle/ears framing asserted in `verify-entrance-doors.cjs`.
- Known limitation (from history, not reproduced this session): camera transitions were the subject of multiple fix rounds (`a08e832`, `5074707`, `c0535f6`) — treat mode-switch edges as sensitive areas.

### 3.3 Input & controls — ✅ (see §6 for the full key table)

- Files: `src/player/InputBindings.ts` (L65), wiring in `game/playable-map.ts` (`applyModeState` L1831, `updatePlayer` L2020).
- Keyboard + mouse; right-mouse-only look; key hints rendered in `#control-hint` (source L1437).

### 3.4 Interaction system (doors, prompts) — ✅

- Files: `src/player/InteractionSystem.ts` (class L32; `Interactable` L9), door swing drivers in `game/playable-map.ts` (`updateSecureGate` L617, `updateVaultDoor` L658, `updateCellDoors` L706, `updateSheriffFrontDoor` L750, `updateStableDoors` L798, `updateGunShopFrontDoor` L842 (offset), `updateBankFrontDoor` L884 (offset), `updateSaloonDoors` L923 (offset)).
- Fully implemented: 10 stable doors + bank double door + vault disc door + iron gate + sheriff front door + 2 cell doors + gunshop door + saloon double leaves; E toggles with pose APIs; colliders armed/released per state; prompt re-renders on label change.
- Tested: `tests/merge-static.test.ts` (hinge mesh presence + geometry moves), `verify-entrance-doors.cjs` 29 checks (leaf-face world-Z moves Δ0.382 m), `verify-round3.cjs` §4f/§4g (REAL vault E-interaction, swing 1.00, collider released) — fresh PASS this session.

### 3.5 Horse system — ✅

- Files: `src/horse/HorseModel.ts`, `HorseAnimator.ts` (620 lines), `HorseBrain.ts` (472 lines — AI states), `HorseController.ts` (877 lines), `MountChoreography.ts` (865 lines — authored keyframe beats), `HorseProportions` constants, `src/horse/HorsePersistence.ts`.
- Fully implemented: rideable companion horse (single), gaits (walk/trot/canter/gallop with W/W+Shift), stamina + health with persistent death, COME (B) / STAY (N) commands with strict AI states and NO autonomous follow, staged mount/dismount animations with swept clearance, rider socket, grazing/idle life, persistence (`HorsePersistence`), playable-area clamp derived from shared `WORLD_*` constants (`1cb969d` §7).
- Partially implemented: two STATIC corral horses are scenery (not interactive) — by design after `1cb969d` §11 removed the two decorative pen horses.
- Tested: `tests/horse-controller.test.ts` (512 lines); `verify-round3.cjs` §3 (boundary park/clamp/save round-trip) fresh PASS; ride-cam framing in `verify-entrance-doors.cjs`.

### 3.6 Town environment, buildings, roads, vegetation — ✅

- Files: `src/assets/town/TownLayout.ts` (508 lines — sites, fences, roads), `TownProps.ts` (974 lines — lamps, hitching rails, benches, barrels, crates, fountain, wagons, vegetation builders), `TownMaterials.ts`, `TownAssetFactory.ts`, `src/assets/TownExteriorAssetFactory.ts` (1,703 lines — the six scale-1.3 buildings + butcher stall), plus building modules under `src/assets/{saloon,bank,sheriff,stable,gunshop}/`.
- Fully implemented: 120×120 dusty ground; continuous-route roads (3 routes + plaza polygon + 7 worn patches); central square with stone fountain; ~68 individually-spawned farm fence sections; entrance/street lamps; per-building entrances facing roads; farm yard with trough/hay/corral; crop field; pond; windmill; ruined-house outskirts; abandoned homestead isolated at NE outskirts.
- Tested: `tests/town-layout.test.ts` (561 lines), `tests/town-exterior.test.ts`, `tests/coplanar-regression.test.ts`, `tests/fix-round3.test.ts` (284 lines); in-browser `verify-town.cjs` (census + full-progression walk + wall-block probes + 18 zone shots) fresh ALL PASS, and `verify-round3.cjs` §1 z-fight scan = **0 conflicts across 1,528 meshes with no allowlist**.

### 3.7 Collision & physics — ✅ (custom, no physics lib)

- Files: `src/physics/CollisionWorld.ts` (class L58; `resolveHorizontalAxis` L121; `resolveVertical` L139; scaled/signed-yaw box math L163–L190).
- Fully implemented: AABB set from def metadata `{boxes:[{size,offset}]}`; per-axis horizontal resolve + vertical resolve with grounding; boxes scale per-axis and rotate with signed yaw (exact at 90° multiples, conservative otherwise); boundary walls; door colliders synced to pose.
- Tested: `tests/` collision suites incl. scaled-box + signed-yaw regressions (`f0c86dd`), in-browser walk-block probes in `verify-town.cjs`/`verify-round3.cjs`.

### 3.8 Edit mode (world editor) — ✅

- Files: `src/editor/TransformGizmo.ts` (404 lines), editor wiring in `game/playable-map.ts` (selection `selectObjectFromPointer`, panel `updateSelectionPanel`, PANEL_INPUTS, authored reset `resetObjectToAuthored` L315 / `resetAllToAuthored` L327, object-change log panel with COPY).
- Fully implemented: TAB toggle; raycast selection; axis gizmo (translate/rotate/scale) with distance arbitration vs proxies; selection panel with editable numeric fields; Persian object names; per-object/all reset to authored layout; "last object change" panel with Initial/Final transforms + clipboard copy (designed to hand exact edits to another AI).
- Tested: `tests/transform-gizmo.test.ts` (480 lines), `tests/editor-enhancements.test.ts`; `verify-restore-layout.cjs` 12/12 (historical run).

### 3.9 Persistence & save/load — ✅

- Files: `src/persistence/LocalSceneStorage.ts`, `PersistenceManager.ts`, `src/migrations/SceneMigrations.ts`, `src/core/validators.ts`; horse save `src/horse/HorsePersistence.ts`.
- Storage key `ai-western-game.playable-map.scene.v22` (`game/playable-map.ts` L301) — **every schema-impacting round bumps the key** (documented ladder v16→v22 in comments L289–L300); old saves rebuild from the new authored layout.
- Tested: unit suites (`tests/` storage/scene validation); save round-trip asserted in `verify-round3.cjs` §3c.

### 3.10 Day/night, lighting, shadows — ✅

- Files: `src/world/DayNightCycle.ts`, `src/engine/RenderGovernor.ts`, `src/engine/ShadowScheduler` (via `ShadowScheduler` import in `game/playable-map.ts` L161), `AdaptiveResolution` (L157).
- Fully implemented: continuous day/night (dusk altitude floor 0.32, warm-dust palette), 1024² shadow map (±85 ortho), adaptive DPR ladder (boot 0.85→1.0 cap; observed live at 0.75 buffer scale), shadow scheduling on idle/moving intervals, lamp lighting at night.
- Tested: pinned-time screenshots across harnesses; `setDayTime` harness hook.

### 3.11 UI / HUD — ✅

- In `site/index.html` (generated copy of root `index.html`): stats panel (objects, player XYZ, camera mode, time, FPS/frame/DPR, Map row — reads live world constant per `1cb969d` §8), vitals (HP/SP), horse panel (HP/SP/state/gait/distance), crosshair, control hint bar, selection panel (Persian buttons «بازگردانی شیء/همه»), last-object-change panel.
- Partially implemented: no settings menu, no pause menu, no key-rebinding UI, no minimap.

### 3.12 Audio — ❌ completely missing

- `grep -rn "Audio|AudioContext|.mp3|.ogg|.wav" src game` returns **zero references**. No music, no SFX, no footsteps. (Never requested by the user; listed here for completeness.)

### 3.13 NPCs & wildlife — ❌

- No NPC characters, no animals besides the rideable horse + 2 static corral horses. No pathing/behavior beyond `HorseBrain` for the companion horse.

### 3.14 Missions / progression / economy — ❌

- No objectives, quests, money, inventory, dialogue. The game is an open sandbox.

### 3.15 Other implemented systems worth naming

- **Draw-call merge (MergeStatic)** with `userData.dynamic` / `noMerge` escape hatches — contract test-locked (`tests/merge-static.test.ts`).
- **Deterministic RNG + module-level material/texture caches** in asset factories (0 canvases painted headless; 2nd build adds zero materials) — `29d03a7` §4.
- **Authored-layout restore** — boot transform snapshot + reset funnels (`70fa06b`).
- **Harness hook surface `__westTest`** (`game/playable-map.ts` L945+): `teleport`, `setYaw`, `setDayTime`, `player`, `yaw`, `scene()`, `camera()`, `setCamera`, `boundsNear`, `gateBounds`, spawn/despawn test defs, mesh stats, collider queries — read-only or gameplay-safe; the entire browser-evidence system depends on it.

---

## 4. Architecture and Code Quality Audit

### 4.1 Directory map (with responsibilities)

```
game/playable-map.ts        2,807 ln — composition root: boot, HUD, doors, editor UI, horse, animate()
src/assets/                 data-driven asset factories (town + 5 building families)
  town/                     TownLayout 508 / TownProps 974 / TownMaterials / TownAssetFactory / TownBuildings
  saloon|bank|sheriff|stable|gunshop/   4–6 files each (Architecture/Layout/Props/Doors/Exterior/Factory)
  TownExteriorAssetFactory.ts 1,703 ln — six scale-1.3 buildings + butcher (composite colliders)
src/core/                   SceneStateManager (mutation funnel), EventBus, types, RotationMath, validators, clone
src/engine/                 IRendererAdapter, ThreeRendererAdapter, HeadlessRendererAdapter, RenderGovernor
src/physics/CollisionWorld.ts  scaled/signed-yaw AABB resolver
src/player/                 PlayerController 942, ThirdPersonCamera, InputBindings, InteractionSystem,
                            MouseLookController, CharacterStateMachine, CreativeFlightController, Vitals, Spawn
src/player/character/       character model + CharacterAnimator
src/horse/                  Model 439 / Animator 620 / Brain 472 / Controller 877 / MountChoreography 865 / Persistence
src/editor/TransformGizmo.ts 404
src/world/DayNightCycle.ts
src/config/GameConfig.ts    central typed config (WORLD_* constants = single source of truth)
src/persistence/            LocalSceneStorage, PersistenceManager
src/migrations/SceneMigrations.ts
src/utils/                  Logger, RNG, misc
tests/                      48 *.test.ts files, 550 tests
scripts/                    51 *.cjs harnesses (verify-*/probe-*/shots-*/record-gameplay) + build/typecheck/test .mjs
site/                       generated bundle (git-visible build output) + vercel.json copy
```

### 4.2 Data flow

`InputBindings` → `GameModeController` routes input → `PlayerController` (or `CreativeFlightController` / horse rig) → `CollisionWorld.resolve` → `SceneStateManager` owns object state → `ThreeRendererAdapter` renders; `AssetRegistry`+factories produce defs on boot/load (`LocalSceneStorage` merge of authored defs + persisted deltas); `InteractionSystem` polls candidates → HUD prompt → door pose APIs → collider sync; `HorseBrain` ↔ `HorseController` ↔ rider socket ↔ cameras; `DayNightCycle` drives sun/hemisphere/lamps; `RenderGovernor`/`ShadowScheduler`/`AdaptiveResolution` modulate cost.

### 4.3 Strengths (evidence-based)

1. **Single mutation funnel** (`manager.updateObjectTransform`, wrapped at `game/playable-map.ts` L242) — every editor change, restore, and harness edit goes through one place; the change log + autosave hang off it.
2. **Collision metadata as data** (`{boxes:[{size,offset}]}`) with scaling/signed-yaw handled in ONE class (`src/physics/CollisionWorld.ts` L163–190) — the class of "visual ≠ collision" bugs was eliminated systemically, not per-object (`f0c86dd`).
3. **Versioned storage keys with a documented ladder** (L289–300) — layout rounds cannot resurrect stale saves.
4. **Test-locked contracts**: MergeStatic dynamic flags (9 real doors), roof-band straddle, coplanar regression (`tests/coplanar-regression.test.ts`), town road continuity, horse boundary source-of-truth.
5. **Evidence culture**: 51 harnesses; every user-reported bug fixed with a browser probe + screenshots, not just unit tests.
6. **Perf systems, not hacks**: RenderGovernor + ShadowScheduler + AdaptiveResolution + MergeStatic — measured draw-call reduction 1731→613 (`01564c2`).

### 4.4 Weaknesses / debt (exact findings)

| Finding | Location | Severity | Detail |
|---|---|---|---|
| Oversized composition root | `game/playable-map.ts` (2,807 ln) | Medium | Violates the user's ~1,000-line guidance; contains door-swing drivers for 6 building families (L563–L940), editor UI wiring, HUD, horse rig — should be split into modules (e.g. `game/doors/*.ts`, `game/hud.ts`, `game/horseRig.ts`) **only when a change touches it**, to avoid churn |
| Second oversized file | `src/assets/TownExteriorAssetFactory.ts` (1,703 ln) | Low | Six buildings in one factory; cohesive but large |
| Stale one-off harnesses | `scripts/verify-gunshop.cjs`, `verify-bank-interior/gate/vault.cjs`, `verify-saloon-final/pass2.cjs` | Medium (tooling) | Still target pre-redesign coordinates; `verify-gunshop.cjs` errors at the door probe (reproduced this session). Their contracts currently enforced site-relatively by unit tests + `verify-town.cjs`/`verify-round3.cjs` (documented follow-up in worklog). Re-map or delete |
| 51 scripts, some one-off | `scripts/` | Low | `probe-*.cjs` are single-purpose investigation artifacts; no index/README to say which are canonical |
| Duplicate editor-name logic risk | sheriff segment names (`1cb969d` §9) vs other buildings | Low | Unique-name generation was added only for sheriff windows; other multi-window walls could collide in the editor panel (Not Verified — requires check) |
| `site/` committed to repo | `site/` | Low | Generated bundle in git (needed for Vercel-simple deploy; but invites stale-bundle confusion — currently byte-verified current) |
| Type safety | repo-wide | Info | tsc clean; strict mode confirmed by clean typecheck; no `any`-storms observed in sampled files (Not exhaustively audited) |
| Memory management | — | Unknown | No dispose() sweep on despawn paths found in sampling; JS heap 42–48 MB at boot (healthy). Long-session leak behavior **Not Verified** |
| Error handling | boot path | Info | Harness hook + HUD present; no global error overlay; page errors surfaced only via harness listeners |

---

## 5. World and Environment Audit

### 5.1 World structure (verified from `TownLayout.ts` + live scene)

- **Ground:** 120×120 (`TOWN_GROUND_SIZE` = `WORLD_GROUND_SIZE` from `src/config/GameConfig.ts`), dusty mottled material, boundary walls at ±59.5 (road ends AT the inner face — `1cb969d` §5); playable half for horse clamps = ±58.5 (shared source `WORLD_*`).
- **HUD Map row:** "120 × 120" reads the live constant.
- **Camera far plane:** 180 ≥ diagonal 169.7 (`1cb969d` §8).

### 5.2 Settlement layout (authored sites, `TownLayout.ts` L52–L88)

| Site | Position (x,z) | Yaw | Scale | Role |
|---|---|---|---|---|
| Farmstead + fenced yard | −12, −49.5 | 90 | 1.0 | Farm before town; ~68 individual fence sections; trough/hay; corral 7.7×6.5 (50 m²) |
| Butcher stall | −12, −1.5 | 90 | 1.0 | RIGHT side entering square (west); counter faces plaza |
| Worker house | 12, −2.5 | −90 | 1.3 | LEFT side entering square |
| Family house | −12, −6.8 | 90 | 1.3 | Far side west, beside butcher (`1cb969d` §12 move; gaps ≥1.2 m stall, ≥2.6 m saloon) |
| Wealthy house | 21, 13.5 | 180 | 1.3 | Far side, east of sheriff |
| Bank | `BANK_SITE` | 180 | — | Far side, front stairway reaches z≈6.8 |
| Sheriff | `SHERIFF_SITE` | 180 | — | Far side; porch piers under deck |
| Stable | `STABLE_SITE` | 180 | — | Near exit; 6 stalls; corral with 2 static horses |
| Saloon | `SALOON_SITE` | 90 | — | Square area |
| Gun shop | `GUNSHOP_SITE` | −90 | — | First building after entrance, before plaza |
| Abandoned house | 31, −50 | 0 | 1.3 | NE outskirts, isolated |
| Respawn | −1.5, −57.5 | — | — | Farm road north end |
| Horse spawn | −3.8, −53.5, yaw 0.7 | — | — | Meadow beside farm road |

Roads: **3 continuous routes + 1 irregular plaza polygon + 7 organic worn patches**, all inside ±59.5 (verified `verify-round3.cjs` §2e: `routes=3 polygons=1 patches=7 inside=true`, fresh PASS).

### 5.3 Geometry hygiene (measured, not assumed)

- **Z-fighting:** production-filter scan (no allowlist): **1,528 meshes → 0 conflicts** (`verify-round3.cjs` §1, fresh run; sign-text faces deliberately 2.5 cm proud per `1cb969d` §6).
- **Colliders vs visuals:** scaled defs keep collider==visual spans (×1.3 asserted in `verify-scale-and-fixes` 28/28 historically; walk probes stop at face±radius).
- **Intersections/floating:** round-3 geometry probes PASS (columns deck→beam 0.182→2.801 exact; railing seated 0.234; piers 0…0.065 under deck; vault disc clears floor 40 mm closed AND open; family-beside-butcher yaw match).
- **Walkability:** full farm→entrance→square→stable→exit walk probes PASS fresh; boundary wall stops the player at z −58.65 (road end −59.5).
- **Known visual-risk areas (Not Verified this session):** stable interior dressing after the corral enlargement; saloon interior after the v22 rebuild; night lighting of the new family-house site (screenshots exist from round-3 only in day-pinned state).

---

## 6. Player Controls and Gameplay Audit

Extracted from the control-hint source (`game/playable-map.ts` L1437) and controller code:

| Input | Behavior (actual) | Notes / issues |
|---|---|---|
| `W A S D` | Camera-relative walk (A/D alone = turn-in-place with camera lockstep) | consistent since `de0b886` |
| `W + Shift` | Sprint, drains stamina; on horse = faster gait (canter/gallop) | stamina regen 17/s, delay 0.8 s |
| `Space` | Jump (grounded only) | — |
| `C` / `Ctrl` | Toggle crouch | — |
| Hold `RMB` + move | Look (camera yaw/pitch); body follows when moving | RMB-only by design (`12cd0fb`) |
| `E` | Interact with candidate OR mount horse (when nearest) | prompt re-renders on label change (`c872378`) |
| `V` | Camera toggle FP/TP | dropped mid-mount by design |
| `F` | Creative fly (player frozen, camera free) | exit restores walk |
| `TAB` | Edit mode (selection + gizmo + panels) | Creative→TAB priority documented |
| `B` / `N` | Horse COME / STAY (absolute park) | no autonomous follow |
| `R` | Respawn at farm road | — |
| `H` / `J` | Player debug toggles; `[` `]` horse debug | dev-facing, remain in hint bar |
| Mouse wheel / zoom | TP boom distance | via ThirdPersonCamera |
| Mount flow | E near horse → staged animation (~4–6 s) with rider socket; dismount animated; FP/TP switch handled | swept clearance verified historically |
| Doors | E on door → swing open/close; collider released while open | 9 door contracts test-locked |

**Usability issues (honest):** the hint bar mixes gameplay keys and dev debug keys (`H/J/[/]`) — cluttered for a player; no in-game settings or rebind; English-only hints while editor panel is Persian (mixed-language UX). No gamepad support.

---

## 7. Testing and Quality Assurance

**All numbers below were produced fresh in this audit session** (commands run at HEAD `1cb969d`):

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **Clean (exit 0)** |
| Unit tests | `npm test` (node:test) | **550 tests / 550 pass / 0 fail / 0 skipped / 0 todo** (7.9 s) |
| Production build | `npm run build` | **OK** — `site/game/playable-map.js` 1,823,926 bytes, self-contained (0 bare imports) |
| Browser: fix-round 3 | `node scripts/verify-round3.cjs` (dev server :5176) | **23/23 PASS**, zero console/page errors, 14 screenshots |
| Browser: town walkthrough | `node scripts/verify-town.cjs` | **ALL PASS** (18 zone shots; median frame ≈ 381 ms headless software rendering) |
| Browser: visual-defect round | `node scripts/verify-bug-round.cjs` | **15/15 PASS**, zero console errors |
| Browser: live site | chromium → `https://western-game-psi.vercel.app` | **PASS** — canvas+HUD present, world renders, **zero console errors**; deployed bundle sha256 `905c1a12…` byte-identical to local build |
| Boot measurement | audit probe (chromium headless, production bundle) | canvas visible ≈ **13.7 s** from navigation incl. world build (headless; see §8 caveat) |
| Stale harness check | `node scripts/verify-gunshop.cjs` | **ERRORS** at the door probe (pre-redesign coordinates) — tooling debt, NOT a game defect (gunshop contracts enforced by `tests/gunshop-assets.test.ts` 935 ln + verify-town) |

**Integration coverage beyond unit tests:** the repo's pattern is harness-first — 51 scripts; the canonical post-redesign set is `verify-town.cjs`, `verify-round3.cjs`, `verify-bug-round.cjs`, `verify-scale-and-fixes.cjs`, `verify-house-fixes.cjs`, `verify-town-exterior.cjs`, `verify-entrance-doors.cjs`, `verify-stable.cjs`, `record-gameplay.cjs`.

**Not verified (honesty):** save-migration from v16–v21 saves; long-session memory behavior; multiplayer/N-A (N/A).

---

## 8. Performance Audit

**Measurement context (critical):** all numbers below come from **headless chromium (SwiftShader software GL)** — they measure CPU-side scene cost, NOT real GPU rendering. Real low-end-laptop numbers are **Not Verified** and require a hardware pass.

| Metric | Measured (this session, headless) | Source |
|---|---|---|
| Scene census | 574 top-level objects · 2,549 traversed nodes · **1,750 meshes** · **211,773 vertices** · 20 lights · 769 groups | `__westTest.scene()` traverse |
| JS heap at boot | 42.6–48.1 MB (limit 2,222 MB) | `performance.memory` |
| HUD FPS / frame | 2 FPS · 334–375 ms/frame (software GL) | app HUD counters |
| Historical headless reference | 46.5 ms median (8b02fd3, lighter scene); 850→260 ms town frame after MergeStatic (01564c2) | commit records |
| DPR / resolution | Governor live: 1280×720 CSS → 960×540 buffer (**DPR 0.75**) | canvas buffer size |
| Draw calls | 613 after MergeStatic era (01564c2); current count **Not Verified** (renderer.info not exposed through `__westTest`) | commit record |
| Shadow cost | 1024² map, ±85 ortho, scheduled updates (idle 0.15 s / moving 1/30 s) | `game/playable-map.ts` L161 + config |

**Estimates vs measurements:** object/mesh/vertex counts and heap are **measurements**. Draw-call and real-FPS figures for today's scene are **estimates/not verified**. Historical 613-draw-call figure predates the town redesign (+six buildings, roads, vegetation) — expect it higher now; the Z-fight scanner counts 1,528 renderable meshes.

**Realistic optimization opportunities (low-end laptops), in expected-value order:**

1. **Expose `renderer.info` through `__westTest`** (one-line harness addition) so draw calls are measurable per round — cheap, unlocks real numbers.
2. Frustum-cull audit on the 20 lights (lamps): ensure `castShadow=false` on all but the sun (lamps are point/spot — historically true; **Requires Further Investigation** for the new family-house site lamp).
3. Merge the ~68 farm fence sections per-run (they must remain INDIVIDUAL defs per user rule — but they could share ONE merged static mesh per section *group* only if the user re-approves; currently they are separate draws by design).
4. Optional: pre-cull interior props when the building is closed (five enterable interiors are always live).

---

## 9. Known Bugs and Outstanding Issues

**No known open gameplay/rendering bugs at HEAD** — every user-reported issue through 2026-09-20 has a fix commit + regression test or harness check. The outstanding items are:

| # | Title | Severity | Detail / evidence | Confidence |
|---|---|---|---|---|
| 1 | Stale coordinate-based harnesses (gunshop/bank/saloon one-offs) | Medium (tooling) | `scripts/verify-gunshop.cjs` errors at door probe (reproduced this session at L62 `gdoor`); same family targets old map coordinates. Game contracts still enforced via unit tests + new-geography harnesses | Confirmed (reproduced) |
| 2 | Real-GPU performance unverified | High (knowledge gap, not a defect) | All perf evidence is headless software rendering; the "weak laptop" target has never been measured on real hardware in-repo | Confirmed gap |
| 3 | Draw-call count not exposed/measured for current scene | Medium | `renderer.info` not reachable via `__westTest`; last figure (613) predates the town redesign | Confirmed gap |
| 4 | Mixed-language UX (English hint bar, Persian editor names) | Low | Design inconsistency; user has not requested a change | Observed |
| 5 | Debug keys exposed in player hint bar | Low | `H/J/[/]` visible to players (`L1437`) | Observed |
| 6 | Token/deploy fragility (process, not code) | Medium (ops) | GitHub fine-grained PAT had no Contents-write until 2026-11-11; mirror repo lagged main twice, causing "not pushed" complaints. Resolved this session (new token, mirror synced, Vercel auto-deploy verified) | Resolved; monitor |
| 7 | Long-session memory / leaks | Unknown | No dispose() audit performed; boot heap healthy (42–48 MB) | Requires Further Investigation |
| 8 | Save growth with 574 objects | Unknown | Save size/load time at v22 with full town not benchmarked | Requires Further Investigation |

**Reproduction status:** #1 reproduced; #2/#3 measured gaps; #4/#5 observed in code/HUD; #7/#8 not attempted.

---

## 10. Incomplete and Missing Features

| Feature | State | Dependency / note |
|---|---|---|
| Audio (music/SFX/footsteps) | ❌ none (0 references) | Never requested by user — **do not add without explicit request** |
| NPCs / wildlife | ❌ none | `HorseBrain` is the only behavior AI |
| Missions / objectives / economy | ❌ none | Game is a sandbox; user has not requested |
| Interiors beyond 5 buildings | 🟡 six exterior buildings; butcher is an outdoor stall; farmstead has a lean-to shed (enterable-ish, door on east face) | — |
| Settings/pause menus, rebinding | ❌ none | — |
| Gamepad/mobile | ❌ none | Mobile explicitly unsupported (user informed) |
| Interiors always live (no streaming/culling) | 🟡 perf-relevant | Optimization opportunity only |
| v16–v21 save migration testing | 🟡 by-design drop (key bump = rebuild) | Documented pattern; old saves intentionally rebuild |

**Essential-for-a-complete-game (if the user asks to "finish" it):** a game loop (objective, reward, failure), audio pass, NPC life (even simple wanderers), settings menu. **All are out of scope until requested** (§15 constraints).

---

## 11. Git and Deployment Status

| Item | State (verified this session) |
|---|---|
| Branch | `main` (local == origin) |
| HEAD | `1cb969d406803d091815d28d77f02da0ea0008ad` — "Fix-round 3: twelve town/environment fixes (user report)" (2026-09-20) |
| Working tree | **Clean** (only untracked artifact: this audit file, by design) |
| Remotes | `origin` → `github.com/karanrzn-crypto/Ai-western_game` · `western` → `github.com/karanrzn-crypto/western_game` (URLs embed the user's fine-grained PAT — **secret, not reproduced here**) |
| Push status | **BOTH repos at `1cb969d`** (mirror was 3 behind; force-with-lease fast-forward pushed 2026-11-11 after the user supplied a Contents:Read-and-write token) |
| Branches on mirror | `main`, `legacy-main` (pre-merge western_game history backup at `8893214`) |
| Deployment | Vercel Hobby project **"western-game"** (user's account) ← auto-deploy on push to `western_game:main`; build `npm run build`, output `site/` (vercel.json) |
| Live URL | `https://western-game-psi.vercel.app` — **verified live, byte-exact current bundle, zero console errors** |
| Storage key | `ai-western-game.playable-map.scene.v22` |

**Audit compliance note:** no commit/push was made for this audit; the report file is intentionally untracked.

---

## 12. Professional Evaluation

Scores are evidence-based and deliberately conservative. (10 = shippable commercial quality in that axis.)

| Axis | Score | Justification (evidence) |
|---|---|---|
| Architecture | **8/10** | Clean layered modules, data-driven defs, single mutation funnel, scaled/signed-yaw collision centralized, config singleton; −1 for the 2,807-line composition root and in-file door drivers; −1 for harness coordinate drift |
| Code quality | **8/10** | tsc clean, 550/550 tests, documented contracts (MergeStatic, storage ladder, collider payloads), deterministic RNG; −1 duplicated door-swing driver pattern ×6; −1 script sprawl (51 files, no canonical index) |
| Graphics & visual quality | **7/10** | Cohesive warm-dust palette, real vegetation geometry (not cones), disciplined z-fight hygiene (0 conflicts/1,528 meshes), tuned shadows; capped by intentional low-poly boxy style and code-generated materials only |
| World & environment design | **8/10** | Functional zoning per the 17-section spec (farm→entrance→street→plaza→stable→exit), organic roads (3 routes+plaza+7 patches), individually-movable fences, isolated abandoned homestead; −2 for interior sparseness outside the 5 enterable buildings |
| Gameplay | **6/10** | Solid sandbox verbs (walk/ride/interact/edit) but no goals, no NPCs, no audio, no activities beyond self-directed play |
| Player controls | **7/10** | Consistent camera-relative scheme, real door poses, staged mount; −2 for dev keys in hint bar, mixed-language hints, no rebinding/settings |
| Performance | **6/10** | Real systems (governor/merge/scheduler; DPR 0.75 live) BUT 1,750 meshes and current draw calls unmeasured; real-GPU frame rate unknown for the stated weak-laptop target |
| Stability | **9/10** | Zero console errors across every fresh harness + live site; regressions test-locked; −1 for unverified long-session memory |
| User experience | **6/10** | Informative HUD, editor restores, Persian naming; but no menus/settings, no audio feedback, English/Persian mix, debug keys visible |
| **Overall completeness** | **6.5/10** | A polished, verified sandbox vertical slice — not yet a "game" in the mission-loop sense; quality discipline is well above typical hobby standard |

---

## 13. Development Roadmap

Priority levels per the brief; **nothing below adds features the user has not asked for** (P1 items close known gaps in verification and tooling).

| # | Task | Priority | Dependencies | Files / systems | Expected outcome |
|---|---|---|---|---|---|
| 1 | Expose `renderer.info` (draw calls, triangles) via `__westTest`; add a perf harness asserting call budget | **P0** | none | `game/playable-map.ts` L945 hook, new `scripts/verify-perf.cjs` | Real numbers per round; regression guard for perf work |
| 2 | Real-hardware perf pass (user's low-end laptop): record FPS/frame at DPR ladder steps; decide whether scene needs culling/LOD | **P0** | #1 | audit probe + user machine | Replace headless-only evidence with target-hardware truth |
| 3 | Re-map or delete stale one-off harnesses (gunshop/bank/saloon coordinates) to current sites; mark canonical harness set in `scripts/README` | **P1** | none | `scripts/verify-gunshop.cjs`, `verify-bank-*.cjs`, `verify-saloon-*.cjs` | Green tooling suite; no false alarms |
| 4 | Long-session memory check (30-min soak with enter/exit interiors + save/load loop) | **P1** | none | audit probe extension | Confirm/kill leak suspicion |
| 5 | Split `game/playable-map.ts` along existing seams (door drivers → `game/doors.ts`, horse rig → `game/horseRig.ts`, HUD → `game/hud.ts`) **only when next touched**, keeping behavior identical (tests + harnesses as the net) | **P2** | none (opportunistic) | `game/playable-map.ts` | File ≤ ~1,000 ln per user guidance |
| 6 | UX polish pass: hide debug keys from hint bar (move to a `?debug` flag), unify hint language with a Persian translation of the hint bar | **P2** | user approval | `game/playable-map.ts` `updateControlHint` | Cleaner player-facing UX |
| 7 | If user requests gameplay depth: minimal objective loop (e.g., delivery errand farm↔stable using existing roads/horse), then audio pass — each as its own spec round | **P3** | explicit user request | new modules | Only on request |
| 8 | Ops hygiene: rotate the no-expiry PAT if the user ever revokes it; keep mirror sync ritual after every push (or make Vercel watch `Ai-western_game` instead — one-click in Vercel Settings→Git, removes the mirror from the critical path) | **P2** | user decision | Vercel project settings | Removes recurring "not pushed" class of issues |

**Recommended order:** 1 → 2 → 3 → 4 → (6, 8 opportunistic) → 5 when touched → 7 only on request.

---

## 14. HANDOFF FOR NEXT AI

### 14.1 Identity & purpose
Browser-based single-player western sandbox ("AI-Western Game", Part 3 era): Three.js + TypeScript, Persian-speaking user, weak-laptop target, data-driven scene with a full world editor. The town layout follows the user's 17-section spec; the six exterior buildings follow the user-approved scale-1.3 model round.

### 14.2 Current state (2026-11-11)
- HEAD `1cb969d` on `main`, **both GitHub repos synced**, working tree clean (plus the untracked `WESTERN_GAME_FULL_AUDIT.md`).
- Live at `https://western-game-psi.vercel.app` (auto-deploy from `western_game:main`, verified byte-exact this session).
- All gates green fresh: typecheck clean · **550/550** · build OK · verify-round3 **23/23** · verify-town ALL PASS · verify-bug-round **15/15** · live-site smoke PASS, zero console errors anywhere.
- No known open gameplay bugs. Known gaps: perf never measured on real GPU (#9.2), stale one-off harnesses (#9.1), no audio/NPCs/missions (never requested).

### 14.3 Architecture in 5 lines
1. Factories → `ObjectDefinition`s (uuid/type/transform/metadata.colliders) → `AssetRegistry` → `SceneStateManager` (single funnel) → `ThreeRendererAdapter` (+ MergeStatic for draw calls).
2. `CollisionWorld` resolves a capsule against metadata boxes; boxes **scale per-axis and rotate with signed yaw** with the def — never re-derive colliders from meshes.
3. `game/playable-map.ts` composes everything and owns door swing drivers, HUD, editor UI, horse rig, and `animate()`.
4. Persistence = authored layout + editor deltas under storage key **v22**; layout-changing rounds MUST bump the key (ladder documented at `game/playable-map.ts` L289–300).
5. Browser evidence flows through the `__westTest` hook (L945): teleport/pin time/scene()/camera()/boundsNear/spawn test defs.

### 14.4 Implemented gameplay features (summary)
Walking/sprinting/jumping/crouching player (stamina/health, death+respawn) · FP/TP cameras with mode state machine · creative fly · E-interactions with 9 test-locked doors (stable×10, bank double, vault disc, iron gate, sheriff, cells, gunshop, saloon leaves) · horse (mount/dismount choreography, gaits, COME/STAY, persistence, boundary clamps) · edit mode (gizmo, panels, Persian names, authored reset, change-log COPY) · full town (roads, plaza, fountain, fences, props, vegetation, 5 enterable interiors + butcher stall) · day/night with shadows and lamps.

### 14.5 Unfinished systems
Audio, NPCs, missions/economy, settings menus — **all intentionally absent; do not add without an explicit user request** (§15).

### 14.6 Most critical known issues (top 3)
1. Real-GPU perf unverified — measure on the user's laptop before any optimization.
2. `scripts/verify-gunshop.cjs` (+bank/saloon one-offs) error on stale coordinates — re-map or delete; canonical set is verify-town/round3/bug-round.
3. Ops: Vercel watches the `western_game` MIRROR — after every push, sync the mirror or the site lags (the historical "not pushed" complaint source).

### 14.7 Next recommended task
**Roadmap #1+#2 (P0):** expose `renderer.info` through `__westTest`, add `scripts/verify-perf.cjs`, then run a real-hardware perf pass on the user's low-end laptop. This is the only "unknown" that can silently invalidate the game's core constraint (weak-laptop playability).

### 14.8 Where things live
- World layout/sites: `src/assets/town/TownLayout.ts` (L52 `TOWN_SITES`, L73 `TOWN_EXTERIOR_SITES`, L90 respawn, L92 horse spawn)
- Collision: `src/physics/CollisionWorld.ts` (L58 class, L163–190 scaled/signed-yaw math)
- Player: `src/player/PlayerController.ts` (L195), cameras `src/player/ThirdPersonCamera.ts`
- Horse: `src/horse/*` (Controller 877 ln, MountChoreography 865 ln)
- Doors/interaction: `src/player/InteractionSystem.ts` + `game/playable-map.ts` L563–L940
- Buildings: `src/assets/{saloon,bank,sheriff,stable,gunshop,town}/`, `src/assets/TownExteriorAssetFactory.ts`
- Config/constants: `src/config/GameConfig.ts` (`WORLD_*` = single source of truth for bounds)
- Persistence: `src/persistence/LocalSceneStorage.ts`, `src/migrations/SceneMigrations.ts`
- Harnesses: `scripts/verify-*.cjs` (canonical: town, round3, bug-round, scale-and-fixes, house-fixes, town-exterior, entrance-doors, stable, record-gameplay)

### 14.9 Commands

```bash
npm install                # once
npm run dev                # vite dev server :5173 (game at /)
npm run typecheck          # tsc
npm test                   # 550 node:test tests
npm run build              # esbuild → site/
# Browser harnesses:
npx vite --port 5176 --strictPort &   # harness dev server
node scripts/verify-round3.cjs        # canonical town evidence (23 checks)
node scripts/verify-town.cjs          # full-progression walkthrough
node scripts/verify-bug-round.cjs     # visual-defect regression
# Production smoke:
cd site && python3 -m http.server 8199   # then load http://localhost:8199/
```

### 14.10 Git & deployment
- Push ritual: push `origin main` **and** sync mirror `western_game:main` (fast-forward; verify with `git ls-remote`) → Vercel auto-deploys in ~1–2 min → confirm by byte-comparing `site/game/playable-map.js` sha256 against the deployed bundle.
- The remote URLs embed the user's PAT — never print/commit it; if auth fails with 403, the token lacks **Contents: Read and write** (user re-issues).
- `site/` is committed; after every build the bundle must be committed together with source changes.

### 14.11 Development constraints & user preferences (binding)
See §15 — in short: weak-laptop budget, no unrequested features, no parallel/duplicate systems, real-browser verification before "done", geometry/transform/collision correctness first, files ≈ ≤1,000 lines, respond to every checklist item, repeated messages = deliver now, evidence to Telegram (bot chat 8987946674; script `scripts/notify-telegram.sh` / `telegram-send.cjs`).

### 14.12 Decisions that must NOT be reversed without strong cause
1. **One town, one architecture** — the `a988cd7` alternative redesign was dropped deliberately ("one town ships, zero parallel systems").
2. **Scale-1.3 model round** is the user-approved model for the six exterior buildings.
3. **Storage-key bump ladder** for every layout round (v16→v22; never migrate in place).
4. **MergeStatic contract** (`userData.dynamic` on every hinge; `noMerge` for hero props) — locked by `tests/merge-static.test.ts`.
5. **Collision metadata as data** (scaled+signed-yaw boxes in `CollisionWorld`), not mesh-derived.
6. **Farm fences as individually-spawned defs** — the user requires each section independently selectable/movable; never merge them into one mesh.
7. **Factories never apply world transforms**; site placement lives in layout tables + the adapter.
8. **Persian editor names** and the user's Final-transform metadata are authoritative.
9. **Vercel deploys from the mirror** (or move it to `Ai-western_game` once, consciously — but do not end up watching both).

---

## 15. Development Constraints and User Preferences

Preserved verbatim-in-spirit from the standing spec (binding for all future work):

1. The game must remain **lightweight** and run reasonably well on **low-end laptops**.
2. Avoid unnecessary graphics features that significantly increase rendering cost.
3. **Do not invent gameplay mechanics or features** that were never requested.
4. Prefer **simple, reliable, modular** implementations.
5. Avoid excessively large source files — **≈1,000 lines or fewer per file where practical**.
6. Pay special attention to **transforms, pivots, rotations, collision geometry, object alignment, visual correctness**.
7. Verify that **visible geometry matches collision behavior**.
8. **A feature is not complete because its code exists** — require real verification.
9. Prioritize **real gameplay verification** (browser, screenshots, probes) over code-based assumptions.
10. Avoid **unnecessary refactoring** and architectural complexity.
11. Process rules from the collaboration: push to GitHub + Telegram report for every delivery; answer every checklist item explicitly; repeated user messages mean "deliver now"; never ship workarounds or parallel systems; the second reference image is the town's visual authority.

---

## 16. Reporting Notes

- Everything marked "measured" in this report was produced by commands run in this audit session at HEAD `1cb969d`; historical figures (e.g., 613 draw calls, 46.5 ms median) are quoted from commit records and labeled as such.
- Items marked **Not Verified** / **Requires Further Investigation** were not testable in this session's environment (no real GPU, no long soak window, no v16–v21 legacy saves).
- No source file, config, test, or script inside the repository was modified, added, or committed for this audit. The single created file is this report at the project root; a user-facing copy was placed in `/home/z/my-project/download/`.
- Secrets: the GitHub PAT embedded in git remote URLs and the Telegram bot token are **deliberately not reproduced** anywhere in this document.

*End of audit report.*
