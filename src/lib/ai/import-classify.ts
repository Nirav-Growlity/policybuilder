/**
 * The AI reader for "Load existing policy". It only CLASSIFIES: for each numbered
 * part of a parsed document (paragraph, list item, table row) it says where in
 * the policy the part belongs. It never writes or rewrites text; the mapper
 * copies the document's own words into the policy. Server-side only.
 *
 * Requests stay well under the context target: the document is flattened into
 * one short line per part, and a large document is split into chunks of whole
 * sections. Any failure leaves the parts unlabelled, and the mapper's rules
 * place them.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  DESTINATIONS,
  META_FIELDS,
  flattenUnits,
  type ClassificationLabel,
  type ImportClassification,
  type ImportUnit,
} from "../docx/import-classification";
import type { ImportedPolicyBlock, ImportedPolicyContext, ImportedPolicySection, PolicyType, StandardSectionKind } from "../types";
import { CONTEXT_TOKEN_TARGET, cleanJsonText, createClaudeText, estimateTokens, hasClaudeKey } from "./claude";

export const UNIT_TEXT_LIMIT = 250;
const HEADING_LIMIT = 120;
/** Room left for the system prompt, the policy line and the answer's framing. */
const PROMPT_OVERHEAD_TOKENS = 1_500;
export const MAX_CHUNKS = 8;
/** The answer grows with the number of parts, so a prompt also stops at this many even when it has token room. */
export const MAX_UNITS_PER_CHUNK = 250;
const CONCURRENCY = 3;
const CLASSIFY_TIMEOUT_MS = 30_000;

export const IMPORT_CLASSIFY_SYSTEM = `You place the parts of a company's existing policy document into the fields of a policy builder. You NEVER write, shorten or change any text: you only say where each numbered part belongs. Text you return (area names, roles, values, titles) must be copied exactly from the document.

Each part is one line: "<id> <type> <text>". Type p is a paragraph, l a list item, r a table row (cells joined with " | "), h the header row of a table. Lines "#<n> <heading>" show the heading the following parts sit under.

Answer with JSON {"u":[...]}. Give one label per part, or one label for a run of consecutive parts that share it ("i" is the first id, "e" the last id, inclusive). Every label has "d", the destination:
pre = preface, introduction, purpose, background
dec = policy declaration, statement of policy, commitment statement
scp = scope or applicability
site = a body row of a table listing the company's sites, locations or addresses
foc = a focus, priority or key action area; "a" is the area name only (for "Area : description" lines, the name before the description)
obj = a qualitative objective or commitment that belongs to an area; "a" is the area it belongs to
tgt = a measurable target, including the sentence that states the baseline year; "a" is the area it belongs to
sdg = text of the Sustainable Development Goals section; "n" lists goal numbers (1-17) the text states
res = a role and what it is responsible for; "r" is the role or title
mon = monitoring, reporting, transparency
rev = review mechanism, continuous improvement
meta = a document-control detail (document number, revision, effective date, last or next review date, approver); "f" is one of ${META_FIELDS.join(", ")} and "v" the value
cus = substantive content that fits none of the above; "t" is the heading it sits under
drop = table of contents, page furniture, acknowledgement forms, signature or name lines, "Top of Form" and "Bottom of Form", approval blocks, empty labels

For foc, obj and tgt, "a" is the area's name as the document words it, taken from the nearest heading or lead-in that names the area. When the document does not group objectives or targets by area, use the subject of the document as the single area, copied from its title. Header rows (h) need no label when their rows are labelled. Keep the answer short: merge runs.`;

const labelSchema = z.object({
  i: z.number().int(),
  e: z.number().int().optional(),
  d: z.enum(DESTINATIONS),
  a: z.string().optional(),
  n: z.array(z.number().int()).optional(),
  r: z.string().optional(),
  f: z.enum(META_FIELDS).optional(),
  v: z.string().optional(),
  t: z.string().optional(),
});
export const importClassificationSchema = z.object({ u: z.array(labelSchema) });

const clip = (value: string, limit: number) => (value.length > limit ? `${value.slice(0, limit - 1)}…` : value);

