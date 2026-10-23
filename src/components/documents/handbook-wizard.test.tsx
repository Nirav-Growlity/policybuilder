import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HANDBOOK_CATALOG, recommendChapters } from "@/lib/handbook/catalog";
import { createEmptyHandbookFacts } from "@/lib/handbook/initial-handbook";
import { ChooseChaptersStep } from "./new-handbook/choose-chapters-step";
import { HandbookFactsPanel } from "./new-handbook/handbook-facts-panel";
import { DOCUMENT_TYPES } from "./document-type-chooser";
import { Toaster } from "@/components/ui/toast";
import { ManualDetailsPanel } from "./new-manual/details-step";
import { createEmptySopCompany } from "@/lib/sop/initial-manual";
import type { SopManualControl } from "@/lib/sop/types";

const noop = () => undefined;

function chapterStep(overrides: Partial<React.ComponentProps<typeof ChooseChaptersStep>> = {}) {
  return renderToStaticMarkup(React.createElement(ChooseChaptersStep, {
    catalog: HANDBOOK_CATALOG,
    industryLabel: "textiles",
    start: "recommended",
    onStart: noop,
    selected: new Set(HANDBOOK_CATALOG.slice(0, 12).map((topic) => topic.id)),
    onToggle: noop,
    onSetGroup: noop,
    custom: [],
    onCustomChange: noop,
    creating: false,
    onBack: noop,
    onLook: noop,
    onCreate: noop,
    ...overrides,
  }));
}

test("choosing chapters offers the two starts, the part groups and the running total", () => {
  const markup = chapterStep();
  assert.match(markup, /Recommended for textiles/);
  assert.match(markup, /Start from scratch/);
  assert.doesNotMatch(markup, /Import/);
  assert.match(markup, />Working Here</);
  assert.match(markup, />Conduct and Ethics</);
  assert.match(markup, /Add custom chapter/);
  assert.match(markup, /12 chapters selected · ~38 pages · ready in about a minute/);
  assert.match(markup, /Look &amp;\s*cover/);
  assert.match(markup, />Create handbook</);
  assert.doesNotMatch(markup, /coming soon/i);
});

test("the recommended chapters the wizard ticks by default come from the catalog", () => {
  const recommended = recommendChapters(createEmptySopCompany());
  assert.ok(recommended.length > 0);
  assert.ok(recommended.every((topic) => HANDBOOK_CATALOG.includes(topic)));
});

test("with nothing chosen the footer says so and the buttons are disabled", () => {
  const markup = chapterStep({ start: "scratch", selected: new Set() });
  assert.match(markup, /No chapters selected/);
  assert.match(markup, /disabled=""[^>]*>Create handbook/);
});

test("the employment terms panel renders its fields", () => {
  const markup = renderToStaticMarkup(React.createElement(Toaster, null, React.createElement(HandbookFactsPanel, {
    facts: createEmptyHandbookFacts(),
    onChange: noop,
  })));
  assert.match(markup, /Employment terms/);
  assert.match(markup, /Optional/);
  for (const label of ["Working hours and shifts", "Weekly off", "Probation period", "Notice period", "Pay day", "Leave entitlements"]) {
    assert.match(markup, new RegExp(label));
  }
  assert.match(markup, /Add leave type/);
});

test("the handbook's details panel names the handbook in its approver message", () => {
  const control: SopManualControl = { docNo: "", revision: "01", supersedes: "", effectiveDate: "", reviewFrequency: "Yearly", nextReviewDate: "", preparedBy: "", reviewedBy: "", approvedBy: "", classification: "Internal" };
  const markup = renderToStaticMarkup(React.createElement(Toaster, null, React.createElement(ManualDetailsPanel, {
    control,
    onChange: noop,
    showErrors: true,
    titlePlaceholder: "Employee Handbook",
    documentNoun: "handbook",
  })));
  assert.match(markup, /Handbook details/);
  assert.match(markup, /Enter who approves the handbook\./);
  assert.match(markup, /placeholder="Employee Handbook"/);
});

test("the new document chooser offers the employee handbook as available", () => {
  const handbook = DOCUMENT_TYPES.find((type) => type.id === "handbook");
  assert.ok(handbook, "the chooser lists a handbook type");
  assert.equal(handbook.available, true);
  assert.equal(handbook.title, "Employee handbook");
  assert.equal(handbook.meta, "Ready in about a minute");
  assert.ok(DOCUMENT_TYPES.every((type) => type.available), "no type is marked coming soon");
});
