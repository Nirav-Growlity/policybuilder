import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { COVER_BACKGROUND_OVERSCAN, coverAssetIdFromReference, getActiveCoverComposition, getActiveCoverVariant, getCoverBindingValue, getCoverTextPresentation, hasExternalCoverAssets, normalizeCoverComposition, normalizePolicyCovers, stripExternalActiveCoverAssets } from "./cover-composition";
import { initialPolicy } from "./store";
import { buildDocumentRenderModel } from "./document-render-model";
import { createCoverCompositionSvg, resolveCoverTextLayout } from "./cover-renderer";

test("cover SVG crops narrow white edges while preserving intentional contain letterboxing", async () => {
  const backgroundSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="210" height="297"><rect width="210" height="297" fill="#176B45"/><rect width="0.6" height="297" fill="#fff"/><rect x="209.4" width="0.6" height="297" fill="#fff"/></svg>';
  const baseComposition = {
    schemaVersion: 1,
    sourceTemplateId: "custom",
    background: { color: "#176B45", assetId: `data:image/svg+xml;base64,${Buffer.from(backgroundSvg).toString("base64")}`, fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [{ id: "fixed-title", type: "text", x: 12, y: 34, width: 80, height: 20, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, content: { kind: "literal", text: "Title" }, fontFamily: "Arial", fontSize: 20, color: "#FFFFFF", bold: false, italic: false, underline: false, align: "left", lineHeight: 1.2, letterSpacing: 0 }],
  } as const;
  const policy = initialPolicy("environmental");
  const backgroundPng = await sharp(Buffer.from(backgroundSvg)).resize(2100, 2970).png().toBuffer();
  const cover = normalizeCoverComposition({ ...baseComposition, background: { ...baseComposition.background, assetId: `data:image/png;base64,${backgroundPng.toString("base64")}` } })!;
  const coverSvg = createCoverCompositionSvg(policy, cover, { width: 2100, height: 2970 });
  const rendered = await sharp(Buffer.from(coverSvg)).resize(2100, 2970).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sample = (x: number) => [...rendered.data.subarray((Math.floor(rendered.info.height / 2) * rendered.info.width + x) * rendered.info.channels, (Math.floor(rendered.info.height / 2) * rendered.info.width + x) * rendered.info.channels + 3)];
  assert.deepEqual(sample(0), [23, 107, 69]);
  assert.deepEqual(sample(rendered.info.width - 1), [23, 107, 69]);
  assert.match(coverSvg, /translate\(12 34\)/, "overscan must not move editable cover layers");

  const narrowPng = await sharp({ create: { width: 160, height: 297, channels: 3, background: { r: 23, g: 107, b: 69 } } }).png().toBuffer();
  const containComposition = normalizeCoverComposition({ ...baseComposition, background: { ...baseComposition.background, color: "#FFFFFF", assetId: `data:image/png;base64,${narrowPng.toString("base64")}`, fit: "contain" } })!;
  const containSvg = createCoverCompositionSvg(policy, containComposition, { width: 2100, height: 2970 });
  const contained = await sharp(Buffer.from(containSvg)).resize(2100, 2970).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const left = [...contained.data.subarray(Math.floor(contained.info.height / 2) * contained.info.width * contained.info.channels, Math.floor(contained.info.height / 2) * contained.info.width * contained.info.channels + 3)];
  assert.deepEqual(left, [255, 255, 255], "small overscan retains intentional contain letterboxing for a narrow source");
  assert.equal(COVER_BACKGROUND_OVERSCAN, 1.02);
});

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
  assert.equal(coverAssetIdFromReference("/api/policycraft/cover-assets/cover-asset-id?orgId=42"), "cover-asset-id");
  assert.equal(coverAssetIdFromReference("/api/policycraft/cover-assets/cover%2Fasset"), "cover/asset");
  assert.equal(coverAssetIdFromReference("data:image/png;base64,abc"), "data:image/png;base64,abc");
});

test("browser endpoint cover assets remain eligible for authenticated export resolution", () => {
  const policy = initialPolicy("environmental");
  const ai = normalizeCoverComposition({ schemaVersion: 1, sourceTemplateId: "ai-generated", background: { color: "#FFFFFF", assetId: "/api/policycraft/cover-assets/cover-asset-id" }, elements: [] })!;
  assert.equal(hasExternalCoverAssets({ ...policy, aiCoverComposition: ai, activeCoverVariant: "ai" }), true);
});
