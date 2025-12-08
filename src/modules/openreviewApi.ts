/**
 * OpenReview API Service
 * Handles fetching papers from OpenReview venues and workshops
 */

// OpenReview API V2 base URL
const OPENREVIEW_API_BASE = "https://api2.openreview.net";

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
  presentationType?: "oral" | "poster" | "unknown";
  number?: number;
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
  acceptedOnly?: boolean;
  oralOnly?: boolean;
  posterOnly?: boolean;
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
          const paper = this.parseNoteToOpenReviewPaper(note, venueInfo);
          if (paper) {
            // Apply filters
            if (options.acceptedOnly) {
              // For workshops, accepted papers have venue field set
              if (!paper.venue || paper.venue === venueInfo.venueId) {
                continue; // Skip if no specific venue (not accepted)
              }
            }

            if (options.oralOnly) {
              if (paper.presentationType !== "oral") {
                continue;
              }
            }

            if (options.posterOnly) {
              if (paper.presentationType !== "poster") {
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

      // Determine presentation type from venue string
      let presentationType: OpenReviewPaper["presentationType"] = "unknown";
      const venueLower = venue.toLowerCase();
      if (venueLower.includes("oral")) {
        presentationType = "oral";
      } else if (venueLower.includes("poster")) {
        presentationType = "poster";
      }

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
        presentationType,
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
