# Architecture Report — Ai-western_game

> Status: **Foundation complete + playable Part 2.** The Part 1 foundation
> (state, persistence, events, assets, editor) is described in depth below.
> A third-person character demo (movement, camera, vitals, day/night) now
> runs on top of it in `game/playable-map.ts`. NPCs, weapons, missions and
> inventory remain intentionally absent.

> Note: sections 1–9 were written at the end of the Part 1 foundation phase
> and describe the core architecture, which is unchanged. File paths reflect
> the current layout (`persistence/` module, `game/` entry).

## 1. Current architecture

The codebase is split into five thin layers, each with a single
responsibility. Dependency direction is strictly **downward**:

```
┌─────────────────────────────────────────────────────────────────┐
│ game/ (playable app — only consumer of the foundation)         │
└──────────────┬──────────────────────────────────────────────────┘
               │ imports from src/index.ts (public barrel)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ src/core/        — state, persistence, events, transforms       │
│  ├─ SceneStateManager  (THE authoritative scene registry)       │
│  ├─ PersistenceManager (export/load + migration + atomic load)  │
│  ├─ EventBus           (typed lifecycle event emitter)         │
│  ├─ TransformOps       (identity, equals, clone, makeTransform) │
│  ├─ types.ts           (ObjectDefinition, SceneData, etc.)       │
│  ├─ validators.ts      (merge / validate Transform patches)    │
│  └─ clone.ts           (deepClone / deepFreeze)                 │
└──────────────┬──────────────────────────────────────────────────┘
               │ core talks to renderer through an INTERFACE only
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ src/engine/      — concrete renderer adapters                  │
│  ├─ IRendererAdapter        (interface)                          │
│  ├─ ThreeRendererAdapter    (three.js impl, uses AssetRegistry)  │
│  └─ HeadlessRendererAdapter (Node/test impl, audit log)         │
└──────────────┬──────────────────────────────────────────────────┘
               │ adapter consumes assets via the registry
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ src/assets/      — extensible asset factory registry           │
│  ├─ IAssetFactory           (interface)                         │
│  ├─ AssetRegistry           (assetType → factory map)            │
│  └─ PrimitiveAssetFactory   (cube only; replace switch)         │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ src/config · src/migrations · src/utils                          │
│  ├─ GameConfig       (singleton config: schema version, limits, │
│  │                    renderer defaults, debug flag, log level)  │
│  ├─ SceneMigrations  (MigrationRegistry: from→to migration fns) │
│  ├─ uuid.ts          (RFC 4122 v4 generator + validator)        │
│  └─ Logger.ts        (minimal leveled logger, scoped children)  │
└──────────────────────────────────────────────────────────────────┘
```

### Key invariants

- **SceneStateManager is the only authoritative source of object state.**
  The renderer never holds state — it is a downstream mirror.
- **THREE.js types do not leak into `src/core/`.** Persistence and
  event payloads are plain JSON-shaped data.
- **Asset creation never touches the state layer.** New asset types
  register a factory in `AssetRegistry` — zero edits to the state
  manager or the renderer adapter.
- **Renderer failures never corrupt the registry.** All renderer
  errors are caught by the state manager and logged; the registry
  stays consistent.
- **Object definitions returned to callers are frozen deep clones.**
  Direct mutation cannot corrupt the canonical registry entries.

## 2. Major modules

