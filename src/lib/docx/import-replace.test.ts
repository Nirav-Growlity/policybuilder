import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { initializeFocusAreaCatalogFromDefaults } from "../focus-area-catalog";
import { initialPolicy } from "../initial-policy";
import { normalizePolicyQuantitative } from "../quantitative";
import { normalizePolicyRevisionHistory } from "../revision-history";
import { normalizePolicyStructure } from "../sections";
import type { Policy, PolicyType } from "../types";
import { importedPolicyToPolicy, isoDateFrom, sitesFromTable, summarizeImport } from "./import-to-policy";
import { strictSectionKind } from "./heading-kinds";
import { parseDocxBuffer, parseImportedPolicyHtml } from "./parse";

// "Load existing policy" replaces the policy's content with only what the document says.

const parse = (html: string, policyType: PolicyType = "environmental", fileName = "policy.docx") =>
  parseImportedPolicyHtml(html, { fileName, policyType, importedAt: "2026-11-21T00:00:00.000Z" });

const load = (html: string, policyType: PolicyType = "environmental", fileName = "policy.docx") =>
  importedPolicyToPolicy(parse(html, policyType, fileName), initialPolicy(policyType));

function applyLikeStore(current: Policy, patch: Partial<Policy>): Policy {
  return normalizePolicyRevisionHistory(normalizePolicyStructure(normalizePolicyQuantitative(initializeFocusAreaCatalogFromDefaults({ ...current, ...patch }))));
}

const enabledKinds = (patch: Partial<Policy>) => patch.sections?.filter((section) => section.enabled).map((section) => section.kind) ?? [];

test("nothing from the template is left in a loaded policy", () => {
  const current = initialPolicy("environmental");
  const { patch } = importedPolicyToPolicy(parse(`<h1>Acme Policy</h1><h1>Scope</h1><p>All of our sites.</p>`), current);
  const applied = applyLikeStore(current, patch);
  assert.equal(applied.declaration.scope, "All of our sites.");
  for (const field of ["preface", "declaration"] as const) assert.equal(applied.declaration[field], "", `${field} is empty, not the starter text`);
  assert.equal(applied.monitoring, "");
  assert.equal(applied.reviewMechanism, "");
  assert.deepEqual(applied.responsibilities, []);
  assert.deepEqual(applied.focusAreas, []);
  assert.deepEqual(applied.qualitative, {});
  assert.deepEqual(applied.quantitative, []);
  assert.deepEqual(applied.sdgs, []);
  assert.deepEqual(enabledKinds(patch), ["scope"], "only the sections the document has are on");
  assert.equal(patch.definitions, undefined);
});

test("a flat objectives list with no areas goes under one area named from the document, never from the catalog", () => {
  const { patch, report } = load(`<h1>Business Ethics Policy</h1>
    <h1>Qualitative Objectives</h1><p>Our objectives are:</p><ul><li>Prevent bribery in every dealing.</li><li>Protect people who raise concerns.</li></ul>
    <h1>Quantitative Targets</h1><p>The baseline year is FY 2022-23.</p>
    <ul><li>Zero corruption cases by 2030.</li><li>Train 100% of staff every year.</li></ul>`, "ethics");
  assert.deepEqual(patch.focusAreas, ["Business Ethics"]);
  assert.deepEqual(patch.qualitative, { "Business Ethics": ["Prevent bribery in every dealing.", "Protect people who raise concerns."] }, "the lead-in sentence is not an objective");
  const targets = patch.quantitative?.[0].targets ?? [];
  assert.equal(patch.quantitative?.[0].area, "Business Ethics");
  assert.deepEqual(targets.map((target) => target.target), ["Zero corruption cases by 2030.", "Train 100% of staff every year."]);
  assert.equal(targets[0].baseline, "FY 2022-23");
  assert.equal(targets[0].deadline, "FY 2029-30");
  assert.equal(targets[1].reportingFrequency, "Annually");
  assert.deepEqual([report.counts.objectives, report.counts.targets, report.counts.focusAreas], [2, 2, 1]);
});

test("items in a flat list that spell out one of the document's areas go to that area", () => {
  const { patch } = load(`<h1>Acme Environmental Policy</h1>
    <h1>Key Focus Areas</h1><ul><li>Water Stewardship</li><li>Energy Efficiency</li></ul>
    <h1>Objectives</h1><ul><li>Water Stewardship: meter every outlet.</li><li>Energy Efficiency: audit energy use each year.</li></ul>`);
  assert.deepEqual(patch.focusAreas, ["Water Stewardship", "Energy Efficiency"]);
  assert.equal(patch.qualitative?.["Water Stewardship"]?.length, 1);
  assert.equal(patch.qualitative?.["Energy Efficiency"]?.length, 1);
});

