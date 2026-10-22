# ContainerSync

- **LIBRARY**: `ContainerSync`, v2, `shared: true`, api CoreEngine · **Dependencies**: `CoreKit:2` (declared + IMPORT in-library) · **IMPORT**: `IMPORT("ContainerSync")` → global `ContainerSync`

## Purpose

The client↔server protocol for transferring between the **player inventory and a storage** that every large storage mod writes by hand: the push/delete event queue through the maps in `networkData`, the authoritative server-side processing, buffered access to the player inventory, and the click/long-press math. Two large implementations exist today.

| Piece | Behavior |
|-------|----------|
| push/delete events protocol | Events queued in maps in networkData, reset after read |
| server processing loop | validate → clamp to MAX 10000 → push/delete → write-back → refresh |
| click / long-press count | click = 1; long-press = min(maxStack, storageLeft, available) |
| buffered player inventory | PlayerActor is STALE in the handler — do not re-read after writing (golden rule #10) |
| commit with external-change guard | A slot changed externally during the handler is not overwritten |
| lenient inventory search | extra matched by reference, then via fullExtraToString |

## Contract

The host provides the storage operations in the `pushItem`/`deleteItem` shape — `push(item, count) → remainder` / `remove(item, count) → remainder` (never silent loss; **a StorageCore view satisfies both**). The library owns the player inventory mutation (buffered, authoritative) and the event bookkeeping; the host owns the actual storage and the GUI refresh.

## API

The real RS transport is packet-based (the maps are NOT sent via
`networkData.sendChanges()`):

```js
// CLIENT touch handler: queue intents (want = the clicked item reference)
ContainerSync.queuePush(networkData, slot, count, updateFull, want);
ContainerSync.queueDelete(networkData, slotKey, count, updateFull, want);
ContainerSync.clickCount(item, isLongPress, storageLeft);

// transport identity (optional helper for building `want`)
var w = ContainerSync.want(item, { itemUid: getItemUid });   // { id, data, uid } | null
ContainerSync.wantMatches(w, item, { itemUid: getItemUid }); // uid first, then id/data

// CLIENT tick: ship them (the 'update' flag gates this)
if (networkData.getBoolean('update', false)) {
    networkData.putBoolean('update', false);
    sendPacket('pushDeleteEvents', { pushDeleteEvents: ContainerSync.buildEvents(networkData) });
}

// SERVER packet handler: MERGE per player uid (counts add, never overwrite)
this.data.pushDeleteEvents[uid] =
    GridEvents.mergePushDeleteEvents(this.data.pushDeleteEvents[uid], packetData.pushDeleteEvents);

// SERVER tick: apply against the live storage
ContainerSync.processEvents(this.data.pushDeleteEvents, {
    push: function (item, count) { return tile.pushItem(item, count, true); },
    remove: function (item, count) { return tile.deleteItem(item, count, true); },
    getSlot: function (slotKey) { return tile.container.getSlot(slotKey); },
    itemUid: function (item) { return getItemUid(item); },
    findByUid: function (uid) { return info.items[info.itemsIndex[uid]]; },
    onPushed: function (item, pushed) { /* mark dirty slot */ },
    onLeftover: function (uid, leftover, items) { /* give items back */ },
    onHandled: function (uid, kind) { /* drain wireless energy etc. */ },
    onChanged: function (uid, full) { tile.items(); tile.refreshGui(false, false, full); }
});

// Convenience APIs for external hosts (NOT used by the RS host):
ContainerSync.hasPending(networkData);
ContainerSync.process(networkData, playerUid, options);
ContainerSync.slotFromCoords(event, cols, cellW, cellH);

// Carry helper (piston / upgrade / replace) — pure, engine-free:
ContainerSync.transferContainer(from, to, {
    filter: function (name, slot) { return true; }, // false = skip
    clearSource: true,      // empty every copied source slot
    cloneExtra: false,      // false = reference; or function(extra) → stored
    overwrite: true         // false = keep an occupied destination slot
}); // -> { moved, skipped, cleared }

// Slot↔slot transaction (the engine handler is empty): validated, clamped, synced once.
ContainerSync.PROTOCOL_VERSION; // 1 — pins the host transport payload { v, from, to, count, want }
ContainerSync.transfer({
    from: { get: function (n) {}, set: function (n, id, count, data, extra) {} },
    to:   { get: function (n) {}, set: function (n, id, count, data, extra) {} },
    fromKey: "0", toKey: "1",
    count: 8,               // or "all", or a fraction < 1 (ceil of the source stack)
    want: { id: 5, data: 0, uid: "5:0" },   // identity guard (stale-slot on mismatch)
    canTake: function (name, item) { return true; },
    canPut: function (name, item) { return true; },
    maxStack: function (id) { return 64; },
    swap: false,            // true / predicate(src,dst) = swap whole stacks
    sync: function () {}    // called once after a successful move
}); // -> { moved, remainder, reason: null | "missing-slot"|"stale-slot"|"invalid-count"|"take-zero"|"occupied"|"not-allowed" }

// safe JSON in networkData (single location; also the "json" NetState field)
ContainerSync.jsonGet(nd, "key", fallback); // Java null/"null"/malformed → fallback
ContainerSync.jsonPut(nd, "key", value);    // stringify + putString; never throws (false on failure)

// Per-tile UI state protocol (generic):
var ns = ContainerSync.netState({
    version: "itemsVersion", hash: "itemsHash", count: "itemsCount", retry: 20,
    fields: { sort: { type: "int", default: 0 }, isActive: { type: "boolean", default: false } }
});
ns.publish(nd, id, { sort: 1, isActive: true }, { hash: h, count: n }); // server: + version bump + sendChanges()
ns.read(nd, id, ui);                     // client: typed fields + defaults
var st = ns.createState();               // host-owned per tile ({ version, retry })
ns.consume(nd, id, st, {                 // client tick
    isLive: function () { return window.isOpened(); },
    isGestureActive: function () { return rsIsUiGestureActive(); },
    nameMatches: function () { return ui.name == nd.getName(); },
    hash: function () { return rsItemsHash(ui.container); },
    onApply: function (ver) { ns.read(nd, id, ui); render(); }
}); // -> { applied, reason: "init"|"same"|"closed"|"gesture"|"name"|"version"|"retry"|"retryWait", version }
```
// buffered inventory access (golden rule #10):
var buffer = ContainerSync.bufferInventory(playerActor);
ContainerSync.findInBuffer(buffer, id, data, extra, reverse);
ContainerSync.addToBuffer(buffer, id, count, data, extra, maxStack, touched);
var leftover = ContainerSync.commitInventory(playerActor, buffer, dirty);
// optional out-array with descriptors (identity beyond count):
var leftoverItems = [];
ContainerSync.commitInventory(playerActor, buffer, dirty, leftoverItems); // [{slot,id,count,data,extra}]
```

## Semantics (proven)

- **`processEvents` consumes the event map** (processed entries are deleted) and writes the player inventory ONCE per batch, from the buffer — never re-reading after writing.
- **Slots emptied by a push are cleared explicitly** — the library performs the authoritative write (documented as a deliberate difference from the reference implementation, which relies on the client workbench-field sync for a full clear; a plain inventory has no such sync).
- **Delete** places items into the inventory through the buffer (exact stacks first, then empty slots); the rest goes to `player.addItemToInventory` (the engine fallback).
- **Golden rule**: a slot changed externally during the handler is NOT overwritten — its items become returned leftover (count + descriptors `{slot,id,count,data,extra}` via the out-array/`onLeftover`), so the host can recover them, not just count them.
- **Counts are clamped** to `MAX_COUNT = 10000`; non-finite/negative values → event discarded.
- **Empty-slot convention**: `id == 0` is an empty slot (`minecraft:air` is never held in an
  inventory/container slot), so every "has item" check is `id != 0`; negative IDs (new vanilla
  blocks) are **valid** items — never test `id > 0`.
- **Namespaced event keys**: `p:<inventorySlot>` for pushes, `d:<storageSlotKey>` for deletes —
  the two directions can never collide. Processing order is deterministic: deletes first,
  then pushes (not `for-in` order).
- **Unsafe client keys** (`__proto__`/`constructor`/`prototype`) are rejected; `getString`
  returning Java null or malformed JSON degrades to an empty map.
- **Unknown event types are rejected** (reported via `onInvalid`) — only `push`/`delete` execute.
  Queue-side counts are clamped to `MAX_COUNT`; non-finite/<=0 intents are ignored.
- **Notifications are isolated**: `onPushed`/`onHandled`/`onChanged`/`onLeftover` throwing never
  loses the already-applied event or the inventory write-back.
- **Transport identity helpers** (`want`/`wantMatches`, non-breaking additions): build/validate the
  clicked-item reference — `uid` first (via host `itemUid`), then `id`+`data`; a plain uid string
  is accepted as a uid-only reference; an empty item (`id == 0`) has no identity (`null`).
- **Carry helper** (`transferContainer`, non-breaking addition): copies non-empty slots between
  enumerable `slots` + `setSlot` objects (piston/upgrade/replace); `filter`/`clearSource`/
  `cloneExtra`/`overwrite` are host options, no engine access, returns `{ moved, skipped, cleared }`.
  A throwing `setSlot` aborts mid-loop (documented, no atomicity). When the container exposes
  `getSlot(name)` it is preferred for reads: the engine may store RAW Java slot objects inside the
  JS `slots` object (`ItemContainer.getSlot` does) and reading such a value from JS throws
  (Rhino "Invalid JavaScript value of type ...ItemContainerSlot").
- **Slot↔slot transaction** (`transfer`, non-breaking addition): `want` guard (`stale-slot`),
  destination-space + `maxStack` clamp, host policy `canTake`/`canPut` (throwing = rejected),
  whole-stack `swap` (boolean or predicate), one `sync()` per successful move; reasons
  `missing-slot`/`stale-slot`/`invalid-count`/`take-zero`/`occupied`/`not-allowed`.
  `PROTOCOL_VERSION = 1` pins the host transport payload shape.
- **JSON access in networkData is centralized** (`_csJsonGet`/`_csJsonPut`, internal): Java null,
  `"null"`, empty strings and malformed JSON degrade to the caller's fallback.
- **Per-tile state protocol** (`netState`, non-breaking addition): declared-schema publish with a
  monotonic version (`& 0x7FFFFFFF`) and optional `hash`/`count` metrics; client `consume` with
  host gates (`isLive` required, `isGestureActive`/`nameMatches` defer without marking the version)
  and a bounded hash retry (reasons: `init`/`same`/`closed`/`gesture`/`name`/`version`/`retry`/`retryWait`);
  undeclared field names are ignored; `consume` isolates `onApply` (failures go to `onError`).
  Field types: `int`/`boolean`/`string`/`json` (json = `jsonPut`/`jsonGet`; `null` clears the key).
- **The packet handler must merge** pending events per uid (`GridEvents.mergePushDeleteEvents`
  in RS) — overwriting drops the previous packet's intents.
- **Optional diagnostics**: `onInvalid(record)` (EXPERIMENTAL, reporting only) receives
  `{playerUid, slotKey, type, count, updateFull, reason}` for rejected events
  (`invalid-count`/`not-allowed`/`unknown-type`/`missing-slot`/`take-zero`); exceptions are
  isolated and behaviour is unchanged.

## Ownership (persistence / lifecycle)

- The library owns the **mechanism**: event maps in `networkData`, buffered player-inventory
  writes, per-tile state keys (`<field>@<id>`), version/retry bookkeeping.
- The host owns **persistence and lifecycle**: which data is saved (SaveCore scope), tile/network
  create/destroy, window open/close, and WHEN `publish`/`sendChanges` run. `networkData` itself is
  engine-managed (survives chunk unload; it is not a save file).
- `netState` state (`createState()`) is host-owned per tile; the library keeps no per-tile cache —
  dropping a tile drops its state, and LevelLeft just drops the host's tiles.

## Threading

Everything runs on the server thread, in the tick/handler (the same thread as the reference mods). Zero game threads, zero Timer. PlayerActor is created per player, per batch, and never retained.

## Multiplayer

The design is per-player from the start: the event map is keyed by uid, onHandled/onChanged receive the uid, and the inventory belongs to the player who owns the container (the phantom pattern — one container per player). For shared containers (multiple players on the same tile), the host provides `getSlot`/`push`/`remove` with server-side authority — the library assumes nothing about ownership.


## PS

The optional `want` reference ({ id, data, uid }) records what the sender clicked. The server validates the slot against it and, when the host has re-mapped its slots (a grid re-sorts on every change), resolves the item by uid via `findByUid`; an unresolvable event is dropped as `stale-slot` instead of moving a different stack.
