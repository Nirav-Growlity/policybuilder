import type {
  Company,
  FocusAreaSelectionState,
  ImportedPolicyBlock,
  ImportedPolicyContext,
  ImportedPolicySection,
  Policy,
  PolicyDefinitions,
  PolicySection,
  PolicyType,
  QuantitativeArea,
  QuantitativeTarget,
  Responsibility,
  RevisionEntry,
  RichTextBlock,
  Site,
  StandardSectionKind,
} from "../types";
import { normalizeQuantitativeTarget, syncQuantitativeAreas, REPORTING_FREQUENCY, TARGET_PERIOD } from "../quantitative";
import { sectionId, STANDARD_SECTIONS } from "../sections";
import { leadingSectionKind, normalizeHeading, stripHeadingNumber, strictSectionKind } from "./heading-kinds";
import { applyClassification, type ImportClassification } from "./import-classification";
import { sdgNumbersFromText, validSdgNumbers } from "./sdg-numbers";

// Pure mapping from a parsed DOCX (a flat list of headed sections) to the
// fields of a Policy. Nothing here touches the store, the network or Node APIs.

export interface ImportReport {
  /** PolicyCraft sections that received content from the document, in document order. */
  filled: StandardSectionKind[];
  /** Titles of the custom sections created for content PolicyCraft has no field for. */
  custom: string[];
  /** Document parts that were left out on purpose (acknowledgement form, approval block). */
  skipped: string[];
  counts: { focusAreas: number; objectives: number; targets: number; sdgs: number; responsibilities: number; revisions: number };
  /** Set when the document reads like a different policy type than the builder's. */
  mismatch: { detected: PolicyType; expected: PolicyType } | null;
  notes: string[];
  /** Short names of document content that was not loaded, for the confirmation dialog. */
  notLoaded: string[];
  /** True when the document has an SDG section but its goals could not be read. */
  sdgGoalsUnread: boolean;
}

export interface ImportResult {
  patch: Partial<Policy>;
  report: ImportReport;
}

export const IMPORTED_CUSTOM_ID_PREFIX = "custom-imported-";

type Kind = StandardSectionKind | "custom";
type Block = ImportedPolicyBlock;
type TextKind = "preface" | "declaration" | "scope" | "monitoring" | "review";

interface Part { title: string | null; blocks: Block[] }
interface Group {
  kind: Kind;
  title: string;
  strict: boolean;
  skip?: string;
  closed?: boolean;
  parts: Part[];
  /** Alt text of each picture in the section, and SDG goals the server read from them. */
  alts: string[];
  goals: number[];
  /** The area an ungrouped objectives or targets section belongs to: the heading it was written under. */
  areaTitle?: string;
}

const TEXT_KINDS: readonly TextKind[] = ["preface", "declaration", "scope", "monitoring", "review"];
const isTextKind = (kind: Kind): kind is TextKind => (TEXT_KINDS as readonly string[]).includes(kind);
const STANDARD_TITLES = new Map(STANDARD_SECTIONS.map((section) => [section.kind, section.title]));
const STANDARD_ORDER = STANDARD_SECTIONS.map((section) => section.kind);

// ---------------------------------------------------------------- text helpers

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const wordCount = (value: string) => clean(value).split(" ").filter(Boolean).length;
/** Leading list numbering ("6.1", "2)", "(3)", "-") but never a quantity such as "30 days". */
const stripLeadingNumber = (value: string) => clean(value).replace(/^(?:\(\d{1,2}\)|\d{1,2}[.)]|\d{1,2}(?:\.\d+)+[.)]?|[•\-–*])\s+/, "");
const cleanTitle = (value: string) => stripHeadingNumber(clean(value)).replace(/[\s:–-]+$/, "").trim();
const endsLikeSentence = (value: string) => /[.;!?]$/.test(clean(value));

function isShortLabel(value: string, maxWords = 12, maxChars = 90) {
  const text = clean(value);
  return text.length > 0 && text.length <= maxChars && wordCount(text) <= maxWords && !endsLikeSentence(text);
}

const APPROVAL_PARAGRAPH = /^(?:prepared|reviewed|approved|authori[sz]ed|issued|verified)\s+by\b/i;
const METADATA_LABEL = /^(?:document\s*(?:no|number|id)|doc\.?\s*(?:no|number)|policy\s*(?:no|number|owner|id)|effective\s*date|issue\s*date|date\s*of\s*issue|(?:last|next)\s*review(?:\s*date)?|review\s*date|approved\s*by|prepared\s*by|reviewed\s*by|authori[sz]ed\s*by|issued\s*by|designation|name|signature|employee\s*(?:name|id)|department|version|revision(?:\s*no\.?)?|date)\s*:?$/i;
const TOC_LABEL = /^(?:table of contents|contents?|index|list of contents)\s*:?$/i;
const REVISION_LABEL = /^revision history\s*:?$/i;

function isMetadataTable(rows: string[][]) {
  if (!rows.length) return false;
  const labelled = rows.filter((row) => METADATA_LABEL.test(clean(row[0] || ""))).length;
  return labelled / rows.length >= 0.6;
}

function isSiteTable(rows: string[][]) {
  const header = (rows[0] || []).map((cell) => cell.toLowerCase()).join(" ");
  return /\b(?:address|site|sites|location|locations)\b/.test(header) && !/\b(?:target|objective|role|responsib)/.test(header);
}

/** The company's sites, read from a table with a location and an address column. Empty when the table is not one. */
export function sitesFromTable(sourceRows: string[][], idPrefix = "imported-site"): Site[] {
  if (sourceRows.length < 2 || !isSiteTable(sourceRows)) return [];
  const header = sourceRows[0].map((cell) => clean(cell).toLowerCase());
  const addressColumn = header.findIndex((cell) => /address/.test(cell));
  if (addressColumn < 0) return [];
  // The company name is often one merged cell down the table, so the rows below it come one cell short.
  const entityColumn = header.findIndex((cell, index) => index !== addressColumn && !/^(?:sr|s\.?\s*no|no)\b/.test(cell) && (cell === "" || /company|entity|organi[sz]ation|name/.test(cell)));
  const rows = entityColumn >= 0 && sourceRows.some((row) => row.length === header.length - 1) ? fillMergedCell(sourceRows, entityColumn) : sourceRows;
  const used = new Set([addressColumn]);
  const pick = (pattern: RegExp) => {
    const index = header.findIndex((cell, position) => !used.has(position) && pattern.test(cell));
    if (index >= 0) used.add(index);
    return index;
  };
  const locationColumn = pick(/location|site|unit|plant|facility/);
  const nameColumn = locationColumn < 0 ? pick(/company|name|entity/) : -1;
  const functionColumn = pick(/function|activity|operation|nature|use/);
  const labelColumn = locationColumn >= 0 ? locationColumn : nameColumn;
  const sites: Site[] = [];
  for (const row of rows.slice(1)) {
    const address = clean(row[addressColumn] || "");
    const location = labelColumn >= 0 ? clean(row[labelColumn] || "") : "";
    if (!address && !location) continue;
    const primaryFunction = functionColumn >= 0 ? clean(row[functionColumn] || "") : "";
    sites.push({ id: `${idPrefix}-${sites.length + 1}`, location, address, ...(primaryFunction ? { primaryFunction } : {}) });
  }
  return sites;
}

const isLoadableSiteTable = (rows: string[][]) => sitesFromTable(rows).length > 0;

// ---------------------------------------------------------------- document metadata

export interface DocumentMetadata {
  documentNo?: string;
  revisionNo?: string;
  effectiveDate?: string;
  lastReviewDate?: string;
  nextReviewDate?: string;
  approvedBy?: string;
}

const METADATA_LABELS: [keyof DocumentMetadata, string][] = [
  ["lastReviewDate", String.raw`last\s*review(?:ed)?(?:\s*date)?`],
  ["nextReviewDate", String.raw`next\s*review(?:\s*date)?|review\s*date`],
  ["effectiveDate", String.raw`effective\s*date|date\s*of\s*issue|issue\s*date`],
  ["documentNo", String.raw`(?:document|doc\.?|policy)\s*(?:no|number|id)\b\.?`],
  ["revisionNo", String.raw`(?:rev(?:ision)?\b\.?|version)(?:\s*(?:no|number)\b\.?)?`],
  ["approvedBy", String.raw`approved\s*by`],
];
const METADATA_LABEL_RE = new RegExp(`(${METADATA_LABELS.map(([, pattern]) => `(?:${pattern})`).join("|")})\\s*[:\\-–]?\\s*`, "gi");
const NEEDS_DIGIT: (keyof DocumentMetadata)[] = ["documentNo", "revisionNo", "effectiveDate", "lastReviewDate", "nextReviewDate"];

function metadataFieldOf(label: string): keyof DocumentMetadata | null {
  const text = clean(label).replace(/[:\s]+$/, "");
  for (const [field, pattern] of METADATA_LABELS) if (new RegExp(`^(?:${pattern})$`, "i").test(text)) return field;
  return null;
}

