import assert from "node:assert/strict";
import test from "node:test";
import { initialPolicy } from "./store";
import { normalizePolicyStructure, STANDARD_SECTIONS } from "./sections";
import { buildDocumentRenderModel } from "./document-render-model";
import {
  DEFAULT_DOCUMENT_THEME_ID,
  DOCUMENT_THEMES,
  LEGACY_DOCUMENT_THEME_UPGRADES,
  getDocumentTheme,
  getDocumentThemePatch,
  getPolicyDocumentTheme,
  isDocumentThemeCustomized,
  normalizeDocumentThemeOverrides,
  themeBackgroundCss,
} from "./document-themes";
import type { Policy } from "./types";

test("defines 24 print-safe themes across eight three-preset families", () => {
  assert.equal(DOCUMENT_THEMES.length, 24);
  assert.equal(new Set(DOCUMENT_THEMES.map((theme) => theme.id)).size, 24);
  const families = new Map<string, number>();
  DOCUMENT_THEMES.forEach((theme) => {
    families.set(theme.family, (families.get(theme.family) || 0) + 1);
    assert.match(theme.colors.primary, /^#[0-9A-F]{6}$/i);
    assert.match(theme.colors.paper, /^#[0-9A-F]{6}$/i);
    assert.ok(theme.defaults.typography.headingFontFamily);
    assert.ok(theme.previewRecipe);
    assert.ok(theme.structuralSignature);
    assert.equal(Object.keys(theme.layout.sectionRecipes).length, STANDARD_SECTIONS.length + 1);
    STANDARD_SECTIONS.forEach(({ kind }) => assert.ok(theme.layout.sectionRecipes[kind]));
    assert.ok(theme.layout.sectionRecipes.custom);
  });
  assert.equal(families.size, 8);
  families.forEach((count) => assert.equal(count, 3));
});

test("each design has a unique structural signature independent of color", () => {
  const signatures = DOCUMENT_THEMES.map((theme) => theme.structuralSignature);

  assert.equal(new Set(signatures).size, DOCUMENT_THEMES.length);
});

test("legacy policies upgrade to the renamed bases without changing content", () => {
  const current = initialPolicy();
  current.declaration.preface = "Preserve this policy text.";
  const legacy = { ...current, documentTheme: "evergreen-heritage" } as unknown as Policy;
  const normalized = normalizePolicyStructure(legacy);

  assert.equal(normalized.documentTheme, LEGACY_DOCUMENT_THEME_UPGRADES["evergreen-heritage"]);
  assert.equal(normalized.declaration.preface, "Preserve this policy text.");
  assert.equal(getDocumentTheme("executive-navy").id, "executive-brief");
  assert.equal(getDocumentTheme("modern-teal").id, "sustainability-report");
  assert.equal(getDocumentTheme("earth-editorial").id, "editorial-report");
});

test("switching a design resets only visual defaults", () => {
  const current = initialPolicy();
  current.declaration.preface = "Unchanged";
  const sectionsBefore = structuredClone(current.sections);
  const next = normalizePolicyStructure({ ...current, ...getDocumentThemePatch("executive-brief") });

  assert.equal(next.documentTheme, "executive-brief");
  assert.equal(next.visualStyle, "corporate");
  assert.equal(next.logoPosition, "left");
  assert.equal(next.sdgDisplay, "names");
  assert.equal(next.declaration.preface, "Unchanged");
  assert.deepEqual(next.sections, sectionsBefore);
  assert.equal(isDocumentThemeCustomized(next), false);
});

test("manual typography changes are detected and can be reset", () => {
  const themed = normalizePolicyStructure({ ...initialPolicy(), ...getDocumentThemePatch("editorial-report") });
  const customized = normalizePolicyStructure({
    ...themed,
    typography: { ...themed.typography!, paragraphSize: themed.typography!.paragraphSize + 0.5 },
  });

  assert.equal(isDocumentThemeCustomized(customized), true);
  const reset = normalizePolicyStructure({ ...customized, ...getDocumentThemePatch("editorial-report") });
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

test("feature images render only in compatible placements and remain on the policy", () => {
  const image = {
    dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3zgAAAABJRU5ErkJggg==",
    mimeType: "image/png" as const,
    width: 1,
    height: 1,
    placement: "cover" as const,
    focalPosition: { x: 50, y: 50 },
    altText: "A representative landscape",
  };
  const editorial = normalizePolicyStructure({ ...initialPolicy(), ...getDocumentThemePatch("editorial-report"), featureImage: image });
  assert.deepEqual(buildDocumentRenderModel(editorial).featureImage, image);

  const governance = normalizePolicyStructure({ ...editorial, ...getDocumentThemePatch("governance-manual") });
  assert.equal(buildDocumentRenderModel(governance).featureImage, undefined);
  assert.deepEqual(governance.featureImage, image);
});

test("custom theme overrides resolve without mutating the built-in theme", () => {
  const policy = initialPolicy();
  policy.documentThemeOverrides = {
    schemaVersion: 1,
    customThemeName: "Board green",
    colors: { primary: "#123456", paper: "#FAFAFA" },
    background: { kind: "gradient", from: "#FAFAFA", to: "#DDEEFF", direction: "horizontal" },
    density: "compact",
    logoScale: "large",
  };

  const resolved = getPolicyDocumentTheme(policy);
  assert.equal(resolved.colors.primary, "#123456");
  assert.equal(resolved.colors.paper, "#FAFAFA");
  assert.equal(resolved.colors.accent, getDocumentTheme(DEFAULT_DOCUMENT_THEME_ID).colors.accent);
  assert.equal(resolved.customThemeName, "Board green");
  assert.equal(resolved.density, "compact");
  assert.equal(resolved.logoScale, "large");
  assert.equal(themeBackgroundCss(resolved.background), "linear-gradient(90deg, #FAFAFA, #DDEEFF)");
  assert.notEqual(getDocumentTheme(DEFAULT_DOCUMENT_THEME_ID).colors.primary, "#123456");
});

test("malformed custom theme values are discarded safely", () => {
  const normalized = normalizeDocumentThemeOverrides({
    schemaVersion: 99,
    customThemeName: "  Safe name  ",
    colors: { primary: "red", accent: "#aabbcc" },
    background: { kind: "solid", color: "not-a-color" },
    density: "enormous",
    logoScale: "tiny",
  });

  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.customThemeName, "Safe name");
  assert.deepEqual(normalized.colors, { accent: "#AABBCC" });
  assert.equal(normalized.background, undefined);
  assert.equal(normalized.density, undefined);
  assert.equal(normalized.logoScale, undefined);
});
