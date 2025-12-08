/**
 * Collection Manager
 * Handles creating and managing Zotero collections for OpenReview imports
 */

export class CollectionManager {
  /**
   * Get or create a collection with the given name
   * If a collection with the name already exists, return it
   */
  static async getOrCreateCollection(
    name: string,
    parentId?: number,
  ): Promise<Zotero.Collection> {
    const libraryID = Zotero.Libraries.userLibraryID;

    // Search for existing collection with same name
    const collections = Zotero.Collections.getByLibrary(libraryID);
    for (const collection of collections) {
      if (collection.name === name) {
        // If parentId matches (or both are undefined), return existing
        if (parentId === collection.parentID) {
          ztoolkit.log(`Found existing collection: ${name}`);
          return collection;
        }
      }
    }

    // Create new collection
    ztoolkit.log(`Creating new collection: ${name}`);
    const collection = new Zotero.Collection({
      libraryID,
      name,
      parentID: parentId,
    });

    await collection.saveTx();
    return collection;
  }

  /**
   * Add an item to a collection
   */
  static async addItemToCollection(
    item: Zotero.Item,
    collection: Zotero.Collection,
  ): Promise<void> {
    if (!collection.hasItem(item.id)) {
      collection.addItem(item.id);
      await collection.saveTx();
    }
  }

  /**
   * Create a nested collection structure for organizing papers
   * e.g., "Workshop Name 2024" -> "Accepted" / "All"
   */
  static async createImportCollections(
    baseName: string,
    createSubfolders: boolean = false,
  ): Promise<{
    main: Zotero.Collection;
    accepted?: Zotero.Collection;
    reviews?: Zotero.Collection;
  }> {
    const main = await this.getOrCreateCollection(baseName);

    if (!createSubfolders) {
      return { main };
    }

    const accepted = await this.getOrCreateCollection("Accepted", main.id);
    const reviews = await this.getOrCreateCollection(
      "Papers with Reviews",
      main.id,
    );

    return { main, accepted, reviews };
  }
}
