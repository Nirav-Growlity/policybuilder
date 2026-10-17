import assert from "node:assert/strict";
import test from "node:test";
import { SOP_CATALOG, recommendSops } from "@/lib/sop/catalog";
import { createEmptyManual, createEmptySop, createEmptySopCompany, createEmptySopSection } from "@/lib/sop/initial-manual";
import type { Sop, SopProcedureSection } from "@/lib/sop/types";
import {
  buildNewManual,
  estimatePages,
  filterCatalog,
  groupCatalog,
  isSopWritten,
  manualProgress,
  manualSummaryLine,
  mergeGeneratedSections,
  moveSopBefore,
  moveSopByOffset,
  outlineGroups,
  outlineOrder,
  plainToRichText,
  readinessChecks,
  relativeTime,
  richTextToPlain,
  selectionSummary,
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
