import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateDocx } from "../lib/docx/generate";
import { generatePdf } from "../lib/pdf/generate";
import { themeQaCases } from "./policy-qa-cases";

async function main() {
  const outputDirectory = resolve(process.argv[2] || ".theme-qa");
  await mkdir(outputDirectory, { recursive: true });

  for (const item of themeQaCases()) {
    const baseName = item.name;
    const policy = item.policy;
    const [docx, pdf] = await Promise.all([generateDocx(policy), generatePdf(policy)]);

    if (docx.subarray(0, 2).toString() !== "PK") throw new Error(`${item.label} did not produce a valid DOCX package`);
    if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${item.label} did not produce a valid PDF`);

    await Promise.all([
      writeFile(resolve(outputDirectory, `${baseName}.docx`), docx),
      writeFile(resolve(outputDirectory, `${baseName}.pdf`), pdf),
    ]);
    console.log(`Generated ${item.label}`);
  }

  console.log(`Theme QA exports are in ${outputDirectory}`);
}

void main();
