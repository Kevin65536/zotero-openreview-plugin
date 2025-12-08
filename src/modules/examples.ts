/**
 * Examples module - placeholder
 * This file is kept for compatibility but the examples are disabled
 */

// Empty placeholder classes to prevent import errors
export class BasicExampleFactory {
  static registerPrefs() { }
  static registerNotifier() { }
  static exampleNotifierCallback() { }
}

export class KeyExampleFactory {
  static registerShortcuts() { }
  static exampleShortcutLargerCallback() { }
  static exampleShortcutSmallerCallback() { }
}

export class UIExampleFactory {
  static registerStyleSheet(_win: any) { }
  static registerRightClickMenuItem() { }
  static registerRightClickMenuPopup(_win: any) { }
  static registerWindowMenuWithSeparator() { }
  static async registerExtraColumn() { }
  static async registerExtraColumnWithCustomCell() { }
  static registerItemPaneCustomInfoRow() { }
  static registerItemPaneSection() { }
  static registerReaderItemPaneSection() { }
}

export class PromptExampleFactory {
  static registerNormalCommandExample() { }
  static registerAnonymousCommandExample(_win: any) { }
  static registerConditionalCommandExample() { }
}

export class HelperExampleFactory {
  static async dialogExample() { }
  static clipboardExample() { }
  static async filePickerExample() { }
  static progressWindowExample() { }
  static vtableExample() { }
}
