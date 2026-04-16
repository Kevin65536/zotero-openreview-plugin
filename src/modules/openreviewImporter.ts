/**
 * OpenReview Importer
 * Main module for importing papers from OpenReview
 */

import { getString } from "../utils/locale";
import { isWindowAlive } from "../utils/window";
import {
  FetchOptions,
  OpenReviewAcceptedCategory,
  OpenReviewApi,
} from "./openreviewApi";
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
  acceptedCategories: OpenReviewAcceptedCategory[];
  paperFilter: string;
  restrictToAcceptedCategories: boolean;
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

interface ImportDialogData {
  [key: string]: any;
  acceptedCategories: OpenReviewAcceptedCategory[];
  collectionName: string;
  downloadPdfs: boolean;
  importReviews: boolean;
  loadCallback: () => void;
  paperFilter: string;
  paperFilterOptions: PaperFilterOption[];
  paperFilterRequestToken: number;
  paperFilterUsesAcceptedCategories: boolean;
  skipDuplicates: boolean;
  unloadCallback: () => void;
  url: string;
}

interface PaperFilterOption {
  id: string;
  label: string;
}

const PAPER_FILTER_OPTIONS_CONTAINER_ID = "openreview-paper-filter-options";

function buildDefaultPaperFilterOptions(): PaperFilterOption[] {
  return [
    {
      id: "all",
      label: getString("dialog-filter-all"),
    },
    {
      id: "oral",
      label: getString("dialog-filter-oral"),
    },
    {
      id: "poster",
      label: getString("dialog-filter-poster"),
    },
  ];
}

function buildPaperFilterOptionsFromAcceptedCategories(
  acceptedCategories: OpenReviewAcceptedCategory[],
): PaperFilterOption[] {
  return [
    {
      id: "all",
      label: getString("dialog-filter-all-accepted"),
    },
    ...acceptedCategories.map((acceptedCategory) => ({
      id: acceptedCategory.id,
      label: acceptedCategory.tabLabel,
    })),
  ];
}

function buildAcceptedCategoriesFromPaperFilterOptions(
  paperFilterOptions: PaperFilterOption[],
): OpenReviewAcceptedCategory[] {
  return paperFilterOptions
    .filter((paperFilterOption) => paperFilterOption.id !== "all")
    .map((paperFilterOption) => ({
      id: paperFilterOption.id,
      label: paperFilterOption.id,
      tabLabel: paperFilterOption.label,
    }));
}

function normalizePaperFilterSelection(
  paperFilter: string,
  paperFilterOptions: PaperFilterOption[],
): string {
  if (
    paperFilterOptions.some(
      (paperFilterOption) => paperFilterOption.id === paperFilter,
    )
  ) {
    return paperFilter;
  }
  return "all";
}

interface ImportProgressState {
  detail: string;
  failed: number;
  imported: number;
  message: string;
  progress: number;
  skipped: number;
  total: number;
}

function getProcessedCount(
  result: Pick<ImportResult, "imported" | "skipped" | "failed">,
): number {
  return result.imported + result.skipped + result.failed;
}

function getImportProgress(progressCount: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return (progressCount / total) * 100;
}

function truncateProgressText(text: string, maxLength = 100): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

class ImportProgressDialog {
  private static readonly closeButtonId = "openreview-import-progress-close";

  private static readonly detailId = "openreview-import-progress-detail";

  private static readonly noticeId = "openreview-import-progress-notice";

  private static readonly pauseButtonId = "openreview-import-progress-pause";

  private static readonly progressFillId = "openreview-import-progress-fill";

  private static readonly progressLabelId = "openreview-import-progress-label";

  private static readonly statusId = "openreview-import-progress-status";

  private static readonly summaryId = "openreview-import-progress-summary";

  private allowClose = false;

  private autoCloseVersion = 0;

  private cancelRequested = false;

  private closeBlocked = false;

  private dialogWindow?: Window;

  private pauseRequested = false;

  private reopenPending = false;

  private resumeResolver?: () => void;

  private state: ImportProgressState = {
    detail: getString("progress-detail-pending"),
    failed: 0,
    imported: 0,
    message: getString("progress-parsing-url"),
    progress: 0,
    skipped: 0,
    total: 0,
  };

  private waitingForResume = false;

