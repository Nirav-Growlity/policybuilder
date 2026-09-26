import test from "node:test";
import assert from "node:assert/strict";
import { coverAssetIdFromReference, getActiveCoverComposition, getActiveCoverVariant, getCoverBindingValue, getCoverTextPresentation, hasExternalCoverAssets, normalizeCoverComposition, normalizePolicyCovers, stripExternalActiveCoverAssets } from "./cover-composition";
import { initialPolicy } from "./store";
import { buildDocumentRenderModel } from "./document-render-model";
import { resolveCoverTextLayout } from "./cover-renderer";

test("normalizes a cover scene and clamps geometry", () => {
  const result = normalizeCoverComposition({ schemaVersion: 1, sourceTemplateId: "standard-pack", background: { color: "#fff" }, elements: [{ id: "a", type: "text", x: -10, y: 999, width: 999, height: 0, rotation: 900, opacity: 2, zIndex: 4, content: { kind: "literal", text: "hello" } }] });
  assert.equal(result?.elements.length, 1);
  assert.equal(result?.elements[0].x, 0);
  assert.equal(result?.elements[0].y, 297 - 1);
  assert.equal(result?.elements[0].rotation, 180);
  assert.equal(result?.background.color, "#FFFFFF");
});

test("normalizes old compositions with media aspect locking defaults", () => {
  const result = normalizeCoverComposition({ schemaVersion: 1, elements: [
    { id: "old-text", type: "text", content: { kind: "literal", text: "Text" } },
    { id: "old-logo", type: "logo", focalPoint: { x: 50, y: 50 }, altText: "Logo" },
  ] });
  assert.equal(result?.elements.find((element) => element.id === "old-text")?.aspectLocked, false);
  assert.equal(result?.elements.find((element) => element.id === "old-logo")?.aspectLocked, true);
});

test("removes the retired AI cover readability panel while preserving editable layers", () => {
  const result = normalizeCoverComposition({ schemaVersion: 1, sourceTemplateId: "ai-generated", background: { color: "#FFFFFF", assetId: "art" }, elements: [
    { id: "ai-cover-metadata-backdrop", type: "image", assetId: "white-panel" },
    { id: "ai-cover-policyTitle", type: "text", content: { kind: "literal", text: "Policy" } },
  ] });
  assert.equal(result?.elements.some((element) => element.id === "ai-cover-metadata-backdrop"), false);
  assert.equal(result?.elements.some((element) => element.id === "ai-cover-policyTitle"), true);
});

test("AI cover text presentation preserves saved styles and adds only the contrast shadow", () => {
  const composition = normalizeCoverComposition({ schemaVersion: 1, sourceTemplateId: "ai-generated", background: { color: "#FFFFFF", assetId: "art" }, elements: [
    { id: "ai-cover-policyTitle", type: "text", fontFamily: "Arial", fontSize: 20, color: "#315C49", bold: false, letterSpacing: 0.25, content: { kind: "literal", text: "Policy" } },
  ] })!;
  const title = composition.elements.find((element) => element.type === "text")!;
  const presentation = getCoverTextPresentation(title, composition.sourceTemplateId);

  assert.equal(title.color, "#315C49");
  assert.equal(presentation.color, "#315C49");
  assert.equal(presentation.fontSize, 20);
  assert.equal(presentation.bold, false);
  assert.equal(presentation.fontFamily, "Arial");
  assert.equal(presentation.letterSpacing, 0.25);
  assert.ok(presentation.textShadow);
});

test("shared cover text layout wraps inside the box and shrinks only when its height requires it", () => {
  const element = normalizeCoverComposition({ schemaVersion: 1, sourceTemplateId: "ai-generated", elements: [{
    id: "ai-cover-policyTitle", type: "text", x: 20, y: 20, width: 42, height: 18, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false,
    content: { kind: "literal", text: "Labour & Human Rights Policy" }, fontFamily: "Arial", fontSize: 32, color: "#27C5EC", bold: false, italic: false, underline: false, align: "right", lineHeight: 1.08, letterSpacing: 0,
  }] })!.elements[0];
  assert.equal(element.type, "text");
  if (element.type !== "text") return;

  const layout = resolveCoverTextLayout("Labour & Human Rights Policy", element, "ai-generated");
  assert.ok(layout.lines.length > 1);
  assert.ok(layout.presentation.fontSize < element.fontSize);
  assert.ok(layout.lines.length * layout.presentation.fontSize * (25.4 / 72) * element.lineHeight <= element.height);
  assert.equal(layout.presentation.color, element.color);
  assert.equal(layout.presentation.fontFamily, element.fontFamily);
});

test("rejects unknown schema and preserves live bindings", () => {
  assert.equal(normalizeCoverComposition({ schemaVersion: 99 }), undefined);
  const policy = initialPolicy("environmental");
  policy.company.name = "Example Ltd";
  policy.company.revNum = "04";
  assert.equal(getCoverBindingValue(policy, "companyName"), "Example Ltd");
  assert.equal(getCoverBindingValue(policy, "revision"), "04");
});

