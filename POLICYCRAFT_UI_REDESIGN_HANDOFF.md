# PolicyCraft redesign handoff

Implementation has continued through P13. Desktop QA used Computer Use in the user's local Brave browser and the existing local `.env` setup. Mobile QA is waived by the user's latest instruction. Nothing has been deployed or committed; no migrations or environment edits were performed. Remaining QA carryover is explicit in the live plan.

## Delivered changes

| Phase | Implementation and evidence |
|---|---|
| P8 | Existing signature UI retained; fresh targeted local-browser inspection covers typed styles, light/dark preview, unsaved drawing history and inspector picker keyboard containment. The signature suite passes 33 tests. |
| P9 | Public homepage and three-phase GSAP walkthrough implemented with scoped styles, desktop pinning thresholds, normal-flow alternatives and cleanup. Auth-aware admin navigation retained. |
| P10 | Approved immediate-navigation fallback recorded. Experimental route transitions remain disabled. |
| P11 | Grouped PDF page/view/zoom/export controls, finite PDF loader, opacity-only HTML entrance, and professional modular-heading contrast correction. Desktop PDF and HTML sweeps cover all eight themes. |
| P12 | Fourteen exact Word font faces derived from existing bundled fonts and embedded for all eight themes. Oversized target body rows can continue across pages in table, band and entry layouts; compact repeated table headers stay together. Actual Microsoft Word rendering verifies font embedding and target-section pagination. |
| P13 | Final build, lint, type check, baseline test comparison, independent Standards/Spec reviews and artifact inspection are recorded. Title-owned acknowledgement breaks and omission of the final professional section spacer remove five introduced blank pages. The existing cover pixel test waits for the approved finite entrance to finish before comparing artwork. |

The eight approved theme definitions, page geometry, API/persistence paths and signature scoping have no changes in P9–P13. All 71 original protected font hashes match; the 14 new Word font hashes have a separate conversion record. The combined source-scope integrity check finds no unexpected edits.

## Validation and practical limits

- `npm.cmd run build`: passes. This is a production build, not deployment.
- Focused ESLint on affected UI/output files: zero errors, five existing image warnings.
- `node node_modules/typescript/lib/tsc.js --noEmit`: two existing diagnostics in `lib/policycraft-login-regression.test.ts`; no newly introduced diagnostics. Direct use of the installed compiler avoids an unrelated `npx` registry lookup failure.
- `npm.cmd run test:signatures`: 33/33; `test:access`: 80/80; `test:tasks`: 32/32.
- Final `npm.cmd test`: **358 tests, 335 pass, 23 fail**. All failures exactly match the frozen P7 baseline; four new regression tests pass. Earlier additional launch-timeout and transient-fade failures were investigated and are absent in this final run. The repository-wide test suite is not green.
- Focused DOCX/private export suite after target-row corrections: 30 tests, 28 pass and the same two existing DOCX assertions fail. The final full suite also runs the font, row-flow, acknowledgement and heading-contrast regressions.
- Pure synthetic output matrix: 19 HTML/PDF and 19 DOCX fixtures, including all eight parity themes, eight long-content stress themes, manual/AI covers and authored overrides. Chromium PDFs have 310 pages. Final actual Word renders have 277 pages and **zero blank body pages**, down from 282 pages with five blanks. Exact PNG hashes confirm 272 final Word pages match the individually inspected originals; all five replacement acknowledgement pages pass native-page visual reinspection with expected fields, signatures, running marks and footers intact. Structural/font assertions do not substitute for raster inspection.

Remaining desktop QA includes P8 persistence/upload/stale-response/delayed-write fixtures; public other-role/sign-out/access-error and runtime reduced-motion fixtures; and PDF stale/error/retry runtime fixtures. These are not claimed as passed. The local browser capability did not provide API interception; live policies/signatures were preserved by avoiding intentional save/delete/upload operations. Earlier builder viewing can trigger the application's existing autosave, so this handoff does not assert a database audit of zero writes.

