# Fidelity of an on-screen paged HTML view vs Chromium print output

Scope: research only. No repo files were touched. Claims are tagged:
- **[SRC]** verified from a fetched primary or near-primary source (URL given)
- **[SEARCH]** only seen in search-result text, not opened; treat as a lead
- **[INF]** my inference, needs a test in this codebase

## 1. How Chromium fragments content for print

- Fragmentation only happens inside a fragmentation context. Such a context is "most commonly established by a multi-column container", and printing is the other case. [SRC] https://developer.chrome.com/docs/chromium/renderingng-fragmentation
- A fragmentainer is a column in multicol or a page in paged media. Both use the same LayoutNG block-fragmentation engine. [SRC] same URL
- Milestones: core LayoutNG block fragmentation in Chrome 102; flex and grid in 103; tables in 106; the legacy engine was no longer used for layout as of Chrome 108. Printing "shipped in Chrome 108". [SRC] same URL
- `break-before/after: avoid` is supported in the NG engine. Orphans/widows can be violated when rules conflict. [SRC] same URL
- Spec: a forced break outside a matching fragmentation context "has no effect". Orphans and widows have initial value 2 and apply to block containers that establish an inline formatting context. `break-inside` accepts `auto | avoid | avoid-page | avoid-column | avoid-region`. [SRC] https://drafts.csswg.org/css-break/
- The CSS Break spec does not say how a screen with no fragmentainer behaves beyond "a box in continuous flow always consists of only one fragment". [SRC] same URL
- Paged media "is split into one or more discrete static display surfaces". The page box is "roughly analogous to the viewport". Media queries do not honour `size`. In continuous media the `pages` counter is always 1. [SRC] https://drafts.csswg.org/css-page-3/

**Consequence:** a normal screen page is one continuous fragment. Chrome's print pagination cannot be switched on in an ordinary page.

- DevTools "Emulate CSS media type: print" only changes the media type. The DevTools doc says nothing about pagination. [SRC] https://developer.chrome.com/docs/devtools/rendering/emulate-css
- Playwright: `page.pdf()` uses `print` media by default. `emulateMedia` accepts `'screen' | 'print' | null`. [SRC] https://playwright.dev/docs/api/class-page#page-emulate-media and https://playwright.dev/docs/api/class-page#page-pdf
- So the only native print-pagination path is an actual print or PDF render. Any instant preview has to paginate in JS.

## 2. CSS features that matter for PolicyCraft

| Feature | Chrome | Firefox | Safari | Source |
|---|---|---|---|---|
| `@page size` | 15 | 95 | 18.2 | [SRC] MDN BCD: https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/page.json |
| Margin boxes (`@top-center`, `@bottom-center`, the 16 boxes) | 131 | **no** | **no** | [SRC] same JSON, keys `at_*` |

- Chrome 131 margin boxes apply "only when a page is printed (including to PDF)". The page margin is split into 16 boxes. Counters are supported for page numbers. [SRC] https://developer.chrome.com/blog/print-margins and https://developer.chrome.com/release-notes/131
- Browser-generated headers/footers can appear alongside. If page margins are zero or too small, those headers/footers do not display. [SRC] https://developer.chrome.com/blog/print-margins
- Firefox: a Bugzilla entry (1905342) adds CSSOM margin-rule support behind a `PageMarginBoxes` flag. Rendering of margin boxes was not confirmed. [SEARCH] https://bugzilla.mozilla.org/show_bug.cgi?id=1905342
- Safari: no support found. An Apple forum thread reports `@page` margin ignored even with the experimental flag on. [SEARCH] https://developer.apple.com/forums/thread/695544

**Consequence:** a `@bottom-center` page-number footer exists only in Chrome's PDF. A screen view can draw it in the DOM, but Firefox and Safari users never see it in print.

- Table header repetition is optional for print UAs: "Print user agents may repeat header rows on each page spanned by a table." [SRC] https://www.w3.org/TR/CSS21/tables.html (section 17.2)
- The CSS Repeated Headers `repeat-on-break` proposal is "not submitted to CSS Working Group yet" (stated on the Vivliostyle supported-features page). [SRC] https://docs.vivliostyle.org/en/reference/supported-css-features/
- Whether Chrome repeats `<thead>` on each page: **not verified**. Test it.

## 3. Approaches to an on-screen paged view

### a) Paged.js (polyfill, JS chunker)
- Chunker fills a box, measures overflow, starts a new box, repeats. "Each page is a column" in CSS multicolumn, which gives access to column-breaks, `element()`, widows and orphans. [SRC] https://pagedjs.org/en/documentation/4-how-paged.js-works/
- The polisher replaces `@page` rules with classes and uses JS for declarations the browser lacks. Output is static: "you'll need to refresh the page" after any change. [SRC] same URL
- Speed and exact measurement method are not documented there. **Not verified.**
- Docs say nothing about parity with native print. Paged.js's chunker is a different pagination algorithm from Chrome's NG fragmentation, so breaks can differ. [INF]
- Dated docs (2019 page); npm README cited at 0.4.3. [SRC] https://cdn.jsdelivr.net/npm/pagedjs@0.4.3/README.md (URL from search, not opened)
- Server-side use: a Puppeteer-based CLI drives headless Chromium to produce PDFs. [SEARCH] https://pagedjs.org/ (Coko/Editoria notes)

### b) Vivliostyle.js / Viewer
- Claims support for CSS Paged Media 3 and GCPM 3. It lets the browser handle any property it does not implement itself. "Multi-column processing depends on the browser's multi-column implementation." [SRC] https://docs.vivliostyle.org/en/reference/supported-css-features/
- Margin boxes are listed as supported in the reference. [SRC] same URL
- Licence and maintainer details came from search text only. [SEARCH]

