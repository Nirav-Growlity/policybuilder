# Codebase findings: instant Design preview

Read-only research. No repo file was changed. Paths are relative to `D:\Policy PoC\src` unless noted. Line numbers are from the working tree on branch `design-change`.

## Summary

- The document component is already client-safe. `PolicyPreview`, `PolicyCoverPreview`, the theme and render-model modules and `document-fonts.ts` import no `node:` modules and use no hooks. The client bundle already contains them (`components/templates/universal-template-catalog.tsx:9,98`, `components/builder/cover-editor.tsx:11,177`).
- All pagination comes from Chromium's print fragmentation. The component does not pre-paginate. Page size and margins come from `@page` and Playwright `page.pdf()`. Running header, footer and page numbers come from Playwright `headerTemplate`/`footerTemplate`, not CSS.
- pdf-lib adds four things: page background, page border, the cover raster, and a gradient shading. All four have CSS equivalents. The cover raster is a 794 px screenshot, so a CSS cover will look sharper and will not be byte-identical.
- Most Design controls reflow all pages. Only colours, background, border colour and border scope, cover choice, and logo position are paint-only. The biggest structural change is page margins, which move when the border, border inset or border width change and when logo scale changes on a document with a logo.
- A client HTML preview already exists for cover editing and the template gallery. Write and Design previews are PDF-only.

## 1. Server-only dependencies in the print path

The print path is `lib/pdf/print-document.tsx`. `renderToStaticMarkup` is called at lines 65 and 130. Each item below lists what it does and what the browser needs.

| Dependency | Where | Browser replacement |
|---|---|---|
| `fs` reads of `public/` plus base64 rewrite of `src="/…"` and `url(/fonts/…)` | `lib/pdf/print-document.tsx:1, 320-333` | Not needed. Fonts (`/fonts/*.woff2`, `document-fonts.ts:2`) and SDG icons (`/E%20SDG%20Icons%20WEB/…`, `components/policy/policy-preview.tsx:355`) are static files under `public/`. Fonts are also already injected globally (`app/layout.tsx:32`). |
| `react-dom/server.browser` `renderToStaticMarkup` | `print-document.tsx:5, 65, 130` | Render the React tree directly in the client, or into an iframe with `srcDoc`. `PolicyPreview` has no state or effects. |
| Chromium and Playwright (`launchPersistentContext`, `page.pdf`, header/footer) | `print-document.tsx:6, 66-101, 213-224` | Replace with a DOM pagination layer (see section 2). |
| pdf-lib post-processing | `print-document.tsx:7, 228-302` | Replace with CSS (see section 3). |
| Cover raster (Chromium screenshot of `PolicyCoverPreview`) | `print-document.tsx:129-159`; consumed at `policy-preview.tsx:125-126` | Not available client-side. The fallback is the in-flow `CustomCover` (`policy-preview.tsx:157-161`). The PDF output uses the raster, so the in-flow cover must be sized and placed to match (see section 3). |
| Asset resolution from MySQL to `data:` URLs (logo, cover background, cover elements) | `lib/cover-repository.ts:39-67`, called from `lib/policycraft-export.ts:64` | Pass `assetScope`. `PolicyPreview` already maps asset references to `/api/policycraft/cover-assets/{id}?orgId=…` (`policy-preview.tsx:164-173`). That route requires an authenticated session (`app/api/policycraft/cover-assets/[id]/route.ts:8-9`), so a same-origin browser can load it. |
| Signature image (author approval) | `lib/policycraft-export.ts:56-61`; rendered at `policy-preview.tsx:389` | Only the signed PDF path loads it. The client would need the signature bytes too. |
| Logo in the Chromium running header is used only when it is a `data:` URL | `print-document.tsx:83-85` | Not an issue for the browser. Server-side logos are already data URLs (`cover-repository.ts:48`). |
| Footer font family | `print-document.tsx:92-93` | Header and footer templates render in a separate document. Page `@font-face` rules probably do not apply there, so the footer may use an installed system font. Not verified; check the PDF's fonts. |
| Global serialized render queue, temp profiles, Chrome path discovery, `process.cwd()`, `Buffer` | `print-document.tsx:14, 24-34, 213-224, 304-318, 321` | Server only. |

What a client preview would take:

