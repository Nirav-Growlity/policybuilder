# 07 - Alternative engines for an instant, per-page preview

Scope: research only. No files in `D:\Policy PoC` were touched.
Question: can any fast or incremental PDF engine (WASM/JS in the browser, or server) produce a preview that matches the current Chromium HTML+CSS PDF closely enough to use?

Method note: searches returned mostly secondary sources. Where I could fetch the maintainer's README, docs or package page I say so. Where a claim rests only on a search snippet, a forum post, or a comment, it is marked as such. I did not run any benchmark myself. No primary, reproducible ~10-page timing exists for most of these engines.

## Bottom line

No candidate reproduces the current Chromium output. Every engine that is fast or incremental is a different layout engine. Using one would mean rewriting the PolicyCraft templates, and the preview would then differ from the PDF in line breaks, pagination, and fonts. The only engines that take the current HTML/CSS as input are WeasyPrint, Prince, Vivliostyle, and Paged.js. Each of them still uses its own paged-media layout, not Chromium's, and none is documented as incremental per page.

Verdict per option:
- **Typst / typst.ts**: fastest and genuinely incremental, but not HTML/CSS. Viable only if the final PDF also moves to Typst, which violates the constraint.
- **react-pdf, pdfme**: not HTML/CSS. Not viable for an exact match.
- **WeasyPrint, Prince**: HTML/CSS, but a different engine and not in-browser. Mismatch is certain. Not viable as preview.
- **Vivliostyle, Paged.js**: HTML/CSS in the browser, closest in spirit, but a polyfill or a different paged layout. Full re-layout each edit. Mismatch risk remains.

## Per-engine findings

