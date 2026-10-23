import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyChapterResult, chapterSectionsToWrite, partialChapterSections } from "../handbook/apply-ai-result";
import { HANDBOOK_GENERATION_ADAPTER } from "../handbook/ai-client";
import type { HandbookAiRequest, HandbookAiResult } from "../handbook/ai-contract";
import { buildSampleHandbook } from "../handbook/sample-handbook";
import { createGenerationQueue } from "../sop/generation-queue";
import type { SopGenerationState } from "../sop/ai-contract";
import { finalizeHandbookOutput, HandbookOutputError, parseHandbookAiRequest } from "./handbook-generation";
import { buildHandbookContext, buildHandbookPrompt, chapterOutputSchema, HANDBOOK_SYSTEM_PROMPT } from "./handbook-prompts";
import { buildHandbookReferenceContext, clearSeedHandbookCache } from "./handbook-template-context";

const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(" ");
const block = (text: string) => ({ type: "paragraph", text, columns: [], rows: [] });

test("the system prompt addresses the employee in British English and forbids invented entitlements", () => {
  assert.match(HANDBOOK_SYSTEM_PROMPT, /British English/);
  assert.match(HANDBOOK_SYSTEM_PROMPT, /Address the employee directly as "you"/);
  assert.match(HANDBOOK_SYSTEM_PROMPT, /Never state a statutory amount, rate, limit or number of days unless the company facts give it/);
});

test("the handbook context is the same for every chapter and ignores owners and statuses", () => {
  const manual = buildSampleHandbook();
  manual.handbookFacts = { workingHours: "9 to 6", weeklyOff: "Sunday", probation: "Six months", noticePeriod: "", payday: "", leave: [{ type: "Earned leave", days: "18", notes: "" }] };
  const before = buildHandbookContext(manual);
  manual.chapters[0].owner = "Someone Else";
  manual.chapters[1].status = "reviewed";
  assert.equal(buildHandbookContext(manual), before);
  assert.match(before, /Working hours and shifts: 9 to 6/);
  assert.match(before, /- Earned leave \| 18 \| -/);
  assert.match(before, /Grievance \| HR Manager/);
  assert.match(before, /- Leave and Holidays \| Working Here/);
});

test("a chapter's sections are keyed by position, so two text sections each get their own key", () => {
  const manual = buildSampleHandbook();
  const chapter = manual.chapters[2];
  const sections = chapterSectionsToWrite(chapter);
  const shape = chapterOutputSchema(sections).shape.sections.shape;
  assert.deepEqual(Object.keys(shape), ["s1", "s2", "s3", "s4", "s5"]);
  const prompt = buildHandbookPrompt({ type: "chapter", manual, chapterId: chapter.id }, "");
  assert.match(prompt.user, /"s1": section "Types of Leave and Entitlements" \(custom\)/);
  assert.match(prompt.user, /"s4": section "Applying for Leave" \(procedure\)/);
  assert.match(prompt.user, /OTHER CHAPTERS IN THIS HANDBOOK/);
});

test("a written chapter maps back onto the chapter's own section ids and headings", () => {
  const manual = buildSampleHandbook();
  const chapter = manual.chapters[2];
  const request: HandbookAiRequest = { type: "chapter", manual, chapterId: chapter.id };
  const result = finalizeHandbookOutput(request, {
    owner: "HR Manager",
    sections: {
      s1: [block(words(30)), { type: "table", text: "", columns: ["Leave", "Days"], rows: [["Earned", "[days]"]] }],
      s2: [block(words(25))],
      s3: [block(words(25))],
      s4: [{ heading: "Apply", responsible: "Employee", body: [block(words(20))], substeps: [] }],
      s5: [block(words(20))],
    },
  });
  assert.equal(result.type, "chapter");
  const written = (result as Extract<HandbookAiResult, { type: "chapter" }>).chapter.sections;
  assert.deepEqual(written.map((section) => section.id), chapter.sections.map((section) => section.id));
  assert.equal(written[0].title, "Types of Leave and Entitlements");
  assert.equal("blocks" in written[0] && written[0].blocks[1].type, "table");
  assert.equal(written[3].kind === "procedure" && written[3].steps[0].responsible, "Employee");

  assert.throws(() => finalizeHandbookOutput(request, { owner: "", sections: { s1: [block("Too short")], s2: [], s3: [], s4: [], s5: [] } }), HandbookOutputError);
});

