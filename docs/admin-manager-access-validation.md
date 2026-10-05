# Admin, manager, and client-user implementation evidence

Date: 2026-10-01. Base: `2948b0c082e9c18e96f0268e2b2cb0b5841538c8`. Changes are uncommitted.

The subsequent in-app administrator handover and latest 43-test access run are recorded in [admin-transfer-validation.md](./admin-transfer-validation.md).

The approved specification and dependent work items are recorded in `.scratch/admin-manager-access/`. The architecture, backend, builder UI, document output, and independent review work used separate subagents with explicit ownership. UI implementation applied `frontend-skill` app guidance and reviewed affected controls against `web-design-guidelines`.

## Implemented behavior

- One login routes administrators, managers, and existing client users to their workspaces. Staff grants are separate from shared ESG roles and organization membership.
- Administrators manage managers, invitations, assignments, status, and policies across organizations. Organization, creator, policy-type, and archive filters preserve historical attribution.
- Managers create, edit, export, and archive shared policies in currently assigned available organizations. Restore and permanent deletion are not manager permissions. Existing client-user archive, restore, delete, and versioned-save contracts are preserved.
- Server authorization bypasses the session cookie cache and checks account status, staff status, organization availability, document organization, and current assignments. Disabled staff cannot use client fallback. Deleted organization history is read-only; administrators retain access to expired organizations.
- Invitations use 72-hour hashed single-use tokens, explicit existing-account linking, transactional activation, resend/cancel, and visible delivery failures. New shared identities have ordinary role `user`, empty organization fields, `is_super_admin = 0`, and no site grants.
- Browser storage, private artwork, PDF request/cache identities, and export hydration carry actor/organization scope. Current actor signatures are used. Pending-save navigation failures keep the editor open.

## Validation performed

Commands below run from `src/` unless stated otherwise. No database or live mail credentials were used by tests.

| Check | Result |
| --- | --- |
| `npm.cmd run test:access` | 32/32 passing: permissions, selectors/origins, invitation acceptance/linking/replay/rollback, delivery adapter, storage isolation, export guards, actual PDF/DOCX generation, and existing document request contracts |
| `node --import tsx --test --test-force-exit lib/policycraft-autosave.test.ts components/policy/pdf-policy-preview.test.ts lib/policycraft-invitation-mail.test.ts` | 8/8 passing: serialized/coalesced saves, failed-save flush, scoped preview deduplication/invalidation, uncached signature previews, and mail adapter configuration/failure |
| `node node_modules/typescript/bin/tsc --noEmit` | Passing |
| `node node_modules/eslint/bin/eslint.js <all affected tracked and new TS/TSX/MJS files>` | No errors; five existing native-image warnings in policy previews. Latest document/manager/mail/browser files separately pass with no warnings |
| `node node_modules/next/dist/bin/next build` | Passing; environment emits Better Auth base-URL configuration warnings. Configure the documented application/auth origins before rollout |
| `node scripts/verify-access-anonymous.mjs` against local port 3000 | All five generation/grammar/import/export handlers return 401 before anonymous body/private-data processing |
| `node --import tsx scripts/verify-access-ui.mjs` with port 3000 and a writable screenshot directory | Passing API-mocked desktop/mobile, manager assignment revocation, accessible dialog keyboard containment, existing-account linking, organization selection, failed-save history navigation, successful-save navigation, and beforeunload protection; no page errors |
| `git -c core.safecrlf=false diff --check` from repository root | Passing |

The browser checks intercept application APIs and use synthetic identities. Screenshots were inspected at desktop and 390 px mobile widths. For the same-document Back check, the fixture preserves real Next history metadata; full-document navigation separately checks the browser beforeunload dialog. These checks do not establish live database acceptance.

The export render test resolves injected private artwork and the current actor's signature through the actual PDF and DOCX generators. PDF image operators contain the signature and full-page artwork; the DOCX package contains the exact signature PNG and full-page cover artwork. This is generated-file inspection, not a Word-rendered visual acceptance test.

An earlier full `npm.cmd test` run had 208 passing and 23 failing tests out of 231 before the final focused tests were added. Failures concern existing cover-color and document footer/layout expectations. Representative failures reproduce against unchanged HEAD renderer sources; document layout/content generation was not changed to address unrelated baseline failures. The full suite is not claimed green.

