# CompatCore

- **LIBRARY**: `CompatCore`, v2, `shared: true`, api CoreEngine · **Dependencies**: none · **IMPORT**: `IMPORT("CompatCore")` → global `CompatCore`

## Purpose

Cross-mod integration without the load-order landmines (Inner Core does NOT guarantee mod compilation order — top-level access to other mods' globals throws `ReferenceError`). Everything here goes through the proven safe paths.

Restricted to the members that **add semantics** over the native APIs. Removed (boundary cleanup): `requireGlobal` (ModAPI pass-through), `storage` (duplicated `StorageCore`), `packVersion`/`atLeast`/`below` (delegated `CoreKit.Engine.packVersion`).

## API

```js
// proven addon pattern: the only load-order-safe access path
var h = CompatCore.whenAvailable("RefinedStorageAPI", function (api) { ... }); // → handle | null
h.cancel();                                        // ignore the late callback (engine cannot unregister)
CompatCore.whenAvailable("ICore", fn, { once: false });   // multiple registrations
CompatCore.whenAvailable("X", fn, { hostId: __name__ });  // dedup per host mod — __name__ passed FROM THE MOD FILE
CompatCore.whenAvailable("Slow", fn, { timeout: 200, onTimeout: function (name) { ... } }); // ticks, needs TickScheduler

var eu = CompatCore.energyType("Eu", 1);           // assureEnergyType (shared by name)
var existing = CompatCore.peekEnergyType("Eu");    // read-only: check before creating
```
