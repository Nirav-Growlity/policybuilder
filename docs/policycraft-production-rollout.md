# PolicyCraft production rollout runbook

Use this guide to move the admin, manager, and client-user workflow from testing to production. Complete the steps in order and keep a copy with the production deployment record.

The application code does not apply migrations automatically. **You or your database owner must run every production SQL change.** This guide does not authorize the application or an agent to change production data.

## 1. Prepare the release

- [ ] Finish code changes and review the release commit. Deploy the same reviewed commit that passed your staging checks.
- [ ] Run focused access checks from `src/`: `npm run test:access`.
- [ ] For the task workspace release, run `npm run test:tasks` and follow the [task rollout guide](policycraft-tasks-rollout.md). The database owner must apply and verify the additive task migration; legacy progress requires independently verified evidence or a fresh manager save.
- [ ] For PolicyCraft-only organizations, follow the [organization rollout guide](policycraft-organizations-rollout.md). The owner applies and verifies the registry migration before deploying; retain the explicit ESG mappings and review rollback compatibility after standalone records are created.
- [ ] Run the release TypeScript, lint, and production-build checks required by your team. A past full test run reported 23 existing cover-color/footer-layout failures; review the current result rather than assuming those failures are still present or resolved.
- [ ] Test the UI with the API-mocked scripts `node scripts/verify-access-ui.mjs` and `node scripts/verify-admin-add-ui.mjs`, plus `node scripts/verify-access-anonymous.mjs`. Start a local app first and use a writable screenshot directory. These tests do not validate production data or email delivery.
- [ ] Finish the live acceptance checks in staging: invitations, account linking, role restrictions, assignment revocation, shared policy editing, saves/conflicts, organization scoping, previews, and PDF/DOCX exports.
- [ ] Choose an existing, active shared account for the first PolicyCraft admin. Confirm the person can sign in and that their normalized email belongs to exactly one active `users` row.
- [ ] Decide the production origin and confirm the ZeptoMail sender/domain and regional SMTP host.

Do not use a production account for invitation, administrator-grant, or destructive-policy tests. Use dedicated staging accounts and organizations first.

## 2. Confirm the production target and make a backup

Before running SQL, connect using the production database owner's normal tool and verify the selected database and server:

```sql
SELECT DATABASE() AS selected_database, VERSION() AS mysql_version;
```

Compare the database name with the production change request. Never paste credentials into a ticket, terminal log, or this document. Take a restorable backup and record its identifier and time. Do not continue if the target is unclear or a recent backup cannot be restored.

## 3. Check production schema and existing emails

Run these read-only checks before deciding which migrations are missing:

```sql
SHOW CREATE TABLE users;
SHOW INDEX FROM users;
SHOW CREATE TABLE account;
SHOW INDEX FROM account;
SHOW CREATE TABLE organizations;

SELECT TABLE_NAME, ENGINE
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('users', 'account', 'organizations');

SELECT LOWER(TRIM(email)) AS normalized_email, COUNT(*) AS accounts
  FROM users
 GROUP BY LOWER(TRIM(email))
HAVING COUNT(*) > 1;

SELECT TABLE_NAME
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND (LOWER(TABLE_NAME) LIKE '%migrat%'
        OR LOWER(TABLE_NAME) LIKE '%schema%version%');
```

Confirm the shared tables use InnoDB; `users.email` has the case-insensitive uniqueness protection required by your identity policy; `users.org_id` and `users.org_code` can accept explicitly supplied empty strings; and Better Auth's `account` schema supports one credential row per user/provider. Check the shared super-admin and site columns before enabling invitation acceptance. Do not insert a test account just to check defaults.

Resolve duplicate normalized emails with the ESG/database owners before relying on email-based account linking or manager invitations. Do not delete or merge shared users without the account owner's decision. Confirm the selected first-admin email returns exactly one active, non-deleted account. If the schema or uniqueness behavior differs from the bootstrap SQL, stop and adapt the reviewed SQL to the production column collation before running it.

**Local inspection note (2026-10-03):** the app's local `esgtech` database had all PolicyCraft migration tables and 25 policies, but no PolicyCraft admin grants. It also had one normalized email shared by two active accounts, and `users.email` did not have a unique index. The local database had no migration-history table. These are local findings only; production must be checked separately. Do not assume the production schema or account data is the same.

## 4. Decide which migrations production needs

Use your deployment migration ledger if one exists. Record every filename, applied UTC time, operator, backup reference, and verification result. If there is no ledger, inspect the actual tables, columns, and indexes and reconcile that evidence with the SQL files before applying anything. A table's presence alone does not prove the correct definition.

For a fresh PolicyCraft database, apply the files in this order:

1. `src/migrations/2026_09_create_policycraft_documents.sql`
2. `src/migrations/2026_09_create_policycraft_cover_assets.sql`
3. `src/migrations/2026_09_add_policy_type_to_policycraft_cover_templates.sql`
4. `src/migrations/2026_10_reset_policycraft_signatures.sql` (one signature table, scoped to user, organization, and policy; deletes existing signatures)
5. `src/migrations/2026_10_create_policycraft_access.sql`
6. `src/migrations/2026_10_create_policycraft_organizations.sql` (registry cutover; follow the organization rollout guide)
7. `src/migrations/2026_10_create_policycraft_tasks.sql` (when deploying the task workspace)

For an existing database, apply only migrations that are confirmed missing. In particular, `2026_09_add_policy_type_to_policycraft_cover_templates.sql` uses `ALTER TABLE` and `CREATE INDEX`; do not run it again if those changes are already present. Stop if a migration is partly applied or its expected schema does not match. Have the database owner reconcile it instead of guessing or re-running SQL.

The single signature migration replaces both previous signature tables with `policycraft_user_signatures`, scoped to user, organization, and policy. It deletes all stored signatures each time it is run; run it once during the owner's deployment process with signature writes paused. These migrations do not change ESG users, organizations, or sites. Never grant PolicyCraft access by editing `users.role`, `users.org_id`, or `users.org_code`.

## 5. Apply the access migration and verify it

After backup and preflight, have the database owner apply `2026_10_create_policycraft_access.sql` through the approved production process, only if it is not already applied. Then confirm the tables and expected indexes:

```sql
SHOW CREATE TABLE policycraft_user_access;
SHOW CREATE TABLE policycraft_manager_organizations;
SHOW CREATE TABLE policycraft_manager_invitations;
SHOW INDEX FROM policycraft_user_access;
SHOW INDEX FROM policycraft_manager_organizations;
SHOW INDEX FROM policycraft_manager_invitations;

SELECT TABLE_NAME, ENGINE
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('policycraft_user_access',
                      'policycraft_manager_organizations',
                      'policycraft_manager_invitations');
```

All three tables must exist as InnoDB tables, with the definitions and indexes in the migration file. The app fails closed when required access tables are missing. Do not send production traffic to this release until schema verification passes.

## 6. Designate the first administrator

The first admin is an existing active shared account. This is a one-time PolicyCraft grant; it does not change that person's shared ESG role, password, organization, or sites.

1. Open `src/migrations/bootstrap_policycraft_admin.example.sql` from the release you are deploying. Do not use an old copy from a SQL editor tab.
2. Replace `<ADMIN_EMAIL>` with the chosen account's email. Inspect the email column collation with `SHOW FULL COLUMNS FROM users LIKE 'email';`. The checked-in bootstrap compares both values using `utf8mb4_general_ci`, which matches the local database inspected on 2026-10-03. If production uses a different email collation, have the database owner adapt both comparison clauses to that collation before running the script.
3. Run the bootstrap script once. Its `match_count` must be exactly `1`. Its `inserted_rows` must be exactly `1`. If either result differs, stop and inspect; do not try a manual alternate insert.
4. Verify the grant and identity:

   ```sql
   SELECT a.user_id, u.name, u.email, a.role, a.status
     FROM policycraft_user_access a
     JOIN users u ON u.id = a.user_id
    WHERE a.role = 'admin';
   ```

   Confirm the intended account is the active admin. If the script reports a collation error, you are likely running an old copy or the production column uses a different collation. Do not continue until the two email comparisons match that column's collation.

Do not designate a first admin by changing shared ESG account fields. Later administrators are added in the app and do not require a migration or bootstrap SQL.

## 7. Set production application configuration

Use your hosting provider's protected environment-variable store. Do not commit secrets or copy local `.env` values into production.

Required for the app and authentication:

- Database: either `DATABASE_URL`, or `HOST`, `USER_NAME`, `PASSWORD`, `DATABASE`, and optionally `DB_PORT`.
- `BETTER_AUTH_SECRET`: a strong production secret. Use the shared ESG secret only if that is required for the intended shared login/cookie compatibility.
- `NEXT_PUBLIC_BASE_URL` or `BETTER_AUTH_URL`: the exact HTTPS production origin used for auth callbacks and redirects.

Required before sending invitations to people without an existing account:

- `POLICYCRAFT_APP_URL`: the exact HTTPS PolicyCraft origin.
- `MAIL_HOST`: the ZeptoMail SMTP host for the account's region.
- `MAIL_PORT`: `587` for required STARTTLS or `465` for TLS.
- `MAIL_USERNAME` and `MAIL_PASSWORD`: the SMTP credentials.
- `MAIL_EMAIL`: the verified sender address, displayed as PolicyCraft.

