# 08 Engine switch behind POLICY_PDF_ENGINE

Status: ready-for-agent
Type: task
Blocked by: 05, 06, 07

- `lib/typst/engine.ts`: add a warm policy compiler and template, an LRU and periodic `evictCache`, as for SOPs. The font list covers every pickable family.
- `lib/pdf/generate.tsx`: `POLICY_PDF_ENGINE=typst` routes to Typst; `chromium` (the default until sign-off) keeps today's path.
- `next.config.ts`: add `public/fonts/word/**` and `lib/typst/policy/**` to the `/api/export/pdf` trace includes.
- Update `lib/pdf/generate.test.ts`, `lib/pdf/layout.test.ts` and `lib/policycraft-export.render.test.ts` to run against both engines, or against Typst where they test layout.
- Add a `Server-Timing` header, as on the SOP preview route.