function setMetadata(meta: DocumentMetadata, field: keyof DocumentMetadata, raw: string) {
  const value = clean(raw).replace(/^[:\-–\s]+/, "").replace(/[_\s]+$/, "").trim();
  if (!value || /^_+$/.test(value)) return false;
  if (NEEDS_DIGIT.includes(field) && (!/\d/.test(value) || value.length > 30 || endsLikeSentence(value))) return false;
  if (field === "approvedBy" && (value.length > 60 || endsLikeSentence(value))) return false;
  // The first value read wins; a repeat of the same detail (a running header) is still metadata.
  meta[field] ??= value;
  return true;
}

/** "LAST REVIEW DATE: 01.05.2026 NEXT REVIEW DATE: 01.05.2027" or "REV. No. 03": a line that is only labels and values. */
function readMetadataLine(text: string, meta: DocumentMetadata): boolean {
  const line = clean(text);
  if (!line || line.length > 140) return false;
  const matches = [...line.matchAll(METADATA_LABEL_RE)];
  if (!matches.length || matches[0].index !== 0) return false;
  let found = false;
  matches.forEach((match, index) => {
    const field = metadataFieldOf(match[1]);
    if (!field) return;
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? line.length : line.length;
    if (setMetadata(meta, field, line.slice(start, end))) found = true;
  });
  return found;
}

function readMetadataTable(rows: string[][], meta: DocumentMetadata) {
  for (const row of rows) {
    const cells = row.map(clean).filter(Boolean);
    const field = cells.length >= 2 ? metadataFieldOf(cells[0]) : null;
    if (field) setMetadata(meta, field, cells.slice(1).join(" "));
  }
}

/** A date as the builder stores it (YYYY-MM-DD). Day-first for 01.05.2026 and 01/05/2026, as Indian documents write them. */
export function isoDateFrom(value: string): string | null {
  const text = clean(value);
  const valid = (year: number, month: number, day: number) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      : null;
  };
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dayFirst = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})$/.exec(text);
  if (dayFirst) return valid(dayFirst[3].length === 2 ? 2000 + Number(dayFirst[3]) : Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
  return null;
}

/** The company fields a document's control details fill; absent details leave the organization's own values. */
function companyFromMetadata(company: Company, meta: DocumentMetadata, sites: Site[]): Company | null {
  const next: Company = { ...company };
  let changed = false;
  const set = <K extends "docNum" | "revNum" | "approver">(key: K, value: string | undefined) => {
    if (value && next[key] !== value) { next[key] = value; changed = true; }
  };
  set("docNum", meta.documentNo);
  set("revNum", meta.revisionNo?.replace(/^(?:rev(?:ision)?\.?|version|v)\s*/i, ""));
  set("approver", meta.approvedBy);
  const dates: ["effectiveDate" | "lastReviewDate" | "reviewDate", string | undefined][] = [
    ["effectiveDate", meta.effectiveDate], ["lastReviewDate", meta.lastReviewDate], ["reviewDate", meta.nextReviewDate],
  ];
  for (const [key, value] of dates) {
    const iso = value ? isoDateFrom(value) : null;
    if (iso && next[key] !== iso) { next[key] = iso; changed = true; }
  }
  if (sites.length) { next.sites = sites; changed = true; }
  return changed ? next : null;
}

function tableLines(rows: string[][]): string[] {
  return rows.map((row) => row.map(clean).filter(Boolean)).filter((row) => row.length).map((row) => (row.length === 2 ? `${row[0].replace(/:$/, "")}: ${row[1].replace(/^:\s*/, "")}` : row.join(" | ")));
}

function listLines(block: Extract<Block, { type: "list" }>): string[] {
  return block.items.map((item, index) => (block.ordered ? `${index + 1}. ${clean(item)}` : `- ${clean(item)}`));
}

function blocksToText(blocks: Block[], dropSites = false): string {
  const paragraphs: string[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") paragraphs.push(clean(block.text));
    else if (block.type === "list") paragraphs.push(listLines(block).join("\n"));
    else {
      // A sites table fills the company's site list, which the scope prints itself.
      if (dropSites && isLoadableSiteTable(block.rows)) continue;
      paragraphs.push(tableLines(block.rows).join("\n"));
    }
  }
  return paragraphs.filter(Boolean).join("\n\n");
}

function groupText(group: Group): string {
  return group.parts
    .map((part) => [part.title ? clean(part.title) : "", blocksToText(part.blocks, group.kind === "scope")].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");
}

const groupHasContent = (group: Group) => group.parts.some((part) => part.blocks.length > 0);

// ---------------------------------------------------------------- area naming

const AREA_STOP_WORDS = new Set(["and", "the", "of", "for", "to", "in", "management"]);

function areaTokens(value: string): string[] {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter((word) => word && !AREA_STOP_WORDS.has(word))
    .map((word) => (word.length > 3 ? word.replace(/s$/, "") : word));
}

function sameAreaStrict(a: string, b: string) {
  const left = areaTokens(a);
  const right = areaTokens(b);
  return left.length > 0 && left.length === right.length && left.every((token) => right.includes(token));
}

function sameAreaLoose(a: string, b: string) {
  const left = areaTokens(a);
  const right = areaTokens(b);
  if (!left.length || !right.length) return false;
  const [small, large] = left.length <= right.length ? [left, right] : [right, left];
  return small.every((token) => large.includes(token));
}

/** The existing focus-area label an imported name refers to, adding it when it is new. */
function canonicalArea(name: string, areas: string[]): string {
  const label = clean(name);
  const strict = areas.find((area) => sameAreaStrict(area, label));
  if (strict) return strict;
  const loose = areas.filter((area) => sameAreaLoose(area, label));
  if (loose.length === 1) return loose[0];
  areas.push(label);
  return label;
}

/** "Water – Conserve water" → "Water". Returns null when the text is a sentence, not a name. */
function areaNameFromItem(item: string): string | null {
  const text = stripLeadingNumber(item);
  if (!text) return null;
  const separator = text.search(/\s+[–—-]\s+|\s*:\s+/);
  if (separator > 0) {
    const left = text.slice(0, separator).trim();
    if (left && left.length <= 90 && wordCount(left) <= 12) return left;
    return null;
  }
  return isShortLabel(text) ? text : null;
}

/** The imported area a list item starts with, when the document runs a name and its text together. */
function leadingKnownArea(item: string, known: string[]): { area: string; rest: string } | null {
  const words = stripLeadingNumber(item).split(" ");
  for (let count = 1; count <= Math.min(10, words.length - 3); count++) {
    const head = words.slice(0, count).join(" ").replace(/[:,–—-]+$/, "");
    const area = known.find((candidate) => sameAreaStrict(candidate, head));
    if (area) {
      const rest = words.slice(count).join(" ").replace(/^[:–—-]+\s*/, "").trim();
      if (rest.length >= 15) return { area, rest };
    }
  }
  return null;
}

// ---------------------------------------------------------------- tables

function columnIndex(header: string[], pattern: RegExp, exclude?: RegExp): number {
  return header.findIndex((cell) => pattern.test(cell) && !(exclude && exclude.test(cell)));
}

const isNumberCell = (value: string) => /^\d{1,3}[.)]?$/.test(clean(value));

function revisionEntriesFromTable(rows: string[][]): RevisionEntry[] | null {
  if (rows.length < 2) return null;
  const header = rows[0].map((cell) => clean(cell).toLowerCase());
  // Each column takes one role. Dates are claimed first so "Date of Change" is
  // the date, not the description, and "Revision Date" is not the number.
  const taken = new Set<number>();
  const claim = (pattern: RegExp, reject?: RegExp) => {
    const index = header.findIndex((cell, position) => !taken.has(position) && pattern.test(cell) && !(reject && reject.test(cell)));
    if (index >= 0) taken.add(index);
    return index;
  };
  const descriptionWords = /reason|description|change|amend|remark|nature|summary|detail/;
  const dateColumn = claim(/\bdate\b/);
  const noColumn = claim(/\b(?:revision|version|rev\.?)\b/, new RegExp(`\\bdate\\b|${descriptionWords.source}`));
  const descriptionColumn = claim(descriptionWords, /\bdate\b/);
  if (noColumn < 0 || dateColumn < 0 || descriptionColumn < 0) return null;
  const entries = rows.slice(1)
    .filter((row) => row.some((cell) => clean(cell)))
    .map((row, index): RevisionEntry => ({
      revisionNo: clean(row[noColumn] || "") || String(index),
      date: clean(row[dateColumn] || ""),
      description: clean(row[descriptionColumn] || ""),
      source: "custom",
    }));
  return entries.length ? entries : null;
}

// ---------------------------------------------------------------- groups

/** What the cleaning pass learns while it reads the document. */
interface ReadContext {
  revisionTables: Set<Block>;
  meta: DocumentMetadata;
  skipped: string[];
}

