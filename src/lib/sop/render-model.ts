/**
 * Turns a saved SOP manual into the render model shared by the Typst
 * template (PDF and preview) and the DOCX generator. All numbering, codes,
 * labels, colours and visibility rules are decided here, once.
 */
import type { RichTextBlock } from "../types";
import { resolveSopDesign, SOP_PAGE_SIZES } from "./design/resolve";
import { appendixLetter } from "./initial-manual";
import type { RenderBlock, RenderChapter, RenderFrontSection, RenderSection, RenderSop, SopRenderModel } from "./render-types";
import type { Sop, SopManual, SopPillar, SopRecordRow, SopSection } from "./types";

export const PILLAR_LABELS: Record<SopPillar, string> = { E: "Environmental", S: "Social", G: "Governance" };

const PILLAR_SUMMARIES: Record<SopPillar, string> = {
  E: "Procedures that control the environmental footprint of the sites.",
  S: "Procedures that protect people and keep the workplace fair.",
  G: "Procedures that keep decisions, data and suppliers accountable.",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-01" becomes "01 Nov 2026"; anything else is shown as typed. */
export function formatManualDate(value: string | undefined): string {
  const text = (value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!iso) return text;
  const month = MONTHS[Number(iso[2]) - 1];
  return month ? `${iso[3]} ${month} ${iso[1]}` : text;
}

function lines(text: string) {
  return text.split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter(Boolean);
}

export function toRenderBlocks(blocks: RichTextBlock[] | undefined): RenderBlock[] {
  const out: RenderBlock[] = [];
  for (const block of blocks ?? []) {
    if (block.type === "paragraph") {
      for (const paragraph of block.text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)) {
        out.push({ type: "p", text: paragraph.replace(/\s*\n\s*/g, " ") });
      }
    } else if (block.type === "bullets" || block.type === "numbered") {
      const items = lines(block.text);
      if (items.length) out.push({ type: block.type === "bullets" ? "ul" : "ol", items });
    } else if (block.type === "table" && block.columns?.length) {
      out.push({
        type: "table",
        columns: block.columns,
        widths: block.columns.map(() => 1),
        rows: (block.rows ?? []).map((row) => block.columns!.map((_, index) => row[index] ?? "")),
      });
    }
  }
  return out;
}

/** Department abbreviations used in generated SOP codes. */
const DEPARTMENT_CODES: Record<string, string> = {
  ehs: "EHS", hse: "EHS", "health and safety": "EHS", environment: "ENV", production: "PRD", operations: "OPS",
  quality: "QA", "quality assurance": "QA", "quality control": "QC", hr: "HR", "human resources": "HR",
  procurement: "PUR", purchase: "PUR", purchasing: "PUR", finance: "FIN", accounts: "FIN", it: "IT",
  "information technology": "IT", admin: "ADM", administration: "ADM", legal: "LEG", compliance: "CMP",
  stores: "STR", warehouse: "WH", maintenance: "MNT", engineering: "ENG", utility: "UTL", sales: "SAL",
  marketing: "MKT", logistics: "LOG", "customer service": "CS",
};

export function departmentCode(department: string): string {
  const key = department.trim().toLowerCase();
  if (DEPARTMENT_CODES[key]) return DEPARTMENT_CODES[key];
  const letters = key.replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean);
  if (letters.length > 1) return letters.map((word) => word[0]).join("").slice(0, 4).toUpperCase();
  return (letters[0] ?? "GEN").slice(0, 3).toUpperCase();
}

/** The manual's code prefix: the first part of the document number, or the company initials. */
export function manualCodePrefix(manual: Pick<SopManual, "control" | "company">): string {
  const fromDocNo = manual.control.docNo.split(/[/\-\s.]/).find((part) => /[A-Za-z]/.test(part));
  if (fromDocNo) return fromDocNo.toUpperCase();
  const initials = manual.company.name.replace(/\b(pvt|private|ltd|limited|llp|inc|co)\b\.?/gi, "")
    .split(/\s+/).filter(Boolean).map((word) => word[0]).join("");
  return (initials || "SOP").toUpperCase().slice(0, 5);
}

