# RecipeViewerAdapter

- **LIBRARY**: `RecipeViewerAdapter`, v1, `shared: true`, api CoreEngine · **IMPORT**: `IMPORT("RecipeViewerAdapter")` → global `RecipeViewerAdapter`
- **Dependencies**: none (RecipeViewer/Recipes are feature-detected globals)

## Purpose

RecipeViewer exposes itself only through `ModAPI.addAPICallback("RecipeViewer", …)` — there is no global. The vanilla RecipeViewer already registers its own `"workbench"` type; when present, this adapter leaves it untouched. When absent (stripped builds), it registers a full workbench type with the same layout as the vanilla one and converts the engine's workbench recipes into RecipeViewer patterns.

## API

```js
RecipeViewerAdapter.recipeViewerWorkbench(); // true when the callback was scheduled
```

## Semantics

- Feature-detected end-to-end: returns `false` without `ModAPI`; the registration itself is asynchronous (RecipeViewer registers its API in `PostLoaded`).
- Never overwrites an existing `"workbench"` type (`registry.isExist`).
- `getAllList()` degrades to `[]` when `Recipes.getAllWorkbenchRecipes` is unavailable; dedupes by recipe mask.

