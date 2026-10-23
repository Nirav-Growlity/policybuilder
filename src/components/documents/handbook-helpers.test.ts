import { buildSampleHandbook } from "@/lib/handbook/sample-handbook";
import { migrateHandbook } from "@/lib/handbook/migrate-handbook";
import assert from "node:assert/strict";
import test from "node:test";
import { HANDBOOK_CATALOG, getHandbookTopic } from "@/lib/handbook/catalog";
import { createEmptyChapter, createEmptyHandbook, createEmptyHandbookFacts } from "@/lib/handbook/initial-handbook";
import type { HandbookChapter, HandbookFacts, HandbookManual, HandbookSection } from "@/lib/handbook/types";
import { DEFAULT_SOP_TEMPLATE_ID, type SopManualControl } from "@/lib/sop/types";
import type { Company } from "@/lib/types";
import {
  buildNewHandbook,
  chapterGroups,
  groupHandbookCatalog,
  handbookPlaceholders,
  handbookReadinessChecks,
  moveChapterBefore,
  replaceHandbookPlaceholder,
  type CustomChapterDraft,
} from "./handbook-helpers";

const company: Company = { name: "Meridian Textiles", industry: "textiles", subCategory: "", industryDetail: "", country: "India", websiteLink: "", site: "", sites: [] } as unknown as Company;

const control: SopManualControl = {
  docNo: "MTX/HR/EH/01",
  revision: "01",
  supersedes: "",
  effectiveDate: "2026-01-01",
  reviewFrequency: "Yearly",
  nextReviewDate: "2027-01-01",
  preparedBy: "",
  reviewedBy: "",
  approvedBy: "Managing Director",
  classification: "Internal",
};

const noFacts: HandbookFacts = createEmptyHandbookFacts();

function build(overrides: Partial<Parameters<typeof buildNewHandbook>[0]> = {}) {
  return buildNewHandbook({
    company,
    control,
    topics: [],
    custom: [],
    theme: DEFAULT_SOP_TEMPLATE_ID,
    themeOptions: { accent: "", fontPair: "", pageSize: "A4", showSopHeaderCard: false },
    cover: { variant: "template" },
    handbookFacts: noFacts,
    ...overrides,
  });
}

/** A handbook with one chapter per entry, for outline and readiness tests. */
function handbookWith(chapters: HandbookChapter[]): HandbookManual {
  const base = createEmptyHandbook({ company, chapters });
  return { ...base, control, frontMatter: { ...base.frontMatter, welcome: [{ id: "w", type: "paragraph", text: "Welcome to Meridian." }] } };
}

test("buildNewHandbook turns each topic into a chapter that carries the catalog outline", () => {
  const leave = getHandbookTopic("leave-holidays");
  assert.ok(leave, "leave-holidays is in the catalog");
  const manual = build({ topics: [leave] });
  assert.equal(manual.chapters.length, 1);
  const [chapter] = manual.chapters;
  assert.equal(chapter.title, leave.title);
  assert.equal(chapter.catalogId, leave.id);
  assert.equal(chapter.part, leave.part);
  assert.equal(chapter.owner, leave.owner);
  assert.deepEqual(chapter.sections.map((section) => [section.kind, section.title]), leave.outline.map((entry) => [entry.kind, entry.title]));
  assert.equal(manual.control.approvedBy, "Managing Director");
  assert.equal(manual.control.docNo, "MTX/HR/EH/01");
});

test("buildNewHandbook appends custom chapters after the catalog ones, skipping blank titles", () => {
  const custom: CustomChapterDraft[] = [
    { id: "c1", title: "  Remote Work  ", part: "working" },
    { id: "c2", title: "   ", part: "pay" },
  ];
  const manual = build({ topics: [getHandbookTopic("grievance")!], custom });
  assert.deepEqual(manual.chapters.map((chapter) => chapter.title), [getHandbookTopic("grievance")!.title, "Remote Work"]);
  assert.equal(manual.chapters[1].catalogId, undefined);
});

test("buildNewHandbook keeps employment terms only when something is filled in", () => {
  assert.equal(build().handbookFacts, undefined);
  assert.equal(build({ handbookFacts: { ...noFacts, leave: [{ type: "", days: "", notes: "" }] } }).handbookFacts, undefined);

  const filled = build({ handbookFacts: { ...noFacts, probation: "6 months", leave: [{ type: "Casual leave", days: "12", notes: "" }, { type: "", days: "5", notes: "" }] } });
  assert.equal(filled.handbookFacts?.probation, "6 months");
  assert.deepEqual(filled.handbookFacts?.leave, [{ type: "Casual leave", days: "12", notes: "" }]);
});

test("chapterGroups lists the parts in handbook order and skips empty parts", () => {
  const manual = handbookWith([
    createEmptyChapter({ title: "Grievances", part: "voice" }),
    createEmptyChapter({ title: "Hours", part: "working" }),
    createEmptyChapter({ title: "Joining", part: "joining" }),
    createEmptyChapter({ title: "More hours", part: "working" }),
  ]);
  assert.deepEqual(chapterGroups(manual).map((group) => group.label), ["Joining the Company", "Working Here", "Speaking Up"]);
  assert.deepEqual(chapterGroups(manual)[1].chapters.map((chapter) => chapter.title), ["Hours", "More hours"]);
  assert.deepEqual(chapterGroups(manual, "none").map((group) => group.label), ["Chapters"]);
});