/** One prompt line for a part: id, type letter, text cut to what classifying needs. */
export function unitLine(unit: ImportUnit): string {
  const type = unit.type === "r" && unit.header ? "h" : unit.type;
  return `${unit.id} ${type} ${clip(unit.text, UNIT_TEXT_LIMIT)}`;
}

export interface ClassifyChunk {
  units: ImportUnit[];
  prompt: string;
  tokens: number;
}

/**
 * Splits a document's parts into prompts of whole sections, each at most
 * `budgetTokens`. A section too long for one prompt is split between parts and
 * its heading is repeated, so no prompt loses its context.
 */
export function chunkUnits(
  reference: ImportedPolicyContext,
  units: ImportUnit[],
  policyType: PolicyType,
  budgetTokens = CONTEXT_TOKEN_TARGET - estimateTokens(IMPORT_CLASSIFY_SYSTEM) - PROMPT_OVERHEAD_TOKENS,
): ClassifyChunk[] {
  const head = `Policy type: ${policyType}. Document title: ${clip(reference.title, HEADING_LIMIT)}.\n`;
  const chunks: ClassifyChunk[] = [];
  let lines: string[] = [];
  let current: ImportUnit[] = [];
  let tokens = estimateTokens(head);

  const flush = () => {
    if (current.length) {
      const prompt = `${head}${lines.join("\n")}`;
      chunks.push({ units: current, prompt, tokens: estimateTokens(prompt) });
    }
    lines = [];
    current = [];
    tokens = estimateTokens(head);
  };

  let lastSection = -1;
  for (const unit of units) {
    const sectionChanged = unit.section !== lastSection;
    const headingLine = sectionChanged ? `#${unit.section} ${clip(reference.sections[unit.section]?.title ?? "", HEADING_LIMIT)}` : "";
    const line = unitLine(unit);
    const cost = estimateTokens(`${headingLine}\n${line}\n`);
    if (current.length && (tokens + cost > budgetTokens || current.length >= MAX_UNITS_PER_CHUNK)) {
      // Start the next prompt at a section boundary when this one is the section's first part; otherwise repeat the heading.
      flush();
    }
    const needsHeading = sectionChanged || current.length === 0;
    if (needsHeading) {
      const heading = `#${unit.section} ${clip(reference.sections[unit.section]?.title ?? "", HEADING_LIMIT)}`;
      lines.push(heading);
      tokens += estimateTokens(`${heading}\n`);
    }
    lines.push(line);
    current.push(unit);
    tokens += estimateTokens(`${line}\n`);
    lastSection = unit.section;
  }
  flush();
  return chunks;
}

/** One prompt's answer in, only labels for ids that belong to the prompt out. */
export function validChunkLabels(answer: unknown, chunk: ClassifyChunk): ClassificationLabel[] {
  const parsed = importClassificationSchema.safeParse(answer);
  if (!parsed.success || !chunk.units.length) return [];
  const first = chunk.units[0].id;
  const last = chunk.units[chunk.units.length - 1].id;
  const labels: ClassificationLabel[] = [];
  for (const label of parsed.data.u) {
    if (label.i < first || label.i > last) continue;
    const end = label.e === undefined ? label.i : Math.min(label.e, last);
    if (end < label.i) continue;
    labels.push({ ...label, ...(label.e === undefined ? {} : { e: end }) });
  }
  return labels;
}

export type ChunkRunner = (request: { system: string; user: string; maxTokens: number }, signal?: AbortSignal) => Promise<unknown>;

const defaultRunner: ChunkRunner = async (request, signal) => {
  const { text, stopReason } = await createClaudeText({ ...request, effort: "low", format: zodOutputFormat(importClassificationSchema) }, signal);
  if (stopReason === "max_tokens") throw new Error("The classification was cut off.");
  return JSON.parse(cleanJsonText(text));
};

export interface ClassifyResult {
  classification: ImportClassification;
  chunks: number;
  failedChunks: number;
}

/**
 * Labels the document. Chunks run a few at a time; a chunk that fails or returns
 * something invalid contributes nothing. Returns null when no label came back.
 */
