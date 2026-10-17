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
    case "purpose":
    case "scope":
    case "training":
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
