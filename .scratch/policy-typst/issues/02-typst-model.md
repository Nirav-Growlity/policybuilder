# 02 Policy Typst model and assets

Status: resolved
Type: task
Blocked by: 01

Add `lib/typst/policy/model.ts`: `buildPolicyTypstModel(policy, authorApproval?)`.

- Start from `buildDocumentRenderModel`; keep its section order, content, recipes, list formatting and alignment.
- Add page geometry from `lib/page-geometry.ts` (`pageMarginMm`, `pageHeaderMarginMm`, `pageHeaderLogoTopMm`, `pageBorderContentInsetMm`, `pageFooterVerticalShiftMm`) and `runningLogoFit`.
- Resolve font families to TTF files under `public/fonts/word`, using the alias map in `lib/document-fonts.ts` (Arial→Arimo and so on). Unknown families fall back to the template default.
- Prepare assets with `sharp`: logo, feature image, signature, the SDG icons used, and the cover raster (ticket 06). Typst gets PNG, JPEG or SVG only, as in `lib/sop/render-service.ts`.
- Unit test: the model for each of the 8 templates is JSON-serialisable and names only fonts that exist on disk.

## Answer

`src/lib/typst/policy/model.ts` exports `preparePolicyTypstRender(policy, authorApproval?)`, which returns `{ model, assets }`. The model is plain JSON with null for empty values. Every treatment, marker and target sentence is decided there, so the template only lays things out.

- Fonts: `typstFontFamily` in `lib/typst/fonts.ts` maps Office names to their stand-ins through `DOCUMENT_FONT_ALIASES` (now exported from `lib/document-fonts.ts`). `policyFontFiles()` lists every Word TTF for the compiler. A probe confirmed that Typst resolves all 36 families by display name.
- Images: `decodeDataUrl` and `toTypstImage` moved to `lib/typst/images.ts` and are shared with SOPs.
- Custom and AI covers: `createCoverCompositionSvg` without text is rasterised to a 2480x3508 JPEG, cached by composition and logo, at full strength. Text layers stay live Typst text, with `outline` on AI titles.
- The cover never carries the running header: `header` is documented as page 2 onwards (the template enforces it in ticket 03).
- Tests: `lib/typst/policy/model.test.ts` (6 tests, all passing; added to `npm test`).

The full suite shows 24 failing tests. The same 24 fail without these changes (Chromium PDF layout, Word footer, motion source checks).
