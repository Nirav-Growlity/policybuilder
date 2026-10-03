# Admin, manager, and client-user access

Approved: 2026-10-01. Tracker: local Markdown. Integration owner: main agent.

## Roles and workspaces

One sign-in page routes admins to manager/policy administration, managers to assigned organizations, and client users to their existing organization workspace. Admins have full policy CRUD/export across organizations; deleted organization history is read-only. Managers share all policies in each assigned active/unexpired organization with the client user. Each policy has one immutable organization and retains its creator.

Admins grant manager access to existing active accounts directly after explicit account confirmation; these accounts keep their assigned password and receive no invitation email. Only people without an existing account are invited through ZeptoMail to choose a password. Admins assign multiple existing organizations, change assignments, and disable manager access. Admin policies support organization, creator, type, and active/archive filters. Use existing cream/forest/ink styling, semantic responsive tables, focus-managed dialogs, and keyboard-accessible controls. Existing organizations/client accounts remain intact.

## Authorization and provisioning

Use shared Better Auth identities and independent PolicyCraft staff access/assignment tables. Check authoritative sessions and current account, role/status, organization, and assignment on every request. Disabled staff cannot fall back to client permissions. Org IDs select context; document IDs supply canonical organization. Validate same-origin privileged mutations.

Invitations use hashed single-use tokens, expire after 72 hours, and support cancellation and resend (invalidating old links). GET never consumes an invitation. Delivery failures stay visible and retryable. New accounts are created atomically with credential/access/assignment records only after password selection and invitation acceptance. Use ordinary ESG role/user defaults with empty org membership. Per the user's 2026-10-03 update, existing-email grants require explicit administrator confirmation, activate manager access without an invitation or SMTP configuration, and preserve credentials and shared ESG fields. Adding access to an existing manager preserves prior organization assignments. Administrator accounts and disabled accounts must not be silently converted or reactivated. Signup remains disabled.

Scope browser drafts, media URLs, preview/request caches, and export hydration by actor/organization. Ignore but preserve ownerless legacy browser data. Flush pending saves before workspace navigation; block unsafe navigation on save errors. Keep actor signatures separate and preserve document generation/rendering behavior.

## Migration boundary

Deliver dated additive staff/assignment/invitation migrations, a parameterized manual first-admin bootstrap example, schema preflight, verification, and rollback instructions. The user alone runs all database changes. No migration execution, live provisioning, test-database writes, or invitation delivery by agents. Never edit generated database types manually.

## Verification

Behavioral seams: role and tenant guards; invitation acceptance/linking/replay/failure rollback; assignment revocation; immutable policy organization and concurrent autosave; browser storage/cache separation; scoped artwork and signatures in preview/export. Run focused tests, TypeScript, affected-file ESLint, production build, UI/accessibility review and independent standards/spec review. Browser fixtures may simulate the API without database access. Record actual results and distinguish them from DB-backed acceptance pending manual setup.