test("applying a chapter keeps headings and leaves sections switched off meanwhile untouched", () => {
  const manual = buildSampleHandbook();
  const chapter = manual.chapters[2];
  const sections = chapterSectionsToWrite(chapter);
  const partial = partialChapterSections({ sections: { s1: [block("New entitlements text")] } }, sections);
  assert.equal(partial.length, 1);
  assert.equal(partial[0].id, sections[0].id);
  const off = { ...chapter, owner: "", sections: chapter.sections.map((section, index) => (index === 1 ? { ...section, enabled: false } : section)) };
  const next = applyChapterResult(off, { sections: [{ ...partial[0], title: "Ignored" }, { ...sections[1], blocks: [] } as never], owner: "HR Manager" });
  assert.equal(next.sections[0].title, "Types of Leave and Entitlements");
  assert.equal("blocks" in next.sections[0] && next.sections[0].blocks[0].text, "New entitlements text");
  assert.deepEqual(next.sections[1], off.sections[1]);
  assert.equal(next.owner, "HR Manager");
  assert.equal(next.status, "draft");
});

test("requests are validated: unknown chapter, custom refine without instruction, refine of an empty field", () => {
  const manual = buildSampleHandbook();
  assert.equal(parseHandbookAiRequest({ type: "chapter", manual, chapterId: "nope" }).ok, false);
  const chapter = manual.chapters[0];
  assert.equal(parseHandbookAiRequest({ type: "refine", manual, chapterId: chapter.id, sectionId: chapter.sections[0].id, mode: "custom" }).ok, false);
  manual.closing.reviewMechanism = [];
  assert.equal(parseHandbookAiRequest({ type: "manual-field", manual, field: "reviewMechanism", mode: "shorten" }).ok, false);
  assert.equal(parseHandbookAiRequest({ type: "manual-field", manual, field: "acknowledgement", mode: "generate" }).ok, true);
});

test("reference chapters come from the same topic at different companies", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "handbook-seeds-"));
  const seed = (company: string, catalogId: string, text: string) => ({ id: company, company, sourceFile: "", frontMatter: { welcome: "", about: "", purpose: "" }, chapters: [{ title: "Leave Policy", catalogId, part: "working", text, sourceWords: 400 }] });
  fs.writeFileSync(path.join(directory, "a.json"), JSON.stringify(seed("Alpha", "leave-holidays", "ALPHA LEAVE TEXT")));
  fs.writeFileSync(path.join(directory, "b.json"), JSON.stringify(seed("Beta", "leave-holidays", "BETA LEAVE TEXT")));
  fs.writeFileSync(path.join(directory, "c.json"), JSON.stringify(seed("Gamma", "grievance", "GAMMA GRIEVANCE TEXT")));
  clearSeedHandbookCache();
  const context = buildHandbookReferenceContext({ catalogId: "leave-holidays", title: "Leave and Holidays" }, { directory });
  assert.match(context, /ALPHA LEAVE TEXT/);
  assert.match(context, /BETA LEAVE TEXT/);
  assert.doesNotMatch(context, /GAMMA/);
  assert.equal(buildHandbookReferenceContext({ catalogId: "leave-holidays", title: "Leave" }, { directory: path.join(directory, "missing") }), "");
});

test("the shared generation queue writes handbook chapters and the front matter", async () => {
  const manual = buildSampleHandbook();
  const ids = manual.chapters.slice(0, 2).map((chapter) => chapter.id);
  const done: string[] = [];
  const states: SopGenerationState[] = [];
  let frontMatter = false;
  await new Promise<void>((resolve) => {
    createGenerationQueue({
      getManual: () => manual,
      sopIds: ids,
      includeFrontMatter: true,
      concurrency: 2,
      warmupMs: 0,
      adapter: HANDBOOK_GENERATION_ADAPTER,
      onState: (state) => states.push(state),
      onSopDone: (chapterId) => { done.push(chapterId); if (done.length === 2 && frontMatter) resolve(); },
      onFrontMatterDone: () => { frontMatter = true; if (done.length === 2) resolve(); },
      stream: async (request) => {
        if (request.type === "front-matter") return { type: "front-matter" as const, frontMatter: { welcome: [], about: [], vision: "", mission: "", coreValues: [], purpose: [], howToUse: [] } };
        assert.equal(request.type, "chapter");
        return { type: "chapter" as const, chapter: { sections: [] } };
      },
    });
  });
  assert.deepEqual(done.sort(), [...ids].sort());
  assert.ok(states.some((state) => state.status === "writing"));
});
