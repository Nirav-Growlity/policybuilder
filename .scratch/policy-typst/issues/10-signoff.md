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

## Comments

- 2026-10-20 (agent): after tickets 11–13, 13 of the 36 harness cases match every page opening, and none got worse. The text diffs that remain ("speci c", "signi cant" in the concise cases) are Chromium's PDF dropping the "fi" ligature from its text layer. Typst's text ("specific") is correct, so those don't block sign-off. Remaining break differences are dense/concise cases where a table fits at a page foot in one engine and not the other by a few pixels, plus long paragraphs that Typst can split 2 + n where Chromium needs 3 + n (ticket 12).
