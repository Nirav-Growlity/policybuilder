import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoverEditor, createInitialCoverComposition, prepareCoverEditorComposition } from "./cover-editor";
import { initialPolicy, makeSamplePolicy } from "@/lib/store";
import { coverDesign } from "@/lib/cover-designs";
import { getPolicyDocumentTheme } from "@/lib/document-themes";
import { pageMarginMm } from "@/lib/page-geometry";

test("cover editor renders a single page-one workspace without document navigation or fixed editor chrome", () => {
  const markup = renderToStaticMarkup(React.createElement(CoverEditor, {
    policy: initialPolicy("environmental"),
    onSave: () => undefined,
    onCancel: () => undefined,
  }));
  assert.equal((markup.match(/data-cover-editor/g) || []).length, 1);
  assert.match(markup, /Cover · Page 1/);
  assert.match(markup, /Page 1 of 1/);
  assert.doesNotMatch(markup, /Continuous scroll|Single page/);
  assert.doesNotMatch(markup, /position:fixed|position: fixed/);
  assert.match(markup, /data-editor-guides="off"/);
  assert.match(markup, /Grid/);
  assert.match(markup, /Snap on/);
  assert.match(markup, /grid-cols-\[220px_minmax\(0,1fr\)_380px\]/);
  assert.match(markup, /min-h-0 min-w-0 flex-col border-l/);
  assert.match(markup, /min-h-0 min-w-0 flex-1 overflow-y-auto/);
  assert.match(markup, /Select an element to edit it/);
  assert.match(markup, /Background/);
});

test("new cover drafts use the selected preview template geometry", () => {
  const policy = makeSamplePolicy();
  const theme = getPolicyDocumentTheme(policy);
  const design = coverDesign(theme.layout.cover);
  const composition = createInitialCoverComposition(policy);
  const title = composition.elements.find((element) => element.id === "cover-policy-title");

  assert.ok(title?.type === "text");
  const printMargin = pageMarginMm(theme.pageBorder);
  assert.equal(title.x, printMargin);
  assert.equal(title.y, printMargin + 10 + 7 + design.spaceMm);
  assert.equal(title.fontSize, design.titlePt);
  assert.equal(title.color, theme.colors.primary);
  assert.equal(title.bold, false);
  const company = composition.elements.find((element) => element.id === "cover-company-name");
  assert.ok(company?.type === "text");
  assert.equal(company.y, printMargin + 10);
  assert.deepEqual(
    composition.elements.filter((element) => element.id.endsWith("-label")).map((element) => element.type === "text" ? element.content : null),
    [
      { kind: "literal", text: "DOCUMENT NO." },
      { kind: "literal", text: "EFFECTIVE DATE" },
      { kind: "literal", text: "REVISION" },
      { kind: "literal", text: "NEXT REVIEW" },
    ],
  );
  assert.equal(composition.elements.some((element) => element.id === "cover-metadata-rule"), true);
});

test("cover editor exposes the resolved print frame used by the document preview", () => {
  const markup = renderToStaticMarkup(React.createElement(CoverEditor, {
    policy: makeSamplePolicy(),
    onSave: () => undefined,
    onCancel: () => undefined,
  }));

  assert.match(markup, /data-cover-print-frame="true"/);
  assert.match(markup, /data-cover-page-background="solid:#FFFFFF"/);
});

test("legacy generated covers receive the preview metadata furniture when reopened", () => {
  const policy = makeSamplePolicy();
  const generated = createInitialCoverComposition(policy);
  const legacy = {
    ...generated,
    elements: generated.elements.filter((element) => !element.id.endsWith("-label") && element.id !== "cover-metadata-rule"),
  };
  const prepared = prepareCoverEditorComposition(policy, legacy);

  assert.equal(prepared.elements.some((element) => element.id === "cover-metadata-rule"), true);
  assert.equal(prepared.elements.filter((element) => element.id.endsWith("-label")).length, 4);
});
