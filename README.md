# Horizon Libraries — the library ecosystem (implementation)

## Structure

```text
CoreKit/             base utilities + item identity + engine feature detection
EventBus/            event emitter with error isolation and scopes
TickScheduler/       deterministic tick-based scheduling
StorageCore/         storage aggregation, transactions, transfer math
TopologyCore/        generic block-adjacency network topology
MpCore/              multiplayer toolkit (per-player state, screens, guards)
UiCore/              pagination, swipe, search, slot pools, darken, delta sync
SaveCore/            versioned persistence with migration and validation
DebugCore/           channels, ring buffer, counters, profiling
RecipeIndex/         recipe discovery, inverse index, dedup, search
CompatCore/          cross-mod discovery + shared energy types
CraftTreePlanner/    host-neutral crafting planner (plan only; no host policy)
CraftTreeExecutor/   crafting task model + tick scheduler (plan supplied by host)
EnergyMeter/         usage aggregation, budgets, UI scaling over EnergyNet
Adapters/            cross-mod storage adapters over StorageCore
RecipeViewerAdapter/ expose workbench recipes to the RecipeViewer mod
ContainerSync/       client↔server inventory↔storage transfer protocol
```

## Dependencies (the real graph, no cycles)

Each dependency is **declared in the `LIBRARY` header and `IMPORT`ed inside the library**
(`IMPORT("X:1")` after the header — the official ModBrowser.Query←Connectivity pattern: without an
internal IMPORT, `typeof X != "undefined"` is false in production, because each compilation unit has
its own scope).

```text
CoreKit             ← zero dependencies
EventBus            ← zero dependencies
TickScheduler       ← zero dependencies
StorageCore         ← CoreKit:2
TopologyCore        ← CoreKit:2 + EventBus:2 + TickScheduler:2
MpCore              ← TickScheduler:2
UiCore              ← zero dependencies
SaveCore            ← zero dependencies
DebugCore           ← zero dependencies
RecipeIndex         ← CoreKit:2
CompatCore          ← zero dependencies
CraftTreePlanner    ← zero dependencies
CraftTreeExecutor   ← CoreKit:2
EnergyMeter         ← zero dependencies
Adapters            ← CoreKit:2
RecipeViewerAdapter ← zero dependencies (RecipeViewer via ModAPI.addAPICallback, feature-detected)
ContainerSync       ← CoreKit:2 (the host supplies push/remove in the RS shape; a StorageCore view satisfies it)
```

## Design and compatibility

- Strict ES5 for Rhino 1.7.7, using the CoreEngine `LIBRARY`/`IMPORT`/`EXPORT` model.
- Dependencies are declared in `LIBRARY` headers and imported internally.
- No game threads for cadence logic; timers go through `TickScheduler`.
- Additive only: no gameplay, save-format, or UI-coordinate changes.
- Each library includes API documentation and TypeScript declarations.
