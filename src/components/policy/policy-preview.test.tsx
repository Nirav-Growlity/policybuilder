import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright-core";
import { PolicyCoverPreview, PolicyPreview } from "./policy-preview";
import { createAICoverComposition, fallbackAICoverLayout } from "../../lib/ai/cover";
import { templatePreviewPolicy } from "../../lib/sample-policies";
import { createPrintDocument } from "../../lib/pdf/print-document";
import { buildDocumentRenderModel } from "../../lib/document-render-model";
import { DEFAULT_POLICY_LIST_FORMATTING } from "../../lib/list-formatting";

function chromePath() {
  return process.env.POLICY_PDF_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
}

test("custom cover keeps its background image without rendering a background label", () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  const composition = createAICoverComposition(policy, "data:image/png;base64,art", fallbackAICoverLayout());
  const markup = renderToStaticMarkup(React.createElement(PolicyCoverPreview, {
    policy: { ...policy, coverComposition: composition },
  }));

  assert.match(markup, /policy-custom-cover-background/);
  assert.doesNotMatch(markup, /Cover background/);
});

test("cover-only preview renders the standard policy cover", () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.coverComposition = undefined;
  policy.aiCoverComposition = undefined;
  const markup = renderToStaticMarkup(React.createElement(PolicyCoverPreview, {
    policy,
  }));
  assert.match(markup, /data-cover-mode="standard"/);
  assert.match(markup, /class="cover-motif"/);
  assert.match(markup, /Environmental Policy/);
  assert.match(markup, /policy-cover-company/);
  assert.doesNotMatch(markup, /alt="Company logo"/);
  assert.doesNotMatch(markup, /DOCUMENT NO\.|EFFECTIVE DATE|NEXT REVIEW|REVISION/);
});

test("standard cover shows the company logo instead of the company name", () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.coverComposition = undefined;
  policy.aiCoverComposition = undefined;
  policy.company.name = "Company Name Must Be Hidden";
  policy.company.companyLogo = "data:image/png;base64,logo";
  policy.company.docNum = "COVER-DOC-771";
  policy.company.effectiveDate = "COVER-DATE-772";
  policy.company.revNum = "COVER-REV-773";
  policy.company.reviewDate = "COVER-REVIEW-774";
  const markup = renderToStaticMarkup(React.createElement(PolicyCoverPreview, { policy }));
  const printDocument = createPrintDocument(markup, policy);

  assert.match(markup, /alt="Company logo"/);
  assert.match(markup, /Environmental Policy/);
  assert.doesNotMatch(markup, /Company Name Must Be Hidden|COVER-DOC-771|COVER-DATE-772|COVER-REV-773|COVER-REVIEW-774/);
  assert.match(printDocument, /alt="Company logo"/);
  assert.doesNotMatch(printDocument, /COVER-DOC-771|COVER-DATE-772|COVER-REV-773|COVER-REVIEW-774/);
});

