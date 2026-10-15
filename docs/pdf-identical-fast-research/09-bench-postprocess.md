# 09 - Post-process benchmark: Chromium-free regeneration for paint-only Design changes

Scope: benchmark only. Nothing under `D:\Policy PoC` was modified. All scripts, results (`t*-results.json`), logs and PNGs live in `identical-fast/bench-b/`.
Method: a replicated Chromium stage and finalize (verbatim logic from `src/lib/pdf/print-document.tsx`, because `finalizePdf` and friends are not exported), run against the real `generatePreviewPdf` as the reference.
Identity criteria, all zero tolerance:
- per-page pdf.js `argsArray` (numbers at 3 dp), `fnArray`, text string, font name, transform, width, and page size; `g_dN_` document counters normalised;
- per-page pixel compare: pdf.js 5.7.284 rendering through `@napi-rs/canvas` at scale 1.5 (`src/node_modules`), `differingPixels == 0`.

Sample: `makeSamplePolicy()` normalised, 9 pages. Cover case: 794x1123 photo-like PNG (1.26 MB) as a custom composition with title and company text. Logo case: 300x100 PNG.

## 1. What feeds each stage

### (a) Chromium input: `renderToStaticMarkup(PolicyPreview)` (print-document.tsx:65), `createPrintDocument` (:76, :335-373), `page.pdf` options (:97-100)

| Field | Where it is used | Chromium-affecting? |
|---|---|---|
| `pageBorder.enabled`, `widthPt`, `insetMm` | margins `pageMarginMm` (page-geometry.ts:22-24), header/footer geometry (print-document.tsx:50-52, :86-91) | **Yes** (reflow). Negative control: inset 14 changes Chromium output, 1,117,671 px differ |
| `pageBorder.color` | only `drawPageBorders` (print-document.tsx:285-286). The DOCX path also reads it (docx/generate.ts:142) | **No** |
| `pageBorder.scope` | only `pageBorderAppliesToPage` in finalize (print-document.tsx:289, page-geometry.ts:17-19) | **No** |
| `background` (solid/gradient) | CSS var `--doc-page-background` (document-themes.ts:154, policy-preview.tsx:102). Neutralised by `.policy-preview-document { background:transparent !important }` (print-document.tsx:339). Also `background.kind` drives the cover cleanup `removeLegacyThemeGradient` (document-render-model.ts:226-227) | **No**, verified: raw Chromium raster identical with solid to gradient plus border change (0 px). Latent dependency: `background.kind` changes the in-flow cover fallback only when the cover raster is absent and a legacy gradient asset exists |
| `colors.*` palette | body CSS vars (document-themes.ts:154), header and footer colours `muted`, `ink`, `line` (print-document.tsx:89, :93), `primary` in finalize border fallback (print-document.tsx:103) | **Yes**. Palette changes need Chromium. The "paint-only" label in `01-codebase.md` section 4 is misleading for palette |
| `typography`, `density`, `textAlignment`, `logoScale`, `logoPosition`, template layout, sections, TOC, acknowledgement | reflow, header, footer | **Yes** |
| `company.companyLogo` | running header logo (print-document.tsx:83-85), `topMargin` (:52) | **Yes** |
| cover PNG (`customCoverPng`) | `<img>` in the HTML (print-document.tsx:64, policy-preview.tsx:125-126). The PNG bytes land in the Chromium PDF | **Yes** (bytes). Visually hidden by the page-1 overlay |

### (b) Finalize inputs: `finalizePdf(output, theme.background, companyLogo ? topMargin : 0, customCoverData, theme.pageBorder, theme.colors.primary)` (print-document.tsx:103, :294-302)
`background` (whole object), `pageBorder` (enabled, inset, width, colour, scope), `coverHeaderMm` (from `topMargin`), cover PNG, `colors.primary` (border colour fallback).

