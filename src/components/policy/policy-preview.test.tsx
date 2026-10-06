import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright-core";
import sharp from "sharp";
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

test("custom cover background overscan hides narrow white source edges", async () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  const source = (await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="210" height="297"><rect width="210" height="297" fill="#176B45"/><rect width="0.6" height="297" fill="#fff"/><rect x="209.4" width="0.6" height="297" fill="#fff"/></svg>')).resize(2100, 2970).png().toBuffer()).toString("base64");
  policy.coverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "custom",
    background: { color: "#176B45", assetId: `data:image/png;base64,${source}`, fit: "contain", focalPoint: { x: 50, y: 50 } },
    elements: [],
  };
  policy.aiCoverComposition = undefined;
  policy.activeCoverVariant = "manual";
  const markup = renderToStaticMarkup(React.createElement(PolicyCoverPreview, { policy, showElements: false }));
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
    await page.setContent(markup);
    await page.addStyleTag({ content: "html,body{margin:0;width:210mm;height:297mm}.cover-preview-only{width:210mm!important;height:297mm!important}.policy-custom-cover{width:210mm!important;height:297mm!important}" });
    const png = await page.locator(".policy-custom-cover").screenshot();
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const sample = (x: number) => [...data.subarray((Math.floor(info.height / 2) * info.width + x) * info.channels, (Math.floor(info.height / 2) * info.width + x) * info.channels + 3)];
    assert.deepEqual(sample(0), [23, 107, 69], "left source edge should be covered by background overscan");
    assert.deepEqual(sample(info.width - 1), [23, 107, 69], "right source edge should be covered by background overscan");
  } finally {
    await browser.close();
  }
});

