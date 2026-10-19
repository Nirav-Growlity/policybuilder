// Prints each text run on the chosen pages of a PDF with its position (mm from
// the top-left corner), size (pt) and font, to calibrate a template against
// another renderer's output.
// Run: npx tsx scripts/pdf-text-dump.ts <file.pdf> [pages=1,2]
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MM = 25.4 / 72;

async function main() {
  const [file, pageArg] = process.argv.slice(2);
  if (!file) throw new Error("Usage: pdf-text-dump.ts <file.pdf> [pages]");
  const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
  const pages = pageArg ? pageArg.split(",").map(Number) : Array.from({ length: doc.numPages }, (_, index) => index + 1);
  for (const n of pages) {
    const page = await doc.getPage(n);
    const height = page.view[3];
    const content = await page.getTextContent();
    const styles = content.styles as Record<string, { fontFamily: string }>;
    console.log(`--- page ${n} of ${doc.numPages}`);
    for (const item of content.items as Array<{ str: string; transform: number[]; width: number; fontName: string }>) {
      if (!item.str.trim()) continue;
      const size = Math.hypot(item.transform[0], item.transform[1]);
      const x = item.transform[4] * MM;
      const baseline = (height - item.transform[5]) * MM;
      console.log(`${x.toFixed(1).padStart(6)} ${baseline.toFixed(1).padStart(6)}  ${size.toFixed(2).padStart(5)}pt  w${(item.width * MM).toFixed(1).padStart(6)}  ${(styles[item.fontName]?.fontFamily ?? item.fontName).slice(0, 18).padEnd(18)} ${item.str.slice(0, 70)}`);
    }
  }
  await doc.destroy();
}

main().catch((error) => { console.error(error); process.exit(1); });
