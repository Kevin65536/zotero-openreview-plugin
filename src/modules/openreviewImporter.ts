/**
 * OpenReview Importer
 * Main module for importing papers from OpenReview
 */

import { getString } from "../utils/locale";
import { OpenReviewApi, FetchOptions } from "./openreviewApi";
import { CollectionManager } from "./collectionManager";
import { ZoteroItemCreator } from "./zoteroItemCreator";

/**
 * Import options
 */
export interface ImportOptions {
  url: string;
  collectionName: string;
  downloadPdfs: boolean;
  importReviews: boolean;
  acceptedOnly: boolean;
  oralOnly: boolean;
  posterOnly: boolean;
  skipDuplicates: boolean;
}

/**
 * Import progress callback
 */
export type ProgressCallback = (
  current: number,
  total: number,
  message: string,
) => void;

/**
 * Import result
 */
export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * OpenReview Importer class
 */
export class OpenReviewImporter {
  /**
   * Register menu items for the plugin
   */
  static registerMenuItems(): void {
    // Register File menu item
    ztoolkit.Menu.register("menuFile", {
      tag: "menuseparator",
    });

    ztoolkit.Menu.register("menuFile", {
      tag: "menuitem",
      id: "zotero-openreview-import",
      label: getString("menuitem-import-openreview"),
      commandListener: () => this.openImportDialog(),
    });

    // Register right-click menu item on collections
    ztoolkit.Menu.register("collection", {
      tag: "menuitem",
      id: "zotero-openreview-import-collection",
      label: getString("menuitem-import-openreview"),
      commandListener: () => this.openImportDialog(),
    });
  }

