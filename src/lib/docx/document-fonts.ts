import { readFile } from "node:fs/promises";
import path from "node:path";

const FONT_FILES: Record<string, string> = {
  "Source Sans 3": "word/source-sans-3-400.ttf",
  "Source Serif 4": "word/source-serif-4-400.ttf",
  "Libre Caslon Text": "word/libre-caslon-text-400.ttf",
  "IBM Plex Sans": "word/ibm-plex-sans-400.ttf",
  "IBM Plex Serif": "word/ibm-plex-serif-400.ttf",
  Inter: "word/inter-400.ttf",
  "Atkinson Hyperlegible": "word/atkinson-hyperlegible-400.ttf",
  "Space Grotesk": "word/space-grotesk-400.ttf",
  "Public Sans": "word/public-sans-400.ttf",
  Archivo: "word/archivo-400.ttf",
  "Playfair Display": "word/playfair-display-600.ttf",
  Fraunces: "word/fraunces-400.ttf",
  "Cormorant Garamond": "word/cormorant-garamond-500.ttf",
  "IBM Plex Mono": "word/ibm-plex-mono-400.ttf",
};
export async function embeddedDocumentFonts(families: string[]) {
  return Promise.all([...new Set(families)].filter(name => FONT_FILES[name]).map(async name => ({
    name, data: await readFile(path.join(process.cwd(), "public/fonts", FONT_FILES[name])),
  })));
}
