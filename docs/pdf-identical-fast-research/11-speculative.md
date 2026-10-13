# 11. Speculative pre-rendering, caching and parallelism

Research date: 2026-10-12. Read-only. Nothing under `D:\Policy PoC` was changed. Context: [pdf-instant-preview-research.md](../../../../../../../D:/Policy%20PoC/docs/pdf-instant-preview-research.md) and [01-codebase.md §4](../../../../../../../D:/Policy%20PoC/docs/pdf-instant-preview-research/01-codebase.md). Claims marked *(inference)* are reasoning. Claims marked *(assumption)* are numbers I chose to make the arithmetic concrete; they need measuring.

## TL;DR

- Hover-triggered speculation cannot make a ~1.5 s Chromium render feel instant. Per the instant.page numbers, a hover trigger leaves about 300 ms of preload window. The rest of the render still happens after the click. *(inference)*
- Pre-rendering the whole one-step neighbourhood of every control per change costs about 29 Chromium renders per settled state. That is roughly 4 serialized Chromium slots per active user. Not affordable.
- What pays off: (a) batch-render the 7 other templates when the gallery opens (seconds of dwell, 7 renders, near-certain reuse); (b) remove the global render serialization so several renders run at once; (c) a canonical content-hash key so irrelevant edits stop causing re-renders.

## 1. Discrete versus continuous controls

Finite (precomputable) sets:

| Control | Choice set | Source |
|---|---|---|
| Template | 8 canonical templates; 28 aliases normalised away | [types.ts:135-143](../../../../../../../D:/Policy%20PoC/src/lib/types.ts), [types.ts:146-157](../../../../../../../D:/Policy%20PoC/src/lib/types.ts), [document-themes.ts:144](../../../../../../../D:/Policy%20PoC/src/lib/document-themes.ts) |
| TOC / acknowledgement / revision history | 3 binary flags = 8 combinations | [dock-sections.tsx:74-76](../../../../../../../D:/Policy%20PoC/src/components/builder/dock-sections.tsx), [render-model.ts:189-191](../../../../../../../D:/Policy%20PoC/src/lib/document-render-model.ts) |
| List markers | 7 list keys × {bullet, number} = 128 combinations | [list-formatting.ts:3-11](../../../../../../../D:/Policy%20PoC/src/lib/list-formatting.ts), [types.ts:185-193](../../../../../../../D:/Policy%20PoC/src/lib/types.ts) |
| Data treatment | 2 (formal tables, clean lists) | [types.ts:123](../../../../../../../D:/Policy%20PoC/src/lib/types.ts), [theme-inspector.tsx:299](../../../../../../../D:/Policy%20PoC/src/components/builder/theme-inspector.tsx) |
| Density | 3 (compact, balanced, spacious) | [types.ts:240](../../../../../../../D:/Policy%20PoC/src/lib/types.ts), [theme-inspector.tsx:300](../../../../../../../D:/Policy%20PoC/src/components/builder/theme-inspector.tsx) |
| Content alignment | 4 | [types.ts:241](../../../../../../../D:/Policy%20PoC/src/lib/types.ts), [theme-inspector.tsx:301](../../../../../../../D:/Policy%20PoC/src/components/builder/theme-inspector.tsx) |
| Logo alignment | 3 | [types.ts:204](../../../../../../../D:/Policy%20PoC/src/lib/types.ts), [theme-inspector.tsx:308](../../../../../../../D:/Policy%20PoC/src/components/builder/theme-inspector.tsx) |
| SDG appearance | 2 | [types.ts:203](../../../../../../../D:/Policy%20PoC/src/lib/types.ts), [theme-inspector.tsx:310](../../../../../../../D:/Policy%20PoC/src/components/builder/theme-inspector.tsx) |
| Colour source | 2 (logo, template) | [types.ts:205](../../../../../../../D:/Policy%20PoC/src/lib/types.ts), [theme-inspector.tsx:250](../../../../../../../D:/Policy%20PoC/src/components/builder/theme-inspector.tsx) |
| Background | solid, or gradient × 3 directions | [types.ts:231-237](../../../../../../../D:/Policy%20PoC/src/lib/types.ts), [theme-inspector.tsx:511](../../../../../../../D:/Policy%20PoC/src/components/builder/theme-inspector.tsx) |
| Border scope | 3 | [types.ts:245](../../../../../../../D:/Policy%20PoC/src/lib/types.ts), [page-border-controls.tsx:21](../../../../../../../D:/Policy%20PoC/src/components/builder/page-border-controls.tsx) |
| Border on/off | 2 | [page-border-controls.tsx](../../../../../../../D:/Policy%20PoC/src/components/builder/page-border-controls.tsx) |
| Feature image placement | 2 | [theme-inspector.tsx:321](../../../../../../../D:/Policy%20PoC/src/components/builder/theme-inspector.tsx) |
| Active cover | 2 (manual, ai) | [render-model.ts:223](../../../../../../../D:/Policy%20PoC/src/lib/document-render-model.ts) |