test("private cover and logo assets carry the selected organization in browser preview URLs", () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.coverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "custom",
    background: { color: "#FFFFFF", assetId: "/api/policycraft/cover-assets/background-id?orgId=12", fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [
      { id: "preview-image", type: "image", assetId: "image-id", x: 20, y: 30, width: 40, height: 15, rotation: 0, opacity: 1, zIndex: 20, visible: true, locked: false, fit: "contain", focalPoint: { x: 50, y: 50 }, altText: "Cover image" },
      { id: "preview-logo", type: "logo", assetId: "logo-id", x: 60, y: 30, width: 40, height: 15, rotation: 0, opacity: 1, zIndex: 25, visible: true, locked: false, fit: "contain", focalPoint: { x: 50, y: 50 }, altText: "Company logo" },
    ],
  };
  policy.activeCoverVariant = "manual";
  policy.aiCoverComposition = undefined;
  policy.company.companyLogo = "header-logo-id";
  const markup = renderToStaticMarkup(React.createElement(PolicyCoverPreview, {
    policy,
    assetScope: { userId: "manager-77", role: "manager", organizationId: 77, organizationName: "Northwind" },
  }));
  const fullMarkup = renderToStaticMarkup(React.createElement(PolicyPreview, {
    policy,
    assetScope: { userId: "manager-77", role: "manager", organizationId: 77, organizationName: "Northwind" },
  }));

  assert.match(markup, /(?:href|src)="\/api\/policycraft\/cover-assets\/background-id\?orgId=77"/);
  assert.match(markup, /(?:href|src)="\/api\/policycraft\/cover-assets\/image-id\?orgId=77"/);
  assert.match(fullMarkup, /(?:href|src)="\/api\/policycraft\/cover-assets\/header-logo-id\?orgId=77"/);
  assert.doesNotMatch(markup, /background-id\?orgId=12/);
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
  policy.aiCoverComposition = createAICoverComposition(policy, "data:image/png;base64,art", fallbackAICoverLayout(), { titleColor: "#27C5EC", brandColor: "#FFFFFF", headingFontFamily: "Fraunces", bodyFontFamily: "Public Sans" });
  policy.activeCoverVariant = "ai";
  const markup = renderToStaticMarkup(React.createElement(PolicyCoverPreview, { policy }));
  assert.match(markup, /data-cover-mode="custom"/);
  assert.match(markup, /policy-custom-cover-background/);
  assert.match(markup, /font-family:Fraunces/);
  assert.match(markup, /color:#27C5EC/);
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

test("professional acknowledgement preview and print match Word's field layout", async () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  const documentMarkups = [policy, {
    ...policy,
    employeeAcknowledgement: { employeeName: "Test Employee", employeeId: "QA-001", department: "Operations", date: "2026-10-06" },
  }].flatMap((casePolicy) => {
    const markup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy: casePolicy }));
    return [markup, createPrintDocument(markup, casePolicy)];
  });
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    for (const documentMarkup of documentMarkups) {
      const page = await browser.newPage({ viewport: { width: 980, height: 643 } });
      await page.setContent(documentMarkup);
      const layout = await page.evaluate(() => {
        const article = document.querySelector<HTMLElement>(".policy-preview-document");
        const form = document.querySelector<HTMLElement>(".policy-acknowledgement");
        const title = form?.querySelector<HTMLElement>("h2");
        const statement = form?.querySelector<HTMLElement>(":scope > p");
        const fields = form?.querySelector<HTMLElement>(".ack-fields");
        const field = fields?.querySelector<HTMLElement>(":scope > div");
        const label = field?.querySelector<HTMLElement>(":scope > span");
        const signature = fields?.querySelector<HTMLElement>(".ack-signature");
        const signatureLine = signature?.querySelector<HTMLElement>("i");
        const kicker = form?.querySelector<HTMLElement>(".ack-kicker");
        if (!article || !form || !title || !statement || !fields || !field || !label || !signature || !signatureLine || !kicker) throw new Error("Acknowledgement layout elements are missing");
        const formStyle = getComputedStyle(form);
        const titleStyle = getComputedStyle(title);
        const statementStyle = getComputedStyle(statement);
        const fieldsStyle = getComputedStyle(fields);
        const fieldStyle = getComputedStyle(field);
        const labelStyle = getComputedStyle(label);
        const signatureStyle = getComputedStyle(signature);
        const signatureLineStyle = getComputedStyle(signatureLine);
        const columns = fieldsStyle.gridTemplateColumns.split(" ").map(Number.parseFloat);
        const articleRect = article.getBoundingClientRect();
        const formRect = form.getBoundingClientRect();
        const fieldsRect = fields.getBoundingClientRect();
        const signatureRect = signature.getBoundingClientRect();
        const labels = Array.from(fields.querySelectorAll<HTMLElement>(":scope > div > span"));
        return {
          widthMatchesArticle: Math.abs(formRect.width - articleRect.width) < 1,
          startsAtArticleEdge: Math.abs(formRect.left - articleRect.left) < 1,
          titleFontSize: titleStyle.fontSize,
          titleAlignment: titleStyle.textAlign,
          statementAlignment: statementStyle.textAlign,
          expectedAlignment: article.dataset.contentAlignment,
          statementMaxWidth: statementStyle.maxWidth,
          kickerDisplay: getComputedStyle(kicker).display,
          formMargin: formStyle.margin,
          formPaddingTop: formStyle.paddingTop,
          formBorderWidth: formStyle.borderWidth,
          formBackground: formStyle.backgroundColor,
          fieldColumns: columns,
          fieldGap: fieldsStyle.columnGap,
          cellPadding: fieldStyle.padding,
          labelFontSize: labelStyle.fontSize,
          labelLetterSpacing: labelStyle.letterSpacing,
          labelMarginBottom: labelStyle.marginBottom,
          signatureColumn: signatureStyle.gridColumnStart,
          signatureLeftHalf: signatureRect.left < fieldsRect.left + fieldsRect.width / 2,
          signatureRuleWidth: signatureLineStyle.borderBottomWidth,
          labelPitchPt: labels.length > 2 ? (labels[2].getBoundingClientRect().top - labels[0].getBoundingClientRect().top) * .75 : 0,
          fieldRowGap: fieldsStyle.rowGap,
          fieldsMarginTop: fieldsStyle.marginTop,
        };
      });
      assert.equal(layout.widthMatchesArticle, true, "professional acknowledgement should use the full content width");
      assert.equal(layout.startsAtArticleEdge, true, "professional acknowledgement should not retain an outer inset");
      assert.equal(layout.titleFontSize, "24px", "professional acknowledgement title should be 18pt");
      assert.equal(layout.titleAlignment, layout.expectedAlignment);
      assert.equal(layout.statementAlignment, layout.expectedAlignment);
      assert.equal(layout.statementMaxWidth, "none");
      assert.equal(layout.kickerDisplay, "none");
      assert.match(layout.formMargin, /^0px/);
      assert.equal(layout.formBorderWidth, "0px");
      assert.equal(layout.formBackground, "rgba(0, 0, 0, 0)");
      assert.equal(layout.fieldColumns.length, 2);
      assert.ok(Math.abs(layout.fieldColumns[0] - layout.fieldColumns[1]) < 1, "acknowledgement columns should be equal");
      assert.equal(layout.fieldGap, "0px");
      assert.match(layout.cellPadding, /^8px 9\.3/);
      assert.equal(layout.labelFontSize, "9.33333px", "field labels should be 7pt");
      assert.equal(layout.labelLetterSpacing, "2.33333px", "field label spacing should match Word's 35 twips");
      assert.equal(layout.labelMarginBottom, "6.66667px", "field labels should use Word's 100-twip after spacing");
      assert.equal(layout.signatureColumn, "auto", "signature should occupy one field column");
      assert.equal(layout.signatureLeftHalf, true, "signature should stay in the left column");
      assert.equal(layout.signatureRuleWidth, "1px");
      assert.ok(Math.abs(layout.labelPitchPt - 50.2) < 1, `field label row pitch should match Word: ${layout.labelPitchPt}pt`);
      assert.equal(layout.fieldRowGap, "4.93333px", "field rows should match Word's measured row pitch");
      assert.equal(layout.fieldsMarginTop, "0px", "the first field row should follow the acknowledgement statement spacing");
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("quantitative table serial header is readable and keeps configured bullet markers", () => {
  const numberedPolicy = templatePreviewPolicy("standard-pack", "environmental");
  numberedPolicy.visualStyle = "corporate";
  numberedPolicy.listFormatting = { quantitativeGroups: "number" };
  const numberedMarkup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy: numberedPolicy }));
  const numberedHeader = numberedMarkup.match(/<table[^>]*data-target-table="true"[\s\S]*?<thead><tr><th>(.*?)<\/th>/)?.[1];
  assert.equal(numberedHeader, "Sr No.");
  assert.doesNotMatch(numberedHeader || "", /#/);

  const bulletPolicy = templatePreviewPolicy("standard-pack", "environmental");
  bulletPolicy.visualStyle = "corporate";
  bulletPolicy.listFormatting = { quantitativeGroups: "bullet" };
  const bulletMarkup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy: bulletPolicy }));
  const bulletHeader = bulletMarkup.match(/<table[^>]*data-target-table="true"[\s\S]*?<thead><tr><th>(.*?)<\/th>/)?.[1];
  assert.equal(bulletHeader, "•", "configured bullet headers should remain bullets");
});

