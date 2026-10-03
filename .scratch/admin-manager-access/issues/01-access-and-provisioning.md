# Access and provisioning
Status: implemented; database-backed acceptance pending manual migration
Owner: policycraft-data-api
Blocked by: none

Implement server access rules, staff/assignment/invitation persistence, manager/admin APIs, tenant-bound document/media operations, and user-run migration/bootstrap artifacts according to ../spec.md.

Acceptance: live role/assignment checks, no client-controlled privilege, single-use transactional invitation acceptance, explicit matching-account linking, unchanged existing policy creator/org and shared ESG fields.

Verification: focused access/invitation/API tests, TypeScript and lint. Database-backed acceptance remains pending the user's migration.

Evidence: `npm.cmd run test:access` passes 32/32; TypeScript, affected-file ESLint, build, and anonymous handler checks pass. Manual SQL/runbook/bootstrap and ZeptoMail configuration are delivered. See `docs/admin-manager-access-validation.md` for remaining live acceptance checks.