test("moveChapterBefore moves a chapter into the part of the chapter it lands before", () => {
  const hours = createEmptyChapter({ title: "Hours", part: "working" });
  const pay = createEmptyChapter({ title: "Pay", part: "pay" });
  const grievance = createEmptyChapter({ title: "Grievance", part: "voice" });
  const moved = moveChapterBefore([hours, pay, grievance], grievance.id, hours.id, "part");
  assert.deepEqual(moved.map((chapter) => chapter.title), ["Grievance", "Hours", "Pay"]);
  assert.equal(moved[0].part, "working");
  assert.equal(moved[2].part, "pay", "untouched chapters keep their part");

  const unchanged = moveChapterBefore([hours, pay, grievance], grievance.id, hours.id, "none");
  assert.equal(unchanged[0].part, "voice", "with no grouping the part stays as it was");
});

test("handbookReadinessChecks flags a missing welcome and placeholders left in the text", () => {
  const leave = createEmptyChapter({ title: "Leave", owner: "HR Manager", outline: [{ kind: "custom", title: "Guidelines" }] });
  leave.status = "draft";
  leave.sections[0] = { ...leave.sections[0], blocks: [{ id: "b1", type: "paragraph", text: "Give [notice period] before you travel." }] } as HandbookSection;
  const manual = handbookWith([leave]);
  const noWelcome = { ...manual, frontMatter: { ...manual.frontMatter, welcome: [] } };

  const checks = Object.fromEntries(handbookReadinessChecks(noWelcome).map((check) => [check.id, check]));
  assert.equal(checks.welcome.ok, false);
  assert.deepEqual(checks.welcome.fix, { kind: "front" });
  assert.equal(checks.placeholders.ok, false);
  assert.match(checks.placeholders.detail, /notice period/);
  assert.equal(handbookReadinessChecks(manual).find((check) => check.id === "welcome")?.ok, true);
});

test("replaceHandbookPlaceholder fills the placeholder in every chapter and clears it from the readiness list", () => {
  const leave = createEmptyChapter({ title: "Leave", owner: "HR Manager", outline: [{ kind: "custom", title: "Guidelines" }] });
  leave.sections[0] = { ...leave.sections[0], blocks: [{ id: "b1", type: "paragraph", text: "Give [notice period] before you travel." }] } as HandbookSection;
  const manual = handbookWith([leave]);
  assert.equal(handbookPlaceholders(manual).length, 1);

  const filled = replaceHandbookPlaceholder(manual, "[notice period]", "  30 days  ");
  assert.equal(handbookPlaceholders(filled).length, 0);
  const block = (filled.chapters[0].sections[0] as { blocks: { text: string }[] }).blocks[0];
  assert.equal(block.text, "Give 30 days before you travel.");
  assert.equal(replaceHandbookPlaceholder(manual, "[notice period]", "   ").chapters[0].sections[0], manual.chapters[0].sections[0]);
});

test("the handbook catalog groups into parts with every topic in exactly one group", () => {
  const groups = groupHandbookCatalog(HANDBOOK_CATALOG);
  assert.equal(groups.reduce((sum, group) => sum + group.topics.length, 0), HANDBOOK_CATALOG.length);
  assert.ok(groups.some((group) => group.label === "Working Here"));
});

test("handbook readiness needs an effective date without a document number or chapter owners", () => {
  const manual = buildSampleHandbook();
  manual.control.docNo = "";
  manual.control.effectiveDate = "2026-10-23";
  manual.chapters.forEach((chapter) => { chapter.owner = ""; });
  const checks = handbookReadinessChecks(manual);
  assert.equal(checks.find((check) => check.id === "control")?.ok, true);
  assert.equal(checks.find((check) => check.id === "control")?.label, "Version and effective date");
  assert.equal(checks.some((check) => check.id === "owners"), false);
});

test("legacy reading guidance appends to purpose without mutating the saved handbook", () => {
  const manual = buildSampleHandbook();
  const purpose = [...manual.frontMatter.purpose];
  const guidance = [...manual.frontMatter.howToUse];
  const next = migrateHandbook(manual);
  assert.deepEqual(next.frontMatter.purpose, [...purpose, ...guidance]);
  assert.deepEqual(next.frontMatter.howToUse, []);
  assert.deepEqual(manual.frontMatter.purpose, purpose);
  assert.deepEqual(manual.frontMatter.howToUse, guidance);
  assert.equal(migrateHandbook(next), next);
});

test("blank legacy guidance is cleared without adding empty paragraphs to purpose", () => {
  const manual = buildSampleHandbook();
  const purpose = [...manual.frontMatter.purpose];
  const blank = { ...manual, frontMatter: { ...manual.frontMatter, howToUse: [{ id: "blank", type: "paragraph" as const, text: "   " }] } };
  const next = migrateHandbook(blank);
  assert.deepEqual(next.frontMatter.purpose, purpose);
  assert.deepEqual(next.frontMatter.howToUse, []);
});
