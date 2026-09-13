# Ai-western_game

A **data-driven 3D scene manager** for an AI-powered western game. All 3D
objects (walls, chairs, props, doors, NPCs, lights, etc.) are registered in
a central `Map<string, ObjectDefinition>` registry. The 3D engine re-renders
**only** when the `SceneStateManager` API is invoked — never via ad-hoc
muta­tion of mesh objects. Manual placements can be exported to JSON and
restored later, which kills the "state loss" problem permanently.

> Built with **TypeScript** + **three.js**. Renderer-agnostic at the
> interface level (`IRendererAdapter`) — a headless adapter is shipped for
> tests and server-side simulation, and a Three.js adapter for the live
> game.

---

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────┐
│                      SceneStateManager                       │
│                                                              │
│   registry: Map<string, ObjectDefinition>                    │
│   - registerObject(def)        → adds to registry + renderer │
│   - duplicateObject(uuid)      → clones object, new uuid    │
│   - unregisterObject(uuid)     → removes from both          │
│   - updateObjectTransform(u,t) → mutates transform, re-syncs │
│   - updateObjectMetadata(u,m)                                │
│   - getObject / getSnapshot / getAllObjects                 │
│   - getObjectsByAssetType                                    │
│   - bus: EventBus (lifecycle events)                         │
│                                                              │
└──────────────┬──────────────────────────────────────────────┘
               │ dispatch RendererChange   │ uses for export/load
               ▼                            ▼
   ┌────────────────────────┐   ┌──────────────────────────────┐
   │  IRendererAdapter      │   │  PersistenceManager          │
   │  - syncObject(change)  │   │  - exportSceneToJSON()       │
   │  - getActiveObjectCount│   │  - loadSceneFromJSON(data)   │
   │                        │   │    (atomic by default)       │
   │  consumed:             │   │    (drives migrations)        │
   │  AssetRegistry ←──────┼───┤                              │
   └──────────┬─────────────┘   └──────────────────────────────┘
              │
   ┌──────────┴──────────────┐
   │                         │
   ▼                         ▼
┌──────────────────┐   ┌────────────────────────┐
│ ThreeRenderer    │   │ HeadlessRendererAdapter│
│ Adapter          │   │ (tests / Node)         │
│ - meshes:        │   │ - activeUUIDs: Set     │
│   Map<uuid,Mesh> │   │ - change log           │
│ - async-safe     │   └────────────────────────┘
│   pending queue  │
└──────────────────┘

Cross-cutting singletons (consumed by every layer above):
  • GameConfig      (schemaVersion, maxObjects, renderer defaults, …)
  • EventBus        (typed lifecycle events: object:registered, scene:loaded, …)
  • MigrationRegistry (scene schema migrations: v1 → v2 → …)
  • Logger         (scoped leveled: error / warn / info / debug)
