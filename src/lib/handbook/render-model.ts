/**
 * Turns a saved employee handbook into the render model shared with SOP
 * manuals (lib/sop/render-types.ts), so the same Typst template and Word
 * generator lay it out: handbook parts become the chapters of the model and
 * each handbook chapter becomes one numbered item.
 */
import { resolveSopDesign, SOP_PAGE_SIZES } from "../sop/design/resolve";
import { companyFactSections, formatManualDate, renderSections, toRenderBlocks, type SopRenderOptions } from "../sop/render-model";
import type { RenderBlock, RenderChapter, RenderFrontSection, RenderLabels, RenderSop, SopRenderModel } from "../sop/render-types";
import { HANDBOOK_PARTS, handbookPartLabel, type HandbookChapter, type HandbookManual } from "./types";

export const HANDBOOK_RENDER_LABELS: RenderLabels = {
  item: "Chapter",
  itemSingular: "chapter",
  itemPlural: "chapters",
  department: "Part",
  group: "Part",
  stats: ["Handbook chapters", "Parts", "Sites covered"],
  cardStats: ["Chapters in this handbook", "Parts", "Sites covered"],
  document: "employee handbook",
};

/** Lines the employee fills in on the acknowledgement page. */
export const ACKNOWLEDGEMENT_FIELDS = ["Employee name", "Employee code", "Designation", "Department", "Signature", "Date"] as const;

export type HandbookRenderOptions = Omit<SopRenderOptions, "onlySopIds"> & {
  /** Render only these chapters (preview of one chapter); front matter and closing are dropped. */
  onlyChapterIds?: string[];
};

