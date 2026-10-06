# Administrator handover implementation evidence

Historical report: the transfer behavior below was replaced on 2026-10-06 by adding administrators while retaining the acting administrator's access. See [the current validation report](./admin-add-validation.md) and [current setup instructions](../src/migrations/README_policycraft_access.md#add-administrators-after-setup).

Date: 2026-10-01. Base: `2948b0c082e9c18e96f0268e2b2cb0b5841538c8`. Changes remain uncommitted.

The request and dependent work items are recorded in `.scratch/admin-transfer/`. The architecture specialist provided a read-only impact map; the data specialist owned the workflow, repository, and API. The main agent integrated the change and implemented the UI because the UI specialist could not start within the agent thread capacity. The UI applies `frontend-skill` app guidance and was checked against `web-design-guidelines`.

## Delivered behavior

Administration lets the current administrator find an eligible existing account by email, review its identity, and confirm handover with their current password. A fresh server-authorized transaction locks access grants, rechecks both accounts, promotes the recipient, and disables the outgoing PolicyCraft grant atomically. Failure rolls back the promotion. Existing passwords, shared ESG roles, organizations, sites, assignments, and policy attribution are preserved. The outgoing browser clears its workspace scope and signs out; disabled access cannot fall back to client access.

Recipient validation rejects self-transfer, mismatched account/email, inactive/deleted accounts, disabled staff, unusable credentials, and pending manager invitations. A new person must complete a manager invitation first. Editing the email invalidates the reviewed account, stale lookup responses are ignored, and duplicate transfer submissions are guarded. Outstanding invitations from the outgoing administrator need explicit resend by the new administrator.

No additional schema migration is needed. The original access migration and first-admin bootstrap remain manual prerequisites; see `src/migrations/README_policycraft_access.md` for setup and subsequent handover steps.

## Checks performed

Commands ran from `src/` unless noted. No live database credentials or real mail delivery were used by tests.

| Check | Result |
| --- | --- |
| `npm.cmd run test:access` | 43/43 pass: original access/invitation/storage/export contracts plus handover/password regressions |
| `node --import tsx --test lib/policycraft-admin-transfer.test.ts lib/policycraft-password.test.ts` | 11/11 pass: password/recipient matching, stale/replayed/concurrent handovers, rollback, pending-invitation authority, and credential eligibility |
| `node node_modules/typescript/bin/tsc --noEmit` | Pass |
| Affected handover files with `node node_modules/eslint/bin/eslint.js` | Pass, no errors or warnings |
| `node node_modules/next/dist/bin/next build` | Pass. Better Auth warns that its base URL is not configured in this environment; configure the documented auth/application origins before rollout |
| `node scripts/verify-admin-transfer-ui.mjs` against local port 3000 | Pass: API-mocked desktop/mobile, lookup failure/stale response, changed-email invalidation, keyboard password entry, focus containment, cancellation, wrong-password recovery, successful transfer/signout/login acknowledgment, and no page errors |
| `node scripts/verify-access-anonymous.mjs` | Six protected generation/import/export/admin-transfer handlers deny anonymous requests before processing |
| `git diff --check` from repository root | Pass |

Desktop and 390 px mobile screenshots were inspected. Browser APIs are mocked and identities are synthetic. Transaction tests use a serialized in-memory port; they establish workflow behavior, not live MySQL locking or isolation guarantees. The production build initially hit a Windows worker-permission error inside the sandbox; the retry outside the locked sandbox account passed.

The full `npm.cmd test` run before the final two regression tests had 247 tests: 224 passing and 23 failing. These are the previously recorded cover-color and footer/layout expectation failures; the complete suite is not claimed green. See `docs/admin-manager-access-validation.md` for the original baseline findings and broader implementation evidence.

## Independent review

**Standards:** credential eligibility was tightened to supported SHA-256/bcrypt formats, shared authentication uses the same verifier, credential IDs use canonical string matching, and the browser fixture matches the API's 403 password failure. The final narrow re-review reported no remaining finding in these fixes.

**Specification:** pending-invitation errors now follow authoritative actor revalidation while preserving invitation-before-access lock order. A regression proves revoked actors cannot obtain that information during either lookup or transfer. The final narrow re-review reported no remaining finding in that path.

## Pending database-owner acceptance

After manually applying the original migration and configuring the environment, use real test accounts to check successful handover and recipient login, source revocation in already-open tabs, failed-password/mismatched-recipient rejection, concurrent handovers and transaction rollback, preservation of shared account fields and assignments, and resend/acceptance of invitations created by the outgoing administrator. Confirm the original organization, policy, private-artwork, signature, PDF, and Word-rendered export acceptance checks in the broader validation report.

No migration/bootstrap SQL, live account update, actual invitation delivery, deployment, or commit was performed during implementation.