const ACK_REASON = "Employee acknowledgement form";
const FORM_REASON = "Word form markers (Top of Form / Bottom of Form)";
const SIGNATURE_REASON = "Signature table";
const FORM_MARKER = /^(?:top|bottom) of form\.?$/i;
const ACK_SENTENCE = /^i\s*,?\s*(?:the undersigned,?\s*)?(?:hereby\s+)?acknowledge\b/i;
const isAckHeading = (text: string) => /\backnowl/i.test(text) && wordCount(text) <= 8 && !endsLikeSentence(text);
const hasSignatureBlank = (rows: string[][]) => rows.some((row) => row.some((cell) => /_{3,}/.test(cell)));

function noteSkipped(context: ReadContext, reason: string) {
  if (!context.skipped.includes(reason)) context.skipped.push(reason);
}

/** The person named after "Approved By:", on the same line or the next short one. */
function approverAfter(text: string, next: Block | undefined): string {
  const same = text.includes(":") ? clean(text.slice(text.indexOf(":") + 1)) : "";
  const candidate = same || (next?.type === "paragraph" ? clean(next.text) : "");
  if (!candidate || wordCount(candidate) > 6 || endsLikeSentence(candidate)) return "";
  if (/acknowl|^(?:employee|signature|date|designation|name)\b/i.test(candidate) || METADATA_LABEL.test(candidate) || APPROVAL_PARAGRAPH.test(candidate)) return "";
  return candidate;
}

function cleanBlocks(blocks: Block[], context: ReadContext): { blocks: Block[]; closed: boolean } {
  const kept: Block[] = [];
  let closed = false;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (closed) break;
    if (block.type === "paragraph") {
      const text = clean(block.text);
      if (!text || TOC_LABEL.test(text) || REVISION_LABEL.test(text)) continue;
      if (FORM_MARKER.test(text)) { noteSkipped(context, FORM_REASON); continue; }
      // From the acknowledgement form on, the rest of the section is the form.
      if (isAckHeading(text) || ACK_SENTENCE.test(text)) { closed = true; noteSkipped(context, ACK_REASON); continue; }
      if (APPROVAL_PARAGRAPH.test(text)) {
        closed = true;
        if (/^(?:approved|authori[sz]ed)/i.test(text)) setMetadata(context.meta, "approvedBy", approverAfter(text, blocks[index + 1]));
        continue;
      }
      if (readMetadataLine(text, context.meta)) continue;
      kept.push({ type: "paragraph", text });
    } else if (block.type === "list") {
      const items = block.items.map(clean).filter((item) => item && !FORM_MARKER.test(item));
      if (items.length < block.items.map(clean).filter(Boolean).length) noteSkipped(context, FORM_REASON);
      if (items.length) kept.push({ type: "list", ordered: block.ordered, items });
    } else {
      if (context.revisionTables.has(block)) continue;
      if (isMetadataTable(block.rows)) { readMetadataTable(block.rows, context.meta); continue; }
      if (hasSignatureBlank(block.rows)) { noteSkipped(context, SIGNATURE_REASON); continue; }
      kept.push(block);
    }
  }
  return { blocks: kept, closed };
}

function looksLikeDocumentTitle(section: ImportedPolicySection, reference: ImportedPolicyContext) {
  return normalizeHeading(section.title) === normalizeHeading(reference.title) || /\b(?:policy|charter|manual|roadmap|standard|statement)\b/i.test(section.title);
}

function skipReason(title: string): string | undefined {
  if (/\backnowl/i.test(title)) return ACK_REASON;
  if (/^(?:approval|authori[sz]ation|signatures?|distribution)\b/i.test(cleanTitle(title))) return "Approval block";
  return undefined;
}

function buildGroups(reference: ImportedPolicyContext, context: ReadContext): { groups: Group[]; intro: Block[] } {
  const groups: Group[] = [];
  const intro: Block[] = [];
  const stack: { level: number; group: Group | null }[] = [];
  let firstContentSection = true;
  let lastNamed: string | null = null;

  for (const section of reference.sections) {
    if (section.id.startsWith("imported-introduction") || normalizeHeading(section.title) === "document introduction") {
      intro.push(...cleanBlocks(section.blocks, context).blocks);
      // It still ends the sections above it at its level; otherwise the next sections would
      // nest under whatever came before it (after AI placement that is "Scope").
      while (stack.length && stack[stack.length - 1].level >= section.level) stack.pop();
      continue;
    }
    // "REV. No. 03" or "LAST REVIEW DATE: 01.05.2026 NEXT REVIEW DATE: 01.05.2027" set as a heading are document control details.
    if (readMetadataLine(section.title, context.meta)) {
      cleanBlocks(section.blocks, context);
      continue;
    }
    // A leftover table-of-contents row: empty, and its title ends in a page number.
    if (!section.blocks.length && /\s\d{1,3}$/.test(clean(section.title))) continue;

    const title = cleanTitle(section.title);
    const cleaned = cleanBlocks(section.blocks, context);
    // The parser already decided the title. A heading equal to it is the title page,
    // whatever section word it contains ("Governance Policy"); otherwise fall back to the wording.
    const isRoot = firstContentSection && section.level === 1 && (normalizeHeading(section.title) === normalizeHeading(reference.title) || (section.kind === "custom" && looksLikeDocumentTitle(section, reference)));
    firstContentSection = false;
    while (stack.length && stack[stack.length - 1].level >= section.level) stack.pop();

    if (isRoot) {
      // The document title: its own text is the title page, and its subsections stand alone.
      intro.push(...cleaned.blocks);
      stack.push({ level: section.level, group: null });
      continue;
    }

    const parent = stack.length ? stack[stack.length - 1].group : null;
    // An SDG section is never folded into the section above it: its goals (often read from pictures) would be lost.
    const own = strictSectionKind(title) ?? leadingSectionKind(title) ?? (section.kind === "sdg" ? "sdg" : null);
    const skip = skipReason(section.title);
    // The heading an ungrouped objectives or targets section most likely belongs to: the last one that names no section.
    const areaBefore = lastNamed;
    if (!skip) {
      if (own === null) lastNamed = title;
      else if (own !== "qualitative" && own !== "quantitative") lastNamed = null;
    }

    if (parent && !skip && !(own && own !== parent.kind)) {
      if (!parent.closed && !parent.skip) {
        parent.parts.push({ title, blocks: cleaned.blocks });
        parent.alts.push(...(section.imageAlts ?? []));
        parent.goals.push(...(section.sdgGoals ?? []));
      }
      if (cleaned.closed) parent.closed = true;
      stack.push({ level: section.level, group: parent });
      continue;
    }

    const group: Group = {
      kind: parent ? (own ?? "custom") : section.kind,
      title,
      strict: Boolean(own),
      skip,
      closed: cleaned.closed,
      parts: [{ title: null, blocks: cleaned.blocks }],
      alts: [...(section.imageAlts ?? [])],
      goals: [...(section.sdgGoals ?? [])],
      // "4.6 Child Labor" with "Qualitative Objectives" and "Quantitative Targets" beneath it: the heading is the area.
      areaTitle: own === "qualitative" || own === "quantitative"
        ? areaBefore ?? (parent && !NOT_AN_AREA.has(parent.kind) ? parent.areaTitle ?? parent.title : undefined)
        : undefined,
    };
    groups.push(group);
    stack.push({ level: section.level, group });
  }
  return { groups, intro };
}

const SPLITTABLE: Kind[] = ["preface", "declaration", "scope", "focus", "qualitative", "quantitative", "custom"];
/** Sections whose heading is never the name of an area. */
const NOT_AN_AREA = new Set<Kind>(["preface", "declaration", "scope", "definitions", "sdg", "monitoring", "review", "revision", "focus", "qualitative", "quantitative"]);
const INLINE_KINDS = new Set<StandardSectionKind>(["preface", "scope", "definitions", "focus", "qualitative", "quantitative", "monitoring", "review", "sdg", "responsibilities", "declaration"]);
/** Inside an area list or objectives, only the next numbered part of the policy can start a new section. */
const AREA_GROUP_INLINE = new Set<Kind>(["qualitative", "quantitative"]);

/** Headings that are safe to recognise when a document runs them into the first words of a paragraph. */
const GLUED_HEADINGS = new Set([
  "preface", "preamble", "introduction", "scope", "applicability", "policy declaration", "policy statement", "statement of policy",
  "definitions", "objectives", "qualitative objectives", "quantitative targets", "targets", "key focus areas", "key action areas",
  "focus areas", "review mechanism", "monitoring and reporting",
]);
const GENERIC_AFTER_HEADING = /^(?:policy|policies|framework|standard|procedure|of|and|for|to|in)\b/i;

/** "Preface Cherry Hill upholds…" → the Preface heading and the rest of the paragraph. */
function gluedHeading(text: string): { kind: StandardSectionKind; title: string; rest: string } | null {
  const words = clean(text).split(" ");
  for (let count = Math.min(3, words.length - 4); count >= 1; count--) {
    const head = words.slice(0, count).join(" ").replace(/[:–—-]+$/, "");
    const rest = words.slice(count).join(" ").replace(/^[:–—-]+\s*/, "");
    if (!/^[A-Z]/.test(head) || !/^[A-Z]/.test(rest) || GENERIC_AFTER_HEADING.test(rest)) continue;
    if (!GLUED_HEADINGS.has(normalizeHeading(head))) continue;
    const kind = strictSectionKind(head);
    if (kind) return { kind, title: head, rest };
  }
  return null;
}

