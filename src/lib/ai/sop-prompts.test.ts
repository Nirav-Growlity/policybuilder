import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { SopAiRequest } from "../sop/ai-contract";
import { createEmptyManual, createEmptySop, createEmptySopCompany } from "../sop/initial-manual";
import type { SeedSopManual } from "../sop/seed-types";
import type { SopManual } from "../sop/types";
import { estimateTokens } from "./claude";
import {
  buildSopPrompt,
  collectSopPromptSources,
  fitSopPromptBudget,
  SOP_MAX_TOKENS,
  SOP_SYSTEM_PROMPT,
} from "./sop-prompts";
import { buildImportedSopContext, buildSopReferenceContext, clearSeedSopCache } from "./sop-template-context";

function sampleManual(): SopManual {
  const company = {
    ...createEmptySopCompany(),
    name: "Meridian Textiles Pvt Ltd",
    industry: "Manufacturing",
    subCategory: "Textiles",
    industryDetail: "Cotton yarn dyeing",
    country: "India",
    sites: [{ location: "Unit 1 Dyeing House", address: "SIPCOT Perundurai, Erode", primaryFunction: "Dyeing and finishing" }],
  };
  const waste = createEmptySop({ title: "Waste Segregation and Disposal", catalogId: "waste-management", code: "MTPL-EHS-001", department: "EHS", owner: "EHS Manager" });
  const grievance = createEmptySop({ title: "Grievance Handling", catalogId: "grievance-mechanism", code: "MTPL-HR-001", pillar: "S", department: "HR", owner: "HR Manager" });
  // The user switched training off for the waste SOP.
  waste.sections = waste.sections.map((section) => (section.kind === "training" ? { ...section, enabled: false } : section));
  return createEmptyManual({ company, sops: [waste, grievance] });
}

function seedManual(company: string, tags: string[], sops: Array<{ title: string; catalogId: string | null; words?: number }>): SeedSopManual {
  return {
    id: company.toLowerCase().replace(/\W+/g, "-"),
    company,
    industry: tags.join(" "),
    industryTags: tags,
    sourceFile: `${company}.docx`,
    frontMatter: { introduction: `${company} INTRO SENTINEL`, objective: "", scope: "", reviewMechanism: `${company} REVIEW SENTINEL` },
    parsedAt: "2026-10-01T00:00:00.000Z",
    sops: sops.map((sop) => ({
      title: sop.title,
      catalogId: sop.catalogId,
      code: "X-001",
      sourceWords: sop.words ?? 1000,
      pillar: "E",
      department: "EHS",
      owner: "EHS Manager",
      sections: [
        { kind: "purpose", title: "Purpose", blocks: [{ type: "paragraph", text: `${company} ${sop.title} PURPOSE SENTINEL` }] },
        { kind: "procedure", title: "Procedure", steps: [{ heading: "Segregate at source", body: [{ type: "paragraph", text: "Use colour-coded bins." }], responsible: "Supervisor" }] },
      ],
    })),
  };
}

function withSeeds(manuals: SeedSopManual[], run: (directory: string) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sop-seeds-"));
  try {
    manuals.forEach((manual, index) => fs.writeFileSync(path.join(directory, `${index}.json`), JSON.stringify(manual)));
    clearSeedSopCache();
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    clearSeedSopCache();
  }
}

test("system prompt states the house style and British English", () => {
  assert.match(SOP_SYSTEM_PROMPT, /British English/);
  assert.match(SOP_SYSTEM_PROMPT, /Never invent/);
  assert.match(SOP_SYSTEM_PROMPT, /Roles & Responsibilities/);
});

test("manual context is identical for every SOP of a manual, so parallel calls share the cache", () => {
  const manual = sampleManual();
  const sources = { references: "REFERENCE TEXT", imported: "" };
  const first = buildSopPrompt({ type: "sop", manual, sopId: manual.sops[0].id }, sources);
  const second = buildSopPrompt({ type: "sop", manual, sopId: manual.sops[1].id }, sources);
  assert.equal(first.system, second.system);
  assert.equal(first.cachedContext, second.cachedContext);
  assert.match(first.cachedContext, /Meridian Textiles/);
  assert.match(first.cachedContext, /SIPCOT Perundurai/);
  assert.match(first.cachedContext, /MTPL-HR-001 \| Grievance Handling/);
  // Per-SOP material stays out of the cached prefix.
  assert.doesNotMatch(first.cachedContext, /REFERENCE TEXT/);
  assert.match(first.user, /REFERENCE TEXT/);
  assert.notEqual(first.user, second.user);
});

