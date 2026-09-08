import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { makeSamplePolicy } from "../store";
import { generatePdf } from "./generate";

test("generatePdf returns a non-empty PDF buffer", async () => {
  const output = await generatePdf(makeSamplePolicy());

  assert.ok(Buffer.isBuffer(output));
  assert.ok(output.length > 0);
  assert.equal(output.subarray(0, 5).toString("ascii"), "%PDF-");
  for (const page of (await PDFDocument.load(output)).getPages()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 1);
    assert.ok(Math.abs(page.getHeight() - 841.89) < 1);
  }
});

test("generatePdf renders a custom gradient theme as A4", async () => {
  const policy = makeSamplePolicy();
  policy.documentThemeOverrides = {
    schemaVersion: 1,
    colors: { primary: "#315C49", accent: "#B47B36" },
    background: { kind: "gradient", from: "#FFFFFF", to: "#E7F0EA", direction: "vertical" },
    density: "compact",
    logoScale: "large",
  };
  const output = await generatePdf(policy);

  assert.ok(output.length > 0);
  assert.equal(output.subarray(0, 5).toString("ascii"), "%PDF-");
  for (const page of (await PDFDocument.load(output)).getPages()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 1);
    assert.ok(Math.abs(page.getHeight() - 841.89) < 1);
  }
});
