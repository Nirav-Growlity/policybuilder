# PolicyCraft organization rollout

1. Run the release checks from `src/` and review the organization migration.
2. During a maintenance window, stop PolicyCraft traffic and ESG organization creation, confirm the database target and take a restorable backup.
3. Run the read-only compatibility checks below, then apply `src/migrations/2026_10_create_policycraft_organizations.sql` yourself.
4. Verify the registry mappings, deploy the reviewed application, and complete the real-account checks below before restoring traffic.

Migration execution is owner-only. Application code writes new profiles, mappings and logos to PolicyCraft-owned tables; it does not create or change shared ESG organizations or sites.

## Compatibility preflight

Confirm the existing draft, cover asset/template and access migrations are installed. Apply the task migration before using the task workspace. Check definitions rather than assuming a table name proves the expected schema:

```sql
SELECT DATABASE() AS selected_database, VERSION() AS mysql_version;
SHOW CREATE TABLE organizations;
SHOW CREATE TABLE policycraft_documents;
SHOW CREATE TABLE policycraft_manager_organizations;
SHOW CREATE TABLE policycraft_cover_assets;
SELECT TABLE_NAME
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('policycraft_organizations', 'policycraft_tasks',
                      'policycraft_manager_progress', 'policycraft_task_events');

SELECT d.org_id, COUNT(*) AS documents
  FROM policycraft_documents d
  LEFT JOIN organizations o ON o.id = d.org_id
 WHERE o.id IS NULL GROUP BY d.org_id;
SELECT m.org_id, COUNT(*) AS assignments
  FROM policycraft_manager_organizations m
  LEFT JOIN organizations o ON o.id = m.org_id
 WHERE o.id IS NULL GROUP BY m.org_id;
SELECT a.org_id, COUNT(*) AS assets
  FROM policycraft_cover_assets a
  LEFT JOIN organizations o ON o.id = a.org_id
 WHERE o.id IS NULL GROUP BY a.org_id;
SELECT t.org_id, COUNT(*) AS templates
  FROM policycraft_cover_templates t
  LEFT JOIN organizations o ON o.id = t.org_id
 WHERE o.id IS NULL GROUP BY t.org_id;
```

The orphan checks apply **before the initial registry migration**. After standalone organizations exist, their IDs intentionally do not match ESG rows. Also reconcile pending invitation organization IDs and task/progress/event organization IDs if those tables exist. Stop and investigate orphan references before initial seeding; do not silently remap policies to another organization.

Existing ESG mappings retain their numeric IDs at initial cutover. After cutover, all new registry IDs are allocated independently. A new ESG organization may have the same raw ID as a standalone registry row; the explicit ESG source mapping keeps them separate. Existing ESG names, company fields, sites, deletion and expiry continue to come from their live master records.

## Verify the initial seed

Before enabling the new application, verify the completed seed and confirm that every existing ESG organization maps to its original ID. The second query must return zero rows at initial cutover; after new ESG organizations are registered, their canonical IDs intentionally may differ.

```sql
SHOW CREATE TABLE policycraft_organizations;
SHOW CREATE TABLE policycraft_organization_profiles;
SHOW INDEX FROM policycraft_organizations;
SELECT marker, completed_at FROM policycraft_organization_migration_state;
SELECT o.id AS esg_id, pco.id AS policycraft_id, pco.source
  FROM organizations o
  LEFT JOIN policycraft_organizations pco ON pco.esg_org_id = o.id
 WHERE pco.id IS NULL OR pco.source <> 'esg' OR pco.id <> o.id;
SELECT source, COUNT(*) AS organizations
  FROM policycraft_organizations GROUP BY source;
```

Confirm the `initial_esg_seed_complete` marker is present. If the seed was interrupted or mappings disagree, keep application traffic stopped and reconcile the migration with the database owner. Do not mark it complete manually to bypass the check. Once seeding is complete, rerunning the migration must not reseed newly created ESG rows using their raw IDs.

## Manual acceptance

- As an admin, create a PolicyCraft organization with all required fields, logo and site; confirm no shared organization or site row was created.
- Confirm creation assigned nobody. Assign one manager using the existing manager workflow, including invitation acceptance for a genuinely new account.
- Confirm the assigned manager can edit the profile and create/resume policies; another manager and a regular client user cannot retrieve the profile, policies, logos, templates, or exports through direct requests.
- Create a normal policy and a task-started policy. Check all company details, reporting period, sites and logo, including rendered PDF/DOCX output.
- Edit the profile and replace its logo. A new policy uses the new defaults; old policies and exports retain the saved company details and old logo.
- Open the same profile in two sessions. The second stale save must report a conflict, preserving the first save.
- Revoke the manager assignment and confirm subsequent profile, policy, asset and task requests are denied.
- Verify existing ESG client users, manager assignments, invitations, policies, company bootstrap and tasks still work.

Code/mocked checks do not establish live database or rendered-document acceptance. Browser verification remains manual for this release.

## Implementation verification (2026-10-06)

Commands ran from `src/`:

- `npm run test:organizations`: 39 passed, covering required profile/site fields, source collisions, manager authorization and revocation, stale edits, atomic creation rollback, logo processing and task bootstrap.
- `npm run test:access`: 68 passed, including assignment, invitation, client-scope, asset and export checks.
- `npm run test:tasks`: 27 passed, including both organization sources and preservation of a previously started task's company snapshot.
- Affected-file ESLint and `git diff --check`: passed.
- `node node_modules/typescript/bin/tsc --noEmit`: passed, including the added tests. An intermediate invocation encountered a malformed `.next/dev/types/validator.ts` while the running development compiler regenerated it; a source-only check passed, and the final ordinary invocation passed after regeneration completed. The production build's TypeScript check also passed.
- `node node_modules/next/dist/bin/next build`: passed with an unreachable dummy database address. Build logs warned that Better Auth's base URL was unset in this environment.
- `node scripts/verify-organizations-anonymous.mjs`: passed against the existing local development server without account cookies. All four operations deny anonymous callers, including mutations with an untrusted origin.
- `npm test`: 317 tests, 294 passed and 23 failed. The same 23 failures were recorded before implementation: existing cover/header/footer rendering checks and revision schedule checks. No new failing test names were introduced. The later added logo/creation cases also passed in the focused organization command above.

Next.js build and localhost requests needed execution outside the Windows sandbox after compiler path-access and loopback permission errors. No migration, database mutation, invitation mail, browser automation or deployment was performed during verification. The running development server was left running; its generated files were not edited manually.

Both code-review axes completed. Their source-label and site-ID findings were fixed and independently rechecked.

## Failure and rollback

Missing registry tables should produce a migration-required response rather than falling back to ambiguous numeric IDs. Record the migration file, operator, backup reference and mapping verification with the deployment.

Before standalone records or independently allocated ESG mappings exist, an application rollback can continue using the original legacy IDs. After they exist, an older application does not understand the registry and is not a safe rollback target: disable PolicyCraft traffic and restore a compatible application release, or coordinate a full restore from the pre-cutover backup. Keep the registry and saved logo assets; do not drop tables or reassign IDs as a rollback shortcut.
