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

  const { document, settings } = await open(await generateSopDocx(model, assets, { pages }));
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
