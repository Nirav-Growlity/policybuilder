# 10 Per-template sign-off and default flip

Status: ready-for-human
Type: task
Blocked by: 08

Open `.scratch/policy-typst/parity/index.html` after a full harness run. For each template, tick it once its side-by-side pages look right, the text diff shows nothing missing or added, and its page count is within ±1.

| Template | Concise | Regular | Dense | Signed off |
|---|---|---|---|---|
| standard-pack (Quiet Aptos Policy) | | | | |
| executive-brief (Controlled Approval Sheet) | | | | |
| controlled-manual (Table Register) | | | | |
| governance-register (Framework Map) | | | | |
| operations-guide (Compact Operating Standard) | | | | |
| sustainability-charter (Image Led Charter) | | | | |
| people-charter (Heritage Crest Policy) | | | | |
| metrics-ledger (IMS Operating Tabs) | | | | |
| Extras: custom solid, gradient, feature cover, logo right, AI cover, TOC off, acknowledgement | | | | |

After all rows are signed off: make `typst` the default, then open a follow-up to delete the Chromium path, `@sparticuz/chromium` and the pdf-lib finishing step.
