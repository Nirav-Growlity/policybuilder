# 09 Shorter preview debounce

Status: ready-for-human
Type: task
Blocked by: 08

With renders at about 0.3 s, lower `LIVE_PREVIEW_DEBOUNCE_MS` in `components/builder/live-preview.tsx` from 800 to 500 to match `SOP_PREVIEW_DEBOUNCE_MS`. Abort superseded preview fetches in `lib/pdf/policy-preview-request.ts`.

Verify in the browser: type in a section, then change a colour, and check the preview updates without flashing.

## Answer

- **Debounce:** `LIVE_PREVIEW_DEBOUNCE_MS` follows the engine: 500 ms when `POLICY_PDF_ENGINE=typst` (as `SOP_PREVIEW_DEBOUNCE_MS`), otherwise still 800 ms. Lowering it under Chromium would only queue more 2–6 s prints. `next.config.ts` passes `POLICY_PDF_ENGINE` through `env`, so client and server see the same value. It is fixed at build time: set it before `next build` or `next dev`.
- **Superseded fetches:** `requestPolicyPreview` takes a `signal`. Callers asking for the same preview share one fetch, which is aborted once none of them waits; the map entry goes with it, so an undo back to the same content starts afresh. `PdfPolicyPreview` aborts its request when a newer edit replaces it. Callers that pass no signal keep today's behaviour. Test: `components/policy/pdf-policy-preview.test.ts`.
- **Still to do (needs a signed-in browser):** with `POLICY_PDF_ENGINE=typst` on the dev server, type in a section, then change a colour, and check the preview updates without flashing. Also export a signed PDF from the Export step (left over from ticket 07).
