import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { collapseSpaces, SOFT_HYPHEN, typesetProse } from "./hyphenation";
import { convertSoftHyphens } from "./docx/soft-hyphens";

test("stray double spaces and tabs collapse while line breaks and single special spaces stay", () => {
  assert.equal(collapseSpaces("Asrotex  is committed,\tto  act.  \nNext line 100\u202F%"), "Asrotex is committed, to act.\nNext line 100\u202F%");
});

test("justified prose gains soft hyphens that leave the visible text unchanged", () => {
  const text = "Follow environmental procedures and contact esg@growlity.com or https://example.com/environmental-policy.";
  const typeset = typesetProse(text, "justify");
  assert.ok(typeset.includes(`en${SOFT_HYPHEN}vi${SOFT_HYPHEN}ron${SOFT_HYPHEN}men${SOFT_HYPHEN}tal`));
  assert.equal(typeset.replaceAll(SOFT_HYPHEN, ""), text);
  assert.ok(typeset.includes("esg@growlity.com"), "addresses are never hyphenated");
  assert.ok(typeset.includes("https://example.com/environmental-policy."), "links are never hyphenated");
  assert.equal(typesetProse(text, "left"), text, "only justified text is hyphenated");
});

test("Word receives native optional hyphens instead of raw soft-hyphen characters", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document><w:r><w:t xml:space="preserve">en${SOFT_HYPHEN}vi${SOFT_HYPHEN}ron </w:t></w:r><w:r><w:t>plain</w:t></w:r></w:document>`);
  const converted = await JSZip.loadAsync(await convertSoftHyphens(await zip.generateAsync({ type: "nodebuffer" })));
  const xml = await converted.file("word/document.xml")!.async("string");
  assert.equal(xml, `<w:document><w:r><w:t xml:space="preserve">en</w:t><w:softHyphen/><w:t xml:space="preserve">vi</w:t><w:softHyphen/><w:t xml:space="preserve">ron </w:t></w:r><w:r><w:t>plain</w:t></w:r></w:document>`);
});
