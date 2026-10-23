/**
 * Domain model for Employee Handbooks, the second "Documents" type.
 *
 * A handbook is catalog-driven like an SOP manual, but its parts are
 * chapters (Working hours, Leave, Code of conduct, Grievance…) grouped under
 * handbook parts rather than ESG pillars. A chapter's sections reuse the SOP
 * section shapes, so the same editors, AI wire format and renderers apply;
 * unlike an SOP, a chapter has no fixed skeleton and may hold several
 * free-titled ("custom") sections.
 */
import type { Company, RevisionEntry, RichTextBlock, Site } from "../types";
import type {
  SopApproval,
  SopCompanyFacts,
  SopCoreValue,
  SopCover,
  SopDefinitionRow,
  SopManualControl,
  SopSection,
  SopSectionKind,
  SopTemplateId,
  SopThemeOptions,
} from "../sop/types";

export type HandbookPartId =
  | "joining"
  | "working"
  | "pay"
  | "growth"
  | "conduct"
  | "respect"
  | "wellbeing"
  | "voice"
  | "leaving";

export const HANDBOOK_PARTS: ReadonlyArray<{ id: HandbookPartId; label: string; summary: string }> = [
  { id: "joining", label: "Joining the Company", summary: "How people are hired, welcomed and confirmed in their roles." },
  { id: "working", label: "Working Here", summary: "Hours, attendance, leave and the everyday rules of the workplace." },
  { id: "pay", label: "Pay and Benefits", summary: "How pay is set and paid, and the benefits employees receive." },
  { id: "growth", label: "Growth and Performance", summary: "Appraisals, learning and how careers move forward." },
  { id: "conduct", label: "Conduct and Ethics", summary: "The standards of behaviour everyone is expected to keep." },
  { id: "respect", label: "A Fair and Respectful Workplace", summary: "Equal opportunity, dignity at work and respect for human rights." },
  { id: "wellbeing", label: "Health, Safety and Well-being", summary: "Keeping people safe, healthy and supported." },
  { id: "voice", label: "Speaking Up", summary: "How to raise a concern, a grievance or a suggestion without fear." },
  { id: "leaving", label: "Leaving the Company", summary: "Resignation, separation and what happens on the way out." },
];

export const HANDBOOK_PART_IDS: readonly HandbookPartId[] = HANDBOOK_PARTS.map((part) => part.id);

export function handbookPartLabel(part: HandbookPartId | string): string {
  return HANDBOOK_PARTS.find((entry) => entry.id === part)?.label ?? "General";
}

export type HandbookGrouping = "part" | "none";

export type HandbookChapterStatus = "empty" | "generating" | "draft" | "reviewed";

/** Sub-section kinds a chapter may hold. Chapters have no fixed skeleton. */
export const HANDBOOK_SECTION_KINDS: ReadonlyArray<{ kind: SopSectionKind; label: string }> = [
  { kind: "custom", label: "Text" },
  { kind: "procedure", label: "Steps" },
  { kind: "appendix", label: "Form or annexure" },
];

export type HandbookSection = SopSection;

export interface HandbookChapter {
  id: string;
  /** Topic id in the handbook catalog this chapter was created from. */
  catalogId?: string;
  /** Optional chapter number such as "HR-05"; most handbooks leave it empty. */
  code: string;
  title: string;
  part: HandbookPartId;
  /** Role that owns the chapter, e.g. "HR Manager". */
  owner: string;
  enabled: boolean;
  status: HandbookChapterStatus;
  sections: HandbookSection[];
}

export interface HandbookFrontMatter {
  welcome: RichTextBlock[];
  about: RichTextBlock[];
  vision: string;
  mission: string;
  coreValues: SopCoreValue[];
  purpose: RichTextBlock[];
  howToUse: RichTextBlock[];
  /** Seeded from the company's sites. */
  sites: Site[];
  glossary: SopDefinitionRow[];
}

export interface HandbookClosing {
  reviewMechanism: RichTextBlock[];
  revisionHistory: RevisionEntry[];
  approval: SopApproval;
  /** Statement the employee signs to confirm receipt; printed on its own page with a signature block. */
  acknowledgement: string;
}

export type HandbookLeaveRow = { type: string; days: string; notes: string };

/**
 * Employment terms the AI writes from instead of leaving placeholders. All
 * optional; blank fields become [placeholders] in the written chapters.
 */
export interface HandbookFacts {
  /** e.g. "9:30 am to 6:30 pm, Monday to Friday; plant shifts 6-2, 2-10, 10-6". */
  workingHours: string;
  weeklyOff: string;
  probation: string;
  noticePeriod: string;
  /** e.g. "Salary is credited by the 7th of each month". */
  payday: string;
  leave: HandbookLeaveRow[];
}

export interface HandbookManual {
  id: string;
  company: Company;
  control: SopManualControl;
  grouping: HandbookGrouping;
  frontMatter: HandbookFrontMatter;
  chapters: HandbookChapter[];
  closing: HandbookClosing;
  theme: SopTemplateId;
  themeOptions: SopThemeOptions;
  cover: SopCover;
  /** Profile, certifications, laws and contacts, shared with SOP manuals. */
  facts?: SopCompanyFacts;
  handbookFacts?: HandbookFacts;
}
