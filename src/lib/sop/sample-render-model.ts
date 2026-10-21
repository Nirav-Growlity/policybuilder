/**
 * Turns the generated sample manual (lib/sop/fixtures/sample-manual.json)
 * into a render model for any template. Used by template previews, the
 * PDF/DOCX parity script and render tests, so they all share one realistic
 * manual instead of lorem ipsum.
 */
import sample from "./fixtures/sample-manual.json";
import { resolveSopDesign, SOP_PAGE_SIZES, type SopDesignOptions } from "./design/resolve";
import type { RenderBlock, RenderChapter, RenderSection, RenderSop, SopRenderModel } from "./render-types";

const PILLAR_LABELS = { E: "Environmental", S: "Social", G: "Governance" } as const;
const PILLAR_SUMMARY = {
  E: "How the sites control waste, chemicals, energy, water and emissions.",
  S: "How the company keeps people safe, hires fairly and resolves concerns.",
  G: "How decisions, data and suppliers are kept honest and accountable.",
} as const;

const p = (text: string): RenderBlock => ({ type: "p", text });

type SampleSop = (typeof sample.sops)[number];

function sopSections(sop: SampleSop): RenderSection[] {
  const sections: Array<Omit<RenderSection, "number">> = [
    { id: "purpose", title: "Purpose", kind: "purpose", blocks: [p(sop.purpose)] },
    { id: "scope", title: "Scope", kind: "scope", blocks: [p(sop.scope)] },
    { id: "definitions", title: "Definitions", kind: "definitions", blocks: [{ type: "table", columns: ["Term", "Definition"], widths: [1, 3], rows: sop.definitions.map((row) => [row.term, row.definition]) }] },
    { id: "responsibilities", title: "Roles & Responsibilities", kind: "responsibilities", blocks: [{ type: "table", columns: ["Role", "Responsibilities"], widths: [1, 3], rows: sop.responsibilities.map((row) => [row.role, row.responsibilities]) }] },
    { id: "procedure", title: "Procedure", kind: "procedure", blocks: [], steps: [] },
    { id: "monitoring", title: "Monitoring & KPIs", kind: "monitoring", blocks: [{ type: "table", columns: ["Indicator", "Target", "Frequency", "Owner"], widths: [2.4, 1.4, 1, 1.2], rows: sop.kpis.map((kpi) => [kpi.indicator, kpi.target, kpi.frequency, kpi.owner]) }] },
    { id: "training", title: "Training & Awareness", kind: "training", blocks: [p(sop.training)] },
    { id: "records", title: "Records", kind: "records", blocks: [{ type: "table", columns: ["Record", "Owner", "Retention", "Format"], widths: [2.2, 1.3, 1, 1], rows: sop.records.map((row) => [row.record, row.owner, row.retention, row.format]) }] },
    { id: "references", title: "References", kind: "references", blocks: [{ type: "ul", items: sop.references }] },
    { id: "review", title: "Review & Amendment", kind: "review", blocks: [p(sop.review)] },
  ];
  return sections.map((section, index) => {
    const number = `${index + 1}.0`;
    if (section.kind !== "procedure") return { ...section, number };
    return {
      ...section,
      number,
      steps: sop.procedure.map((step, stepIndex) => ({
        number: `${index + 1}.${stepIndex + 1}`,
        heading: step.heading,
        body: [p(step.body)],
        responsible: step.responsible,
        substeps: step.substeps.map((text, subIndex) => ({ number: `${index + 1}.${stepIndex + 1}.${subIndex + 1}`, text, responsible: "" })),
      })),
    };
  });
}

