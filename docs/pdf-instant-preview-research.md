# Instant Design-mode preview

Research date: 2026-10-12. Follows [pdf-preview-performance-research.md](pdf-preview-performance-research.md), which measured today's pipeline. Raw notes from the seven research passes, each with full citations, are in [pdf-instant-preview-research/](pdf-instant-preview-research/). Claims marked *(inference)* are reasoning, not measured or sourced.

## TL;DR

Chromium printing cannot be made instant. Even with a warm browser, `page.pdf()` for this document costs about 0.5 s, because Chromium lays out the whole document before printing any page. Asking it for one page (`pageRanges`) still runs the page count over the whole document ([print_render_frame_helper.cc](https://chromium.googlesource.com/chromium/src/+/main/components/printing/renderer/print_render_frame_helper.cc)). No other engine helps either. Every fast or incremental engine (Typst, react-pdf, pdfme, WeasyPrint, Prince, Vivliostyle) is a different layout engine, so it would change the output.

The way to get an instant preview without changing the download is **two tiers**:

1. **Instant tier, in the browser.** Render the same `PolicyPreview` component, with the same print CSS, into an iframe in the client and split it into A4 page boxes there. `PolicyPreview` is already client-safe and already ships in client bundles. React updates only the DOM that changed:
   - **Paint-only controls repaint in the next frame with no re-pagination:** palette, background, border colour and scope, logo alignment, cover choice. Only the affected pixels change.
   - **Layout controls re-paginate:** fonts, spacing, border on/off, TOC and the other toggles, list markers. The goal is to re-paginate only from the first page that changed. How long this takes for 10–30 pages has not been measured anywhere.
2. **Truth tier, on the server.** Keep today's Chromium PDF exactly as it is for download and DOCX parity, and make it about 1 s with the fixes from the first report. It runs in the background after edits. The preview shows "Matches download" only once the PDF's page count and per-page text match the draft. If they don't match, it swaps to the PDF.

The download stays byte-for-byte on the current pipeline, so its look cannot change. The only risk is that the instant draft disagrees with the PDF, and tier 2 catches that automatically.

**Next step:** a throwaway `/prototype` to measure two things on real templates: re-pagination latency, and how often draft and Chrome page breaks agree.

## Why "only the changed page" is limited

Body sections flow continuously. The print CSS forces page breaks only after the cover, after the TOC, and before the acknowledgement. Sections use `break-inside:auto`, with `orphans/widows:3`, `break-after:avoid` on headings and `break-inside:avoid` on table rows ([print-document.tsx:341-358](../src/lib/pdf/print-document.tsx)). So the document splits into four independent blocks: **cover | TOC | body | acknowledgement**.

Inside the body, any edit that moves text pushes every later page break *(inference, but it follows directly from continuous flow)*. "Only update the changed page" therefore means:

| Change type | Pages that really change | Examples |
|---|---|---|
| Paint only | Every page repaints, but there is no layout and page breaks stay put | palette, background, border colour/scope, logo alignment ([01-codebase.md §4](pdf-instant-preview-research/01-codebase.md)) |
| Cover only | Page 1 | manual/AI cover, cover edits, feature image on cover |
| Local reflow | The edited page and everything after it, until breaks re-align | SDG display, data treatment, list markers, a text edit in one section |
| Global reflow | All pages | fonts, size, line spacing, density, alignment, border on/off/inset/width, logo scale with a logo, template change |
| Add/remove page | Everything after it; page numbers shift | TOC, acknowledgement, revision history |

The instant tier handles all five rows. React makes paint-only and cover-only changes instant. The re-paginator can start from the first affected page for local reflow; Paged.js's `Chunker.layout(content, startAt)` and `removePages(fromIndex)` exist for that ([Chunker docs](https://pagedjs.org/devdocs/Chunker.html)).

Splitting server-side printing into chunks would only help with cover, TOC and acknowledgement. The body is one flowing block, and chunking it differently would change page breaks ([CSS Fragmentation 3](https://www.w3.org/TR/css-break-3/)).

## How faithful the browser draft can be

**In Chromium browsers (Chrome, Edge), close.** Chromium's multicol columns and printed pages use the same LayoutNG block-fragmentation engine ([RenderingNG fragmentation](https://developer.chrome.com/docs/chromium/renderingng-fragmentation)). A paginator that lays content into fixed-height columns or page boxes therefore applies the same break rules (`break-*`, orphans/widows, `break-inside:avoid`) that `page.pdf()` uses. Paged.js renders each page as a multicol fragment ([how Paged.js works](https://pagedjs.org/en/documentation/4-how-paged.js-works/)). Line breaks should match at the same content width and with the same fonts *(inference; needs the parity test below)*.

What the draft has to reproduce by hand ([01-codebase.md §2–3](pdf-instant-preview-research/01-codebase.md)):

- **Running header and footer.** Today they are Playwright `headerTemplate`/`footerTemplate` HTML with Chrome-computed `pageNumber`/`totalPages` ([print-document.tsx:89-99](../src/lib/pdf/print-document.tsx)). The draft fills them with JS per page box. Standard CSS margin boxes only work in Chrome 131+ print, and Firefox and Safari don't support them ([MDN BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/page.json), [Chrome blog](https://developer.chrome.com/blog/print-margins)).
- **pdf-lib extras.** Page background, gradient, border stroke and cover overlay ([print-document.tsx:228-302](../src/lib/pdf/print-document.tsx)) all have CSS equivalents on a page box. The cover will look slightly sharper, because the PDF uses a 794 px raster.
- **Margins.** The draft uses the same margin values from `pageMarginMm`/`pageHeaderMarginMm` ([page-geometry.ts](../src/lib/page-geometry.ts)).
- **Assets.** Load them from static `/fonts` and the `assetScope` cover-asset URLs, not the server's data-URL inlining ([policy-preview.tsx:164-173](../src/components/policy/policy-preview.tsx)).

**In Firefox and Safari, less exact.** Their text shaping and fragmentation differ. Self-hosting the identical font files narrows the gap, but tier 2 has to be the authority there.

Mismatches that already exist today, to fix or decide on before the draft can match ([01-codebase.md, open items](pdf-instant-preview-research/01-codebase.md)):

1. The diagonal gradient is `135deg` on screen ([document-themes.ts:156](../src/lib/document-themes.ts)), but the PDF draws it corner-to-corner, about 145° on A4.
2. The standard (non-professional) cover is `height:297mm` ([policy-preview.tsx:403](../src/components/policy/policy-preview.tsx)), but the printable area is about 253 mm, so it may spill onto a second page. Only professional covers get a print height. Not verified.
3. The footer font inside Chromium's header/footer template may fall back to a system font. Not verified.

## Options compared

| Option | Instant? | Download unchanged? | Verdict |
|---|---|---|---|
| Speed up the Chromium pipeline (warm browser, cancel stale, shorter debounce) | No, about 1 s best case | Yes | Do it anyway; it becomes tier 2 ([first report](pdf-preview-performance-research.md)) |
| Print only changed pages (`pageRanges`) | No; full layout still runs | Yes | Little gain ([02 notes](pdf-instant-preview-research/02-incremental-pdf.md)) |
| Print cover / TOC / body / acknowledgement separately and merge with pdf-lib | Partly; body still about 0.5 s | Yes, if page numbers are stamped after merging | Only helps cover/TOC edits; adds complexity |
| pdf.js viewer tweaks (shared `workerPort`, swap only changed canvases) | Saves tens to hundreds of ms | Yes | Worth doing in tier 2. A new worker is spawned per update today ([pdf-policy-preview.tsx:133-134](../src/components/policy/pdf-policy-preview.tsx), [05 notes](pdf-instant-preview-research/05-pdfjs-viewer.md)) |
| **Client paged HTML draft + background PDF** | **Yes for paint and cover changes; re-pagination time unmeasured** | **Yes** | **Recommended** |
| Paged.js as the client paginator | Not incremental by default; `startAt` resume exists | Yes (preview only) | Best library candidate: MIT, maintained, npm 0.4.3 ([repo](https://github.com/pagedjs/pagedjs)) |
| Custom multicol paginator (fixed page-height columns) | Likely fastest *(inference)* | Yes (preview only) | Prototype against Paged.js |
| Vivliostyle.js | No; a 100+ page document takes 40 s with TOC page numbers ([#1652](https://github.com/vivliostyle/vivliostyle.js/issues/1652)) | Yes (preview only) | Too slow; AGPL |
| Typst / typst.ts (incremental, page-level SVG diffs) | Yes | **No**; needs a full template rewrite | Ruled out ([07 notes](pdf-instant-preview-research/07-engines.md)) |
| @react-pdf, pdfme, WeasyPrint, Prince, canvas editors | Varies | **No**; different layout engines | Ruled out |

Prior art supports the two-tier shape. Typst's preview reaches instant speed with memoised incremental layout and client-side diffing of SVG pages ([typst architecture](https://github.com/typst/typst/blob/main/docs/dev/architecture.md), [typst-preview](https://github.com/Enter-tainer/typst-preview)), but that needs an incremental engine, which Chromium is not. Tools that keep Chromium as the engine of record show a browser rendering of the same HTML and print separately ([06 notes](pdf-instant-preview-research/06-prior-art.md)).

## Recommended path

1. **Prototype (throwaway).** In a client iframe, render `PolicyPreview` with `createPrintDocument`'s CSS ([print-document.tsx:335](../src/lib/pdf/print-document.tsx)) and paginate it two ways: Paged.js, and a hand-rolled fixed-height multicol paginator. Measure:
   - time from edit to updated pixels for a paint-only change, a global reflow and a TOC toggle, on 9-, 20- and 30-page documents;
   - per-page text and page count against the real Chromium PDF across the `.theme-qa/templates` set. The pixel harness in [policy-preview.test.tsx:111-131](../src/components/policy/policy-preview.test.tsx) can be reused.

   Success: under 100 ms for paint-only changes, under about 300 ms for reflow, and identical page breaks on all templates in Chrome.
2. **Fix the existing screen/print mismatches** (gradient angle, standard cover height, footer font) so the draft and the PDF start from the same geometry. Each fix that touches PDF output needs a pixel diff to confirm the download really doesn't change.
3. **Ship tier 2 speed-ups** from the first report: a warm browser with an isolated context per render, cancelling stale renders, a short debounce for discrete controls, and a shared pdf.js worker.
4. **Ship tier 1.** The Design preview shows the draft immediately; the background PDF verifies it. Show "Matches download" only after per-page text matches, and fall back to the PDF on mismatch or in non-Chromium browsers. The verification can compare a per-page text hash returned by the server *(inference)*.

## Open questions

- **Re-pagination speed.** No library publishes times for 10–30 pages. The prototype has to measure it.
- **Do screen and print break pages identically in Chrome at the same width?** This is likely, because both use the same fragmentation engine, but it hasn't been measured. It is the main risk.
- **Should non-Chromium browsers get the draft at all,** or only the PDF?
- **Should tier 2 run after every edit or only after an idle period** (for example 1–2 s)? This affects server load.
- **Why commit `f4e9878` moved to a fresh Chrome per render.** Its tests cover recovery when Chrome closes or hangs, so the warm-browser design needs health checks and a relaunch path.
