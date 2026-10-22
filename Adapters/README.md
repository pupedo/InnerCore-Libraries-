# Adapters


- **LIBRARY**: `Adapters`, v2, `shared: true`, api CoreEngine · **Dependencies**: CoreKit:2 (declared + IMPORT in-library). StorageCore entries are CONSUMED by StorageCore — the adapter itself never calls it. **Storage-only** (RecipeViewer glue was split out to `RecipeViewerAdapter`).

## Purpose

The cross-mod glue: every adapter turns an external container (Storage Drawers drawer, any StorageInterface chest) into a **StorageCore entry**, so topology networks and automatic crafting treat them uniformly. All external access is feature-detected — the library works without any of the mods present.

| Piece | Behavior |
|-------|----------|
| Drawer deposit loop | Iterate ALL slots, use per-slot capacity, add and write back |
| Drawer slot discovery | tile.getSlotNames (addon) → StorageInterface descriptor ("slot_*") → tile.container.slots probing |
| Drawer capacity | tile.getConfig().size (per slot), NOT DrawerAPI.getConfig (that registry holds upgrade items) |
| Container slots + per-slot maxStack | StorageInterface (AE TileEntityInterface.getSlotMaxStack) |
| Neighbour lookup | StorageInterface.getNeighbourStorage |

## API

```js
// a drawer becomes a StorageCore entry
var entry = Adapters.drawer(blockId, 128);       // 128 = fallback per-slot capacity
entry.syncFrom(drawerTile);                      // read the drawer (real capacity from tile.getConfig())
StorageCore.createView([entry]).insert(item, 50); // move into the mirror
var leftover = entry.syncTo(drawerTile);         // apply bidirectionally; leftover = what did not fit
var dry = entry.planTo(drawerTile);              // { ops, leftover, storage } — nothing is written

// a drawer network (addon controller, no manual scan capped at 50)
var entries = Adapters.drawerEntries(drawerTiles);

// any StorageInterface container (vanilla chests, Iron Chests)
var centry = Adapters.container(storage);
var pol = Adapters.container(storage, { inSlots: ["slotA"], outSlots: ["slotB"] }); // host policy override
var side = Adapters.neighbour(region, coords, side);   // null if it does not exist
var all = Adapters.neighbours(region, coords);         // [{side, entry}]

// change detection + batch write-back (no manual _synced hacks)
Adapters.syncAll(entries);                       // skips unchanged changeToken, returns {leftover, synced, skipped, failed}

// pre-flight capability check
Adapters.check("drawer", drawerTile);            // {ok, missingRequired, missingOptional}
```
