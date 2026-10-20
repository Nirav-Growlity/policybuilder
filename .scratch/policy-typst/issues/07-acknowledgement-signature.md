# 07 Acknowledgement and author signature

Status: resolved
Type: task
Blocked by: 04

- Professional acknowledgement: title at 18 pt, statement, 2-column fields with rules, filled values in the body font, and the `legal-form` boxed variant.
- Author signature image (max 180 × 44 px, bottom-left) from `AuthorApprovalRenderData`. It must never be cached or written to disk outside the shadow workspace (see `generatePdf`).

Check: the harness `acknowledgement-filled` case, plus a signed export from the Export step.

## Answer

`acknowledgement()` in `policy.typ` follows the professional rules (`policy-preview.tsx` 1076–1093):
- an 18 pt title;
- the statement at 1.22× line height;
- two equal columns with a 3.7 pt row gap;
- fields padded 6 × 7 pt, each with a 7 pt / 800 / 1.75 pt-tracked label, a 5 pt gap and an underlined 11 pt line, then 8.5 pt below (13 pt under the signature).

- **`legal-form` variant:** the professional collection overrides it with `!important` (padding, border and outline all reset), so every template prints the same plain form. Nothing to port.
- **Signature:** max 180 × 44 px, bottom-left on the rule. It only lives in the compiler's virtual files, which `render.ts` clears after every render. It is never cached (`addImage` in `model.ts`).

Harness (2026-10-20):
- New `acknowledgement-signed` case (author signature, standard-pack): 9/9 pages, 8/9 matching breaks; the acknowledgement page matches to within a pixel.
- `acknowledgement-filled`: the form now matches line for line. What's left there is ticket 11 (label weight 800; Source Serif optical size changes the statement's wrap and the page breaks).

Tests: `render.test.ts` checks that the signature image is embedded. The signed export from the Export step is checked with ticket 08, once the route can use Typst.
