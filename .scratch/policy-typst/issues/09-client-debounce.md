# 09 Shorter preview debounce

Status: ready-for-agent
Type: task
Blocked by: 08

With renders at about 0.3 s, lower `LIVE_PREVIEW_DEBOUNCE_MS` in `components/builder/live-preview.tsx` from 800 to 500 to match `SOP_PREVIEW_DEBOUNCE_MS`. Abort superseded preview fetches in `lib/pdf/policy-preview-request.ts`.

Verify in the browser: type in a section, then change a colour, and check the preview updates without flashing.
