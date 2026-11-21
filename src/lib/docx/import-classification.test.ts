import assert from "node:assert/strict";
import test from "node:test";

import { initialPolicy } from "../initial-policy";
import type { ImportedPolicyContext } from "../types";
import { applyClassification, expandLabels, flattenUnits, type ClassificationLabel } from "./import-classification";
import { importedPolicyToPolicy } from "./import-to-policy";
import { parseImportedPolicyHtml } from "./parse";

const parse = (html: string): ImportedPolicyContext =>
  parseImportedPolicyHtml(html, { fileName: "Acme Environmental Policy.docx", policyType: "environmental", importedAt: "2026-11-21T00:00:00.000Z" });

const DOCUMENT = `<h1>Acme Environmental Policy</h1>
  <p>Document No: ENV-9</p>
  <h1>Our Commitments</h1>
  <p>We care about the planet and every community around our plants.</p>
  <p>Reduce water use at all plants.</p>
  <p>Cut energy use by 10% by 2030.</p>
  <h1>Who does what</h1>
  <p>The HR Manager oversees training programmes.</p>
  <p>Plant heads keep the site clean.</p>
  <h1>Our goals</h1>
  <p>Supports goals SDG 3 and SDG 5 shown in the report.</p>
  <h1>Employee sign-off</h1>
  <p>Signed copies are kept on file.</p>`;

const reference = parse(DOCUMENT);
const units = flattenUnits(reference);
const idOf = (text: string) => {
  const unit = units.find((entry) => entry.text.startsWith(text));
  assert.ok(unit, `a part starting "${text}"`);
  return unit.id;
};
const map = (labels: ClassificationLabel[], source = reference) => importedPolicyToPolicy(source, initialPolicy("environmental"), { u: labels });
const everyText = (value: unknown): string[] => (typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(everyText) : value && typeof value === "object" ? Object.values(value).flatMap(everyText) : []);

test("flattening gives one numbered part per paragraph, list item and table row, in order", () => {
  const html = parse(`<h1>Scope</h1><p>One.</p><ul><li>Two.</li><li>Three.</li></ul><table><tbody><tr><th>A</th><th>B</th></tr><tr><td>c</td><td></td></tr></tbody></table>`);
  const flat = flattenUnits(html);
  assert.deepEqual(flat.map((unit) => [unit.id, unit.type, unit.text]), [[0, "p", "One."], [1, "l", "Two."], [2, "l", "Three."], [3, "r", "A | B"], [4, "r", "c"]]);
  assert.deepEqual(flat.map((unit) => unit.section), [0, 0, 0, 0, 0]);
});

test("labels expand to one per id, unknown ids are ignored and the first label for an id wins", () => {
  const labels = expandLabels({ u: [{ i: 1, e: 3, d: "obj" }, { i: 2, d: "res" }, { i: 99, d: "scp" }, { i: -5, d: "scp" }, { i: 0, d: "nope" as never }] }, 5);
  assert.deepEqual([...labels.keys()].sort(), [1, 2, 3]);
  assert.equal(labels.get(2)?.d, "obj", "the first label wins");
  assert.equal(labels.has(99), false);
});

test("a label places a part where the rules would not, and the document's words are copied unchanged", () => {
  const rules = importedPolicyToPolicy(reference, initialPolicy("environmental"));
  assert.ok(!Object.values(rules.patch.qualitative ?? {}).flat().includes("Reduce water use at all plants."), "the rules leave the free-standing commitment alone");

  const { patch } = map([
    { i: idOf("Reduce water"), d: "obj", a: "Water use" },
    { i: idOf("Cut energy"), d: "tgt", a: "Water use" },
  ]);
  assert.deepEqual(patch.focusAreas, ["Water use"], "the area name is one the document uses");
  assert.deepEqual(patch.qualitative, { "Water use": ["Reduce water use at all plants."] });
  const target = patch.quantitative?.find((area) => area.area === "Water use")?.targets[0];
  assert.equal(target?.target, "Cut energy use by 10% by 2030.");
});