/** Fills in "{PREFIX}-{DEPT}-NNN" codes for SOPs that have none, numbering per department. */
export function suggestSopCodes(manual: Pick<SopManual, "control" | "company" | "sops">): Map<string, string> {
  const prefix = manualCodePrefix(manual);
  const used = new Set(manual.sops.map((sop) => sop.code.trim()).filter(Boolean));
  const counters = new Map<string, number>();
  const codes = new Map<string, string>();
  for (const sop of manual.sops) {
    if (sop.code.trim()) { codes.set(sop.id, sop.code.trim()); continue; }
    const dept = departmentCode(sop.department || "General");
    let next = counters.get(dept) ?? 0;
    let code: string;
    do { next += 1; code = `${prefix}-${dept}-${String(next).padStart(3, "0")}`; } while (used.has(code));
    counters.set(dept, next);
    used.add(code);
    codes.set(sop.id, code);
  }
  return codes;
}

function sectionHasContent(section: SopSection): boolean {
  switch (section.kind) {
    case "definitions":
    case "responsibilities":
    case "records":
      return section.rows.length > 0;
    case "procedure":
      return section.steps.length > 0;
    case "monitoring":
      return section.kpis.length > 0 || section.narrative.length > 0;
    case "references":
      return section.items.some((item) => item.trim());
    default:
      return section.blocks.some((block) => block.text.trim() || (block.rows?.length ?? 0) > 0);
  }
}

const APPENDIX_WORD = /^(appendix|annexure|annex)(?=$|[^a-z])/i;
/** The letter or number after "Appendix" (upper case only, so "Appendix to…" keeps its words). */
const APPENDIX_MARK = /^\s+(?:[A-Z]{1,2}|\d+)(?=$|[\s:.\-–—])/;

/**
 * Letters each appendix by its place among the appendices that print, so two
 * or more read "Appendix A", "Appendix B"… whatever letters their stored
 * titles carry. A single appendix keeps its title as typed.
 */
export function letterAppendixTitles(titles: readonly string[]): string[] {
  if (titles.length < 2) return [...titles];
  return titles.map((title, index) => {
    const letter = appendixLetter(index);
    const text = title.trim();
    const word = APPENDIX_WORD.exec(text)?.[1];
    const rest = word ? text.slice(word.length).replace(APPENDIX_MARK, "").replace(/^\s*[:.\-–—]?\s*/, "") : text;
    const label = word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : "Appendix";
    return rest ? `${label} ${letter}: ${rest}` : `${label} ${letter}`;
  });
}

/** Records table columns; the "No." column only when some record has a form or record number. */
function recordsTable(rows: SopRecordRow[]): RenderBlock {
  const coded = rows.some((row) => (row.code ?? "").trim());
  return coded
    ? { type: "table", columns: ["No.", "Record", "Owner", "Retention", "Format"], widths: [1.4, 2, 1.2, 1, 1], rows: rows.map((row) => [(row.code ?? "").trim(), row.record, row.owner, row.retention, row.format]) }
    : { type: "table", columns: ["Record", "Owner", "Retention", "Format"], widths: [2.2, 1.3, 1, 1], rows: rows.map((row) => [row.record, row.owner, row.retention, row.format]) };
}

