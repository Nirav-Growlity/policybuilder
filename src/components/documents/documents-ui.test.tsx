import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Toaster } from "@/components/ui/toast";
import { SOP_CATALOG } from "@/lib/sop/catalog";
import { createEmptyManual, createEmptySop } from "@/lib/sop/initial-manual";
import { useSopBuilder } from "@/lib/sop/store";
import type { StoredSopManual } from "@/lib/sop/client-api";
import { ChooseSopsStep } from "./new-manual/choose-sops-step";
import { SopTemplatePicker } from "./design/sop-design-controls";
import { SopBuilderContext, type SopBuilderActions } from "./builder/builder-context";
import { SopWriter } from "./builder/sop-writer";
import { ReviewMode } from "./builder/review-mode";
import { ProgressPill } from "./builder/progress-pill";

const noop = () => undefined;

// Server rendering reads a zustand store's initial state object; copy the live state into it before rendering.
const syncServerSnapshot = () => Object.assign(useSopBuilder.getInitialState(), useSopBuilder.getState());

function chooseStep(overrides: Partial<React.ComponentProps<typeof ChooseSopsStep>> = {}) {
  return renderToStaticMarkup(React.createElement(ChooseSopsStep, {
    catalog: SOP_CATALOG,
    industryLabel: "Textiles",
    start: "recommended",
    onStart: noop,
    selected: new Set(SOP_CATALOG.slice(0, 14).map((topic) => topic.id)),
    onToggle: noop,
    onSetGroup: noop,
    custom: [],
    onCustomChange: noop,
    importState: { status: "available", file: null },
    onImportFile: noop,
    creating: false,
    onBack: noop,
    onLook: noop,
    onCreate: noop,
    ...overrides,
  }));
}

test("choosing SOPs offers the three starts, the grouped catalog and the running total", () => {
  const markup = chooseStep();
  assert.match(markup, /Recommended for Textiles/);
  assert.match(markup, /Import my existing SOP manual/);
  assert.match(markup, /Start from scratch/);
  assert.match(markup, /14 SOPs selected · ~95 pages · ready in about a minute/);
  assert.match(markup, />Environmental</);
  assert.match(markup, /By department/);
  assert.match(markup, /Add custom SOP/);
  assert.match(markup, /Create manual/);
  assert.doesNotMatch(markup, /coming soon/i);
});

test("import shows a friendly coming-soon state when the route is not there yet", () => {
  const markup = chooseStep({ start: "import", importState: { status: "unavailable" }, selected: new Set() });
  assert.match(markup, /Importing \.docx manuals is coming soon/);
  assert.match(markup, /No SOPs selected/);
  assert.match(markup, /disabled=""[^>]*>Look &amp; cover/);
});

test("the template picker shows all five SOP templates and marks the one in use", () => {
  const markup = renderToStaticMarkup(React.createElement(SopTemplatePicker, { value: "esg-pillars", onChange: noop, layout: "grid" }));
  for (const name of ["Controlled Manual", "ESG Pillars", "SOP Cards", "Compact Register", "Modern Banner"]) assert.match(markup, new RegExp(name));
  assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(markup, /\/sop-templates\/esg-pillars\/cover\.webp/);
  assert.match(markup, /In use/);
});

const actions: SopBuilderActions = {
  orgId: 11,
  manualId: "manual-1",
  workspaceHref: "/documents?orgId=11",
  generate: noop,
  retry: noop,
  cancelGeneration: noop,
  flush: async () => undefined,
  openDetails: noop,
  setMode: noop,
};

function loadManual(sops = [createEmptySop({ title: "Waste Segregation", pillar: "E", department: "EHS", owner: "EHS Manager", code: "MT-EHS-001" }), createEmptySop({ title: "Grievance Handling", pillar: "S", department: "HR", code: "MT-HR-001" })]) {
  const manual = createEmptyManual({ sops });
  const stored = { id: "manual-1", kind: "sop", title: "Meridian SOP Manual", currentStage: "write", lockVersion: 3, createdAt: "", updatedAt: "", archivedAt: null, pageCount: null, partCount: sops.length, templateId: null, manual, importedContext: null } as StoredSopManual;
  useSopBuilder.getState().load(stored, 11);
  return manual;
}

const inBuilder = (element: React.ReactElement) => syncServerSnapshot() && renderToStaticMarkup(React.createElement(Toaster, null, React.createElement(SopBuilderContext.Provider, { value: actions }, element)));

