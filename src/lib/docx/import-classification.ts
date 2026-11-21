import type { ImportedPolicyBlock, ImportedPolicyContext, ImportedPolicySection, StandardSectionKind } from "../types";
import { sdgNumbersFromText } from "./sdg-numbers";

// The AI reader only says WHERE each part of a loaded document belongs. This
// module flattens a parsed document into numbered units for it to label, and
// applies the labels it returns: the document's own text is moved, never
// rewritten. Pure and browser-safe, so the mapper can use it on the client.

export const DESTINATIONS = ["pre", "dec", "scp", "site", "foc", "obj", "tgt", "sdg", "res", "mon", "rev", "meta", "cus", "drop"] as const;
export type Destination = (typeof DESTINATIONS)[number];
export const META_FIELDS = ["documentNo", "revisionNo", "effectiveDate", "lastReviewDate", "nextReviewDate", "approvedBy"] as const;
export type MetaField = (typeof META_FIELDS)[number];

/** One label, for the unit `i` or the run of units `i`..`e`. Short keys keep the model's answer small. */
export interface ClassificationLabel {
  i: number;
  e?: number;
  d: Destination;
  /** Area name for foc/obj/tgt, copied from the document. */
  a?: string;
  /** SDG numbers for sdg. */
  n?: number[];
  /** Role for res, copied from the document. */
  r?: string;
  /** Which detail a meta unit holds. */
  f?: MetaField;
  /** The meta value, copied from the document. */
  v?: string;
  /** Section title for cus, one of the document's own headings. */
  t?: string;
}

export interface ImportClassification { u: ClassificationLabel[] }

export type UnitType = "p" | "l" | "r";