export function buildSampleRenderModel(options: SopDesignOptions & { pageSize?: "A4" | "Letter"; grouping?: "pillar" | "none"; withLogo?: boolean; coverImage?: string | null }): SopRenderModel {
  const design = resolveSopDesign(options);
  const grouping = options.grouping ?? (design.chapterDivider === "none" ? "none" : "pillar");
  const pageSize = options.pageSize ?? "A4";
  const control = {
    docNo: "MTPL/SOP/01", revision: "01", supersedes: "Rev 00 (01 Nov 2025)", effectiveDate: "01 Nov 2026", nextReviewDate: "31 Oct 2027",
    reviewFrequency: "Annual", preparedBy: "EHS Manager", reviewedBy: "Plant Head", approvedBy: "Managing Director", classification: "Internal",
    issueDate: "28 Oct 2026", lastReviewDate: "20 Oct 2026",
  };
  const title = "ESG SOP Manual";
  let position = 0;
  const toSop = (sop: SampleSop): RenderSop => {
    position += 1;
    const pillar = sop.pillar as "E" | "S" | "G";
    return {
      id: sop.code, anchor: `sop-${position}`, number: String(position), code: sop.code, title: sop.title,
      pillar, pillarLabel: PILLAR_LABELS[pillar], color: grouping === "pillar" ? design.palette.pillars[pillar] : design.palette.primary,
      department: sop.department, owner: sop.owner, version: "1.0", effectiveDate: control.effectiveDate,
      nextReviewDate: control.nextReviewDate, preparedBy: control.preparedBy, approvedBy: control.approvedBy,
      sections: sopSections(sop),
    };
  };
  const chapters: RenderChapter[] = grouping === "pillar"
    ? (["E", "S", "G"] as const).map((pillar) => ({
      id: pillar, anchor: `chapter-${pillar}`, label: PILLAR_LABELS[pillar], summary: PILLAR_SUMMARY[pillar],
      color: design.palette.pillars[pillar], sops: sample.sops.filter((sop) => sop.pillar === pillar).map(toSop),
    }))
    : [{ id: "all", anchor: "chapter-all", label: "", summary: "", color: design.palette.primary, sops: sample.sops.map(toSop) }];
  const front = sample.front;
  return {
    version: 1,
    mode: "full",
    design,
    page: { size: pageSize, ...SOP_PAGE_SIZES[pageSize] },
    title,
    company: { name: "Meridian Textiles Pvt Ltd", logo: options.withLogo ? "/assets/logo.png" : null, industry: "Textile dyeing and finishing" },
    control,
    cover: { image: options.coverImage ?? null, eyebrow: "Standard Operating Procedures", title, subtitle: "Meridian Textiles Pvt Ltd  |  Environmental, Social and Governance procedures" },
    stats: { sopCount: sample.sops.length, departmentCount: new Set(sample.sops.map((sop) => sop.department)).size, siteCount: 3, chapterLabels: chapters.map((chapter) => chapter.label).filter(Boolean) },
    frontMatter: [
      { id: "introduction", anchor: "front-introduction", number: "", title: "Introduction", kind: "introduction", blocks: front.introduction.map(p) },
      { id: "objective", anchor: "front-objective", number: "", title: "Objective of the Manual", kind: "objective", blocks: [p(front.objective), { type: "ul", items: front.benefits }] },
      { id: "scope", anchor: "front-scope", number: "", title: "Scope and Applicability", kind: "scope", blocks: [
        p("This manual applies to every site, department, employee, contractor and visitor of Meridian Textiles Pvt Ltd listed below."),
        { type: "table", columns: ["Sr.", "Site", "Address", "Primary function"], widths: [0.4, 1.4, 2.4, 1.6], rows: [
          ["1", "Unit 1 Dyeing House", "SIPCOT Perundurai, Erode, Tamil Nadu", "Dyeing and finishing"],
          ["2", "Unit 2 ETP and Warehouse", "SIPCOT Perundurai, Erode, Tamil Nadu", "Effluent treatment, chemical and finished goods storage"],
          ["3", "Head Office", "Avinashi Road, Coimbatore, Tamil Nadu", "Administration, HR, procurement, IT"],
        ] },
      ] },
      { id: "contacts", anchor: "front-contacts", number: "", title: "Key Contacts", kind: "contacts", blocks: [
        p("Raise concerns, report incidents and ask questions about this manual through the contacts below."),
        { type: "table", columns: ["Purpose", "Name", "Phone", "Email"], widths: [1.4, 1.4, 1.2, 2], rows: [
          ["Ethics & compliance", "S. Meena, Compliance Officer", "+91 424 253 1100", "ethics@meridiantextiles.in"],
          ["Grievance", "HR Manager", "+91 424 253 1120", "grievance@meridiantextiles.in"],
          ["EHS / emergency", "R. Karthik, EHS Manager", "+91 98430 21100", "ehs@meridiantextiles.in"],
          ["Customer helpline", "Customer Service Desk", "1800 425 7700", "care@meridiantextiles.in"],
        ] },
      ] },
      { id: "certifications", anchor: "front-certifications", number: "", title: "Certifications and Standards", kind: "certifications", blocks: [
        p("Meridian Textiles Pvt Ltd holds the certifications and follows the standards listed below. The procedures in this manual support continued conformity with them."),
        { type: "ul", items: ["ISO 14001:2015 Environmental Management System", "ISO 45001:2018 Occupational Health and Safety Management System", "SA8000:2014 Social Accountability", "OEKO-TEX Standard 100", "ZDHC Wastewater Guidelines"] },
      ] },
      { id: "values", anchor: "front-values", number: "", title: "Core Values", kind: "values", blocks: [{ type: "table", columns: ["Value", "What it means here"], widths: [1, 3], rows: front.coreValues.map((value) => [value.title, value.description]) }] },
      { id: "how-to-use", anchor: "front-how-to-use", number: "", title: "How to Use this Manual", kind: "how-to-use", blocks: [p(front.howToUse)] },
    ],
    chapters,
    closing: {
      sections: [{ id: "review", anchor: "closing-review", number: "", title: "Review Mechanism", kind: "review", blocks: [p(front.reviewMechanism)] }],
      revisions: [
        { revision: "00", date: "01 Nov 2025", description: "First issue of the SOP manual.", reviewedBy: "Plant Head", approvedBy: "Managing Director" },
        { revision: "01", date: "01 Nov 2026", description: "Annual review; added supplier ESG due diligence and grievance handling.", reviewedBy: "S. Meena, Plant Head", approvedBy: "V. Raghavan, Managing Director" },
      ],
      approval: {
        statement: front.approvalStatement,
        signatories: [
          { role: "Prepared by", name: "R. Karthik", designation: "EHS Manager", date: "15 Oct 2026" },
          { role: "Reviewed by", name: "S. Meena", designation: "Plant Head", date: "20 Oct 2026" },
          { role: "Approved by", name: "V. Raghavan", designation: "Managing Director", date: "25 Oct 2026" },
        ],
      },
      anchors: { revisions: "closing-revisions", approval: "closing-approval" },
    },
  };
}