  open(): void {
    const dialogWindow = this.getDialogWindow();
    if (dialogWindow) {
      dialogWindow.focus();
      this.render();
      return;
    }

    const dialogData = {
      loadCallback: () => {
        this.attachCloseGuard();
        this.render();
      },
      unloadCallback: () => {
        if (
          !this.allowClose &&
          !this.reopenPending &&
          addon.data.alive !== false
        ) {
          this.closeBlocked = true;
          this.reopenPending = true;
          void Zotero.Promise.delay(0).then(() => {
            this.reopenPending = false;
            if (!this.allowClose && addon.data.alive !== false) {
              this.open();
            }
          });
        }
      },
    };

    const dialogHelper = new ztoolkit.Dialog(6, 1)
      .addCell(0, 0, {
        tag: "h2",
        namespace: "html",
        styles: {
          margin: "0 0 8px 0",
        },
        properties: { innerHTML: getString("progress-title") },
      })
      .addCell(1, 0, {
        tag: "p",
        namespace: "html",
        id: ImportProgressDialog.noticeId,
        styles: {
          fontSize: "13px",
          lineHeight: "1.5",
          margin: "0 0 12px 0",
        },
        properties: { innerHTML: this.getNoticeText() },
      })
      .addCell(2, 0, {
        tag: "div",
        namespace: "html",
        styles: {
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          minWidth: "100%",
          width: "100%",
        },
        children: [
          {
            tag: "div",
            namespace: "html",
            styles: {
              background: "#d7dce2",
              borderRadius: "999px",
              minWidth: "100%",
              height: "14px",
              overflow: "hidden",
              width: "100%",
            },
            children: [
              {
                tag: "div",
                namespace: "html",
                id: ImportProgressDialog.progressFillId,
                styles: {
                  background:
                    "linear-gradient(90deg, #3d6ea8 0%, #5aa0d6 100%)",
                  height: "100%",
                  transition: "width 160ms ease",
                  width: "0%",
                },
                properties: { innerHTML: "&nbsp;" },
              },
            ],
          },
          {
            tag: "div",
            namespace: "html",
            id: ImportProgressDialog.progressLabelId,
            styles: {
              color: "#4a4a4a",
              fontSize: "12px",
            },
            properties: { innerHTML: "0%" },
          },
        ],
      })
      .addCell(3, 0, {
        tag: "p",
        namespace: "html",
        id: ImportProgressDialog.statusId,
        styles: {
          fontWeight: "600",
          lineHeight: "1.4",
          margin: "12px 0 6px 0",
        },
        properties: { innerHTML: this.state.message },
      })
      .addCell(4, 0, {
        tag: "p",
        namespace: "html",
        id: ImportProgressDialog.summaryId,
        styles: {
          color: "#4a4a4a",
          fontSize: "12px",
          lineHeight: "1.4",
          margin: "0 0 6px 0",
        },
        properties: { innerHTML: this.getSummaryText() },
      })
      .addCell(5, 0, {
        tag: "p",
        namespace: "html",
        id: ImportProgressDialog.detailId,
        styles: {
          color: "#4a4a4a",
          fontSize: "12px",
          lineHeight: "1.5",
          margin: "0",
          wordBreak: "break-word",
        },
        properties: { innerHTML: this.state.detail },
      })
      .addButton(
        getString("progress-pause-button"),
        ImportProgressDialog.pauseButtonId,
        {
          noClose: true,
          callback: () => {
            this.togglePause();
          },
        },
      )
      .addButton(
        getString("progress-close-button"),
        ImportProgressDialog.closeButtonId,
        {
          noClose: true,
          callback: () => {
            this.handleCloseRequest();
          },
        },
      )
      .setDialogData(dialogData)
      .open(getString("progress-title"), {
        alwaysRaised: true,
        fitContent: false,
        height: 280,
        resizable: false,
        width: 640,
      });

    this.dialogWindow = dialogHelper.window;
  }

  update(nextState: Partial<ImportProgressState>): void {
    this.state = {
      ...this.state,
      ...nextState,
    };
    if (!this.allowClose) {
      this.closeBlocked = false;
    }
    this.render();
  }

  async waitIfPaused(): Promise<boolean> {
    while (this.pauseRequested && !this.cancelRequested) {
      this.waitingForResume = true;
      this.render();
      await new Promise<void>((resolve) => {
        this.resumeResolver = resolve;
      });
      this.resumeResolver = undefined;
    }
    this.waitingForResume = false;
    this.render();
    return !this.cancelRequested;
  }

  finish(nextState: Partial<ImportProgressState>, closeDelayMs: number): void {
    this.allowClose = true;
    this.autoCloseVersion += 1;
    this.closeBlocked = false;
    this.pauseRequested = false;
    this.waitingForResume = false;
    if (this.resumeResolver) {
      this.resumeResolver();
      this.resumeResolver = undefined;
    }
    this.update(nextState);
    this.scheduleAutoClose(closeDelayMs);
  }