/** A paragraph, a list item or a table row, in document order. */
export interface ImportUnit {
  id: number;
  /** Index of the parsed section it sits in. */
  section: number;
  block: number;
  /** List item or table row index within its block. */
  item: number;
  type: UnitType;
  /** The first row of a table. */
  header: boolean;
  text: string;
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
/** An area name as the policy should show it: no list numbering, and no trailing "Policy" when the model copied the document's title. */
const areaName = (value: string) => clean(value).replace(/^\d+(?:\.\d+)*[.):-]?\s+/, "").replace(/\s+policy$/i, "").trim();
const norm = (value: string) => clean(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

export function flattenUnits(reference: ImportedPolicyContext): ImportUnit[] {
  const units: ImportUnit[] = [];
  reference.sections.forEach((section, sectionIndex) => {
    section.blocks.forEach((block, blockIndex) => {
      const push = (type: UnitType, item: number, text: string, header = false) => {
        const value = clean(text);
        if (value) units.push({ id: units.length, section: sectionIndex, block: blockIndex, item, type, header, text: value });
      };
      if (block.type === "paragraph") push("p", 0, block.text);
      else if (block.type === "list") block.items.forEach((text, item) => push("l", item, text));
      else block.rows.forEach((row, item) => push("r", item, row.map(clean).filter(Boolean).join(" | "), item === 0 && block.rows.length > 1));
    });
  });
  return units;
}

/** Labels in the answer, expanded to one per unit id. Ids that do not exist are ignored; the first label for an id wins. */
export function expandLabels(classification: ImportClassification, unitCount: number): Map<number, ClassificationLabel> {
  const byId = new Map<number, ClassificationLabel>();
  const list = Array.isArray(classification?.u) ? classification.u : [];
  for (const label of list) {
    if (!label || !(DESTINATIONS as readonly string[]).includes(label.d) || !Number.isInteger(label.i)) continue;
    const start = Math.max(0, label.i);
    const end = Math.min(unitCount - 1, Number.isInteger(label.e) ? (label.e as number) : label.i);
    for (let id = start; id <= end; id++) if (!byId.has(id)) byId.set(id, label);
  }
  return byId;
}

const SECTION_FOR: Record<Exclude<Destination, "site" | "meta" | "cus" | "drop">, { kind: StandardSectionKind; title: string }> = {
  pre: { kind: "preface", title: "Preface" },
  dec: { kind: "declaration", title: "Policy Declaration" },
  scp: { kind: "scope", title: "Scope" },
  foc: { kind: "focus", title: "Key Focus Areas" },
  obj: { kind: "qualitative", title: "Qualitative Objectives" },
  tgt: { kind: "quantitative", title: "Quantitative Targets" },
  sdg: { kind: "sdg", title: "Sustainable Development Goals" },
  res: { kind: "responsibilities", title: "Roles and Responsibilities" },
  mon: { kind: "monitoring", title: "Monitoring and Reporting" },
  rev: { kind: "review", title: "Review Mechanism" },
};

/** The heading words a unit may start with when the document ran its heading into the paragraph. */
const OWN_HEADING_WORDS: Partial<Record<Destination, string>> = {
  pre: "preface|preamble|introduction|purpose",
  dec: "policy declaration|policy statement|statement of policy|declaration",
  scp: "scope|applicability",
  obj: "qualitative objectives|objectives",
  tgt: "quantitative targets|targets",
  mon: "monitoring and reporting|monitoring",
  rev: "review mechanism|review",
};

function withoutOwnHeading(text: string, destination: Destination): string {
  const words = OWN_HEADING_WORDS[destination];
  if (!words) return text;
  const match = new RegExp(`^(?:${words})\\s*[:–—-]?\\s+(?=[A-Z])`, "").exec(text);
  return match && text.length - match[0].length >= 20 ? text.slice(match[0].length) : text;
}

/** Splits "The HR Manager oversees training" into role and duty when the role is at the start of the text. */
function roleAndDuty(text: string, role: string | undefined): { role: string; duty: string } | null {
  const wanted = clean(role || "");
  if (!wanted) return null;
  const at = text.toLowerCase().indexOf(wanted.toLowerCase());
  if (at < 0 || at > 6) return null;
  const duty = clean(text.slice(at + wanted.length).replace(/^[\s:–—-]+/, ""));
  return duty ? { role: text.slice(at, at + wanted.length), duty } : null;
}

export interface AppliedClassification {
  reference: ImportedPolicyContext;
  metadata: Partial<Record<MetaField, string>>;
  sdgs: number[];
  /** Units the labels placed (not counting those left to the rules). */
  applied: number;
  total: number;
  dropped: number;
  droppedAcknowledgement: boolean;
  /** Focus area descriptions the policy has no field for. */
  descriptions: number;
}

interface Placed { unit: ImportUnit; text: string; label: ClassificationLabel; area?: string }
interface Bucket { key: string; kind: StandardSectionKind | "custom"; title: string; firstSection: number; level: 1 | 2 | 3; placed: Placed[] }

/**
 * Moves each labelled unit into a section for its destination, leaves the rest
 * where the document had it, and returns the document restructured. Labels
 * that do not check out (unknown ids, names the document never uses, a site
 * label on a paragraph) are ignored, so those units fall to the rules.
 */
export function applyClassification(reference: ImportedPolicyContext, classification: ImportClassification): AppliedClassification {
  const units = flattenUnits(reference);
  const labels = expandLabels(classification, units.length);
  const documentWords = norm([reference.title, ...reference.sections.map((section) => section.title), ...units.map((unit) => unit.text)].join(" "));
  const inDocument = (value: string | undefined) => {
    const text = norm(value || "");
    return text.length > 0 && text.length <= 160 && ` ${documentWords} `.includes(` ${text} `);
  };
  const headings = new Map(reference.sections.map((section) => [norm(section.title), section.title]));

  const metadata: Partial<Record<MetaField, string>> = {};
  const sdgs = new Set<number>();
  let dropped = 0;
  let droppedAcknowledgement = false;
  let descriptions = 0;
  let applied = 0;

  // Decide, per unit, where it goes. `undefined` leaves it to the rules.
  const placement = new Map<number, Placed | "drop" | "meta">();
  for (const unit of units) {
    const label = labels.get(unit.id);
    if (!label) continue;
    const text = unit.text;
    switch (label.d) {
      case "drop":
        placement.set(unit.id, "drop");
        dropped++;
        if (/acknowl/i.test(text)) droppedAcknowledgement = true;
        break;
      case "meta": {
        if (!label.f || !(META_FIELDS as readonly string[]).includes(label.f)) break;
        const own = label.v && norm(label.v) && norm(text).includes(norm(label.v)) ? clean(label.v) : clean(text.includes(":") ? text.slice(text.indexOf(":") + 1) : text);
        if (!own) break;
        metadata[label.f] ??= own;
        placement.set(unit.id, "meta");
        break;
      }
      case "site":
        if (unit.type === "r" && !unit.header) placement.set(unit.id, { unit, text, label });
        break;
      case "foc":
      case "obj":
      case "tgt":
        if (!inDocument(label.a)) break;
        if (label.d === "foc" && clean(label.a || "").length < text.length - 3) descriptions++;
        placement.set(unit.id, { unit, text, label, area: areaName(label.a || "") || clean(label.a || "") });
        break;
      case "sdg":
        {
          // The model only points at goals; keep the ones this unit's own text states.
          const stated = sdgNumbersFromText(text);
          for (const n of label.n ?? []) if (stated.includes(n)) sdgs.add(n);
        }
        placement.set(unit.id, { unit, text, label });
        break;
      case "cus": {
        const title = label.t && headings.get(norm(label.t)) ? headings.get(norm(label.t))! : reference.sections[unit.section]?.title || "Imported section";
        placement.set(unit.id, { unit, text, label, area: title });
        break;
      }
      default:
        placement.set(unit.id, { unit, text: withoutOwnHeading(text, label.d), label });
    }
  }

  const buckets = new Map<string, Bucket>();
  const bucketFor = (placed: Placed, section: ImportedPolicySection, sectionIndex: number): Bucket => {
    const destination = placed.label.d === "site" ? "scp" : placed.label.d;
    const key = destination === "cus" ? `cus:${norm(placed.area || "")}` : destination;
    let bucket = buckets.get(key);
    if (!bucket) {
      const base = destination === "cus"
        ? { kind: "custom" as const, title: placed.area || "Imported section" }
        : SECTION_FOR[destination as keyof typeof SECTION_FOR];
      const areaBased = destination === "foc" || destination === "obj" || destination === "tgt";
      bucket = { key, kind: base.kind, title: base.title, firstSection: sectionIndex, level: areaBased ? (Math.min(section.level, 2) as 1 | 2) : section.level, placed: [] };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  // Leftover sections keep what the labels did not take.
  const leftovers: ImportedPolicySection[] = [];
  reference.sections.forEach((section, sectionIndex) => {
    const blocks: ImportedPolicyBlock[] = [];
    section.blocks.forEach((block, blockIndex) => {
      const unitsOfBlock = units.filter((unit) => unit.section === sectionIndex && unit.block === blockIndex);
      if (!unitsOfBlock.length) return;
      const take = (unit: ImportUnit) => {
        const result = placement.get(unit.id);
        if (!result) return false;
        if (typeof result !== "string") { bucketFor(result, section, sectionIndex).placed.push(result); applied++; } else applied++;
        return true;
      };
      if (block.type === "paragraph") {
        if (!take(unitsOfBlock[0])) blocks.push(block);
      } else if (block.type === "list") {
        const kept = unitsOfBlock.filter((unit) => !take(unit)).map((unit) => block.items[unit.item]);
        if (kept.length) blocks.push({ type: "list", ordered: block.ordered, items: kept });
      } else {
        const header = unitsOfBlock.find((unit) => unit.header);
        const body = unitsOfBlock.filter((unit) => !unit.header);
        // A header row alone never moves; its rows carry it along.
        const moved = body.length ? body.filter((unit) => take(unit)) : [];
        if (!body.length) {
          if (!unitsOfBlock.every((unit) => take(unit))) blocks.push(block);
        } else if (moved.length < body.length) {
          const keptRows = [header ? block.rows[header.item] : null, ...body.filter((unit) => !moved.includes(unit)).map((unit) => block.rows[unit.item])].filter((row): row is string[] => Boolean(row));
          blocks.push({ type: "table", rows: keptRows });
        }
      }
    });
    leftovers.push({ ...section, blocks });
  });

  // Build one synthetic section per destination, placed where its first unit was.
  const sectionBlocks = (bucket: Bucket, source: ImportedPolicySection[]) => {
    const out: ImportedPolicyBlock[] = [];
    const tableRows = new Map<string, { rows: string[][]; blockIndex: number }>();
    let lastList: { ordered: boolean; items: string[]; ref: string } | null = null;
    for (const entry of bucket.placed) {
      const { unit } = entry;
      const original = source[unit.section]?.blocks[unit.block];
      const ref = `${unit.section}:${unit.block}`;
      if (unit.type === "p") { out.push({ type: "paragraph", text: entry.text }); lastList = null; continue; }
      if (unit.type === "l") {
        const ordered = original?.type === "list" ? original.ordered : false;
        if (lastList && lastList.ref === ref) lastList.items.push(entry.text);
        else {
          const items = [entry.text];
          out.push({ type: "list", ordered, items });
          lastList = { ordered, items, ref };
        }
        continue;
      }
      lastList = null;
      if (original?.type !== "table") continue;
      let rows = tableRows.get(ref);
      if (!rows) {
        rows = { rows: [original.rows[0]], blockIndex: out.length };
        tableRows.set(ref, rows);
        out.push({ type: "table", rows: rows.rows });
      }
      const row = original.rows[unit.item];
      if (row) rows.rows.push(row);
    }
    return out;
  };

  const emitted = new Set<string>();
  const sections: ImportedPolicySection[] = [];
  let counter = 0;
  const emit = (bucket: Bucket) => {
    emitted.add(bucket.key);
    const id = `ai-import-${++counter}`;
    if (bucket.kind === "responsibilities") {
      // Sentence-form roles become role/duty rows so the role keeps the document's wording.
      const rows: string[][] = [["Role", "Responsibility"]];
      const loose: ImportedPolicyBlock[] = [];
      for (const entry of bucket.placed.filter((candidate) => candidate.unit.type !== "r")) {
        const split = roleAndDuty(entry.text, entry.label.r);
        if (split) rows.push([split.role, split.duty]);
        else loose.push({ type: "list", ordered: false, items: [entry.text] });
      }
      const tableBlocks = sectionBlocks({ ...bucket, placed: bucket.placed.filter((candidate) => candidate.unit.type === "r") }, reference.sections);
      sections.push({ id, title: bucket.title, level: bucket.level, kind: bucket.kind, blocks: [...(rows.length > 1 ? [{ type: "table" as const, rows }] : []), ...tableBlocks, ...loose] });
      return;
    }
    if (bucket.kind === "focus" || bucket.kind === "qualitative" || bucket.kind === "quantitative") {
      const names: string[] = [];
      const byArea = new Map<string, Bucket>();
      const lead: Placed[] = [];
      for (const entry of bucket.placed) {
        const area = entry.area || "";
        if (bucket.kind === "focus") { if (!names.some((name) => norm(name) === norm(area))) names.push(area); continue; }
        // Lead-ins and the baseline sentence belong to the section, not to one area's items.
        if (entry.unit.type === "p" && (/:$/.test(entry.text) || (bucket.kind === "quantitative" && /baseline|base year/i.test(entry.text) && /\b(?:19|20)\d{2}\b/.test(entry.text)))) { lead.push(entry); continue; }
        const key = norm(area);
        const group = byArea.get(key) ?? { ...bucket, title: area, placed: [] };
        byArea.set(key, group);
        group.placed.push(entry);
      }
      const children: ImportedPolicySection[] = [...byArea.values()].map((group, index) => ({
        id: `${id}-a${index + 1}`,
        title: group.title,
        level: Math.min(bucket.level + 1, 3) as 1 | 2 | 3,
        kind: "custom",
        blocks: sectionBlocks(group, reference.sections),
      }));
      const blocks: ImportedPolicyBlock[] = bucket.kind === "focus" ? [{ type: "list", ordered: false, items: names }] : sectionBlocks({ ...bucket, placed: lead }, reference.sections);
      sections.push({ id, title: bucket.title, level: bucket.level, kind: bucket.kind, blocks }, ...children);
      return;
    }
    sections.push({ id, title: bucket.title, level: bucket.level, kind: bucket.kind, blocks: sectionBlocks(bucket, reference.sections) });
  };

  leftovers.forEach((section, index) => {
    for (const bucket of buckets.values()) if (bucket.firstSection === index && !emitted.has(bucket.key)) emit(bucket);
    sections.push(section);
  });

  return {
    reference: { ...reference, sections },
    metadata,
    sdgs: [...sdgs].sort((a, b) => a - b),
    applied,
    total: units.length,
    dropped,
    droppedAcknowledgement,
    descriptions,
  };
}
