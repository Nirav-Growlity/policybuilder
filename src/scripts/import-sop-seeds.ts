/**
 * Extracts the reference SOP corpus into data/seed-sops/<company-slug>.json
 * (SeedSopManual, lib/sop/seed-types.ts) and refreshes data/sop-catalog.json.
 *
 * Every manual is parsed deterministically (parseSopDocx; the one PDF goes
 * through pdftotext and is split on its table of contents). Claude Haiku then
 * normalises each SOP into the generated SOP schema and maps it to a catalog
 * topic, plus one request per manual for its front matter and industry. All
 * requests go through the Message Batches API (50% price).
 *
 *   npx tsx scripts/import-sop-seeds.ts --dry-run        parse and print the cost estimate only
 *   npx tsx scripts/import-sop-seeds.ts --sample 3       run 3 requests directly and print them
 *   npx tsx scripts/import-sop-seeds.ts                  submit (or resume the saved batch), collect, write
 *   npx tsx scripts/import-sop-seeds.ts --batch <id>     only collect the results of an existing batch
 *   npx tsx scripts/import-sop-seeds.ts --retry-failed   resubmit requests without a valid result
 *   npx tsx scripts/import-sop-seeds.ts --redo front     resubmit chosen requests (a kind or custom ids) after a prompt change
 *   npx tsx scripts/import-sop-seeds.ts --remap-all      run the classification pass for every SOP, not only unmapped ones
 *   npx tsx scripts/import-sop-seeds.ts --write-only     rebuild seeds and catalog from cached results
 *
 * State (batch ids, cached results) lives in src/.scratch/sop-seeds/.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { buildClaudeParams, CONTEXT_TOKEN_CEILING, getClaudeClient } from "../lib/ai/claude";
import { readDocxModel } from "../lib/docx/docx-model";
import { parseSopDocx, type ParsedSop, type ParsedSopManual } from "../lib/docx/sop-parse";
import { companyIndustryTags, SOP_CATALOG, type SopCatalogTopic } from "../lib/sop/catalog";
import { generatedSopSchema, type GeneratedSop, type GeneratedSopSection } from "../lib/sop/schema";
import type { SeedSop, SeedSopManual } from "../lib/sop/seed-types";
import type { RichTextBlock } from "../lib/types";
import { findSopReferenceRoot, listSopReferenceFiles } from "./sop-reference-files";

const SRC = path.join(__dirname, "..");
const SEED_DIR = path.join(SRC, "data", "seed-sops");
const CATALOG_FILE = path.join(SRC, "data", "sop-catalog.json");
const STATE_DIR = path.join(SRC, ".scratch", "sop-seeds");
const STATE_FILE = path.join(STATE_DIR, "state.json");

/** Haiku 5.5 per-million-token prices (prompts up to 100K tokens), halved for batches. */
const PRICE = { input: 0.1 / 2, output: 0.5 / 2, cacheWrite1h: 0.2 / 2, cacheRead: 0.01 / 2 };
/** Requests stay below this many input tokens (the app-wide ceiling). */
const INPUT_TOKEN_CAP = CONTEXT_TOKEN_CEILING;
/** The Haiku 5.5 tokenizer counts more tokens than the app's 3.5 chars/token rule of thumb. */
const estimate = (text: string) => Math.ceil(text.length / 3);

/* ------------------------------------------------------------------ */
/* Output schemas                                                      */
/* ------------------------------------------------------------------ */

const CATALOG_IDS = new Set(SOP_CATALOG.map((topic) => topic.id));
const SECTION_KINDS = [
  "introduction", "purpose", "scope", "definitions", "responsibilities", "procedure", "monitoring", "training", "records", "references",
  "compliance", "corrective", "review", "appendix", "custom",
] as const;

/*
 * generatedSopSchema's 12-way section union compiles to a grammar the API
 * rejects as too large, so the model writes one flat section shape (every
 * field required, unused ones empty) and toGeneratedSop() turns it back into
 * the union before validating with generatedSopSchema.
 */
const flatBlock = z.object({ type: z.enum(["paragraph", "bullets", "numbered", "table"]), text: z.string(), columns: z.array(z.string()), rows: z.array(z.array(z.string())) });
const flatSection = z.object({
  kind: z.enum(SECTION_KINDS),
  title: z.string(),
  blocks: z.array(flatBlock),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })),
  roles: z.array(z.object({ role: z.string(), responsibilities: z.array(z.string()) })),
  steps: z.array(
    z.object({
      heading: z.string(),
      body: z.array(flatBlock),
      responsible: z.string(),
      substeps: z.array(z.object({ text: z.string(), responsible: z.string() })),
    })
  ),
  kpis: z.array(z.object({ indicator: z.string(), target: z.string(), frequency: z.string(), owner: z.string() })),
  records: z.array(z.object({ record: z.string(), owner: z.string(), retention: z.string(), format: z.string() })),
  items: z.array(z.string()),
});
const flatSopSchema = z.object({
  title: z.string(),
  code: z.string(),
  pillar: z.enum(["E", "S", "G"]),
  department: z.string(),
  owner: z.string(),
  sections: z.array(flatSection),
  /** A catalog topic id, or "" when none fits. */
  catalogId: z.string(),
  /** Short generic topic name when catalogId is empty; used to propose new catalog topics. */
  suggestedTopic: z.string(),
});
type FlatBlock = z.infer<typeof flatBlock>;
type GeneratedBlock = Extract<GeneratedSopSection, { kind: "purpose" }>["blocks"][number];

/** Section kinds the model sometimes borrows from the source headings. */
const KIND_ALIASES: Record<string, (typeof SECTION_KINDS)[number]> = {
  overview: "introduction",
  capa: "corrective",
  roles: "responsibilities",
  abbreviations: "definitions",
  kpis: "monitoring",
  annexure: "appendix",
};

function normaliseKinds(raw: unknown) {
  const sections = (raw as { sections?: Array<{ kind?: string }> })?.sections;
  for (const section of sections ?? []) {
    const kind = section.kind?.trim().toLowerCase() ?? "";
    section.kind = (SECTION_KINDS as readonly string[]).includes(kind) ? kind : KIND_ALIASES[kind] ?? "custom";
  }
  return raw;
}

const sopOutputSchema = z.preprocess(normaliseKinds, flatSopSchema).transform((flat) => ({
  ...toGeneratedSop(flat),
  code: flat.code,
  catalogId: CATALOG_IDS.has(flat.catalogId.trim()) ? flat.catalogId.trim() : null,
  suggestedTopic: flat.suggestedTopic,
}));
type SopOutput = z.infer<typeof sopOutputSchema>;

function toBlocks(blocks: FlatBlock[]): GeneratedBlock[] {
  return blocks
    .map((block): GeneratedBlock =>
      block.type === "table" ? { type: "table", text: block.text, columns: block.columns, rows: block.rows } : { type: block.type, text: block.text }
    )
    .filter((block) => block.text.trim() || block.columns?.length || block.rows?.length);
}

