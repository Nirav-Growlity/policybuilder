# 04 Section content variants

Status: resolved
Type: task
Blocked by: 03

Port every `SectionContent` branch:

- narrative paragraphs plus the sites table;
- focus list;
- qualitative groups, with bullet or numbered items;
- quantitative targets: formal table (`formal-tables`), modern list, target bands (`target-bands`, not dense), journal entries (`quiet-rules`, not dense);
- SDG tiles (100 px icons, or the atlas mosaic) and SDG names (coloured label and border);
- responsibilities as a table or as a list;
- revision table;
- custom paragraphs, bullets, numbers and tables;
- section feature image.

Tables repeat their header row across pages and keep rows together. Headings keep with the next block, and widows/orphans are set to 3.

Check: parity harness, all `*-regular` and `*-dense` cases.

## Answer

Every `SectionContent` branch is ported in `src/lib/typst/policy/policy.typ`, using numbers from Chromium's own computed styles. `scripts/policy-css-probe.ts` prints them per QA case; port from that rather than reading the cascade by hand.

- **Narrative:** paragraphs with 12 px spacing; sites table.
- **Focus:** 2.5 mm item padding, an 8 mm centred marker, 10 × 13 px text padding. Recipe tweaks: `atlas-modules` 22 px/500 markers with an 82 px minimum height; `journal-entries` 20 px heading-font markers.
- **Qualitative:** groups with 3 mm padding and 6 mm spacing; baseline-aligned marker and title (weight per recipe); lists at 19 px indent with 5 px item gaps.
- **Quantitative:**
  - Targets table: 15.76 / 32.84 / 51.4% columns, 1.5 × 2 mm cells, 13 pt bold label columns, a 5 mm target list.
  - Modern list (42 px marker column).
  - Bands (52 px marker column, 13 × 15 px section with side rules).
  - Journal (150 px area column).
- **SDG:** names (80 px colour label); tiles (100 px, 10 px gaps); mosaic with soft background and 8 px labels.
- **Responsibilities:** table, list, 2-up cards (bordered on `numbered-rail`, soft with a 115 px minimum on `modular-grid`, single column when dense), editorial accent numbers.
- **Tables:** 9.5 pt / 1.35; soft header with primary text; label columns left, the last column justified; zebra rows on `target-bands`; institutional centres and uses the heading font, editorial uses the heading font. The header repeats on each page.
- **Custom blocks:** paragraphs, bullet and numbered lists (20 px indent), tables. Section feature image.
- **Lists:** CSS outside markers ("•" or "1." plus a no-break space, right-aligned against the text), so copied text reads "1. Collect".

Layout rules learned on the way (comments in the template):
- **Margins:** CSS margins collapse; Typst block spacing does the same.
- **Inset on broken blocks:** Typst repeats a block's vertical inset on every page fragment, so padded groups use fixed spacing (`kept`) instead.
- **Auto-width blocks:** `set block(width: 100%)` must be undone inside auto-width cells.
- **Markup whitespace:** a space between a heading and its body breaks `sticky`, so sections are built in code mode.
- **Headings:** wrapped headings justify like the body but never hyphenate.
- **Not matched:** CSS `orphans`/`widows: 3`. Typst only avoids a single stray line, so an occasional page breaks one or two lines differently.

Harness (2026-10-19, 35 cases): text matches on every case, apart from Chromium's own "fi" ligature copy bug and one harness artifact (words read across side-by-side cards). Templates on the plain frame now break pages like Chromium: standard-pack 6/7, 8/9, 11/11; governance-register 5/7, 9/9, 8/11; modern-single-folio 8/9; custom-blocks 9/10; logo-right 9/9. Framed templates (numbered rail, modular grid, editorial margin) still drift (2–4 of 8–13 pages) until ticket 05 adds their section frames.

The harness now also reports "same breaks": pages whose first body text matches.
