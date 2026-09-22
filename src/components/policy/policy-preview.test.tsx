import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright-core";
import { PolicyCoverPreview, PolicyPreview } from "./policy-preview";
import { createAICoverComposition, fallbackAICoverLayout } from "../../lib/ai/cover";
import { templatePreviewPolicy } from "../../lib/sample-policies";
import { createPrintDocument } from "../../lib/pdf/print-document";

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

test("footer uses the aligned document-control contract", () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.company.docNum = "ENV-001";
  policy.company.reviewDate = "2027-01-14";
  policy.company.reviewerDesignations = ["Environmental Manager", "Compliance Officer"];
  const markup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy }));
  const footer = markup.slice(markup.indexOf('class="policy-footer'));
  assert.match(footer, /Document No\.[\s\S]*ENV-001/);
  assert.match(footer, /Review[\s\S]*2027-01-14[\s\S]*Environmental Manager[\s\S]*Compliance Officer/);
  assert.match(footer, /Page[\s\S]*—/);
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
