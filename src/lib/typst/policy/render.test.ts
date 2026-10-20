import assert from "node:assert/strict";
import { test } from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getCoverBindingValue } from "../../cover-composition";
import { getDocumentThemePatch } from "../../document-themes";
import { makeSamplePolicy } from "../../store";
import { mapHyphenGlyphs, renderPolicyTypstPdf } from "./render";

async function pageTexts(pdf: Buffer) {
  const doc = await getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const items = (await (await doc.getPage(n)).getTextContent()).items as Array<{ str: string }>;
    pages.push(items.map((item) => item.str).join(""));
  }
  await doc.destroy();
  return pages;
}

test("the Typst policy PDF keeps a clean text layer and the running furniture", async () => {
  const policy = structuredClone(makeSamplePolicy());
  Object.assign(policy, getDocumentThemePatch("standard-pack"), { documentTheme: "standard-pack", showTableOfContents: true });
  const pdf = await renderPolicyTypstPdf(policy);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const pages = await pageTexts(pdf);
  const all = pages.join("\n");
  assert.ok(!all.includes("­"), "no soft hyphens reach the text layer");
  // Real hyphens survive copy even when hyphenation is used elsewhere on the page.
  assert.match(all, /year-on-year|third-party|2022-23/);
  assert.match(pages[0], /Environmental/);
  assert.match(pages[1], /Contents/);
  // The company name appears once on the cover (its brand line); the running header starts on page 2.
  const name = policy.company.name.slice(0, 12);
  assert.equal(pages[0].split(name).length - 1, 1, "the cover carries no running header");
  assert.ok(pages[1].includes(name), "page 2 carries the running header");
  assert.match(pages.at(-1)!, new RegExp(`Page\\s*${pages.length}\\s*/\\s*${pages.length}`));
});

const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

test("the AI cover outline copy stays out of the copied text", async () => {
  const policy = structuredClone(makeSamplePolicy());
  Object.assign(policy, getDocumentThemePatch("standard-pack"), { documentTheme: "standard-pack" });
  policy.activeCoverVariant = "ai";
  policy.aiCoverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "ai-generated",
    background: { color: "#FFFFFF", assetId: svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="28"><rect width="20" height="28" fill="#0F3D33"/></svg>'), fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [{
      id: "policy-title", type: "text", x: 20, y: 150, width: 170, height: 60, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false,
      content: { kind: "binding", binding: "policyTitle" }, fontFamily: "Arial", fontSize: 36, color: "#FFFFFF",
      bold: true, italic: false, underline: false, align: "left", lineHeight: 1.16, letterSpacing: 0,
    }],
  };
  const [cover] = await pageTexts(await renderPolicyTypstPdf(policy));
  assert.equal(cover.split(getCoverBindingValue(policy, "policyTitle")).length - 1, 1, "the title is copied once, without its outline copy");
});

test("the author signature is drawn in the acknowledgement", async () => {
  const policy = structuredClone(makeSamplePolicy());
  Object.assign(policy, getDocumentThemePatch("standard-pack"), { documentTheme: "standard-pack", showAcknowledgement: true });
  const signatureDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const unsigned = await renderPolicyTypstPdf(policy);
  const signed = await renderPolicyTypstPdf(policy, { displayName: "Priya Shah", date: "2026-10-20", signatureDataUrl });
  const images = (pdf: Buffer) => pdf.toString("latin1").split("/Subtype /Image").length - 1;
  assert.ok(images(signed) > images(unsigned), "the signature image is embedded");
  assert.match((await pageTexts(signed)).at(-1)!, /Acknowledgement Form/);
});

test("mapHyphenGlyphs rewrites only ToUnicode soft hyphen targets, in place", () => {
  const pdf = Buffer.from("stream <00AD> endstream 2 beginbfchar <0009> <00AD> <000A> <0070> endbfchar", "latin1");
  const patched = mapHyphenGlyphs(pdf).toString("latin1");
  assert.equal(patched, "stream <00AD> endstream 2 beginbfchar <0009> <002D> <000A> <0070> endbfchar");
  assert.equal(patched.length, pdf.length);
});
