import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { findSopReferenceRoot } from "../../scripts/sop-reference-files";
import { createEmptyManual } from "../sop/initial-manual";
import { applyParsedControl, classifySectionLabel, cleanLabel, parseSopDocx, parsedControlPatch, parsedDateToIso, type ParsedSopManual } from "./sop-parse";

// The reference manuals live outside the repository (read-only data next to the checkout).
const ROOT = findSopReferenceRoot();
const skip = ROOT ? false : "reference SOP manuals not found (set SOP_REFERENCE_ROOT)";

const FIXTURES = [
  // Heading 1 SOP titles, sections as bold numbered paragraphs (not in the TOC).
  { name: "Somakanan", file: ["SOP", "Somakanan SOP Manual.docx"], sops: 13 },
  // SOP titles and their sections share the Intense Quote style and one TOC level.
  { name: "Gloster", file: ["SOP Manual  Employee Handbook", "SOP MANUAL", "SOP Manual - Gloster.docx"], sops: 16 },
  // No heading styles: titles are bold numbered List Paragraphs with a direct outline level.
  { name: "Skypass", file: ["SOP Manual  Employee Handbook", "SOP MANUAL", "SOP Manual Skypass (1).docx"], sops: 13 },
  // Section headings live in shaded 1x2 tables.
  { name: "Priya Associates", file: ["SOP Manual  Employee Handbook", "SOP MANUAL", "SOPs Manual - Priya Associates.docx"], sops: 5 },
  // SOP titles only appear in the per-section page headers; the TOC lists sections only.
  { name: "Navitas", file: ["Employee Handbook - SOP Manual", "SOP", "Navitas", "Navitas_Solar_SOP_Manual.docx"], sops: 14 },
];

const cache = new Map<string, Promise<ParsedSopManual>>();
function parseFixture(parts: string[]): Promise<ParsedSopManual> {
  const file = path.join(ROOT!, ...parts);
  let pending = cache.get(file);
  if (!pending) {
    pending = parseSopDocx(fs.readFileSync(file));
    cache.set(file, pending);
  }
  return pending;
}

function share(manual: ParsedSopManual, kind: string): number {
  return manual.sops.filter((sop) => sop.sections.some((section) => section.kind === kind)).length / manual.sops.length;
}

function allBlockTexts(manual: ParsedSopManual): string[] {
  const sections = [...manual.frontMatter.sections, ...manual.sops.flatMap((sop) => sop.sections), ...manual.closing.sections];
  return sections.flatMap((section) => section.blocks.map((block) => [block.text, ...(block.columns ?? []), ...(block.rows ?? []).flat()].join(" ")));
}

for (const fixture of FIXTURES) {
  test(`${fixture.name}: finds ${fixture.sops} SOPs with purpose and procedure sections`, { skip }, async () => {
    const manual = await parseFixture(fixture.file);

    assert.equal(manual.sops.length, fixture.sops, manual.sops.map((sop) => sop.title).join("\n"));
    for (const sop of manual.sops) {
      assert.ok(sop.title.length > 3, `empty SOP title in ${fixture.name}`);
      assert.ok(sop.sections.length >= 2, `"${sop.title}" has ${sop.sections.length} sections`);
    }
    assert.ok(share(manual, "purpose") >= 0.75, `purpose share ${share(manual, "purpose")}`);
    assert.ok(share(manual, "procedure") >= 0.75, `procedure share ${share(manual, "procedure")}`);
  });

  test(`${fixture.name}: no duplicated text-box (mc:Fallback) content`, { skip }, async () => {
    const manual = await parseFixture(fixture.file);
    for (const sop of manual.sops) {
      const texts = sop.sections.flatMap((section) => section.blocks.map((block) => block.text.trim())).filter((text) => text.length > 30);
      for (let i = 1; i < texts.length; i += 1) {
        assert.notEqual(texts[i], texts[i - 1], `repeated block in "${sop.title}": ${texts[i].slice(0, 60)}`);
      }
    }
  });
}

test("text boxes are read from mc:Choice only, never duplicated from mc:Fallback", { skip }, async () => {
  const manual = await parseFixture(["Employee Handbook - SOP Manual", "SOP", "Advanced Supply Chain Group Ltd", "SOP.docx"]);
  const hits = allBlockTexts(manual).join("\n").split("Reads Bin Label Signage").length - 1;
  assert.equal(hits, 1);
});

test("Gloster: SOP titles are told apart from same-style section headings", { skip }, async () => {
  const manual = await parseFixture(FIXTURES[1].file);
  assert.equal(manual.sops[0].title, "Workplace Safety Incident & Risk Management System");
  const labels = manual.sops[0].sections.map((section) => section.label);
  assert.ok(labels.includes("Purpose"));
  assert.ok(labels.includes("Roles and Responsibilities"));
  assert.ok(!manual.sops.some((sop) => /^(purpose|review mechanism)$/i.test(sop.title)));
});

test("Priya Associates: table headings and term/role tables are preserved", { skip }, async () => {
  const manual = await parseFixture(FIXTURES[3].file);
  const first = manual.sops[0];
  assert.deepEqual(
    first.sections.slice(0, 4).map((section) => section.kind),
    ["purpose", "scope", "definitions", "responsibilities"]
  );
  const roles = first.sections.find((section) => section.kind === "responsibilities")!;
  const table = roles.blocks.find((block) => block.type === "table");
  assert.ok(table, "responsibilities table");
  assert.deepEqual(table!.columns, ["Role", "Responsibilities"]);
  assert.ok((table!.rows ?? []).length >= 5);
  const definitions = first.sections.find((section) => section.kind === "definitions")!;
  const strip = definitions.blocks.find((block) => block.type === "table");
  assert.ok(strip && (strip.rows ?? []).length >= 5, "one-row definition tables merge into one table");
  assert.equal(manual.frontMatter.sites.length, 2);
});

