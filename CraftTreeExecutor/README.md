# CraftTreeExecutor

- **LIBRARY**: `CraftTreeExecutor`, v2, `shared: true`, api CoreEngine · **Dependencies**: CoreKit:2

## Purpose

The task model + tick scheduler extracted from a proven storage mod, generalized
through host interfaces so ANY mod can execute automatic crafting: reserve
materials, run crafts with refunds, track processing outputs, persist tasks. The
dependency plan itself is **not computed here** — the host supplies it (e.g. from
the separate `CraftTreePlanner` library).

| Piece | Behavior |
|-------|----------|
| `createTask` | Buffer reservation, expected outputs per uid, FIFO `pendingOutputs` (exact port) |
| `serialize`/`restore` | Task persistence through a Saver scope |
| `scheduler.processTick` | `ticks % interval` cadence, RETRY_THROTTLE=2, FAIL_TIMEOUT=600, chunk suspension, plan-then-commit with refund (generalized: the machine interaction is the host's `execute`) |

## API

```js
// 1. plan (supplied by the host; e.g. CraftTreePlanner + an RS-world adapter)
var fullCrafts = buildFullCrafts(item, quantity, world); // { results, ingridients, crafts, plan }

// 2. task (execution model)
var task = CraftTreeExecutor.createTask(fullCrafts, host, item, quantity);
task.reserveItems();     // moves toReserve from storage into task.buffer
task.flushBuffer();      // pushes leftovers back
task.onOutputArrived(uid, count);   // processing outputs → nodes done

// 3. persistence
var data = CraftTreeExecutor.serialize(task);
var back = CraftTreeExecutor.restore(data, host);

// 4. execution (host-driven tick)
var executed = CraftTreeExecutor.scheduler.processTick(task, ctx);
```

## Host interfaces (what the host must provide)

- `fullCrafts.plan = { nodes, toReserve, toCraft, toTake, missing }` — the plan shape consumed by `createTask`; node = `{ patternUid, isProcessing, containerCoords, quantity, requirements: [{uid,count,altUids}] }`.
- `host.extract(uid, count) → remainder` / `host.insert(item, count) → remainder` — **a StorageCore view satisfies this exactly**
- `ctx` (scheduler): `ticks` (controller-owned), `getContainer`, `getInterval`, `getBudget` (per-container budget; default `getContainerBudget` is always ≥ 1 — intervals > 10 clamp to 1; a missing pattern cancels the task after FAIL_TIMEOUT), `isChunkLoaded`, `canTake/take` (storage without/with mutation), optional `insert(item, count) → remainder` (refund target), `execute(task, node, container, pattern, plan)` — one craft; return `{failed: true}` and the library refunds the committed ingredients (storage-taken back to storage via `insert` when provided, overflow to the task buffer).
  - **Two ctx modes** — pick one:
    - **Generic** (library plans + commits): requires `canTake`, `take`, `execute`; optional `getContainer`/`getContainers`, `getInterval`, `getBudget`, `getPattern`, `getStored`, `insert`. `canTake` is authoritative when present (a `false` result is final; `getStored` is only the fallback when `canTake` is absent). One craft per node per tick.
    - **Host execution** (`ctx.executeNode`): the host performs allocation + commit + machine + node bookkeeping (e.g. a mod's `_executeOne`). The library only orchestrates: it iterates `ctx.getContainers(patternUid)` and calls `executeNode` up to the container budget per tick (`getContainerBudget` default). `canTake/take/insert/execute` are ignored.
  - Always required: `ticks`, `isChunkLoaded`; `getContainers` OR `getContainer`; `getPattern` (absent → treated as missing).
  - Optional: `parallel` (default → parallel), `getInterval` (default 1), `getBudget` (absent → `scheduler.getContainerBudget(interval)`), `markIncomplete` (fired on container suspend).
  - Lifecycle hooks (all optional, host-owned): `onProgress(task, executed)`, `onMonitorDirty(task)`, `refreshOpenedGrids()`, `removeScheduledCount(task)`, `unregisterTaskExpectedOutputs(task)`, `onTaskComplete(task)`, `onTaskCancelled(task, reason)`, `onTaskRemoved(task)`. The library sets `task.completing` and expects the host to remove the task when `onTaskComplete`/`onTaskRemoved` fires.
- `host.extract` / `host.insert` are optional and internally guarded (`reserveItems`/`flushBuffer` fall back to no-op).

## Proven semantics preserved (tested)

- **`outputsSatisfied` requires `remaining == 0`** — a node completes only after its crafts executed AND its processing outputs arrived.
- **Time base is ticks** (caller-provided) — never `World.getThreadTime` (drift hazard).

## Failure modes

- Chunk unloads → nodes suspend; 5×FAIL_TIMEOUT → task cancels.
- Missing pattern/container for FAIL_TIMEOUT ticks → task cancels.
- Executor failure → ingredients refunded (storage first via `ctx.insert`, overflow to buffer), retry after RETRY_THROTTLE. The refund passes the host-recovered extra when `host.resolveExtra(uid)` is provided (otherwise `extra: null`).
- Cancelled tasks flush their buffer when the host drives `processTick` with `completingFlush` set.

### Retry classification (no dedicated API)

There is intentionally **no `retryable`/`permanent` failure classification** API: neither reference mod has one (they re-poll every eligible tick or reinject and retry next tick). The library only distinguishes by *time*:

- **retryable now (throttled)**: `node._lastTry` + `RETRY_THROTTLE=2` — a failed/blocked node is re-attempted after 2 ticks.
- **waiting / blocked**: `node._suspendSince` (chunk/container unavailable) — no craft attempted; `ctx.markIncomplete()` fires; auto-cancels after `5×FAIL_TIMEOUT`.
- **permanently missing**: `node.missingSince` (no pattern / no container) — auto-cancels after `FAIL_TIMEOUT` (`_cancel(task, ctx, "missing")`).
- **cancelled**: `task.cancelled` (set by `_cancel` or the host) — terminal.

A host that wants richer classification can drive it from the `onTaskCancelled(task, reason)` / `onTaskFailed` hooks; the library does not invent state.

### Pattern identity & `coordsId` (F12 — host-owned)

`validatePattern` normalizes a raw pattern to `{ id, isProcessed, oredictEnabled, ingridients, result }` and **does NOT emit `coordsId`**. `coordsId` is **host identity** (which container holds the pattern): the host adapter re-attaches it when rebuilding `info.crafts[uid] = [{ coordsId, ... }]`. The scheduler reads `pattern.coordsId` from the world pattern, so the host must set it. Pattern identity therefore stays split: the library owns `id`/shape, the host owns `coordsId`.

## PatternContainers

```js
// producer side: tile uri with pattern containers
CraftTreeExecutor.PatternContainers.register(tile, container); // container.getPatterns() → raw patterns

// consumer side (host tick):
var containers = CraftTreeExecutor.PatternContainers.scan(blockSource, dimension, function (tile) {
    return tile.data.NETWORK_ID === netId && tile.data.isActive; // the network filter stays the host's job
});
var normalized = CraftTreeExecutor.PatternContainers.validatePattern(raw); // null when invalid
```