  /**
   * Open the import dialog
   */
  static async openImportDialog(): Promise<void> {
    const dialogData: { [key: string]: any } = {
      url: "",
      collectionName: "",
      downloadPdfs: true,
      importReviews: false,
      paperFilter: "all", // "all", "oral", "poster"
      skipDuplicates: true,
      loadCallback: () => {
        ztoolkit.log("Import dialog opened");
      },
      unloadCallback: () => {
        ztoolkit.log("Import dialog closed");
      },
    };

    const dialogHelper = new ztoolkit.Dialog(12, 2)
      .addCell(0, 0, {
        tag: "h2",
        styles: {
          marginBottom: "10px",
        },
        properties: { innerHTML: getString("dialog-title") },
      })
      // URL input
      .addCell(1, 0, {
        tag: "label",
        namespace: "html",
        properties: { innerHTML: getString("dialog-url-label") },
      })
      .addCell(
        2,
        0,
        {
          tag: "input",
          id: "openreview-url-input",
          namespace: "html",
          attributes: {
            "data-bind": "url",
            "data-prop": "value",
            type: "text",
            placeholder: "https://openreview.net/group?id=...",
          },
          styles: {
            width: "400px",
            padding: "5px",
          },
        },
        false,
      )
      // Collection name input
      .addCell(3, 0, {
        tag: "label",
        namespace: "html",
        styles: {
          marginTop: "10px",
        },
        properties: { innerHTML: getString("dialog-collection-label") },
      })
      .addCell(
        4,
        0,
        {
          tag: "input",
          id: "openreview-collection-input",
          namespace: "html",
          attributes: {
            "data-bind": "collectionName",
            "data-prop": "value",
            type: "text",
            placeholder: "Workshop Name 2024",
          },
          styles: {
            width: "400px",
            padding: "5px",
          },
        },
        false,
      )
      // Paper filter section
      .addCell(5, 0, {
        tag: "h3",
        styles: {
          marginTop: "15px",
          marginBottom: "5px",
        },
        properties: { innerHTML: getString("dialog-filter-label") },
      })
      // Paper filter radio buttons
      .addCell(
        6,
        0,
        {
          tag: "div",
          namespace: "html",
          styles: {
            display: "flex",
            gap: "15px",
          },
          children: [
            {
              tag: "label",
              namespace: "html",
              children: [
                {
                  tag: "input",
                  namespace: "html",
                  attributes: {
                    type: "radio",
                    name: "paperFilter",
                    value: "all",
                    checked: "true",
                  },
                  listeners: [
                    {
                      type: "change",
                      listener: () => {
                        dialogData.paperFilter = "all";
                      },
                    },
                  ],
                },
                {
                  tag: "span",
                  namespace: "html",
                  properties: {
                    innerHTML: ` ${getString("dialog-filter-all")}`,
                  },
                },
              ],
            },
            {
              tag: "label",
              namespace: "html",
              children: [
                {
                  tag: "input",
                  namespace: "html",
                  attributes: {
                    type: "radio",
                    name: "paperFilter",
                    value: "oral",
                  },
                  listeners: [
                    {
                      type: "change",
                      listener: () => {
                        dialogData.paperFilter = "oral";
                      },
                    },
                  ],
                },
                {
                  tag: "span",
                  namespace: "html",
                  properties: {
                    innerHTML: ` ${getString("dialog-filter-oral")}`,
                  },
                },
              ],
            },
            {
              tag: "label",
              namespace: "html",
              children: [
                {
                  tag: "input",
                  namespace: "html",
                  attributes: {
                    type: "radio",
                    name: "paperFilter",
                    value: "poster",
                  },
                  listeners: [
                    {
                      type: "change",
                      listener: () => {
                        dialogData.paperFilter = "poster";
                      },
                    },
                  ],
                },
                {
                  tag: "span",
                  namespace: "html",
                  properties: {
                    innerHTML: ` ${getString("dialog-filter-poster")}`,
                  },
                },
              ],
            },
          ],
        },
        false,
      )
      // Options section
      .addCell(7, 0, {
        tag: "h3",
        styles: {
          marginTop: "15px",
          marginBottom: "5px",
        },
        properties: { innerHTML: getString("dialog-options-label") },
      })
      // Download PDFs checkbox
      .addCell(
        8,
        0,
        {
          tag: "div",
          namespace: "html",
          children: [
            {
              tag: "input",
              id: "openreview-download-pdfs",
              namespace: "html",
              attributes: {
                "data-bind": "downloadPdfs",
                "data-prop": "checked",
                type: "checkbox",
              },
            },
            {
              tag: "label",
              namespace: "html",
              attributes: {
                for: "openreview-download-pdfs",
              },
              styles: {
                marginLeft: "5px",
              },
              properties: { innerHTML: getString("dialog-download-pdfs") },
            },
          ],
        },
        false,
      )
      // Import reviews checkbox
      .addCell(
        9,
        0,
        {
          tag: "div",
          namespace: "html",
          children: [
            {
              tag: "input",
              id: "openreview-import-reviews",
              namespace: "html",
              attributes: {
                "data-bind": "importReviews",
                "data-prop": "checked",
                type: "checkbox",
              },
            },
            {
              tag: "label",
              namespace: "html",
              attributes: {
                for: "openreview-import-reviews",
              },
              styles: {
                marginLeft: "5px",
              },
              properties: { innerHTML: getString("dialog-import-reviews") },
            },
          ],
        },
        false,
      )
      // Skip duplicates checkbox
      .addCell(
        10,
        0,
        {
          tag: "div",
          namespace: "html",
          children: [
            {
              tag: "input",
              id: "openreview-skip-duplicates",
              namespace: "html",
              attributes: {
                "data-bind": "skipDuplicates",
                "data-prop": "checked",
                type: "checkbox",
              },
            },
            {
              tag: "label",
              namespace: "html",
              attributes: {
                for: "openreview-skip-duplicates",
              },
              styles: {
                marginLeft: "5px",
              },
              properties: { innerHTML: getString("dialog-skip-duplicates") },
            },
          ],
        },
        false,
      )
      .addButton(getString("dialog-import-button"), "import")
      .addButton(getString("dialog-cancel-button"), "cancel")
      .setDialogData(dialogData)
      .open(getString("dialog-title"));

    await dialogData.unloadLock.promise;

    if (dialogData._lastButtonId === "import") {
      // Validate inputs
      if (!dialogData.url) {
        this.showError(getString("error-no-url"));
        return;
      }

      if (!dialogData.collectionName) {
        this.showError(getString("error-no-collection-name"));
        return;
      }

      // Start import
      const options: ImportOptions = {
        url: dialogData.url,
        collectionName: dialogData.collectionName,
        downloadPdfs: dialogData.downloadPdfs,
        importReviews: dialogData.importReviews,
        acceptedOnly: false,
        oralOnly: dialogData.paperFilter === "oral",
        posterOnly: dialogData.paperFilter === "poster",
        skipDuplicates: dialogData.skipDuplicates,
      };

      await this.importFromOpenReview(options);
    }
  }

