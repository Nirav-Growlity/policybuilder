# 03 Page, running header, footer, simplified cover, contents

Status: ready-for-agent
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
