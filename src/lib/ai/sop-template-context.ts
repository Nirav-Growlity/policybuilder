/**
 * Reference material for SOP writing: example SOPs from the extracted corpus
 * (data/seed-sops/*.json, SeedSopManual format) and the user's own imported
 * manual. Everything is rendered as compact plain text within a character
 * budget so a request stays well under the token ceiling.
 */
import fs from "node:fs";
import path from "node:path";

import type { RichTextBlock } from "../types";
import type { GeneratedSopSection } from "../sop/schema";
import { narrativeKindForHeading } from "../sop/section-headings";
import type { SeedSop, SeedSopManual } from "../sop/seed-types";
import type { SopSectionKind } from "../sop/types";

/** About 7K tokens of examples: enough to show the house style and length. */
export const SOP_REFERENCE_MAX_CHARS = 24_000;
export const SOP_IMPORTED_MAX_CHARS = 16_000;
const MIN_EXAMPLES = 3;
const MAX_EXAMPLES = 5;

export const DEFAULT_SEED_SOP_DIRECTORY = path.join(process.cwd(), "data", "seed-sops");

const seedCache = new Map<string, SeedSopManual[]>();

function isSeedManual(value: unknown): value is SeedSopManual {
  const candidate = value as Partial<SeedSopManual> | null;
  return Boolean(candidate && typeof candidate === "object" && typeof candidate.company === "string" && Array.isArray(candidate.sops));
}

/** Reads the corpus once per directory. A missing or unreadable folder is an empty corpus. */
export function loadSeedSopManuals(directory = DEFAULT_SEED_SOP_DIRECTORY): SeedSopManual[] {
  const cached = seedCache.get(directory);
  if (cached) return cached;
  let manuals: SeedSopManual[] = [];
  try {
    manuals = fs.readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .flatMap((name) => {
        try {
          const parsed: unknown = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
          return isSeedManual(parsed) ? [parsed] : [];
        } catch {
          return [];
        }
      });
  } catch {
    manuals = [];
  }
  seedCache.set(directory, manuals);
  return manuals;
}

/** Test hook: forget what was read so a fixture directory can change. */
export function clearSeedSopCache() {
  seedCache.clear();
}

const STOP_WORDS = new Set(["and", "the", "for", "with", "sop", "procedure", "procedures", "standard", "operating", "management", "policy", "process"]);

