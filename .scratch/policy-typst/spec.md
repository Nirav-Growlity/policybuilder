# Policy PDF on Typst

Status: ready-for-human
Started: 2026-10-19

## Goal

Move the policy PDF (live preview **and** download) from Chromium printing HTML to the Typst engine the SOP manuals already use. The aim is SOP speed, with every template looking the same as it does today.

## Why

Measured on this workstation (2026-10-19), with the 9-page `makeSamplePolicy()` and no cache hits:

| Engine | Pages | Render |
|---|---|---|
| Policy, Chromium (`lib/pdf/print-document.tsx`) | 9 | 1.64–1.89 s, plus about 0.85 s when a custom/AI cover is captured by a second Chromium |
| SOP, Typst (`lib/typst/engine.ts`) | 58 | 0.26 s warm (0.46 s first) |

Chromium is slow here for three reasons. It starts a new persistent browser for every render. The custom cover is screenshotted in a second browser. Renders are queued one at a time. On Vercel, the `@sparticuz/chromium` cold start adds to that.

## What stays the same

- **The viewer.** `PdfPages` in `components/policy/pdf-policy-preview.tsx` (pdf.js) already serves both previews. Its toolbar, zoom, paging, thumbnails and "matches the download" status stay as they are.
- **The DOCX export.** `lib/docx/generate.ts` doesn't depend on the PDF engine and is unaffected.
- **The HTML `PolicyPreview` / `PolicyCoverPreview` components.** They still drive the cover thumbnails (dashboard, admin policies, AI cover library), the cover editor canvas and the read-only builder view. They stop being the PDF source.
- **The render model.** `buildDocumentRenderModel` in `lib/document-render-model.ts` already resolves the theme, typography, sections, covers, acknowledgement and footer. The Typst model is a JSON projection of it, so both renderers read the same decisions.

## Design surface to port

All 8 templates in `DOCUMENT_THEMES` are `collection: "professional"`. The professional CSS overrides most of the older rules, so the rendered design is smaller than `policy-preview.tsx` suggests. The 30-odd cover-scene rules (`cover-civic-plain` … `cover-docket-matrix`) are never rendered: `PolicyCover` only produces the simplified cover or a custom/AI composition.

What the PDF actually shows, per page area:

| Area | Variations that exist | Source today |
|---|---|---|
| Page | A4, margins from `lib/page-geometry.ts`; solid or gradient background; optional border (width, inset, colour, scope) | `@page` CSS + pdf-lib `finalizePdf` |
| Running header | logo or company name; left/centre/right; logo scale 50–180% | Playwright `headerTemplate` |
| Footer | Document No. · Next Review · Page x / y, in body font, rule above | Playwright `footerTemplate` |
| Cover | simplified (brand + title, optional cover feature image); custom or AI composition (full-bleed) | `PolicyCover`; composition screenshotted by Chromium |
| Contents | professional list; `rail-index` adds a left rule; `tile-index` is a 2-column tile grid; bullet or numbered markers | `PolicyToc` |
| Section frame | `single-folio`, `numbered-rail` / `editorial-margin` (18 mm marker column), `modular-grid` (soft boxed section) | `PolicySection` + professional CSS |
| Section heading | marker + title, primary rule below; per-variant tweaks (italic editorial, centred institutional) | `SectionHeading` |
| Content | narrative + sites table; focus list; qualitative groups; quantitative as table / modern / target bands / journal; SDG tiles or names; responsibilities as table or list; revision table; custom paragraphs, lists, tables; section feature image | `SectionContent` |
| Acknowledgement | statement, 2-column fields, filled values, author signature image | `Acknowledgement` |
| Typography | template fonts or picked fonts (Office names aliased: Arial→Arimo, Calibri→Carlito, Times New Roman→Tinos, Bell MT→Cormorant Garamond, Book Antiqua→Libre Caslon Text…); sizes; line spacing; justify/left/centre/right; density factor; soft hyphens from `typesetProse` | CSS vars |

## Approach

