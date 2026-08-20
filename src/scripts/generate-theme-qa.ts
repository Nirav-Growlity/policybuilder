import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DOCUMENT_THEMES, getDocumentThemePatch } from "../lib/document-themes";
import { generateDocx } from "../lib/docx/generate";
import { generatePdf } from "../lib/pdf/generate";
import { makeSamplePolicy } from "../lib/store";

async function main() {
  const outputDirectory = resolve(process.argv[2] || ".theme-qa");
  await mkdir(outputDirectory, { recursive: true });

  for (const theme of DOCUMENT_THEMES) {
    const policy = {
      ...makeSamplePolicy(),
      ...getDocumentThemePatch(theme.id),
      documentTheme: theme.id,
    };
    const baseName = theme.id;
    const [docx, pdf] = await Promise.all([generateDocx(policy), generatePdf(policy)]);

    await Promise.all([
      writeFile(resolve(outputDirectory, `${baseName}.docx`), docx),
      writeFile(resolve(outputDirectory, `${baseName}.pdf`), pdf),
    ]);
    console.log(`Generated ${theme.name}`);
  }

  console.log(`Theme QA exports are in ${outputDirectory}`);
}

void main();
