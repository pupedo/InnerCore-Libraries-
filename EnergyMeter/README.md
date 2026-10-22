# EnergyMeter

- **LIBRARY**: `EnergyMeter`, v2, `shared: true`, api CoreEngine · **Dependencies**: none

## Purpose

The energy accounting every EnergyNet mod writes by hand. Thin layer — **EnergyNet remains the network**, this is just the accounting.

## API

```js
EnergyMeter.registerUsage(BlockID.diskDrive, 4);        // per-tick cost map
EnergyMeter.getUsage(BlockID.diskDrive);
EnergyMeter.unregisterUsage(BlockID.diskDrive);         // remove one entry
EnergyMeter.clearUsages();                              // also automatic on LevelLeft

var m = EnergyMeter.measure([
    { blockId: BlockID.diskDrive },                     // 4
    { blockId: BlockID.diskDrive, count: 5 },           // 4 × 5 (disks per drive)
    { blockId: BlockID.crafter, extras: 1.5 }           // + per-pattern extras
]);                                                      // m.usage, m.perNode

var b = EnergyMeter.budget(energy, usage, capacity);
b.ok;       // energy >= usage (energy clamped to [0, capacity])
b.scaled;   // 0..1 for GUI scales/textures (clamped)
```

## Design notes

- **Count multiplier** models per-instance costs (disks per drive, patterns per crafter).
- **`measure` returns per-node contributions** for UI display (usage texts, redstone gating).
- **Numeric contract**: non-finite (NaN / ±Infinity), non-number and negative inputs collapse to 0; `capacity ≤ 0` or non-finite is treated as 1; `measure` re-validates the total (non-finite → 0); `budget` clamps `energy` to `[0, capacity]` and sanitizes `usage`. A broken usage map never crashes the tick.
- **Registry lifecycle**: `registerUsage`/`unregisterUsage`/`clearUsages`; the registry is cleared automatically on `LevelLeft`.

## Threading

Pure/synchronous math. `measure` is O(nodes) — call it on the controller heartbeat cadence, not every tick.

## Multiplayer

Server-side (energy is server-authority); `budget.scaled` is a UI value, ship it to the client like any other GUI state (see UiCore.DeltaBinder).
