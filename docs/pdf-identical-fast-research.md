# Faster PDF and DOCX with zero visual change

Research date: 2026-10-12. Follows [pdf-preview-performance-research.md](pdf-preview-performance-research.md) and [pdf-instant-preview-research.md](pdf-instant-preview-research.md). The question here is narrower: **which changes make generation faster while the PDF and DOCX stay visually identical?** Raw notes from the eight research passes, with sources and benchmark details, are in [pdf-identical-fast-research/](pdf-identical-fast-research/). The benchmark scripts lived in a session scratch folder and are not committed.

All timings are medians from this Windows workstation, using the 9-page `makeSamplePolicy()` and local Chrome stable. Several benchmarks ran at the same time, so run-to-run noise was up to about ±50%. Treat the numbers as directional, not production figures.

## TL;DR

With Chromium kept as the layout engine, which the identical-output rule requires, the answer depends on what changed:

| Change in Design mode | Today (perceived) | Achievable with identical output | How |
|---|---|---|---|
| Background, gradient, border colour, border scope | 2.9–5.4 s | **about 0.1 s** (no cover), about 0.4 s with a cover | Skip Chromium; redo only the pdf-lib finishing step on the cached Chromium PDF |
| Returning to a state already rendered (undo, toggling back, a template seen in the gallery) | 2.9–5.4 s | **instant** (cache hit) | Cache keyed on the inputs that actually affect output, plus prefetching gallery templates |
| Cover swap or edit | 2.9–5.4 s | about 0.9 s | Re-rasterize only the cover; the body PDF is reused |
| Palette colours | 2.9–5.4 s | about 0.1–0.4 s *if* the colour-rewrite path is proven; otherwise about 1.2 s | Rewrite colour placeholders in a cached PDF (conditional), or a warm reprint |
| Fonts, spacing, alignment, border width or inset, logo, TOC and other toggles, list markers, content | 2.9–5.4 s | **about 1–1.3 s** | Warm Chromium with a reused page; no 800 ms debounce for clicks; cancel stale renders |
| DOCX export, photo cover | about 2.1–2.4 s | about 0.55–0.65 s | Store images uncompressed in the zip, cache the cover PNG and fonts |
| DOCX export, no or default cover | 0.07–0.2 s | already fast | — |

**The floor for layout changes is Chromium's print step**: about 0.8–1.4 s for 9 pages, roughly 0.2 s fixed plus 0.1 s per page. The header and footer templates add about 0.34 s ([08 notes](pdf-identical-fast-research/08-bench-chromium.md)). Nothing found makes Chromium print faster without changing output. Other drivers, pools and PDF libraries offer no measured gain ([12](pdf-identical-fast-research/12-libs-chromium.md), [13](pdf-identical-fast-research/13-libs-pdf.md)), and other engines change the layout ([previous report](pdf-instant-preview-research.md)).

So identical output makes about half the Design controls near-instant, and the rest take about 1 s, down from 3–5 s. Making the layout changes instant as well requires the two-tier draft preview from the previous report, where the preview shown is not the PDF until it has been verified.

## Proof standard

"Identical" here means three checks, each passing at zero tolerance ([15 notes](pdf-identical-fast-research/15-verification.md), used by benchmarks 08–10):

1. **The same drawing steps and text positions** on every page (pdf.js operators and text).
2. **The same arguments for every step**: coordinates, colours, image and font references, and font names. pdf.js object IDs are normalised.
3. **A pixel-identical render** of every page (pdf.js with `@napi-rs/canvas`).

