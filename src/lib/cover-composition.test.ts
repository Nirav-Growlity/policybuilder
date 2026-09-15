import test from "node:test";
import assert from "node:assert/strict";
import { getCoverBindingValue, normalizeCoverComposition } from "./cover-composition";
import { initialPolicy } from "./store";

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
