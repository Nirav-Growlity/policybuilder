import { existsSync, readdirSync, readFileSync } from "node:fs";
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

export type FontLineMetrics = { hheaAscent: number; hheaDescent: number; winAscent: number; winDescent: number; typoAscent: number; typoDescent: number; typoLineGap: number; hheaLineGap: number; useTypo: boolean };

const metricsCache = new Map<string, FontLineMetrics>();

/** Vertical metrics of a family's regular face, in em, read from the TTF tables. */
export function fontLineMetrics(family: string, root = process.cwd()): FontLineMetrics {
  const cached = metricsCache.get(family);
  if (cached) return cached;
  const data = readFileSync(join(wordFontDir(root), `${slug(family)}-regular.ttf`));
  const tables = new Map<string, number>();
  for (let index = 0, count = data.readUInt16BE(4); index < count; index++) {
    const record = 12 + index * 16;
    tables.set(data.toString("latin1", record, record + 4), data.readUInt32BE(record + 8));
  }
  const head = tables.get("head")!, hhea = tables.get("hhea")!, os2 = tables.get("OS/2")!;
  const em = data.readUInt16BE(head + 18);
  const metrics = {
    hheaAscent: data.readInt16BE(hhea + 4) / em,
    hheaDescent: -data.readInt16BE(hhea + 6) / em,
    hheaLineGap: data.readInt16BE(hhea + 8) / em,
    typoAscent: data.readInt16BE(os2 + 68) / em,
    typoDescent: -data.readInt16BE(os2 + 70) / em,
    typoLineGap: data.readInt16BE(os2 + 72) / em,
    winAscent: data.readUInt16BE(os2 + 74) / em,
    winDescent: data.readUInt16BE(os2 + 76) / em,
    useTypo: (data.readUInt16BE(os2 + 62) & 0x80) !== 0,
  };
  metricsCache.set(family, metrics);
  return metrics;
}