1. **Model.** `lib/typst/policy/model.ts` turns a `DocumentRenderModel` (plus page geometry and resolved font files) into JSON. Images (logo, feature image, SDG icons, signature, cover) become workspace files through the same `sharp` path SOPs use (`toTypstImage`).
2. **Template.** `lib/typst/policy/policy.typ` reads `/model.json`. It is organised like `manual.typ`: tokens, page setup, header and footer in `page(header:, footer:)`, then one function per area in the table above. Gradient backgrounds and borders become `page(fill:, background:)`, so pdf-lib post-processing goes away.
3. **Custom/AI covers.** Rasterise `createCoverCompositionSvg` with `sharp`, as the Word export already does (`lib/docx/generate.ts:875`), and place the image full-bleed on page 1. No browser is needed, and the PDF cover then matches the Word cover.
4. **Engine.** `lib/typst/engine.ts` gets a second warm compiler and template for policies, with the font list widened to every family a policy can pick. `generatePdf` switches on `POLICY_PDF_ENGINE=typst|chromium`, so either engine can be chosen per environment until sign-off.
5. **Client.** The preview debounce drops from 800 ms to the SOP's 500 ms once renders take about 0.3 s.

## Visual check (the gate)

`scripts/policy-typst-parity.ts` renders every case with both engines and writes side-by-side page PNGs (Chromium left, Typst right). It also writes a word-level text diff, page counts and timings, plus a contact sheet at `.scratch/policy-typst/parity/index.html`.

Cases: the 8 templates × concise / regular / dense samples (the `scripts/generate-theme-qa.ts` set), plus custom solid colours, a custom gradient, a cover feature image, a company logo on the right, an AI cover, TOC off, and an acknowledgement with filled fields.

A template is **done** when:
- every word in the Chromium PDF appears in the Typst PDF (text diff shows nothing missing or added);
- the page count is within ±1 of Chromium's;
- you have looked at its side-by-side pages and signed it off in `issues/10-signoff.md`.

Pixel-identical is not the bar, because a different layout engine can't produce identical line breaks. "Same design, same content, same structure" is.

## Baseline findings (first harness run, 2026-10-19)

All 32 cases rendered on Chromium in **1.4–4.4 s** each (5–11 pages). Three things in today's PDF the port has to reproduce or consciously change:

- **AI covers print washed out.** The Chromium screenshot catches the cover mid-fade-in (the bug noted in `docs/pdf-identical-fast-research.md`). See `parity/ai-cover/page-01.png`. The Typst path rasterises the SVG directly, so it would print the cover at full strength.
- **Numbered-rail templates show a blank dark bar.** On `controlled-manual` (and `executive-brief`, the other `numbered-rail` frame), the section marker is primary-coloured on the primary-coloured rail, so no number is visible. See `parity/controlled-manual-regular/page-04.png`.
- **When there's no logo, the running header (company name, 8 px Arial) is also printed on the cover**, above the cover's own brand line. With a logo, pdf-lib paints it out.

## Decisions (2026-10-19)

- **Contents stays without page numbers**, as today.
- **A page count within ±1 of Chromium's is acceptable.**
- **Fix all three baseline quirks in the port**, on purpose:
  - the AI/custom cover prints at full strength (no mid-fade capture);
  - section numbers are visible on the `numbered-rail` frame (no primary-on-primary marker);
  - the running header is never printed on the cover, with or without a logo.
- The AI cover title shadow follows the Word/SVG look (a thin dark stroke).

Expected differences in the harness for these three are intended, not regressions.

## Decisions needed (resolved above)

1. **Contents page numbers.** Today's professional contents list has no page numbers, because Chromium can't know them. Typst can print real ones at no cost. Keep the list as it is, or add page numbers?
2. **Line and page breaks** will shift a little (Typst's justification and hyphenation differ from Chrome's). Is a ±1 page count acceptable?
3. **AI cover title shadow.** The SVG/Word path draws it as a thin dark stroke, while today's PDF uses a CSS text-shadow. Taking the Word look makes PDF and Word agree.
4. **The three baseline findings above.** Copy today's look exactly (washed-out AI cover, blank rail, header on the cover), or fix them in the port? Fixing them means those pages will differ from today on purpose.
5. **Rollout.** Ship behind `POLICY_PDF_ENGINE`, defaulting to `typst` locally first, then production after sign-off. Delete the Chromium path and the `@sparticuz/chromium` dependency in a follow-up.

## Tickets

See `issues/`. 01 is done in this pass, and 02–10 follow in order.
