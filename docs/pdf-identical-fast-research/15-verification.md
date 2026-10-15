# 15 - Output parity verification (PDF + DOCX): research and recommendation

Scope: prove that before/after performance changes produce no visual change in PDF or DOCX exports, across all templates and design settings. Nothing under `D:\Policy PoC` was modified.

## 1. Repo facts (verified)

| Fact | Evidence |
|---|---|
| 8 document themes | `src/lib/document-themes.ts:124-132` (`DOCUMENT_THEMES`) |
| 5 preview policy types | `src/lib/sample-policies.ts:7-13` (`PREVIEW_POLICY_TYPES`) |
| 40 gallery samples = 8 x 5 | `src/.theme-qa/refresh-final-previews.ts` (log text "All 40 gallery samples") |
| Theme-QA matrix: 8 themes x {concise, regular, dense} + 3 custom cases (custom-solid, custom-gradient, feature-image-cover) = 27 cases, each emitted as DOCX and PDF | `src/scripts/generate-theme-qa.ts:9-30, 36-75, 77-92` |
| PDF generation: `generatePdf` -> `generatePreviewPdf` -> Playwright `chromium.launchPersistentContext` -> `page.pdf(...)` -> `finalizePdf` (pdf-lib load+save) | `src/lib/pdf/generate.tsx:10-31`, `src/lib/pdf/print-document.tsx:44-107, 213-226, 294-302` |
| Chrome path: local Windows Chrome in dev/tests; `@sparticuz/chromium` 147 on Vercel/Lambda | `src/lib/pdf/print-document.tsx:304-318` |
| DOCX generation: `generateDocx` -> `new Document({creator:"PolicyCraft", title, ...})` -> `Packer.toBuffer` | `src/lib/docx/generate.ts:77-80, 164-173, 253` |
| Installed versions | docx 9.7.1, pdf-lib 1.17.1, pdfjs-dist 5.7.284, playwright-core 1.63.0, sharp 0.34.5, @sparticuz/chromium 147.0.2 |
| `@napi-rs/canvas` is present in `src/node_modules/@napi-rs/canvas` (declared as an optional dependency of pdfjs-dist) | `node_modules/pdfjs-dist/package.json` optionalDependencies |
| Test runner: `node --import tsx --test --test-force-exit <files>` | `src/package.json` scripts `test`, `test:signatures`, `test:access`, `test:tasks` |
| Existing Chromium-backed pixel/computed-style tests | `src/components/policy/policy-preview.test.tsx:5, 109-137` (exact RGB at sampled edge pixels via sharp raw buffer), `:287, 401, 446, 500, 605` (Chromium screen vs print checks) |
| Existing pdf.js structural tests | `src/lib/pdf/layout.test.ts:3, 39, 77, 86` (pdfjs `getTextContent`, `getOperatorList`) |
| Existing pdf-lib structural tests | `src/lib/pdf/generate.test.ts:9-80` |
| Existing text-color verifier (Playwright, all themes) | `src/.theme-qa/verify-text-colors.ts` |
| `.theme-qa` is gitignored, so it is not a durable golden location | `src/.gitignore` (`/.theme-qa/`) |
| `pdftoppm` (Poppler) is used by `refresh-final-previews.ts` but is NOT on PATH on this machine; `soffice` (LibreOffice) is not installed | shell `which` check |
| Prior identity probe (scratch) | `scratchpad\bench\identity.tsx`: hashes pdf.js `fnArray` and text item transforms, and checks raw byte equality across three Chromium runs |

## 2. Why byte equality is the wrong gate (verified in source)

- **pdf-lib rewrites metadata on every load.** `node_modules/pdf-lib/cjs/api/PDFDocument.js:121, 144` default `updateMetadata = true`. `updateInfoDict()` (lines 1335-1345) always sets Producer and ModDate to `now`, and sets Creator/CreationDate only if absent. `save()` does not stamp. The app calls `PDFDocument.load` in `finalizePdf` and in the background/border/cover helpers, so **every export has a fresh ModDate even with identical content**.
- **Chromium/Skia writes CreationDate, ModDate and a random trailer `/ID`** (Chromium stamps these at print time; per Chromium code reviews and the pdfTeX determinism thread, which is adjacent evidence, not a Chromium spec). I found no documented `page.pdf` option to suppress them.
- **DOCX core.xml timestamps change on every run.** `node_modules/docx/dist/index.cjs:22035-22057` writes `dcterms:created` and `dcterms:modified` as `new Date()`. `lastModifiedBy` defaults to `"Un-named"` (line 26806).
- **DOCX uses `Math.random()` nanoid** (`index.cjs:12290-12304`). Whether it reaches `document.xml` must be checked; if it does, the canonicalizer must normalize it or the harness must seed `Math.random`.

Conclusion: raw `.pdf` and `.docx` bytes will never be equal across runs, so `identity.tsx`'s "raw byte-equal" line is expected to print `false` by design. Compare normalized content instead.

## 3. PDF parity

