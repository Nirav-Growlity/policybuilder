import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright-core";
import { PolicyPreview } from "./policy-preview";
import { templatePreviewPolicy } from "../../lib/sample-policies";
import { createPrintDocument } from "../../lib/pdf/print-document";

function chromePath() {
  return process.env.POLICY_PDF_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
}

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
});
