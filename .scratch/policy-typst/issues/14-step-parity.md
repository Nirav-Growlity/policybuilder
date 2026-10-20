# 14 Build the PDF up step by step and fix every discrepancy

Status: resolved
Type: task

Asked 2026-10-20: "make the whole pdf step by step from both previous pdf engine and now typst and check all the discrepancies we have and fix those".

## Harness

`npx tsx scripts/policy-typst-parity.ts all --steps` runs `stepCases()` (`scripts/policy-qa-cases.ts`) into `.scratch/policy-typst/parity-steps/`. Every template (8) is built up one element at a time, 14 steps each, 112 cases:

- `s00` cover and the required preface;
- `s01` the contents page;
- `s02`–`s11` each standard section on its own after the preface: declaration, scope (with the sites table), focus, qualitative, quantitative, SDG, responsibilities, monitoring, review, revision;
- `s12` custom blocks (paragraph, bullets, numbers, table);
- `s13` the acknowledgement.

With one element per case, a discrepancy shows up where it starts, before it can shift every later page. On top of the usual reports, `--steps` adds:

- **line geometry:** every text line is matched by its text across engines, and position, width and font size are compared. Lines more than 1 pt or 1.5% off are listed, plus lines that wrap differently;
- **pixels:** the share of pixels that differ with a 2 px tolerance, and a third red "diff" panel on each page image.

Chromium's disc markers (painted shapes) and its running header on the cover (left off on purpose) are excluded on both sides.

`scripts/policy-css-probe.ts` now also takes step case names and reports each box's position (`at=`).

## Found and fixed (in `lib/typst/policy/policy.typ` unless noted)

1. **List markers.** Chromium paints a disc as a dot, sized and placed from the font's ascent in whole px (Blink's ListMarker): diameter floor((floor(2a/3)+1)/2), left edge floor(2a/3)+7 px before the text. Typst printed a small "•" glyph tight against the text. Now `disc-marker` draws the same dot, which also keeps it out of the text layer, as in Chromium.
2. **Collapsed table borders.** CSS borders take space (1 px per row, half a px from each cell side); Typst strokes take none. Rows drifted up about 0.75 pt each, and cells were 1.85 px too wide, so targets rewrapped ("prod-" fitted). Cells now give half a px to every surrounding border, and the table is inset half a px.
3. **Targets table index header** ("Sr No.") is centred, as `[data-target-table] th:first-child` is.
4. **Section heading border** (1 px) now takes space. Everything after a heading had sat 0.75 pt high.
5. **Heading marker letter-spacing.** CSS letter-spacing also follows the last letter, so the gap to the title includes it (the title sat 1.9 pt left).
6. **Rail-index contents** sat 2.3 pt left. The 3 px left border now sits inside the box, as in CSS.
7. **SDG tiles** are top-aligned in a grid, as with flex-wrap. As inline boxes, a two-line label pushed its row-mates down.
8. **Last section padding.** The bottom padding of the last section (rail, modular box) was dropped at the end of the document; it now stays. It's only weak before the acknowledgement's page break.
9. **Doubled list margins.** A list's closing margin and its last item's margin were both applied in target bands and qualitative groups (+5.7 px per band or group).
10. **Box ends.** Chromium never leaves a box's bottom padding alone on a page, and won't break between a box's top padding and its first child:
    - a band now opens with its first target (people-charter band 04 moved to the next page, as in Chromium);
    - a group's last item stays with the group's bottom padding.
11. **Hyphenation.** Typst's own patterns picked other break points than Chromium ("spe-cialty" vs "special-ty"). The model now keeps typesetProse's soft hyphens and Typst's hyphenation is off, so words break exactly where Chromium can. `mapHyphenGlyphs` (render.ts) strips the U+00AD that an unbroken soft hyphen adds to the previous glyph's ToUnicode entry; that used to make letters drop out of the copied text.
12. **Hyphens between digits.** Chromium breaks after the hyphen in "2030-31"; Typst (UAX #14) doesn't. The model adds a zero-width space after such hyphens (model.ts `breakableNumberHyphens`), and render.ts keeps it out of the text layer.
13. **Cover title width.** `.policy-cover h1 { max-width: 100% }` overrides the simplified cover's 76%, so operations-guide's "Environmental Policy" now fits on one line, as in Chromium.
14. **Boxed sections (modular box, rail).**
    - Qualitative groups (except journal entries) carry the box's bottom padding in their last group's closing block, so the last item, the group's padding and the box's padding move together.
    - A sites table that ends a modular box sticks to its padding.
    - Result: executive-brief-dense, operations-guide-dense and sustainability-charter-concise now break like Chromium.

## What remains (accepted)

- **Sub-pixel text positions.** Chromium snaps text baselines to whole CSS px (0.75 pt), so line positions jitter by up to ±0.4 pt against Typst's exact ones. A few elements sit about 0.5–1 pt off overall.
- **Width ties of about 0.1–0.3 pt** in narrow justified columns. One engine fits a word or hyphen fragment and the other doesn't, because of glyph-advance rounding.
- **1 px border placement.** Typst centres a stroke on the box edge where CSS draws the border inside it. The boxes are the same size; the line sits half a pixel out.
- **Chromium's text layer** drops "fi"/"ffi" ligatures ("speci c", "e iciency"). Typst's text is correct.
- **Paragraph split 3 + 1.** Chromium sometimes splits a four-line paragraph 3 + 1 (governance, metrics and people concise cases). Typst keeps paragraphs of five lines or fewer whole (ticket 12). A room-aware rule using `here().position()` measured worse, so it was dropped.

## Needs a decision

**The responsibilities grid in the sustainability-charter template** (custom-solid, custom-gradient, feature-image-cover, sustainability-charter-dense and -concise). When the two-up grid doesn't fit whole, Chromium moves all of it to the next page and leaves the section box on the first page empty below its heading. Typst flows the cards across the break. This is the last cause of a page-count difference (Typst is one page shorter). Copying it would print a nearly empty box, so it's left like the three baseline quirks fixed on purpose, pending a decision.

## Answer

**Steps (112 cases):**
- lines more than 1 pt or 1.5% off: 1297 → 210;
- lines that wrap differently: 699 → 96;
- worst page pixel difference: 3.00% → 1.34% (an SDG page; most are under 0.5%).

**Whole documents (36 parity cases):**
- pages opening with the same text: 309/341 → 320/341;
- no case got worse;
- page counts now match everywhere except four sustainability-charter cases (custom-solid, custom-gradient, feature-image-cover, sustainability-charter-dense), from the grid quirk above.

**Text:** no words are missing or added, apart from Chromium's own dropped ligatures.

**Tests:** the Typst model and render tests pass, including the new soft-hyphen and zero-width-space ToUnicode cases. The PDF and export suites fail only on the known stale "cover stays on page one" check (both engines) and Chromium's bordered footer, as before.
