import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { compileSopManual } from "../typst/compile";
import { sopFontFiles } from "../typst/fonts";
import sample from "./fixtures/sample-manual.json";
import { createEmptyManual, createEmptySop } from "./initial-manual";
import { buildSopRenderModel, departmentCode, formatManualDate, suggestSopCodes } from "./render-model";
import { SOP_TEMPLATE_IDS, type SopManual } from "./types";

const p = (text: string) => ({ id: "b", type: "paragraph" as const, text });

/** A realistic manual built through the real domain model from the generated sample. */
function sampleManual(): SopManual {
  const manual = createEmptyManual();
  manual.company.name = "Meridian Textiles Pvt Ltd";
  manual.control.docNo = "MTPL/SOP/01";
  manual.control.effectiveDate = "2026-11-01";
  manual.control.nextReviewDate = "2027-10-31";
  manual.control.preparedBy = "EHS Manager";
  manual.control.approvedBy = "Managing Director";
  manual.frontMatter.introduction = sample.front.introduction.map(p);
  manual.frontMatter.sites = [{ location: "Unit 1", address: "SIPCOT Perundurai, Erode", primaryFunction: "Dyeing" }];
  manual.sops = sample.sops.map((source) => {
    const sop = createEmptySop({ title: source.title, pillar: source.pillar as "E" | "S" | "G", department: source.department, owner: source.owner });
    sop.sections = sop.sections.map((section) => {
      switch (section.kind) {
        case "purpose": return { ...section, blocks: [p(source.purpose)] };
        case "scope": return { ...section, blocks: [p(source.scope)] };
        case "definitions": return { ...section, rows: source.definitions };
        case "responsibilities": return { ...section, rows: source.responsibilities };
        case "procedure": return { ...section, steps: source.procedure.map((step, index) => ({ id: `s${index}`, heading: step.heading, body: [p(step.body)], responsible: step.responsible, substeps: step.substeps.map((text, sub) => ({ id: `s${index}-${sub}`, text })) })) };
        case "monitoring": return { ...section, kpis: source.kpis };
        case "training": return { ...section, blocks: [p(source.training)] };
        case "records": return { ...section, rows: source.records };
        case "references": return { ...section, items: source.references };
        case "review": return { ...section, blocks: [p(source.review)] };
        default: return section;
      }
    });
    return sop;
  });
  return manual;
}

test("formats ISO dates and keeps free text", () => {
  assert.equal(formatManualDate("2026-11-01"), "01 Nov 2026");
  assert.equal(formatManualDate("As approved"), "As approved");
});

test("suggests per-department SOP codes from the document number", () => {
  const manual = sampleManual();
  const codes = suggestSopCodes(manual);
  assert.equal(codes.get(manual.sops[0].id), "MTPL-EHS-001");
  assert.equal(departmentCode("Human Resources"), "HR");
  assert.equal(new Set(codes.values()).size, manual.sops.length, "codes are unique");
});

test("numbers SOPs in pillar order and drops empty sections", () => {
  const manual = sampleManual();
  manual.sops[0].sections.find((section) => section.kind === "training")!.enabled = true;
  (manual.sops[0].sections.find((section) => section.kind === "training") as { blocks: unknown[] }).blocks = [];
  const model = buildSopRenderModel(manual);
  assert.deepEqual(model.chapters.map((chapter) => chapter.label), ["Environmental", "Social", "Governance"]);
  assert.equal(model.chapters.flatMap((chapter) => chapter.sops).map((sop) => sop.number).join(","), "1,2,3,4,5,6,7,8,9,10,11,12");
  const first = model.chapters[0].sops[0];
  assert.ok(!first.sections.some((section) => section.kind === "training"), "empty training section is hidden");
  assert.equal(first.sections[0].number, "1.0");
  const procedure = first.sections.find((section) => section.kind === "procedure")!;
  assert.match(procedure.steps![0].number, /^\d+\.1$/);
});

test("lays out every template, and a single-SOP preview quickly", () => {
  const root = process.cwd();
  const workspace = join(root, ".typst-workspace");
  const compiler = NodeCompiler.create({ workspace, fontArgs: [{ fontPaths: sopFontFiles(root) }] });
  const template = readFileSync(join(root, "lib", "typst", "sop", "manual.typ"), "utf8");
  const manual = sampleManual();
  for (const theme of SOP_TEMPLATE_IDS) {
    const full = compileSopManual(compiler, template, buildSopRenderModel({ ...manual, theme }), [], workspace);
    assert.ok(full.pageCount > 40, `${theme}: ${full.pageCount} pages`);
  }
  const started = performance.now();
  const one = compileSopManual(compiler, template, buildSopRenderModel(manual, { onlySopIds: [manual.sops[3].id], includeEmptySections: true }), [], workspace);
  const elapsed = performance.now() - started;
  assert.ok(one.pageCount >= 2 && one.pageCount <= 8, `preview has ${one.pageCount} pages`);
  assert.ok(elapsed < 1_500, `single-SOP preview took ${elapsed.toFixed(0)}ms`);
});