| Module | Purpose | Lines (approx) |
|---|---|---|
| `src/core/SceneStateManager.ts` | Authoritative scene registry, `registerObject` / `duplicateObject` / `updateObjectTransform` / `unregisterObject` / `clear`. Emits lifecycle events. | 280 |
| `src/persistence/PersistenceManager.ts` | `exportSceneToJSON` / `loadSceneFromJSON`. Atomic-by-default loading. Drives migrations. | 270 |
| `src/core/EventBus.ts` | Minimal typed event bus. `on`/`off`/`emit`/`clear`. Handler errors isolated. | 95 |
| `src/core/TransformOps.ts` | `IDENTITY_TRANSFORM`, `transformsEqual`, `cloneTransform`, `makeTransform`. Single source of truth for transform conventions. | 70 |
| `src/core/types.ts` | `ObjectDefinition`, `Transform`, `Vec3`, `AssetType`, `SceneData`. | 100 |
| `src/core/validators.ts` | `mergeVec3`, `mergeTransform`, `validateTransform`. Pure helpers. | 65 |
| `src/core/clone.ts` | `deepClone`, `deepFreeze` (uses `structuredClone`). | 35 |
| `src/engine/IRendererAdapter.ts` | `IRendererAdapter` interface + `RendererChange` discriminated union. | 40 |
| `src/engine/ThreeRendererAdapter.ts` | three.js adapter. Holds `Map<uuid, Object3D>`. Handles async asset loading with pending state queue. | 200 |
| `src/engine/HeadlessRendererAdapter.ts` | Test/Node adapter with audit log. | 50 |
| `src/assets/AssetRegistry.ts` | `register`/`unregister`/`create`. Throws on unregistered asset types (no silent placeholder). | 75 |
| `src/assets/PrimitiveAssetFactory.ts` | `CubeAssetFactory` (BoxGeometry 1×1×1) + `registerPrimitiveFactories()` helper. | 50 |
| `src/config/GameConfig.ts` | Singleton config with `getConfig` / `configure` / `resetConfig`. Deep-merge one level. | 90 |
| `src/migrations/SceneMigrations.ts` | `MigrationRegistry` with `register(from, to, fn)` and `migrate(data)`. Singleton bound to config schemaVersion. | 110 |
| `src/utils/uuid.ts` | `generateUUID` (crypto.randomUUID + polyfill), `isValidUUID`. | 50 |
| `src/utils/Logger.ts` | `Logger` class with `silent`/`error`/`warn`/`info`/`debug` levels. Scoped children. Default sink to console. | 80 |

## 3. Data flow

### Registration flow (single object)

```
caller
  │ manager.registerObject({ assetType, transform, metadata })
  ▼
SceneStateManager
  1. validate uuid (auto-generate if absent)
  2. check maxObjects ceiling (from getConfig().scene.maxObjects)
  3. deep-clone + freeze the definition
  4. registry.set(uuid, frozenDef)
  5. notifyRenderer({ kind: 'add', definition: frozenDef })
  6. events.emit('object:registered', { definition })
  7. logger.debug('object registered', { uuid, assetType })
  ▼
IRendererAdapter.syncObject({ kind: 'add', definition })
  ▼
ThreeRendererAdapter
  1. assetRegistry.create(definition)  // may be async
  2. applyTransform(mesh, definition.transform)
  3. meshes.set(uuid, mesh); scene.add(mesh)
  4. if a 'transform'/'metadata' event arrived mid-load,
     apply the queued state now
```

### Update flow

```
manager.updateObjectTransform(uuid, patch)
  → validate patch
  → mergeTransform(oldTransform, patch)
  → if dedupeRenders and transformsEqual(old, new): no-op return
  → registry.set(uuid, updated)
  → notifyRenderer({ kind: 'transform', uuid, transform })
  → events.emit('object:transform-updated', { uuid, transform, previous })
```

### Save flow

```
persistence.exportSceneToJSON(manager)
  → for each def in manager.getAllObjects():
       serialize to plain JSON object
  → assemble SceneData { version, exportedAt, objects, sceneMetadata }
  → manager.bus.emit('scene:exported', { count })
  → return SceneData
```

### Load flow (atomic by default)

```
persistence.loadSceneFromJSON(data, manager, { mode: 'atomic' | 'lenient' })
  1. validateEnvelope(data)            // version/objects[]/exportedAt
  2. if data.version !== schemaVersion:
       migrations.migrate(data)         // walks v1 → v2 → ... → current
  3. for each raw object in data.objects:
       deserializeDefinition(raw)       // throws on bad uuid/transform/metadata
       → push to temp list (ok | error)
       also detect duplicate uuids within the scene file
  4. if mode === 'atomic' && any errors:
       throw SceneLoadError(message, skipped[])
       registry is UNTOUCHED
  5. manager.clear()                    // single mutation point
  6. for each ok entry in temp:
       manager.registerObject(def)      // re-emits 'object:registered' + 'add'
  7. manager.bus.emit('scene:loaded', { loaded, skipped })
  8. return LoadSummary
```

