# 06 Custom and AI covers without a browser

Status: ready-for-agent
Type: task
Blocked by: 02

- Rasterise `createCoverCompositionSvg` with `sharp` at 2480×3508, as `lib/docx/generate.ts:875` does. Resolve cover assets (data URLs, `/api/policycraft/cover-assets/*`, public files) the way the Word export does.
- Place the image full-bleed on page 1. Suppress the running header and footer on that page, as today's PDF does by drawing the cover over the whole page.
- Cache the PNG by `sha1(model.cover)`.
- Check that the fonts named by cover text layers are available to the SVG rasteriser. If they aren't, register them with sharp/librsvg or switch text layers to native Typst text.

Check: the harness `ai-cover` case.

Progress (ticket 02): the raster, its cache and the text layers are done in `lib/typst/policy/model.ts`. What's left is placing them in the template, plus the font check for SVG logo elements.
