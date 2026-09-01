import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { PolicyPreview } from "@/components/policy/policy-preview";
import type { Policy } from "@/lib/types";

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

export async function generatePreviewPdf(policy: Policy): Promise<Buffer> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "policycraft-pdf-"));
  const htmlPath = path.join(workDir, "preview.html");
  const outputPath = path.join(workDir, "preview.pdf");

  try {
    const markup = await inlinePublicAssets(renderToStaticMarkup(<PolicyPreview policy={policy} />));
    await writeFile(htmlPath, createPrintDocument(markup), "utf8");
    await runChrome(await findChrome(), [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--allow-file-access-from-files",
      "--disable-background-networking",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=1000",
      `--user-data-dir=${path.join(workDir, "profile")}`,
      `--print-to-pdf=${outputPath}`,
      "--print-to-pdf-no-header",
      pathToFileURL(htmlPath).href,
    ]);

    const output = await readFile(outputPath);
    if (output.length === 0 || output.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("Chrome returned an empty or invalid PDF");
    }
    return output;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function findChrome(): Promise<string> {
  const configured = process.env.POLICY_PDF_CHROME_PATH;
  if (configured) {
    await access(configured);
    return configured;
  }

  for (const candidate of CHROME_PATHS) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next installed Chromium-based browser.
    }
  }

  throw new Error("A Chromium browser is required to export the preview as PDF. Set POLICY_PDF_CHROME_PATH to its executable.");
}

function runChrome(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Chromium PDF export failed with exit code ${code}: ${stderr.trim() || "unknown error"}`));
    });
  });
}

async function inlinePublicAssets(markup: string): Promise<string> {
  const publicDir = path.resolve(process.cwd(), "public");
  const matches = [...markup.matchAll(/src="(\/[^\"]+)"/g)];
  let output = markup;

  for (const match of matches.reverse()) {
    const source = match[1];
    const assetPath = path.resolve(publicDir, decodeURIComponent(source.slice(1)));
    if (!assetPath.startsWith(`${publicDir}${path.sep}`)) continue;

    try {
      const bytes = await readFile(assetPath);
      const mime = path.extname(assetPath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
      const replacement = `src="data:${mime};base64,${bytes.toString("base64")}"`;
      output = `${output.slice(0, match.index!)}${replacement}${output.slice(match.index! + match[0].length)}`;
    } catch {
      // Keep non-file/data URLs unchanged; the browser can still resolve them.
    }
  }

  return output;
}

function createPrintDocument(markup: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>PolicyCraft preview export</title>
    <style>
      .mx-auto { margin-left: auto; margin-right: auto; }
      .max-w-4xl { max-width: 56rem; }
      .overflow-hidden { overflow: hidden; }
      .flex { display: flex; }
      .mb-auto { margin-bottom: auto; }
      .mb-9 { margin-bottom: 2.25rem; }
      .max-h-9 { max-height: 2.25rem; }
      .max-w-\\[130px\\] { max-width: 130px; }
      .max-w-full { max-width: 100%; }
      .object-contain { object-fit: contain; }
      .ml-auto { margin-left: auto; }
      [class~="bg-[var(--doc-paper)]"] { background-color: var(--doc-paper); }
      [class~="text-[var(--doc-ink)]"] { color: var(--doc-ink); }

      @page { size: A4; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      body { width: 896px; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .policy-preview-document {
        width: 896px;
        max-width: 896px;
        margin: 0;
        box-shadow: none;
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
    </style>
  </head>
  <body>${markup}</body>
</html>`;
}
