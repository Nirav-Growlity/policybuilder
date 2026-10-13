# 13 - PDF libraries for post-processing and display (PolicyCraft)

Scope: research only. Nothing under `D:\Policy PoC` was modified. No timing was run; all speed statements below are either maintainer statements (qualitative) or marked "no benchmark found".

## Current pipeline (code facts)

- `src/lib/pdf/print-document.tsx:7` imports `pdf-lib`. The production path is `finalizePdf` (lines 294-302): one `PDFDocument.load` -> paint backgrounds -> embed cover (`embedPng`, line 273, once) -> draw borders -> one `pdf.save()`. Line 103 calls it.
- The exported `applyPageBackground` (228-233), `applyCustomCoverPage` (264-268) and `applyPageBorders` (277-282) each do their own load/save. They are not on the hot path; calling them in sequence would add a full parse and reserialize each time.
- `paintPageBackground` (235-261) builds the gradient shading inside the per-page loop (lines 237-249), so a separate shading dictionary is registered for every page. One shared reference would reduce output size and serialize work.
- `src/components/policy/pdf-policy-preview.tsx:131-134` loads pdfjs-dist 5.x and calls `getDocument({ data: bytes.slice() })`. The `.slice()` copies the whole buffer. A new document is created for every `bytes` change (effect at 126-139). pdf.js has no way to patch an existing document, so reuse is not possible when the bytes change.

## Comparison: post-processing / merge

