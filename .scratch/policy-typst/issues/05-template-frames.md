# 05 Per-template frames and variant styling

Status: resolved
Type: task
Blocked by: 04

- Section frames: `single-folio`, `numbered-rail` / `editorial-margin` (an 18 mm marker column with a 7 mm gap; the editorial marker uses the accent colour and heading font), and `modular-grid` (soft fill, line border, 5 mm inset).
- Per-variant tweaks from the professional CSS: corporate, editorial (italic headings, rule-only table head), governance, minimal, sustainability, institutional (centred headings, double-rule table head).
- Density factor (compact .82, spacious 1.18) applied to section spacing.

Check: parity harness, every template, side by side. Target: page-break agreement ("same breaks") close to the single-folio templates (8/9 or better on regular).

Measured by `scripts/policy-css-probe.ts` (ticket 04):
- `modular-grid` (operations-guide, sustainability-charter, metrics-ledger): the section is a box with 5 mm (18.9 px) padding, a 1 px line border and a soft fill. Its last child's bottom margin (for example a paragraph's 12 px) stays inside the padding.
- `editorial-margin` (people-charter): the section is a grid of 18 mm and the rest, with a 7 mm gap. The aside has 4 px top padding and the marker in 24 px heading font, accent colour, line-height 1. The heading marker span is hidden.
- `numbered-rail` (executive-brief, controlled-manual): the same 18 mm and 7 mm grid. Show the marker in primary colour on the paper, not primary on a primary rail (agreed fix). The heading marker span is hidden.
- The section body text starts at the column edge (38 px padding inside the numbered rail on Chromium: check with the probe).

## Answer

`render-section` in `src/lib/typst/policy/policy.typ` lays out the three frames from Chromium's computed styles:

- **`numbered-rail`:**
  - An 18 mm primary rail with a 7 mm gap and 28 × 22 px padding, at least 190 px tall.
  - The section number is 24 px, weight 500, now in the on-primary colour (the agreed fix; it used to be primary on primary).
  - The body has 30/50/36/38 px padding. Sections are 9 mm apart (no 45 px gap).
- **`editorial-margin`:** an 18 mm + 7 mm grid; the accent number is 24 px heading font, line-height 1, with 4 px top padding.
- **`modular-grid`:** a soft box with 5 mm padding inside a 1 px line border; sections 9 mm apart.
- **Plain sections:** max(9 mm, 45 px × density) apart.
- **Variant tweaks:** none of the per-variant heading or opener rules survive the professional `!important` overrides. The table differences (institutional, editorial) were already handled in ticket 04.

Fragmentation rules matched to Chromium:
- **Bottom padding:** carried whole to the next page (`pad-end`), except before the acknowledgement's forced break.
- **Margins in grids:** a grid item or padded box keeps its last child's margin.
- **Grid gaps:** spacing between items only.
- **Unbreakable pieces:** table rows (`break-inside: avoid`) and responsibility cards don't split; a card that doesn't fit leaves its top padding behind.
- **Global paragraph spacing:** 0. Paragraphs set their own 12 px.
- **CSS borders:** added to insets wherever Chromium's box grows by them.
- **No hanging punctuation.**

Harness, 2026-10-19 (35 cases): page counts are within ±1 on every case. Pages starting with the same text:
- **Every page:** 16 cases (standard-pack concise and dense; Controlled Approval Sheet regular; Table Register regular and dense; Framework Map regular and dense; Compact Operating Standard concise and regular; IMS Operating Tabs regular and dense; modern-single-folio; modern-journal; logo-right; toc-off; page-border).
- **One page off:** most of the rest, for example 8/9, 9/10, 6/7.

Known residuals:
1. **Heritage Crest (people-charter; also feature-image-cover and acknowledgement-filled), 4 of 10–12 pages.** Its Source Serif 4 web font is variable, and Chromium sets the optical-size axis to the text size (about 14.7), which sets body text wider. The Word TTF Typst uses is pinned at the default optical size, 20, so paragraphs wrap one line shorter. Fixed by ticket 11 (static optical-size faces).
2. **LayoutNG keeps a box's bottom padding with its last unbreakable piece** (the last table row, a short last list item under `orphans`/`widows: 3`) and moves both to the next page. It also moves a whole nested card grid rather than splitting it. Typst can't express either: `sticky` only chains between siblings, and on a breakable block it moves the whole block. This is what's left in Compact Operating Standard dense (6/11), Controlled Approval Sheet dense (9/13, one page short), Image Led Charter concise and dense, and the three custom-* cases (one page short).
