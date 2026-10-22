# MpCore

- **LIBRARY**: `MpCore`, v2, `shared: true`, api CoreEngine
- **Dependencies**: TickScheduler:2 (declared + IMPORT in-library)

## Purpose

The multiplayer toolkit every mod rebuilds by hand. The per-player, targeted-update machinery is built in as the default:

| Piece | Behavior |
|-------|----------|
| Connected-clients map + per-client open/close listeners | Tracks each client per tile, with per-client cleanup |
| `openFor` + `getScreenByName` | Opens a screen for one client (required — the engine throws without `getScreenByName`) |
| Targeted refresh, broadcast only when client is null | Refresh one client, or broadcast with a null client |
| Per-source request throttle with pruning | Throttles requests per source and prunes stale entries |
| Validation + disconnect on impossible requests | Server-side validation kicks invalid clients |

## API

```js
// per-tile connected clients (call once in init())
var clients = MpCore.connectivity(tile, {
    onOpen: function (container, client, owner) { ... },        // after the client is tracked
    onClose: function (uid, container, client, owner) { ... }   // per-client cleanup
});
MpCore.getClient(tile, uid);

// screens (REQUIRED for openFor — engine throws without getScreenByName)
MpCore.attachScreens(prototype, { main: window, ... } /* or function(name) */);

// open + initial payload, targeted to one client
MpCore.openFor(tile, client, "main", payload);

// targeted (client) or broadcast (null) refresh
MpCore.refresh(tile, clientOrNull, "openGui", payload);

// lazy per-player map persisted in tile.data
var pages = MpCore.perPlayer(tile, "recipePlayerPages");

// request guard: 60-tick per-source throttle with pruning
var guard = MpCore.requestGuard(tile, 60);
if (guard.isThrottled(playerUid)) return;   // ... work ... ; guard.mark(playerUid);

// server-side validation, kicks on failure
MpCore.validate(client, function () { return /* plausible? */ true; });

// host-side "UI open" check (the engine client list also contains nearby players)
if (!MpCore.isWatching(tile, connectedClient)) return;

// containerEvent wrapper: uid guard + late registration fallback
// (options.requireOpen: reject unless the client is a registered viewer)
// NOTE: first arg is the tile INSTANCE at runtime — use a forwarder:
proto.containerEvents.myEvent = function (eventData, connectedClient) {
    return MpCore.guardHandler(this, function (data, client, uid) { ... }, { requireOpen: true })(eventData, connectedClient);
};

// tile lifecycle guard (detached tiles have no networkEntity — e.g. created on an
// unloaded chunk; calling server model/UI paths on them logs/corrupts):
MpCore.isTileAlive(tile);                          // tile && tile.data && !tile.data.removed
MpCore.safeTileCall(tile, function (t) { ... }, { requireNetworkEntity: true, label: "refreshModel" });
```

## Built-in lessons (do NOT fight these)

- **Never broadcast when targeted works** — broadcasting is the source of cross-player contamination.
- **onClose is per-client** — a global `window.isOpened()` check empties OTHER players' state.
- **onOpen registers then fires the host hook** — the client is tracked first (so `getClient` is valid), UI refresh still happens in `openFor`, never double-fired.
- **Callbacks use the live tile (`owner`)** — the engine can recreate the JS instance while the container keeps its listeners, so registration is tracked per container object and never trust the tile captured in the closure (use the 3rd/4th callback arg).
- **Client never mutates server state** — client receives payloads via events only.
- **PlayerActor per tick, never retained** (engine constraint, multiplayer guide).

## Threading

Synchronous, main thread. The request guard uses TickScheduler.global ticks (deterministic).

## Multiplayer

Server-side toolkit. Client-side usage is 
