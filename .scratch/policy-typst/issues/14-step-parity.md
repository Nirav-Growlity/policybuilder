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
15. **Paragraph breaks** (replaces ticket 12's rule). As Chromium prints, a paragraph splits only with at least three lines at the foot of a page and two at the top of the next, so a five-line paragraph may split 3 + 2 and one of four lines or fewer moves whole.
    - The three-line minimum comes from an empty, unbreakable, three-line block placed before the paragraph, which is then pulled up over it. Where the block doesn't fit, both move to the next page, and a sticky heading goes with them.
    - An earlier version read the room left from `here().position()`. That's circular (the position depends on whether the paragraph moved), and Typst's layout iterations flipped between the two answers.
16. **SDG name rows.** The 1 px borders now sit inside the box, as in CSS, and the text starts 1 px further in (worst SDG page 1.34% → 0.85% of pixels).
17. **Three lines at the top of a page too** (`widows: 3`). A paragraph of six lines or more is set as its first n - 3 lines (breakable) and its last three (unbreakable); a five-line one splits 3 + 2.
    - Typst breaks lines greedily, so the first part is the longest run of words (or syllables, at a soft hyphen) that fills those lines. It's found by measuring prefixes, and its last line keeps its justification.
    - A paragraph that ends a rail or modular box carries the box's bottom padding in its last part (`closes-box`).
18. **Card grids (responsibilities on the rail and modular frames).**
    - Dense layouts keep the card styling, in one column.
    - On the modular frame, Chromium moves the whole grid to the next page when every row fits (its last cards' bottom padding may run past the page end) but the box's padding doesn't, and leaves the heading behind. It breaks between rows otherwise. The room is measured from a marker in the heading, which stays put either way.
    - A first-row card's top padding stays behind when the row moves on.
19. **Revision tables ending a modular box** move with the box's padding and leave the heading behind, as Chromium does.
20. **Target bands:** the 1 px side borders of the text cell take space, as in CSS. Text had set 2 px wider and rewrapped.
21. **Responsibility cards:** the role heading stays with its duty (`h3 { break-after: avoid }`).
22. **Harness:** page openings are compared in reading order by position, not content-stream order. Chromium writes SDG tile labels last.

## What remains (accepted)

- **Sub-pixel text positions.** Chromium snaps text baselines to whole CSS px (0.75 pt), so line positions jitter by up to ±0.4 pt against Typst's exact ones. A few elements sit about 0.5–1 pt off overall.
- **Width ties of about 0.1–0.3 pt** in narrow justified columns. One engine fits a word or hyphen fragment and the other doesn't, because of glyph-advance rounding.
- **1 px border placement.** Typst centres a stroke on the box edge where CSS draws the border inside it. The boxes are the same size; the line sits half a pixel out.
- **Chromium's text layer** drops "fi"/"ffi" ligatures ("speci c", "e iciency"). Typst's text is correct.
- **One near-tie page:** executive-brief-dense page 7. Chromium cuts the rail's bottom padding at the page end and keeps the last qualitative item. Elsewhere on the rail, the item goes with the padding (and making the rail never do this measured worse).
- **The AI cover page** has no text in Chromium's PDF (it's a screenshot), while Typst's cover title is real text. This is intended.

## Decided

The responsibilities grid behaviour, where Chromium leaves an emptied box under its heading, is now copied rather than fixed (2026-10-20: "fix all").

## Answer

**Steps (112 cases):**
- lines more than 1 pt or 1.5% off: 1297 → 209;
- lines that wrap differently: 699 → 91;
- worst page pixel difference: 3.00% → 0.85% (an SDG page; most are under 0.5%);
- warm renders after an edit: median 150 ms, worst 461 ms (141 / 376 before the widows split).

**Whole documents (36 parity cases):**
- pages opening with the same text: 309/341 → 339/341;
- no case got worse;
- page counts now match in all 36 cases.

**Text:** no words are missing or added, apart from Chromium's own dropped ligatures.

**Tests:** the Typst model and render tests pass, including the new soft-hyphen and zero-width-space ToUnicode cases. The PDF and export suites fail only on the known stale "cover stays on page one" check (both engines) and Chromium's bordered footer, as before.
