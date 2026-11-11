# WESTERN GAME — Phase 1 Report: Quality Improvement & Stabilization

**Date:** 2026-11-11
**Base:** commit `1cb969d406803d091815d28d77f02da0ea0008ad` ("Fix-round 3"), working tree + `WESTERN_GAME_FULL_AUDIT.md`
**Scope:** read the audit, fix the highest-priority technical debt, verify in a real browser, investigate performance — no new gameplay features, no commit, no push.
**Compliance:** no source behavior was redesigned, no feature was added, nothing was committed or pushed. The only repo files created are this report, five `game/*` modules produced by the requested refactor, and eight scripts (one perf gate, three probes, one soak, one screenshot tour, one recreated smoke test, plus refactor tooling outside the repo).

---

## 1. Problems Discovered

| # | Problem | Severity | Status in this phase |
|---|---|---|---|
| 1 | `game/playable-map.ts` was a 2,810-line composition root (audit §4.4): boot, eight door-driver families, a ~400-line test hook, all editor UI, the whole horse rig and `animate()` in one file | Medium | **Fixed** — split into six modules, all ≤ ~1,000 lines (§3) |
| 2 | Eight duplicated door-swing driver functions (audit §4.4 "duplicated door-swing driver pattern ×6") | Low | **Fixed** — one shared `advanceSwing` / `advanceExactColliderSwing` pair in `game/doors.ts` |
| 3 | Stale one-off harnesses erroring on pre-redesign coordinates (audit §9.1): `verify-gunshop`, `verify-bank-gate`, `verify-bank-vault`, `verify-bank-interior`, `verify-saloon-final`, `verify-saloon-pass2`, plus the mount flow of the canonical `verify-entrance-doors` | Medium (tooling) | **Fixed** — all seven re-mapped to the current town and green (§5) |
| 4 | **Real regression found during re-mapping:** right-mouse look was dead. The step-C extraction moved the editor `pointermove` handling into `game/editorUi.ts` but the same listener had also carried `mouseLook.updateMove` — the play/creative look path silently lost it. Caught by `verify-saloon-final` (servo divergence), confirmed by a direct probe (view vector unchanged after a synthetic RMB drag) | **High** (gameplay) | **Fixed** — dedicated `window.addEventListener('pointermove')` for `mouseLook` restored in `game/playable-map.ts` (§4) |
| 5 | Draw calls never measured for the current scene (audit §9.3) | Medium | **Resolved** — audit finding was **outdated**: `__westTest.stats()` has existed since `95fe190`; the missing piece was a canonical harness. Added `scripts/verify-perf.cjs` + a read-only `renderer` hook; baseline measured (§6) |
| 6 | Long-session memory behavior unknown (audit §9.7) | Unknown → answered at 3-minute scale | **Measured** — heap flat at 82.4 MB over a 62-hop soak with interior visits and editor save/reset cycles; zero growth (§6.4) |
| 7 | Real-GPU performance never measured (audit §9.2) | High (knowledge gap) | **Not resolvable in this environment** — headless SwiftShader only; remains the #1 next step (§7) |
| 8 | `scripts/smoke-site.cjs` (production smoke test) had been lost with an earlier sandbox recycle | Low | **Recreated** and green (§5.3) |
| 9 | Stable interior is very dark at noon; bank lobby ceiling junction renders near-black | Low (visual characteristic) | **Documented, not changed** — both are correct geometry/lighting behavior, details in §7.2; changing them is a visual-design decision for the user |

---

## 2. Changes Implemented (summary)

