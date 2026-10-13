# Design-mode PDF preview performance

Research date: 2026-10-12

## TL;DR

The 2–5 s comes from a server-side Chromium print, not from `@react-pdf`. `@react-pdf/renderer` is installed but nothing imports it. Every preview goes to `POST /api/export/pdf`, which launches a fresh Chrome process (`launchPersistentContext` with a new profile directory) and prints the `PolicyPreview` HTML with `page.pdf()`. When a custom or AI cover is involved, it launches a second Chrome process to screenshot the cover, then post-processes the result with pdf-lib. On the client, an 800 ms debounce runs before any of this starts. On this workstation:

- the 9-page sample document takes **~1.75–2.3 s** on the server;
- the same document with a custom cover takes **~4.3 s** whenever the theme changes, and ~2.7 s when the cover cache hits.

Adding the debounce gives **~2.9 s to ~5.4 s** of perceived delay, which matches the complaint.

The fastest fix that keeps the output identical is to stop starting Chrome on every render. Keep one warm browser and open a new, isolated `BrowserContext` for each render. That is how the code worked before commit `f4e9878`. In my measurement this cut server time from **~1.9 s to ~1.1 s**. Reusing a warm page as well brought it to **~0.65 s**. In both cases the per-page drawing operators and text positions matched the current output exactly. Next:

- shorten or remove the debounce for discrete Design controls;
- cancel stale renders so rapid changes don't queue up behind the serialized render lock;
- rasterize the cover in the same warm browser.

Together these should bring a typical design change to **about 1 s** with byte-for-byte the same pipeline and visually identical output.

Chromium print alone cannot get to "instant" (under 300 ms): `page.pdf()` by itself costs ~0.5 s for this document. Truly instant updates need a second tier: a client-side HTML "draft" preview built from the same `PolicyPreview` component, shown at once and swapped for the real PDF when it arrives. The draft would be close, but not guaranteed identical, so the "Matches download" label must apply only to the PDF. Switching PDF engines (react-pdf, Typst, WeasyPrint, Vivliostyle, pdfme and others) would change the output and fails the hard constraint.

## Current pipeline (from the code)

### Trigger and client request

1. Design mode mounts `DebouncedPolicyPreview` for the whole `policy` object ([shell.tsx:316](../src/components/builder/shell.tsx)). The Write-mode live preview uses it too (line 352).
2. `DebouncedPolicyPreview` holds every change for `LIVE_PREVIEW_DEBOUNCE_MS = 800` ([live-preview.tsx:10](../src/components/builder/live-preview.tsx), used at line 36). Toggles and template clicks are discrete changes, but they wait 800 ms just like keystrokes.
3. `PdfPolicyPreview` serializes the entire policy and scope into the request `body`, and into a cache `key` ([pdf-policy-preview.tsx:18-19](../src/components/policy/pdf-policy-preview.tsx)). Any field change produces a new key, so the whole document is regenerated. There is no section- or page-level reuse.
4. The request effect ([pdf-policy-preview.tsx:38-57](../src/components/policy/pdf-policy-preview.tsx)) calls `requestPolicyPreview`. Its cleanup only sets `disposed = true` and never aborts the fetch. `requestPolicyPreview` ([policy-preview-request.ts:38-73](../src/lib/pdf/policy-preview-request.ts)) keeps a 6-entry client LRU (line 13) and dedupes in-flight requests by key. Its only abort signal is a 150 s timeout (lines 14, 55). A superseded request therefore keeps running on the server.

### Server render