function inlineHeading(block: Block, groupKind: Kind): { kind: StandardSectionKind; title: string; rest?: string } | null {
  const text = block.type === "paragraph" ? block.text : block.type === "list" && block.items.length === 1 ? block.items[0] : null;
  if (!text) return null;
  const label = clean(text);
  const allowed = (kind: StandardSectionKind) => INLINE_KINDS.has(kind) && (groupKind === "focus" || groupKind === "qualitative" || groupKind === "quantitative" ? AREA_GROUP_INLINE.has(kind) : true);
  if (label.length <= 60 && !/[.!?;]$/.test(label)) {
    const kind = strictSectionKind(label.replace(/:$/, ""));
    if (kind && allowed(kind)) return { kind, title: label.replace(/:$/, "") };
  }
  if (block.type === "paragraph") {
    const glued = gluedHeading(label);
    if (glued && allowed(glued.kind)) return glued;
  }
  return null;
}

/** Narrative sections sometimes carry a later section as a bold line ("Scope:") inside their text. */
function splitInlineHeadings(group: Group): Group[] {
  if (group.skip) return [group];
  // Any other section can still hold "Qualitative Objectives:" / "Quantitative Targets:" lines for the area it is named after.
  const areasOnly = !SPLITTABLE.includes(group.kind);
  if (areasOnly && (NOT_AN_AREA.has(group.kind))) return [group];
  for (let partIndex = 0; partIndex < group.parts.length; partIndex++) {
    const part = group.parts[partIndex];
    for (let blockIndex = 0; blockIndex < part.blocks.length; blockIndex++) {
      const found = inlineHeading(part.blocks[blockIndex], areasOnly ? "qualitative" : group.kind);
      // The same kind again is a new area's objectives or targets when it sits in a later titled subsection.
      if (!found || (found.kind === group.kind && !(AREA_GROUP_INLINE.has(found.kind) && partIndex > 0 && part.title))) continue;
      if (areasOnly && found.kind !== "qualitative" && found.kind !== "quantitative") continue;
      const head: Group = {
        ...group,
        parts: [...group.parts.slice(0, partIndex), { title: part.title, blocks: part.blocks.slice(0, blockIndex) }],
      };
      const tail: Group = {
        kind: found.kind,
        title: found.title,
        strict: true,
        closed: group.closed,
        alts: [],
        goals: [],
        areaTitle: found.kind === "qualitative" || found.kind === "quantitative"
          ? part.title ?? (NOT_AN_AREA.has(group.kind) ? group.areaTitle : group.areaTitle ?? group.title)
          : group.areaTitle,
        parts: [
          { title: null, blocks: [...(found.rest ? [{ type: "paragraph" as const, text: found.rest }] : []), ...part.blocks.slice(blockIndex + 1)] },
          ...group.parts.slice(partIndex + 1),
        ],
      };
      return [...(groupHasContent(head) ? [head] : []), ...splitInlineHeadings(tail)];
    }
  }
  return [group];
}

// ---------------------------------------------------------------- focus, objectives, targets

interface Segment { area: string; blocks: Block[] }

const LEAD_IN_SENTENCE = /\b(?:are|is|include|includes|following|as follows|will|shall|aims?)\b|^(?:our|we|these|those)\b.*\b(?:objectives?|targets?|commitments?|goals?|actions?)\b/i;

/** A short line that names an area when it sits directly above that area's items. */
function markerText(block: Block, next: Block | undefined): string | null {
  if (block.type === "list" && block.items.length === 1 && next) {
    const text = stripLeadingNumber(block.items[0]);
    return isShortLabel(text) ? text.replace(/:$/, "") : null;
  }
  if (block.type === "paragraph") {
    const text = stripLeadingNumber(block.text);
    // "Targets by 2030:" introduces what belongs to an area; it does not name one.
    if (/^(?:(?:qualitative|quantitative)\s+)?(?:targets?|commitments?|objectives?|actions?|measures?|kpis?|initiatives?|examples?|including|such as|the following)\b/i.test(text)) return null;
    // "Our objectives are:" is a sentence that introduces a list, not the name of an area.
    if (/:$/.test(text) && LEAD_IN_SENTENCE.test(text)) return null;
    if (/:$/.test(text) && isShortLabel(text.slice(0, -1))) return text.slice(0, -1).trim();
    if (next?.type === "list" && isShortLabel(text)) return text;
  }
  return null;
}

/**
 * A merged (row-spanning) first cell appears only on the first row it covers,
 * so the following rows arrive one cell short. Put the area back in those rows.
 */
function fillMergedCell(rows: string[][], column: number): string[][] {
  const width = rows[0].length;
  let last = "";
  return rows.map((row, index) => {
    if (index === 0) return row;
    if (row.length === width - 1 && last) return [...row.slice(0, column), last, ...row.slice(column)];
    last = clean(row[column] || "") || last;
    return row;
  });
}

function tableAreaRows(sourceRows: string[][]): { area: string; text: string; row: string[]; header: string[] }[] | null {
  if (sourceRows.length < 2) return null;
  const header = sourceRows[0].map((cell) => clean(cell).toLowerCase());
  const areaColumn = columnIndex(header, /\b(?:focus|area|topic|theme|pillar|category)\b/);
  if (areaColumn < 0) return null;
  const rows = fillMergedCell(sourceRows, areaColumn);
  const textColumn = header.findIndex((cell, index) => index !== areaColumn && /objective|target|kpi|metric|commitment|goal|action|description|requirement/.test(cell));
  const fallbackColumn = header.findIndex((_, index) => index !== areaColumn && !isNumberCell(rows[1][index] || "") && !/^(?:sr|s\.?\s*no|no)\b/.test(header[index]));
  const column = textColumn >= 0 ? textColumn : fallbackColumn;
  if (column < 0) return null;
  return rows.slice(1)
    .map((row) => ({ area: clean(row[areaColumn] || ""), text: clean(row[column] || ""), row, header }))
    .filter((entry) => entry.area && entry.text);
}

/** Splits a group into per-area blocks using subsections, one-line markers and lists that start with a known area. */
function areaSegments(group: Group, known: string[]): { segments: Segment[]; intro: Block[] } {
  const segments: Segment[] = [];
  const intro: Block[] = [];
  let current: Segment | null = null;
  const open = (area: string) => {
    const label = clean(area);
    current = segments.find((segment) => sameAreaStrict(segment.area, label)) ?? { area: label, blocks: [] };
    if (!segments.includes(current)) segments.push(current);
    return current;
  };

  for (const part of group.parts) {
    if (part.title) open(part.title);
    part.blocks.forEach((block, index) => {
      const marker = markerText(block, part.blocks[index + 1]);
      if (marker) { open(marker); return; }
      if (block.type === "table") {
        const byArea = tableAreaRows(block.rows);
        if (byArea) {
          for (const entry of byArea) open(entry.area).blocks.push({ type: "table", rows: [entry.header, entry.row] });
          return;
        }
      }
      if (block.type === "list" && known.length && block.items.some((item) => leadingKnownArea(item, known))) {
        for (const item of block.items) {
          const lead = leadingKnownArea(item, known);
          if (lead) open(lead.area).blocks.push({ type: "list", ordered: block.ordered, items: [lead.rest] });
          else if (current) current.blocks.push({ type: "list", ordered: block.ordered, items: [item] });
        }
        return;
      }
      if (current) (current as Segment).blocks.push(block);
      else intro.push(block);
    });
  }
  return { segments, intro };
}

function segmentTexts(segment: Segment): string[] {
  const texts: string[] = [];
  for (const block of segment.blocks) {
    if (block.type === "list") texts.push(...block.items.map(stripLeadingNumber));
    // A line that ends in a colon introduces the items below it ("Qualitative Objectives:"); it is not one of them.
    else if (block.type === "paragraph") { if (!(/:$/.test(clean(block.text)) && wordCount(block.text) <= 12)) texts.push(stripLeadingNumber(block.text)); }
    else {
      const header = block.rows[0].map((cell) => clean(cell).toLowerCase());
      const column = header.findIndex((cell) => /objective|target|kpi|metric|commitment|goal|action|description|requirement/.test(cell));
      const body = column >= 0 ? block.rows.slice(1) : block.rows;
      for (const row of body) texts.push(clean(column >= 0 ? row[column] || "" : row.filter(Boolean).join(" – ")));
    }
  }
  return texts.filter((text) => text.length > 0);
}

