# 07 Acknowledgement and author signature

Status: ready-for-agent
Type: task
Blocked by: 04

- Professional acknowledgement: title at 18 pt, statement, 2-column fields with rules, filled values in the body font, and the `legal-form` boxed variant.
- Author signature image (max 180 × 44 px, bottom-left) from `AuthorApprovalRenderData`. It must never be cached or written to disk outside the shadow workspace (see `generatePdf`).

Check: the harness `acknowledgement-filled` case, plus a signed export from the Export step.