  /**
   * Main import function
   */
  static async importFromOpenReview(
    options: ImportOptions,
    progressCallback?: ProgressCallback,
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    // Keep the progress window visible for the full import lifecycle.
    const progressWin = new ztoolkit.ProgressWindow(
      getString("progress-title"),
      {
        closeOnClick: false,
        closeTime: -1,
      },
    )
      .createLine({
        text: getString("progress-parsing-url"),
        type: "default",
        progress: 0,
      })
      .show();

    progressWin.win.addDescription(getString("progress-keep-visible"));

    try {
      // Parse URL to get venue info
      const venueInfo = OpenReviewApi.parseVenueFromUrl(options.url);
      if (!venueInfo) {
        throw new Error(getString("error-invalid-url"));
      }

      progressWin.changeLine({
        text: getString("progress-fetching-papers"),
        progress: 10,
      });

      // Build fetch options
      const fetchOptions: FetchOptions = {
        acceptedOnly: options.acceptedOnly,
        oralOnly: options.oralOnly,
        posterOnly: options.posterOnly,
      };

      // Fetch papers
      const papers = await OpenReviewApi.fetchVenueSubmissions(
        venueInfo,
        fetchOptions,
      );

      if (papers.length === 0) {
        progressWin.changeLine({
          text: getString("progress-no-papers"),
          type: "default",
          progress: 100,
        });
        progressWin.startCloseTimer(3000);
        result.success = true;
        return result;
      }

      progressWin.changeLine({
        text: `${getString("progress-creating-collection")} (${papers.length} papers found)`,
        progress: 20,
      });

      // Create collection
      const collection = await CollectionManager.getOrCreateCollection(
        options.collectionName,
      );

      // Import papers
      const total = papers.length;
      for (let i = 0; i < papers.length; i++) {
        const paper = papers[i];
        const progress = 20 + (i / total) * 80;

        progressWin.changeLine({
          text: `${getString("progress-importing")} (${i + 1}/${total}): ${paper.title.substring(0, 50)}...`,
          progress,
        });

        if (progressCallback) {
          progressCallback(i + 1, total, paper.title);
        }

        try {
          // Check for duplicates
          if (options.skipDuplicates) {
            const isDuplicate = await ZoteroItemCreator.isDuplicate(paper);
            if (isDuplicate) {
              result.skipped++;
              continue;
            }
          }

          // Create item
          await ZoteroItemCreator.createItem(paper, collection, {
            downloadPdf: options.downloadPdfs,
            importReviews: options.importReviews,
          });

          result.imported++;
        } catch (error) {
          result.failed++;
          result.errors.push(`${paper.title}: ${error}`);
          ztoolkit.log(`Error importing paper: ${error}`);
        }
      }

      // Show success message
      progressWin.changeLine({
        text: getString("progress-complete", {
          args: {
            imported: result.imported,
            skipped: result.skipped,
            failed: result.failed,
          },
        }),
        type: "success",
        progress: 100,
      });
      progressWin.startCloseTimer(5000);

      result.success = true;
    } catch (error) {
      progressWin.changeLine({
        text: `${getString("progress-error")}: ${error}`,
        type: "fail",
        progress: 100,
      });
      progressWin.startCloseTimer(5000);

      result.errors.push(String(error));
      ztoolkit.log(`Import error: ${error}`);
    }

    return result;
  }

  /**
   * Show error message
   */
  private static showError(message: string): void {
    new ztoolkit.ProgressWindow(getString("error-title"), {
      closeOnClick: true,
      closeTime: 5000,
    })
      .createLine({
        text: message,
        type: "fail",
      })
      .show();
  }
}
