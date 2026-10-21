import assert from "node:assert/strict";
import test from "node:test";
import { SOP_CATALOG, recommendSops } from "@/lib/sop/catalog";
import { createEmptyManual, createEmptySop, createEmptySopCompany, createEmptySopSection, withManualSkeleton, withSopSkeleton } from "@/lib/sop/initial-manual";
import { SOP_SECTION_KINDS, type Sop, type SopManual, type SopProcedureSection } from "@/lib/sop/types";
import {
  buildNewManual,
  createTableBlock,
  findPlaceholders,
  estimatePages,
  filterCatalog,
  groupCatalog,
  isSopWritten,
  manualProgress,
  manualTitle,
  manualSummaryLine,
  mergeGeneratedSections,
  moveSopBefore,
  moveSopByOffset,
  narrativeSegments,
  outlineGroups,
  outlineOrder,
  placeholderGroups,
  plainToRichText,
  readinessChecks,
  relativeTime,
  replacePlaceholder,
  richTextToPlain,
  selectionSummary,
  spliceBlocks,
  suggestDocNo,
} from "./manual-helpers";

const sop = (title: string, pillar: Sop["pillar"], department = "EHS"): Sop => createEmptySop({ title, pillar, department, owner: "EHS Manager" });

test("plain text round-trips paragraphs, bullets and numbered lists", () => {
  const blocks = plainToRichText("First paragraph\nstill first.\n\n- one\n- two\n\n1. alpha\n2. beta");
  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "bullets", "numbered"]);
  assert.equal(richTextToPlain(blocks), "First paragraph\nstill first.\n\n- one\n- two\n\n1. alpha\n2. beta");
});

test("editing keeps block ids by position and keeps tables", () => {
  const table = { id: "table-1", type: "table" as const, text: "", columns: ["A"], rows: [["1"]] };
  const first = plainToRichText("Hello", [{ id: "keep-me", type: "paragraph", text: "Old" }, table]);
  assert.equal(first[0].id, "keep-me");
  assert.equal(first.at(-1), table);
  assert.equal(richTextToPlain(first), "Hello");
});

test("editing text around a table in the middle keeps the table in place and every id", () => {
  const table = { id: "t", type: "table" as const, text: "", columns: ["Severity", "Response"], rows: [["High", "1 h"]] };
  const previous = [
    { id: "a", type: "paragraph" as const, text: "Intro" },
    table,
    { id: "b", type: "bullets" as const, text: "one\ntwo" },
  ];
  const edited = plainToRichText("Intro, edited\n\n- one\n- two\n- three", previous);
  assert.deepEqual(edited.map((block) => block.id), ["a", "t", "b"]);
  assert.equal(edited[1], table);
  assert.equal(edited[2].text, "- one\n- two\n- three");
  // A table at the start stays first; when text blocks are removed, later tables close the list.
  assert.deepEqual(plainToRichText("Only", [table, { id: "c", type: "paragraph", text: "x" }]).map((block) => block.id), ["t", "c"]);
  assert.deepEqual(plainToRichText("", previous).map((block) => block.id), ["t"]);
});

test("a narrative field splits into text runs and tables, in order", () => {
  const table = createTableBlock();
  assert.equal(table.columns!.length, 2);
  assert.deepEqual(table.rows, [["", ""], ["", ""]]);
  const blocks = [
    { id: "a", type: "paragraph" as const, text: "Intro" },
    { id: "b", type: "bullets" as const, text: "x" },
    table,
    { id: "c", type: "paragraph" as const, text: "After" },
  ];
  const segments = narrativeSegments(blocks);
  assert.deepEqual(segments.map((segment) => [segment.type, segment.start]), [["text", 0], ["table", 2], ["text", 3]]);
  assert.deepEqual(narrativeSegments([]), [{ type: "text", start: 0, blocks: [] }]);
  assert.deepEqual(narrativeSegments([table]).map((segment) => segment.type), ["table"]);
  // Editing the run after the table replaces only that run.
  const next = spliceBlocks(blocks, 3, 1, plainToRichText("After, edited", [blocks[3]]));
  assert.deepEqual(next.map((block) => block.id), ["a", "b", table.id, "c"]);
  assert.equal(next[3].text, "After, edited");
});

test("placeholders are bracketed words, not citations or empty brackets", () => {
  assert.deepEqual(findPlaceholders("Keep below [consented discharge limit] and see [1], [2, 3], [4-6], [] and [x]."), ["[consented discharge limit]"]);
  assert.deepEqual(findPlaceholders("[Plant Head] approves within [24 hours]"), ["[Plant Head]", "[24 hours]"]);
});