/** The one area a document's ungrouped objectives and targets belong to: named after the document, never after the catalog. */
function deriveDocumentArea(reference: ImportedPolicyContext): string {
  const strip = (value: string) => clean(value)
    .replace(/\.docx?$/i, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, " ")
    .replace(/\b(?:policy|policies|final|version|revised|revision|updated|draft|copy|v\d+(?:\.\d+)*|rev\.?\s*\d*)\b/gi, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s–:&-]+$/, "")
    .replace(/^[\s–:&-]+/, "");
  const fromTitle = strip(cleanTitle(reference.title || ""));
  // A first heading such as "About this Policy" is not the document's subject; the file name is.
  const generic = /^(?:about|introduction|preface|overview|purpose|contents?|our|the)\b/i.test(fromTitle);
  if (wordCount(fromTitle) >= 1 && fromTitle.length <= 80 && !generic) return fromTitle;
  const fromFile = strip(stripHeadingNumber(reference.fileName || ""));
  return fromFile || POLICY_TYPE_LABELS[reference.policyType];
}

/** The area whose name an item spells out (every word of it), or null when none or several do. */
function areaNamedIn(text: string, known: string[]): string | null {
  const words = new Set(areaTokens(text));
  let best: string | null = null;
  let bestHits = 0;
  let tie = false;
  for (const area of known) {
    const tokens = areaTokens(area);
    if (!tokens.length) continue;
    const hits = tokens.filter((token) => words.has(token)).length;
    if (hits < tokens.length && !(tokens.length >= 4 && hits >= tokens.length - 1)) continue;
    if (hits > bestHits) { best = area; bestHits = hits; tie = false; } else if (hits === bestHits) tie = true;
  }
  return best && !tie ? best : null;
}

/**
 * Objectives or targets a document lists without grouping them by area. Items
 * that name one of the document's own areas go to it; the rest go under one
 * area named after the document. Lead-in lines ("Targets by 2030:") and the
 * baseline sentence are not items.
 */
function flatSegments(blocks: Block[], known: string[], fallbackArea: string, forTargets: boolean): Segment[] {
  const segments: Segment[] = [];
  const open = (area: string) => {
    let segment = segments.find((candidate) => candidate.area === area);
    if (!segment) { segment = { area, blocks: [] }; segments.push(segment); }
    return segment;
  };
  const place = (text: string, ordered: boolean) => open(areaNamedIn(text, known) ?? fallbackArea).blocks.push({ type: "list", ordered, items: [text] });
  for (const block of blocks) {
    if (block.type === "list") block.items.forEach((item) => place(item, block.ordered));
    else if (block.type === "paragraph") {
      const text = stripLeadingNumber(block.text);
      if (/:$/.test(text)) continue;
      if (forTargets && /baseline|base year/i.test(text) && /\b(?:19|20)\d{2}\b/.test(text)) continue;
      place(text, false);
    } else open(fallbackArea).blocks.push(block);
  }
  return segments;
}

function extractFocusNames(group: Group): string[] {
  const names: string[] = [];
  const add = (name: string | null) => {
    const label = name ? clean(name) : "";
    if (label && !names.some((existing) => sameAreaStrict(existing, label))) names.push(label);
  };
  for (const part of group.parts) {
    if (part.title) add(part.title);
    for (const block of part.blocks) {
      if (block.type === "list") block.items.forEach((item) => add(areaNameFromItem(item)));
      else if (block.type === "table") {
        const rows = block.rows;
        const header = rows[0].map((cell) => clean(cell).toLowerCase());
        const hasHeader = header.some((cell) => /area|topic|theme|pillar|focus|description|objective/.test(cell) || /^(?:sr|s\.?\s*no|no)\b/.test(cell));
        const body = hasHeader ? rows.slice(1) : rows;
        let column = hasHeader ? columnIndex(header, /area|topic|theme|pillar|focus/) : -1;
        if (column < 0) column = (body[0] || []).findIndex((cell) => !isNumberCell(cell));
        if (column >= 0) body.forEach((row) => add(areaNameFromItem(row[column] || "")));
      }
    }
  }
  if (!names.length) {
    for (const part of group.parts) for (const block of part.blocks) if (block.type === "paragraph" && isShortLabel(block.text)) add(stripLeadingNumber(block.text));
  }
  return names;
}

// ---- quantitative targets

const YEAR = String.raw`((?:19|20)\d{2})(?:\s*[-–—/]\s*(\d{2,4}))?`;
const DEADLINE_RE = new RegExp(String.raw`\b(?:by|until|till|before|through|within|in)\s+(?:the\s+)?(?:end\s+of\s+)?(?:FY|CY)?\s*${YEAR}`, "gi");
const BASELINE_RE = new RegExp(String.raw`\b(?:baseline(?:\s+year)?|base\s+year|from|compared\s+(?:to|with)|against|versus|vs\.?)\s*(?:of|is|:)?\s*(?:the\s+)?(?:FY|CY)?\s*${YEAR}`, "i");

function yearLabel(start: string, end: string | undefined, period: "FY" | "CY", role: "baseline" | "deadline" = "deadline"): string {
  const year = Number(start);
  if (period === "CY") return String(year);
  // "FY 2029-30" keeps its own span. A bare baseline "2022" is the fiscal year starting in 2022;
  // a bare deadline "2030" is the fiscal year ending in 2030, so the deadline is never read as later.
  if (end || role === "baseline") return `FY ${year}-${String(year + 1).slice(-2)}`;
  return `FY ${year - 1}-${String(year).slice(-2)}`;
}

function lastMatch(re: RegExp, text: string) {
  let found: RegExpExecArray | null = null;
  re.lastIndex = 0;
  for (let match = re.exec(text); match; match = re.exec(text)) found = match;
  return found;
}

function parseTarget(text: string, period: "FY" | "CY", defaultBaseline: string | undefined, columns?: { baseline?: string; deadline?: string }): QuantitativeTarget {
  const target = stripLeadingNumber(text);
  const fromColumn = (value: string | undefined, role: "baseline" | "deadline") => {
    const match = value ? new RegExp(YEAR).exec(value) : null;
    return match ? yearLabel(match[1], match[2], period, role) : undefined;
  };
  const deadlineMatch = lastMatch(DEADLINE_RE, target);
  const baselineMatch = BASELINE_RE.exec(target);
  const deadline = fromColumn(columns?.deadline, "deadline") ?? (deadlineMatch ? yearLabel(deadlineMatch[1], deadlineMatch[2], period, "deadline") : undefined);
  const baseline = fromColumn(columns?.baseline, "baseline") ?? (baselineMatch ? yearLabel(baselineMatch[1], baselineMatch[2], period, "baseline") : defaultBaseline);
  const annual = !deadline && /\b(?:annual(?:ly)?|every year|each year|yearly|ongoing|continu(?:ous|ally)|maintain)\b/i.test(target);
  return normalizeQuantitativeTarget(
    annual
      ? { target, baseline: "", deadline: "", reportingFrequency: REPORTING_FREQUENCY }
      : { target, baseline: baseline ?? "", deadline: deadline ?? "", reportingFrequency: TARGET_PERIOD },
    period,
  );
}

function defaultBaselineFrom(blocks: Block[], period: "FY" | "CY"): string | undefined {
  for (const block of blocks) {
    if (block.type !== "paragraph") continue;
    // Allow abbreviations such as "Pvt. Ltd." between "baseline" and the year.
    const match = new RegExp(String.raw`baseline(?:\s+year)?[\s\S]{0,160}?(?:FY|CY)?\s*${YEAR}`, "i").exec(block.text);
    if (match) return yearLabel(match[1], match[2], period, "baseline");
    // "The year 2022 has been established as the baseline year": the year comes first.
    const before = new RegExp(String.raw`(?:FY|CY)?\s*${YEAR}[^.]{0,60}?\b(?:baseline|base\s+year)`, "i").exec(block.text);
    if (before) return yearLabel(before[1], before[2], period, "baseline");
  }
  return undefined;
}

function extractQuantitative(group: Group, known: string[], period: "FY" | "CY", fallbackArea: string): QuantitativeArea[] {
  const grouped = areaSegments(group, known);
  const intro = grouped.intro;
  const segments = grouped.segments.length ? grouped.segments : flatSegments(intro, known, fallbackArea, true);
  const defaultBaseline = defaultBaselineFrom(intro, period);
  const areas: QuantitativeArea[] = [];
  for (const segment of segments) {
    const targets: QuantitativeTarget[] = [];
    for (const block of segment.blocks) {
      if (block.type === "table") {
        const header = block.rows[0].map((cell) => clean(cell).toLowerCase());
        const targetColumn = columnIndex(header, /target|objective|kpi|metric|goal|commitment|description/);
        if (targetColumn >= 0) {
          const baselineColumn = columnIndex(header, /baseline|base\s*year/);
          const deadlineColumn = columnIndex(header, /deadline|target\s*year|timeline|by\s*when|achievement|completion|due|year/, /baseline|base/);
          for (const row of block.rows.slice(1)) {
            const text = clean(row[targetColumn] || "");
            if (text) targets.push(parseTarget(text, period, defaultBaseline, { baseline: baselineColumn >= 0 ? row[baselineColumn] : undefined, deadline: deadlineColumn >= 0 ? row[deadlineColumn] : undefined }));
          }
          continue;
        }
      }
    }
    const tableCovered = segment.blocks.some((block) => block.type === "table" && columnIndex(block.rows[0].map((cell) => clean(cell).toLowerCase()), /target|objective|kpi|metric|goal|commitment|description/) >= 0);
    if (!tableCovered) for (const text of segmentTexts(segment)) targets.push(parseTarget(text, period, defaultBaseline));
    if (targets.length) areas.push({ area: segment.area, targets });
  }
  return areas;
}

