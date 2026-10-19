// Side-by-side check of the policy PDF engines. For every QA case it renders
// the policy with today's Chromium pipeline and, once lib/typst/policy/render.ts
// exists, with Typst. It rasterises both (pdf.js inside local Chrome or Edge)
// and writes, under .scratch/policy-typst/parity/ at the repository root:
//   <case>/page-NN.png   Chromium left, Typst right
//   <case>/report.txt    page counts, render times, words missing from either side
//   index.html           contact sheet of every case
//   summary.txt
//
// Run: npx tsx scripts/policy-typst-parity.ts [case|all] [--no-png]
// Needs Chrome or Edge installed (it also drives today's Chromium export).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { chromium, type Browser, type Page } from "playwright-core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { generatePreviewPdf } from "../lib/pdf/print-document";
import { normalizePolicyQuantitative } from "../lib/quantitative";
import type { Policy } from "../lib/types";
import { extraParityCases, themeQaCases, type PolicyQaCase } from "./policy-qa-cases";

type Engine = "chromium" | "typst";
type Rendered = { pdf: Buffer; ms: number } | { error: string };

const root = resolve(".");
const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const only = args[0] && args[0] !== "all" ? args[0] : null;
const writePngs = !process.argv.includes("--no-png");
const outRoot = resolve(root, "..", ".scratch", "policy-typst", "parity");
const typstModule = join(root, "lib", "typst", "policy", "render.ts");
const SCALE = 1.25;
const PAGE = { width: Math.round(595 * SCALE), height: Math.round(842 * SCALE) };

/** The Typst renderer the port adds (ticket 02 onwards). Until then the right column stays empty. */
async function loadTypstRenderer(): Promise<((policy: Policy) => Promise<Buffer>) | null> {
  if (!existsSync(typstModule)) return null;
  const loaded = await import(pathToFileURL(typstModule).href) as { renderPolicyTypstPdf?: (policy: Policy) => Promise<Buffer> };
  if (!loaded.renderPolicyTypstPdf) throw new Error(`${typstModule} must export renderPolicyTypstPdf(policy).`);
  return loaded.renderPolicyTypstPdf;
}

async function timed(render: () => Promise<Buffer>): Promise<Rendered> {
  const started = performance.now();
  try {
    const pdf = await render();
    return { pdf: Buffer.from(pdf), ms: performance.now() - started };
  } catch (error) {
    // Typst diagnostics name the template line that failed.
    const diagnostics = error && typeof error === "object" && "diagnostics" in error ? ` ${JSON.stringify(error.diagnostics).slice(0, 600)}` : "";
    return { error: `${error instanceof Error ? error.message : String(error)}${diagnostics}` };
  }
}

// ---------------------------------------------------------------- text

// Header and footer bands. They repeat on every page and the engines write
// them in a different order (Typst first, Chromium last), which would split a
// word hyphenated across a page break, so only body text is compared.
const BODY_TOP_MM = 20;
const BODY_BOTTOM_MM = 278;

/** Body words on all pages, with line-end hyphenation joined (across pages too) and punctuation removed. */
async function documentWords(pdf: Buffer): Promise<Map<string, number>> {
  const doc = await getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
  let text = "";
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const height = page.view[3];
    const content = await page.getTextContent();
    const items = (content.items as Array<{ str: string; hasEOL?: boolean; transform: number[] }>).filter((item) => {
      const fromTopMm = (height - item.transform[5]) * 25.4 / 72;
      return item.str.length > 0 && fromTopMm >= BODY_TOP_MM && fromTopMm <= BODY_BOTTOM_MM;
    });
    items.forEach((item, index) => {
      const str = item.str.replaceAll("\u00AD", "");
      // A line ends where the next run starts lower; engines differ in marking it.
      const next = items[index + 1];
      const lineEnd = item.hasEOL || !next || Math.abs(next.transform[5] - item.transform[5]) > 1;
      text += /[-\u2010]$/.test(str) && lineEnd ? str.slice(0, -1) : `${str}${lineEnd ? " " : ""}`;
    });
  }
  await doc.destroy();
  const words = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/\s+/)) {
    // A real hyphen at a line end ("water-|quality") reads like a break hyphen, so hyphens never count.
    const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replace(/[-‐]/g, "");
    if (word) words.set(word, (words.get(word) ?? 0) + 1);
  }
  return words;
}