test("saved custom covers render only the company brand and policy title", () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.company.companyLogo = "";
  policy.company.name = "Cover Company Fallback";
  policy.company.docNum = "CUSTOM-DOC-881";
  policy.company.effectiveDate = "CUSTOM-DATE-882";
  policy.company.revNum = "CUSTOM-REV-883";
  policy.company.reviewDate = "CUSTOM-REVIEW-884";
  const composition = createAICoverComposition(policy, "data:image/png;base64,background", fallbackAICoverLayout());
  const nameLayer = composition.elements.find((element) => element.type === "text" && element.content.kind === "binding" && element.content.binding === "companyName");
  assert.ok(nameLayer?.type === "text");
  composition.elements.push(
    { ...nameLayer, id: "saved-document-number", content: { kind: "binding", binding: "documentNumber" } },
    { ...nameLayer, id: "saved-extra-copy", content: { kind: "literal", text: "REVISION 99" } },
    { id: "saved-metadata-rule", type: "image", assetId: "data:image/png;base64,rule", x: 20, y: 220, width: 160, height: 1, rotation: 0, opacity: 1, zIndex: 20, visible: true, locked: false, fit: "contain", focalPoint: { x: 50, y: 50 }, altText: "Metadata divider" },
    { id: "saved-decoration", type: "image", assetId: "data:image/png;base64,decoration", x: 18, y: 170, width: 80, height: 40, rotation: 0, opacity: 1, zIndex: 3, visible: true, locked: false, fit: "contain", focalPoint: { x: 50, y: 50 }, altText: "Decorative artwork" },
  );
  policy.coverComposition = composition;
  policy.activeCoverVariant = "manual";
  const savedComposition = structuredClone(composition);
  const model = buildDocumentRenderModel(policy);
  const markup = renderToStaticMarkup(React.createElement(PolicyCoverPreview, { policy }));

  assert.deepEqual(policy.coverComposition, savedComposition);
  assert.equal(model.cover.composition?.elements.some((element) => element.type === "image" && /saved-decoration/.test(element.id)), true);
  assert.deepEqual(model.cover.composition?.elements.filter((element) => element.type === "text").map((element) => element.type === "text" && element.content.kind === "binding" ? element.content.binding : "literal").sort(), ["companyName", "policyTitle"]);
  assert.match(markup, /Cover Company Fallback/);
  assert.match(markup, /Environmental Policy/);
  assert.match(markup, /Decorative artwork/);
  assert.doesNotMatch(markup, /CUSTOM-DOC-881|CUSTOM-DATE-882|CUSTOM-REV-883|CUSTOM-REVIEW-884|REVISION 99|Metadata divider/);
});

test("cover-only preview renders the active AI cover composition", () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.aiCoverComposition = createAICoverComposition(policy, "data:image/png;base64,art", fallbackAICoverLayout(), { titleColor: "#FFFFFF", brandColor: "#FFFFFF", headingFontFamily: "Fraunces", bodyFontFamily: "Public Sans" });
  policy.activeCoverVariant = "ai";
  const markup = renderToStaticMarkup(React.createElement(PolicyCoverPreview, { policy }));
  assert.match(markup, /data-cover-mode="custom"/);
  assert.match(markup, /policy-custom-cover-background/);
  assert.match(markup, /font-family:Source Serif 4/);
  assert.match(markup, /text-shadow:/);
});

test("list formatting keeps legacy defaults and independently changes every document marker", () => {
  const legacy = templatePreviewPolicy("standard-pack", "environmental");
  assert.deepEqual(buildDocumentRenderModel(legacy).listFormatting, DEFAULT_POLICY_LIST_FORMATTING);

  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.visualStyle = "modern";
  policy.focusAreas = ["Energy"];
  policy.qualitative = { Energy: ["Improve training coverage."] };
  policy.quantitative = [{ area: "Energy", targets: [{ target: "Reduce energy use by 10%", baseline: "FY 2025-26", deadline: "FY 2028-29", reportingFrequency: "Target period" }] }];
  policy.responsibilities = [{ role: "Energy Manager", duty: "Track performance." }];
  policy.sdgs = [7];
  policy.listFormatting = {
    outline: "bullet",
    focusAreas: "bullet",
    qualitativeGroups: "bullet",
    qualitativeItems: "number",
    quantitativeGroups: "bullet",
    quantitativeItems: "number",
    responsibilities: "bullet",
  };

  const reloaded = JSON.parse(JSON.stringify(policy));
  assert.deepEqual(buildDocumentRenderModel(reloaded).listFormatting, policy.listFormatting);
  const markup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy: reloaded }));
  const focus = markup.slice(markup.indexOf('id="standard-focus"'), markup.indexOf('id="standard-qualitative"'));
  const qualitative = markup.slice(markup.indexOf('id="standard-qualitative"'), markup.indexOf('id="standard-quantitative"'));
  const quantitative = markup.slice(markup.indexOf('id="standard-quantitative"'), markup.indexOf('id="standard-sdg"'));
  const responsibilities = markup.slice(markup.indexOf('id="standard-responsibilities"'));

  assert.match(markup, /professional-toc[\s\S]*?<ul>[\s\S]*?<span>•<\/span>/);
  assert.match(focus, /policy-section-heading[\s\S]*?<span>•<\/span>/);
  assert.match(focus, /policy-focus-item"><b>•<\/b>/);
  assert.match(qualitative, /<header><b>•<\/b>[\s\S]*?<ol><li>Improve training coverage\.<\/li><\/ol>/);
  assert.match(quantitative, /<b>•<\/b>[\s\S]*?<ol class="policy-target-list">/);
  assert.match(responsibilities, /policy-responsibility-list[\s\S]*?<b>•<\/b>/);
  assert.match(markup, /SDG 7/, "semantic SDG numbers must not be replaced");
  assert.match(createPrintDocument(markup, policy), /policy-focus-item"><b>•<\/b>/);
});