interface FocusAnalysis {
  names: string[];
  /** Per-area objectives and targets written directly under the focus heading. */
  objectives: { area: string; items: string[] }[];
  targets: QuantitativeArea[];
}

/**
 * A focus section is usually a list of area names. Some documents instead write
 * each area as a heading with its commitment, targets or sub-points beneath it;
 * then the headings are the areas and what sits under them are its objectives
 * and targets, not more areas.
 */
function analyzeFocus(group: Group, period: "FY" | "CY"): FocusAnalysis {
  const { segments, intro } = areaSegments(group, []);
  const withContent = segments.filter((segment) => segment.blocks.length > 0);
  if (segments.length < 2 || withContent.length < Math.max(2, Math.ceil(segments.length * 0.6))) {
    return { names: extractFocusNames(group), objectives: [], targets: [] };
  }
  const defaultBaseline = defaultBaselineFrom(intro, period);
  const objectives: FocusAnalysis["objectives"] = [];
  const targets: QuantitativeArea[] = [];
  for (const segment of segments) {
    const items: string[] = [];
    const found: QuantitativeTarget[] = [];
    let targetMode = false;
    for (const block of segment.blocks) {
      if (block.type === "paragraph") {
        const line = stripLeadingNumber(block.text);
        if (line.length <= 80 && /^targets?\b.*:$/i.test(line)) { targetMode = true; continue; }
        targetMode = false;
        items.push(line.replace(/^(?:commitment|objective|approach)s?\s*:\s*/i, ""));
      } else if (block.type === "list") {
        for (const item of block.items) {
          if (targetMode) found.push(parseTarget(item, period, defaultBaseline));
          else items.push(stripLeadingNumber(item));
        }
      } else {
        items.push(...segmentTexts({ area: segment.area, blocks: [block] }));
      }
    }
    if (items.length) objectives.push({ area: segment.area, items });
    if (found.length) targets.push({ area: segment.area, targets: found });
  }
  return { names: segments.map((segment) => segment.area), objectives, targets };
}

// ---------------------------------------------------------------- sdg

/** Goal numbers the section states in its text, tables, picture descriptions or server-read pictures. */
function extractSdgs(group: Group): number[] {
  const found = new Set<number>(validSdgNumbers(group.goals));
  const text = [group.title, ...group.alts, ...group.parts.flatMap((part) => [part.title ?? "", ...part.blocks.map((block) => (block.type === "paragraph" ? block.text : block.type === "list" ? block.items.join("\n") : block.rows.map((row) => row.join(" ")).join("\n")))])].join("\n");
  sdgNumbersFromText(text).forEach((n) => found.add(n));
  for (const part of group.parts) for (const block of part.blocks) {
    if (block.type !== "table") continue;
    const header = block.rows[0].join(" ").toLowerCase();
    if (!/sdg|goal/.test(header)) continue;
    for (const row of block.rows.slice(1)) {
      const first = clean(row[0] || "");
      if (/^\d{1,2}$/.test(first) && Number(first) >= 1 && Number(first) <= 17) found.add(Number(first));
    }
  }
  return [...found].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- responsibilities

const DUTY_VERB = String.raw`(?:(?:is|are|shall|must|will|should|may|is expected to|are expected to)\b|(?:adhere|abide|cooperate|attend|observe|respect|complete|submit|oversee|ensure|conduct|manage|lead|monitor|approve|implement|maintain|support|review|provide|coordinate|supervise|establish|promote|perform|report|develop|handle|take|participate|assist|undertake|drive|govern|enforce|investigate|assess|verify|train|communicate|own|issue|administer|facilitate|allocate|champion|track|audit|evaluate|define|carry|identify|prepare|address|engage|uphold|follow|comply|contribute|act|serve|report|execute|deliver|guide|advise|check|inspect)(?:s|es)?\b)`;
const SENTENCE_ROLE = new RegExp(String.raw`^(?:the\s+)?(.{2,80}?)\s+(${DUTY_VERB}[\s\S]{3,})$`, "i");

/** "Role: duty", "Role – duty", or a sentence whose subject is the role ("The HR Manager oversees …"). */
function splitRoleDuty(text: string): Responsibility | null {
  const line = stripLeadingNumber(text);
  const match = /^(.{2,80}?)\s*(?::|\s[–—-]\s)\s*(.{3,})$/.exec(line);
  if (match && wordCount(match[1]) <= 10 && !endsLikeSentence(match[1])) return { role: clean(match[1]), duty: clean(match[2]) };
  const sentence = SENTENCE_ROLE.exec(line);
  if (!sentence) return null;
  const role = clean(sentence[1]);
  if (wordCount(role) > 8 || /[:;]/.test(role) || /^(?:the\s+)?following\b/i.test(role) || /^(?:this|these|it|we|our)\b/i.test(role)) return null;
  return { role, duty: clean(sentence[2]) };
}

function extractResponsibilities(group: Group): Responsibility[] {
  const out: Responsibility[] = [];
  for (const part of group.parts) {
    const lines: Responsibility[] = [];
    for (const block of part.blocks) {
      if (block.type === "table") {
        const header = block.rows[0].map((cell) => clean(cell).toLowerCase());
        const hasHeader = header.some((cell) => /role|designation|position|responsib|duty|duties|function|title/.test(cell));
        const body = hasHeader ? block.rows.slice(1) : block.rows;
        let roleColumn = hasHeader ? columnIndex(header, /role|designation|position|function|title|owner|party/) : -1;
        let dutyColumn = hasHeader ? columnIndex(header, /responsib|duty|duties|description|accountab|activit/, /party|owner/) : -1;
        const cells = (body[0] || []).map((_, index) => index).filter((index) => !isNumberCell((body[0] || [])[index] || "") && !/^(?:sr|s\.?\s*no|no)\b/.test(header[index] || ""));
        if (roleColumn < 0) roleColumn = cells[0] ?? -1;
        if (dutyColumn < 0 || dutyColumn === roleColumn) dutyColumn = cells.find((index) => index !== roleColumn) ?? -1;
        if (roleColumn < 0 || dutyColumn < 0) continue;
        for (const row of body) {
          const role = clean(row[roleColumn] || "");
          const duty = clean(row[dutyColumn] || "");
          if (role && duty) lines.push({ role, duty });
        }
      } else if (block.type === "list") {
        for (const item of block.items) { const split = splitRoleDuty(item); if (split) lines.push(split); }
      } else {
        const split = splitRoleDuty(block.text);
        if (split) lines.push(split);
      }
    }
    if (lines.length) out.push(...lines);
    else if (part.title) {
      const duty = blocksToText(part.blocks).replace(/\n+/g, " ").trim();
      if (duty) out.push({ role: part.title, duty });
    }
  }
  return out;
}

// ---------------------------------------------------------------- policy type

const TYPE_TITLE_KEYWORDS: Record<PolicyType, RegExp> = {
  environmental: /environment|\behs\b|\bgreen\b|climate|emission|pollution|biodiversity/i,
  "labour-human-rights": /labou?r|human right|workplace right|employee right|social policy|social responsib|equal opportunit|discriminat|workplace/i,
  "living-wage": /living wage|fair wage|\bwage/i,
  ethics: /ethic|governance|integrity|conduct|corruption|bribery|compliance/i,
  "sustainable-procurement": /procure|sourcing|supply chain|supplier|vendor/i,
};

const TYPE_BODY_KEYWORDS: Record<PolicyType, RegExp[]> = {
  environmental: [/greenhouse|ghg|emission/gi, /\bwaste\b/gi, /\bwater\b/gi, /\benergy\b/gi, /biodiversity|ecolog/gi],
  "labour-human-rights": [/child labou?r|forced labou?r/gi, /freedom of association|collective bargaining/gi, /human rights/gi, /working (?:hours|conditions)/gi, /harassment|discriminat/gi],
  "living-wage": [/living wage/gi, /minimum wage/gi, /basic needs|decent standard of living/gi, /wage/gi],
  ethics: [/bribery|corruption/gi, /conflict of interest/gi, /whistle/gi, /money laundering|fraud/gi, /code of conduct/gi],
  "sustainable-procurement": [/supplier/gi, /procure/gi, /vendor/gi, /sourcing/gi, /supply chain/gi],
};

const TYPE_ORDER: PolicyType[] = ["living-wage", "sustainable-procurement", "ethics", "labour-human-rights", "environmental"];

export function detectPolicyTypeMismatch(reference: ImportedPolicyContext, expected: PolicyType): { detected: PolicyType; expected: PolicyType } | null {
  const heading = `${reference.title} ${reference.fileName}`;
  const body = (reference.text || reference.sections.map((section) => section.title).join(" ")).slice(0, 40_000);
  const bodyScore = (type: PolicyType) => TYPE_BODY_KEYWORDS[type].reduce((sum, pattern) => sum + Math.min(10, (body.match(pattern) || []).length), 0);
  const named = TYPE_ORDER.filter((type) => TYPE_TITLE_KEYWORDS[type].test(heading));
  if (named.length) {
    if (named.includes(expected)) return null;
    const detected = [...named].sort((a, b) => bodyScore(b) - bodyScore(a))[0];
    return { detected, expected };
  }
  const scores = TYPE_ORDER.map((type) => ({ type, score: bodyScore(type) })).sort((a, b) => b.score - a.score);
  const best = scores[0];
  const own = scores.find((entry) => entry.type === expected)?.score ?? 0;
  return best.type !== expected && best.score >= 12 && best.score >= own * 2 ? { detected: best.type, expected } : null;
}

// ---------------------------------------------------------------- custom sections

function customBlocks(group: Group, sectionKey: string): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  const push = (block: Omit<RichTextBlock, "id">) => blocks.push({ id: `${sectionKey}-b${blocks.length + 1}`, ...block });
  for (const part of group.parts) {
    if (part.title) push({ type: "paragraph", text: clean(part.title) });
    for (const block of part.blocks) {
      if (block.type === "paragraph") push({ type: "paragraph", text: clean(block.text) });
      else if (block.type === "list") push({ type: block.ordered ? "numbered" : "bullets", text: block.items.map(stripLeadingNumber).join("\n") });
      else {
        const columns = block.rows[0].map(clean);
        const width = columns.length;
        push({ type: "table", text: "", columns, rows: block.rows.slice(1).map((row) => Array.from({ length: width }, (_, index) => clean(row[index] || ""))) });
      }
    }
  }
  return blocks.filter((block) => block.type === "table" ? (block.columns || []).some(Boolean) : block.text.trim());
}

