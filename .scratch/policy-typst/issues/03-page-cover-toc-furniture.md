# 03 Page, running header, footer, simplified cover, contents

Status: resolved
Type: task
Blocked by: 02

`lib/typst/policy/policy.typ`, first pass:

- A4 page, margins from the model, solid or gradient `page(fill:)` (horizontal, vertical, diagonal corner-to-corner as today), and a border drawn in `page(background:)` honouring scope.
- Running header from page 2: logo or company name, left/centre/right, logo scale. It is hidden on the cover, as today.
- Footer on every page: **Document No.** · **Next Review** · **Page x / y**, in the body font at 10 px equivalent, with a rule above and the border shift applied.
- Simplified cover: brand, policy label as the title, optional cover feature image (opacity and fade).
- Contents: the professional list, plus the `rail-index` left rule and the `tile-index` 2-column tiles, with bullet or numbered markers. Entries link to sections.
- Acknowledgement starts on a new page; contents ends with a page break.

Check: parity harness, all `*-concise` cases.

## Answer

`src/lib/typst/policy/policy.typ` and `render.ts` (`renderPolicyTypstPdf`). Harness, 2026-10-19: all 32 cases compile, in 40–320 ms against Chromium's 1.8–6.7 s.

- **Page:** A4, margins from the model, solid or gradient fill (diagonal drawn corner to corner, as Chromium's PDF does), border by scope.
- **Running header:** page 2 onwards only, never on the cover. Logo box, or the company name in 6 pt Arimo in ink colour (Chromium ignores the muted colour there). Positions match within 0.1 mm.
- **Footer:** Arimo 7.5 pt. Chromium's footer template can't load web fonts, so today's footer is Arial. Rule at 281.8 mm minus the border shift, baseline 6.86 mm below it. Matches within 0.1 mm, with identical widths. No footer on an image cover.
- **Simplified cover:** 48 px inset, brand row of at least 34 px, logo at most 38% wide and 64 px tall, title at heading size × 2.65 with CSS `text-wrap: balance` emulated. The feature figure is baked by sharp (52 mm, 22% opacity, saturation 0.72, paper fade). Composition/AI cover: full-page raster plus live text layers.
- **Contents:** professional list, `rail-index` rule along the whole block, `tile-index` 2-column tiles (CSS border added to the inset), institutional centred title. Entries link to sections.
- **Text metrics:** CSS line boxes from the fonts' typo metrics (`fonts` in the model). Body line pitch equals Chromium's average; Chromium snaps baselines to whole pixels.
- **Text layer:** soft hyphens are stripped and Typst hyphenates justified text itself. `mapHyphenGlyphs` remaps the hyphen glyph's ToUnicode entry from U+00AD to "-", so "2022-23" copies correctly in pdf.js.
- **Word diff:** 0 on 15 cases. The rest are ticket 04/05 content (rail markers, SDG mosaic labels), plus Chromium's own "fi" ligature copy bug ("signi cant"), which Typst doesn't have.
- **Body:** a first pass only (headings, paragraphs, basic lists and tables); tickets 04 and 05 refine it.

Known gaps:
- Bold above 600 (cover title, brand line, section markers) draws at 600, because the Word TTFs pin bold at 600, so those lines are about 3% narrower. See ticket 11.
- The cover title baseline sits 0.4 mm lower than Chromium's (66.9 vs 67.3 mm on Quiet Aptos Policy).

Tests: `lib/typst/policy/render.test.ts` (text layer, running header, page numbers, hyphen patch).
