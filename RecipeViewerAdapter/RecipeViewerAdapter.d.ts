/// <reference path="core-engine.d.ts" />

/**
 * RecipeViewerAdapter — expose workbench recipes to the RecipeViewer mod.
 * Load with: IMPORT("RecipeViewerAdapter") → global `RecipeViewerAdapter`.
 *
 * RecipeViewer has no global; it is reached through ModAPI.addAPICallback.
 */
declare namespace RecipeViewerAdapter {
    /**
     * Make workbench recipes visible in RecipeViewer, reached through
     * ModAPI.addAPICallback (RecipeViewer has no global). Returns true when
     * the API callback was scheduled; the vanilla "workbench" type is left
     * untouched when present.
     */
    function recipeViewerWorkbench(): boolean;
}