1. A client component that renders `PolicyPreview` into an iframe with `srcDoc`. The iframe isolates the document's global `<style>` rules from the app's stylesheet. The render model is pure, so it can be built from the same `policy` state.
2. Pass `assetScope` for logo and cover images, and pass the signature image for signed previews.
3. A pagination layer and CSS page furniture (sections 2 and 3).
4. A parity test. `components/policy/policy-preview.test.tsx:121-131` already uses Playwright `setContent` plus `sharp` pixel reads, so a pixel-diff harness exists.

## 2. Pagination today

Pagination is entirely Chromium's fragmentation of normal flow content. No fixed page boxes exist.

- Page size and margins: `@page { size:A4; margin: topMargin horizontal horizontal }` (`print-document.tsx:337`). Playwright repeats them with `format:"A4"`, `preferCSSPageSize:true` and `margin` (`print-document.tsx:97-100`).
- Margin values: `pageMarginMm` returns 22 mm when the border is off, and at least `insetMm + width/2 + 9` when it is on (`lib/page-geometry.ts:22-24`). With a logo, the top margin becomes `pageHeaderMarginMm` (`page-geometry.ts:57-59`; `print-document.tsx:50-52`).
- Forced breaks in print CSS: `.policy-cover` (`print-document.tsx:341`), `.policy-custom-cover` (`:342`), `.policy-toc` (`:346`), `.policy-acknowledgement` break before (`:354`).
- Break avoidance: headings `break-after:avoid` (`:356`), `p { orphans:3; widows:3 }` (`:357`), `tr { break-inside:avoid }` and table header repeat (`:358`), SDG tiles (`:362`). Sections use `break-inside:auto` (`:355`).
- Running header: visible on screen (`policy-preview.tsx:262-273, 658`), hidden in print (`print-document.tsx:347`). An HTML preview that matches print must hide it too.
- Header and footer: built as HTML strings for Chromium, not CSS (`print-document.tsx:89-99`). They contain the logo (`:83-85`), document number, next review date, and `Page <pageNumber> / <totalPages>`. Chrome computes the page numbers. Browser equivalents need JS-computed counters, or CSS page margin boxes, which Chrome supports only in print media.
- Risk to check: a standard, non-professional cover uses `height: 297mm` (`policy-preview.tsx:145, 403`). The print area is 297 minus top and bottom margins, which is 253 mm at the default 22 mm margins. Only professional covers get a print-specific height (`print-document.tsx:343`). The standard cover may therefore spill onto a second page. The prior research note gives both "9 pages" and "10 pages" for the sample. This may be the cause, but it is not verified; check the page count of a standard-template PDF.

A DOM-based preview has to reproduce fragmentation. Chrome's screen layout at the same CSS width probably gives the same line breaks as print, because the text engine is the same. That is an inference, not measured. Where pages break (forced breaks, orphans and widows, `break-inside`, table rows) would need a JS paginator or Paged.js. The prior research note already flags this.

## 3. pdf-lib post-processing and CSS equivalents

`finalizePdf` (`print-document.tsx:294-302`) applies four steps. Each has a CSS equivalent in an HTML preview.

| pdf-lib step | Code | CSS equivalent | Fidelity |
|---|---|---|---|
| Solid background on every page, drawn behind content | `paintPageBackground` `:235-261` | Background on each page box. Chromium CSS backgrounds are clipped to the margins (comment `:226-227`), which is why pdf-lib is used. | Exact. |
| Gradient, vertical or horizontal | `:241-243` | `linear-gradient(180deg | 90deg, from, to)` | Matches. Each page gets its own gradient, because pdf-lib paints every page. |
| Gradient, diagonal | `:242-243`: axis from top-left corner to bottom-right corner | Today `themeBackgroundCss` uses `135deg` (`lib/document-themes.ts:156`). On A4 the corner-to-corner axis is about `145deg` (atan2 of 210 and 297). | Visible mismatch today. The screen preview and the PDF use different angles. Angle values are computed here, not measured. |
| Page border (rectangle stroke at `insetMm`, width `widthPt`, colour, scope) | `drawPageBorders` `:284-292`; scope `pageBorderAppliesToPage` `page-geometry.ts:17-19` | A positioned frame per page. A pdf-lib stroke is centred on its path, so the CSS box edge should sit at `inset - width/2`. Scope maps to page 1 only, pages after 1, or all. | Exact in geometry. |
| Cover overlay (PNG drawn over the full page 1, margins and furniture included) | `drawCustomCover` `:270-275`, drawn after Chromium | Full-bleed element on page 1 that covers the margins and header and footer. The PDF cover is a raster from a `794 × 1123` viewport (`:140`), roughly 96 dpi. A CSS cover will be sharper and will not match pixel for pixel. | Visually close. Bytes differ. |