function renderSections(sop: Sop, includeEmpty: boolean): RenderSection[] {
  const visible = sop.sections.filter((section) => section.enabled && (includeEmpty || sectionHasContent(section)));
  const appendices = visible.filter((section) => section.kind === "appendix");
  const appendixTitles = new Map<SopSection, string>(letterAppendixTitles(appendices.map((section) => section.title)).map((title, index) => [appendices[index], title]));
  return visible.map((section, index): RenderSection => {
    const number = `${index + 1}.0`;
    const base = { id: section.id, number, title: appendixTitles.get(section) ?? section.title, kind: section.kind };
    switch (section.kind) {
      case "definitions":
        return { ...base, blocks: section.rows.length ? [{ type: "table", columns: ["Term", "Definition"], widths: [1, 3], rows: section.rows.map((row) => [row.term, row.definition]) }] : [] };
      case "responsibilities":
        return { ...base, blocks: section.rows.length ? [{ type: "table", columns: ["Role", "Responsibilities"], widths: [1, 3], rows: section.rows.map((row) => [row.role, row.responsibilities.filter((item) => item.trim())]) }] : [] };
      case "procedure":
        return {
          ...base,
          blocks: [],
          steps: section.steps.map((step, stepIndex) => ({
            number: `${index + 1}.${stepIndex + 1}`,
            heading: step.heading,
            body: toRenderBlocks(step.body),
            responsible: step.responsible ?? "",
            substeps: (step.substeps ?? []).map((substep, subIndex) => ({
              number: `${index + 1}.${stepIndex + 1}.${subIndex + 1}`,
              text: substep.text,
              responsible: substep.responsible ?? "",
            })),
          })),
        };
      case "monitoring":
        return {
          ...base,
          blocks: [
            ...toRenderBlocks(section.narrative),
            ...(section.kpis.length ? [{ type: "table" as const, columns: ["Indicator", "Target", "Frequency", "Owner"], widths: [2.4, 1.4, 1, 1.2], rows: section.kpis.map((kpi) => [kpi.indicator, kpi.target, kpi.frequency, kpi.owner]) }] : []),
          ],
        };
      case "records":
        return { ...base, blocks: section.rows.length ? [recordsTable(section.rows)] : [] };
      case "references":
        return { ...base, blocks: section.items.some((item) => item.trim()) ? [{ type: "ul", items: section.items.filter((item) => item.trim()) }] : [] };
      default:
        return { ...base, blocks: toRenderBlocks(section.blocks) };
    }
  });
}

export type SopRenderOptions = {
  /** Workspace path of the logo image, when the company has one. */
  logoPath?: string | null;
  /** Workspace path of the cover image (upload, AI cover or template artwork). */
  coverImagePath?: string | null;
  /** Show enabled-but-empty sections (used by the live preview while writing). */
  includeEmptySections?: boolean;
  /** Render only these SOPs (preview of one SOP); front matter and closing are dropped. */
  onlySopIds?: string[];
};