Verify the sender domain with ZeptoMail and test delivery in staging. Production (`NODE_ENV=production`) defaults to ZeptoMail; leave `POLICYCRAFT_MAIL_PROVIDER` unset or set it to `zeptomail`. To capture staging invitations in Mailtrap instead, explicitly set that variable to `mailtrap` and configure the independent `MAILTRAP_*` sandbox settings from the [application setup](../src/README.md#admin-and-manager-workspaces). Sandbox capture does not verify production delivery. No ZeptoMail API key is required. `ADMIN_EMAIL` is not used for invitation delivery; the recipient is the manager being invited. The SMTP credentials are separate from the application's login credentials. Public signup remains disabled. Invitation links expire after 72 hours; resend invalidates the previous link.

Existing active accounts are granted manager access directly after administrator confirmation and keep their current password. This path does not send an invitation or require mail settings. For localhost tests, set `POLICYCRAFT_APP_URL=http://localhost:3000`; email delivery uses an outbound SMTP connection, but a localhost link can only be opened on the computer running the app.

## 8. Deploy in order

1. Confirm the production database target and backup one last time.
2. Confirm required migrations and the first admin grant have been verified.
3. Set and review production environment variables without printing secret values.
4. Deploy the reviewed application release.
5. Check startup and application logs for database, authentication-origin, and mail-configuration errors. Never include passwords, API keys, or invitation tokens in logs or support tickets.
6. Sign in as the first admin and confirm the admin workspace loads before inviting real managers.

## 9. Run production smoke checks

Start with the smallest safe checks, using dedicated test accounts where possible:

- [ ] The first admin can sign in and open Managers, Policies, and Administration.
- [ ] A new-account manager invitation reaches the intended test mailbox; the recipient can accept, choose a password, and sign in.
- [ ] After explicit administrator confirmation, an existing account gains manager access without an invitation email or password change. Its ESG organization details stay the same, and an existing manager's assignments are preserved while the selected organizations are added.
- [ ] Assign the manager to a test organization. The manager can work only in assigned organizations; another manager assigned to the same organization can see shared policies.
- [ ] A client user still reaches their existing organization workspace and cannot access another organization's policies.
- [ ] Removing a manager's assignment prevents subsequent reads and saves, including from a previously open tab.
- [ ] Admin policy filters, creator attribution, archive/restore, and permitted delete behavior work as intended.
- [ ] Test forged organization/document identifiers and stale-save conflicts using a safe test account.
- [ ] Verify private cover artwork and the current user's signature in preview, downloaded PDF, and a Word-rendered DOCX.
- [ ] Add administrator access in staging first: confirm the recipient account, current-password prompt and recipient login, and verify the acting admin stays signed in with active access. Confirm existing passwords, manager assignment records and outstanding invitations are preserved.

Do not use a real customer policy to test deletion or export changes. Record results and the test account IDs in the deployment record without storing passwords or invitation URLs.

## 10. Record the deployment and monitor

Record the release/commit, database name, backup reference, migration filenames and UTC times, bootstrap verification, environment names (not secret values), smoke-check results, and operator. Keep this record in your normal deployment ledger.

Review failed invitation deliveries in the admin UI and retry them explicitly. An invitation row alone does not prove that an email was delivered. Watch application/database logs for authorization denials, failed saves, and unexpected invitation acceptance errors. Keep an eye on the migration table/index verification and preserve the backup through your normal retention window.

## 11. Rollback and recovery

If the new release has a problem, stop invitations or take the application out of service while you investigate. Prefer rolling the application back to the last reviewed version that is compatible with the additive schema. Keep the new tables and data during an application rollback; do not drop them as an incident shortcut.

If a migration only partly applied, stop and have the database owner inspect the actual schema and backup before taking further action. Do not run the migration a second time by guesswork. The destructive `DROP TABLE` example in `src/migrations/README_policycraft_access.md` is for a planned full retirement only, after backups and explicit database-owner review.

If admin access is unavailable, do not edit shared ESG roles. Use the documented bootstrap only after verifying there is no active admin, the target email uniquely identifies one active account, and the database owner approves the grant. Record the recovery action.

## 12. Add administrators

After production is healthy, a current admin can add other administrators without SQL:

1. Open **Administration**, enter the additional admin's email, and select **Find account**.
2. Review the person's name and email. The person must have an active account and working password login. Invite a new person as a manager first, then wait for acceptance.
3. Select **Add administrator**, enter the current admin's password, and confirm.
4. The current admin retains access and stays signed in. The recipient signs in with their own existing account and password.
5. Verify both accounts can open the admin workspace. Invitations sent by the current admin remain valid.

Existing managers are eligible; their PolicyCraft role becomes admin and their assignment records remain intact. Adding an administrator does not change shared ESG identity fields or policy attribution. It uses the existing access tables; no new migration is needed.
