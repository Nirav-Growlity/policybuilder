import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignatureMaker } from "./signature-maker";
import { StepResponsibilities } from "./steps/step-responsibilities";
import { Toaster } from "@/components/ui/toast";
import { initialPolicy, useBuilder } from "@/lib/store";

test("signature maker explains the saved author mark and acknowledgement relationship", () => {
  const markup = renderToStaticMarkup(React.createElement(SignatureMaker));
  assert.match(markup, /Policy author signature/);
  assert.match(markup, /Save one personal mark/);
  assert.match(markup, /Loading saved signature/);
});

test("signature controls follow Revision History as the final item in the Responsibilities step", () => {
  useBuilder.getState().reset();
  const markup = renderToStaticMarkup(React.createElement(Toaster, null, React.createElement(StepResponsibilities)));
  const signatureIndex = markup.indexOf("Policy author signature");
  const revisionIndex = markup.toLowerCase().indexOf("revision history");

  assert.ok(revisionIndex >= 0);
  assert.ok(signatureIndex > revisionIndex);
  assert.ok(markup.slice(signatureIndex).includes("Loading saved signature"));
});

test("signature controls remain available when Revision History is disabled", () => {
  const policy = useBuilder.getState().policy;
  useBuilder.getState().updatePolicy(() => ({
    sections: policy.sections?.map((section) => section.kind === "revision" ? { ...section, enabled: false } : section),
  }));
  assert.equal(useBuilder.getState().policy.sections?.find((section) => section.kind === "revision")?.enabled, false);
  const markup = renderToStaticMarkup(React.createElement(Toaster, null, React.createElement(StepResponsibilities)));

  assert.match(markup, /Policy author signature/);
});

test("applied author signature is transient and resets when another policy is loaded", () => {
  useBuilder.getState().setAuthorSignatureApplied(true, "2026-09-28");
  useBuilder.getState().setAuthorSignatureUpdatedAt("2026-09-27T12:00:00.000Z");
  assert.equal(useBuilder.getState().includeAuthorSignature, true);
  const persisted = useBuilder.persist.getOptions().partialize?.(useBuilder.getState()) as Record<string, unknown>;
  assert.equal("includeAuthorSignature" in persisted, false);
  assert.equal("authorSignatureDate" in persisted, false);
  assert.equal("authorSignatureUpdatedAt" in persisted, false);

  useBuilder.getState().setPolicy(initialPolicy("labour-human-rights"));
  assert.equal(useBuilder.getState().includeAuthorSignature, false);
  assert.equal(useBuilder.getState().authorSignatureDate, null);
  assert.equal(useBuilder.getState().authorSignatureUpdatedAt, "2026-09-27T12:00:00.000Z");
  useBuilder.getState().setAuthorSignatureUpdatedAt(null);
});
