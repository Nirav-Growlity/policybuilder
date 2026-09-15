import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import sharp from "sharp";
import { DOCUMENT_THEMES } from "../document-themes";
import { templatePreviewPolicy } from "../sample-policies";
import { generateDocx } from "./generate";

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#126845"/></svg>');

test("page borders use Word's native page-edge border with valid spacing", async () => {
  for (const insetMm of [5, 10, 20]) {
    const policy = templatePreviewPolicy("standard-pack", "environmental");
    policy.templateBrandOverrides = { schemaVersion: 1, pageBorder: { enabled: true, widthPt: 1, insetMm, scope: "all", color: "#234567" } };
    const zip = await JSZip.loadAsync(await generateDocx(policy));
    const xml = await zip.file("word/document.xml")!.async("string");
    const border = xml.match(/<w:pgBorders[\s\S]*?<\/w:pgBorders>/)![0];
    assert.match(border, /w:offsetFrom="page"/);
    assert.match(border, /w:display="allPages"/);
    const sides = [...border.matchAll(/<w:(top|left|bottom|right)\b[^>]*w:space="(\d+)"/g)];
    assert.equal(sides.length, 4);
    for (const side of sides) assert.equal(Number(side[2]), Math.min(31, Math.round(insetMm * 72 / 25.4)));
  }
});

test("Word table headers use the preview's soft fill and subheading color", async () => {
  for (const theme of DOCUMENT_THEMES) {
    const policy = templatePreviewPolicy(theme.id, "environmental");
    policy.templateBrandOverrides = { schemaVersion: 1, colors: { soft: "#DDEEDD", subheading: "#234567" } };
    const zip = await JSZip.loadAsync(await generateDocx(policy));
    const xml = await zip.file("word/document.xml")!.async("string");
    const headers = [...xml.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map(match => match[0]).filter(row => row.includes("<w:tblHeader"));
    assert.ok(headers.length, `${theme.id}: expected data tables`);
    for (const header of headers) {
      assert.match(header, /w:fill="DDEEDD"/, `${theme.id}: preview table fill`);
      assert.match(header, /w:color w:val="234567"/, `${theme.id}: preview table text`);
    }
  }
});

for (const format of ["png", "jpeg", "webp", "svg+xml"] as const) {
  test(`Word embeds ${format} logos in content headers for every template`, async () => {
    const bytes = format === "svg+xml" ? svg : await sharp(svg).toFormat(format).toBuffer();
    for (const theme of DOCUMENT_THEMES) {
      const policy = templatePreviewPolicy(theme.id, "environmental");
      policy.company.companyLogo = `data:image/${format};base64,${bytes.toString("base64")}`;
      const zip = await JSZip.loadAsync(await generateDocx(policy));
      const document = await zip.file("word/document.xml")!.async("string");
      const relationships = await zip.file("word/_rels/document.xml.rels")!.async("string");
      for (const kind of ["first", "default"]) {
        const id = document.match(new RegExp(`<w:headerReference w:type="${kind}" r:id="([^"]+)"`))![1];
        const target = relationships.match(new RegExp(`<Relationship[^>]*Id="${id}"[^>]*Target="([^"]+)"`))![1];
        const header = await zip.file(`word/${target}`)!.async("string");
        // Background drawings are anchored; the company logo is inline.
        assert.equal(header.includes("<wp:inline"), kind === "default", `${theme.id}: ${kind} header must ${kind === "first" ? "exclude" : "include"} the ${format} logo`);
      }
    }
  });
}

test("custom cover is embedded as the first-page image", async () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.company.name = "Cover Test Ltd";
  policy.coverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "standard-pack",
    background: { color: "#FFFFFF", fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [{ id: "title", type: "text", x: 20, y: 20, width: 150, height: 20, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, content: { kind: "binding", binding: "companyName" }, fontFamily: "Arial", fontSize: 20, color: "#123456", bold: true, italic: false, underline: false, align: "left", lineHeight: 1.2, letterSpacing: 0 }],
  };
  const zip = await JSZip.loadAsync(await generateDocx(policy));
  const media = Object.keys(zip.files).filter((name) => name.startsWith("word/media/") && name.endsWith(".png"));
  assert.ok(media.length, "custom cover PNG should be embedded");
  const document = await zip.file("word/document.xml")!.async("string");
  assert.match(document, /<w:br w:type="page"\/>/);
  const sectionBreak = document.indexOf("<w:sectPr>");
  const firstPageBreak = document.indexOf('<w:br w:type="page"/>');
  assert.ok(sectionBreak >= 0 && firstPageBreak > sectionBreak, "custom cover must not add a blank page before the next section");
  assert.match(document, /<wp:anchor[^>]*relativeHeight="1"[^>]*>[^]*?<wp:docPr[^>]*Custom cover background/);
  const extent = document.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/);
  assert.deepEqual(extent?.slice(1).map(Number), [794 * 9525, 1123 * 9525], "custom cover should use the full A4 pixel canvas");
});

test("custom cover text remains an editable Word text box", async () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.company.name = "Editable Cover Ltd";
  policy.company.companyLogo = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#126845"/></svg>').toString("base64")}`;
  policy.coverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "standard-pack",
    background: { color: "#FFFFFF", fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [
      { id: "logo", type: "logo", x: 20, y: 20, width: 50, height: 18, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, focalPoint: { x: 50, y: 50 }, altText: "Company logo" },
      { id: "title", type: "text", x: 20, y: 50, width: 150, height: 20, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false, content: { kind: "binding", binding: "companyName" }, fontFamily: "Arial", fontSize: 20, color: "#123456", bold: true, italic: false, underline: false, align: "left", lineHeight: 1.2, letterSpacing: 0 },
    ],
  };
  const zip = await JSZip.loadAsync(await generateDocx(policy));
  const document = await zip.file("word/document.xml")!.async("string");
  assert.doesNotMatch(document, /<undefined>/, "custom cover text must not add an invalid XML wrapper");
  assert.match(document, /<w:txbxContent>[\s\S]*Editable Cover Ltd[\s\S]*<\/w:txbxContent>/);
  assert.match(document, /<v:shape[^>]*type="#_x0000_t202"/);
  assert.match(document, /<wp:anchor\b[^>]*>[\s\S]*<pic:pic\b/, "custom cover logo should remain a separate floating Word image");
});

test("professional focus rows keep number markers transparent like preview", async () => {
  const policy = templatePreviewPolicy("standard-pack", "labour-human-rights");
  policy.focusAreas = ["Focus parity proof"];
  const zip = await JSZip.loadAsync(await generateDocx(policy));
  const document = await zip.file("word/document.xml")!.async("string");
  const focusText = document.indexOf("Focus parity proof");
  assert.ok(focusText >= 0, "focus row should be present");
  const rowStart = document.lastIndexOf("<w:tr", focusText);
  const rowEnd = document.indexOf("</w:tr>", focusText);
  const row = document.slice(rowStart, rowEnd);
  assert.match(row, />01<\/w:t>/);
  assert.doesNotMatch(row, /w:fill="/, "professional focus marker should not render as a filled blue cell");
});