## Independent reviews

**Standards:** the read-only review identified browser caching on private cover assets after revocation. Responses now use `private, no-store`; generated database types were not edited, and migration execution remains manual.

**Specification:** the read-only review identified unguarded generation/import handlers and pending-save Back navigation. Fresh organization authorization now protects those handlers, and browser history/reload guards pass mocked checks. A final review found document mutation contract regressions; legacy archive flags, client restore/delete, and returned saved versions are restored and covered by focused contract tests. Manager controls now match API permissions. Final narrow re-review reported no remaining mismatch.

Automatic approval review rejected expanding managers to restore and permanently delete policies because the plan explicitly reserves full CRUD for administrators. The safer implementation removes those manager controls and retains administrator capabilities and preexisting client-user rights.

## Manual rollout and pending acceptance

Only the database owner runs migration or bootstrap SQL. Follow `src/migrations/README_policycraft_access.md`: inspect shared schemas and indexes, verify normalized email uniqueness and InnoDB, verify empty organization defaults, apply the dated additive migration, then set the chosen existing administrator email in the separate bootstrap example. Record the application in the deployment migration ledger. No SQL, account provisioning, real invitation delivery, commit, or deployment was performed by the agents.

After applying the migration and configuring ZeptoMail/application origins, verify real new-account and matching-account invitation acceptance, resend invalidation, cancellation, expiry/replay, delivery retry, duplicate-email races, inactive accounts/inviters, and preservation of shared ESG account fields. Verify manager assignment revocation from an already-open tab, forged organization/document IDs, shared editing and stale lock-version conflicts, expired/deleted organizations, and cross-account media/cache isolation using real accounts. Confirm private artwork and current-user signatures in live previews, downloaded PDF, and Word-rendered DOCX.

## 2026-10-03: existing-account grants and SMTP onboarding

The user's revised workflow grants manager access to confirmed existing active accounts directly. These grants do not send invitations, require SMTP settings, create credentials, or modify shared user fields. Existing managers retain their active organization assignments and gain the selected organizations. Grants compare the reviewed account ID inside a transaction, cancel pending invitation links, and reject administrator/disabled accounts and unavailable organizations. New accounts continue to receive 72-hour password-setting invitations through ZeptoMail SMTP using the existing `MAIL_*` environment variables.

The invitation page now reads the API's `{ invitation }` response. New-account acceptance records account creation, signs out any prior session, and opens manager sign-in with a full navigation. A failed session cleanup shows the successful creation state and a retry that only repeats cleanup/navigation, never the consumed invitation POST.

Validation from `src/`: `npm.cmd run test:access` passed all 56 tests, including nine direct-grant/onboarding tests and five mocked SMTP adapter tests. The two new workflow test files are registered in both the default and access test commands. The final API-mocked browser fixture (`node --import tsx scripts/verify-access-ui.mjs`, using localhost:3000 and the writable artifact directory) covers existing-account confirmation/direct grant, new-account password creation while an administrator is signed in, failed sign-out followed by retry without a duplicate invitation POST, and adjacent workspace interactions. Desktop grant/password/cleanup-retry screens and the 390px manager form were inspected. Tests do not establish live MySQL transaction behavior or real email delivery; no database writes or emails were performed.

Final local TypeScript (`node node_modules/typescript/bin/tsc --noEmit --pretty false`), focused ESLint on all affected application/test/fixture files, fixture syntax, and production build (`node node_modules/next/dist/bin/next build`) pass. The build still emits the existing Better Auth base-URL configuration warning. Repository `git diff --check` passes. The unrelated full-suite baseline failures recorded above remain outside this change; the full suite is not claimed green.

Independent code-review axes used working-tree changes against `05135bc55bafd058ecacc3208514bb8e60dc54e8`. Standards found no hard violation and suggested a nonblocking future deduplication of the locked shared-account lookup. Specification found the prior-session handoff issue; the final fix and regression fixture passed its re-review, with no remaining finding in that flow. The acceptance UI also passed the affected-file Web Interface Guidelines review.