test("readiness counts placeholders everywhere and points at the first one", () => {
  const manual = createEmptyManual({ sops: [sop("Energy", "E"), { ...sop("Water", "E"), code: "W-1" }] });
  assert.equal(readinessChecks(manual).find((check) => check.id === "placeholders")!.ok, true);
  const water = manual.sops[1];
  water.sections = water.sections.map((section) => {
    if (section.kind === "procedure") return { ...section, steps: [{ id: "s", heading: "Treat", body: [{ id: "t", type: "table", text: "", columns: ["Parameter", "Limit"], rows: [["COD", "[consented COD limit]"]] }], substeps: [{ id: "u", text: "Inform [Plant Head]" }] }] };
    if (section.kind === "records") return { ...section, rows: [{ record: "Log", owner: "[owner]", retention: "3 years", format: "" }] };
    if (section.kind === "appendix") return { ...section, blocks: [{ id: "x", type: "paragraph", text: "[ignored: section is off]" }] };
    return section;
  });
  manual.closing.approval.statement = "Approved by [approver name].";
  const check = readinessChecks(manual).find((item) => item.id === "placeholders")!;
  assert.equal(check.ok, false);
  assert.match(check.detail, /^4 placeholders still to replace\. First: \[consented COD limit\] in W-1 Water, Procedure\.$/);
  assert.deepEqual(check.fix, { kind: "placeholders" });
  manual.frontMatter.objective = [{ id: "o", type: "paragraph", text: "Serve [number] sites." }];
  const first = readinessChecks(manual).find((item) => item.id === "placeholders")!;
  assert.match(first.detail, /^5 placeholders/);
  assert.deepEqual(first.fix, { kind: "placeholders" });
});

test("placeholders group by text and fill everywhere at once, leaving ids and kinds alone", () => {
  const manual = createEmptyManual({ sops: [{ ...sop("Water", "E"), code: "W-1" }] });
  const water = manual.sops[0];
  water.sections = water.sections.map((section) => {
    if (section.kind === "procedure") return { ...section, steps: [{ id: "s", heading: "Treat", body: [{ id: "t", type: "table", text: "", columns: ["Parameter", "Limit"], rows: [["COD", "[consent limit]"]] }], substeps: [{ id: "u", text: "Check against [consent limit]" }] }] };
    if (section.kind === "records") return { ...section, rows: [{ record: "Log", owner: "[owner]", retention: "3 years", format: "" }] };
    return section;
  });
  manual.closing.approval.statement = "Within [consent limit].";
  const groups = placeholderGroups(manual);
  assert.deepEqual(groups.map((group) => [group.text, group.count]), [["[consent limit]", 3], ["[owner]", 1]]);
  assert.equal(groups[0].where, "W-1 Water, Procedure");
  // "Go to" lands on the section, not just the SOP.
  assert.deepEqual(groups[0].target, { kind: "sop", sopId: water.id, sectionId: water.sections.find((section) => section.kind === "procedure")!.id });

  const filled = replacePlaceholder(manual, "[consent limit]", " 250 mg/l ");
  assert.deepEqual(placeholderGroups(filled).map((group) => group.text), ["[owner]"]);
  const procedure = filled.sops[0].sections.find((section) => section.kind === "procedure") as SopProcedureSection;
  assert.deepEqual(procedure.steps[0].body[0].rows, [["COD", "250 mg/l"]]);
  assert.equal(procedure.steps[0].substeps![0].text, "Check against 250 mg/l");
  assert.equal(procedure.steps[0].id, "s");
  assert.equal(filled.closing.approval.statement, "Within 250 mg/l.");
  // An empty value changes nothing.
  assert.equal(replacePlaceholder(manual, "[owner]", "  "), manual);
});

test("an SOP counts as written once the AI marks it or most sections have content", () => {
  const empty = sop("Waste", "E");
  assert.equal(isSopWritten(empty), false);
  assert.equal(isSopWritten({ ...empty, status: "draft" }), true);
  const filled = { ...empty, sections: empty.sections.map((section) => ("blocks" in section ? { ...section, blocks: [{ id: "b", type: "paragraph" as const, text: "Text" }] } : section)) };
  // Narrative sections alone are not most of the enabled skeleton.
  assert.equal(isSopWritten(filled), false);
  assert.equal(isSopWritten({ ...empty, status: "generating" }), false);
});

