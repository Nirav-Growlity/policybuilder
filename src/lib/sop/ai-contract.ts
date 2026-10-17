/**
 * Contract between the SOP builder UI and the SOP AI route
 * (POST /api/documents/sop/ai?orgId=…&manualId=…, NDJSON when Accept is
 * application/x-ndjson). The UI codes against these types and lib/sop/ai-client.ts;
 * the route and queue implement them.
 */
import type { Sop, SopFrontMatter, SopManual, SopSection, SopSectionKind } from "./types";

export type SopAiRequest =
  /** Write a whole SOP: every enabled section of `sopId`. */
  | { type: "sop"; manual: SopManual; sopId: string; instruction?: string }
  /** Rewrite one section of one SOP. */
  | { type: "sop-section"; manual: SopManual; sopId: string; sectionId: string; instruction?: string }
  /** Improve existing text: expand, shorten, formalise, or a custom instruction. */
  | { type: "refine"; manual: SopManual; sopId: string; sectionId: string; mode: "expand" | "shorten" | "formal" | "custom"; instruction?: string }
  /** Write the manual's front matter (introduction, objective, benefits, core values, how to use). */
  | { type: "front-matter"; manual: SopManual; instruction?: string }
  /** Write the closing review mechanism and approval statement. */
  | { type: "closing"; manual: SopManual; instruction?: string };

/** NDJSON events streamed back, one JSON object per line. */
export type SopAiEvent =
  /** Raw JSON text as the model writes it; parse progressively with lib/ai/partial-json. */
  | { delta: string }
  | { done: true; result: SopAiResult }
  | { error: string };

export type SopAiResult =
  | { type: "sop"; sop: Pick<Sop, "sections"> & Partial<Pick<Sop, "department" | "owner">> }
  | { type: "sop-section" | "refine"; section: SopSection }
  | { type: "front-matter"; frontMatter: Pick<SopFrontMatter, "introduction" | "objective" | "benefits" | "coreValues" | "howToUse"> }
  | { type: "closing"; reviewMechanism: SopManual["closing"]["reviewMechanism"]; approvalStatement: string };

export type SopGenerationStatus = "queued" | "writing" | "done" | "failed";

/** What the generation queue reports for each SOP while a manual is being written. */
export type SopGenerationState = {
  sopId: string;
  status: SopGenerationStatus;
  /** Sections parsed so far from the partial JSON, for live display. */
  partialSections?: SopSection[];
  error?: string;
};

/** Section kinds the AI fills; appendix and custom sections are left to the user. */
export const AI_WRITTEN_SECTION_KINDS: readonly SopSectionKind[] = [
  "purpose", "scope", "definitions", "responsibilities", "procedure", "monitoring", "training", "records", "references", "review",
];
