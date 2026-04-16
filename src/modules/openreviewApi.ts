/**
 * OpenReview API Service
 * Handles fetching papers from OpenReview venues and workshops
 */

// OpenReview API V2 base URL
const OPENREVIEW_API_BASE = "https://api2.openreview.net";

const ACCEPTED_CATEGORY_TAB_REGEX = /Accept\s*\(([^)]+)\)/gi;

const CATEGORY_MATCH_FIELDS = [
  "presentation_type",
  "presentation",
  "decision",
  "venue",
  "submission_venue",
  "session",
  "track",
  "category",
] as const;

const CATEGORY_MATCH_FIELD_HINTS = [
  "accept",
  "category",
  "decision",
  "presentation",
  "session",
  "track",
  "venue",
] as const;

/**
 * Represents a paper from OpenReview
 */
export interface OpenReviewPaper {
  id: string;
  title: string;
  authors: Author[];
  abstract: string;
  keywords: string[];
  pdfUrl: string;
  venue: string;
  venueId: string;
  year: number;
  forumUrl: string;
  decision?: string;
  presentationType?: string;
  number?: number;
}

export interface OpenReviewAcceptedCategory {
  id: string;
  label: string;
  tabLabel: string;
}

/**
 * Author information
 */
export interface Author {
  name: string;
  email?: string;
  affiliation?: string;
}

/**
 * Review/Comment from OpenReview
 */
export interface OpenReviewComment {
  id: string;
  title: string;
  content: string;
  authors: string[];
  replyTo: string;
  signature: string;
  date: number;
  type: "review" | "comment" | "decision" | "meta-review";
}

/**
 * Venue information parsed from URL
 */
export interface VenueInfo {
  venueId: string;
  submissionInvitation: string;
  baseUrl: string;
}

/**
 * Filter options for fetching papers
 */
export interface FetchOptions {
  acceptedCategories?: OpenReviewAcceptedCategory[];
  restrictToAcceptedCategories?: boolean;
  selectedAcceptedCategory?: string;
}

function collectTextCandidates(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextCandidates(item));
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [String(value)];
  }

  if (typeof value === "object") {
    if ("value" in value) {
      return collectTextCandidates((value as { value: unknown }).value);
    }
  }

  return [];
}