export function buildHandbookRenderModel(manual: HandbookManual, options: HandbookRenderOptions = {}): SopRenderModel {
  const accent = manual.themeOptions.accent;
  const design = resolveSopDesign({
    templateId: manual.theme,
    accent: accent === "" ? (manual.company.logoPalette ? "brand" : "") : accent === "template" ? "" : accent,
    fontPair: manual.themeOptions.fontPair,
    showSopHeaderCard: manual.themeOptions.showSopHeaderCard,
    logoPalette: manual.company.logoPalette,
  });
  const control = {
    docNo: manual.control.docNo,
    revision: manual.control.revision,
    supersedes: manual.control.supersedes,
    effectiveDate: formatManualDate(manual.control.effectiveDate),
    nextReviewDate: formatManualDate(manual.control.nextReviewDate),
    reviewFrequency: manual.control.reviewFrequency,
    preparedBy: manual.control.preparedBy,
    reviewedBy: manual.control.reviewedBy,
    approvedBy: manual.control.approvedBy,
    classification: manual.control.classification,
    issueDate: formatManualDate(manual.control.issueDate),
    lastReviewDate: formatManualDate(manual.control.lastReviewDate),
  };
  const title = manual.control.title?.trim() || "Employee Handbook";
  const enabled = manual.chapters.filter((chapter) => chapter.enabled);
  const includeEmpty = Boolean(options.includeEmptySections);

  let position = 0;
  const toRenderItem = (chapter: HandbookChapter): RenderSop => {
    position += 1;
    return {
      id: chapter.id,
      anchor: `chapter-item-${position}`,
      number: String(position),
      // The running header and contents need a code; most handbooks number chapters instead.
      code: chapter.code.trim() || `Chapter ${position}`,
      title: chapter.title || "Untitled chapter",
      pillar: "S",
      pillarLabel: handbookPartLabel(chapter.part),
      color: design.palette.primary,
      department: handbookPartLabel(chapter.part),
      owner: chapter.owner,
      version: manual.control.revision || "01",
      effectiveDate: control.effectiveDate,
      nextReviewDate: control.nextReviewDate,
      preparedBy: control.preparedBy,
      approvedBy: control.approvedBy,
      sections: renderSections(chapter, includeEmpty),
    };
  };

  const groups = manual.grouping === "part"
    ? HANDBOOK_PARTS.map((part) => ({ id: part.id, label: part.label, summary: part.summary, chapters: enabled.filter((chapter) => chapter.part === part.id) }))
    : [{ id: "all", label: "", summary: "", chapters: enabled }];
  const only = options.onlyChapterIds ? new Set(options.onlyChapterIds) : null;
  const chapters: RenderChapter[] = groups
    .filter((group) => group.chapters.length > 0)
    .map((group, index) => {
      const items = group.chapters.map(toRenderItem);
      return {
        id: group.id,
        anchor: `part-${index + 1}`,
        label: only ? "" : group.label,
        summary: group.summary,
        color: design.palette.primary,
        sops: only ? items.filter((item) => only.has(item.id)) : items,
      };
    })
    .filter((chapter) => chapter.sops.length > 0);

  const front = manual.frontMatter;
  const company = manual.company.name || "the Company";
  const vision = front.vision.trim();
  const mission = front.mission.trim();
  const visionBlocks: RenderBlock[] = vision && mission
    ? [{ type: "table", columns: ["Our vision", "Our mission"], widths: [1, 1], rows: [[vision, mission]] }]
    : [...(vision ? [{ type: "p" as const, text: `Our vision: ${vision}` }] : []), ...(mission ? [{ type: "p" as const, text: `Our mission: ${mission}` }] : [])];
  const frontMatter: RenderFrontSection[] = only ? [] : [
    { id: "welcome", title: "Welcome", blocks: toRenderBlocks(front.welcome) },
    { id: "about", title: "About the Company", blocks: toRenderBlocks(front.about) },
    { id: "vision", title: "Vision and Mission", blocks: visionBlocks },
    {
      id: "values",
      title: "Our Values",
      blocks: front.coreValues.length ? [{ type: "table" as const, columns: ["Value", "What it means here"], widths: [1, 3], rows: front.coreValues.map((value) => [value.title, value.description]) }] : [],
    },
    { id: "purpose", title: "Purpose of this Handbook", blocks: toRenderBlocks(front.purpose) },
    {
      id: "scope",
      title: "Scope and Applicability",
      blocks: front.sites.length ? [
        { type: "p" as const, text: `This handbook applies to every employee of ${company} at the sites listed below, and to trainees and contract staff where a chapter says so.` },
        { type: "table" as const, columns: ["Sr.", "Site", "Address", "Primary function"], widths: [0.4, 1.4, 2.4, 1.6], rows: front.sites.map((site, index) => [String(index + 1), site.location || "", site.address, site.primaryFunction || ""]) },
      ] : [],
    },
    ...companyFactSections(manual, "handbook"),
    { id: "how-to-use", title: "How to Use this Handbook", blocks: toRenderBlocks(front.howToUse) },
    {
      id: "glossary",
      title: "Glossary",
      blocks: front.glossary.length ? [{ type: "table" as const, columns: ["Term", "Meaning"], widths: [1, 3], rows: front.glossary.map((row) => [row.term, row.definition]) }] : [],
    },
  ]
    .filter((section) => section.blocks.length > 0 || includeEmpty)
    .map((section) => ({ ...section, anchor: `front-${section.id}`, number: "", kind: section.id }));

  const signatories = manual.closing.approval.signatories.length
    ? manual.closing.approval.signatories
    : [
      { role: "Prepared by", name: "", designation: control.preparedBy, date: "" },
      { role: "Reviewed by", name: "", designation: control.reviewedBy, date: "" },
      { role: "Approved by", name: "", designation: control.approvedBy, date: "" },
    ].filter((row) => row.designation);
  const revisions = manual.closing.revisionHistory.length
    ? manual.closing.revisionHistory.map((entry) => ({ revision: entry.revisionNo, date: formatManualDate(entry.date), description: entry.description, reviewedBy: entry.reviewedBy?.trim() ?? "", approvedBy: entry.approvedBy?.trim() ?? "" }))
    : [{ revision: control.revision || "01", date: control.effectiveDate, description: "First issue of the employee handbook.", reviewedBy: control.reviewedBy.trim(), approvedBy: control.approvedBy.trim() }];
  const reviewBlocks = toRenderBlocks(manual.closing.reviewMechanism);
  const acknowledgement = manual.closing.acknowledgement.trim();

  const page = manual.themeOptions.pageSize === "Letter" ? "Letter" : "A4";
  return {
    version: 1,
    mode: only ? "sops" : "full",
    kind: "handbook",
    labels: HANDBOOK_RENDER_LABELS,
    design,
    page: { size: page, ...SOP_PAGE_SIZES[page] },
    title,
    company: { name: manual.company.name, logo: options.logoPath ?? null, industry: manual.company.industryDetail || manual.company.subCategory || manual.company.industry },
    control,
    cover: {
      image: options.coverImagePath ?? null,
      eyebrow: "Employee Handbook",
      title,
      subtitle: manual.control.subtitle?.trim() || manual.company.name,
    },
    stats: {
      sopCount: enabled.length,
      departmentCount: new Set(enabled.map((chapter) => chapter.part)).size,
      siteCount: front.sites.length,
      chapterLabels: chapters.map((chapter) => chapter.label).filter(Boolean),
    },
    frontMatter,
    chapters,
    closing: {
      sections: only ? [] : (reviewBlocks.length || includeEmpty ? [{ id: "review", anchor: "closing-review", number: "", title: "Review Mechanism", kind: "review", blocks: reviewBlocks }] : []),
      revisions,
      approval: { statement: manual.closing.approval.statement, signatories },
      anchors: { revisions: "closing-revisions", approval: "closing-approval" },
      after: only || !acknowledgement ? [] : [{
        id: "acknowledgement",
        anchor: "closing-acknowledgement",
        number: "",
        title: "Employee Acknowledgement",
        kind: "acknowledgement",
        blocks: [
          { type: "p", text: acknowledgement },
          { type: "table", columns: ["Detail", "Entry"], widths: [1.2, 3], rows: ACKNOWLEDGEMENT_FIELDS.map((field) => [field, ""]) },
          { type: "p", text: "Sign this page and return it to the Human Resources department. A copy is kept in your personnel file." },
        ],
      }],
    },
  };
}
