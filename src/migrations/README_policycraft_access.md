# PolicyCraft access and manager invitations

For the complete testing-to-production sequence, use the [production rollout runbook](../../docs/policycraft-production-rollout.md). This file remains the detailed migration and SQL reference.

This migration is a deliverable for the database owner. The application agent must not run it, connect to MySQL, or edit the generated `db/db-types.ts` file.

## Preflight (read only)

Before applying `2026_10_create_policycraft_access.sql`, inspect the shared auth tables:

```sql
SHOW CREATE TABLE users;
SHOW INDEX FROM users;
SHOW CREATE TABLE account;
SHOW INDEX FROM account;
SHOW CREATE TABLE organizations;
SELECT LOWER(TRIM(email)) AS normalized_email, COUNT(*) AS accounts
  FROM users GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1;
SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('users', 'account', 'organizations');
```

Confirm that `users.email` prevents duplicate accounts under case-insensitive comparison, that `users.org_id` and `users.org_code` accept empty strings, and that `account` supports one credential account per user/provider. The generated Kysely types show `users.role`, `designation`, `mobile`, `active`, `is_deleted`, string `org_id`/`org_code`, nullable `password`, and generated timestamps. `account.id` and `createdAt` are generated; `account.updatedAt`, `account.accountId`, `providerId`, and `userId` are required. The app inserts new manager accounts as the shared nonprivileged role `user`, with empty org fields and no sites, then creates the Better Auth credential row in the same transaction when the invite is accepted. The generated Kysely types do not show unique indexes or check constraints. Stop and resolve any mismatch before applying the migration.

The new tables intentionally have no foreign keys into shared ESG tables. The checked-in PolicyCraft migrations do not define the shared `users` or `organizations` schemas, so types and engine constraints must be verified by the database owner.

Confirm all participating tables use InnoDB, case-insensitive email uniqueness is enforced by an index, and required columns accept the stated insertion defaults. New identities explicitly receive `is_super_admin = 0` and `site_ids = NULL`. Confirm those columns exist and accept these values; no privilege or site grant relies on a database default. Do not test empty organization fields by inserting live rows as a preflight step.

## Migration order

For an existing installation, verify earlier migrations are already recorded; do not reapply ALTER statements blindly. For a fresh installation apply, in order: `2026_09_create_policycraft_documents.sql`, `2026_09_create_policycraft_cover_assets.sql`, `2026_09_add_policy_type_to_policycraft_cover_templates.sql`, `2026_10_reset_policycraft_signatures.sql`, then `2026_10_create_policycraft_access.sql`. The single signature migration deletes existing signatures and creates one table scoped to user, organization, and policy; run it once with signature writes paused. The administrator bootstrap is a separate manual step after the access tables. Record filename, applied UTC time, operator, and verification result in your deployment migration ledger. No application startup path runs these SQL files.

## Apply and bootstrap

Apply `2026_10_create_policycraft_access.sql` manually. Then designate the first PolicyCraft administrator using [bootstrap_policycraft_admin.example.sql](./bootstrap_policycraft_admin.example.sql). Set its administrator email before running. The example resolves exactly one active account and inserts no row unless exactly one match is found.

Do not set or change `users.role`, `users.org_id`, or `users.org_code` to grant PolicyCraft access.

## Manual rollout and verification

1. Back up the database and run the preflight checks. Resolve duplicate case-insensitive emails or incompatible column/index definitions before proceeding.
2. Apply only `2026_10_create_policycraft_access.sql` through the database owner's normal migration process. This agent does not run it.
3. Verify the three tables and indexes exist with `SHOW CREATE TABLE policycraft_user_access;`, `SHOW CREATE TABLE policycraft_manager_organizations;`, `SHOW CREATE TABLE policycraft_manager_invitations;`, and `SHOW INDEX FROM policycraft_manager_invitations;`.
4. Run the bootstrap example for the intended active account. Check its reported match count is one, insert row count is one, and then run:

   ```sql
   SELECT a.user_id, u.name, u.email, a.role, a.status
     FROM policycraft_user_access a
     JOIN users u ON u.id = a.user_id
    WHERE a.role = 'admin';
   ```