Continuous or effectively continuous (cannot precompute; need snapping or a live path):

- Palette: 10 colour keys, each a free colour input ([theme-inspector.tsx:60-68](../../../../../../../D:/Policy%20PoC/src/components/builder/theme-inspector.tsx), [:517](../../../../../../../D:/Policy%20PoC/src/components/builder/theme-inspector.tsx)).
- Border width 0.5–6 pt in 0.5 steps (12 values), inset 5–20 mm in 1 mm steps (16 values) ([page-border-controls.tsx:18-19](../../../../../../../D:/Policy%20PoC/src/components/builder/page-border-controls.tsx)). Only 12 × 16 = 192 combinations, but they reach the output only through the margins (see §4).
- Font families ([theme-inspector.tsx:282-283](../../../../../../../D:/Policy%20PoC/src/components/builder/theme-inspector.tsx), list in [typography.ts:3](../../../../../../../D:/Policy%20PoC/src/lib/typography.ts), count not checked). Sizes: heading 10–24 step 1 (15), subheading 9–20 step 0.5 (23), body 8–16 step 0.5 (17) ([theme-inspector.tsx:285-287](../../../../../../../D:/Policy%20PoC/src/components/builder/theme-inspector.tsx)). Line spacing: no bounds read.
- Logo scale: `LogoScale = number | ...` ([types.ts:243](../../../../../../../D:/Policy%20PoC/src/lib/types.ts)). Snap to a grid to make it discrete.
- Cover text, feature image crop, and the AI cover.

## 2. Neighbourhood size and cost

Renders per settled state, if the whole one-step neighbourhood is pre-rendered:

| Control | Alternatives from current state | Output effect |
|---|---|---|
| Template | 7 | full reflow |
| TOC, ack, revision | 3 | page count shifts |
| Data treatment | 1 | section reflow |
| Density | 2 | full reflow |
| Alignment | 3 | text reflow |
| Logo alignment | 2 | header only (Chromium header template, [print-document.tsx:94-95](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx)) |
| SDG display | 1 | SDG section |
| Colour source | 1 | palette, cover |
| Border on/off, scope | 1 + 2 | margins; scope is pdf-lib only |
| List markers | 7 | list reflow |
| Cover variant, feature image | 2 | cover |

Total about 32 (about 29 if border scope is moved to a post-process stage, §5). *(inference)*

Constraints from the code:

- One render at a time per process. `withSerializedPdfRender` queues every render behind `pdfRenderQueue` ([print-document.tsx:14](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx), [:204-209](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx)).
- Each render launches a new persistent Chromium context with a fresh profile directory ([print-document.tsx:217](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx)), created via `createPdfContextWithTimeout` ([:161](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx)). That is a browser launch per render, not a warm page.
- The client debounces by 800 ms and fires on any `policy` identity change ([live-preview.tsx:10](../../../../../../../D:/Policy%20PoC/src/components/builder/live-preview.tsx), [:31-36](../../../../../../../D:/Policy%20PoC/src/components/builder/live-preview.tsx)).

Renders at R ≈ 1.5 s *(assumption; the parent report gives 1–2 s warm)*.

## 3. Speculation: what hover can and cannot buy

Primary sources:

- Chrome Speculation Rules `moderate` speculates after 200 ms of hover, or on pointerdown if sooner. `conservative` speculates only on press. Both allow 2 in flight, FIFO: a new one cancels the oldest. `immediate` allows 50 prefetches and 10 prerenders. Source: [Chrome, "Improvements to the Speculation Rules API"](https://developer.chrome.com/blog/speculation-rules-improvements).
- instant.page starts preloading after 65 ms of hover. The author argues that gives about even odds of a click, and that on average over 300 ms remains to preload (desktop) or about 90 ms (touch). These are the author's reasoning, not measurements. Source: [instant.page](https://instant.page/). Its `mousedown` option gives about 80 ms of lead time.
- I found no primary study of hover-to-click dwell for desktop mouse pointing. The closest, [arXiv 1611.01477](https://arxiv.org/pdf/1611.01477), is Android touch with two participants, and is not usable here. *(gap)*

Consequence: with R ≈ 1.5 s and a ~300 ms hover window, a hover-triggered render removes only the overlap, about 0.3 s, so about 1.2 s is still visible after the click. Speculation on hover reduces the wait; it does not make it instant. *(inference)*

Where speculation does pay off is when the user browses, not when they point:

- Opening the template gallery gives several seconds of dwell. Rendering the 7 other templates at once is about 10.5 s serialized, or about 4 s with 3 parallel workers. Most of that is hidden behind the user's browsing. *(inference)*
- Toggles are binary; a user flips one, then often flips it back. Keep the last few states warm (LRU).

## 4. Cache key

What determines the PDF bytes is the render model, not `policy`. The render path reads: `buildDocumentRenderModel` ([document-render-model.ts:185-258](../../../../../../../D:/Policy%20PoC/src/lib/document-render-model.ts)), `getRunningHeaderBrand` and `runningLogoFit` ([print-document.tsx:47-52](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx)), `pageMarginMm`/`pageHeaderMarginMm` ([page-geometry.ts:22-24](../../../../../../../D:/Policy%20PoC/src/lib/page-geometry.ts)), the cover raster key ([print-document.tsx:111-117](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx)).

Current keys, and what is wrong with them:

| Cache | Key | Problem |
|---|---|---|
| Server PDF LRU, size 4 | `JSON.stringify([cacheScope, normalizedPolicy])` ([generate.tsx:6-15](../../../../../../../D:/Policy%20PoC/src/lib/pdf/generate.tsx)) | Order-sensitive JSON; any field change misses, including fields that never reach output; 4 entries is tiny |
| Client PDF LRU, size 6 | `JSON.stringify([scope, key])` with `body` = whole policy plus tenant context ([pdf-policy-preview.tsx:18-19](../../../../../../../D:/Policy%20PoC/src/components/policy/pdf-policy-preview.tsx), [policy-preview-request.ts:13](../../../../../../../D:/Policy%20PoC/src/lib/pdf/policy-preview-request.ts)) | Same; typing in a disabled section changes the key |
| Custom cover LRU, size 8 | whole `model.theme`, typography, logo fields ([print-document.tsx:111-117](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx)) | A border colour change re-rasterises the cover (already noted in 01-codebase §3) |

Proposed canonical key K, built from the render model after normalisation:

- Resolved template ID (after `upgradeDocumentThemeId`), resolved typography, density, text alignment, data treatment.
- Resolved list formatting, only for lists that appear in enabled sections.
- Enabled sections and a hash of each one's content (`sectionHasContent`, [render-model.ts:189-191](../../../../../../../D:/Policy%20PoC/src/lib/document-render-model.ts)).
- TOC, acknowledgement, revision flags; SDG display; logo position.
- Logo: hash of the bytes, or the name if no logo. Logo scale only when a logo exists ([print-document.tsx:48-50](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx)).
- Margins as computed mm (not the raw border inputs). When the border is off, inset and width are irrelevant.
- Resolved palette (not the colour source). Background only if it reaches Chromium (see §5).
- Active cover variant plus a hash of the active composition, only when that variant is in use ([render-model.ts:223-225](../../../../../../../D:/Policy%20PoC/src/lib/document-render-model.ts)). Feature image hash, placement and crop.

Excluded (verified to be absent from the render path, unless marked):

- `customThemeName`: appears only in the theme library and saved-theme code, not in the render path (grep of `src`, [types.ts:251](../../../../../../../D:/Policy%20PoC/src/lib/types.ts), [theme-library.ts:59](../../../../../../../D:/Policy%20PoC/src/lib/theme-library.ts)).
- `brandColorSource` and `documentTheme` (alias): covered by the resolved palette and resolved template ID.
- Inactive cover composition (`coverComposition` or `aiCoverComposition`), and the inactive cover variant.
- Content of disabled sections; `revisionHistory` when revision is off.
- Acknowledgement fields (`employeeAcknowledgement`) when acknowledgement is off ([render-model.ts:234-249](../../../../../../../D:/Policy%20PoC/src/lib/document-render-model.ts)).
- `signatureUpdatedAt`, `authorSignatureDate` and the signature image unless a signed PDF is requested. Signed PDFs are not cached anyway ([generate.tsx:12-14](../../../../../../../D:/Policy%20PoC/src/lib/pdf/generate.tsx)).
- Raw quantitative input shape: key on `normalizePolicyQuantitative` output (already done at [generate.tsx:11](../../../../../../../D:/Policy%20PoC/src/lib/pdf/generate.tsx)).
- Tenant context (`policyCraftExportContext`) goes in the cache namespace, not in the content hash. Cover assets are resolved server-side from IDs ([cover-repository.ts:39-67](../../../../../../../D:/Policy%20PoC/src/lib/cover-repository.ts)), so two tenants can send identical bodies with different output. Keep the scope in the namespace. I did not verify what the server caller passes as `cacheScope`.

## 5. Two-stage split (paint controls without Chromium)

pdf-lib already applies page background, gradient, border stroke and the cover overlay after Chromium ([print-document.tsx:294-302](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx), 01-codebase §3). If those are truly outside Chromium's layout, then:

- Stage A (Chromium, expensive): keyed by K minus border colour, border scope, background (if pdf-lib-only).
- Stage B (pdf-lib, cheap): applies border colour/scope and background to cached stage-A bytes. This could run in the browser; pdf-lib is pure JavaScript, but I did not verify that it runs in this app's browser bundle. *(assumption)*

Two caveats I could not resolve from the code read:

- The article background variable (`--doc-page-background`, [policy-preview.tsx:102](../../../../../../../D:/Policy%20PoC/src/components/policy/policy-preview.tsx), per 01-codebase §4) may paint in Chromium as well, so background may not be pdf-lib-only.
- Logo alignment is in the Chromium header template ([print-document.tsx:94-95](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx)), so it stays in stage A.

## 6. Parallelism and server cost

Per active user (assumptions: 6 committed changes per minute; R = 1.5 s; one Chromium slot = 40 renders per minute):

| Strategy | Renders per user-minute | Slots per user | Hit rate |
|---|---|---|---|
| Today (one render per committed change) | ~6 | 0.15 | 0 (baseline) |
| Hover speculation, siblings of hovered control, cap 2 in flight, cancel on leave | ~24 | 0.6 | low; unmeasured; hover window < R |
| Gallery-open batch (7 renders per open) | ~7 per open; negligible on average | < 0.05 | high for template picks |
| Full one-step neighbourhood per settled state (~29 renders per change) | ~174 | ~4.4 | high, but unaffordable |

Parallelism: the global queue ([print-document.tsx:204-209](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx)) allows one render at a time. Replacing it with N warm workers, each rendering in a fresh Playwright `BrowserContext`, would remove the per-render browser launch. Playwright describes contexts as isolated and cheap to create, "equivalent to incognito-like profiles" ([Playwright docs](https://playwright.dev/docs/browser-contexts)). Note the existing persistent-context launch ([print-document.tsx:217](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx)) was adopted for recovery reasons (commit f4e9878, per the parent report). A warm pool needs health checks and a relaunch path.

Priority queue: committed user render > gallery batch > hover. Cancel stale speculative renders by closing their context, as `closePdfContext` already does ([print-document.tsx:106](../../../../../../../D:/Policy%20PoC/src/lib/pdf/print-document.tsx)). Chromium's own limit of 2 in flight, FIFO, is a precedent for the cap (see §3).

Cache size: count-based LRUs (4, 6, 8) are too small for toggle flipping. Use a byte budget per process. PDF size is unmeasured, so the budget is open. *(gap)*

## 7. Prior art (primary sources)

- Chrome Speculation Rules: speculation with eagerness levels, 2-in-flight FIFO caps, cancellation of the oldest. [developer.chrome.com/blog/speculation-rules-improvements](https://developer.chrome.com/blog/speculation-rules-improvements). Applies to URL navigations, not POST renders with a body, and I did not verify whether it can prefetch POST responses.
- instant.page: hover-triggered preload, 65 ms default, with stated trade-offs. [instant.page](https://instant.page/). Author reasoning, not measured.
- Typst: incremental compilation with comemo memoisation; all functions pure, so cached closure results can be reused. [typst docs/dev/architecture.md](https://github.com/typst/typst/blob/main/docs/dev/architecture.md). The doc does not describe the preview's recompute decision, so this is weaker evidence for the preview loop than for the compiler.
- Not searched: design tools (Figma, Canva, Overleaf) for their preview-caching behaviour. I did not find a primary source in this pass.

## 8. Recommendations and measurements needed

1. Measure R (warm, real templates), and hover-to-click for the Design controls in a real session. Everything above depends on these two numbers.
2. Replace the cache key with K (§4). This removes renders for edits to disabled sections and makes the 4-entry LRU hold useful states.
3. Batch-render the gallery templates on open, at low priority. Cheapest large win.
4. Only then consider the stage split (§5), after confirming the background and pdf-lib questions in §5.
5. Parallel warm workers (§6), with a priority queue and cancellation.
6. Do not precompute the full neighbourhood. It costs about 4 slots per active user.

Open items: the actual hover-to-click dwell, R under load, PDF byte size, whether `--doc-page-background` paints in Chromium, whether pdf-lib runs in the browser bundle, and what `cacheScope` the server caller passes.

## Sources

- Chrome, Improvements to the Speculation Rules API: https://developer.chrome.com/blog/speculation-rules-improvements
- instant.page: https://instant.page/
- Playwright, Browser contexts: https://playwright.dev/docs/browser-contexts
- Typst, architecture: https://github.com/typst/typst/blob/main/docs/dev/architecture.md
- Dwell-time study (touch, weak): https://arxiv.org/pdf/1611.01477
