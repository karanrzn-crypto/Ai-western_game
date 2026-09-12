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
│   - unregisterObject(uuid)     → removes from both          │
│   - updateObjectTransform(u,t) → mutates transform, re-syncs │
│   - updateObjectMetadata(u,m)                                │
│   - getObject / getSnapshot / getAllObjects                 │
│   - getObjectsByAssetType                                    │
│                                                              │
└───────────────┬──────────────────────────┬──────────────────┘
                │ dispatch RendererChange   │ uses for export/load
                ▼                            ▼
   ┌────────────────────────┐   ┌──────────────────────────────┐
   │  IRendererAdapter      │   │  PersistenceManager          │
   │  - syncObject(change)  │   │  - exportSceneToJSON()       │
   │  - getActiveObjectCount│   │  - loadSceneFromJSON(data)   │
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
└──────────────────┘   └────────────────────────┘
```

### File layout

```
src/
├── core/
│   ├── types.ts                  ← ObjectDefinition / Transform / AssetType / SceneData
│   ├── SceneStateManager.ts      ← THE registry + update API
│   ├── PersistenceManager.ts     ← exportSceneToJSON / loadSceneFromJSON
│   ├── validators.ts             ← merge & validate Transform patches
│   └── clone.ts                  ← deep-clone / deep-freeze helpers
├── engine/
│   ├── IRendererAdapter.ts       ← interface every renderer must satisfy
│   ├── ThreeRendererAdapter.ts   ← concrete three.js implementation
│   └── HeadlessRendererAdapter.ts← test/Node-only implementation
├── utils/
│   └── uuid.ts                   ← generateUUID / isValidUUID (cross-session stable)
└── index.ts                      ← public barrel

index.html                       ← Vite entry (project root)
demo/                             ← minimal demo entry (main.ts)
examples/                         ← minimal-scene.json (1-cube validation fixture)
tests/                            ← node:test tests (no external deps)
vercel.json                       ← Vercel deployment config (Vite framework)
```

> **Status:** This repo contains ONLY the architecture foundation and a
> minimal validation demo. There is intentionally NO gameplay, NO player
> controller, NO NPCs, NO weapons, NO missions, and NO western world
> content. The single demo exists solely to prove the foundation runs.

---

## The canonical object schema

Every object stored in the registry — and every object written to a scene
JSON file — conforms to **exactly** this shape:

```jsonc
{
  "uuid": "00000000-0000-4000-a000-000000000001",  // RFC 4122 v4
  "assetType": "wall",                              // wall | chair | prop | ...
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

### Run the architecture validation demo

```bash
npm run dev
```

Opens a Vite-served page that:
- sets up a minimal three.js scene (one camera, one light, no world),
- registers **one** cube via `SceneStateManager.registerObject()`,
- runs the full round-trip automatically and on button click:
  1. `registerObject(cube)` → cube appears in the three.js scene
  2. `ThreeRendererAdapter` mirrors the cube to a mesh
  3. `exportSceneToJSON()` → JSON dump shown in the side panel
  4. `manager.clear()` → cube removed from both registry and renderer
  5. `loadSceneFromJSON()` → cube restored with the **same uuid**
- finally loads `examples/minimal-scene.json` to prove the on-disk file is
  interchangeable with the in-memory dump.

### Run the production build

```bash
npm run build
```

Produces a static Vite bundle in `dist/` deployable to Vercel (or any
static host). `vercel.json` is included so the repo auto-deploys on push.

### Type-check the project

```bash
npm run typecheck
```

### Run the test suite

```bash
npm test
```

Uses Node's built-in test runner (`node:test`) via `tsx` for TypeScript
support — no Jest/Vitest dependency.

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
