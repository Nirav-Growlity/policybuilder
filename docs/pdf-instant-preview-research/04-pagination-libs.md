# HTML/editor pagination libraries: speed, incremental re-pagination, Chrome-print fidelity

Scope: research only. No files in `D:\Policy PoC` were touched. Dates are as of 2026-10-12.
Verification note: "not found" means no primary source was located in this session. It does not mean the feature is absent. No library below has a primary-source benchmark for paginating 10-30 pages, so every timing claim needs a local measurement.

## Summary

- **Paged.js** (MIT) is the only candidate that runs the same HTML/CSS in the browser and documents CSS paged media (margin boxes, `counter(pages)`, `target-counter()`). Its Chunker exposes resumable layout from a break token, which is the building block for partial re-pagination. Re-pagination from a changed point is not documented as implemented.
- **Vivliostyle Viewer** (AGPL-3.0) has the broadest documented CSS paged-media support. Its issue tracker shows that cross-references force repeated page re-renders and that a 100+ page manual took about 40 s with a TOC. That makes it a poor fit for an instant preview.
- **Canvas-editor** (MIT) is fast and native-paginated, but it is canvas-based, does not use CSS paged media, and is not a Chrome-print match.
- **Tiptap Pages, CKEditor 5 Pagination** are commercial editor overlays. Neither documents incremental re-pagination or Chrome-print parity.
- **react-to-print** produces true Chrome print output but is not a preview paginator. **@react-pdf/renderer** is DOM-free but uses its own primitives, not HTML/CSS.

## Comparison table