test("professional legal-form acknowledgement keeps signature rule inside its box", async () => {
  const markup = renderToStaticMarkup(
    React.createElement(PolicyPreview, {
      policy: templatePreviewPolicy("clean-essentials", "sustainable-procurement"),
    }),
  );
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 980, height: 643 } });
    await page.setContent(markup);
    const geometry = await page.evaluate(() => {
      const form = document.querySelector<HTMLElement>(".acknowledgement-legal-form")?.getBoundingClientRect();
      const signature = document.querySelector<HTMLElement>(".ack-signature i")?.getBoundingClientRect();
      if (!form || !signature) throw new Error("Acknowledgement form geometry is missing");
      return { bottomClearance: form.bottom - signature.bottom };
    });
    assert.ok(geometry.bottomClearance > 8, `signature rule has only ${geometry.bottomClearance}px of bottom clearance`);
  } finally {
    await browser.close();
  }
});

test("editorial-margin sections expose only the outer section number", async () => {
  const markup = renderToStaticMarkup(
    React.createElement(PolicyPreview, {
      policy: templatePreviewPolicy("people-charter", "sustainable-procurement"),
    }),
  );
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 980, height: 643 } });
    await page.setContent(markup);
    const numbering = await page.evaluate(() => {
      const section = document.querySelector<HTMLElement>(".frame-editorial-margin");
      const outerNumber = section?.querySelector<HTMLElement>(":scope > aside > b");
      const headingNumber = section?.querySelector<HTMLElement>(".policy-section-heading > span");
      if (!section || !outerNumber || !headingNumber) throw new Error("editorial-margin numbering is missing");
      return {
        outerDisplay: getComputedStyle(outerNumber).display,
        headingDisplay: getComputedStyle(headingNumber).display,
        outerText: outerNumber.textContent,
        headingText: headingNumber.textContent,
      };
    });
    assert.notEqual(numbering.outerDisplay, "none", "outer section number is hidden");
    assert.equal(numbering.outerText, "01", "outer section number is incorrect");
    assert.equal(numbering.headingDisplay, "none", `section number ${numbering.headingText} is duplicated in the heading`);
  } finally {
    await browser.close();
  }
});

