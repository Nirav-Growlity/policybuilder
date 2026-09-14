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
});
