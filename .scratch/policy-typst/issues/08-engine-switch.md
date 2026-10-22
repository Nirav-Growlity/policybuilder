# 08 Engine switch behind POLICY_PDF_ENGINE

Status: resolved
Type: task
Blocked by: 05, 06, 07

- `lib/typst/engine.ts`: add a warm policy compiler and template, an LRU and periodic `evictCache`, as for SOPs. The font list covers every pickable family.
- `lib/pdf/generate.tsx`: `POLICY_PDF_ENGINE=typst` routes to Typst; `chromium` (the default until sign-off) keeps today's path.
- `next.config.ts`: add `public/fonts/word/**` and `lib/typst/policy/**` to the `/api/export/pdf` trace includes.
- Update `lib/pdf/generate.test.ts`, `lib/pdf/layout.test.ts` and `lib/policycraft-export.render.test.ts` to run against both engines, or against Typst where they test layout.
- Add a `Server-Timing` header, as on the SOP preview route.

## Answer

- **Engine choice:** `lib/pdf/generate.tsx` reads `POLICY_PDF_ENGINE`. `typst` renders with `renderPolicyTypstPdf`; anything else, the default, keeps the Chromium path. `generatePdf` also takes an explicit `engine` (tests use it). The PDF cache key includes the engine, and signed PDFs are still never cached.
- **Warm compiler:** it stays in `lib/typst/policy/render.ts`, not `lib/typst/engine.ts`. That keeps the policy and SOP fonts and templates apart.
  - It loads every TTF in `public/fonts/word`. All 46 picker families and every Office alias resolve to one of them (checked with `typstFontFamily`).
  - It clears its virtual files after each render (the signature, ticket 07) and calls `evictCache(30)` every 20 compiles, as the SOP engine does.
  - Finished PDFs are cached by the existing LRU in `generate.tsx` (4 entries) rather than a second cache.
- **Route:** `/api/export/pdf` sends `Server-Timing: render;desc="<engine>";dur=<ms>`. `next.config.ts` traces `lib/typst/policy/**` for the route; `public/fonts/**` was already included.
- **Tests:** `lib/pdf/generate.test.ts`, `lib/pdf/layout.test.ts` and `lib/policycraft-export.render.test.ts` run every PDF case on both engines. All pass on both, except the layout "cover stays on page one" cases.
  - Those fail identically on both engines on an existing stale check: the reviewer designation on every page, which the footer no longer prints. With that one line removed, all 32 cases pass on both engines.
  - The bordered-footer test passes on Typst. On Chromium it still fails, as it did before (20 mm / 6 pt border).
- **Not checked here:** a signed-in run of the real route under `next dev`, since it needs a session. That's part of the browser check in ticket 09/10.