test("Navitas: SOP titles and codes come from section headers; manual control from the cover table", { skip }, async () => {
  const manual = await parseFixture(FIXTURES[4].file);
  assert.equal(manual.sops[0].title, "Low-Carbon Energy and Emissions Stewardship");
  assert.equal(manual.sops[0].code, "NSPL/UTY/SOP/014");
  assert.equal(manual.sops[0].source, "header");
  assert.equal(manual.control.docNo, "NSPL/SOP/MNL/001");
  assert.equal(manual.control.revision, "01");
  assert.equal(manual.company?.name, "NAVITAS SOLAR PVT LTD");
  const kinds = manual.sops[0].sections.map((section) => section.kind);
  for (const kind of ["purpose", "scope", "definitions", "responsibilities", "procedure", "references", "records"]) {
    assert.ok(kinds.includes(kind as never), `missing ${kind}: ${kinds.join(",")}`);
  }
});

test("Skypass: sites table and footer control fields are extracted", { skip }, async () => {
  const manual = await parseFixture(FIXTURES[2].file);
  assert.equal(manual.frontMatter.sites.length, 5);
  assert.equal(manual.frontMatter.sites[0].location, "Bangalore, India");
  assert.equal(manual.control.revision, "1.0");
  assert.equal(manual.sops[12].title, "Supplier Evaluation Procedure");
});

test("Skypass: last review date and revision reviewers carry into the manual", { skip }, async () => {
  const manual = await parseFixture(FIXTURES[2].file);
  assert.equal(manual.control.lastReviewDate, "02.06.2025");
  const control = applyParsedControl(createEmptyManual().control, manual.control);
  assert.equal(control.lastReviewDate, "2025-06-02");
  assert.equal(control.docNo, "STI-SOPM-01");
  assert.equal(manual.closing.revisionHistory[0].reviewedBy, "Compliance Officer");
});

test("imported control keeps issue date, last review date and supersedes", () => {
  const base = createEmptyManual().control;
  const control = applyParsedControl(base, { docNo: " PLPL/SOPM/01 ", supersedes: "Nil", issueDate: "1st April 2024", effectiveDate: "01-09-2024", lastReviewDate: "01-Jan-2025", nextReviewDate: "To be decided" });
  assert.equal(control.docNo, "PLPL/SOPM/01");
  assert.equal(control.supersedes, "Nil");
  assert.equal(control.issueDate, "2024-04-01");
  assert.equal(control.effectiveDate, "2024-09-01");
  assert.equal(control.lastReviewDate, "2025-01-01");
  // Free text that is not a date is kept as written.
  assert.equal(control.nextReviewDate, "To be decided");
  assert.equal(control.approvedBy, base.approvedBy, "fields the import did not find stay as they were");
  assert.deepEqual(parsedControlPatch({}), {});
});

test("header dates are read day first", () => {
  assert.equal(parsedDateToIso("02.06.2025"), "2025-06-02");
  assert.equal(parsedDateToIso("2/1/26"), "2026-01-02");
  assert.equal(parsedDateToIso("2026-01-02"), "2026-01-02");
  assert.equal(parsedDateToIso("03rd April 2023"), "2023-04-03");
  assert.equal(parsedDateToIso("April 3, 2023"), "2023-04-03");
  assert.equal(parsedDateToIso("31.02.2025"), "31.02.2025");
});

test("Somakanan: footer doc number and revision", { skip }, async () => {
  const manual = await parseFixture(FIXTURES[0].file);
  assert.equal(manual.control.docNo, "SKT-SOP-01");
  assert.equal(manual.control.revision, "02");
});

test("section lexicon classifies common SOP headings", () => {
  const cases: Array<[string, string | undefined]> = [
    ["1. Purpose:", "purpose"],
    ["Objective", "purpose"],
    ["Scope & Applicability", "scope"],
    ["Terminology Overview", "definitions"],
    ["4. DEFINITIONS AND ABBREVIATIONS", "definitions"],
    ["Abbreviations", "abbreviations"],
    ["Roles & Responsibilities", "responsibilities"],
    ["Procedure & Implementation", "procedure"],
    ["Measures and Procedures", "procedure"],
    ["Monitoring & KPIs", "monitoring"],
    ["Employee Engagement & Awareness", "training"],
    ["Records to be Maintained", "records"],
    ["8. REFERENCE DOCUMENTS AND LEGAL REQUIREMENTS", "references"],
    ["Review & Amendment", "review"],
    ["Continuous Improvement", "review"],
    ["Compliance", "compliance"],
    ["ANNEXURES:", "appendix"],
    ["Water Recycling Technology", undefined],
  ];
  for (const [label, kind] of cases) assert.equal(classifySectionLabel(label), kind, label);
});

test("cleanLabel strips numbering prefixes but keeps words", () => {
  assert.equal(cleanLabel("4.1 RECRUITMENT PROCEDURE"), "RECRUITMENT PROCEDURE");
  assert.equal(cleanLabel("SOP 1: FAIR EMPLOYMENT"), "FAIR EMPLOYMENT");
  assert.equal(cleanLabel("SECTION D: PRODUCT & PACKAGING"), "PRODUCT & PACKAGING");
  assert.equal(cleanLabel("Introduction"), "Introduction");
  assert.equal(cleanLabel("A Guide to Waste"), "A Guide to Waste");
});
