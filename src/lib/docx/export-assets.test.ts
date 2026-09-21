import assert from "node:assert/strict";
import test from "node:test";
import { initialPolicy } from "../store";
import { preparePolicyForDocxExport } from "./export-assets";

test("DOCX export hydrates private active cover artwork without mutating saved policy state", async () => {
  const policy = initialPolicy("environmental");
  policy.activeCoverVariant = "ai";
  policy.aiCoverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "ai-generated",
    background: { color: "#FFFFFF", assetId: "cover-artwork-id", fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [{ id: "title", type: "text", x: 20, y: 20, width: 150, height: 20, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, content: { kind: "literal", text: "Editable title" }, fontFamily: "Arial", fontSize: 20, color: "#FFFFFF", bold: true, italic: false, underline: false, align: "left", lineHeight: 1.2, letterSpacing: 0 }],
  };
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "Content-Type": "image/png" } });
  };
  try {
    const exportPolicy = await preparePolicyForDocxExport(policy);
    assert.match(exportPolicy.aiCoverComposition?.background.assetId || "", /^data:image\/png;base64,/);
    assert.deepEqual(requests, ["/api/policycraft/cover-assets/cover-artwork-id"]);
    assert.equal(policy.aiCoverComposition.background.assetId, "cover-artwork-id");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DOCX export leaves inline cover artwork inline", async () => {
  const policy = initialPolicy("environmental");
  const dataUrl = "data:image/png;base64,abc";
  policy.coverComposition = { schemaVersion: 1, sourceTemplateId: "custom", background: { color: "#FFFFFF", assetId: dataUrl, fit: "cover", focalPoint: { x: 50, y: 50 } }, elements: [] };
  const exportPolicy = await preparePolicyForDocxExport(policy);
  assert.equal(exportPolicy.coverComposition?.background.assetId, dataUrl);
});
