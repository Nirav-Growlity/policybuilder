/**
 * Pure helpers between the handbook AI and the handbook: which sections a
 * request writes, how the model's compact answer maps back onto them, and how
 * a finished result merges into the manual. Shared by the route, the queue
 * and the builder.
 *
 * A chapter may hold several sections of one kind (several free-titled
 * "custom" sections), so the model's answer is keyed by position ("s1",
 * "s2"…) rather than by kind as for SOPs.
 */
import { generatedSectionToSopSection, wireSectionToGenerated } from "../sop/apply-ai-result";
import type { SopSection } from "../sop/types";
import type { RichTextBlock } from "../types";
import { HANDBOOK_STATEMENT_FIELDS, type HandbookAiField, type HandbookAiResult } from "./ai-contract";
import type { HandbookChapter, HandbookManual } from "./types";

/** The sections a whole-chapter request writes: every enabled one, in order. */
export function chapterSectionsToWrite(chapter: Pick<HandbookChapter, "sections">): SopSection[] {
  return chapter.sections.filter((section) => section.enabled);
}

/** Wire key of the section at this position among the requested ones. */
export const wireKey = (index: number) => `s${index + 1}`;

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

/**
 * The model's `sections` object mapped onto the requested sections. Each
 * keeps its id, heading and on/off state; keys the model left out are skipped.
 * Tolerant of partial objects, so it also serves the live stream.
 */
export function wireToChapterSections(sections: unknown, requested: readonly SopSection[]): SopSection[] {
  const wire = record(sections);
  return requested.flatMap((section, index) => {
    const value = wire[wireKey(index)];
    if (value === undefined) return [];
    const mapped = generatedSectionToSopSection(wireSectionToGenerated(section.kind, value, section.title), { id: section.id, title: section.title, enabled: section.enabled });
    return mapped && mapped.kind === section.kind ? [mapped] : [];
  });
}

/** Sections parsed so far from a streaming chapter, with the chapter's own section ids. */
export function partialChapterSections(partial: unknown, requested: readonly SopSection[]): SopSection[] {
  return wireToChapterSections(record(partial).sections, requested);
}

function updateChapter(manual: HandbookManual, chapterId: string, update: (chapter: HandbookChapter) => HandbookChapter): HandbookManual {
  let found = false;
  const chapters = manual.chapters.map((chapter) => {
    if (chapter.id !== chapterId) return chapter;
    found = true;
    return update(chapter);
  });
  return found ? { ...manual, chapters } : manual;
}

/** Replaces the written sections of a chapter by id; sections switched off meanwhile keep their content. */
export function applyChapterResult(chapter: HandbookChapter, result: Extract<HandbookAiResult, { type: "chapter" }>["chapter"]): HandbookChapter {
  const byId = new Map(result.sections.map((section) => [section.id, section]));
  return {
    ...chapter,
    status: "draft",
    sections: chapter.sections.map((section) => {
      const next = byId.get(section.id);
      if (!next || !section.enabled || next.kind !== section.kind) return section;
      return { ...next, id: section.id, title: section.title, enabled: section.enabled } as SopSection;
    }),
  };
}

/** Replaces one section (a rewrite or a refinement) and marks the chapter as a draft. */
export function applyChapterSectionResult(manual: HandbookManual, chapterId: string, sectionId: string, section: SopSection): HandbookManual {
  return updateChapter(manual, chapterId, (chapter) => ({
    ...chapter,
    status: chapter.status === "empty" ? "draft" : chapter.status,
    sections: chapter.sections.map((current) => (current.id === sectionId && current.kind === section.kind ? { ...section, id: current.id, title: current.title, enabled: current.enabled } as SopSection : current)),
  }));
}

const blocksText = (blocks: readonly RichTextBlock[]) => blocks.filter((block) => block.type !== "table").map((block) => block.text.trim()).filter(Boolean).join("\n\n");

/** Plain text of one front matter or closing field, as the editor shows it. */
export function handbookFieldText(manual: HandbookManual, field: HandbookAiField): string {
  switch (field) {
    case "acknowledgement": return manual.closing.acknowledgement.trim();
    default: return blocksText(manual.frontMatter[field]);
  }
}

/** Text of one field written so far, from a partial result keyed by field name. */
export function partialHandbookFieldText(partial: unknown, field: HandbookAiField): string {
  const value = record(partial)[field];
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).join("\n\n");
}

/** The field's tables stay, after the new text: the AI writes paragraphs only and never sees them. */
function withTables(previous: readonly RichTextBlock[], next: RichTextBlock[]): RichTextBlock[] {
  const tables = previous.filter((block) => block.type === "table");
  return tables.length ? [...next, ...tables] : next;
}

export function applyHandbookFieldResult(manual: HandbookManual, result: Extract<HandbookAiResult, { type: "manual-field" }>): HandbookManual {
  if ("statement" in result) return { ...manual, closing: { ...manual.closing, acknowledgement: result.statement } };
  return { ...manual, frontMatter: { ...manual.frontMatter, [result.field]: withTables(manual.frontMatter[result.field], result.blocks) } };
}

export function applyHandbookFrontMatterResult(manual: HandbookManual, frontMatter: Extract<HandbookAiResult, { type: "front-matter" }>["frontMatter"]): HandbookManual {
  const current = manual.frontMatter;
  return {
    ...manual,
    frontMatter: {
      ...current,
      welcome: withTables(current.welcome, frontMatter.welcome),
      about: withTables(current.about, frontMatter.about),
      purpose: withTables(current.purpose, frontMatter.purpose),
      vision: frontMatter.vision || current.vision,
      mission: frontMatter.mission || current.mission,
      coreValues: frontMatter.coreValues.length ? frontMatter.coreValues : current.coreValues,
    },
  };
}

export function applyHandbookClosingResult(manual: HandbookManual, result: Extract<HandbookAiResult, { type: "closing" }>): HandbookManual {
  return {
    ...manual,
    closing: {
      ...manual.closing,
      acknowledgement: result.acknowledgement || manual.closing.acknowledgement,
    },
  };
}

/** Applies any result. `target` names the chapter and section the request was about. */
export function applyHandbookAiResult(manual: HandbookManual, target: { chapterId?: string; sectionId?: string }, result: HandbookAiResult): HandbookManual {
  switch (result.type) {
    case "chapter":
      return target.chapterId ? updateChapter(manual, target.chapterId, (chapter) => applyChapterResult(chapter, result.chapter)) : manual;
    case "chapter-section":
    case "refine":
      return target.chapterId && target.sectionId ? applyChapterSectionResult(manual, target.chapterId, target.sectionId, result.section) : manual;
    case "front-matter":
      return applyHandbookFrontMatterResult(manual, result.frontMatter);
    case "closing":
      return applyHandbookClosingResult(manual, result);
    case "manual-field":
      return applyHandbookFieldResult(manual, result);
  }
}

export function isStatementField(field: HandbookAiField): field is "acknowledgement" {
  return HANDBOOK_STATEMENT_FIELDS.has(field);
}
