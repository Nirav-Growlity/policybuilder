import assert from "node:assert/strict";
import test from "node:test";
import { acceptsAICoverArtworkInspection, buildAICoverArtworkContext, buildAICoverArtworkValidationPrompt, buildAICoverContext, buildAICoverImagePrompt, createAICoverComposition, fallbackAICoverLayout, normalizeAICoverLayout } from "./cover";
import { makeSamplePolicy } from "../store";

test("AI cover layout falls back to a complete non-overlapping A4 arrangement", () => {
  const layout = normalizeAICoverLayout({ railSide: "right", elements: [{ role: "policyTitle", x: 0, y: 0, width: 500, height: 500 }] });
  assert.deepEqual(layout, fallbackAICoverLayout("right"));
  assert.equal(layout.elements.length, 12);
  assert.equal(layout.elements.every((element) => element.x >= 8 && element.y >= 8 && element.x + element.width <= 202 && element.y + element.height <= 289), true);
});

test("AI cover layout keeps the editable content in one aligned rail", () => {
  const fallback = fallbackAICoverLayout("left");
  const incoherent = { ...fallback, elements: fallback.elements.map((element) => element.role === "policyTitle" ? { ...element, x: 144, align: "center" as const } : element) };
  const normalized = normalizeAICoverLayout(incoherent);

  assert.deepEqual(normalized, fallback);
  assert.equal(normalized.elements.find((element) => element.role === "policyTitle")?.align, "left");
  assert.equal(normalized.elements.find((element) => element.role === "policyTitle")?.y, 80);
});

test("AI cover composition keeps exact bindings and editable layout layers", () => {
  const policy = makeSamplePolicy();
  policy.company.companyLogo = "data:image/png;base64,logo";
  const composition = createAICoverComposition(policy, "data:image/png;base64,art", fallbackAICoverLayout());
  const text = composition.elements.filter((element) => element.type === "text");

  assert.equal(composition.sourceTemplateId, "ai-generated");
  assert.equal(composition.background.assetId, "data:image/png;base64,art");
  assert.equal(composition.background.fit, "contain");
  assert.equal(composition.background.color, "#FFFFFF");
  assert.equal(composition.elements.some((element) => element.type === "logo"), true);
  assert.equal(text.some((element) => element.type === "text" && element.content.kind === "binding" && element.content.binding === "policyTitle"), true);
  assert.equal(text.some((element) => element.type === "text" && element.content.kind === "binding" && element.content.binding === "documentNumber"), true);
  assert.equal(text.some((element) => element.type === "text" && element.content.kind === "literal" && element.content.text === "NEXT REVIEW"), true);
  assert.equal(composition.elements.every((element) => element.locked === false), true);
  assert.equal(composition.elements.some((element) => element.id === "ai-cover-rail"), false);
  const divider = composition.elements.find((element) => element.id === "ai-cover-metadata-rule");
  assert.ok(divider?.type === "image");
});

test("AI cover context uses policy and design signals without imported reference text", () => {
  const policy = makeSamplePolicy();
  policy.declaration.declaration = "Protect water and reduce process waste.";
  const context = buildAICoverContext(policy);
  assert.match(context, /Protect water and reduce process waste/);
  assert.match(context, /Environmental Policy/);
  assert.doesNotMatch(context, /importedPolicy|referencePolicy/);
  const artworkContext = buildAICoverArtworkContext(policy);
  assert.match(buildAICoverImagePrompt(artworkContext), /transparent-background/);
  assert.match(buildAICoverImagePrompt(artworkContext), /solid color/);
  assert.ok(context.length <= 12000, "AI layout context should stay bounded");
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
  assert.match(prompt, /transparent negative space/);
  assert.match(prompt, /zero typography/);
});

test("AI artwork validation rejects document-like image content and solid boxes", () => {
  const validation = buildAICoverArtworkValidationPrompt();
  assert.match(validation.system, /Reject any visible text/);
  assert.match(validation.user, /hasSolidBackground/);
  assert.match(validation.user, /acceptable/);
});

test("AI artwork validation trusts PNG transparency over an overly strict summary flag", () => {
  assert.equal(acceptsAICoverArtworkInspection({ acceptable: false, hasText: false, hasDocumentElements: false, hasBorderOrFrame: false, hasSolidBackground: true }, true), true);
  assert.equal(acceptsAICoverArtworkInspection({ acceptable: true, hasText: true, hasDocumentElements: false, hasBorderOrFrame: false }, true), false);
  assert.equal(acceptsAICoverArtworkInspection({ acceptable: true, hasText: false, hasDocumentElements: false, hasBorderOrFrame: false }, false), false);
});
