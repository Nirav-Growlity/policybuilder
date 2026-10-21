/**
 * Pure helpers for the SOP manual screens: outline grouping, progress,
 * estimates, readiness and the plain-text editing of rich text blocks.
 * Kept free of React so the rules are tested directly.
 */
import type { Company, RichTextBlock } from "@/lib/types";
import { SOP_CATALOG, type SopCatalogTopic } from "@/lib/sop/catalog";
import { companyFacts, hasCompanyFacts, reachableContacts } from "@/lib/sop/company-facts";
import { createEmptyManual, createEmptySop, createSopId } from "@/lib/sop/initial-manual";
import { PILLAR_LABELS, manualCodePrefix, suggestSopCodes } from "@/lib/sop/render-model";
import type { Sop, SopCompanyFacts, SopCover, SopGrouping, SopManual, SopManualControl, SopPillar, SopSection, SopTemplateId, SopThemeOptions } from "@/lib/sop/types";

export { PILLAR_LABELS };
export const PILLAR_ORDER: readonly SopPillar[] = ["E", "S", "G"];

/* ------------------------------------------------------------------ */
/* Rich text <-> plain text                                            */
/* ------------------------------------------------------------------ */

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

/** The text a writer edits for a list of blocks; tables are kept aside. */
export function richTextToPlain(blocks: readonly RichTextBlock[] | undefined): string {
  return (blocks ?? [])
    .filter((block) => block.type !== "table")
    .map((block) => {
      if (block.type === "paragraph") return block.text.trim();
      const items = block.text.split(/\r?\n/).map((line) => line.replace(BULLET, "").replace(NUMBERED, "").trim()).filter(Boolean);
      return items.map((item, index) => (block.type === "bullets" ? `- ${item}` : `${index + 1}. ${item}`)).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Parses edited text back into blocks. Paragraphs are separated by a blank
 * line; a paragraph whose lines all start with "-" or "1." becomes a list.
 * Block ids are reused by position so edits do not churn identities. Table
 * blocks from the original keep their place: a table that followed the n-th
 * text block still follows it (or ends the list when the text got shorter).
 */
export function plainToRichText(text: string, previous: readonly RichTextBlock[] = []): RichTextBlock[] {
  const textBlocks = previous.filter((block) => block.type !== "table");
  const parts = text.replace(/\r\n/g, "\n").split(/\n[ \t]*\n/).map((part) => part.replace(/^\n+|\n+$/g, "")).filter((part) => part.trim());
  const blocks = parts.map((part, index): RichTextBlock => {
    const lines = part.split("\n").filter((line) => line.trim());
    const type: RichTextBlock["type"] = lines.length > 0 && lines.every((line) => BULLET.test(line)) ? "bullets"
      : lines.length > 0 && lines.every((line) => NUMBERED.test(line)) ? "numbered"
      : "paragraph";
    return { id: textBlocks[index]?.id ?? createSopId("block"), type, text: type === "paragraph" ? part : lines.join("\n") };
  });
  // How many text blocks came before each table in the original.
  let seen = 0;
  const tables: Array<{ before: number; block: RichTextBlock }> = [];
  for (const block of previous) {
    if (block.type === "table") tables.push({ before: seen, block });
    else seen += 1;
  }
  if (!tables.length) return blocks;
  const out: RichTextBlock[] = [];
  blocks.forEach((block, index) => {
    out.push(...tables.filter((table) => table.before === index).map((table) => table.block));
    out.push(block);
  });
  out.push(...tables.filter((table) => table.before >= blocks.length).map((table) => table.block));
  return out;
}

/** A run of text blocks edited as one textarea, or one table block. `start` is its index in the field. */
export type NarrativeSegment =
  | { type: "text"; start: number; blocks: RichTextBlock[] }
  | { type: "table"; start: number; block: RichTextBlock };

/**
 * A narrative field as the writer edits it, in block order: each run of
 * consecutive text blocks is one segment, each table its own. An empty field
 * is one empty text segment.
 */
export function narrativeSegments(blocks: readonly RichTextBlock[]): NarrativeSegment[] {
  const segments: NarrativeSegment[] = [];
  blocks.forEach((block, index) => {
    if (block.type === "table") { segments.push({ type: "table", start: index, block }); return; }
    const last = segments.at(-1);
    if (last?.type === "text") last.blocks.push(block);
    else segments.push({ type: "text", start: index, blocks: [block] });
  });
  return segments.length ? segments : [{ type: "text", start: 0, blocks: [] }];
}

/** Replaces `count` blocks from `start` with `next`. */
export function spliceBlocks(blocks: readonly RichTextBlock[], start: number, count: number, next: readonly RichTextBlock[]): RichTextBlock[] {
  return [...blocks.slice(0, start), ...next, ...blocks.slice(start + count)];
}

/** A small empty table for the writer to fill: headings show placeholders until typed. */
export function createTableBlock(columns = 2, rows = 2): RichTextBlock {
  return { id: createSopId("block"), type: "table", text: "", columns: Array.from({ length: columns }, () => ""), rows: Array.from({ length: rows }, () => Array.from({ length: columns }, () => "")) };
}

/** True when a table block has no heading or cell text at all. */
export function isEmptyTable(block: RichTextBlock): boolean {
  return block.type === "table" && ![...(block.columns ?? []), ...(block.rows ?? []).flat()].some((cell) => cell.trim());
}

/* ------------------------------------------------------------------ */
/* Content and progress                                                */
/* ------------------------------------------------------------------ */

export function sectionHasContent(section: SopSection): boolean {
  switch (section.kind) {
    case "definitions":
    case "responsibilities":
    case "records":
      return section.rows.length > 0;
    case "procedure":
      return section.steps.length > 0;
    case "monitoring":
      return section.kpis.length > 0 || section.narrative.some((block) => block.text.trim() || (block.rows?.length ?? 0) > 0);
    case "references":
      return section.items.some((item) => item.trim());
    default:
      return section.blocks.some((block) => block.text.trim() || (block.rows?.length ?? 0) > 0);
  }
}

/** An SOP counts as written once the AI or the writer has filled its sections. */
export function isSopWritten(sop: Sop): boolean {
  if (sop.status === "draft" || sop.status === "reviewed") return true;
  if (sop.status === "generating") return false;
  const enabled = sop.sections.filter((section) => section.enabled);
  return enabled.length > 0 && enabled.filter(sectionHasContent).length >= Math.ceil(enabled.length / 2);
}

export function enabledSops(manual: Pick<SopManual, "sops">): Sop[] {
  return manual.sops.filter((sop) => sop.enabled);
}

export function manualProgress(manual: Pick<SopManual, "sops">): { written: number; total: number } {
  const sops = enabledSops(manual);
  return { written: sops.filter(isSopWritten).length, total: sops.length };
}

/** Front matter and closing take about eight pages; an SOP about six. */
export function estimatePages(sopCount: number): number {
  return sopCount <= 0 ? 0 : Math.round(8 + sopCount * 6.2);
}

/** SOPs are written four at a time, roughly twenty seconds each. */
export function estimateDuration(sopCount: number): string {
  const seconds = Math.ceil(sopCount / 4) * 20;
  if (seconds <= 90) return "about a minute";
  return `about ${Math.max(2, Math.round(seconds / 60))} minutes`;
}

export function selectionSummary(sopCount: number): string {
  if (sopCount === 0) return "No SOPs selected";
  return `${sopCount} ${sopCount === 1 ? "SOP" : "SOPs"} selected · ~${estimatePages(sopCount)} pages · ready in ${estimateDuration(sopCount)}`;
}

/* ------------------------------------------------------------------ */
/* Outline grouping and ordering                                       */
/* ------------------------------------------------------------------ */

export type OutlineGroup = { key: string; label: string; sops: Sop[] };

/** The manual's SOPs as the rail shows them: under pillar or department headers, in manual order. */
export function outlineGroups(manual: Pick<SopManual, "sops" | "grouping">, grouping: SopGrouping = manual.grouping): OutlineGroup[] {
  if (grouping === "none") return [{ key: "all", label: "Procedures", sops: manual.sops }];
  if (grouping === "pillar") {
    return PILLAR_ORDER
      .map((pillar) => ({ key: pillar, label: PILLAR_LABELS[pillar], sops: manual.sops.filter((sop) => sop.pillar === pillar) }))
      .filter((group) => group.sops.length > 0);
  }
  const groups = new Map<string, OutlineGroup>();
  for (const sop of manual.sops) {
    const label = sop.department.trim() || "General";
    const key = label.toLowerCase();
    if (!groups.has(key)) groups.set(key, { key, label, sops: [] });
    groups.get(key)!.sops.push(sop);
  }
  return [...groups.values()];
}

/** The order SOPs read in the rail (and in Write's previous/next). */
export function outlineOrder(manual: Pick<SopManual, "sops" | "grouping">): Sop[] {
  return outlineGroups(manual).flatMap((group) => group.sops);
}

/**
 * Moves one SOP before another. Dropped into a different pillar or
 * department group, it joins that group.
 */
export function moveSopBefore(sops: readonly Sop[], movingId: string, targetId: string | null, grouping: SopGrouping): Sop[] {
  const moving = sops.find((sop) => sop.id === movingId);
  if (!moving || movingId === targetId) return [...sops];
  const rest = sops.filter((sop) => sop.id !== movingId);
  const target = targetId ? rest.find((sop) => sop.id === targetId) : undefined;
  let moved = moving;
  if (target && grouping === "pillar" && target.pillar !== moving.pillar) moved = { ...moving, pillar: target.pillar };
  if (target && grouping === "department" && target.department.trim().toLowerCase() !== moving.department.trim().toLowerCase()) moved = { ...moving, department: target.department };
  const index = target ? rest.indexOf(target) : rest.length;
  return [...rest.slice(0, index), moved, ...rest.slice(index)];
}

/** Moves an SOP one place up or down within the rail order. */
export function moveSopByOffset(manual: Pick<SopManual, "sops" | "grouping">, sopId: string, offset: -1 | 1): Sop[] {
  const order = outlineOrder(manual);
  const index = order.findIndex((sop) => sop.id === sopId);
  const target = order[index + offset];
  if (index < 0 || !target) return manual.sops;
  return offset < 0
    ? moveSopBefore(manual.sops, sopId, target.id, manual.grouping)
    : moveSopBefore(manual.sops, target.id, sopId, manual.grouping);
}

export function arrayMove<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export type CatalogGroupMode = "pillar" | "department";
export type CatalogGroup = { key: string; label: string; topics: SopCatalogTopic[] };

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function filterCatalog(topics: readonly SopCatalogTopic[], query: string): SopCatalogTopic[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return [...topics];
  return topics.filter((topic) => {
    const haystack = normalize([topic.title, topic.department, topic.description, ...topic.aliases].join(" "));
    return words.every((word) => haystack.includes(word));
  });
}

export function groupCatalog(topics: readonly SopCatalogTopic[], mode: CatalogGroupMode): CatalogGroup[] {
  if (mode === "pillar") {
    return PILLAR_ORDER
      .map((pillar) => ({ key: pillar, label: PILLAR_LABELS[pillar], topics: topics.filter((topic) => topic.pillar === pillar) }))
      .filter((group) => group.topics.length > 0);
  }
  const groups = new Map<string, CatalogGroup>();
  for (const topic of topics) {
    const label = topic.department || "General";
    if (!groups.has(label)) groups.set(label, { key: label, label, topics: [] });
    groups.get(label)!.topics.push(topic);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function catalogTopicsById(ids: Iterable<string>): SopCatalogTopic[] {
  const wanted = new Set(ids);
  return SOP_CATALOG.filter((topic) => wanted.has(topic.id));
}

export type CustomSopDraft = { id: string; title: string; pillar: SopPillar; department: string };

export function sopFromTopic(topic: SopCatalogTopic): Sop {
  return createEmptySop({ title: topic.title, catalogId: topic.id, pillar: topic.pillar, department: topic.department, owner: topic.owner });
}

export function sopFromCustom(draft: CustomSopDraft): Sop {
  return createEmptySop({ title: draft.title.trim(), pillar: draft.pillar, department: draft.department.trim() });
}

/**
 * Applies AI-written sections to an SOP, matched by kind. The SOP keeps its
 * own section ids, headings and on/off choices, and any custom section.
 */
export function mergeGeneratedSections(current: readonly SopSection[], generated: readonly SopSection[]): SopSection[] {
  const pool = [...generated];
  return current.map((section) => {
    if (section.kind === "custom") return section;
    const index = pool.findIndex((item) => item.kind === section.kind);
    if (index < 0) return section;
    const [match] = pool.splice(index, 1);
    return { ...match, id: section.id, title: section.title, enabled: section.enabled } as SopSection;
  });
}

/** Gives SOPs without a code their suggested "{PREFIX}-{DEPT}-NNN" code. */
export function withSuggestedCodes(manual: SopManual): SopManual {
  const codes = suggestSopCodes(manual);
  return { ...manual, sops: manual.sops.map((sop) => (sop.code.trim() ? sop : { ...sop, code: codes.get(sop.id) ?? "" })) };
}

/* ------------------------------------------------------------------ */
/* New manual                                                          */
/* ------------------------------------------------------------------ */

/** "{CODE}/SOP/01": the organization code when it has one, else the company initials. */
export function suggestDocNo(company: Pick<Company, "name">, organizationCode?: string): string {
  const code = (organizationCode ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
  const prefix = code || manualCodePrefix({ control: { docNo: "" } as SopManualControl, company: { name: company.name } as Company });
  return `${prefix}/SOP/01`;
}

export function manualTitle(manual: Pick<SopManual, "company">): string {
  const name = manual.company.name.trim();
  return name ? `${name} SOP Manual` : "SOP Manual";
}

export type NewManualInput = {
  company: Company;
  control: SopManualControl;
  topics: readonly SopCatalogTopic[];
  custom: readonly CustomSopDraft[];
  theme: SopTemplateId;
  themeOptions: SopThemeOptions;
  cover: SopCover;
  grouping?: SopGrouping;
  /** Optional facts for the AI; kept only when something was filled in. */
  facts?: SopCompanyFacts;
};

export function buildNewManual(input: NewManualInput): SopManual {
  const sops = [...input.topics.map(sopFromTopic), ...input.custom.filter((draft) => draft.title.trim()).map(sopFromCustom)];
  const base = createEmptyManual({ company: input.company, sops });
  const facts = input.facts ? companyFacts({ facts: input.facts }) : undefined;
  return withSuggestedCodes({
    ...base,
    control: { ...base.control, ...input.control },
    grouping: input.grouping ?? "pillar",
    theme: input.theme,
    themeOptions: input.themeOptions,
    cover: input.cover,
    ...(facts && hasCompanyFacts(facts) ? { facts } : {}),
  });
}

/** "just now", "5 min ago", "2h ago", "3 days ago", then the date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const time = new Date(iso).valueOf();
  if (Number.isNaN(time)) return "";
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(time));
}

/** "14 SOPs · 96 pages · updated 2h ago" for a drafts row. */
export function manualSummaryLine(summary: { partCount: number; pageCount: number | null; updatedAt: string }, now = Date.now()): string {
  const parts = [`${summary.partCount} ${summary.partCount === 1 ? "SOP" : "SOPs"}`];
  if (summary.pageCount) parts.push(`${summary.pageCount} pages`);
  const updated = relativeTime(summary.updatedAt, now);
  if (updated) parts.push(`updated ${updated}`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Readiness                                                           */
/* ------------------------------------------------------------------ */

export type ReadinessTarget =
  | { kind: "details" }
  | { kind: "front" }
  | { kind: "closing" }
  | { kind: "design" }
  | { kind: "sop"; sopId: string };

export type ReadinessCheck = { id: string; label: string; detail: string; ok: boolean; fix?: ReadinessTarget };

/**
 * Square-bracket placeholders the AI leaves for unknown values, such as
 * "[consented discharge limit]". Empty brackets, single characters ("[x]")
 * and numeric citations ("[1]", "[2, 3]", "[4-6]") are not placeholders.
 */
const PLACEHOLDER = /\[([^[\]\n]{2,120})\]/g;

export function findPlaceholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].filter((match) => /\p{L}/u.test(match[1]) && match[1].trim().length >= 2).map((match) => match[0]);
}

export type PlaceholderHit = { text: string; where: string; target: ReadinessTarget };

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

/** Every placeholder left in the front matter, the enabled SOPs (in rail order) and the closing, in reading order. */
export function manualPlaceholders(manual: SopManual): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  const collect = (texts: readonly string[], where: string, target: ReadinessTarget) => {
    for (const text of texts) for (const found of findPlaceholders(text ?? "")) hits.push({ text: found, where, target });
  };
  const front = manual.frontMatter;
  collect([
    ...blockTexts(front.introduction), ...blockTexts(front.objective), ...front.benefits,
    ...front.coreValues.flatMap((value) => [value.title, value.description]),
    ...blockTexts(front.howToUse), ...front.glossary.flatMap((row) => [row.term, row.definition]),
  ], "Front matter", { kind: "front" });
  for (const sop of outlineOrder({ ...manual, sops: enabledSops(manual) })) {
    const name = [sop.code.trim(), sop.title.trim()].filter(Boolean).join(" ") || "Untitled SOP";
    for (const section of sop.sections.filter((item) => item.enabled)) collect(sectionTexts(section), `${name}, ${section.title.trim() || "section"}`, { kind: "sop", sopId: sop.id });
  }
  const closing = manual.closing;
  collect([
    ...blockTexts(closing.reviewMechanism), ...closing.revisionHistory.map((entry) => entry.description),
    closing.approval.statement, ...closing.approval.signatories.flatMap((signatory) => [signatory.role, signatory.name, signatory.designation]),
  ], "Closing", { kind: "closing" });
  return hits;
}

export function readinessChecks(manual: SopManual): ReadinessCheck[] {
  const sops = enabledSops(manual);
  const unwritten = sops.filter((sop) => !isSopWritten(sop));
  const missingOwner = sops.filter((sop) => !sop.owner.trim() || !sop.department.trim());
  const emptyProcedure = sops.filter((sop) => {
    const procedure = sop.sections.find((section) => section.kind === "procedure");
    return procedure?.enabled && !sectionHasContent(procedure);
  });
  const codes = sops.map((sop) => sop.code.trim()).filter(Boolean);
  const duplicateCodes = codes.filter((code, index) => codes.indexOf(code) !== index);
  const front = manual.frontMatter;
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  const contacts = reachableContacts(companyFacts(manual));
  const placeholders = manualPlaceholders(manual);
  return [
    { id: "company", label: "Company and approver", ok: Boolean(manual.company.name.trim() && manual.control.approvedBy.trim()), detail: manual.company.name.trim() && manual.control.approvedBy.trim() ? `${manual.company.name}, approved by ${manual.control.approvedBy}` : "Add the company name and who approves the manual.", fix: { kind: "details" } },
    { id: "control", label: "Document control", ok: Boolean(manual.control.docNo.trim() && manual.control.effectiveDate), detail: manual.control.docNo.trim() && manual.control.effectiveDate ? `${manual.control.docNo}, Rev ${manual.control.revision || "01"}` : "Add a document number and an effective date.", fix: { kind: "details" } },
    { id: "contacts", label: "Contacts for reporting channels", ok: contacts.length > 0, detail: contacts.length ? `${plural(contacts.length, "contact")} for reports and concerns.` : "Add an email or phone number for reporting concerns, so SOPs name a real channel.", fix: { kind: "details" } },
    { id: "sops", label: "SOPs written", ok: sops.length > 0 && unwritten.length === 0, detail: sops.length === 0 ? "Add at least one SOP." : unwritten.length ? `${plural(unwritten.length, "SOP")} still to write.` : `All ${plural(sops.length, "SOP")} written.`, fix: unwritten[0] ? { kind: "sop", sopId: unwritten[0].id } : undefined },
    { id: "procedure", label: "Every SOP has a procedure", ok: emptyProcedure.length === 0, detail: emptyProcedure.length ? `${plural(emptyProcedure.length, "SOP")} without procedure steps.` : "Each SOP lists its steps.", fix: emptyProcedure[0] ? { kind: "sop", sopId: emptyProcedure[0].id } : undefined },
    { id: "owners", label: "Owners and departments", ok: missingOwner.length === 0, detail: missingOwner.length ? `${plural(missingOwner.length, "SOP")} without an owner or department.` : "Every SOP has an owner.", fix: missingOwner[0] ? { kind: "sop", sopId: missingOwner[0].id } : undefined },
    { id: "codes", label: "Unique SOP codes", ok: duplicateCodes.length === 0 && codes.length === sops.length, detail: duplicateCodes.length ? `${duplicateCodes[0]} is used more than once.` : codes.length < sops.length ? "Some SOPs have no code." : "Codes are unique.", fix: (() => { const sop = sops.find((item) => !item.code.trim() || duplicateCodes.includes(item.code.trim())); return sop ? { kind: "sop" as const, sopId: sop.id } : undefined; })() },
    { id: "placeholders", label: "Placeholders to fill", ok: placeholders.length === 0, detail: placeholders.length ? `${plural(placeholders.length, "placeholder")} still to replace. First: ${placeholders[0].text} in ${placeholders[0].where}.` : "No [bracketed] placeholders left.", fix: placeholders[0]?.target },
    { id: "front", label: "Introduction", ok: front.introduction.some((block) => block.text.trim()), detail: front.introduction.some((block) => block.text.trim()) ? "Introduction written." : "The manual has no introduction yet.", fix: { kind: "front" } },
    { id: "closing", label: "Approval statement", ok: Boolean(manual.closing.approval.statement.trim()), detail: manual.closing.approval.statement.trim() ? "Approval statement written." : "Add the approval statement for the closing page.", fix: { kind: "closing" } },
  ];
}