// ---------------------------------------------------------------- building the patch

/** A short token that differs for every import, so ids from one import never collide with another's. */
function importStamp(reference: ImportedPolicyContext): string {
  const time = Date.parse(reference.importedAt);
  return (Number.isFinite(time) ? time : Date.now()).toString(36);
}

/** "01", "1.0" and "v1" are the same revision; "1.1" is not. */
function canonicalRevision(value: string): string {
  const text = clean(value).toLowerCase().replace(/^(?:version|rev\.?|v)\s*/, "");
  if (!/^\d+(?:\.\d+)*$/.test(text)) return text;
  const parts = text.split(".").map(Number);
  while (parts.length > 1 && parts[parts.length - 1] === 0) parts.pop();
  return parts.join(".");
}

/** Focus items that carry a description after the area name ("Area : text"). The model has no field for the text. */
function focusDescriptionCount(group: Group): number {
  let count = 0;
  for (const part of group.parts) {
    for (const block of part.blocks) {
      if (block.type !== "list") continue;
      for (const item of block.items) {
        const name = areaNameFromItem(item);
        if (name && stripLeadingNumber(item).length > name.length + 3) count++;
      }
    }
  }
  return count;
}

interface DocEntry { id: string; section: PolicySection }

/**
 * Maps a parsed document onto the policy. A load replaces the policy's content:
 * every content field holds what the document says, or is empty when it does
 * not say it, and the standard sections the document lacks are switched off.
 * Company identity, cover and layout settings stay. The optional
 * classification (from the AI reader) only decides where units of the
 * document's own text go; the text itself is always the document's.
 */
