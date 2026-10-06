# PolicyCraft tasks rollout

## Owner steps

1. Back up the target database and verify the existing PolicyCraft document/access migrations are installed. Apply [2026_10_create_policycraft_tasks.sql](../src/migrations/2026_10_create_policycraft_tasks.sql) through your normal migration process. Record the operator, target, timestamp, and result.
2. Leave historical progress unavailable unless there is independent evidence of the manager's content save. Managers can simply save their policies again. For an evidenced backfill, follow the optional procedure below; only the database owner executes it.
3. Deploy the application and verify the real-account scenarios below before declaring the feature live.

The agent does not execute migrations, backfill, or direct database writes. No application startup runs these commands. No shared ESG roles, organization ownership, or generated database types are changed.

## Preflight and verification

Use the database owner's SQL client for these read-only checks:

```sql
SHOW CREATE TABLE policycraft_documents;
SHOW CREATE TABLE policycraft_user_access;
SHOW CREATE TABLE policycraft_manager_organizations;
SELECT TABLE_NAME, ENGINE
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('policycraft_documents', 'policycraft_user_access',
                      'policycraft_manager_organizations', 'users', 'organizations');
```

All tables participating in transactions must use InnoDB. Review the new migration against the target schema and use the same database configured for PolicyCraft. It creates only PolicyCraft-owned task/progress/event tables; it does not grant access or create tasks.

After applying it:

```sql
SHOW CREATE TABLE policycraft_tasks;
SHOW CREATE TABLE policycraft_manager_progress;
SHOW CREATE TABLE policycraft_task_events;
SHOW INDEX FROM policycraft_tasks;
SHOW INDEX FROM policycraft_manager_progress;
SELECT COUNT(*) AS task_count FROM policycraft_tasks;
SELECT COUNT(*) AS snapshot_count FROM policycraft_manager_progress;
SELECT COUNT(*) AS event_count FROM policycraft_task_events;
```

## Historical progress

The backfill calculates the same filled-section rubric used by new saves. Existing `updated_by_user_id` metadata and a current manager role are not proof of a manager's content save: archive/restore also change metadata, and roles can change. Without independent evidence, manager-created policies remain visible with unavailable progress until a manager saves again. Earlier shared-policy contributions cannot be reconstructed.

For an optional backfill, prepare a local JSON array from an independently verified content-save audit record. Do not infer these entries merely from the document row. Use the exact UUID, manager's numeric ID, document version, and UTC timestamp with milliseconds:

```json
[
  {
    "documentId": "00000000-0000-4000-8000-000000000001",
    "managerId": 27,
    "documentVersion": 4,
    "savedAt": "2026-10-01T10:00:00.000Z"
  }
]
```

From `D:\Policy PoC\src`, the owner runs a read-only preview:

```powershell
node --import tsx scripts/backfill-policycraft-manager-progress.ts --evidence="D:\private\verified-manager-saves.json"
```

After reviewing the evidence and matched count, the owner may add `--apply`. The script locks and rechecks the exact last updater, current manager role, version, timestamp, and active draft. It skips stale evidence and never overwrites an existing manager snapshot. Running without evidence is a no-op; `--apply` without evidence is rejected. Keep evidence files outside the repository.

Each manager/document has its own latest snapshot. Client-user and administrator saves do not change it. Starter, default, and applied AI text count as filled content. Imported source material that has not been applied to policy fields does not count. This measures content presence, not time spent, policy quality, or approval readiness.

## Real-account acceptance

- Admin creates a task for an active organization; only active managers already assigned to that organization are selectable. Verify another organization's manager is rejected by the API.
- Manager starts the task twice, including from two tabs. Exactly one linked policy is created, with organization details and the assigned policy type.
- Manager saves content. Admin Tasks and Manager Work show the manager's saved timestamp, filled-section count, and percentage. An independently created policy also appears.
- Client user and admin edit the same policy. Their edits do not change the manager's recorded percentage or saved timestamp. A second manager's save creates a separate snapshot.
- Manager completes below 100% only after acknowledgement. Offline or conflicting saves and stale task/document versions prevent completion. A 100% policy remains in progress until explicitly completed.
- Admin edits, reassigns, cancels, and reopens a task. The original policy creator, linked draft, prior manager progress, and task events remain intact. A new assignee has no copied percentage.
- Revoke manager organization access or disable the manager. Old tabs cannot start or complete tasks; the admin sees the unavailable assignment. Ordinary users cannot access task/progress APIs.
- Check an overdue date at the IST midnight boundary. A task is due through the selected day's end in Asia/Kolkata.
- Attempt to permanently delete an archived task-linked policy. It is blocked; cancelling a task does not delete its policy.
- Inspect mobile and desktop task screens, keyboard-only dialogs, long names, loading/retry states, and builder resume/completion.

## Compatibility and rollback

Before the task migration is installed, task endpoints return a migration-required response and existing policy saving remains available. Only missing task tables trigger compatibility behavior; other database errors are reported.

For application rollback, deploy the previous app version and retain the new tables and their data. Do not drop task history or manager snapshots as part of a routine rollback. Database cleanup, if ever required, is a separate owner-approved operation after backup.

## Verification evidence

Code tests and browser fixtures do not prove live database transactions or real-account authorization. Browser fixtures intercept all application APIs and do not write to the target database. Record target-environment acceptance separately.

Verified from `src/` on 2026-10-05:

- `npm.cmd run test:tasks`: 27 passed, 0 failed. Covers the section rubric, IST dates, manager-only attribution, failed-save rollback, save conflicts, idempotent starts, revocation and reassignment eligibility, organization availability, archived-draft reopening, preserved event history, and stale/partial completion.
- `npm.cmd run test:access`: 67 passed, 0 failed. The focused autosave/storage/document-action/progress run also passed 28/28 before the expanded task suite was added.
- `npm.cmd test`: 303 tests, 280 passed, 23 failed. The same 23 cover/footer and revision-scheduling tests failed in the pre-change baseline (276 tests, 253 passed); there are no additional failing tests.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: passed.
- Affected-file `node node_modules/eslint/bin/eslint.js ...`: passed with no errors or warnings.
- `node node_modules/next/dist/bin/next build`: passed, including TypeScript and generated task routes. The local environment produced a Better Auth base-URL configuration warning; verify production origin configuration before release.
- `npm.cmd run tasks:verify-ui`: passed using mocked APIs at 1440px desktop, 390px mobile, and a 480px-high dialog viewport. Verified URL filters, eligibility and organization resets, form preservation during refresh, history, reassignment/reopen, migration retry, manager start/resume, independent drafts, save-before-confirmation, explicit incomplete acknowledgement, failed/conflicting/stale-save blocking, readable builder titles/icons, no horizontal overflow, and no page errors. Screenshots were visually inspected.
- `node --import tsx scripts/verify-workspace-polish-ui.mjs`: passed existing admin/manager/invitation/client-user workflows at 1440, 1024, 768, 390, and 720x450, with APIs mocked.
- `node scripts/verify-tasks-anonymous.mjs`: all nine task/admin-progress operations returned 401 without cookies, before mutation-body processing.
- `git diff --check`: passed. Standards and Spec reviews found no remaining actionable findings after the fixes.

The automated start-retry test asserts row locks and exactly one draft/snapshot/event across sequential retries. True simultaneous starts, transaction behavior on the deployed MySQL instance, real-account revocation/isolation, and ordinary-user API denial must still be accepted after the owner applies the migration. No database changes, email sends, deployment, or commit were performed by the agent.
