import assert from "node:assert/strict";
import test from "node:test";
import { acceptsAICoverArtworkInspection, buildAICoverArtworkContext, buildAICoverArtworkValidationPrompt, buildAICoverContext, buildAICoverDesignPrompt, buildAICoverImagePrompt, buildAICoverLayoutPrompt, createAICoverComposition, fallbackAICoverDesign, fallbackAICoverLayout, normalizeAICoverDesign, normalizeAICoverLayout } from "./cover";
import { getPolicyDocumentTheme } from "../document-themes";
import { makeSamplePolicy } from "../store";

test("AI cover layout falls back to a complete non-overlapping A4 arrangement", () => {
  const layout = normalizeAICoverLayout({ railSide: "right", elements: [{ role: "policyTitle", x: 0, y: 0, width: 500, height: 500 }] });
  assert.deepEqual(layout, fallbackAICoverLayout("right"));
  assert.equal(layout.elements.length, 2);
  assert.equal(layout.elements.every((element) => element.x >= 8 && element.y >= 8 && element.x + element.width <= 202 && element.y + element.height <= 289), true);
});

test("AI cover layout keeps the editable content in one aligned rail", () => {
  const fallback = fallbackAICoverLayout("left");
  const incoherent = { ...fallback, elements: fallback.elements.map((element) => element.role === "policyTitle" ? { ...element, x: 144, align: "center" as const } : element) };
  const normalized = normalizeAICoverLayout(incoherent);

  assert.deepEqual(normalized, fallback);
  assert.equal(normalized.elements.find((element) => element.role === "policyTitle")?.align, "left");
  assert.equal(normalized.elements.find((element) => element.role === "policyTitle")?.y, 78);
});

test("AI cover composition keeps only the company logo and policy-title editable layers", () => {
  const policy = makeSamplePolicy();
  policy.company.companyLogo = "data:image/png;base64,logo";
  policy.company.logoPalette = { primary: "#0B6E4F", primaryDark: "#07442F", soft: "#E7F4EF", accent: "#E0A458", onPrimary: "#FFFFFF" };
  const composition = createAICoverComposition(policy, "data:image/png;base64,art", fallbackAICoverLayout());
  const text = composition.elements.filter((element) => element.type === "text");
  const theme = getPolicyDocumentTheme(policy);

  assert.equal(composition.sourceTemplateId, "ai-generated");
  assert.equal(composition.background.assetId, "data:image/png;base64,art");
  assert.equal(composition.background.fit, "contain");
  assert.equal(composition.background.color, "#FFFFFF");
  assert.equal(composition.background.color, theme.colors.paper);
  assert.equal(composition.elements.some((element) => element.type === "logo"), true);
  assert.equal(text.some((element) => element.type === "text" && element.content.kind === "binding" && element.content.binding === "policyTitle"), true);
  assert.equal(text.some((element) => element.type === "text" && element.content.kind === "binding" && element.content.binding === "companyName"), false);
  assert.equal(text.length, 1);
  assert.equal(composition.elements.some((element) => /metadata|documentNumber|effectiveDate|revision|nextReview/i.test(element.id)), false);
  assert.equal(composition.elements.every((element) => element.locked === false), true);
  assert.equal(composition.elements.some((element) => element.id === "ai-cover-rail"), false);
  assert.equal(text.find((element) => element.id === "ai-cover-policyTitle")?.color, theme.colors.primaryDark);
});

test("AI cover uses the company name only when no logo is available", () => {
  const policy = makeSamplePolicy();
  policy.company.companyLogo = "";
  const composition = createAICoverComposition(policy, "data:image/png;base64,art", fallbackAICoverLayout());
  const text = composition.elements.filter((element) => element.type === "text");

  assert.equal(composition.elements.some((element) => element.type === "logo"), false);
  assert.deepEqual(text.filter((element) => element.type === "text").map((element) => element.content.kind === "binding" ? element.content.binding : "literal"), ["policyTitle", "companyName"]);
});

test("AI cover composition follows the selected template when logo branding is disabled", () => {
  const policy = makeSamplePolicy();
  policy.company.logoPalette = { primary: "#0B6E4F", primaryDark: "#07442F", soft: "#E7F4EF", accent: "#E0A458", onPrimary: "#FFFFFF" };
  policy.brandColorSource = "template";
  const theme = getPolicyDocumentTheme(policy);
  const composition = createAICoverComposition(policy, "data:image/png;base64,art", fallbackAICoverLayout());
  const title = composition.elements.find((element) => element.id === "ai-cover-policyTitle");

  assert.ok(title?.type === "text");
  assert.equal(title.color, theme.colors.primaryDark);
  assert.notEqual(title.color, policy.company.logoPalette.primaryDark);
});

test("AI cover design applies image-aware colors and cover-local fonts without a panel", () => {
  const policy = makeSamplePolicy();
  const design = normalizeAICoverDesign({
    titleColor: "#FFFFFF",
    brandColor: "#E7F4EF",
    headingFontFamily: "Fraunces",
    bodyFontFamily: "Public Sans",
  }, fallbackAICoverDesign(policy));
  const composition = createAICoverComposition(policy, "data:image/png;base64,art", fallbackAICoverLayout(), design);
  const title = composition.elements.find((element) => element.id === "ai-cover-policyTitle");
  const brand = composition.elements.find((element) => element.id === "ai-cover-companyName");

  assert.equal(title?.type, "text");
  assert.equal(title?.color, "#FFFFFF");
  assert.equal(title?.fontFamily, "Fraunces");
  assert.equal(brand?.type, "text");
  assert.equal(brand?.color, "#E7F4EF");
  assert.equal(brand?.fontFamily, "Public Sans");
});

