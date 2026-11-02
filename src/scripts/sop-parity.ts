// PDF/Word parity check for the SOP manual templates. For each template it
// renders the sample manual with Typst (PDF) and with the DOCX generator,
// converts the DOCX to PDF with the installed Microsoft Word (COM), then
// rasterises both (pdfjs inside local Chrome or Edge) and writes side-by-side PNGs (Typst left, Word right) to
// .scratch/sop-parity/<template>/. It also matches text runs between the two
// PDFs and reports, per page, how far Word's baselines sit from Typst's.
//
// Run: npx tsx scripts/sop-parity.ts [templateId[,templateId]|all] [pages=all|1,2,5] [--no-png]
// --handbook uses the handbook fixture; --baseline uses the original renderers.
// --photo exercises legacy portrait artwork in every template when available,
// falling back to .scratch/photo-scene.jpg. These are stock fixtures, never AI calls.
// Needs Windows with Microsoft Word and Chrome or Edge installed.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { preparePhotoCoverImage } from "../lib/sop/photo-cover-image";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { chromium, type Browser, type Page } from "playwright-core";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { generateSopDocx, sopPagesFromPdf } from "../lib/docx/sop-generate";
import { coverArtSvg } from "../lib/sop/design/cover-art";
import { buildSampleHandbook } from "../lib/handbook/sample-handbook";
import { buildHandbookRenderModel } from "../lib/handbook/render-model";
import { SOP_DESIGNS } from "../lib/sop/design/templates";
import { buildSampleRenderModel } from "../lib/sop/sample-render-model";
import { compileSopManual, type ManualAsset } from "../lib/typst/compile";
import { sopFontFiles } from "../lib/typst/fonts";

const root = resolve(".");
const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const only = args[0] && args[0] !== "all" ? args[0] : null;
const pageFilter = args[1] && args[1] !== "all" ? new Set(args[1].split(",").map(Number)) : null;
const existing = process.argv.includes("--existing");
const writePngs = !process.argv.includes("--no-png");
const photo = process.argv.includes("--photo");
const handbook = process.argv.includes("--handbook");
const baseline = process.argv.includes("--baseline");
const outRoot = join(root, ".scratch", `${handbook ? "handbook-parity" : "sop-parity"}${photo ? "-photo" : ""}${baseline ? "-original" : ""}`);

type TextItem = { str: string; x: number; y: number };

async function openPdf(file: string) {
  return getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
}

async function pageText(pdf: PDFDocumentProxy, n: number): Promise<TextItem[]> {
  const page = await pdf.getPage(n);
  const height = page.view[3];
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  for (const item of content.items as Array<{ str: string; transform: number[] }>) {
    const str = item.str.trim();
    if (str.length >= 3) items.push({ str, x: item.transform[4], y: height - item.transform[5] });
  }
  return items;
}

// pdfjs under Node drops some TrueType glyphs, so pages are drawn by pdfjs in a real browser.
const BROWSERS = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];
let browser: Browser | null = null;
let renderer: Page | null = null;

async function startRenderer() {
  const executablePath = BROWSERS.find((candidate) => existsSync(candidate));
  if (!executablePath) throw new Error("Chrome or Edge is needed to rasterise pages.");
  browser = await chromium.launch({ executablePath, headless: true });
  renderer = await browser.newPage();
  const pdfjsDir = join(root, "node_modules", "pdfjs-dist", "build");
  await renderer.route("http://parity.local/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") {
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><script type="module">import * as pdfjs from "/pdfjs/pdf.mjs"; pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs"; window.pdfjs = pdfjs; window.docs = {};</script>` });
    }
    if (url.pathname.startsWith("/pdfjs/")) return route.fulfill({ contentType: "text/javascript", body: readFileSync(join(pdfjsDir, url.pathname.slice(7))) });
    return route.fulfill({ contentType: "application/pdf", body: readFileSync(url.searchParams.get("path")!) });
  });
  await renderer.goto("http://parity.local/");
  await renderer.waitForFunction(() => "pdfjs" in window);
}

