# UiCore

- **LIBRARY**: `UiCore`, v2, `shared: true`, api CoreEngine · **IMPORT**: `IMPORT("UiCore")` → global `UiCore`

## Purpose

The UI infrastructure re-implemented by every mod (pagination exists in 6+ variants, swipe 3× within a single mod, search boxes in 4 places with the same dialog title, slot pools in 3 projects, darken maps in 5). Everything here is **descriptor generation + pure logic** — no window magic, no engine-version coupling (the WindowMaker lesson).

| Piece | Behavior |
|-------|----------|
| `pagination` (getPages/getPageFromCoords/getCoordsFromPage) | Page math for paginated grids |
| `attachSwipe` (7px/15px state machine) | Swipe gesture handling |
| `attachSwipe` variant `"anchor"` | Generalized anchor variant (see divergence note below) |
| `attachSwipe` `snapAfterSwipe` | Snap gated on the switchPage return value |
| `attachSlider` (moving flag, CLICK release + jump) | Slider drag; CLICK releases the drag (`moving=false`) even without UP |
| `attachSlider` `snapOnClick` | CLICK = snap only |
| `searchBox` (AlertDialog+EditText, clearable) | Search box with clear |
| `createSlotPool` ((-1000,-1000) parking, base clonat, maxCount) | Reusable slot pool; `maxCount` refuza crearea peste limita |
| `applyDarken` (descriptor darken) | Descriptor darkening |
| `DeltaBinder` (sendChanges only on change; cache per tip; `options.onError`) | Change-only UI delta sending |
| `cutItemName` | Item name truncation |
| `textWidth` / `measureContent` / `scaleContent` / `offsetContent` | adaptive layout (cached; measure intoarce copii; scale > 0) |
| `fitContent` | measure + shrink (maxScale) + center into maxWidth/maxHeight |
| `outsideClose` | tap-outside → onClose ONCE; `options.isOpen()` false skips the close |
| `dispose()` | LevelLeft cleanup: drop pending + clear caches + reset thread-id provider |
| `tabs` | vertical tab strip (frame + slot icon, maxVisible/offset overflow) |
| `confirm` / `alert` | native dialogs (scheduled on the UI thread; false without engine) |
| `display` / `displayPercentWidth/Height` / `dip` / `sp` / `displayRefresh` | screen metrics (cached) + dp/sp conversion |
| `skins` | named skins with `base` inheritance + bitmap/bitmap2 remap + unapply/unregister |
| `stringToBitmap` / `registerTexture` | Base64 image → engine TextureSource (proven VanillaSlots/ClassicUI) |
| `safeRun(fn, logTag)` | Runs a callback on the UI thread (`runOnUiThread`, direct fallback), exceptions isolated + logged. **Heavy work here competes with rendering/touch on main → frame drops; keep heavy GUI updates on their dedicated engine thread.** |
| `exclusive(key, fn)` / `replayPending` / `setThreadIdProvider` | Cooperative per-key serialization between the UI thread and client-dispatch (main vs tick): same thread re-enters; the other thread is deferred (args remembered, `false` returned) and replayed later via `replayPending`. **No UI-thread marshaling** — heavy work stays on its own thread. |
| built-in `embedded` (53 texturi) | Setul RS GUI hardcodat base64, auto-registrat la load |

## Built-in textures

53 texturi din setul RS GUI sunt hardcodate ca string-uri base64 (ca `___transferBarFull` în VanillaSlots), auto-registrate la load pe client și expuse în `UiCore.embedded`. Pot fi folosite direct ca `bitmap:` în descriptori, fără fișiere în `gui/`:

`UIC_but_down`, `UIC_but_down_pressed`, `UIC_but_up`, `UIC_but_up_pressed`, `UIC_changelog_frame`, `UIC_classic_darken_slot`, `UIC_classic_tab_up_dark`, `UIC_classic_tab_up_dark_left`, `UIC_classic_tab_up_light`, `UIC_classic_tab_up_light_left`, `UIC_craft_arrow`, `UIC_crafts_slider`, `UIC_crafts_slider_on`, `UIC_empty`, `UIC_gray_frame`, `UIC_item_info_frame`, `UIC_native_button`, `UIC_native_button_pressed`, `UIC_native_button_lite`, `UIC_native_button_lite_off`, `UIC_native_button_lite_pressed`, `UIC_pattern_button_craft_default`, `UIC_pattern_button_craft_off`, `UIC_pattern_button_craft_pressed`, `UIC_redstone_gui_0`, `UIC_redstone_gui_1`, `UIC_redstone_gui_2`, `UIC_arrow`, `UIC_arrow_down`, `UIC_arrow_up`, `UIC_close_button_icon`, `UIC_empty_button`, `UIC_empty_button_pressed`, `UIC_option_selected`, `UIC_options_button`, `UIC_search_bar`, `UIC_slider`, `UIC_slider2`, `UIC_slider3`, `UIC_slider4`, `UIC_slider_button_off`, `UIC_slider_button_on`, `UIC_tab_up_close_button`, `UIC_damage_on`, `UIC_damage_off`, `UIC_dd_access_0`, `UIC_dd_access_1`, `UIC_dd_access_2`, `UIC_filter1`, `UIC_filter2`, `UIC_filter3`, `UIC_nbt_on`, `UIC_nbt_off`.

