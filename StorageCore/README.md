# StorageCore

- **LIBRARY**: `StorageCore`, v3, `shared: true`, api CoreEngine · **Dependencies**: `CoreKit:2` (declared + `IMPORT("CoreKit:2")` in-library) · **IMPORT**: `IMPORT("StorageCore:3")` → global `StorageCore`

## Purpose

The mid-level storage layer every mod re-implements today: aggregation over storage entries, plan-then-commit transactions, and the transfer math that exists in 5 incompatible variants across the ecosystem.

| Piece | Behavior |
|-------|----------|
| Provider registry + entry contract | LIVE entries, mutated in place |
| `insert`/`extract` returning the remainder | Capacity-bound, never silent loss |
| `Transfer.MACHINE` (merge into slot) | Merges into an existing slot |
| `Transfer.UI_RATIO` (drag&drop hold-bar) | Ratio-based transfer from a hold bar |
| `Transfer.BUTTON` (click/long-click) | click=1, long-click=stack, delete-side clamp |
| `Transfer.roomFor` | Free room in a set of slots |
| Transactions (plan → commit, all-or-nothing) | CHECK/COMMIT with rollback semantics |

Item identity delegates to **CoreKit.Items** (hard dependency — extra-aware uid/match). Aggregation and `insert` are identity-safe: keys are re-derived canonically and two different identities are never merged under the same uid.

## Entry contract (identical to RS DiskData)

```js
{ storage: 1000, items_stored: 250, items: { "5_0": { id: 5, data: 0, count: 250, extra: null } } }
```

Entries are LIVE references: `insert`/`extract` mutate them in place (the provider's persisted data stays in sync).

## API

```js
StorageCore.registerProvider(blockId, provider)     // provider.getEntries(tile) → entries[]
StorageCore.unregisterProvider(blockId) / providerFor(blockId) / getProviders() / resetProviders()

var view = StorageCore.createView(entries[, options]);  // options.selector/weight (experimental)
view.insert(item, count[, options]) → remainder    // options.uid?/trustedUid? (identity reuse), options.onOverflow?, options.opId (experimental)
view.extract(uid, count[, options]) → remainder   // options.opId (experimental)
view.forgetOperation(opId) / resetOperations()
view.getItems() / get(uid) / has(uid)              // fresh copies — never live refs
view.getTotals() → { storage, stored }
view.snapshot() → { items, storage, stored }         // chei canonice (ca getItems), copii proaspete
view.findFirst({ id, data: -1, extra? }) → uid     // data -1 wildcard resolution

var tx = StorageCore.Transaction.create(view);
tx.insert(item, count) → accepted                  // shadow-validated, no mutation
tx.extract(uid, count) → accepted
tx.commit() → { applied, ops }                     // all-or-nothing, re-validates
tx.reset() / pendingCount()

StorageCore.Transfer.UI_RATIO(source, target, ratio[, maxStackFn]) → count
StorageCore.Transfer.BUTTON(item, capacity, isLongPress[, maxStackFn]) → count
StorageCore.Transfer.MACHINE(item, slot[, count]) → added
StorageCore.Transfer.roomFor(item, slots) → freeRoom
StorageCore.Transfer.clampCount(value[, maxCount]) → count

StorageCore.invalidate(entry) / forgetEntry(entry) / resetIndex()  // stacks-index maintenance
StorageCore.debug.validate(view) → { ok, mismatches }  // dev-only, opt-in, no auto-run
```

## Design decisions (why this shape)

- **`getItems()` returns fresh copies** — returning live references could produce unstable slot keys through mutation; the view never hands out live references by design.
- **No maxStack clamping in `insert`** — disks store by capacity, not by stack size.
- **`commit()` re-validates** against the live view — sources may change between planning and commit.
- **Transactions are explicit, not implicit** — hiding mutation behind implicit abstractions produces reference-sharing bugs.

## Ownership & lifecycle

- **The host owns provider lifecycle.** StorageCore has no timers, callbacks or
  engine hooks (by design): register providers after load, unregister them when their
  tile/container goes away, and call `resetProviders()` on LevelLeft — otherwise stale providers survive a level
  change.
- **`createView(sources)` stores the array by reference.** Keep the array stable
  for the lifetime of a view/transaction; mutating it while a transaction plans
  breaks the re-validation assumptions.
- **Overflow is reject/remainder only.** `insert`/`extract` never drop or void
  items; spawn/destroy behavior is host policy and stays outside the library.
- **No events, no persistence.** The library mutates live entries and returns;
  persistence and change notification belong to the host and its providers.
- **Routing is opt-in.** `createView(sources, options)` accepts `selector` (deterministic
  insert ordering) and `weight` (EXPERIMENTAL proportional fill; leftovers in order).
  Extract is never reordered.
- **Change notification is opt-in.** `createView(sources, { onChange })` reports
  each applied mutation as `{ uid, delta, item, source }` (EXPERIMENTAL; per op,
  in order, exceptions isolated). The host can bridge it to EventBus.
- **Operation tokens are opt-in and EXPERIMENTAL.** `options.opId` makes a view call
  idempotent per view (repeated id returns the original remainder; no events).
  Process-local, FIFO-bounded by `options.opLogSize` (default 128).
- **Identity reuse is opt-in.** `insert(item, count, { uid, trustedUid })` reuses a
  caller-derived canonical uid and skips re-derivation when trusted. The stacks index
  keeps one position per canonical uid (duplicate-uid stacks are out of scope).
  `forgetEntry(entry)` evicts the cached metadata of an unreferenced entry.
- **Diagnostics are opt-in.** `debug.validate()` checks `items_stored == sum(counts)`
  per entry and reports drift/capacity/invalid counts; it never runs automatically
  and never fixes data.

## Threading

Synchronous, main thread. No internal timers or callbacks.

## Multiplayer

Server-side (mutations are server-authority). `Transaction` planning can run anywhere; commit only on the server.

