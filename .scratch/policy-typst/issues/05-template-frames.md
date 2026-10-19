# 05 Per-template frames and variant styling

Status: ready-for-agent
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
