LIBRARY({
    name: "RecipeViewerAdapter",
    version: 1,
    shared: true,
    api: "CoreEngine"
});

var RecipeViewerAdapter = {};

/*
 * ============================================================================
 * RecipeViewerAdapter — expose workbench recipes to the RecipeViewer mod
 * ============================================================================
 * RecipeViewer exposes itself only via ModAPI.addAPICallback("RecipeViewer", ...)
 * (no global). The vanilla RV already registers its own "workbench" type; when
 * present, this adapter leaves it untouched. When absent (stripped build), a
 * compatible workbench type is registered.
 * ============================================================================
 */

/**
 * Make the workbench recipes visible in RecipeViewer.
 * Returns true when the API callback was scheduled (RV registers its API in
 * PostLoaded, so the registration itself happens asynchronously).
 */
RecipeViewerAdapter.recipeViewerWorkbench = function () {
    if (typeof ModAPI == "undefined" || !ModAPI || typeof ModAPI.addAPICallback != "function") return false;
    var scheduled = false;
    try {
        ModAPI.addAPICallback("RecipeViewer", function (api) {
            try {
                var registry = api.RecipeTypeRegistry;
                if (!registry) return;
                if (typeof registry.isExist == "function" && registry.isExist("workbench")) return;
                if (!api.RecipeType || typeof api.RecipeType != "function") return;
                var type = new api.RecipeType("Crafting", 58, {
                    drawing: [{ type: "bitmap", x: 530, y: 185, scale: 2, bitmap: "_workbench_bar" }],
                    elements: {
                        input0: { x: 200, y: 100, size: 100 },
                        input1: { x: 300, y: 100, size: 100 },
                        input2: { x: 400, y: 100, size: 100 },
                        input3: { x: 200, y: 200, size: 100 },
                        input4: { x: 300, y: 200, size: 100 },
                        input5: { x: 400, y: 200, size: 100 },
                        input6: { x: 200, y: 300, size: 100 },
                        input7: { x: 300, y: 300, size: 100 },
                        input8: { x: 400, y: 300, size: 100 },
                        output0: { x: 680, y: 190, size: 120 },
                        shapelessIcon: { type: "image", x: 740, y: 130, scale: 1.5, bitmap: "rv.shapeless_icon" }
                    }
                });
                type.getAllList = function () {
                    var recipes = null;
                    if (typeof Recipes != "undefined" && Recipes &&
                        typeof Recipes.getAllWorkbenchRecipes == "function") {
                        var col = Recipes.getAllWorkbenchRecipes();
                        if (col) {
                            recipes = [];
                            var it = col.iterator();
                            while (it.hasNext()) recipes.push(it.next());
                        }
                    }
                    if (!recipes || !recipes.length) return [];
                    var list = [];
                    var masks = {};
                    for (var i = 0; i < recipes.length; i++) {
                        var rec = recipes[i];
                        if (!rec) continue;
                        var mask = rec.getRecipeMask ? String(rec.getRecipeMask()) : "";
                        if (!mask || masks[mask]) continue;
                        masks[mask] = true;
                        var field = rec.getSortedEntries ? rec.getSortedEntries() : null;
                        var input = [];
                        for (var f = 0; f < 9; f++) {
                            if (!field || !field[f]) break;
                            input[f] = { id: field[f].id, count: 1, data: field[f].data };
                        }
                        var result = rec.getResult ? rec.getResult() : null;
                        list.push({ input: input, output: result ? [result] : [], isShapeless: mask.indexOf("$$") === 0 });
                    }
                    return list;
                };
                registry.register("workbench", type);
            } catch (e) {}
        });
        scheduled = true;
    } catch (e) {
        return false;
    }
    return scheduled;
};

EXPORT("RecipeViewerAdapter", RecipeViewerAdapter);
