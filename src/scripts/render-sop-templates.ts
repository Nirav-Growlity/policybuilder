// Renders the sample manual in every SOP template to PDF, plus PNGs of key
// pages for design review. Output: .scratch/sop-templates/<template>/
// Run: npx tsx scripts/render-sop-templates.ts [templateId] [pages=1,2,3,...]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { buildSampleHandbook } from "../lib/handbook/sample-handbook";
import { buildHandbookRenderModel } from "../lib/handbook/render-model";
import { SOP_DESIGNS } from "../lib/sop/design/templates";
import { buildSampleRenderModel } from "../lib/sop/sample-render-model";
import { compileSopManual, TypstCompileError, type ManualAsset } from "../lib/typst/compile";
import { sopFontFiles } from "../lib/typst/fonts";
import { coverArtSvg } from "../lib/sop/design/cover-art";

const root = resolve(".");
const workspace = join(root, ".typst-workspace");
const only = process.argv[2] && process.argv[2] !== "all" ? process.argv[2] : null;
const handbook = process.argv.includes("--handbook");
const picker = process.argv.includes("--picker");
if (picker && !["shop-floor", "chapter-book"].includes(only ?? "")) throw new Error("Picker generation requires one new template id.");
const wanted = (process.argv[3] ?? "1,2,3,4,6").split(",").map(Number);

const compiler = NodeCompiler.create({ workspace, fontArgs: [{ fontPaths: sopFontFiles(root) }] });
const template = readFileSync(join(root, "lib", "typst", "sop", "manual.typ"), "utf8");

// Splits Typst's single SVG into per-page SVGs by reading each page group's transform.
function pageSvgs(svg: string, widthPt: number, heightPt: number) {
  const rootStart = svg.indexOf("<svg");
  const open = svg.indexOf(">", rootStart) + 1;
  // Keep every namespace declaration from the root tag; drop its size and viewBox.
  const rootAttrs = svg.slice(rootStart + 4, open - 1).replace(/\s(viewBox|width|height)="[^"]*"/g, "");
  const defsEnd = svg.indexOf('<g class="typst-page"');
  const head = svg.slice(open, defsEnd);
  const pages: string[] = [];
  const pattern = /<g class="typst-page"[^>]*transform="translate\(0(?:,|\s)\s*([\d.]+)\)"[^>]*>/g;
  const starts = [...svg.matchAll(pattern)];
  starts.forEach((match, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index! : svg.lastIndexOf("</svg>");
    const y = Number(match[1]);
    pages.push(`<svg${rootAttrs} viewBox="0 ${y} ${widthPt} ${heightPt}" width="${widthPt * 2}" height="${heightPt * 2}"><rect x="0" y="${y}" width="${widthPt}" height="${heightPt}" fill="#fff"/>${head}${svg.slice(match.index, end)}</svg>`);
  });
  return pages;
}

async function main() {
  for (const design of SOP_DESIGNS) {
    if (only && design.id !== only) continue;
    const assets: ManualAsset[] = [];
    let coverImage: string | null = null;
    if (design.cover === "image-banner") {
      coverImage = "/assets/cover-art.png";
      assets.push({ path: "assets/cover-art.png", content: await sharp(Buffer.from(coverArtSvg(design.palette))).png().toBuffer() });
    }
    const sample = buildSampleHandbook();
    const model = handbook ? buildHandbookRenderModel({ ...sample, theme: design.id, themeOptions: { ...sample.themeOptions, accent: "template" } }) : buildSampleRenderModel({ templateId: design.id, coverImage });
    const started = performance.now();
    try {
      const out = compileSopManual(compiler, template, model, assets, workspace, { svg: true });
      const ms = performance.now() - started;
      const dir = join(root, ".scratch", handbook ? "handbook-templates" : "sop-templates", design.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "manual.pdf"), out.pdf);
      const widthPt = (model.page.widthMm / 25.4) * 72;
      const heightPt = (model.page.heightMm / 25.4) * 72;
      const pages = pageSvgs(out.svg!, widthPt, heightPt);
      for (const n of wanted) {
        if (!pages[n - 1]) continue;
        await sharp(Buffer.from(pages[n - 1])).png().toFile(join(dir, `page-${String(n).padStart(2, "0")}.png`));
      }
      if (picker) {
        const target = join(root, "public", "sop-templates", design.id);
        mkdirSync(target, { recursive: true });
        const first = model.chapters.flatMap(chapter => chapter.sops)[0];
        for (const [name, n] of [["cover", 1], ["body", out.anchorPages[first.anchor]]] as const) {
          await sharp(Buffer.from(pages[n - 1])).resize({ width: 560 }).webp({ quality: 88 }).toFile(join(target, `${name}.webp`));
        }
      }
      console.log(`${design.id}: ${out.pageCount} pages in ${ms.toFixed(0)}ms (svg pages found: ${pages.length})`);
    } catch (error) {
      if (error instanceof TypstCompileError) {
        console.error(`${design.id}: compile failed`, JSON.stringify(error.diagnostics, null, 1).slice(0, 2500));
      } else throw error;
    }
  }
}

main();
