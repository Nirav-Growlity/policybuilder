/**
 * Pure helpers between the SOP AI and the manual: turn model output (the
 * id-less generated shapes) into SopSection objects, and merge a finished
 * result into a SopManual. Shared by the route, the generation queue and the UI.
 */
import type { RichTextBlock } from "../types";
import type { ManualAiField, SopAiResult } from "./ai-contract";
import { createEmptySopSection, createSopId } from "./initial-manual";
import type { GeneratedSopSection } from "./schema";
import { sopSectionLabel, type Sop, type SopManual, type SopSection, type SopSectionKind } from "./types";

type IdFactory = (prefix: string) => string;

const KNOWN_KINDS = new Set<SopSectionKind>([
  "purpose", "scope", "definitions", "responsibilities", "procedure", "monitoring", "training", "records", "references", "review", "appendix", "custom",
]);

const BLOCK_TYPES = new Set<RichTextBlock["type"]>(["paragraph", "bullets", "numbered", "table"]);

const str = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

function toBlocks(value: unknown, id: IdFactory): RichTextBlock[] {
  return list(value).flatMap((raw): RichTextBlock[] => {
    if (typeof raw === "string") return raw.trim() ? [{ id: id("block"), type: "paragraph", text: raw }] : [];
    const block = record(raw);
    const type = BLOCK_TYPES.has(block.type as RichTextBlock["type"]) ? (block.type as RichTextBlock["type"]) : "paragraph";
    const result: RichTextBlock = { id: id("block"), type, text: str(block.text) };
    if (type === "table") {
      result.columns = list(block.columns).map(str);
      result.rows = list(block.rows).map((row) => list(row).map(str));
      if (!result.rows.length && !result.text) return [];
    } else if (!result.text.trim()) {
      return [];
    }
    return [result];
  });
}

/**
 * One generated section as a SopSection. Tolerant of partial objects (a
 * stream still being written): missing fields become empty values.
 * Returns undefined for an unknown kind.
 */
export function generatedSectionToSopSection(
  raw: GeneratedSopSection | Record<string, unknown>,
  options: { id?: string; title?: string; enabled?: boolean; idFactory?: IdFactory } = {},
): SopSection | undefined {
  const source = record(raw);
  const kind = source.kind as SopSectionKind;
  if (!KNOWN_KINDS.has(kind)) return undefined;
  const id = options.idFactory ?? createSopId;
  const section = createEmptySopSection(kind, {
    title: options.title ?? (str(source.title).trim() || (kind === "custom" ? undefined : sopSectionLabel(kind))),
    enabled: options.enabled ?? true,
  });
  section.id = options.id ?? id("section");
  switch (section.kind) {
    case "definitions":
      section.rows = list(source.rows).map(record).map((row) => ({ term: str(row.term), definition: str(row.definition) })).filter((row) => row.term || row.definition);
      break;
    case "responsibilities":
      section.rows = list(source.rows).map(record).map((row) => ({ role: str(row.role), responsibilities: list(row.responsibilities).map(str).filter(Boolean) })).filter((row) => row.role);
      break;
    case "procedure":
      section.steps = list(source.steps).map(record).filter((step) => str(step.heading) || list(step.body).length).map((step) => {
        const substeps = list(step.substeps).map(record).filter((sub) => str(sub.text)).map((sub) => ({
          id: id("substep"),
          text: str(sub.text),
          ...(str(sub.responsible) ? { responsible: str(sub.responsible) } : {}),
        }));
        return {
          id: id("step"),
          heading: str(step.heading),
          body: toBlocks(step.body, id),
          ...(str(step.responsible) ? { responsible: str(step.responsible) } : {}),
          ...(substeps.length ? { substeps } : {}),
        };
      });
      break;
    case "monitoring":
      section.kpis = list(source.kpis).map(record).map((kpi) => ({ indicator: str(kpi.indicator), target: str(kpi.target), frequency: str(kpi.frequency), owner: str(kpi.owner) })).filter((kpi) => kpi.indicator);
      section.narrative = toBlocks(source.narrative, id);
      break;
    case "records":
      section.rows = list(source.rows).map(record).map((row) => ({ record: str(row.record), owner: str(row.owner), retention: str(row.retention), format: str(row.format) })).filter((row) => row.record);
      break;
    case "references":
      section.items = list(source.items).map(str).filter(Boolean);
      break;
    default:
      section.blocks = toBlocks(source.blocks, id);
  }
  return section;
}

