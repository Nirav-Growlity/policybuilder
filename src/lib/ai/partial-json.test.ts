import assert from "node:assert/strict";
import test from "node:test";
import { parsePartialJson } from "./partial-json";

test("returns undefined before any value arrives", () => {
  assert.equal(parsePartialJson(""), undefined);
  assert.equal(parsePartialJson("  "), undefined);
});

test("keeps the received part of an unfinished string value", () => {
  assert.deepEqual(parsePartialJson('{"text": "The Company com'), { text: "The Company com" });
});

test("leaves out a key that has not finished arriving", () => {
  assert.deepEqual(parsePartialJson('{"te'), {});
  assert.deepEqual(parsePartialJson('{"text"'), {});
  assert.deepEqual(parsePartialJson('{"text": '), {});
});

test("decodes escapes and drops a half-received escape", () => {
  assert.deepEqual(parsePartialJson('{"text": "Line one\\nLine \\"two\\'), { text: 'Line one\nLine "two' });
  assert.deepEqual(parsePartialJson('{"text": "caf\\u00e9 \\u00'), { text: "café " });
});

test("streams list items one by one", () => {
  assert.deepEqual(parsePartialJson('{"objectives": ["First.", "Sec'), { objectives: ["First.", "Sec"] });
  assert.deepEqual(
    parsePartialJson('{"responsibilities": [{"role": "Board", "duty": "Appro'),
    { responsibilities: [{ role: "Board", duty: "Appro" }] },
  );
});

test("holds back a number or literal that may still be growing", () => {
  assert.deepEqual(parsePartialJson('{"sdgs": [3, 1'), { sdgs: [3] });
  assert.deepEqual(parsePartialJson('{"sdgs": [3, 12]}'), { sdgs: [3, 12] });
  assert.deepEqual(parsePartialJson('{"ok": tr'), {});
});

test("parses a complete document exactly", () => {
  const full = { text: "Done.", list: [1, true, null, { a: "b" }] };
  assert.deepEqual(parsePartialJson(JSON.stringify(full)), full);
});
