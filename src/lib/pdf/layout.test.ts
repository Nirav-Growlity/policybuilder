import assert from "node:assert/strict";
import test from "node:test";
import { getDocument, OPS, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DOCUMENT_THEMES } from "../document-themes";
import { A4, pageFooterDistanceMm, pageFooterVerticalShiftMm } from "../page-geometry";
import { templatePreviewPolicy } from "../sample-policies";
import { generatePdf } from "./generate";
import { PDFDocument, PDFDict, PDFArray, PDFName } from "pdf-lib";
import { applyPageBackground, generatePreviewPdf } from "./print-document";

for (const direction of ["vertical", "horizontal", "diagonal"] as const) {
  test(`${direction} gradient covers the complete page and repeats on every page`, async () => {
    const source = await PDFDocument.create();
    source.addPage([595, 842]);
    source.addPage([595, 842]);
    const result = await PDFDocument.load(await applyPageBackground(await source.save(),
      { kind: "gradient", from: "#FFFFFF", to: "#DDDDF2", direction }, 30));
    for (const page of result.getPages()) {
      const resources = page.node.Resources()!;
      const shadings = resources.lookup(PDFName.of("Shading"), PDFDict);
      const shading = shadings.lookup(shadings.keys()[0], PDFDict);
      const coords = shading.lookup(PDFName.of("Coords"), PDFArray).asArray().map(value => Number(value.toString()));
      assert.deepEqual(coords, direction === "horizontal" ? [0, 0, 595, 0] : direction === "vertical" ? [0, 842, 0, 0] : [0, 842, 595, 0]);
    }
  });
}

test("bordered PDF footer stays above the rendered border stroke", async () => {
  for (const { insetMm, widthPt } of [{ insetMm: 5, widthPt: .5 }, { insetMm: 10, widthPt: 1 }, { insetMm: 20, widthPt: 6 }]) {
    const policy = templatePreviewPolicy("standard-pack", "environmental");
    policy.company.docNum = "BORDER-FOOTER";
    policy.templateBrandOverrides = { schemaVersion: 1, pageBorder: { enabled: true, widthPt, insetMm, scope: "all" } };
    const bytes = await generatePreviewPdf(policy);
    const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    try {
      const page = await pdf.getPage(1);
      const content = await page.getTextContent();
      const pageLabel = content.items.find((item) => "str" in item && item.str === "Page");
      assert.ok(pageLabel && "transform" in pageLabel, `${insetMm}mm/${widthPt}pt: footer page label is missing`);
      const baselineY = pageLabel.transform[5];
      const borderY = insetMm * A4.pointsPerMm;
      assert.ok(baselineY > borderY + widthPt / 2 + 3, `${insetMm}mm/${widthPt}pt: footer baseline ${baselineY}pt crosses border at ${borderY}pt`);
    } finally { await pdf.destroy(); }
  }
  assert.equal(pageFooterVerticalShiftMm({ enabled: false, widthPt: 1, insetMm: 10, scope: "all" }), 0);
  assert.equal(pageFooterDistanceMm({ enabled: false, widthPt: 1, insetMm: 10, scope: "all" }), 12.5);
});

for (const { theme, withLogo } of DOCUMENT_THEMES.flatMap(theme => [false, true].map(withLogo => ({ theme, withLogo })))) {
  test(`${theme.id}${withLogo ? " with large logo" : ""}: cover stays on page one and footer controls remain separated`, async () => {
    const policy = templatePreviewPolicy(theme.id, "labour-human-rights");
    policy.company.docNum = "DOC-CHECK";
    policy.company.revNum = "REV-CHECK";
    policy.company.reviewDate = "REVIEW-CHECK";
    policy.company.reviewerDesignations = ["Environmental Manager"];
    policy.sdgDisplay = "tiles";
    policy.sdgs = [3, 6, 7, 12, 13, 14, 15, 17];
    policy.showTableOfContents = true;
    policy.templateBrandOverrides = { schemaVersion: 1, pageBorder: { enabled: true, widthPt: 6, insetMm: 20, scope: "all" } };
    policy.templateBrandOverrides.background = { kind: "gradient", from: "#FFFFFF", to: "#DDDDF2", direction: "vertical" };
    if (withLogo) {
      policy.company.companyLogo = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#39378E"/></svg>').toString("base64")}`;
      policy.company.name = "International Sustainable Procurement and Responsible Operations Group Limited";
      policy.templateBrandOverrides.logoScale = 180;
    }
    const bytes = await generatePdf(policy);
    if (process.env.POLICY_LAYOUT_QA_DIR) {
      await mkdir(process.env.POLICY_LAYOUT_QA_DIR, { recursive: true });
      await writeFile(path.join(process.env.POLICY_LAYOUT_QA_DIR, `${theme.id}${withLogo ? "-logo" : ""}.pdf`), bytes);
    }
    const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    try {
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const text = content.items.filter(item => "str" in item).map(item => item.str).join(" ");
        if (number === 1) {
          assert.ok(text.includes("REVIEW-CHECK"), `${theme.id}: cover metadata spilled onto another page`);
          assert.ok(text.includes("REV-CHECK"), `${theme.id}: cover revision metadata is missing`);
        }
        assert.ok(text.includes("DOC-CHECK"), `page ${number}: missing document number`);
        assert.ok(text.includes("Environmental Manager"), `page ${number}: missing reviewer designation`);
        assert.match(text, new RegExp(`Page\\s+${number}\\s*[/]\\s*${pdf.numPages}`), `page ${number}: page label missing or joined to document controls`);
        const operators = await page.getOperatorList();
        let matrix = [1, 0, 0, 1, 0, 0];
        const stack: number[][] = [];
        for (let i = 0; i < operators.fnArray.length; i++) {
          const op = operators.fnArray[i];
          if (op === OPS.save) stack.push([...matrix]);
          else if (op === OPS.restore) matrix = stack.pop()!;
          else if (op === OPS.transform) matrix = Util.transform(matrix, operators.argsArray[i]);
          else if (op === OPS.paintImageXObject) {
            // Fixture raster images are SDG icons; the cover artwork is vector.
            assert.ok(Math.hypot(matrix[0], matrix[1]) <= 76 && Math.hypot(matrix[2], matrix[3]) <= 76,
              `${theme.id} page ${number}: SDG icon exceeds its 100px print size`);
          }
        }
      }
    } finally { await pdf.destroy(); }
  });
}
