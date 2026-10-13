# Prior art: how other products make paged previews fast

Scope: research only. No files in `D:\Policy PoC` were touched. Every claim cites a URL. Items marked **[snippet only]** come from search-result text that I could not fetch; items marked **[not verified]** are my own inference or background knowledge with no fetched source.

## 1. Typst (compiler, comemo, typst-preview / tinymist)

- **Incremental compile via comemo.** Typst's architecture doc says recompiling a previously compiled document is faster, mostly through comemo, and that caching happens at different granularities per phase: module and closure call results during evaluation, individual elements during layout. Layout is the most expensive phase, so element-level caching matters most. https://github.com/typst/typst/blob/main/docs/dev/architecture.md (mirror: https://huggingface.co/spaces/ecyht2/typst-docs-rag/raw/main/sources/docs/dev/architecture.md)
- **Layout output is one frame per page.** Exporters are separate crates: PDF, SVG, and a pixel renderer each consume frames. Same source: https://github.com/typst/typst/blob/main/docs/dev/architecture.md
- **Incremental parse.** The parser can reparse one markup or code/content block; span numbers are reassigned only locally so memoized results further from the edit stay valid. Same architecture doc.
- **How comemo works.** "Constrained memoization" with fine-grained access tracking. `#[memoize]` on the function, `#[track]` on the accessor's impl block, and automatic dependency tracking, so a cached result survives changes to files it never read. https://github.com/typst/comemo
- **Why not Salsa.** A Typst developer (larmaedje, per a forum reply, not confirmed as maintainer) said Salsa is "more advanced in some aspects, but also more rigid," and that it "dictates the program's structure a lot more." https://forum.typst.app/t/why-does-typst-implements-its-own-incremental-computation-comemo-instead-of-using-salsa/4014
- **Live SVG preview.** typst-preview (now deprecated and archived, functionality moved into tinymist) incrementally compiles to SVG, sends it over a websocket, and the client computes a diff between old and new SVG and applies it with a VDOM-style update. It exposes a `--partial-rendering` flag, but the page does not say whether that is per page or per element. https://github.com/Enter-tainer/typst-preview
- **Tinymist preview.** Its docs say the web SVG preview is "much faster than PDF preview" with no figures, and point to a separate developer guide (https://enter-tainer.github.io/typst-preview/arch.html, not readable in my fetch). https://myriad-dreamin.github.io/tinymist/feature/preview.html
- **Draft-style PDF.** Tinymist exposes an `onType` export setting that "makes PDF files live, as you type." This is a PDF export option, not the preview path. https://github.com/Myriad-Dreamin/tinymist/blob/main/editors/vscode/README.md

Gap: I did not confirm the per-page diff granularity of tinymist's preview. The arch doc was unreachable.

## 2. Paged.js and Vivliostyle (browser-side paged media)

- **Paged.js** is a polyfill that runs in the browser. Its Chunker "fragments" content into pages in a loop and uses break tokens to continue layout across pages. The Polisher converts `@page` CSS into classes. https://github.com/pagedjs/pagedjs and https://pagedjs.org/documentation/
- Paged.js exposes a Previewer hook API (`beforePreview`, `afterPreview`, custom Handlers) and a `PagedConfig` with `auto: false`, which lets the host trigger `preview()` manually. https://pagedjs.org/documentation/ and https://github.com/pagedjs/pagedjs
- Paged.js was built for Editoria (now Ketida). **[snippet only]** Editoria's team later discussed "live update of the export when the css changes." https://pagedjs.org/posts/en/uke-and-inks/
- Performance on long documents: **no source found** for either tool. Pagination runs in the browser, so long books are a plausible slowdown, but this is **[not verified]**.
- **Vivliostyle Viewer** defaults to "Render All Pages" so the page count is accurate. Turning it off gives a "rough page count" and faster loading, at the cost of possibly wrong page numbers. It recommends the CLI for final output. https://docs.vivliostyle.org/en/viewer/vivliostyle-viewer/
- Vivliostyle's docs do not say whether the Viewer and the CLI share one engine. They also warn that browser "Save as PDF" output depends on print settings such as background graphics. Same URL.

## 3. Reactive Resume (open source resume builder)

- **Correction to a third-party claim.** Search results said Reactive Resume exports PDFs via Browserless and headless Chrome. The current official README says v6 uses **Forme** "in the browser and on the server" and that "No Browserless, Chromium, or external print service is needed." The `PRINTER_*` and `BROWSERLESS_*` variables are described as legacy. https://github.com/AmruthPillai/Reactive-Resume
- Live preview and downloads both use Forme, "rendered in a background worker." https://github.com/AmruthPillai/Reactive-Resume
- Official docs say the preview updates as you type and shows "the page as it will print." https://docs.rxresu.me/ (the docs do not say whether preview and PDF are pixel-identical.)

Takeaway: Reactive Resume chose one layout engine for both client and server, and gave up Chromium fidelity to get a live preview.

## 4. Forme, react-pdf (layout engines that run in the browser)

- **Forme** is a Rust, page-native engine: layout happens "directly into pages" with page-aware breaks and repeated table headers. It "compiles to WebAssembly for browser and serverless use." https://docs.rs/crate/forme-pdf/latest (the GitHub repo URL returned 404 in my fetch.)
- **react-pdf** runs "in Node or straight in the client." Layout uses Yoga flexbox. The page does not say its output matches a browser's. https://react-pdf.org/ **[snippet only]** Sources disagree on whether the layout engine is Yoga; the search results point to a Yoga-based @react-pdf/layout. https://www.npmjs.com/~sophon.men is not a useful source; treat as unverified.

Takeaway: these engines give fast live previews because they lay out in JS/WASM. Their output is their own, not Chromium's.

## 5. Chromium-based print and print-grade engines

- **Chrome headless.** New headless mode, since Chrome 112, shares browser code with headful Chrome. `chrome-headless-shell` is a separate standalone binary, available since Chrome 132. https://developer.chrome.com/docs/chromium/headless
- **Puppeteer `page.pdf()`** uses print media by default. `page.emulateMediaType('screen')` switches it. Color is modified for printing unless `-webkit-print-color-adjust` is set. https://pptr.dev/api/puppeteer.page.pdf
- **CDP `Page.printToPDF`** options (preferCSSPageSize, pageRanges, etc.) were not readable: the fetched URL only redirected. https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-printToPDF **[not verified]** for `pageRanges`.
- **DocRaptor** renders PDFs with Prince, which it calls the "industry-leading Prince PDF engine." Test mode produces watermarked output that doesn't count against limits. It also runs its own JS engine before handing HTML to Prince. https://www.docraptor.com/documentation/api
- **Prince** is described only as "a powerful converter from Web Standards to PDF." No speed or preview notes were found. https://www.princexml.com/doc/intro-userguide/
- **CSS Paged Media L3** treats printing as a presentation concern and leaves some behaviour to the user agent. Page breaks are defined in the separate CSS Fragmentation modules. https://www.w3.org/TR/css-page-3/

## 6. Google Docs, Word Online, Overleaf, Canva, InDesign

- **Google Docs** moved to canvas rendering, stated as improving "performance" and "consistency," with assistive tech said to keep working. The announcement does not discuss pagination. https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html
- **[snippet only]** New Stack says Docs uses a "side DOM" for accessibility. The article body was not readable in my fetch. https://thenewstack.io/google-docs-switches-to-canvas-rendering-sidelining-the-dom/
- **Overleaf** blog listing and learn pages gave no compile-speed or draft-mode guidance I could cite. The learn page returned 404. **[not verified]**: LaTeX's `draft` class option and `\includeonly` are standard ways to speed iteration.
- **Word Online, Canva, Notion, InDesign Server:** not researched; no primary source obtained in this session.

## Recurring patterns

1. **Same layout engine on client and server.** Typst (comemo, one frame per page), Reactive Resume (Forme), react-pdf. This gives live previews but changes output relative to Chromium. For PolicyCraft, this is ruled out by "output must not change."
2. **Draft vs final.** Vivliostyle's rough page count (fast, possibly wrong) vs accurate render (slower). Typst's onType PDF is a separate live option. A draft preview that is allowed to differ from the final output is a legitimate pattern, but the user's constraint makes it a risk.
3. **Incremental layout by page.** Paged.js lays out page-by-page with break tokens. Typst caches at element level. These are the only sources describing page-level incrementality.
4. **Page-level diffing.** typst-preview sends SVG and diffs it client-side. Its granularity is not confirmed.
5. **Memoization keyed on read dependencies.** comemo tracks exactly what a call read. This is the most precise invalidation model found, but it requires a compiler built around it.

## Fit for a Chromium-print pipeline whose output must not change

- Patterns 1 and 3 (replacing the engine, or a JS paginator) would change page breaks. Reject them for the final output. A JS paginator could serve only as a labelled draft, not as the preview of record.
- Pattern 5 (comemo-style memoization) needs an incremental layout engine. Chromium is a black box, so there is nothing to memoize per element. Chromium can only be re-run from the start.
- The most compatible option is to keep Chromium as the single source of truth and cut the cost around it:
  - keep a warm browser and page instead of launching per edit **[not verified as the cause of 2-5 s]**;
  - render the preview as images of the print layout (per-page screenshots under print media) instead of a full PDF encode **[not verified]**;
  - if pagination must stay exact, a page subset (`pageRanges`, if it exists in CDP) would only help if breaks upstream of the affected page are stable **[not verified]**.
- Whether any of this gets to "instant" is not answered by these sources. Measurement of the current 2-5 s breakdown (launch, HTML build, PDF, rasterize) is the next step.

## Source list

- https://github.com/typst/typst/blob/main/docs/dev/architecture.md
- https://huggingface.co/spaces/ecyht2/typst-docs-rag/raw/main/sources/docs/dev/architecture.md
- https://github.com/typst/comemo
- https://forum.typst.app/t/why-does-typst-implements-its-own-incremental-computation-comemo-instead-of-using-salsa/4014
- https://github.com/Enter-tainer/typst-preview
- https://myriad-dreamin.github.io/tinymist/feature/preview.html
- https://github.com/Myriad-Dreamin/tinymist/blob/main/editors/vscode/README.md
- https://github.com/pagedjs/pagedjs
- https://pagedjs.org/documentation/
- https://pagedjs.org/posts/en/uke-and-inks/ (snippet only)
- https://docs.vivliostyle.org/en/viewer/vivliostyle-viewer/
- https://github.com/AmruthPillai/Reactive-Resume
- https://docs.rxresu.me/
- https://docs.rs/crate/forme-pdf/latest
- https://react-pdf.org/
- https://developer.chrome.com/docs/chromium/headless
- https://pptr.dev/api/puppeteer.page.pdf
- https://www.docraptor.com/documentation/api
- https://www.princexml.com/doc/intro-userguide/
- https://www.w3.org/TR/css-page-3/
- https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html
- https://thenewstack.io/google-docs-switches-to-canvas-rendering-sidelining-the-dom/ (snippet only)
