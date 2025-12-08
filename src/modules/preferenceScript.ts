/**
 * Preference Script for Zotero OpenReview Plugin
 */

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
      columns: [],
      rows: [],
    };
  } else {
    addon.data.prefs.window = _window;
  }

  ztoolkit.log("OpenReview preferences loaded");
}
