# Add PolicyCraft administrators

Requested 2026-10-06: replace administrator transfer with adding another administrator. An existing manager account must be eligible. The acting administrator keeps access and remains signed in.

Administration looks up one existing active account by email, reviews the account, and confirms the additional admin grant with the acting administrator's current password. New people use the existing manager invitation onboarding before they can receive admin access. Existing passwords and shared ESG user fields are unchanged. An existing manager becomes an admin while its assignment records remain intact. Other admins, policies, creator attribution, and outstanding invitations remain unchanged.

Retain fresh server admin authorization, JSON/trusted-origin mutation guards, transactional actor revalidation, exact reviewed account ID and normalized email binding, pending-invitation safety, and unavailable/deleted/disabled/passwordless account rejection. Already-admin recipients receive an informative error. Concurrency may create several authorized administrators; it must never disable the actor or mutate another admin's grant. Old transfer requests are rejected.

Fix the confirmed lookup defect: the credential.userId = CAST(users.id AS CHAR) join fails with ER_CANT_AGGREGATE_2COLLATIONS when the stored string and cast use different collations. Preserve canonical string identity matching with a collation-safe comparison; numeric coercion must not link noncanonical IDs.

Use existing access tables; no new migration is required. Do not execute account writes, migrations, invitations, commits, or deployment. Diagnosis and verification may use read-only SELECT queries without printing credentials or personal account data.

Preserve PolicyCraft cream/forest layout, responsive controls, form labels, keyboard focus and accessible confirmation/success states. Edited email invalidates the reviewed account, stale lookup responses are ignored, duplicate requests are prevented, and success allows adding another administrator without logout, scope clearing or navigation away.

Validate focused workflow/security regressions and adjacent access tests, affected-file lint, TypeScript, browser-verifier syntax, and read-only SQL diagnosis/fix. Browser execution and real-account acceptance are not required for this implementation.
