# EventBus

- **LIBRARY**: `EventBus`, v2, `shared: true`, api CoreEngine · **IMPORT**: `IMPORT("EventBus")` → global `EventBus`

## Purpose

Event emitter for INTERNAL mod/library systems (it does not replace `Callback.addCallback` for game events). It guarantees two semantics the native Callback lacks:

1. **Isolation**: an exception in one listener does NOT stop the emission.
2. **Scopes**: `clearScope(scope)` removes every registration of a scope (network/tile teardown without ConcurrentModificationException).

Plus: emission snapshot (listeners added DURING an emission only run on the next one).

## API

| Member | Description |
|--------|-------------|
| `EventBus.create()` | new isolated bus |
| `EventBus.getGlobal()` | shared mod-level bus (lazy) |
| `bus.on(event, fn[, scope])` | register; returns the index |
| `bus.once(event, fn[, scope])` | run once |
| `bus.off(event, fn)` | unregister (accepts the once wrapper) |
| `bus.emit(event[, data])` | emit to all; returns executed count |
| `bus.emitScoped(event, scope, data)` | only listeners with the given scope |
| `bus.clearScope(scope)` | clean teardown |
| `bus.clear([event])` | clear one event or everything |
| `bus.listenerCount(event)` | listener count |
| `EventBus.ns(name)` | namespaced handle (prefix `name:`, ownership, `clearOwn`, `define`) |
| `EventBus.getGlobal()` | restricted shared-bus handle (listen/emit only) |
| `EventBus.admin()` | shared-bus admin: clear/clearAll/clearScope/listEvents/setMaxDepth/trace |
| `bus.offId(event, id)` | unregister one subscription by id |
| `bus.onTrace(fn)` | observability hook (off by default) |

Hardening in v2: reentrancy depth guard (default 32, `admin().setMaxDepth`), listener growth warning (1000),
subscription ids, owner cleanup (`clearOwner`/`ns.clearOwn`), ephemeral listeners cleared on LevelLeft,
dev-only payload contracts via `ns.define(...)`. The shared bus no longer exposes `clear`/`clearScope`
(they are admin-only); `EventBus.global` is a protected read-only accessor.

## Example

```js
IMPORT("EventBus");
var netEvents = EventBus.create();

netEvents.on("itemInserted", function (item) { /* ... */ }, netId);
netEvents.emitScoped("itemInserted", netId, item);
// network teardown:
netEvents.clearScope(netId);
```

## Lifecycle

- Load: on `IMPORT`; no game callbacks registered.
- Call `clearScope` in the `destroy()` of any system that registered a scope (tile/network).

## Threading

Synchronous; callable from any thread. Listener errors are logged (`Logger.Log` with tag `EventBus`), never propagated.

