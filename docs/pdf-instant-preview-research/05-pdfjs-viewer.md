# Viewer-side research: instant PDF preview updates (pdf.js v5)

Scope: viewer side only. No repo files were modified. Sources are primary where possible (pdf.js source and published typings, react-pdf source, PDF spec via pdfa.org). Where a claim rests on a weak or secondary source, or on my own inference, it is marked.

Versions: the project's lockfile pins `pdfjs-dist@5.7.284` (`D:\Policy PoC\src\bun.lock:1226`); `package.json` asks for `^5.6.205`.

## 1. What the app does today (repo facts)

- `src/components/policy/pdf-policy-preview.tsx:133`: `GlobalWorkerOptions.workerSrc = "/api/pdf-worker"`. No `workerPort` is set anywhere.
- `pdf-policy-preview.tsx:134`: `pdfjs.getDocument({ data: bytes.slice() })`. The whole PDF is handed over as an in-memory buffer. A new document is created for every new byte array, and the old task is destroyed at `:138`.
- `pdf-policy-preview.tsx:99-101`: during an update, two `PdfPages` trees are mounted at once (the active and the candidate). That means two documents are parsed concurrently, and in the default setup two worker threads.
- `pdf-policy-preview.tsx:240-261`: each page already paints into a detached canvas and swaps it in with `replaceChildren` (double buffering at page level). But every new document re-renders every mounted page, and `getTextContent()` (`:251`) runs on every render. Nothing is keyed by page content.
- `src/app/api/pdf-worker/route.ts:5-6`: the worker file is read from disk on each request and served with `Cache-Control: public, max-age=3600`.

## 2. Worker and document reuse