/** Every generated section of a (possibly partial) generated SOP, in model order. */
export function generatedSectionsToSop(sections: unknown, idFactory?: IdFactory): SopSection[] {
  return list(sections).flatMap((section) => {
    const mapped = generatedSectionToSopSection(record(section), { idFactory });
    return mapped ? [mapped] : [];
  });
}

/**
 * The compact shape the model writes (lib/ai/sop-prompts.ts): `sections` is
 * an object keyed by section kind. This turns one entry into the generated
 * section shape.
 */
export function wireSectionToGenerated(kind: SopSectionKind, value: unknown, title = ""): Record<string, unknown> {
  switch (kind) {
    case "definitions":
    case "responsibilities":
    case "records":
      return { kind, title, rows: value };
    case "procedure":
      return { kind, title, steps: value };
    case "monitoring":
      return { kind, title, ...record(value) };
    case "references":
      return { kind, title, items: value };
    default:
      return { kind, title, blocks: value };
  }
}

/** Sections from the compact shape, in key order (document order). Unknown keys are skipped. */
export function wireSectionsToSop(
  sections: unknown,
  options: { titles?: Partial<Record<SopSectionKind, string>>; idFactory?: IdFactory } = {},
): SopSection[] {
  return Object.entries(record(sections)).flatMap(([kind, value]) => {
    if (!KNOWN_KINDS.has(kind as SopSectionKind)) return [];
    const title = options.titles?.[kind as SopSectionKind];
    const mapped = generatedSectionToSopSection(wireSectionToGenerated(kind as SopSectionKind, value, title), { idFactory: options.idFactory });
    return mapped ? [mapped] : [];
  });
}

/**
 * Sections parsed so far from a streaming SOP, for live display. Accepts the
 * compact keyed shape and the generated array shape. Ids are positional so
 * they stay stable from one partial parse to the next.
 */
export function partialSectionsFromGenerated(partial: unknown, titles?: Partial<Record<SopSectionKind, string>>): SopSection[] {
  let counter = 0;
  const positional: IdFactory = (prefix) => `partial-${prefix}-${counter++}`;
  const sections = record(partial).sections;
  return Array.isArray(sections) ? generatedSectionsToSop(sections, positional) : wireSectionsToSop(sections, { titles, idFactory: positional });
}

/* ------------------------------------------------------------------ */
/* Merging results into the manual                                     */
/* ------------------------------------------------------------------ */

function updateSop(manual: SopManual, sopId: string, update: (sop: Sop) => Sop): SopManual {
  let found = false;
  const sops = manual.sops.map((sop) => {
    if (sop.id !== sopId) return sop;
    found = true;
    return update(sop);
  });
  return found ? { ...manual, sops } : manual;
}

/** Content of `next` with the identity (id, title, enabled) of `current`. */
function keepIdentity(current: SopSection, next: SopSection): SopSection {
  return { ...next, id: current.id, title: current.title || next.title, enabled: current.enabled } as SopSection;
}

/**
 * Replaces the written sections of one SOP. Sections keep their ids and
 * titles; a section the user switched off stays off and keeps its content,
 * and appendix and custom sections the AI did not write are left as they are.
 */
export function applySopResult(manual: SopManual, sopId: string, result: Extract<SopAiResult, { type: "sop" }>["sop"]): SopManual {
  const byKind = new Map<SopSectionKind, SopSection>();
  for (const section of result.sections) if (!byKind.has(section.kind)) byKind.set(section.kind, section);
  return updateSop(manual, sopId, (sop) => ({
    ...sop,
    department: sop.department.trim() ? sop.department : (result.department ?? sop.department),
    owner: sop.owner.trim() ? sop.owner : (result.owner ?? sop.owner),
    status: "draft",
    sections: sop.sections.map((section) => {
      const next = byKind.get(section.kind);
      if (!next || !section.enabled) return section;
      byKind.delete(section.kind);
      return keepIdentity(section, next);
    }),
  }));
}

