# CraftTreePlanner

- **LIBRARY**: `CraftTreePlanner`, v2, `shared: true`, api CoreEngine · **IMPORT**: `IMPORT("CraftTreePlanner")` → global `CraftTreePlanner`
- **Dependencies**: none (fully host-agnostic)

## Purpose

The crafting-planning core shared by every autocrafting system, isolated from any
host: resources are opaque keys, recipes are plain descriptors, and all host
policy is injected. The engine owns the recursion, the simulated inventory,
candidate ordering, cycle detection, complexity limits and the plan; the host
owns resource identity, pattern format, storage snapshot, priority policy,
processing semantics and serialization.

## API

```js
var CraftTreePlanner = IMPORT("CraftTreePlanner");   // inside a mod

var res = CraftTreePlanner.plan(
    { key: "A", amount: 1 },
    {
        recipesFor: function (key) { return patternsByOutput[key] || []; },
        inventory:  CraftTreePlanner.createInventory({ initial: [{ key: "B", amount: 5 }] }),
        identityOf: function (r) { return r.uid; },        // optional (default r.id)
        policy:     myPolicy,                              // optional
        limits:     { maxSteps: 100000, maxDepth: 64 }      // optional
    }
);
// res = { ok, errorType, errorRecipe, nodes, missing, extraction, toTake, toCraft, stats }

var merged = CraftTreePlanner.aggregate(res.nodes, function (n) { return n.recipeId; });
```

| Piece | Behavior |
|-------|----------|
| `plan(request, ctx)` | Recursive demand resolution against the injected inventory; returns the generic result |
| `createInventory(options)` | Simulated storage snapshot: `amount/extract/insert/reserve/available` + real-vs-crafted split (`realExtracted`) |
| `createCycleGuard()` | Generic path-scoped cycle guard (identity supplied by host) |
| `aggregate(nodes, nodeKey)` | Optional structural post-pass: merge nodes sharing a key, sum quantities/inputs/outputs |
| `defaultPolicy` | Stable order, accept everything; hosts override `compare/accept` for candidates and recipes |
| `ERRORS` | `NO_RECIPE`, `MISSING`, `RECURSIVE`, `TOO_COMPLEX`, `TIMEOUT`, `INVALID_RECIPE` |

## Host contract

```
ctx.recipesFor(key) -> [recipe]
recipe = { id, isProcessing?, hostRef?, outputs: [{ key, amount }],
           inputs: [ { candidates: [{ key, amount, autocraftable? }] } ] }
```

Candidates inside one slot are interchangeable at their own `amount` (per single
craft). `autocraftable === false` marks substitutes the host must not recurse
into (e.g. storage-only alternatives).

## Read-only planning & context

Planning mutates only its private inventory/guard/state — never the host world or
storage. The host callbacks (`recipesFor`, `policy.*`, `now`) run synchronously
in the traversal and must be **pure and deterministic** to keep the plan
deterministic; side effects there are the host's responsibility. Pass a **fresh
`inventory` and `cycleGuard` per plan** unless cumulative state is intended
(reusing them carries consumed stock across plans). The inventory's
`reserve()`/`available()` helpers are not used by the engine — reservation belongs
to the host (RS: CraftTreeExecutor).

## Limits (opt-in)

Limits are **disabled by default**; a falsy value (0/null/undefined) means disabled.

| Limit | Counts | Checked | Abort |
|---|---|---|---|
| `maxSteps` | recipe resolutions (recursion calls) | at recursion entry, before work | `TOO_COMPLEX`, `errorLimit="maxSteps"` |
| `maxDepth` | recursion depth (root = 1) | at recursion entry | `TOO_COMPLEX`, `errorLimit="maxDepth"` |
| `maxNodes` | completed nodes | **before** a node is pushed (artifact never exceeds the cap) | `TOO_COMPLEX`, `errorLimit="maxNodes"` |
| `deadline` | wall clock via injected `now()` | recursion entry, per slot before candidates, before root pick | `TIMEOUT`, `errorLimit="deadline"` |

`LIMIT_REACHED` (`TOO_COMPLEX`/`TIMEOUT`) is distinct from `NO_RECIPE`/`MISSING`/`RECURSIVE`; `errorLimit` tells which cap fired. Deep chains beyond the JS stack abort as `RangeError` -> `TOO_COMPLEX` (no `errorLimit`); use `maxDepth` for very deep recipe trees.

## Semantics

- **Tree, not DAG**: a recipe used by several branches is resolved per branch
  (nodes are pushed per resolution). `aggregate` collapses afterwards.
- **No memoization**: results are path-dependent (storage state, alternative
  choice), so subtrees are recomputed by design.
- **Real vs crafted**: `extraction`/`toTake` map the portion taken from the
  initial snapshot; `toCraft` maps produced amounts.
- **Determinism**: deterministic traversal and stable ordering; the host clock
  is only used when a `deadline` is configured.

## Performance (Node baseline)

Measured with (V8; Rhino is slower — re-run in-engine before tuning).
Deadline OFF, limits disabled (opt-in):

| Workload | Time | Nodes |
|---|---|---|
| chain depth 100 / 1000 | 5.6 / 16.2 ms | 100 / 1000 |
| chain depth 5000 | stack overflow (mapped to `TOO_COMPLEX`, nodes=0) | — |
| wide slots 10 / 100 / 1000 | 0.5 / 0.7 / 8.2 ms | 1 |
| diamond depth 10 / 14 / 16 (recompute) | 7.4 / 78.3 / 212.4 ms | 1023 / 16383 / 65535 |

Cost is linear per resolved node; the diamond case shows the deliberate
tree-not-DAG recompute (no memoization). Deep chains beyond the JS stack
(~1600 levels in Node) abort via `RangeError` -> `TOO_COMPLEX`; set `maxDepth`
for hosts with very deep recipes.