test("owners filled in while SOPs are written do not change the cached manual context", () => {
  const manual = sampleManual();
  const before = buildSopPrompt({ type: "sop", manual, sopId: manual.sops[0].id }, { references: "", imported: "" });
  const written = { ...manual, sops: manual.sops.map((sop, index) => (index === 1 ? { ...sop, owner: "Head of People" } : sop)) };
  const after = buildSopPrompt({ type: "sop", manual: written, sopId: written.sops[0].id }, { references: "", imported: "" });
  assert.equal(after.cachedContext, before.cachedContext);
  // The SOP being written still names its owner, in the task.
  assert.match(after.user, /owner: EHS Manager/);
});

test("section edits put their sources behind the reusable cache breakpoint; whole SOPs do not", () => {
  const manual = sampleManual();
  const sop = manual.sops[0];
  const purpose = sop.sections.find((section) => section.kind === "purpose")!;
  const sources = { references: "REFERENCE TEXT", imported: "IMPORTED TEXT" };
  const regenerate = buildSopPrompt({ type: "sop-section", manual, sopId: sop.id, sectionId: purpose.id }, sources);
  const shorten = buildSopPrompt({ type: "refine", manual, sopId: sop.id, sectionId: purpose.id, mode: "shorten" }, sources);
  assert.equal(regenerate.reusableContext, "IMPORTED TEXT\n\nREFERENCE TEXT");
  // Follow-up edits of the same section send the same cached prefix.
  assert.equal(shorten.reusableContext, regenerate.reusableContext);
  assert.doesNotMatch(regenerate.user, /REFERENCE TEXT/);
  const whole = buildSopPrompt({ type: "sop", manual, sopId: sop.id }, sources);
  assert.equal(whole.reusableContext, "");
  assert.match(whole.user, /^IMPORTED TEXT\n\nREFERENCE TEXT/);
});

