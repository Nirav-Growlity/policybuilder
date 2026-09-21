import assert from "node:assert/strict";
import test from "node:test";
import { REVISION_HISTORY_DEFAULT } from "./constants";
import { buildDocumentRenderModel } from "./document-render-model";
import { templatePreviewPolicy } from "./sample-policies";
import { resolveRevisionHistory, scheduleAnchorAfter, suggestMinorRevisionNumber } from "./revision-history";

test("creates annual major revisions from effective date through last review date", () => {
  const entries = resolveRevisionHistory(REVISION_HISTORY_DEFAULT, "2023-01-01", "2025-01-01");

  assert.deepEqual(entries.map(({ revisionNo, date }) => [revisionNo, date]), [
    ["0.0", "01-01-2023"],
    ["1.0", "01-01-2024"],
    ["2.0", "01-01-2025"],
  ]);
  assert.equal(entries[0].description, "Initial release of policy");
});

test("uses effective-date anniversaries and the exact last review date", () => {
  const entries = resolveRevisionHistory(undefined, "2023-05-15", "2025-08-20");

  assert.deepEqual(entries.map(({ revisionNo, date }) => [revisionNo, date]), [
    ["0.0", "15-05-2023"],
    ["1.0", "15-05-2024"],
    ["2.0", "20-08-2025"],
  ]);
});

test("keeps only the effective-date row when there is no last review date", () => {
  const entries = resolveRevisionHistory(undefined, "2023-07-04");

  assert.deepEqual(entries.map(({ revisionNo, date }) => [revisionNo, date]), [["0.0", "04-07-2023"]]);
});

test("uses a minor scheduled revision for a same-year review and avoids duplicate dates", () => {
  const sameYear = resolveRevisionHistory(undefined, "2025-01-01", "2025-10-01");
  const sameDate = resolveRevisionHistory(undefined, "2025-01-01", "2025-01-01");

  assert.deepEqual(sameYear.map(({ revisionNo, date }) => [revisionNo, date]), [
    ["0.0", "01-01-2025"],
    ["0.1", "01-10-2025"],
  ]);
  assert.equal(sameDate.length, 1);
});

test("clamps February 29 anniversaries to February 28 in non-leap years", () => {
  const entries = resolveRevisionHistory(undefined, "2024-02-29", "2026-02-28");

  assert.deepEqual(entries.map(({ revisionNo, date }) => [revisionNo, date]), [
    ["0.0", "29-02-2024"],
    ["1.0", "28-02-2025"],
    ["2.0", "28-02-2026"],
  ]);
});

test("updates scheduled rows while retaining and positioning custom revisions", () => {
  const firstSchedule = resolveRevisionHistory(undefined, "2023-01-01", "2025-01-01");
  const custom = {
    revisionNo: "1.1",
    date: "15-07-2024",
    description: "Interim update",
    source: "custom" as const,
    scheduleAnchor: 1,
  };
  const updated = resolveRevisionHistory(
    [...firstSchedule.slice(0, 2), custom, firstSchedule[2]],
    "2023-01-01",
    "2026-01-01",
  );

  assert.deepEqual(updated.map(({ revisionNo }) => revisionNo), ["0.0", "1.0", "1.1", "2.0", "3.0"]);
  assert.equal(updated[2].description, "Interim update");
  assert.equal(updated[2].date, "15-07-2024");
  assert.equal(updated[4].date, "01-01-2026");
});

test("replaces legacy static defaults but retains legacy custom history", () => {
  const legacy = [
    { revisionNo: "0.0", date: "01/01/2024", description: "Initial release of policy" },
    { revisionNo: "1.0", date: "01/01/2025", description: "Edited annual review" },
    { revisionNo: "1.1", date: "15-06-2025", description: "Interim change" },
    { revisionNo: "2.0", date: "01/01/2026", description: "Later annual review" },
  ];
  const entries = resolveRevisionHistory(legacy, "2023-01-01", "2025-01-01");

  assert.deepEqual(entries.map(({ revisionNo }) => revisionNo), ["0.0", "1.0", "1.1", "2.0"]);
  assert.equal(entries[1].description, "Edited annual review");
  assert.equal(entries[2].description, "Interim change");
});

test("removes fabricated descriptions from the exact old static sample history", () => {
  const entries = resolveRevisionHistory([
    { revisionNo: "0.0", date: "01/01/2024", description: "Initial release of policy" },
    { revisionNo: "1.0", date: "01/01/2025", description: "Policy updated to strengthen compliance controls, risk management systems, and reporting structure" },
    { revisionNo: "2.0", date: "01/01/2026", description: "Policy revised to enhance monitoring mechanisms, performance tracking, and continuous improvement approach" },
  ], "2023-01-01", "2025-01-01");

  assert.deepEqual(entries.map(({ description }) => description), ["Initial release of policy", "", ""]);
});

test("suggests the next minor number and keeps inserted rows anchored after their schedule row", () => {
  const entries = resolveRevisionHistory(undefined, "2023-01-01", "2025-01-01");
  const withInterim = [...entries.slice(0, 2), {
    revisionNo: "1.1",
    date: "",
    description: "",
    source: "custom" as const,
    scheduleAnchor: 1,
  }, ...entries.slice(2)];

  assert.equal(suggestMinorRevisionNumber(withInterim, 2), "1.2");
  assert.equal(scheduleAnchorAfter(withInterim, 2), 1);
});

test("document render model uses the same date-linked entries as the builder", () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.company.effectiveDate = "2023-01-01";
  policy.company.lastReviewDate = "2025-01-01";
  policy.revisionHistory = undefined;

  const section = buildDocumentRenderModel(policy).sections.find((item) => item.kind === "revision");
  assert.ok(section && section.content.type === "revision");
  assert.deepEqual(section.content.entries.map(({ revisionNo, date }) => [revisionNo, date]), [
    ["0.0", "01-01-2023"],
    ["1.0", "01-01-2024"],
    ["2.0", "01-01-2025"],
  ]);
});
