import type { StandardSectionKind } from "../types";

// Kept free of mammoth and Node APIs so the browser-side policy mapper can use
// the same heading rules as the DOCX parser.

export const SECTION_TERMS: Record<StandardSectionKind, string[]> = {
  preface: ["preface", "preamble", "introduction", "background", "overview", "purpose", "context", "intent", "about this policy", "why this matters"],
  declaration: ["policy declaration", "policy statement", "statement of policy", "our commitment", "commitment", "pledge", "policy position", "guiding principle"],
  scope: ["scope", "applicability", "coverage", "application", "who this applies to", "where this applies", "persons covered"],
  definitions: ["definition", "definitions", "glossary", "terminology", "meaning of terms", "methodology"],
  focus: ["focus area", "focus areas", "key focus areas", "key area", "key action area", "key action areas","priority area", "strategic priority", "material topic", "policy pillar", "core issue", "thematic area"],
  qualitative: ["qualitative", "qualitative objectives", "objective", "objectives", "commitment", "action framework", "our approach", "policy requirement", "guideline", "principles and commitments"],
  quantitative: ["quantitative", "quantitative targets", "measurable target", "performance target", "target and goal", "targets", "kpi", "metric"],
  sdg: ["sustainable development goal", "sdg", "sdgs", "global goals"],
  responsibilities: ["roles and responsibilities", "role and responsibility", "responsibility", "responsibilities", "accountability", "governance", "policy owner", "ownership"],
  monitoring: ["monitoring and reporting", "monitoring", "reporting and transparency", "performance measurement", "assurance", "audit", "compliance tracking", "implementation and monitoring"],
  review: ["review mechanism", "continuous improvement", "policy review", "review and update", "review cycle", "periodic review"],
  revision: ["revision history", "version history", "change log", "document control", "amendment record", "revision record"],
};

const GENERIC_HEADING_WORDS = new Set(["policy", "section", "framework", "procedure", "standard", "our", "the", "and", "for", "of"]);

export function classifySectionHeading(heading: string): StandardSectionKind | "custom" {
  const normalized = normalizeHeading(heading);
  let best: { kind: StandardSectionKind; score: number } | null = null;

  for (const [kind, terms] of Object.entries(SECTION_TERMS) as [StandardSectionKind, string[]][]) {
    for (const term of terms) {
      const score = headingMatchScore(normalized, term);
      if (score > 0 && (!best || score > best.score)) best = { kind, score };
    }
  }
  return best?.kind || "custom";
}

/**
 * The kind a heading names on its own, or null when it only resembles one.
 * Subsections such as "Water usage monitoring" mention a section word without
 * being that section, so this accepts only an exact term or a long phrase.
 */
export function strictSectionKind(heading: string): StandardSectionKind | null {
  const normalized = normalizeHeading(heading);
  if (!normalized) return null;
  let best: { kind: StandardSectionKind; score: number } | null = null;
  for (const [kind, terms] of Object.entries(SECTION_TERMS) as [StandardSectionKind, string[]][]) {
    for (const term of terms) {
      const normalizedTerm = normalizeHeading(term);
      const exact = normalized === normalizedTerm;
      const phrase = normalizedTerm.length >= 16 && normalized.includes(normalizedTerm);
      if (!exact && !phrase) continue;
      const score = (exact ? 100 : 70) + normalizedTerm.length;
      if (!best || score > best.score) best = { kind, score };
    }
  }
  return best?.kind ?? null;
}

const LEAD_KINDS: StandardSectionKind[] = ["monitoring", "review", "sdg", "responsibilities"];
/** Words too general to start a section on their own ("Governance of the Policy" can be a topic). */
const NOT_LEADING = new Set(["governance", "ownership", "assurance"]);

/**
 * A heading that starts with a section's own words ("Monitoring, Reporting and
 * Transperancy") names that section even when the rest is not an exact term.
 * Only sections that hold one body of text qualify, and the words must lead the
 * heading, so "Water usage monitoring" and "Environmental Responsibility" stay
 * subsections of the section they sit in.
 */
export function leadingSectionKind(heading: string): StandardSectionKind | null {
  const normalized = normalizeHeading(heading);
  if (!normalized) return null;
  let best: { kind: StandardSectionKind; length: number } | null = null;
  for (const kind of LEAD_KINDS) {
    for (const term of SECTION_TERMS[kind]) {
      const normalizedTerm = normalizeHeading(term);
      if (normalizedTerm.length < 8 || NOT_LEADING.has(normalizedTerm)) continue;
      if ((normalized === normalizedTerm || normalized.startsWith(`${normalizedTerm} `)) && (!best || normalizedTerm.length > best.length)) best = { kind, length: normalizedTerm.length };
    }
  }
  return best?.kind ?? null;
}

function headingMatchScore(heading: string, term: string): number {
  const normalizedTerm = normalizeHeading(term);
  if (heading === normalizedTerm) return 100 + normalizedTerm.length;
  if (heading.includes(normalizedTerm) && normalizedTerm.length >= 5) return 70 + normalizedTerm.length;

  const headingWords = meaningfulWords(heading);
  const termWords = meaningfulWords(normalizedTerm);
  if (!termWords.length) return 0;
  const overlap = termWords.filter((word) => headingWords.some((candidate) => wordStemMatches(word, candidate))).length;
  const ratio = overlap / termWords.length;
  return ratio >= 0.75 ? 40 + overlap : 0;
}

function meaningfulWords(value: string): string[] {
  return value.split(" ").filter((word) => word.length > 2 && !GENERIC_HEADING_WORDS.has(word));
}

function wordStemMatches(a: string, b: string): boolean {
  return a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)));
}

export function normalizeHeading(value: string): string {
  return stripHeadingNumber(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function stripHeadingNumber(value: string): string {
  return value.replace(/^\s*(?:section\s+)?\d+(?:\.\d+){0,3}[.):\-]?\s*/i, "").trim();
}
