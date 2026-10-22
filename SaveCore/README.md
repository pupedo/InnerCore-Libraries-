# SaveCore

- **LIBRARY**: `SaveCore`, v2, `shared: true`, api CoreEngine · **IMPORT**: `IMPORT("SaveCore")` → global `SaveCore`

## Purpose

Versioned persistence over `Saver.addSavesScope`. The plain read/save shape exists in 12+ mods, but almost none have data migration or validation — every other mod loads saves blindly. SaveCore makes versioning, migration and validation the default.

| Piece | Behavior |
|-------|----------|
| read/save scope shape | Read/save a Saver scope |
| Migration before adoption | Declared migrations upgrade old data to the current version |
| Validation with fallback to defaults | Invalid data falls back to defaults |
| LevelLeft reset | Resets the store automatically on level unload |

Save format: `{ version: n, data: <object> }`.

## API

```js
var store = SaveCore.scope("MyMod.Data", {
    version: 2,
    defaults: function () { return { items: [] }; },
    migrations: {
        1: function (data) { return { items: data.oldItems || [] }; },   // v0 → v1
        2: function (data) { return data; }                               // v1 → v2
    },
    validate: function (data) { return Array.isArray(data.items); },
    onLevelLeft: function (store) { /* cleanup derived state */ }
});

store.data.items.push(42);   // live object; saved by the engine
SaveCore.getScope("MyMod.Data"); // introspection
```

## Semantics

- **migrations[N] upgrades from version N-1 to N**, applied in ascending order at read time. A throwing migration (or a missing migration step) aborts to fresh defaults with a warning — a corrupted save never crashes the mod.
- **Newer-version saves are rejected** (fresh defaults + warning) — future formats are never adopted blindly.
- **validate() runs before adoption**; `false` (or throw) → `defaults()` + `Logger.Log` warning.
- **Duplicate scope names** return the existing store — a second engine scope is never registered.
- **The save function passes data to the engine as-is** — the engine serializes scope data natively (it can persist Java objects inside Saver scopes). Store JSON-pure data; avoid JS circular references.
- **LevelLeft** resets `store.data` to null and calls `onLevelLeft` automatically.
- **Legacy saves without the envelope** (`{version, data}`): with `legacy(raw)` the WHOLE raw object is adopted as data (version 0 → migrations run); without it they read as defaults. This is the safe upgrade path for pre-envelope scopes (e.g. `{DiskData:[…]}`).
- **`serialize(data)`** (save hook) derives/converts the persisted shape; a throwing hook falls back to the raw data.
- **`deserialize(data)`** (read hook) is the inverse of `serialize` and runs on EVERY accepted read — envelope included, unlike `legacy` — after `legacy`/`migrations` and before `validate`. Use it to invert a save-time conversion (e.g. `'Infinity'` → `Infinity`) or re-normalize keys. A throwing hook → fresh defaults.

## Threading

Read/save run on the engine's save/load callbacks (main thread). Data mutations are synchronous.

## Multiplayer

Server-side only (`Saver` is server-side — documented in core-engine API). Never share the data object with the client; send copies.