```

For the complete architecture report (major modules, data flow,
persistence format, asset flow, rendering flow, what is intentionally
NOT implemented yet, known limitations, recommended next foundation
step), see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

### File layout

```
src/
├── core/
│   ├── types.ts                  ← ObjectDefinition / Transform / AssetType / SceneData
│   ├── SceneStateManager.ts      ← THE registry + update + duplicate + clear API
│   ├── EventBus.ts               ← minimal typed event emitter
│   ├── TransformOps.ts           ← IDENTITY_TRANSFORM, equals, clone, makeTransform
│   ├── validators.ts             ← merge & validate Transform patches
│   └── clone.ts                  ← deep-clone / deep-freeze helpers
├── persistence/
│   ├── PersistenceManager.ts     ← exportSceneToJSON / loadSceneFromJSON (atomic, migrations)
│   └── LocalSceneStorage.ts      ← localStorage persistence for the playable map
├── engine/
│   ├── IRendererAdapter.ts       ← interface every renderer must satisfy
│   ├── ThreeRendererAdapter.ts   ← concrete three.js implementation (async-safe)
│   └── HeadlessRendererAdapter.ts← test/Node-only implementation
├── assets/
│   ├── IAssetFactory.ts           ← per-asset-type factory interface
│   ├── AssetRegistry.ts           ← assetType → factory map (replaces switch statement)
│   ├── PrimitiveAssetFactory.ts   ← cube factory (only validation asset)
│   └── index.ts                  ← barrel
├── physics/
│   └── CollisionWorld.ts         ← AABB colliders, ground plane, player sweep
├── player/
│   ├── PlayerController.ts       ← movement / camera modes / yaw + body yaw
│   ├── ThirdPersonCamera.ts      ← follow rig with occlusion + shoulder offset
│   ├── MouseLookController.ts    ← RMB-drag look (pixel deltas → yaw/pitch)
│   ├── InputBindings.ts          ← action map + edge detection
│   ├── Vitals.ts                 ← health + stamina systems
│   ├── CharacterStateMachine.ts  ← idle/walk/run/... state machine
│   ├── InteractionSystem.ts      ← generic range/facing interaction
│   ├── Spawn.ts                  ← safe spawn position probe
│   └── character/                ← procedural character model, animator, proportions
├── world/
│   └── DayNightCycle.ts          ← continuous day/night lighting
├── editor/
│   ├── ObjectEditorController.ts ← selection + transform commands
│   ├── TransformGizmo.ts         ← mouse gizmo (move/rotate)
│   ├── ContactIndicator.ts       ← flush-contact ring between surfaces
│   ├── MoveClamp.ts              ← penetration guard for drags
│   ├── GizmoMath.ts              ← ray/axis math for the gizmo
│   ├── SelectionInfo.ts          ← HUD panel formatting helpers
│   └── DebugAxes.ts              ← dev-only axes helper (tagged, never saved)
├── config/
│   └── GameConfig.ts              ← singleton config (schema version, limits, debug, …)
├── migrations/
│   └── SceneMigrations.ts         ← MigrationRegistry (v1 → v2 → …)
├── utils/
│   ├── uuid.ts                   ← generateUUID / isValidUUID (cross-session stable)
│   └── Logger.ts                  ← leveled scoped logger
└── index.ts                      ← public barrel

index.html                       ← page shell, loads game/playable-map.ts
game/                             ← the playable game entry (playable-map.ts)
examples/                         ← minimal-scene.json (1-cube validation fixture)
tests/                            ← 254 node:test tests (no external deps)
vercel.json                       ← Vercel deployment config (Vite framework)
ARCHITECTURE.md                  ← full architecture report
```

> **Status:** The architecture foundation is complete and a playable
> third-person character demo runs on top of it (movement, camera, vitals,
> day/night, editor). Still intentionally absent: NPCs, weapons, missions,
> inventory, and western world content systems.

---

## The canonical object schema

Every object stored in the registry — and every object written to a scene
JSON file — conforms to **exactly** this shape:

```jsonc
{
  "uuid": "00000000-0000-4000-a000-000000000001",  // RFC 4122 v4
  "assetType": "cube",                              // cube | wall | chair | prop | ...
  "transform": {
    "position": { "x": 0, "y": 0, "z": 0 },
    "rotation": { "x": 0, "y": 0, "z": 0 },         // degrees
    "scale":    { "x": 1, "y": 1, "z": 1 }
  },
  "metadata": { "name": "user_friendly_name" /* + arbitrary fields */ }
}
```

The `SceneData` envelope written by `exportSceneToJSON()`:

```jsonc
{
  "version": 1,                       // schema version (for migrations)
  "exportedAt": "2025-01-01T00:00:00.000Z",
  "sceneMetadata": { "name": "...", "description": "..." },
  "objects": [ /* ObjectDefinition[] */ ]
}
```

---

## Quick start

### Install dependencies

```bash
npm install
```

### Run the game

```bash
npm run dev
```

Serves the playable western map (`index.html` → `game/playable-map.ts`):
third-person character with WASD movement, RMB mouse look, sprint/jump/
crouch, vitals (HP/SP), a continuous day/night cycle, object interaction
(E), an edit mode (TAB) with a transform gizmo whose changes persist
to localStorage, and a Creative Mode (F) — an independent Development
fly camera (WASD + Space up / Ctrl down / Shift fast, no gravity or
collision) that freezes the player in place and reconnects the normal
third-person camera on exit without teleporting anyone.

### Run the production build

```bash
npm run build
```

Produces a static esbuild bundle in `site/` deployable to Vercel (or any
static host). `vercel.json` is included so the repo auto-deploys on push.
`npm run build:lib` additionally emits the library build (`tsc` → `dist/`).

### Type-check the project

```bash
npm run typecheck
```

### Run the test suite

```bash
npm test
```

Compiles with `tsc` and runs Node's built-in test runner (`node:test`) on
the compiled output — no Jest/Vitest dependency.

---

## Public API

### `SceneStateManager`

```ts
const manager = new SceneStateManager({ renderer });

