import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { initialPolicy } from "../initial-policy";
import { getCompanyFocusAreaCatalog, initializeFocusAreaCatalogFromDefaults, visibleQualitativeEntries, visibleQuantitativeAreas, withFocusAreaCatalogSelection } from "../focus-area-catalog";
import { revertPatch, sameDraftIdentity, touchedFieldsSnapshot } from "./load-guard";
import { normalizePolicyQuantitative } from "../quantitative";
import { normalizePolicyRevisionHistory } from "../revision-history";
import { normalizePolicyStructure } from "../sections";
import type { Policy, PolicyType } from "../types";
import { importedPolicyToPolicy, summarizeImport } from "./import-to-policy";
import { parseDocxBuffer, parseImportedPolicyHtml } from "./parse";

const parse = (html: string, policyType: PolicyType = "environmental", fileName = "policy.docx") =>
  parseImportedPolicyHtml(html, { fileName, policyType, importedAt: "2026-11-21T00:00:00.000Z" });

/** What the store does to a patch: merge, then normalise structure, targets and revision rows. */
function applyLikeStore(current: Policy, patch: Partial<Policy>): Policy {
  return normalizePolicyRevisionHistory(normalizePolicyStructure(normalizePolicyQuantitative(initializeFocusAreaCatalogFromDefaults({ ...current, ...patch }))));
}

const FULL_POLICY = `
  <h1>Acme Environmental Policy</h1>
  <p>Acme Manufacturing Pvt. Ltd.</p>
  <p>Document No. ACME-ENV-001</p>
  <table><tbody>
    <tr><th>Revision No.</th><th>Effective Date</th><th>Reason for revision</th></tr>
    <tr><td>00</td><td>01/02/2025</td><td>First issue</td></tr>
    <tr><td>01</td><td>01/11/2025</td><td>Targets added</td></tr>
  </tbody></table>
  <p>Contents</p>
  <h2>Preface 2</h2><h2>Scope 3</h2><h2>Key Focus Areas 4</h2>
  <h1>Preface</h1><p>Acme is committed to protecting the environment around every plant it runs.</p>
  <h1>Policy Declaration</h1><p>Acme declares that it will prevent pollution.</p>
  <h1>Scope</h1><p>This policy applies to all sites.</p><ul><li>Employees</li><li>Contractors</li></ul>
  <h1>Key Focus Areas</h1>
  <ol><li>Energy &amp; Emissions – Cut energy use across plants.</li><li>Water Stewardship – Use less water.</li></ol>
  <h1>Qualitative Objectives</h1>
  <h2>Energy and Emissions</h2><ul><li>Install LED lighting.</li><li>Audit energy use yearly.</li></ul>
  <h2>Water usage monitoring</h2><ul><li>Meter every outlet.</li></ul>
  <h1>Quantitative Targets</h1>
  <p>The baseline year for all targets is FY 2022–23.</p>
  <table><tbody>
    <tr><th>Focus Area</th><th>Target</th><th>Baseline Year</th><th>Target Year</th></tr>
    <tr><td>Energy &amp; Emissions</td><td>Cut energy use by 10%</td><td>2022</td><td>2045</td></tr>
    <tr><td>Reduce Scope 2 emissions by 20%</td><td>2022</td><td>2045</td></tr>
    <tr><td>Water Stewardship</td><td>Cut water use by 15%</td><td>2022</td><td>2045</td></tr>
  </tbody></table>
  <h1>SDG Alignment</h1><p>Goal 6: Clean Water, SDG 7 and 13.</p>
  <h1>Roles and Responsibilities</h1><ul><li>EHS Manager: Runs the programme.</li><li>Board – Approves the policy.</li></ul>
  <h1>Monitoring and Reporting</h1><p>Quarterly dashboards.</p>
  <h1>Review Mechanism</h1><p>Reviewed yearly.</p><p>Approved By:</p><p>Jane Doe</p>
  <h1>Appendix A: Chemical Register</h1><p>Chemicals are listed below.</p><ol><li>Acetone</li><li>Ethanol</li></ol>
  <table><tbody><tr><th>Chemical</th><th>Site</th></tr><tr><td>Acetone</td><td>Plant 1</td></tr></tbody></table>
  <h1>Employee Acknowledgment Form</h1><p>I acknowledge that I have read this policy.</p>`;

test("rebuilds nesting from heading levels so a subsection does not become its own section", () => {
  const { patch, report } = importedPolicyToPolicy(parse(FULL_POLICY), initialPolicy("environmental"));

  // "Water usage monitoring" sits under Qualitative Objectives: it is an area, not the monitoring section.
  assert.equal(patch.monitoring, "Quarterly dashboards.");
  assert.deepEqual(patch.qualitative?.["Water usage monitoring"], ["Meter every outlet."]);
  assert.ok(patch.focusAreas?.includes("Water usage monitoring"));
  assert.equal(report.filled.filter((kind) => kind === "monitoring").length, 1);
});

test("leaves the title page and contents out of the preface", () => {
  const { patch } = importedPolicyToPolicy(parse(FULL_POLICY), initialPolicy("environmental"));
  assert.equal(patch.declaration?.preface, "Acme is committed to protecting the environment around every plant it runs.");
  assert.doesNotMatch(JSON.stringify(patch.declaration), /ACME-ENV-001|Acme Manufacturing Pvt/);
  assert.equal(patch.company?.docNum, "ACME-ENV-001", "the document number is read as metadata, not as policy text");
});