test("author signature is rendered inside the existing employee signature field only", async () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.employeeAcknowledgement = {
    employeeName: "Asha Rao",
    employeeId: "EMP-041",
    department: "Operations",
    date: "2026-09-28",
  };
  const approval = {
    displayName: "Policy Author",
    date: "2026-09-28",
    signatureDataUrl: "data:image/png;base64,aGVsbG8=",
  };
  const markup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy, authorApproval: approval }));
  const model = buildDocumentRenderModel(policy, approval);

  assert.equal(model.acknowledgement?.authorApproval, approval);
  assert.deepEqual(model.acknowledgement?.fields.slice(0, 4).map(({ value }) => value), ["Asha Rao", "EMP-041", "Operations", "28-09-2026"]);
  const signatureField = markup.match(/<div class="ack-signature">[\s\S]*?<\/div>/)?.[0];
  assert.ok(signatureField, "the acknowledgement should retain its Signature field");
  assert.match(signatureField, /<span>Signature<\/span>/);
  assert.match(signatureField, /<img src="data:image\/png;base64,aGVsbG8=" alt="Signature"/);
  assert.match(signatureField, /data:image\/png;base64,aGVsbG8=/);
  assert.match(markup, /<div class="ack-field-value">Asha Rao<\/div>/);
  assert.match(markup, /<div class="ack-field-value">28-09-2026<\/div>/);
  assert.doesNotMatch(markup, /Policy Author|2026-09-28|Policy author|data-author-approval/);

  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    for (const documentMarkup of [markup, createPrintDocument(markup, policy)]) {
      const page = await browser.newPage();
      await page.setContent(documentMarkup);
      const signatureRule = await page.locator(".ack-signature-mark").evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: style.borderBottomWidth, style: style.borderBottomStyle };
      });
      assert.equal(signatureRule.width, "1px", "the signed acknowledgement should keep the field underline");
      assert.equal(signatureRule.style, "solid", "the signature underline should match the other field rules");
      await page.close();
    }
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

