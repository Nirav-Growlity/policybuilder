import assert from "node:assert/strict";
import test from "node:test";
import { getFocusAreaCatalog, withFocusAreaCatalogSelection } from "./focus-area-catalog";
import { initialPolicy } from "./store";
import { getStarterTemplate } from "./starter-templates";
import type { PolicySection } from "./types";
import { calculatePolicyProgress } from "./policycraft-progress";

test("counts enabled filled sections equally, including policy defaults and generated revisions", () => {
  const policy = initialPolicy("environmental");

  const result = calculatePolicyProgress(policy);

  assert.equal(result.totalSections, 11);
  assert.equal(result.filledSections, 3);
  assert.equal(result.percentage, 27);
  assert.deepEqual(
    result.sections.filter((section) => section.filled).map((section) => section.kind).sort(),
    ["focus", "responsibilities", "revision"],
  );
  assert.ok(result.sections.every((section) => section.id && section.title));
});

test("returns zero progress when every enabled section has empty content", () => {
  const policy = initialPolicy();
  policy.sections = policy.sections?.filter((section) => section.kind !== "revision");
  policy.declaration = { preface: "", declaration: "", scope: "" };
  policy.focusAreas = [];
  policy.qualitative = {};
  policy.quantitative = [];
  policy.sdgs = [];
  policy.responsibilities = [];
  policy.monitoring = "";
  policy.reviewMechanism = "";

  const result = calculatePolicyProgress(policy);

  assert.equal(result.totalSections, 10);
  assert.equal(result.filledSections, 0);
  assert.equal(result.percentage, 0);
});

test("trims text fields and excludes disabled sections from the denominator", () => {
  const policy = initialPolicy();
  policy.declaration = { preface: " \n ", declaration: " \t", scope: " " };
  policy.focusAreas = ["  "];
  policy.qualitative = { "Empty objective": ["  "] };
  policy.quantitative = [{ area: "Empty target", targets: [{ target: " \n ", baseline: "FY 2024", deadline: "FY 2030" }] }];
  policy.sdgs = [];
  policy.responsibilities = [{ role: " ", duty: "Role without a duty" }];
  policy.monitoring = "\t";
  policy.reviewMechanism = " ";
  policy.sections = (policy.sections || []).map((section) => section.kind === "review" ? { ...section, enabled: false } : section);

  const result = calculatePolicyProgress(policy);

  assert.equal(result.totalSections, policy.sections?.filter((section) => section.enabled).length);
  assert.equal(result.filledSections, 1);
  assert.equal(result.sections.some((section) => section.kind === "review"), false);
});

test("uses visible qualitative and quantitative content after focus-area selection", () => {
  const policy = initialPolicy("environmental");
  const catalog = getFocusAreaCatalog("Manufacture of other chemical products n.e.c.", "environmental")!;
  const selected = catalog.areas[0];
  const hidden = catalog.areas[1];
  Object.assign(policy, withFocusAreaCatalogSelection(catalog, [selected.id], []));
  policy.qualitative = { [hidden.label]: ["Hidden objective"] };
  policy.quantitative = [{ area: hidden.label, targets: [{ target: "Hidden target", baseline: "", deadline: "" }] }];

  const result = calculatePolicyProgress(policy);

  assert.equal(result.sections.find((section) => section.kind === "qualitative")?.filled, false);
  assert.equal(result.sections.find((section) => section.kind === "quantitative")?.filled, false);
});

test("counts only valid SDG numbers", () => {
  const policy = initialPolicy();
  policy.sdgs = [0, 18, 3.5];
  assert.equal(calculatePolicyProgress(policy).sections.find((section) => section.kind === "sdg")?.filled, false);

  policy.sdgs = [17];
  assert.equal(calculatePolicyProgress(policy).sections.find((section) => section.kind === "sdg")?.filled, true);
});

test("counts each custom section independently and ignores table scaffolding", () => {
  const policy = initialPolicy();
  const customSections: PolicySection[] = [
    { id: "custom-paragraph", kind: "custom", title: "Paragraph", enabled: true, blocks: [{ id: "p", type: "paragraph", text: "A filled custom policy commitment." }] },
    { id: "custom-title-only", kind: "custom", title: "Title only", enabled: true, blocks: [] },
    { id: "custom-table-empty", kind: "custom", title: "Empty table", enabled: true, blocks: [{ id: "t1", type: "table", text: "", columns: ["Column 1", "Column 2"], rows: [["", ""]] }] },
    { id: "custom-table-filled", kind: "custom", title: "Filled table", enabled: true, blocks: [{ id: "t2", type: "table", text: "", columns: ["Column 1"], rows: [["Owner"]] }] },
  ];
  policy.sections = [...(policy.sections || []), ...customSections];

  const result = calculatePolicyProgress(policy);

  assert.equal(result.totalSections, policy.sections.length);
  assert.equal(result.sections.find((section) => section.id === "custom-paragraph")?.filled, true);
  assert.equal(result.sections.find((section) => section.id === "custom-title-only")?.filled, false);
  assert.equal(result.sections.find((section) => section.id === "custom-table-empty")?.filled, false);
  assert.equal(result.sections.find((section) => section.id === "custom-table-filled")?.filled, true);
});

test("counts starter-template text already applied to Policy fields", () => {
  const policy = getStarterTemplate("environmental-evidence-led")?.policy;
  assert.ok(policy);

  const result = calculatePolicyProgress(policy);

  assert.ok(result.filledSections > 0);
  assert.equal(result.sections.find((section) => section.kind === "qualitative")?.filled, true);
  assert.equal(result.sections.find((section) => section.kind === "quantitative")?.filled, true);
  assert.ok(result.sections.some((section) => section.kind === "custom" && section.filled));
});

test("counts AI-generated text after it is applied to Policy fields", () => {
  const policy = initialPolicy();
  policy.declaration.declaration = "AI-generated policy commitment with substantive text.";

  assert.equal(calculatePolicyProgress(policy).sections.find((section) => section.kind === "declaration")?.filled, true);
});

test("normalizes required Preface and limits the denominator to the selected template sections", () => {
  const policy = initialPolicy();
  policy.presentationTemplate = "executive";
  policy.sections = undefined;

  const result = calculatePolicyProgress(policy);

  assert.equal(result.totalSections, 7);
  assert.equal(result.sections[0].kind, "preface");
  assert.equal(result.sections[0].filled, false);
  assert.equal(result.sections.some((section) => section.kind === "definitions"), false);
});

test("whitespace-only changes, company details, and cover settings do not alter progress", () => {
  const policy = initialPolicy();
  const before = calculatePolicyProgress(policy);
  policy.monitoring = "  \n\t ";
  policy.company.name = "Company metadata only";
  policy.activeCoverVariant = "ai";
  const after = calculatePolicyProgress(policy);

  assert.deepEqual(after, before);
});