test("progress counts only SOPs included in the manual", () => {
  const manual = createEmptyManual({ sops: [{ ...sop("A", "E"), status: "draft" }, sop("B", "S"), { ...sop("C", "G"), enabled: false }] });
  assert.deepEqual(manualProgress(manual), { written: 1, total: 2 });
});

test("the selection summary reads like the footer", () => {
  assert.equal(estimatePages(14), 95);
  assert.equal(selectionSummary(14), "14 SOPs selected · ~95 pages · ready in about a minute");
  assert.equal(selectionSummary(1), "1 SOP selected · ~14 pages · ready in about a minute");
  assert.match(selectionSummary(40), /about 3 minutes/);
  assert.equal(selectionSummary(0), "No SOPs selected");
});

test("outline groups follow E, S, G, then department order, then manual order", () => {
  const manual = createEmptyManual({ sops: [sop("Ethics", "G", "HR"), sop("Energy", "E"), sop("Safety", "S", "HR"), sop("Water", "E", "Utility")] });
  assert.deepEqual(outlineGroups(manual).map((group) => group.label), ["Environmental", "Social", "Governance"]);
  assert.deepEqual(outlineOrder(manual).map((item) => item.title), ["Energy", "Water", "Safety", "Ethics"]);
  assert.deepEqual(outlineGroups({ ...manual, grouping: "department" }).map((group) => group.label), ["HR", "EHS", "Utility"]);
  assert.equal(outlineGroups({ ...manual, grouping: "none" })[0].sops.length, 4);
});

test("dragging an SOP into another pillar moves it there", () => {
  const sops = [sop("Energy", "E"), sop("Water", "E"), sop("Safety", "S")];
  const moved = moveSopBefore(sops, sops[0].id, sops[2].id, "pillar");
  assert.deepEqual(moved.map((item) => item.title), ["Water", "Energy", "Safety"]);
  assert.equal(moved[1].pillar, "S");
  assert.deepEqual(moveSopBefore(sops, sops[2].id, null, "pillar").map((item) => item.title), ["Energy", "Water", "Safety"]);
});

test("move up and down follow the rail order", () => {
  const manual = createEmptyManual({ sops: [sop("Ethics", "G"), sop("Energy", "E"), sop("Water", "E")] });
  const down = moveSopByOffset(manual, manual.sops[1].id, 1);
  assert.deepEqual(outlineOrder({ ...manual, sops: down }).map((item) => item.title), ["Water", "Energy", "Ethics"]);
  assert.equal(moveSopByOffset(manual, manual.sops[0].id, 1), manual.sops, "the last SOP cannot move down");
});

test("catalog search matches titles, departments and aliases; groups by pillar or department", () => {
  const found = filterCatalog(SOP_CATALOG, "waste");
  assert.ok(found.length > 0);
  assert.ok(found.every((topic) => [topic.title, topic.department, topic.description, ...topic.aliases].join(" ").toLowerCase().includes("waste")));
  const byPillar = groupCatalog(SOP_CATALOG, "pillar");
  assert.deepEqual(byPillar.map((group) => group.key), ["E", "S", "G"].filter((pillar) => SOP_CATALOG.some((topic) => topic.pillar === pillar)));
  const byDepartment = groupCatalog(SOP_CATALOG, "department");
  assert.deepEqual(byDepartment.map((group) => group.label), [...byDepartment.map((group) => group.label)].sort((a, b) => a.localeCompare(b)));
});

test("a new manual carries the chosen SOPs with codes from the document number", () => {
  const company = { ...createEmptySopCompany(), name: "Meridian Textiles Pvt Ltd", industry: "Manufacturing", subCategory: "Textiles" };
  const topics = recommendSops(company).slice(0, 3);
  const base = createEmptyManual({ company });
  const manual = buildNewManual({
    company,
    control: { ...base.control, docNo: "MTPL/SOP/01", approvedBy: "Managing Director" },
    topics,
    custom: [{ id: "c1", title: "Boiler Water Treatment", pillar: "E", department: "Utility" }, { id: "c2", title: "   ", pillar: "S", department: "" }],
    theme: "esg-pillars",
    themeOptions: { accent: "brand", fontPair: "", pageSize: "A4", showSopHeaderCard: false },
    cover: { variant: "template" },
  });
  assert.equal(manual.sops.length, 4, "blank custom titles are skipped");
  assert.equal(manual.theme, "esg-pillars");
  assert.equal(manual.control.approvedBy, "Managing Director");
  assert.ok(manual.sops.every((item) => item.code.startsWith("MTPL-")), manual.sops.map((item) => item.code).join());
  assert.equal(new Set(manual.sops.map((item) => item.code)).size, 4);
  assert.equal(manual.sops[0].catalogId, topics[0].id);
});

