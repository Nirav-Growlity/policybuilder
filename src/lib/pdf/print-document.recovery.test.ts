import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { makeSamplePolicy } from "../store";
import { generatePreviewPdf } from "./print-document";

test("generatePreviewPdf retries when Chromium closes before newPage", async () => {
  const browserType = chromium as unknown as { launch: typeof chromium.launch };
  const originalLaunch = browserType.launch;
  const disconnectBrowsers: Array<() => void> = [];
  let launchCount = 0;

  const page = {
    route: async () => undefined,
    setContent: async () => undefined,
    evaluate: async () => undefined,
    pdf: async () => Buffer.from("%PDF-1.4\n%%EOF", "ascii"),
  } as unknown as Page;

  browserType.launch = (async () => {
    const launchNumber = ++launchCount;
    let connected = true;
    disconnectBrowsers.push(() => { connected = false; });
    const browser = {
      isConnected: () => connected,
      close: async () => { connected = false; },
      newContext: async () => ({
        newPage: async () => {
          if (launchNumber === 1) {
            throw new Error("browserContext.newPage: Target page, context or browser has been closed");
          }
          return page;
        },
        close: async () => undefined,
      }),
    };
    return browser as unknown as Browser;
  }) as typeof chromium.launch;

  try {
    const output = await generatePreviewPdf(makeSamplePolicy());
    assert.equal(output.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.equal(launchCount, 2, "the closed Chromium instance should be replaced once");
  } finally {
    browserType.launch = originalLaunch;
    for (const disconnect of disconnectBrowsers) disconnect();
  }
});
