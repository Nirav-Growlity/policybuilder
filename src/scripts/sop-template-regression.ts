// Compare pre-change renderers at a fixed clock, so only random font keys vary.
// Run: node --import tsx scripts/sop-template-regression.ts [base-ref]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mock } from "node:test";
import JSZip from "jszip";
import sharp from "sharp";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { generateSopDocx } from "../lib/docx/sop-generate";
import { buildSampleRenderModel } from "../lib/sop/sample-render-model";
import { coverArtSvg } from "../lib/sop/design/cover-art";
import { getSopDesign } from "../lib/sop/design/templates";
import { compileSopManual, type ManualAsset } from "../lib/typst/compile";
import { sopFontFiles } from "../lib/typst/fonts";

async function normalizedDocx(data: Buffer) {
  const zip = await JSZip.loadAsync(data);
  const fontTable = await zip.file("word/fontTable.xml")!.async("string");
  const rels = await zip.file("word/_rels/fontTable.xml.rels")!.async("string");
  const keys = new Map<string, string>();
  for (const embed of fontTable.matchAll(/<w:embed\w+\b[^>]+>/g)) {
    const id = /r:id="([^"]+)"/.exec(embed[0])?.[1];
    const key = /w:fontKey="([^"]+)"/.exec(embed[0])?.[1];
    const rel = [...rels.matchAll(/<Relationship\b[^>]+>/g)].find(match => match[0].includes(`Id="${id}"`));
    const target = rel && /Target="([^"]+)"/.exec(rel[0])?.[1];
    if (target && key) keys.set(`word/${target}`, key);
  }
  const entries = new Map<string, Buffer>();
  for (const name of Object.keys(zip.files).sort()) {
    if (zip.files[name].dir) continue;
    let content = await zip.file(name)!.async("nodebuffer");
    const key = keys.get(name);
    if (key) {
      content = Buffer.from(content);
      const bytes = key.replaceAll(/[{}-]/g, "").match(/../g)!.map(byte => parseInt(byte, 16)).reverse();
      for (let i = 0; i < 32; i++) content[i] ^= bytes[i % 16];
    }
    if (name === "word/fontTable.xml") content = Buffer.from(content.toString().replace(/w:fontKey="[^"]+"/g, 'w:fontKey="KEY"'));
    entries.set(name, content);
  }
  return entries;
}

async function main() {
  const root = resolve(".");
  const ref = process.argv[2] ?? "5b0714c";
  const oldSource = (file: string) => execFileSync("git", ["show", `${ref}:src/${file}`], { encoding: "utf8" });
  const baselineFile = join(root, "lib", "docx", `.sop-baseline-${process.pid}.ts`);
  writeFileSync(baselineFile, oldSource("lib/docx/sop-generate.ts"));
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-01T00:00:00Z").getTime() });
  try {
    const baseline = await import(pathToFileURL(baselineFile).href) as { generateSopDocx: typeof generateSopDocx };
    const freeze = (source: string) => source.replace("#set document(", "#set document(date: datetime(year: 2026, month: 10, day: 1), ");
    const before = freeze(oldSource("lib/typst/sop/manual.typ"));
    const after = freeze(readFileSync(join(root, "lib/typst/sop/manual.typ"), "utf8"));
    const workspace = join(root, ".typst-workspace");
    const compiler = NodeCompiler.create({ workspace, fontArgs: [{ fontPaths: sopFontFiles(root) }] });
    const report: string[] = [];
    for (const id of ["controlled-manual", "esg-pillars", "sop-cards", "compact-register", "modern-banner"]) {
      const design = getSopDesign(id);
      const assets: ManualAsset[] = design.cover === "image-banner" ? [{ path: "assets/cover-art.png", content: await sharp(Buffer.from(coverArtSvg(design.palette))).png().toBuffer() }] : [];
      const model = buildSampleRenderModel({ templateId: id, coverImage: assets.length ? "/assets/cover-art.png" : null });
      const oldPdf = compileSopManual(compiler, before, model, assets, workspace);
      const newPdf = compileSopManual(compiler, after, model, assets, workspace);
      assert.ok(oldPdf.pdf.equals(newPdf.pdf), `${id}: PDF bytes`);
      const pages = { anchors: newPdf.anchorPages, total: newPdf.pageCount };
      const oldWord = await normalizedDocx(await baseline.generateSopDocx(model, assets, { pages }));
      const newWord = await normalizedDocx(await generateSopDocx(model, assets, { pages }));
      assert.deepEqual([...oldWord.keys()], [...newWord.keys()], `${id}: ZIP entries`);
      for (const [name, content] of oldWord) assert.ok(content.equals(newWord.get(name)!), `${id}: ${name}`);
      const line = `${id}: ${newPdf.pageCount} pages; PDF bytes identical; every DOCX part identical after font-key deobfuscation (fixed clock)`;
      report.push(line);
      console.log(line);
    }
    mkdirSync(join(root, ".scratch"), { recursive: true });
    writeFileSync(join(root, ".scratch", "template-regression.txt"), report.join("\n") + "\n");
  } finally {
    mock.timers.reset();
    unlinkSync(baselineFile);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
