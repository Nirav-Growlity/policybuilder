/**
 * Pure helpers for the employee handbook screens: outline grouping by part,
 * progress, catalog filtering, new-handbook assembly, readiness and
 * placeholders. The counterpart of manual-helpers.ts; kept free of React so
 * the rules are tested directly.
 */
import type { Company, RichTextBlock } from "@/lib/types";
import { HANDBOOK_CATALOG, type HandbookCatalogTopic } from "@/lib/handbook/catalog";
import { createEmptyChapter, createEmptyHandbook } from "@/lib/handbook/initial-handbook";
import { HANDBOOK_PARTS, type HandbookChapter, type HandbookFacts, type HandbookGrouping, type HandbookManual, type HandbookPartId } from "@/lib/handbook/types";
import { companyFacts, hasCompanyFacts, reachableContacts } from "@/lib/sop/company-facts";
import { manualCodePrefix } from "@/lib/sop/render-model";
import type { SopCompanyFacts, SopCover, SopManualControl, SopSection, SopTemplateId, SopThemeOptions } from "@/lib/sop/types";
import { findPlaceholders, relativeTime, sectionHasContent } from "./manual-helpers";

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

/** A chapter counts as written once the AI or the writer has filled most of its sections. */
export function isChapterWritten(chapter: HandbookChapter): boolean {
  if (chapter.status === "draft" || chapter.status === "reviewed") return true;
  if (chapter.status === "generating") return false;
  const enabled = chapter.sections.filter((section) => section.enabled);
  return enabled.length > 0 && enabled.filter(sectionHasContent).length >= Math.ceil(enabled.length / 2);
}

export function enabledChapters(manual: Pick<HandbookManual, "chapters">): HandbookChapter[] {
  return manual.chapters.filter((chapter) => chapter.enabled);
}

export function handbookProgress(manual: Pick<HandbookManual, "chapters">): { written: number; total: number } {
  const chapters = enabledChapters(manual);
  return { written: chapters.filter(isChapterWritten).length, total: chapters.length };
}

/** Opening and closing take about eight pages; a chapter about two and a half. */
export function estimateHandbookPages(chapterCount: number): number {
  return chapterCount <= 0 ? 0 : Math.round(8 + chapterCount * 2.5);
}

export function chapterSelectionSummary(count: number): string {
  if (count === 0) return "No chapters selected";
  const seconds = Math.ceil(count / 4) * 18;
  const duration = seconds <= 90 ? "about a minute" : `about ${Math.max(2, Math.round(seconds / 60))} minutes`;
  return `${count} ${count === 1 ? "chapter" : "chapters"} selected · ~${estimateHandbookPages(count)} pages · ready in ${duration}`;
}