5. `POST /api/export/pdf` ([route.ts:10-14](../src/app/api/export/pdf/route.ts)) authenticates and resolves the organization, then resolves cover and logo assets from MySQL. Assets come back as base64 data URLs ([policycraft-export.ts:64](../src/lib/policycraft-export.ts), [cover-repository.ts:39-67](../src/lib/cover-repository.ts)). Both the manual and the AI cover compositions are resolved on every request, even though only one is active.
6. `generatePdf` keeps a 4-entry process LRU keyed by the full policy JSON ([generate.tsx:8-25](../src/lib/pdf/generate.tsx)). This only helps when the user returns to an exact previous state. Signed previews bypass it (line 14).
7. `generatePreviewPdf` runs every render behind one global promise queue ([print-document.tsx:14, 24-34, 204-211](../src/lib/pdf/print-document.tsx)). Renders are strictly serialized across all users, and stale ones are never dropped.
8. Steps inside one render ([print-document.tsx:44-108](../src/lib/pdf/print-document.tsx)):
   - If the active cover has a composition, `getCachedCustomCoverPng` rasterizes it. The 8-entry cache key includes the whole `model.theme` and typography (lines 110-127), so **any colour or template change re-rasterizes the cover**. Rasterizing ([lines 129-159](../src/lib/pdf/print-document.tsx)) launches **a second Chrome process**, sets a 794×1123 viewport and takes `locator.screenshot({ type: "png" })`.
   - `renderToStaticMarkup(<PolicyPreview …/>)`, then `inlinePublicAssets` re-reads fonts and images from `public/` on every render and inlines them as base64 (lines 65, 320-333). The sample markup is ~752 KB.
   - `createPdfContext` calls `chromium.launchPersistentContext(<new tmp profile dir>)` (line 217). That starts **a full browser per render**. Closing it also deletes the profile directory (lines 171-189).
   - `page.setContent(createPrintDocument(...))`, then the code waits for `document.fonts.ready` and decodes every image (lines 76-80). The print CSS lives in `createPrintDocument` (lines 335-373).
   - `page.pdf()` with A4, `preferCSSPageSize`, and header/footer templates for the logo, document number, review date and "Page X / Y" (lines 97-101).
   - `finalizePdf` (lines 294-302) runs pdf-lib `load`/`save`. It paints a native background shading, overlays the cover PNG on page 1 and draws page borders.
   - The cover PNG is embedded twice: once as an `<img>` in the Chromium page ([policy-preview.tsx:125-126](../src/components/policy/policy-preview.tsx)) and again as the pdf-lib full-page overlay. This is why the PDF with a cover is ~3.9 MB, against 0.2 MB without one.

### Client display

9. `PdfPages` calls `pdfjs.getDocument` for every new byte array ([pdf-policy-preview.tsx:126-139](../src/components/policy/pdf-policy-preview.tsx)). It sets only `workerSrc = "/api/pdf-worker"` and no `workerPort` or shared `PDFWorker`. In pdfjs-dist 5.7.284, `getDocument` then calls `PDFWorker.create` without a cached port, so **each preview spins up a new worker**. The worker script is read from disk per request but browser-cached for an hour ([pdf-worker/route.ts](../src/app/api/pdf-worker/route.ts)).
10. The display is already well optimized:
    - pages mount lazily through an `IntersectionObserver` (lines 144-166);
    - the previous PDF stays visible under an overlay while the new one paints off-screen (lines 64-66, 99-101);
    - each page renders into a detached canvas and swaps in atomically (lines 240-261).

    One remaining cost: `getTextContent` and `TextLayer.render` finish before the swap (lines 250-261), which delays the moment the new pixels appear.

### DOCX

11. DOCX comes from a separate generator built on the shared `buildDocumentRenderModel` ([docx/generate.ts:42, 77](../src/lib/docx/generate.ts); [docx route.ts:13](../src/app/api/export/docx/route.ts)). It does not use the HTML or PDF path. **None of the preview optimizations below touch DOCX output**, provided `document-render-model.ts` and `lib/docx/` are left unchanged.

### Measured time breakdown

I measured with scratch scripts outside `src/`. They imported the real `print-document.tsx` and `PolicyPreview`, used `makeSamplePolicy()` (9 pages), and ran local Chrome stable on this Windows workstation, four runs each. These numbers come from a dev box, not production or Vercel.

