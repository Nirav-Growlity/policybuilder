import { createEmptySopCompany, createEmptySopSection, createSopId } from "../sop/initial-manual";
import { DEFAULT_SOP_TEMPLATE_ID, type SopSectionKind } from "../sop/types";
import type { Company } from "../types";
import type { HandbookOutlineEntry } from "./catalog";
import type { HandbookChapter, HandbookFacts, HandbookManual, HandbookPartId, HandbookSection } from "./types";

export const createHandbookId = createSopId;

/** One sub-section of a chapter, empty, carrying the shape its kind needs. */
export function createHandbookSection(kind: SopSectionKind, title?: string): HandbookSection {
  return createEmptySopSection(kind, { title: title ?? (kind === "custom" ? "New Section" : undefined), enabled: true });
}

export type CreateChapterOptions = {
  title?: string;
  catalogId?: string;
  part?: HandbookPartId;
  owner?: string;
  outline?: readonly HandbookOutlineEntry[];
};

/** Sections a chapter without a catalog outline starts with. */
const DEFAULT_OUTLINE: readonly HandbookOutlineEntry[] = [
  { kind: "purpose", title: "Purpose" },
  { kind: "custom", title: "Guidelines" },
  { kind: "procedure", title: "Procedure" },
];

export function createEmptyChapter(options: CreateChapterOptions = {}): HandbookChapter {
  const outline = options.outline?.length ? options.outline : DEFAULT_OUTLINE;
  return {
    id: createHandbookId("chapter"),
    catalogId: options.catalogId,
    code: "",
    title: options.title ?? "",
    part: options.part ?? "working",
    owner: options.owner ?? "",
    enabled: true,
    status: "empty",
    sections: outline.map((entry) => createHandbookSection(entry.kind, entry.title)),
  };
}

export function createEmptyHandbookFacts(): HandbookFacts {
  return { workingHours: "", weeklyOff: "", probation: "", noticePeriod: "", payday: "", leave: [] };
}

export const DEFAULT_ACKNOWLEDGEMENT =
  "I confirm that I have received, read and understood the Employee Handbook, and I agree to follow the policies and procedures it describes. I understand that the Company may revise the handbook and will tell me when it does.";

export function createEmptyHandbook(options: { company?: Company; chapters?: HandbookChapter[] } = {}): HandbookManual {
  const company = options.company ?? createEmptySopCompany();
  return {
    id: createHandbookId("handbook"),
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
    grouping: "part",
    frontMatter: {
      welcome: [],
      about: [],
      vision: "",
      mission: "",
      coreValues: [],
      purpose: [],
      howToUse: [],
      sites: [...(company.sites ?? [])],
      glossary: [],
    },
    chapters: options.chapters ?? [],
    closing: {
      reviewMechanism: [],
      revisionHistory: [],
      approval: { statement: "", signatories: [] },
      acknowledgement: DEFAULT_ACKNOWLEDGEMENT,
    },
    theme: DEFAULT_SOP_TEMPLATE_ID,
    themeOptions: { accent: "", fontPair: "", pageSize: "A4", showSopHeaderCard: false },
    cover: { variant: "template" },
  };
}
