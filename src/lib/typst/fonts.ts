import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DOCUMENT_FONT_ALIASES } from "../document-fonts";
import { SOP_FONT_FAMILIES } from "../sop/design/templates";

const SLOTS = ["regular", "bold", "italic", "bold-italic"] as const;

const wordFontDir = (root: string) => join(root, "public", "fonts", "word");
const slug = (family: string) => family.toLowerCase().replaceAll(" ", "-");

/**
 * The SOP templates load the very same TTF files the DOCX export embeds
 * (public/fonts/word), so the PDF and the Word file use identical fonts.
 */
export function sopFontFiles(root = process.cwd()): string[] {
  return SOP_FONT_FAMILIES.flatMap((family) => SLOTS.map((slot) => join(wordFontDir(root), `${slug(family)}-${slot}.ttf`)));
}

/** Policies can pick any family the font picker offers, so they load every face Word embeds. */
export function policyFontFiles(root = process.cwd()): string[] {
  return readdirSync(wordFontDir(root)).filter((file) => file.endsWith(".ttf")).sort().map((file) => join(wordFontDir(root), file));
}

/**
 * The family Typst draws with. Office names map to their metric-compatible
 * stand-ins (Arial to Arimo, and so on), as in the browser preview. A family
 * without a TTF falls back to `fallback`, which must itself resolve.
 */
export function typstFontFamily(family: string | undefined, fallback: string, root = process.cwd()): string {
  const base = (family || "").split(",")[0].trim().replace(/^['"]+|['"]+$/g, "");
  const target = DOCUMENT_FONT_ALIASES[base] ?? base;
  if (target && existsSync(join(wordFontDir(root), `${slug(target)}-regular.ttf`))) return target;
  return fallback === family ? "Source Sans 3" : typstFontFamily(fallback, "Source Sans 3", root);
}