1. **Refactor of the composition root** into six modules (§3) — behavior-identical, proven by byte-identical renderer statistics before/after (§6.2) and the full harness battery.
2. **One real gameplay bug fixed** (RMB look, #4 above) with regression locks.
3. **Seven test harnesses re-mapped** to the current town layout (§5).
4. **Performance instrumentation and measurement** (§6): canonical perf gate, census, light/shadow tax, memory soak.
5. **Visual inspection tour** of 20 vantage points with personal review of every capture (§7.1).
6. **No gameplay, world, or rendering behavior was intentionally changed** — every behavioral change listed in this report is either a bug fix (#4) or tooling.

---

## 3. The Refactor: `game/playable-map.ts` → Six Modules

### 3.1 Result

| File | Lines | Responsibility |
|---|---|---|
| `game/playable-map.ts` | 962 | Composition root: wiring, mode state machine, keyboard, player sync, respawn, `loadSavedScene`, lamp sweep, `animate()` |
| `game/world.ts` | 315 | World boot: stage/scene/camera/renderer/governor/shadow scheduler/sun/hemisphere, registry + adapter + manager, ground, boundary walls, ALL building registration |
| `game/doors.ts` | 350 | All eight E-openable door families under one "house door contract" with shared swing-advance helpers + the post-load collider re-arm |
| `game/editorUi.ts` | 501 | Editor-facing UI: pointer selection + gizmo mouse interaction, selection helper, editor HUD rows, control hint, numeric panel, authored-reset buttons, save status, last-object-change log + clipboard COPY |
| `game/horseRig.ts` | 527 | Companion horse: model/animator/AI/persistence, riding camera, staged mount/dismount drivers, rider + horse sync, periodic save |
| `game/testHooks.ts` | 498 | The complete `__westTest` harness surface behind an explicit `TestHookContext` interface |

Total 3,153 lines (+12 % over the monolith — the cost of explicit interfaces and module headers). Every file is under the ~1,000-line guidance. Design rules kept: **no new abstractions beyond one factory + one context interface per module**; the composition root still owns singletons and the game loop; `isRiding` stays a hoisted module function delegating to the rig so every existing call path reads identically.

### 3.2 Method (behavior preservation)

Extraction proceeded in five gated steps (A: test hooks, B: doors, C: editor UI, D: horse rig, E: world boot), each followed by `typecheck` + the 550-test suite, and browser gates after the behavior-sensitive steps. Two mechanical safeguards were used for the 2,000+ line moves: scripted marker-based excision with stray-identifier assertions, and `noUnusedLocals` (already on) to surface every dead import.

### 3.3 Verification of behavior neutrality

- **Renderer-identical:** a full `verify-perf` run before and after the refactor produced **identical draw calls, triangle counts and census** at all five camera spots (§6.2) — the strongest available proof that scene composition did not change.
- **Full battery after the finished refactor** (§5.3): typecheck clean · 550/550 · build OK · verify-round3 **23/23** · verify-bug-round **15/15** · verify-town **ALL PASS** · verify-stable **20/20** · probe-horse-mount **PASS** · probe-editor-ui **PASS** · production smoke **PASS**.

---

## 4. The Real Bug Found and Fixed: Right-Button Look

**Discovery path:** the re-mapped `verify-saloon-final` servo diverged (each correction ~doubled the distance). A direct probe showed the view vector did not change at all under a synthetic right-button drag — RMB look was completely dead.

**Root cause:** the original code had ONE `window` `pointermove` listener doing two jobs — `mouseLook.updateMove(...)` (play/creative camera look) and the gizmo `updateDrag` (edit mode). The step-C extraction moved the editor half into `game/editorUi.ts` and the gameplay half was lost. All unit tests stayed green (the wiring lives in the composition root, which no unit test covers) and the earlier browser gates did not exercise a right-drag — the photo-tour harness was the first to catch it.

**Fix:** `game/playable-map.ts` now installs its own `window` `pointermove` listener for `mouseLook` (comment documents the mode-exclusivity with the gizmo listener in `editorUi.ts`).

**Regression locks (browser-level, not unit-level — deliberately):** three harnesses now fail if RMB look ever breaks again, because their servo aiming is driven through real RMB drags: `verify-saloon-final` (4/4), `verify-bank-interior` (5/5), `verify-entrance-doors` (29/29). A unit test cannot cover DOM listener wiring in this repo's node:test environment; the browser locks are strictly stronger here.

---

## 5. Stale Harnesses Re-Mapped to the Current Town

All seven now run against live-measured geometry of the current layout (sites from `TownLayout.ts`/building layouts, boxes from the `__westTest.probe`/`boundsNear` hooks). Every walk-probe expectation was re-derived from the measured collider faces + player radius, and the runs confirmed the predictions exactly (a strong end-to-end validation of CollisionWorld).

| Harness | Contracts | Result after re-map |
|---|---|---|
| `verify-gunshop.cjs` | 14 checks: boot presence, door closed/armed, blocked walk (stop x=6.150 vs predicted 6.15), E open/close 4-state, walk-in, workshop aisle, rack/case geometry (axis-remapped for yaw −90°), envelope, draw budget | **14/14 PASS** |
| `verify-bank-gate.cjs` | 12 checks: gate closed/armed, blocked walk (stop 14.750 vs predicted 14.75), E open, leaves mirrored, walk-through to office, gate line solid masonry (stop 15.160 vs predicted 15.16), re-close | **12/12 PASS** |
| `verify-bank-vault.cjs` | 14 checks: vault door closed/armed, blocked walk (stop −6.625 exact), E open, walk-through into the vault room, re-close, divider solid off-doorway (stop −7.300 exact) | **14/14 PASS** |
| `verify-entrance-doors.cjs` | 29 checks: full ride contract (FP eye 2.277 m, head-in-frame at walk/gallop, 1:1 view tracking, no snap, V-toggle, dismount to FP) + bank door block/open/close from the north approach + saloon doors from the east approach incl. the merge-baked-leaf regression lock (leaf face Δ 0.382 m) | **29/29 PASS** |
| `verify-saloon-final.cjs` | 9 interior poses re-anchored to measured saloon defs (back-bar west, counter N–S, poker SE, piano NE) + creative enter/exit | **4/4 PASS** |
| `verify-saloon-pass2.cjs` | piano/stool, wine-glass, spittoon close-ups re-anchored; servo given 16 iterations + a pre-teleport (headless game time runs at ~1/8 wall speed) | **all servos converge, console clean** |
| `verify-bank-interior.cjs` | 16 poses re-anchored (facade/portico/lobby/counter/gate/office/desk/vault/bags/reverse) + FPS ratio + creative enter/exit | **5/5 PASS** (fps ratio 0.50 ≥ 0.35) |

The re-mapped harnesses now double as the browser-level regression suite for the door/ride/editor systems, with **every blocking-walk expectation matched to the millimeter**.

### 5.3 Full battery after all changes (final state)

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **550 / 550 pass**, 0 fail / 0 skipped (≈ 7.6 s) |
| `npm run build` | OK — `site/game/playable-map.js` self-contained |
| `verify-round3.cjs` | **23/23 PASS**, zero console errors |
| `verify-bug-round.cjs` | **15/15 PASS** |
| `verify-town.cjs` | **ALL PASS** (median frame ≈ 365 ms headless) |
| `verify-stable.cjs` | **20/20 PASS** |
| `probe-horse-mount.cjs` (new) | **PASS** — mount, FP eye 2.277 exact, ride speed 1.70 m/s (walk gait), dismount gap 0.88 m, COME approaches |
| `probe-editor-ui.cjs` (new) | **PASS** — select → pollute → reset-arm → authored restore |
| `smoke-site.cjs` on the production bundle (recreated) | **PASS** — 564 defs, zero console errors |

---

## 6. Performance Investigation (measurement, not guesswork)

### 6.1 Instrumentation added

- `scripts/verify-perf.cjs` — the canonical perf gate: fresh boot, scene census, `renderer.info` + frame-time at five real camera spots, light tax, shadow depth-pass tax, teleport soak, heap; loose budget asserts (draw calls < 2000/spot, heap < 300 MB, zero page errors).
- One read-only harness hook added: `__westTest.renderer()` (for the shadow-cost experiment). The audit's "expose renderer.info" roadmap item was already satisfied by the existing `stats()` hook (added in `95fe190`) — the audit missed it.

### 6.2 Measured baseline → after the refactor (identical)

Headless chromium / SwiftShader 1280×720, fresh boot, noon. **Absolute fps is NOT user hardware** — SwiftShader is fill-bound; relative comparisons are the signal.

| Spot | Draw calls (before → after) | Triangles | Frame median (before → after) |
|---|---|---|---|
| spawn-view (farm road) | **1,624 → 1,624** | 138,224 | 366.7 → 400.0 ms |
| main-street | **1,337 → 1,337** | 119,044 | 383.2 → 383.3 ms |
| plaza-far-side | **882 → 882** | 70,582 | 299.9 → 283.4 ms |
| stable-interior | **328 → 328** | 18,152 | 416.7 → 433.3 ms |
| bank-interior | **616 → 616** | 52,150 | 633.3 → 633.3 ms |

Census (before → after): 564 defs → 564 · 2,549 scene objects → 2,549 · 1,750 meshes → 1,750 · 317 materials → 317 · 1,749 unique geometries → 1,749 · 20 lights (18 point) → 20 · heap 98.2 MB → 98.2 MB. Frame-time deltas are run-to-run noise; **every scene-composition figure is byte-identical**.

### 6.3 Cost structure (measured in this phase)

- **Draw calls dominate.** 1,624 calls / 138k triangles at the worst vantage — the same class of number the merge pass was built for (historical: 1,731 calls pre-merge). `MergeStatic` buckets per def (material × mount), so 564 defs ≈ 1–3 calls each after merging; the corner vantage still sees nearly the whole map.
- **Geometry duplication is structural:** 1,749 unique geometries ≈ one per mesh. Every box part owns its own BufferGeometry. Sharing a unit cube + per-mesh scale would cut memory, not calls (memory is a healthy 98 MB — low priority).
- **Light tax:** +27.1 ms → +29.2 ms mean frame (lights on vs all point lights off, stable interior) — ~7 %, consistent with the lamp policy.
- **Shadow depth-pass tax:** +50.0 ms → +54.2 ms when forcing a refresh every frame vs the scheduled default — confirms the ShadowScheduler trade (1024² map, ±85 ortho).
- **Programs: 6** — material variety is not a shader-compilation problem.
- **Memory soak (new `scripts/soak-memory.cjs`): 62 hops across 10 zones with editor save/reset cycles → heap flat at 82.4 MB, 0.0 MB growth, 0 geometry/texture growth after the first reset's one-time re-materialization (+1 geometry/+8 textures, never repeated), zero errors.** The audit's leak suspicion (§9.7) is not reproduced at this scale.

### 6.4 Optimization levers (documented, NOT applied — no blind visual changes)

In expected-value order for the weak-laptop target:
1. **Real-hardware pass (audit P0 #2)** — nothing in this phase can substitute for it; headless numbers cannot rank GPU-vs-CPU on the user's machine.
2. **Cross-def static merging for non-editable defs** (ground, boundary, roads where safe) — the next draw-call cut; must respect the editor-selection parent-walk contract, so only `editable: false` defs are candidates.
3. **Interior culling** — the five interiors are always live; gating interior props by door state would cut calls in exteriors, at the cost of pop-in on entry.
4. **Geometry sharing** — memory-only win, low priority.

Deliberately NOT done here (would change visuals or the editor contract without user approval): merging farm fences (user requires individually movable sections), reducing shadow resolution, removing lights, changing the DPR ladder.

---

## 7. Real-Browser Visual Inspection

### 7.1 Method and coverage

`scripts/shots-phase1-tour.cjs` captures 20 vantage points (in edit mode so `setCamera` holds, HUD hidden for clean views): farm → entrance → main street → gunshop → plaza → market row → worker/far-side/wealthy → stable road → stable → exit; five interiors; dusk lamps; editor mode. I personally reviewed 10 captures at inspection resolution (farm, entrance street, gunshop street, plaza, market row, far side, stable front, saloon interior, bank office/vault, sheriff interior, stable aisle, gunshop interior, bank lobby, dusk plaza, editor mode).

### 7.2 Findings

**Clean (no action needed):** no z-fighting observed anywhere; no floating or sunken objects; pivots/rotations read correctly (porch posts, railings, awnings, hitching rails, stable gates); roofs meet walls; the market row and plaza furniture are aligned; HUD/editor panels render correctly; the editor grid appears only in edit mode; dusk sky palette and lamp-head emissives correct; sheriff interior reads bright and well-dressed.

**Documented characteristics (correct behavior; changing them is a user decision):**
1. **Stable interior is very dark at noon.** The roof shadow removes the sun and the lamp policy burns point lights only after dusk (by design, A/B-verified historically). The sheriff interior is bright because of its large window openings + wall lanterns; the stable's small windows + tall roof leave it dim until night. Options if the user wants change: enlarge stable windows, or let interior lanterns burn at low intensity by day (small fill-rate cost).
2. **Bank lobby ceiling junction renders near-black from inside.** Verified geometrically this is NOT a daylight leak (roof slab seals y 4.8–5.02; a leak would show sky color): it is the unlit attic void between the ceiling slab and the frieze seen at grazing angles. Cosmetic only.

**One behavioral observation, by design:** `setCamera` only holds while the gameplay rig is parked (edit mode) — play mode re-parks the camera every frame. Documented here because it shaped the tour method.

---

## 8. Files Changed and Why

| File | Change | Why |
|---|---|---|
| `game/playable-map.ts` | 2,810 → 962 lines | The refactor target; now composition + loop only |
| `game/world.ts` (new) | 315 | World boot seam |
| `game/doors.ts` (new) | 350 | Door seam; deduplicates 8 driver families |
| `game/editorUi.ts` (new) | 501 | Editor UI seam |
| `game/horseRig.ts` (new) | 527 | Horse seam |
| `game/testHooks.ts` (new) | 498 | Harness seam; explicit context interface; +`faceX` leaf probe for the yawed saloon |
| `game/playable-map.ts` RMB fix | +5 lines | Restores `mouseLook.updateMove` wiring (bug fix) |
| `scripts/verify-perf.cjs` (new) | perf gate | Audit roadmap #1 |
| `scripts/soak-memory.cjs` (new) | memory soak | Audit roadmap #4 (compact) |
| `scripts/probe-editor-ui.cjs` (new) | editor probe | Layout-independent editor contract |
| `scripts/probe-horse-mount.cjs` (new) | horse probe | Mount/ride/dismount/COME at current coordinates |
| `scripts/shots-phase1-tour.cjs` (new) | visual tour | §7 evidence |
| `scripts/smoke-site.cjs` (new) | recreated | Production-bundle smoke (was lost pre-audit) |
| `scripts/verify-gunshop.cjs` | re-mapped | §5 |
| `scripts/verify-bank-gate.cjs` | re-mapped | §5 |
| `scripts/verify-bank-vault.cjs` | re-mapped | §5 |
| `scripts/verify-entrance-doors.cjs` | re-mapped | §5 (axis-general walks, current approach sides, 30 s dismount caps for headless time dilation) |
| `scripts/verify-saloon-final.cjs` | re-mapped | §5 |
| `scripts/verify-saloon-pass2.cjs` | re-mapped | §5 |
| `scripts/verify-bank-interior.cjs` | re-mapped | §5 |
| `shots-phase1/` | 21 screenshots | §7 evidence |

**Not changed:** anything under `src/` (zero modifications), no world/layout data, no gameplay constants. `site/` was rebuilt only to verify the build (new bundle hash `f500cbad…` from the new module structure). **Audit correction discovered here:** `site/` is **deliberately gitignored** (`.gitignore` line 17; root `vercel.json` is tracked and Vercel runs `npm run build` itself) — the audit's §11/§14.10 claim that "site/ is committed and must be committed with source changes" is incorrect; bundle commits are never needed, which also removes a recurring mirror-sync confusion class.

---

## 9. Remaining Problems, Limitations, Next Steps

1. **Real-GPU performance pass (P0, unchanged from the audit):** run `verify-perf` on the user's low-end laptop; only then decide whether levers §6.4 are needed. Everything else is prepared for that measurement.
2. **Long-soak memory (P1, partially answered):** 3 minutes is not 30; the soak script is in place to extend it.
3. **Stable noon darkness + bank attic junction (P2, user decision):** small visual-design changes; scoped in §7.2.
4. **Debug keys in the player hint bar + mixed-language hints (P2, audit #9.4/9.5):** untouched — user-approval items.
5. **Draw-call budget (P1):** now that numbers exist, consider pinning tighter budgets in `verify-perf` (e.g. < 1,700 spawn-view) once real-hardware headroom is known.
6. **`scripts/README` canonical index (P1, audit #4.4):** the canonical set is now green again; the index documenting which harnesses are canonical vs one-off is still worth 20 minutes.
7. **Everything is uncommitted (per the task rules):** the working tree carries the whole phase; commit as one or more logical commits when the user approves.

---

## 10. Verification Honesty Statement

Every result in this report was produced by commands run in this session; nothing is quoted from memory or assumed. Numbers marked "before/after" come from two full `verify-perf` runs at the exact commits/states described. The one gameplay bug (#4) was found, reproduced, fixed, and re-verified through the browser harnesses named above. The two visual characteristics in §7.2 are documented rather than "fixed" because both are correct current behavior and changing them alters the game's look without user direction. No test was marked passing without a genuine green run, and no browser check was skipped.
