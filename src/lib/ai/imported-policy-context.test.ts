import assert from "node:assert/strict";
import test from "node:test";
import { buildImportedPolicyContext } from "./imported-policy-context";
import type { ImportedPolicyContext } from "../types";

const reference: ImportedPolicyContext = {
  fileName: "source.docx",
  policyType: "environmental",
  title: "Source Policy",
  text: "",
  importedAt: "2026-08-31T00:00:00.000Z",
  sections: [
    { id: "scope", title: "Our Reach", level: 2, kind: "scope", blocks: [{ type: "paragraph", text: "All operating sites." }] },
    { id: "targets", title: "The Change We Measure", level: 2, kind: "quantitative", blocks: [{ type: "paragraph", text: "Reduce water use by 20%." }] },
  ],
};

test("labels the import as primary and puts the requested section first", () => {
  const context = buildImportedPolicyContext(reference, "quantitative");
  assert.match(context, /^PRIMARY IMPORTED POLICY CONTEXT/);
  assert.ok(context.indexOf("The Change We Measure") < context.lastIndexOf("Our Reach"));
  assert.match(context, /Reduce water use by 20%/);
});

test("an edit gets no imported context, so a rewrite cannot hand the source back", () => {
  assert.equal(buildImportedPolicyContext(reference, "scope", { action: "rewrite" }), "");
  assert.equal(buildImportedPolicyContext(reference, "custom-block", { action: "shorten" }), "");
  assert.match(buildImportedPolicyContext(reference, "scope"), /All operating sites/);
});

test("definitions prefer the document's definitions section", () => {
  const withDefinitions: ImportedPolicyContext = {
    ...reference,
    sections: [...reference.sections, { id: "defs", title: "Key Terms", level: 2, kind: "definitions", blocks: [{ type: "paragraph", text: "Scope 1: direct emissions." }] }],
  };
  const context = buildImportedPolicyContext(withDefinitions, "definitions");
  assert.ok(context.indexOf("## Key Terms [definitions]") < context.indexOf("## Our Reach [scope]"));
});