test("an empty SOP opens on its header facts, every section and a one-click Write this SOP", () => {
  const manual = loadManual();
  const markup = inBuilder(React.createElement(SopWriter, { sop: manual.sops[0] }));
  assert.match(markup, /value="Waste Segregation"/);
  assert.match(markup, /value="MT-EHS-001"/);
  assert.match(markup, /Write this SOP/);
  for (const heading of ["Purpose", "Roles &amp; Responsibilities", "Procedure", "Monitoring &amp; KPIs", "Records"]) assert.match(markup, new RegExp(`value="${heading}"`));
  assert.match(markup, /Appendix<span[^>]*>Not in the document/);
  assert.match(markup, /Add step/);
  assert.match(markup, /Add KPI/);
});

test("narrative text and tables are edited in place, in block order, with an Add table action", () => {
  const sop = createEmptySop({ title: "Waste Segregation", pillar: "E", department: "EHS", owner: "EHS Manager", code: "MT-EHS-001" });
  const table = { id: "tbl", type: "table" as const, text: "", columns: ["Site", ""], rows: [["Unit 1", "Dyeing"]] };
  sop.sections = sop.sections.map((section) => {
    if (section.kind === "scope") return { ...section, blocks: [{ id: "p1", type: "paragraph" as const, text: "BEFORE TEXT" }, table, { id: "p2", type: "paragraph" as const, text: "AFTER TEXT" }] };
    if (section.kind === "procedure") return { ...section, steps: [{ id: "s1", heading: "Segregate", body: [table], responsible: "Supervisor" }] };
    return section;
  });
  const manual = loadManual([sop]);
  const markup = inBuilder(React.createElement(SopWriter, { sop: manual.sops[0] }));
  const before = markup.indexOf(">BEFORE TEXT</textarea>");
  const grid = markup.indexOf('aria-label="Table 1 in Scope"');
  const after = markup.indexOf(">AFTER TEXT</textarea>");
  assert.ok(before > 0 && grid > before && after > grid, "text, table, text in stored order");
  assert.match(markup, /placeholder="Column 1" aria-label="Table 1 in Scope, column 1 heading" value="Site"/);
  assert.match(markup, /placeholder="Column 2" aria-label="Table 1 in Scope, column 2 heading" value=""/);
  assert.match(markup, /aria-label="Table 1 in Scope, Column 2, row 1"[^>]*>Dyeing<\/textarea>/);
  assert.match(markup, /aria-label="Table 1 in Scope, remove row 1"/);
  assert.match(markup, />Add row</);
  assert.match(markup, />Add column</);
  assert.match(markup, /aria-label="Add table to Scope"/);
  // The step's table stands alone, so it offers text above and below; the scope table already has text on both sides.
  assert.match(markup, /aria-label="Table 1 in Step 1 description"/);
  assert.equal((markup.match(/>Text above</g) ?? []).length, 1);
  assert.equal((markup.match(/>Text below</g) ?? []).length, 1);
  assert.match(markup, /aria-label="Add table to step 1"/);
});

test("a failed generation says so and offers Retry", () => {
  const manual = loadManual();
  useSopBuilder.getState().setGeneration({ sopId: manual.sops[0].id, status: "failed", error: "SOP AI is not wired up yet." });
  const markup = inBuilder(React.createElement(SopWriter, { sop: manual.sops[0] }));
  assert.match(markup, /AI writing is not available yet/);
  assert.match(markup, />Retry</);
  const pill = inBuilder(React.createElement(ProgressPill));
  assert.match(pill, /0 of 2 written/);
  assert.match(pill, /data-tone="error"/);
});

test("review lists what is left with a Fix action for each open check", () => {
  loadManual();
  const markup = inBuilder(React.createElement(ReviewMode));
  assert.match(markup, /things to check/);
  assert.match(markup, /Company and approver/);
  assert.match(markup, /2 SOPs still to write/);
  assert.match(markup, /Placeholders to fill/);
  assert.ok((markup.match(/>Fix</g) ?? []).length >= 3);
});

test("deleting an SOP moves the selection on and Undo puts it back in place", () => {
  const manual = loadManual();
  const store = useSopBuilder.getState();
  store.select({ kind: "sop", sopId: manual.sops[0].id });
  const removed = store.removeSop(manual.sops[0].id)!;
  assert.equal(useSopBuilder.getState().manual!.sops.length, 1);
  assert.deepEqual(useSopBuilder.getState().selection, { kind: "sop", sopId: manual.sops[1].id });
  useSopBuilder.getState().restoreSop(removed);
  assert.deepEqual(useSopBuilder.getState().manual!.sops.map((sop) => sop.id), manual.sops.map((sop) => sop.id));
  useSopBuilder.getState().restoreSop(removed);
  assert.equal(useSopBuilder.getState().manual!.sops.length, 2, "restoring twice does not duplicate");
});