5. Configure `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_EMAIL`, and `POLICYCRAFT_APP_URL` in the deployment environment before inviting new accounts. Use the SMTP host for your ZeptoMail account's region and a verified sender address. Port 587 requires STARTTLS; port 465 uses TLS. No ZeptoMail API key is required. Confirmed existing accounts receive manager access directly and need no SMTP configuration.
6. Deploy the app only after the tables and administrator designation are verified. Smoke test admin access, manager invitation delivery/acceptance, manager org assignment, and an attempted cross-org request. Review both DB row counts and app logs. A failed mail delivery remains listed and can be explicitly resent.

For verification counts, use `SELECT COUNT(*) FROM policycraft_user_access;`, `SELECT COUNT(*) FROM policycraft_manager_organizations;`, and `SELECT COUNT(*) FROM policycraft_manager_invitations;`. Do not infer successful mail delivery from an invitation row; check `delivery_status`.

## Add administrators after setup

Once the access migration and first-admin bootstrap have been applied, administrators can add other administrators in the application. Multiple active administrator grants are supported by the existing access table. No additional SQL or migration is required.

1. Sign in as the current PolicyCraft administrator and open **Administration**.
2. Enter the additional administrator's email in **New administrator email**, then choose **Find account**. An existing active manager is eligible. They need a working password login. For someone new, invite them as a manager and wait for acceptance. Resolve any pending manager invitation for the recipient before adding administrator access.
3. Check the displayed name and email. Choose **Add administrator**, enter your current password, then confirm.
4. You retain administrator access and stay signed in. The recipient signs in with their own existing email and password and receives administrator access. Promoting a manager replaces that account's PolicyCraft role with admin; its existing manager assignment records, shared ESG account details and policy attribution are preserved.
5. Verify both accounts can open the admin workspace. Existing invitations from you remain valid because you remain an active administrator. Enter another email to repeat the flow.
6. If a network interruption leaves the result unclear, look up the account again to verify its current access before retrying.

Disabled staff accounts cannot be selected as recipients. An account that already has administrator access is reported as such; it does not need another grant. Reactivating disabled staff accounts is outside this screen.

## Invitation mail configuration

Production manager invites use ZeptoMail with explicit server configuration: `MAIL_HOST` (the SMTP host for the account's region), `MAIL_PORT` (587 for STARTTLS or 465 for TLS), `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_EMAIL` (the verified sender address), and an HTTPS `POLICYCRAFT_APP_URL`. Development/test defaults to Mailtrap Email Sandbox using independent `MAILTRAP_*` settings; see the [local setup](../README.md#admin-and-manager-workspaces). `POLICYCRAFT_MAIL_PROVIDER=mailtrap|zeptomail` overrides the environment default; missing sandbox credentials never fall back to ZeptoMail. SMTP credentials remain server-side. `ADMIN_EMAIL` is not used as the sender or recipient of invitations. The app stores only a SHA-256 token hash. Tokens expire after 72 hours; resend replaces the token hash and expiry. A delivery failure remains visible for administrator retry.

New shared ESG user rows and credential accounts are created only when a new invite is accepted; the new user then signs in at `/login` with the password they selected. Existing-account access is granted directly after administrator confirmation and never changes the password, shared ESG role, or ESG organization fields. Existing active managers retain their assignments and gain the selected organizations; pending invitation links for that email are invalidated. Administrators and disabled accounts cannot be silently converted or reactivated. Legacy existing-account invitations still require the invited account's matching session when accepted.

The SMTP connection follows the [official ZeptoMail SMTP settings](https://help.zoho.com/portal/en/kb/zoho-cpaas/faqs/sending-emails/articles/how-to-configure-smtp). Configure the actual account's regional SMTP host rather than copying another deployment's host.

## Rollback (destructive; database owner only)

Disable the PolicyCraft deployment before rollback. The following removes all PolicyCraft manager assignments, access grants, and invitation history. It does not delete accepted manager identities or their shared Better Auth credential rows, because account reuse or activity cannot be inferred safely from PolicyCraft access alone. Retain an audited backup first and apply only after confirming these records are no longer needed:

```sql
DROP TABLE IF EXISTS policycraft_manager_invitations;
DROP TABLE IF EXISTS policycraft_manager_organizations;
DROP TABLE IF EXISTS policycraft_user_access;
```
