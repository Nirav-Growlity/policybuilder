import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoverEditor } from "./cover-editor";
import { initialPolicy } from "@/lib/store";

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
