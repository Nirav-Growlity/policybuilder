# Chromium PDF path benchmark (bench-a)

Date: 2026-10-12. Machine: Windows 11, local Chrome 155.0.8059.39, playwright-core 1.63.0, pdf-lib 1.17.1, pdf.js 5.7.284, @napi-rs/canvas 0.1.100.
Sample: `makeSamplePolicy()` normalised, 9 A4 pages, markup 752 KB (base64 assets inline), theme `sustainability-charter`.
Code: `identical-fast/bench-a/` (`lib.mts`, `bench.mts`, `debug-l2.mts`, `results-run1.json`, `results.json`, `full-run1.log`, `full-run2.log`). Nothing under `D:\Policy PoC` was written.

## Identity check (strengthened)

- **L1**: per-page pdf.js operator codes plus text strings and positions (the original `identity.tsx` signature).
- **L2**: L1 plus the full `argsArray` (numbers rounded to 3 dp), text `fontName` and height. pdf.js object ids are normalised (`g_dN_`), because the document counter changes per `getDocument` call. Without that normalisation, two identical cold renders already differed in L2.
- **L3**: each page rasterised with pdf.js and @napi-rs/canvas at scale 1.5, compared as a zero-tolerance RGBA hash.
- **Determinism (baseline vs baseline)**: two cold renders of P0 and two of P1 match at L1, L2 and L3 (run 1 and run 2).
- **Colour sanity**: P1 has the primary theme colour changed to `#7a2e8c`. L1 is identical (colour is not in the operator codes), but L2 and L3 differ. L1 alone cannot detect colour changes, which is why L2 and L3 are needed.
- **Replica**: `generatePreviewPdf` output matches my replica (raw Chrome output, then `applyPageBackground` and `applyPageBorders`) at L1, L2 and L3.

Every variant below was checked on all 8 runs (1 warm-up plus 7 measured) against the cold baseline of the same policy (P0 or P1 alternating, so every run is a real change).

## Results (median ms, 7 measured runs; min–max in brackets)

| ID | Variant | Run 1 | Run 2 | Identical (L1/L2/L3) |
|---|---|---|---|---|
| V0 | Cold persistent context per render (replica of current) | 2552 (2266–5671) | - | yes / yes / yes |
| V0r | Production `generatePreviewPdf` (cold, incl. finalize) | 4027 | - | yes vs replica |
| V1 | Warm browser, new context+page per render | 2072 (1921–2138) | - | yes / yes / yes |
| V2 | Warm browser, reused page, setContent+pdf | 1197 (945–1463) | 1234 (1029–1640) | yes / yes / yes |
| V3a | Kept-loaded page, body.innerHTML patch | 1144 (932–1402) | 1302 (1136–1419) | yes / yes / yes |
| V3b | Kept-loaded page, CSS custom-property patch (colour only) | 1321 (977–1511) | - | yes / yes / yes |
| V4a | Assets via page.route, in-memory (no base64) | 1012 (958–1423) | 1191 (1101–1661) | yes / yes / yes |
| V4b | file:// goto with absolute file URLs | 713 (675–1034) | 1412 (1255–1616) | yes / yes / yes |
| V5a | Raw CDP Page.printToPDF, ReturnAsBase64 | 801 (795–1136) | 1277 (1122–1714) | yes / yes / yes |
| V5b | Raw CDP Page.printToPDF, ReturnAsStream + IO.read | 1018 (766–1167) | 1345 (894–1890) | yes / yes / yes |
| V6a | Launch: Playwright defaults, new browser | 1024 (730–1301) | - | yes / yes / yes |
| V6b | Launch: lean flags (`--disable-gpu`, `--disable-extensions`, etc.) | 1308 (1019–1487) | - | yes / yes / yes |
| V6c | lean + `--font-render-hinting=none` (probe) | 1092 (1010–1434) | - | yes / yes / yes (see note) |

Prep (React SSR plus base64 inline) costs 36–83 ms per render and is shown separately; it is not included in the table. Run 1 measured 69 ms React-only and 68 ms base64-inline-only. Run 2 measured 29 ms and 36 ms. Adding it back gives end-to-end figures roughly 30–80 ms above the browser column. V4a and V4b skip base64 but still run React SSR.

Breakdown (run 1 unless noted):

| ID | Case | Pages | Median |
|---|---|---|---|
| V7a | 1-page tiny body, same header/footer/A4 | 1 | 209 ms |
| V7b | Cover only (PolicyCoverPreview) | 1 | 359 ms |
| V7c | 9-page, `displayHeaderFooter=false` (output changes, probe only) | 9 | 819 ms |
| V7d | 9-page sample, full options (setContent included) | 9 | 1158 ms |
| V7e | `page.pdf` only on an already-loaded 9-page doc | 9 | 789 ms (run 1) / 1398 ms (run 2) |

Fixed cost is about 200 ms. The header/footer templates cost about 340 ms over nine pages (about 38 ms/page). Per-page print cost is roughly 100 ms/page.

## Findings

1. **Warm browser is the largest saving.** Cold launch (V0) costs roughly 1.3 s more than a warm browser with a new context (V1 saves about 0.5 s; V2 saves about 1.3 s). This matches the research doc.
2. **Reusing a page or patching the DOM gives roughly the same time** (V2, V3a, V3b, V4a, V5a all about 0.8–1.3 s). Differences between them are within run-to-run noise. Run 1 and run 2 disagree on ranking; for example V4b was 713 ms in run 1 and 1412 ms in run 2. I did not find a stable winner among these.
3. **Colour-only changes can be patched without re-rendering** (V3b). For this sample, all colours flow through CSS variables, so the output is pixel-identical (L3). The React SSR step (about 30–80 ms) is skipped.
4. **Asset handling (base64 vs route vs file://) is not a clear win**, and noise is large. file:// and route avoid roughly 0.75 MB of markup per render but did not produce a consistent speedup in this run.
5. **Raw CDP ReturnAsBase64** is not clearly faster than Playwright's stream in these runs (801 vs 1018 in run 1; 1277 vs 1345 in run 2).
6. **Launch flags did not produce a clear gain.** `--font-render-hinting=none` produced no output change at L1–L3 in this sample, but it changes text rasterisation generally, so keep it out of production unless verified on more documents.
7. **chrome-headless-shell** was not tested. No copy is installed locally, and downloading one needs your permission. Skipped.

## Fastest identical configuration

No single configuration is clearly fastest, because run-to-run noise (about ±50% on some variants) exceeds the differences between them. Two candidates are supported by both runs or by the design:

- **Warm browser, reused page** (V2): about 1.2 s, identical at all levels. Requires a single browser and a serialised page or pool.
- **Colour-only edits with CSS variables on a kept-loaded page** (V3b): skips React and setContent. Only valid for colour changes.

## Remaining floor

- `page.pdf` alone on a loaded 9-page document: 0.8–1.4 s (print-bound).
- Fixed cost of any PDF: about 200 ms (1-page tiny document).
- The header and footer templates add about 340 ms per 9-page document.

So instant (under 300 ms) is not reachable with Chromium print for this document. A client-side draft or a different renderer is needed for that, and either would break the identical-output constraint.

## Caveats

- Seven runs per variant; the spread between runs is large (for example V0r was 1741 ms in a smoke run and 4027 ms in run 1). Treat differences under about 400 ms as noise.
- Run 2 covered only V2, V3a, V4a, V4b, V5a, V5b and V7e. V6 and V0r were not repeated.
- The timing harness ran from `src` as the working directory (needed for `@/` aliases); the script writes only under `bench-a`.
