import assert from "node:assert/strict";
import test from "node:test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import sharp from "sharp";
import { makeSamplePolicy } from "../store";
import { generatePdf } from "./generate";
import { applyCustomCoverPage } from "./print-document";

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

test("custom cover overlay is attached to the complete first page", async () => {
  const document = await PDFDocument.create();
  document.addPage([595.28, 841.89]);
  const cover = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 12, g: 34, b: 56, alpha: 1 } } }).png().toBuffer();
  const output = await applyCustomCoverPage(await document.save(), cover);
  const page = (await PDFDocument.load(output)).getPages()[0];
  const { Resources } = page.node.normalizedEntries();
  const xObjects = Resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
  assert.ok(xObjects && xObjects.size > 0, "the first page should contain the full-page cover image");
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

test("generatePdf renders custom cover compositions as A4", async () => {
  const policy = makeSamplePolicy();
  policy.coverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "standard-pack",
    background: { color: "#FFFFFF", fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [{ id: "title", type: "text", x: 20, y: 20, width: 160, height: 20, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, content: { kind: "binding", binding: "policyTitle" }, fontFamily: "Arial", fontSize: 20, color: "#123456", bold: true, italic: false, underline: false, align: "left", lineHeight: 1.2, letterSpacing: 0 }],
  };
  const output = await generatePdf(policy);
  const pages = (await PDFDocument.load(output)).getPages();
  assert.ok(output.length > 0);
  assert.ok(pages.length >= 1);
  assert.ok(Math.abs(pages[0].getWidth() - 595.28) < 1);
  assert.ok(Math.abs(pages[0].getHeight() - 841.89) < 1);
});