| Library | Licence | Latest release / last push | Stars | React / Next.js | Paginate 10-30 pages | Incremental re-pagination from a changed point | CSS Paged Media | Closeness to Chrome print |
|---|---|---|---|---|---|---|---|---|
| **Paged.js** `pagedjs/pagedjs` | MIT ([README](https://github.com/pagedjs/pagedjs)) | npm `latest` 0.4.3 ([npm registry](https://registry.npmjs.org/pagedjs)); npm `beta` 0.5.0-beta.2 ([jsDelivr](https://data.jsdelivr.com/v1/package/npm/pagedjs)); GitHub has no Releases; last push 2026-10-06 ([GitHub API](https://api.github.com/repos/pagedjs/pagedjs)). Publish date of 0.4.3 not verified. | 1,529; 235 open issues | Plain JS, works in React via `Previewer` import ([README](https://github.com/pagedjs/pagedjs)). No React-specific wrapper found. | Not measured. No benchmark found. | Possible in principle: `layout(content, startAt?)` is an async generator yielding break tokens, `removePages(fromIndex)` exists ([Chunker docs](https://pagedjs.org/devdocs/Chunker.html)). Not documented as used for edits. | Margin boxes, `counter(pages)`, `target-counter()` listed in supported-features page, but with open-issue markers (Issue#46 on target-counter) and `@footnote` and `leader()` marked "no" ([W3C feature page](https://pagedjs.org/en/documentation/14-supported-feature-of-the-w3c-specifications/)). | Runs in Chrome's own layout engine and re-fragments. Not documented as pixel-equal to Chrome print. |
| **Vivliostyle Viewer** `vivliostyle/vivliostyle.js` | AGPL-3.0 ([GitHub API](https://api.github.com/repos/vivliostyle/vivliostyle.js)) | Latest release v2.45.2, 2026-09-23 ([releases](https://api.github.com/repos/vivliostyle/vivliostyle.js/releases/latest)); last push 2026-10-12 | 796; 125 open issues | Plain JS; no React wrapper found | Issue #1652: 100+ page manual, under 10 s without TOC, about 40 s with TOC page numbers in v2.40.0 ([issue](https://github.com/vivliostyle/vivliostyle.js/issues/1652)) | Not supported. Maintainer says cross-references need one re-render per `target-counter()` reference and a full TeX-like re-typeset would need deeper refactoring ([issue #1652](https://github.com/vivliostyle/vivliostyle.js/issues/1652)). | Broadest documented: margin boxes, page-based counters (`page`, `pages`), `target-counter()`, `running()`, `string-set`, `leader()`, `@page { @footnote }` ([supported features](https://docs.vivliostyle.org/en/reference/supported-css-features/)) | Not documented as Chrome-matching. Its CLI is the path for print-ready PDF ([docs](https://docs.vivliostyle.org/en/)). |
| **Canvas-editor** `Hufe921/canvas-editor` | MIT ([README](https://github.com/Hufe921/canvas-editor)) | No GitHub Releases (404); last push 2026-10-11 ([API](https://api.github.com/repos/Hufe921/canvas-editor)) | 5,228; 34 open issues | Framework-agnostic canvas editor; no React wrapper verified | Not measured | Not stated in README. Web Workers are used only for word count, catalog and async value retrieval ([README](https://github.com/Hufe921/canvas-editor)). | Not CSS-based. Native pagination with headers, footers, page numbers; page sizes not documented ([README](https://github.com/Hufe921/canvas-editor)). | Low: it draws on `<canvas>`, so output is not a Chrome-print match. |
| **Tiptap Pages** (`@tiptap-pro/extension-pages`) | Pro, included with Tiptap subscriptions; private npm registry ([docs](https://tiptap.dev/docs/pages/getting-started/overview.md)) | Beta surface, pin versions ([docs](https://tiptap.dev/docs/pages/getting-started/overview.md)) | n/a | React via `@tiptap/react` | Not measured | Not stated. Docs do not say whether layout is DOM-based or incremental. | Not CSS paged media. No per-page styling or page templates. | Not stated. No browser-print integration; use Conversion extensions ([docs](https://tiptap.dev/docs/pages/getting-started/overview.md)). Oversized non-splittable blocks cause an infinite layout loop ([docs](https://tiptap.dev/docs/pages/getting-started/overview.md)). |
| **tiptap-extension-pagination** (community) | Not verified (GitHub URL returned 404). npm README for 2.1.4 ([jsDelivr](https://cdn.jsdelivr.net/npm/tiptap-extension-pagination@2.1.4/README.md)) | Not verified | Not verified | Tiptap | Not measured | Not documented | Not CSS paged media | Not stated |
| **CKEditor 5 Pagination** | Premium; one guide says included in a Flexible plan; editor goes read-only without auth ([guide](https://ckeditor.com/docs/cs/latest/guides/pagination/quick-start.html)) | Not verified | n/a | Not verified | Not measured | Not documented | Not CSS paged media. A4 is set via `pagination` config (21 x 29.7 cm, margins 20/12 mm) ([API](https://ckeditor.com/docs/ckeditor5/latest/api/module_pagination_pagination-PaginationConfig.html)). | Not stated. Must match PDF/Word export config ([integration](https://ckeditor.com/docs/ckeditor5/latest/features/pagination/pagination-integration.html)). Blink-only by default ([search summary](https://ckeditor.com/docs/ckeditor5/latest/features/pagination/pagination-integration.html)). |
| **docx-preview** (`VolodymyrBaydalka/docxjs`) | Apache-2.0 ([API](https://api.github.com/repos/VolodymyrBaydalka/docxjs)) | Last push 2026-09-21 | 2,117; 82 open issues | Plain JS | Not applicable | Not applicable. It does no measured pagination. | Not applicable. It breaks pages only at explicit markers (`w:br type=page`, `lastRenderedPageBreak` when `ignoreLastRenderedPageBreak: false`). Real-time page breaking is "not implemented" ([README](https://github.com/VolodymyrBaydalka/docxjs)). | Only for DOCX display, not for layout of edited text. |
| **Bindery.js** `evnbr/bindery` | MIT ([API](https://api.github.com/repos/evnbr/bindery)) | **Archived**; last push 2023-04-04; npm 2.3.6 published 2021-01-10 ([npm](https://registry.npmjs.org/bindery)) | 415 | Plain JS | Not measured | Not supported | Partial (book layout) | Not evaluated; stale |
| **ProseMirror A4 pagination** `todorstoev/prosemirror-pagination` | MIT ([API](https://api.github.com/repos/todorstoev/prosemirror-pagination)) | Last push 2024-12-18 | 96 | ProseMirror, not React-specific | Not measured | Not documented. Forum users report it is unmaintained and did not work for them ([ProseMirror forum](https://discuss.prosemirror.net/t/a-new-text-editor-with-pagination/6667)). | Not CSS paged media | Not stated |
| **react-to-print** `gregnb/react-to-print` | MIT ([API](https://api.github.com/repos/gregnb/react-to-print)) | Last push 2026-09-14 | 2,475 | Built for React | Not a paginator. It hands the component to the browser's print dialog. | n/a | Chrome's native print CSS | Exact, because it is Chrome print. It cannot give an instant on-screen paginated preview. |
| **@react-pdf/renderer** `diegomura/react-pdf` | MIT ([API](https://api.github.com/repos/diegomura/react-pdf)) | Last push 2026-10-07 | 16,827 | React-native | Not measured | Not documented | Not HTML/CSS. Uses `Document`/`Page`/`Text`/`View` primitives with flexbox-style `StyleSheet` ([README](https://github.com/diegomura/react-pdf)). No documented `@page` or page-counter support was confirmed. | Low: a different layout model, so output will not match the existing Chrome-printed HTML. |
| **react-pdf** `wojtekmaj/react-pdf` | MIT | n/a | 11.2k | React | n/a | n/a | n/a | Display-only, not a generator ([README](https://github.com/wojtekmaj/react-pdf)). Not relevant for generation. |

## Chrome support for the paged-media features (the reference target)

- Chrome has supported CSS margin boxes (`@top-center`, 16 boxes total) since Chrome 131 ([Chrome blog](https://developer.chrome.com/blog/print-margins)).
- `target-counter()` is not confirmed as shipped in Chrome. The Chrome blog links it to a Chromium bug. A search summary cites crbug.com/40529223, open since 2017 ([Chrome blog](https://developer.chrome.com/blog/print-margins); bug ID taken from search summary, not directly fetched).
- `counter(page)` in margin boxes is the established approach in Chrome ([Chrome blog](https://developer.chrome.com/blog/print-margins)).

## Findings on incremental re-pagination

1. **Paged.js** is the only library with a documented resumable layout primitive. `layout(content, startAt?)` yields break tokens, and `render(parsed, startAt?)` accepts a starting break token. `removePages(fromIndex)` exists. `renderOnIdle` and `renderAsync` allow idle-time layout ([Chunker docs](https://pagedjs.org/devdocs/Chunker.html)). The docs give no performance figures, and no source says that edits use this path. Prototyping is needed to see whether a change on page k leaves pages before k valid.
2. **Vivliostyle** shows the cost of cross-references in practice: the maintainer counted 215 `renderSinglePage` calls with a TOC versus 155 without, for the same manual ([issue #1652](https://github.com/vivliostyle/vivliostyle.js/issues/1652)). Any change that shifts page numbers forces re-renders downstream.
3. **Editor overlays** (Tiptap Pages, CKEditor, canvas-editor) do their own layout. None of their docs describe partial re-pagination. Tiptap's "infinite layout loop" note suggests the layout is recalculated on change ([docs](https://tiptap.dev/docs/pages/getting-started/overview.md)).
4. **Cascade risk** is general: one changed page can push content onto all later pages. A safe design caches per-section layout and invalidates from the first affected section onward. This is inference, not a sourced claim.

## Recommendation

- No library here is confirmed to give instant, incremental, Chrome-identical pagination. Paged.js is the only one that both (a) runs the same HTML/CSS as the print path and (b) exposes resumable layout. Prototype it with the Chunker's `startAt` on the PolicyCraft document and measure page-10 to page-30 edit latency.
- Keep Chrome print as the source of truth for the final PDF. Use the preview only for fast feedback.
- Avoid Vivliostyle for the live preview because of its AGPL-3.0 licence and cross-reference re-render cost. Avoid canvas-editor because it does not use CSS. Avoid Bindery because it is archived.
- Measure before committing: none of the timing claims above are from a controlled benchmark.

## Sources

- Paged.js README: https://github.com/pagedjs/pagedjs
- Paged.js GitHub API: https://api.github.com/repos/pagedjs/pagedjs
- Paged.js npm registry: https://registry.npmjs.org/pagedjs
- Paged.js npm versions via jsDelivr: https://data.jsdelivr.com/v1/package/npm/pagedjs
- Paged.js Chunker docs: https://pagedjs.org/devdocs/Chunker.html
- Paged.js supported W3C features: https://pagedjs.org/en/documentation/14-supported-feature-of-the-w3c-specifications/
- Vivliostyle GitHub API: https://api.github.com/repos/vivliostyle/vivliostyle.js
- Vivliostyle releases: https://api.github.com/repos/vivliostyle/vivliostyle.js/releases/latest
- Vivliostyle issue 1652: https://github.com/vivliostyle/vivliostyle.js/issues/1652
- Vivliostyle supported CSS: https://docs.vivliostyle.org/en/reference/supported-css-features/
- Vivliostyle docs: https://docs.vivliostyle.org/en/
- canvas-editor README: https://github.com/Hufe921/canvas-editor
- canvas-editor GitHub API: https://api.github.com/repos/Hufe921/canvas-editor
- Tiptap Pages overview: https://tiptap.dev/docs/pages/getting-started/overview.md
- tiptap-extension-pagination README (v2.1.4): https://cdn.jsdelivr.net/npm/tiptap-extension-pagination@2.1.4/README.md
- CKEditor 5 pagination config: https://ckeditor.com/docs/ckeditor5/latest/api/module_pagination_pagination-PaginationConfig.html
- CKEditor 5 pagination integration: https://ckeditor.com/docs/ckeditor5/latest/features/pagination/pagination-integration.html
- CKEditor 5 pagination quick start (licence): https://ckeditor.com/docs/cs/latest/guides/pagination/quick-start.html
- docx-preview (docxjs) README: https://github.com/VolodymyrBaydalka/docxjs
- docx-preview GitHub API: https://api.github.com/repos/VolodymyrBaydalka/docxjs
- Bindery GitHub API: https://api.github.com/repos/evnbr/bindery
- Bindery npm: https://registry.npmjs.org/bindery
- ProseMirror pagination forum: https://discuss.prosemirror.net/t/a-new-text-editor-with-pagination/6667
- prosemirror-pagination GitHub API: https://api.github.com/repos/todorstoev/prosemirror-pagination
- react-to-print GitHub API: https://api.github.com/repos/gregnb/react-to-print
- @react-pdf/renderer README: https://github.com/diegomura/react-pdf
- react-pdf (display) README: https://github.com/wojtekmaj/react-pdf
- Chrome margin boxes (Chrome 131): https://developer.chrome.com/blog/print-margins
