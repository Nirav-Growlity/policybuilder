import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AICoverWorkflow, generateAndApplyAICover, persistAndApplyGeneratedCover } from "./ai-cover-workflow";
import { makeSamplePolicy } from "@/lib/store";
import type { CoverComposition } from "@/lib/types";

test("AI cover workflow is separate and does not require an existing manual cover", () => {
  const markup = renderToStaticMarkup(React.createElement(AICoverWorkflow, {
    policy: makeSamplePolicy(),
    onApply: () => undefined,
  }));

  assert.match(markup, /AI cover/i);
  assert.match(markup, /Generate AI cover/);
  assert.match(markup, /will not change your manual cover/);
  assert.match(markup, /Document design/);
  assert.doesNotMatch(markup, /Current AI cover/);
  assert.doesNotMatch(markup, /Imported policy|reference policy/);
});

test("a generated AI cover is applied immediately after it is persisted", async () => {
  const composition: CoverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "ai-generated",
    background: { color: "#ffffff", fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [],
  };
  const applied: typeof composition[] = [];

  const persisted = await persistAndApplyGeneratedCover(composition, async (next) => {
    applied.push(next);
  });

  assert.deepEqual(applied, [composition]);
  assert.deepEqual(persisted, composition);
});

test("preview and export callers share one in-flight AI cover generation", async () => {
  const composition: CoverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "ai-generated",
    background: { color: "#ffffff", fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [],
  };
  const policy = makeSamplePolicy();
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(JSON.stringify({ composition }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const applied: CoverComposition[] = [];
    const [previewResult, exportResult] = await Promise.all([
      generateAndApplyAICover(policy, (next) => { applied.push(next); }),
      generateAndApplyAICover(policy, (next) => { applied.push(next); }),
    ]);

    assert.equal(requests, 1);
    assert.deepEqual(previewResult, composition);
    assert.deepEqual(exportResult, composition);
    assert.deepEqual(applied, [composition, composition]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
