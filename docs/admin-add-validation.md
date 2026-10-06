# Additional administrator validation

Date: 2026-10-06. Changes are local and uncommitted.

## Delivered behavior

Administration now finds an existing active account and adds administrator access after the acting administrator confirms with their current password. Existing active managers are eligible. The acting administrator and other administrators retain their access; the browser stays in Administration with its workspace scope intact and can immediately add another account. An existing manager's PolicyCraft role becomes admin while its assignment records remain intact. Shared ESG identity fields, passwords, policies and attribution are unchanged.

The API accepts `lookup` and `add`; old `transfer` requests are rejected. The add response is `{ added: true, recipient }`. Fresh admin authorization, trusted-origin/JSON guards, locked actor revalidation, reviewed account/email binding, credential eligibility and pending-invitation safeguards remain. Already-active admins receive `ALREADY_ADMIN` (409) during lookup or add. Failed and duplicate/concurrent requests do not disable or overwrite existing admin grants.

No new migration is needed: the existing access table supports one grant per user and multiple users with active admin roles. New people continue through existing manager invitation onboarding before receiving administrator access. No database account changes, migration execution, mail, deployment or commit were performed.

## Confirmed lookup defect

The screenshot's generic error occurred during account lookup. Read-only queries against the configured database reproduced `ER_CANT_AGGREGATE_2COLLATIONS`, comparing `utf8mb4_0900_ai_ci` with `utf8mb4_general_ci`. The failing comparison was `credential.userId = CAST(u.id AS CHAR)`; the user-email and credential-provider predicates passed independently.

The shared selector now uses `BINARY credential.userId = BINARY CAST(u.id AS CHAR)`. This avoids implicit text-collation conflicts while preserving exact canonical string identity. Both the actor-by-ID and recipient-by-email repository queries share the repaired selector.

The final SELECT-only diagnostic imported the actual selector from `policycraft-admin-add-sql.ts`: recipient lookup passed with exactly one match, and the entered account passed active-manager and usable-password eligibility. No hashes or personal account details were printed. The temporary diagnostic was removed after verification.

## Validation

Commands ran from `src/` unless stated otherwise.

| Check | Result |
| --- | --- |
| `npm.cmd run test:access` | 75/75 passed, including admin-add workflows, password/identity validation, manager promotion, retained admin grants, concurrent duplicate grants, rollback and adjacent access/invitation/assignment/export behavior |
| `node node_modules/eslint/bin/eslint.js app/admin/administration/page.tsx app/login/page.tsx app/api/policycraft/admin/administrator/route.ts lib/policycraft-admin-add.ts lib/policycraft-admin-add-repository.ts lib/policycraft-admin-add-sql.ts lib/policycraft-admin-add.test.ts scripts/verify-admin-add-ui.mjs scripts/verify-access-anonymous.mjs` | Passed |
| `node --check scripts/verify-admin-add-ui.mjs` and `node --check scripts/verify-access-anonymous.mjs` | Passed |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | No errors in changed files; full check reports existing TS7023/TS2352 errors at lines 10 and 16 of unchanged `lib/policycraft-login-regression.test.ts` |
| `git -c core.safecrlf=false diff --check` from repository root | Passed |
| SELECT-only diagnostic of the actual repository selector | Passed against the mixed-collation database; entered manager account is eligible |

The Administration form was reviewed against frontend-skill app guidance and Web Interface Guidelines. It preserves responsive controls, labels, keyboard focus, modal semantics, reduced-motion spinners and live status/error announcements. Success and failed confirmation restore focus after controls become available. The renamed API-mocked browser fixture covers stale lookup, wrong passwords, existing-admin guidance, duplicate submits, retained session and adding another account, but was only syntax checked in this run.

No browser execution or production build was performed. Workflow tests use a serialized in-memory port and do not prove live MySQL write isolation or rollback. Real-account add confirmation and recipient login remain manual acceptance checks; read-only SQL verification establishes the lookup fix only.

Suggested commit: `feat: add administrators without transferring existing access`
