import { writeFile, readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { DOCUMENT_THEMES } from "../lib/document-themes";
import { templatePreviewPolicy, PREVIEW_POLICY_TYPES } from "../lib/sample-policies";
import { generatePdf } from "../lib/pdf/generate";
import { generateDocx } from "../lib/docx/generate";
const run=promisify(execFile);
async function main(){
 const jobs=DOCUMENT_THEMES.flatMap(theme=>PREVIEW_POLICY_TYPES.map(type=>({theme,type})));
 const manifest=JSON.parse(await readFile('public/template-previews/manifest.json','utf8'));
 async function worker(){for(;;){const job=jobs.shift();if(!job)return;const {theme,type}=job;
 const policy=templatePreviewPolicy(theme.id,type); const name=`${theme.id}-${type}`;
 const file=`.theme-qa/templates/${name}.pdf`; const bytes=await generatePdf(policy);
 const doc=await PDFDocument.load(bytes); await writeFile(file,bytes); await writeFile(`.theme-qa/templates/${name}.docx`,await generateDocx(policy));
 for(const [kind,page] of [["cover",1],["body",Math.min(3,doc.getPageCount())]] as const)await run('pdftoppm',['-f',String(page),'-l',String(page),'-singlefile','-scale-to','700','-png',file,`public/template-previews/${theme.id}/${type}-${kind}`],{windowsHide:true});
 manifest.cases[name]=doc.getPageCount();console.log(name);
 }}
 await Promise.all([worker(),worker(),worker()]);
 const hash=createHash('sha256');for(const file of ['lib/document-themes.ts','lib/cover-designs.ts','lib/sample-policies.ts','lib/pdf/print-document.tsx','components/policy/policy-preview.tsx'])hash.update(await readFile(file));
 for(const font of (await readdir('public/fonts')).sort())hash.update(await readFile(`public/fonts/${font}`));
 manifest.sourceHash=hash.digest('hex');await writeFile('public/template-previews/manifest.json',JSON.stringify(manifest,null,2));
 console.log('All 40 gallery samples refreshed.');
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
