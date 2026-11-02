import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Toaster } from "@/components/ui/toast";
import { createEmptyChapter } from "@/lib/handbook/initial-handbook";
import { buildSampleHandbook } from "@/lib/handbook/sample-handbook";
import { useHandbookBuilder, type StoredHandbook } from "@/lib/handbook/store";
import { HandbookBuilderContext, type HandbookBuilderActions } from "./handbook-builder/handbook-builder-context";
import { ChapterWriter } from "./handbook-builder/chapter-writer";
import { HandbookReviewMode } from "./handbook-builder/handbook-review-mode";
import { ClosingWriter, OpeningWriter } from "./handbook-builder/handbook-part-writers";

const noop = () => undefined;

// Server rendering reads a zustand store's initial state object; copy the live state into it before rendering.
const syncServerSnapshot = () => Object.assign(useHandbookBuilder.getInitialState(), useHandbookBuilder.getState());

// Escapes text the way the server renderer does, for matching attribute values.
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const actions: HandbookBuilderActions = {
  orgId: 11,
  manualId: "handbook-1",
  workspaceHref: "/documents?orgId=11",
  generate: noop,
  retry: noop,
  cancelGeneration: noop,
  flush: async () => undefined,
  openDetails: noop,
  setMode: noop,
};

function loadSampleHandbook() {
  const manual = buildSampleHandbook();
  const stored = { id: "handbook-1", kind: "handbook", title: "Meridian Employee Handbook", currentStage: "write", lockVersion: 2, createdAt: "", updatedAt: "", archivedAt: null, pageCount: null, partCount: manual.chapters.length, templateId: null, manual, importedContext: null } as unknown as StoredHandbook;
  useHandbookBuilder.getState().load(stored, 11);
  return manual;
}

const inBuilder = (element: React.ReactElement) => syncServerSnapshot() && renderToStaticMarkup(React.createElement(Toaster, null, React.createElement(HandbookBuilderContext.Provider, { value: actions }, element)));

test("a chapter opens on each of its section headings, with AI controls for the sections that have text", () => {
  const manual = loadSampleHandbook();
  const chapter = manual.chapters.find((item) => item.catalogId === "working-hours")!;
  assert.ok(chapter.sections.length > 0);
  const markup = inBuilder(React.createElement(ChapterWriter, { chapter }));
  assert.match(markup, new RegExp(`value="${escapeHtml(chapter.title)}"`));
  for (const section of chapter.sections) assert.match(markup, new RegExp(`value="${escapeHtml(section.title)}"`));
  assert.match(markup, /AI edit/);
  assert.match(markup, />Add section</);
  assert.match(markup, /Record your attendance with the biometric reader/);
});

test("an empty chapter offers one-click writing and keeps its section headings", () => {
  loadSampleHandbook();
  const chapter = createEmptyChapter({ title: "Leave and Holidays", part: "working", outline: [{ kind: "purpose", title: "Purpose" }, { kind: "procedure", title: "Procedure" }] });
  const markup = inBuilder(React.createElement(ChapterWriter, { chapter }));
  assert.match(markup, /This chapter is empty/);
  assert.match(markup, />Write this chapter</);
  assert.match(markup, /AI Write/);
  for (const section of chapter.sections) assert.match(markup, new RegExp(`value="${escapeHtml(section.title)}"`));
});

test("review lists the handbook checks, each with a way to fix it when it is open", () => {
  loadSampleHandbook();
  const markup = inBuilder(React.createElement(HandbookReviewMode));
  assert.match(markup, /Company and approver/);
  assert.match(markup, /Version and effective date/);
  assert.match(markup, /Contacts for raising concerns/);
  assert.match(markup, /Chapters written/);
  assert.match(markup, /Employee acknowledgement/);
  assert.match(markup, /Full handbook preview/);
});

test("the opening pages show the welcome and the vision fields", () => {
  const manual = loadSampleHandbook();
  const markup = inBuilder(React.createElement(OpeningWriter));
  assert.match(markup, />Welcome</);
  assert.match(markup, /Welcome to Meridian Textiles/);
  assert.match(markup, />Vision</);
  assert.match(markup, new RegExp(`value="${escapeHtml(manual.frontMatter.vision)}"`));
  assert.match(markup, /Edit sites/);
});

test("handbook writing hides SOP metadata and merges the opening guidance", () => {
  const manual = loadSampleHandbook();
  const chapter = inBuilder(React.createElement(ChapterWriter, { chapter: manual.chapters[0] }));
  assert.doesNotMatch(chapter, />Code<|>Owner<|>1\.0</);
  const opening = inBuilder(React.createElement(OpeningWriter));
  assert.match(opening, /About this handbook/);
  assert.doesNotMatch(opening, /How to use this handbook|Certifications/);
  const closing = inBuilder(React.createElement(ClosingWriter));
  assert.match(closing, /Approved by/);
  assert.doesNotMatch(closing, /Review mechanism|Approval statement|Add signatory|Signatories/);
});
