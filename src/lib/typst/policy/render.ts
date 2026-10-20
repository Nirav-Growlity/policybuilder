import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import type { AuthorApprovalRenderData } from "../../document-render-model";
import type { Policy } from "../../types";
import { compileTypstDocument, type ManualAsset } from "../compile";
import { policyFontFiles } from "../fonts";
import sharp from "sharp";
import { initialPolicy } from "../../initial-policy";
import { preparePolicyTypstRender, type PolicyTypstModel } from "./model";

const root = process.cwd();
const workspace = join(root, ".typst-workspace");
let template: string | null = null;
let compilesSinceEvict = 0;

// Next bundles instrumentation (which warms the compiler at start-up) apart from
// the route handlers, and dev reloads re-evaluate this module, so the warm
// compiler lives on globalThis to be one per process.
const shared = globalThis as typeof globalThis & { policyTypstCompiler?: NodeCompiler };

function getCompiler() {
  shared.policyTypstCompiler ??= NodeCompiler.create({ workspace, fontArgs: [{ fontPaths: policyFontFiles(root) }] });
  return shared.policyTypstCompiler;
}

function getTemplate() {
  template ??= readFileSync(join(root, "lib", "typst", "policy", "policy.typ"), "utf8");
  return template;
}

/**
 * Typst maps the hyphen glyph to U+00AD in its ToUnicode tables and marks
 * real hyphens with /ActualText, which pdf.js (the in-app viewer) ignores, so
 * "2022-23" would copy as "2022 23". Mapping the glyph to "-" makes every
 * hyphen, line-end ones included, copy as Chromium's PDF does.
 *
 * A soft hyphen that doesn't break joins the cluster of the letter before it,
 * and the table has one entry per glyph, so that letter would copy as itself
 * plus U+00AD everywhere in the document (pdf.js then drops both). Those
 * targets lose the U+00AD, and likewise the zero-width space the model puts
 * after a hyphen between digits so lines can break there as in Chromium. The
 * tables are uncompressed and every patch keeps its length (spaces pad a
 * shortened target), so no offset moves.
 */
export function mapHyphenGlyphs(pdf: Buffer): Buffer {
  const text = pdf.toString("latin1");
  const out = Buffer.from(pdf);
  for (const table of text.matchAll(/beginbfchar[\s\S]*?endbfchar/g)) {
    for (const entry of table[0].matchAll(/(<[0-9A-Fa-f]+>\s*)<([0-9A-Fa-f]+)>/g)) {
      const target = entry[2];
      const units = (target.match(/.{4}/g) ?? []).map((unit) => unit.toUpperCase());
      if (!units.some((unit) => unit === "00AD" || unit === "200B")) continue;
      const kept = units.filter((unit) => unit !== "00AD" && unit !== "200B").join("");
      const replacement = kept ? `<${kept}>`.padEnd(target.length + 2, " ") : "<002D>";
      out.write(replacement, table.index! + entry.index! + entry[1].length, "latin1");
    }
  }
  return out;
}

const outlineCache = new Map<string, { svg: Buffer; widthPt: number; heightPt: number }>();

/**
 * AI cover text outlines, laid out by the template's `outlinePass` and exported
 * as SVG, where glyphs are paths. Placed under the text they stand in for the
 * cover's text shadow without adding a second copy of the text to the PDF.
 */
function coverOutline(typst: NodeCompiler, model: PolicyTypstModel, assets: ManualAsset[]) {
  const cover = model.cover;
  if (cover.kind !== "composition" || !cover.texts.some((layer) => layer.outline)) return null;
  const key = JSON.stringify([cover.texts.filter((layer) => layer.outline), model.fonts]);
  let outline = outlineCache.get(key);
  if (!outline) {
    const svg = typst.plainSvg(compileTypstDocument(typst, getTemplate(), { ...model, outlinePass: true }, assets, workspace));
    // The SVG viewBox is the page size in points.
    const [widthPt, heightPt] = (/viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg) ?? []).slice(1).map(Number);
    if (!widthPt || !heightPt) return null;
    outline = { svg: Buffer.from(svg), widthPt, heightPt };
    outlineCache.set(key, outline);
    while (outlineCache.size > 8) outlineCache.delete(outlineCache.keys().next().value!);
  }
  assets.push({ path: "assets/cover-outline.svg", content: outline.svg });
  return { image: "/assets/cover-outline.svg", widthPt: outline.widthPt, heightPt: outline.heightPt };
}

/**
 * The policy PDF laid out by Typst with a warm compiler, shared across
 * requests. `lib/pdf/generate.tsx` picks the engine and caches finished PDFs.
 */
export async function renderPolicyTypstPdf(policy: Policy, authorApproval?: AuthorApprovalRenderData): Promise<Buffer> {
  const { model, assets } = await preparePolicyTypstRender(policy, authorApproval);
  const typst = getCompiler();
  try {
    if (model.cover.kind === "composition") model.cover.outline = coverOutline(typst, model, assets);
    return mapHyphenGlyphs(Buffer.from(typst.pdf(compileTypstDocument(typst, getTemplate(), model, assets, workspace))));
  } finally {
    // The author's signature only lives for this render.
    typst.resetShadow();
    if (++compilesSinceEvict >= 20) {
      typst.evictCache(30);
      compilesSinceEvict = 0;
    }
  }
}

/**
 * Pays the one-off costs before the first preview asks: creating the compiler
 * and loading its fonts, the first layout of the template, and loading sharp.
 * Together they take a cold first render past a second.
 */
export async function warmPolicyTypst(): Promise<void> {
  await sharp({ create: { width: 1, height: 1, channels: 3, background: "#ffffff" } }).png().toBuffer();
  await renderPolicyTypstPdf({ ...initialPolicy(), showTableOfContents: true });
}
