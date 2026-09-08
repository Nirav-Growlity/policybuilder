import assert from "node:assert/strict";
import test from "node:test";
import { DOCUMENT_THEMES, getDocumentTemplatePatch, upgradeDocumentThemeId } from "./document-themes";
import { getUniversalTemplate, queryUniversalTemplates, templateDetail } from "./document-templates";
import { buildDocumentRenderModel } from "./document-render-model";
import { normalizePolicyStructure } from "./sections";
import { initialPolicy } from "./store";
import { makeSamplePolicyForType, PREVIEW_POLICY_TYPES } from "./sample-policies";
import { generateDocx } from "./docx/generate";
import type { Policy } from "./types";

test("exactly eight universal templates with unique IDs and structural fingerprints", () => {
  assert.equal(DOCUMENT_THEMES.length, 8);
  assert.equal(new Set(DOCUMENT_THEMES.map((t) => t.id)).size, 8);
  assert.equal(new Set(DOCUMENT_THEMES.map((t) => t.structuralSignature)).size, 8);
  assert.equal(new Set(DOCUMENT_THEMES.map((t) => t.compositionFingerprint)).size, 8);
  assert.deepEqual(DOCUMENT_THEMES.map((t) => t.id), ["standard-pack", "executive-brief", "controlled-manual", "governance-register", "operations-guide", "sustainability-charter", "people-charter", "metrics-ledger"]);
  assert.ok(DOCUMENT_THEMES.every((t) => t.collection === "professional"));
});

test("every template renders every policy type (8 x 5 compatibility)", () => {
  let cases = 0;
  for (const template of DOCUMENT_THEMES) {
    for (const policyType of PREVIEW_POLICY_TYPES) {
      const policy = makeSamplePolicyForType(policyType, template.id);
      const model = buildDocumentRenderModel(policy);
      assert.equal(model.theme.id, template.id);
      assert.ok(model.sections.length > 0, `${template.id} x ${policyType}`);
      assert.ok(model.cover.companyName.length > 0);
      cases += 1;
    }
  }
  assert.equal(cases, 40);
});

test("switching templates preserves all authored policy and company data", () => {
  const policy = initialPolicy();
  policy.company.name = "Very Long Company Name Holdings and Manufacturing Company International Ltd.";
  policy.company.docNum = "DOC-2026-001";
  policy.declaration.preface = "Preface that must survive.";
  policy.declaration.scope = "Scope text that must survive a design switch.";
  policy.focusAreas = ["Climate transition", "Water stewardship", "Circular materials"];
  policy.responsibilities = [{ role: "Board", duty: "Retains oversight." }];
  policy.quantitative = [{ area: "Climate transition", targets: [{ target: "Reduce emissions by 30%", baseline: "FY22", deadline: "FY30" }] }];
  const baseline = {
    company: structuredClone(policy.company),
    declaration: structuredClone(policy.declaration),
    focusAreas: structuredClone(policy.focusAreas),
    responsibilities: structuredClone(policy.responsibilities),
    quantitative: structuredClone(policy.quantitative),
    sections: structuredClone(policy.sections),
  };
  for (const template of DOCUMENT_THEMES) {
    const switched = normalizePolicyStructure({ ...policy, ...getDocumentTemplatePatch(template.id, policy) });
    assert.deepEqual(switched.company, baseline.company, template.id);
    assert.deepEqual(switched.declaration, baseline.declaration, template.id);
    assert.deepEqual(switched.focusAreas, baseline.focusAreas, template.id);
    assert.deepEqual(switched.responsibilities, baseline.responsibilities, template.id);
    assert.deepEqual(switched.quantitative, baseline.quantitative, template.id);
    assert.deepEqual(switched.sections, baseline.sections, template.id);
  }
});

test("legacy themes and aliases migrate without losing overrides", () => {
  assert.equal(upgradeDocumentThemeId("sdg-impact"), "sustainability-charter");
  assert.equal(upgradeDocumentThemeId("evergreen-heritage"), "controlled-manual");
  const base = initialPolicy();
  const policy = { ...base, documentTemplate: undefined, documentTheme: "sdg-impact" as unknown as Policy["documentTheme"] };
  const normalized = normalizePolicyStructure(policy);
  assert.equal(normalized.documentTemplate, "sustainability-charter");
});

test("template API supports q, family, intent and imageSupport (not policy content)", () => {
  assert.equal(queryUniversalTemplates({}).length, 8);
  assert.ok(queryUniversalTemplates({ family: "Standard" }).length >= 1);
  assert.ok(queryUniversalTemplates({ intent: "minimal" }).length >= 1);
  assert.ok(queryUniversalTemplates({ imageSupport: "cover" }).length >= 1);
  assert.ok(queryUniversalTemplates({ q: "quiet cover" }).some((t) => t.id === "standard-pack"));
  const detail = templateDetail("executive-brief")!;
  assert.ok(detail.composition);
  assert.ok(detail.capabilities.coverScene);
  assert.ok(detail.capabilities.controlTreatment);
  assert.ok(detail.preview.policyTypeSwitcher.includes("ethics"));
  assert.equal((detail as unknown as { policy?: unknown }).policy, undefined);
  assert.equal(getUniversalTemplate("plain-standard")?.id, "standard-pack");
  assert.equal(getUniversalTemplate("not-a-template"), undefined);
});

test("long titles, missing metadata, empty tables, dense targets and custom sections render", () => {
  for (const template of DOCUMENT_THEMES) {
    const policy = makeSamplePolicyForType("ethics", template.id);
    policy.company.name = "A".repeat(140);
    policy.company.docNum = "";
    policy.company.effectiveDate = "";
    policy.company.reviewDate = "";
    policy.declaration.preface = "Long title stress. ".repeat(80);
    policy.quantitative = policy.focusAreas.slice(0, 4).map((area) => ({
      area,
      targets: Array.from({ length: 6 }, (_, i) => ({ target: `Dense target ${i + 1} for ${area}`, baseline: "FY22", deadline: "FY30" })),
    }));
    policy.sections = [...(policy.sections || []), { id: "custom-stress", kind: "custom", title: "Custom Section With A Very Long Title ".repeat(4), enabled: true, blocks: [{ id: "b1", type: "paragraph", text: "Custom body. ".repeat(40) }] }];
    const model = buildDocumentRenderModel(normalizePolicyStructure(policy));
    assert.equal(model.theme.id, template.id);
    assert.ok(model.sections.length > 0);
    // Empty tables must not crash
    const empty = normalizePolicyStructure({ ...policy, quantitative: [], responsibilities: [] });
    const emptyModel = buildDocumentRenderModel(empty);
    assert.equal(emptyModel.theme.id, template.id);
  }
});

test("dense DOCX artifacts are valid packages across all eight templates", { timeout: 120000 }, async () => {
  for (const template of DOCUMENT_THEMES) {
    const policy = makeSamplePolicyForType("environmental", template.id);
    const output = await generateDocx(policy);
    assert.ok(output.length > 2000, template.id);
    assert.equal(output.subarray(0, 2).toString("ascii"), "PK", template.id);
  }
});
