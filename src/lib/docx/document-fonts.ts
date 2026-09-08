import { readFile } from "node:fs/promises";
import path from "node:path";

const FONT_FILES: Record<string, string> = {
  "Source Sans 3": "source-sans-3", "Source Serif 4": "source-serif-4", "Libre Caslon Text": "libre-caslon-text",
  "IBM Plex Sans": "ibm-plex-sans", "IBM Plex Serif": "ibm-plex-serif", Inter: "inter",
};
export async function embeddedDocumentFonts(families: string[]) {
  return Promise.all([...new Set(families)].filter(name => FONT_FILES[name]).map(async name => ({
    name, data: await readFile(path.join(process.cwd(), "public/fonts", FONT_FILES[name] + "-400.ttf")),
  })));
}