type FlatSection = z.infer<typeof flatSection>;
type FlatField = "blocks" | "definitions" | "roles" | "steps" | "kpis" | "records" | "items";

/** The flat field(s) each kind reads; anything else the model filled is carried over as blocks. */
const NATIVE_FIELDS: Record<FlatSection["kind"], FlatField[]> = {
  introduction: ["blocks"],
  purpose: ["blocks"],
  scope: ["blocks"],
  training: ["blocks"],
  compliance: ["blocks"],
  corrective: ["blocks"],
  review: ["blocks"],
  appendix: ["blocks"],
  custom: ["blocks"],
  definitions: ["definitions"],
  responsibilities: ["roles"],
  procedure: ["steps"],
  monitoring: ["kpis", "blocks"],
  records: ["records"],
  references: ["items"],
};

const table = (columns: string[], rows: string[][]): GeneratedBlock[] => (rows.length ? [{ type: "table", text: "", columns, rows }] : []);
const list = (items: string[]): GeneratedBlock[] => (items.length ? [{ type: "bullets", text: items.join("\n") }] : []);

function toSteps(steps: FlatSection["steps"]) {
  return steps.map((step) => ({
    heading: step.heading,
    body: toBlocks(step.body),
    ...(step.responsible.trim() ? { responsible: step.responsible.trim() } : {}),
    ...(step.substeps.length
      ? { substeps: step.substeps.map((sub) => ({ text: sub.text, ...(sub.responsible.trim() ? { responsible: sub.responsible.trim() } : {}) })) }
      : {}),
  }));
}

/** A flat field rendered as plain blocks, for content the model put outside its kind's own field. */
function fieldBlocks(section: FlatSection, field: FlatField): GeneratedBlock[] {
  switch (field) {
    case "blocks":
      return toBlocks(section.blocks);
    case "definitions":
      return table(["Term", "Definition"], section.definitions.map((row) => [row.term, row.definition]));
    case "roles":
      return table(["Role", "Responsibilities"], section.roles.map((row) => [row.role, row.responsibilities.join("\n")]));
    case "kpis":
      return table(["Indicator", "Target", "Frequency", "Owner"], section.kpis.map((kpi) => [kpi.indicator, kpi.target, kpi.frequency, kpi.owner]));
    case "records":
      return table(["Record", "Owner", "Retention", "Format"], section.records.map((row) => [row.record, row.owner, row.retention, row.format]));
    case "items":
      return list(section.items);
    case "steps":
      return section.steps.flatMap((step) => [
        ...(step.heading.trim() ? [{ type: "paragraph" as const, text: step.heading }] : []),
        ...toBlocks(step.body),
        ...list(step.substeps.map((sub) => sub.text)),
      ]);
  }
}

/**
 * Converts one flat section into union sections without dropping content:
 * stray fields become blocks of the same section when its kind has blocks,
 * else a custom section with the same title next to it. A structured kind
 * with nothing in its own field becomes a single procedure step (procedure)
 * or a custom section (the rest).
 */
function toSections(section: FlatSection): GeneratedSopSection[] {
  const { kind, title } = section;
  const native = NATIVE_FIELDS[kind];
  const extra = (["blocks", "definitions", "roles", "steps", "kpis", "records", "items"] as FlatField[])
    .filter((field) => !native.includes(field))
    .flatMap((field) => fieldBlocks(section, field));
  const narrative = (blocks: GeneratedBlock[]): GeneratedSopSection[] => (blocks.length ? [{ kind: "custom", title, blocks }] : []);
  switch (kind) {
    case "definitions":
      return section.definitions.length ? [{ kind, title, rows: section.definitions }, ...narrative(extra)] : narrative(extra);
    case "responsibilities":
      return section.roles.length ? [{ kind, title, rows: section.roles }, ...narrative(extra)] : narrative(extra);
    case "records":
      return section.records.length ? [{ kind, title, rows: section.records }, ...narrative(extra)] : narrative(extra);
    case "references":
      return section.items.length ? [{ kind, title, items: section.items }, ...narrative(extra)] : narrative(extra);
    case "procedure": {
      if (!section.steps.length) return extra.length ? [{ kind, title, steps: [{ heading: title, body: extra }] }] : [];
      // Text ahead of the steps (an introduction or a table) stays ahead of them.
      return [...narrative(extra), { kind, title, steps: toSteps(section.steps) }];
    }
    case "monitoring": {
      const blocks = [...toBlocks(section.blocks), ...extra];
      return section.kpis.length || blocks.length ? [{ kind, title, kpis: section.kpis, narrative: blocks }] : [];
    }
    default: {
      const blocks = [...toBlocks(section.blocks), ...extra];
      return blocks.length ? [{ kind, title, blocks }] : [];
    }
  }
}

function toGeneratedSop(flat: z.infer<typeof flatSopSchema>): GeneratedSop {
  const sections = flat.sections.flatMap(toSections);
  return generatedSopSchema.parse({ title: flat.title, pillar: flat.pillar, department: flat.department, owner: flat.owner, sections });
}

const frontOutputSchema = z.object({
  company: z.string(),
  industry: z.string(),
  introduction: z.string(),
  objective: z.string(),
  scope: z.string(),
  reviewMechanism: z.string(),
});
type FrontOutput = z.infer<typeof frontOutputSchema>;

/** Second pass for SOPs the first pass left unmapped. */
const mapOutputSchema = z.object({ catalogId: z.string(), suggestedTopic: z.string() });
type MapOutput = z.infer<typeof mapOutputSchema>;

const SOP_FORMAT: Anthropic.Messages.JSONOutputFormat = { type: "json_schema", schema: zodOutputFormat(flatSopSchema).schema };
const MAP_FORMAT: Anthropic.Messages.JSONOutputFormat = { type: "json_schema", schema: zodOutputFormat(mapOutputSchema).schema };
const FRONT_FORMAT: Anthropic.Messages.JSONOutputFormat = { type: "json_schema", schema: zodOutputFormat(frontOutputSchema).schema };

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

const catalogLines = SOP_CATALOG.map(
  (topic) => `- ${topic.id}: ${topic.title} (${topic.pillar}, ${topic.department}). ${topic.description} Also called: ${topic.aliases.join("; ") || "-"}.`
).join("\n");