  private attachCloseGuard(): void {
    const dialogWindow = this.getDialogWindow();
    if (!dialogWindow) {
      return;
    }
    dialogWindow.addEventListener("beforeunload", this.handleBeforeUnload);
  }

  private getDialogWindow(): Window | undefined {
    const dialogWindow = this.dialogWindow;
    if (!dialogWindow || !isWindowAlive(dialogWindow)) {
      return undefined;
    }
    return dialogWindow;
  }

  private getNoticeText(): string {
    if (this.allowClose) {
      return getString("progress-ready-to-close");
    }
    if (this.closeBlocked) {
      return getString("progress-close-blocked");
    }
    if (this.waitingForResume) {
      return getString("progress-paused");
    }
    if (this.pauseRequested) {
      return getString("progress-pause-requested");
    }
    return getString("progress-keep-visible");
  }

  private getSummaryText(): string {
    return getString("progress-summary", {
      args: {
        failed: this.state.failed,
        imported: this.state.imported,
        processed: this.state.imported + this.state.skipped + this.state.failed,
        skipped: this.state.skipped,
        total: this.state.total,
      },
    });
  }

  private canCancelByClosing(): boolean {
    return this.waitingForResume;
  }

  private handleBeforeUnload = (event: Event): void => {
    if (this.allowClose) {
      return;
    }
    if (this.canCancelByClosing()) {
      this.requestCancellation();
      return;
    }
    event.preventDefault();
    if ("returnValue" in event) {
      event.returnValue = false;
    }
    this.closeBlocked = true;
    this.render();
  };

  private handleCloseRequest(): void {
    if (this.canCancelByClosing()) {
      this.requestCancellation();
      const dialogWindow = this.getDialogWindow();
      if (dialogWindow) {
        dialogWindow.close();
      }
      return;
    }

    if (!this.allowClose) {
      this.closeBlocked = true;
      this.render();
      return;
    }

    this.autoCloseVersion += 1;
    const dialogWindow = this.getDialogWindow();
    if (dialogWindow) {
      dialogWindow.close();
    }
  }

  private render(): void {
    const dialogWindow = this.getDialogWindow();
    if (!dialogWindow) {
      return;
    }

    const normalizedProgress = Math.max(0, Math.min(100, this.state.progress));
    this.setText(ImportProgressDialog.noticeId, this.getNoticeText());
    this.setText(ImportProgressDialog.statusId, this.state.message);
    this.setText(ImportProgressDialog.summaryId, this.getSummaryText());
    this.setText(ImportProgressDialog.detailId, this.state.detail);
    this.setText(
      ImportProgressDialog.progressLabelId,
      `${Math.round(normalizedProgress)}%`,
    );

    const progressFill = dialogWindow.document.getElementById(
      ImportProgressDialog.progressFillId,
    ) as HTMLElement | null;
    if (progressFill) {
      progressFill.style.width = `${normalizedProgress}%`;
    }

    const pauseButton = dialogWindow.document.getElementById(
      ImportProgressDialog.pauseButtonId,
    ) as HTMLButtonElement | null;
    if (pauseButton) {
      pauseButton.disabled = this.allowClose;
      pauseButton.textContent =
        this.pauseRequested || this.waitingForResume
          ? getString("progress-resume-button")
          : getString("progress-pause-button");
    }

    const closeButton = dialogWindow.document.getElementById(
      ImportProgressDialog.closeButtonId,
    ) as HTMLButtonElement | null;
    if (closeButton) {
      closeButton.disabled = !this.allowClose && !this.canCancelByClosing();
    }
  }

  private requestCancellation(): void {
    if (this.cancelRequested) {
      return;
    }
    this.cancelRequested = true;
    this.allowClose = true;
    this.autoCloseVersion += 1;
    this.closeBlocked = false;
    this.pauseRequested = false;
    this.waitingForResume = false;
    if (this.resumeResolver) {
      this.resumeResolver();
      this.resumeResolver = undefined;
    }
  }

  wasCancelled(): boolean {
    return this.cancelRequested;
  }

  private scheduleAutoClose(closeDelayMs: number): void {
    const closeVersion = ++this.autoCloseVersion;
    void Zotero.Promise.delay(closeDelayMs).then(() => {
      if (closeVersion !== this.autoCloseVersion || !this.allowClose) {
        return;
      }
      const dialogWindow = this.getDialogWindow();
      if (dialogWindow) {
        dialogWindow.close();
      }
    });
  }

  private setText(elementId: string, text: string): void {
    const dialogWindow = this.getDialogWindow();
    if (!dialogWindow) {
      return;
    }
    const element = dialogWindow.document.getElementById(elementId);
    if (element) {
      element.textContent = text;
    }
  }