test("takes the preface from opening prose only when there is no Preface heading", () => {
  const opening = "Acme Manufacturing is dedicated to responsible operations across every site, with care for people, communities, ecosystems and the wider environment we share.";
  const noPreface = parse(`<h1>Acme Policy</h1><p>Document No. 7</p><p>${opening}</p><h1>Scope</h1><p>All sites.</p>`);
  const filled = importedPolicyToPolicy(noPreface, initialPolicy("environmental"));
  assert.equal(filled.patch.declaration?.preface, opening);
  assert.match(filled.report.notes.join(" "), /opening text/);

  const withPreface = importedPolicyToPolicy(parse(`<h1>Acme Policy</h1><p>${opening}</p><h1>Preface</h1><p>Real preface.</p>`), initialPolicy("environmental"));
  assert.equal(withPreface.patch.declaration?.preface, "Real preface.");
});

test("maps text sections, rendering lists as lines", () => {
  const { patch, report } = importedPolicyToPolicy(parse(FULL_POLICY), initialPolicy("environmental"));
  assert.equal(patch.declaration?.declaration, "Acme declares that it will prevent pollution.");
  assert.equal(patch.declaration?.scope, "This policy applies to all sites.\n\n- Employees\n- Contractors");
  assert.equal(patch.reviewMechanism, "Reviewed yearly.", "text after Approved By is the signature block");
  assert.deepEqual(report.skipped, ["Employee acknowledgement form"]);
});

test("maps definitions", () => {
  const { patch, report } = importedPolicyToPolicy(parse(`<h1>Definitions</h1><p>Scope 1: direct emissions.</p>`), initialPolicy("environmental"));
  assert.deepEqual(patch.definitions, { title: "Definitions", content: "Scope 1: direct emissions." });
  assert.ok(report.filled.includes("definitions"));
  assert.ok(patch.sections?.some((section) => section.kind === "definitions" && section.enabled));
});

test("maps focus areas, objectives and targets with matching area names", () => {
  const { patch } = importedPolicyToPolicy(parse(FULL_POLICY), initialPolicy("environmental"));
  assert.deepEqual(patch.focusAreas?.slice(0, 2), ["Energy & Emissions", "Water Stewardship"]);
  assert.deepEqual(patch.focusAreaSelection?.mode, "custom");
  // "Energy and Emissions" resolves to the focus area spelled "Energy & Emissions".
  assert.deepEqual(patch.qualitative?.["Energy & Emissions"], ["Install LED lighting.", "Audit energy use yearly."]);

  const areas = patch.quantitative?.map((area) => area.area) ?? [];
  for (const area of areas) assert.ok(patch.focusAreas?.includes(area), `${area} is a focus area`);
  const energy = patch.quantitative?.find((area) => area.area === "Energy & Emissions");
  assert.equal(energy?.targets.length, 2, "the row without a first cell belongs to the merged area above it");
  assert.equal(energy?.targets[1].target, "Reduce Scope 2 emissions by 20%");
  assert.equal(energy?.targets[0].baseline, "FY 2022-23");
  assert.equal(energy?.targets[0].deadline, "FY 2044-45");
  assert.equal(patch.quantitative?.find((area) => area.area === "Water Stewardship")?.targets.length, 1);
});

test("reads baseline and deadline years out of target sentences and lists", () => {
  const html = `<h1>Key Focus Areas</h1><ul><li>Waste</li></ul>
    <h1>Quantitative Targets</h1><p>The baseline year is FY 2021-22.</p>
    <ul><li>Waste</li></ul>
    <ul><li>Reduce landfill waste by 30% by FY 2040-41.</li><li>Train 100% of staff every year.</li><li>Cut waste 10% from FY 2023-24 baseline by 2042.</li></ul>`;
  const { patch } = importedPolicyToPolicy(parse(html), initialPolicy("environmental"));
  const [first, annual, third] = patch.quantitative?.find((area) => area.area === "Waste")?.targets ?? [];
  assert.equal(first.baseline, "FY 2021-22");
  assert.equal(first.deadline, "FY 2040-41");
  assert.equal(first.reportingFrequency, "Target period");
  assert.equal(annual.reportingFrequency, "Annually");
  assert.equal(third.baseline, "FY 2023-24");
  assert.equal(third.deadline, "FY 2041-42");
});

test("reads SDG numbers from numbers and goal names", () => {
  const byNumber = importedPolicyToPolicy(parse(FULL_POLICY), initialPolicy("environmental"));
  assert.deepEqual(byNumber.patch.sdgs, [6, 7, 13]);

  const byName = importedPolicyToPolicy(parse(`<h1>SDGs</h1><ul><li>Climate Action</li><li>Life on Land</li><li>Responsible Consumption and Production</li></ul>`), initialPolicy("environmental"));
  assert.deepEqual(byName.patch.sdgs, [12, 13, 15]);

  const table = importedPolicyToPolicy(parse(`<h1>SDG Alignment</h1><table><tbody><tr><th>SDG</th><th>Link</th></tr><tr><td>8</td><td>Decent work</td></tr><tr><td>10</td><td>Equality</td></tr></tbody></table>`), initialPolicy("environmental"));
  assert.deepEqual(table.patch.sdgs, [8, 10]);
});

test("keeps the SDG section on with no goals when the section has no readable goals", () => {
  const { patch, report } = importedPolicyToPolicy(parse(`<h1>SDG Alignment</h1><p>Our goals support the SDGs shown below.</p>`), initialPolicy("environmental"));
  assert.deepEqual(patch.sdgs, []);
  assert.equal(report.custom.length, 0);
  assert.ok(report.filled.includes("sdg"));
  assert.equal(patch.sections?.find((section) => section.kind === "sdg")?.enabled, true, "the sidebar step stays visible");
  assert.match(report.notes.join(" "), /pick them in the SDG step/);
  assert.match(summarizeImport(report), /SDG goals are pictures; pick them in the SDG step\./);
});