/** "18 chapters · 52 pages · updated 2h ago" for a drafts row. */
export function handbookSummaryLine(summary: { partCount: number; pageCount: number | null; updatedAt: string }, now = Date.now()): string {
  const parts = [`${summary.partCount} ${summary.partCount === 1 ? "chapter" : "chapters"}`];
  if (summary.pageCount) parts.push(`${summary.pageCount} pages`);
  const updated = relativeTime(summary.updatedAt, now);
  if (updated) parts.push(`updated ${updated}`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Outline                                                             */
/* ------------------------------------------------------------------ */

export type ChapterGroup = { key: string; label: string; chapters: HandbookChapter[] };

/** The chapters as the rail shows them: under part headers in part order, or one list. */
export function chapterGroups(manual: Pick<HandbookManual, "chapters" | "grouping">, grouping: HandbookGrouping = manual.grouping): ChapterGroup[] {
  if (grouping === "none") return [{ key: "all", label: "Chapters", chapters: manual.chapters }];
  return HANDBOOK_PARTS
    .map((part) => ({ key: part.id, label: part.label, chapters: manual.chapters.filter((chapter) => chapter.part === part.id) }))
    .filter((group) => group.chapters.length > 0);
}

export function chapterOrder(manual: Pick<HandbookManual, "chapters" | "grouping">): HandbookChapter[] {
  return chapterGroups(manual).flatMap((group) => group.chapters);
}

/** Moves one chapter before another; dropped into another part, it joins that part. */
export function moveChapterBefore(chapters: readonly HandbookChapter[], movingId: string, targetId: string | null, grouping: HandbookGrouping): HandbookChapter[] {
  const moving = chapters.find((chapter) => chapter.id === movingId);
  if (!moving || movingId === targetId) return [...chapters];
  const rest = chapters.filter((chapter) => chapter.id !== movingId);
  const target = targetId ? rest.find((chapter) => chapter.id === targetId) : undefined;
  const moved = target && grouping === "part" && target.part !== moving.part ? { ...moving, part: target.part } : moving;
  const index = target ? rest.indexOf(target) : rest.length;
  return [...rest.slice(0, index), moved, ...rest.slice(index)];
}

export function moveChapterByOffset(manual: Pick<HandbookManual, "chapters" | "grouping">, chapterId: string, offset: -1 | 1): HandbookChapter[] {
  const order = chapterOrder(manual);
  const index = order.findIndex((chapter) => chapter.id === chapterId);
  const target = order[index + offset];
  if (index < 0 || !target) return manual.chapters;
  return offset < 0
    ? moveChapterBefore(manual.chapters, chapterId, target.id, manual.grouping)
    : moveChapterBefore(manual.chapters, target.id, chapterId, manual.grouping);
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function filterHandbookCatalog(topics: readonly HandbookCatalogTopic[], query: string): HandbookCatalogTopic[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return [...topics];
  return topics.filter((topic) => {
    const haystack = normalize([topic.title, topic.description, ...topic.aliases].join(" "));
    return words.every((word) => haystack.includes(word));
  });
}

export type HandbookCatalogGroup = { key: HandbookPartId; label: string; topics: HandbookCatalogTopic[] };

export function groupHandbookCatalog(topics: readonly HandbookCatalogTopic[]): HandbookCatalogGroup[] {
  return HANDBOOK_PARTS
    .map((part) => ({ key: part.id, label: part.label, topics: topics.filter((topic) => topic.part === part.id) }))
    .filter((group) => group.topics.length > 0);
}

export function handbookTopicsById(ids: Iterable<string>): HandbookCatalogTopic[] {
  const wanted = new Set(ids);
  return HANDBOOK_CATALOG.filter((topic) => wanted.has(topic.id));
}

export type CustomChapterDraft = { id: string; title: string; part: HandbookPartId };

export function chapterFromTopic(topic: HandbookCatalogTopic): HandbookChapter {
  return createEmptyChapter({ title: topic.title, catalogId: topic.id, part: topic.part, owner: topic.owner, outline: topic.outline });
}

export function chapterFromCustom(draft: CustomChapterDraft): HandbookChapter {
  return createEmptyChapter({ title: draft.title.trim(), part: draft.part, owner: "HR Manager" });
}

/* ------------------------------------------------------------------ */
/* New handbook                                                        */
/* ------------------------------------------------------------------ */

/** "{CODE}/HR/EH/01": the organization code when it has one, else the company initials. */
export function suggestHandbookDocNo(company: Pick<Company, "name">, organizationCode?: string): string {
  const code = (organizationCode ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
  const prefix = code || manualCodePrefix({ control: { docNo: "" } as SopManualControl, company: { name: company.name } as Company });
  return `${prefix}/HR/EH/01`;
}

/** The handbook's name in lists and file names: its own title when set, else "<Company> Employee Handbook". */
export function handbookTitle(manual: Pick<HandbookManual, "company"> & { control?: Pick<SopManualControl, "title"> }): string {
  const own = manual.control?.title?.trim();
  if (own) return own;
  const name = manual.company.name.trim();
  return name ? `${name} Employee Handbook` : "Employee Handbook";
}

export type NewHandbookInput = {
  company: Company;
  control: SopManualControl;
  topics: readonly HandbookCatalogTopic[];
  custom: readonly CustomChapterDraft[];
  theme: SopTemplateId;
  themeOptions: SopThemeOptions;
  cover: SopCover;
  facts?: SopCompanyFacts;
  handbookFacts?: HandbookFacts;
};

const handbookFactsFilled = (facts: HandbookFacts) => Boolean(facts.workingHours.trim() || facts.weeklyOff.trim() || facts.probation.trim() || facts.noticePeriod.trim() || facts.payday.trim() || facts.leave.some((row) => row.type.trim()));

export function buildNewHandbook(input: NewHandbookInput): HandbookManual {
  const chapters = [...input.topics.map(chapterFromTopic), ...input.custom.filter((draft) => draft.title.trim()).map(chapterFromCustom)];
  const base = createEmptyHandbook({ company: input.company, chapters });
  const facts = input.facts ? companyFacts({ facts: input.facts }) : undefined;
  const handbookFacts = input.handbookFacts ? { ...input.handbookFacts, leave: input.handbookFacts.leave.filter((row) => row.type.trim()) } : undefined;
  return {
    ...base,
    control: { ...base.control, ...input.control },
    theme: input.theme,
    themeOptions: input.themeOptions,
    cover: input.cover,
    ...(facts && hasCompanyFacts(facts) ? { facts } : {}),
    ...(handbookFacts && handbookFactsFilled(handbookFacts) ? { handbookFacts } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Readiness and placeholders                                          */
/* ------------------------------------------------------------------ */

export type HandbookTarget =
  | { kind: "details" }
  | { kind: "front" }
  | { kind: "closing" }
  | { kind: "design" }
  | { kind: "placeholders" }
  | { kind: "chapter"; chapterId: string; sectionId?: string };

export type HandbookCheck = { id: string; label: string; detail: string; ok: boolean; fix?: HandbookTarget };

function blockTexts(blocks: readonly RichTextBlock[] | undefined): string[] {
  return (blocks ?? []).flatMap((block) => [block.text, ...(block.columns ?? []), ...(block.rows ?? []).flat()]);
}

function sectionTexts(section: SopSection): string[] {
  switch (section.kind) {
    case "definitions": return section.rows.flatMap((row) => [row.term, row.definition]);
    case "responsibilities": return section.rows.flatMap((row) => [row.role, ...row.responsibilities]);
    case "procedure": return section.steps.flatMap((step) => [step.heading, step.responsible ?? "", ...blockTexts(step.body), ...(step.substeps ?? []).flatMap((sub) => [sub.text, sub.responsible ?? ""])]);
    case "monitoring": return [...section.kpis.flatMap((kpi) => [kpi.indicator, kpi.target, kpi.frequency, kpi.owner]), ...blockTexts(section.narrative)];
    case "records": return section.rows.flatMap((row) => [row.record, row.owner, row.retention, row.format]);
    case "references": return section.items;
    default: return blockTexts(section.blocks);
  }
}

export type HandbookPlaceholderHit = { text: string; where: string; target: HandbookTarget };

/** Every placeholder in the opening, the enabled chapters (in rail order) and the closing, in reading order. */
export function handbookPlaceholders(manual: HandbookManual): HandbookPlaceholderHit[] {
  const hits: HandbookPlaceholderHit[] = [];
  const collect = (texts: readonly string[], where: string, target: HandbookTarget) => {
    for (const text of texts) for (const found of findPlaceholders(text ?? "")) hits.push({ text: found, where, target });
  };
  const front = manual.frontMatter;
  collect([
    ...blockTexts(front.welcome), ...blockTexts(front.about), front.vision, front.mission,
    ...front.coreValues.flatMap((value) => [value.title, value.description]),
    ...blockTexts(front.purpose), ...blockTexts(front.howToUse), ...front.glossary.flatMap((row) => [row.term, row.definition]),
  ], "Opening pages", { kind: "front" });
  for (const chapter of chapterOrder({ ...manual, chapters: enabledChapters(manual) })) {
    const name = chapter.title.trim() || "Untitled chapter";
    for (const section of chapter.sections.filter((item) => item.enabled)) collect(sectionTexts(section), `${name}, ${section.title.trim() || "section"}`, { kind: "chapter", chapterId: chapter.id, sectionId: section.id });
  }
  const closing = manual.closing;
  collect([
    ...blockTexts(closing.reviewMechanism), ...closing.revisionHistory.map((entry) => entry.description), closing.approval.statement, closing.acknowledgement,
    ...closing.approval.signatories.flatMap((signatory) => [signatory.role, signatory.name, signatory.designation]),
  ], "Closing", { kind: "closing" });
  return hits;
}

export type HandbookPlaceholderGroup = { text: string; count: number; where: string; target: HandbookTarget };

export function handbookPlaceholderGroups(manual: HandbookManual): HandbookPlaceholderGroup[] {
  const groups = new Map<string, HandbookPlaceholderGroup>();
  for (const hit of handbookPlaceholders(manual)) {
    const group = groups.get(hit.text);
    if (group) group.count += 1;
    else groups.set(hit.text, { text: hit.text, count: 1, where: hit.where, target: hit.target });
  }
  return [...groups.values()];
}

const STRUCTURAL_KEYS = new Set(["id", "kind", "type", "catalogId", "status", "source", "part"]);

function replaceInTree<T>(value: T, placeholder: string, replacement: string): T {
  if (typeof value === "string") return value.split(placeholder).join(replacement) as T;
  if (Array.isArray(value)) return value.map((item) => replaceInTree(item, placeholder, replacement)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, STRUCTURAL_KEYS.has(key) ? item : replaceInTree(item, placeholder, replacement)])) as T;
  }
  return value;
}

/** Fills one placeholder everywhere it appears in the handbook's text. */
export function replaceHandbookPlaceholder(manual: HandbookManual, placeholder: string, value: string): HandbookManual {
  const replacement = value.trim();
  if (!placeholder || !replacement) return manual;
  return {
    ...manual,
    frontMatter: { ...replaceInTree(manual.frontMatter, placeholder, replacement), sites: manual.frontMatter.sites },
    chapters: manual.chapters.map((chapter) => ({ ...chapter, sections: replaceInTree(chapter.sections, placeholder, replacement) })),
    closing: replaceInTree(manual.closing, placeholder, replacement),
  };
}

const hasText = (blocks: readonly RichTextBlock[]) => blocks.some((block) => block.text.trim());

export function handbookReadinessChecks(manual: HandbookManual): HandbookCheck[] {
  const chapters = enabledChapters(manual);
  const unwritten = chapters.filter((chapter) => !isChapterWritten(chapter));
  const missingOwner = chapters.filter((chapter) => !chapter.owner.trim());
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  const contacts = reachableContacts(companyFacts(manual));
  const placeholders = handbookPlaceholders(manual);
  const grievance = chapters.some((chapter) => chapter.catalogId === "grievance" || /grievance|complaint/i.test(chapter.title));
  return [
    { id: "company", label: "Company and approver", ok: Boolean(manual.company.name.trim() && manual.control.approvedBy.trim()), detail: manual.company.name.trim() && manual.control.approvedBy.trim() ? `${manual.company.name}, approved by ${manual.control.approvedBy}` : "Add the company name and who approves the handbook.", fix: { kind: "details" } },
    { id: "control", label: "Document control", ok: Boolean(manual.control.docNo.trim() && manual.control.effectiveDate), detail: manual.control.docNo.trim() && manual.control.effectiveDate ? `${manual.control.docNo}, Rev ${manual.control.revision || "01"}` : "Add a document number and an effective date.", fix: { kind: "details" } },
    { id: "contacts", label: "Contacts for raising concerns", ok: contacts.length > 0, detail: contacts.length ? `${plural(contacts.length, "contact")} for grievances and questions.` : "Add an email or phone number for grievances, so chapters name a real channel.", fix: { kind: "details" } },
    { id: "chapters", label: "Chapters written", ok: chapters.length > 0 && unwritten.length === 0, detail: chapters.length === 0 ? "Add at least one chapter." : unwritten.length ? `${plural(unwritten.length, "chapter")} still to write.` : `All ${plural(chapters.length, "chapter")} written.`, fix: unwritten[0] ? { kind: "chapter", chapterId: unwritten[0].id } : undefined },
    { id: "grievance", label: "A way to raise grievances", ok: grievance, detail: grievance ? "The handbook explains how to raise a grievance." : "Most handbooks have a Grievance Redressal chapter. Add one from the catalog.", fix: grievance ? undefined : { kind: "details" } },
    { id: "owners", label: "Chapter owners", ok: missingOwner.length === 0, detail: missingOwner.length ? `${plural(missingOwner.length, "chapter")} without an owner.` : "Every chapter has an owner.", fix: missingOwner[0] ? { kind: "chapter", chapterId: missingOwner[0].id } : undefined },
    { id: "placeholders", label: "Placeholders to fill", ok: placeholders.length === 0, detail: placeholders.length ? `${plural(placeholders.length, "placeholder")} still to replace. First: ${placeholders[0].text} in ${placeholders[0].where}.` : "No [bracketed] placeholders left.", fix: placeholders.length ? { kind: "placeholders" } : undefined },
    { id: "welcome", label: "Welcome and introduction", ok: hasText(manual.frontMatter.welcome), detail: hasText(manual.frontMatter.welcome) ? "Welcome message written." : "The handbook has no welcome message yet.", fix: { kind: "front" } },
    { id: "acknowledgement", label: "Employee acknowledgement", ok: Boolean(manual.closing.acknowledgement.trim()), detail: manual.closing.acknowledgement.trim() ? "Employees sign the acknowledgement page." : "Add the statement employees sign on receipt.", fix: { kind: "closing" } },
  ];
}
