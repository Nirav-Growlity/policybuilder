import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { LIBRARY_WORD_SLOTS } from "../document-font-library";

// Static faces built by scripts/build-document-fonts.py. "bold" carries the
// weight the PDF uses for bold text (600 where the family offers it), so
// Word draws real glyphs instead of smearing the regular face.
type FontSlot = "regular" | "bold" | "italic" | "bold-italic";
const FONT_FACES: Record<string, readonly FontSlot[]> = {
  "Source Sans 3": ["regular", "bold", "italic"],
  "Source Serif 4": ["regular", "bold", "italic"],
  "Libre Caslon Text": ["regular", "bold", "italic"],
  "IBM Plex Sans": ["regular", "bold"],
  "IBM Plex Serif": ["regular", "bold", "italic"],
  Inter: ["regular", "bold"],
  "Atkinson Hyperlegible": ["regular", "bold", "italic", "bold-italic"],
  "Space Grotesk": ["regular", "bold"],
  "Public Sans": ["regular", "bold"],
  Archivo: ["regular", "bold"],
  "Playfair Display": ["regular", "bold", "italic", "bold-italic"],
  Fraunces: ["regular", "bold", "italic", "bold-italic"],
  "Cormorant Garamond": ["regular", "bold", "italic"],
  Caveat: ["regular", "bold"],
  "IBM Plex Mono": ["regular", "bold"],
  "JetBrains Mono": ["regular", "bold"],
  ...LIBRARY_WORD_SLOTS,
};
const EMBED_ELEMENTS: Record<Exclude<FontSlot, "regular">, string> = { bold: "w:embedBold", italic: "w:embedItalic", "bold-italic": "w:embedBoldItalic" };
const FONT_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font";

function fontFile(family: string, slot: FontSlot) {
  return readFile(path.join(process.cwd(), "public/fonts/word", `${family.toLowerCase().replaceAll(" ", "-")}-${slot}.ttf`));
}

function embeddableFamilies(families: string[]) {
  return [...new Set(families)].filter(name => FONT_FACES[name]);
}

/** Regular faces for the docx `fonts` option, which can only embed one face per family. */
export async function embeddedDocumentFonts(families: string[]) {
  return Promise.all(embeddableFamilies(families).map(async name => ({ name, data: await fontFile(name, "regular") })));
}

// ECMA-376 Part 1, 17.8.1: XOR the first 32 bytes with the key's bytes in reverse order.
function obfuscateFont(data: Buffer, fontKey: string) {
  const key = fontKey.replaceAll("-", "").match(/../g)!.map(byte => parseInt(byte, 16)).reverse();
  const out = Buffer.from(data);
  for (let i = 0; i < 32; i++) out[i] ^= key[i % key.length];
  return out;
}

/** Adds the bold and italic faces next to each regular face the docx package already embedded. */
export async function embedDocumentFontStyles(docx: Buffer, families: string[], includeAllStyles = false): Promise<Buffer> {
  const embeddable = embeddableFamilies(families);
  if (!embeddable.length) return docx;
  const zip = await JSZip.loadAsync(docx);
  const fontTablePath = "word/fontTable.xml";
  const relsPath = "word/_rels/fontTable.xml.rels";
  let fontTable = await zip.file(fontTablePath)?.async("string");
  let rels = await zip.file(relsPath)?.async("string");
  if (!fontTable || !rels) return docx;

  let nextId = Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map(match => Number(match[1]))) + 1;
  let nextFile = Object.keys(zip.files).filter(name => name.startsWith("word/fonts/") && name.endsWith(".odttf")).length + 1;
  const relationships: string[] = [];
  for (const family of embeddable) {
    const escaped = family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regular = new RegExp(`(<w:font w:name="${escaped}">[\\s\\S]*?<w:embedRegular\\b[^>]*/>)`);
    if (!regular.test(fontTable)) continue;
    const embeds: string[] = [];
    // The new manuals use all four faces; policy exports retain their existing slots.
    const slots: readonly FontSlot[] = includeAllStyles && ["IBM Plex Sans", "Source Serif 4"].includes(family) ? ["regular", "bold", "italic", "bold-italic"] : FONT_FACES[family];
    for (const slot of slots) {
      if (slot === "regular") continue;
      const fontKey = randomUUID().toUpperCase();
      const id = `rId${nextId++}`;
      const target = `fonts/font${nextFile++}.odttf`;
      zip.file(`word/${target}`, obfuscateFont(await fontFile(family, slot), fontKey));
      relationships.push(`<Relationship Id="${id}" Type="${FONT_RELATIONSHIP}" Target="${target}"/>`);
      embeds.push(`<${EMBED_ELEMENTS[slot]} r:id="${id}" w:fontKey="{${fontKey}}"/>`);
    }
    fontTable = fontTable.replace(regular, `$1${embeds.join("")}`);
  }
  rels = rels.replace("</Relationships>", `${relationships.join("")}</Relationships>`);
  zip.file(fontTablePath, fontTable);
  zip.file(relsPath, rels);
  // Without this flag Word drops the embedded faces the first time the user saves.
  const settings = await zip.file("word/settings.xml")?.async("string");
  if (settings && !settings.includes("<w:embedTrueTypeFonts")) {
    zip.file("word/settings.xml", settings.includes("<w:displayBackgroundShape/>")
      ? settings.replace("<w:displayBackgroundShape/>", "<w:displayBackgroundShape/><w:embedTrueTypeFonts/>")
      : settings.replace(/(<w:settings[^>]*>)/, "$1<w:embedTrueTypeFonts/>"));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