test("an SDG section that is only a picture keeps the step on", () => {
  const reference = parse(`<h1>Scope</h1><p>All sites.</p><h1>SDG Alignment</h1><p><img src="docx-image:0" alt=""></p>`);
  const section = reference.sections.find((entry) => entry.kind === "sdg");
  assert.deepEqual(section?.imageAlts, [""], "the picture is tracked on its section");
  const { patch, report } = importedPolicyToPolicy(reference, initialPolicy("environmental"));
  assert.deepEqual(patch.sdgs, []);
  assert.equal(patch.sections?.find((entry) => entry.kind === "sdg")?.enabled, true);
  assert.deepEqual(report.custom, []);
});

test("a document with no SDG section leaves the SDG step off", () => {
  const { patch } = importedPolicyToPolicy(parse(`<h1>Scope</h1><p>All sites.</p>`), initialPolicy("environmental"));
  assert.equal(patch.sections?.find((entry) => entry.kind === "sdg")?.enabled, false);
});

test("maps responsibilities from tables and from role lines", () => {
  const fromLines = importedPolicyToPolicy(parse(FULL_POLICY), initialPolicy("environmental"));
  assert.deepEqual(fromLines.patch.responsibilities, [
    { role: "EHS Manager", duty: "Runs the programme." },
    { role: "Board", duty: "Approves the policy." },
  ]);

  const table = importedPolicyToPolicy(parse(`<h1>Responsibilities</h1><table><tbody><tr><th>Sr. No.</th><th>Designation</th><th>Key Responsibilities</th></tr><tr><td>1</td><td>CEO</td><td>Owns the policy</td></tr><tr><td>2</td><td>Plant head</td><td>Runs controls</td></tr></tbody></table>`), initialPolicy("environmental"));
  assert.deepEqual(table.patch.responsibilities, [
    { role: "CEO", duty: "Owns the policy" },
    { role: "Plant head", duty: "Runs controls" },
  ]);
});

test("maps a revision table to custom revision rows that survive normalisation", () => {
  const current = initialPolicy("environmental");
  const { patch } = importedPolicyToPolicy(parse(FULL_POLICY), current);
  // The document has no effective date, so no scheduled starter row is kept: only what the document lists.
  assert.deepEqual(patch.revisionHistory?.filter((row) => row.source === "custom").map((row) => [row.revisionNo, row.date, row.description]), [
    ["00", "01/02/2025", "First issue"],
    ["01", "01/11/2025", "Targets added"],
  ]);
  assert.equal(patch.showRevisionHistory, true);
  const applied = applyLikeStore(current, patch);
  assert.equal(applied.revisionHistory?.filter((row) => row.source === "custom").length, 2);
  assert.ok(!applied.revisionHistory?.some((row) => row.description === "Initial release of policy"), "no starter revision text is added");
});

test("a document without revisions hides the revision section", () => {
  const { patch } = importedPolicyToPolicy(parse(`<h1>Scope</h1><p>All sites.</p>`), initialPolicy("environmental"));
  assert.equal(patch.showRevisionHistory, false);
  assert.ok(!patch.revisionHistory?.some((row) => row.source === "custom"));
});

test("an imported revision row does not repeat a dated row with the same revision number", () => {
  const current = normalizePolicyRevisionHistory({ ...initialPolicy("environmental"), company: { ...initialPolicy("environmental").company, effectiveDate: "2025-02-01", lastReviewDate: "2026-02-01", reviewFrequency: "Yearly" } });
  assert.deepEqual(current.revisionHistory?.map((row) => row.revisionNo), ["0.0", "1.0"]);

  const html = `<h1>Revision History</h1><table><tbody>
    <tr><th>Version</th><th>Date of Change</th><th>Description of Change</th></tr>
    <tr><td>1.0</td><td>01/02/2026</td><td>Annual review</td></tr>
    <tr><td>1.1</td><td>01/05/2026</td><td>Typo fixed</td></tr>
  </tbody></table>`;
  const { patch, report } = importedPolicyToPolicy(parse(html), current);
  assert.equal(report.counts.revisions, 2);
  const applied = applyLikeStore(current, patch);
  const numbers = applied.revisionHistory?.map((row) => row.revisionNo) ?? [];
  assert.deepEqual(numbers, ["0.0", "1.0", "1.1"], "no revision number appears twice");
  assert.equal(applied.revisionHistory?.find((row) => row.revisionNo === "1.0")?.description, "Annual review");
  assert.equal(applied.revisionHistory?.find((row) => row.revisionNo === "1.1")?.source, "custom");
  assert.match(report.notes.join(" "), /matched a dated row/);

  // Loading the same table again does not stack more rows.
  const again = applyLikeStore(applied, importedPolicyToPolicy(parse(html), applied).patch);
  assert.deepEqual(again.revisionHistory?.map((row) => row.revisionNo), ["0.0", "1.0", "1.1"]);
});

test("revision table columns each take one role, with dates read before descriptions", () => {
  const read = (header: string[]) => importedPolicyToPolicy(parse(`<h1>Revision History</h1><table><tbody><tr>${header.map((cell) => `<th>${cell}</th>`).join("")}</tr><tr><td>7.3</td><td>03/04/2025</td><td>Wording fixed</td></tr></tbody></table>`), initialPolicy("environmental")).patch.revisionHistory?.find((row) => row.source === "custom");
  // "Date of Change" matches both the date and the description words; it is the date.
  assert.deepEqual(read(["Version", "Date of Change", "Description of Change"]), { revisionNo: "7.3", date: "03/04/2025", description: "Wording fixed", source: "custom" });
  // "Revision Date" is the date, not the number, and "Reason for revision" is the description, not the number.
  assert.deepEqual(read(["Revision No.", "Revision Date", "Reason for revision"]), { revisionNo: "7.3", date: "03/04/2025", description: "Wording fixed", source: "custom" });
  // A table with a date column but nothing to be the description is not a revision table.
  const noDescription = importedPolicyToPolicy(parse(`<h1>Revision History</h1><table><tbody><tr><th>Version</th><th>Date of Change</th></tr><tr><td>1</td><td>01/01/2025</td></tr></tbody></table>`), initialPolicy("environmental")).patch;
  assert.ok(!noDescription.revisionHistory?.some((row) => row.source === "custom"));
  assert.equal(noDescription.showRevisionHistory, false);
});

