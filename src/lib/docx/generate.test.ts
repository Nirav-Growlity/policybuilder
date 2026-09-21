import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import sharp from "sharp";
import { DOCUMENT_THEMES } from "../document-themes";
import { pageFooterDistanceMm } from "../page-geometry";
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
    const pageMargins = xml.match(/<w:pgMar\b[^>]*>/)![0];
    const footerDistance = Number(pageMargins.match(/w:footer="(\d+)"/)![1]);
    assert.equal(footerDistance, Math.round(pageFooterDistanceMm({ enabled: true, widthPt: 1, insetMm, scope: "all" }) * 72 / 25.4 * 20));
  }
});

test("quantitative Word output groups repeated areas and omits metadata columns", async () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.quantitative = [{
    area: "Gifts & Hospitality",
    targets: [
      { target: "Achieve 100% timely disclosure of reportable gifts", baseline: "FY 2025-26", deadline: "FY 2028-29", reportingFrequency: "Target period", subtopics: ["Maintain a centralized register.", "Apply approval thresholds."] },
      { target: "Complete 100% compliance training for relevant employees", baseline: "FY 2025-26", deadline: "FY 2029-30", reportingFrequency: "Target period", subtopics: ["Cover conflicts of interest."] },
    ],
  }];
  const zip = await JSZip.loadAsync(await generateDocx(policy));
  const document = await zip.file("word/document.xml")!.async("string");
  assert.equal((document.match(/Gifts &amp; Hospitality/g) || []).length, 1);
  assert.match(document, />01<\/w:t>/, "quantitative area numbers should be zero-padded");
  assert.equal((document.match(/Achieve 100%/g) || []).length, 1);
  assert.equal((document.match(/Complete 100%/g) || []).length, 1);
  assert.doesNotMatch(document, /Achievement year|Reporting basis|Targets are tracked/);
  assert.doesNotMatch(document, /Maintain a centralized register|Apply approval thresholds|Cover conflicts of interest/);
  assert.ok((document.match(/w:numId/g) || []).length >= 2, "quantitative targets should use Word bullets");
});

test("Word quantitative area numbers stay horizontal and align with the title", async () => {
  const policy = templatePreviewPolicy("sustainability-charter", "environmental");
  policy.quantitative = [{
    area: "Gifts & Hospitality",
    targets: [
      { target: "Achieve 100% timely disclosure of reportable gifts", baseline: "FY 2025-26", deadline: "FY 2028-29", reportingFrequency: "Target period", subtopics: [] },
      { target: "Complete 100% compliance training for relevant employees", baseline: "FY 2025-26", deadline: "FY 2029-30", reportingFrequency: "Target period", subtopics: [] },
    ],
  }];
  const zip = await JSZip.loadAsync(await generateDocx(policy));
  const document = await zip.file("word/document.xml")!.async("string");
  assert.match(document, /w:tcW w:type="dxa" w:w="1000"/, "quantitative area number cells should have enough width for two digits");
  assert.match(document, /w:vAlign w:val="top"/, "quantitative area numbers should align with the area title");
});

test("Word running header keeps spacing without a separator rule", async () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  const zip = await JSZip.loadAsync(await generateDocx(policy));
  const headerNames = Object.keys(zip.files).filter((name) => /^word\/header\d+\.xml$/.test(name));
  const headers = await Promise.all(headerNames.map((name) => zip.file(name)!.async("string")));
  assert.ok(headers.some((header) => header.includes('w:after="480"')), "content header should retain spacing before body content");
  assert.ok(headers.every((header) => !header.includes("<w:pBdr")), "running header should not contain a separator rule");
  assert.ok(headers.every((header) => !header.includes("M0 116H178")), "running header background should not contain a separator path");
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
  const backgroundAnchor = document.match(/<wp:anchor[^>]*relativeHeight="1"[^>]*>[^]*?<wp:docPr[^>]*Custom cover background[^]*?<\/wp:anchor>/)?.[0] || "";
  assert.match(backgroundAnchor, /behindDoc="0"/, "custom cover artwork must remain visible in Word's drawing stack");
  assert.match(document, /<wp:positionH relativeFrom="page"><wp:posOffset>0<\/wp:posOffset><\/wp:positionH>/, "the cover image should start at the page's left edge");
  assert.match(document, /<wp:positionV relativeFrom="page"><wp:posOffset>0<\/wp:posOffset><\/wp:positionV>/, "the cover image should start at the page's top edge");
  const extent = document.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/);
  assert.deepEqual(extent?.slice(1).map(Number), [794 * 9525, 1123 * 9525], "custom cover should use the full A4 pixel canvas");
  assert.doesNotMatch(document, /M0 116H178/, "Word page background must not add a running-header separator path");
});

