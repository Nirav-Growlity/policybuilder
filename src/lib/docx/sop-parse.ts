/**
 * SOP manual .docx parser (raw WordprocessingML; shared by the offline corpus
 * script and the runtime "import my manual" flow).
 *
 * Heuristics, in order:
 * 1. The cached Word TOC is the SOP catalog. Entries are matched to body
 *    paragraphs through their `_Toc` bookmark anchors (text match as fallback).
 * 2. Outline levels come from styles, direct `w:outlineLvl`, table cells and,
 *    when the TOC only lists sections, from the per-section header parts.
 * 3. SOP titles and section headings that share one style are told apart by the
 *    formatting signature (style, list level, alignment, size, numbering shape)
 *    of TOC entries that open an SOP (entries followed by "Purpose"/"Scope").
 * 4. Section headings are classified with a synonym lexicon.
 * 5. Closing markers (Revision History, Review & Control Framework, Approved by)
 *    end the last SOP.
 */
import type { Company, RevisionEntry, RichTextBlock, Site } from "../types";
import {
  readDocxModel,
  type DocBlock,
  type DocParagraph,
  type DocSection,
  type DocTable,
  type DocxModel,
} from "./docx-model";

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

export type ParsedSopSectionKind =
  | "purpose"
  | "scope"
  | "definitions"
  | "abbreviations"
  | "responsibilities"
  | "procedure"
  | "monitoring"
  | "training"
  | "records"
  | "references"
  | "review"
  | "compliance"
  | "appendix";

export type ParsedSopSection = {
  label: string;
  kind?: ParsedSopSectionKind;
  /** The kind was inferred from position (unlabelled steps between Purpose/Scope and the closing sections). */
  inferred?: boolean;
  blocks: RichTextBlock[];
};

export type ParsedSop = {
  title: string;
  code?: string;
  /** Pillar or department chapter the SOP sits under, when the manual groups SOPs. */
  group?: string;
  department?: string;
  version?: string;
  /** Where the SOP title was found. */
  source: "toc" | "header" | "heading";
  sections: ParsedSopSection[];
};

export type ParsedSopControl = {
  docNo?: string;
  revision?: string;
  supersedes?: string;
  issueDate?: string;
  effectiveDate?: string;
  lastReviewDate?: string;
  nextReviewDate?: string;
  reviewFrequency?: string;
  preparedBy?: string;
  reviewedBy?: string;
  approvedBy?: string;
  classification?: string;
};

export type ParsedManualSection = { label: string; kind?: string; blocks: RichTextBlock[] };

export type ParsedTocEntry = {
  title: string;
  level: number;
  role: "sop" | "section" | "front" | "closing" | "group";
  matched: boolean;
};

export type ParsedSopManual = {
  title: string;
  company?: Partial<Company>;
  control: ParsedSopControl;
  frontMatter: { sections: ParsedManualSection[]; sites: Site[] };
  sops: ParsedSop[];
  closing: { sections: ParsedManualSection[]; revisionHistory: RevisionEntry[] };
  toc: ParsedTocEntry[];
  warnings: string[];
};

export async function parseSopDocx(buffer: Buffer | Uint8Array | ArrayBuffer): Promise<ParsedSopManual> {
  const model = await readDocxModel(buffer);
  return parseSopModel(model);
}

/* ------------------------------------------------------------------ */
/* Lexicon                                                             */
/* ------------------------------------------------------------------ */

const SECTION_LEXICON: Array<[ParsedSopSectionKind, RegExp]> = [
  ["purpose", /\b(purpose|objectives?|summary|overview|introduction|background|aims?|intent)\b/],
  ["scope", /\b(scope|applicability|coverage)\b/],
  ["abbreviations", /\b(abbreviations?|acronyms)\b/],
  ["definitions", /\b(definitions?|terms|terminology|glossary)\b/],
  ["responsibilities", /\b(roles?|responsibilit\w*|accountabilit\w*|ownership)\b/],
  ["monitoring", /\b(monitoring|kpis?|key performance|reporting|metrics|measurement)\b/],
  ["training", /\b(training|awareness|engagement|capacity building|competenc\w*)\b/],
  ["records", /\b(records?|documentation|record[- ]keeping|evidence)\b/],
  ["references", /\b(references?|related documents|legal requirements|applicable (laws|standards|regulations))\b/],
  ["review", /\b(review|amendments?|continuous improvement|revisions?|corrective actions?|verification|deviations?)\b/],
  ["compliance", /\b(compliance|violations?|disciplinary)\b/],
  ["appendix", /\b(appendix|appendices|annexures?|annex|forms?|templates?|checklists?|formats?)\b/],
  ["procedure", /\b(procedures?|process(es)?|measures|methods?|methodology|implementation|steps|workflow|guidelines|practices|protocols?|controls?)\b/],
];

/** Words a pure section heading is made of ("Roles and Responsibilities", "Monitoring & KPIs"). */
const SECTION_WORDS = new Set(
  (
    "purpose purposes objective objectives introduction overview summary background aim aims intent scope applicability coverage " +
    "definition definitions terms terminology glossary abbreviation abbreviations acronyms role roles responsibility responsibilities " +
    "accountability accountabilities ownership procedure procedures process monitoring kpi kpis reporting review reviews measurement " +
    "training awareness engagement employee records record documentation keeping references reference documents document legal " +
    "requirements amendment amendments revision revisions continuous improvement compliance appendix appendices annexure annexures " +
    "annex forms form mechanism corrective action actions verification deviation violations performance key indicators"
  ).split(" ")
);

const STOP_WORDS = new Set("and & of the to this sop its a an used in our updated general".split(" "));

const START_KINDS = new Set<ParsedSopSectionKind>(["purpose", "scope"]);
const HEAD_KINDS = new Set<ParsedSopSectionKind>(["purpose", "scope", "definitions", "abbreviations", "responsibilities"]);
const TAIL_KINDS = new Set<ParsedSopSectionKind>(["monitoring", "training", "records", "references", "review", "compliance", "appendix"]);

const GROUP_LABEL =
  /^(environment(al)?|social|governance|ethics|economic|esg|e|s|g)(\s+(management|esg|related|pillar))?(\s+(procedures?|practices?|sops?|policies|pillar))?$/;
const LETTER_SECTION_LABEL = /^(section|part|chapter)\s+[a-z]\s*[:.\-–]/i;

const MANUAL_TITLE_LABEL = /\b(sop|sops|esg sop|standard operating procedures?|procedures?)\s*(\(sops?\)\s*)?manual\b/;
const FRONT_START =
  /^(introduction|company (introduction|overview|profile)|about|manual overview|purpose|objectives?|scope|applicability|who (it|this)|audience|guiding principles|core values|governance structure|definitions|document control|expected benefits|operational coverage|applicable sites|abbreviations?|how to use|our commitment)\b/;

const CLOSING_LABEL =
  /^((sop )?(manual )?revision history|review (&|and) control framework|review cycle framework|review process stages|(sop )?manual review( mechanism)?|review schedule( (and|&) compliance)?|sop approval( (and|&) authori[sz]ation)?|approval (and|&) authori[sz]ation|document approval|approved by|approvals?|sign[- ]?off|(employee )?acknowledg(e)?ment( form)?|review (and|&) (update|compliance)( process| statement)?)$|for all sops\b/;