/** The first body letters of every page: two engines break pages alike where these agree. */
async function pageOpenings(pdf: Buffer): Promise<string[]> {
  const doc = await getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
  const openings: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const height = page.view[3];
    const items = ((await page.getTextContent()).items as Array<{ str: string; transform: number[] }>).filter((item) => {
      const fromTopMm = (height - item.transform[5]) * 25.4 / 72;
      return item.str.trim() && fromTopMm >= BODY_TOP_MM && fromTopMm <= BODY_BOTTOM_MM;
    });
    openings.push(items.map((item) => item.str).join("").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 16));
  }
  await doc.destroy();
  return openings;
}

async function pageCount(pdf: Buffer) {
  const doc = await getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
  const pages = doc.numPages;
  await doc.destroy();
  return pages;
}

// ---------------------------------------------------------------- raster

// pdfjs under Node drops some TrueType glyphs, so pages are drawn by pdfjs in a real browser.
const BROWSERS = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"];
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

async function renderPage(file: string, n: number) {
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
  }, { url: `http://parity.local/file?path=${encodeURIComponent(file)}&v=${Date.now()}`, n, scale: SCALE });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

const escapeXml = (value: string) => value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function placeholder(message: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.width}" height="${PAGE.height}"><rect width="100%" height="100%" fill="#E4E4E4"/><text x="50%" y="50%" text-anchor="middle" font-family="Arial" font-size="22" fill="#777">${escapeXml(message)}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function label(text: string, width: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="34"><rect width="100%" height="100%" fill="#2B2B2B"/><text x="12" y="23" font-family="Arial" font-size="16" font-weight="700" fill="#FFFFFF">${escapeXml(text)}</text></svg>`;
  return Buffer.from(svg);
}

async function sideBySide(left: Buffer, right: Buffer, leftLabel: string, rightLabel: string, file: string) {
  const [ml, mr] = await Promise.all([sharp(left).metadata(), sharp(right).metadata()]);
  const lw = ml.width ?? PAGE.width;
  const rw = mr.width ?? PAGE.width;
  const gap = 12;
  const height = 34 + Math.max(ml.height ?? 0, mr.height ?? 0);
  await sharp({ create: { width: lw + gap + rw, height, channels: 3, background: "#7A7A7A" } })
    .composite([
      { input: label(leftLabel, lw), left: 0, top: 0 },
      { input: label(rightLabel, rw), left: lw + gap, top: 0 },
      { input: left, left: 0, top: 34 },
      { input: right, left: lw + gap, top: 34 },
    ])
    .png()
    .toFile(file);
}

// ---------------------------------------------------------------- report

function wordDiff(a: Map<string, number>, b: Map<string, number>) {
  return [...a.keys()].filter((word) => !b.has(word)).sort();
}

type CaseResult = { item: PolicyQaCase; chromium: Rendered; typst: Rendered | null; chromiumPages: number; typstPages: number; missing: string[]; extra: string[]; pngs: string[]; breaks: string };

function describe(result: Rendered | null) {
  if (!result) return "not ported yet";
  return "error" in result ? `failed: ${result.error}` : `${result.ms.toFixed(0)} ms`;
}

