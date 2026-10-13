# Fastest HTML to PDF with identical Chromium output: libraries, services, techniques

Constraint: the layout engine stays the same Chromium/Blink build (same version and flags). Only the driver, pooling and hosting can change.

Scope note: primary sources were fetched where possible. Items marked **unverified** come from memory or from secondary sources and were not confirmed in this research. No measured latency figures from primary sources were found for any option, so the latency column is qualitative.

## Comparison table

| Option | Output identical with same Chromium? | Expected latency effect | Effort | Licence | Source / caveat |
|---|---|---|---|---|---|
| Keep Playwright, keep one long-lived browser, one new context or page per render | Yes (same binary and flags) | Removes the roughly 2 s launch per render. The printToPDF cost itself is unchanged. No measured number found. | Low | Apache-2.0 (unverified, from memory) | Playwright's PDF path is `crPdf.ts`: it sends `Page.printToPDF` with `transferMode: 'ReturnAsStream'`, forwards options unchanged, and defaults `tagged`/`outline` to false. [crPdf.ts](https://raw.githubusercontent.com/microsoft/playwright/main/packages/playwright-core/src/server/chromium/crPdf.ts) |
| Puppeteer / puppeteer-core `page.pdf()` | Yes | No measured difference from Playwright found. Puppeteer `page.pdf()` delegates to abstract `createPDFStream`; the concrete CDP call was not verified. | Medium (API migration) | Apache-2.0 (unverified) | [Page.ts](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/api/Page.ts). Only end-to-end comparisons exist: Checkly reports Puppeteer about 30% faster in 1000 runs of a login flow (not PDF); Better Stack reports 4.51 s Playwright vs 4.78 s Puppeteer. [Checkly](https://www.checklyhq.com/blog/puppeteer-vs-selenium-vs-playwright-speed-comparison), [Better Stack](https://betterstack.com/community/comparisons/playwright-vs-puppeteer/) |
| Raw CDP (chrome-remote-interface, or direct `Page.printToPDF`) | Yes | Removes the driver layer. Likely small gain; unmeasured. | High | MIT (unverified) | Only needed if the driver is the bottleneck. Protocol docs for `Page.printToPDF` could not be fetched (redirect page only). |
| puppeteer-cluster | Yes | Reuses browsers; default CONTEXT mode gives each job an isolated context. Avoids a custom pool. | Low to medium | MIT (verified) | [repo](https://github.com/thomasdondorf/puppeteer-cluster). Options: `maxConcurrency` (default 1), `retryLimit`, `timeout` (30 s), BROWSER mode for per-job browsers. Restarts browser after a crash. No memory-leak guidance. |
| generic-pool / node-pool (npm `generic-pool`) | Yes | Pure pooling; same gain as the warm-browser row. | Low | MIT (verified) | [repo](https://github.com/coopernurse/node-pool). Options: `min`, `max`, `idleTimeoutMillis`, `acquireTimeoutMillis`, `evictionRunIntervalMillis`. Last release date not visible. |
| Playwright `launchServer` / `connect` | Yes | Lets a separate process reuse a warm browser. | Medium | Apache-2.0 (unverified) | [docs](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-server). Docs do not cover PDF, whether clients share one browser, or what client `close()` does. Binding `host` to `0.0.0.0` exposes the RPC port. |
| Gotenberg (Chromium route) | Yes if its bundled Chromium build matches the one you use. Verify the version first. | Warm pool, HTTP service. Restart moved to after a request in v8.8.0, removing the start-of-request latency spike. | Low (HTTP API) | Not verified in this run | [config](https://gotenberg.dev/docs/configuration), [v8.8.0 notes](https://github.com/gotenberg/gotenberg/releases/tag/v8.8.0). Defaults: `--chromium-restart-after` 100 (0 disables), `--chromium-max-concurrency` 6, `--chromium-start-timeout` 20s, `--chromium-idle-shutdown-timeout` 0 (off), `--chromium-auto-start` false. Zombie processes on restart before 8.15.2. Chromium bumped per release (8.37.0 = 152.0.7977.82). |
| Browserless (self-hosted Docker `ghcr.io/browserless/chromium`) | Yes (bundled Chromium; version to verify) | Pre-booted/keep-alive not documented in fetched pages. Concurrency and queueing are supported. | Low to medium | SSPL-1.0 OR commercial licence. Free for non-commercial use; commercial use needs a licence. | [repo](https://github.com/browserless/browserless). Concurrency and timeouts are configurable (no env var name confirmed). |
| Cloudflare Browser Rendering `/pdf` (now "Browser Run") | Unknown: Chromium version and flags not published. Would need a diff test. | Hosted, no launch cost on your side. | Low | Proprietary | [/pdf docs](https://developers.cloudflare.com/browser-rendering/rest-api/pdf-endpoint/). Accepts `url` or `html`, 50 MB body limit, header/footer templates. Billing: 10 browser hours/month included on Workers Paid, then $0.09/hour. REST limit 600/min on Paid ([changelog](https://developers.cloudflare.com/changelog/2026-03-04-br-rest-api-limit-increase/)). Page count and file size not published. HTML leaves your infrastructure. |
| @sparticuz/chromium (AWS Lambda) | Not identical if PolicyCraft uses new headless. Bundled binary is `headless_shell`; the maintainer says it does not appear to support new headless. | No cold-start benchmarks published. Brotli inflation about 0.6 to 0.8 s. Recommends 512 MB minimum, 1600 MB recommended. | Low on Lambda | MIT | [README](https://github.com/Sparticuz/chromium/blob/master/README.md). Package follows Chromium releases, not semver: pin the version. npm package is x64 only; arm64 via `-min`. Playwright on warm Lambdas does not clean `/tmp` user-data-dir, causing `ERR_INSUFFICIENT_RESOURCES`. |
| chrome-headless-shell vs new headless | Not known. No primary source compares printToPDF output. | No primary numbers found. | Low (flag/channel change) | n/a | Chrome 132+: old headless only as standalone `chrome-headless-shell` ([docs](https://developer.chrome.com/docs/chromium/headless)). Playwright default headless = headless shell; `channel: 'chromium'` = new headless ([docs](https://playwright.dev/docs/browsers), [issue 33566](https://github.com/microsoft/playwright/issues/33566)). Must A/B test: same HTML, same printToPDF options, compare page count, sizes, fonts, text. |
| Pinned Chrome for Testing binary | Yes (same binary) | Only removes version drift. | Low | Chromium BSD-style | Fixing the binary is the only way to guarantee identical output across hosts. |

## Known issues and techniques

- **Long-lived Chrome, memory and disk.** Puppeteer reports from 2019 to 2022 include growing memory in a newPage/close loop and zombie Chrome processes after `close()` ([Lightrun mirror of Puppeteer issues](https://lightrun.com/answers/puppeteer-puppeteer-chrome-memory-leak), [zombie process](https://lightrun.com/answers/puppeteer-puppeteer-chrome-zombie-process-on-ubuntu)). Several were closed as stale without confirmed fixes. Default profiles go to the OS temp dir; cleanup after kill was added in Puppeteer v12 (changelog snippet only; the [troubleshooting page](https://pptr.dev/troubleshooting) was not fetched). Apify reports ENOSPC from `/tmp/puppeteer*` on long runs.
- **Gotenberg restart policy.** Default `chromium-restart-after` of 100 conversions. Gotenberg fixed a per-conversion network-map leak in 8.37.0 ([release](https://github.com/gotenberg/gotenberg/releases)).
- **Chromium image regression.** Red Hat bug 2357598: headless Chromium locks up on some images with Chromium 134 and 135, not 129 ([bugzilla](https://bugzilla.redhat.com/show_bug.cgi?id=2357598)). Relevant if the base64 images are unusual.
- **Lazy-loaded images.** An XWiki issue reports PDF export timing out for lazy-loaded images on later print pages, since the load event never fires for off-screen images ([XWiki Jira](https://jira.xwiki.org/browse/XWIKI-21974); the search also returned XWIKI-23346, which was not opened).
- **Slow PDF anecdote.** One jsreport user reports about 100 pages taking over 60 s in Chromium, while Prince took under 3 s ([jsreport forum](https://forum.jsreport.net/post/11847)). Single report, not verified.
- **Tagged PDF and outline.** Playwright defaults `tagged` and `outline` to false ([crPdf.ts](https://raw.githubusercontent.com/microsoft/playwright/main/packages/playwright-core/src/server/chromium/crPdf.ts)). Electron marks tagged PDF as experimental ([docs](https://electronjs.org/docs/latest/api/structures/print-to-pdf-options)). No slowdown report found. Turning them off changes output tags, so leave them off only if the output is already unchanged.
- **Header/footer templates.** No bug found. Inference: templates are laid out per page, so cost grows with page count. Measure with `displayHeaderFooter` on and off.
- **Base64 images and web fonts.** No crbug found tying data URIs or fonts to printToPDF slowness. Inference: large data URIs add parse time before print. Measure page load vs `page.pdf()` separately.
- **printBackground.** Playwright docs: off by default. Colours are also modified for print unless `-webkit-print-color-adjust: exact` is used ([Playwright docs](https://playwright.dev/docs/api/class-page#page-pdf)).

## Suggested next steps (inference)

1. Keep the current Chromium build. Move to one warm browser in the existing Playwright process, one context per render, and recycle after roughly 100 renders or on error (Gotenberg default).
2. Measure `launch` vs `newContext` vs `page.pdf` separately on the same HTML, cold and warm.
3. A/B the headless shell against new headless (`channel: 'chromium'`) on real PolicyCraft HTML before choosing a binary.
4. Only consider Gotenberg, Browserless or Cloudflare if the in-process pool is not enough, and check the Chromium version each one ships.

## Sources

- https://raw.githubusercontent.com/microsoft/playwright/main/packages/playwright-core/src/server/chromium/crPdf.ts
- https://playwright.dev/docs/api/class-page#page-pdf
- https://playwright.dev/docs/api/class-browsertype#browser-type-launch-server
- https://playwright.dev/docs/browsers
- https://github.com/microsoft/playwright/issues/33566
- https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/api/Page.ts
- https://gotenberg.dev/docs/configuration
- https://github.com/gotenberg/gotenberg/releases/tag/v8.8.0
- https://github.com/gotenberg/gotenberg/releases
- https://github.com/thomasdondorf/puppeteer-cluster
- https://github.com/coopernurse/node-pool
- https://github.com/browserless/browserless
- https://developers.cloudflare.com/browser-rendering/rest-api/pdf-endpoint/
- https://developers.cloudflare.com/changelog/2026-03-04-br-rest-api-limit-increase/
- https://github.com/Sparticuz/chromium/blob/master/README.md
- https://developer.chrome.com/docs/chromium/headless
- https://pptr.dev/troubleshooting
- https://bugzilla.redhat.com/show_bug.cgi?id=2357598
- https://forum.jsreport.net/post/11847
- https://electronjs.org/docs/latest/api/structures/print-to-pdf-options
- https://www.checklyhq.com/blog/puppeteer-vs-selenium-vs-playwright-speed-comparison
- https://betterstack.com/community/comparisons/playwright-vs-puppeteer/