test("custom cover keeps background and authored layers separate in Word", async () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.company.name = "Editable Cover Ltd";
  policy.company.companyLogo = `data:image/svg+xml;base64,${svg.toString("base64")}`;
  policy.coverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "standard-pack",
    background: { color: "#FFFFFF", fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [
      { id: "logo", type: "logo", x: 20, y: 20, width: 50, height: 18, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, fit: "contain", focalPoint: { x: 50, y: 50 }, altText: "Company logo" },
      { id: "photo", type: "image", x: 90, y: 20, width: 70, height: 40, rotation: 8, opacity: .75, zIndex: 2, visible: true, locked: false, assetId: `data:image/svg+xml;base64,${svg.toString("base64")}`, fit: "cover", focalPoint: { x: 35, y: 65 }, altText: "Cover photo" },
      { id: "title", type: "text", x: 20, y: 70, width: 170, height: 40, rotation: 0, opacity: 1, zIndex: 3, visible: true, locked: false, content: { kind: "binding", binding: "companyName" }, fontFamily: "Arial", fontSize: 36, color: "#123456", bold: true, italic: false, underline: false, align: "center", lineHeight: 1.2, letterSpacing: 0 },
      { id: "hidden", type: "text", x: 20, y: 120, width: 170, height: 20, rotation: 0, opacity: 1, zIndex: 4, visible: false, locked: false, content: { kind: "literal", text: "Hidden cover layer" }, fontFamily: "Arial", fontSize: 20, color: "#123456", bold: false, italic: false, underline: false, align: "left", lineHeight: 1.2, letterSpacing: 0 },
    ],
  };
  const zip = await JSZip.loadAsync(await generateDocx(policy));
  const media = Object.keys(zip.files).filter((name) => name.startsWith("word/media/") && name.endsWith(".png"));
  const coverEntries = (await Promise.all(media.map(async (name) => {
    const bytes = await zip.file(name)!.async("nodebuffer");
    return { name, bytes, metadata: await sharp(bytes).metadata() };
  }))).filter((entry) => entry.metadata.width === 2480 && entry.metadata.height === 3508);
  assert.equal(coverEntries.length, 1, "custom cover should have one full-page background image");
  const backgroundPixel = await sharp(coverEntries[0].bytes).extract({ left: 300, top: 300, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.ok(backgroundPixel.every((channel) => channel > 250), "cover layers should not be baked into the background image");
  const document = await zip.file("word/document.xml")!.async("string");
  assert.doesNotMatch(document, /<undefined>/, "custom cover layers must not add invalid XML wrappers");
  assert.match(document, /<w:txbxContent>[\s\S]*Editable Cover Ltd[\s\S]*<\/w:txbxContent>/, "cover title should remain editable text");
  assert.match(document, /v-text-anchor:top/, "Word text box should match the editor's top-aligned text");
  assert.match(document, /<w:jc w:val="center"\/><w:ind w:left="0" w:right="0" w:firstLine="0"\//, "Word text box should have no implicit paragraph indentation");
  assert.match(document, /mso-fit-shape-to-text:true/, "Word text box should fit shape to text to avoid clipping");
  assert.doesNotMatch(document, /<v:shape[^>]*style="[^"]*text-align:/, "Word shape style must not include text-align as it causes horizontal displacement");
  assert.match(document, /Company logo/, "cover logo should remain a separate Word image");
  assert.match(document, /Cover photo/, "cover image should remain a separate Word image");
  assert.equal((document.match(/<wp:anchor[\s\S]*?<pic:pic[\s\S]*?<\/pic:pic>[\s\S]*?<\/wp:anchor>/g) || []).length, 3, "background, logo, and photo should be separate anchored images");
  assert.doesNotMatch(document, /Hidden cover layer/, "hidden cover layers should not be exported");
});

test("custom cover text boxes encode horizontal alignment in the VML textbox", async () => {
  const policy = templatePreviewPolicy("standard-pack", "sustainable-procurement");
  policy.coverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "standard-pack",
    background: { color: "#FFFFFF", fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [{
      id: "policy-title",
      type: "text",
      x: 20,
      y: 70,
      width: 170,
      height: 60,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      visible: true,
      locked: false,
      content: { kind: "binding", binding: "policyTitle" },
      fontFamily: "Georgia",
      fontSize: 36,
      color: "#123456",
      bold: false,
      italic: false,
      underline: false,
      align: "center",
      lineHeight: 1.16,
      letterSpacing: 0,
    }],
  };
  const zip = await JSZip.loadAsync(await generateDocx(policy));
  const document = await zip.file("word/document.xml")!.async("string");

  assert.match(document, /<w:jc w:val="center"\/>/, "Word paragraphs should retain the same horizontal alignment");
  assert.match(document, /<v:shape[^>]*style="left:0;top:0;[^\"]*position:absolute;/, "Word VML text boxes should start from the page origin before applying their saved offsets");
  assert.match(document, /<v:shape[^>]*o:allowincell="f"[^>]*style="[^"]*position:absolute;[^\"]*margin-left:56\.69pt;[^\"]*margin-top:198\.43pt;/, "Word VML text boxes should use absolute page positioning with saved coordinates");
  assert.match(document, /<v:shape[^>]*style="[^\"]*mso-position-horizontal:absolute;[^\"]*mso-position-horizontal-relative:page;[^\"]*mso-position-vertical:absolute;[^\"]*mso-position-vertical-relative:page;/, "Word VML text boxes should be anchored to the page");
  assert.doesNotMatch(document, /<v:shape[^>]*style="[^"]*text-align:/, "VML shape style should not include text-align as it causes horizontal double-offset in Word");
  assert.match(document, /<v:textbox[^>]*style="[^"]*mso-fit-shape-to-text:true[^"]*"/, "Word VML text boxes should fit shape to text to prevent vertical clipping");
  assert.match(document, /<w10:wrap type="none" anchorx="page" anchory="page"\/>/, "Word VML text boxes should not participate in document flow");
});

test("AI cover keeps editable Word text layers over its full-page artwork", async () => {
  const policy = templatePreviewPolicy("standard-pack", "ethics");
  policy.activeCoverVariant = "ai";
  policy.aiCoverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "ai-generated",
    background: { color: "#FFFFFF", assetId: `data:image/svg+xml;base64,${svg.toString("base64")}`, fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [{
      id: "policy-title",
      type: "text",
      x: 20,
      y: 70,
      width: 170,
      height: 60,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      visible: true,
      locked: false,
      content: { kind: "binding", binding: "policyTitle" },
      fontFamily: "Arial",
      fontSize: 36,
      color: "#FFFFFF",
      bold: false,
      italic: false,
      underline: false,
      align: "center",
      lineHeight: 1.16,
      letterSpacing: 0,
    }],
  };
  const zip = await JSZip.loadAsync(await generateDocx(policy));
  const document = await zip.file("word/document.xml")!.async("string");
  const fullPageMedia = (await Promise.all(Object.keys(zip.files)
    .filter((name) => name.startsWith("word/media/") && name.endsWith(".png"))
    .map(async (name) => {
      const bytes = await zip.file(name)!.async("nodebuffer");
      return { bytes, metadata: await sharp(bytes).metadata() };
    })))
    .filter((entry) => entry.metadata.width === 2480 && entry.metadata.height === 3508);

  assert.match(document, /Custom cover background/, "Word should contain the composed AI cover artwork");
  assert.equal(fullPageMedia.length, 1, "AI artwork should remain a single background image");
  const artworkPixel = await sharp(fullPageMedia[0].bytes)
    .extract({ left: 300, top: 300, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  assert.ok(artworkPixel[1] > artworkPixel[0] * 2, "AI artwork must contribute visible pixels to the full-page cover image");
  assert.match(document, /<v:shape[^>]*id="cover-text-policy-title"/, "AI cover text should use a Word-editable text box");
  assert.match(document, /<w:txbxContent>[\s\S]*Ethics Policy[\s\S]*<\/w:txbxContent>/, "AI cover title should remain editable document text");
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

test("Word footer aligns document number, review ownership, and page number", async () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.company.docNum = "ENV-001";
  policy.company.reviewDate = "2027-01-14";
  policy.company.reviewerDesignations = ["Environmental Manager"];
  const zip = await JSZip.loadAsync(await generateDocx(policy));
  const footerFiles = Object.keys(zip.files).filter((name) => name.startsWith("word/footer") && name.endsWith(".xml"));
  assert.ok(footerFiles.length, "expected a Word footer");
  const footer = await zip.file(footerFiles[0])!.async("string");
  assert.match(footer, /Document No\./);
  assert.match(footer, /ENV-001/);
  assert.match(footer, /Review/);
  assert.match(footer, /Environmental Manager/);
  assert.match(footer, /w:instrText[^>]*>PAGE<\/w:instrText>/);
  assert.doesNotMatch(footer, /<w:pBdr/, "running footer should not contain a separator rule");
});

test("small Word logos are contained without being upscaled", async () => {
  const tiny = await sharp({ create: { width: 20, height: 10, channels: 4, background: { r: 18, g: 104, b: 69, alpha: 1 } } }).png().toBuffer();
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.company.companyLogo = `data:image/png;base64,${tiny.toString("base64")}`;
  const zip = await JSZip.loadAsync(await generateDocx(policy));
  const document = await zip.file("word/document.xml")!.async("string");
  const relationships = await zip.file("word/_rels/document.xml.rels")!.async("string");
  const id = document.match(/<w:headerReference w:type="default" r:id="([^"]+)"/)![1];
  const target = relationships.match(new RegExp(`<Relationship[^>]*Id="${id}"[^>]*Target="([^"]+)"`))![1];
  const header = await zip.file(`word/${target}`)!.async("string");
  const inlineExtent = header.slice(header.indexOf("<wp:inline")).match(/<wp:extent[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  assert.deepEqual(inlineExtent?.slice(1).map(Number), [20 * 9525, 10 * 9525]);
});
