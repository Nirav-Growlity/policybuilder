import assert from "node:assert/strict";
import test from "node:test";
import { makeSamplePolicy } from "../store";
import { editDirective, editSourceText, parseEdit, shortenLimit } from "./policy-edit";

const LONG = "The Company commits to reduce energy use across every site. It will report progress each year. It will train all staff on energy saving. It will review this policy every two years.";

test("shorten sets a hard word limit below the current length", () => {
  const directive = editDirective({ action: "shorten" }, LONG);
  assert.match(directive, new RegExp(`${shortenLimit(LONG)} words or fewer`));
  assert.ok(shortenLimit(LONG) < LONG.split(/\s+/).length);
  assert.match(directive, /overrides the length guidance/);
});

test("rewrite marks the text as replaced so the model does not hand it back", () => {
  assert.match(editDirective({ action: "rewrite" }, LONG), /being replaced/);
  assert.match(editDirective({ action: "rewrite", instruction: "Mention Gujarat" }, LONG), /Mention Gujarat/);
});

test("grammar only corrects, and custom carries the user's words", () => {
  assert.match(editDirective({ action: "grammar" }, LONG), /grammar, spelling and punctuation only/);
  assert.match(editDirective({ action: "custom", instruction: "Use a list" }, LONG), /"Use a list"/);
});

test("edits from a request body are validated", () => {
  assert.deepEqual(parseEdit({ action: "improve" }), { action: "improve" });
  assert.deepEqual(parseEdit({ action: "custom", instruction: "  Shorter  " }), { action: "custom", instruction: "Shorter" });
  assert.equal(parseEdit({ action: "delete" }), null);
  assert.equal(parseEdit({ action: "custom", instruction: 4 }), null);
  assert.equal(parseEdit("improve"), null);
});

test("the edit source is a section's text or one target's sentence", () => {
  assert.equal(editSourceText("  Text  "), "Text");
  assert.equal(editSourceText({ target: "Cut waste by 20%.", baseline: "FY 2024-25" }), "Cut waste by 20%.");
  assert.equal(editSourceText(["a", "b"]), "");
});