  private togglePause(): void {
    if (this.allowClose) {
      return;
    }
    this.closeBlocked = false;
    if (this.pauseRequested || this.waitingForResume) {
      this.pauseRequested = false;
      this.waitingForResume = false;
      if (this.resumeResolver) {
        this.resumeResolver();
        this.resumeResolver = undefined;
      }
      this.render();
      return;
    }

    this.pauseRequested = true;
    this.render();
  }
}

/**
 * OpenReview Importer class
 */
export class OpenReviewImporter {
  private static attachPaperFilterAutoDetection(
    dialogWindow: Window,
    dialogData: ImportDialogData,
  ): void {
    this.renderPaperFilterOptions(dialogWindow, dialogData);

    const urlInput = dialogWindow.document.getElementById(
      "openreview-url-input",
    ) as HTMLInputElement | null;
    if (!urlInput) {
      return;
    }

    let debounceHandle: ReturnType<typeof setTimeout> | undefined;
    const refreshPaperFilters = async () => {
      dialogData.url = urlInput.value.trim();
      await this.refreshPaperFilterOptionsFromUrl(dialogWindow, dialogData);
    };

    const scheduleRefresh = () => {
      if (debounceHandle) {
        clearTimeout(debounceHandle);
      }
      debounceHandle = setTimeout(() => {
        void refreshPaperFilters();
      }, 350);
    };

    urlInput.addEventListener("input", scheduleRefresh);
    urlInput.addEventListener("change", () => {
      void refreshPaperFilters();
    });
  }

  private static async refreshPaperFilterOptionsFromUrl(
    dialogWindow: Window,
    dialogData: ImportDialogData,
  ): Promise<void> {
    const url = dialogData.url.trim();
    const requestToken = ++dialogData.paperFilterRequestToken;

    if (!url || !OpenReviewApi.parseVenueFromUrl(url)) {
      dialogData.acceptedCategories = [];
      dialogData.paperFilterOptions = buildDefaultPaperFilterOptions();
      dialogData.paperFilterUsesAcceptedCategories = false;
      dialogData.paperFilter = normalizePaperFilterSelection(
        dialogData.paperFilter,
        dialogData.paperFilterOptions,
      );
      this.renderPaperFilterOptions(dialogWindow, dialogData);
      return;
    }

    const acceptedCategories = await OpenReviewApi.fetchAcceptedCategories(url);
    if (requestToken !== dialogData.paperFilterRequestToken) {
      return;
    }

    dialogData.acceptedCategories = acceptedCategories;
    dialogData.paperFilterOptions =
      acceptedCategories.length > 0
        ? buildPaperFilterOptionsFromAcceptedCategories(acceptedCategories)
        : buildDefaultPaperFilterOptions();
    dialogData.paperFilterUsesAcceptedCategories =
      acceptedCategories.length > 0;
    dialogData.paperFilter = normalizePaperFilterSelection(
      dialogData.paperFilter,
      dialogData.paperFilterOptions,
    );
    this.renderPaperFilterOptions(dialogWindow, dialogData);
  }