function words(value: string): Set<string> {
  return new Set(
    value.toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

function overlap(left: Set<string>, right: Set<string>) {
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const squash = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

function clip(value: string, max: number) {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  return `${(sentence > max * 0.6 ? cut.slice(0, sentence + 1) : cut).trimEnd()}…`;
}

type BlockLike = Pick<RichTextBlock, "type" | "text"> & Partial<Pick<RichTextBlock, "columns" | "rows">>;

function renderBlocks(blocks: unknown, indent = ""): string[] {
  if (!Array.isArray(blocks)) return [];
  return (blocks as BlockLike[]).flatMap((block) => {
    if (!block || typeof block !== "object") return [];
    if (block.type === "table" && Array.isArray(block.rows)) {
      const header = Array.isArray(block.columns) && block.columns.length ? [`${indent}| ${block.columns.map(squash).join(" | ")} |`] : [];
      return [...header, ...block.rows.map((row) => `${indent}| ${(Array.isArray(row) ? row : []).map(squash).join(" | ")} |`)];
    }
    const lines = String(block.text ?? "").split(/\n+/).map(squash).filter(Boolean);
    if (block.type === "bullets") return lines.map((line) => `${indent}- ${line}`);
    if (block.type === "numbered") return lines.map((line, index) => `${indent}${index + 1}. ${line}`);
    return lines.map((line) => `${indent}${line}`);
  });
}

/** One generated-shape section (corpus format) as compact text. */
export function renderGeneratedSection(section: GeneratedSopSection): string {
  const lines = [`## ${squash(section.title) || section.kind} [${section.kind}]`];
  switch (section.kind) {
    case "definitions":
      lines.push(...section.rows.map((row) => `| ${squash(row.term)} | ${squash(row.definition)} |`));
      break;
    case "responsibilities":
      lines.push(...section.rows.map((row) => `| ${squash(row.role)} | ${row.responsibilities.map(squash).join("; ")} |`));
      break;
    case "procedure":
      section.steps.forEach((step, index) => {
        lines.push(`${index + 1}. ${squash(step.heading)}${step.responsible ? ` [${squash(step.responsible)}]` : ""}`);
        lines.push(...renderBlocks(step.body, "   "));
        (step.substeps ?? []).forEach((substep, subIndex) => {
          lines.push(`   ${index + 1}.${subIndex + 1} ${squash(substep.text)}${substep.responsible ? ` [${squash(substep.responsible)}]` : ""}`);
        });
      });
      break;
    case "monitoring":
      lines.push(...section.kpis.map((kpi) => `| ${squash(kpi.indicator)} | ${squash(kpi.target)} | ${squash(kpi.frequency)} | ${squash(kpi.owner)} |`));
      lines.push(...renderBlocks(section.narrative));
      break;
    case "records":
      lines.push(...section.rows.map((row) => `| ${row.code?.trim() ? `${squash(row.code)} | ` : ""}${squash(row.record)} | ${squash(row.owner)} | ${squash(row.retention)} | ${squash(row.format)} |`));
      break;
    case "references":
      lines.push(...section.items.map((item) => `- ${squash(item)}`));
      break;
    default:
      lines.push(...renderBlocks(section.blocks));
  }
  return lines.join("\n");
}

/**
 * A seed SOP's sections, with `custom` ones that an introduction, compliance
 * or corrective-action kind now covers given that kind (the corpus was
 * extracted before those kinds existed).
 */
export function seedSopSections(sop: SeedSop): GeneratedSopSection[] {
  const sections = Array.isArray(sop.sections) ? sop.sections : [];
  return sections.map((section) => {
    if (section?.kind !== "custom") return section;
    const kind = narrativeKindForHeading(squash(section.title));
    return kind ? { ...section, kind } : section;
  });
}

function renderSeedSop(sop: SeedSop, manual: SeedSopManual, index: number, sectionKind: SopSectionKind | undefined, maxChars: number) {
  const sections = seedSopSections(sop);
  // For a one-section request, show that section (plus purpose for orientation).
  const chosen = sectionKind
    ? sections.filter((section) => section.kind === sectionKind || section.kind === "purpose")
    : sections;
  const header = `### REFERENCE ${index + 1}: ${squash(sop.title)} (${squash(manual.company)}; ${squash(manual.industry) || "industry not stated"}; about ${sop.sourceWords || "?"} words)`;
  const body = chosen.map((section) => {
    try {
      return renderGeneratedSection(section);
    } catch {
      return "";
    }
  }).filter(Boolean).join("\n");
  return clip(`${header}\n${body}`, maxChars);
}

/* ------------------------------------------------------------------ */
/* Corpus examples                                                     */
/* ------------------------------------------------------------------ */

export type SopReferenceQuery = {
  catalogId?: string;
  title: string;
  /** Limit each example to this section (for single-section requests). */
  sectionKind?: SopSectionKind;
  industryTags: string[];
};

export type SopReferenceOptions = {
  maxChars?: number;
  directory?: string;
};

type Candidate = { sop: SeedSop; manual: SeedSopManual; score: number };

/** Picks the best example SOPs: same catalog topic first, same industry next, then title overlap. */
export function selectSeedSops(query: SopReferenceQuery, manuals: SeedSopManual[]): Candidate[] {
  const tags = new Set(query.industryTags);
  const titleWords = words(query.title);
  const candidates: Candidate[] = [];
  for (const manual of manuals) {
    const industryMatch = (manual.industryTags ?? []).filter((tag) => tags.has(tag)).length;
    for (const sop of manual.sops ?? []) {
      if (!sop || typeof sop.title !== "string" || !Array.isArray(sop.sections) || sop.sections.length === 0) continue;
      if (query.sectionKind && !seedSopSections(sop).some((section) => section.kind === query.sectionKind)) continue;
      const sameTopic = Boolean(query.catalogId && sop.catalogId === query.catalogId);
      const shared = overlap(titleWords, words(sop.title));
      if (!sameTopic && shared === 0) continue;
      const score = (sameTopic ? 100 : 0) + shared * 12 + industryMatch * 8 + Math.min(sop.sections.length, 10);
      candidates.push({ sop, manual, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.manual.company.localeCompare(b.manual.company) || a.sop.title.localeCompare(b.sop.title));

  // Prefer different companies so the examples show a range, then fill up.
  const picked: Candidate[] = [];
  const companies = new Set<string>();
  for (const candidate of candidates) {
    if (picked.length >= MAX_EXAMPLES) break;
    if (companies.has(candidate.manual.company)) continue;
    picked.push(candidate);
    companies.add(candidate.manual.company);
  }
  for (const candidate of candidates) {
    if (picked.length >= MIN_EXAMPLES) break;
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return picked.sort((a, b) => b.score - a.score);
}

/**
 * Example SOPs for one topic as compact text, or "" when the corpus has
 * nothing relevant. Ends with the typical length so the model can match it.
 */
export function buildSopReferenceContext(query: SopReferenceQuery, options: SopReferenceOptions = {}): string {
  const maxChars = options.maxChars ?? SOP_REFERENCE_MAX_CHARS;
  if (maxChars < 400) return "";
  const picked = selectSeedSops(query, loadSeedSopManuals(options.directory));
  if (!picked.length) return "";
  const intro = "REFERENCE SOPS (real manuals from other companies; learn structure, depth and tone, never copy company names, sites or figures):";
  const lengths = picked.map((candidate) => candidate.sop.sourceWords).filter((value) => value > 0).sort((a, b) => a - b);
  const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0;
  const footer = median && !query.sectionKind ? `Typical length of these references: about ${Math.round(median / 50) * 50} words per SOP.` : "";
  const perExample = Math.floor((maxChars - intro.length - footer.length - 8) / picked.length);
  const rendered = picked.map((candidate, index) => renderSeedSop(candidate.sop, candidate.manual, index, query.sectionKind, perExample));
  return [intro, ...rendered, footer].filter(Boolean).join("\n\n");
}

/** Introductions, objectives and review text from manuals in the same industry, for front matter and closing. */
export function buildSeedFrontMatterContext(
  industryTags: string[],
  field: "introduction" | "objective" | "reviewMechanism" | "all",
  options: SopReferenceOptions = {},
): string {
  const maxChars = options.maxChars ?? 8_000;
  const tags = new Set(industryTags);
  const manuals = loadSeedSopManuals(options.directory)
    .map((manual) => ({ manual, score: (manual.industryTags ?? []).filter((tag) => tags.has(tag)).length }))
    .sort((a, b) => b.score - a.score || a.manual.company.localeCompare(b.manual.company))
    .slice(0, 3);
  const fields = field === "all" ? (["introduction", "objective", "reviewMechanism"] as const) : [field];
  const per = Math.floor(maxChars / Math.max(1, manuals.length));
  const parts = manuals.map(({ manual }, index) => {
    const text = fields
      .map((name) => squash(manual.frontMatter?.[name]) ? `${name}: ${squash(manual.frontMatter[name])}` : "")
      .filter(Boolean)
      .join("\n");
    return text ? clip(`### REFERENCE MANUAL ${index + 1} (${squash(manual.industry) || "industry not stated"})\n${text}`, per) : "";
  }).filter(Boolean);
  return parts.length ? ["REFERENCE MANUAL TEXT (other companies; learn tone and length only):", ...parts].join("\n\n") : "";
}

/* ------------------------------------------------------------------ */
/* Imported manual (ParsedSopManual from lib/docx/sop-parse)            */
/* ------------------------------------------------------------------ */

type ImportedSection = { label?: unknown; kind?: unknown; blocks?: unknown };
type ImportedSop = { title?: unknown; code?: unknown; department?: unknown; sections?: unknown };
type ImportedManual = { title?: unknown; sops?: unknown; frontMatter?: { sections?: unknown }; closing?: { sections?: unknown } };

function asImportedManual(value: unknown): ImportedManual | null {
  return value && typeof value === "object" && Array.isArray((value as ImportedManual).sops) ? (value as ImportedManual) : null;
}

function normalTitle(value: string) {
  return value.toLowerCase().replace(/^(sop|standard operating procedure)\s*(for|on|of)?\s*[:-]?\s*/i, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** The imported SOP whose title best matches, or undefined when none is close. */
export function matchImportedSop(importedContext: unknown, title: string): ImportedSop | undefined {
  const manual = asImportedManual(importedContext);
  if (!manual) return undefined;
  const target = normalTitle(title);
  const targetWords = words(title);
  let best: { sop: ImportedSop; score: number } | undefined;
  for (const sop of manual.sops as ImportedSop[]) {
    if (!sop || typeof sop.title !== "string") continue;
    const candidate = normalTitle(sop.title);
    let score = 0;
    if (candidate && candidate === target) score = 1;
    else if (candidate && target && (candidate.includes(target) || target.includes(candidate))) score = 0.85;
    else {
      const candidateWords = words(sop.title);
      const union = new Set([...candidateWords, ...targetWords]).size;
      score = union ? overlap(candidateWords, targetWords) / union : 0;
    }
    if (score > (best?.score ?? 0)) best = { sop, score };
  }
  return best && best.score >= 0.5 ? best.sop : undefined;
}

function renderImportedSections(sections: unknown, sectionKind?: string): string[] {
  if (!Array.isArray(sections)) return [];
  return (sections as ImportedSection[])
    .filter((section) => !sectionKind || section.kind === sectionKind || (sectionKind === "definitions" && section.kind === "abbreviations"))
    .flatMap((section) => {
      const body = renderBlocks(section.blocks);
      return body.length ? [`## ${squash(section.label) || "Section"}${typeof section.kind === "string" ? ` [${section.kind}]` : ""}`, ...body] : [];
    });
}

/**
 * The company's own version of this SOP, from the imported manual, as
 * PRIMARY context. Returns "" when nothing in the import matches the title.
 */
export function buildImportedSopContext(importedContext: unknown, title: string, options: { maxChars?: number; sectionKind?: SopSectionKind } = {}): string {
  const sop = matchImportedSop(importedContext, title);
  if (!sop) return "";
  const maxChars = options.maxChars ?? SOP_IMPORTED_MAX_CHARS;
  let lines = renderImportedSections(sop.sections, options.sectionKind);
  // A section the import does not have: show the whole SOP instead.
  if (!lines.length && options.sectionKind) lines = renderImportedSections(sop.sections);
  if (!lines.length) return "";
  const header = [
    `PRIMARY CONTEXT: the company's existing SOP "${squash(sop.title)}"${typeof sop.code === "string" && sop.code ? ` (${sop.code})` : ""}, imported from its current manual.`,
    "Keep its facts, roles, sequence, records and terminology. Improve structure and wording, fill obvious gaps, and do not contradict it.",
  ].join("\n");
  return clip(`${header}\n${lines.join("\n")}`, maxChars);
}

/** Front matter or closing text from the imported manual, as PRIMARY context. */
export function buildImportedManualSectionsContext(importedContext: unknown, part: "frontMatter" | "closing", maxChars = 8_000): string {
  const manual = asImportedManual(importedContext);
  const lines = manual ? renderImportedSections(manual[part]?.sections) : [];
  if (!lines.length) return "";
  return clip(`PRIMARY CONTEXT: the company's existing ${part === "frontMatter" ? "manual introduction" : "manual closing"}, imported from its current manual. Keep its facts and intent.\n${lines.join("\n")}`, maxChars);
}