test("turns unmatched sections into custom sections in document order", () => {
  const current = initialPolicy("environmental");
  const { patch, report } = importedPolicyToPolicy(parse(FULL_POLICY), current);
  assert.deepEqual(report.custom, ["Appendix A: Chemical Register"]);
  const custom = patch.sections?.find((section) => section.kind === "custom");
  assert.equal(custom?.enabled, true);
  assert.deepEqual(custom?.blocks?.map((block) => block.type), ["paragraph", "numbered", "table"]);
  assert.equal(custom?.blocks?.[1].text, "Acetone\nEthanol");
  assert.deepEqual(custom?.blocks?.[2].columns, ["Chemical", "Site"]);
  assert.deepEqual(custom?.blocks?.[2].rows, [["Acetone", "Plant 1"]]);

  const kinds = patch.sections?.map((section) => section.kind) ?? [];
  assert.ok(kinds.indexOf("custom") > kinds.indexOf("review"), "the appendix follows the review section, as in the document");
  assert.ok(kinds.indexOf("scope") > kinds.indexOf("declaration"));
  assert.ok(new Set(patch.sections?.map((section) => section.id)).size === patch.sections?.length, "section ids are unique");
});

test("a section that cannot be parsed into its fields is kept as a custom section", () => {
  const { patch, report } = importedPolicyToPolicy(parse(`<h1>Roles and Responsibilities</h1><p>Everyone shares the duty to look after the environment.</p>`), initialPolicy("environmental"));
  assert.deepEqual(patch.responsibilities, [], "nothing from the template is left behind");
  assert.deepEqual(report.custom, ["Roles and Responsibilities"]);
});

test("a load replaces the policy: fields the document lacks are emptied and its missing sections are off", () => {
  const current = initialPolicy("environmental");
  const { patch, report } = importedPolicyToPolicy(parse(`<h1>Monitoring and Reporting</h1><p>Monthly checks.</p>`), current);

  assert.equal(patch.monitoring, "Monthly checks.");
  assert.deepEqual(report.filled, ["monitoring"]);
  assert.deepEqual(patch.sections?.filter((section) => section.enabled).map((section) => section.kind), ["monitoring"]);
  assert.deepEqual(patch.focusAreas, []);
  assert.deepEqual(patch.qualitative, {});
  assert.deepEqual(patch.quantitative, []);
  assert.deepEqual(patch.responsibilities, []);
  assert.equal(patch.declaration?.declaration, "");
  assert.equal(patch.declaration?.scope, "");
  const applied = applyLikeStore(current, patch);
  assert.equal(applied.declaration.declaration, "");
  assert.equal(applied.declaration.scope, "");
  assert.deepEqual(applied.focusAreas, []);
});

test("an earlier custom section is replaced by what the new document has", () => {
  const current = initialPolicy("environmental");
  current.sections = [
    ...(current.sections || []),
    { id: "custom-imported-1", kind: "custom", title: "Old import", enabled: true, blocks: [{ id: "b", type: "paragraph", text: "old, and edited since" }] },
    { id: "custom-mine", kind: "custom", title: "Mine", enabled: true, blocks: [{ id: "c", type: "paragraph", text: "mine" }] },
  ];
  const { patch } = importedPolicyToPolicy(parse(`<h1>Scope</h1><p>All sites.</p><h1>Appendix</h1><p>New appendix text.</p>`), current);
  const customs = patch.sections?.filter((section) => section.kind === "custom") ?? [];
  assert.deepEqual(customs.map((section) => section.title), ["Appendix"], "only the document's own sections remain");
  assert.equal(customs[0].blocks?.[0].text, "New appendix text.");
});

test("imported custom section ids are unique across repeated imports", () => {
  const html = `<h1>Acme Policy</h1><h1>Appendix A</h1><p>First appendix text.</p><h1>Appendix B</h1><p>Second appendix text.</p>`;
  const first = parseImportedPolicyHtml(html, { fileName: "p.docx", policyType: "environmental", importedAt: "2026-11-21T00:00:00.000Z" });
  const second = parseImportedPolicyHtml(html.replace("Appendix B", "Appendix C"), { fileName: "p.docx", policyType: "environmental", importedAt: "2026-11-21T00:05:00.000Z" });
  let policy = initialPolicy("environmental");
  policy = applyLikeStore(policy, importedPolicyToPolicy(first, policy).patch);
  assert.deepEqual(policy.sections?.filter((section) => section.kind === "custom").map((section) => section.title), ["Appendix A", "Appendix B"]);
  policy = applyLikeStore(policy, importedPolicyToPolicy(second, policy).patch);
  const customs = policy.sections?.filter((section) => section.kind === "custom") ?? [];
  assert.deepEqual(customs.map((section) => section.title), ["Appendix A", "Appendix C"], "the second load replaces the first");
  assert.equal(new Set(policy.sections?.map((section) => section.id)).size, policy.sections?.length);
  assert.equal(new Set(customs.flatMap((section) => section.blocks?.map((block) => block.id) ?? [])).size, customs.flatMap((section) => section.blocks ?? []).length, "block ids are unique too");
});

