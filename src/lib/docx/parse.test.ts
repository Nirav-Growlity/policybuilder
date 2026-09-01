import assert from "node:assert/strict";
import test from "node:test";
import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { classifySectionHeading, parseDocxBuffer, parseImportedPolicyHtml } from "./parse";

test("maps alternate policy headings and preserves every source block", () => {
  const reference = parseImportedPolicyHtml(
    `<h1>People First Charter</h1>
     <p>Our workforce charter sets the direction for responsible employment.</p>
     <h2>Who We Cover</h2><p>Employees, contractors and suppliers are covered.</p>
     <h2>What We Stand For</h2><ul><li>Respect human dignity</li><li>Prevent forced labour</li></ul>
     <h2>How We Govern</h2><table><tbody><tr><th>Role</th><th>Duty</th></tr><tr><td>Board</td><td>Oversight</td></tr></tbody></table>
     <h3>Checking Progress</h3><p>Performance is assessed every quarter.</p>`,
    { fileName: "people-first.docx", policyType: "labour-human-rights", importedAt: "2026-08-31T00:00:00.000Z" }
  );

  assert.equal(reference.title, "People First Charter");
  assert.deepEqual(reference.sections.map((section) => section.title), [
    "People First Charter",
    "Who We Cover",
    "What We Stand For",
    "How We Govern",
    "Checking Progress",
  ]);
  assert.equal(reference.sections[1].kind, "scope");
  assert.equal(reference.sections[3].kind, "responsibilities");
  assert.deepEqual(reference.sections[3].blocks[0], {
    type: "table",
    rows: [["Role", "Duty"], ["Board", "Oversight"]],
  });
  assert.equal(reference.sections[4].blocks[0].type, "paragraph");
});

test("recognizes numbered, non-PolicyCraft section titles", () => {
  assert.equal(classifySectionHeading("2. Applicability and reach"), "scope");
  assert.equal(classifySectionHeading("5. Accountabilities and policy ownership"), "responsibilities");
  assert.equal(classifySectionHeading("8. Performance targets and KPIs"), "quantitative");
  assert.equal(classifySectionHeading("Appendix A - Source references"), "custom");
});

test("extracts a real DOCX without hydrating a Policy", async () => {
  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "Environmental Stewardship Charter", heading: HeadingLevel.TITLE }),
        new Paragraph({ text: "Where this charter applies", heading: HeadingLevel.HEADING_1 }),
        new Paragraph("All offices, sites, workers and contractors."),
        new Paragraph({ text: "Measures and milestones", heading: HeadingLevel.HEADING_1 }),
        new Paragraph("Cut absolute emissions by 30% by FY 2030-31."),
      ],
    }],
  });
  const buffer = await Packer.toBuffer(document);
  const reference = await parseDocxBuffer(buffer, {
    fileName: "stewardship.docx",
    policyType: "environmental",
    importedAt: "2026-08-31T00:00:00.000Z",
  });

  assert.equal(reference.fileName, "stewardship.docx");
  assert.equal(reference.sections.find((section) => section.title === "Where this charter applies")?.kind, "scope");
  assert.match(reference.text, /Cut absolute emissions by 30%/);
  assert.equal("policy" in reference, false);
});