test("an older manual keeps the default title, cover and control cells", () => {
  const manual = sampleManual();
  const model = buildSopRenderModel(manual);
  assert.equal(model.title, "SOP Manual");
  assert.equal(model.cover.title, "SOP Manual");
  assert.equal(model.cover.subtitle, "Meridian Textiles Pvt Ltd  |  Environmental, Social and Governance procedures");
  assert.equal(model.control.issueDate, "");
  assert.equal(model.control.lastReviewDate, "");
  assert.equal(model.control.supersedes, "");
  // The stand-in first issue row names the manual's own reviewer and approver.
  assert.deepEqual(model.closing.revisions, [{ revision: "01", date: "01 Nov 2026", description: "First issue of the SOP manual.", reviewedBy: manual.control.reviewedBy, approvedBy: "Managing Director" }]);
});

test("manual title, subtitle, issue and last review dates reach the render model", () => {
  const manual = sampleManual();
  Object.assign(manual.control, { title: "  ESG SOP Manual ", subtitle: "Company-wide procedures", supersedes: "Rev 00", issueDate: "2026-10-28", lastReviewDate: "2026-10-20" });
  manual.closing.revisionHistory = [
    { revisionNo: "00", date: "2025-11-01", description: "First issue." },
    { revisionNo: "01", date: "2026-11-01", description: "Annual review.", reviewedBy: "Plant Head ", approvedBy: "Managing Director" },
  ];
  const model = buildSopRenderModel(manual);
  assert.equal(model.title, "ESG SOP Manual");
  assert.equal(model.cover.title, "ESG SOP Manual");
  assert.equal(model.cover.subtitle, "Company-wide procedures");
  assert.equal(model.cover.eyebrow, "Standard Operating Procedures");
  assert.equal(model.control.supersedes, "Rev 00");
  assert.equal(model.control.issueDate, "28 Oct 2026");
  assert.equal(model.control.lastReviewDate, "20 Oct 2026");
  assert.deepEqual(model.closing.revisions.map((row) => [row.reviewedBy, row.approvedBy]), [["", ""], ["Plant Head", "Managing Director"]]);
});

async function pdfPages(pdf: Uint8Array): Promise<string[]> {
  const doc = await getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const items = (await (await doc.getPage(n)).getTextContent()).items as Array<{ str: string }>;
    // Typst places words as separate runs; compare without spaces.
    pages.push(items.map((item) => item.str).join("").replace(/\s+/g, ""));
  }
  await doc.destroy();
  return pages;
}

test("PDF prints the classification instead of \"Controlled copy\", and the new control fields", async () => {
  const root = process.cwd();
  const workspace = join(root, ".typst-workspace");
  const compiler = NodeCompiler.create({ workspace, fontArgs: [{ fontPaths: sopFontFiles(root) }] });
  const template = readFileSync(join(root, "lib", "typst", "sop", "manual.typ"), "utf8");
  const manual = sampleManual();
  Object.assign(manual.control, { title: "ESG SOP Manual", classification: "Internal", supersedes: "Rev 00", issueDate: "2026-10-28", lastReviewDate: "2026-10-20" });
  manual.closing.revisionHistory = [{ revisionNo: "01", date: "2026-11-01", description: "Annual review.", reviewedBy: "Plant Head", approvedBy: "Managing Director" }];
  const pages = await pdfPages(compileSopManual(compiler, template, buildSopRenderModel({ ...manual, theme: "controlled-manual" }), [], workspace).pdf);
  const all = pages.join("\n");
  assert.doesNotMatch(all, /controlledcopy/i);
  // Cover: title, the classification panel and the control grid with the optional cells.
  assert.match(pages[0], /ESGSOPManual/);
  assert.match(pages[0], /INTERNAL/);
  for (const label of ["SUPERSEDES", "ISSUEDATE", "LASTREVIEW"]) assert.match(pages[0], new RegExp(label));
  assert.match(pages[0], /28Oct2026/);
  // Running header and footer.
  assert.match(pages[1], /ESGSOPManual/);
  assert.match(pages[1], /Supersedes:Rev00/);
  assert.match(pages[1], /Issuedate:28Oct2026/);
  assert.match(pages[1], /Lastreview:20Oct2026/);
  assert.match(pages[1], /Internal\|Page2of/);
  assert.match(pages.at(-2)! + pages.at(-1)!, /ReviewedbyApprovedby/);

  // Without a classification the footer falls back to "Controlled copy"; no optional cells.
  const plain = sampleManual();
  plain.control.classification = "";
  const plainPages = await pdfPages(compileSopManual(compiler, template, buildSopRenderModel({ ...plain, theme: "controlled-manual" }), [], workspace).pdf);
  assert.match(plainPages[1], /Controlledcopy\|Page2of/);
  assert.match(plainPages[0], /CONTROLLEDCOPY/);
  assert.doesNotMatch(plainPages.join("\n"), /Supersedes|ISSUEDATE|LASTREVIEW/);
});