test("a focus item written as 'Area : description' is the area, and the description is reported as not loaded", () => {
  const { patch, report } = load(`<h1>Key Focus Areas</h1><ul><li>Climate &amp; Energy : Reducing our footprint across every plant.</li><li>Water : Using water carefully.</li></ul>`);
  assert.deepEqual(patch.focusAreas, ["Climate & Energy", "Water"]);
  assert.match(report.notes.join(" "), /2 focus area descriptions could not be loaded/);
});

test("a heading run into the first paragraph still starts its section", () => {
  const { patch } = load(`<h1>Acme Policy</h1><p>Scope: This policy applies to all sites and every employee.</p><p>Monitoring and Reporting: Progress is reported each quarter to the board.</p>`);
  assert.equal(patch.declaration?.scope, "This policy applies to all sites and every employee.");
  assert.equal(patch.monitoring, "Progress is reported each quarter to the board.");
  assert.deepEqual(enabledKinds(patch), ["scope", "monitoring"]);
});

test("responsibilities written as sentences are split into role and duty", () => {
  const { patch } = load(`<h1>Roles and Responsibilities</h1><ul>
    <li>The HR Manager oversees training and grievance handling.</li>
    <li>Department heads ensure that controls are followed on every shift.</li>
    <li>Role: Plant Manager - Runs the site safely.</li></ul>`);
  assert.deepEqual(patch.responsibilities?.slice(0, 2), [
    { role: "HR Manager", duty: "oversees training and grievance handling." },
    { role: "Department heads", duty: "ensure that controls are followed on every shift." },
  ]);
});

test("a subsection that opens with a section's own words is that section, not a responsibility", () => {
  const { patch } = load(`<h1>Acme Policy</h1><h1>Responsibilities</h1><ul><li>The HR Manager oversees training.</li></ul>
    <h2>Monitoring, Reporting and Transperancy</h2><p>Acme tracks its KPIs across every focus area each quarter.</p>`);
  assert.equal(patch.monitoring, "Acme tracks its KPIs across every focus area each quarter.");
  assert.deepEqual(patch.responsibilities, [{ role: "HR Manager", duty: "oversees training." }]);

  // A heading that only ends in a section word is still a subsection of what it sits in.
  const area = load(`<h1>Acme Policy</h1><h1>Qualitative Objectives</h1><h2>Water usage monitoring</h2><ul><li>Meter every outlet.</li></ul>`);
  assert.equal(area.patch.monitoring, "");
  assert.deepEqual(area.patch.qualitative, { "Water usage monitoring": ["Meter every outlet."] });
});

test("a responsibility sentence may start with a plural subject and a verb such as 'adhere'", () => {
  const { patch } = load(`<h1>Responsibilities</h1><ul><li>Employees and Contractors adhere to environmental standards and contribute to resource efficiency.</li></ul>`);
  assert.deepEqual(patch.responsibilities, [{ role: "Employees and Contractors", duty: "adhere to environmental standards and contribute to resource efficiency." }]);
});

test("document details and form junk are metadata, not policy text", () => {
  const html = `<h1>Acme Ethics Policy</h1><p>REV. No. 03</p><p>LAST REVIEW DATE: 01.05.2026 NEXT REVIEW DATE: 01.05.2027</p>
    <h1>Scope</h1><p>All sites.</p><p>Top of Form</p><p>Bottom of Form</p>
    <h1>Employee Acknowledgement</h1><p>I acknowledge that I have read and understood this policy.</p><p>Name: ____ Signature: ____</p>`;
  const { patch, report } = load(html, "ethics");
  assert.equal(patch.company?.revNum, "03");
  assert.equal(patch.company?.lastReviewDate, "2026-05-01");
  assert.equal(patch.company?.reviewDate, "2027-05-01");
  assert.equal(patch.declaration?.scope, "All sites.", "form markers and metadata lines are not in the scope");
  assert.doesNotMatch(JSON.stringify(patch.sections), /REV\. No|REVIEW DATE|Top of Form|Signature/);
  assert.ok(report.skipped.includes("Employee acknowledgement form"));
  assert.equal(patch.showAcknowledgement, true);
  assert.deepEqual(report.custom, []);
});