test("professional section headings exceed subsection headings in screen and print", async () => {
  const policy = templatePreviewPolicy("standard-pack", "environmental");
  policy.visualStyle = "modern";
  const markup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy }));
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    for (const documentMarkup of [markup, createPrintDocument(markup, policy)]) {
      const page = await browser.newPage({ viewport: { width: 980, height: 643 } });
      await page.setContent(documentMarkup);
      const styles = await page.locator(".policy-focus-list").first().evaluate((list) => {
        const section = list.closest(".policy-section");
        const headingNumber = section?.querySelector<HTMLElement>(".policy-section-heading > span");
        const headingTitle = section?.querySelector<HTMLElement>(".policy-section-heading h2");
        const tileNumber = list.querySelector<HTMLElement>(".policy-focus-item b");
        const tileTitle = list.querySelector<HTMLElement>(".policy-focus-item span");
        const objectiveGroup = document.querySelector<HTMLElement>('[data-collection="professional"] .policy-objective-groups > section');
        const objectiveNumber = objectiveGroup?.querySelector<HTMLElement>("header b");
        const objectiveTitle = objectiveGroup?.querySelector<HTMLElement>("header h3");
        const quantitativeRow = document.querySelector<HTMLElement>('[data-collection="professional"] .policy-modern-targets > div');
        const quantitativeNumber = quantitativeRow?.querySelector<HTMLElement>(":scope > b");
        const quantitativeTitle = quantitativeRow?.querySelector<HTMLElement>("h3");
        const responsibility = document.querySelector<HTMLElement>('[data-collection="professional"] .policy-responsibility-list > div');
        const responsibilityTitle = responsibility?.querySelector<HTMLElement>("h3");
        if (!headingNumber || !headingTitle || !tileNumber || !tileTitle || !objectiveNumber || !objectiveTitle || !quantitativeRow || !quantitativeNumber || !quantitativeTitle || !responsibility || !responsibilityTitle) throw new Error("professional numbered typography is missing");
        return {
          headingNumber: parseFloat(getComputedStyle(headingNumber).fontSize),
          headingTitle: parseFloat(getComputedStyle(headingTitle).fontSize),
          focusNumber: parseFloat(getComputedStyle(tileNumber).fontSize),
          focusTitle: parseFloat(getComputedStyle(tileTitle).fontSize),
          objectiveNumber: parseFloat(getComputedStyle(objectiveNumber).fontSize),
          objectiveTitle: parseFloat(getComputedStyle(objectiveTitle).fontSize),
          quantitativeNumber: parseFloat(getComputedStyle(quantitativeNumber).fontSize),
          quantitativeTitle: parseFloat(getComputedStyle(quantitativeTitle).fontSize),
          responsibilityTitle: parseFloat(getComputedStyle(responsibilityTitle).fontSize),
          focusRule: getComputedStyle(list.querySelector<HTMLElement>(".policy-focus-item")!).borderBottomWidth,
          objectiveRule: getComputedStyle(objectiveGroup!).borderTopWidth,
          quantitativeRule: getComputedStyle(quantitativeRow).borderTopWidth,
          responsibilityRule: getComputedStyle(responsibility).borderTopWidth,
        };
      });
      assert.equal(styles.headingNumber, styles.headingTitle, "professional section number and title should share a size");
      assert.ok(styles.headingTitle > styles.focusTitle, `section heading should exceed focus text: ${JSON.stringify(styles)}`);
      assert.equal(styles.objectiveNumber, styles.objectiveTitle, "qualitative group number and area heading should share a size");
      assert.ok(styles.headingTitle > styles.objectiveTitle, `section heading should exceed qualitative area heading: ${JSON.stringify(styles)}`);
      assert.equal(styles.quantitativeNumber, styles.quantitativeTitle, "quantitative group number and area heading should share a size");
      assert.ok(styles.headingTitle > styles.quantitativeTitle, `section heading should exceed quantitative area heading: ${JSON.stringify(styles)}`);
      assert.ok(styles.headingTitle > styles.responsibilityTitle, `section heading should exceed responsibility heading: ${JSON.stringify(styles)}`);
      assert.equal(styles.focusRule, "0px", "focus rows should not have decorative separators");
      assert.equal(styles.objectiveRule, "0px", "qualitative groups should not have decorative separators");
      assert.equal(styles.quantitativeRule, "0px", "quantitative groups should not have decorative separators");
      assert.equal(styles.responsibilityRule, "0px", "responsibility entries should not have decorative separators");
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
    const journalPolicy = templatePreviewPolicy("operations-guide", "environmental");
    journalPolicy.visualStyle = "modern";
    const journalMarkup = renderToStaticMarkup(React.createElement(PolicyPreview, { policy: journalPolicy }));
    for (const documentMarkup of [journalMarkup, createPrintDocument(journalMarkup, journalPolicy)]) {
      const page = await browser.newPage({ viewport: { width: 980, height: 643 } });
      await page.setContent(documentMarkup);
      const separatorWidth = await page.locator('[id$="-quantitative"] .policy-journal-targets > div').first().evaluate((row) => getComputedStyle(row).borderTopWidth);
      assert.equal(separatorWidth, "0px", "journal quantitative rows should not have decorative separators");
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
