import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignatureMaker } from "./signature-maker";
import { StepResponsibilities } from "./steps/step-responsibilities";
import { Toaster } from "@/components/ui/toast";
import { initialPolicy, useBuilder } from "@/lib/store";
import { cloneSignaturePointGroups, recordSignatureHistoryEntry } from "./signature-history";

test("signature history keeps each stroke snapshot independent from the live pad data", () => {
  const livePadData = [] as Parameters<typeof recordSignatureHistoryEntry>[2];
  const firstStroke = { dotSize: 0, minWidth: 1, maxWidth: 2, penColor: "#17211b", velocityFilterWeight: 0.7, compositeOperation: "source-over" as GlobalCompositeOperation, points: [{ x: 12, y: 14, pressure: 0.5, time: 1 }] };
  livePadData.push(firstStroke);

  const firstEntry = recordSignatureHistoryEntry([], -1, livePadData);
  livePadData.push({ ...firstStroke, points: [{ x: 32, y: 34, pressure: 0.5, time: 2 }] });
  const secondEntry = recordSignatureHistoryEntry(firstEntry.history, firstEntry.cursor, livePadData);

  assert.equal(secondEntry.history[0].length, 1, "the first undo point should contain only the first stroke");
  assert.equal(secondEntry.history[1].length, 2, "the current drawing should contain both strokes");
  assert.notEqual(secondEntry.history[0], secondEntry.history[1], "each undo point should be an independent snapshot");
  assert.notEqual(secondEntry.history[0][0], livePadData[0], "snapshots should not share mutable stroke groups with the pad");
  assert.notEqual(secondEntry.history[0][0].points[0], livePadData[0].points[0], "snapshots should not share mutable points with the pad");

  const branchedPadData = cloneSignaturePointGroups(secondEntry.history[0]);
  branchedPadData.push({ ...firstStroke, points: [{ x: 52, y: 54, pressure: 0.5, time: 3 }] });
  const branched = recordSignatureHistoryEntry(secondEntry.history, 0, branchedPadData);
  assert.equal(branched.cursor, 1);
  assert.equal(branched.history.length, 2, "drawing after undo should discard the redo branch");
  assert.equal(branched.history[0].length, 1, "branching should preserve the earlier undo point");
  assert.equal(branched.history[1].length, 2, "the new branch should contain the restored and new strokes");
});

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