## API

```js
var pg = UiCore.pagination(elements, { countX, countY, maxY, slider });
pg.getPages(itemCount) / pg.getPageFromCoords({y}, pages) / pg.getCoordsFromPage(page, pages)

touchEvents.push(UiCore.attachSwipe({ bounds, itemCount, pagination, getLastPage, switchPage, state, maxY, sliderStartY, sliderScale, sliderX, sliderElementName, getElement, snapSliderOnRelease }));
// extensions (swipe step 2):
//   variant: "layout" (default) | "anchor" — touch discriminator
//   drag: true (default) | false — the slider-drag section
//   snapAfterSwipe: false (default) | true — snap on flip, GATED on a truthy switchPage return
//   thresholds: {move, accumulate} — default {move:7, accumulate:15}; controller/monitor/precraft: {move:30, accumulate:70}
touchEvents.push(UiCore.attachSlider({ itemCount, pagination, switchPage, state,
    switchOnClick: true /*default*/, snapOnClick: false /*default; needs sliderX/sliderElementName/getElement */ }));

var search = UiCore.searchBox(x, y, width, { onSearch, clearable, title, fontSize });
elements.search_frame = search.frame; elements.search_text = search.text;
search.close(); // dismiss the native dialog if still open

var pool = UiCore.createSlotPool({ base: {type:"slot", size:60}, maxCount: 200 });
elements[name] = pool.get(name); pool.setPosition(name, x, y); pool.parkAll();

UiCore.applyDarken(elements, names, function (name) { return !craftable; }); // + forceRefresh()

var binder = UiCore.DeltaBinder.wrap(container);
binder.canSend(); // false on client containers (isServer === false); unknown -> true
binder.setScale("scale", 0.5); binder.setText("usage", "5 FE/t"); binder.flush();
binder.invalidate(); // on GUI open

UiCore.registerTexture("my_texture", "iVBORw0KGgo..."); // Base64 → TextureSource
elements.frame = { type: "frame", bitmap: "my_texture", x: 0, y: 0, width: 100, height: 100 };

// adaptive layout (ClassicUI parity)
var size = UiCore.measureContent(content);           // {scrollX, scrollY, minX, minY, width, height} (cached)
UiCore.scaleContent(content, Math.min(2, 900 / size.width));
UiCore.offsetContent(content, 500 - size.width / 2, 30);
var w = UiCore.textWidth("Hello", 20);                // cached
var d = UiCore.display();                             // {width, height, density} (cached); displayRefresh() after rotation
UiCore.fitContent(content, { maxWidth: 900, maxHeight: 500, center: { x: 500, y: 250 } });

// named skins + texture remap
UiCore.skins.register("classic", { textures: { "empty": "UIC_empty_button" }, base: "base" });
UiCore.skins.apply(content, "classic");
UiCore.skins.unapply(content);                        // restores saved bitmaps
UiCore.skins.unregister("classic");

// modal helpers
elements.backdrop = { type: "image", onTouchEvent: UiCore.outsideClose({ xStart: 0, xEnd: 900, yStart: 0, yEnd: 500 }, function () { group.close(); }, { isOpen: function () { return group.isOpened(); } }) };
UiCore.confirm("Delete?", { title: "Confirm", onResult: function (ok) { if (ok) remove(); } });
UiCore.alert("Done", { title: "Info" });

// optional liveness hooks (stale refs after rebuild/close): isActive()/isAlive(element)
// may be passed to attachSwipe/attachSlider/outsideClose; false = gesture ignored.
// live element lookup (anti stale refs, model rsGetLiveElement): resolve by NAME at
// call time; getElements() map → getUiAdapter().getElement → getElement; cached 1 tick
var el = UiCore.liveElement(container, "slider_button");
UiCore.dispose(); // LevelLeft: drop queued calls + caches (re-set provider/ensure on LevelLoaded)

// cooperative serialization (main UI events vs client-dispatch ticks)
UiCore.setThreadIdProvider(function () { return java.lang.Thread.currentThread().getName(); });
gridData.updateGui = UiCore.exclusive("grid.updateGui", function () { /* heavy refresh */ }, "updateGui");
// tick (client-dispatch): replay a call that was deferred while the UI thread was inside updateGui
UiCore.replayPending("grid.updateGui", { expectedOwner: executorTid, onError: function (e) {} });
UiCore.forget("grid.updateGui"); // diagnostics: drop the lock + counters
```