test("loaded focus areas are not hidden by the sector catalog", () => {
  const current = initialPolicy("environmental");
  current.company = { ...current.company, industry: "Manufacturing Heavy", subCategory: "Manufacture of basic chemicals, fertilizers and nitrogen compounds, plastics and synthetic rubber in primary forms" };
  const { patch } = importedPolicyToPolicy(parse(FULL_POLICY), current);
  const applied = applyLikeStore(current, patch);
  assert.deepEqual(applied.focusAreas, patch.focusAreas);
  assert.equal(applied.focusAreaSelection?.mode, "custom");
  assert.equal(visibleQuantitativeAreas(applied).find((area) => area.area === "Energy & Emissions")?.targets.length, 2);
  assert.ok(visibleQualitativeEntries(applied).some(([area]) => area === "Energy & Emissions"));
});

test("the focus areas are only the document's: old objectives, targets and catalog areas are dropped", () => {
  const current = policyWithAuthoredAreas();
  const { patch, report } = importedPolicyToPolicy(parse(`<h1>Key Focus Areas</h1><ul><li>Biodiversity</li></ul>`), current);
  assert.deepEqual(patch.focusAreas, ["Biodiversity"]);
  assert.deepEqual(patch.qualitative, {});
  assert.deepEqual(patch.quantitative, []);
  assert.ok(report.filled.includes("focus"));
});

function policyWithAuthoredAreas() {
  const current = initialPolicy("environmental");
  current.qualitative = { "Biodiversity & Land Use": ["Protect the wetland."], "Water Stewardship": ["Meter every outlet."] };
  current.quantitative = [{ area: "Water Stewardship", targets: [{ target: "Cut water use by 15%", baseline: "FY 2024-25", deadline: "FY 2029-30", reportingFrequency: "Target period" }] }];
  return current;
}

const OBJECTIVES_ONLY = `<h1>Acme Environmental Policy</h1>
  <h1>Qualitative Objectives</h1>
  <h2>Waste Management</h2><ul><li>Segregate waste at source.</li></ul>
  <h2>Noise Control</h2><ul><li>Keep night-time noise under 45 dB.</li></ul>`;

test("a document without a Focus section gets its focus areas from the areas it names", () => {
  const current = policyWithAuthoredAreas();
  const { patch } = importedPolicyToPolicy(parse(OBJECTIVES_ONLY), current);

  assert.deepEqual(patch.focusAreas, ["Waste Management", "Noise Control"], "the document's own wording, nothing from the catalog or the old policy");
  assert.deepEqual(patch.qualitative, { "Waste Management": ["Segregate waste at source."], "Noise Control": ["Keep night-time noise under 45 dB."] });
  assert.deepEqual(patch.quantitative, [], "the old policy's targets are gone");

  const applied = applyLikeStore(current, patch);
  assert.deepEqual(applied.focusAreas, patch.focusAreas);
  assert.ok(visibleQualitativeEntries(applied).some(([area]) => area === "Noise Control"));
});

test("a Targets table without a Focus section brings its own areas and nothing from the old policy", () => {
  const current = policyWithAuthoredAreas();
  const html = `<h1>Acme Environmental Policy</h1><h1>Quantitative Targets</h1><p>The baseline year is FY 2022-23.</p>
    <table><tbody><tr><th>Focus Area</th><th>Target</th><th>Target Year</th></tr><tr><td>Water Stewardship</td><td>Recycle 40% of water</td><td>2030</td></tr></tbody></table>`;
  const { patch } = importedPolicyToPolicy(parse(html), current);
  assert.deepEqual(patch.focusAreas, ["Water Stewardship"]);
  assert.deepEqual(patch.quantitative?.find((area) => area.area === "Water Stewardship")?.targets.map((target) => target.target), ["Recycle 40% of water"]);
  assert.deepEqual(patch.qualitative, {}, "the old objectives are not kept");
});

test("a Focus section sets the focus list and does not carry content from before", () => {
  const current = policyWithAuthoredAreas();
  const { patch } = importedPolicyToPolicy(parse(`<h1>Key Focus Areas</h1><ul><li>Water Stewardship</li><li>Noise Control</li></ul>`), current);
  assert.deepEqual(patch.focusAreas, ["Water Stewardship", "Noise Control"]);
  assert.deepEqual(patch.qualitative, {}, "the old 'Meter every outlet' objective is not in the document");
  assert.deepEqual(patch.quantitative, []);
});

function catalogPolicy() {
  const current = initialPolicy("environmental");
  current.company = { ...current.company, industry: "Manufacturing Heavy", subCategory: "Manufacture of basic chemicals, fertilizers and nitrogen compounds, plastics and synthetic rubber in primary forms" };
  const catalog = getCompanyFocusAreaCatalog(current.company, "environmental");
  assert.ok(catalog, "the sector has a focus-area catalog");
  const [first] = catalog.areas;
  Object.assign(current, withFocusAreaCatalogSelection(catalog, catalog.areas.map((area) => area.id), ["Community Liaison"], undefined, { [first.id]: "Renamed fixed area" }));
  return { current, catalog, first };
}

test("loading into a catalog policy replaces the catalog selection with the document's areas", () => {
  const { current } = catalogPolicy();
  assert.equal(current.focusAreaSelection?.mode, "catalog");
  const { patch } = importedPolicyToPolicy(parse(OBJECTIVES_ONLY), current);
  assert.equal(patch.focusAreaSelection?.mode, "custom");
  assert.deepEqual(patch.focusAreas, ["Waste Management", "Noise Control"]);
  const applied = applyLikeStore(current, patch);
  assert.equal(applied.focusAreaSelection?.mode, "custom");
  assert.deepEqual(applied.focusAreas, ["Waste Management", "Noise Control"], "no catalog area comes back");
  assert.ok(visibleQualitativeEntries(applied).some(([area]) => area === "Noise Control"), "the new area shows in the objectives step and preview");
});