/** Manual-level closing headings that carry trailing words ("Revision History Table"). */
const CLOSING_PREFIX =
  /^(revision history\b|review mechanism (of|for) (the |this )?(sop |esg )?manual|(sop )?manual control\b|document control (and|&) distribution|distribution list\b)/;
const GENERIC_CLOSING_LABEL = /^(review mechanism|review (and|&) (amendment|revision))$/;

const END_MARKER = /^(revision history|review (&|and) control framework|approved by|document approval|approval (and|&) authori[sz]ation|sop manual review|manual review mechanism)\b/;

/** Lower-case label with leading numbering ("4.", "SOP 1:", "SECTION 2:") and trailing colon removed. */
export function cleanLabel(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^((sop|section|chapter|part)\s*)?(\d+(\.\d+)*(\s*[.):\-–]\s*|\s+)|[ivxlc]+[.)]\s+|[a-z][.):]\s+)/i, "")
    .replace(/[:.\s]+$/, "")
    .trim();
}

function words(label: string): string[] {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** Lexicon kind for a section heading (labels of up to ~10 words). */
export function classifySectionLabel(label: string): ParsedSopSectionKind | undefined {
  const text = cleanLabel(label).toLowerCase();
  if (!text || words(text).length > 10) return undefined;
  // The earliest keyword wins: "Terminology Overview" is definitions, "Purpose and Scope" is purpose.
  let best: { kind: ParsedSopSectionKind; at: number } | undefined;
  for (const [kind, pattern] of SECTION_LEXICON) {
    const match = pattern.exec(text);
    if (match && (!best || match.index < best.at)) best = { kind, at: match.index };
  }
  return best?.kind;
}

/** A pure section label: every content word is a section word ("Roles & Responsibilities"). */
function strictSectionKind(label: string): ParsedSopSectionKind | undefined {
  const tokens = words(cleanLabel(label)).filter((word) => !STOP_WORDS.has(word));
  if (tokens.length === 0 || tokens.length > 6) return undefined;
  if (!tokens.every((word) => SECTION_WORDS.has(word))) return undefined;
  return classifySectionLabel(label);
}

function isGroupLabel(label: string): boolean {
  const text = cleanLabel(label).toLowerCase();
  return GROUP_LABEL.test(text) || LETTER_SECTION_LABEL.test(label.trim());
}

function isManualTitleLabel(label: string): boolean {
  const text = label.toLowerCase();
  return MANUAL_TITLE_LABEL.test(text) && !/\b(review|revision|approval)\b/.test(text);
}

function isFrontLabel(label: string): boolean {
  const text = cleanLabel(label).toLowerCase().replace(/^["“”']+/, "");
  if (/^esg at (our|the) core/.test(text) || isManualTitleLabel(text)) return true;
  if (!FRONT_START.test(text)) return false;
  // "Document Control and SOP Management" is an SOP; "Scope of the Manual" is front matter.
  return words(text).length <= 4 || FRONT_QUALIFIER.test(text);
}

const FRONT_QUALIFIER = /\b(manual|sop implementation|in (the |our )?sops?|our sops|used in)\b/;

function isClosingLabel(label: string): boolean {
  const text = cleanLabel(label).toLowerCase();
  // "SOP Manual Review Mechanism – Jutify Lifestyle Pvt. Ltd."
  const head = text.split(/\s+[–—-]\s+|:\s+/)[0];
  return CLOSING_LABEL.test(text) || CLOSING_LABEL.test(head) || CLOSING_PREFIX.test(text);
}

/** Normalised key used to match TOC text against body paragraphs. */
function matchKey(value: string): string {
  return cleanLabel(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Body index                                                          */
/* ------------------------------------------------------------------ */

type BodyIndex = {
  model: DocxModel;
  blocks: DocBlock[];
  /** paragraph index -> top-level block index */
  blockOf: Map<number, number>;
  bookmarks: Map<string, number>;
  tocBlocks: Set<number>;
  tocEnd: number;
};

function indexBody(model: DocxModel): BodyIndex {
  const blockOf = new Map<number, number>();
  const tocBlocks = new Set<number>();
  model.blocks.forEach((block, blockIndex) => {
    if (block.type === "paragraph") {
      blockOf.set(block.index, blockIndex);
      if (block.isToc) tocBlocks.add(blockIndex);
    } else {
      for (const row of block.rows) for (const cell of row) for (const p of cell.paragraphs) blockOf.set(p.index, blockIndex);
    }
  });
  const bookmarks = new Map<string, number>();
  for (const p of model.paragraphs) for (const name of p.bookmarks) if (!bookmarks.has(name)) bookmarks.set(name, p.index);
  const tocEnd = tocBlocks.size ? Math.max(...tocBlocks) + 1 : 0;
  return { model, blocks: model.blocks, blockOf, bookmarks, tocBlocks, tocEnd };
}

/* ------------------------------------------------------------------ */
/* TOC catalog                                                         */
/* ------------------------------------------------------------------ */

type TocItem = {
  title: string;
  level: number;
  paragraph?: DocParagraph;
  block?: number;
  signature: string;
  strictKind?: ParsedSopSectionKind;
  /** Body text that picked up a heading style ("ETP Sludge: handled through ..."). */
  sentence: boolean;
  role?: ParsedTocEntry["role"];
};

function isSentenceLike(text: string): boolean {
  const count = words(text).length;
  const trimmed = text.trim();
  return count > 22 || (/\.$/.test(trimmed) && !/\b(ltd|inc|co|pvt|llc|llp|corp|etc)\.$/i.test(trimmed) && count > 6);
}

function numberingShape(p: DocParagraph): string {
  if (p.numFormat && p.numFormat !== "none") return `list:${p.numFormat}:${p.ilvl ?? 0}`;
  const text = p.text;
  if (/^\d+\.\d+\.\d+/.test(text)) return "n3";
  if (/^\d+\.\d+/.test(text)) return "n2";
  if (/^\d+(\.0)?[.)]?\s/.test(text)) return "n1";
  if (/^(sop|section)\b/i.test(text)) return "sop";
  if (/^[a-z][.)]\s/i.test(text)) return "alpha";
  return "plain";
}

function sizeBucket(size?: number): string {
  return size === undefined ? "" : String(Math.round(size / 2));
}

function paragraphSignature(p: DocParagraph): string {
  return [
    p.styleId ?? "",
    p.outlineLevel ?? "",
    numberingShape(p),
    p.align ?? "",
    sizeBucket(p.size),
    p.bold ? "b" : "",
    p.table ? "t" : "",
  ].join("|");
}

function readTocItems(index: BodyIndex): TocItem[] {
  const tocParagraphs = index.model.paragraphs.filter((p) => p.isToc && p.text);
  if (tocParagraphs.length === 0) return [];
  const bodyParagraphs = index.model.paragraphs.filter((p) => !p.isToc && p.text);
  let cursor = 0;
  const lastTocIndex = tocParagraphs[tocParagraphs.length - 1].index;

  return tocParagraphs.map((entry) => {
    let target: DocParagraph | undefined;
    if (entry.tocAnchor && index.bookmarks.has(entry.tocAnchor)) {
      let candidate = index.model.paragraphs[index.bookmarks.get(entry.tocAnchor)!];
      // Bookmarks sometimes sit on an empty paragraph just before the heading.
      for (let step = 0; candidate && !candidate.text && step < 3; step += 1) candidate = index.model.paragraphs[candidate.index + 1];
      if (candidate && !candidate.isToc) target = candidate;
    }
    if (!target) {
      const key = matchKey(entry.text);
      if (key) {
        for (let i = cursor; i < bodyParagraphs.length; i += 1) {
          const p = bodyParagraphs[i];
          if (p.index <= lastTocIndex) continue;
          const candidateKey = matchKey(p.text);
          if (candidateKey === key || (key.length >= 24 && candidateKey.startsWith(key)) || (candidateKey.length >= 24 && key.startsWith(candidateKey))) {
            target = p;
            cursor = i + 1;
            break;
          }
        }
      }
    } else {
      const position = bodyParagraphs.findIndex((p) => p.index === target!.index);
      if (position >= 0) cursor = Math.max(cursor, position + 1);
    }
    const level = entry.tocLevel ?? (target?.outlineLevel !== undefined ? target.outlineLevel + 1 : 1);
    return {
      title: entry.text,
      level,
      paragraph: target,
      block: target ? index.blockOf.get(target.index) : undefined,
      signature: `${level}#${target ? paragraphSignature(target) : "?"}`,
      strictKind: strictSectionKind(entry.text),
      sentence: isSentenceLike(entry.text),
    };
  });
}

/** Assigns a role to every TOC entry. Returns the number of SOPs found. */
function classifyToc(items: TocItem[]): number {
  const n = items.length;
  const childrenOf = (i: number): number[] => {
    const out: number[] = [];
    for (let j = i + 1; j < n && items[j].level > items[i].level; j += 1) out.push(j);
    return out;
  };

  // Anchors: entries that open an SOP, i.e. have section children or are followed by "Purpose"/"Scope".
  const anchor = new Array<boolean>(n).fill(false);
  const isGroup = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i += 1) {
    const item = items[i];
    if (item.strictKind || item.sentence || isClosingLabel(item.title) || isManualTitleLabel(item.title)) continue;
    const children = childrenOf(i);
    if (children.length > 0) {
      const childLevel = Math.min(...children.map((j) => items[j].level));
      const direct = children.filter((j) => items[j].level === childLevel);
      if (direct.some((j) => items[j].strictKind)) anchor[i] = !isFrontLabel(item.title) || /\bsop\b/i.test(item.title);
      else if (!isFrontLabel(item.title)) isGroup[i] = true;
      continue;
    }
    if (isGroupLabel(item.title)) {
      isGroup[i] = true;
      continue;
    }
    const next = items[i + 1];
    if (next && next.level === item.level && next.strictKind && START_KINDS.has(next.strictKind) && !isFrontLabel(item.title)) anchor[i] = true;
  }
  // SOPs live on one TOC level; anchors nested deeper are sub-procedures of an SOP.
  const levelCounts = new Map<number, number>();
  items.forEach((item, i) => anchor[i] && levelCounts.set(item.level, (levelCounts.get(item.level) ?? 0) + 1));
  const dominantLevel = [...levelCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  items.forEach((item, i) => {
    if (anchor[i] && dominantLevel !== undefined && item.level > dominantLevel) anchor[i] = false;
  });
  const anchorCount = anchor.filter(Boolean).length;
  const firstAnchor = anchor.indexOf(true);

  if (anchorCount >= 2) {
    const anchorSigs = new Set(items.filter((_, i) => anchor[i]).map((item) => item.signature));
    const sectionSigs = new Set(items.filter((item) => item.strictKind).map((item) => item.signature));
    const anchorLevels = new Set(items.filter((_, i) => anchor[i]).map((item) => item.level));
    const sopLevel = Math.min(...anchorLevels);
    let seenSop = false;
    let lastSop = -1;
    for (let i = 0; i < n; i += 1) {
      const item = items[i];
      if (anchor[i]) {
        item.role = "sop";
      } else if (item.sentence) {
        item.role = i < firstAnchor ? "front" : "section";
      } else if ((isGroup[i] && item.level < sopLevel) || (isGroupLabel(item.title) && item.level <= sopLevel)) {
        item.role = "group";
      } else if (!seenSop && i < firstAnchor && (item.strictKind || isFrontLabel(item.title) || !anchorSigs.has(item.signature))) {
        item.role = "front";
      } else if (isClosingLabel(item.title) && !item.strictKind) {
        item.role = "closing";
      } else if (isClosingLabel(item.title) && item.level < Math.min(...items.filter((it) => it.strictKind).map((it) => it.level))) {
        item.role = "closing";
      } else if (
        !item.strictKind &&
        anchorLevels.has(item.level) &&
        anchorSigs.has(item.signature) &&
        !sectionSigs.has(item.signature) &&
        !isFrontLabel(item.title)
      ) {
        item.role = "sop";
      } else if (!item.strictKind && item.level < sopLevel && !isGroupLabel(item.title) && items[i + 1] && items[i + 1].level > item.level) {
        item.role = "group";
      } else {
        item.role = "section";
      }
      if (item.role === "sop") {
        seenSop = true;
        lastSop = i;
      }
    }
    // Generic "Review Mechanism" entries after the last SOP's sections at SOP level close the manual.
    for (let i = lastSop + 1; i < n; i += 1) {
      if (items[i].level <= sopLevel && items[i].role === "section" && GENERIC_CLOSING_LABEL.test(cleanLabel(items[i].title).toLowerCase())) {
        items[i].role = "closing";
      }
    }
  } else {
    // Flat catalog: every entry that is not front matter, closing or a pillar heading is an SOP.
    let seenSop = false;
    for (let i = 0; i < n; i += 1) {
      const item = items[i];
      const label = cleanLabel(item.title).toLowerCase();
      if (item.sentence) item.role = seenSop ? "section" : "front";
      else if (isGroup[i] || isGroupLabel(item.title)) item.role = "group";
      else if (seenSop && (isClosingLabel(item.title) || GENERIC_CLOSING_LABEL.test(label))) item.role = "closing";
      else if (!seenSop && (isFrontLabel(item.title) || item.strictKind)) item.role = "front";
      else if (isManualTitleLabel(item.title)) item.role = "front";
      else if (item.strictKind) item.role = seenSop ? "section" : "front";
      else if (anchor[i] || !item.strictKind) {
        item.role = "sop";
        seenSop = true;
      }
    }
    // Entries nested under an SOP (deeper level) are its sections.
    let currentSopLevel = Infinity;
    for (const item of items) {
      if (item.role === "sop") {
        if (item.level > currentSopLevel) item.role = "section";
        else currentSopLevel = item.level;
      } else if (item.role === "group" || item.role === "closing" || item.role === "front") {
        currentSopLevel = Infinity;
      }
    }
  }
  return items.filter((item) => item.role === "sop").length;
}

/* ------------------------------------------------------------------ */
/* Heading candidates inside a range                                   */
/* ------------------------------------------------------------------ */

type Heading = { block: number; label: string; tier: string; kind?: ParsedSopSectionKind; forced?: boolean };

const MAX_HEADING_WORDS = 14;

function paragraphHeading(p: DocParagraph): { label: string; tier: string } | undefined {
  const text = p.text.trim();
  if (!text || p.isToc || text.length > 140 || text.includes("\n")) return undefined;
  const wordCount = words(text).length;
  if (wordCount === 0 || wordCount > MAX_HEADING_WORDS) return undefined;
  const shape = numberingShape(p);
  const styled = p.outlineLevel !== undefined || /heading|title|quote/i.test(p.styleName ?? "");
  if (!styled) {
    if (!p.bold) return undefined;
    // Bold bullets only head a section when the whole item is a short label ("Purpose").
    if (p.numFormat === "bullet" && (wordCount > 8 || /[:.]\s*\S/.test(text))) return undefined;
    // Bold run-in text ("Energy audits: Conduct ...") is body text, not a heading.
    if (/[.;]$/.test(text) && wordCount > 4) return undefined;
    if (/:\s*\S/.test(text) && !/^\d/.test(text)) return undefined;
  }
  return { label: text, tier: `p|${paragraphSignature(p)}|${shape}` };
}

function tableHeading(table: DocTable): { label: string; tier: string } | undefined {
  if (table.rows.length !== 1) return undefined;
  const cells = table.rows[0].filter((cell) => cell.text.trim());
  if (cells.length !== 1) return undefined;
  const cell = cells[0];
  const text = cell.text.trim();
  if (text.includes("\n") || words(text).length > MAX_HEADING_WORDS) return undefined;
  const p = cell.paragraphs.find((para) => para.text);
  if (!p) return undefined;
  const styled = p.outlineLevel !== undefined || p.bold || cell.shaded || /heading|title/i.test(p.styleName ?? "");
  if (!styled) return undefined;
  return { label: text, tier: `t${table.rows[0].length}|${paragraphSignature(p)}` };
}

function headingAt(index: BodyIndex, blockIndex: number): { label: string; tier: string } | undefined {
  const block = index.blocks[blockIndex];
  if (!block) return undefined;
  return block.type === "paragraph" ? paragraphHeading(block) : tableHeading(block);
}

/**
 * Picks section headings in [from, to): forced headings (TOC section anchors)
 * plus every heading candidate on a tier where section labels live.
 */
function findSectionHeadings(index: BodyIndex, from: number, to: number, forced: Map<number, string>): Heading[] {
  const candidates: Heading[] = [];
  for (let b = from; b < to; b += 1) {
    if (index.tocBlocks.has(b)) continue;
    const heading = headingAt(index, b);
    const forcedLabel = forced.get(b);
    if (forcedLabel !== undefined) {
      candidates.push({ block: b, label: heading?.label ?? forcedLabel, tier: heading?.tier ?? `forced`, kind: classifySectionLabel(forcedLabel), forced: true });
    } else if (heading) {
      candidates.push({ block: b, label: heading.label, tier: heading.tier, kind: classifySectionLabel(heading.label) });
    }
  }
  if (candidates.length === 0) return [];

  const tiers = new Set<string>();
  for (const candidate of candidates) if (candidate.forced) tiers.add(candidate.tier);
  const firstLex = candidates.find((candidate) => candidate.kind && strictSectionKind(candidate.label));
  if (firstLex) tiers.add(firstLex.tier);
  const lexCounts = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.kind && strictSectionKind(candidate.label)) lexCounts.set(candidate.tier, (lexCounts.get(candidate.tier) ?? 0) + 1);
  }
  for (const [tier, count] of lexCounts) if (count >= 2) tiers.add(tier);
  return candidates.filter((candidate) => candidate.forced || tiers.has(candidate.tier));
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

class BlockWriter {
  private counter = 0;
  constructor(private prefix: string) {}

  id(): string {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }
}

const MANUAL_BULLET = /^[•●▪◦■□➢➤►▶✓✔\-–]\s+/;

function listType(p: DocParagraph): "bullets" | "numbered" | undefined {
  if (p.numFormat && p.numFormat !== "none") return p.numFormat === "bullet" ? "bullets" : "numbered";
  if (MANUAL_BULLET.test(p.text)) return "bullets";
  return undefined;
}

function tableToRows(table: DocTable): string[][] {
  const width = Math.max(...table.rows.map((row) => row.length));
  return table.rows.map((row) => {
    const cells = row.map((cell) => (cell.vMergeContinue ? "" : cell.text.trim()));
    while (cells.length < width) cells.push("");
    return cells;
  });
}

function blocksToRichText(index: BodyIndex, from: number, to: number, writer: BlockWriter, skip: Set<number> = new Set()): RichTextBlock[] {
  const out: RichTextBlock[] = [];
  let previousWasList = false;
  let pendingRows: { width: number; rows: string[][] } | undefined;
  const flushRows = () => {
    if (!pendingRows) return;
    const rows = pendingRows.rows;
    const header = rows.length > 1 ? rows[0] : undefined;
    out.push({ id: writer.id(), type: "table", text: "", columns: header, rows: header ? rows.slice(1) : rows });
    pendingRows = undefined;
  };

  for (let b = from; b < to; b += 1) {
    if (skip.has(b) || index.tocBlocks.has(b)) continue;
    const block = index.blocks[b];
    if (block.type === "table") {
      const rows = tableToRows(block).filter((row) => row.some(Boolean));
      if (rows.length === 0) continue;
      const width = rows[0].length;
      const nonEmpty = rows.flat().filter(Boolean);
      if (width === 1 || nonEmpty.length === 1) {
        // 1x1 callouts and shaded label boxes read as paragraphs.
        flushRows();
        out.push({ id: writer.id(), type: "paragraph", text: nonEmpty.join("\n") });
        continue;
      }
      // Consecutive one-row tables of the same width form one table (term/definition strips).
      if (rows.length === 1 && pendingRows && pendingRows.width === width && pendingRows.rows.length >= 1 && isRowStrip(pendingRows)) {
        pendingRows.rows.push(rows[0]);
        continue;
      }
      flushRows();
      pendingRows = { width, rows };
      if (rows.length > 1) flushRows();
      previousWasList = false;
      continue;
    }

    const text = block.text.trim();
    if (!text) continue;
    flushRows();
    const type = listType(block);
    const itemText = type === "bullets" ? text.replace(MANUAL_BULLET, "") : text;
    const previous = out[out.length - 1];
    if (type && previous && previous.type === type && previousWasList) {
      previous.text += `\n${itemText}`;
    } else {
      out.push({ id: writer.id(), type: type ?? "paragraph", text: itemText });
    }
    previousWasList = Boolean(type);
  }
  flushRows();
  return out;
}

function isRowStrip(pending: { rows: string[][] }): boolean {
  return pending.rows.every((row) => row.length >= 2);
}

/* ------------------------------------------------------------------ */
/* Key/value extraction (doc control, SOP header cards)                */
/* ------------------------------------------------------------------ */

type ControlKey = keyof ParsedSopControl | "department" | "version" | "sopTitle";

const CONTROL_LABELS: Array<[ControlKey, RegExp]> = [
  ["docNo", /^(doc(ument)?|manual|sop|procedure|ref(erence)?)\.?\s*(no|number|code|ref|id|#)\.?$|^document (no|number|code)\.?$|^doc\.? ?no\.?$/],
  ["revision", /^(rev(ision)?|version|issue)\.?\s*(no|number|#)?\.?$|^version$/],
  ["supersedes", /^supersedes?$/],
  ["issueDate", /^(issue|issued|date of issue|release)\s*(date|on)?$/],
  ["effectiveDate", /^(effective|w\.?e\.?f\.?)\s*(date|from)?$|^effective date$/],
  ["lastReviewDate", /^(last review(ed)?|revision|reviewed on|last revision)\s*(date|on)?$/],
  ["nextReviewDate", /^(next review|review due|due for review|review)\s*(date|on)?$/],
  ["reviewFrequency", /^review (frequency|cycle|period)$/],
  ["preparedBy", /^prepared\s*(by)?$/],
  ["reviewedBy", /^(reviewed|checked|verified)\s*(by)?$/],
  ["approvedBy", /^(approved|authori[sz]ed)\s*(by)?$/],
  ["classification", /^(classification|copy|confidentiality|copy (no|type|status))$/],
  ["department", /^(department|dept|function)\.?$/],
  ["sopTitle", /^(sop )?title$/],
];

function controlKeyFor(label: string): ControlKey | undefined {
  const text = label
    .toLowerCase()
    .replace(/[:\-–]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.length > 40) return undefined;
  for (const [key, pattern] of CONTROL_LABELS) if (pattern.test(text)) return key;
  return undefined;
}

function cleanValue(value: string): string | undefined {
  const text = value
    .replace(/\s+/g, " ")
    .replace(/^[:\-–]\s*/, "")
    .replace(/\s+page\b.*$/i, "")
    .trim();
  if (!text || controlKeyFor(text) || /^page\s*\d*\s*(of\s*\d+)?$/i.test(text) || /^[0/.\-\s]+$/.test(text) || /^x+$/i.test(text)) return undefined;
  return text;
}

/** Free-text header/footer control data: "Rev.No.01 DOC-SOP-001", "Doc no. WEL – SOP - 01 Page | 1". */
function scanControlText(out: KeyValues, text: string) {
  const revision = /\b(?:rev(?:ision)?|issue|version)\.?\s*(?:no|number)?\.?\s*[:\-]?\s*(\d+(?:\.\d+)?)\b/i.exec(text);
  if (revision) addPair(out, "revision", revision[1]);
  const labelled = /\bdoc(?:ument)?\.?\s*(?:no|number|code)\.?\s*[:\-]?\s*([A-Z0-9]+(?:\s*[–\-/_.]\s*[A-Z0-9]+)+)/i.exec(text);
  const code = labelled?.[1] ?? /\b([A-Z][A-Z0-9]*(?:[-/_][A-Z0-9]+)*[-/_]SOP[A-Z]*(?:[-/_][A-Z0-9]+)+)\b/.exec(text)?.[1];
  if (code) addPair(out, "docNo", code.replace(/\s*[–-]\s*/g, "-").replace(/\s*([/_.])\s*/g, "$1"));
}

type KeyValues = Partial<Record<ControlKey, string>>;

function addPair(out: KeyValues, key: ControlKey | undefined, value: string | undefined) {
  if (!key) return;
  const clean = value === undefined ? undefined : cleanValue(value);
  if (clean && out[key] === undefined) out[key] = clean;
}

function readKeyValues(tables: string[][][], lines: string[]): KeyValues {
  const out: KeyValues = {};
  for (const rows of tables) {
    // Revision-history grids are records, not control fields.
    if (rows.length > 1 && /\b(rev|revision|version)\b/i.test(rows[0].join(" ")) && /\b(date)\b/i.test(rows[0].join(" ")) && /\b(description|details|nature|change|reason|remarks)/i.test(rows[0].join(" "))) continue;
    // Label row over value row ("Prepared By | Reviewed By | Approved By").
    for (let r = 0; r + 1 < rows.length; r += 1) {
      const labels = rows[r].map(controlKeyFor);
      if (labels.filter(Boolean).length >= 2 && labels.every((key, c) => key || !rows[r][c].trim())) {
        rows[r].forEach((_, c) => addPair(out, labels[c], rows[r + 1][c]));
      }
    }
    for (const row of rows) {
      for (let c = 0; c < row.length; c += 1) {
        const cell = row[c].trim();
        const key = controlKeyFor(cell);
        if (key && c + 1 < row.length) {
          addPair(out, key, row[c + 1]);
          continue;
        }
        readInlinePair(out, cell);
      }
    }
  }
  for (const line of lines) readInlinePair(out, line);
  for (const line of lines) scanControlText(out, line);
  return out;
}

function readInlinePair(out: KeyValues, text: string) {
  for (const part of text.split(/\n|\s{3,}|\s\|\s/)) {
    const match = /^([A-Za-z.\s]{2,30}?)\s*[:\-–]\s*(.+)$/.exec(part.trim());
    if (match) addPair(out, controlKeyFor(match[1]), match[2]);
  }
}

function tableGrid(table: DocTable): string[][] {
  return table.rows.map((row) => row.map((cell) => cell.text));
}

function sectionKeyValues(section: DocSection | undefined): KeyValues {
  if (!section) return {};
  return readKeyValues([...section.headerTables, ...section.footerTables], [...section.headerText, ...section.footerText]);
}

function toControl(values: KeyValues): ParsedSopControl {
  const control: ParsedSopControl = {};
  const keys: Array<keyof ParsedSopControl> = [
    "docNo",
    "revision",
    "supersedes",
    "issueDate",
    "effectiveDate",
    "lastReviewDate",
    "nextReviewDate",
    "reviewFrequency",
    "preparedBy",
    "reviewedBy",
    "approvedBy",
    "classification",
  ];
  for (const key of keys) if (values[key]) control[key] = values[key];
  return control;
}

/* ------------------------------------------------------------------ */
/* Sites and revision history tables                                   */
/* ------------------------------------------------------------------ */

function readSitesTable(table: DocTable): Site[] | undefined {
  const rows = tableToRows(table).filter((row) => row.some(Boolean));
  if (rows.length < 1) return undefined;
  const header = rows[0].map((cell) => cell.toLowerCase());
  const addressCol = header.findIndex((cell) => /\baddress|adress\b/.test(cell));
  if (addressCol >= 0) {
    const locationCol = header.findIndex((cell, c) => c !== addressCol && /\b(site|unit|location|plant|facility|branch|office|entity|name|city)\b/.test(cell));
    const functionCol = header.findIndex(
      (cell, c) => c !== addressCol && c !== locationCol && /\b(function|activit|operation|type|purpose|nature|category|process)/.test(cell)
    );
    const sites = rows
      .slice(1)
      .map((row) => ({
        location: locationCol >= 0 ? row[locationCol] || undefined : undefined,
        address: row[addressCol],
        primaryFunction: functionCol >= 0 ? row[functionCol] || undefined : undefined,
      }))
      .filter((site) => site.address);
    return sites.length ? sites : undefined;
  }
  // Header-less "No | City | Address" tables.
  if (rows[0].length === 3 && rows.every((row) => /^\d+\.?$/.test(row[0].trim()) && row[2].length > 20)) {
    return rows.map((row) => ({ location: row[1] || undefined, address: row[2] }));
  }
  return undefined;
}

function readRevisionTable(table: DocTable): RevisionEntry[] | undefined {
  const rows = tableToRows(table).filter((row) => row.some(Boolean));
  if (rows.length < 2) return undefined;
  const header = rows[0].map((cell) => cell.toLowerCase());
  const revCol = header.findIndex((cell) => /\b(rev|revision|version|issue)\b/.test(cell));
  const dateCol = header.findIndex((cell) => /\bdate\b/.test(cell));
  const descCol = header.findIndex((cell, c) => c !== revCol && /\b(description|details|nature|change|summary|remarks|amendment)/.test(cell));
  if (revCol < 0 || dateCol < 0 || descCol < 0) return undefined;
  return rows.slice(1).map((row) => ({
    revisionNo: row[revCol],
    date: row[dateCol],
    description: row[descCol],
    source: "custom" as const,
  }));
}

/* ------------------------------------------------------------------ */
/* Header-part SOP titles (Navitas-style manuals)                      */
/* ------------------------------------------------------------------ */

function headerTitle(section: DocSection): string | undefined {
  const lines = [...section.headerText, ...section.headerTables.flat(2)];
  for (const line of lines) {
    const match = /^\s*(sop|standard operating procedure)\s*(no\.?\s*\d+)?\s*[:\-–]\s*(.{6,})$/i.exec(line);
    if (match && !controlKeyFor(line)) return match[3].trim();
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

type SopRange = { title: string; start: number; contentStart: number; group?: string; source: ParsedSop["source"]; code?: string };

export function parseSopModel(model: DocxModel): ParsedSopManual {
  const warnings: string[] = [];
  const index = indexBody(model);
  const blocks = index.blocks;
  const tocItems = readTocItems(index);
  if (tocItems.length === 0) warnings.push("No cached table of contents found; SOPs were detected from headings.");
  const tocSopCount = classifyToc(tocItems);
  const unmatched = tocItems.filter((item) => item.block === undefined);
  if (unmatched.length) warnings.push(`${unmatched.length} TOC entr${unmatched.length === 1 ? "y" : "ies"} could not be found in the body.`);

  /* ---- SOP ranges ---- */
  let ranges: SopRange[] = [];
  let group: string | undefined;
  // Boundaries that end the SOP before them: groups and closing entries.
  const stopBlocks = new Set<number>();
  for (const item of tocItems) {
    if (item.role === "group") {
      group = cleanLabel(item.title);
      if (item.block !== undefined) stopBlocks.add(item.block);
    } else if (item.role === "closing") {
      if (item.block !== undefined) stopBlocks.add(item.block);
    } else if (item.role === "sop" && item.block !== undefined) {
      ranges.push({ title: item.title, start: item.block, contentStart: item.block + 1, group, source: "toc" });
    } else if (item.role === "sop") {
      warnings.push(`SOP "${item.title}" is listed in the TOC but was not found in the body.`);
    }
  }
  const recovered = recoverGroupSops(index, tocItems, ranges, stopBlocks);
  if (recovered.length) {
    ranges.push(...recovered);
    warnings.push(`${recovered.length} SOP${recovered.length === 1 ? " was" : "s were"} recovered from chapters the TOC lists without SOP entries.`);
  }

  if (ranges.length < 2) {
    const fromHeaders = sopRangesFromHeaders(index);
    if (fromHeaders.length >= 2) {
      ranges = fromHeaders;
      warnings.push("SOP titles were taken from page headers.");
    }
  }
  if (ranges.length < 2) {
    const fromHeadings = sopRangesFromHeadings(index);
    if (fromHeadings.length > ranges.length) {
      ranges = fromHeadings;
      if (tocItems.length) warnings.push("SOP titles were taken from top-level headings.");
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  ranges = ranges.filter((range, i) => i === 0 || range.start !== ranges[i - 1].start);

  const fromToc = ranges.filter((range) => range.source === "toc").length - recovered.filter((range) => range.source === "toc").length;
  if (tocSopCount && fromToc > 0 && fromToc < tocSopCount) {
    warnings.push(`TOC lists ${tocSopCount} SOPs; ${fromToc} were located in the body.`);
  }

  /* ---- Range ends ---- */
  const sortedStops = [...stopBlocks].sort((a, b) => a - b);
  const ends = ranges.map((range, i) => {
    const next = i + 1 < ranges.length ? ranges[i + 1].start : blocks.length;
    const stop = sortedStops.find((block) => block > range.start && block < next);
    return stop ?? next;
  });
  if (ranges.length) {
    const last = ranges.length - 1;
    const marker = findEndMarker(index, ranges[last].start + 1, ends[last]);
    if (marker !== undefined) ends[last] = marker;
  }

  /* ---- Forced section headings from the TOC ---- */
  const forcedSections = new Map<number, string>();
  for (const item of tocItems) {
    if (item.role === "section" && item.block !== undefined) forcedSections.set(item.block, item.title);
  }

  /* ---- SOPs ---- */
  const sopScoped = sectionsAreSopScoped(model);
  const sops: ParsedSop[] = ranges.map((range, i) => {
    const writer = new BlockWriter(`sop${i + 1}`);
    const meta = readSopHeaderCard(index, range.start, Math.min(ends[i] - 1, range.contentStart + 3));
    const section = model.sections[blockSection(blocks[range.start])];
    // Per-SOP page headers (one Word section per SOP) carry that SOP's control data.
    const sectionDoc: KeyValues = sopScoped ? sectionKeyValues(section) : {};
    const sections = buildSections(index, range.contentStart, ends[i], forcedSections, writer, meta.skip);
    const title = cleanSopTitle(range.title);
    const sop: ParsedSop = { title, source: range.source, sections };
    const code = range.code ?? meta.values.docNo ?? codeFromTitle(range.title) ?? sectionDoc.docNo;
    if (code) sop.code = code;
    if (range.group) sop.group = range.group;
    const department = meta.values.department ?? sectionDoc.department ?? (sopScoped ? departmentFromHeader(section) : undefined);
    if (department) sop.department = department;
    const version = meta.values.revision ?? sectionDoc.revision;
    if (version) sop.version = version;
    if (sections.length === 0) warnings.push(`SOP "${title}" has no recognisable sections.`);
    return sop;
  });

  /* ---- Front matter and closing ---- */
  const firstStart = ranges.length ? ranges[0].start : blocks.length;
  const frontStart = index.tocEnd > 0 && index.tocEnd < firstStart ? index.tocEnd : 0;
  const frontWriter = new BlockWriter("front");
  const groupBlocks = new Set(tocItems.filter((item) => item.role === "group" && item.block !== undefined).map((item) => item.block!));
  const frontForced = new Map<number, string>();
  for (const item of tocItems) if (item.role === "front" && item.block !== undefined) frontForced.set(item.block, item.title);
  const frontSections = buildManualSections(index, frontStart, firstStart, frontForced, frontWriter, groupBlocks);

  const lastEnd = ranges.length ? ends[ends.length - 1] : blocks.length;
  const closingForced = new Map<number, string>();
  for (const item of tocItems) if (item.role === "closing" && item.block !== undefined) closingForced.set(item.block, item.title);
  const closingSections = buildManualSections(index, lastEnd, blocks.length, closingForced, new BlockWriter("closing"), new Set());

  /* ---- Sites, revision history, control ---- */
  let sites: Site[] = [];
  for (let b = 0; b < firstStart && sites.length === 0; b += 1) {
    const block = blocks[b];
    if (block.type === "table") sites = readSitesTable(block) ?? [];
  }
  let revisionHistory: RevisionEntry[] = [];
  for (let b = blocks.length - 1; b >= lastEnd && revisionHistory.length === 0; b -= 1) {
    const block = blocks[b];
    if (block.type === "table") revisionHistory = readRevisionTable(block) ?? [];
  }
  if (revisionHistory.length === 0) {
    for (let b = 0; b < firstStart && revisionHistory.length === 0; b += 1) {
      const block = blocks[b];
      if (block.type === "table") revisionHistory = readRevisionTable(block) ?? [];
    }
  }

  const frontTables = blocks.slice(0, firstStart).filter((block): block is DocTable => block.type === "table").map(tableGrid);
  const frontValues = readKeyValues(frontTables, []);
  const headerValues = manualHeaderValues(model, sopScoped);
  const control = toControl({ ...headerValues, ...frontValues });

  const title = findManualTitle(index, firstStart);
  const companyName = findCompanyName(model, index, firstStart);
  const company: Partial<Company> | undefined =
    companyName || sites.length ? { ...(companyName ? { name: companyName } : {}), ...(sites.length ? { sites } : {}) } : undefined;

  return {
    title,
    company,
    control,
    frontMatter: { sections: frontSections, sites },
    sops,
    closing: { sections: closingSections, revisionHistory },
    toc: tocItems.map((item) => ({ title: item.title, level: item.level, role: item.role ?? "section", matched: item.block !== undefined })),
    warnings,
  };
}

/**
 * A pillar/department chapter whose SOPs are missing from the TOC: take body
 * headings styled like the known SOP titles, or treat the chapter as one SOP.
 */
function recoverGroupSops(index: BodyIndex, tocItems: TocItem[], ranges: SopRange[], stopBlocks: Set<number>): SopRange[] {
  const titleSignatures = new Set<string>();
  for (const range of ranges) {
    const block = index.blocks[range.start];
    if (block?.type === "paragraph") titleSignatures.add(paragraphSignature(block));
  }
  const stops = [...stopBlocks].sort((a, b) => a - b);
  const recovered: SopRange[] = [];
  for (const item of tocItems) {
    if (item.role !== "group" || item.block === undefined) continue;
    const start = item.block;
    const next = stops.find((block) => block > start) ?? index.blocks.length;
    if (ranges.some((range) => range.start > start && range.start < next)) continue;
    const group = cleanLabel(item.title);
    const titled: SopRange[] = [];
    for (let b = start + 1; b < next; b += 1) {
      const block = index.blocks[b];
      if (block.type === "paragraph" && block.text && titleSignatures.has(paragraphSignature(block))) {
        titled.push({ title: block.text, start: b, contentStart: b + 1, group, source: "heading" });
      }
    }
    if (titled.length) {
      recovered.push(...titled);
      continue;
    }
    const content = index.blocks.slice(start + 1, next).filter((block) => block.type === "table" || block.text).length;
    if (content >= 5) recovered.push({ title: item.title, start, contentStart: start + 1, group, source: "toc" });
  }
  return recovered;
}

function blockSection(block: DocBlock | undefined): number {
  return block ? block.section : 0;
}

/** True when the document uses one Word section per SOP (header carries SOP-specific control data). */
function sectionsAreSopScoped(model: DocxModel): boolean {
  const docNos = new Set(model.sections.map((section) => sectionKeyValues(section).docNo).filter(Boolean));
  return docNos.size >= 3;
}

function manualHeaderValues(model: DocxModel, sopScoped: boolean): KeyValues {
  if (sopScoped) return {};
  // The cover section often has no header; use the first section that carries control data.
  for (const section of model.sections) {
    const values = sectionKeyValues(section);
    if (Object.keys(values).length >= 2) return values;
  }
  return sectionKeyValues(model.sections[0]);
}

function departmentFromHeader(section: DocSection | undefined): string | undefined {
  if (!section) return undefined;
  const line = [...section.headerText, ...section.headerTables.flat(2)].find((text) => /\bdepartment\b/i.test(text) && words(text).length <= 6 && !controlKeyFor(text));
  return line?.trim();
}

function codeFromTitle(title: string): string | undefined {
  const match = /\((?:doc(?:ument)?\.?\s*no\.?|sop\s*no\.?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9/\- ]*?)\)\s*$/i.exec(title);
  if (match) return match[1].replace(/\s+/g, "");
  const sop = /^sop\s*(\d+)\s*[:\-–]/i.exec(title);
  return sop ? `SOP ${sop[1]}` : undefined;
}

function cleanSopTitle(title: string): string {
  return title
    .replace(/\((?:doc(?:ument)?\.?\s*no\.?|sop\s*no\.?)[^)]*\)\s*$/i, "")
    .replace(/^\s*(sop|section|part|chapter)\s*(\d+|[a-z])\s*[:\-–.]\s*/i, "")
    .replace(/^\s*\d+(\.\d+)*[.)]?\s+/, "")
    .replace(/^\s*(sop|standard operating procedures?)\s*(\(sops?\))?\s*[:\-–]\s*/i, "")
    .replace(/[:\s]+$/, "")
    .trim();
}

function findEndMarker(index: BodyIndex, from: number, to: number): number | undefined {
  for (let b = from; b < to; b += 1) {
    const block = index.blocks[b];
    const heading = headingAt(index, b);
    if (block.type === "paragraph" && heading && END_MARKER.test(cleanLabel(heading.label).toLowerCase())) return b;
    if (block.type === "table" && block.rows.length > 1) {
      // A revision-history table directly after a short heading also ends the manual body.
      if (readRevisionTable(block) && b > from && /revision|history/i.test(paragraphText(index.blocks[b - 1]))) return b - 1;
    }
  }
  return undefined;
}

function paragraphText(block: DocBlock | undefined): string {
  return block && block.type === "paragraph" ? block.text : "";
}

/** SOP header card right under the title: SOP No., Version, Department, Effective date... */
function readSopHeaderCard(index: BodyIndex, titleBlock: number, limit: number): { values: KeyValues; skip: Set<number> } {
  const skip = new Set<number>();
  let values: KeyValues = {};
  for (let b = titleBlock; b <= limit && b < index.blocks.length; b += 1) {
    const block = index.blocks[b];
    if (block.type !== "table") continue;
    const found = readKeyValues([tableGrid(block)], []);
    const keys = Object.keys(found).filter((key) => key !== "sopTitle");
    if (keys.length >= 2) {
      values = { ...found, ...values };
      skip.add(b);
    }
  }
  return { values, skip };
}

function buildSections(
  index: BodyIndex,
  from: number,
  to: number,
  forced: Map<number, string>,
  writer: BlockWriter,
  skip: Set<number>
): ParsedSopSection[] {
  const headings = findSectionHeadings(index, from, to, forced).filter((heading) => !skip.has(heading.block));
  const sections: ParsedSopSection[] = [];
  const firstHeading = headings.length ? headings[0].block : to;
  const lead = blocksToRichText(index, from, firstHeading, writer, skip);
  if (lead.length) sections.push({ label: "Overview", blocks: lead });

  // Inside an explicit "Procedure" section, headings that are not pure section labels are its sub-steps.
  let procedure: ParsedSopSection | undefined;
  headings.forEach((heading, i) => {
    const end = i + 1 < headings.length ? headings[i + 1].block : to;
    const blocks = blocksToRichText(index, heading.block + 1, end, writer, skip);
    const block = index.blocks[heading.block];
    // A heading table may hold the body too (Gautam: "Purpose" cell + text cell).
    if (block.type === "table" && block.rows.length > 1) blocks.unshift(...blocksToRichText(index, heading.block, heading.block + 1, writer));
    const label = cleanLabel(heading.label) || heading.label;
    if (procedure && !strictSectionKind(heading.label)) {
      procedure.blocks.push({ id: writer.id(), type: "paragraph", text: heading.label.trim() }, ...blocks);
      return;
    }
    const section: ParsedSopSection = { label, kind: classifySectionLabel(heading.label), blocks };
    procedure = section.kind === "procedure" ? section : undefined;
    sections.push(section);
  });

  // Unlabelled sections between the opening (Purpose/Scope) and the closing sections are procedure steps.
  let seenHead = false;
  let seenTail = false;
  for (const section of sections) {
    if (section.kind && HEAD_KINDS.has(section.kind)) seenHead = true;
    else if (section.kind && TAIL_KINDS.has(section.kind)) seenTail = true;
    else if (!section.kind && seenHead && !seenTail && section.label !== "Overview") {
      section.kind = "procedure";
      section.inferred = true;
    }
  }
  return sections.filter((section) => section.blocks.length > 0 || section.kind);
}

function buildManualSections(
  index: BodyIndex,
  from: number,
  to: number,
  forced: Map<number, string>,
  writer: BlockWriter,
  skipBlocks: Set<number>
): ParsedManualSection[] {
  if (from >= to) return [];
  const headings = findSectionHeadings(index, from, to, forced).filter((heading) => !skipBlocks.has(heading.block));
  const sections: ParsedManualSection[] = [];
  const firstHeading = headings.length ? headings[0].block : to;
  const lead = blocksToRichText(index, from, firstHeading, writer, skipBlocks).filter((block) => !/^(table of )?contents$|^index$/i.test(block.text.trim()));
  if (lead.length) sections.push({ label: "Preamble", blocks: lead });
  headings.forEach((heading, i) => {
    const end = i + 1 < headings.length ? headings[i + 1].block : to;
    const label = cleanLabel(heading.label) || heading.label;
    sections.push({ label, kind: frontMatterKind(label), blocks: blocksToRichText(index, heading.block + 1, end, writer, skipBlocks) });
  });
  return sections;
}

function frontMatterKind(label: string): string | undefined {
  const text = label.toLowerCase();
  if (/revision history/.test(text)) return "revision-history";
  if (/approv|sign/.test(text)) return "approval";
  if (/review/.test(text)) return "review-mechanism";
  if (/benefit/.test(text)) return "benefits";
  if (/core values|guiding principles|esg at/.test(text)) return "core-values";
  if (/how to use/.test(text)) return "how-to-use";
  if (/objective|purpose/.test(text)) return "objective";
  if (/scope|applicab|coverage|who it applies|sites/.test(text)) return "scope";
  if (/definition|abbreviation|glossary|terminology/.test(text)) return "glossary";
  if (/introduction|overview|about/.test(text)) return "introduction";
  if (/document control/.test(text)) return "document-control";
  return undefined;
}

function sopRangesFromHeaders(index: BodyIndex): SopRange[] {
  const { model } = index;
  if (model.sections.length < 3) return [];
  const titles = model.sections.map(headerTitle);
  const ranges: SopRange[] = [];
  let previous: string | undefined;
  index.blocks.forEach((block, b) => {
    const title = titles[block.section];
    if (title && title !== previous) {
      const docNo = sectionKeyValues(model.sections[block.section]).docNo;
      ranges.push({ title, start: b, contentStart: b, source: "header", code: docNo });
    }
    previous = title;
  });
  return ranges;
}

function sopRangesFromHeadings(index: BodyIndex): SopRange[] {
  const paragraphs = index.blocks.filter((block): block is DocParagraph => block.type === "paragraph" && !block.isToc && block.outlineLevel !== undefined && Boolean(block.text));
  if (paragraphs.length === 0) return [];
  const top = Math.min(...paragraphs.map((p) => p.outlineLevel!));
  return paragraphs
    .filter((p) => p.outlineLevel === top && !isFrontLabel(p.text) && !isClosingLabel(p.text) && !strictSectionKind(p.text) && !isGroupLabel(p.text))
    .map((p) => {
      const block = index.blockOf.get(p.index)!;
      return { title: p.text, start: block, contentStart: block + 1, source: "heading" as const };
    });
}

function findManualTitle(index: BodyIndex, firstStart: number): string {
  const limit = Math.min(index.tocBlocks.size ? Math.min(...index.tocBlocks) : firstStart, firstStart, 80);
  let best: DocParagraph | undefined;
  for (const p of index.model.paragraphs) {
    const block = index.blockOf.get(p.index);
    if (block === undefined || block >= limit) break;
    if (!p.text || p.isToc || p.text.length > 120) continue;
    if (!/\b(sop|sops|standard operating|manual|procedures)\b/i.test(p.text)) continue;
    if (!best || (p.size ?? 0) > (best.size ?? 0)) best = p;
  }
  const coreTitle = index.model.coreTitle && /\b(sop|sops|manual|procedures?)\b/i.test(index.model.coreTitle) ? index.model.coreTitle : undefined;
  return best?.text.replace(/\s+/g, " ").trim() || coreTitle || "SOP Manual";
}

const COMPANY_SUFFIX = /\b(ltd|limited|pvt|private|llp|llc|inc|incorporated|corp|corporation|plc|gmbh|group|co\.)\b\.?/i;

function findCompanyName(model: DocxModel, index: BodyIndex, firstStart: number): string | undefined {
  const lines: string[] = [];
  for (const section of model.sections.slice(0, 3)) lines.push(...section.headerText, ...section.headerTables.flat(2), ...section.footerText);
  const limit = Math.min(firstStart, 120);
  for (const p of model.paragraphs) {
    const block = index.blockOf.get(p.index);
    if (block === undefined || block >= limit) break;
    if (p.text && !p.isToc) lines.push(p.text);
  }
  for (const line of lines) {
    const text = line.replace(/\s+/g, " ").trim();
    if (text.length > 80 || !COMPANY_SUFFIX.test(text)) continue;
    if (controlKeyFor(text.split(":")[0])) continue;
    const match = /([A-Z0-9&][\w&.,'’\- ]*?\b(?:ltd|limited|pvt\.? ltd|private limited|llp|llc|inc|incorporated|corp|corporation|plc|gmbh|group|co\.))\.?/i.exec(text);
    if (match && words(match[1]).length <= 8) return match[1].replace(/^(at|by|of|for)\s+/i, "").trim();
  }
  return undefined;
}