test("a document without an acknowledgement form or revisions does not switch them on", () => {
  const { patch } = load(`<h1>Acme Policy</h1><h1>Scope</h1><p>All sites.</p>`);
  assert.equal(patch.showAcknowledgement, false);
  assert.equal(patch.showRevisionHistory, false);
});

test("dates are read day first and written as ISO dates", () => {
  assert.equal(isoDateFrom("01.05.2026"), "2026-05-01");
  assert.equal(isoDateFrom("31/12/2025"), "2025-12-31");
  assert.equal(isoDateFrom("2026-05-01"), "2026-05-01");
  assert.equal(isoDateFrom("31.02.2026"), null, "a date that does not exist is refused");
  assert.equal(isoDateFrom("not a date"), null);
});

test("a site table in the document becomes the company's sites", () => {
  // One merged company cell: the second row arrives one cell short and takes the company from above.
  const merged = [["Entity", "Address"], ["Acme Ltd.", "Plot 1, GIDC, Surat"], ["Gate 4, MIDC, Pune"]];
  const sites = sitesFromTable(merged, "t");
  assert.deepEqual(sites.map((site) => [site.location, site.address]), [["Acme Ltd.", "Plot 1, GIDC, Surat"], ["Acme Ltd.", "Gate 4, MIDC, Pune"]]);
  assert.ok(new Set(sites?.map((site) => site.id)).size === 2);

  const { patch } = load(`<h1>Acme Policy</h1><h1>Scope</h1><p>This policy applies to the following sites.</p><table><tbody>
    <tr><th>Sr. No.</th><th>Location</th><th>Address</th></tr>
    <tr><td>1</td><td>Surat Plant</td><td>Plot 1, GIDC, Surat</td></tr><tr><td>2</td><td>Pune Plant</td><td>Gate 4, MIDC, Pune</td></tr></tbody></table>`);
  assert.deepEqual(patch.company?.sites?.map((site) => site.location), ["Surat Plant", "Pune Plant"]);
  assert.equal(patch.company?.sites?.[1].address, "Gate 4, MIDC, Pune");
});

test("the load summary names the sections loaded and the SDG picture hint", () => {
  const { report } = load(`<h1>Acme Policy</h1><h1>Scope</h1><p>All sites.</p><h1>SDG Alignment</h1><p><img src="docx-image:0" alt=""></p>`);
  assert.match(summarizeImport(report), /sections loaded/);
  assert.match(summarizeImport(report), /pick them in the SDG step/);
});

// ---- real documents

const SAMPLE_ROOTS = [
  fileURLToPath(new URL("../../../Hetvi- Policies/", import.meta.url)),
  fileURLToPath(new URL("../../../Policies - Kenal/", import.meta.url)),
];
const haveSamples = SAMPLE_ROOTS.some((root) => existsSync(root));

function sampleFile(company: string, prefix: string): string {
  for (const root of SAMPLE_ROOTS) {
    const directory = path.join(root, company);
    if (!existsSync(directory)) continue;
    const name = readdirSync(directory).find((entry) => entry.startsWith(prefix) && /\.docx$/i.test(entry) && !entry.startsWith("~$"));
    if (name) return path.join(directory, name);
  }
  throw new Error(`sample ${company}/${prefix} is missing`);
}

async function mapSample(company: string, prefix: string, type: PolicyType) {
  const file = sampleFile(company, prefix);
  const reference = await parseDocxBuffer(readFileSync(file), { fileName: path.basename(file), policyType: type });
  return { reference, current: initialPolicy(type), ...importedPolicyToPolicy(reference, initialPolicy(type)) };
}

test("real sample: Kraftwares ethics policy with flat objectives and targets", { skip: !haveSamples }, async () => {
  const { patch, report } = await mapSample("Kraftwares", "3. Business Ethics", "ethics");
  assert.deepEqual(patch.focusAreas, ["Business Ethics and Integrity"], "one area, named from the document's title");
  assert.deepEqual(Object.values(patch.qualitative ?? {}).map((items) => items.length), [5]);
  assert.deepEqual(patch.quantitative?.map((area) => area.targets.length), [15]);
  assert.deepEqual(patch.responsibilities?.map((row) => row.role), ["Compliance Officer", "HR Manager", "IT Manager", "Internal Audit Team"]);
  assert.equal(patch.company?.revNum, "03");
  assert.equal(patch.company?.lastReviewDate, "2026-05-01");
  assert.equal(patch.company?.reviewDate, "2027-05-01");
  assert.equal(patch.company?.sites?.length, 1);
  assert.deepEqual(patch.sdgs, [8, 9, 12, 16]);
  assert.deepEqual(report.skipped, ["Employee acknowledgement form"]);
  assert.equal(patch.showAcknowledgement, true);
});