test("the suggested document number uses the organization code, else the company initials", () => {
  assert.equal(suggestDocNo({ name: "Meridian Textiles Pvt Ltd" }, "mtpl"), "MTPL/SOP/01");
  assert.equal(suggestDocNo({ name: "Meridian Textiles Pvt Ltd" }), "MT/SOP/01");
});

test("generated sections replace content by kind and keep the SOP's own ids and choices", () => {
  const current = createEmptySop().sections;
  const purpose = current.find((section) => section.kind === "purpose")!;
  const procedure = current.find((section) => section.kind === "procedure")!;
  const appendix = current.find((section) => section.kind === "appendix")!;
  const generated = [
    { ...createEmptySopSection("purpose"), blocks: [{ id: "x", type: "paragraph" as const, text: "Why" }] },
    { ...(createEmptySopSection("procedure") as SopProcedureSection), steps: [{ id: "s", heading: "Do it", body: [] }] },
  ];
  const merged = mergeGeneratedSections([...current.map((section) => (section.id === purpose.id ? { ...section, title: "Objective" } : section)), createEmptySopSection("custom")], generated);
  const mergedPurpose = merged.find((section) => section.id === purpose.id)!;
  assert.equal(mergedPurpose.title, "Objective");
  assert.equal(richTextToPlain("blocks" in mergedPurpose ? mergedPurpose.blocks : []), "Why");
  assert.equal((merged.find((section) => section.id === procedure.id) as SopProcedureSection).steps.length, 1);
  assert.equal(merged.find((section) => section.id === appendix.id)!.enabled, false);
  assert.equal(merged.at(-1)!.kind, "custom");
});

test("readiness points each open check at the place to fix it", () => {
  const manual = createEmptyManual({ sops: [sop("Energy", "E"), { ...sop("Water", "E"), code: "X-1" }, { ...sop("Air", "E"), code: "X-1" }] });
  const checks = Object.fromEntries(readinessChecks(manual).map((check) => [check.id, check]));
  assert.equal(checks.company.ok, false);
  assert.deepEqual(checks.company.fix, { kind: "details" });
  assert.equal(checks.sops.ok, false);
  assert.deepEqual(checks.sops.fix, { kind: "sop", sopId: manual.sops[0].id });
  assert.equal(checks.codes.ok, false);
  assert.match(checks.codes.detail, /X-1 is used more than once/);
  assert.deepEqual(checks.front.fix, { kind: "front" });
  assert.deepEqual(checks.closing.fix, { kind: "closing" });
});

test("drafts rows read like the policy drafts list", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  assert.equal(relativeTime("2026-10-17T10:00:00Z", now), "2h ago");
  assert.equal(relativeTime("2026-10-17T11:59:40Z", now), "just now");
  assert.equal(relativeTime("2026-10-14T12:00:00Z", now), "3 days ago");
  assert.equal(manualSummaryLine({ partCount: 14, pageCount: 96, updatedAt: "2026-10-17T10:00:00Z" }, now), "14 SOPs · 96 pages · updated 2h ago");
  assert.equal(manualSummaryLine({ partCount: 1, pageCount: null, updatedAt: "2026-10-17T11:55:00Z" }, now), "1 SOP · updated 5 min ago");
});

test("a new manual keeps company facts only when something was filled in, without blank lines", () => {
  const company = { ...createEmptySopCompany(), name: "Meridian Textiles Pvt Ltd" };
  const base = createEmptyManual({ company });
  const input = { company, control: base.control, topics: [], custom: [], theme: "controlled-manual" as const, themeOptions: base.themeOptions, cover: base.cover };
  assert.equal("facts" in buildNewManual(input), false);
  assert.equal("facts" in buildNewManual({ ...input, facts: { profile: " ", certifications: [""], regulations: [], contacts: [{ purpose: "", name: "", phone: "", email: "" }] } }), false);
  const manual = buildNewManual({ ...input, facts: { profile: "Founded 1998. ", certifications: ["ISO 14001:2015", ""], regulations: [], contacts: [{ purpose: "Grievance", name: "", phone: "", email: "hr@meridian.in" }] } });
  assert.deepEqual(manual.facts, { profile: "Founded 1998.", certifications: ["ISO 14001:2015"], regulations: [], contacts: [{ purpose: "Grievance", name: "", phone: "", email: "hr@meridian.in" }] });
});

