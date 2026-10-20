# 13 Running header company name wraps like Chromium

Status: ready-for-agent
Type: task

When the company has no logo, the running header prints the name in 8 px Arial. With a long name ("Long-form Example Holdings, Manufacturing and Infrastructure Services Company Limited", the dense QA sample), Typst breaks words mid-word ("Infrastruc-ture", "Lim-ited") and hangs the block lower than Chromium. See `parity/people-charter-dense/page-03.png`.

Differences from `lib/pdf/print-document.tsx` (header template):
- the box is a fixed 28 mm in `policy.typ`, where Chromium uses the logo-fit width (`runningLogoFit(theme.logoScale).widthMm`);
- the name inherits `hyphenate: true` from justified templates, while Chromium's header never hyphenates;
- Chromium centres the text block vertically on `logoTop + 2 mm` (a flex item in a `logoFit.heightMm` box) and horizontally as a shrink-wrapped block. Typst hangs it from a fixed first baseline.

Check: the dense QA cases (long name) and the regular ones (short name), header band side by side.