test("real sample: Cherry Hill labour policy uses its own seven areas and keeps the SDG step", { skip: !haveSamples }, async () => {
  const { patch, report } = await mapSample("Cherry Hill", "Labor and Human", "labour-human-rights");
  assert.equal(patch.focusAreas?.length, 7);
  assert.equal(patch.focusAreas?.[0], "Ensuring Workplace Health and Safety");
  assert.equal(patch.focusAreas?.[4], "Eliminating Child Labor, Forced Labor, and Human Trafficking");
  assert.deepEqual([report.counts.objectives, report.counts.targets, report.counts.responsibilities], [14, 16, 5]);
  assert.equal(patch.company?.sites?.length, 6);
  assert.equal(patch.company?.sites?.[0].location, "Delhi (Head Quarter)");
  assert.equal(patch.company?.revNum, "01");
  assert.deepEqual(patch.sdgs, [], "the goals are pictures; the vision reader fills them on the server");
  assert.equal(patch.sections?.find((section) => section.kind === "sdg")?.enabled, true);
  assert.match(summarizeImport(report), /SDG goals are pictures; pick them in the SDG step\./);
  assert.deepEqual(report.custom, []);
});

test("real sample: CTX environmental policy keeps the document's focus-area spelling", { skip: !haveSamples }, async () => {
  const { patch, report } = await mapSample("CTX", "1. Environmental", "environmental");
  assert.equal(patch.focusAreas?.length, 11);
  assert.equal(patch.focusAreas?.[2], "Raw Materials Management");
  assert.equal(patch.focusAreas?.[10], "Environmental Services, Partnerships & Advocacy");
  assert.deepEqual([report.counts.objectives, report.counts.targets, report.counts.responsibilities], [34, 32, 4]);
  assert.equal(patch.company?.sites?.length, 2);
  assert.equal(patch.company?.effectiveDate, "2026-01-01");
  for (const area of patch.quantitative ?? []) assert.ok(patch.focusAreas?.includes(area.area));
});

// ---- every sample document

const norm = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

// Site-policy documents with inconsistent heading levels: their extra sections stay as custom sections instead of fields.
const METADATA_TITLE = /review\s*date|rev(?:ision|\.)?\s*no|document\s*no|effective\s*date|date\s*of\s*issue/i;
const MIXED_HEADING_DOCUMENTS = /Alchem Ballabgarh Site Policies/i;

test("real samples: no starter text and no catalog area is added to any document", { skip: !haveSamples, timeout: 600_000 }, async () => {
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

  const problems: string[] = [];
  for (const file of files) {
    for (const type of ["environmental", "ethics"] as PolicyType[]) {
      const reference = await parseDocxBuffer(readFileSync(file), { fileName: path.basename(file), policyType: type });
      const current = initialPolicy(type);
      const { patch, report } = importedPolicyToPolicy(reference, current);
      const name = `${path.basename(file)} (${type})`;
      const haystack = norm([reference.title, reference.fileName, reference.text, ...reference.sections.map((section) => section.title)].join(" "));

      // Starter prose appears only when the document itself says it.
      const starters = [current.declaration.preface, current.declaration.declaration, current.declaration.scope, current.monitoring, current.reviewMechanism].filter((text) => text.length > 40);
      const texts = [patch.declaration?.preface, patch.declaration?.declaration, patch.declaration?.scope, patch.monitoring, patch.reviewMechanism];
      for (const starter of starters) if (texts.includes(starter) && !haystack.includes(norm(starter))) problems.push(`${name}: starter text`);
      if (patch.definitions !== undefined && !reference.sections.some((section) => section.kind === "definitions")) problems.push(`${name}: definitions invented`);

      // Every area is a name the document uses (or its own title / file name).
      const words = new Set(haystack.split(" "));
      for (const area of patch.focusAreas ?? []) if (!norm(area).split(" ").every((word) => words.has(word))) problems.push(`${name}: area "${area}" is not in the document`);

      // A standard section is on only when something from the document was loaded into it.
      for (const section of patch.sections ?? []) {
        if (section.kind !== "custom" && section.kind !== "revision" && section.enabled && !report.filled.includes(section.kind)) problems.push(`${name}: ${section.kind} is on but empty`);
      }
      // A top-level section that names a policy section exactly is loaded into it (the title page and metadata aside).
      if (!MIXED_HEADING_DOCUMENTS.test(file)) {
        reference.sections.forEach((section, index) => {
          const kind = strictSectionKind(section.title);
          if (!kind || index === 0 || section.level !== 1 || !section.blocks.length || kind === "revision") return;
          if (METADATA_TITLE.test(section.title) || /acknowledg/i.test(section.title)) return;
          // Prose that has no role and duty to split stays whole as a custom section.
          if (!report.filled.includes(kind) && !report.custom.includes(section.title.replace(/[:\s]+$/, ""))) problems.push(`${name}: "${section.title}" was not loaded`);
        });
      }

      const applied = applyLikeStore(current, patch);
      if (new Set(applied.sections?.map((section) => section.id)).size !== applied.sections?.length) problems.push(`${name}: duplicate section ids`);
      for (const area of Object.keys(patch.qualitative ?? {})) if (!applied.focusAreas.includes(area)) problems.push(`${name}: objectives for "${area}" are hidden`);
    }
  }
  assert.deepEqual(problems.slice(0, 40), [], `${problems.length} problems`);
});

