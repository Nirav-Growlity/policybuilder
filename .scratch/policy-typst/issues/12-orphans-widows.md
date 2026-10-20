# 12 Three-line orphans and widows

Status: ready-for-agent
Type: task

The print CSS sets `p { orphans:3; widows:3 }` (`lib/pdf/print-document.tsx:361`), so Chromium never leaves fewer than three lines of a paragraph at the foot of a page or carries fewer than three to the next. Typst's paragraph costs only keep single lines from being stranded, so it will split a paragraph 2 + n.

Seen in people-charter-dense (4/12 matching page openings): Typst puts "03 Scope" and two lines of its paragraph at the foot of page 3. Chromium moves the whole section (the heading is `break-after: avoid`) to page 4, and every later break shifts.

Approach to try: measure each paragraph's line count in the `css` helper (`measure` at the container width). Make paragraphs of five lines or fewer unbreakable, since no 3 + 3 split exists for them. For longer ones, keep the first and last three lines together. If Typst offers no clean way to do that, document the gap.

Check: people-charter-dense, operations-guide-dense and executive-brief-dense page openings in the harness. No case may get worse.
