/**
 * Domain model for SOP Manuals (the first "Documents" type).
 *
 * A manual is catalog-driven: a set of SOPs that all share one section
 * skeleton, wrapped in front matter (introduction, scope and sites) and a
 * closing block (review mechanism, revision history, approval).
 */
import type { Company, CoverComposition, RevisionEntry, RichTextBlock, Site } from "../types";

export type SopPillar = "E" | "S" | "G";

export type SopGrouping = "pillar" | "department" | "none";

export type SopStatus = "empty" | "generating" | "draft" | "reviewed";

export const SOP_TEMPLATE_IDS = [
  "controlled-manual",
  "esg-pillars",
  "sop-cards",
  "compact-register",
  "modern-banner",
] as const;

export type SopTemplateId = (typeof SOP_TEMPLATE_IDS)[number];

export const DEFAULT_SOP_TEMPLATE_ID: SopTemplateId = "controlled-manual";

export type SopPageSize = "A4" | "Letter";

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

export type SopNarrativeKind =
  | "introduction"
  | "purpose"
  | "scope"
  | "training"
  | "compliance"
  | "corrective"
  | "review"
  | "custom";

export type SopSectionKind =
  | SopNarrativeKind
  | "definitions"
  | "responsibilities"
  | "procedure"
  | "monitoring"
  | "records"
  | "references"
  | "appendix";

type SopSectionBase = {
  id: string;
  /** Heading shown in the document; defaults to the kind's label. */
  title: string;
  enabled: boolean;
};

export type SopNarrativeSection = SopSectionBase & {
  kind: SopNarrativeKind;
  blocks: RichTextBlock[];
};

export type SopDefinitionRow = { term: string; definition: string };

export type SopDefinitionsSection = SopSectionBase & {
  kind: "definitions";
  rows: SopDefinitionRow[];
};

export type SopResponsibilityRow = { role: string; responsibilities: string[] };

export type SopResponsibilitiesSection = SopSectionBase & {
  kind: "responsibilities";
  rows: SopResponsibilityRow[];
};

export type SopProcedureSubstep = { id: string; text: string; responsible?: string };

export type SopProcedureStep = {
  id: string;
  heading: string;
  body: RichTextBlock[];
  responsible?: string;
  substeps?: SopProcedureSubstep[];
};

export type SopProcedureSection = SopSectionBase & {
  kind: "procedure";
  steps: SopProcedureStep[];
};

export type SopKpi = { indicator: string; target: string; frequency: string; owner: string };

export type SopMonitoringSection = SopSectionBase & {
  kind: "monitoring";
  kpis: SopKpi[];
  narrative: RichTextBlock[];
};

export type SopRecordRow = {
  /** Form / record number, e.g. "ABC/EHS/F-01". Optional: older manuals have none. */
  code?: string;
  record: string;
  owner: string;
  retention: string;
  format: string;
};

export type SopRecordsSection = SopSectionBase & {
  kind: "records";
  rows: SopRecordRow[];
};

export type SopReferencesSection = SopSectionBase & {
  kind: "references";
  items: string[];
};

export type SopAppendixSection = SopSectionBase & {
  kind: "appendix";
  blocks: RichTextBlock[];
};

export type SopSection =
  | SopNarrativeSection
  | SopDefinitionsSection
  | SopResponsibilitiesSection
  | SopProcedureSection
  | SopMonitoringSection
  | SopRecordsSection
  | SopReferencesSection
  | SopAppendixSection;

export type SopSectionOfKind<K extends SopSectionKind> = Extract<SopSection, { kind: K }>;

/**
 * Canonical SOP skeleton, in document order. `custom` sections are not part of
 * the skeleton; users add them where they need them. An SOP may hold several
 * appendices; they always sit after the canonical sections.
 */
