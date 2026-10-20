# 13 Running header company name wraps like Chromium

Status: resolved
Type: task

When the company has no logo, the running header prints the name in 8 px Arial. With a long name ("Long-form Example Holdings, Manufacturing and Infrastructure Services Company Limited", the dense QA sample), Typst breaks words mid-word ("Infrastruc-ture", "Lim-ited") and hangs the block lower than Chromium. See `parity/people-charter-dense/page-03.png`.

Differences from `lib/pdf/print-document.tsx` (header template):
- the box is a fixed 28 mm in `policy.typ`, where Chromium uses the logo-fit width (`runningLogoFit(theme.logoScale).widthMm`);
- the name inherits `hyphenate: true` from justified templates, while Chromium's header never hyphenates;
- Chromium centres the text block vertically on `logoTop + 2 mm` (a flex item in a `logoFit.heightMm` box) and horizontally as a shrink-wrapped block. Typst hangs it from a fixed first baseline.

Check: the dense QA cases (long name) and the regular ones (short name), header band side by side.

## Answer

- The name never hyphenates now. That was the whole wrapping difference: at the default logo scale both engines already used 28 mm, and Typst broke "Infrastruc-ture" and "Lim-ited" only because justified templates hyphenate.
- The box takes `runningLogoFit(theme.logoScale).widthMm` (the model's name brand carries `widthMm`), so the logo-scale setting also widens or narrows a name, as in Chromium.
- The block is centred vertically as Chromium's flex item is. The 6.8 mm first-baseline calibration was taken on the two-line sample name, so other line counts centre on that block's middle.
- Colour was already right. Chromium's darkest header pixels are the theme ink, as in Typst; Typst's text only looks lighter because thin 6 pt strokes anti-alias.
- **Check:** people-charter-dense (four lines) and standard-pack-regular (two lines). The header bands line up line for line, and the text layers are identical. The full harness shows no page-break changes.
