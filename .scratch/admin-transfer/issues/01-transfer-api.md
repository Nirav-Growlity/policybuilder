# Administrator transfer API
Status: implemented; live database acceptance pending
Owner: policycraft-data-api
Blocked by: none for implementation; database owner applies the original access migration before live acceptance

Implement atomic, fresh-authorized recipient lookup and admin transfer using existing tables. See ../spec.md. Backend owns new transfer workflow, repository, API route and focused tests; adjacent invitation resend owner is backend if needed for continuity. No live DB operations or migration execution.

Completed with transactional recipient promotion/source disable, fresh actor checks, current-password confirmation, canonical credential matching, pending-invitation checks, and focused regression coverage. Final independent Standards and Spec re-reviews found no remaining issue in the reviewed fixes. See ../../../docs/admin-transfer-validation.md for evidence and pending manual checks.