  private static renderPaperFilterOptions(
    dialogWindow: Window,
    dialogData: ImportDialogData,
  ): void {
    const filterOptionsContainer = dialogWindow.document.getElementById(
      PAPER_FILTER_OPTIONS_CONTAINER_ID,
    );
    if (!filterOptionsContainer) {
      return;
    }

    filterOptionsContainer.replaceChildren();
    for (const paperFilterOption of dialogData.paperFilterOptions) {
      const optionLabel = dialogWindow.document.createElement("label");
      optionLabel.style.alignItems = "center";
      optionLabel.style.display = "inline-flex";
      optionLabel.style.gap = "4px";

      const optionInput = dialogWindow.document.createElement("input");
      optionInput.type = "radio";
      optionInput.name = "paperFilter";
      optionInput.value = paperFilterOption.id;
      optionInput.checked = dialogData.paperFilter === paperFilterOption.id;
      optionInput.addEventListener("change", () => {
        dialogData.paperFilter = paperFilterOption.id;
      });

      const optionText = dialogWindow.document.createElement("span");
      optionText.textContent = paperFilterOption.label;

      optionLabel.append(optionInput, optionText);
      filterOptionsContainer.appendChild(optionLabel);
    }
  }

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
    const dialogData: ImportDialogData = {
      acceptedCategories: [],
      url: "",
      collectionName: "",
      downloadPdfs: true,
      importReviews: false,
      paperFilter: "all", // "all", "oral", "poster"
      paperFilterOptions: buildDefaultPaperFilterOptions(),
      paperFilterRequestToken: 0,
      paperFilterUsesAcceptedCategories: false,
      skipDuplicates: true,
      loadCallback: () => {
        ztoolkit.log("Import dialog opened");
        this.attachPaperFilterAutoDetection(dialogHelper.window, dialogData);
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
          id: PAPER_FILTER_OPTIONS_CONTAINER_ID,
          styles: {
            display: "flex",
            flexWrap: "wrap",
            gap: "15px",
          },
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

      const acceptedCategoriesFromUrl =
        await OpenReviewApi.fetchAcceptedCategories(dialogData.url);
      const restrictToAcceptedCategories =
        acceptedCategoriesFromUrl.length > 0 ||
        dialogData.paperFilterUsesAcceptedCategories;
      const acceptedCategories =
        acceptedCategoriesFromUrl.length > 0
          ? acceptedCategoriesFromUrl
          : dialogData.acceptedCategories.length > 0
            ? dialogData.acceptedCategories
            : dialogData.paperFilter === "all"
              ? []
              : buildAcceptedCategoriesFromPaperFilterOptions(
                  dialogData.paperFilterOptions,
                );

      // Start import
      const options: ImportOptions = {
        url: dialogData.url,
        collectionName: dialogData.collectionName,
        downloadPdfs: dialogData.downloadPdfs,
        importReviews: dialogData.importReviews,
        acceptedCategories,
        paperFilter: dialogData.paperFilter,
        restrictToAcceptedCategories,
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

    const progressDialog = new ImportProgressDialog();
    progressDialog.open();

    try {
      // Parse URL to get venue info
      const venueInfo = OpenReviewApi.parseVenueFromUrl(options.url);
      if (!venueInfo) {
        throw new Error(getString("error-invalid-url"));
      }

      progressDialog.update({
        message: getString("progress-fetching-papers"),
        progress: 0,
      });

      if (!(await progressDialog.waitIfPaused())) {
        return result;
      }

      // Build fetch options
      const fetchOptions: FetchOptions = {
        acceptedCategories: options.acceptedCategories,
        restrictToAcceptedCategories: options.restrictToAcceptedCategories,
        selectedAcceptedCategory:
          options.paperFilter === "all" ? undefined : options.paperFilter,
      };

      // Fetch papers
      const papers = await OpenReviewApi.fetchVenueSubmissions(
        venueInfo,
        fetchOptions,
      );

      if (papers.length === 0) {
        progressDialog.finish(
          {
            detail: getString("progress-ready-to-close"),
            message: getString("progress-no-papers"),
            progress: 100,
          },
          3000,
        );
        result.success = true;
        return result;
      }

      progressDialog.update({
        detail: getString("progress-found-papers", {
          args: { count: papers.length },
        }),
        message: getString("progress-creating-collection"),
        progress: 0,
        total: papers.length,
      });

      if (!(await progressDialog.waitIfPaused())) {
        return result;
      }

      // Create collection
      const collection = await CollectionManager.getOrCreateCollection(
        options.collectionName,
      );

      // Import papers
      const total = papers.length;
      for (let i = 0; i < papers.length; i++) {
        const paper = papers[i];
        progressDialog.update({
          detail: getString("progress-current-paper", {
            args: {
              title: truncateProgressText(paper.title),
            },
          }),
          failed: result.failed,
          imported: result.imported,
          message: getString("progress-importing-current", {
            args: {
              current: i + 1,
              total,
            },
          }),
          progress: getImportProgress(getProcessedCount(result), total),
          skipped: result.skipped,
          total,
        });

        if (!(await progressDialog.waitIfPaused())) {
          return result;
        }

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

        progressDialog.update({
          failed: result.failed,
          imported: result.imported,
          progress: getImportProgress(getProcessedCount(result), total),
          skipped: result.skipped,
          total,
        });

        if (progressDialog.wasCancelled()) {
          return result;
        }
      }

      progressDialog.finish(
        {
          detail: getString("progress-ready-to-close"),
          failed: result.failed,
          imported: result.imported,
          message: getString("progress-complete", {
            args: {
              failed: result.failed,
              imported: result.imported,
              skipped: result.skipped,
            },
          }),
          progress: 100,
          skipped: result.skipped,
          total,
        },
        5000,
      );

      result.success = true;
    } catch (error) {
      progressDialog.finish(
        {
          detail: getString("progress-ready-to-close"),
          failed: result.failed,
          imported: result.imported,
          message: `${getString("progress-error")}: ${error}`,
          progress: 100,
          skipped: result.skipped,
        },
        5000,
      );

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
