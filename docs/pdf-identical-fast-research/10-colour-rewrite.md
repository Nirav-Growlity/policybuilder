# 10 - Colour-operand rewrite of cached Chromium PDFs

Scope: scratch experiment only. Nothing under `D:\Policy PoC` was modified. All scripts and outputs are in `identical-fast\bench-c\`.

## Verdict

**Conditionally viable, not zero-change in general, not shippable as-is.**

- The structural half of the hypothesis holds. For every palette change tested, Chromium emits the same operator sequence (pdf.js `fnArray` identical on all pages), the same text, and the only differing operands are `setFillRGBColor` / `setStrokeRGBColor` (the `rg`/`RG` operands).
- A 1:1 hex map from the cached default print does not reproduce a fresh print. It leaves a derived colour unrewritten and cannot resolve role collisions.
- A sentinel-source rewrite (print once with a unique marker colour per role, then rewrite markers to target values) is exact for the palette tested (paletteB, all 9 pages, zero-tolerance pixels). It is also exact for the paper-only change except for the derived colour, which stays wrong.
- Font-size changes are structural and are not rewritable.

## Strict identity check (method)

`identity.tsx`'s signature (fnArray + text only) misses colour operands, so `compare.tsx` was written to check:
- `fnArray` equality per page.
- `argsArray` equality, numbers rounded to 3 dp, pdf.js run-specific ids (`g_dN_`) normalised, typed arrays hashed.
- text items with transforms.
- zero-tolerance pixel comparison: pdf.js at scale 1.5, rendered through `@napi-rs/canvas` (present in `src/node_modules/@napi-rs/canvas`), `disableFontFace: true`.

**Baseline vs baseline** (`raw-default.pdf` vs a second print): identical on all 9 pages for fn, args, text and pixels. Raw bytes differ only in metadata; content streams are equal. This proves the check is deterministic.

## Results (9-page sample, `makeSamplePolicy()`, sustainability-charter)

| Variant | fn arrays | Args differing | Text | Pixels |
|---|---|---|---|---|
| paletteB (all 10 roles changed, paper kept) | equal, 9/9 pages | colour ops only (setFill/StrokeRGBColor) | equal | differ (expected) |
| paletteD (paper only, `#FAF7F0`) | equal | 2 ops on p1, p2 | equal | differ on p1, p2 only |
| paletteC (onPrimary only) | equal | none | equal | identical to default |
| fontsize (+1 pt paragraph) | **differ** (from p3), 9 to 10 pages | positions, fonts | **differ** | n/a |
| density (spacious, compact) | equal | none | equal | identical bytes |

Notes:
- `paletteC` is byte-identical to the default because `onPrimary` is not used by any element in this sample. An earlier "exact match" claim for it was vacuous.
- The density overrides change `--doc-density-factor` in the preview markup (1.18 / .82) but produce byte-identical PDFs here. This is unexplained and was not investigated further, so density is not evidence either way.
- One form XObject on page 2 differs in its raw hash; its only strict differences are colour operands. No image XObject changed.
- Images, ExtGState and fonts are unchanged across palette variants in this sample. Gradients and `color-mix` cases (`policy-preview.tsx` lines 413, 642, 699) are not exercised by this sample, so they remain unverified.

## Derived and collision risks found

1. **Derived colour `#1C211F`** appears 18 times (2 per page, fill and stroke). It matches no default role. With paletteB it becomes `#5A6B7B` (paletteB muted). Under the default-sourced rewrite it stays `#1C211F`, leaving 565 wrong pixels per page (max delta 85). The source of `#1C211F` was not traced in the CSS or JS (it is not a literal, and not `DARK_INK = #17251F` from `lib/logo-palette.ts`). A plausible explanation is a palette-dependent computed choice, but that is a hypothesis.
2. **Shared hex: paper and literal white.** `#FFFFFF` is paper and is also a literal white on pages 3 to 9 (2 ops per page). A hex map cannot tell them apart. Under paletteD:
   - conservative (drop conflicts): paper on p1 and p2 stays white, wrong by max delta 15;
   - naive (first target wins): literal whites on p7 and p8 turn paper colour, wrong by max delta 15.
3. **Shared hex: primaryDark and subheading** (both `#1B443A`). Not used in this sample's content, but a real conflict in any map.

## Sentinel route (the one that works)

Print once with unique marker colours (`#FE0100`..`#FE0109`, one per role), then rewrite markers to target values. Results:
- paletteB: exact on all 9 pages (args, text, zero-tolerance pixels).
- paletteD: paper now correct on p1 and p2; literal whites unaffected; only the derived `#1C211F` element differs (565 px per page).
- Still unhandled: any colour not in the role set, which must force a fallback to a full print.

## Timings (warm, Chromium on this machine)

- Chromium raw print (`raw-*`): 1.7 to 2.4 s. Full production path `generatePreviewPdf`: 1.8 to 2.4 s.
- Rewrite, load + rewrite + save with pdf-lib (in-process): role-based 158 to 233 ms; sentinel-based 241 to 383 ms; naive 133 to 184 ms.
- So the speedup is roughly 6 to 10x, not milliseconds. pdf-lib parse and save dominate.

## Risks before shipping

- Derived colours (`#1C211F`) must be detected: any colour operand outside the role set (and outside known constants such as SDG colours `#26BDE2`, `#FCC30B`, `#000000`) must fall back to Chromium.
- Role collisions require the sentinel source, never the default-palette source.
- Gradients, `color-mix` tints and alpha over images are untested in this sample and need a template with a cover gradient and tinted TOC tiles before any claim.
- Font size, density, page size or any structural change must bypass the rewrite (font size confirmed to change structure).
- Verification must run strict args plus pixels against fresh prints across several templates, not one sample.

## Files (all under `identical-fast\bench-c\`)

- `print.tsx`: Chromium prints mirroring `generatePreviewPdfNow` (raw and full pipeline), with timings; `info.json`.
- `analyze.tsx`: pdf-lib / pdf.js structural comparison and resource hashes.
- `compare.tsx`: strict args, text and pixel comparison (used by the others).
- `rewrite.tsx`: default-sourced role-map rewrite, verification, naive collision test.
- `rewrite2.tsx`: sentinel-sourced rewrite, verification.
- `rewrite-report.txt`, `rewrite2-report.txt`, `raw-*.pdf`, `rewrite-*.pdf`, `sentinel-to-*.pdf`.