### (c) Cover raster: key and real dependencies
- Current key (print-document.tsx:110-117): `model.cover`, whole `model.theme`, `model.typography`, `policy.logoPosition`, `policy.company.companyLogo`.
- Real dependencies (`PolicyCoverPreview`, with `model.cover` as the source): `model.cover` already contains the projected composition. Title colour is `theme.colors.primary` (document-render-model.ts projectCoverComposition, :75), brand colour is `theme.colors.muted` only when there is no company text element (:113), fonts come from `typography` (:51, generated text layers only), and `background.kind` enters through the cleanup at :226-227, which is folded into `model.cover.composition`. The `--doc-*` CSS variables do not reach the custom cover, apart from `--doc-paper`, which is overridden inline (policy-preview.tsx:159, :418).
- Narrow key candidate: `sha1(JSON.stringify(model.cover))`.

## 2. Identity results (zero tolerance)

Baseline first: production `generatePreviewPdf(A)` run twice gives equal signatures and 0 px difference. Bytes differ only in metadata and timestamps. Replicated stage plus finalize versus production: equal signature and 0 px. Determinism and replica validation both hold (t1).

| Case (cover / logo) | Variant vs base (paint-only) | Signature | Pixels (fast vs full) |
|---|---|---|---|
| no cover | B1 border colour, B2 scope all, B3 scope cover, B4 solid bg colour, B5 solid to gradient, B6 gradient diagonal, B7 all at once | all equal | 0 for all seven |
| cover | B1, B2, B4, B5, B7 | all equal | 0 for all five |
| cover + logo | B1, B2, B4, B5, B7 | all equal | 0 for all five |
| raw Chromium, bg and border changed | page.pdf output only | signature equal | 0 px |
| negative control: inset 14 (Chromium-affecting) | - | differs | 1,117,671 px |

Cover swap (1x1 transparent placeholder in the HTML, new cover composited by finalize, t2/t4):
- raw Chromium signatures for cover C and cover D are equal, and the raw PDF holds only the 1x1 placeholder images (20 bytes) instead of the cover;
- finalized output versus full pipeline for D: **0 px**; signature differs on page 1 only (the `Do` image operator is absent).

Production run with a cover: pages 2 onwards are signature-equal and 0 px against the replica. Page 1 differs, because of the cover fade described in section 4.

## 3. Cover raster dependency matrix (settled capture, t2)

Settled = reduced-motion emulation, so the entrance fade is skipped. Settled captures are deterministic (bytes and pixels identical across repeats).

| Change vs base cover | PNG | Narrow key | Current key |
|---|---|---|---|
| border colour | identical | equal | differs (re-raster) |
| border scope | identical | equal | differs |
| border width / inset | identical | equal | differs |
| solid background colour | identical | equal | differs |
| solid to gradient | identical | equal | differs |
| palette paper / ink / accent / soft / line | identical | equal | differs |
| density spacious, logoScale 140 | identical | equal | differs |
| policy.logoPosition right | identical | equal | differs |
| typography fontFamily (cover has explicit fonts) | identical | equal | differs |
| palette primary | 6,691 px differ | differs | differs |
| company logo added | 25,447 px differ | differs | differs |
| no company element, palette muted | 1,731 px differ | differs | differs |

Narrow key `sha1(JSON(model.cover))` agrees with the actual PNG in 15 of 15 cases in both directions. The current key never matches, so it re-rasters on every theme change. Limitation: only custom compositions were tested. Template covers with the legacy-gradient cleanup were not, although the cleaned composition sits inside `model.cover`.

Chromium cache key (proposal, tested): `sha1(policy with documentThemeOverrides and templateBrandOverrides minus {background, pageBorder.color, pageBorder.scope}, coverPngHash or placeholder, background.kind only when the cover raster is absent)`. Equal for B1 to B7, different for inset 14.

## 4. Production cover fade (new finding, verify in production)