/** Replaces one section (a rewrite or a refinement) and marks the SOP as a draft again. */
export function applySectionResult(manual: SopManual, sopId: string, sectionId: string, section: SopSection): SopManual {
  return updateSop(manual, sopId, (sop) => {
    const index = sop.sections.findIndex((candidate) => candidate.id === sectionId);
    if (index < 0) return sop;
    const current = sop.sections[index];
    // A kind mismatch would break the editor for this section; keep the original.
    if (current.kind !== section.kind) return sop;
    const sections = [...sop.sections];
    sections[index] = keepIdentity(current, section);
    return { ...sop, status: "draft", sections };
  });
}

/** Plain text of one manual field, paragraphs separated by a blank line (the text the editor shows). */
export function manualFieldText(manual: SopManual, field: ManualAiField): string {
  if (field === "approvalStatement") return manual.closing.approval.statement.trim();
  const blocks = field === "reviewMechanism" ? manual.closing.reviewMechanism : manual.frontMatter[field];
  return blocks.filter((block) => block.type !== "table").map((block) => block.text.trim()).filter(Boolean).join("\n\n");
}

/** Text of one manual field written so far, from a partial result keyed by field name (paragraphs or the statement). */
export function partialManualText(partial: unknown, field: ManualAiField): string {
  const value = partial && typeof partial === "object" ? (partial as Record<string, unknown>)[field] : undefined;
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).join("\n\n");
}

/**
 * The front matter and closing AI writes paragraphs only and never sees the
 * field's tables, so the writer's tables stay, after the new text.
 */
function withTables(previous: readonly RichTextBlock[], next: RichTextBlock[]): RichTextBlock[] {
  const tables = previous.filter((block) => block.type === "table");
  return tables.length ? [...next, ...tables] : next;
}

export function applyFrontMatterResult(manual: SopManual, frontMatter: Extract<SopAiResult, { type: "front-matter" }>["frontMatter"]): SopManual {
  const current = manual.frontMatter;
  return {
    ...manual,
    frontMatter: {
      ...current,
      ...frontMatter,
      introduction: withTables(current.introduction, frontMatter.introduction),
      objective: withTables(current.objective, frontMatter.objective),
      howToUse: withTables(current.howToUse, frontMatter.howToUse),
    },
  };
}

/** Replaces one narrative field of the front matter or closing, or the approval statement. */
export function applyManualFieldResult(manual: SopManual, result: Extract<SopAiResult, { type: "manual-field" }>): SopManual {
  if (result.field === "approvalStatement") {
    return { ...manual, closing: { ...manual.closing, approval: { ...manual.closing.approval, statement: result.statement } } };
  }
  if (result.field === "reviewMechanism") return { ...manual, closing: { ...manual.closing, reviewMechanism: withTables(manual.closing.reviewMechanism, result.blocks) } };
  return { ...manual, frontMatter: { ...manual.frontMatter, [result.field]: withTables(manual.frontMatter[result.field], result.blocks) } as SopManual["frontMatter"] };
}

export function applyClosingResult(manual: SopManual, result: Pick<Extract<SopAiResult, { type: "closing" }>, "reviewMechanism" | "approvalStatement">): SopManual {
  return {
    ...manual,
    closing: {
      ...manual.closing,
      reviewMechanism: withTables(manual.closing.reviewMechanism, result.reviewMechanism),
      approval: { ...manual.closing.approval, statement: result.approvalStatement },
    },
  };
}

/** Applies any AI result. `target` names the SOP and section the request was about. */
export function applySopAiResult(manual: SopManual, target: { sopId?: string; sectionId?: string }, result: SopAiResult): SopManual {
  switch (result.type) {
    case "sop":
      return target.sopId ? applySopResult(manual, target.sopId, result.sop) : manual;
    case "sop-section":
    case "refine":
      return target.sopId && target.sectionId ? applySectionResult(manual, target.sopId, target.sectionId, result.section) : manual;
    case "front-matter":
      return applyFrontMatterResult(manual, result.frontMatter);
    case "closing":
      return applyClosingResult(manual, result);
    case "manual-field":
      return applyManualFieldResult(manual, result);
  }
}

/** Marks SOPs as being written, so the list shows progress before the first text arrives. */
export function markSopsGenerating(manual: SopManual, sopIds: readonly string[]): SopManual {
  const ids = new Set(sopIds);
  return { ...manual, sops: manual.sops.map((sop) => (ids.has(sop.id) ? { ...sop, status: "generating" } : sop)) };
}
