# CoreKit

- **LIBRARY**: `CoreKit`, v2, `shared: true`, api CoreEngine · **IMPORT**: `IMPORT("CoreKit")` → global `CoreKit`
- **Status**: first release, tested (Node, engine stubs), strict ES5

## Purpose

Base utilities + **one single item-identity convention** (unifies the 4 incompatible conventions found across the ecosystem: RS `getItemUid`/`fullExtraToString`, CS `extraMatch`/`String(getAllCustomData)`, IHP `isExtraEqual`, AE id+data only) + safe engine feature detection.

## API

| Namespace | Members | Notes |
|-----------|---------|-------|
| `CoreKit.util` | `clamp`, `cutNumber`, `numberWithCommas`, `uid`, `deepClone`, `fillDefaults`, `md5` | generic utilities |
| `CoreKit.coords` | `sides`, `cts`, `parseCts`, `compare`, `key` | coordinate helpers |
| `CoreKit.Items` | `extraKey`, `fullExtraToString`, `uidOf`, `uidInfo`, `isExtraEmpty`, `match`, `mergeable` | unified item-identity convention |
| `CoreKit.Inventory` | `scan` (3 call shapes: id/data/extra, id/data, matcher) | item scanning |
| `CoreKit.Engine` | `packVersion`, `hasFeature`, `safeIsChunkLoadedAt` | engine feature detection |
| `CoreKit.Blocks` | `facingMetaFromDelta`, `facingMetaFromPlayer`, `wireBoxes` | block facing + wire boxes |
| `CoreKit.locale` | `translate`, `isNumeralVerb`, `isNumeralMany`, `translateCounter` | localized format + plural forms |
| `CoreKit.net` | `base64Decode`, `github(user, repo, {ref})` → `getJson`/`getFile`/`getImageBase64` | GitHub contents client (blocking) |

## Item UID (canonical identity)

```
UID      := id "_" data [ "_" extraKey ]
extraKey := getValue()                 // AUTHORITATIVE when present (falsy -> "")
          | String(asJson())           // TERMINAL when present: RAW (no field stripping)
          | ""                         //   ...falsy/throwing asJson -> ""
          | "" when isEmpty()==true
          | String(getAllCustomData()) // only when asJson is ABSENT
          | extra.json | String(extra) | JSON.stringify(extra)
```
- Separator `_`, no escaping: consumers may rely on the first two segments only
  (`id`, `data`); `extraKey` is opaque and must not be parsed back into an object.
- `extraKey` is a **serialization**, not invertible — keep the real `extra` object
  when you need to re-insert/reserve it (`Items.uidInfo`).
- `uidOf` is deterministic for an unchanged extra; distinct extras collapse only in
  the documented cases (non-JSON `getAllCustomData`, opaque Java objects, `asJson`
  falsy) — `isEmpty()+asJson` no longer collapses (asJson wins).
- All branches are exception-safe (never throw); `fullExtraToString` **mutates** the
  extra's JSON object (strips empty data/name) and ignores `getValue()`.

## Lifecycle

- Load: on `IMPORT` (no game callbacks registered).
- `Engine.packVersion()` reads the manifest **lazily** (first call), not at load time.
- No per-level state; `_ckFeatures`/`_ckPackVersion` are process-lifetime caches.
- Registers NO internal callback.

## Threading

All functions are pure/synchronous. `deepClone` and `extraKey` are safe on any thread as long as the input objects are not mutated concurrently.

## Multiplayer

Item identity (`uidOf`/`extraKey`) is a client↔server invariant — the convention is designed to produce identical keys on both sides.

## Implementation notes

- `content`/`uidOf` memoization — the canonical `content()` projection is cached on the
  extra wrapper itself (`extra.__rsContent`, internal expando); `fold()` invalidates it
  after rewriting the NBT envelope, and unsupported compounds cache `null`. The cache
  never changes identity, it only avoids repeated NBT parsing on hot comparison paths.
- `extraKey` — source priority: `getValue()` (AUTHORITATIVE when present; a falsy value → `""`, exact RS `getExtraUidSuffix` parity) → `asJson()` RAW (no field stripping) → `isEmpty()` → `getAllCustomData()` → `json` → `String()` → `JSON.stringify`. All wrapped in try/catch. Critical: `getValue()` must be checked BEFORE `isEmpty()` — a tag extra (enchant) reports `isEmpty()==true` while `getValue()!=0`, and checking `isEmpty()` first collapses identities. `asJson()` also comes BEFORE `isEmpty()`: a tag extra can report `isEmpty()==true` while `asJson()` is non-empty (parity with the RS host chain).
- `fullExtraToString` — the RS matching key: like `extraKey` for asJson extras but STRIPS empty `data`/`name` (mutates the JSON object, same side effect as RS). For non-asJson extras falls back to `json` → `String` → `JSON.stringify`.
- `match` — wildcard `data === -1` is active by default; `match(a, b, {stripEmptyExtra: true})` compares extras via `fullExtraToString` (RS merge semantics: empty fields don't prevent a match); `mergeable` requires an exact match (no wildcard).
- `Inventory.scan` keeps the RS signature for drop-in compatibility (`scan(player, id, data, extra, list, reverse)` + the `searchItem` shift form with boolean `extra`).
