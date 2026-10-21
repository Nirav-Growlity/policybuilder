import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { compileSopManual } from "../typst/compile";
import { sopFontFiles } from "../typst/fonts";
import sample from "./fixtures/sample-manual.json";
import { addSopAppendix, createEmptyManual, createEmptySop, withManualSkeleton } from "./initial-manual";
import { buildSopRenderModel, departmentCode, formatManualDate, letterAppendixTitles, suggestSopCodes } from "./render-model";
import { SOP_TEMPLATE_IDS, type SopManual, type SopNarrativeKind, type SopNarrativeSection, type SopRecordsSection } from "./types";

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

const sectionOf = (manual: SopManual, kind: SopNarrativeKind) =>
  manual.sops[0].sections.find((section) => section.kind === kind) as SopNarrativeSection;

test("compliance prints after references; introduction and corrective action only when switched on", () => {
  const manual = sampleManual();
  const compliance = sectionOf(manual, "compliance");
  compliance.blocks = [p("The site holds a valid Consent to Operate [consent number].")];
  const first = () => buildSopRenderModel(manual).chapters[0].sops[0];
  const kinds = first().sections.map((section) => section.kind);
  assert.ok(kinds.indexOf("compliance") === kinds.indexOf("references") + 1, kinds.join(","));
  assert.equal(first().sections.find((section) => section.kind === "compliance")!.title, "Legal & Regulatory Compliance");
  // Introduction and corrective action are off by default, so text alone does not print them.
  sectionOf(manual, "introduction").blocks = [p("Why this matters.")];
  sectionOf(manual, "corrective").blocks = [p("Deviations are recorded.")];
  assert.ok(!first().sections.some((section) => section.kind === "introduction" || section.kind === "corrective"));
  sectionOf(manual, "introduction").enabled = true;
  sectionOf(manual, "corrective").enabled = true;
  const sections = first().sections;
  assert.equal(sections[0].kind, "introduction");
  assert.equal(sections[0].number, "1.0");
  assert.deepEqual(sections.slice(-3).map((section) => section.kind), ["compliance", "corrective", "review"]);
});

test("a manual saved before the new kinds renders exactly as before", () => {
  const manual = sampleManual();
  const NEW_KINDS = new Set(["introduction", "compliance", "corrective"]);
  const old: SopManual = { ...manual, sops: manual.sops.map((sop) => ({ ...sop, sections: sop.sections.filter((section) => !NEW_KINDS.has(section.kind)) })) };
  const before = buildSopRenderModel(old);
  const reopened = withManualSkeleton(old);
  assert.ok(reopened.sops.every((sop) => sop.sections.filter((section) => NEW_KINDS.has(section.kind)).every((section) => !section.enabled)));
  assert.deepEqual(buildSopRenderModel(reopened), before);
  // The live preview shows enabled empty sections; the added ones are off, so it does not change either.
  assert.deepEqual(buildSopRenderModel(reopened, { includeEmptySections: true }), buildSopRenderModel(old, { includeEmptySections: true }));
});

test("records print a No. column first only when a record has a form number", () => {
  const manual = sampleManual();
  const records = manual.sops[0].sections.find((section) => section.kind === "records") as SopRecordsSection;
  const table = () => buildSopRenderModel(manual).chapters[0].sops[0].sections.find((section) => section.kind === "records")!.blocks[0];
  const plain = table();
  assert.ok(plain.type === "table");
  assert.deepEqual(plain.columns, ["Record", "Owner", "Retention", "Format"]);
  records.rows = records.rows.map((row, index) => (index === 1 ? { ...row, code: " MTPL/EHS/F-02 " } : row));
  const coded = table();
  assert.ok(coded.type === "table");
  assert.deepEqual(coded.columns, ["No.", "Record", "Owner", "Retention", "Format"]);
  assert.equal(coded.widths.length, 5);
  assert.deepEqual(coded.rows.map((row) => row[0]), records.rows.map((_, index) => (index === 1 ? "MTPL/EHS/F-02" : "")));
});

test("several appendices print after the canonical sections, lettered in order", () => {
  assert.deepEqual(letterAppendixTitles(["Appendix"]), ["Appendix"]);
  assert.deepEqual(letterAppendixTitles(["Appendix", "Appendix C: Checklist", "Inspection form", "Annexure 4 - Forms", "Appendix to inspection"]), [
    "Appendix A", "Appendix B: Checklist", "Appendix C: Inspection form", "Annexure D: Forms", "Appendix E: to inspection",
  ]);
  const manual = sampleManual();
  let sop = addSopAppendix(manual.sops[0]);
  assert.equal(sop.sections.filter((section) => section.kind === "appendix").length, 1, "the left-out appendix is switched on first");
  sop = addSopAppendix(addSopAppendix(sop));
  const appendices = sop.sections.filter((section) => section.kind === "appendix");
  assert.deepEqual(appendices.map((section) => section.title), ["Appendix A", "Appendix B", "Appendix C"]);
  assert.ok(appendices.every((section) => section.enabled));
  assert.equal(sop.sections.at(-1)!.kind, "appendix");
  sop.sections = sop.sections.map((section) => (section.kind === "appendix" ? { ...section, blocks: [p(`${section.title} body`)] } : section));
  // Appendix B left out: A and C print as A and B.
  sop.sections = sop.sections.map((section) => (section.title === "Appendix B" ? { ...section, enabled: false } : section));
  manual.sops[0] = sop;
  const sections = buildSopRenderModel(manual).chapters[0].sops[0].sections;
  const printed = sections.filter((section) => section.kind === "appendix");
  assert.deepEqual(printed.map((section) => section.title), ["Appendix A", "Appendix B"]);
  assert.deepEqual(sections.map((section) => section.number), sections.map((_, index) => `${index + 1}.0`));
  assert.equal(sections.at(-1)!.id, printed.at(-1)!.id);
});