export async function classifyImport(
  reference: ImportedPolicyContext,
  options: { signal?: AbortSignal; run?: ChunkRunner; enabled?: boolean } = {},
): Promise<ClassifyResult | null> {
  if (!(options.enabled ?? hasClaudeKey())) return null;
  const units = flattenUnits(reference);
  if (!units.length) return null;
  const chunks = chunkUnits(reference, units, reference.policyType).slice(0, MAX_CHUNKS);
  const signal = options.signal ?? AbortSignal.timeout(CLASSIFY_TIMEOUT_MS);
  const run = options.run ?? defaultRunner;
  const labels: ClassificationLabel[] = [];
  let failed = 0;

  for (let start = 0; start < chunks.length; start += CONCURRENCY) {
    const batch = chunks.slice(start, start + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((chunk) => run({
      system: IMPORT_CLASSIFY_SYSTEM,
      user: chunk.prompt,
      maxTokens: Math.min(16_000, 1_000 + chunk.units.length * 40),
    }, signal)));
    results.forEach((result, index) => {
      if (result.status === "rejected") { failed++; return; }
      const valid = validChunkLabels(result.value, batch[index]);
      if (!valid.length) failed++;
      labels.push(...valid);
    });
  }
  return labels.length ? { classification: { u: labels }, chunks: chunks.length, failedChunks: failed } : null;
}

// ---------------------------------------------------------------- untrusted input

const SECTION_KINDS = new Set<StandardSectionKind | "custom">(["preface", "declaration", "scope", "definitions", "focus", "qualitative", "quantitative", "sdg", "responsibilities", "monitoring", "review", "revision", "custom"]);
const MAX_SECTIONS = 600;
const MAX_BLOCKS = 3_000;
const MAX_CHARS = 1_500_000;

const text = (value: unknown, limit = 20_000) => (typeof value === "string" ? value.slice(0, limit) : "");

/**
 * The reference document as the browser sent it, rebuilt from only the fields
 * the classifier reads and bounded in size. Returns null for anything that is
 * not a parsed policy.
 */
export function parseReferenceInput(value: unknown): ImportedPolicyContext | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.sections) || input.sections.length > MAX_SECTIONS) return null;
  const policyTypes: PolicyType[] = ["environmental", "labour-human-rights", "living-wage", "ethics", "sustainable-procurement"];
  const policyType = policyTypes.find((type) => type === input.policyType) ?? "environmental";
  let blocks = 0;
  let chars = 0;
  const sections: ImportedPolicySection[] = [];
  for (const raw of input.sections) {
    if (!raw || typeof raw !== "object") return null;
    const section = raw as Record<string, unknown>;
    if (!Array.isArray(section.blocks)) return null;
    const cleaned: ImportedPolicyBlock[] = [];
    for (const rawBlock of section.blocks) {
      if (!rawBlock || typeof rawBlock !== "object") continue;
      const block = rawBlock as Record<string, unknown>;
      if (block.type === "paragraph") cleaned.push({ type: "paragraph", text: text(block.text) });
      else if (block.type === "list" && Array.isArray(block.items)) cleaned.push({ type: "list", ordered: block.ordered === true, items: block.items.slice(0, 500).map((item) => text(item)) });
      else if (block.type === "table" && Array.isArray(block.rows)) {
        cleaned.push({ type: "table", rows: block.rows.slice(0, 500).filter(Array.isArray).map((row: unknown[]) => row.slice(0, 20).map((cell) => text(cell, 2_000))) });
      }
    }
    blocks += cleaned.length;
    chars += cleaned.reduce((sum, block) => sum + JSON.stringify(block).length, 0);
    if (blocks > MAX_BLOCKS || chars > MAX_CHARS) return null;
    const level = section.level === 2 || section.level === 3 ? section.level : 1;
    const kind = SECTION_KINDS.has(section.kind as StandardSectionKind | "custom") ? (section.kind as StandardSectionKind | "custom") : "custom";
    sections.push({ id: text(section.id, 80) || `s${sections.length}`, title: text(section.title, 300), level, kind, blocks: cleaned });
  }
  return {
    fileName: text(input.fileName, 200),
    policyType,
    title: text(input.title, 300),
    text: "",
    sections,
    importedAt: typeof input.importedAt === "string" ? input.importedAt.slice(0, 40) : new Date().toISOString(),
  };
}
