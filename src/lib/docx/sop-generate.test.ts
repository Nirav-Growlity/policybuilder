import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import JSZip from "jszip";
import sharp from "sharp";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { coverArtSvg } from "../sop/design/cover-art";
import { SOP_DESIGNS } from "../sop/design/templates";
import { buildSampleRenderModel } from "../sop/sample-render-model";
import { compileSopManual, type ManualAsset } from "../typst/compile";
import { sopFontFiles } from "../typst/fonts";
import { bookmarkName, generateSopDocx, smartQuotes, sopManualAnchors, sopPagesFromPdf } from "./sop-generate";

async function sample(templateId: string) {
  const design = SOP_DESIGNS.find((entry) => entry.id === templateId)!;
  const assets: ManualAsset[] = [];
  let coverImage: string | null = null;
  if (design.cover === "image-banner") {
    coverImage = "/assets/cover-art.png";
    assets.push({ path: "assets/cover-art.png", content: await sharp(Buffer.from(coverArtSvg(design.palette))).png().toBuffer() });
  }
  return { model: buildSampleRenderModel({ templateId, coverImage }), assets };
}

async function open(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const read = (name: string) => zip.file(name)?.async("string") ?? Promise.resolve("");
  return { zip, document: await read("word/document.xml"), fontTable: await read("word/fontTable.xml"), styles: await read("word/styles.xml"), settings: await read("word/settings.xml") };
}

