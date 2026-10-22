# TopologyCore

- **LIBRARY**: `TopologyCore`, v2, `shared: true`, api CoreEngine
- **Dependencies**: CoreKit:2, EventBus:2, TickScheduler:2 (declared + IMPORT in-library)

## Purpose

Generic block-adjacency network topology — the one system that exists today in **5 independent implementations**, 4 of them with documented hazards (quadratic BFS, global rebuilds, missing chunk guards, scan caps). All the expensive lessons are built in:

| Feature | Behavior |
|---------|----------|
| Iterative DFS with visited hash + controller hint cache + incomplete marking | Finds the controller of a component without quadratic traversal |
| Flood assign from controller | Fills a component from its controller |
| Chunk discard/load handling + 10-tick rebuild debounce with re-arm | Rebuilds only once things settle |
| Per-tick BlockChanged dedup | Two different transitions at the same coords in one tick are both processed |
| Chunk-loaded safety | Uses CoreKit.Engine.safeIsChunkLoadedAt |
| Join/leave/create/destroy events | Emitted through the bus |

**Deliberately NOT included**: tile.data writes, network storage, tile lookup — the host wires these via `onEvent`/`onRebuildNeeded` (that's what makes it work for cable nets, machine nets and drawer scans alike).

## API

```js
var graph = TopologyCore.createGraph({
    isNode: function (id, data) { ... },          // cable/machine
    isController: function (id, data) { ... },    // roots a component
    getConnectedSides: function (id, data) { ... },  // optional (default: all 6)
    onRebuildNeeded: function (component, key) { ... },
    onEvent: function (event, data) { ... }
});

graph.on("nodeAdded" | "nodeRemoved" | "componentCreated" | "componentDestroyed" |
         "markedIncomplete" | "markedComplete" | "boundaryController", fn);

graph.searchController(coords, dim, out, options) → coords | null   // DFS + hint cache
graph.floodAssign(controllerCoords, dim, out) → componentKey     // out = diff optional
graph.component(controllerCoords, dim) → snapshot          // fresh copy
graph.componentOf(coords, dim) → componentKey | null
graph.notifyBlockChanged(coords, oldId, newId, dim)        // per-tick dedup
graph.markChunkUnloaded(chunkX, chunkZ, dim)
graph.markChunkLoaded(chunkX, chunkZ, dim)                 // schedules rebuild
graph.markComponentIncomplete(controllerCoords, dim, reason) // host-detected gap
graph.markComplete(controllerCoords, dim)                  // host: rebuild done
graph.removeComponent(controllerCoords, dim)               // controller destroyed
graph.reset()                                              // LevelLeft
graph.destroy()
```

### Extensions E1/E2/E4/E6 (for a host)

| Ext. | API | Semantics |
|------|-----|-----------|
| E1 | `floodAssign(coords, dim, out)` | `out = { added:[{x,y,z}], removed:[{x,y,z}], incomplete }` — DIFF against the component's previous membership (the host applies it incrementally instead of re-reading everything) |
| E2 | `config.onBoundaryController(componentKey, controllerCoords, dim)` + bus event `boundaryController` | a second controller encountered during a flood = BOUNDARY; deduped per flood; NOT absorbed — the host decides the policy (an RS-style host destroys it) |
| E4 | `markComponentIncomplete(coords, dim, reason?)` | marks a SPECIFIC component incomplete (a gap detected by the host); emits `markedIncomplete` only on the false→true transition; returns bool |
| E6 | `searchController(coords, dim, out, {includeSelf:false})` | no longer returns self even if it is a controller; the DFS still explores from it → a controller finds its BOUNDARY controller (bridge detection) |

## Proven semantics preserved

- **Hint cache**: `coords.hint` short-circuits the DFS when it points at a live controller; hint `(0,0,0)` is the "no hint" sentinel.
- **Incomplete marking**: an unloaded chunk during traversal marks the component `incomplete` instead of detaching it (the alternative was false network splits).
- **Rebuild**: `markChunkLoaded` → 10-tick debounced rebuild; re-armed while any component stays incomplete; the host does the tile-level work in `onRebuildNeeded`. The rebuild interval task is cancelled once nothing is incomplete (never accumulates).
- **Block changes**: deduped per tick — two DIFFERENT transitions at the same coords in one tick are both processed (keyed per transition); controller placed → auto flood; controller destroyed → component removed; node removed → re-joins via neighbors.

## Deliberate reductions vs a full RS implementation (host's responsibility)

- A second controller found during a flood is treated as a BOUNDARY (an RS host destroys it) — the host decides the duplicate-controller policy. E2 notifies it via `onBoundaryController` + the `boundaryController` bus event (deduped per flood).
- The library never writes tile.data (NETWORK_ID) and never looks up tiles — the host wires that through `onEvent`/`onRebuildNeeded`.

## Opt-in structural completeness (for a real RS backend)

All default OFF, so existing behavior is unchanged until enabled:

| Option | Behavior |
|---|---|
| `mergeComponents: true` | A bridge node joining 2+ components merges them into the first owner and emits `componentMerged` (`componentKey`, `mergedKey`, `mergedControllerCoords`). The host applies the duplicate-controller policy. |
| `detectSplits: true` | After a node removal, members no longer reachable from the controller are orphaned; emits `nodeOrphaned` per cut-off node. |
| `refloodOnChange: "onChange"` | After a tick's changes, each affected component is re-flooded from its controller once (discovers changes the incremental path missed, drops disconnected nodes). |
| `reverseDFS: true` | Iterate sides in reverse (same controller/tie-break order as the reference 5→0 direction). |
| (always) | `floodAssign` now emits `nodeRemoved` for members that disappear during a reflood (previously only in the optional `out.removed` diff). |

## Threading

All traversal is synchronous on the main tick. Rebuild debounce runs through TickScheduler.global (deterministic ticks).

## Causes & safe mode

Every operation carries a `cause`: `assign` (attach/placement), `reflood` (host re-flood, chunk rebuild, change reflood), `change` (batched block change), `merge`, `split`, `detach`. The cause and the `operationId` are attached to emitted event payloads, to `onAfterChange(change)` and to `floodAssign`'s `out`.

`onBoundaryController` is **destructive policy** and is invoked only for destructive floods (attach / controller placement). Reconstruction floods (reflood, chunk rebuild, detach) emit the `boundaryController` event but never call the destructive callback — a host mistake cannot turn a rebuild into a controller teardown. Pass `floodAssign(..., { destructive: false })` explicitly to force the safe behavior (e.g. detach refloods).

## Reentrancy

Mutating entry points (`floodAssign`, `refloodComponentOf`, `removeComponent`) are guarded: when a host callback calls them while another operation is running, the call is deferred to the next tick (via TickScheduler batch) instead of corrupting the traversal in progress. The deferred path is logged. `floodAssign` returns `null` in that case. Every operation carries an `operationId` (available in `out.operationId` / `change.operationId` and attached to emitted event payloads).

## Query & determinism

Read-only API (zero side effects, no scheduling): `componentOf`, `component`/`componentSnapshot` (immutable copy + `generation`), `isConnected(a,b,dim)`, `neighboursOf(coords,dim)`, `searchController`.

Ordering guarantees: fixed side order (`CoreKit.coords.sides`, optional `reverseDFS` copy), LIFO DFS pushing neighbours in side order, batch flush FIFO, merge survivor = first owner in side order, `for..in` over the internal maps (insertion order on V8; Rhino behaviour [NEDETERMINAT] — re-verify in-engine if a host depends on cross-key order).

## Performance (Node baseline)

Measured with (V8; in-engine Rhino is slower — re-run there before tuning):

| Workload | Cost (V8) |
|---|---|
| `floodAssign` new, line of 100 / 1k / 10k nodes | 324 us / 3.2 ms / 39 ms |
| `floodAssign` reflood, 100 / 1k nodes | 384 us / 2.8 ms |
| `searchController`, 1k nodes | 1.8 ms |
| `_splitCheck` via bridge removal, 1k nodes | 1.4 ms |
| `mergeComponents` bridge (2x9 nodes) | 47 us |
| flush batch 10 / 100 / 1000 changes | 90 us / 0.5 ms / 3.5 ms |
| `reset`, 1k nodes | 3.3 ms |

Rules of thumb: cost is linear per node with ~2 string keys + ~4 allocations per node; a removal that triggers `_splitCheck` is O(component); a flush with K removals can be O(K x component). The host predicates (`isNodeAt` -> `World.getTileEntity`) dominate in-engine.

## Multiplayer

Server-side (topology is server-authority). Client receives only results.

