# 06 Custom and AI covers without a browser

Status: resolved
Type: task
Blocked by: 02

- Rasterise `createCoverCompositionSvg` with `sharp` at 2480×3508, as `lib/docx/generate.ts:875` does. Resolve cover assets (data URLs, `/api/policycraft/cover-assets/*`, public files) the way the Word export does.
- Place the image full-bleed on page 1. Suppress the running header and footer on that page, as today's PDF does by drawing the cover over the whole page.
- Cache the PNG by `sha1(model.cover)`.
- Check that the fonts named by cover text layers are available to the SVG rasteriser. If they aren't, register them with sharp/librsvg or switch text layers to native Typst text.

Check: the harness `ai-cover` case.

Progress (ticket 02): the raster, its cache and the text layers are done in `lib/typst/policy/model.ts`. What's left is placing them in the template, plus the font check for SVG logo elements.

## Answer

The cover raster and text layers come from `lib/typst/policy/model.ts` (ticket 02). `composition-cover` in `policy.typ` places the raster full-bleed on page 1, with no running header or footer there.

- **Text layers:** set as Typst text in the document fonts (`typstFontFamily`), so they never depend on the SVG rasteriser's fonts and stay selectable. Only SVG logo elements inside the raster go through sharp/librsvg, exactly as the Word export does.
- **AI text shadow:** Chromium's blurred `text-shadow` becomes the Word export's 0.35 mm dark outline painted behind the glyphs. Typst strokes on top of the fill, so `render.ts` runs a first pass of the template (`outlinePass`) that draws only the outlines. It exports that pass with `plainSvg` (glyphs become paths, cached per cover) and places it under the text. The PDF holds the title once, so copying it gives it once.
- **Typst quirks found:**
  - typst.ts `svg()` is the browser flavour (CSS variables, foreignObject), which Typst's own SVG import misreads; `plainSvg()` imports cleanly.
  - A placed SVG given only a width lands off by the page margin; give both width and height.

Harness (2026-10-20): `ai-cover` has 9/9 pages, 7/9 matching breaks, no missing or extra words. The cover is at full strength by agreement (Chromium captures it mid-fade). Tests: `render.test.ts` checks that the title is copied once.
