# Workspaces and draft isolation
Status: implemented; live-account acceptance pending
Owner: policycraft-builder-ui
Blocked by: 01 (API contracts)

Implement role routing, admin managers/policies, invitations, manager organizations, client compatibility, visible org context, isolated browser state, guarded navigation, and accessible responsive UI according to ../spec.md.

Acceptance: correct role landing, searchable assignments and policy filters, useful empty/error states, no policy reassignment through selection, no ownerless cache import or stale cross-org load/autosave.

Verification: focused state/autosave tests, TypeScript/lint, mocked browser workflow and keyboard/mobile checks.

Evidence: desktop/mobile and keyboard API-mocked browser checks pass, including failed-save Back/reload protection and successful-save navigation. Manager archive controls match server permissions; restore/permanent delete remain unavailable to managers. See `docs/admin-manager-access-validation.md`.
