import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { PolicyPreview } from "../components/policy/policy-preview";
import { DOCUMENT_THEMES } from "../lib/document-themes";
import { templatePreviewPolicy } from "../lib/sample-policies";
async function main() {
 const browser = await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true});
 try {
 const page=await browser.newPage();
 for(const theme of DOCUMENT_THEMES){
 const policy=templatePreviewPolicy(theme.id,"environmental");
 policy.templateBrandOverrides={schemaVersion:1, colors:{primaryDark:"#912345",subheading:"#176B45",ink:"#234589"}};
 await page.setContent(renderToStaticMarkup(createElement(PolicyPreview,{policy})));
 const result=await page.evaluate(()=>Object.fromEntries(Object.entries({heading:"h1,h2",subheading:"h3",body:".policy-section p,.policy-section li"}).map(([key,selector])=>[key,[...new Set(Array.from(document.querySelectorAll(selector),node=>getComputedStyle(node).color))]])));
 assert.deepEqual(result.heading,["rgb(145, 35, 69)"],theme.id+" headings");
 assert.deepEqual(result.subheading,["rgb(23, 107, 69)"],theme.id+" subheadings");
 assert.deepEqual(result.body,["rgb(35, 69, 137)"],theme.id+" body");
 console.log(theme.id+": independent text colors verified");
 }
 } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
