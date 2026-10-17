import assert from "node:assert/strict";
import test from "node:test";

import { finalizeSopOutput, mockSopOutput } from "../ai/sop-generation";
import {
  applyClosingResult,
  applyFrontMatterResult,
  applySectionResult,
  applySopAiResult,
  applySopResult,
  generatedSectionToSopSection,
  partialSectionsFromGenerated,
} from "./apply-ai-result";
import { createEmptyManual, createEmptySop, createEmptySopSection } from "./initial-manual";
import type { SopManual, SopNarrativeSection, SopSection } from "./types";

function manualWithOneSop(): SopManual {
  const sop = createEmptySop({ title: "Energy Conservation", department: "", owner: "Utilities Head" });
  sop.sections = sop.sections.map((section) => {
    if (section.kind === "training") return { ...section, enabled: false, blocks: [{ id: "t", type: "paragraph", text: "USER TRAINING TEXT" }] };
    if (section.kind === "purpose") return { ...section, title: "Objective" };
    return section;
  });
  sop.sections.push({ ...createEmptySopSection("custom", { title: "Site notes" }), blocks: [{ id: "c", type: "paragraph", text: "KEEP CUSTOM" }] } as SopSection);
  return createEmptyManual({ sops: [sop] });
}

const generated = (kind: SopSection["kind"], text: string) =>
  generatedSectionToSopSection({ kind, title: kind, blocks: [{ type: "paragraph", text }] })!;

test("a whole-SOP result fills enabled sections and keeps ids, titles and switched-off sections", () => {
  const manual = manualWithOneSop();
  const sop = manual.sops[0];
  const result = { sections: [generated("purpose", "NEW PURPOSE"), generated("training", "AI TRAINING"), generated("scope", "NEW SCOPE")], department: "Utilities", owner: "AI Owner" };
  const next = applySopResult(manual, sop.id, result);
  const updated = next.sops[0];
  const byKind = (kind: string) => updated.sections.find((section) => section.kind === kind)! as SopNarrativeSection;

  assert.equal(updated.status, "draft");
  assert.equal(byKind("purpose").blocks[0].text, "NEW PURPOSE");
  assert.equal(byKind("purpose").title, "Objective");
  assert.equal(byKind("purpose").id, sop.sections.find((section) => section.kind === "purpose")!.id);
  assert.equal(byKind("training").enabled, false);
  assert.equal(byKind("training").blocks[0].text, "USER TRAINING TEXT");
  assert.equal(byKind("custom").blocks[0].text, "KEEP CUSTOM");
  assert.equal(updated.department, "Utilities", "blank department is filled");
  assert.equal(updated.owner, "Utilities Head", "user owner is kept");
  assert.equal(updated.sections.length, sop.sections.length);
  assert.equal(manual.sops[0].status, "empty", "input is not mutated");
});

test("a section result replaces one section in place and ignores a kind mismatch", () => {
  const manual = manualWithOneSop();
  const sop = manual.sops[0];
  const scope = sop.sections.find((section) => section.kind === "scope")!;
  const next = applySectionResult(manual, sop.id, scope.id, generated("scope", "REWRITTEN"));
  const updated = next.sops[0].sections.find((section) => section.id === scope.id)! as SopNarrativeSection;
  assert.equal(updated.blocks[0].text, "REWRITTEN");
  assert.equal(next.sops[0].status, "draft");

  const mismatch = applySectionResult(manual, sop.id, scope.id, generated("purpose", "WRONG"));
  assert.deepEqual(mismatch.sops[0], sop);
});