function writeIndex(results: CaseResult[]) {
  const rows = results.map((r) => {
    const status = !r.typst ? "baseline only" : "error" in r.typst ? "Typst failed" : r.missing.length || r.extra.length ? `${r.missing.length} missing, ${r.extra.length} extra` : "text matches";
    const thumbs = r.pngs.map((png, index) => `<a href="${r.item.name}/${png}" target="_blank"><img src="${r.item.name}/${png}" alt="Page ${index + 1}" loading="lazy"></a>`).join("");
    return `<section><h2>${escapeXml(r.item.label)} <small>${escapeXml(r.item.name)}</small></h2><p>Chromium ${r.chromiumPages} pages, ${escapeXml(describe(r.chromium))} · Typst ${r.typstPages || "—"} pages, ${escapeXml(describe(r.typst))} · <b>${escapeXml(status)}</b> · <a href="${r.item.name}/report.txt">report</a></p><div class="pages">${thumbs}</div></section>`;
  }).join("\n");
  writeFileSync(join(outRoot, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Policy PDF parity</title><style>
body{margin:0;padding:24px;font:14px/1.45 system-ui,sans-serif;background:#F4F4F2;color:#1E1E1E}
h1{margin:0 0 4px;font-size:22px} header p{margin:0 0 24px;color:#555}
section{margin:0 0 28px;padding:16px;background:#FFF;border:1px solid #DDD;border-radius:8px}
h2{margin:0;font-size:16px} h2 small{color:#888;font-weight:400}
.pages{display:flex;gap:10px;overflow-x:auto;padding-top:8px} .pages img{height:260px;border:1px solid #CCC}
</style></head><body><header><h1>Policy PDF: Chromium (left) vs Typst (right)</h1><p>Generated ${new Date().toISOString()}. Click a page for full size.</p></header>
${rows}
</body></html>`);
}

async function main() {
  const cases = [...themeQaCases(), ...extraParityCases()].filter((item) => !only || item.name === only);
  if (!cases.length) throw new Error(`No case named ${only}.`);
  mkdirSync(outRoot, { recursive: true });
  const renderTypst = await loadTypstRenderer();
  if (!renderTypst) console.log("lib/typst/policy/render.ts does not exist yet: rendering the Chromium baseline only.");
  if (writePngs) await startRenderer();

  const results: CaseResult[] = [];
  for (const item of cases) {
    const dir = join(outRoot, item.name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const policy = normalizePolicyQuantitative(item.policy);
    const rendered: Record<Engine, Rendered | null> = {
      chromium: await timed(() => generatePreviewPdf(policy)),
      typst: renderTypst ? await timed(() => renderTypst(policy)) : null,
    };
    const files: Partial<Record<Engine, string>> = {};
    const pages: Record<Engine, number> = { chromium: 0, typst: 0 };
    const words: Partial<Record<Engine, Map<string, number>>> = {};
    const openings: Partial<Record<Engine, string[]>> = {};
    for (const engine of ["chromium", "typst"] as const) {
      const result = rendered[engine];
      if (!result || "error" in result) continue;
      files[engine] = join(dir, `${engine}.pdf`);
      writeFileSync(files[engine]!, result.pdf);
      pages[engine] = await pageCount(result.pdf);
      words[engine] = await documentWords(result.pdf);
      openings[engine] = await pageOpenings(result.pdf);
    }
    const missing = words.chromium && words.typst ? wordDiff(words.chromium, words.typst) : [];
    const extra = words.chromium && words.typst ? wordDiff(words.typst, words.chromium) : [];

    const pngs: string[] = [];
    if (writePngs) {
      const typstNote = !rendered.typst ? "Not ported yet" : "error" in rendered.typst ? "Typst failed" : "No page";
      for (let n = 1; n <= Math.max(pages.chromium, pages.typst, 1); n++) {
        const left = files.chromium && n <= pages.chromium ? await renderPage(files.chromium, n) : await placeholder(files.chromium ? "No page" : "Chromium failed");
        const right = files.typst && n <= pages.typst ? await renderPage(files.typst, n) : await placeholder(typstNote);
        const png = `page-${String(n).padStart(2, "0")}.png`;
        await sideBySide(left, right, `Chromium (today) · page ${n}`, `Typst · page ${n}`, join(dir, png));
        pngs.push(png);
      }
    }

    const breaks = openings.chromium && openings.typst
      ? `${openings.chromium.filter((opening, index) => opening && opening === openings.typst![index]).length}/${openings.chromium.length}`
      : "";
    const lines = [
      `${item.label} (${item.name})`,
      `Chromium: ${pages.chromium} pages, ${describe(rendered.chromium)}`,
      `Typst:    ${pages.typst || "—"} pages, ${describe(rendered.typst)}`,
      ...(words.typst ? [
        `Page count difference: ${pages.typst - pages.chromium >= 0 ? "+" : ""}${pages.typst - pages.chromium}`,
        `Pages starting with the same text: ${breaks}`,
        `Words only in Chromium (${missing.length}): ${missing.join(" ") || "none"}`,
        `Words only in Typst (${extra.length}): ${extra.join(" ") || "none"}`,
      ] : []),
    ];
    writeFileSync(join(dir, "report.txt"), lines.join("\n") + "\n");
    console.log(lines.join("\n  "));
    results.push({ item, chromium: rendered.chromium!, typst: rendered.typst, chromiumPages: pages.chromium, typstPages: pages.typst, missing, extra, pngs, breaks });
  }

  const summary = results.map((r) => `${r.item.name.padEnd(36)} chromium ${String(r.chromiumPages).padStart(2)}p ${describe(r.chromium).padStart(9)}   typst ${String(r.typstPages || "—").padStart(2)}p ${describe(r.typst).padStart(9)}${r.typst && !("error" in r.typst) ? `   missing ${r.missing.length} extra ${r.extra.length}   same breaks ${r.breaks}` : ""}`);
  console.log("\n" + summary.join("\n"));
  // A single-case run refreshes only that case's folder, not the full contact sheet.
  if (!only && writePngs) {
    writeFileSync(join(outRoot, "summary.txt"), summary.join("\n") + "\n");
    writeIndex(results);
    console.log(`\nContact sheet: ${join(outRoot, "index.html")}`);
  }
  await browser?.close();
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
