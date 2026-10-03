# Transfer PolicyCraft administration

Requested 2026-10-01: an administrator must be able to give admin access to somebody else by entering their email in the app, without repeating manual bootstrap SQL.

The current admin can open Administration, look up an existing active shared account by email, review its identity, and explicitly confirm transfer. The recipient must have a usable existing login; someone new completes a manager invitation first. Neither account's shared ESG email, password, role, organization, or sites changes. This is a transfer of PolicyCraft administration, not an edit of a shared login identity.

Only a fresh, active admin session may look up or transfer. Confirmation also requires the acting admin's current password. Apply trusted-origin/JSON checks, strict normalized email/account-ID matching, no self-transfer, no inactive/deleted recipient, disabled staff or pending manager invitation, and server-side revalidation inside a transaction. Grant the recipient active admin access and disable the acting admin's PolicyCraft access atomically. Other admins and policy creator/organization attribution remain intact. Never leave the application without an active admin because of a failed handover or replay/stale request. Concurrent transfers must serialize and recheck the actor after acquiring locks. No client-side role flag grants authority.

Use existing PolicyCraft tables; no schema migration is expected. Do not execute DB queries/writes, send invitations, commit, or deploy during implementation. Retain the manual migration boundary. After transfer, clear the acting browser's workspace scope and sign it out; other old tabs lose authority on their next protected request. New administrator uses their own existing login.

Pending manager invitations sent by the outgoing admin require the new admin to resend them; the existing resend path rotates the token and assigns the new inviter. Do not rewrite existing invitation history or policy attribution during transfer.

Preserve cream/forest/ink styling, responsive form widths, semantic labels, visible keyboard focus, accessible confirmation dialog, and clear outcomes on lookup/transfer failures. Edited email invalidates the reviewed recipient; stale asynchronous lookup results must not replace the new selection. Prevent duplicate submissions.

Verification at already-approved access/UI seams: eligible transfer, identity mismatch/self/inactive recipients, stale actor and replay/concurrent handovers, rollback on failure, retained shared identity/assignments/policies, refreshed authority, origin checks, mocked desktop/mobile/keyboard form and dialog flow, TypeScript/lint/build, and independent standards/spec review. Live MySQL acceptance remains user-run after migration.