### 3a. Tier 0: normalized content-stream equality (recommended first gate)
Decompress and normalize the PDF, then compare the content streams and objects, ignoring `/Info` dates, Producer/Creator, and `/ID`.
- qpdf `--qdf --object-streams=disable --static-id` (or `--deterministic-id`) produces stable, decompressed output that diffs cleanly. Flag names are from qpdf knowledge and were NOT verified in this session; confirm with `qpdf --help=--deterministic-id`.
- Strip or normalize `/CreationDate`, `/ModDate`, `/Producer`, `/Creator`, `/ID` before hashing.
- Advantage: if content streams are byte-identical, the rendered output is identical by construction for the same renderer. This gate is strict and cheap.

### 3b. Tier 1: pdf.js structural signature (extend `identity.tsx`)
- pdf.js `PDFPageProxy.getOperatorList()` returns `{fnArray, argsArray}` (verified in `src/display/api.js`, `getOperatorList({ intent, annotationMode, printAnnotationStorage, isEditing })`). **The current `identity.tsx` hashes only `fnArray`**, so coordinates, colors, font references, and image references in `argsArray` are not compared. Hash `JSON.stringify([fnArray, argsArray])`.
- `getTextContent()` returns items with `str`, `transform`, `width`, `height`, `fontName`, `hasEOL`, plus `styles` (fontFamily, ascent, descent) (verified). `identity.tsx` omits `fontName`, `height` and `styles`. Add them.
- Also hash every embedded font program and every image XObject's bytes (walk `/Resources` with pdf-lib, as `generate.test.ts` already does).
- Use `getDocument({ data, useSystemFonts: false, standardFontDataUrl })` so font resolution is the same on every run. `useSystemFonts` defaults to false in Node (verified), but set it explicitly.