| Stage | Today (cold Chrome per render) | Warm browser, new context | Warm browser, reused page |
|---|---|---|---|
| React SSR + inline assets | 20–35 ms | 20–40 ms | 20–35 ms |
| Launch Chrome / create context | **560–860 ms** | 7–16 ms | 0 |
| `newPage` | 90–155 ms | 150–240 ms | 0 |
| `setContent` (752 KB) | 115–215 ms | 150–205 ms | 43–150 ms |
| fonts + image decode | 45–75 ms | 40–60 ms | 2–45 ms |
| `page.pdf()` | 545–610 ms | 510–660 ms | 510–570 ms |
| pdf-lib load+save | 47–87 ms | 30–82 ms | 36–65 ms |
| close (+ profile `rm`) | **230–275 ms** | 34–51 ms | 0 |
| **Total server render** | **1.75–2.3 s** | **0.98–1.2 s** | **0.63–0.85 s** |

With a custom cover, using `generatePreviewPdf` as it is today:

- **~4.3 s** after a theme change: the cover is re-rasterized in a second cold Chrome, and the ~2–4 MB PNG is embedded twice.
- **~2.7 s** when only non-theme fields change and the cover cache hits.

Embedding a 2.15 MB photo-like cover PNG with pdf-lib alone cost ~60–140 ms, plus ~250–290 ms for `save()`.

On the client, pdf.js (Node legacy build, no canvas) opened the PDF and built page 1's operator list and text in ~40–110 ms. Real canvas paint, worker start-up and text-layer layout come on top, so ~0.1–0.3 s in total is a reasonable estimate for the first visible page. I did not measure this in a browser.

**Where the 2–5 s goes:**

| Stage | Time |
|---|---|
| Debounce | 0.8 s |
| Chrome launch + teardown | ~0.8–1.1 s, or ~1.6–2.2 s when a cover is re-rasterized |
| Chromium layout + print (`page.pdf`) | ~0.55 s |
| Cover double-embed and PDF size | ~0.3–0.7 s |
| Client paint | ~0.2 s |
| Queued stale renders | can add a whole extra render per superseded change |

Font registration, React SSR, asset inlining and pdf.js page rendering are minor costs.

**Fidelity check for the warm-browser options.** I printed the same HTML three ways: a cold persistent context, a warm browser with a new context, and a warm reused page. For each page I hashed pdf.js `fnArray` (the drawing-operator sequence) together with every text item's string, transform and width. **All three gave identical per-page hashes on all 10 pages.** The raw bytes differ between any two Chromium prints, because of creation timestamps and font-subset and object naming. A rasterized pixel diff across the full template set (`.theme-qa/templates/*`) should be part of acceptance before shipping.

## Options compared

"Identical" below means the same Chromium print of the same HTML and the same pdf-lib post-processing, so exported PDF and DOCX appearance cannot change.