The cover editor already draws a CSS page border frame (`components/builder/cover-editor.tsx:177`, `data-cover-print-frame`) and a CSS background on an A4-sized page, so part of this exists client-side.

Cover raster cache key: `getCachedCustomCoverPng` keys on `model.cover`, the whole `model.theme`, `typography`, logo position and logo (`print-document.tsx:110-117`). A change to the page border colour or any palette colour therefore re-rasterizes the cover, even though the cover does not depend on the border. This is the cover-cache point already noted in the prior research.

## 4. Design controls and what they change

Reflow means the body text moves, so pages can grow or shrink. "Paint only" means no layout change.

| Control (file:line) | Stored in | What it changes in the output | Effect |
|---|---|---|---|
| Base template gallery and apply (`theme-inspector.tsx:162-171`, `lib/document-themes.ts:152`) | `documentTemplate`, layout ids, typography defaults, `visualStyle`, logo position, SDG display | Cover scene, TOC style, page frame, section recipes, fonts, `data-collection` rules, density. Brand overrides are kept unless reset (`:152`). | Reflows all pages. Page count can change. |
| Saved theme apply (`theme-inspector.tsx:126, 152, 170`) | Same as above plus overrides | Same as above. | Reflows all pages. |
| Colour palette (`theme-inspector.tsx:260-270`, `document-themes.ts:154`) | `documentThemeOverrides.colors` | CSS variables only. The cover raster re-renders because the cover key includes the theme (`print-document.tsx:110-117`). | Paint only. Cover re-raster. |
| Colour source, logo or template (`theme-inspector.tsx:250`) | `brandColorSource` | Chooses the palette the colours come from. | Same as palette. |
| Background, solid or gradient (`theme-inspector.tsx:273, 498-511`) | `documentThemeOverrides.background` | `--doc-page-background` on the article (`policy-preview.tsx:102`) and pdf-lib paint (`print-document.tsx:235-261`). A gradient also changes cover cleanup (`lib/document-render-model.ts:225-227`). | Paint only. Cover may change. |
| Body and heading font, size, line spacing (`theme-inspector.tsx:282-288`) | `typography` | Typography variables (`policy-preview.tsx:103-109`). Metrics change line breaks. | Reflows all pages. |
| Data treatment, formal tables or clean lists (`theme-inspector.tsx:299`) | `visualStyle`, then `model.dataTreatment` (`render-model.ts:208`) | Table or list markup in responsibilities, quantitative sections (`policy-preview.tsx:328, 361`). | Reflows affected sections. |
| Document spacing, compact, balanced, spacious (`theme-inspector.tsx:300`) | `density` | `--doc-density-factor` drives padding and section margins (`policy-preview.tsx:669-671, 869`). | Reflows all pages. |
| Content alignment (`theme-inspector.tsx:301`) | `textAlignment` | `--doc-content-align` (`policy-preview.tsx:401, 1045-1047`). | Reflows text. |
| Logo alignment (`theme-inspector.tsx:308`) | `logoPosition` | Running header brand position on screen (`policy-preview.tsx:267-273, 660-664`) and Chromium header template (`print-document.tsx:94-95`). | Header only. No body reflow. |
| Logo scale 50 to 180 (`theme-inspector.tsx:309`) | `logoScale` | `runningLogoFit` (`document-themes.ts:62-70`) sets top margin through `pageHeaderMarginMm` (`print-document.tsx:50-52`). | Reflows all pages, but only when the company has a logo. |
| SDG appearance, tiles or names (`theme-inspector.tsx:310`) | `sdgDisplay` | Tiles or names in the SDG section (`policy-preview.tsx:354-357`). | Reflows the SDG section. |
| Feature image placement and crop (`theme-inspector.tsx:321-327`) | `featureImage` | Cover placement changes the cover only (`policy-preview.tsx:133-135`). Section placement adds a 250 px band in the body (`:63`, CSS `:416`). Crop changes no layout. | Cover only, or reflows the body. |
| Page border on or off, inset, width (`page-border-controls.tsx:10-16`, theme-inspector `:296`) | `pageBorder` | `pageMarginMm` changes margins on all pages (`page-geometry.ts:22`, `print-document.tsx:51-52, 100`). Stroke drawn by pdf-lib. | Reflows all pages. |
| Page border colour (`page-border-controls.tsx`, `print-document.tsx:285-286`) | `pageBorder.color` | pdf-lib stroke only. The cover re-rasters through the theme key. | Paint only. Cover re-raster. |
| Page border scope, all, cover, or all except cover (`print-document.tsx:289`) | `pageBorder.scope` | pdf-lib only (`page-geometry.ts:17-19`). | Paint only. |
| Active cover, manual or AI (`dock-sections.tsx:138-143`) | `activeCoverVariant` | Page 1 only. Changes whether a custom cover is used (`render-model.ts:223-225`). | Cover only. |
| AI cover generate and apply (`dock-sections.tsx:147-150`) | `aiCoverComposition` | Cover only. Plus AI call. | Cover only. |
| Edit active cover (`dock-sections.tsx:144`) | `coverComposition` or `aiCoverComposition` | Cover only (opens cover editor). | Cover only. |
| Show table of contents (`dock-sections.tsx:74`) | `showTableOfContents` | Adds or removes a full TOC page (`print-document.tsx:346`, `policy-preview.tsx:60`). | Adds or removes a page. Later page numbers shift. |
| Include acknowledgement (`dock-sections.tsx:75`) | `showAcknowledgement` | Adds or removes the last page (`print-document.tsx:354`). Adds a TOC entry (`policy-preview.tsx:212-214`). | Adds or removes a page. |
| Include revision history (`dock-sections.tsx:76`) | `showRevisionHistory` and section `enabled` | Adds or removes a section through `sectionHasContent` (`lib/sections.ts:85`, `render-model.ts:189-191`). | Reflows the body and can add or remove pages. |
| List markers, per list type (`dock-sections.tsx:156-162`, `lib/list-formatting.ts:25-27`) | `listFormatting` | Bullet or number markers, with numbers padded to two digits. Changes markers in sections and TOC. | Reflows lists. |

