import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCoverComposition } from "@/lib/cover-composition";
import { coverEditorReducer, coverPointSizeToPixels, createCoverEditorState, normalizeCoverForSave, screenToCover, snapElementPosition } from "./cover-editor-state";

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