### Swipe variants (for grid/crafts/controller/precraft/monitor)

| Opt | Default | Semantics |
|-----|---------|-----------|
| `variant: "layout"` | default | DOWN starts the swipe ONLY inside `bounds`; on MOVE a distance > 7 flips immediately, otherwise the accumulated sum > 15 flips; the anchor is the previous event |
| `variant: "anchor"` | — | ANY DOWN in the frame starts the swipe (no bounds); signed delta on MOVE: `\|d\| > 7` or a SAME-DIRECTION sum > 15 flips; **reversing direction resets the sum** → a ±4px oscillation = 0 flips; the flip direction is the same (DOWN → previous page) |
| `drag: false` | true | handler without the slider-drag section (anchor frames have no drag) |
| `snapAfterSwipe: true` | false | after a flip from MOVE, the slider jumps to the exact Y of the NEW page — **only if switchPage returns truthy** |
| `thresholds: {move, accumulate}` | `{move: 7, accumulate: 15}` | swipe sensitivity (both variants): `move` = \|delta\| per event for an immediate flip; `accumulate` = same-direction sum for a flip. grid/crafts stay at 7/15; controller/precraft/monitor use `{move: 30, accumulate: 70}` |
| `snapSliderOnRelease: false` | true | disables the UP/CLICK snap (grid: gridSwitchPage already snaps) |
| `switchOnClick: false` | true | CLICK on the slider no longer changes the page |
| `snapOnClick: true` | false | CLICK on the slider ONLY snaps to the clicked page's Y (no switch) |

## Proven contracts (do NOT fight these)

- **getPageFromCoords expects coords INSIDE the slider range** [start_y, maxY] — the nearest-page scan uses a sentinel that assumes this (event coords come from the slider frame; an intentional quirk).
- **Effective pages = pages - countY + 1** (the proven countY reduction — the host clamps `lastPage` to this range, e.g. `Math.max(1, pages - yCount + 1)`).
- **DeltaBinder must be invalidated on GUI open** — otherwise stale caches suppress updates.
- **exclusive re-wrap keeps other functions' pending**: pass a stable `tag` (e.g. `"updateGui"`); re-wrapping drops only pending calls with the same tag. Without a tag the legacy behavior is kept (all pending for the key is cleared). `queueCall` accepts only wrappers produced by `exclusive` (tag check).
- **DeltaBinder is server-side**: `canSend()` is false on client containers (`isServer === false`) — client-side display updates go through the host tick, not `sendChanges`.
- **`display()` caches only valid results** — a failed read (0×0) is not cached; `displayRefresh()` after orientation/resolution changes.
- **Darken goes on descriptors + `forceRefresh()`** — `sendChanges()` alone does not apply `.darken`.
- **snapAfterSwipe is gated on switchPage returning truthy** — the snap must not fire when the host ignored the flip (gridSwitchPage returns false when nothing changed).

### Documented divergence — variant "anchor" vs the raw implementation

The raw implementation accumulates `|d|` **from the DOWN anchor** (the anchor moves only on a flip): a ±4px oscillation around the anchor grows the sum by 4 on every MOVE away and **flips at roughly the 8th MOVE** (4+0+4+0+... > 15). UiCore re-anchors on EVERY MOVE and resets the sum when the direction changes → the oscillation NEVER flips (requirement: "±4px oscillation → 0 flips"). For straight movements the results match the intended behavior (a 6px step → flip on the 3rd MOVE; a 5px step → on the 4th).

## Ownership (lifecycle)

- UiCore owns only **pure logic + descriptors**; windows, elements and their lifecycle belong to
  the host (the engine rebuilds elements on refresh — never keep element references; resolve with
  `liveElement`). `isActive`/`isAlive` hooks let the host veto a gesture on a stale window/element.
- The exclusive queue (`exclusive`/`queueCall`/`replayPending`) is host-driven: the host sets the
  thread provider, replays from its tick and drops pending calls when a window closes.
- Internal caches (text width / measure / display / live elements) are bounded memoization only;
  `dispose()` (host calls it on LevelLeft) clears them and resets the provider — the host re-arms
  on LevelLoaded.

## Threading

Pure/synchronous. `searchBox` internally uses `UI.getContext().runOnUiThread` for the Android dialog — the callback runs on the UI thread.

## Multiplayer

Client-side in principle (UI descriptors); DeltaBinder works on both sides.
