import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
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

test("narrative tables print where they stand, in sections and step bodies; blank tables print nothing", () => {
  const manual = sampleManual();
  const sop = manual.sops[0];
  const table = { id: "t", type: "table" as const, text: "", columns: ["Stream", "Route", "Owner"], rows: [["Sludge", "TSDF", ""]] };
  const blank = { id: "e", type: "table" as const, text: "", columns: ["", ""], rows: [["", ""]] };
  sop.sections = sop.sections.map((section) => {
    if (section.kind === "scope") return { ...section, blocks: [p("Before."), table, p("After."), blank] };
    if (section.kind === "procedure") return { ...section, steps: section.steps.map((step, index) => (index === 0 ? { ...step, body: [table, p("Then.")] } : step)) };
    if (section.kind === "training") return { ...section, enabled: true, blocks: [blank] };
    return section;
  });
  const rendered = buildSopRenderModel(manual).chapters.flatMap((chapter) => chapter.sops).find((item) => item.title === sop.title)!;
  const scope = rendered.sections.find((section) => section.kind === "scope")!;
  assert.deepEqual(scope.blocks.map((block) => block.type), ["p", "table", "p"]);
  assert.deepEqual(scope.blocks[1], { type: "table", columns: ["Stream", "Route", "Owner"], widths: [1, 1, 1], rows: [["Sludge", "TSDF", ""]] });
  const step = rendered.sections.find((section) => section.kind === "procedure")!.steps![0];
  assert.deepEqual(step.body.map((block) => block.type), ["table", "p"]);
  assert.ok(!rendered.sections.some((section) => section.kind === "training"), "a section holding only a blank table is hidden");
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
