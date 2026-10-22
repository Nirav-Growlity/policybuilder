# PolicyCraft Documents area (SOP manuals)

This guide covers `2026_10_create_policycraft_manuals.sql`, the one table behind the new **Documents** section. SOP manuals use it now; employee handbooks will reuse it later through its `kind` column.

The migration is a deliverable for the database owner. The application never runs it, and no startup path creates the table.

## What it changes

- It creates one new table, `policycraft_manuals`, with two indexes:
  - `idx_policycraft_manuals_org_updated (org_id, archived_at, updated_at)` for the drafts list
  - `idx_policycraft_manuals_org_kind (org_id, kind)` for filtering by document type
- It does not alter or read any existing table, and it does not touch policies, tasks, signatures, ESG users, organizations or sites.
- It has no foreign keys, matching the other PolicyCraft tables. `org_id` refers to the PolicyCraft organization registry, and `created_by_user_id` / `updated_by_user_id` refer to shared `users.id`. The application enforces both relationships.
- It uses `CREATE TABLE IF NOT EXISTS`, so a second run is a no-op. It still belongs in your migration ledger once.

## Prerequisites

Apply this only after these are in place, because the manual routes and list queries depend on them:

1. `2026_10_create_policycraft_access.sql`: role checks for admin, manager and user.
2. `2026_10_create_policycraft_organizations.sql`: the organization registry joined by every manual query.

Check both with:

```sql
SHOW TABLES LIKE 'policycraft_user_access';
SHOW TABLES LIKE 'policycraft_organizations';
```

Both must return a row. If either is missing, follow [README_policycraft_access.md](./README_policycraft_access.md) and the [organization rollout guide](../../docs/policycraft-organizations-rollout.md) first.

## Preflight (read only)

```sql
SELECT VERSION();
SHOW TABLES LIKE 'policycraft_manuals';
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'policycraft_documents';
```

Confirm:

- MySQL is 8.0 or later (the table uses `JSON` columns and `TIMESTAMP(3)`).
- `policycraft_manuals` does not exist yet. If it does, compare its definition with the SQL file using `SHOW CREATE TABLE policycraft_manuals;`. Stop if they differ.
- `policycraft_documents` is InnoDB with `utf8mb4_unicode_ci`. The new table uses the same engine and collation.

## Apply

1. Back up the database, or at least confirm a recent restorable backup. Record its reference.
2. Apply the file through your normal migration process, for example:

   ```bash
   mysql --host=<host> --user=<user> -p <database> < src/migrations/2026_10_create_policycraft_manuals.sql
   ```

3. Record the filename, applied UTC time, operator, backup reference and verification result in your migration ledger.

The statement takes a metadata lock only on the new table, so it needs no downtime and no write pause.

## Verify

```sql
SHOW CREATE TABLE policycraft_manuals;
SHOW INDEX FROM policycraft_manuals;
SELECT COUNT(*) FROM policycraft_manuals;
```

Expect:

- These columns: `id`, `org_id`, `kind` (`ENUM('sop','handbook')`), `created_by_user_id`, `updated_by_user_id`, `title`, `current_stage`, `manual_json`, `imported_context_json`, `page_count`, `schema_version`, `lock_version`, `archived_at`, `created_at`, `updated_at`.
- The primary key on `id` plus the two indexes listed above.
- A row count of `0`.

## Application settings

Set these in the deployment environment (`src/.env` locally) before using the Documents section:

| Variable | Used for |
|---|---|
| `ANTHROPIC_API_KEY` | All AI writing: policies, SOP manuals, grammar checks and AI cover layout (Claude Haiku 5.5). Without it, policy writing falls back to the built-in sample text and grammar checks return 503. |
| `OPENAI_API_KEY` | AI cover artwork only. |

## Smoke test after deploy

1. Sign in and open **Documents** in the sidebar. The page loads with an empty list and no errors.
2. Create an SOP manual for a test organization. One row appears:

   ```sql
   SELECT id, org_id, kind, title, current_stage, lock_version, page_count
     FROM policycraft_manuals ORDER BY created_at DESC LIMIT 5;
   ```

3. Edit the manual. `lock_version` increases with each save.
4. Archive it, then restore it. `archived_at` is set and then cleared.
5. Try to open the manual with a different organization's `orgId` in the URL. The API answers 403 or 404 and never returns the manual.

## Rollback

The table is self-contained, so rolling back is a drop. **This permanently deletes every SOP manual stored in it.** Only roll back while the table is empty, or after exporting it:

```sql
SELECT COUNT(*) FROM policycraft_manuals;  -- expect 0 before dropping
DROP TABLE policycraft_manuals;
```

Also roll back or hide the Documents section in the app, otherwise its pages and API routes return database errors.