test("printed outer-number sections do not restore the heading number", async () => {
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    for (const themeId of ["people-charter", "executive-brief"] as const) {
      const policy = templatePreviewPolicy(themeId, "sustainable-procurement");
      const markup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy }));
      const page = await browser.newPage({ viewport: { width: 980, height: 643 } });
      await page.setContent(createPrintDocument(markup, policy));
      const frame = themeId === "people-charter" ? "editorial-margin" : "numbered-rail";
      const numbering = await page.locator(`.frame-${frame}`).first().evaluate((section) => {
        const outerNumber = section.querySelector<HTMLElement>(":scope > aside > b");
        const headingNumber = section.querySelector<HTMLElement>(".policy-section-heading > span");
        if (!outerNumber || !headingNumber) throw new Error("frame numbering is missing");
        return { outerDisplay: getComputedStyle(outerNumber).display, headingDisplay: getComputedStyle(headingNumber).display };
      });
      assert.notEqual(numbering.outerDisplay, "none", `${frame} outer section number is hidden in print`);
      assert.equal(numbering.headingDisplay, "none", `print CSS restores a duplicate ${frame} number in the heading`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("professional numbered content matches its heading typography in screen and print", async () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  const markup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy }));
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    for (const documentMarkup of [markup, createPrintDocument(markup, policy)]) {
      const page = await browser.newPage({ viewport: { width: 980, height: 643 } });
      await page.setContent(documentMarkup);
      const sizes = await page.locator(".policy-focus-list").first().evaluate((list) => {
        const section = list.closest(".policy-section");
        const headingNumber = section?.querySelector<HTMLElement>(".policy-section-heading > span");
        const headingTitle = section?.querySelector<HTMLElement>(".policy-section-heading h2");
        const tileNumber = list.querySelector<HTMLElement>(".policy-focus-item b");
        const tileTitle = list.querySelector<HTMLElement>(".policy-focus-item span");
        const objectiveGroup = document.querySelector<HTMLElement>('[data-collection="professional"] .policy-objective-groups > section');
        const objectiveNumber = objectiveGroup?.querySelector<HTMLElement>("header b");
        const objectiveTitle = objectiveGroup?.querySelector<HTMLElement>("header h3");
        if (!headingNumber || !headingTitle || !tileNumber || !tileTitle || !objectiveNumber || !objectiveTitle) throw new Error("professional numbered typography is missing");
        return [headingNumber, headingTitle, tileNumber, tileTitle, objectiveNumber, objectiveTitle].map((element) => getComputedStyle(element).fontSize);
      });
      assert.equal(new Set(sizes.slice(0, 4)).size, 1, `section and focus-row font sizes differ: ${sizes.slice(0, 4).join(", ")}`);
      assert.equal(sizes[4], sizes[5], `qualitative number and area heading sizes differ: ${sizes.slice(4).join(", ")}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("cover omits document details while the render model retains footer values", () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.company.docNum = "ENV-001";
  policy.company.reviewDate = "2027-01-14";
  policy.company.reviewerDesignations = ["Environmental Manager", "Compliance Officer"];
  const markup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy }));
  const model = buildDocumentRenderModel(policy);
  const cover = markup.slice(markup.indexOf('data-cover-mode="standard"'), markup.indexOf("</header>"));
  assert.equal(model.footer.documentNumber, "ENV-001");
  assert.equal(model.footer.reviewDate, "2027-01-14");
  assert.doesNotMatch(cover, /ENV-001|2027-01-14|REVISION|NEXT REVIEW/);
  assert.doesNotMatch(markup, /\.policy-running-header \{[^}]*border-bottom/);
  assert.doesNotMatch(markup, /\.policy-footer \{[^}]*border-top/);
});

test("PDF print furniture keeps header and footer free of separator rules", () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  const markup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy }));
  const printDocument = createPrintDocument(markup, policy);
  const headerRule = printDocument.match(/\.policy-running-header \{[^}]*\}/)?.[0] || "";
  const footerRule = printDocument.match(/\.policy-footer \{[^}]*\}/)?.[0] || "";
  assert.doesNotMatch(headerRule, /border-(?:top|bottom)\s*:/i);
  assert.doesNotMatch(footerRule, /border-(?:top|bottom)\s*:/i);
  assert.doesNotMatch(printDocument, /\.professional-running-[^}]*\{[^}]*border-bottom/i);
});

test("quantitative preview groups repeated areas and keeps timing inside target bullets", () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.quantitative = [{
    area: "Gifts & Hospitality",
    targets: [
      { target: "Achieve 100% timely disclosure of reportable gifts", baseline: "FY 2025-26", deadline: "FY 2028-29", reportingFrequency: "Target period", subtopics: ["Maintain a centralized register.", "Apply approval thresholds."] },
      { target: "Complete 100% compliance training for relevant employees", baseline: "FY 2025-26", deadline: "FY 2029-30", reportingFrequency: "Target period", subtopics: ["Cover conflicts of interest."] },
    ],
  }];
  const markup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy }));
  const quantitative = markup.slice(markup.indexOf('id="standard-quantitative"'));
  assert.equal((quantitative.match(/Gifts &amp; Hospitality/g) || []).length, 1);
  assert.match(quantitative, />01<\//, "quantitative area numbers should be zero-padded");
  assert.equal((quantitative.match(/class="policy-target-list"/g) || []).length, 1);
  assert.equal((quantitative.match(/class="policy-target-subtopics"/g) || []).length, 0);
  assert.equal((quantitative.match(/Achieve 100%/g) || []).length, 1);
  assert.equal((quantitative.match(/Complete 100%/g) || []).length, 1);
  assert.doesNotMatch(quantitative, /Baseline year|Achievement year|Reporting basis|Targets are tracked/);
  assert.doesNotMatch(quantitative, /Maintain a centralized register|Apply approval thresholds|Cover conflicts of interest/);
});

test("quantitative numbers match area-heading typography and primary color in screen and print", async () => {
  const policies = [
    { policy: { ...templatePreviewPolicy("standard-pack", "environmental"), visualStyle: "modern" as const }, rowSelector: ".policy-modern-targets > div", expectSectionHeadingPrimary: true },
    { policy: templatePreviewPolicy("sustainability-charter", "environmental"), rowSelector: ".policy-target-bands > div", expectSectionHeadingPrimary: false },
  ];
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    for (const { policy, rowSelector, expectSectionHeadingPrimary } of policies) {
      const markup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy }));
      for (const documentMarkup of [markup, createPrintDocument(markup, policy)]) {
        const page = await browser.newPage({ viewport: { width: 980, height: 643 } });
        await page.setContent(documentMarkup);
        const styles = await page.locator(`[id$="-quantitative"] ${rowSelector}`).first().evaluate((row) => {
          const number = row.querySelector<HTMLElement>(":scope > b");
          const title = row.querySelector<HTMLElement>("h3");
          const section = row.closest<HTMLElement>(".policy-section");
          const sectionNumber = section?.querySelector<HTMLElement>(".policy-section-heading > span");
          const sectionTitle = section?.querySelector<HTMLElement>(".policy-section-heading h2");
          if (!number || !title || !sectionNumber || !sectionTitle) throw new Error("quantitative typography elements are missing");
          const numberStyle = getComputedStyle(number);
          const titleStyle = getComputedStyle(title);
          const sectionNumberStyle = getComputedStyle(sectionNumber);
          const sectionTitleStyle = getComputedStyle(sectionTitle);
          const primaryProbe = document.createElement("span");
          primaryProbe.style.color = "var(--doc-primary)";
          row.append(primaryProbe);
          const primary = getComputedStyle(primaryProbe).color;
          primaryProbe.remove();
          return {
            primary,
            number: { size: numberStyle.fontSize, color: numberStyle.color },
            title: { size: titleStyle.fontSize, color: titleStyle.color },
            sectionNumber: { size: sectionNumberStyle.fontSize, color: sectionNumberStyle.color },
            sectionTitle: { size: sectionTitleStyle.fontSize, color: sectionTitleStyle.color },
          };
        });
        assert.equal(styles.number.size, styles.title.size, `quantitative number and area heading sizes differ: ${styles.number.size}, ${styles.title.size}`);
        assert.equal(styles.number.color, styles.title.color, `quantitative number and area heading colors differ: ${styles.number.color}, ${styles.title.color}`);
        assert.equal(styles.number.color, styles.primary, `quantitative number should use the main brand color: ${styles.number.color} vs ${styles.primary}`);
        if (expectSectionHeadingPrimary) {
          assert.equal(styles.sectionNumber.color, styles.sectionTitle.color, `section number and heading colors differ: ${styles.sectionNumber.color}, ${styles.sectionTitle.color}`);
          assert.equal(styles.sectionTitle.color, styles.primary, `section heading should use the main brand color: ${styles.sectionTitle.color} vs ${styles.primary}`);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});