Content edits in Write mode also reflow. Write and Design both use `DebouncedPolicyPreview` (`components/builder/shell.tsx:316, 352`), so an instant preview must handle content as well.

## 5. Existing client-side HTML rendering

- Yes, the full document is already rendered in the browser. `components/templates/universal-template-catalog.tsx:98` renders `PolicyPreview` for a sample policy inside a client modal. The "Open full page" link points to `/preview/[id]`, which calls `notFound()` (`app/preview/[id]/page.tsx`). The modal is static sample content, not a live edit.
- Live cover editing already renders in the browser. `components/builder/cover-editor.tsx:177` renders `PolicyCoverPreview` on an A4-sized canvas with a CSS page border frame. It updates on every edit.
- Cover thumbnails are also client-side: `app/dashboard/page.tsx:232`, `app/manager/page.tsx:294`, `components/builder/ai-cover-library.tsx:144`.
- Write and Design previews are PDF-only (`components/builder/shell.tsx:316, 352`).
- `components/policy/policy-preview.tsx` has no `"use client"` directive, yet it is already in client bundles through the client components above.
- Test and QA harnesses already render `PolicyPreview` through Playwright `setContent` and compare pixels (`components/policy/policy-preview.test.tsx:111-131`; `.theme-qa/verify-text-colors.ts`).
- Nothing in the repo runs a paged HTML layout today.

## Open items to verify

1. Page count for a standard (non-professional) template. If the simplified cover spills, the cover height needs a print-specific fix before any HTML preview can match.
2. Whether the footer font in exported PDFs is the bundled font or a system fallback.
3. Diagonal gradient angle. The on-screen and PDF angles differ today.
4. Whether Chrome's screen and print line breaks match at the same CSS width. Needs a rendered comparison.
