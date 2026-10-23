import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import JSZip from "jszip";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { generateSopDocx } from "../docx/sop-generate";
import { SOP_TEMPLATE_IDS } from "../sop/types";
import { compileSopManual } from "../typst/compile";
import { sopFontFiles } from "../typst/fonts";
import { buildHandbookRenderModel, HANDBOOK_RENDER_LABELS } from "./render-model";
import { buildSampleHandbook } from "./sample-handbook";
import { handbookManualSchema } from "./schema";

function compilerAndTemplate() {
  const root = process.cwd();
  const workspace = join(root, ".typst-workspace");
  const compiler = NodeCompiler.create({ workspace, fontArgs: [{ fontPaths: sopFontFiles(root) }] });
  const template = readFileSync(join(root, "lib", "typst", "sop", "manual.typ"), "utf8");
  return { compiler, template, workspace };
}

async function pdfText(pdf: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const items = (await (await doc.getPage(n)).getTextContent()).items as Array<{ str: string }>;
    pages.push(items.map((item) => item.str).join(""));
  }
  await doc.destroy();
  return pages.join("\n").replace(/\s+/g, "");
}

test("the sample handbook passes save validation", () => {
  assert.ok(handbookManualSchema.safeParse(buildSampleHandbook()).success);
});

test("chapters group under handbook parts in part order and number in reading order", () => {
  const model = buildHandbookRenderModel(buildSampleHandbook());
  assert.equal(model.kind, "handbook");
  assert.deepEqual(model.labels, HANDBOOK_RENDER_LABELS);
  assert.deepEqual(model.chapters.map((chapter) => chapter.label), ["Joining the Company", "Working Here", "Conduct and Ethics", "A Fair and Respectful Workplace", "Speaking Up", "Leaving the Company"]);
  const items = model.chapters.flatMap((chapter) => chapter.sops);
  assert.equal(items.map((item) => item.number).join(","), "1,2,3,4,5,6,7");
  assert.equal(items[0].code, "Chapter 1", "chapters without a code are numbered");
  assert.equal(items[2].title, "Leave and Holidays");
  assert.equal(items[2].department, "Working Here");
  assert.equal(model.title, "Employee Handbook");
  assert.equal(model.cover.eyebrow, "Employee Handbook");
  assert.equal(model.stats.sopCount, 7);
});

test("front matter prints welcome, vision and mission, values, sites and facts; closing ends with the acknowledgement", () => {
  const model = buildHandbookRenderModel(buildSampleHandbook());
  assert.deepEqual(model.frontMatter.map((section) => section.title), ["Welcome", "About the Company", "Vision and Mission", "Our Values", "Purpose of this Handbook", "Scope and Applicability", "Key Contacts", "Certifications and Standards", "How to Use this Handbook"]);
  const vision = model.frontMatter.find((section) => section.id === "vision")!;
  assert.deepEqual(vision.blocks[0], { type: "table", columns: ["Our vision", "Our mission"], widths: [1, 1], rows: [["To be the most trusted fabric finisher in India.", "To deliver consistent quality safely, fairly and with care for the environment."]] });
  assert.equal(model.closing.after.length, 1);
  assert.equal(model.closing.after[0].title, "Employee Acknowledgement");
  assert.equal(model.closing.revisions[0].description, "First issue of the employee handbook.");
});

test("a one-chapter preview drops front matter, closing and part labels", () => {
  const manual = buildSampleHandbook();
  const model = buildHandbookRenderModel(manual, { onlyChapterIds: [manual.chapters[2].id], includeEmptySections: true });
  assert.equal(model.mode, "sops");
  assert.equal(model.frontMatter.length, 0);
  assert.equal(model.closing.after.length, 0);
  assert.deepEqual(model.chapters.flatMap((chapter) => chapter.sops).map((item) => item.title), ["Leave and Holidays"]);
  assert.ok(model.chapters.every((chapter) => chapter.label === ""));
});

test("every template lays out a handbook with chapter labels and the acknowledgement page", async () => {
  const { compiler, template, workspace } = compilerAndTemplate();
  const manual = buildSampleHandbook();
  for (const theme of SOP_TEMPLATE_IDS) {
    const compiled = compileSopManual(compiler, template, buildHandbookRenderModel({ ...manual, theme }), [], workspace);
    assert.ok(compiled.pageCount > 10, `${theme}: ${compiled.pageCount} pages`);
    const text = await pdfText(compiled.pdf);
    assert.match(text, /EmployeeAcknowledgement/, `${theme}: acknowledgement page`);
    assert.match(text, /LeaveandHolidays/, `${theme}: chapter title`);
    assert.doesNotMatch(text, /SOPNo\.|Standardoperatingprocedures|SOPsinthismanual/i, `${theme}: no SOP wording`);
  }
});

test("the Word file uses the handbook labels and ends with the acknowledgement", async () => {
  const model = buildHandbookRenderModel({ ...buildSampleHandbook(), theme: "sop-cards" });
  const zip = await JSZip.loadAsync(await generateSopDocx(model, []));
  const document = await zip.file("word/document.xml")!.async("string");
  const text = document.replace(/<[^>]+>/g, "");
  assert.match(text, /Chapter No\./i);
  assert.match(text, /Chapters in this handbook/i);
  assert.match(text, /1 chapter(?!s)/);
  assert.match(text, /Employee Acknowledgement/);
  assert.doesNotMatch(text, /SOP No\.|SOPs in this manual/i);
  const core = await zip.file("docProps/core.xml")!.async("string");
  assert.match(core, /employee handbook/);
});
