# Admin and manager UI consistency review

Date: 5 October 2026

The Administration handover described and tested below was replaced on 6 October 2026 by adding administrators while retaining the acting admin's access/session. Its browser fixture is now `src/scripts/verify-admin-add-ui.mjs`; see [the current validation report](./admin-add-validation.md). Earlier transfer/sign-out results below are historical evidence.

## Scope and direction

Review `/admin`, `/admin/managers/new`, `/admin/policies`, `/admin/administration`, `/manager`, the invitation acceptance handoff, and their shared workspace shell and dialogs. Preserve the existing horizontal navigation, cream background, forest-green accent, Fraunces headings, Inter body text, route structure, and authorization contracts. The user requires visual consistency, then rejected the initial subtle admin refinement and supplied a policy-list screenshot showing clipped actions and heavily truncated titles. The final admin work therefore restructures list and form surfaces visibly within the existing brand.

The initial sidebar image concepts were superseded. Separate policy-library and access-form references guided the final pass: one white library surface, complete readable records, compact secondary actions, and connected forms with warm summary panels. Generated names, statistics, navigation items, and artwork are not product requirements. No generated image is used as a runtime asset.

## Source-backed decisions

- Preserve semantic tables on desktop and show complete responsive records below the table breakpoint. Give policy titles enough width instead of truncating them to accommodate repeated action buttons. Group search/filter controls with the library and use compact secondary actions. [WAI-ARIA APG table](https://www.w3.org/WAI/ARIA/apg/patterns/table/), [Carbon data tables](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines).
- Use a disclosure with a labelled button, expanded state, and regular keyboard-accessible buttons for secondary actions; do not claim ARIA menu behavior without implementing it. [WAI disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/).
- Give controls visible keyboard focus and meaningful labels. Keep the workspace skip link, selected-navigation state, and a named mobile sign-out control. Announce asynchronous results and filtered counts without moving focus for routine updates. [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).
- Keep errors visible inside the dialog that initiated the action, retain entered selections, and give recovery instructions. A failed request must not be presented as a successful empty result. [GOV.UK validation](https://design-system.service.gov.uk/patterns/validation/).
- Preserve modal focus containment, Escape behavior, focus return, accessible titles, and reachable actions at short viewport heights. Confirm archive and destructive actions with clear consequences. [WAI-ARIA APG modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [alert dialog](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/).
- Place progress feedback on the action being performed and distinguish it from page-level loading. [Carbon loading pattern](https://carbondesignsystem.com/patterns/loading-pattern/).
- Keep filter and organization selection in the URL, with back/forward restoring the displayed state. [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).

## Initial code audit

| Surface | Finding | Intended correction |
| --- | --- | --- |
| Managers | Failed initial load can show “No managers yet” | Separate load failure from a successful empty roster; explicit retry |
| Assignments dialog | Save errors rendered behind dialog | Dialog-local error, retained selection and focusable feedback |
| Add manager | Failed organization load can show duplicate empty messages | One accurate loading/error/empty state and selection guidance |
| Admin policies | Toolbar alignment, small actions and weak refresh behavior | Consistent labelled controls, action feedback and actual list retry |
| Manager | Filtered result count uses unfiltered document total | Visible/total result count and distinct filtered empty state |
| Manager | Redundant access read and local/URL state drift | Reuse workspace access and keep selection/filter navigation coherent |
| Manager archive | Archive runs immediately | Reviewable confirmation and local error/progress feedback |
| Shared shell | Narrow header wrapping and unlabelled mobile sign-out | Preserve header layout; improve responsive wrapping and accessible name |
| Shared modal | Close-control focus and short-height scrolling | Visible focus, contained scrolling and reachable footer |

## Validation boundaries

Browser checks intercept all application APIs and use fixture data, including long names, multiple organizations, failed requests, and archived policies. They do not establish real-account or production acceptance. No migration, database mutation, email delivery, or deployed-account action is part of this UI review. Existing access, onboarding, invitation, and administrator-transfer regressions are retained.

## Implemented refinement

The existing design remains recognizable through horizontal navigation, the cream/forest palette, serif headings, and route hierarchy. All four admin pages now have a substantive layout update. Policies use one library surface with aligned filters, a four-column desktop table, complete wrapping titles, compact secondary actions, and full mobile records. Mobile secondary filters collapse behind a labelled disclosure. Managers use grouped organization tags, initials, combined access/status information, and compact actions rather than tall vertical assignment lists. Duplicate organization names retain their distinct codes.

Add manager and Administration use connected form surfaces with warm summary panels. The add-manager summary reflects actual selected organizations and invitation/direct-grant behavior. The administrator panel explains the existing password-confirmed handover and access removal. An incorrect draft statement about resending unrelated pending invitations was removed after independent review.

Controls align and fit narrow screens, selected navigation is clearer, and the header keeps its navigation on a second horizontal row below the desktop breakpoint. Muted text is slightly darker within admin/manager workspaces for readable contrast; user-workspace and document theme tokens remain unchanged.

Loading failures, successful empty lists, and filtered empty results have distinct messages. Dialog errors remain with the action and retain entered selections. Disable/archive/restore/delete confirmations and progress feedback are consistent. Sign-out and invitation lookup failures have retry paths. Shared dialogs preserve keyboard containment and focus return, avoid resetting focus while typing, and scroll at short heights.

Manager organization, policy type, view, and title search stay coherent with the URL and browser history. Organization changes hide old rows immediately and ignore late responses. A reproduced manager search race was repaired: changing view/type/organization cancels the pending URL replacement and includes the current search draft. Admin search also distinguishes self-authored URL acknowledgements from external navigation, so a stale URL echo cannot overwrite newly typed characters. Rapid entry and filter clearing are covered in both admin interfaces.

All four admin screens, manager organization/policy navigation, invitation acceptance, shared dialogs, and disclosures were reviewed. Adjacent user drafts and the builder pending-save navigation guard were also checked.

## Validation results

Run from `D:\Policy PoC\src`:

| Check | Result |
| --- | --- |
| `npm.cmd run test:access` | 67/67 passed |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | Passed |
| `node node_modules/eslint/bin/eslint.js` with the affected pages, shell, modal, and new UI script | Passed |
| `node --import tsx scripts/verify-workspace-polish-ui.mjs` | Passed: six routes at 1440×1000, 1024×800, 768×900, 390×844, and 720×450; 23 policy fixtures, five/six-organization manager fixtures, complete titles, compact rows, action-cell containment, mobile filters, disclosure keyboard/dismissal, scoped PDF/Word downloads, error/retry, search/navigation, history, stale response, archive/delete, sign-out, and adjacent user drafts |
| `node --import tsx scripts/verify-access-ui.mjs` | Passed: onboarding, assignment revocation, responsive workspaces, modal keyboard containment, organization selection, and builder pending-save guards |
| `node scripts/verify-invitation-ui.mjs` | Passed: independent resend, cancel/dismiss, failure/retry, single submission, responsive layout |
| `node scripts/verify-admin-transfer-ui.mjs` | Passed: lookup/stale response, recipient invalidation, dialog keyboard/cancel, password recovery, transfer/sign-out routing |
| `git diff --check` from repository root | Passed |
| `node node_modules/next/dist/bin/next build` | Passed after final source changes: compilation, TypeScript, and 32-page generation |

Browser scripts used `POLICYCRAFT_UI_URL=http://localhost:3000` and local `POLICYCRAFT_UI_OUTPUT` folders. Screenshots are under `src/output/playwright/workspace-polish`, `workspace-polish-final`, `workspace-polish-invitations`, and `workspace-polish-transfer`; this generated output is ignored by Git. Desktop and mobile manager/admin views, the add-manager form, short-height administration view, and invitation handoff were visually inspected after refinement. The final full workspace, access/onboarding, invitation, and administrator-transfer scripts all passed against the completed redesign with no browser page errors.

Better Auth reports its existing missing-base-URL configuration warning when `BETTER_AUTH_URL` is unset; the UI work does not configure production authentication. PDF/Word downloads in the browser harness use placeholder files to verify action wiring and scope; actual document rendering and live-account/email/database acceptance remain outside these mocked checks.

## Cover previews and default organization view

The follow-up restores saved cover-page previews beside admin policy titles and removes the decorative status dot. Admin summaries now include the same restricted cover snapshot as organization summaries; complete policy sections and imported policy text remain server-side. Cover assets use the policy's organization scope.

The manager workspace defaults to All organizations, including accounts with a single assignment. It requests each active assigned organization explicitly, combines policies in updated-time order, and labels the organization on each record. Opening and archiving policies use the record's organization. An aggregate request failure has a visible retry instead of presenting incomplete results. Creating a policy from the combined view requires choosing its organization.

Follow-up validation passed: the three focused admin-summary tests (cover snapshot normalization and exclusion of full policy/imported text), all 67 access tests, direct TypeScript, focused ESLint with no warnings, production build, and `git diff --check`. The full mocked workspace browser suite passed at the five viewport sizes above, including complete cover fit, All default for one/multiple assignments, global policy order, unavailable organizations excluded, row-specific Open/Archive scope, aggregate failure/retry, and the creation organization picker. The existing access/onboarding/manager-to-builder browser suite also passed. Final screenshots are in `src/output/playwright/workspace-cover-all` and `workspace-cover-all-access`; admin desktop/mobile and the combined manager mobile view were visually inspected. These checks used mocked APIs and made no live database changes.