### 3c. Tier 2: raster comparison
- Renderer candidates:
  - **pdf.js + `@napi-rs/canvas`**: already in `node_modules`, no system binaries, same engine as the tests. Requires a canvas factory wired in Node. pdf.js's canvas code notes that subpixel AA varies by OS ("On Windows GDI scaled fonts looks bad", `src/display/canvas.js`), so rasters are only comparable on the same OS/build.
  - **pdftoppm (Poppler)**: used by the existing refresh script but not installed here. Install and pin the version before relying on it.
  - **PDFium** (Chromium's PDF engine; e.g. via a PDFium binding) and **MuPDF**: alternative engines. I could not fetch MuPDF.js docs (404) and did not verify PDFium bindings in this session.
- Diff: **pixelmatch** (zero-dependency; `threshold` default 0.1 in its README; `includeAA`), **odiff** (native, fast; sources conflict on AA support, so check the installed version), **diff-pdf** (vslavik; C++ Windows ZIP; exit 0 identical / 1 different; `--output-diff` writes a highlight PDF; upstream says it is no longer actively developed). `diff-pdf-visually` needs WSL/ImageMagick/Poppler. `pdf-visual-compare` and `doczilla-app/pdf-visual-diff` are npm options that use pdf.js/Jimp without binaries.
- Playwright's own snapshot comparator is pixelmatch with default `threshold` 0.2 and no default `maxDiffPixels`; its docs say snapshots are platform-specific and must be generated in the same environment (verified: https://playwright.dev/docs/test-snapshots). Use `toHaveScreenshot` only for Chromium HTML previews, not as the PDF oracle.

### 3d. Tolerance policy
- Same machine, same Chromium build, same fonts: use **zero tolerance** (`threshold: 0`, `maxDiffPixels: 0`). The renderer is deterministic for identical input, and any AA-level change is a real change the requirement forbids.
- Cross-machine or cross-OS: tolerate only AA noise (pixelmatch `threshold` 0.05-0.1, `includeAA: false`, `maxDiffPixels` small and recorded). Keep this out of the default gate.
- Before trusting any gate, run **baseline vs baseline** twice (this is the `identity.tsx` idea) and require zero diffs. Any nonzero diff on identical input is harness noise to remove first.

## 4. DOCX parity

### 4a. Canonical XML diff (primary gate)
1. Unzip with a library (JSZip is already a transitive dependency of docx) into memory, not into the source tree.
2. List entries; require the same set.
3. For each XML part: parse, canonicalize (C14N-like, normalized attribute order and whitespace), then compare. Normalize:
   - `docProps/core.xml`: `dcterms:created`, `dcterms:modified`, `cp:lastModifiedBy` (docx writes `new Date()` and `"Un-named"` defaults, `index.cjs:22035-22057, 26806`).
   - `docProps/app.xml` if present.
   - Any nanoid/random ids found in `word/document.xml` (`index.cjs:12290-12304`).
4. Compare binary media (`word/media/*`) by SHA-256. Images are produced by sharp (`lib/docx/generate.ts:893-999, 1156`); pin sharp/libvips versions.
5. Compare fonts (`word/fonts/*`, produced by `lib/docx/document-fonts.ts`) by SHA-256.

If the canonical XML is identical, the Word document is identical for any consumer, so this gate subsumes most visual checks.

### 4b. Visual render via LibreOffice (secondary gate)
- LibreOffice headless: `soffice --headless --convert-to pdf --outdir <dir> <file.docx>`; `-env:UserInstallation=file:///...` isolates the profile; `--safe-mode` resets profile (verified: https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html). The page documents no font options; font resolution is by the OS font set. Pin and install the fonts used (`public/fonts`).
- Then rasterize the LibreOffice PDF and use the same pixel gate as section 3c.
- Caveat: LibreOffice is not Word. For the parity requirement this is acceptable, because the question is "did the output change", not "does it match Word". Its layout engine is deterministic for identical input and fonts, so the same zero-tolerance gate applies. It does not prove Word appearance.

### 4c. Word-fidelity options (not recommended for the gate)
- **Microsoft Graph `format=pdf`** (verified: https://learn.microsoft.com/en-us/graph/api/driveitem-get-content-format?view=graph-rest-1.0): requires the file to be in OneDrive/SharePoint, **maximum 2 MB**, redirects to a short-lived URL, and documents no determinism guarantee. It also uploads policy content to Microsoft, which is a data-handling concern for company policy documents. Do not use in CI.
- **docx-preview / docxjs** (verified: https://github.com/VolodymyrBaydalka/docxjs): browser-only, renders DOCX to HTML, has no real pagination (pages break only at manual breaks), and lists TOC and tab stops as limited. Unsuitable as a page-level oracle.

## 5. Recommended golden-file "output parity" suite

Location: a committed directory such as `src/tests/output-parity/` (not `.theme-qa`, which is gitignored). Store fixtures as normalized JSON manifests and hashes, not full binaries, except for the first golden run where the rasters are kept as artifacts.

Matrix:
- Base: 8 themes x {concise, regular, dense} (from `generate-theme-qa.ts:qaPolicy`) plus 8 themes x 5 preview types (`refresh-final-previews.ts`), union = about 64 policies.
- Plus the 3 custom cases (custom-solid, custom-gradient, feature-image-cover).
- Toggles per base policy: page border on/off, acknowledgement on/off (with and without author approval; `generatePdf` takes `authorApproval`), custom cover vs AI cover vs none (`coverComposition`, `aiCoverComposition`), list formatting variants (`DEFAULT_POLICY_LIST_FORMATTING`), logo scale/position, density.
- Full product is roughly 64 x 4 toggle variants = about 250 PDF + DOCX pairs. Run the full matrix nightly or pre-release; run a fixed subset of about 27 (the theme-QA matrix) on every PR.

Pipeline per case:
1. Generate with `generatePdf` and `generateDocx` at the pre-change commit (worktree of `HEAD` on `design-change`); write `golden/<case>/` with a manifest recording git SHA, Chrome version, node version, OS, font hashes, sharp version.
2. Run baseline twice; require zero diffs (determinism check).
3. Run post-change; compare:
   - PDF: Tier 0 normalized content, Tier 1 pdf.js signature, Tier 2 raster at fixed DPI, threshold 0.
   - DOCX: canonical XML (4a), then LibreOffice raster (4b), threshold 0.
4. On failure, write diff PNG and the first mismatched object/part path.

Production parity caveat: the production PDF path uses `@sparticuz/chromium` 147 in serverless environments. Goldens must be produced with the same Chromium build, or the comparison will measure the Chrome version change and not the code change. Pin the Chrome binary used for goldens. Also note that `finalizePdf` uses pdf-lib load+save; if a performance change skips that round-trip, metadata changes but visuals should not. The Tier 0 normalization must handle that.

## 6. Open items (not verified in this session)
- qpdf flag names for deterministic output.
- odiff AA behavior in the installed version.
- Whether LibreOffice honors DOCX-embedded fonts (`word/fonts`) without system installation.
- Whether `Math.random` nanoid reaches `document.xml` in docx 9.7.1.
- PDFium and MuPDF.js bindings and their Windows install paths.

## 7. Sources
- pdf-lib source (installed): `src/node_modules/pdf-lib/cjs/api/PDFDocument.js:117-150, 1335-1345`
- docx source (installed): `src/node_modules/docx/dist/index.cjs:12290-12304, 22033-22057, 26806`
- pdf.js API docs (fetched): https://raw.githubusercontent.com/mozilla/pdf.js/master/src/display/api.js
- pdf.js canvas notes (fetched): https://raw.githubusercontent.com/mozilla/pdf.js/master/src/display/canvas.js
- Playwright snapshot docs: https://playwright.dev/docs/test-snapshots
- LibreOffice start parameters: https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html
- Microsoft Graph content conversion: https://learn.microsoft.com/en-us/graph/api/driveitem-get-content-format?view=graph-rest-1.0
- docxjs README: https://github.com/VolodymyrBaydalka/docxjs
- diff-pdf (vslavik): https://github.com/vslavik/diff-pdf (via search summary)
- pixelmatch (npm/tessl summary): https://tessl.io/registry/tessl/npm-pixelmatch
- odiff: https://github.com/kamieen/odiff