### 1. Typst + typst.ts (WASM, incremental)
- **Licence**: Apache-2.0 for typst.ts. Fetched from https://github.com/Myriad-Dreamin/typst.ts. Typst core is Apache-2.0 per the sidebar of https://github.com/typst/typst.
- **Packages**: `@myriaddreamin/typst.ts`, `@myriaddreamin/typst-ts-web-compiler` (internal compiler WASM), `@myriaddreamin/typst-ts-renderer` (internal renderer WASM). Source: https://github.com/Myriad-Dreamin/typst.ts (fetched).
- **Render modes** (typst.ts README, fetched): server-side SVG embedded in HTML; a "vector artifact" preprocessed on the server and drawn in the browser; or client-side compile and draw to canvas. The README says the artifact is "optimized for typst documents in size" and gives no figures.
- **Per-page**: the typst.ts README does not describe per-page rendering. The preview example "builds a compilation server, streams the artifact, and renders it incrementally." The per-page SVG diff technique is described in `typst-preview-vscode` (https://github.com/enter-tainer/typst-preview-vscode, search snippet only): it recompiles to SVG, sends it over WebSocket, and applies a VDOM diff in the client. I did not fetch that repo.
- **Incremental compile**: the Typst README says "Fast compile times thanks to incremental compilation" and that watch mode is faster because of it (https://github.com/typst/typst, fetched). It says "comemo, a system for incremental compilation which does most of the hard work in the background." comemo is at https://github.com/typst/comemo (search snippet). Memory grows during long watch sessions (https://forum.typst.app/t/how-to-stop-typst-from-consuming-increasing-ram-for-a-long-running-watch-process/8533, search snippet).
- **Speed, ~10 pages**: no primary benchmark. Secondary figures only:
  - Reddit comment (not verified): single-paragraph edit, 10-page doc, about 12.6 ms for Typst 0.14 (https://rl.klein.ruhr/r/LaTeX/comments/1v03ag2/realtime_lualatex_rendering_update_tug_2026_talk/oyc3q4k/?context=3).
  - Habr, single timed run: Hello-world, pdflatex about 198 ms, Typst about 126 ms. Noise and process startup (https://habr.com/en/articles/864072).
  - IT-Daily reports an unverified TU Berlin thesis claim of 3.4 to 9,895 times faster incremental edits (https://en.it-daily.net/?p=176816).
- **Client-side**: yes, in the browser via WASM (typst.ts). Size figures in a third-party write-up (about 8 MB compiler, about 5 MB renderer) are unverified.
- **CSS/HTML fidelity**: none. Typst is its own markup and layout language. Its HTML export is explicitly experimental: "The feature is still very incomplete and only available for experimentation behind a feature flag" and "Typst currently does not output CSS style sheets" (https://www.typst.app/docs/reference/html, fetched). It is not a CSS-compatible path.
- **Verdict**: best incremental and speed profile on paper. Not usable with the current HTML/CSS templates. Preview-only use would mismatch line breaks and pagination with the Chromium PDF.

### 2. @react-pdf/renderer (v4 line; jsDelivr lists 4.9.0)
- **Licence**: MIT (https://github.com/diegomura/react-pdf, fetched).
- **Input**: React primitives, not HTML. The README says it is "used to _create_ PDFs using React." No HTML rendering. Flexbox is supported (`flexDirection`, `flexGrow`); CSS Grid is not mentioned.
- **Speed**: no primary timing. Issues #544 "Long Render Time" (https://github.com/diegomura/react-pdf/issues/544, closed) and #2032 (https://github.com/diegomura/react-pdf/issues/2032, closed) report slowness with no numbers in the page content.
- The react-pdf.org article (https://react-pdf.org/blog/large-documents-in-the-browser, fetched) says all work runs synchronously on the calling thread: style resolution, glyph conversion, line breaking, page-break decisions. It recommends a Web Worker for responsiveness, not for speed: "generation time is unchanged." It also says the document must be built inside the worker because React elements can't be `postMessage`d.
- **Incremental**: none. Every render is a full document build.
- **Client-side**: yes (`pdf(...).toBlob()`, and `PDFViewer`).
- **Verdict**: not viable. Fidelity to the existing HTML/CSS is impossible without a rewrite, and it is not incremental.

### 3. pdfme
- **Licence**: MIT. Uses pdf-lib for generation (https://github.com/pdfme/pdfme, fetched).
- **Input**: JSON templates with a visual editor. No HTML/CSS support listed. The page refers to a separate "Supported Features" page.
- **Speed**: "Fast PDF Generator" with no benchmarks.
- **Incremental**: not documented.
- **Verdict**: not viable for matching the current design.

### 4. WeasyPrint (Python, server)
- **Licence**: BSD-3-Clause (https://github.com/Kozea/WeasyPrint, fetched).
- **CSS support** (https://doc.courtbouillon.org/weasyprint/stable/features.html, fetched): paged media is supported, including `@page`, margin boxes, page counters "with known limitations," and running elements. Flexbox: "works for simple use cases but is not deeply tested." Grid: "works for simple cases, but has some limitations." Unsupported or untested grid features include `inline-grid`, `grid-auto-flow: column`, subgrids, `repeat(auto-fill, *)`/`auto-fit`, baseline alignment, and fragmentation in rows.
- **Speed**: no primary benchmark in the docs I could reach. The docs page I fetched has no speed content. A table-performance warning is cited by secondary sites only (unverified). One Elixir forum report says CLI calls have startup cost and a long-lived process helps (https://elixirforum.com/t/chromicpdf-pdf-generator/29473?page=3, search snippet). A French discussion says WeasyPrint will "probably not catch up with Prince" on speed (https://linuxfr.org/news/des-nouvelles-de-weasyprint-ou-comment-developper-du-libre-a-presque-plein-temps, search snippet only).
- **Incremental**: none documented.
- **Client-side**: no (Python).
- **Verdict**: its own layout engine. Its output will not match Chromium even with identical HTML, and the Grid gaps would need CSS changes. Not viable as a preview.

### 5. Prince (commercial)
- **Licence / price** (https://www.princexml.com/purchase/, fetched): Per Server, one-time $3,800 per license for noncommercial/government use, with 12 months of upgrades and support. Volume discounts down to $2,660. Commercial Site License: annual, "starting around $2000," covers "any number of servers on your own cluster or the cloud." Desktop $495. Academic Server $1,900.
- **Speed / incremental**: no published numbers; search snippets say it is fast (anecdote, Hacker News).
- **Client-side**: no. Server only (cloud API via DocRaptor or EuroPDF, not priced).
- **Fidelity**: strong CSS Paged Media support, but it is not Chromium.
- **Verdict**: a fidelity-different engine with a cost. Not viable for an instant preview.

### 6. Vivliostyle (CLI and viewer)
- **Licence**: AGPL-3.0 for both the CLI (https://github.com/vivliostyle/vivliostyle-cli, fetched) and the viewer (https://cdn.jsdelivr.net/npm/@vivliostyle/viewer@2.44.1/README.md, fetched). AGPL network clause applies if the code is modified and served.
- **Engine**: the CLI launches a browser (`--browser` defaults to "chrome", Playwright mentioned). It is not Chromium-free. The viewer is "a Web application for HTML+CSS typesetting and rich paged viewing" (README). Whether layout runs in JS in the browser is not stated.
- **Speed**: one blog's eleven-tool test gave Vivliostyle 6.20 s (https://computingforgeeks.com/?p=173448, excerpt only; document sizes not shown). Same test: Chrome headless shell 0.29 s, OpenHTMLtoPDF 1.16 s, Paged.js 2.27 s. Methodology thin; treat as one snapshot.
- **Incremental**: none documented.
- **Verdict**: not Chromium-free, so no speed gain from the engine itself. Not viable.

### 7. Paged.js (browser polyfill)
- **Licence**: MIT (https://github.com/pagedjs/pagedjs, fetched).
- **What it is**: a browser polyfill for CSS Paged Media and Generated Content. "Add the `paged.polyfill.js` script to replace all `@page` css and render the html page." It runs in the browser DOM. The repo says it "Display[s] paginated content in the browser and generate[s] print books." No performance claims. Its chunker processes the whole document.
- **Speed**: the same blog test gave 2.27 s (excerpt only).
- **Incremental**: not documented. Re-chunking runs over the whole document.
- **Client-side**: yes, the only candidate here that runs on the same HTML in the browser.
- **Fidelity**: a polyfill over the browser's layout, not Chromium's native print pagination. Expect some differences in margin boxes and pagination. Not measured.
- **Verdict**: the closest in-browser option that consumes the existing HTML/CSS, but not incremental. Preview-only use still risks mismatch.

### 8. pdf.js (rendering the final PDF per page)
- **Licence**: Apache-2.0 (https://github.com/mozilla/pdf.js, fetched). Description: "PDF Reader in JavaScript."
- **Relevance**: a way to show per-page canvases of an existing PDF. It cannot produce the PDF, so it does not make generation faster. Per-page canvas caching would help only if the expensive step, the Chromium print, were itself cheap.
- **Verdict**: useful as a viewer component, not as a preview engine.

### 9. Per-page incremental across engines
- The main barrier is pagination dependencies: a change on page 2 can move content onto every later page. Typst's comemo tracks these dependencies at a fine grain (comemo README, search snippet). None of the HTML/CSS engines above documents an equivalent. I did not find a source for Chromium, WeasyPrint, Prince, or Paged.js per-page incremental layout. This is my inference from their docs, not a sourced claim.

## Recommendation

1. Do not adopt a new engine for the final PDF or DOCX. None reproduces Chromium's output, so the constraint fails.
2. For preview, the only candidates that consume the current HTML/CSS are Paged.js (in-browser, MIT, not incremental) and Vivliostyle (AGPL, uses Chrome). Both still mismatch the PDF and neither is incremental. Preview-only use with a visible note of possible differences is the honest version of this option.
3. The Typst route would give the best preview speed but requires rewriting the templates and accepting that the preview and PDF both come from Typst. That is a larger change than the user has asked for.
4. Better leverage likely sits in the current pipeline: cache per-page HTML fragments, avoid re-running the Chromium print on unchanged pages, and measure where the 2 to 5 s goes (launch, font loading, print) before picking an engine. A warm, long-lived Chromium instance is the most practical speed-up that keeps the look identical (inference, not sourced).

## Sources cited (fetched unless noted)
- https://github.com/Myriad-Dreamin/typst.ts (fetched)
- https://github.com/typst/typst (fetched)
- https://github.com/typst/comemo (search snippet)
- https://www.typst.app/docs/reference/html (fetched)
- https://forum.typst.app/t/how-to-stop-typst-from-consuming-increasing-ram-for-a-long-running-watch-process/8533 (search snippet)
- https://github.com/enter-tainer/typst-preview-vscode (search snippet)
- https://rl.klein.ruhr/r/LaTeX/comments/1v03ag2/realtime_lualatex_rendering_update_tug_2026_talk/oyc3q4k/?context=3 (search snippet, unverified)
- https://habr.com/en/articles/864072 (search snippet)
- https://en.it-daily.net/?p=176816 (search snippet, unverified)
- https://github.com/diegomura/react-pdf (fetched)
- https://github.com/diegomura/react-pdf/issues/544 (fetched via issue list)
- https://github.com/diegomura/react-pdf/issues/2032 (fetched via issue list)
- https://react-pdf.org/blog/large-documents-in-the-browser (fetched)
- https://github.com/pdfme/pdfme (fetched)
- https://github.com/Kozea/WeasyPrint (fetched)
- https://doc.courtbouillon.org/weasyprint/stable/features.html (fetched)
- https://elixirforum.com/t/chromicpdf-pdf-generator/29473?page=3 (search snippet)
- https://linuxfr.org/news/des-nouvelles-de-weasyprint-ou-comment-developper-du-libre-a-presque-plein-temps (search snippet)
- https://www.princexml.com/purchase/ (fetched)
- https://github.com/vivliostyle/vivliostyle-cli (fetched)
- https://cdn.jsdelivr.net/npm/@vivliostyle/viewer@2.44.1/README.md (fetched)
- https://computingforgeeks.com/?p=173448 (search snippet, excerpt)
- https://github.com/pagedjs/pagedjs (fetched)
- https://github.com/mozilla/pdf.js (fetched)

## Not verified / gaps
- No primary ~10-page timing for react-pdf, pdfme, WeasyPrint, Prince, Vivliostyle, Paged.js, or typst.ts.
- The WeasyPrint "tables are slow" wording and the Prince speed remark are secondary only. The WeasyPrint tips page returned 404/410.
- Prince FAQ (https://www.princexml.com/purchase/license_faq/) and the Typst web-app export page returned errors or were not fetched.
- The react-pdf v4 renderer changelog was not located.
- pdf-lib and PDFKit licences were not checked.