test("every string the classification placed is a string from the document", () => {
  const { patch } = map([
    { i: idOf("Reduce water"), d: "obj", a: "Water use" },
    { i: idOf("The HR Manager"), d: "res", r: "HR Manager" },
    { i: idOf("We care"), d: "pre" },
  ]);
  const documentText = units.map((unit) => unit.text).join("\n");
  const placed = [...everyText(patch.qualitative), ...everyText(patch.responsibilities), patch.declaration?.preface ?? ""].filter(Boolean);
  assert.ok(placed.length >= 4);
  for (const text of placed) assert.ok(documentText.includes(text), `"${text}" is in the document`);
  assert.equal(patch.declaration?.preface, "We care about the planet and every community around our plants.");
});

test("a role label splits the part into the document's own role and duty", () => {
  const { patch } = map([{ i: idOf("The HR Manager"), d: "res", r: "HR Manager" }, { i: idOf("Plant heads"), d: "res", r: "Plant heads" }]);
  assert.deepEqual(patch.responsibilities, [
    { role: "HR Manager", duty: "oversees training programmes." },
    { role: "Plant heads", duty: "keep the site clean." },
  ]);
});

test("labels for ids that do not exist, destinations that do not exist or area names the document never uses change nothing", () => {
  const baseline = importedPolicyToPolicy(reference, initialPolicy("environmental"));
  const { patch } = map([
    { i: 5_000, d: "obj", a: "Water use" },
    { i: idOf("Reduce water"), d: "obj", a: "Quantum teleportation" },
    { i: idOf("Cut energy"), d: "nonsense" as never },
    { i: -1, e: 4, d: "scp" },
  ]);
  assert.ok(!patch.focusAreas?.some((area) => /quantum/i.test(area)), "an invented area name is refused");
  assert.deepEqual(patch.qualitative?.["Quantum teleportation"], undefined);
  assert.deepEqual(patch.company, baseline.patch.company);
  assert.deepEqual(patch.responsibilities, baseline.patch.responsibilities);
});

test("a label cannot invent text: nothing outside the document reaches the policy", () => {
  const { patch } = map([
    { i: idOf("Reduce water"), d: "obj", a: "Water use", v: "Invented sentence the model wrote." },
    { i: idOf("Document No"), d: "meta", f: "documentNo", v: "MADE-UP-77" },
  ]);
  const json = JSON.stringify(patch);
  assert.doesNotMatch(json, /Invented sentence/);
  assert.doesNotMatch(json, /MADE-UP-77/, "a metadata value the document does not contain is refused");
});

test("document details are read from the part the label points to", () => {
  const { patch } = map([{ i: idOf("Document No"), d: "meta", f: "documentNo", v: "ENV-9" }]);
  assert.equal(patch.company?.docNum, "ENV-9");
});

test("parts labelled as dropped stay out of the policy and are counted", () => {
  const applied = applyClassification(reference, { u: [{ i: idOf("Signed copies"), d: "drop" }] });
  assert.equal(applied.dropped, 1);
  const { patch } = map([{ i: idOf("Signed copies"), d: "drop" }]);
  assert.doesNotMatch(JSON.stringify(patch), /Signed copies/);
  assert.equal(importedPolicyToPolicy(reference, initialPolicy("environmental")).patch.sections?.some((section) => /sign-off/i.test(section.title) && section.enabled), true, "without the label the rules keep it as a custom section");
});

test("SDG labels keep only goals 1 to 17 that the text itself states", () => {
  // 8 is a valid goal but the line never names it, so a model cannot add it.
  const { patch, report } = map([{ i: idOf("Supports goals"), d: "sdg", n: [3, 99, 0, 5, 3, 8] }]);
  assert.deepEqual(patch.sdgs, [3, 5]);
  assert.ok(report.filled.includes("sdg"));
  assert.equal(patch.sections?.find((section) => section.kind === "sdg")?.enabled, true);
});

test("an empty or malformed classification gives the rules' policy", () => {
  const strip = (value: unknown) => JSON.stringify(value, (key, item) => (key === "id" || key === "importedAt" ? undefined : item));
  const baseline = strip(importedPolicyToPolicy(reference, initialPolicy("environmental")).patch);
  assert.equal(strip(map([]).patch), baseline);
  assert.equal(strip(importedPolicyToPolicy(reference, initialPolicy("environmental"), { u: "nonsense" } as never).patch), baseline);
  assert.equal(strip(importedPolicyToPolicy(reference, initialPolicy("environmental"), null as never).patch), baseline);
});
