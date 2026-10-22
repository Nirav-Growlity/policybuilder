/**
 * The resolved, render-ready form of an SOP manual. Everything is already
 * decided here: numbering, codes, labels, colours, fonts and which sections
 * show. The Typst template and the DOCX generator only lay it out, so both
 * outputs show the same content in the same order with the same numbers.
 */
import type { SopDesign, SopPalette } from "./design/templates";

export type RenderBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; columns: string[]; widths: number[]; rows: RenderCell[][] };

/** A table cell is plain text, or a short bullet list (for example a role's responsibilities). */
export type RenderCell = string | string[];

export type RenderStep = {
  number: string;
  heading: string;
  body: RenderBlock[];
  responsible: string;
  substeps: Array<{ number: string; text: string; responsible: string }>;
};

/** One numbered section inside an SOP, or one front-matter / closing section. */
export type RenderSection = {
  id: string;
  /** "1.0", "2.0"… inside an SOP; empty for front matter and closing. */
  number: string;
  title: string;
  kind: string;
  blocks: RenderBlock[];
  /** Procedure steps, only for the procedure section. */
  steps?: RenderStep[];
};

export type RenderSop = {
  id: string;
  /** Bookmark / label anchor, safe for Typst labels and Word bookmarks. */
  anchor: string;
  /** Position in the manual, "1", "2"… */
  number: string;
  code: string;
  title: string;
  pillar: "E" | "S" | "G";
  pillarLabel: string;
  /** Hex colour of the SOP's chapter (pillar colour, or the template primary). */
  color: string;
  department: string;
  owner: string;
  version: string;
  effectiveDate: string;
  nextReviewDate: string;
  preparedBy: string;
  approvedBy: string;
  sections: RenderSection[];
};

export type RenderChapter = {
  id: string;
  anchor: string;
  /** "Environmental", "EHS"… Empty when the manual is not grouped. */
  label: string;
  /** Short line under the label on divider pages. */
  summary: string;
  color: string;
  sops: RenderSop[];
};

export type RenderFrontSection = RenderSection & { anchor: string };

export type ResolvedSopDesign = Omit<SopDesign, "palette" | "fontPair"> & {
  palette: SopPalette;
  fonts: { heading: string; body: string };
  showSopHeaderCard: boolean;
};

export type SopRenderModel = {
  /** Bump when the model shape changes so cached renders are not reused. */
  version: 1;
  /** "full" renders the whole manual; "sops" renders only the SOP pages (live preview of one SOP). */
  mode: "full" | "sops";
  design: ResolvedSopDesign;
  page: { size: "A4" | "Letter"; widthMm: number; heightMm: number };
  title: string;
  company: { name: string; logo: string | null; industry: string };
  control: {
    docNo: string;
    revision: string;
    supersedes: string;
    effectiveDate: string;
    nextReviewDate: string;
    reviewFrequency: string;
    preparedBy: string;
    reviewedBy: string;
    approvedBy: string;
    classification: string;
    /** Formatted dates, empty when not set (the cells are then left out). */
    issueDate: string;
    lastReviewDate: string;
  };
  cover: {
    /** Path of a full-bleed cover image inside the render workspace, or null for the template cover. */
    image: string | null;
    eyebrow: string;
    title: string;
    subtitle: string;
  };
  stats: { sopCount: number; departmentCount: number; siteCount: number; chapterLabels: string[] };
  frontMatter: RenderFrontSection[];
  chapters: RenderChapter[];
  closing: {
    sections: RenderFrontSection[];
    /** reviewedBy / approvedBy are empty strings when not set; the columns print only when any row has one. */
    revisions: Array<{ revision: string; date: string; description: string; reviewedBy: string; approvedBy: string }>;
    approval: { statement: string; signatories: Array<{ role: string; name: string; designation: string; date: string }> };
    anchors: { revisions: string; approval: string };
  };
};
