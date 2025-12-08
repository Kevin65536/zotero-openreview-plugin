/**
 * Zotero Item Creator
 * Creates Zotero items from OpenReview paper data
 */

import {
    OpenReviewPaper,
    OpenReviewComment,
    OpenReviewApi,
} from "./openreviewApi";

interface CreatorData {
    firstName?: string;
    lastName?: string;
    name?: string;
    creatorType: string;
}

export class ZoteroItemCreator {
    /**
     * Create a Zotero item from an OpenReview paper
     */
    static async createItem(
        paper: OpenReviewPaper,
        collection: Zotero.Collection,
        options: {
            downloadPdf?: boolean;
            importReviews?: boolean;
        } = {},
    ): Promise<Zotero.Item> {
        const libraryID = Zotero.Libraries.userLibraryID;

        // Create conference paper item
        const item = new Zotero.Item("conferencePaper");
        (item as any).libraryID = libraryID;

        // Set basic fields
        item.setField("title", paper.title);
        item.setField("abstractNote", paper.abstract);
        item.setField("conferenceName", paper.venue);
        item.setField("proceedingsTitle", paper.venue);
        item.setField("date", paper.year.toString());
        item.setField("url", paper.forumUrl);

        // Set extra field with additional metadata
        const extraParts: string[] = [];
        if (paper.decision) {
            extraParts.push(`Decision: ${paper.decision}`);
        }
        if (paper.presentationType && paper.presentationType !== "unknown") {
            extraParts.push(`Presentation: ${paper.presentationType}`);
        }
        extraParts.push(`OpenReview ID: ${paper.id}`);
        if (paper.number) {
            extraParts.push(`Paper Number: ${paper.number}`);
        }
        item.setField("extra", extraParts.join("\n"));

        // Add creators (authors)
        const creators: CreatorData[] = paper.authors.map((author) => {
            // Try to split name into first and last
            const nameParts = author.name.trim().split(/\s+/);
            if (nameParts.length >= 2) {
                return {
                    firstName: nameParts.slice(0, -1).join(" "),
                    lastName: nameParts[nameParts.length - 1],
                    creatorType: "author",
                };
            } else {
                return {
                    name: author.name,
                    creatorType: "author",
                };
            }
        });
        item.setCreators(creators as any);

        // Add tags from keywords
        for (const keyword of paper.keywords) {
            item.addTag(keyword, 0);
        }

        // Add venue tag
        item.addTag(`OpenReview:${paper.venueId}`, 0);

        // Add to collection BEFORE saving so the item is created in the collection
        item.addToCollection(collection.id);

        // Save item
        await item.saveTx();

        ztoolkit.log(`Created item: ${paper.title} in collection ${collection.name}`);

        // Download PDF if requested
        if (options.downloadPdf && paper.pdfUrl) {
            await this.attachPdfFromUrl(item, paper.pdfUrl, `${paper.title}.pdf`);
        }

        // Import reviews if requested
        if (options.importReviews) {
            await this.importReviewsAsNotes(item, paper.id);
        }

        return item;
    }

    /**
     * Attach PDF from URL to an item
     */
    static async attachPdfFromUrl(
        parentItem: Zotero.Item,
        url: string,
        filename: string,
    ): Promise<Zotero.Item | null> {
        try {
            // Clean filename
            const cleanFilename = filename.replace(/[<>:"/\\|?*]/g, "_");

            // Import PDF as attachment
            const attachment = await Zotero.Attachments.importFromURL({
                url,
                parentItemID: parentItem.id,
                title: cleanFilename,
                contentType: "application/pdf",
            });

            ztoolkit.log(`Attached PDF: ${cleanFilename}`);
            return attachment;
        } catch (error) {
            ztoolkit.log(`Error attaching PDF: ${error}`);
            return null;
        }
    }

    /**
     * Import reviews and comments as Zotero notes
     */
    static async importReviewsAsNotes(
        parentItem: Zotero.Item,
        paperId: string,
    ): Promise<void> {
        try {
            const comments = await OpenReviewApi.fetchPaperReplies(paperId);

            for (const comment of comments) {
                await this.createNoteFromComment(parentItem, comment);
            }

            ztoolkit.log(`Imported ${comments.length} reviews/comments`);
        } catch (error) {
            ztoolkit.log(`Error importing reviews: ${error}`);
        }
    }

    /**
     * Create a Zotero note from an OpenReview comment/review
     */
    static async createNoteFromComment(
        parentItem: Zotero.Item,
        comment: OpenReviewComment,
    ): Promise<Zotero.Item> {
        const note = new Zotero.Item("note");
        (note as any).libraryID = parentItem.libraryID;
        note.parentID = parentItem.id;

        // Format the note content
        const typeLabel =
            comment.type === "review"
                ? "Official Review"
                : comment.type === "meta-review"
                    ? "Meta Review"
                    : comment.type === "decision"
                        ? "Decision"
                        : "Comment";

        const dateStr = new Date(comment.date).toLocaleDateString();

        const noteContent = `
<h1>${typeLabel}: ${comment.title}</h1>
<p><strong>By:</strong> ${comment.signature}</p>
<p><strong>Date:</strong> ${dateStr}</p>
<hr/>
<div>${this.formatReviewContent(comment.content)}</div>
<hr/>
<p><em>Source: <a href="https://openreview.net/forum?id=${comment.replyTo}&noteId=${comment.id}">OpenReview</a></em></p>
`.trim();

        note.setNote(noteContent);
        await note.saveTx();

        return note;
    }

    /**
     * Format review content for HTML display
     */
    private static formatReviewContent(content: string): string {
        // Convert markdown-style formatting to HTML
        return content
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\n\n/g, "</p><p>")
            .replace(/\n/g, "<br/>");
    }

    /**
     * Check if a paper already exists in the library (by title or OpenReview ID)
     */
    static async isDuplicate(paper: OpenReviewPaper): Promise<boolean> {
        const libraryID = Zotero.Libraries.userLibraryID;

        // Search by title
        const search = new Zotero.Search();
        (search as any).libraryID = libraryID;
        search.addCondition("title", "is", paper.title);

        const ids = await search.search();
        if (ids.length > 0) {
            return true;
        }

        // Also search by OpenReview ID in extra field
        const searchExtra = new Zotero.Search();
        (searchExtra as any).libraryID = libraryID;
        searchExtra.addCondition("extra", "contains", `OpenReview ID: ${paper.id}`);

        const extraIds = await searchExtra.search();
        return extraIds.length > 0;
    }
}