test("limits uploaded image layers while retaining text layers", () => {
  const result = normalizeCoverComposition({ schemaVersion: 1, elements: [...Array.from({ length: 14 }, (_, index) => ({ id: `image-${index}`, type: "image", assetId: `asset-${index}` })), { id: "text", type: "text", content: { kind: "literal", text: "keep" } }] });
  assert.equal(result?.elements.filter((element) => element.type === "image").length, 12);
  assert.equal(result?.elements.some((element) => element.type === "text"), true);
});

test("older policies default to the manual cover and selected AI covers stay independent", () => {
  const policy = initialPolicy("environmental");
  const manual = normalizeCoverComposition({ schemaVersion: 1, sourceTemplateId: "custom", background: { color: "#FFFFFF" }, elements: [] })!;
  const ai = normalizeCoverComposition({ schemaVersion: 1, sourceTemplateId: "ai-generated", background: { color: "#FFFFFF", assetId: "data:image/png;base64,art" }, elements: [] })!;
  const normalized = normalizePolicyCovers({ ...policy, coverComposition: manual, aiCoverComposition: ai });

  assert.equal(getActiveCoverVariant(policy), "manual");
  assert.deepEqual(getActiveCoverComposition(normalized), manual);
  assert.equal(getActiveCoverVariant({ ...normalized, activeCoverVariant: "ai" }), "ai");
  assert.deepEqual(getActiveCoverComposition({ ...normalized, activeCoverVariant: "ai" }), ai);
  assert.equal(buildDocumentRenderModel({ ...normalized, activeCoverVariant: "ai" }).cover.variant, "ai");
  const projectedAI = buildDocumentRenderModel({ ...normalized, activeCoverVariant: "ai" }).cover.composition!;
  assert.deepEqual(getActiveCoverComposition({ ...normalized, activeCoverVariant: "ai" }), ai);
  assert.deepEqual(projectedAI.elements.filter(element => element.type === "text").map(element => element.type === "text" ? element.content.kind === "binding" ? element.content.binding : element.content.text : ""), ["companyName", "policyTitle"]);
  assert.deepEqual(ai.elements, [], "display projection must not mutate the saved AI composition");
  assert.equal(hasExternalCoverAssets({ ...normalized, activeCoverVariant: "ai" }), false);
  assert.equal(hasExternalCoverAssets({ ...normalized, activeCoverVariant: "ai", aiCoverComposition: { ...ai, background: { ...ai.background, assetId: "asset-id" } } }), true);
});

test("missing auth strips only unresolved active cover assets from an export copy", () => {
  const policy = initialPolicy("environmental");
  const manual = normalizeCoverComposition({ schemaVersion: 1, sourceTemplateId: "custom", background: { color: "#FFFFFF", assetId: "manual-asset" }, elements: [] })!;
  const ai = normalizeCoverComposition({ schemaVersion: 1, sourceTemplateId: "ai-generated", background: { color: "#FFFFFF", assetId: "ai-asset" }, elements: [
    { id: "ai-image", type: "image", assetId: "image-asset" },
    { id: "ai-logo", type: "logo" },
    { id: "ai-title", type: "text", content: { kind: "literal", text: "Keep this title" } },
  ] })!;
  const exportCopy = stripExternalActiveCoverAssets({ ...policy, company: { ...policy.company, companyLogo: "logo-asset" }, coverComposition: manual, aiCoverComposition: ai, activeCoverVariant: "ai" });

  assert.equal(exportCopy.company.companyLogo, undefined);
  assert.equal(exportCopy.aiCoverComposition?.background.assetId, undefined);
  assert.equal(exportCopy.aiCoverComposition?.elements.some((element) => element.type === "text"), true);
  assert.equal(exportCopy.aiCoverComposition?.elements.some((element) => element.type === "image" || element.type === "logo"), false);
  assert.equal(exportCopy.coverComposition?.background.assetId, "manual-asset");
  assert.equal(ai.background.assetId, "ai-asset");
});

test("cover asset references normalize browser endpoint URLs for server-side export", () => {
  assert.equal(coverAssetIdFromReference("cover-asset-id"), "cover-asset-id");
  assert.equal(coverAssetIdFromReference("/api/policycraft/cover-assets/cover-asset-id"), "cover-asset-id");
  assert.equal(coverAssetIdFromReference("/api/policycraft/cover-assets/cover%2Fasset"), "cover/asset");
  assert.equal(coverAssetIdFromReference("data:image/png;base64,abc"), "data:image/png;base64,abc");
});

test("browser endpoint cover assets remain eligible for authenticated export resolution", () => {
  const policy = initialPolicy("environmental");
  const ai = normalizeCoverComposition({ schemaVersion: 1, sourceTemplateId: "ai-generated", background: { color: "#FFFFFF", assetId: "/api/policycraft/cover-assets/cover-asset-id" }, elements: [] })!;
  assert.equal(hasExternalCoverAssets({ ...policy, aiCoverComposition: ai, activeCoverVariant: "ai" }), true);
});
