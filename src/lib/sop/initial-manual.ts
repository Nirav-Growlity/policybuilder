import type { Company } from "../types";
import {
  DEFAULT_SOP_TEMPLATE_ID,
  SOP_SECTION_KINDS,
  sopSectionLabel,
  type Sop,
  type SopManual,
  type SopPillar,
  type SopSection,
  type SopSectionKind,
} from "./types";

export function createSopId(prefix = "sop"): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

/** An empty section of the given kind, carrying the shape its kind needs. */
export function createEmptySopSection(kind: SopSectionKind, options: { title?: string; enabled?: boolean } = {}): SopSection {
  const base = {
    id: createSopId("section"),
    title: options.title ?? (kind === "custom" ? "Additional Information" : sopSectionLabel(kind)),
    enabled: options.enabled ?? true,
  };
  switch (kind) {
    case "introduction":
    case "purpose":
    case "scope":
    case "training":
    case "compliance":
    case "corrective":
    case "review":
    case "custom":
      return { ...base, kind, blocks: [] };
    case "appendix":
      return { ...base, kind, blocks: [] };
    case "definitions":
      return { ...base, kind, rows: [] };
    case "responsibilities":
      return { ...base, kind, rows: [] };
    case "procedure":
      return { ...base, kind, steps: [] };
    case "monitoring":
      return { ...base, kind, kpis: [], narrative: [] };
    case "records":
      return { ...base, kind, rows: [] };
    case "references":
      return { ...base, kind, items: [] };
  }
}

/** Position of a kind in the canonical skeleton; custom sections have none. */
function canonicalRank(kind: SopSectionKind): number {
  return SOP_SECTION_KINDS.findIndex((entry) => entry.kind === kind);
}

/**
 * The SOP with every canonical section kind it lacks inserted at its canonical
 * place, switched off, so a manual saved before a kind existed renders as it
 * did and the writer can switch the new section on. Ids are derived from the
 * SOP id, so the result is the same on every load. Returns the same SOP when
 * nothing is missing.
 */
export function withSopSkeleton(sop: Sop): Sop {
  const present = new Set(sop.sections.map((section) => section.kind));
  const missing = SOP_SECTION_KINDS.filter((entry) => !present.has(entry.kind));
  if (!missing.length) return sop;
  const sections = [...sop.sections];
  for (const entry of missing) {
    const rank = canonicalRank(entry.kind);
    const added = { ...createEmptySopSection(entry.kind, { enabled: false }), id: `${sop.id}-${entry.kind}` };
    // Right after the last section that comes before it, else before the first that comes after it.
    let at = -1;
    sections.forEach((section, index) => {
      const other = canonicalRank(section.kind);
      if (other >= 0 && other < rank) at = index + 1;
    });
    if (at < 0) {
      const next = sections.findIndex((section) => canonicalRank(section.kind) > rank);
      at = next < 0 ? sections.length : next;
    }
    sections.splice(at, 0, added);
  }
  return { ...sop, sections };
}

/** `withSopSkeleton` for every SOP of a manual; the same manual when nothing changed. */
export function withManualSkeleton<M extends { sops: Sop[] }>(manual: M): M {
  const sops = manual.sops.map(withSopSkeleton);
  return sops.every((sop, index) => sop === manual.sops[index]) ? manual : { ...manual, sops };
}

/** "A", "B"… "Z", "AA", "AB"… for the appendix at this zero-based position. */
export function appendixLetter(index: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return index < letters.length ? letters[index] : `${letters[Math.floor(index / letters.length) - 1] ?? "Z"}${letters[index % letters.length]}`;
}

/** "Appendix A", "Appendix B"… for the appendix at this zero-based position. */
export function appendixTitle(index: number): string {
  return `Appendix ${appendixLetter(index)}`;
}

/**
 * Adds an appendix to an SOP. A left-out, empty appendix (every new SOP has
 * one) is switched on first; otherwise a new one goes after the last appendix
 * (or at the end), titled with the next letter, and a first appendix still
 * called plain "Appendix" becomes "Appendix A".
 */
export function addSopAppendix(sop: Sop): Sop {
  const appendices = sop.sections.filter((section) => section.kind === "appendix");
  const idle = appendices.find((section) => !section.enabled && !section.blocks.some((block) => block.text.trim() || (block.rows?.length ?? 0) > 0));
  if (idle) return { ...sop, sections: sop.sections.map((section) => (section === idle ? { ...section, enabled: true } : section)) };
  const added = createEmptySopSection("appendix", { title: appendixTitle(appendices.length), enabled: true });
  const last = appendices.at(-1);
  const at = last ? sop.sections.indexOf(last) + 1 : sop.sections.length;
  const sections = sop.sections.map((section) =>
    appendices.length === 1 && section === appendices[0] && section.title.trim().toLowerCase() === "appendix" ? { ...section, title: appendixTitle(0) } : section
  );
  sections.splice(at, 0, added);
  return { ...sop, sections };
}

export type CreateEmptySopOptions = {
  title?: string;
  catalogId?: string;
  code?: string;
  pillar?: SopPillar;
  department?: string;
  owner?: string;
};

/** A new SOP with the canonical section skeleton (default-enabled kinds switched on). */
export function createEmptySop(options: CreateEmptySopOptions = {}): Sop {
  return {
    id: createSopId(),
    catalogId: options.catalogId,
    code: options.code ?? "",
    title: options.title ?? "",
    pillar: options.pillar ?? "E",
    department: options.department ?? "",
    owner: options.owner ?? "",
    version: "01",
    enabled: true,
    status: "empty",
    sections: SOP_SECTION_KINDS.map((entry) => createEmptySopSection(entry.kind, { enabled: entry.defaultEnabled })),
  };
}

export function createEmptySopCompany(): Company {
  return {
    name: "",
    industry: "",
    subCategory: "",
    industryDetail: "",
    country: "",
    websiteLink: "",
    companyLogo: "",
    logoPalette: undefined,
    reportingPeriod: "FY",
    site: "",
    sites: [],
    docNum: "",
    revNum: "01",
    effectiveDate: "",
    lastReviewDate: "",
    reviewDate: "",
    reviewFrequency: "Yearly",
    approver: "",
    reviewerDesignations: [],
  };
}

export function createEmptyManual(options: { company?: Company; sops?: Sop[] } = {}): SopManual {
  const company = options.company ?? createEmptySopCompany();
  return {
    id: createSopId("manual"),
    company,
    control: {
      docNo: company.docNum ?? "",
      revision: company.revNum || "01",
      supersedes: "",
      effectiveDate: company.effectiveDate ?? "",
      reviewFrequency: company.reviewFrequency ?? "Yearly",
      nextReviewDate: company.reviewDate ?? "",
      preparedBy: "",
      reviewedBy: "",
      approvedBy: company.approver ?? "",
      classification: "Internal",
    },
    grouping: "pillar",
    frontMatter: {
      introduction: [],
      objective: [],
      benefits: [],
      sites: [...(company.sites ?? [])],
      coreValues: [],
      howToUse: [],
      glossary: [],
    },
    sops: options.sops ?? [],
    closing: {
      reviewMechanism: [],
      revisionHistory: [],
      approval: { statement: "", signatories: [] },
    },
    theme: DEFAULT_SOP_TEMPLATE_ID,
    themeOptions: {
      // Empty means "derive from the company logo palette" at render time.
      accent: "",
      fontPair: "",
      pageSize: "A4",
      showSopHeaderCard: false,
    },
    cover: { variant: "template" },
  };
}