test("front matter and closing results keep sites, glossary and signatories", () => {
  const manual = manualWithOneSop();
  manual.frontMatter.sites = [{ address: "Plant 1" }];
  manual.frontMatter.glossary = [{ term: "EHS", definition: "Environment, health and safety" }];
  manual.closing.approval.signatories = [{ role: "Approved by", name: "A. Rao", designation: "MD", date: "" }];
  const intro = [{ id: "i", type: "paragraph" as const, text: "INTRO" }];
  const withFront = applyFrontMatterResult(manual, { introduction: intro, objective: [], benefits: ["One"], coreValues: [], howToUse: [] });
  assert.equal(withFront.frontMatter.introduction[0].text, "INTRO");
  assert.deepEqual(withFront.frontMatter.sites, manual.frontMatter.sites);
  assert.deepEqual(withFront.frontMatter.glossary, manual.frontMatter.glossary);

  const closed = applyClosingResult(manual, { reviewMechanism: intro, approvalStatement: "Approved." });
  assert.equal(closed.closing.approval.statement, "Approved.");
  assert.deepEqual(closed.closing.approval.signatories, manual.closing.approval.signatories);
});

test("partial generated JSON maps to sections with stable positional ids", () => {
  const partial = { title: "x", sections: [{ kind: "purpose", title: "Purpose", blocks: [{ type: "paragraph", text: "To def" }] }, { kind: "procedure", title: "Proc", steps: [{ heading: "Step one" }] }, { kind: "unknown" }] };
  const first = partialSectionsFromGenerated(partial);
  const second = partialSectionsFromGenerated(partial);
  assert.equal(first.length, 2);
  assert.deepEqual(first.map((section) => section.id), second.map((section) => section.id));
  const procedure = first[1] as Extract<SopSection, { kind: "procedure" }>;
  assert.equal(procedure.steps[0].heading, "Step one");
  assert.deepEqual(procedure.steps[0].body, []);
  assert.deepEqual(partialSectionsFromGenerated(undefined), []);

  // The compact keyed shape the model streams.
  const wire = partialSectionsFromGenerated({ sections: { purpose: [{ type: "paragraph", text: "To" }], procedure: [{ heading: "Collect", responsible: "" }] } }, { purpose: "Objective" });
  assert.deepEqual(wire.map((section) => [section.kind, section.title]), [["purpose", "Objective"], ["procedure", "Procedure"]]);
  assert.equal((wire[1] as Extract<SopSection, { kind: "procedure" }>).steps[0].responsible, undefined);
});

test("the offline mock answer round-trips through validation and applies to every request type", () => {
  const manual = manualWithOneSop();
  const sop = manual.sops[0];
  const procedure = sop.sections.find((section) => section.kind === "procedure")!;

  const sopResult = finalizeSopOutput({ type: "sop", manual, sopId: sop.id }, mockSopOutput({ type: "sop", manual, sopId: sop.id }));
  const written = applySopAiResult(manual, { sopId: sop.id }, sopResult).sops[0];
  const writtenProcedure = written.sections.find((section) => section.kind === "procedure") as Extract<SopSection, { kind: "procedure" }>;
  assert.ok(writtenProcedure.steps.length >= 3);
  assert.ok(writtenProcedure.steps.every((step) => step.id && step.id !== procedure.id));

  const refine = { type: "refine" as const, manual, sopId: sop.id, sectionId: procedure.id, mode: "expand" as const };
  const refined = finalizeSopOutput(refine, mockSopOutput(refine));
  assert.equal(refined.type, "refine");
  if (refined.type === "refine") assert.equal(refined.section.id, procedure.id);

  const front = finalizeSopOutput({ type: "front-matter", manual }, mockSopOutput({ type: "front-matter", manual }));
  assert.equal(front.type, "front-matter");
  const closing = finalizeSopOutput({ type: "closing", manual }, mockSopOutput({ type: "closing", manual }));
  assert.equal(applySopAiResult(manual, {}, closing).closing.approval.statement.length > 0, true);

  assert.throws(() => finalizeSopOutput({ type: "sop", manual, sopId: sop.id }, { sections: "nope" }), /did not match/);
  // A near-empty SOP is rejected so the queue retries it.
  const stub = JSON.parse(JSON.stringify(mockSopOutput({ type: "sop", manual, sopId: sop.id })), (key, value) => (typeof value === "string" && key !== "type" ? "Short." : value));
  assert.throws(() => finalizeSopOutput({ type: "sop", manual, sopId: sop.id }, stub), /too short/);
});
