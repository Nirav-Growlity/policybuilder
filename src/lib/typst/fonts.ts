import { join } from "node:path";
import { SOP_FONT_FAMILIES } from "../sop/design/templates";

const SLOTS = ["regular", "bold", "italic", "bold-italic"] as const;

/**
 * The SOP templates load the very same TTF files the DOCX export embeds
 * (public/fonts/word), so the PDF and the Word file use identical fonts.
 */
export function sopFontFiles(root = process.cwd()): string[] {
  return SOP_FONT_FAMILIES.flatMap((family) => {
    const slug = family.toLowerCase().replaceAll(" ", "-");
    return SLOTS.map((slot) => join(root, "public", "fonts", "word", `${slug}-${slot}.ttf`));
  });
}