for (const design of SOP_DESIGNS) {
  test(`${design.id}: one section per page start, bookmarks for every contents entry, embedded fonts`, async () => {
    const { model, assets } = await sample(design.id);
    const { zip, document, fontTable, styles } = await open(await generateSopDocx(model, assets));

    // Cover, contents, front matter, closing, every SOP, and a divider page per chapter where the design has them.
    const sops = model.chapters.flatMap((chapter) => chapter.sops);
    const dividers = design.chapterDivider === "pillar-page" ? model.chapters.filter((chapter) => chapter.label).length : 0;
    const sections = (document.match(/<w:sectPr\b/g) ?? []).length;
    assert.equal(sections, 4 + sops.length + dividers);

    const bookmarks = new Set([...document.matchAll(/<w:bookmarkStart [^>]*w:name="([^"]+)"/g)].map((match) => match[1]));
    const references = new Set([...document.matchAll(/PAGEREF (\S+) \\h/g)].map((match) => match[1]));
    for (const { anchor } of sopManualAnchors(model)) {
      assert.ok(bookmarks.has(bookmarkName(anchor)), `bookmark for ${anchor}`);
      if (anchor !== "contents" && !anchor.startsWith("chapter-")) assert.ok(references.has(bookmarkName(anchor)), `contents entry for ${anchor}`);
    }

    // Both template faces are embedded (regular through the docx package, bold and italics added after).
    for (const family of [model.design.fonts.heading, model.design.fonts.body]) {
      const entry = new RegExp(`<w:font w:name="${family}">[\\s\\S]*?</w:font>`).exec(fontTable)?.[0] ?? "";
      assert.match(entry, /<w:embedRegular /, `${family} regular embedded`);
      assert.match(entry, /<w:embedBold /, `${family} bold embedded`);
    }
    assert.ok(Object.keys(zip.files).some((name) => name.startsWith("word/fonts/")));
    assert.match(styles, /<w14:ligatures w14:val="standard"\/>/);

    // Each SOP's running header names it (except designs whose header shows only the manual).
    const headers = await Promise.all(Object.keys(zip.files).filter((name) => /^word\/header\d+\.xml$/.test(name)).map((name) => zip.file(name)!.async("string")));
    if (design.runningHeader === "control-table" || design.runningHeader === "code-strip") {
      for (const sop of sops) assert.ok(headers.some((xml) => xml.includes(sop.code)), `header for ${sop.code}`);
    }

    // Exact line spacing everywhere, so Word keeps the Typst pitch.
    assert.doesNotMatch(document, /w:lineRule="auto"/);
  });
}

test("contents page numbers come from the Typst PDF outline", async () => {
  const root = process.cwd();
  const workspace = join(root, ".typst-workspace");
  const compiler = NodeCompiler.create({ workspace, fontArgs: [{ fontPaths: sopFontFiles(root) }] });
  const template = readFileSync(join(root, "lib", "typst", "sop", "manual.typ"), "utf8");
  const { model, assets } = await sample("controlled-manual");
  const compiled = compileSopManual(compiler, template, model, assets, workspace);
  const pages = await sopPagesFromPdf(compiled.pdf, model);
  assert.equal(pages.total, compiled.pageCount);
  for (const { anchor } of sopManualAnchors(model)) {
    assert.ok(pages.anchors[anchor] > 0, `page for ${anchor}`);
    // The export route reads the same pages straight from the Typst compile.
    assert.equal(compiled.anchorPages[anchor], pages.anchors[anchor], `queried page for ${anchor}`);
  }
  const sops = model.chapters.flatMap((chapter) => chapter.sops);
  assert.ok(sops.every((sop, index) => index === 0 || pages.anchors[sop.anchor] > pages.anchors[sops[index - 1].anchor]));

  // Company facts sections sit after Scope in the PDF, in the same order as the model.
  assert.ok(pages.anchors["front-scope"] <= pages.anchors["front-contacts"] && pages.anchors["front-contacts"] <= pages.anchors["front-certifications"]);

  const { document, settings } = await open(await generateSopDocx(model, assets, { pages }));
  for (const text of ["Key Contacts", "Certifications and Standards", "grievance@meridiantextiles.in", "SA8000:2014 Social Accountability"]) assert.ok(document.includes(text), `Word has ${text}`);
  assert.ok(document.indexOf("Key Contacts") < document.indexOf("Certifications and Standards"));
  const first = sops[0];
  assert.match(document, new RegExp(`PAGEREF ${bookmarkName(first.anchor)} \\\\h </w:instrText>[\\s\\S]*?<w:t>${pages.anchors[first.anchor]}</w:t>`));
  // Known page numbers need no field update prompt.
  assert.doesNotMatch(settings, /updateFields/);
});

test("bookmark names are valid Word names and quotes match Typst's smart quotes", () => {
  assert.equal(bookmarkName("front-how-to-use"), "front_how_to_use");
  assert.equal(bookmarkName("1-intro"), "a_1_intro");
  assert.ok(bookmarkName("x".repeat(60)).length <= 40);
  assert.equal(smartQuotes(`the company's "approved" list`), "the company\u2019s \u201Capproved\u201D list");
});

test("Word prints the classification instead of \"Controlled copy\", the new control fields and revision columns", async () => {
  const { model, assets } = await sample("controlled-manual");
  assert.equal(model.control.classification, "Internal");
  const { zip, document } = await open(await generateSopDocx(model, assets));
  const parts = await Promise.all(Object.keys(zip.files).filter((name) => /^word\/(header|footer)\d+\.xml$/.test(name)).map((name) => zip.file(name)!.async("string")));
  const text = (xml: string) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((match) => match[1]).join("");
  const body = text(document);
  const furniture = parts.map(text).join("\n");
  // The sample's own text mentions controlled copies; the cover and the page furniture must not.
  const cover = body.slice(0, body.indexOf("Contents"));
  assert.doesNotMatch(cover + furniture, /controlled copy/i);
  // Cover: the classification panel, and Supersedes / Issue date / Last review in the control grid
  // (the grid sits in the cover section's footer, pinned to the page bottom as in Typst).
  for (const label of ["ESG SOP Manual", "INTERNAL", "Supersedes", "Issue date", "Last review", "28 Oct 2026", "20 Oct 2026"]) assert.ok((cover + furniture).toLowerCase().includes(label.toLowerCase()), `cover shows ${label}`);
  // Running header and footer.
  for (const label of ["ESG SOP Manual", "Supersedes: Rev 00 (01 Nov 2025)", "Issue date: 28 Oct 2026", "Last review: 20 Oct 2026", "Internal | "]) assert.ok(furniture.includes(label), `header or footer shows ${label}`);
  // Revision history gains Reviewed by / Approved by columns.
  assert.match(body, /RevisionDateDescriptionReviewed byApproved by/);
  assert.ok(body.includes("V. Raghavan, Managing Director"));

  // No classification: back to "Controlled copy"; no revision names: no extra columns; no optional cells.
  const plain = structuredClone(model);
  Object.assign(plain.control, { classification: "", supersedes: "", issueDate: "", lastReviewDate: "" });
  plain.closing.revisions = plain.closing.revisions.map((row) => ({ ...row, reviewedBy: "", approvedBy: "" }));
  const reopened = await open(await generateSopDocx(plain, assets));
  const plainParts = await Promise.all(Object.keys(reopened.zip.files).filter((name) => /^word\/(header|footer)\d+\.xml$/.test(name)).map((name) => reopened.zip.file(name)!.async("string")));
  const plainBody = text(reopened.document);
  assert.ok(plainParts.map(text).join("\n").includes("Controlled copy | "));
  assert.match(plainBody.slice(0, plainBody.indexOf("Contents")), /CONTROLLED COPY/);
  assert.match(plainBody, /RevisionDateDescription(?!Reviewed by)/);
  const plainCover = plainBody.slice(0, plainBody.indexOf("Contents")).toLowerCase();
  for (const label of ["Supersedes", "Issue date", "Last review"]) assert.ok(!plainCover.includes(label.toLowerCase()) && !plainParts.map(text).join("").toLowerCase().includes(label.toLowerCase()), `no ${label}`);
});

test("Word prints the Compliance section and the records No. column only where the sample has form numbers", async () => {
  const { model, assets } = await sample("controlled-manual");
  const { document } = await open(await generateSopDocx(model, assets));
  const text = document.replace(/<[^>]+>/g, "");
  assert.equal(text.split("Legal &amp; Regulatory Compliance").length - 1 >= model.chapters.flatMap((chapter) => chapter.sops).length, true);
  assert.match(text, /MTPL\/EHS\/F-01/);
  const sops = model.chapters.flatMap((chapter) => chapter.sops);
  const columns = (index: number) => {
    const block = sops[index].sections.find((section) => section.kind === "records")!.blocks[0];
    return block.type === "table" ? block.columns : [];
  };
  assert.deepEqual(columns(0).slice(0, 2), ["No.", "Record"]);
  assert.equal(columns(1)[0], "Record");
});

test("a table inside a procedure step prints in place, nested in the step table where the design uses one", async () => {
  for (const templateId of ["controlled-manual", "sop-cards"]) {
    const { model, assets } = await sample(templateId);
    const { document } = await open(await generateSopDocx(model, assets));
    const step = document.indexOf("Collection and dispatch");
    const table = document.indexOf("Waste stream<", step);
    const next = document.indexOf("Disposal documentation", step);
    assert.ok(step > 0 && table > step && table < next, `${templateId}: the step's table sits inside its step`);
    if (templateId === "sop-cards") {
      // The step's cell holds a whole table of its own: one table deeper than the step heading.
      const depth = (at: number) => (document.slice(0, at).match(/<w:tbl>/g) ?? []).length - (document.slice(0, at).match(/<\/w:tbl>/g) ?? []).length;
      assert.equal(depth(table), depth(step) + 1, "nested table inside the action cell");
    }
  }
});

test("title tables keep with what follows in every row, so Word never strands a heading", async () => {
  const keeps = (paragraph: string) => /<w:keepNext(?![^>]*w:val="(false|0)")[^>]*\/>/.test(paragraph);
  let checked = 0;
  for (const design of SOP_DESIGNS) {
    const { model, assets } = await sample(design.id);
    const { document } = await open(await generateSopDocx(model, assets));
    // The body heading of a front-matter part (the last bookmark of that name is in the body).
    const at = document.lastIndexOf("Scope and Applicability");
    const start = document.lastIndexOf("<w:tbl>", at);
    const inTable = start >= 0 && document.indexOf("</w:tbl>", start) > at && document.lastIndexOf("</w:tbl>", at) < start;
    if (!inTable) continue;
    const tableXml = document.slice(start, document.indexOf("</w:tbl>", at));
    const paragraphs = tableXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
    assert.ok(paragraphs.length > 1, `${design.id}: the alignment row and the title row`);
    assert.ok(paragraphs.every(keeps), `${design.id}: every paragraph of the title table keeps with next`);
    checked += 1;
  }
  // pillar-banner, title-banner and register-head draw part titles as tables.
  assert.equal(checked, 3);
});

test("an SOP code that already starts with SOP is not printed as \"SOP SOP-…\"", async () => {
  const { model, assets } = await sample("controlled-manual");
  const sop = model.chapters[0].sops[0];
  sop.code = "SOP-EHS-001";
  const { document } = await open(await generateSopDocx(model, assets));
  assert.doesNotMatch(document, /SOP SOP-EHS-001/i);
  assert.match(document, /SOP-EHS-001 {3}\| {3}/);
});


for (const id of ["shop-floor", "chapter-book"] as const) {
  test(`${id}: Word uses sentence case, horizontal tables and all four font slots`, async () => {
    const { model, assets } = await sample(id);
    const { document, fontTable } = await open(await generateSopDocx(model, assets));
    assert.doesNotMatch(document, /w:caps|w:spacing w:val="12"/);
    for (const family of new Set([model.design.fonts.heading, model.design.fonts.body])) {
      const entry = new RegExp(`<w:font w:name="${family}">[\\s\\S]*?</w:font>`).exec(fontTable)?.[0] ?? "";
      for (const slot of ["Regular", "Bold", "Italic", "BoldItalic"]) assert.match(entry, new RegExp(`<w:embed${slot} `), `${family}: ${slot}`);
    }
    assert.match(document, id === "shop-floor" ? /shop-floor-band/ : /w:sz w:val="136"/);
    assert.ok(SOP_DESIGNS.find(design => design.id === id)?.table.borders === "horizontal");
  });
}
