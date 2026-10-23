/**
 * Contract between the handbook builder and the handbook AI route
 * (POST /api/documents/handbook/ai?orgId=…&manualId=…, NDJSON when Accept is
 * application/x-ndjson). Mirrors lib/sop/ai-contract.ts with chapters in
 * place of SOPs; the stream events and generation states are the same.
 */
import type { RichTextBlock } from "../types";
import type { SopAiEvent } from "../sop/ai-contract";
import type { SopSection } from "../sop/types";
import type { HandbookFrontMatter, HandbookManual } from "./types";

export type { SopGenerationState as HandbookGenerationState } from "../sop/ai-contract";

/** Narrative and statement fields of the front matter and closing that are written one at a time. */
export const HANDBOOK_AI_FIELDS = ["welcome", "about", "purpose", "howToUse", "reviewMechanism", "approvalStatement", "acknowledgement"] as const;
export type HandbookAiField = (typeof HANDBOOK_AI_FIELDS)[number];
/** Fields that hold one plain statement rather than paragraphs. */
export const HANDBOOK_STATEMENT_FIELDS: ReadonlySet<HandbookAiField> = new Set(["approvalStatement", "acknowledgement"]);

export const HANDBOOK_AI_FIELD_LABELS: Record<HandbookAiField, string> = {
  welcome: "Welcome message",
  about: "About the company",
  purpose: "Purpose of this handbook",
  howToUse: "How to use this handbook",
  reviewMechanism: "Review mechanism",
  approvalStatement: "Approval statement",
  acknowledgement: "Acknowledgement statement",
};

export type HandbookAiRequest =
  /** Write a whole chapter: every enabled section of `chapterId`. */
  | { type: "chapter"; manual: HandbookManual; chapterId: string; instruction?: string }
  /** Rewrite one section of one chapter. */
  | { type: "chapter-section"; manual: HandbookManual; chapterId: string; sectionId: string; instruction?: string }
  /** Improve existing text: shorten or a custom instruction (improve and grammar are custom instructions). */
  | { type: "refine"; manual: HandbookManual; chapterId: string; sectionId: string; mode: "expand" | "shorten" | "formal" | "custom"; instruction?: string }
  /** Write the front matter: welcome, about, vision, mission, values, purpose, how to use. */
  | { type: "front-matter"; manual: HandbookManual; instruction?: string }
  /** Write the closing: review mechanism, approval statement, acknowledgement. */
  | { type: "closing"; manual: HandbookManual; instruction?: string }
  /** Write, shorten or revise one front matter or closing field. Custom needs an instruction. */
  | { type: "manual-field"; manual: HandbookManual; field: HandbookAiField; mode: "generate" | "shorten" | "custom"; instruction?: string };

export type HandbookFrontMatterResult = Pick<HandbookFrontMatter, "welcome" | "about" | "vision" | "mission" | "coreValues" | "purpose" | "howToUse">;

export type HandbookAiResult =
  /** The written sections, in the chapter's order of enabled sections (matched by id). */
  | { type: "chapter"; chapter: { sections: SopSection[]; owner?: string } }
  | { type: "chapter-section" | "refine"; section: SopSection }
  | { type: "front-matter"; frontMatter: HandbookFrontMatterResult }
  | { type: "closing"; reviewMechanism: RichTextBlock[]; approvalStatement: string; acknowledgement: string }
  | { type: "manual-field"; field: Exclude<HandbookAiField, "approvalStatement" | "acknowledgement">; blocks: RichTextBlock[] }
  | { type: "manual-field"; field: "approvalStatement" | "acknowledgement"; statement: string };

export type HandbookAiEvent = Exclude<SopAiEvent, { done: true }> | { done: true; result: HandbookAiResult };