test("a document's area keeps its own spelling even when the policy had a catalog area that renames it", () => {
  const { current, first } = catalogPolicy();
  const { patch } = importedPolicyToPolicy(parse(`<h1>Qualitative Objectives</h1><h2>${first.label}</h2><ul><li>Do the original thing.</li></ul>`), current);
  assert.deepEqual(patch.focusAreas, [first.label]);
  assert.deepEqual(patch.qualitative, { [first.label]: ["Do the original thing."] });
});

test("loading twice gives the second document's areas with collision-free row ids", () => {
  let current = initialPolicy("environmental");
  current = { ...current, focusAreas: ["A"], focusAreaSelection: { mode: "custom", focusAreaItems: [{ id: "import-0", label: "A", selected: true }, { id: "x", label: "B", selected: false }] } };
  const first = parseImportedPolicyHtml(`<h1>Qualitative Objectives</h1><h2>C</h2><ul><li>Do C.</li></ul>`, { fileName: "p.docx", policyType: "environmental", importedAt: "2026-11-21T00:00:00.000Z" });
  const second = parseImportedPolicyHtml(`<h1>Qualitative Objectives</h1><h2>D</h2><ul><li>Do D.</li></ul><h2>E</h2><ul><li>Do E.</li></ul>`, { fileName: "p.docx", policyType: "environmental", importedAt: "2026-11-21T00:01:00.000Z" });
  current = applyLikeStore(current, importedPolicyToPolicy(first, current).patch);
  assert.deepEqual(current.focusAreas, ["C"]);
  current = applyLikeStore(current, importedPolicyToPolicy(second, current).patch);
  assert.deepEqual(current.focusAreas, ["D", "E"]);
  const items = current.focusAreaSelection?.mode === "custom" ? current.focusAreaSelection.focusAreaItems ?? [] : [];
  assert.deepEqual(items.map((item) => [item.label, item.selected]), [["D", true], ["E", true]]);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length, "row ids are unique");
});

test("warns when the document reads like another policy type", () => {
  const living = parse("<h1>Living Wage Policy</h1><h1>Scope</h1><p>All employees.</p>", "living-wage", "Living Wage Policy.docx");
  assert.deepEqual(importedPolicyToPolicy(living, initialPolicy("environmental")).report.mismatch, { detected: "living-wage", expected: "environmental" });
  assert.equal(importedPolicyToPolicy(living, initialPolicy("living-wage")).report.mismatch, null);

  const procurement = parse("<h1>Ethical and Sustainable Supply Chain Policy</h1><h1>Scope</h1><p>All suppliers.</p>", "ethics", "supply chain.docx");
  assert.equal(importedPolicyToPolicy(procurement, initialPolicy("sustainable-procurement")).report.mismatch, null);
  assert.equal(importedPolicyToPolicy(procurement, initialPolicy("ethics")).report.mismatch, null, "a title that names both types matches either");
});

test("describes what was loaded", () => {
  const { report } = importedPolicyToPolicy(parse(FULL_POLICY), initialPolicy("environmental"));
  assert.match(summarizeImport(report), /\d+ sections loaded and 1 custom section added/);
  assert.equal(summarizeImport({ ...report, filled: [], custom: [] }), "Nothing in the document matched the policy fields.");
});

// ---- the guards the builder applies around a load

test("a parsed document only applies to the draft it was read for", () => {
  assert.equal(sameDraftIdentity({ draftId: "a", backendDocumentId: "a" }, { draftId: "a", backendDocumentId: "a" }), true);
  assert.equal(sameDraftIdentity({ draftId: "a", backendDocumentId: "a" }, { draftId: "b", backendDocumentId: "b" }), false, "another draft of the same organization");
  assert.equal(sameDraftIdentity({ draftId: "a", backendDocumentId: "a" }, { draftId: null, backendDocumentId: null }), false, "switching to a new policy");
  assert.equal(sameDraftIdentity({ draftId: null, backendDocumentId: null }, { draftId: "b", backendDocumentId: "b" }), false);
  assert.equal(sameDraftIdentity({ draftId: null, backendDocumentId: null }, { draftId: null, backendDocumentId: "new-id" }), true, "a new policy getting its backend id is the same draft");
});

test("undo reverts only the fields the load touched, and only while they still hold the loaded values", () => {
  const previous = policyWithAuthoredAreas();
  const { patch } = importedPolicyToPolicy(parse(OBJECTIVES_ONLY), previous);
  const touched = Object.keys(patch) as (keyof Policy)[];
  const loaded = applyLikeStore(previous, patch);
  const snapshot = touchedFieldsSnapshot(loaded, touched);

  // The store makes a new object on every update; that alone is not an edit.
  const renormalised = applyLikeStore(loaded, {});
  assert.notEqual(renormalised, loaded);
  assert.equal(touchedFieldsSnapshot(renormalised, touched), snapshot);

  // An edit outside the touched fields does not block undo and survives it.
  const renamed = applyLikeStore(loaded, { company: { ...loaded.company, name: "Renamed Co" } });
  assert.equal(touchedFieldsSnapshot(renamed, touched), snapshot);
  const undone = applyLikeStore(renamed, revertPatch(previous, touched));
  assert.equal(undone.company.name, "Renamed Co");
  assert.deepEqual(undone.focusAreas, previous.focusAreas);
  assert.deepEqual(undone.qualitative, previous.qualitative);

  // An edit to a loaded field blocks it.
  const edited = applyLikeStore(loaded, { qualitative: { ...loaded.qualitative, "Noise Control": ["Changed."] } });
  assert.notEqual(touchedFieldsSnapshot(edited, touched), snapshot);
});