// ---- SDG goals that are pictures

test("a plain 'Alignment with SDGs:' line inside another section starts the SDG section and takes the picture after it", async () => {
  const { parseImportedPolicyHtmlWithImages } = await import("./parse");
  const html = `
    <h2>Responsibility</h2>
    <ul><li>The Compliance Officer oversees the policy.</li></ul>
    <p>Alignment with SDGs:</p>
    <p><img src="docx-image:0" alt="" /></p>
    <p>Review Mechanism:</p>
    <ul><li>The policy is reviewed every two years.</li></ul>`;
  const { reference, imageIndexes } = parseImportedPolicyHtmlWithImages(html, { fileName: "policy.docx", policyType: "ethics" });
  const sdg = reference.sections.find((section) => section.kind === "sdg");
  assert.ok(sdg, "the SDG section exists");
  assert.equal(sdg.title, "Alignment with SDGs");
  assert.deepEqual(imageIndexes.get(sdg.id), [0], "the picture belongs to the SDG section, not Responsibility");
  assert.equal(reference.sections.find((section) => section.kind === "review")?.title, "Review Mechanism");
  const responsibility = reference.sections.find((section) => section.kind === "responsibilities");
  assert.equal(imageIndexes.get(responsibility!.id), undefined);
});

test("SDG goals read from pictures survive when a 'Document introduction' sits between sections (the AI placement layout)", () => {
  const reference = parse("<h2>Placeholder</h2><p>x</p>", "labour-human-rights");
  const sections = [
    { id: "a1", title: "Scope", level: 1 as const, kind: "scope" as const, blocks: [{ type: "paragraph" as const, text: "This policy applies to all sites." }] },
    { id: "imported-introduction-0", title: "Document introduction", level: 1 as const, kind: "preface" as const, blocks: [] },
    { id: "s2", title: "Policy Declaration", level: 2 as const, kind: "declaration" as const, blocks: [{ type: "paragraph" as const, text: "We respect human rights." }] },
    { id: "s3", title: "Alignment with SDGs", level: 2 as const, kind: "sdg" as const, blocks: [], imageAlts: [""], sdgGoals: [3, 4, 5, 8] },
  ];
  const { patch, report } = importedPolicyToPolicy({ ...reference, sections }, initialPolicy("labour-human-rights"));
  assert.deepEqual(patch.sdgs, [3, 4, 5, 8]);
  assert.equal(patch.sections?.find((section) => section.kind === "sdg")?.enabled, true);
  assert.equal(report.sdgGoalsUnread, false);
});

test("the dialog's 'not loaded' list names what was left out, and unread SDG pictures are flagged", () => {
  const { report } = load(`
    <h2>Policy Declaration</h2><p>We protect the environment.</p>
    <h2>Alignment with SDGs</h2><p><img src="docx-image:0" alt="" /></p>
    <h2>Employee Acknowledgement Form</h2><p>I have read this policy.</p>`);
  assert.ok(report.notLoaded.includes("Employee acknowledgement form"));
  assert.equal(report.sdgGoalsUnread, true);
});
