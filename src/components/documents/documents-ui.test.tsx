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
import { ManualDetailsPanel } from "./new-manual/details-step";
import { SopTemplatePicker } from "./design/sop-design-controls";
import { SopBuilderContext, type SopBuilderActions } from "./builder/builder-context";
import { SopWriter } from "./builder/sop-writer";
import { SectionBody } from "./builder/section-editors";
import { ReviewMode } from "./builder/review-mode";
import { ProgressPill } from "./builder/progress-pill";
import { FrontMatterWriter } from "./builder/manual-part-writers";
import { CompanyFactsPanel } from "./new-manual/company-facts-panel";

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

test("the template picker shows all seven SOP templates and marks the one in use", () => {
  const markup = renderToStaticMarkup(React.createElement(SopTemplatePicker, { value: "esg-pillars", onChange: noop, layout: "grid" }));
  for (const name of ["Controlled Manual", "ESG Pillars", "SOP Cards", "Compact Register", "Modern Banner", "Shop Floor", "Chapter Book"]) assert.match(markup, new RegExp(name));
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
  // Compliance is written by default; introduction and corrective action wait to be included.
  assert.match(markup, /value="Legal &amp; Regulatory Compliance"/);
  assert.match(markup, /Introduction<span[^>]*>Not in the document/);
  assert.match(markup, /Non-compliance &amp; Corrective Action<span[^>]*>Not in the document/);
  assert.match(markup, />Add appendix</);
});

test("the records table asks for an optional form or record number first", () => {
  const sop = createEmptySop({ title: "Waste" });
  const records = sop.sections.find((section) => section.kind === "records")!;
  const markup = inBuilder(React.createElement(SectionBody, {
    section: { ...records, rows: [{ record: "Waste manifest", owner: "EHS", retention: "5 years", format: "Paper" }] } as typeof records,
    onChange: noop,
    sectionNumber: 8,
  }));
  assert.match(markup, /<th scope="col">Form \/ record no\.<\/th><th scope="col">Record<\/th>/);
  assert.match(markup, /aria-label="Form \/ record no\., row 1" placeholder="Optional"/);
});

test("an SOP saved before the newer section kinds opens with them listed as left out, ready to include", () => {
  const sop = createEmptySop({ title: "Energy", pillar: "E", department: "Utilities", code: "MT-UTL-001" });
  sop.sections = sop.sections.filter((section) => !["introduction", "compliance", "corrective"].includes(section.kind));
  loadManual([sop]);
  const opened = useSopBuilder.getState().manual!.sops[0];
  const markup = inBuilder(React.createElement(SopWriter, { sop: opened }));
  for (const title of ["Introduction", "Legal &amp; Regulatory Compliance", "Non-compliance &amp; Corrective Action"]) {
    assert.match(markup, new RegExp(`${title}<span[^>]*>Not in the document</span></span><button[^>]*>Include<`));
  }
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

test("manual details ask for the title, subtitle, supersedes, issue and last review dates", () => {
  const control = { ...createEmptyManual().control, title: "ESG SOP Manual", supersedes: "Rev 00", issueDate: "2026-10-28", lastReviewDate: "2026-10-20" };
  const html = renderToStaticMarkup(React.createElement(ManualDetailsPanel, { control, onChange: noop, showErrors: false }));
  for (const label of ["Manual title", "Subtitle", "Supersedes", "Issue date", "Last review date"]) assert.ok(html.includes(label), label);
  assert.match(html, /value="ESG SOP Manual"/);
  assert.match(html, /placeholder="SOP Manual"/);
  assert.match(html, /value="Rev 00"/);
});

test("the facts panel offers the profile, certifications, laws and a contacts table", () => {
  const facts = { profile: "Founded in 1998.", certifications: ["ISO 14001:2015", "SA8000:2014"], regulations: ["Factories Act, 1948"], contacts: [{ purpose: "Grievance", name: "HR Manager", phone: "", email: "grievance@meridian.in" }] };
  const markup = renderToStaticMarkup(React.createElement(Toaster, null, React.createElement(CompanyFactsPanel, { facts, onChange: noop })));
  assert.match(markup, /Facts for writing/);
  assert.match(markup, /Optional/);
  assert.match(markup, />Founded in 1998\.</);
  assert.match(markup, />ISO 14001:2015\nSA8000:2014</);
  assert.match(markup, />Factories Act, 1948</);
  assert.match(markup, />grievance@meridian\.in</);
  assert.match(markup, /Add contact/);
  const empty = renderToStaticMarkup(React.createElement(Toaster, null, React.createElement(CompanyFactsPanel, { facts: { profile: "", certifications: [], regulations: [], contacts: [] }, onChange: noop })));
  assert.match(empty, /No contacts yet\. Add who handles ethics, grievances and emergencies\./);
});

test("the front matter shows the contacts and certifications it will print, with a way to edit them", () => {
  loadManual();
  const markup = inBuilder(React.createElement(FrontMatterWriter));
  assert.match(markup, /No contacts or certifications yet/);
  useSopBuilder.getState().setManual((manual) => ({ ...manual, facts: { profile: "", certifications: ["ISO 14001:2015"], regulations: [], contacts: [{ purpose: "Grievance", name: "HR Manager", phone: "", email: "grievance@meridian.in" }] } }));
  const filled = inBuilder(React.createElement(FrontMatterWriter));
  assert.match(filled, /Contacts and certifications/);
  assert.match(filled, /<strong>Grievance<\/strong><span>HR Manager · grievance@meridian\.in<\/span>/);
  assert.match(filled, /<strong>Certifications<\/strong><span>ISO 14001:2015<\/span>/);
  assert.match(filled, /Edit facts/);
});
