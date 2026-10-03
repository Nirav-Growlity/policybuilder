# Integration and review
Status: implementation and independent reviews complete; manual rollout acceptance pending
Owner: main agent
Blocked by: 01, 02, 03

Integrate contracts and export guards, verify every client org request path, run tests/typecheck/lint/build, execute browser fixtures, and independently review standards/spec compliance. Fix actionable issues. Record actual evidence and manual DB rollout requirements. Leave changes reviewable without committing or deploying.

Evidence: 32 focused tests pass, eight additional autosave/cache/mail checks pass, TypeScript/build pass, affected-file ESLint has no errors, and mocked desktop/mobile/history/reload checks pass. Standards/spec review findings were resolved and re-reviewed. Full-suite baseline failures and pending live acceptance are recorded in `docs/admin-manager-access-validation.md`. No migrations, bootstrap, database changes, email delivery, commits, or deployments were run.