test("a whole-SOP prompt asks only for enabled AI sections", () => {
  const manual = sampleManual();
  const prompt = buildSopPrompt({ type: "sop", manual, sopId: manual.sops[0].id }, { references: "", imported: "" });
  assert.match(prompt.user, /- "procedure" \(heading "Procedure"\)/);
  assert.doesNotMatch(prompt.user, /- "training" \(heading/);
  assert.doesNotMatch(prompt.user, /- "appendix" \(heading/);
  assert.equal(prompt.maxTokens, SOP_MAX_TOKENS.sop);
});

test("every request type builds a prompt with its own schema and token cap", () => {
  const manual = sampleManual();
  const sop = manual.sops[0];
  const procedure = sop.sections.find((section) => section.kind === "procedure")!;
  const purpose = sop.sections.find((section) => section.kind === "purpose")!;
  const requests: SopAiRequest[] = [
    { type: "sop", manual, sopId: sop.id },
    { type: "sop-section", manual, sopId: sop.id, sectionId: procedure.id, instruction: "Add a step for sludge." },
    { type: "refine", manual, sopId: sop.id, sectionId: purpose.id, mode: "shorten" },
    { type: "front-matter", manual },
    { type: "closing", manual },
  ];
  for (const request of requests) {
    const prompt = buildSopPrompt(request, { references: "", imported: "" });
    assert.ok(prompt.user.includes("TASK:"), request.type);
    assert.ok(prompt.maxTokens >= 1_200 && prompt.maxTokens <= 7_000, request.type);
    assert.ok(prompt.schema, request.type);
  }
  const section = buildSopPrompt(requests[1], { references: "", imported: "" });
  assert.equal(section.maxTokens, SOP_MAX_TOKENS.procedureSection);
  assert.match(section.user, /Add a step for sludge/);
  assert.equal(section.schema.safeParse({ sections: { procedure: [] } }).success, true);
  assert.equal(section.schema.safeParse({ sections: { purpose: [] } }).success, false);
  // A whole SOP may only return the enabled kinds, each one required.
  const whole = buildSopPrompt(requests[0], { references: "", imported: "" });
  const shape = (whole.schema as unknown as { shape: { sections: { shape: Record<string, unknown> } } }).shape.sections.shape;
  assert.deepEqual(Object.keys(shape), ["purpose", "scope", "definitions", "responsibilities", "procedure", "monitoring", "records", "references", "review"]);
});

test("the budget trimmer cuts references first, then siblings, then imported context", () => {
  const big = (label: string, chars: number) => `${label}\n${"x".repeat(80)}\n`.repeat(Math.ceil(chars / 90));
  const parts = {
    system: "S",
    cachedContext: "C",
    task: "TASK: keep me whole",
    references: big("REF", 120_000),
    siblings: big("SIB", 20_000),
    imported: big("IMP", 20_000),
  };
  const fitted = fitSopPromptBudget(parts, { targetTokens: 20_000 });
  const total = estimateTokens(Object.values(fitted).join(""));
  assert.ok(total <= 20_000, `estimated ${total}`);
  assert.equal(fitted.task, parts.task);
  assert.equal(fitted.siblings, parts.siblings);
  assert.equal(fitted.imported, parts.imported);
  assert.ok(fitted.references.length < parts.references.length);

  const tight = fitSopPromptBudget(parts, { targetTokens: 4_000 });
  assert.equal(tight.references, "");
  assert.ok(tight.siblings.length < parts.siblings.length);
  assert.ok(estimateTokens(Object.values(tight).join("")) <= 4_000);
});

test("a real prompt with a large corpus stays under the 40K token target", () => {
  const sops = Array.from({ length: 40 }, (_, index) => ({ title: `Waste Segregation and Disposal ${index}`, catalogId: "waste-management", words: 3000 }));
  const manuals = Array.from({ length: 8 }, (_, index) => seedManual(`Company ${index}`, ["textiles", "manufacturing"], sops));
  withSeeds(manuals, (directory) => {
    const manual = sampleManual();
    const request: SopAiRequest = { type: "sop", manual, sopId: manual.sops[0].id };
    const prompt = buildSopPrompt(request, collectSopPromptSources(request, null, { directory }));
    assert.ok(prompt.estimatedTokens < 40_000, `estimated ${prompt.estimatedTokens}`);
    assert.match(prompt.user, /REFERENCE SOPS/);
  });
});

test("references prefer the same catalog topic and industry, and the corpus may be missing", () => {
  withSeeds([
    seedManual("Alpha Mills", ["textiles", "manufacturing"], [{ title: "Waste Management", catalogId: "waste-management", words: 1200 }]),
    seedManual("Beta Bank", ["services"], [{ title: "Waste Handling at Offices", catalogId: "waste-management", words: 600 }]),
    seedManual("Gamma Dyes", ["chemicals", "manufacturing"], [{ title: "Chemical Storage", catalogId: "chemical-management" }]),
  ], (directory) => {
    const text = buildSopReferenceContext({ catalogId: "waste-management", title: "Waste Segregation and Disposal", industryTags: ["textiles", "manufacturing"] }, { directory });
    assert.match(text, /Alpha Mills Waste Management PURPOSE SENTINEL/);
    assert.ok(text.indexOf("Alpha Mills") < text.indexOf("Beta Bank"), "same industry ranks first");
    assert.doesNotMatch(text, /Chemical Storage/);
    assert.match(text, /about \d+ words per SOP/);
    assert.ok(buildSopReferenceContext({ catalogId: "waste-management", title: "Waste", industryTags: [] }, { directory, maxChars: 900 }).length <= 900);
  });
  assert.equal(buildSopReferenceContext({ catalogId: "waste-management", title: "Waste", industryTags: [] }, { directory: path.join(os.tmpdir(), "no-such-seed-dir") }), "");
});

test("an imported SOP with a matching title becomes PRIMARY context", () => {
  const imported = {
    title: "SOP Manual",
    sops: [
      { title: "SOP for Grievance Redressal", sections: [{ label: "Purpose", kind: "purpose", blocks: [{ id: "b", type: "paragraph", text: "GRIEVANCE IMPORT SENTINEL" }] }] },
      { title: "Waste Segregation & Disposal", sections: [{ label: "Procedure", kind: "procedure", blocks: [{ id: "c", type: "numbered", text: "Collect waste\nWeigh waste" }] }] },
    ],
  };
  const text = buildImportedSopContext(imported, "Waste Segregation and Disposal");
  assert.match(text, /^PRIMARY CONTEXT/);
  assert.match(text, /1\. Collect waste/);
  assert.doesNotMatch(text, /GRIEVANCE IMPORT SENTINEL/);
  assert.equal(buildImportedSopContext(imported, "Energy Conservation"), "");
  assert.equal(buildImportedSopContext(null, "Waste"), "");
});