const SOP_SYSTEM = `You convert one Standard Operating Procedure (SOP), extracted from a company's SOP manual (.docx or PDF), into structured JSON. The result is a reference example for an SOP-writing tool, so it must be a faithful copy of the source.

Faithfulness rules:
- Keep the source's wording, order and length. Copy sentences as written; do not summarise, shorten, paraphrase, merge or reorder.
- Never invent content. If the source does not state something (a KPI target, a record's retention period, a responsible role), use an empty string.
- Only repair extraction artefacts: broken line wraps, stray list markers or numbering ("1.", "a)", "•") at the start of items, duplicated header or footer text, page numbers.
- Keep tables as tables when they do not fit a structured section below.

Sections:
- Each heading in the source becomes one section, in source order. Keep the source heading as the section title (without its number).
- Choose the kind from the content: introduction (introduction, overview, summary or background before the purpose), purpose, scope, definitions (terms and abbreviations as term/definition rows), responsibilities (one row per role with its duties as a list), procedure (numbered or titled steps), monitoring (KPIs as indicator/target/frequency/owner, any prose in narrative), training, records (record/owner/retention/format rows), references (one item per document, law or standard), compliance (legal and regulatory compliance: the laws, permits, standards and buyer codes that apply and how compliance is shown), corrective (non-compliance, corrective and preventive action, enforcement, penalties, disciplinary action), review (review, amendment, continuous improvement), appendix (forms, annexures, checklists), custom (anything else, such as future initiatives).
- Each section has one field per content shape. Fill only the one for its kind and leave the rest as empty arrays: blocks (introduction, purpose, scope, training, compliance, corrective, review, appendix, custom, and the prose of monitoring), definitions, roles (responsibilities), steps (procedure), kpis (monitoring), records, items (references).
- Procedure: one step per sub-heading or numbered step. heading = the step's title (or a few words from its first sentence when untitled, copied from the source), body = its text as blocks, responsible = the role only when the source names it (else ""), substeps = lettered or nested items under it.
- Blocks: type "paragraph" (blank line between paragraphs), "bullets" or "numbered" (one item per line, no markers), or "table" (columns = header cells, rows = body cells, text = ""). columns and rows are empty arrays for non-table blocks.
- A "(parser guess: ...)" note after a heading is the extractor's guess at the kind. Use it as a hint only.

Metadata:
- title: the SOP title as printed, without "SOP 3:" style prefixes or the code.
- code: the SOP or document number printed for this SOP (e.g. "ABC/EHS/SOP/01"), else "".
- pillar: E (environment), S (social: people, safety, customers, community) or G (governance: ethics, data, compliance, procurement, audit).
- department and owner: the owning department and the role accountable for the SOP, as named in the source; when not named, the department and role that the responsibilities section puts in charge.
- catalogId: the id of the catalog topic below that this SOP is about, or "" when none fits. Pick the closest topic when the SOP's main subject is covered by it, even under a different name; use "" only for subjects the catalog does not cover.
- suggestedTopic: when catalogId is "", a short generic topic name (2-5 words, e.g. "Biodiversity Protection"); otherwise "".

Catalog topics:
${catalogLines}`;

const MAP_SYSTEM = `You assign a Standard Operating Procedure (SOP) from a company's SOP manual to a topic in the catalog below.

- catalogId: the id of the topic whose subject covers the SOP's main subject. The SOP may be narrower or broader than the topic, or use different words (an "Internal Assessment Procedure" is internal-audit; "Safe Handling of Chemicals" is hazardous-substances; "Promotion and Career Advancement" is equal-opportunity or performance-evaluation, whichever its text stresses). Use "" only when no topic is about the same subject.
- Judge by what the SOP's text is about, not by single words in its title. Prefer the topic that names the subject most directly: grievances go to grievance-handling, buyer reviews to buyer-performance, stock and inventory to stores-inventory, anti-competitive conduct to anti-competitive, customer health and safety to customer-health-safety, product recalls to product-recall. When an SOP covers two subjects, pick the one most of its text is about.
- suggestedTopic: when catalogId is "", a short generic topic name (2-5 words); otherwise "".
- Use an id exactly as listed.

Catalog topics:
${catalogLines}`;

const JUDGE_SYSTEM = `Two classifiers disagree about which catalog topic a Standard Operating Procedure (SOP) from a company's SOP manual belongs to. Read the SOP and decide.

- catalogId: the id of the topic that most of the SOP's text is about. Usually one of the two candidates; give another id from the catalog only when both are clearly wrong.
- Judge by the procedure, responsibilities and definitions, not by the title or the purpose alone: source manuals sometimes carry a purpose paragraph copied from another SOP.
- Prefer the topic that names the subject most directly over a broader neighbour.

Catalog topics:
${catalogLines}`;

const judgeOutputSchema = z.object({ catalogId: z.string() });
const JUDGE_FORMAT: Anthropic.Messages.JSONOutputFormat = { type: "json_schema", schema: zodOutputFormat(judgeOutputSchema).schema };

const FRONT_SYSTEM = `You read the front matter and closing sections of a company's SOP manual and return a few fields as JSON. The result is a reference example for an SOP-writing tool, so copy text faithfully.

- company: the company's name as printed (legal name with suffix such as "Pvt. Ltd." when given).
- industry: what the company makes or does, 3-8 words (e.g. "Textile dyeing and finishing", "Copper alloy strip manufacturing", "Travel management services"). Describe the business (its products or services), never the manual or its ESG topics. Say "manufacturing" when the company makes physical products. Use the manual's text, its sites and its SOP titles.
- introduction: the manual's introduction or company overview, copied as written.
- objective: the manual's stated objective or purpose, copied as written.
- scope: the manual's scope or applicability, copied as written (leave out site address tables).
- reviewMechanism: the manual-level review, amendment or revision mechanism, copied as written.
- Separate paragraphs with a blank line; put list items on their own lines without markers.
- Use an empty string for anything the manual does not contain. Never invent text; do not summarise.`;

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

type SourceManual = {
  index: number;
  file: string;
  /** Path relative to the reference root, with forward slashes. */
  sourceFile: string;
  /** Company name from the folder or the parser; the model's answer wins. */
  companyHint: string;
  parsed: ParsedSopManual;
  /**
   * Raw opening and closing text of the document, kept when the parser found
   * (almost) no front matter, e.g. when the introduction sits on the cover or
   * in front of the table of contents.
   */
  raw?: { head: string; tail: string };
};

/** Parsed front matter shorter than this sends the raw document text instead. */
const THIN_FRONT_CHARS = 400;

async function loadManuals(root: string): Promise<SourceManual[]> {
  const files = [...listSopReferenceFiles(root), ...listPdfFiles(root)].sort((a, b) =>
    path.relative(root, a).localeCompare(path.relative(root, b))
  );
  const manuals: SourceManual[] = [];
  for (const [index, file] of files.entries()) {
    const sourceFile = path.relative(root, file).split(path.sep).join("/");
    try {
      const parsed = /\.pdf$/i.test(file) ? parsePdfManual(file) : await parseSopDocx(fs.readFileSync(file));
      const manual: SourceManual = { index, file, sourceFile, companyHint: companyHint(sourceFile, parsed), parsed };
      if (/\.docx$/i.test(file) && renderBlocks(parsed.frontMatter.sections.flatMap((section) => section.blocks)).length < THIN_FRONT_CHARS) {
        const text = (await readDocxModel(fs.readFileSync(file))).paragraphs.map((paragraph) => paragraph.text.trim()).filter(Boolean).join("\n");
        manual.raw = { head: text.slice(0, 30_000), tail: text.slice(-12_000) };
      }
      manuals.push(manual);
    } catch (error) {
      console.error(`FAILED to parse ${sourceFile}: ${(error as Error).message}`);
    }
  }
  return manuals;
}

