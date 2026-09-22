import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { makeSamplePolicy } from "../store";
import { generatePreviewPdf } from "./print-document";

test("generatePreviewPdf retries when Chromium closes before newPage", async () => {
  const browserType = chromium as unknown as { launchPersistentContext: typeof chromium.launchPersistentContext };
  const originalLaunch = browserType.launchPersistentContext;
  let launchCount = 0;

  const page = {
    route: async () => undefined,
    setContent: async () => undefined,
    evaluate: async () => undefined,
    pdf: async () => Buffer.from("%PDF-1.4\n%%EOF", "ascii"),
  } as unknown as Page;

  browserType.launchPersistentContext = (async () => {
    const launchNumber = ++launchCount;
    return {
      newPage: async () => {
        if (launchNumber === 1) {
          throw new Error("browserContext.newPage: Target page, context or browser has been closed");
        }
        return page;
      },
      close: async () => undefined,
    } as unknown as BrowserContext;
  }) as typeof chromium.launchPersistentContext;

  try {
    const output = await generatePreviewPdf(makeSamplePolicy());
    assert.equal(output.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.equal(launchCount, 2, "the closed Chromium instance should be replaced once");
  } finally {
    browserType.launchPersistentContext = originalLaunch;
  }
});

test("generatePreviewPdf retries when page creation times out", async () => {
  const browserType = chromium as unknown as { launchPersistentContext: typeof chromium.launchPersistentContext };
  const originalLaunch = browserType.launchPersistentContext;
  let launchCount = 0;

  const page = {
    route: async () => undefined,
    setContent: async () => undefined,
    evaluate: async () => undefined,
    pdf: async () => Buffer.from("%PDF-1.4\n%%EOF", "ascii"),
  } as unknown as Page;

  browserType.launchPersistentContext = (async () => {
    const launchNumber = ++launchCount;
    return {
      newPage: async () => {
        if (launchNumber === 1) throw new Error("PDF page creation timed out");
        return page;
      },
      close: async () => undefined,
    } as unknown as BrowserContext;
  }) as typeof chromium.launchPersistentContext;

  try {
    const output = await generatePreviewPdf(makeSamplePolicy());
    assert.equal(output.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.equal(launchCount, 2, "the timed-out Chromium instance should be replaced once");
  } finally {
    browserType.launchPersistentContext = originalLaunch;
  }
});
