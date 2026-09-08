import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { DOCUMENT_THEMES } from "../lib/document-themes";
import { templatePreviewPolicy, PREVIEW_POLICY_TYPES } from "../lib/sample-policies";
import { generatePdf } from "../lib/pdf/generate";
import { generateDocx } from "../lib/docx/generate";
import type { Policy } from "../lib/types";

const run = promisify(execFile);
const smoke = process.argv.includes("--smoke");
const qa = path.resolve(".theme-qa/templates");
const assets = path.resolve("public/template-previews");
async function raster(pdf: string, out: string, page: number, width = 700) {
  await run(process.env.PDFTOPPM_PATH || "pdftoppm", ["-f", String(page), "-l", String(page), "-singlefile", "-scale-to", String(width), "-png", pdf, out], { windowsHide: true });
}
async function emit(policy: Policy, name: string, directory: string) {
  const pdf = await generatePdf(policy);
  const document = await PDFDocument.load(pdf);
  for (const page of document.getPages()) {
    if (Math.abs(page.getWidth() - 595.28) > 1 || Math.abs(page.getHeight() - 841.89) > 1) throw new Error(`Non-A4 page: ${name}`);
  }
  const file = path.join(directory, name + ".pdf");
  await writeFile(file, pdf);
  await writeFile(path.join(directory, name + ".docx"), await generateDocx(policy));
  return { file, pages: document.getPageCount() };
}
async function main() {
  await mkdir(qa, { recursive: true });
  const themes = DOCUMENT_THEMES;
  const manifest: Record<string, number> = {};
  for (const theme of smoke ? themes.slice(0, 1) : themes) {
    const dir = path.join(assets, theme.id);
    await mkdir(dir, { recursive: true });
    for (const type of smoke ? PREVIEW_POLICY_TYPES.slice(0, 1) : PREVIEW_POLICY_TYPES) {
      const policy = templatePreviewPolicy(theme.id, type);
      const name = `${theme.id}-${type}`;
      const result = await emit(policy, name, qa);
      await raster(result.file, path.join(dir, `${type}-cover`), 1);
      await raster(result.file, path.join(dir, `${type}-body`), Math.min(3, result.pages));
      manifest[name] = result.pages;
      console.log(`${name}: ${result.pages} A4 pages`);
    }
    if (!smoke) for (const density of ["short", "dense"] as const) {
      const policy = templatePreviewPolicy(theme.id, "sustainable-procurement");
      if (density === "short") { policy.focusAreas = policy.focusAreas.slice(0, 1); policy.quantitative = []; policy.qualitative = {}; policy.responsibilities = policy.responsibilities.slice(0, 1); }
      else {
        policy.company.name = "International Sustainable Procurement and Responsible Operations Group Limited";
        policy.declaration.preface = (policy.declaration.preface + "\n\n").repeat(8);
        policy.quantitative = policy.quantitative.map(area => ({ ...area, targets: Array.from({ length: 10 }, (_, i) => ({ ...area.targets[0], target: `${i + 1}. ${area.targets[0].target}. Maintain documented evidence and review progress with the responsible department each quarter.` })) }));
        policy.templateBrandOverrides = { schemaVersion: 1, pageBorder: { enabled: true, widthPt: 6, insetMm: 20, scope: "all" } };
      }
      const name = `${theme.id}-${density}`;
      const result = await emit(policy, name, qa);
      manifest[name] = result.pages;
      for (let page = 1; page <= result.pages; page++) await raster(result.file, path.join(qa, `${name}-page-${page}`), page, 1000);
      console.log(`${name}: ${result.pages} A4 pages`);
    }
  }
  const hash = createHash("sha256");
  for (const file of ["lib/document-themes.ts", "lib/cover-designs.ts", "lib/sample-policies.ts", "lib/pdf/print-document.tsx", "components/policy/policy-preview.tsx"]) hash.update(await readFile(file));
  for (const font of (await readdir("public/fonts")).sort()) hash.update(await readFile(path.join("public/fonts", font)));
  await writeFile(path.join(qa, "manifest.json"), JSON.stringify({ sourceHash: hash.digest("hex"), cases: manifest }, null, 2));
  if (!smoke) await writeFile(path.join(assets, "manifest.json"), await readFile(path.join(qa, "manifest.json")));
  console.log(`Preview assets for ${themes.length} canonical templates: ${assets}\nQA exports: ${qa}`);
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
