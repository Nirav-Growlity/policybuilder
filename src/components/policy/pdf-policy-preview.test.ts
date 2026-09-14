import assert from "node:assert/strict";
import test from "node:test";
import { getPdfPageWidth } from "@/lib/pdf-preview-layout";

test("all rendered PDF pages use the same preview width", () => {
  const targetWidth = 1000;

  assert.equal(getPdfPageWidth(1, targetWidth), targetWidth);
  assert.equal(getPdfPageWidth(2, targetWidth), targetWidth);
});
