import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { PolicyPreview } from "../components/policy/policy-preview";
import { initialPolicy } from "./store";
import { normalizePolicyStructure, STANDARD_SECTIONS } from "./sections";
import { buildDocumentRenderModel } from "./document-render-model";
import { deriveLogoPalette, extractLogoPalette } from "./logo-palette";
import { A4, pageBorderContentInsetMm, pageBorderHeaderVerticalShiftMm, pageHeaderLogoTopMm, pageHeaderMarginMm } from "./page-geometry";
import {
  DEFAULT_DOCUMENT_THEME_ID,
  DOCUMENT_THEMES,
  LEGACY_DOCUMENT_THEME_UPGRADES,
  getDocumentTemplatePatch,
  getDocumentTheme,
  getDocumentThemePatch,
  getPolicyDocumentTheme,
  getPolicyColorResetPatch,
  isDocumentThemeCustomized,
  normalizeDocumentThemeOverrides,
  themeBackgroundCss,
} from "./document-themes";
import type { Policy } from "./types";
import { motifSvg } from "./cover-motifs";
import { DOCUMENT_FONT_FAMILIES } from "./document-fonts";

test("defines eight universal visual templates with unique IDs and structural fingerprints", () => {
  assert.equal(DOCUMENT_THEMES.length, 8);
  assert.equal(new Set(DOCUMENT_THEMES.map((theme) => theme.id)).size, 8);
  const families = new Map<string, number>();
  DOCUMENT_THEMES.forEach((theme) => {
    families.set(theme.universalFamily, (families.get(theme.universalFamily) || 0) + 1);
    assert.match(theme.colors.primary, /^#[0-9A-F]{6}$/i);
    assert.match(theme.colors.paper, /^#[0-9A-F]{6}$/i);
    assert.ok(theme.defaults.typography.headingFontFamily);
    assert.ok(theme.previewRecipe);
    assert.ok(theme.structuralSignature);
    assert.ok(theme.compositionFingerprint);
    assert.ok(theme.composition.coverScene);
    assert.ok(theme.composition.contentsScene);
    assert.ok(theme.composition.pageZones);
    assert.ok(theme.composition.fallbackArtwork);
    assert.ok(theme.composition.overflowRule);
    assert.ok(theme.layout.controlTreatment);
    assert.equal(Object.keys(theme.layout.sectionRecipes).length, STANDARD_SECTIONS.length + 1);
    STANDARD_SECTIONS.forEach(({ kind }) => assert.ok(theme.layout.sectionRecipes[kind]));
    assert.ok(theme.layout.sectionRecipes.custom);
  });
  assert.equal(families.size, 8);
  assert.equal(new Set(DOCUMENT_THEMES.map((theme) => theme.layout.controlTreatment)).size, 4);
});

test("built-in templates use distinct bundled typography pairs", () => {
  const pairs = DOCUMENT_THEMES.map((theme) => `${theme.defaults.typography.fontFamily}|${theme.defaults.typography.headingFontFamily}`);
  assert.equal(new Set(pairs).size, DOCUMENT_THEMES.length);
  for (const theme of DOCUMENT_THEMES) {
    assert.ok(DOCUMENT_FONT_FAMILIES.includes(theme.defaults.typography.fontFamily), `${theme.id}: body font is not bundled`);
    assert.ok(DOCUMENT_FONT_FAMILIES.includes(theme.defaults.typography.headingFontFamily || ""), `${theme.id}: heading font is not bundled`);
  }
});

test("each design has a unique structural signature independent of color", () => {
  const signatures = DOCUMENT_THEMES.map((theme) => theme.structuralSignature);

  assert.equal(new Set(signatures).size, DOCUMENT_THEMES.length);
});

test("no two templates share the same cover, contents and body-page composition", () => {
  const triples = DOCUMENT_THEMES.map((theme) => [theme.layout.cover, theme.layout.toc, theme.layout.pageFrame].join("|"));
  assert.equal(new Set(triples).size, DOCUMENT_THEMES.length);
  const fingerprints = DOCUMENT_THEMES.map((theme) => theme.compositionFingerprint);
  assert.equal(new Set(fingerprints).size, DOCUMENT_THEMES.length);
});

test("legacy policies upgrade to the renamed bases without changing content", () => {
  const current = initialPolicy();
  current.declaration.preface = "Preserve this policy text.";
  const legacy = { ...current, documentTemplate: undefined, documentTheme: "evergreen-heritage" } as unknown as Policy;
  const normalized = normalizePolicyStructure(legacy);

  assert.equal(normalized.documentTheme, LEGACY_DOCUMENT_THEME_UPGRADES["evergreen-heritage"]);
  assert.equal(normalized.declaration.preface, "Preserve this policy text.");
  assert.equal(getDocumentTheme("executive-navy").id, "executive-brief");
  assert.equal(getDocumentTheme("modern-teal").id, "sustainability-charter");
  assert.equal(getDocumentTheme("earth-editorial").id, "people-charter");
  assert.equal(getDocumentTheme("sdg-impact").id, "sustainability-charter");
});

test("switching a design resets only visual defaults", () => {
  const current = initialPolicy();
  current.declaration.preface = "Unchanged";
  const sectionsBefore = structuredClone(current.sections);
  const next = normalizePolicyStructure({ ...current, ...getDocumentThemePatch("executive-brief") });

  assert.equal(next.documentTheme, "executive-brief");
  assert.equal(next.documentTemplate, "executive-brief");
  assert.equal(next.visualStyle, "corporate");
  assert.equal(next.logoPosition, "left");
  assert.equal(next.sdgDisplay, "names");
  assert.equal(next.declaration.preface, "Unchanged");
  assert.deepEqual(next.sections, sectionsBefore);
  assert.equal(isDocumentThemeCustomized(next), false);
});

test("applying another template preserves branding unless reset explicitly", () => {
  const current = normalizePolicyStructure({
    ...initialPolicy(),
    documentThemeOverrides: { schemaVersion: 1, colors: { primary: "#123456" }, density: "compact" },
    typography: { ...initialPolicy().typography!, fontFamily: "Calibri" },
    visualStyle: "modern",
  });
  const switched = normalizePolicyStructure({ ...current, ...getDocumentTemplatePatch("board-paper", current) });
  assert.equal(switched.documentTemplate, "executive-brief");
  assert.equal(switched.documentThemeOverrides?.colors?.primary, "#123456");
  assert.equal(switched.visualStyle, "modern");
  assert.equal(switched.declaration.preface, current.declaration.preface);
  const reset = normalizePolicyStructure({ ...current, ...getDocumentTemplatePatch("board-paper", current, { resetBrand: true }) });
  assert.equal(reset.documentThemeOverrides, undefined);
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

test("template previews receive distinct cover artwork for every built-in design", () => {
  const artwork = DOCUMENT_THEMES.map((theme) => motifSvg(theme.layout.motif, theme.colors));
  assert.equal(new Set(artwork).size, DOCUMENT_THEMES.length);
});

test("optional document-control metadata remains blank when it is not authored", () => {
  const policy = initialPolicy();
  policy.company.docNum = "";
  policy.company.effectiveDate = "";
  policy.company.reviewDate = "";
  policy.company.revNum = "";
  policy.company.approver = "";
  const model = buildDocumentRenderModel(policy);
  assert.deepEqual(model.cover.metadata.map((item) => item.value), ["", "", "", ""]);
  assert.deepEqual(model.footer, { documentNumber: "", effectiveDate: "", reviewDate: "", approver: "", revision: "", reviewerDesignations: [] });
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

test("logo scale accepts precise slider values and keeps legacy labels", () => {
  assert.equal(normalizeDocumentThemeOverrides({ schemaVersion: 1, logoScale: 137 }).logoScale, 137);
  assert.equal(normalizeDocumentThemeOverrides({ schemaVersion: 1, logoScale: 20 }).logoScale, 50);
  assert.equal(normalizeDocumentThemeOverrides({ schemaVersion: 1, logoScale: 220 }).logoScale, 180);
  assert.equal(normalizeDocumentThemeOverrides({ schemaVersion: 1, logoScale: "large" }).logoScale, "large");
});

test("bordered running furniture is inset beyond the border stroke", () => {
  const border = { enabled: true, widthPt: 4, insetMm: 10, scope: "all" as const };
  assert.ok(pageBorderContentInsetMm(border) > border.insetMm + border.widthPt / A4.pointsPerMm / 2);
  assert.ok(pageBorderHeaderVerticalShiftMm(border) > 0);
});

test("logo header reserves a safe top band after the border", () => {
  const border = { enabled: true, widthPt: 4, insetMm: 10, scope: "all" as const };
  const logoTop = pageHeaderLogoTopMm(border);
  const topMargin = pageHeaderMarginMm(border, 12);
  assert.ok(logoTop > border.insetMm + border.widthPt / A4.pointsPerMm / 2);
  assert.ok(topMargin > logoTop + 12);
});

test("logo colors are the default source and template colors remain selectable", () => {
  const policy = initialPolicy();
  policy.company.logoPalette = {
    primary: "#0B6E4F",
    primaryDark: "#07442F",
    soft: "#E7F4EF",
    accent: "#E0A458",
    onPrimary: "#FFFFFF",
  };

  assert.equal(getPolicyDocumentTheme(policy).colors.primary, "#0B6E4F");
  assert.equal(getPolicyDocumentTheme({ ...policy, brandColorSource: "template" }).colors.primary, getDocumentTheme(policy.documentTheme).colors.primary);
});

test("logo colors reach headings, TOC rules, and running-logo scale", () => {
  const policy = initialPolicy();
  policy.company.logoPalette = {
    primary: "#0B6E4F",
    primaryDark: "#07442F",
    soft: "#E7F4EF",
    accent: "#E0A458",
    onPrimary: "#FFFFFF",
  };
  policy.company.companyLogo = "data:image/png;base64,logo";
  policy.documentThemeOverrides = { schemaVersion: 1, logoScale: "large" };

  const theme = getPolicyDocumentTheme(policy);
  assert.equal(theme.colors.primaryDark, "#07442F");
  assert.equal(theme.colors.subheading, "#07442F");
  assert.equal(theme.colors.ink, "#000000");
  assert.notEqual(theme.colors.line, getDocumentTheme(policy.documentTheme).colors.line);
  assert.equal(theme.logoScale, "large");

  const markup = renderToStaticMarkup(createElement(PolicyPreview, { policy }));
  assert.match(markup, /data-logo-scale="large"/);
  assert.match(markup, /--doc-running-logo-height:38px/);
  assert.match(markup, /--doc-ink:#000000/);
});

test("logo palette extraction ignores transparent and near-white pixels", () => {
  const palette = deriveLogoPalette([
    ...Array.from({ length: 20 }, () => ({ r: 11, g: 110, b: 79, a: 255 })),
    ...Array.from({ length: 8 }, () => ({ r: 224, g: 164, b: 88, a: 255 })),
    { r: 255, g: 255, b: 255, a: 255 },
    { r: 0, g: 0, b: 0, a: 0 },
  ]);

  assert.equal(palette?.primary, "#0B6E4F");
  assert.equal(palette?.accent, "#E0A458");
  assert.equal(palette?.primaryDark, "#084D37");
});

test("logo palette prefers opaque brand pixels over anti-aliased edge pixels", () => {
  const palette = deriveLogoPalette([
    ...Array.from({ length: 40 }, () => ({ r: 11, g: 110, b: 79, a: 255 })),
    ...Array.from({ length: 100 }, () => ({ r: 100, g: 180, b: 150, a: 100 })),
  ]);

  assert.equal(palette?.primary, "#0B6E4F");
});

test("logo palette keeps monochrome logos usable", () => {
  assert.equal(deriveLogoPalette(Array.from({ length: 20 }, () => ({ r: 0, g: 0, b: 0, a: 255 })))?.primary, "#000000");
  assert.equal(deriveLogoPalette(Array.from({ length: 20 }, () => ({ r: 255, g: 255, b: 255, a: 255 })))?.primary, "#17251F");
});

test("logo extraction falls back to onload when decode rejects", async () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousDocument = (globalThis as { document?: unknown }).document;
  const pixels = new Uint8ClampedArray([
    11, 110, 79, 255,
    11, 110, 79, 255,
    224, 164, 88, 255,
    255, 255, 255, 0,
  ]);

  class FakeImage {
    decoding = "";
    complete = false;
    naturalWidth = 0;
    naturalHeight = 0;
    width = 0;
    height = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => {
        this.complete = true;
        this.onload?.();
      });
    }
    decode() {
      return Promise.reject(new Error("decode is unavailable for this image"));
    }
  }

  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => tag === "img"
        ? new FakeImage()
        : {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage: () => undefined, getImageData: () => ({ data: pixels }) }),
          },
    },
  });

  try {
    const palette = await extractLogoPalette("data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%204%201%22%3E%3C/svg%3E");
    assert.equal(palette?.primary, "#0B6E4F");
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    if (previousDocument === undefined) delete (globalThis as { document?: unknown }).document;
    else Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
  }
});