| # | Option | Gain (est.) | Output identical? | Effort | Main risk |
|---|---|---|---|---|---|
| 1a | Warm shared Chromium, new `BrowserContext` per render | −0.8 to −1.1 s per render; −0.7 s more on cover re-raster | **Yes** (verified ops/text) | Low | Browser health and recycling; memory on serverless |
| 1b | Warm page reuse (per-tenant page pool) | additional −0.3 to −0.4 s | **Yes** (verified ops/text) | Low–Med | Tenant isolation hygiene; leaked state |
| 1c | Cancel/coalesce stale renders (client `AbortController` + server skip-if-aborted, keep latest per scope) | removes queued extra renders (seconds under rapid edits) | **Yes** | Low | Correct interaction with in-flight dedupe |
| 1d | Shorter/no debounce for discrete Design controls (keep 800 ms for typing) | −0.65 to −0.8 s | **Yes** | Low | More server load (mitigated by 1c) |
| 1e | Rasterize cover in the warm browser; audit cover cache key to cover-relevant inputs | −0.7 to −1.6 s when theme changes with a cover | **Yes**, if the key still captures everything the cover renders | Low–Med | A too-narrow key would show a stale cover |
| 1f | Don't embed the cover twice (blank placeholder `<img>` of same box under the pdf-lib overlay) | smaller PDF (~halves), less print/save/transfer time | Visually yes; bytes and file size change | Low | Must keep the fallback when rasterization fails |
| 1g | Cache inlined public assets and resolved cover assets in memory | tens of ms; fewer DB blob reads | **Yes** | Low | Cache invalidation per org |
| 2a | pdf.js: one shared worker (`workerPort`/`PDFWorker`) | ~50–150 ms per update (estimate) | **Yes** (display only) | Low | Worker lifecycle on unmount |
| 2b | pdf.js: commit canvas first, text layer after | earlier pixels | **Yes** (display only) | Low | Brief window with no text selection |
| 2c | OffscreenCanvas / HWA | small; already default in the worker | **Yes** | Low | Little left to gain |
| 3 | Instant HTML draft preview (same `PolicyPreview` + print CSS, optionally Paged.js), PDF swapped in later | perceived ≈ instant | Draft **not guaranteed**; export unchanged | Med–High | Draft/PDF drift; user trust |
| 4 | Switch engine (react-pdf, Typst, WeasyPrint, Vivliostyle, pdfme, commercial) | varies | **No**: different layout engines | High | Visual regression on every template |

### 1. Optimize the existing pipeline (Chromium + pdf-lib, not react-pdf)

The task brief assumed `@react-pdf`. It is a dependency (installed v4.9.0), but no file under `src/` imports it, so its tuning knobs do not apply here. Its own guidance is useful context all the same:

- whole-document recomputation "can be an expensive operation", which is why its `usePDF` hook exposes an explicit `update` ([react-pdf on-the-fly rendering](https://react-pdf.org/docs/v4/advanced/on-the-fly-rendering));
- for large documents the maintainers recommend a Web Worker. Total generation time stays the same, but the UI stays responsive. Fonts must be registered inside the worker ([react-pdf blog, "large documents in the browser"](https://react-pdf.org/blog/large-documents-in-the-browser)).

**1a. Warm browser + isolated contexts.**

- Playwright documents that `launchPersistentContext` "launches browser that uses persistent storage located at userDataDir and returns the only context", and that closing that context closes the browser ([Playwright BrowserType](https://playwright.dev/docs/api/class-browsertype)). So today's code starts and stops a full Chrome per render, and twice when a cover is involved.
- Playwright describes contexts as "fast and cheap to create and are completely isolated, even when running in a single browser" ([Playwright browser contexts](https://playwright.dev/docs/browser-contexts)). A shared `chromium.launch()` plus `browser.newContext()` per render keeps per-render isolation of cookies, storage and cache.
- This is essentially the design before `f4e9878` ("Isolate PDF renders in disposable Chromium contexts"). That commit removed the shared browser and its `resetPdfBrowser` recycling. The commit message does not record the incident that motivated it, which is an open question below.
- Serverless detail: `@sparticuz/chromium` decompresses Chromium to `/tmp` on first use and reuses it on warm starts. Its README warns that Playwright does not clean up its user-data directory between invocations on a warm Lambda ([Sparticuz/chromium](https://github.com/Sparticuz/chromium)), which may be why a per-render temp profile was introduced. `chromium.launch()` manages its own temporary profile. Recycling the browser every N renders, or on any recoverable error, should keep `/tmp` bounded.
- Keep the existing timeout and retry wrappers, but make a timeout recycle the shared browser, as the earlier code did. In `next dev`, keep the browser handle on `globalThis` so hot-module reloads don't leak Chrome processes.

**1b. Page reuse.** Re-running `setContent` on a warm page skips `newPage` and lets Chromium keep decoded fonts warm (measured ~0.65 s). Fonts and images are inlined data URLs and network access is aborted, so reuse should carry no cross-document leak into output. My operator and text check matched. For tenant hygiene, pool pages per organization scope, or reset to `about:blank` between renders and recycle the pool periodically.

**1c. Stale-render cancellation.** Today a superseded preview keeps its place in the global serialized queue ([print-document.tsx:204-211](../src/lib/pdf/print-document.tsx)), and the client never aborts it ([pdf-policy-preview.tsx:41-53](../src/components/policy/pdf-policy-preview.tsx)). If the user clicks three design options quickly, the server prints all three in sequence before the last one appears. To fix it:

- the client passes an `AbortController` signal to `fetch`, aborting only when no other consumer awaits the same deduped promise;
- the route checks `req.signal.aborted` before it starts the queued Chromium work;
- optionally, the queue keeps only the newest pending job per user and organization scope.

None of this changes the output.

**1d. Debounce.** The 800 ms comment in [live-preview.tsx:7-10](../src/components/builder/live-preview.tsx) is about typing. Design-mode controls are discrete commits. A 0–150 ms delay for those removes most of the 0.8 s without increasing load, once 1c is in place.

**1e. Cover rasterization.** Render the cover screenshot in a page of the same warm browser, or of the same context, instead of a second `launchPersistentContext` ([print-document.tsx:131](../src/lib/pdf/print-document.tsx)). Separately, check whether the cover cache key really needs the entire `model.theme` (lines 111-117). It should contain exactly what `PolicyCoverPreview` reads, or a cover stays visibly identical while being re-rasterized on unrelated theme changes. Narrow it only with tests that prove the cover depends on nothing else.

**1f. Double-embedded cover.** When `customCoverData` exists, the same PNG goes into the HTML `<img>` and is then overlaid full-page by pdf-lib (`drawCustomCover`). The overlay covers the whole page, so passing a same-size transparent placeholder to the HTML step would leave every pixel the same while roughly halving the PDF. It would also cut Chromium's image re-encode, pdf-lib `save`, transfer and pdf.js decode. This changes bytes and file size but not appearance; confirm with a pixel diff. Keep the in-flow fallback for when rasterization fails.

### 2. pdf.js display

The component already does most of what pdf.js allows: lazy page mounting, double buffering into a detached canvas, and atomic swaps.

- pdf.js documents `isOffscreenCanvasSupported` (default `true` on the web) and `enableHWA` (default `false`) ([pdf.js `api.js`](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js)). Little is left to gain there.
- The remaining wins are small: create one `PDFWorker` or `GlobalWorkerOptions.workerPort` for the session, so each preview doesn't spawn a worker; and commit the canvas before `getTextContent` and `TextLayer.render`.
- `PDFWorker.create` reuses a worker only when it is given the same `port` ([pdf.js `api.js`](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js); pdfjs-dist 5.7.284 `build/pdf.mjs`, `PDFWorker.create`).

Expect about 0.1–0.2 s at most. The bottleneck is the server.

### 3. Two-tier preview: instant HTML draft + background true PDF

The PDF is already Chromium printing the `PolicyPreview` React tree with the `createPrintDocument` print CSS ([print-document.tsx:335-373](../src/lib/pdf/print-document.tsx)). So the browser can render the *same component and the same CSS* instantly in a sandboxed iframe, with no server round-trip.

What makes the draft differ from the PDF:

- **Pagination.** Screen rendering does not fragment into A4 pages the way print does. Paged.js can paginate in the browser. It implements CSS Paged Media, Generated Content for Paged Media and Fragmentation using CSS columns ([Paged.js big picture](https://pagedjs.org/en/documentation/1-the-big-picture/)), but its break decisions come from its own column-based chunker, not from Chromium's print fragmentation. Page breaks can therefore fall differently, especially with `orphans`/`widows`, tables and `break-inside` rules. Paged.js is MIT-licensed; the npm package is at 0.4.x and the project describes a next-generation rewrite ([Paged.js next](https://pagedjs.org/posts/paged.js-next-an-introduction)).
- **Running header and footer.** These are Playwright `headerTemplate`/`footerTemplate` strings ([print-document.tsx:97-101](../src/lib/pdf/print-document.tsx)), and Playwright says page styles are not visible inside templates ([Playwright `page.pdf`](https://playwright.dev/docs/api/class-page#page-pdf)). The draft would need CSS equivalents, such as page margin boxes, which Chrome supports from 131 ([Chrome for Developers: print margins](https://developer.chrome.com/blog/print-margins)), or Paged.js margin boxes.
- **pdf-lib post-processing.** Full-bleed background shading, page borders and the cover overlay ([print-document.tsx:226-302](../src/lib/pdf/print-document.tsx)) need CSS look-alikes.

Keeping it in sync: the draft must use `PolicyPreview` plus `createPrintDocument`'s CSS as its only source, never a fork. A visual-regression test should compare the draft against the PDF across the template set. Show it as "Draft — updating PDF", and keep "Matches download" for the real PDF. This tier gives truly instant feedback. It does not change exports, but the draft itself is not guaranteed pixel-identical.

### 4. Alternative engines (single source of truth)

Each of these replaces Chromium's layout. Moving to any of them means re-implementing nine-plus templates (`policy-preview.tsx` alone uses `grid` ~96 times), and output would change.

| Engine | How it renders | Compatibility with the hard constraint |
|---|---|---|
| `@react-pdf/renderer` | Own primitives and layout. Its styling page lists Flexbox, Layout and other groups but no grid ([react-pdf styling](https://react-pdf.org/styling)). | No |
| Typst via typst.ts | Typst compiled to WASM, rendering to SVG or canvas in the browser, with an incremental server mode. Apache-2.0, pre-1.0 JS API ([typst.ts](https://github.com/Myriad-Dreamin/typst.ts)). Fast incremental preview, but a completely different typesetting language and engine. | No |
| WeasyPrint | Python. "not on a full rendering engine like WebKit or Gecko" ([WeasyPrint README](https://github.com/Kozea/WeasyPrint)). Flex is "not deeply tested" and grid has limitations ([API reference](https://doc.courtbouillon.org/weasyprint/stable/api_reference.html)). | No |
| Vivliostyle | CSS typesetting with a browser Viewer and a CLI (AGPL-3.0) ([docs](https://docs.vivliostyle.org/en/), [CLI](https://github.com/vivliostyle/vivliostyle-cli)). Its pagination differs from native Chrome print. | No |
| pdfme | JSON-template PDF generator with a designer, MIT ([pdfme](https://github.com/pdfme/pdfme)). A form-style model, not flowing documents. | No |
| Nutrient / Apryse WebViewer (commercial) | Primarily viewers or SDKs. Replacing pdf.js would not touch the server-side bottleneck. Not evaluated further. | n/a |

None of these is a credible path under the "exactly the same output" constraint. They would only make sense for a deliberate redesign of the document system.

## Recommended path

Ranked by "fastest win that keeps output identical":

1. **Warm Chromium with an isolated context per render (1a), and the cover rasterized in that same browser (1e, first half).** Measured server time drops from ~1.9 s to ~1.1 s, and the cover re-raster case loses another ~0.7 s or more. Restore browser recycling on recoverable errors and every N renders.
2. **Cancel and coalesce stale renders (1c), and use a short delay for discrete Design controls (1d).** This removes up to 0.8 s of dead time and stops rapid changes from stacking behind the global queue.
3. **Then add page reuse (1b), the cover de-duplication (1f), asset caches (1g) and the pdf.js worker/text-layer tweaks (2a, 2b).** These bring the server to ~0.65 s for this document and shrink cover PDFs. Expected perceived update: **~0.9–1.3 s** without a cover and ~1.5 s with a cover re-raster, down from ~2.9–5.4 s.
4. **If ~1 s is still not "instant" enough, build the two-tier HTML draft (3).** Show it immediately and swap in the true PDF. Only this delivers sub-300 ms feedback, and only for the draft.
5. **Do not switch PDF engines (4).** Every candidate changes output.

Acceptance check for steps 1–3: for every `.theme-qa/templates/*` case, with and without a logo, cover, border and background, compare old and new PDFs. Use per-page pdf.js operator and text signatures (the method used here, extending [layout.test.ts](../src/lib/pdf/layout.test.ts)) plus a rasterized pixel diff. DOCX needs no re-check unless `document-render-model.ts` or `lib/docx/` changes.

## Open questions and risks

- **Why `f4e9878` moved to a per-render persistent context.** The candidates are the `/tmp` profile growth the Sparticuz README warns about, a crash, or a cross-tenant concern. The warm-browser design must address whatever it was. Ask before reverting.
- **Production host.** These numbers come from local Chrome on Windows. On Vercel with `@sparticuz/chromium`, cold launches are likely slower, so a warm browser saves more. A warm browser only lives as long as a warm function instance, though, and memory guidance is ≥512 MB, with 1600 MB recommended ([Sparticuz/chromium](https://github.com/Sparticuz/chromium)). Self-hosted Node keeps it warm indefinitely.
- **Concurrency.** The global serialized queue serializes all users. With a warm browser, a small pool (2–3 contexts) could replace strict serialization. Keep strict serialization on serverless if reliability was the original reason.
- **Tenant isolation with page reuse.** Pool per organization scope, or prefer new-context-per-render (1a), which is already most of the gain.
- **Cover cache-key narrowing.** This is safe only if tests prove what the cover depends on. Otherwise keep the full key and take only the in-browser raster gain.
- **Draft preview UX.** If tier 3 ships, product must accept that a draft can briefly differ, for example in a page break, from the PDF that replaces it.
- **Not measured:** browser-side pdf.js paint time, production network transfer of ~4 MB cover PDFs, and AI covers with real generated artwork (1024×1456, [lib/ai/cover.ts:9](../src/lib/ai/cover.ts)).

No application code, environment files, database or production services were changed for this research note. The benchmarks ran from a scratch directory against the local code and local Chrome.

## Sources

- [Playwright BrowserType API](https://playwright.dev/docs/api/class-browsertype): `launchPersistentContext` launches a browser and returns its only context; closing it closes the browser.
- [Playwright browser contexts](https://playwright.dev/docs/browser-contexts): contexts are fast, cheap and isolated within one browser.
- [Playwright `page.pdf`](https://playwright.dev/docs/api/class-page#page-pdf): print media, header/footer template classes, template style limits.
- [Sparticuz/chromium README](https://github.com/Sparticuz/chromium): `/tmp` extraction, Playwright user-data-dir cleanup warning, memory guidance.
- [pdf.js `src/display/api.js`](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js): `isOffscreenCanvasSupported`, `enableHWA`, `PDFWorker` port reuse, render parameters.
- [react-pdf on-the-fly rendering](https://react-pdf.org/docs/v4/advanced/on-the-fly-rendering): `usePDF` update semantics and cost.
- [react-pdf blog: large documents in the browser](https://react-pdf.org/blog/large-documents-in-the-browser): worker recommendation and constraints.
- [react-pdf styling](https://react-pdf.org/styling): supported style model.
- [Paged.js: the big picture](https://pagedjs.org/en/documentation/1-the-big-picture/) and [Paged.js next](https://pagedjs.org/posts/paged.js-next-an-introduction): polyfill model and column-based fragmentation.
- [Chrome for Developers: print margins](https://developer.chrome.com/blog/print-margins): CSS page margin boxes from Chrome 131.
- [typst.ts](https://github.com/Myriad-Dreamin/typst.ts): WASM Typst compile and render, licence, maturity.
- [WeasyPrint README](https://github.com/Kozea/WeasyPrint) and [API reference](https://doc.courtbouillon.org/weasyprint/stable/api_reference.html): own layout engine, flex and grid limits.
- [Vivliostyle docs](https://docs.vivliostyle.org/en/) and [Vivliostyle CLI](https://github.com/vivliostyle/vivliostyle-cli): Viewer and CLI, AGPL-3.0.
- [pdfme](https://github.com/pdfme/pdfme): template-based generator, MIT.