export function importedPolicyToPolicy(source: ImportedPolicyContext, current: Policy, classification?: ImportClassification | null): ImportResult {
  const period = current.company.reportingPeriod || "FY";
  const notes: string[] = [];
  const stamp = importStamp(source);

  const prepared = classification ? applyClassification(source, classification) : null;
  const reference = prepared?.reference ?? source;
  if (prepared) notes.push(`Placement was read with AI for ${prepared.applied} of ${prepared.total} parts of the document; the text is the document's own.`);

  const context: ReadContext = { revisionTables: new Set<Block>(), meta: {}, skipped: [] };
  for (const [field, value] of Object.entries(prepared?.metadata ?? {})) setMetadata(context.meta, field as keyof DocumentMetadata, value);

  // Revision tables can sit in any section (often next to the title), so find them first.
  let revisions: RevisionEntry[] = [];
  for (const section of reference.sections) {
    for (const block of section.blocks) {
      if (block.type !== "table") continue;
      const entries = revisionEntriesFromTable(block.rows);
      if (!entries) continue;
      context.revisionTables.add(block);
      revisions = revisions.concat(entries);
    }
  }

  const { groups: rawGroups, intro: rawIntro } = buildGroups(reference, context);
  // A title page can run headings into its paragraphs ("Preface Acme upholds…", "Scope This policy…").
  const introSplit = splitInlineHeadings({ kind: "custom", title: "", strict: false, alts: [], goals: [], parts: [{ title: null, blocks: rawIntro }] });
  const isIntroHead = (group: Group) => group.kind === "custom" && group.title === "";
  const intro = introSplit.filter(isIntroHead).flatMap((group) => group.parts.flatMap((part) => part.blocks));
  const groups = [...introSplit.filter((group) => !isIntroHead(group)), ...rawGroups].flatMap(splitInlineHeadings);
  const skipped: string[] = [...context.skipped];

  // Focus areas first: objectives and targets are matched against them. The areas
  // are the document's own words; without a Focus section they come from the
  // headings its objectives and targets sit under.
  const documentAreas: string[] = [];
  const focusAnalyses = new Map<Group, FocusAnalysis>();
  let descriptionCount = 0;
  for (const group of groups) {
    if (group.kind !== "focus" || group.skip) continue;
    const analysis = analyzeFocus(group, period);
    focusAnalyses.set(group, analysis);
    descriptionCount += focusDescriptionCount(group);
    for (const name of analysis.names) {
      if (!documentAreas.some((area) => sameAreaStrict(area, name))) documentAreas.push(name);
    }
  }
  const importedFocusCount = documentAreas.length;
  const focusAreas: string[] = [...documentAreas];
  const fallbackArea = deriveDocumentArea(reference);
  const groupArea = (group: Group) => (group.areaTitle ? cleanTitle(group.areaTitle) : "") || fallbackArea;

  const text: Partial<Record<TextKind, string>> = {};
  let definitions: PolicyDefinitions | undefined;
  const qualitative: Record<string, string[]> = {};
  const quantitative: QuantitativeArea[] = [];
  const sdgs = new Set<number>(prepared?.sdgs ?? []);
  const responsibilities: Responsibility[] = [];
  const sites: Site[] = [];
  let sdgSectionSeen = false;
  let sdgIntroDropped = false;
  const filled = new Set<StandardSectionKind>();
  const docOrder: DocEntry[] = [];
  let customCount = 0;
  let objectiveCount = 0;
  let targetCount = 0;

  const standardEntry = (kind: StandardSectionKind, title?: string, enabled = true): DocEntry => {
    const section: PolicySection = { id: sectionId(kind), kind, title: title || STANDARD_TITLES.get(kind) || kind, enabled };
    return { id: section.id, section };
  };
  const markFilled = (kind: StandardSectionKind, title?: string) => {
    if (filled.has(kind)) return;
    filled.add(kind);
    docOrder.push(standardEntry(kind, title));
  };
  const customTitles: string[] = [];
  const makeCustom = (group: Group) => {
    const id = `${IMPORTED_CUSTOM_ID_PREFIX}${stamp}-${customCount + 1}`;
    const blocks = customBlocks(group, id);
    if (!blocks.length) return;
    customCount++;
    const title = group.title || "Imported section";
    customTitles.push(title);
    docOrder.push({ id, section: { id, kind: "custom", title, enabled: true, blocks } });
  };
  const addObjectives = (area: string, items: string[]) => {
    const key = canonicalArea(area, focusAreas);
    qualitative[key] = [...(qualitative[key] || []), ...items];
    objectiveCount += items.length;
  };
  const addTargets = (area: string, targets: QuantitativeTarget[]) => {
    const key = canonicalArea(area, focusAreas);
    const existing = quantitative.find((candidate) => candidate.area === key);
    if (existing) existing.targets.push(...targets);
    else quantitative.push({ area: key, targets: [...targets] });
    targetCount += targets.length;
  };

  for (const group of groups) {
    if (group.skip) { if (!skipped.includes(group.skip)) skipped.push(group.skip); continue; }
    // The SDG section stays even when it is only pictures, so the user can pick the goals in its step.
    if (!groupHasContent(group) && group.kind !== "sdg") continue;
    const { kind } = group;

    if (isTextKind(kind)) {
      let foundSites = 0;
      if (kind === "scope") {
        for (const part of group.parts) for (const block of part.blocks) {
          if (block.type === "table") sites.push(...sitesFromTable(block.rows));
        }
        foundSites = sites.length;
      }
      let body = groupText(group);
      // A scope that is only the sites table keeps the table as text, so the scope still reads.
      if (!body && foundSites) body = groupText({ ...group, kind: "custom" });
      if (!body) continue;
      if (!text[kind]) { text[kind] = body; markFilled(kind); }
      else if (group.strict) text[kind] = `${text[kind]}\n\n${body}`;
      else makeCustom(group);
      continue;
    }

    if (kind === "definitions") {
      const body = groupText(group);
      if (!body) continue;
      if (!definitions) { definitions = { title: group.title || "Definitions", content: body }; markFilled("definitions", definitions.title); }
      else if (group.strict) definitions = { ...definitions, content: `${definitions.content}\n\n${body}` };
      else makeCustom(group);
      continue;
    }

    if (kind === "focus") {
      const analysis = focusAnalyses.get(group);
      if (!analysis || !analysis.names.length) { makeCustom(group); continue; }
      markFilled("focus");
      for (const entry of analysis.objectives) addObjectives(entry.area, entry.items);
      if (analysis.objectives.length) markFilled("qualitative");
      for (const entry of analysis.targets) addTargets(entry.area, entry.targets);
      if (analysis.targets.length) markFilled("quantitative");
      continue;
    }

    if (kind === "qualitative") {
      const grouped = areaSegments(group, focusAreas);
      const segments = grouped.segments.length ? grouped.segments : flatSegments(grouped.intro, documentAreas, groupArea(group), false);
      const entries = segments.map((segment) => ({ area: segment.area, items: segmentTexts(segment) })).filter((entry) => entry.items.length);
      if (!entries.length) { makeCustom(group); continue; }
      for (const entry of entries) addObjectives(entry.area, entry.items);
      markFilled("qualitative");
      continue;
    }

    if (kind === "quantitative") {
      const areas = extractQuantitative(group, focusAreas, period, groupArea(group));
      if (!areas.length) { makeCustom(group); continue; }
      for (const entry of areas) addTargets(entry.area, entry.targets);
      markFilled("quantitative");
      continue;
    }

    if (kind === "sdg") {
      const numbers = extractSdgs(group);
      numbers.forEach((n) => sdgs.add(n));
      // The section is always kept so its step stays in the builder; goals shown as pictures may not be readable.
      markFilled("sdg");
      sdgSectionSeen = true;
      if (groupHasContent(group) && groupText(group)) sdgIntroDropped = true;
      continue;
    }

    if (kind === "responsibilities") {
      const entries = extractResponsibilities(group);
      if (!entries.length) { makeCustom(group); continue; }
      responsibilities.push(...entries);
      markFilled("responsibilities");
      continue;
    }

    if (kind === "revision") {
      if (revisions.length) markFilled("revision");
      else makeCustom(group);
      continue;
    }

    makeCustom(group);
  }

  // The title page is metadata; only a real Preface heading fills the preface.
  if (!text.preface) {
    const opening = intro
      .filter((block): block is Extract<Block, { type: "paragraph" }> => block.type === "paragraph")
      .map((block) => clean(block.text))
      .filter((paragraph) => wordCount(paragraph) >= 20 && !APPROVAL_PARAGRAPH.test(paragraph))
      .slice(0, 3);
    if (opening.length) {
      text.preface = opening.join("\n\n");
      filled.add("preface");
      docOrder.unshift(standardEntry("preface"));
      notes.push("The preface was taken from the opening text because the document has no Preface heading.");
    }
  }
  if (revisions.length && !filled.has("revision")) markFilled("revision");
  if (sdgs.size && !filled.has("sdg")) markFilled("sdg");
  if (sdgSectionSeen && !sdgs.size) notes.push("SDG goals are pictures or could not be read; pick them in the SDG step.");
  if (sdgIntroDropped) notes.push("The SDG section's introduction text could not be loaded: PolicyCraft's SDG section holds goals only.");
  if (prepared?.droppedAcknowledgement && !skipped.includes(ACK_REASON)) skipped.push(ACK_REASON);
  if (prepared?.dropped) skipped.push("Signature lines and page headers");
  descriptionCount += prepared?.descriptions ?? 0;

  // ---- the patch: everything the document does not say is emptied

  const patch: Partial<Policy> = {};
  patch.declaration = { preface: text.preface ?? "", declaration: text.declaration ?? "", scope: text.scope ?? "" };
  patch.definitions = definitions;
  patch.monitoring = text.monitoring ?? "";
  patch.reviewMechanism = text.review ?? "";

  // "custom" shows exactly the rows below: no catalog, no profile defaults.
  patch.focusAreas = [...focusAreas];
  const focusAreaSelection: FocusAreaSelectionState = {
    mode: "custom",
    focusAreaItems: focusAreas.map((label, index) => ({ id: `import-${stamp}-${index}`, label, selected: true })),
  };
  patch.focusAreaSelection = focusAreaSelection;
  patch.qualitative = Object.fromEntries(Object.entries(qualitative).filter(([, items]) => items.length));
  patch.quantitative = quantitative.length ? syncQuantitativeAreas(quantitative, focusAreas, period) : [];
  patch.sdgs = [...sdgs].sort((a, b) => a - b);
  patch.responsibilities = responsibilities;

  const siteList = sites.map((site, index) => ({ ...site, id: `import-${stamp}-site-${index + 1}` }));
  const company = companyFromMetadata(current.company, context.meta, siteList);
  if (company) patch.company = company;

  // The schedule keeps a dated row per revision, so an imported row with the same
  // revision number would show twice. It fills that row's description instead.
  const effective = company?.effectiveDate ?? current.company.effectiveDate;
  const scheduled = isoDateFrom(effective || "") ? (current.revisionHistory ?? []).filter((entry) => entry.source !== "custom").map((entry) => ({ ...entry })) : [];
  const imported: RevisionEntry[] = [];
  let merged = 0;
  for (const entry of revisions) {
    const row = scheduled.find((candidate) => canonicalRevision(candidate.revisionNo) === canonicalRevision(entry.revisionNo));
    if (!row) { imported.push(entry); continue; }
    if (entry.description) row.description = entry.description;
    merged++;
  }
  if (merged) notes.push(`${merged} revision row${merged === 1 ? "" : "s"} matched a dated row, so their descriptions were loaded and their dates follow the policy's effective and review dates.`);
  patch.revisionHistory = revisions.length ? [...scheduled, ...imported] : (current.revisionHistory ?? []).filter((entry) => entry.source !== "custom");
  patch.showRevisionHistory = revisions.length > 0;
  // The builder prints its own acknowledgement form; it stays only when the document had one.
  patch.showAcknowledgement = skipped.includes(ACK_REASON);

  // Document order for what the document has, then every other standard section, switched off.
  const docKinds = new Set(docOrder.map((entry) => entry.section.kind));
  patch.sections = [
    ...docOrder.map((entry) => entry.section),
    ...STANDARD_ORDER.filter((kind) => !docKinds.has(kind)).map((kind) => standardEntry(kind, undefined, false).section),
  ];

  if (descriptionCount > 0) notes.push(`${descriptionCount} focus area description${descriptionCount === 1 ? "" : "s"} could not be loaded: PolicyCraft stores area names only.`);

  const notLoaded = [
    ...skipped,
    ...(descriptionCount > 0 ? [`Focus area descriptions (${descriptionCount})`] : []),
    ...(sdgIntroDropped ? ["SDG introduction text"] : []),
  ];

  const filledInOrder = STANDARD_ORDER.filter((kind) => filled.has(kind));
  const docOrderKinds = docOrder.filter((entry) => entry.section.kind !== "custom").map((entry) => entry.section.kind as StandardSectionKind);
  const reportFilled = [...new Set([...docOrderKinds, ...filledInOrder])];

  return {
    patch,
    report: {
      filled: reportFilled,
      custom: customTitles,
      skipped,
      counts: {
        focusAreas: importedFocusCount || focusAreas.length,
        objectives: objectiveCount,
        targets: targetCount,
        sdgs: sdgs.size,
        responsibilities: responsibilities.length,
        revisions: revisions.length,
      },
      mismatch: detectPolicyTypeMismatch(reference, current.policyType),
      notes,
      notLoaded,
      sdgGoalsUnread: sdgSectionSeen && !sdgs.size,
    },
  };
}


// ---------------------------------------------------------------- messages

const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  environmental: "Environmental",
  "labour-human-rights": "Labour & Human Rights",
  "living-wage": "Living Wage",
  ethics: "Ethics",
  "sustainable-procurement": "Sustainable Procurement",
};

export const policyTypeLabel = (type: PolicyType) => POLICY_TYPE_LABELS[type];

export function sectionLabel(kind: StandardSectionKind) {
  return STANDARD_TITLES.get(kind) || kind;
}

/** One sentence for the success toast. */
export function summarizeImport(report: ImportReport): string {
  const parts: string[] = [];
  if (report.filled.length) parts.push(`${report.filled.length} section${report.filled.length === 1 ? "" : "s"} loaded`);
  if (report.custom.length) parts.push(`${report.custom.length} custom section${report.custom.length === 1 ? "" : "s"} added`);
  const sdgPictures = report.notes.some((note) => /pick them in the SDG step/.test(note));
  const sentence = parts.length ? `${parts.join(" and ")} from the document.` : "Nothing in the document matched the policy fields.";
  return sdgPictures ? `${sentence} SDG goals are pictures; pick them in the SDG step.` : sentence;
}