test("running headers align the logo independently and use company name only as a fallback", () => {
  const withLogo = initialPolicy();
  withLogo.logoPosition = "center";
  withLogo.company.name = "Logo Header Company";
  withLogo.company.companyLogo = "data:image/png;base64,logo";
  const logoMarkup = renderToStaticMarkup(createElement(PolicyPreview, { policy: withLogo }));
  const logoHeaderStart = logoMarkup.indexOf("data-logo-position");
  const logoHeader = logoMarkup.slice(logoHeaderStart, logoHeaderStart + 600);

  assert.match(logoHeader, /data-logo-position="center"/);
  assert.doesNotMatch(logoHeader, /Logo Header Company/);
  const coverMarkup = logoMarkup.slice(0, logoMarkup.indexOf('class="policy-running-header'));
  assert.doesNotMatch(coverMarkup, /<img[^>]+class="policy-cover-logo/);
  assert.match(coverMarkup, /Logo Header Company/);

  const withoutLogo = initialPolicy();
  withoutLogo.company.name = "Name Fallback Company";
  const nameMarkup = renderToStaticMarkup(createElement(PolicyPreview, { policy: withoutLogo }));
  const nameHeaderStart = nameMarkup.indexOf("class=\"policy-running-header");
  const nameHeader = nameMarkup.slice(nameHeaderStart, nameHeaderStart + 600);
  assert.match(nameHeader, /Name Fallback Company/);
});


test("manual logo colors survive reload and reset restores source without changing layout", () => {
  const policy = initialPolicy();
  policy.company.logoPalette = { primary: "#123456", primaryDark: "#112233", soft: "#EEEEEE", accent: "#998877", onPrimary: "#FFFFFF" };
  policy.templateBrandOverrides = { schemaVersion: 1, colors: { primary: "#ABCDEF", ink: "#223344" }, logoScale: 140, background: { kind: "solid", color: "#F5F5F5" }, pageBorder: { enabled: true, widthPt: 2, insetMm: 10, scope: "all" } };
  const reloaded = JSON.parse(JSON.stringify(policy));
  assert.equal(getPolicyDocumentTheme(reloaded).colors.primary, "#ABCDEF");
  assert.equal(getPolicyDocumentTheme(reloaded).colors.ink, "#223344");
  const reset = { ...policy, ...getPolicyColorResetPatch(policy) };
  assert.equal(getPolicyDocumentTheme(reset).colors.primary, "#123456");
  assert.deepEqual(getPolicyDocumentTheme(reset).background, getPolicyDocumentTheme(policy).background);
  assert.deepEqual(getPolicyDocumentTheme(reset).pageBorder, getPolicyDocumentTheme(policy).pageBorder);
  assert.equal(getPolicyDocumentTheme(reset).logoScale, 140);
  assert.deepEqual(reset.company, policy.company);
  assert.equal(getPolicyDocumentTheme({ ...reset, brandColorSource: "template" }).colors.primary, getDocumentTheme(policy.documentTemplate).colors.primary);
});