Local SMTP checks successfully connected to `smtp.zeptomail.com:587` and completed STARTTLS. The effective Next.js development environment contains all five `MAIL_*` values, but authenticated verification returned `EAUTH` (SMTP 535), including a separate LOGIN-method check. The user is checking/updating their SMTP credentials. No credentials or provider response text were printed, and no message was sent.

### Follow-up: resend SMTP failure diagnostics

The reported generic delivery error was reproduced with injected SMTP errors: two new diagnostics regression cases failed before the fix. The adapter now maps allowlisted Nodemailer codes to static explanations and retains only a numeric 400–599 SMTP status. It drops raw messages/responses, AUTH commands, credentials, addresses, invitation links and the original error cause. Unknown error codes remain generic. Invitation persistence, HTTP response semantics and direct existing-account grants are unchanged.

`node --import tsx scripts/verify-invitation-smtp.ts` checks the same application SMTP configuration using `verify()`, without sending a message. It loads Next.js environment files, bounds the diagnostic to 25 seconds and reports safe errors. A fresh network-enabled check returned `EAUTH; SMTP 535`: current credentials are rejected before sender/recipient acceptance can be checked. All five effective SMTP variables came from `src/.env`. No email or database mutation was performed. Update credentials from the ZeptoMail Agent's SMTP tab and restart the application before retrying. HTTP 200 for resend records the request outcome; clients must also inspect `delivery.sent`.

Focused mail regression tests pass 8/8; `npm.cmd run test:access` passes 59/59. Local TypeScript, affected-file ESLint, production build and `git diff --check` pass. The build retains the existing Better Auth base-URL warning. No browser checks were needed for this mail-only diagnostic change.

Independent review of the working changes against `c490761c423c5c996b5144eb3f7bd25b77685c67`: Standards reported zero hard violations and zero actionable smell findings. Specification reported zero findings; safe error handling, verification without sending mail, environment loading and existing workflow preservation match the scoped requirements.

After the user confirmed the credentials were correct, further checks showed that Next.js loads all five SMTP values unchanged from `src/.env`, with no edge whitespace, invisible control characters or dollar expansion. The configured host/port is `smtp.zeptomail.com:587` and the username is the standard ZeptoMail username. One explicit LOGIN-method verification also returned `EAUTH; SMTP 535`, without sending email. This rules out the checked parsing/override problems and shows that changing the authentication method did not resolve this failure; it does not establish that the account is enabled or that the username/password pair is accepted.

Zoho's [SMTP error reference](https://www.zoho.com/zeptomail/help/api/smtp-error-codes.html) lists expired/blocked credits and a blocked account, as well as invalid credentials, as causes of 535. Its [SMTP setup guide](https://www.zoho.com/cpaas/help/smtp-home.html) requires a generated shorter password to use the From address or its generated username. The error text and README now include these checks; the earlier credential-only diagnosis was too narrow. Focused mail tests pass 8/8 and affected-file lint passes after this text correction. Account/credit status and whether a shorter password is in use remain unverified.

### Follow-up: local Mailtrap sandbox and production ZeptoMail (2026-10-05)

A fresh network-enabled `node --import tsx scripts/verify-invitation-smtp.ts` from `src/` reproduced `EAUTH; SMTP 535` before submitting any email. The restricted-network invocation timed out; that timeout was a ZeptoMail diagnostic, not a Mailtrap result. Authentication failure does not test invitation-link content or establish a localhost restriction. Provider requirements and source links are recorded in [the investigation](invitation-mail-providers-research.md).

The mail adapter now defaults production to ZeptoMail using the existing `MAIL_*` configuration, and other environments to Mailtrap Email Sandbox using independent `MAILTRAP_*` configuration. `POLICYCRAFT_MAIL_PROVIDER` supports an explicit provider override. Sandbox credentials never fall back to ZeptoMail; its host must be `sandbox.smtp.mailtrap.io`. Ports 2525/587 require STARTTLS and 465 uses implicit TLS. Provider errors retain static, credential-safe diagnostics. Invitation persistence, tokens, acceptance, existing-account grants and authorization paths were not changed. No database, credential files, or live email were changed.

Validation from `src/`:

