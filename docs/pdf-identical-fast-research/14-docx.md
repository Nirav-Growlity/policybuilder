# DOCX generation: pipeline, benchmark, identity-safe speedups

Status: PARTIAL. Timing re-run (bench-g/out/rerun.jsonl) was 10/30 rows complete at handback; the table below is from the first full matrix (bench-g/out/timings.jsonl, 7 runs each, noisy) plus the stage breakdown. Machine noise is roughly +/-20 percent between configs. Project files under D:\Policy PoC were not modified (git status unchanged).

## 1. Pipeline map (file:line)

- API route: `src/app/api/export/docx/route.ts:9-19` calls `preparePolicyCraftRequestExport`, then `generateDocx(policy, authorApproval)`, returns the buffer as an attachment.
- Entry: `src/lib/docx/generate.ts:77` `generateDocx` (AsyncLocalStorage for margins/ids), body at `:97` `generateDocxDocument`.
- Custom cover: `generate.ts:101-103` calls `customCoverImage` (`:893`). It builds an SVG with `createCoverCompositionSvg` (`src/lib/cover-renderer.ts:140`) and rasterises with **sharp** at 2480x3508 (`generate.ts:903`). **No Chromium** in the DOCX path. The only browser code is `src/lib/pdf/print-document.tsx` (PDF, not DOCX).
- Editable cover layers: `generate.ts:939-1000`. Each layer is re-rasterised by sharp (`coverLayerImage`, `:986`).
- Logos/feature images: `logoFromDataUrl` (`:1150`) runs sharp metadata/convert per call. SDG tiles read from `public/E SDG Icons PRINT` with `readFile` (`:1134`).
- Fonts: `src/lib/docx/document-fonts.ts:20` reads TTFs from `public/fonts` with `readFile` on every call. docx then obfuscates them (`node_modules/docx/dist/index.mjs:31313`). Fonts are **not** cached and the obfuscation key is random per run (`uniqueUuid()`, `index.mjs:17585`).
- Packing: `generate.ts:253` `Packer.toBuffer(doc)`. docx compiles XML, then JSZip `generateAsync({compression:"DEFLATE"})` (`index.mjs:31954`), i.e. default level for every entry including the media PNG.
- docx uses **Math.random** for nanoid/uuid ids (`index.mjs:12279-12471`), so outputs are non-deterministic unless the PRNG is seeded (done in the bench).
- docx media key: `ImageRun` calls `hashedId(data)` = **pure-JS SHA-1 (bundled hash.js)** on every image buffer (`index.mjs:15069`, `:12451`).

## 2. Stage breakdown (median of 7, sample policy, scratch-instrumented copy)

| stage | none | default cover | photo cover (6 MB PNG) |
|---|---|---|---|
| total | 70 ms | 163 ms | 2483 ms |
| sharp svg->png (cover) | 0 | 81 | 837 |
| docx ImageRun hashing (pure-JS SHA-1, inside Document ctor) | 0 | ~0 | ~334 (measured separately) |
| body/sections | 6 | 7 | 7 |
| styles/Document ctor | 4 | 7.5 | ~20 (excl. hashing) |
| docx compile (XML + zip.file) | 31 | 38 | 45 |
| JSZip DEFLATE | 28 | 35 | 1236 |

Measured in isolation: pure-JS SHA-1 of the 6 MB cover PNG = 334 ms; node:crypto SHA-1 = 3.3 ms, same digest. sharp PNG encode of the same image = 905 ms (default), 494 ms (compressionLevel 1), 1784 ms (level 9). Pixels identical in all levels, but bytes differ.

Full-matrix medians (single pass, noisy): photo cover real 2527 ms; media STORE 1610 ms; cover-cache (steady state, repeat export) 1470 ms; media STORE + XML level 1 + cover cache + font cache 628 ms. Default-cover and no-cover differences are inside noise and are not claimed.

## 3. Identity verification

Seeded Math.random (identical ids and font keys across runs). Compared all zip entries, decompressed, using JSZip. docProps/core.xml timestamps tolerated.

- Baseline vs baseline (determinism control): 31/27/27 entries identical for none/cover/photo.
- Baseline vs variant (media STORE, XML DEFLATE level 1, cover LRU cache, font cache): all entries identical after decompression for all three cases. Zip bytes differ (expected). Output size changes: photo 5.94 MB to 6.08 MB (+2 percent), default cover 74 KB to 122 KB.

## 4. Safe speedup candidates

Identity-safe (decompressed XML and media identical):
1. Cover PNG LRU cache keyed by sha256 of the exact SVG (sharp is deterministic, verified). Saves ~80 ms (default cover) and ~840 ms (photo) on repeat exports. First export unchanged.
2. Store already-compressed `word/media/*` entries (`entry.options.compression = "STORE"` after `Packer.compiler.compile`). Saves most of the 1.2 s photo deflate. Costs about 2 percent larger file.
3. XML deflate level 1 (`compressionOptions.level`). Small gain, larger output.
4. Font buffer cache (`readFile` once per process). Trivial gain, safe because docx's obfuscate copies the buffer.

Not identity-safe, needs the user's decision:
5. Patch docx's `hashedId` to node:crypto SHA-1 (same digest, ~100x faster for images). Saves ~330 ms on the photo case. Requires a dependency patch (patch-package or bun patch). Not applied.
6. sharp `compressionLevel` lower: pixel-identical but different PNG bytes, and it inflates the media size.

Not recommended: worker threads for single-request latency (CPU work is about 70 ms without images; threads only help event-loop headroom under concurrency).

## 5. Research

- docx issue #1250 (https://github.com/dolanmiu/docx/issues/1250): v7 slower than v6.0.3 for large docs; maintainer said "seems fine as of v8.3.0" (~342 ms) and closed it. Our 9.7.1 is past that.
- docx issue #2672 (https://github.com/dolanmiu/docx/issues/2672): generation speed for very large outputs; no answer found.
- JSZip docs (https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html): default compression STORE; DEFLATE levels 1-9; per-file options take precedence over generateAsync options (confirmed in bundled code, `index.mjs:28260`).
- docxtemplater: a template engine that still uses JSZip/PizZip. It would not produce the same XML as docx (different package structure), so a switch is a rewrite and not identity-safe.
- Direct JSZip XML templating: same conclusion, not byte/XML-identical to docx output.

## Open

- Final re-run table (bench-g/out/rerun.jsonl) incomplete at handback. Rerun in progress via bench-g/rerun.sh.
- docx `hashedId` patch and any change to the project source were not applied.
