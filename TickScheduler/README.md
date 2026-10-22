# TickScheduler

- **LIBRARY**: `TickScheduler`, v2, `shared: true`, api CoreEngine · **IMPORT**: `IMPORT("TickScheduler")` → global `TickScheduler`
- **Hardening (v1.x):** `sched.ticks` is read-only; `heartbeat()` counts only successful executions; the `"__auto"` scope is reserved (rejected by `register`/`unregister`/`heartbeat`/`destroyScope`); `interval()` validates arguments before replacing (no longer destroys the old task on invalid input).

## Purpose

One deterministic scheduling model for the whole ecosystem, replacing the 6+ ad-hoc mechanisms found in real mods (java.util.Timer wrappers, tick counters with modulo, thread-time deltas, per-tile countdown flags…). Everything is **tick-based**: never `World.getThreadTime` (a drift hazard) and never the engine `Updatable` (a native crash hazard).

Unifies, with proven semantics:

| Primitive | Semantics |
|-----------|-----------|
| `register` + `heartbeat` (scopes) | deadline `nextRun` — no modulo drift, no catch-up storms; `isDirty` runs immediately and resets cadence; per-task try/catch isolation + `failures` counter; optional `autoDisable` (N consecutive failures → task disabled, kept inspectable); reserved names |
| `debounce` | coalescing; runs once after N quiet ticks; optional `maxTicks` starvation guard |
| `throttle` | per-key window; wrapper drops calls inside it; map pruned every 600 ticks |
| `defer` | safe teardown: delayed run, N total attempts, drop + log; optional `backoff: fixed/linear/exp`, `maxDelay`, `jitter` |
| `ensureInterval` / `ensureDefer` | idempotent: re-calling does not create duplicates; safe on repeated `LevelLoaded` |
| `batch` | at most once per tick per key; first fn wins |
| `interval` | simple interval on the scheduler's own tick driver; `false` without a driver or on invalid input (does not touch the existing task) |

## API

```js
var sched = TickScheduler.create("tick");     // "tick" | "LocalTick" | null (heartbeat-only)
TickScheduler.global;                          // shared server scheduler (lazy)
TickScheduler.local;                           // shared client scheduler (lazy)

sched.reserve("name");                         // internal names
sched.register(scopeId, name, interval, offset, fn, options) → handle {cancel, isLive}
//   options: { internal, owner, isDirty, onError }
sched.heartbeat(scopeId[, ...args])            // from your tile tick; fn(scopeId, ...args)
sched.interval(name, ticks, fn, options)          // driver-driven; false without driver / invalid input
sched.ensureInterval(name, ticks, fn, options)    // idempotent (same fn = same task, no cadence reset)
sched.ensureDefer(key, fn, options)               // idempotent per key
sched.debounce(key, fn, {ticks, maxTicks}) → {cancel}
sched.throttle(key, fn, {ticks}) → wrapper(...) → bool
sched.defer(fn, {ticks, retries, reason}) → {cancel}
sched.batch(key, fn) → bool
sched.get/list/listAll()                       // introspection (nextRun/runs/failures/owner)
sched.destroyScope(scopeId)                    // network teardown; true when deleted, false otherwise
sched.resetOwner(owner)                        // cleanup per owner
sched.admin().resetAll()                       // LevelLeft (host/tests only)
sched.admin().destroyGlobal()                  // dispose (host/tests only)
```

## Scopes vs intervals

- **Scopes** = heartbeat-driven groups (a network, a controller tile). The task cadence only advances while YOU call `heartbeat(scopeId)` — a network is "alive" only while its controller ticks.
- **Intervals / debounce / throttle / defer / batch** run on the scheduler's own driver tick (`tick` for global, `LocalTick` for local).

## Offsets

`nextRun = heartbeat + interval - offset`: an offset moves the FIRST run earlier, staggering tasks across scopes (e.g. `offset = scopeId % interval`).

## Lifecycle

- Load: on `IMPORT`. `TickScheduler.global`/`local` register their driver callback lazily on first access.
- `admin().resetAll()` on `LevelLeft` (forgets tasks/queues, keeps the driver). `TickScheduler.admin()` targets the shared server scheduler.
- `destroyScope(scopeId)` on network/tile destroy; `resetOwner(owner)` for per-owner cleanup.
- `admin().destroyGlobal()` disposes permanently (admin/tests only; not reversible).

## Budget & priority lanes

- The budget is **OFF by default** (any mod can still execute long code in its callback; the budget is self-protection + fairness).
- `admin().setBudget({ enabled, maxTasksPerTick, laneWeights })` — default `maxTasksPerTick = 64`, weights `0.5/0.4/0.1`.
- When enabled: `_tick` drains due tasks across lanes (critical → normal → idle), with a **round-robin cursor** per lane (no starvation) and **redistribution** (unused share passes to the next lane).
- `options.lane` on `register`/`interval` (default `normal`) — lanes are free for all.
- `heartbeat(scopeId)` (per-tile tasks) is **not** budgeted — its volume is already bounded by tiles; the budget only governs driver tasks (`interval`/`ensure`).

## Failure control

- `options.autoDisable: N` (opt-in, default off): task disabled after N **consecutive** failures; `disabled` and `consecutiveFailures` appear in `get()/TaskInfo`.
- A success resets the counter; `onError` is called on every failure; the log is emitted on the first error in the series and on disable (no spam).
- The disabled task remains in the list for inspection; re-registering with the same name re-enables it.
- `defer`/`debounce`/`batch` with an invalid `fn` → no-op (handle `{cancel}` or `false`) + a single log per primitive+key; nothing is scheduled.

## Ownership

- `options.owner` tags the task; `get()/TaskInfo.owner` exposes it.
- Overriding a task with a different owner logs a warning.
- The handle is bound to the exact registration: `isLive()` is `false` after replace/resetAll/destroyGlobal, and `cancel()` cannot touch another owner's task.

## Threading

Driver threads: `TickScheduler.global` is driven by the server tick callback (T3, driver `tick`), `TickScheduler.local` by the client local tick (T2, driver `LocalTick`) — neither runs on the UI/main thread (T1). Task callbacks run synchronously on their driver thread: treat them like tick code (no heavy work, no direct UI mutation). Each task is isolated: a throw is logged (tag `TickScheduler`, `failures` counter, optional `onError(error, name, scopeId)`), never propagated.

## Multiplayer

- `TickScheduler.global` = server (`tick`), `TickScheduler.local` = client (`LocalTick`).
- Heartbeat scopes are server-side (driven by tile ticks); never share scheduler state across sides.