- `npm.cmd run test:access`: 67/67 passed, including all 16 focused mail cases.
- `node --import tsx --test lib/policycraft-invitation-mail.test.ts`: 16/16 passed; five new provider-selection regressions failed before the implementation. `npx eslint lib/policycraft-invitation-mail.ts lib/policycraft-invitation-mail.test.ts`: passed.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false --target ES2017 --lib dom,dom.iterable,esnext --module esnext --moduleResolution bundler --esModuleInterop --skipLibCheck --strict lib/policycraft-invitation-mail.ts lib/policycraft-invitation-mail.test.ts scripts/verify-invitation-smtp.ts`: passed.
- Full-project `node node_modules/typescript/bin/tsc --noEmit --pretty false`: blocked by malformed generated `.next/dev/types/validator.ts` at lines 251/256; the file contains a truncated `nds RouteHandlerConfig` fragment. This generated file was left unchanged.
- Default `node --import tsx scripts/verify-invitation-smtp.ts`: correctly reports missing `MAILTRAP_*` settings before connecting. The user has a Mailtrap sandbox and will add its credentials locally; live sandbox authentication, message capture and acceptance remain unverified.
- `git diff --check`: passed (line-ending conversion notices only).

Subsequent live Mailtrap check: after the user added sandbox settings and reported the diagnostic's 25-second timeout, two network-enabled invocations of `node --import tsx scripts/verify-invitation-smtp.ts` passed connection, TLS and authentication (exit 0). A safe environment summary confirmed provider `mailtrap`, host `sandbox.smtp.mailtrap.io`, and port 587 without displaying credentials. The timeout was not reproduced and its cause remains undetermined. No email was sent; captured-message and invitation acceptance checks remain pending. No application/configuration changes were needed for these successful checks.

### Follow-up: branded email and cancellation confirmation (2026-10-05)

The user confirmed Mailtrap capture works. Invitation HTML now uses PolicyCraft's forest/cream palette, a constrained responsive table layout, clear heading, primary accept button, 72-hour expiry and a wrapped fallback URL. Inline styles and system-font fallbacks avoid remote assets. Plain-text copy remains available; recipient names and URLs are escaped in HTML. `node --import tsx scripts/preview-invitation-email.ts` renders a synthetic message from the real sender seam through a mock transport. Desktop and 390px mobile screenshots were inspected and fit without overflow. Actual email-client rendering remains distinct from browser preview; resend generates the updated email.

The original `node scripts/verify-invitation-ui.mjs` reproduction failed: clicking the confirmation submitted no PATCH (`actual: []`). Confirmation cleared the target and called the same action that opened it, reopening the dialog. A dedicated cancellation submit now sends the existing API's `action: "cancel"`, shows a disabled/spinner state, retains an inline retryable failure, and closes/reloads on success. The existing API/repository cancellation and cancelled-token checks were retained. No live invitation was cancelled during verification.

Final validation from `src/`:

- `npm.cmd run test:access`: 67/67 passed, including provider selection, escaped mail content, invitation acceptance/cancelled tokens, existing-account grants, authorization and exports.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: passed. The earlier generated-validator error was absent in this run.
- `node node_modules/eslint/bin/eslint.js scripts/verify-invitation-ui.mjs scripts/preview-invitation-email.ts app/admin/page.tsx lib/policycraft-invitation-mail.ts lib/policycraft-invitation-mail.test.ts`: passed.
- `node scripts/verify-invitation-ui.mjs` with `POLICYCRAFT_UI_OUTPUT` pointing to this chat's allowed visualizations folder: passed. All application APIs are mocked. Resend delivery failure stays independent; opening/Keep/Close/Escape submit no cancellation; failed cancellation is retryable; pending confirmation prevents dismissal/repeat submission; successful confirmation removes the row; a second round verifies mobile confirmation/submission at 390px. Screenshots disable finite animations for a settled frame. The default screenshot folder returned a permissions error in one environment, so the output override was used.
- `node --import tsx scripts/preview-invitation-email.ts`: passed; no email sent. Synthetic HTML, text and desktop/mobile images are retained in this chat's `email-preview` artifact folder.
- Affected-flow Web Interface Guidelines review: passed. `git diff --check`: passed, with line-ending advisories only.