`renderCustomCoverPng` (print-document.tsx:129-159) screenshots the cover while `previewEntranceStyles` (policy-preview.tsx:21-28) still runs its 220 ms opacity fade in screen media. Measured:
- element opacity at screenshot time: **0.22 to 0.41** over four runs; settled = 1.0;
- settled versus production cover corner pixel: (78,114,140) against (118,145,166) for the faded capture;
- production PDF page 1 mean brightness **181.4**, settled replica **147.0** (about 23% lighter); visually confirmed (`p1-production-cover.png`, `p1-settled-cover.png`).

Consequence: the cover PNG depends on timing and on machine speed, and the cover cache can store a faded PNG. Suggested fix (not applied, the repo is read-only for this task): add `[data-preview-entrance] { animation: none !important; opacity: 1 !important; }` to the style block in `renderCustomCoverPng` (print-document.tsx:142-147), or emulate reduced motion before the screenshot.

## 5. Timings (t3, warm browser, median of 7 unless noted, machine noise about +-30%)

| Stage | ms |
|---|---|
| finalize, solid + border, no cover | 108 (75 to 147) |
| finalize, gradient + border, no cover | 109 |
| finalize, cover + border | 408 (328 to 566) |
| finalize, cover, no border | 345 |
| pdf-lib load | 16 |
| load + save | 68 |
| load + save, `updateMetadata:false` | 58 (-60 bytes) |
| save `useObjectStreams:false` | 94 (+0.26% size). Keep the default |
| save `updateFieldAppearances:false` | 66 (no forms, no effect) |
| embedPng, 1.26 MB cover | 89 |
| Chromium stage, no cover (warm, new context) | 939 to 1268 (of which page.pdf 761) |
| Chromium stage, cover | 1213 to 1460 |
| cover raster (warm, settled) | 842 to 854 |
| production `generatePreviewPdf`, cold, no cover | 1600 (1578 to 1790) |
| production, cover, cache hit | 2337 (2222 to 2348); first uncached run 3781 |

Embedding: the cover is embedded twice. The raw Chromium PDF holds one image XObject (2.16 MB stream). The finalized PDF holds two (4.21 MB stream). File size 2.35 MB raw becomes 4.39 MB final, against 205 KB and 197 KB with no cover. With the placeholder HTML the final output holds two tiny images plus one cover image (about 2.2 MB total).

## 6. Design controls that could go Chromium-free

| Control | Chromium-free? | Cost on the fast path |
|---|---|---|
| Page background solid or gradient (type, colours, direction) | **Yes** (proved, with and without cover) | finalize only, about 0.11 s (no cover), about 0.41 s (cover) |
| Page border colour | **Yes** (proved) | same |
| Page border scope | **Yes** (proved) | same |
| Active cover (manual / AI) and cover edits | Partly: the cover raster still needs a Chromium context (about 0.85 s warm). The body is Chromium-free only if the HTML uses a placeholder for the cover slot (production change at print-document.tsx:64 and policy-preview.tsx:125) | about 1.3 s total (raster plus finalize), against 3.8 s cold today |
| Cover-only theme fields (logoPosition, density, logoScale, typography where the cover has explicit fonts) | Cover raster reused under the narrow key. Body still needs Chromium for density or logoScale | - |
| Palette colours | **No**: header and footer colours and body text use them | - |
| Border width or inset, logo scale or position, typography, density, alignment, template, sections, TOC, acknowledgement | **No** (reflow or header) | - |

Recommended order: (1) cache the Chromium PDF under the Chromium key above and skip Chromium for background and border changes; (2) narrow the cover key to `model.cover` and fix the fade; (3) optionally a placeholder cover slot to remove the double embed and allow cover swaps without the body render.

## 7. Limits
- One sample policy and one cover composition. Template-based covers, AI covers, professional templates and `.theme-qa/templates` were not run. The acceptance run in the existing research doc still applies.
- Rendering used pdf.js with `@napi-rs/canvas`, not Chrome or Acrobat.
- The replicated stage uses a warm browser. Production launches cold, so production timings above are the cold figures.