// Register
const def = manager.registerObject({
  assetType: 'wall',
  transform: { position: { x: 1, y: 2, z: 3 } },
  metadata: { name: 'North Wall' },
});
// → def.uuid is assigned by the manager; def is frozen.

// Update transform — the ONLY way to move an object
manager.updateObjectTransform(def.uuid, { position: { x: 5 } });

// Inspect
const snapshot = manager.getSnapshot();
// → { objectCount: 1, uuids: ['…'], byAssetType: { wall: 1 } }

const wall = manager.getObject(def.uuid);
const walls = manager.getObjectsByAssetType('wall');

// Remove
manager.unregisterObject(def.uuid);
```

### `PersistenceManager`

```ts
const persistence = new PersistenceManager();

// Export
const dump = persistence.exportSceneToJSON(manager);
const json = JSON.stringify(dump, null, 2);
// → write `json` to disk for cross-session restore

// Load — preserves uuid for every object
const summary = persistence.loadSceneFromJSON(parsed, manager);
// → summary.loaded === N, summary.skipped[] describes any bad entries
```

---

## Direct communication protocol (per directive)

When the AI agent communicates about asset placement from now on, it MUST:

1. **Reference the `uuid`** of the specific object being discussed.
2. **Before any modification**, report the **current state** of the target
   object by calling `manager.getObject(uuid)` and printing its JSON form.
3. **Only then** call `updateObjectTransform(uuid, patch)` (or whichever
   mutator applies).

Example transcript:

```
> Move the swing door 2 units north.

Agent: Target object uuid=00000000-0000-4000-a000-000000000006
       Current state:
         {
           "uuid": "00000000-0000-4000-a000-000000000006",
           "assetType": "door",
           "transform": {
             "position": { "x": 0, "y": 1.2, "z": -8 },
             "rotation": { "x": 0, "y": 0, "z": 0 },
             "scale": { "x": 1, "y": 1, "z": 1 }
           },
           "metadata": { "name": "Swing Door (front)" }
         }
       Applying patch: { "position": { "z": -6 } }
       Done. New transform:
         position = { "x": 0, "y": 1.2, "z": -6 }
```

---

## Why this design?

| Concern | Solution |
|---|---|
| **State loss on reload** | All object state lives in the registry, not in scene-graph nodes. `exportSceneToJSON` writes a portable dump that survives session boundaries. |
| **Ad-hoc mutation** | Definitions returned from `getObject()` are **frozen**; the only mutator is `updateObjectTransform` which validates + re-syncs the renderer in one call. |
| **uuid drift across sessions** | UUIDs are written verbatim into the JSON dump and re-read into the new registry. The original uuid is preserved. |
| **Engine lock-in** | The registry talks only to `IRendererAdapter`. Swapping three.js for Babylon or a headless test renderer requires zero changes to `SceneStateManager`. |
| **Re-render spam** | `dedupeRenders` (default on) makes no-op transform patches skip the renderer entirely. |
| **Corrupted scene files** | `loadSceneFromJSON` skips malformed entries instead of aborting the whole load, and reports them via `LoadSummary.skipped`. |

---

## License

MIT.
