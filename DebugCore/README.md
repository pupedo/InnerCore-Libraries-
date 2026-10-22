# DebugCore

- **LIBRARY**: `DebugCore`, v2, `shared: true`, api CoreEngine · **IMPORT**: `IMPORT("DebugCore")` → global `DebugCore`

## Purpose

Structured diagnostics with minimum noise and maximum value. Unifies the three parallel `debugLog_*` implementations found in real mods and formalizes the channel system that was designed but never implemented in the reference storage mod.

| Piece | Status | Notes |
|-------|--------|-------|
| `channel(tag)` — prefixed `[TAG]`, config-gated | proven | config-gated structured logging |
| Dynamic gating `setEnabled(fn)` | proven | `Config.dev` pattern |
| `ring(capacity)` — last-N log lines + onFlush | **INFERENCE/NEW** | crash sessions produced no logs, so a ring buffer is added |
| `counter(name)` | formalized | ad-hoc counters (OPT-32 style) |
| `profile(name, fn)` | **INFERENCE/NEW** | no existing profiler in the ecosystem |
| `report(error)` + `showReport(message, title)` | formalized (ClassicUI) | always-on error log + optional engine dialog |

## API

```js
DebugCore.setEnabled(function () { return Config.dev; });   // dynamic gate
var ch = DebugCore.channel("CALC");
ch.log("plan built for " + uid); ch.warn("timeout"); ch.error("no pattern");

// INFERENCE: crash diagnostics — last 256 lines, flushed to disk by the host
var ring = DebugCore.ring(256, { onFlush: function (lines) {
    FileTools.WriteText(__dir__ + "debug.log", lines.join("\n"), true);
}});
DebugCore.setRing(ring);            // channel logs also flow into the ring

var skips = DebugCore.counter("skipped");
skips.inc(); skips.get(); skips.reset();

DebugCore.profile("updateItems", function () { ... });      // logs ms + rolling avg/max
```

## Design rules (from the logging proposals)

- **One channel per subsystem** (`[CALC]`, `[SCHED]`, `[TOPO]`, `[GRID]`, `[PERS]`, …) — a single `Logger.Log` tag keeps filtering trivial.
- **Gated by default** — zero output unless `setEnabled` was called.
- **No spam**: counters/ring are O(1); profile logs one line per call.
- **Errors are data**: channel.error still routes into the ring so crash forensics keep working.

## Threading

Synchronous, callable from any thread; `Logger.Log` is the only side effect. Ring buffer is append-only in memory — no I/O unless the host wires `onFlush`.

## Multiplayer

Neutral — works identically on both sides (the ring is local per side).