async function renderPage(file: string, n: number, scale: number) {
  const dataUrl = await renderer!.evaluate(async ({ url, n, scale }) => {
    const w = window as unknown as { pdfjs: { getDocument(url: string): { promise: Promise<unknown> } }; docs: Record<string, Promise<unknown>> };
    w.docs[url] ??= w.pdfjs.getDocument(url).promise;
    const doc = (await w.docs[url]) as { getPage(n: number): Promise<{ getViewport(o: { scale: number }): { width: number; height: number }; render(o: unknown): { promise: Promise<void> } }> };
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    return canvas.toDataURL("image/png");
  }, { url: `http://parity.local/file?path=${encodeURIComponent(file)}`, n, scale });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** Words that appear once on both pages anchor the comparison; returns baseline and x offsets (Word minus Typst). */
function compareText(typst: TextItem[], word: TextItem[]) {
  const key = (item: TextItem) => item.str.slice(0, 24);
  const count = (items: TextItem[]) => items.reduce((map, item) => map.set(key(item), (map.get(key(item)) ?? 0) + 1), new Map<string, number>());
  const typstCounts = count(typst);
  const wordCounts = count(word);
  const dy: number[] = [];
  const dx: number[] = [];
  for (const item of typst) {
    if (typstCounts.get(key(item)) !== 1 || wordCounts.get(key(item)) !== 1) continue;
    const match = word.find((candidate) => key(candidate) === key(item))!;
    dy.push(match.y - item.y);
    dx.push(match.x - item.x);
  }
  const median = (values: number[]) => (values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : NaN);
  const worst = (values: number[]) => values.reduce((max, value) => (Math.abs(value) > Math.abs(max) ? value : max), 0);
  return { matched: dy.length, total: typst.length, dyMedian: median(dy), dyWorst: worst(dy), dxMedian: median(dx) };
}

function convertWithWord(jobs: Array<{ docx: string; pdf: string }>) {
  const list = join(outRoot, "word-jobs.json");
  writeFileSync(list, JSON.stringify(jobs));
  // Fields are refreshed so the contents shows Word's own pagination, not the cached Typst numbers.
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$jobs = Get-Content -Raw -LiteralPath '${list}' | ConvertFrom-Json`,
    "$word = New-Object -ComObject Word.Application",
    "$word.Visible = $false",
    "$word.DisplayAlerts = 0",
    "try {",
    "  foreach ($job in $jobs) {",
    "    $doc = $word.Documents.Open($job.docx, $false, $true)",
    "    $doc.Repaginate()",
    "    [void]$doc.Fields.Update()",
    "    $doc.ExportAsFixedFormat($job.pdf, 17)",
    "    $doc.Close(0)",
    "  }",
    "} finally { $word.Quit() }",
  ].join("\n");
  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: "inherit" });
}

async function main() {
  mkdirSync(outRoot, { recursive: true });
  const workspace = join(root, ".typst-workspace");
  const compiler = NodeCompiler.create({ workspace, fontArgs: [{ fontPaths: sopFontFiles(root) }] });
  const template = baseline ? execFileSync("git", ["show", "5b0714c:src/lib/typst/sop/manual.typ"], { encoding: "utf8" }) : readFileSync(join(root, "lib", "typst", "sop", "manual.typ"), "utf8");
  let docxGenerator = generateSopDocx;
  if (baseline) {
    const original = join(root, "lib", "docx", ".parity-original.ts");
    writeFileSync(original, execFileSync("git", ["show", "5b0714c:src/lib/docx/sop-generate.ts"]));
    docxGenerator = (await import(pathToFileURL(original).href)).generateSopDocx;
  }
  const designs = SOP_DESIGNS.filter((design) => !only || only.split(",").includes(design.id));
  const jobs: Array<{ id: string; dir: string; typstPdf: string; docx: string; pdf: string; typstPages: number }> = [];

  for (const design of designs) {
    const assets: ManualAsset[] = [];
    let coverImage: string | null = null;
    if (design.cover === "image-banner") {
      coverImage = "/assets/cover-art.png";
      assets.push({ path: "assets/cover-art.png", content: await sharp(Buffer.from(coverArtSvg(design.palette))).png().toBuffer() });
    }
    const model = handbook ? buildHandbookRenderModel({ ...buildSampleHandbook(), theme: design.id, themeOptions: { ...buildSampleHandbook().themeOptions, accent: "template" } }, { coverImagePath: coverImage }) : buildSampleRenderModel({ templateId: design.id, coverImage });
    if (photo) {
      model.cover.image = "/assets/scene.png";
      model.cover.photo = true;
      model.cover.photoSubtitle = model.company.name;
      const portrait = join(root, ".scratch", "photo-scene-portrait.jpg");
      const source = readFileSync(existsSync(portrait) ? portrait : join(root, ".scratch", "photo-scene.jpg"));
      const prepared = await preparePhotoCoverImage({ content: source, mime: "image/jpeg" }, model.design.photoLayout.image);
      assets.push({ path: "assets/scene.png", content: prepared.content });
      model.company.logo = "/assets/logo.png";
      assets.push({ path: "assets/logo.png", content: await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="150"><rect width="400" height="150" fill="white"/><path d="M10 115V35h20l30 45 30-45h20v80H90V70L60 110 30 70v45z" fill="#183A5A"/><text x="125" y="90" font-family="Arial" font-size="40" fill="#183A5A">Meridian</text></svg>')).png().toBuffer() });
    }
    const dir = join(outRoot, design.id);
    if (existing) {
      jobs.push({ id: design.id, dir, typstPdf: join(dir, "typst.pdf"), docx: join(dir, "manual.docx"), pdf: join(dir, "word.pdf"), typstPages: 0 });
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const compiled = compileSopManual(compiler, template, model, assets, workspace);
    const typstPdf = join(dir, "typst.pdf");
    writeFileSync(typstPdf, compiled.pdf);
    const pages = await sopPagesFromPdf(compiled.pdf, model);
    const docx = join(dir, "manual.docx");
    writeFileSync(docx, await docxGenerator(model, assets, { pages }));
    jobs.push({ id: design.id, dir, typstPdf, docx, pdf: join(dir, "word.pdf"), typstPages: compiled.pageCount });
  }

  if (!existing) convertWithWord(jobs.map((job) => ({ docx: job.docx, pdf: job.pdf })));
  if (writePngs) await startRenderer();

  const summary: string[] = [];
  for (const job of jobs) {
    const typst = await openPdf(job.typstPdf);
    const word = await openPdf(job.pdf);
    const pageCount = Math.max(typst.numPages, word.numPages);
    const lines: string[] = [];
    let drifted = 0;
    for (let n = 1; n <= pageCount; n++) {
      if (pageFilter && !pageFilter.has(n)) continue;
      const left = n <= typst.numPages ? await pageText(typst, n) : [];
      const right = n <= word.numPages ? await pageText(word, n) : [];
      const result = compareText(left, right);
      const off = !(Math.abs(result.dyMedian) <= 3) || result.matched < Math.min(5, left.length) * 0.5;
      if (off) drifted++;
      lines.push(`  p${String(n).padStart(2, "0")}  matched ${String(result.matched).padStart(3)}/${String(result.total).padEnd(3)}  dy median ${result.dyMedian.toFixed(2).padStart(6)}  worst ${result.dyWorst.toFixed(2).padStart(7)}  dx median ${result.dxMedian.toFixed(2).padStart(6)}${off ? "  <-- differs" : ""}`);
      if (writePngs) {
        const scale = 1.25;
        const blank = async () => sharp({ create: { width: Math.round(595 * scale), height: Math.round(842 * scale), channels: 3, background: "#dddddd" } }).png().toBuffer();
        const a = n <= typst.numPages ? await renderPage(job.typstPdf, n, scale) : await blank();
        const b = n <= word.numPages ? await renderPage(job.pdf, n, scale) : await blank();
        const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
        const width = (ma.width ?? 0) + (mb.width ?? 0) + 12;
        const height = Math.max(ma.height ?? 0, mb.height ?? 0);
        await sharp({ create: { width, height, channels: 3, background: "#7a7a7a" } })
          .composite([{ input: a, left: 0, top: 0 }, { input: b, left: (ma.width ?? 0) + 12, top: 0 }])
          .png()
          .toFile(join(job.dir, `page-${String(n).padStart(2, "0")}.png`));
      }
    }
    const delta = ((word.numPages - typst.numPages) / typst.numPages) * 100;
    const head = `${job.id}: Typst ${typst.numPages} pages, Word ${word.numPages} pages (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%), ${drifted} page(s) differ`;
    summary.push(head);
    writeFileSync(join(job.dir, "report.txt"), [head, ...lines].join("\n") + "\n");
    console.log([head, ...lines].join("\n"));
  }
  writeFileSync(join(outRoot, "summary.txt"), summary.join("\n") + "\n");
  console.log("\n" + summary.join("\n"));
  await browser?.close();
  if (baseline) rmSync(join(root, "lib", "docx", ".parity-original.ts"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