function listPdfFiles(root: string): string[] {
  const dir = path.join(root, "SOP");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => /\.pdf$/i.test(name)).map((name) => path.join(dir, name)) : [];
}

function companyHint(sourceFile: string, parsed: ParsedSopManual): string {
  const parts = sourceFile.split("/");
  // Employee Handbook - SOP Manual/SOP/<Company>/<file>.docx
  if (parts.length >= 4) return parts[parts.length - 2];
  return parsed.company?.name || parts[parts.length - 1].replace(/\.(docx|pdf)$/i, "").replace(/^\d+\)\s*/, "").replace(/sops?[ _]+manual[ _-]*/i, "").trim();
}

/**
 * The PDF manual: pdftotext -layout, page headers dropped, then split on the
 * table of contents (indented entries are SOPs, flush entries are front matter
 * or pillar groups).
 */
function parsePdfManual(file: string): ParsedSopManual {
  const bin = process.env.PDFTOTEXT ?? (fs.existsSync("C:/Program Files/Git/mingw64/bin/pdftotext.exe") ? "C:/Program Files/Git/mingw64/bin/pdftotext.exe" : "pdftotext");
  const raw = execFileSync(bin, ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const lines = raw
    .split(/\r?\n/)
    .filter((line) => !/Doc\. ?No\.|Origin Date|Rev\. ?No\.|Eff\. ?Date|^\s*\d+\s*\|\s*Page\s*$/i.test(line))
    .map((line) => line.replace(/\f/g, "").replace(/\uFFFD/g, "-").replace(/ {3,}/g, "  ").trimEnd());

  type Entry = { title: string; role: "front" | "group" | "sop"; line: number };
  const entries: Entry[] = [];
  let tocEnd = 0;
  for (const [index, line] of lines.entries()) {
    const match = /^(\s*)(.+?)\s*\.{3,}\s*\d+\s*$/.exec(line);
    if (!match) continue;
    tocEnd = index;
    const title = match[2].trim();
    const role = match[1].length >= 2 ? "sop" : /^(introduction|scope|objective|purpose)\b/i.test(title) ? "front" : "group";
    entries.push({ title, role, line: -1 });
  }
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let cursor = tocEnd + 1;
  for (const entry of entries) {
    const target = norm(entry.title);
    for (let index = cursor; index < lines.length; index += 1) {
      const text = norm(lines[index]);
      if (text && (text === target || (text.startsWith(target) && text.length - target.length < 4))) {
        entry.line = index;
        cursor = index + 1;
        break;
      }
    }
  }
  const located = entries.filter((entry) => entry.line >= 0);
  const textBetween = (from: number, to: number) => lines.slice(from, to).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const block = (text: string): RichTextBlock[] => (text ? [{ id: "", type: "paragraph", text }] : []);

  const sops: ParsedSop[] = [];
  const frontSections: ParsedSopManual["frontMatter"]["sections"] = [];
  let group: string | undefined;
  for (const [position, entry] of located.entries()) {
    const end = located[position + 1]?.line ?? lines.length;
    const body = textBetween(entry.line + 1, end);
    if (entry.role === "group") group = entry.title;
    else if (entry.role === "front") frontSections.push({ label: entry.title, blocks: block(body) });
    else sops.push({ title: entry.title, group, source: "toc", sections: [{ label: "Text (PDF extraction)", blocks: block(body) }] });
  }
  const warnings = entries.filter((entry) => entry.line < 0).map((entry) => `TOC entry not found in body: ${entry.title}`);
  const header = lines.slice(0, 5).join(" ");
  const company = /([A-Z][A-Z .&]+(PVT\.?|PRIVATE)?\s*LTD\.?)/.exec(header)?.[1]?.trim();
  return {
    title: "SOP Manual",
    company: company ? { name: company } : undefined,
    control: {},
    frontMatter: { sections: frontSections, sites: [] },
    sops,
    closing: { sections: [], revisionHistory: [] },
    toc: [],
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Rendering for the prompt                                            */
/* ------------------------------------------------------------------ */

const cell = (value: string) => value.replace(/\s*\n\s*/g, " / ").replace(/\|/g, "/").trim();

function renderBlocks(blocks: RichTextBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === "table") {
        const columns = block.columns ?? [];
        const rows = (block.rows ?? []).map((row) => `| ${row.map(cell).join(" | ")} |`);
        return [columns.length ? `| ${columns.map(cell).join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |` : "", ...rows].filter(Boolean).join("\n");
      }
      const items = block.text.split(/\n/).map((line) => line.trim()).filter(Boolean);
      if (block.type === "bullets") return items.map((item) => `- ${item}`).join("\n");
      if (block.type === "numbered") return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
      return block.text.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

function renderSop(sop: ParsedSop): string {
  const head = [
    `Title: ${sop.title}`,
    sop.code && `Code: ${sop.code}`,
    sop.group && `Manual chapter: ${sop.group}`,
    sop.department && `Department: ${sop.department}`,
    sop.version && `Version: ${sop.version}`,
  ].filter(Boolean);
  const sections = sop.sections.map((section) => {
    const guess = section.kind ? ` (parser guess: ${section.kind}${section.inferred ? ", by position" : ""})` : "";
    return `### ${section.label}${guess}\n${renderBlocks(section.blocks)}`;
  });
  return `${head.join("\n")}\n\n${sections.join("\n\n")}`;
}

function blockWords(blocks: RichTextBlock[]): number {
  const text = blocks.map((block) => [block.text, ...(block.columns ?? []), ...(block.rows ?? []).flat()].join(" ")).join(" ");
  return text.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length;
}

const sopWords = (sop: ParsedSop) => sop.sections.reduce((sum, section) => sum + blockWords(section.blocks), 0);

function renderFront(manual: SourceManual): string {
  const { parsed } = manual;
  const control = Object.entries(parsed.control).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join("; ");
  const sections = (list: ParsedSopManual["frontMatter"]["sections"]) =>
    list.map((section) => `### ${section.label}\n${renderBlocks(section.blocks)}`).join("\n\n") || "(none found)";
  let front = sections(parsed.frontMatter.sections);
  let closing = sections(parsed.closing.sections);
  // Front matter only feeds a few example paragraphs; keep the request small.
  const limit = 120_000;
  if (front.length > limit) front = `${front.slice(0, limit)}\n[…]`;
  if (closing.length > limit / 2) closing = `${closing.slice(0, limit / 2)}\n[…]`;
  return [
    `Source file: ${manual.sourceFile}`,
    `Company (from folder or header): ${manual.companyHint || "unknown"}`,
    parsed.company?.name && `Company name in the document: ${parsed.company.name}`,
    `Manual title: ${parsed.title}`,
    control && `Document control: ${control}`,
    `SOP titles: ${parsed.sops.map((sop) => sop.title).join("; ")}`,
    `\n## Front matter\n${front}`,
    `\n## Closing sections\n${closing}`,
    manual.raw &&
      `\n## Raw document text\nThe extractor found little front matter, so here is the start and the end of the document as plain text. Take the manual-level introduction, objective, scope and review mechanism from it (not the first or last SOP's own sections).\n\n### Start of document\n${manual.raw.head}\n\n### End of document\n${manual.raw.tail}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

type PlannedRequest = {
  customId: string;
  kind: "sop" | "front" | "map";
  manual: SourceManual;
  sopIndex?: number;
  inputTokens: number;
  sourceTokens: number;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
};

function sopRequest(manual: SourceManual, sopIndex: number, maxTokensFactor = 1): PlannedRequest {
  const sop = manual.parsed.sops[sopIndex];
  let body = renderSop(sop);
  const fixed = estimate(SOP_SYSTEM) + 200;
  if (fixed + estimate(body) > INPUT_TOKEN_CAP) {
    console.warn(`  ! ${manual.sourceFile} SOP ${sopIndex + 1} trimmed to fit ${INPUT_TOKEN_CAP} tokens`);
    body = body.slice(0, (INPUT_TOKEN_CAP - fixed) * 3);
  }
  const user = `Manual: ${manual.companyHint} (${manual.sourceFile})\n\n<sop>\n${body}\n</sop>\n\nConvert this SOP into the JSON schema, faithfully.`;
  const sourceTokens = estimate(body);
  const maxTokens = Math.min(64_000, Math.max(16_000, sourceTokens * 4) * maxTokensFactor);
  return {
    customId: `m${manual.index}-s${sopIndex}`,
    kind: "sop",
    manual,
    sopIndex,
    sourceTokens,
    inputTokens: estimate(SOP_SYSTEM) + estimate(user),
    params: params(SOP_SYSTEM, user, maxTokens, SOP_FORMAT),
  };
}

function frontRequest(manual: SourceManual, maxTokensFactor = 1): PlannedRequest {
  const user = `${renderFront(manual)}\n\nReturn the manual's fields as JSON.`;
  const sourceTokens = Math.min(estimate(user), 8_000);
  return {
    customId: `m${manual.index}-front`,
    kind: "front",
    manual,
    sourceTokens,
    inputTokens: estimate(FRONT_SYSTEM) + estimate(user),
    params: params(FRONT_SYSTEM, user, Math.min(64_000, 16_000 * maxTokensFactor), FRONT_FORMAT),
  };
}

/** Re-map request for an SOP the first pass left without a valid catalog id. */
function mapRequest(manual: SourceManual, sopIndex: number, first: SopOutput): PlannedRequest {
  const sop = manual.parsed.sops[sopIndex];
  const opening = sop.sections
    .filter((section) => section.kind === "purpose" || section.kind === "scope")
    .map((section) => `${section.label}: ${renderBlocks(section.blocks)}`)
    .join("\n")
    .slice(0, 3_000);
  const user = [
    `SOP title: ${first.title}`,
    `Source title: ${sop.title}`,
    `Department: ${first.department}; owner: ${first.owner}; pillar: ${first.pillar}`,
    `Section headings: ${first.sections.map((section) => section.title).join("; ")}`,
    first.suggestedTopic && `Topic suggested earlier: ${first.suggestedTopic}`,
    `\n${opening}`,
    "\nWhich catalog topic is this SOP about?",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    customId: `m${manual.index}-s${sopIndex}-map`,
    kind: "map",
    manual,
    sopIndex,
    sourceTokens: 30,
    inputTokens: estimate(MAP_SYSTEM) + estimate(user),
    // Classification is the whole task here, so it may think (adaptive, low effort).
    params: params(MAP_SYSTEM, user, 4_000, MAP_FORMAT, true),
  };
}

/** Tie-break request when the transcription pass and the classification pass disagree. */
function judgeRequest(manual: SourceManual, sopIndex: number, first: SopOutput, candidates: string[]): PlannedRequest {
  const sop = manual.parsed.sops[sopIndex];
  const describe = (id: string) => {
    const topic = SOP_CATALOG.find((entry) => entry.id === id)!;
    return `- ${topic.id}: ${topic.title}. ${topic.description}`;
  };
  const user = [
    `SOP title: ${first.title}`,
    `Section headings: ${first.sections.map((section) => section.title).join("; ")}`,
    `\nCandidates:\n${candidates.map(describe).join("\n")}`,
    `\n<sop>\n${renderSop(sop).slice(0, 8_000)}\n</sop>`,
    "\nWhich catalog topic is this SOP about?",
  ].join("\n");
  return {
    customId: `m${manual.index}-s${sopIndex}-judge`,
    kind: "map",
    manual,
    sopIndex,
    sourceTokens: 30,
    inputTokens: estimate(JUDGE_SYSTEM) + estimate(user),
    params: { ...params(JUDGE_SYSTEM, user, 8_000, JUDGE_FORMAT, true), output_config: { effort: "medium", format: JUDGE_FORMAT } },
  };
}

function params(system: string, user: string, maxTokens: number, format: Anthropic.Messages.JSONOutputFormat, think = false) {
  const base = buildClaudeParams({ system, user, maxTokens, effort: "low", format });
  // A faithful copy needs no reasoning; thinking would only add output tokens.
  return think ? base : { ...base, thinking: { type: "disabled" as const } };
}

function planRequests(manuals: SourceManual[]): PlannedRequest[] {
  return manuals.flatMap((manual) => [frontRequest(manual), ...manual.parsed.sops.map((_, index) => sopRequest(manual, index))]);
}

function printEstimate(requests: PlannedRequest[]) {
  const input = requests.reduce((sum, request) => sum + request.inputTokens, 0);
  // Normalised JSON runs about 1.5x the source text.
  const output = requests.reduce((sum, request) => sum + Math.round(request.sourceTokens * 1.5) + 300, 0);
  const systemShare = requests.reduce((sum, request) => sum + estimate(request.kind === "sop" ? SOP_SYSTEM : FRONT_SYSTEM), 0);
  const uncached = (input * PRICE.input + output * PRICE.output) / 1e6;
  const cached = ((input - systemShare) * PRICE.input + systemShare * PRICE.cacheRead + output * PRICE.output) / 1e6;
  const largest = requests.reduce((max, request) => Math.max(max, request.inputTokens), 0);
  console.log(
    `\n${requests.length} requests (${requests.filter((r) => r.kind === "sop").length} SOPs, ${requests.filter((r) => r.kind === "front").length} front matter)` +
      `\nestimated input ${fmt(input)} tokens (largest request ${fmt(largest)}), output ~${fmt(output)} tokens` +
      `\nestimated cost (batch, Haiku 5.5): $${uncached.toFixed(2)} without cache hits, $${cached.toFixed(2)} if the system prompt caches`
  );
}

const fmt = (value: number) => value.toLocaleString("en-US");

/* ------------------------------------------------------------------ */
/* Batch state                                                         */
/* ------------------------------------------------------------------ */

type State = { batches: Array<{ id: string; createdAt: string; customIds: string[] }> };

function readState(): State {
  return fs.existsSync(STATE_FILE) ? (JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as State) : { batches: [] };
}

function writeState(state: State) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

async function submit(client: Anthropic, requests: PlannedRequest[], state: State) {
  const batch = await client.messages.batches.create({
    requests: requests.map((request) => ({ custom_id: request.customId, params: request.params })),
  });
  state.batches.push({ id: batch.id, createdAt: batch.created_at, customIds: requests.map((request) => request.customId) });
  writeState(state);
  console.log(`Submitted batch ${batch.id} (${requests.length} requests). Saved to ${path.relative(SRC, STATE_FILE)}.`);
  return batch.id;
}

async function waitFor(client: Anthropic, id: string) {
  for (;;) {
    const batch = await client.messages.batches.retrieve(id);
    const counts = batch.request_counts;
    console.log(
      `[${new Date().toISOString().slice(11, 19)}] ${id} ${batch.processing_status}: processing ${counts.processing}, succeeded ${counts.succeeded}, errored ${counts.errored}, expired ${counts.expired}`
    );
    if (batch.processing_status === "ended") return batch;
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}

type BatchLine = { custom_id: string; result: Anthropic.Messages.Batches.MessageBatchResult };

async function loadResults(client: Anthropic | null, id: string): Promise<BatchLine[]> {
  const cache = path.join(STATE_DIR, `results-${id}.jsonl`);
  if (fs.existsSync(cache)) {
    return fs.readFileSync(cache, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as BatchLine);
  }
  if (!client) throw new Error(`No cached results for ${id} and no ANTHROPIC_API_KEY.`);
  await waitFor(client, id);
  const lines: BatchLine[] = [];
  for await (const entry of await client.messages.batches.results(id)) lines.push({ custom_id: entry.custom_id, result: entry.result });
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(cache, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
  return lines;
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

type Outcome =
  | { ok: true; customId: string; value: unknown; usage: Anthropic.Messages.Usage }
  | { ok: false; customId: string; error: string; usage?: Anthropic.Messages.Usage };

function decode(line: BatchLine): Outcome {
  const { custom_id: customId, result } = line;
  if (result.type !== "succeeded") {
    const detail = result.type === "errored" ? `${result.error.error.type}: ${result.error.error.message}` : result.type;
    return { ok: false, customId, error: detail };
  }
  const message = result.message;
  if (message.stop_reason !== "end_turn") return { ok: false, customId, error: `stop_reason ${message.stop_reason}`, usage: message.usage };
  const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  try {
    const schema = customId.endsWith("-front")
      ? frontOutputSchema
      : customId.endsWith("-map")
        ? mapOutputSchema
        : customId.endsWith("-judge")
          ? judgeOutputSchema
          : sopOutputSchema;
    return { ok: true, customId, value: schema.parse(JSON.parse(text)), usage: message.usage };
  } catch (error) {
    return { ok: false, customId, error: `invalid output: ${(error as Error).message.slice(0, 200)}`, usage: message.usage };
  }
}

function usageCost(usages: Anthropic.Messages.Usage[]) {
  const sum = (pick: (usage: Anthropic.Messages.Usage) => number | null | undefined) => usages.reduce((total, usage) => total + (pick(usage) ?? 0), 0);
  const input = sum((usage) => usage.input_tokens);
  const cacheWrite = sum((usage) => usage.cache_creation_input_tokens);
  const cacheRead = sum((usage) => usage.cache_read_input_tokens);
  const output = sum((usage) => usage.output_tokens);
  const cost = (input * PRICE.input + cacheWrite * PRICE.cacheWrite1h + cacheRead * PRICE.cacheRead + output * PRICE.output) / 1e6;
  return { input, cacheWrite, cacheRead, output, cost };
}

/** Latest valid outcome per custom id across every saved batch, plus the usage of every result. */
async function collect(client: Anthropic | null, state: State) {
  const best = new Map<string, Outcome>();
  const usages: Anthropic.Messages.Usage[] = [];
  let endedAt = "";
  for (const batch of state.batches) {
    for (const line of await loadResults(client, batch.id)) {
      const outcome = decode(line);
      if (outcome.usage) usages.push(outcome.usage);
      if (outcome.ok || !best.get(line.custom_id)?.ok) best.set(line.custom_id, outcome);
    }
    endedAt = batch.createdAt > endedAt ? batch.createdAt : endedAt;
  }
  return { best, usages, endedAt };
}

/* ------------------------------------------------------------------ */
/* New catalog topics                                                  */
/* ------------------------------------------------------------------ */

/**
 * Topics added because at least 3 manuals have SOPs the starter catalog did
 * not cover. Unmapped SOPs whose title or suggested topic matches `match` are
 * assigned to them.
 */
const NEW_TOPICS: Array<Omit<SopCatalogTopic, "frequency" | "industries"> & { match: RegExp }> = [];

function assignNewTopic(title: string, suggested: string): string | null {
  const text = `${title} ${suggested}`.toLowerCase();
  return NEW_TOPICS.find((topic) => topic.match.test(text))?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(pvt|private|ltd|limited|llp|llc|inc|dba)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function writeSeeds(manuals: SourceManual[], best: Map<string, Outcome>, parsedAt: string) {
  fs.mkdirSync(SEED_DIR, { recursive: true });
  for (const file of fs.readdirSync(SEED_DIR)) if (file.endsWith(".json")) fs.rmSync(path.join(SEED_DIR, file));
  const failures: string[] = [];
  const unmapped = new Map<string, Array<{ manual: string; title: string }>>();
  const used = new Set<string>();
  const seeds: SeedSopManual[] = [];
  for (const manual of manuals) {
    const frontOutcome = best.get(`m${manual.index}-front`);
    const front = frontOutcome?.ok ? (frontOutcome.value as FrontOutput) : undefined;
    if (!front) failures.push(`${manual.sourceFile} front matter: ${frontOutcome && !frontOutcome.ok ? frontOutcome.error : "missing"}`);
    // A name that is only a legal suffix ("PVT. LTD", from a split page header) is no name;
    // fall back to the first full company name in the introduction.
    const fromIntro = /\b((?:[A-Z][\w&.-]*\s+){1,5}(?:Pvt\.?|Private)\s+(?:Ltd|Limited)\.?)/.exec(front?.introduction ?? "")?.[1];
    const company = [front?.company.trim(), manual.parsed.company?.name, fromIntro, manual.companyHint].find((name) => name && slugify(name)) ?? manual.companyHint;
    let id = slugify(company) || `manual-${manual.index}`;
    while (used.has(id)) id = `${id}-2`;
    used.add(id);

    const sops: SeedSop[] = [];
    for (const [index, sop] of manual.parsed.sops.entries()) {
      const outcome = best.get(`m${manual.index}-s${index}`);
      if (!outcome?.ok) {
        failures.push(`${manual.sourceFile} SOP ${index + 1} "${sop.title}": ${outcome && !outcome.ok ? outcome.error : "missing"}`);
        continue;
      }
      const { suggestedTopic: firstSuggestion, code, catalogId, ...generated } = outcome.value as SopOutput;
      const remap = best.get(`m${manual.index}-s${index}-map`);
      const second = remap?.ok ? (remap.value as MapOutput) : undefined;
      const remapped = second && CATALOG_IDS.has(second.catalogId.trim()) ? second.catalogId.trim() : null;
      const judge = best.get(`m${manual.index}-s${index}-judge`);
      const judgedId = judge?.ok ? (judge.value as { catalogId: string }).catalogId.trim() : "";
      const judged = CATALOG_IDS.has(judgedId) ? judgedId : null;
      const suggestedTopic = second?.suggestedTopic.trim() || firstSuggestion;
      // The judge settles disagreements; otherwise the dedicated classification
      // pass wins over the mapping made while transcribing.
      const mapped = judged ?? remapped ?? catalogId ?? assignNewTopic(generated.title, suggestedTopic);
      if (!mapped) {
        const key = suggestedTopic.trim() || generated.title;
        unmapped.set(key, [...(unmapped.get(key) ?? []), { manual: id, title: generated.title }]);
      }
      sops.push({
        title: generated.title,
        code: sop.code?.trim() || code.trim(),
        catalogId: mapped,
        pillar: generated.pillar,
        department: generated.department,
        owner: generated.owner,
        sourceWords: sopWords(sop),
        sections: generated.sections,
      });
    }
    const industry = front?.industry.trim() ?? "";
    const seed: SeedSopManual = {
      id,
      company,
      industry,
      industryTags: companyIndustryTags({ industry }),
      sourceFile: manual.sourceFile,
      frontMatter: {
        introduction: front?.introduction ?? "",
        objective: front?.objective ?? "",
        scope: front?.scope ?? "",
        reviewMechanism: front?.reviewMechanism ?? "",
      },
      sops,
      parsedAt,
    };
    seeds.push(seed);
    fs.writeFileSync(path.join(SEED_DIR, `${id}.json`), `${JSON.stringify(seed, null, 1)}\n`);
  }
  return { seeds, failures, unmapped };
}

const normalizeName = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Same scoring as lib/sop/catalog.ts matchCatalogTopic, over a catalog being edited. */
function bestTopic(topics: SopCatalogTopic[], title: string): string | undefined {
  const text = normalizeName(title.replace(/^(sop|standard operating procedure)\s*(for|on)?\s*/i, ""));
  if (!text) return undefined;
  const words = new Set(text.split(" ").filter((word) => word.length > 3));
  let best: { id: string; score: number } | undefined;
  for (const topic of topics) {
    let score = 0;
    for (const name of [topic.title, ...topic.aliases].map(normalizeName)) {
      if (text === name) score = Math.max(score, 100);
      else if (text.includes(name) || name.includes(text)) score = Math.max(score, Math.min(95, 40 + Math.min(name.length, text.length)));
      else score = Math.max(score, name.split(" ").filter((word) => word.length > 3 && words.has(word)).length * 15);
    }
    if (score > (best?.score ?? 0)) best = { id: topic.id, score };
  }
  return best && best.score >= 30 ? best.id : undefined;
}

const cleanTitle = (title: string) =>
  title
    .replace(/^(sop|standard operating procedure)s?\s*(no\.?\s*)?[\w./-]*\d[\w./-]*\s*[:.\-–]\s*/i, "")
    .replace(/^(sops?|standard operating procedures?|procedures?|guidelines?)\s*(\(sops?\)\s*)?(for|on|of)\s+/i, "")
    .replace(/\s+(sop|procedure)$/i, "")
    .replace(/\s*\(.*?\)\s*$/, "")
    .trim()
    .toLowerCase();

/**
 * Refreshes frequency, industries and aliases from the corpus and adds NEW_TOPICS.
 * - frequency: manuals with at least one SOP on the topic.
 * - industries: "*" stays "*" (the corpus is mostly manufacturers, so absence
 *   from service manuals is weak evidence); a topic becomes "*" when two
 *   service-only manuals or half of all manuals have it; otherwise the
 *   industry tags of the manuals that have it are added.
 * - aliases: source titles of the topic's SOPs that the catalog matcher
 *   cannot place yet. Existing aliases are kept, so a rerun adds nothing new.
 */
function refreshCatalog(seeds: SeedSopManual[]) {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8")) as { version: number; note: string; topics: SopCatalogTopic[] };
  const known = new Set(catalog.topics.map((topic) => topic.id));
  for (const { id, title, pillar, department, owner, kind, aliases, description } of NEW_TOPICS) {
    if (!known.has(id)) catalog.topics.push({ id, title, pillar, department, owner, kind, frequency: 0, industries: [], aliases, description });
  }
  const isServices = (seed: SeedSopManual) => seed.industryTags.includes("services") && !seed.industryTags.includes("manufacturing");

  for (const topic of catalog.topics) {
    const manuals = seeds.filter((seed) => seed.sops.some((sop) => sop.catalogId === topic.id));
    topic.frequency = manuals.length;
    if (!manuals.length || topic.industries.includes("*")) continue;
    if (manuals.filter(isServices).length >= 2 || manuals.length >= seeds.length * 0.5) topic.industries = ["*"];
    else topic.industries = [...new Set([...topic.industries, ...manuals.flatMap((seed) => seed.industryTags)])].filter((tag) => tag !== "services").sort();
  }

  for (const topic of catalog.topics) {
    const counts = new Map<string, number>();
    for (const seed of seeds) {
      for (const sop of seed.sops) {
        const alias = cleanTitle(sop.title);
        if (sop.catalogId === topic.id && alias.length >= 4 && alias.length <= 60 && normalizeName(alias) !== normalizeName(topic.title)) {
          counts.set(alias, (counts.get(alias) ?? 0) + 1);
        }
      }
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).map(([alias]) => alias);
    // Word stems of the topic's title and description (never changed here, so
    // reruns agree); an alias must share one, which keeps one-off titles of
    // loosely related SOPs ("marketing") out of the matcher.
    const stems = (text: string) => normalizeName(text).split(" ").filter((word) => word.length > 3).map((word) => word.slice(0, 5));
    const vocabulary = new Set(stems(`${topic.title} ${topic.description}`));
    for (const alias of ranked) {
      if (topic.aliases.length >= 14) break;
      if (!stems(alias).some((stem) => vocabulary.has(stem))) continue;
      // Only fill gaps: a title that already matches some topic is left alone,
      // so an alias never takes a title away from the topic that owns it.
      if (bestTopic(catalog.topics, alias) !== undefined) continue;
      topic.aliases.push(alias);
    }
  }
  catalog.note = `Catalog distilled from the ${seeds.length} reference SOP manuals. frequency = number of reference manuals with an SOP on this topic. scripts/import-sop-seeds.ts refreshes frequency, industries and aliases from the extracted corpus.`;
  const body = catalog.topics.map((topic) => `    ${JSON.stringify(topic, null, 1).replace(/\n\s*/g, " ")}`).join(",\n");
  fs.writeFileSync(
    CATALOG_FILE,
    `{\n  "version": ${catalog.version},\n  "note": ${JSON.stringify(catalog.note)},\n  "topics": [\n${body}\n  ]\n}\n`
  );
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function runSample(client: Anthropic, requests: PlannedRequest[], count: number) {
  const sops = requests.filter((request) => request.kind === "sop");
  const picks = [requests.find((request) => request.kind === "front")!, ...Array.from({ length: count }, (_, i) => sops[Math.floor((i * sops.length) / count)])];
  fs.mkdirSync(STATE_DIR, { recursive: true });
  for (const request of picks) {
    const message = await client.messages.stream(request.params).finalMessage();
    const outcome = decode({ custom_id: request.customId, result: { type: "succeeded", message } });
    const out = path.join(STATE_DIR, `sample-${request.customId}.json`);
    fs.writeFileSync(out, JSON.stringify({ outcome, source: request.params.messages[0].content }, null, 2));
    const { input, cacheRead, cacheWrite, output, cost } = usageCost([message.usage]);
    console.log(`${request.customId} ${outcome.ok ? "ok" : `FAILED ${outcome.error}`} in=${input} cacheWrite=${cacheWrite} cacheRead=${cacheRead} out=${output} ($${(cost * 2).toFixed(4)} at full price) -> ${path.relative(SRC, out)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

  const root = findSopReferenceRoot();
  if (!root) throw new Error("Reference folders not found. Set SOP_REFERENCE_ROOT to the folder that contains SOP/.");
  const manuals = await loadManuals(root);
  for (const manual of manuals) for (const warning of manual.parsed.warnings) console.log(`  ${manual.sourceFile}: ${warning}`);
  console.log(`Parsed ${manuals.length} manuals, ${manuals.reduce((sum, manual) => sum + manual.parsed.sops.length, 0)} SOPs.`);

  const requests = planRequests(manuals);
  printEstimate(requests);
  if (flag("--dry-run")) return;

  const client = getClaudeClient();
  if (option("--sample")) {
    if (!client) throw new Error("ANTHROPIC_API_KEY is not configured.");
    await runSample(client, requests, Number(option("--sample")));
    return;
  }

  const state = readState();
  const batchId = option("--batch");
  if (batchId && !state.batches.some((batch) => batch.id === batchId)) {
    if (!client) throw new Error("ANTHROPIC_API_KEY is not configured.");
    const batch = await client.messages.batches.retrieve(batchId);
    state.batches.push({ id: batchId, createdAt: batch.created_at, customIds: [] });
    writeState(state);
  }
  if (!state.batches.length && !flag("--write-only")) {
    if (!client) throw new Error("ANTHROPIC_API_KEY is not configured.");
    await submit(client, requests, state);
  }

  let { best, usages, endedAt } = await collect(flag("--write-only") ? null : client, state);
  if (flag("--retry-failed")) {
    if (!client) throw new Error("ANTHROPIC_API_KEY is not configured.");
    const retry = requests
      .filter((request) => !best.get(request.customId)?.ok)
      .map((request) => (request.kind === "sop" ? sopRequest(request.manual, request.sopIndex!, 2) : frontRequest(request.manual, 2)));
    if (retry.length) {
      printEstimate(retry);
      await submit(client, retry, state);
      ({ best, usages, endedAt } = await collect(client, state));
    } else console.log("Nothing to retry.");
  }

  // --redo front | m3-front,m3-s2 : resubmit chosen requests as currently planned (after a prompt change).
  const redo = option("--redo");
  if (redo) {
    if (!client) throw new Error("ANTHROPIC_API_KEY is not configured.");
    const ids = new Set(redo.split(","));
    const chosen = requests.filter((request) => ids.has(request.customId) || ids.has(request.kind));
    printEstimate(chosen);
    await submit(client, chosen, state);
    ({ best, usages, endedAt } = await collect(client, state));
  }

  // Second pass: a dedicated classification request for SOPs the first pass
  // left without a valid catalog id (every SOP with --remap-all).
  if (!flag("--write-only")) {
    const all = flag("--remap-all");
    const remap = requests.flatMap((request) => {
      const outcome = best.get(request.customId);
      if (request.kind !== "sop" || !outcome?.ok) return [];
      if (!all && ((outcome.value as SopOutput).catalogId || best.get(`${request.customId}-map`)?.ok)) return [];
      return [mapRequest(request.manual, request.sopIndex!, outcome.value as SopOutput)];
    });
    if (remap.length) {
      if (!client) throw new Error("ANTHROPIC_API_KEY is not configured.");
      console.log(`\nRe-mapping ${remap.length} SOPs without a catalog topic.`);
      printEstimate(remap);
      await submit(client, remap, state);
      ({ best, usages, endedAt } = await collect(client, state));
    }

    // Third pass: settle SOPs where the two passes picked different valid topics.
    const disputes = requests.flatMap((request) => {
      const outcome = best.get(request.customId);
      const second = best.get(`${request.customId}-map`);
      if (request.kind !== "sop" || !outcome?.ok || !second?.ok || best.get(`${request.customId}-judge`)?.ok) return [];
      const first = outcome.value as SopOutput;
      const remapped = (second.value as MapOutput).catalogId.trim();
      if (!first.catalogId || !CATALOG_IDS.has(remapped) || remapped === first.catalogId) return [];
      return [judgeRequest(request.manual, request.sopIndex!, first, [first.catalogId, remapped])];
    });
    if (disputes.length) {
      if (!client) throw new Error("ANTHROPIC_API_KEY is not configured.");
      console.log(`\nJudging ${disputes.length} SOPs the two passes disagree on.`);
      printEstimate(disputes);
      await submit(client, disputes, state);
      ({ best, usages, endedAt } = await collect(client, state));
    }
  }

  const { input, cacheWrite, cacheRead, output, cost } = usageCost(usages);
  console.log(
    `\nActual usage: input ${fmt(input)}, cache write ${fmt(cacheWrite)}, cache read ${fmt(cacheRead)}, output ${fmt(output)} tokens; cost $${cost.toFixed(2)} (batch prices)`
  );

  const { seeds, failures, unmapped } = writeSeeds(manuals, best, endedAt.slice(0, 10) || new Date().toISOString().slice(0, 10));
  refreshCatalog(seeds);
  const total = seeds.reduce((sum, seed) => sum + seed.sops.length, 0);
  const nulls = seeds.reduce((sum, seed) => sum + seed.sops.filter((sop) => !sop.catalogId).length, 0);
  console.log(`\nWrote ${seeds.length} seed files with ${total} SOPs to ${path.relative(SRC, SEED_DIR)}; unmapped ${nulls} (${((nulls / Math.max(total, 1)) * 100).toFixed(1)}%).`);
  if (failures.length) {
    console.log(`\n${failures.length} failed requests (run with --retry-failed):`);
    for (const failure of failures) console.log(`  - ${failure}`);
  }
  if (unmapped.size) {
    console.log("\nUnmapped SOPs by suggested topic (manuals):");
    for (const [topic, entries] of [...unmapped.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${new Set(entries.map((entry) => entry.manual)).size}  ${topic}: ${entries.map((entry) => `${entry.manual} "${entry.title}"`).join("; ")}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
