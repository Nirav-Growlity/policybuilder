# 01 Side-by-side visual check harness

Status: resolved
Type: task

Build `src/scripts/policy-typst-parity.ts`. For each case it renders the policy with Chromium (`generatePreviewPdf`) and with Typst (`lib/typst/policy/render.ts`, when that module exists). It rasterises each page with pdf.js inside local Chrome, the same way as `scripts/sop-parity.ts`, and writes:

- `.scratch/policy-typst/parity/<case>/page-NN.png`, with Chromium on the left and Typst on the right, labelled. A grey "not ported yet" page fills a missing side;
- `.scratch/policy-typst/parity/<case>/report.txt`: page counts, render times, and words present in one PDF but not the other;
- `.scratch/policy-typst/parity/index.html`: a contact sheet of every case, with page 1 thumbnails linked to the full pages;
- `.scratch/policy-typst/parity/summary.txt`.

Run: `npx tsx scripts/policy-typst-parity.ts [case|all] [--no-png]`

Done when it runs on all cases and produces the Chromium baseline before any Typst template exists.

## Answer

Built `src/scripts/policy-typst-parity.ts`; the cases live in `src/scripts/policy-qa-cases.ts`, which `generate-theme-qa.ts` now shares. Baseline run 2026-10-19: 32 cases, Chromium 1.4-4.4 s each. The Typst side expects `lib/typst/policy/render.ts` to export `renderPolicyTypstPdf(policy): Promise<Buffer>`. Output in `.scratch/policy-typst/parity/` is gitignored.