## 4. Persistence format

```jsonc
{
  "version": 1,                                  // number, not literal
  "exportedAt": "2025-09-12T10:30:00.000Z",
  "sceneMetadata": {                             // optional
    "name": "...",
    "description": "...",
    // any other keys
  },
  "objects": [
    {
      "uuid": "00000000-0000-4000-a000-000000000001",  // RFC 4122 v4
      "assetType": "cube",                              // string
      "transform": {
        "position": { "x": 0, "y": 0, "z": 0 },        // scene units (meters)
        "rotation": { "x": 0, "y": 0, "z": 0 },        // Euler DEGREES, XYZ order
        "scale":    { "x": 1, "y": 1, "z": 1 }
      },
      "metadata": {
        "name": "Demo Cube",                           // required, non-empty
        // any other keys
      }
    }
  ]
}
```

### Transform convention (documented ONCE in `src/core/TransformOps.ts`)

- `position`: world-space XYZ in scene units (meters by convention).
- `rotation`: Euler angles in **degrees**. Order is **XYZ** (three.js
  default). Degrees chosen because scene JSON is human-authored.
  Radian conversion happens at the renderer adapter boundary.
- `scale`: multiplicative; `1` = original size.

### Versioning strategy

- `GameConfig.schemaVersion` is the current version (default: `1`).
- `MigrationRegistry` walks `from → to` steps. Each step MUST stamp
  the new `version` onto the data, or the migration fails loudly.
- `PersistenceManager.loadSceneFromJSON` automatically migrates older
  data before validation. Downgrades (newer-than-current) are
  rejected.
- The `SceneData.version` field is `number` (not a literal) so the
  type itself does not break when we bump the version.

## 5. Asset flow

```
AssetRegistry (assetType → IAssetFactory)
   ▲
   │ register('cube', CubeAssetFactory)
   │
   │ registerPrimitiveFactories(reg)  ← wires up the built-in primitives
   │
   ▼
ThreeRendererAdapter
  - holds the registry as a constructor dep
  - on 'add' change: registry.create(def) → THREE.Object3D | Promise<Object3D>
  - if Promise: queues pending transform/metadata; applies on resolve
  - if sync: applies immediately
```

**Why this design**:
- Adding a new asset type means writing an `IAssetFactory` and calling
  `register()` — no edits to the renderer or the state layer.
- Switch statement (the antipattern called out in directive §6) is
  gone. The only switch left is the renderer's per-`RendererChange`
  dispatch, which is inherent to the adapter pattern.
- The current `cube` factory is the **only** primitive wired up.
  Saloon-era primitives (`wall`, `chair`, `door`, etc.) were
  intentionally removed because they were western-world content. They
  should be re-added here when their game-world design is finalised.

## 6. Rendering flow

```
SceneStateManager (state) ─── RendererChange ───▶ IRendererAdapter ───▶ ThreeRendererAdapter
                                                       │                         │
                                                       │                         ▼
                                                       │              AssetRegistry.create()
                                                       │                         │
                                                       │                         ▼
                                                       │              THREE.Object3D
                                                       │                         │
                                                       ▼                         ▼
                                            HeadlessRendererAdapter     meshes: Map<uuid, Object3D>
                                            (test/Node — no Three)      scene.add(mesh)
```

**Failure isolation**:
- `SceneStateManager.notifyRenderer()` wraps `renderer.syncObject()` in
  try/catch. A throw inside the renderer is logged via `Logger.error`
  but does NOT abort the state mutation that triggered it.
- `AssetRegistry.create()` may return a `Promise` (for future GLTF
  loaders). The renderer adapter tracks in-flight loads in a
  `loading: Set<uuid>` and queues any `transform`/`metadata` changes
  that arrive before the mesh resolves. On resolve, the queued state
  is applied — so order is preserved.

## 7. Intentionally NOT implemented yet

This is what is **deliberately absent** to avoid overengineering:

| Concern | Status | Why |
|---|---|---|
| Player controller | ✗ | No gameplay yet (directive §16). |
| Western world content (saloon, NPCs, weapons, missions, inventory, vehicles) | ✗ | Foundation phase only. |
| GLTF/GLB asset loader | ✗ | The `IAssetFactory` interface is async-ready, but no concrete loader exists yet. Add when art pipeline is decided. |
| Texture/material/animation systems | ✗ | Same — `IAssetFactory` can return any `THREE.Object3D`; textures/materials slot into factories when needed. |
| Camera controller / input | ✗ | Demo uses a fixed camera; gameplay will own this. |
| Spatial partitioning (BVH, octree, frustum culling) | ✗ | Premature. Scene size is tiny. Re-evaluate when object count approaches 10k. |
| Multi-scene composition | ✗ | Single `SceneStateManager` instance per scene. If multiple scenes are needed later, compose multiple managers — the API does not need to change. |
| Networking / multiplayer replication | ✗ | Out of scope. |
| Save-game UI / file picker | ✗ | Persistence layer returns plain objects; UI is a future consumer. |
| Asset dependency injection container / plugin system | ✗ | One process-wide `AssetRegistry`, `EventBus`, `Logger`, `getConfig()` singleton each. No DI framework. |
| Async event queue / RxJS-style observables | ✗ | Synchronous dispatch is enough for current scale. |
| Quaternion rotation representation | ✗ | Euler degrees is enough. Documented convention; can revisit when a gameplay system genuinely needs quaternion interpolation (e.g. skeletal animation). |

## 8. Known limitations

1. **`getAllObjects()` clones every object** — `O(n)` memory per call.
   Fine for thousands of objects; will need an iterator API for tens of
   thousands.
2. **Event dispatch is synchronous** — a slow handler will block the
   state mutation that triggered the event. Fine for now; an async
   queue can be added if profiling demands it.
3. **Asset loading is async, but `syncObject` itself is sync** — the
   adapter queues pending state per-uuid while a mesh loads. If many
   objects load at once, the queue grows unbounded in the worst case.
   Cap or batch later if it becomes a real problem.
4. **No hot-reload of asset factories at runtime.** `register()` is
   expected to happen during boot. Replacing a factory mid-scene is
   not supported.
5. **No transactional save.** `exportSceneToJSON` produces an object;
   the caller is responsible for writing it atomically (write-to-temp
   then rename).
6. **Logger has no transports** — only a single global sink (console by
   default). When structured logging to a server becomes a need,
   replace the sink.
7. **Migration chain is linear** — `from → to` steps must form a
   monotonic chain. Branching migrations (e.g. "v2 → v3a OR v3b")
   are not supported. Probably never needed.
8. **`THREE.MathUtils.degToRad` is called in the renderer adapter** —
   that's the only Three.js-specific transform knowledge. Acceptable.

## 9. Recommended next foundation step

The foundation is feature-complete for the architecture-validation
phase. The smallest high-leverage addition that is **still foundation,
not gameplay** is:

> **An integration test for the full save → reload → re-export
> pipeline that proves byte-for-byte stability of the exported
> `SceneData` round-trip across manager instances.**

Rationale:
- All the pieces (uuid, atomic load, migrations, transform
  convention) are in place, but they have only been tested in
  isolation.
- A single end-to-end test (build a registry → export → reload into a
  fresh manager → re-export → assert deep equality of the two dumps)
  would lock in the contract that **future schema changes cannot
  silently corrupt round-tripped data**.
- It is a foundation concern, not a gameplay concern — it adds zero
  gameplay surface and ~30 lines of test code.

After that, the next foundation-quality step would be a **CI workflow**
(`.github/workflows/ci.yml`) running `npm run typecheck && npm run
build && npm test` on every push and PR — purely to prevent
regressions, no game code required.

Only after these are green should we start layering gameplay systems
on top.

## 10. Verification summary

```
$ npm run typecheck  # tsc --noEmit         → clean, no output
$ npm run build      # esbuild → site/      → bundle emitted, 0 errors
$ npm test           # node --test          → 254/254 pass
```

The playable game (`index.html` + `game/playable-map.ts`) consumes the
foundation through the public barrel `src/index.ts`: it boots the scene
manager, the renderer adapter, the collision world, the character systems
and the day/night cycle, then wires input (keyboard + RMB mouse look),
the editor (TAB + gizmo) and localStorage persistence (`LocalSceneStorage`).