test("readiness asks for a reachable contact for reporting channels", () => {
  const manual = createEmptyManual({ sops: [sop("Grievance", "S")] });
  const check = (facts?: SopManual["facts"]) => readinessChecks({ ...manual, facts }).find((item) => item.id === "contacts")!;
  assert.equal(check().ok, false);
  assert.deepEqual(check().fix, { kind: "details" });
  // A name without a phone or email is not a channel anyone can use.
  assert.equal(check({ profile: "", certifications: [], regulations: [], contacts: [{ purpose: "Grievance", name: "HR Manager", phone: "", email: "" }] }).ok, false);
  const ok = check({ profile: "", certifications: [], regulations: [], contacts: [{ purpose: "Grievance", name: "", phone: "", email: "hr@meridian.in" }, { purpose: "EHS", name: "", phone: "+91 1", email: "" }] });
  assert.equal(ok.ok, true);
  assert.match(ok.detail, /2 contacts/);
});

test("new SOPs carry introduction, compliance and corrective action in canonical order", () => {
  const sections = createEmptySop().sections;
  assert.deepEqual(sections.map((section) => section.kind), SOP_SECTION_KINDS.map((entry) => entry.kind));
  const enabled = Object.fromEntries(sections.map((section) => [section.kind, section.enabled]));
  assert.equal(enabled.introduction, false);
  assert.equal(enabled.compliance, true);
  assert.equal(enabled.corrective, false);
  assert.deepEqual(sections.slice(9, 13).map((section) => section.kind), ["references", "compliance", "corrective", "review"]);
});

test("an SOP saved before the new kinds gets them, switched off, at their canonical place", () => {
  const NEW_KINDS = ["introduction", "compliance", "corrective"];
  const custom = { ...createEmptySopSection("custom", { title: "Emergency contacts" }), id: "custom-1" };
  const stored: Sop = { ...createEmptySop({ title: "Energy" }), id: "sop-old" };
  stored.sections = [...stored.sections.filter((section) => !NEW_KINDS.includes(section.kind)), custom];
  const opened = withSopSkeleton(stored);
  assert.deepEqual(opened.sections.map((section) => section.kind), [
    "introduction", "purpose", "scope", "definitions", "responsibilities", "procedure", "monitoring", "training", "records", "references",
    "compliance", "corrective", "review", "appendix", "custom",
  ]);
  for (const kind of NEW_KINDS) {
    const section = opened.sections.find((candidate) => candidate.kind === kind)!;
    assert.equal(section.enabled, false, kind);
    assert.equal(section.id, `sop-old-${kind}`, "ids are stable from load to load");
  }
  // Existing sections are the same objects; nothing else changes.
  for (const section of stored.sections) assert.ok(opened.sections.includes(section));
  assert.deepEqual(withSopSkeleton(stored), opened, "pure");
  assert.equal(withSopSkeleton(opened), opened, "an SOP with every kind comes back unchanged");
  const manual = createEmptyManual({ sops: [opened] });
  assert.equal(withManualSkeleton(manual), manual);
});

test("the skeleton fills in an imported SOP that has only some sections", () => {
  const imported: Sop = { ...createEmptySop({ title: "Imported" }), id: "imp" };
  imported.sections = [
    { ...createEmptySopSection("purpose"), id: "p" },
    { ...createEmptySopSection("custom", { title: "Background" }), id: "c" },
    { ...createEmptySopSection("procedure"), id: "pr" },
    { ...createEmptySopSection("appendix", { title: "Annexure 1" }), id: "a1" },
    { ...createEmptySopSection("appendix", { title: "Annexure 2" }), id: "a2" },
  ];
  const kinds = withSopSkeleton(imported).sections.map((section) => `${section.kind}${section.enabled ? "" : "(off)"}`);
  assert.deepEqual(kinds, [
    "introduction(off)", "purpose", "scope(off)", "definitions(off)", "responsibilities(off)", "custom", "procedure", "monitoring(off)", "training(off)",
    "records(off)", "references(off)", "compliance(off)", "corrective(off)", "review(off)", "appendix", "appendix",
  ]);
});

test("the manual name is its own title when set, else the company name", () => {
  const manual = createEmptyManual({ company: { ...createEmptySopCompany(), name: "Growlity Realty" } });
  assert.equal(manualTitle(manual), "Growlity Realty SOP Manual");
  assert.equal(manualTitle({ ...manual, control: { ...manual.control, title: "  " } }), "Growlity Realty SOP Manual");
  assert.equal(manualTitle({ ...manual, control: { ...manual.control, title: " ESG SOP Manual " } }), "ESG SOP Manual");
  assert.equal(manualTitle({ company: { ...manual.company, name: "" } }), "SOP Manual");
});