### c) CSS multicol "pages" (columns of fixed height)
- Columns are a fragmentation context on the same engine as print pages (see section 1). This is the closest on-screen approximation of Chrome's real fragmentation. [SRC for engine sharing; INF for the approximation]
- Gaps: no `@page` margins, no margin boxes, no repeated headers, and multi-column breaking may still differ in details. Verify with tests. [INF]

### d) Manual JS pagination by measuring
- Measure block heights with `getBoundingClientRect`, insert breaks. Line-level orphans/widows, `break-inside`, and table splitting must be coded by hand. [INF] Gives full control, most work.

### Ranking for fidelity (my judgement, not sourced)
1. Real Chrome PDF (the authority, unchanged)
2. Paged.js (same browser engine, different chunker)
3. Multicol columns in the same HTML (same fragmentation engine, but no page-box features)
4. Hand-rolled measurement

## 4. Differences to expect

- **Colours and backgrounds:** "By default, `page.pdf()` generates a pdf with modified colors for printing. Use the `-webkit-print-color-adjust` property to force rendering of exact colors." [SRC] https://playwright.dev/docs/api/class-page#page-pdf. Mitigation: set `print-color-adjust: exact` on both paths.
- **Units:** `1in = 96px`; "1px = 1/96th of 1in". Physical units "might not map to a whole number of device pixels". [SRC] https://www.w3.org/TR/css-values-4/#absolute-lengths. Expect sub-pixel rounding differences in page-fill calculations. [INF]
- **Media queries:** the spec says they do not honour `@page size`, so `@media (width: …)` rules can differ between screen and print. [SRC] css-page-3 above.
- **Fonts:** `document.fonts.ready` can resolve before a font is requested, and fonts used only by print CSS may be missed. Use `document.fonts.load(...)` for each face first. [SEARCH] stimulsoft forum and WebKit bug 225790 (https://bugs.webkit.org/show_bug.cgi?id=225790). Safari behaves differently from Chrome here, per a WebKit report. [SEARCH]
- **Line breaking:** `text-wrap: pretty` is a slower algorithm that "favors better layout over speed", and it is the kind of setting that can differ per engine. Compatibility was not retrieved. [SRC for the description] https://developer.mozilla.org/en-US/docs/Web/CSS/text-wrap-style
- **Headless vs headed Chrome:** a blog reports that headed Chrome ignores CSS page dimensions while headless honours them, and that headless refuses to fetch resources referenced in `@page` rules. [SEARCH] https://andre.arko.net/2025/05/25/chrome-headless-print-to-pdf/ (not opened, single source)
- **Pagination semantics:** the Paged.js and Chrome engines reportedly disagree on how to interpret the spec. [SEARCH] unverified source.
- **Table row splitting:** Chrome tables fragment since 106 (see section 1). Whether a row splits across pages must be tested.

## 5. Cross-browser viewers (Firefox / Safari as the user's browser)

- The layout engines differ. Margin boxes are absent in both (section 2). Line breaking and font-loading timing differ (section 4). [SRC/SEARCH above]
- Mitigations [INF unless marked]:
  - Self-host the exact WOFF2 files the PDF embeds, and load them with `document.fonts.load` before measuring.
  - Draw footers and page numbers in the DOM for the preview only, but accept that the preview then diverges from Chrome's native margin-box output.
  - Always let the server-side Chrome PDF be the authority. The preview is a model, not the deliverable.

## 6. Documented teams doing "same HTML on screen, print to PDF"

- **Coko / Editoria:** Paged.js was built for Editoria, which exports PDF with it. Server-side PDF uses a Puppeteer CLI on headless Chromium. [SEARCH] https://pagedjs.org/posts/en/our-position-paper-for-the-w3c-css-print-workshop/ and https://compendium.copim.ac.uk/tools/128. These sources are self-reported by the Paged.js and Coko teams.
- **Pagedown (R):** drives headless Chrome and sets `printBackground` and `preferCSSPageSize` on, so the CSS page size is honoured. [SEARCH] https://cran.r-project.org/web/packages/pagedown/refman/pagedown.html
- **parsers.vc legal-document case:** tried jsPDF then wkhtmltopdf. The client required the PDF to match the screen display, and the team ended up with two display modes. This is evidence the screen-vs-PDF gap is a real product problem. [SEARCH] https://parsers.vc/news/250212-navigating-the-pdf-generation-maze--a
- I found **no** documented case of a team serving an instant HTML paged preview with a guaranteed sync to Chrome's PDF. The sync mechanism below is my recommendation.

## 7. Recommendation for keeping preview and PDF in sync (my proposal)

1. One source of truth: the same React-rendered HTML and CSS feeds both the preview and the Chrome PDF path.
2. Preview paginates in JS (multicol or Paged.js), with page content box fixed in CSS px from the `@page` size minus margins.
3. Parity tests in CI: for a corpus of documents, compare preview page count and per-page text against `pdf-parse`-style extraction of the Chrome PDF. Fail on mismatch.
4. Document the known deltas (margin boxes, header repetition, Firefox/Safari) so the user knows what the preview cannot show.

## 8. Open items to verify by test

- Does Chrome repeat `<thead>` on each printed page for this codebase's tables?
- Does multicol column breaking match Chrome print breaks for `break-inside: avoid`, widows and orphans?
- Speed of Paged.js and Vivliostyle on a 50-page policy: not documented, must measure.
- Exact Firefox and Safari margin-box status: check MDN BCD (already shows false for both) and Bugzilla 1905342 for current state.
