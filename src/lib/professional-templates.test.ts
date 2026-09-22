import { templatePreviewPolicy } from "./sample-policies";
import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import JSZip from "jszip";
import { initialPolicy } from "./store";
import { getDocumentTemplatePatch, getPolicyDocumentTheme, DOCUMENT_THEMES, getDocumentThemePatch } from "./document-themes";
import { normalizePageBorder, pageMarginMm } from "./page-geometry";
import { createSavedDocumentTheme, normalizeSavedDocumentTheme, getSavedThemePatch } from "./theme-library";
import { generateDocx } from "./docx/generate";
import { applyPageBorders } from "./pdf/print-document";
import { buildDocumentRenderModel } from "./document-render-model";

test("canonical templates and legacy IDs coexist; new policies start with Standard Policy Pack", () => {
  assert.equal(getPolicyDocumentTheme(initialPolicy()).id, "standard-pack");
  assert.equal(DOCUMENT_THEMES.length, 8);
  assert.equal(DOCUMENT_THEMES.filter(t => t.collection === "professional").length, 8);
  assert.equal(getPolicyDocumentTheme(initialPolicy()).pageBorder.enabled, false);
  assert.equal(getPolicyDocumentTheme(initialPolicy()).pageBorder.scope, "all-except-cover");
});

test("canonical variants drive distinct document composition", () => {
  const canonical = DOCUMENT_THEMES;
  const fingerprints = canonical.map(theme => [
    theme.id,
    theme.layout.cover,
    theme.layout.toc,
    theme.layout.pageFrame,
    theme.layout.sectionOpener,
    theme.layout.dataLayout,
    theme.layout.controlTreatment,
    theme.layout.runningFurniture,
  ].join("|"));
  assert.equal(new Set(fingerprints).size, canonical.length);
  for (const theme of canonical) {
    const model = buildDocumentRenderModel({ ...initialPolicy(), documentTemplate: theme.id, documentTheme: theme.id });
    assert.equal(model.theme.id, theme.id);
  }
});

test("border input is normalized and enough room is reserved for its thickest setting", () => {
  assert.deepEqual(normalizePageBorder({ enabled: true, widthPt: 99, insetMm: -5, color: "red", scope: "invalid" }), { enabled: true, widthPt: 6, insetMm: 5, scope: "all-except-cover" });
  assert.equal(normalizePageBorder({ widthPt: NaN, insetMm: Infinity }).widthPt, 1);
  assert.ok(pageMarginMm(normalizePageBorder({ enabled: true, widthPt: 6, insetMm: 20 })) > 30);
});

test("border survives save, reload, duplication and applying a different template", () => {
  const policy = initialPolicy();
  policy.documentThemeOverrides = { schemaVersion: 1, pageBorder: { enabled: true, widthPt: 2.5, insetMm: 14, color: "#234567", scope: "cover" } };
  policy.visualStyle = "modern";
  const saved = createSavedDocumentTheme(policy, "Bordered policy");
  const restored = normalizeSavedDocumentTheme(JSON.parse(JSON.stringify(saved)))!;
  const applied = { ...policy, ...getSavedThemePatch(restored) };
  const switched = { ...applied, ...getDocumentTemplatePatch("executive-editorial-v1", applied) };
  assert.deepEqual(getPolicyDocumentTheme(switched).pageBorder, getPolicyDocumentTheme(policy).pageBorder);
  assert.equal(switched.visualStyle, "modern");
  restored.overrides.pageBorder!.widthPt = 6;
  assert.equal(getPolicyDocumentTheme(applied).pageBorder.widthPt, 2.5);
});

test("cover-only PDF border touches only page one; disabling preserves bytes", async () => {
  const document = await PDFDocument.create(); document.addPage([595.28, 841.89]); document.addPage([595.28, 841.89]);
  const bytes = await document.save();
  const border = normalizePageBorder({ enabled: true, widthPt: 6, insetMm: 20, scope: "cover" });
  const output = await PDFDocument.load(await applyPageBorders(bytes, border, "#233F59"));
  assert.ok(output.getPage(0).node.get(PDFName.of("Contents")));
  assert.equal(output.getPage(1).node.get(PDFName.of("Contents")), undefined);
  assert.deepEqual(await applyPageBorders(bytes, { ...border, enabled: false }, "#233F59"), Buffer.from(bytes));
});

test("except-cover PDF border touches every page after page one", async () => {
  const document = await PDFDocument.create(); document.addPage([595.28, 841.89]); document.addPage([595.28, 841.89]); document.addPage([595.28, 841.89]);
  const bytes = await document.save();
  const border = normalizePageBorder({ enabled: true, widthPt: 6, insetMm: 20, scope: "all-except-cover" });
  const output = await PDFDocument.load(await applyPageBorders(bytes, border, "#233F59"));
  assert.equal(output.getPage(0).node.get(PDFName.of("Contents")), undefined);
  assert.ok(output.getPage(1).node.get(PDFName.of("Contents")));
  assert.ok(output.getPage(2).node.get(PDFName.of("Contents")));
});

test("Word exports contain native page borders and editable text with isolated geometry", async () => {
  const base = { ...initialPolicy(), ...getDocumentThemePatch("corporate-standard-v1") };
  const bordered = { ...base, documentThemeOverrides: { schemaVersion: 1 as const, pageBorder: normalizePageBorder({ enabled: true, widthPt: 6, insetMm: 20, scope: "cover" }) } };
  const outputs = await Promise.all([generateDocx(bordered), generateDocx(base)]);
  const xml = await Promise.all(outputs.map(async bytes => (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string")));
  assert.match(xml[0], /w:pgBorders[^>]*w:display="firstPage"/);
  assert.match(xml[0], /w:sz="48"/);
  assert.match(xml[0], /Environmental Policy/);
  assert.doesNotMatch(xml[1], /w:pgBorders/);
});


test("main brand heading, subheading and body colors survive save/reload in Word", async () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  const colors = { primaryDark: "#912345", subheading: "#176B45", ink: "#234589" };
  policy.templateBrandOverrides = { schemaVersion: 1, colors };
  const saved = normalizeSavedDocumentTheme(JSON.parse(JSON.stringify(createSavedDocumentTheme(policy, "Independent text colors"))))!;
  const restored = { ...policy, ...getSavedThemePatch(saved) };
  assert.deepEqual(Object.fromEntries(Object.keys(colors).map(key => [key, getPolicyDocumentTheme(restored).colors[key as keyof typeof colors]])), colors);
  const model = buildDocumentRenderModel(restored);
  const primaryHex = getPolicyDocumentTheme(restored).colors.primary.replace("#", "").toUpperCase();
  const zip = await JSZip.loadAsync(await generateDocx(restored));
  const xml = await zip.file("word/document.xml")!.async("string");
  const runs = [...xml.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)].map(match => match[0]);
  const titleRun = runs.find(run => run.includes(model.cover.policyLabel));
  assert.match(titleRun || "", new RegExp(`w:color w:val="${primaryHex}"`));
  assert.equal(getPolicyDocumentTheme(restored).colors.subheading, colors.subheading, "Subheading color should survive save/reload when no logo palette is active");
  assert.ok(runs.some(run => run.includes('w:color w:val="234589"')), "Body content retains its own text color");
  for (const section of model.sections) {
    const heading = runs.find(run => run.includes(`<w:t xml:space="preserve">${section.title}</w:t>`) && run.includes("w:b"));
    if (heading) assert.match(heading, new RegExp(`w:color w:val="${primaryHex}"`));
  }
});
