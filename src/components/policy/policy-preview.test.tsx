import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright-core";
import { PolicyPreview } from "./policy-preview";
import { templatePreviewPolicy } from "../../lib/sample-policies";

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