test("a title that mentions a section word is the title page, not a section", () => {
  const governance = importedPolicyToPolicy(parse(`<h1>Governance Policy</h1><p>Acme Ltd.</p><h1>Scope</h1><p>All sites.</p>`, "ethics"), initialPolicy("ethics"));
  assert.deepEqual(governance.report.filled, ["scope"], "'Governance Policy' is not the responsibilities section");
  assert.deepEqual(governance.report.custom, []);

  const rights = importedPolicyToPolicy(parse(`<h1>Human Rights Commitment</h1><h1>Scope</h1><p>All sites.</p>`, "labour-human-rights"), initialPolicy("labour-human-rights"));
  assert.deepEqual(rights.report.filled, ["scope"], "'Human Rights Commitment' is not the declaration");
  assert.equal(rights.patch.declaration?.declaration, initialPolicy("labour-human-rights").declaration.declaration, "the declaration text is unchanged");

  const withBody = importedPolicyToPolicy(parse(`<h1>Governance Policy</h1><p>Acme Ltd.</p><h1>Preface</h1><p>The preface.</p>`, "ethics"), initialPolicy("ethics"));
  assert.deepEqual(withBody.report.filled, ["preface"]);
});

// ---- the parser changes the mapper relies on

test("the parser drops a table of contents and does not take 'Contents' as the title", () => {
  const reference = parse(`<h1>Contents</h1><h2>Preface 2</h2><h2>Scope 3</h2><h1>Preface</h1><p>Real text.</p><h1>Scope</h1><p>Everywhere.</p>`, "environmental", "1. Environmental Policy.docx");
  assert.deepEqual(reference.sections.map((section) => section.title), ["Preface", "Scope"]);
  assert.equal(reference.title, "1. Environmental Policy");
});

test("the parser keeps the structure of nested lists", () => {
  const reference = parse(`<h1>Qualitative Objectives</h1><ul><li><ol><li><strong>Water</strong><ol><li>Cut use.</li><li>Recycle.</li></ol></li><li><strong>Air</strong><ol><li>Filter stacks.</li></ol></li></ol></li></ul>`);
  const blocks = reference.sections[0].blocks;
  assert.deepEqual(blocks.map((block) => (block.type === "list" ? block.items : null)), [["Water"], ["Cut use.", "Recycle."], ["Air"], ["Filter stacks."]]);
});

// ---- real documents

const SAMPLE_ROOTS = [
  fileURLToPath(new URL("../../../Hetvi- Policies/", import.meta.url)),
  fileURLToPath(new URL("../../../Policies - Kenal/", import.meta.url)),
];

function sampleFile(company: string, prefix: string): string | null {
  for (const root of SAMPLE_ROOTS) {
    const directory = path.join(root, company);
    if (!existsSync(directory)) continue;
    const name = readdirSync(directory).find((entry) => entry.startsWith(prefix) && /\.docx$/i.test(entry) && !entry.startsWith("~$"));
    if (name) return path.join(directory, name);
  }
  return null;
}

async function mapSample(company: string, prefix: string, type: PolicyType) {
  const file = sampleFile(company, prefix);
  assert.ok(file, `sample ${company}/${prefix} exists`);
  const reference = await parseDocxBuffer(readFileSync(file), { fileName: path.basename(file), policyType: type });
  const current = initialPolicy(type);
  return { reference, current, ...importedPolicyToPolicy(reference, current) };
}

const haveSamples = SAMPLE_ROOTS.some((root) => existsSync(root));

test("real sample: Naxpar environmental policy", { skip: !haveSamples }, async () => {
  const { reference, patch, report, current } = await mapSample("Naxpar", "1. Environmental", "environmental");
  assert.equal(reference.title, "1. Environmental Policy");
  assert.ok(reference.sections.every((section) => !/^Contents$/i.test(section.title) && !/\s\d{1,2}$/.test(section.title)), "the table of contents is gone");

  assert.deepEqual(report.filled, ["preface", "declaration", "scope", "focus", "qualitative", "quantitative", "sdg", "responsibilities", "monitoring", "review"]);
  assert.match(patch.declaration?.preface ?? "", /^Naxpar Pharma Pvt\. Ltd\. is committed/);
  assert.equal(patch.focusAreas?.length, 11);
  assert.equal(patch.focusAreas?.[0], "Energy Consumption & GHG Emissions");
  assert.equal(Object.keys(patch.qualitative ?? {}).length, 11);
  assert.equal(report.counts.objectives, 37);
  assert.equal(patch.quantitative?.find((area) => area.area === "Raw Materials Management")?.targets.length, 2, "'Raw materials Management' matches the focus area by name");
  for (const area of patch.quantitative ?? []) assert.ok(patch.focusAreas?.includes(area.area), `${area.area} is a focus area`);
  assert.equal(patch.quantitative?.[0].targets[0].baseline, "FY 2022-23", "the baseline year comes from the paragraph above the targets");
  assert.equal(patch.responsibilities?.length, 5);
  assert.equal(patch.responsibilities?.[0].role, "EHS Manager");
  assert.deepEqual(report.skipped, ["Employee acknowledgement form"]);
  assert.equal(report.custom.length, 0);
  assert.equal(report.mismatch, null);
  assert.deepEqual(patch.sdgs, [], "the SDG goals in this document are pictures that only the vision reader can read");
  assert.equal(patch.sections?.find((section) => section.kind === "sdg")?.enabled, true, "the SDG step stays on");
  assert.match(summarizeImport(report), /SDG goals are pictures; pick them in the SDG step\./);

  const applied = applyLikeStore(current, patch);
  assert.equal(applied.focusAreas.length, 11);
});