function normalizeCategoryMatchText(value: string): string {
  return ` ${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function normalizeCategoryId(value: string): string {
  return normalizeCategoryMatchText(value).trim();
}

function matchesAcceptedCategory(value: string, categoryId: string): boolean {
  const normalizedValue = normalizeCategoryMatchText(value);
  return normalizedValue.includes(` ${normalizeCategoryId(categoryId)} `);
}

function shouldInspectCategoryField(fieldName: string): boolean {
  const normalizedFieldName = normalizeCategoryMatchText(fieldName);
  return CATEGORY_MATCH_FIELD_HINTS.some((hint) =>
    normalizedFieldName.includes(` ${hint} `),
  );
}

/**
 * OpenReview API Service class
 */
export class OpenReviewApi {
  /**
   * Parse venue information from an OpenReview URL
   * Supports formats:
   * - https://openreview.net/group?id=VENUE_ID
   * - https://openreview.net/venue?id=VENUE_ID
   */
  static parseVenueFromUrl(url: string): VenueInfo | null {
    try {
      const urlObj = new URL(url);

      // Check if it's an openreview.net URL
      if (!urlObj.hostname.includes("openreview.net")) {
        return null;
      }

      // Try to extract venue ID from query parameters
      const venueId =
        urlObj.searchParams.get("id") || urlObj.searchParams.get("venue");

      if (!venueId) {
        return null;
      }

      // Construct submission invitation based on venue ID patterns
      const submissionInvitation = `${venueId}/-/Submission`;

      return {
        venueId,
        submissionInvitation,
        baseUrl: OPENREVIEW_API_BASE,
      };
    } catch {
      return null;
    }
  }

  static async fetchAcceptedCategories(
    url: string,
  ): Promise<OpenReviewAcceptedCategory[]> {
    try {
      const urlObj = new URL(url);
      if (!urlObj.hostname.includes("openreview.net")) {
        return [];
      }

      urlObj.hash = "";
      const response = await Zotero.HTTP.request("GET", urlObj.toString(), {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        },
      });

      const html = String(response.responseText || response.response || "");
      return this.extractAcceptedCategoriesFromHtml(html);
    } catch (error) {
      ztoolkit.log(`Error fetching accepted categories: ${error}`);
      return [];
    }
  }

  /**
   * Fetch all submissions for a venue
   */
  static async fetchVenueSubmissions(
    venueInfo: VenueInfo,
    options: FetchOptions = {},
  ): Promise<OpenReviewPaper[]> {
    const papers: OpenReviewPaper[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    ztoolkit.log(`Fetching papers for venue: ${venueInfo.venueId}`);

    while (hasMore) {
      // Build API URL for fetching notes - use encodeURIComponent for special chars
      const encodedVenueId = encodeURIComponent(venueInfo.venueId);
      const apiUrl = `${venueInfo.baseUrl}/notes?content.venueid=${encodedVenueId}&limit=${limit}&offset=${offset}`;

      ztoolkit.log(`API URL: ${apiUrl}`);

      try {
        // Use Zotero's HTTP request method
        const response = await Zotero.HTTP.request("GET", apiUrl, {
          headers: {
            Accept: "application/json",
          },
          responseType: "json",
        });

        ztoolkit.log(`Response status: ${response.status}`);

        const data = response.response as {
          notes: any[];
          count: number;
        };

        ztoolkit.log(`Found ${data.notes?.length || 0} notes in this batch`);

        if (!data.notes || data.notes.length === 0) {
          hasMore = false;
          break;
        }

        // Parse each note into OpenReviewPaper
        for (const note of data.notes) {
          const paper = this.parseNoteToOpenReviewPaper(
            note,
            venueInfo,
            options.acceptedCategories || [],
          );
          if (paper) {
            if (
              options.restrictToAcceptedCategories &&
              !paper.presentationType
            ) {
              continue;
            }

            if (options.selectedAcceptedCategory) {
              if (
                !paper.presentationType ||
                normalizeCategoryId(paper.presentationType) !==
                  normalizeCategoryId(options.selectedAcceptedCategory)
              ) {
                continue;
              }
            }

            papers.push(paper);
          }
        }

        offset += limit;
        if (data.notes.length < limit) {
          hasMore = false;
        }
      } catch (error) {
        ztoolkit.log(`Error fetching submissions: ${error}`);
        throw error;
      }
    }

    ztoolkit.log(`Total papers after filtering: ${papers.length}`);
    return papers;
  }

  /**
   * Parse an OpenReview note object into OpenReviewPaper
   */
  private static parseNoteToOpenReviewPaper(
    note: any,
    venueInfo: VenueInfo,
    acceptedCategories: OpenReviewAcceptedCategory[] = [],
  ): OpenReviewPaper | null {
    try {
      const content = note.content || {};

      // Extract title - API V2 uses nested value structure
      const title = this.extractValue(content.title);
      if (!title) {
        return null;
      }

      // Extract authors
      const authorNames = this.extractValue(content.authors) || [];
      const authorEmails = this.extractValue(content.authorids) || [];
      const authors: Author[] = authorNames.map(
        (name: string, index: number) => ({
          name,
          email: authorEmails[index] || undefined,
        }),
      );

      // Extract abstract
      const abstract = this.extractValue(content.abstract) || "";

      // Extract keywords
      const keywords = this.extractValue(content.keywords) || [];

      // Extract venue and decision
      const venue = this.extractValue(content.venue) || venueInfo.venueId;
      const decision = this.extractValue(content.decision);
      const matchedCategory = this.matchAcceptedCategory(
        content,
        acceptedCategories,
      );

      // Construct PDF URL
      const pdfPath = this.extractValue(content.pdf) || `/pdf?id=${note.id}`;
      const pdfUrl = pdfPath.startsWith("http")
        ? pdfPath
        : `https://openreview.net${pdfPath}`;

      // Construct forum URL
      const forumUrl = `https://openreview.net/forum?id=${note.forum || note.id}`;

      // Extract year from venue or creation date
      const venueStr = venue.toString();
      const yearMatch = venueStr.match(/20\d{2}/);
      const year = yearMatch
        ? parseInt(yearMatch[0])
        : new Date(note.cdate || Date.now()).getFullYear();

      return {
        id: note.id,
        title,
        authors,
        abstract,
        keywords,
        pdfUrl,
        venue,
        venueId: venueInfo.venueId,
        year,
        forumUrl,
        decision,
        presentationType: matchedCategory?.label,
        number: note.number,
      };
    } catch (error) {
      ztoolkit.log(`Error parsing note: ${error}`);
      return null;
    }
  }

  /**
   * Extract value from API V2 content field
   * API V2 wraps values in { value: xxx } structure
   */
  private static extractValue(field: any): any {
    if (field === undefined || field === null) {
      return undefined;
    }
    if (typeof field === "object" && "value" in field) {
      return field.value;
    }
    return field;
  }

  private static extractAcceptedCategoriesFromHtml(
    html: string,
  ): OpenReviewAcceptedCategory[] {
    const categories: OpenReviewAcceptedCategory[] = [];
    const seenCategoryIds = new Set<string>();

    for (const match of html.matchAll(ACCEPTED_CATEGORY_TAB_REGEX)) {
      const label = match[1]?.trim();
      if (!label) {
        continue;
      }

      const id = normalizeCategoryId(label);
      if (!id || seenCategoryIds.has(id)) {
        continue;
      }

      seenCategoryIds.add(id);
      categories.push({
        id,
        label,
        tabLabel: `Accept (${label})`,
      });
    }

    return categories;
  }

  private static matchAcceptedCategory(
    content: Record<string, unknown>,
    acceptedCategories: OpenReviewAcceptedCategory[],
  ): OpenReviewAcceptedCategory | undefined {
    if (acceptedCategories.length === 0) {
      return undefined;
    }

    const candidates = Array.from(
      new Set([
        ...CATEGORY_MATCH_FIELDS.flatMap((fieldName) =>
          collectTextCandidates(content[fieldName]),
        ),
        ...Object.entries(content).flatMap(([fieldName, value]) =>
          shouldInspectCategoryField(fieldName)
            ? collectTextCandidates(value)
            : [],
        ),
      ]),
    );

    for (const candidate of candidates) {
      for (const acceptedCategory of acceptedCategories) {
        if (matchesAcceptedCategory(candidate, acceptedCategory.id)) {
          return acceptedCategory;
        }
      }
    }

    return undefined;
  }

  /**
   * Fetch reviews and comments for a paper
   */
  static async fetchPaperReplies(
    paperId: string,
  ): Promise<OpenReviewComment[]> {
    const comments: OpenReviewComment[] = [];

    try {
      // Fetch all replies to the paper forum
      const apiUrl = `${OPENREVIEW_API_BASE}/notes?forum=${paperId}&details=directReplies`;

      const response = await Zotero.HTTP.request("GET", apiUrl, {
        headers: {
          Accept: "application/json",
        },
        responseType: "json",
      });

      const data = response.response as {
        notes: any[];
      };

      if (!data.notes) {
        return comments;
      }

      // Process each reply (skip the main submission)
      for (const note of data.notes) {
        if (note.id === paperId) {
          continue; // Skip the main paper
        }

        const comment = this.parseNoteToComment(note);
        if (comment) {
          comments.push(comment);
        }
      }

      return comments;
    } catch (error) {
      ztoolkit.log(`Error fetching replies: ${error}`);
      return comments;
    }
  }

  /**
   * Parse a note into a comment/review
   */
  private static parseNoteToComment(note: any): OpenReviewComment | null {
    try {
      const content = note.content || {};
      const invitation = note.invitation || "";

      // Determine type based on invitation name
      let type: OpenReviewComment["type"] = "comment";
      const invitationLower = invitation.toLowerCase();
      if (invitationLower.includes("official_review")) {
        type = "review";
      } else if (invitationLower.includes("meta_review")) {
        type = "meta-review";
      } else if (invitationLower.includes("decision")) {
        type = "decision";
      }

      // Extract title
      const title =
        this.extractValue(content.title) ||
        this.extractValue(content.review_title) ||
        (type === "review" ? "Official Review" : "Comment");

      // Build content string from various fields
      const contentParts: string[] = [];

      // Add main review/comment text
      const mainText =
        this.extractValue(content.review) ||
        this.extractValue(content.comment) ||
        this.extractValue(content.main_review) ||
        "";

      if (mainText) {
        contentParts.push(mainText);
      }

      // Add rating if present
      const rating = this.extractValue(content.rating);
      if (rating) {
        contentParts.push(`\n\n**Rating:** ${rating}`);
      }

      // Add confidence if present
      const confidence = this.extractValue(content.confidence);
      if (confidence) {
        contentParts.push(`\n**Confidence:** ${confidence}`);
      }

      // Add summary if present
      const summary =
        this.extractValue(content.summary) ||
        this.extractValue(content.summary_of_contributions);
      if (summary) {
        contentParts.push(`\n\n**Summary:**\n${summary}`);
      }

      // Add strengths if present
      const strengths =
        this.extractValue(content.strengths) ||
        this.extractValue(content.strengths_and_contributions);
      if (strengths) {
        contentParts.push(`\n\n**Strengths:**\n${strengths}`);
      }

      // Add weaknesses if present
      const weaknesses = this.extractValue(content.weaknesses);
      if (weaknesses) {
        contentParts.push(`\n\n**Weaknesses:**\n${weaknesses}`);
      }

      // Add questions if present
      const questions = this.extractValue(content.questions);
      if (questions) {
        contentParts.push(`\n\n**Questions:**\n${questions}`);
      }

      // Add decision text if present
      const decision = this.extractValue(content.decision);
      if (decision) {
        contentParts.push(`\n\n**Decision:** ${decision}`);
      }

      return {
        id: note.id,
        title,
        content: contentParts.join("") || "No content",
        authors: note.signatures || [],
        replyTo: note.replyto || note.forum,
        signature: (note.signatures || []).join(", "),
        date: note.cdate || note.tcdate || Date.now(),
        type,
      };
    } catch (error) {
      ztoolkit.log(`Error parsing comment: ${error}`);
      return null;
    }
  }

  /**
   * Download PDF from OpenReview
   * Returns the path to the downloaded file
   */
  static async downloadPdf(
    pdfUrl: string,
    targetPath: string,
  ): Promise<boolean> {
    try {
      // Use Zotero's download method
      await Zotero.File.download(pdfUrl, targetPath);
      return true;
    } catch (error) {
      ztoolkit.log(`Error downloading PDF: ${error}`);
      return false;
    }
  }
}
