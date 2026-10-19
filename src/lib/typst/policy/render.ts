import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import type { AuthorApprovalRenderData } from "../../document-render-model";
import type { Policy } from "../../types";
import { compileTypstDocument } from "../compile";
import { policyFontFiles } from "../fonts";
import { preparePolicyTypstRender } from "./model";

const root = process.cwd();
const workspace = join(root, ".typst-workspace");
let compiler: NodeCompiler | null = null;
let template: string | null = null;

function getCompiler() {
  compiler ??= NodeCompiler.create({ workspace, fontArgs: [{ fontPaths: policyFontFiles(root) }] });
  return compiler;
}

function getTemplate() {
  template ??= readFileSync(join(root, "lib", "typst", "policy", "policy.typ"), "utf8");
  return template;
}

/**
 * Typst maps the hyphen glyph to U+00AD in its ToUnicode tables and marks
 * real hyphens with /ActualText, which pdf.js (the in-app viewer) ignores, so
 * "2022-23" would copy as "2022 23". Mapping the glyph to "-" makes every
 * hyphen, line-end ones included, copy as Chromium's PDF does. The tables are
 * uncompressed and the patch keeps their length, so no offset moves.
 */
export function mapHyphenGlyphs(pdf: Buffer): Buffer {
  const text = pdf.toString("latin1");
  const out = Buffer.from(pdf);
  for (const table of text.matchAll(/beginbfchar[\s\S]*?endbfchar/g)) {
    for (const entry of table[0].matchAll(/(<[0-9A-Fa-f]+>\s*)<00AD>/g)) {
      out.write("<002D>", table.index! + entry.index! + entry[1].length, "latin1");
    }
  }
  return out;
}

/** The policy PDF laid out by Typst with a warm compiler. Engine selection and caching come with ticket 08. */
export async function renderPolicyTypstPdf(policy: Policy, authorApproval?: AuthorApprovalRenderData): Promise<Buffer> {
  const { model, assets } = await preparePolicyTypstRender(policy, authorApproval);
  const typst = getCompiler();
  return mapHyphenGlyphs(Buffer.from(typst.pdf(compileTypstDocument(typst, getTemplate(), model, assets, workspace))));
}
