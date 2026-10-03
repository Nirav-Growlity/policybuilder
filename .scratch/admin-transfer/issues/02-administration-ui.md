# Administration transfer screen
Status: implemented; live account acceptance pending
Owner: main agent (UI specialist unavailable because agent thread capacity was exhausted)
Blocked by: none for implementation

Implement Administration navigation, recipient-email lookup, identity review, explicit accessible transfer confirmation, and signout after success. See ../spec.md. UI owns app/admin/administration/page.tsx and components/workspace/workspace-shell.tsx only; main owns integration, browser fixtures, docs, and final report.

Completed using frontend-skill app guidance and web-design-guidelines. Mocked desktop/mobile checks cover lookup failures, stale responses, changed email, password typing, wrong-password recovery, focus containment, cancellation, successful transfer/signout, and the login acknowledgment. See ../../../docs/admin-transfer-validation.md.
