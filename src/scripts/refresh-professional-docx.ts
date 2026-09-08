import { readdir, writeFile } from "node:fs/promises";
import { DOCUMENT_THEMES } from "../lib/document-themes";
import { templatePreviewPolicy, PREVIEW_POLICY_TYPES } from "../lib/sample-policies";
import { generateDocx } from "../lib/docx/generate";
async function main() {
  for (const theme of DOCUMENT_THEMES) for (const type of PREVIEW_POLICY_TYPES) {
    await writeFile(`.theme-qa/templates/${theme.id}-${type}.docx`, await generateDocx(templatePreviewPolicy(theme.id, type)));
  }
  console.log(`Refreshed editable Word samples for all eight templates and five policy types (${(await readdir('.theme-qa/templates')).length} QA files).`);
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