Known baseline output/test concerns include footer and cover assertions, sparse pagination, some lower-level heading associations across stress-page breaks, cover contrast on synthetic dark artwork, and Chromium/Word layout differences. Requested Word body and heading faces are embedded in all eight themes. PDF body-family resources are present for operations, sustainability and metrics; the other five omit the requested body family. Those exact resource sets also appear in the frozen P0 PDFs, and the relevant renderer/font-map sources are unchanged. Exact HTML/PDF/Word font parity is therefore not claimed. [Source and artifact diagnosis](</D:/Policy PoC/tmp/redesign-p13-20261009/pdf-font-assessment.md>).

| Theme | Chromium parity pages | Word parity pages | Requested Word body/heading faces | Requested PDF body face |
|---|---:|---:|---|---|
| Standard Pack | 10 | 9 | Both verified | Baseline omission |
| Executive Brief | 11 | 9 | Both verified | Baseline omission |
| Controlled Manual | 11 | 9 | Both verified | Baseline omission |
| Governance Register | 10 | 9 | Both verified | Baseline omission |
| Operations Guide | 10 | 8 | Both verified | Present |
| Sustainability Charter | 11 | 9 | Both verified | Present |
| People Charter | 11 | 9 | Both verified | Baseline omission |
| Metrics Ledger | 11 | 9 | Both verified | Present |

## Evidence

The [live plan](</D:/Policy PoC/POLICYCRAFT_UI_REDESIGN_PLAN.md>) contains phase authorization and the final checklist. Detailed local evidence remains in ignored `tmp/` folders and should be retained for review; it will not be included in a normal source commit.

- [P8 local browser record](</D:/Policy PoC/tmp/redesign-p8-20261009/local-browser-review.md>) and [P9 local browser record](</D:/Policy PoC/tmp/redesign-p9-20261009/local-browser-review.md>).
- [P10 fallback decision](</D:/Policy PoC/tmp/redesign-remaining-20261009/p10-decision.md>).
- [Eight-theme desktop preview record](</D:/Policy PoC/tmp/redesign-p11-20261009/local-browser-review.md>), [HTML/PDF manifest](</D:/Policy PoC/tmp/redesign-p11-20261009/artifacts/manifest.json>) and [PDF raster manifest](</D:/Policy PoC/tmp/redesign-p11-20261009/artifacts/raster-manifest.json>).
- [DOCX manifest](</D:/Policy PoC/tmp/redesign-p12-20261009/artifacts/manifest.json>), [actual Word raster manifest](</D:/Policy PoC/tmp/redesign-p12-20261009/artifacts/word-rendered-final/raster-manifest.json>), [font conversion](</D:/Policy PoC/tmp/redesign-p12-20261009/font-conversion.json>), [actual Word fonts](</D:/Policy PoC/tmp/redesign-p12-20261009/font-verification-final.json>) and [target pagination](</D:/Policy PoC/tmp/redesign-p12-20261009/pagination-final.json>).
- [Word visual review A](</D:/Policy PoC/tmp/redesign-p12-20261009/visual-review-final-a.md>), [Word visual review B](</D:/Policy PoC/tmp/redesign-p12-20261009/visual-review-final-b.md>), [final changed-page hashes](</D:/Policy PoC/tmp/redesign-p12-20261009/raster-final-changes.json>) and [final blank-page scan](</D:/Policy PoC/tmp/redesign-p12-20261009/blank-pages-final.json>).
- [Standards source review](</D:/Policy PoC/tmp/redesign-p13-20261009/standards-review.md>), [test baseline comparison](</D:/Policy PoC/tmp/redesign-p13-20261009/test-baseline-comparison.json>) and [combined source integrity](</D:/Policy PoC/tmp/redesign-p13-20261009/final-scope-integrity.json>).

Suggested commit message: `feat(policycraft): finish public walkthrough and document output redesign`
