import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AICoverWorkflow } from "./ai-cover-workflow";
import { makeSamplePolicy } from "@/lib/store";

test("AI cover workflow is separate and does not require an existing manual cover", () => {
  const markup = renderToStaticMarkup(React.createElement(AICoverWorkflow, {
    policy: makeSamplePolicy(),
    onApply: () => undefined,
    onEdit: () => undefined,
  }));

  assert.match(markup, /AI Cover/);
  assert.match(markup, /Generate AI cover/);
  assert.match(markup, /will not change your manual cover/);
  assert.doesNotMatch(markup, /Imported policy|reference policy/);
});