- pdf.js: `GlobalWorkerOptions.workerPort`, "Defines global port for worker process. Overrides the `workerSrc` option." (https://raw.githubusercontent.com/mozilla/pdf.js/master/src/display/worker_options.js)
- pdf.js: when no `worker` is passed to `getDocument`, the loading task "creates and owns" its own `PDFWorker`, and it uses `GlobalWorkerOptions.workerPort` if one is set. `PDFWorker.create` returns a cached instance per port, and the constructor rejects a second `PDFWorker` on the same port ("Cannot use more than one PDFWorker per port."). `destroy()` terminates only the web worker the instance created. (https://raw.githubusercontent.com/mozilla/pdf.js/master/src/display/api.js, roughly lines 380, 890, 1000, 1010; line numbers are approximate from a summarised fetch.)
- Implication (inference): today every bytes change creates a fresh PDFWorker and a fresh web Worker, plus a parse in that worker. Startup cost is not measured here. A single long-lived `Worker` passed as `workerPort` would remove the spin-up per update. This needs a spike, because the destroy and port-lifecycle rules are subtle (pdf.js issue 16777 is referenced in the source comments around `PDFDocumentLoadingTask.destroy`).
- `isOffscreenCanvasSupported`: default `true` on the web, `false` in Node. Doc: "Determines if we can use `OffscreenCanvas` in the worker." and "Primarily used to improve performance of image conversion/rendering." (https://unpkg.com/pdfjs-dist@5.7.284/types/src/display/api.d.ts; default from https://raw.githubusercontent.com/mozilla/pdf.js/master/src/display/api.js around lines 310-315.) It is already on by default and does not make main-thread `render()` faster by itself.
- Render target: the documented `RenderParameters.canvas` is "A DOM Canvas object" (api.d.ts). I found no documented way to render a page directly into an `OffscreenCanvas` on the main thread, so OffscreenCanvas is not an easy win for the viewer. Running pdf.js inside your own worker and rendering there is possible in principle but unverified here.
- `canvasFactory` defaults to `DOMCanvasFactory` (api.d.ts). I could not confirm from primary source whether v5 can return OffscreenCanvas from the factory; the search summary that suggested it came from a third-party mirror (https://tessl.io/registry/tessl/npm-pdfjs-dist/files/docs/configuration.md) and should not be relied on.
- `disableFontFace`: default `false` on the web. Doc: "By default fonts are converted to OpenType fonts and loaded via the Font Loading API or `@font-face` rules." Setting it `true` uses the built-in path renderer (api.d.ts). It is a quality trade-off; I have no evidence it is faster.
- `cMapUrl` and `standardFontDataUrl`: "Include the trailing slash" (api.d.ts). The viewer sets neither (`pdf-policy-preview.tsx:134`). Whether this matters depends on whether the generated PDFs use non-embedded or CJK fonts. Not checked.
- `isEvalSupported`: I could not extract its doc or default from the fetched typings. Treat as unverified.
- `disableAutoFetch`, `disableStream`, `rangeChunkSize` (default 65536): these only matter when pdf.js fetches by URL with range requests (api.d.ts). Because the viewer passes `data`, they have no effect today.

## 3. Per-page update: caching and canvas swap

- Fingerprinting via `page.getOperatorList()`: pdf.js returns a `PDFOperatorList` "that represents the page's operator list" (api.d.ts). There is no public raw content-stream API. Hashing operator lists in the viewer has three problems (inference, not verified against source):
  1. Image arguments are decoded objects, so hashing them is costly.
  2. Font references inside the list are document-scoped names, so identical pages in two documents may not hash equal after the file is regenerated.
  3. `render()` already calls `getOperatorList` internally. The `RenderParameters` I checked (`canvas`, `canvasContext`, `transform`, `intent`, `background`) take no precomputed operator list, so you pay the parse twice if you hash first.
- Better fingerprint: hash the page's input (the render model per page) on the server before PDF generation, and send per-page hashes alongside the bytes. The viewer then only compares hashes. This is my recommendation, not something a source says.
- Reflow caveat (general PDF layout behaviour, not sourced): a text edit on page 2 can move every later page break, so "only the changed page" can change many pages. Measure how often this happens on real policies before promising page-local updates.
- Swap without flicker: pdf.js's own viewer keeps the old canvas visible until the new one is drawn, then removes it, and cancels in-flight renders on reset (https://raw.githubusercontent.com/mozilla/pdf.js/master/web/pdf_page_view.js: `draw()`, `update()` with `keepCanvasWrapper`, `cancelRendering()`). The repo's `PdfPage` (`:240-261`) already does the same per page.
- `RenderTask.cancel()`: "If the task is currently rendering it will not be cancelled until graphics pauses with a timeout." (api.d.ts). Cancelling is not instant.
- react-pdf prior art: `Document` caches the loaded document under a `[file, options]` key and calls `getDocument` only on a cache miss (https://raw.githubusercontent.com/wojtekmaj/react-pdf/main/packages/react-pdf/src/Document.tsx). `Page` remounts its canvas whenever `pageKey` (`${pageIndex}@${scale}/${rotate}`) changes, so scale changes cost a full re-render (https://raw.githubusercontent.com/wojtekmaj/react-pdf/main/packages/react-pdf/src/Page.tsx). Neither library skips unchanged pages in a new document; they only avoid redundant loads of the same document.
- Render-speed numbers: not found in primary sources. Measure in the browser with `performance.mark` around `getDocument`, `getPage`, `render`, and `getTextContent`.

## 4. Streaming and progressive display

- Linearized PDF (PDF 1.7 / ISO 32000-1 Annex F, as hosted at https://pdf-issues.pdfa.org/32000-2-2020/clauseAnnexF.html): the `P` entry is "The page number of the first page", optional, default 0 (F.3.3, Table F.1). The layout is designed so a reader can fetch page 1 by byte range before the rest of the file arrives. I could not extract the full object order from this page (the ordering I found in secondary sources conflicts, so check the spec text).
- pdf.js reads the linearization dictionary (`O`, `E`, `N`, `H`, `P`) in `Linearization.create` (https://raw.githubusercontent.com/mozilla/pdf.js/master/src/core/parser.js, around line 1040-1120; approximate).
- Consequence for this repo: progressive display needs (a) the server to emit a linearized PDF (a tool such as qpdf can do this; not verified here), and (b) the viewer to load by URL with range-request support instead of `data:`. Today the full buffer is returned by `requestPolicyPreview` and passed as `data` (`:45`, `:134`), so pdf.js has the whole file and streaming yields nothing.
- Page-by-page streaming from the server would need separate per-page PDFs or an incremental-update scheme (PDF spec section 7.5.6, not fetched). Unverified and probably more complex than rasterising changed pages.

## 5. Prior art (viewer side)

- Typst / tinymist: the preview recompiles and sends SVG; the in-browser update is a DOM-level diff of the whole output (https://git.joshthomas.dev/language-servers/tinymist/src/branch/main/crates/typst-preview). The newer GPU viewer (pre-release v0.14.20-rc1) lists "renderer diff protocol and viewer" and "Cached flushed page scenes for incremental viewer rendering" (https://newreleases.io/project/github/Myriad-Dreamin/tinymist/release/v0.14.20-rc1). These are pre-release notes; I could not confirm they are in a stable release. This is the closest prior art to "only changed pages repaint", and it works because the renderer is not a monolithic PDF.
- LaTeX Workshop: a PDF.js-based built-in viewer refreshed over WebSocket; refreshes are rate-limited and queued (changelog mirror: https://gitlab.b-data.ch/james-yu/latex-workshop/-/blob/fa94edff627eb1cb37b051b8baee3c9077e29969/CHANGELOG.md). It refreshes the whole document, not page-level. Secondary source.
- Overleaf: the viewer keeps position across recompiles (https://docs.overleaf.com/navigating-in-the-editor/working-with-the-pdf-viewer/pdf-viewer-options-and-navigation). I could not find its frontend source or how it swaps pages. Unverified.

## 6. Recommendations (ranked, for a spike)

1. Measure first: time `getDocument` (worker spin-up plus parse), `getPage`, `render`, and `getTextContent` per update, with `performance.mark`. This decides whether worker reuse or render caching matters most.
2. Reuse one worker: create one `Worker` for `/api/pdf-worker` and pass it via `GlobalWorkerOptions.workerPort`. Verify lifecycle against the destroy rules above.
3. Fingerprint on the server: per-page hashes of the render model, returned with the PDF. Keep the viewer comparison trivial.
4. Cache by page hash: when a page hash matches the previous version at the same index, keep the existing canvas and skip `render`/`getTextContent` for that page. Only valid if page indices match; reflow breaks this, so measure reflow frequency first.
5. Streaming is a larger change: linearized output plus URL/range transport. Do not pursue it before 1-4.

## Gaps and caveats

- `isEvalSupported` default and effect: not verified.
- Whether pdf.js v5 can render to OffscreenCanvas on the main thread: not documented in fetched sources.
- Overleaf internals and typst's stable-release status: not verified.
- Render timings: no primary-source numbers found.
- The PDF 1.7 spec PDF (opensource.adobe.com) was too large to fetch; linearization facts come from pdfa.org's Annex F and pdf.js source.

## Sources

- https://mozilla.github.io/pdf.js/api/draft/ (index only, not useful)
- https://unpkg.com/pdfjs-dist@5.7.284/types/src/display/api.d.ts
- https://unpkg.com/pdfjs-dist@5.7.284/types/src/display/canvas.d.ts (no OffscreenCanvas info)
- https://raw.githubusercontent.com/mozilla/pdf.js/master/src/display/api.js
- https://raw.githubusercontent.com/mozilla/pdf.js/master/src/display/worker_options.js
- https://raw.githubusercontent.com/mozilla/pdf.js/master/web/pdf_page_view.js
- https://raw.githubusercontent.com/mozilla/pdf.js/master/src/core/parser.js
- https://raw.githubusercontent.com/wojtekmaj/react-pdf/main/packages/react-pdf/src/Document.tsx
- https://raw.githubusercontent.com/wojtekmaj/react-pdf/main/packages/react-pdf/src/Page.tsx
- https://pdf-issues.pdfa.org/32000-2-2020/clauseAnnexF.html
- https://newreleases.io/project/github/Myriad-Dreamin/tinymist/release/v0.14.20-rc1
- https://git.joshthomas.dev/language-servers/tinymist/src/branch/main/crates/typst-preview
- https://gitlab.b-data.ch/james-yu/latex-workshop/-/blob/fa94edff627eb1cb37b051b8baee3c9077e29969/CHANGELOG.md (mirror)
- https://docs.overleaf.com/navigating-in-the-editor/working-with-the-pdf-viewer/pdf-viewer-options-and-navigation
- Repo: `D:\Policy PoC\src\components\policy\pdf-policy-preview.tsx`, `D:\Policy PoC\src\app\api\pdf-worker\route.ts`, `D:\Policy PoC\src\bun.lock`