export function buildSopRenderModel(manual: SopManual, options: SopRenderOptions = {}): SopRenderModel {
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
  };
  const codes = suggestSopCodes(manual);
  const enabledSops = manual.sops.filter((sop) => sop.enabled);
  const pillarGrouped = manual.grouping === "pillar";
  let position = 0;
  const toRenderSop = (sop: Sop): RenderSop => {
    position += 1;
    return {
      id: sop.id,
      anchor: `sop-${position}`,
      number: String(position),
      code: codes.get(sop.id) ?? "",
      title: sop.title || "Untitled SOP",
      pillar: sop.pillar,
      pillarLabel: PILLAR_LABELS[sop.pillar],
      color: pillarGrouped ? design.palette.pillars[sop.pillar] : design.palette.primary,
      department: sop.department,
      owner: sop.owner,
      version: sop.version,
      effectiveDate: control.effectiveDate,
      nextReviewDate: control.nextReviewDate,
      preparedBy: control.preparedBy,
      approvedBy: control.approvedBy,
      sections: renderSections(sop, Boolean(options.includeEmptySections)),
    };
  };

  // Chapters keep SOP numbering in reading order (pillar or department order).
  let groups: Array<{ id: string; label: string; summary: string; color: string; sops: Sop[] }>;
  if (manual.grouping === "pillar") {
    groups = (["E", "S", "G"] as const).map((pillar) => ({
      id: pillar, label: PILLAR_LABELS[pillar], summary: PILLAR_SUMMARIES[pillar],
      color: design.palette.pillars[pillar], sops: enabledSops.filter((sop) => sop.pillar === pillar),
    }));
  } else if (manual.grouping === "department") {
    const order: string[] = [];
    for (const sop of enabledSops) {
      const name = sop.department.trim() || "General";
      if (!order.includes(name)) order.push(name);
    }
    groups = order.map((name) => ({
      id: name, label: name, summary: `Procedures owned by ${name}.`, color: design.palette.primary,
      sops: enabledSops.filter((sop) => (sop.department.trim() || "General") === name),
    }));
  } else {
    groups = [{ id: "all", label: "", summary: "", color: design.palette.primary, sops: enabledSops }];
  }
  const only = options.onlySopIds ? new Set(options.onlySopIds) : null;
  const chapters: RenderChapter[] = groups
    .filter((group) => group.sops.length > 0)
    .map((group, index) => {
      const sops = group.sops.map(toRenderSop);
      return {
        id: group.id,
        anchor: `chapter-${index + 1}`,
        label: only ? "" : group.label,
        summary: group.summary,
        color: group.color,
        sops: only ? sops.filter((sop) => only.has(sop.id)) : sops,
      };
    })
    .filter((chapter) => chapter.sops.length > 0);

  const front = manual.frontMatter;
  const frontMatter: RenderFrontSection[] = only ? [] : [
    { id: "introduction", title: "Introduction", blocks: toRenderBlocks(front.introduction) },
    {
      id: "objective",
      title: "Objective of the Manual",
      blocks: [...toRenderBlocks(front.objective), ...(front.benefits.some((item) => item.trim()) ? [{ type: "ul" as const, items: front.benefits.filter((item) => item.trim()) }] : [])],
    },
    {
      id: "scope",
      title: "Scope and Applicability",
      blocks: front.sites.length ? [
        { type: "p" as const, text: `This manual applies to every site, department, employee, contractor and visitor of ${manual.company.name || "the company"} listed below.` },
        { type: "table" as const, columns: ["Sr.", "Site", "Address", "Primary function"], widths: [0.4, 1.4, 2.4, 1.6], rows: front.sites.map((site, index) => [String(index + 1), site.location || "", site.address, site.primaryFunction || ""]) },
      ] : [],
    },
    {
      id: "values",
      title: "Core Values",
      blocks: front.coreValues.length ? [{ type: "table" as const, columns: ["Value", "What it means here"], widths: [1, 3], rows: front.coreValues.map((value) => [value.title, value.description]) }] : [],
    },
    { id: "how-to-use", title: "How to Use this Manual", blocks: toRenderBlocks(front.howToUse) },
    {
      id: "glossary",
      title: "Glossary",
      blocks: front.glossary.length ? [{ type: "table" as const, columns: ["Term", "Meaning"], widths: [1, 3], rows: front.glossary.map((row) => [row.term, row.definition]) }] : [],
    },
  ]
    .filter((section) => section.blocks.length > 0 || options.includeEmptySections)
    .map((section) => ({ ...section, anchor: `front-${section.id}`, number: "", kind: section.id }));

  const signatories = manual.closing.approval.signatories.length
    ? manual.closing.approval.signatories
    : [
      { role: "Prepared by", name: "", designation: control.preparedBy, date: "" },
      { role: "Reviewed by", name: "", designation: control.reviewedBy, date: "" },
      { role: "Approved by", name: "", designation: control.approvedBy, date: "" },
    ].filter((row) => row.designation);
  const revisions = manual.closing.revisionHistory.length
    ? manual.closing.revisionHistory.map((entry) => ({ revision: entry.revisionNo, date: formatManualDate(entry.date), description: entry.description }))
    : [{ revision: control.revision || "01", date: control.effectiveDate, description: "First issue of the SOP manual." }];
  const reviewBlocks = toRenderBlocks(manual.closing.reviewMechanism);

  const page = manual.themeOptions.pageSize === "Letter" ? "Letter" : "A4";
  return {
    version: 1,
    mode: only ? "sops" : "full",
    design,
    page: { size: page, ...SOP_PAGE_SIZES[page] },
    title: "SOP Manual",
    company: { name: manual.company.name, logo: options.logoPath ?? null, industry: manual.company.industryDetail || manual.company.subCategory || manual.company.industry },
    control,
    cover: {
      image: options.coverImagePath ?? null,
      eyebrow: "Standard Operating Procedures",
      title: "SOP Manual",
      subtitle: [manual.company.name, pillarGrouped ? "Environmental, Social and Governance procedures" : ""].filter(Boolean).join("  |  "),
    },
    stats: {
      sopCount: enabledSops.length,
      departmentCount: new Set(enabledSops.map((sop) => sop.department.trim()).filter(Boolean)).size,
      siteCount: front.sites.length,
      chapterLabels: chapters.map((chapter) => chapter.label).filter(Boolean),
    },
    frontMatter,
    chapters,
    closing: {
      sections: only ? [] : (reviewBlocks.length || options.includeEmptySections ? [{ id: "review", anchor: "closing-review", number: "", title: "Review Mechanism", kind: "review", blocks: reviewBlocks }] : []),
      revisions,
      approval: { statement: manual.closing.approval.statement, signatories },
      anchors: { revisions: "closing-revisions", approval: "closing-approval" },
    },
  };
}
