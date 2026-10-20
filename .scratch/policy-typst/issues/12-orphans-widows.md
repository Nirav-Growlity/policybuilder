# 12 Three-line orphans and widows

Status: resolved
Type: task

The print CSS sets `p { orphans:3; widows:3 }` (`lib/pdf/print-document.tsx:361`), so Chromium never leaves fewer than three lines of a paragraph at the foot of a page or carries fewer than three to the next. Typst's paragraph costs only keep single lines from being stranded, so it will split a paragraph 2 + n.

Seen in people-charter-dense (4/12 matching page openings): Typst puts "03 Scope" and two lines of its paragraph at the foot of page 3. Chromium moves the whole section (the heading is `break-after: avoid`) to page 4, and every later break shifts.

Approach to try: measure each paragraph's line count in the `css` helper (`measure` at the container width). Make paragraphs of five lines or fewer unbreakable, since no 3 + 3 split exists for them. For longer ones, keep the first and last three lines together. If Typst offers no clean way to do that, document the gap.

Check: people-charter-dense, operations-guide-dense and executive-brief-dense page openings in the harness. No case may get worse.

## Answer

- `para` in `policy.typ` (narrative and custom paragraphs, the template's `<p>`) measures its line count at the container width. With five lines or fewer it is unbreakable, which is exactly what `orphans: 3; widows: 3` amounts to for such a paragraph. Longer paragraphs keep Typst's costs, which still allow a 2-line orphan or widow where Chromium needs 3. Typst exposes no line-level break control, so that gap remains.
- List items aren't `<p>`, so Chromium prints them with the CSS default of 2. Typst's single-line costs already match that.
- An unused, shadowed duplicate of `para` (before the cover section) is gone.
- Warm renders stay at 45–136 ms across the QA samples.
- **Harness, against the previous run:** people-charter-dense 4/12 → 9/12, standard-pack-regular 8/9 → 9/9, ai-cover 7/9 → 8/9, acknowledgement-signed 8/9 → 9/9. No case got worse.
- **Still different:** operations-guide-dense (6/11) and executive-brief-dense (9/13). A sites or targets table fits at a page foot in one engine and not the other by a few pixels. That's row-height rounding, not orphans.
