import assert from "node:assert/strict";
import test from "node:test";
import { initialPolicy } from "./store";
import { normalizePolicyStructure, STANDARD_SECTIONS } from "./sections";
import { buildDocumentRenderModel } from "./document-render-model";
import {
  DEFAULT_DOCUMENT_THEME_ID,
  DOCUMENT_THEMES,
  getDocumentThemePatch,
  isDocumentThemeCustomized,
} from "./document-themes";
import type { Policy } from "./types";

test("defines four unique document themes", () => {
  assert.equal(DOCUMENT_THEMES.length, 4);
  assert.equal(new Set(DOCUMENT_THEMES.map((theme) => theme.id)).size, 4);
  DOCUMENT_THEMES.forEach((theme) => {
    assert.match(theme.colors.primary, /^#[0-9A-F]{6}$/i);
    assert.ok(theme.defaults.typography.headingFontFamily);
    assert.equal(Object.keys(theme.layout.sectionRecipes).length, STANDARD_SECTIONS.length + 1);
    STANDARD_SECTIONS.forEach(({ kind }) => assert.ok(theme.layout.sectionRecipes[kind]));
    assert.ok(theme.layout.sectionRecipes.custom);
  });
});

test("each design has a unique structural signature independent of color", () => {
  const signatures = DOCUMENT_THEMES.map((theme) => [
    theme.layout.cover,
    theme.layout.toc,
    theme.layout.pageFrame,
    theme.layout.bodyGrid,
    theme.layout.dataLayout,
    theme.layout.runningFurniture,
  ].join("|"));

  assert.equal(new Set(signatures).size, DOCUMENT_THEMES.length);
});

test("legacy policies default to Evergreen Heritage without changing content", () => {
  const current = initialPolicy();
  current.declaration.preface = "Preserve this policy text.";
  const legacy = { ...current, documentTheme: undefined } as Policy;
  const normalized = normalizePolicyStructure(legacy);

  assert.equal(normalized.documentTheme, DEFAULT_DOCUMENT_THEME_ID);
  assert.equal(normalized.declaration.preface, "Preserve this policy text.");
});

test("switching a design resets only visual defaults", () => {
  const current = initialPolicy();
  current.declaration.preface = "Unchanged";
  const sectionsBefore = structuredClone(current.sections);
  const next = normalizePolicyStructure({ ...current, ...getDocumentThemePatch("executive-navy") });

  assert.equal(next.documentTheme, "executive-navy");
  assert.equal(next.visualStyle, "corporate");
  assert.equal(next.logoPosition, "left");
  assert.equal(next.sdgDisplay, "names");
  assert.equal(next.declaration.preface, "Unchanged");
  assert.deepEqual(next.sections, sectionsBefore);
  assert.equal(isDocumentThemeCustomized(next), false);
});

test("manual typography changes are detected and can be reset", () => {
  const themed = normalizePolicyStructure({ ...initialPolicy(), ...getDocumentThemePatch("earth-editorial") });
  const customized = normalizePolicyStructure({
    ...themed,
    typography: { ...themed.typography!, paragraphSize: themed.typography!.paragraphSize + 0.5 },
  });

  assert.equal(isDocumentThemeCustomized(customized), true);
  const reset = normalizePolicyStructure({ ...customized, ...getDocumentThemePatch("earth-editorial") });
  assert.equal(isDocumentThemeCustomized(reset), false);
});

test("the shared render model preserves enabled order and classifies density deterministically", () => {
  const policy = initialPolicy();
  policy.declaration.preface = "Short statement.";
  let model = buildDocumentRenderModel(policy);
  assert.equal(model.sections.find((section) => section.kind === "preface")?.density, "short");

  policy.declaration.preface = "Regular policy language. ".repeat(30);
  model = buildDocumentRenderModel(policy);
  assert.equal(model.sections.find((section) => section.kind === "preface")?.density, "regular");

  policy.declaration.preface = "Dense policy language. ".repeat(100);
  model = buildDocumentRenderModel(policy);
  assert.equal(model.sections.find((section) => section.kind === "preface")?.density, "dense");
  assert.deepEqual(model.tocEntries.map((entry) => entry.id), model.sections.map((section) => section.id));
});

test("theme switching preserves authored data across the shared render model", () => {
  const policy = initialPolicy();
  policy.company.name = "Long-form Example Holdings and Manufacturing Company";
  policy.declaration.scope = "Scope text that must survive a design switch.";
  policy.focusAreas = ["Climate transition", "Water stewardship", "Circular materials"];
  policy.responsibilities = [{ role: "Board", duty: "Retains oversight." }];
  const baseline = {
    company: structuredClone(policy.company),
    declaration: structuredClone(policy.declaration),
    focusAreas: structuredClone(policy.focusAreas),
    responsibilities: structuredClone(policy.responsibilities),
    sections: structuredClone(policy.sections),
  };

  DOCUMENT_THEMES.forEach((theme) => {
    const switched = normalizePolicyStructure({ ...policy, ...getDocumentThemePatch(theme.id) });
    assert.deepEqual(switched.company, baseline.company);
    assert.deepEqual(switched.declaration, baseline.declaration);
    assert.deepEqual(switched.focusAreas, baseline.focusAreas);
    assert.deepEqual(switched.responsibilities, baseline.responsibilities);
    assert.deepEqual(switched.sections, baseline.sections);
    assert.equal(buildDocumentRenderModel(switched).theme.id, theme.id);
  });
});

test("data treatment remains an explicit customization across every document design", () => {
  DOCUMENT_THEMES.forEach((theme) => {
    const base = normalizePolicyStructure({ ...initialPolicy(), ...getDocumentThemePatch(theme.id) });
    const corporate = buildDocumentRenderModel({ ...base, visualStyle: "corporate" });
    const modern = buildDocumentRenderModel({ ...base, visualStyle: "modern" });

    assert.equal(corporate.dataTreatment, "formal-tables", `${theme.name} corporate`);
    assert.equal(modern.dataTreatment, "clean-bullets", `${theme.name} modern`);
  });
});