export const SOP_SECTION_KINDS: ReadonlyArray<{
  kind: Exclude<SopSectionKind, "custom">;
  label: string;
  defaultEnabled: boolean;
}> = [
  { kind: "introduction", label: "Introduction", defaultEnabled: false },
  { kind: "purpose", label: "Purpose", defaultEnabled: true },
  { kind: "scope", label: "Scope", defaultEnabled: true },
  { kind: "definitions", label: "Definitions", defaultEnabled: true },
  { kind: "responsibilities", label: "Roles & Responsibilities", defaultEnabled: true },
  { kind: "procedure", label: "Procedure", defaultEnabled: true },
  { kind: "monitoring", label: "Monitoring & KPIs", defaultEnabled: true },
  { kind: "training", label: "Training & Awareness", defaultEnabled: true },
  { kind: "records", label: "Records", defaultEnabled: true },
  { kind: "references", label: "References", defaultEnabled: true },
  { kind: "compliance", label: "Legal & Regulatory Compliance", defaultEnabled: true },
  { kind: "corrective", label: "Non-compliance & Corrective Action", defaultEnabled: false },
  { kind: "review", label: "Review & Amendment", defaultEnabled: true },
  { kind: "appendix", label: "Appendix", defaultEnabled: false },
];

export const DEFAULT_ENABLED_SOP_SECTION_KINDS: ReadonlySet<SopSectionKind> = new Set(
  SOP_SECTION_KINDS.filter((entry) => entry.defaultEnabled).map((entry) => entry.kind)
);

export function sopSectionLabel(kind: SopSectionKind): string {
  return SOP_SECTION_KINDS.find((entry) => entry.kind === kind)?.label ?? "Section";
}

/* ------------------------------------------------------------------ */
/* SOP                                                                 */
/* ------------------------------------------------------------------ */

export interface Sop {
  id: string;
  /** Topic id in the SOP catalog this SOP was created from. */
  catalogId?: string;
  /** Auto-generated as "{PREFIX}-{DEPT}-NNN"; editable. */
  code: string;
  title: string;
  pillar: SopPillar;
  department: string;
  owner: string;
  version: string;
  enabled: boolean;
  status: SopStatus;
  sections: SopSection[];
}

/* ------------------------------------------------------------------ */
/* Manual                                                              */
/* ------------------------------------------------------------------ */

export interface SopManualControl {
  docNo: string;
  revision: string;
  supersedes: string;
  effectiveDate: string;
  reviewFrequency: string;
  nextReviewDate: string;
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
  classification: string;
}

export type SopCoreValue = { title: string; description: string };

export interface SopFrontMatter {
  introduction: RichTextBlock[];
  objective: RichTextBlock[];
  benefits: string[];
  /** Seeded from the company's sites. */
  sites: Site[];
  coreValues: SopCoreValue[];
  howToUse: RichTextBlock[];
  glossary: SopDefinitionRow[];
}

export type SopSignatory = { role: string; name: string; designation: string; date: string };

export interface SopApproval {
  statement: string;
  signatories: SopSignatory[];
}

export interface SopClosing {
  reviewMechanism: RichTextBlock[];
  revisionHistory: RevisionEntry[];
  approval: SopApproval;
}

export interface SopThemeOptions {
  accent: string;
  fontPair: string;
  pageSize: SopPageSize;
  showSopHeaderCard: boolean;
}

export type SopCoverVariant = "template" | "upload" | "ai";

export interface SopCover {
  variant: SopCoverVariant;
  /** Uploaded full-bleed image (variant "upload"). */
  imageUrl?: string;
  /** Saved cover library composition for "upload" or "ai" covers. */
  composition?: CoverComposition;
  /** Cover library template id, when the cover came from the shared library. */
  libraryTemplateId?: string;
}

export interface SopManual {
  id: string;
  company: Company;
  control: SopManualControl;
  grouping: SopGrouping;
  frontMatter: SopFrontMatter;
  sops: Sop[];
  closing: SopClosing;
  theme: SopTemplateId;
  themeOptions: SopThemeOptions;
  cover: SopCover;
}