| Option | Licence | Speed evidence | Incremental save | Integration effort | Visual identity risk |
|---|---|---|---|---|---|
| **pdf-lib 1.17.1** (current) | MIT (GitHub page) | None from maintainers. Migration guide offers `objectsPerTick` and `parseSpeed` tuning ([pdf-lib MIGRATION.md](https://github.com/aatos-app/pdf-lib/blob/HEAD/docs/MIGRATION.md) mirror). Maintenance: GitHub page shows 279 open issues and points to MAINTAINERSHIP.md; no release-date statement found. | No. Full rewrite only. Save options listed on the API page: `useObjectStreams`, `addDefaultPage`, `objectsPerTick`, `updateFieldAppearances` ([SaveOptions](https://pdf-lib.js.org/docs/api/interfaces/saveoptions)). | None (baseline) | Baseline |
| **@cantoo/pdf-lib 2.7.x** | Fork of pdf-lib, licence not checked on the fork page | None. Fork adds SVG support. Cantoo says it will maintain "as long as we need it" ([npm/socket listing](https://socket.dev/npm/package/@cantoo/pdf-lib/overview/2.7.4), [README mirror](https://unpkg.com/@cantoo/pdf-lib@2.7.1/README.md)). | Not stated | Low: change import, verify API parity | Baseline. Verify byte-for-byte or pixel-for-pixel on fixtures. |
| **@libpdf/core** (LibPDF) | Not checked | Vendor claim "Faster for small changes"; no numbers ([docs](https://libpdf.documenso.com/docs/concepts/incremental-saves)) | Yes: `save({ incremental: true })` appends modified and new objects with a new xref and `/Prev`. Cannot be used on `PDF.create()` documents; falls back to full save with a warning. | Medium. Young, pdf-lib-inspired API; API parity unverified. | Changes output structure. Full-rewrite and appended files must both be pixel-tested. |
| **mupdf.js** (`mupdf` npm 1.26.x) | **AGPL-3.0-or-later, or commercial** from Artifex ([npm listing](https://npmjs.com/package/mupdf), [license docs](https://mupdf.readthedocs.io/en/1.27.0/license.html)) | None on the docs pages fetched. | Not verified in mupdf.js docs (docs fetch returned only navigation). The MuPDF engine supports incremental save: PyMuPDF documents it ([wiki](https://github.com/pymupdf/PyMuPDF/wiki/Using-Incremental-Saves)). | Medium-high, ESM only, WASM | Rendering differs from pdf.js and PDFium. |
| **qpdf** (C++, Apache-2.0) and **@neslinesli93/qpdf-wasm** (ISC wrapper) | Engine Apache-2.0 ([qpdf docs](https://qpdf.readthedocs.io/en/stable/), [licence summary](https://www.debian.org/)); wrapper ISC per [jsDelivr metadata](https://www.jsdelivr.com/package/npm/@neslinesli93/qpdf-wasm?tab=files) | None. Docs index lists object streams and linearization, no performance statements. | Not found in docs index. qpdf does not draw content, so it needs a helper PDF for overlays. | Medium: CLI process on the server, or a multi-MB WASM build | Structural tool, not a drawing tool. Overlays and gradients would need generated helper PDFs. |
| **muhammara** 6.0.4 (HummusJS successor) | Apache-2.0 ([package.json](https://cdn.jsdelivr.net/npm/muhammara@6.0.4/package.json)) | None. Last publish date conflicting across indexes (Feb 2026 per one index). | Modifying existing files is an append-style operation in HummusJS (from memory, not verified). | Medium. Native addon, Node >=17. Risk on Vercel/Lambda without prebuilt binaries. | Drawing API is low-level; visual match needs testing. |
| **pdfcpu** (Go) | Apache-2.0 per mirrors; official repo not fetched | None | Not found. Merge and stamp/watermark supported. | Medium: binary spawn; no WASM build verified | Watermark semantics differ from drawing rectangles; test. |
| **PDFium** `FPDF_SaveAsCopy` with `FPDF_INCREMENTAL` | BSD / Apache-2.0 | None. Commit "Fix incremental PDF save functionality for edited documents" shows incremental writes new and modified objects ([commit](https://pdfium.googlesource.com/pdfium.git/+/2ddec2c6db6a368f166b5dd1039560dc322cb59b%5E%21/)). `fpdf_save.h` names the flags but does not define incremental. | Yes (flag) | High: C API, page-object construction by hand | Same engine as Chrome viewer. |

## Comparison: display

| Option | Licence | Speed evidence | Worker / OffscreenCanvas | Integration effort | Visual identity risk |
|---|---|---|---|---|---|
| **pdf.js 5.x** (current, `pdfjs-dist`) | Apache-2.0 (from memory; repo not fetched) | Maintainer doc: "PDFs with a smaller file size will be rendered faster", "The amount of pages does not affect the performance", and the viewer renders only visible pages ([API/tutorial](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)). No numbers. | `isOffscreenCanvasSupported` default true on web; `canvasMaxAreaInBytes`, `enableHWA` options exist. The 5.0 release notes (mirror) list no OffscreenCanvas change ([notes mirror](https://newreleases.io/project/npm/pdfjs-dist/release/5.0.375)). | None (baseline) | Baseline |
| **EmbedPDF** (`@embedpdf/pdfium` 2.14.3) | Wrapper MIT; PDFium Apache-2.0 per viewer repo. Community claim that the PDFium source is not upstream is unverified ([Privacy Guides thread](https://discuss.privacyguides.net/t/javascript-pdf-viewer-alternative-to-adobe-acrobat-pdf-viewer/30078.md)). | None found. Search returned no benchmark. | Not verified | High: new viewer, rewrite of `pdf-policy-preview.tsx` (267 lines) | Different rasterizer than pdf.js; expect antialiasing diffs. |
| **Chrome PDF viewer** (PDFium, `<iframe>` or `<embed>` with a blob URL) | New BSD for PDFium ([search summary](https://chromium.googlesource.com/chromium/src/+/74.0.3729.169/pdf/pdfium/pdfium_engine.h)) | None found | Not applicable | Low to render, but no React-controlled page layout or zoom; Chromium-only | Native PDFium output, not pdf.js. Only Chromium-based browsers; Firefox and Safari differ. |
| **mupdf.js render** | AGPL or commercial | None | Not verified | Medium-high | As above |
| **Nutrient / Apryse** | Commercial | Apryse benchmark is a reliability study, not speed ([Apryse benchmark](https://apryse.com/blog/pdf-js/pdf-js-reliability-benchmark)) | Vendor | High cost | Not evaluated (commercial; no public speed data) |

## Techniques

1. **Avoid the post-process entirely (largest potential win).** Every page is changed by the background and border overlays (`print-document.tsx:252-254`, `290`), so an incremental save does not reduce work. Painting the background inside the Chromium HTML (full-bleed element, `printBackground`) would remove a load/save cycle. The comment at lines 226-227 says Chromium clips CSS backgrounds to `@page` margins, so that path needs a visual diff first.
2. **Single load/save.** Already in place for the hot path (`finalizePdf`). Keep it.
3. **Create the page-background shading once.** Move `pdf.context.obj({ ShadingType: 2, ... })` and `register` out of the page loop (lines 244-248) and reuse the reference. This is a lossless size and serialize reduction.
4. **Embed the cover once and reuse.** Already done (line 273). Images are not deduplicated by pdf-lib: each `embedPng` call creates a new XObject (from general knowledge; no pdf-lib issue found).
5. **Object streams.** pdf-lib's `useObjectStreams` default is believed to be true (not verified in the fetched docs). pdf-lib issue #95 quotes a maintainer suggesting `useObjectStreams: false` for very large PDFs because some readers are slow ([issue thread](https://github.com/Hopding/pdf-lib/issues/95)). Measure both settings on real output: time, bytes and pdf.js first-page time.
6. **Server-side `objectsPerTick: Infinity`.** The migration guide suggests it for server saves; it makes save one synchronous block with no event-loop yields ([MIGRATION.md mirror](https://github.com/aatos-app/pdf-lib/blob/HEAD/docs/MIGRATION.md)). Measure in the actual route; it blocks the event loop.
7. **Cover PNG.** Optimize losslessly before `embedPng` (for example `sharp`, which is already in `package.json`). Avoid JPEG unless a pixel diff proves it invisible.
8. **Display.** Remove the `bytes.slice()` copy at `pdf-policy-preview.tsx:134` if the buffer is not reused. Keep the existing mounted-page strategy, which renders only visible pages. Keep pdf.js: it is the only option that is Apache-2.0, maintained by Mozilla, and already integrated.
9. **Linearization.** Not useful for in-memory bytes. It helps only when a viewer streams the file over HTTP range requests.

## Recommendation

- Keep pdf-lib for post-processing. No candidate offers verified speed evidence, and the workload rewrites every page, so incremental save does not apply. Test `@cantoo/pdf-lib` only if pdf-lib parsing becomes a measured bottleneck.
- Keep pdf.js for display. Measure first-page time before any viewer swap.
- Do the cheap changes first: shared shading (3), `objectsPerTick` and object-stream measurement (5, 6), cover PNG optimization (7), and removing the `slice()` copy (8).
- Any library swap needs a pixel diff (for example pixelmatch on pdf.js renders at fixed DPI) before it is called "visually identical". Different rasterizers will not match exactly.
- Licences: mupdf.js requires AGPL or a commercial agreement. qpdf and muhammara are Apache-2.0. pdfcpu is Apache-2.0 per mirrors.

## Gaps

- No maintainer benchmark exists for pdf-lib, @cantoo, mupdf, qpdf, pdfcpu, PDFium or EmbedPDF. Measure locally on a ~10-page fixture with images.
- mupdf.js and pdfcpu official repositories and docs could not be fetched (404 or navigation-only pages); their claims rely on secondary sources.
- LibPDF licence and API parity were not checked.
- pdfium.js was not evaluated.