Comparing a baseline against itself passes all three, so the harness is deterministic. A colour change slips past check 1 but is caught by checks 2 and 3, which shows check 1 alone (the first report's method) was too weak.

Raw bytes never match. Chromium writes a creation date and a random `/ID`, pdf-lib rewrites `Producer`/`ModDate`, and `docx` writes timestamps into `core.xml`.

For DOCX, "identical" means every zip entry matches after decompression, with `core.xml` timestamps ignored and `Math.random` seeded ([14 notes](pdf-identical-fast-research/14-docx.md)).

## Changes, ranked

### 1. Keep Chromium warm and reuse a page (all PDF changes)

| Variant | Median | Identical |
|---|---|---|
| Current: new persistent context per render (replica) | 2.55 s | baseline |
| Warm browser, new context per render | 2.07 s | yes |
| **Warm browser, reused page, `setContent` + `pdf()`** | **1.2 s** | **yes** |
| Kept-loaded page, `innerHTML` patch | 1.14–1.30 s | yes |
| Kept-loaded page, CSS-variable colour patch | 1.32 s | yes |
| Assets served via `page.route` instead of base64 inlining | 1.0–1.2 s | yes |
| Raw CDP `Page.printToPDF` (base64) | 0.8–1.3 s | yes |

Source: [08 notes](pdf-identical-fast-research/08-bench-chromium.md).

Beyond reusing a page, the variants differ by less than the noise. Reuse a page and pick among the rest after a quieter benchmark. A restart policy is needed: commit `f4e9878` moved to fresh browsers to recover from Chromium closing or hanging. Gotenberg's defaults (restart after 100 conversions, up to 6 concurrent) are a reasonable reference ([12 notes](pdf-identical-fast-research/12-libs-chromium.md)).

`chrome-headless-shell` was not tested; downloading it needs approval. Playwright already defaults to it, and `@sparticuz/chromium` ships it ([12 notes](pdf-identical-fast-research/12-libs-chromium.md)). Whether its output matches full Chrome has to be checked before switching.

### 2. Skip Chromium for paint-only changes

The Chromium output does not depend on the background or the page border. `--doc-page-background` is neutralised in print ([print-document.tsx:339](../src/lib/pdf/print-document.tsx)), and border colour and scope are read only in `finalizePdf`. If the raw Chromium PDF is cached before finalizing, these changes only need finalize run again:

- **Proved pixel-identical**, with and without a cover and logo, for: border colour, border scope, solid background, solid to gradient, diagonal gradient, and all of them at once. A negative control (a border inset change) differed by about 1.1 M pixels, as expected ([09 notes](pdf-identical-fast-research/09-bench-postprocess.md)).
- **Speed:** about 108 ms without a cover and 408 ms with one. The cover is embedded twice (the raw PDF is 2.35 MB, the final 4.39 MB), so caching the embedded cover or removing the duplicate should bring the cover case closer to 0.1 s. Removing the duplicate must be re-proved with the pixel check.
- **Not Chromium-free:** palette colours (they appear in the body, header and footer), border width and inset (they change margins), logo, typography, density, and sections.

### 3. Narrow the cover-raster cache key

The cover PNG cache key includes the whole theme ([print-document.tsx:110-117](../src/lib/pdf/print-document.tsx)), so every colour or border change re-rasterizes the cover (about 0.85 s, using a second Chromium). Keying on `sha1(JSON(model.cover))` produced the same PNG in 15 of 15 tested changes: border, background, palette, density, logo scale and position, and typography ([09 notes](pdf-identical-fast-research/09-bench-postprocess.md)). This was tested on one sample with a custom cover; template and AI covers still need checking.

A cover swap then costs one cover raster and no body reprint. The placeholder HTML change this needs was proved pixel-identical.

### 4. Cache on the inputs that affect output, and prefetch the gallery

Today's caches are keyed on the whole policy JSON: a 4-entry server LRU in [generate.tsx:15](../src/lib/pdf/generate.tsx) and a request-body client LRU in [policy-preview-request.ts](../src/lib/pdf/policy-preview-request.ts). The JSON is order-sensitive and includes fields that don't affect output ([11 notes](pdf-identical-fast-research/11-speculative.md)). A canonical render key would make undo, toggling back and reverting a choice instant cache hits:

- **In the key:** resolved template, typography, density, alignment, enabled sections, computed margins, resolved palette, the active cover only, and a logo hash.
- **Out of the key:** `customThemeName`, `brandColorSource`, inactive covers, disabled sections, and acknowledgement fields while the acknowledgement is off.

Hover prefetch alone doesn't help. It gives only about 300 ms of head start on a 1.2 s render, and prefetching every neighbouring state would cost about 30 renders per change. Pre-rendering the gallery's 7 templates when it opens is cheap, and the reuse is near-certain.

### 5. Client-side waste

- Drop the 800 ms debounce for discrete controls (toggles, selects, swatches) and keep it for typing ([live-preview.tsx:10](../src/components/builder/live-preview.tsx)).
- Abort superseded fetches, and drop aborted jobs from the server queue before printing.
- Reuse one pdf.js worker through `GlobalWorkerOptions.workerPort`. Today each update gets a new one ([pdf-policy-preview.tsx:133-134](../src/components/policy/pdf-policy-preview.tsx)).

Keep pdf.js as the viewer. PDFium or MuPDF viewers rasterize differently ([13 notes](pdf-identical-fast-research/13-libs-pdf.md)).

### 6. Palette rewrite (conditional, not ready)

When only the palette changes, Chromium's page structure is identical and only the fill and stroke RGB operands differ. A simple old-to-new hex map fails in two ways ([10 notes](pdf-identical-fast-research/10-colour-rewrite.md)):

- a derived colour `#1C211F` belongs to no palette role;
- the paper colour and literal white share `#FFFFFF`.

Printing once with unique **sentinel colours per role** and rewriting the sentinels was exact on all pages for the tested palette. It takes 0.13–0.38 s, against a 1.7–2.4 s reprint.

It hasn't been tested with gradients, `color-mix` tints or alpha over images. Ship it only behind the full parity suite, with a fallback to a warm reprint.

### 7. DOCX

[14 notes](pdf-identical-fast-research/14-docx.md). DOCX doesn't use Chromium; the cost is a large photo cover. The following kept every zip entry identical:

- Store `word/media/*` entries uncompressed (JSZip STORE) instead of DEFLATE.
- Use DEFLATE level 1 for XML.
- Cache the cover PNG, keyed on the SHA-256 of its SVG.
- Cache font buffers.

Together these take the photo case from about 2.1–2.4 s to about 0.55–0.64 s. The zip gets bigger: about 2% with a photo cover, about 65% with the default cover (74 KB to 122 KB). Bigger files aren't a visual change, but you may care about them.

One option needs a decision: patching `docx`'s pure-JS SHA-1 image hash to `node:crypto` gives the same digest and saves about 330 ms on photo covers, but it means maintaining a dependency patch.

## Findings that need your decision

1. **The custom cover is captured mid-fade today.** `renderCustomCoverPng` screenshots in screen media ([print-document.tsx:129-159](../src/lib/pdf/print-document.tsx)). `PolicyCoverPreview` carries `data-preview-entrance="true"` ([policy-preview.tsx:90](../src/components/policy/policy-preview.tsx)), and its 220 ms opacity animation only switches off for print or reduced motion ([policy-preview.tsx:21-28](../src/components/policy/policy-preview.tsx)). The benchmark measured page-1 brightness of 181 against 147 once settled. That means the cover in exported PDFs can be washed out, and how washed out depends on timing, so a faded PNG can get cached. Fixing it changes the PDF cover, but towards the intended look. It is a bug fix, not a regression, but it breaks "no change of any sort". It should be fixed first, so the parity suite's baselines are deterministic.
2. **Document spacing (density) had no effect** on the sample policy's PDF ([10 notes](pdf-identical-fast-research/10-colour-rewrite.md)). This is unexplained. Either the control doesn't apply to that template, or the test set it wrong. Worth a quick check.
3. **The DOCX dependency patch** (section 7) and the **larger DOCX files**.
4. **Are about 1 s layout updates enough?** If not, the remaining route is the draft-preview tier from [pdf-instant-preview-research.md](pdf-instant-preview-research.md).

## Suggested order

1. Build the **parity suite** first ([15 notes](pdf-identical-fast-research/15-verification.md)): the three PDF checks plus the DOCX entry diff, over the theme-QA template set on every PR and the full template × toggle × cover matrix nightly. Goldens need to be committed, because `.theme-qa` is gitignored, and made with the same Chromium as production. Fix the cover-fade bug before taking goldens.
2. Warm Chromium with a reused page, a restart policy, cancellation, and a shorter debounce for discrete controls.
3. The finalize-only path for background and border changes; a narrow cover key; a single embedded cover.
4. A canonical render cache key; gallery prefetch; a shared pdf.js worker.
5. The DOCX zip and cache changes.
6. Optional, behind the suite: the palette sentinel rewrite.

## Open questions

- **Production numbers.** The host is `@sparticuz/chromium` 147 on serverless, so it's unclear how long a warm browser survives there. All the measurements above are local.
- **Benchmarks with nothing else running.** The concurrent runs inflated the noise. A quiet re-run would separate the reused-page variants.
- **Coverage.** Template covers and AI covers were not in the samples.