test("real sample: Yash environmental policy has nested lists and a revision table", { skip: !haveSamples }, async () => {
  const { patch, report } = await mapSample("Yash Speciality", "Environmental Policy", "environmental");
  assert.equal(patch.focusAreas?.length, 10);
  assert.equal(patch.focusAreas?.[0], "Energy Consumption & GHGs");
  assert.equal(patch.qualitative?.["Energy Consumption & GHGs"]?.length, 3);
  assert.equal(report.counts.targets, 22);
  assert.deepEqual(patch.revisionHistory?.filter((row) => row.source === "custom").map((row) => row.revisionNo), ["00", "01"], "the document's revisions, as listed");
  assert.ok(!patch.revisionHistory?.some((row) => row.description === "Initial release of policy"), "no starter revision row");
  assert.equal(patch.responsibilities?.length, 4);
  assert.doesNotMatch(patch.reviewMechanism ?? "", /Prepared By|Vishal/, "the signature block is not review text");
  assert.ok(report.filled.includes("revision"));
});

test("real sample: Tagoor environmental targets table with merged area cells", { skip: !haveSamples }, async () => {
  const { patch, report, current } = await mapSample("Tagoor", "1. Environmental", "environmental");
  // The focus areas are the document's own wording; nothing from the policy's catalog or defaults is added.
  for (const area of ["Climate & Energy", "Water Stewardship", "Waste Management", "Air Quality", "Biodiversity", "Product Lifecycle", "Customer Health & Safety"]) {
    assert.ok(patch.focusAreas?.includes(area), `${area} is one of the document's areas`);
  }
  for (const area of ["Air Emissions Control", "Climate Risk & Emergency Preparedness", "Product End-of-Life & Environmental Stewardship"]) {
    assert.ok(current.focusAreas.includes(area) && !patch.focusAreas?.includes(area), `default area ${area} is not added`);
  }
  assert.equal(report.counts.focusAreas, patch.focusAreas?.length);
  assert.equal(report.counts.targets, 39);
  for (const area of patch.quantitative ?? []) assert.ok(patch.focusAreas?.includes(area.area), `${area.area} is a focus area`);
  assert.ok(report.custom.includes("Good Environmental Practices at Tagoor"));
  assert.equal(report.skipped.includes("Employee acknowledgement form"), true);
});

test("real sample: Alchem prose policy keeps its extra sections as custom sections", { skip: !haveSamples }, async () => {
  const { patch, report } = await mapSample("ALCHEM INTERNATIONAL PVT LTD", "Environmental", "environmental");
  assert.ok(report.filled.includes("preface") && report.filled.includes("scope") && report.filled.includes("responsibilities"));
  assert.ok(report.custom.includes("Communication and Transparency"), "a section the policy has no field for stays a custom section");
  assert.ok(report.filled.includes("qualitative"), "the 'Action Framework' items are objectives");
  assert.equal(report.counts.objectives, 4);
  assert.equal(patch.responsibilities?.length, 4);
  assert.match(patch.declaration?.scope ?? "", /applicable across all employees/, "the inline 'Scope:' line starts the scope section");
  assert.equal(patch.sections?.find((section) => section.kind === "sdg")?.enabled, true, "the SDG section is in the document");
  assert.deepEqual(patch.sections?.filter((section) => section.kind === "custom").map((section) => section.title), report.custom);
});

test("real sample: Arrival ethics policy with commitments and targets under each area", { skip: !haveSamples }, async () => {
  const { patch, report } = await mapSample("Arrival Fashions", "Ethics", "ethics");
  assert.ok((patch.focusAreas?.length ?? 0) >= 10);
  assert.equal(patch.focusAreas?.[0], "Anti-Corruption Initiatives");
  assert.match(patch.qualitative?.["Anti-Corruption Initiatives"]?.[0] ?? "", /^Prevent bribery, corruption/);
  const targets = patch.quantitative?.find((area) => area.area === "Anti-Corruption Initiatives")?.targets ?? [];
  assert.equal(targets.length, 4);
  assert.equal(targets[0].reportingFrequency, "Annually", "an annual commitment has no baseline or deadline year");
  assert.equal(targets[1].baseline, "FY 2022-23");
  assert.equal(targets[1].deadline, "FY 2027-28");
  assert.ok(report.counts.objectives > 0 && report.counts.targets > 0);
});

test("real sample: a labour policy loaded into an environmental builder is flagged", { skip: !haveSamples }, async () => {
  const file = sampleFile("Naxpar", "2. Labour");
  assert.ok(file);
  const reference = await parseDocxBuffer(readFileSync(file), { fileName: path.basename(file), policyType: "environmental" });
  const { report } = importedPolicyToPolicy(reference, initialPolicy("environmental"));
  assert.deepEqual(report.mismatch, { detected: "labour-human-rights", expected: "environmental" });
  assert.equal(importedPolicyToPolicy(reference, initialPolicy("labour-human-rights")).report.mismatch, null);
});

test("real samples: every document in both sample folders maps without throwing", { skip: !haveSamples, timeout: 300_000 }, async () => {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.docx$/i.test(entry.name) && !entry.name.startsWith("~$")) files.push(full);
    }
  };
  SAMPLE_ROOTS.filter((root) => existsSync(root)).forEach(walk);
  assert.ok(files.length > 0);
  for (const file of files) {
    const reference = await parseDocxBuffer(readFileSync(file), { fileName: path.basename(file), policyType: "environmental" });
    const current = initialPolicy("environmental");
    const { patch, report } = importedPolicyToPolicy(reference, current);
    const applied = applyLikeStore(current, patch);
    assert.ok(applied.sections?.every((section) => section.id), `${file} keeps valid sections`);
    for (const area of patch.quantitative ?? []) assert.ok(applied.focusAreas.includes(area.area), `${path.basename(file)}: ${area.area} is a focus area`);
    for (const area of Object.keys(patch.qualitative ?? {})) assert.ok(applied.focusAreas.includes(area), `${path.basename(file)}: ${area} is a focus area`);
    assert.equal(new Set(applied.sections?.map((section) => section.id)).size, applied.sections?.length, `${path.basename(file)} has unique section ids`);
    assert.ok(report.filled.length + report.custom.length >= 0);
  }
});
