import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCoverComposition } from "@/lib/cover-composition";
import { coverEditorReducer, coverPointSizeToPixels, createCoverEditorState, detachCoverText, normalizeCoverForSave, resizeCoverElement, screenToCover, snapElementPosition, updateCoverElement } from "./cover-editor-state";

const composition = normalizeCoverComposition({
  schemaVersion: 1,
  sourceTemplateId: "test",
  background: { color: "#FFFFFF", fit: "cover", focalPoint: { x: 50, y: 50 } },
  elements: [{ id: "title", type: "text", x: 20, y: 20, width: 60, height: 20, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, content: { kind: "literal", text: "Title" }, fontFamily: "Arial", fontSize: 16, color: "#000000", bold: false, italic: false, underline: false, align: "left", lineHeight: 1.2, letterSpacing: 0 }],
})!;

test("gesture updates stay out of history until the gesture commits", () => {
  const moved = { ...composition, elements: [{ ...composition.elements[0], x: 40 }] };
  const transient = coverEditorReducer(createCoverEditorState(composition), { type: "transient", draft: moved });
  assert.equal(transient.history.length, 0);
  const committed = coverEditorReducer(transient, { type: "commit", before: composition, draft: moved });
  assert.equal(committed.history.length, 1);
  assert.equal(committed.draft.elements[0].x, 40);
});

test("save normalization preserves the current draft instead of allowing an empty save", () => {
  const current = { ...composition, elements: [{ ...composition.elements[0], x: 88, content: { kind: "literal" as const, text: "Edited title" } }] };
  const saved = normalizeCoverForSave(current);
  const savedTitle = saved.elements[0];
  assert.equal(savedTitle?.x, 88);
  assert.equal(savedTitle?.type, "text");
  if (savedTitle?.type === "text") assert.deepEqual(savedTitle.content, { kind: "literal", text: "Edited title" });
});

test("resize updates can enlarge a text layer within the A4 page", () => {
  const resized = updateCoverElement(composition, "title", { width: 120, height: 42 });
  assert.equal(resized.elements[0]?.width, 120);
  assert.equal(resized.elements[0]?.height, 42);
});

test("resize preserves media aspect ratio and clamps the page bounds", () => {
  const media = normalizeCoverComposition({ ...composition, elements: [{ ...composition.elements[0], type: "image", assetId: "asset", x: 180, y: 280, width: 20, height: 10, rotation: 37, aspectLocked: true }] })!;
  const resized = resizeCoverElement(media, "title", { x: 190, y: 290, width: 80, height: 40 });
  const element = resized.elements[0];
  assert.equal(element.x, 130);
  assert.equal(element.y, 257);
  assert.equal(element.width, 80);
  assert.equal(element.height, 40);
  assert.equal(element.rotation, 37);
});

test("bound text can be detached without changing its displayed value", () => {
  const bound = updateCoverElement(composition, "title", { content: { kind: "binding", binding: "policyTitle" } });
  const detached = detachCoverText(bound, "title", "Custom cover title");
  const detachedTitle = detached.elements[0];
  assert.equal(detachedTitle?.type, "text");
  if (detachedTitle?.type === "text") assert.deepEqual(detachedTitle.content, { kind: "literal", text: "Custom cover title" });
});

test("screen coordinates convert to the persisted A4 coordinate system", () => {
  assert.deepEqual(screenToCover({ x: 210, y: 297 }, { left: 10, top: 20, scale: 2 }), { x: 100, y: 138.5 });
});

test("point typography uses the same A4 scale as the cover preview", () => {
  assert.ok(Math.abs(coverPointSizeToPixels(30, 418 / 210) - 21.0658730159) < 0.001);
});

test("element positions snap to the page center", () => {
  const element = composition.elements[0];
  const snapped = snapElementPosition(composition, element, { x: 73, y: 40 });
  assert.equal(snapped.x, 75);
  assert.deepEqual(snapped.guides, [{ axis: "x", value: 105 }]);
});
