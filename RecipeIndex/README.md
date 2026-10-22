# RecipeIndex

- **LIBRARY**: `RecipeIndex`, v2, `shared: true`, api CoreEngine · **IMPORT**: `IMPORT("RecipeIndex")` → global `RecipeIndex`

## Purpose

The recipe pipeline every crafting mod rebuilds: discovery → inverse index → dedup → candidates → craftability annotation → search, all proven and engine-agnostic (recipe access injected via options).

| Piece | Behavior |
|-------|----------|
| `build` (full scan → index) | Scans all recipes and builds the index |
| `loadRecipesByIngredient` | Native `WorkbenchRecipeRegistry.addRecipesThatContainItem` via WRAP_JAVA (fast path) + `Recipes.getWorkbenchRecipesByIngredient` (fallback) — **no .dex required** |
| `buildFromIngredients` | Candidate-only discovery + index/dedup |
| index/dedup/annotation/search | The proven pipeline (see Semantics below) |
| `simulateWorkbench` (simulate a recipe without a player) | Scratch ItemContainer with workbench field, static anti-`Player.*` scan, WorkbenchFieldAPI via WRAP_JAVA, cache per uid |
| `executeWorkbenchRecipe` (execute + capture) | Runs the recipe callback on a scratch field and returns the mutated slots + result, so the caller can insert leftovers/refund |
| `sortKeys` / `partition` | Generic sort + partition non-darken→darken, no engine coupling |

## API

```js
var recipes = RecipeIndex.loadWorkbenchRecipes();   // yields every 500 recipes

// OR RS-style discovery (no .dex — directly from Inner Core):
var idx = RecipeIndex.buildFromIngredients(
    [{ id: 5, data: 0 }, { id: 280, data: -1 }],   // items in the grid + inventory
    {}                                              // options as for build()
);

var index = RecipeIndex.build({
    recipes: recipes,
    // optional overrides (defaults use recipe.getRecipeUid/getResult/getSortedEntries)
    getUid: function (r) { ... }, getResult: ..., getEntries: ...
});

index.byUid(uid)                        // recipe | null
index.byIngredient(id, data?)           // uids (data >= 0 → exact key, else id-level list)
index.findCandidates(available)         // proven CS candidateUids filter
index.annotate(available)               // [{recipe, result, craftable}] craftable-first, stable
index.search(keyword, getName, cache)   // name filter with cache (proven RS itemsNamesMap)
index.size()                            // deduped count

// simulate a recipe without a player (RS checkCraft):
RecipeIndex.simulateWorkbench(recipe);                       // true = the callback runs without errors
RecipeIndex.simulateWorkbench(recipe, { cache: myCache });   // cache per host
RecipeIndex.clearCraftSimulationCache();                     // after runtime recipe registration

// execute a recipe callback on a scratch field and capture the outcome:
var out = RecipeIndex.executeWorkbenchRecipe(recipe, [
    { id: 5, count: 1, data: 0 },        // field items (missing entries = empty slots)
    { id: 77, count: 1, data: 5 }
]);                                       // out = { ok, prevented, result, slots[9] }
// ok=false on callback throw / prevent(); slots are captured regardless, so the
// caller can refund whatever is left in the field. No player/inventory access.

// generic key sorting (from the RS sortItems fallback):
RecipeIndex.sortKeys(keys, { getId, getCount, getName, hasItem },
                     { by: "count" | "name" | "id" | 0 | 1 | 2, reverse, textSearch });
// stable partition into two groups (from the RS sortCrafts fallback):
RecipeIndex.partition(items, isFirstGroup, { filter, onClassify }); // → { first, second, ordered }
```

`sortKeys` / `partition` never touch the engine: the host supplies the accessors (`getId/getCount/getName`) and the grouping predicate respectively. They are used as a fallback when the Java fast path is unavailable (the Java path remains primary). `sortKeys` are **deterministic la egalități** (nume → id → cheie), deci ordinea nu depinde de ordinea de intrare sau de stabilitatea sortării.

### `simulateWorkbench` — how it works

1. Fill a scratch container with workbench-field prefix `craft_slot` from `getSortedEntries()` (data −1 → 0, count 1); unused slots are cleared.
2. STATICALLY reject callbacks whose source references `Player.*` (scan over the keys of the global `Player`).
3. Invoke `callback(new WorkbenchFieldAPI(container), container.asScriptableField(), result)` — the callback may write `craft_result`.
4. Cache per uid; an error → `false` + log. Everything engine-specific is injectable through options (`ItemContainer`, `WorkbenchFieldAPI`, `playerGlobals`, `cache`, `log`) — the defaults are the proven ones (WRAP_JAVA for WorkbenchFieldAPI, the engine's ItemContainer).

`available` = `{ "id" | "id_data": count }` (proven shape).

### `executeWorkbenchRecipe` — how it works

1. Fill a scratch container with workbench-field prefix `craft_slot` from `fieldItems` (`count` defaults to 1, `data` to 0); entries missing or with `id == 0` clear the slot. Field items are never mutated.
2. Read `getResult(recipe)`; a throwing accessor returns `{ ok:false, result:null, slots:[] }`.
3. If `getCallback(recipe)` is non-null, invoke it with `(new WorkbenchFieldAPI(container), container.asScriptableField(), result)` — the callback may mutate the field, the result, and call `prevent()`.
4. Capture all 9 `craft_slot` slots after the run; `ok=false` when the callback throws or calls `prevent()`, but the slots are captured either way so the caller can refund leftovers.
5. Everything engine-specific is injectable through options (`ItemContainer`, `WorkbenchFieldAPI`, `getCallback`, `getResult`); defaults are the proven ones (engine `ItemContainer`, WRAP_JAVA `WorkbenchFieldAPI`). The scratch container is reused across calls and refreshed per run.

## Proven semantics preserved

- **Inverse index is built over ALL recipes** (duplicates included) — dedup is a separate list.
- **Dedup key** = `result.id_data + ingredientSignature` (sorted `id:data:count`, joined) — the same output with different inputs is NOT deduped.
- **First occurrence wins** for both the deduped list and duplicate uids in `recipesByUid` (deterministic for a fixed input order; the engine's collection order decides which one is first).
- **Invalid values are rejected**: `result.id` must be finite and `> 0`; entry ids must be finite and `> 0`. A non-positive/invalid `count` is treated as 1 (never credits stock in `annotate`).
- **Wildcard `data == -1`** consumes across any matching id, partial counts supported.
- **Craftable-first stable sort** (array sort returning 0 for ties — stability depends on the engine, preserved).

## Threading

Synchronous. `loadWorkbenchRecipes` yields (`java.lang.Thread.yield()`) every 500 recipes — this keeps the main thread responsive during the initial scan.

## Multiplayer

Server-side compute; per-player caches are the host's job (see MpCore.perPlayer).