test("AI cover context uses policy and design signals without imported reference text", () => {
  const policy = makeSamplePolicy();
  policy.declaration.declaration = "Protect water and reduce process waste.";
  policy.company.industry = "Renewable Energy";
  policy.company.subCategory = "Solar Power Generation";
  const context = buildAICoverContext(policy);
  assert.match(context, /Protect water and reduce process waste/);
  assert.match(context, /Environmental Policy/);
  assert.doesNotMatch(context, /importedPolicy|referencePolicy/);
  const artworkContext = buildAICoverArtworkContext(policy);
  assert.match(buildAICoverImagePrompt(artworkContext), /Transparency is optional/);
  assert.match(buildAICoverImagePrompt(artworkContext), /never default to generic blue/);
  assert.match(buildAICoverImagePrompt(artworkContext), /quiet, low-detail region/);
  assert.match(artworkContext, /"sector":"Renewable Energy"/);
  assert.match(artworkContext, /"subsector":"Solar Power Generation"/);
  assert.ok(context.length <= 12000, "AI layout context should stay bounded");
});

test("AI cover prompts use the resolved logo palette and policy theme", () => {
  const policy = makeSamplePolicy();
  policy.company.logoPalette = { primary: "#0B6E4F", primaryDark: "#07442F", soft: "#E7F4EF", accent: "#E0A458", onPrimary: "#FFFFFF" };
  const theme = getPolicyDocumentTheme(policy);
  const context = buildAICoverContext(policy);
  const artworkContext = buildAICoverArtworkContext(policy);

  for (const value of [theme.colors.primary, theme.colors.primaryDark, theme.colors.accent, theme.colors.soft, theme.colors.ink, theme.colors.muted, theme.colors.paper]) {
    assert.match(context, new RegExp(value));
    assert.match(artworkContext, new RegExp(value));
  }
});

test("AI cover design prompt asks vision analysis to choose readable cover-local typography", () => {
  const prompt = buildAICoverDesignPrompt(buildAICoverArtworkContext(makeSamplePolicy()));
  assert.match(prompt.system, /readable colors.*actual image/);
  assert.match(prompt.system, /do not solve readability with a backdrop/);
  assert.match(prompt.system, /actual image of the generated A4 cover artwork/);
  assert.match(prompt.user, /headingFontFamily/);
  assert.match(prompt.user, /Fraunces/);
});

test("AI cover layout prompt keeps overlays in a quiet image region without a readability panel", () => {
  const prompt = buildAICoverLayoutPrompt(buildAICoverArtworkContext(makeSamplePolicy()));
  assert.match(prompt.system, /quiet, uniform, high-contrast region/);
  assert.match(prompt.user, /brand\|policyTitle/);
  assert.match(prompt.user, /never both/);
  assert.match(prompt.system, /actual image/);
  assert.match(prompt.user, /do not add metadata, document details, labels, dividers, extra copy/);
});

test("AI artwork context excludes document data and free-form policy text", () => {
  const policy = makeSamplePolicy();
  policy.company.name = "Growlity_Realty";
  policy.company.docNum = "ASC-ENV-001";
  policy.company.effectiveDate = "01 Apr 2025";
  policy.company.revNum = "01";
  policy.company.reviewDate = "01 Apr 2026";
  policy.company.companyLogo = "data:image/png;base64,company-logo";
  policy.declaration.declaration = "This declaration must never enter the artwork prompt.";
  policy.declaration.scope = "This scope must never enter the artwork prompt.";

  const artworkContext = buildAICoverArtworkContext(policy);
  const prompt = buildAICoverImagePrompt(artworkContext);

  for (const forbidden of [
    "Growlity_Realty",
    "ASC-ENV-001",
    "01 Apr 2025",
    "01 Apr 2026",
    "company-logo",
    "This declaration must never enter the artwork prompt.",
    "This scope must never enter the artwork prompt.",
  ]) {
    assert.equal(artworkContext.includes(forbidden), false);
    assert.equal(prompt.includes(forbidden), false);
  }
  assert.match(artworkContext, /industryStyle/);
  assert.match(prompt, /Transparency is optional/);
  assert.match(prompt, /visible text/);
});

test("AI artwork validation rejects document-like image content but allows opaque artwork", () => {
  const validation = buildAICoverArtworkValidationPrompt();
  assert.match(validation.system, /Reject any visible text/);
  assert.match(validation.user, /hasSolidBackground/);
  assert.match(validation.user, /acceptable/);
  assert.match(validation.system, /transparent or opaque/);
  assert.match(validation.user, /informational only/);
});

test("AI artwork validation accepts transparent and opaque decorative artwork", () => {
  assert.equal(acceptsAICoverArtworkInspection({ acceptable: false, hasText: false, hasDocumentElements: false, hasBorderOrFrame: false, hasSolidBackground: true }), true);
  assert.equal(acceptsAICoverArtworkInspection({ acceptable: true, hasText: true, hasDocumentElements: false, hasBorderOrFrame: false }), false);
  assert.equal(acceptsAICoverArtworkInspection({ acceptable: true, hasText: false, hasDocumentElements: true, hasBorderOrFrame: false }), false);
  assert.equal(acceptsAICoverArtworkInspection({ acceptable: true, hasText: false, hasDocumentElements: false, hasBorderOrFrame: true }), false);
});
