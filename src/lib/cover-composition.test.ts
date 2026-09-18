import test from "node:test";
import assert from "node:assert/strict";
import { getActiveCoverComposition, getActiveCoverVariant, getCoverBindingValue, hasExternalCoverAssets, normalizeCoverComposition, normalizePolicyCovers, stripExternalActiveCoverAssets } from "./cover-composition";
import { initialPolicy } from "./store";
import { buildDocumentRenderModel } from "./document-render-model";

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
  assert.deepEqual(buildDocumentRenderModel({ ...normalized, activeCoverVariant: "ai" }).cover.composition, ai);
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
