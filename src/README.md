This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Local PolicyCraft workspace

PolicyCraft runs independently of the ESG application. Configure the local MySQL connection and `BETTER_AUTH_SECRET` in `.env` (use the ESG secret when cookie compatibility is required), then start it on port 3000:

```bash
bun run dev -- -p 3000
```

The additive migration in `migrations/2026_09_create_policycraft_documents.sql` creates the PolicyCraft-owned draft table without modifying the existing organization or site tables. The standalone login is available at `/login` and the signed-in drafts workspace at `/drafts`.

## Admin and manager workspaces

For release, production migration/bootstrap, deployment, smoke checks, rollback, and adding administrators, follow the [PolicyCraft production rollout runbook](../docs/policycraft-production-rollout.md).

The same login now opens `/admin` for PolicyCraft administrators, `/manager` for managers, and `/drafts` for existing client users. Staff access is independent of shared ESG roles. Managers share policies within their assigned organizations; policy ownership and creator attribution stay attached to the original organization and account.

Before deploying this version, the database owner must follow [the access migration runbook](migrations/README_policycraft_access.md), apply the additive access migration, and designate an existing first administrator using [the bootstrap example](migrations/bootstrap_policycraft_admin.example.sql). Migration execution is manual. Missing access tables fail closed, so apply and verify them before switching application traffic.

Existing active accounts receive manager access directly after an administrator confirms the account. They sign in with their existing password; no email or SMTP configuration is needed. Adding an existing manager preserves their current organization assignments and adds the selected organizations.

Only people without an existing account receive an invitation to choose a password. Public signup remains disabled; invitations expire after 72 hours. Invitation mail uses Mailtrap Email Sandbox in development/test and ZeptoMail in production (`NODE_ENV=production`). Set `POLICYCRAFT_MAIL_PROVIDER=mailtrap` or `zeptomail` to explicitly select a provider, including Mailtrap for a locally run production build or staging deployment. Missing Mailtrap configuration fails without falling back to ZeptoMail.

For local invitation tests, open [Mailtrap Sandboxes](https://mailtrap.io/sandboxes), select a sandbox and copy its **Integration → SMTP** username and password into `src/.env.development.local` (this application's root directory). Use the Email Sandbox credentials, not Mailtrap's live sending credentials or API token:

```dotenv
POLICYCRAFT_MAIL_PROVIDER=mailtrap
POLICYCRAFT_APP_URL=http://localhost:3000
MAILTRAP_HOST=sandbox.smtp.mailtrap.io
MAILTRAP_PORT=2525
MAILTRAP_USERNAME=your-sandbox-smtp-username
MAILTRAP_PASSWORD=your-sandbox-smtp-password
MAILTRAP_EMAIL=invites@policycraft.test
```

Ports 2525 and 587 require STARTTLS; 465 uses implicit TLS. [Mailtrap Email Sandbox](https://docs.mailtrap.io/email-sandbox/overview) captures messages in its dashboard without delivering them to the manager's actual inbox; no sender domain verification is required for sandbox testing. After restarting the development server, resend the invitation, open the captured message in Mailtrap and follow its invitation link on the computer running PolicyCraft. For another computer, use a reachable HTTPS application origin. Sandbox acceptance tests the invitation email flow, not production inbox delivery.

For production, retain `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_EMAIL` and an HTTPS `POLICYCRAFT_APP_URL` in the deployment environment. Leave `POLICYCRAFT_MAIL_PROVIDER` unset or set it to `zeptomail`. Use the SMTP host and credentials from your account's Agent → SMTP tab: port 587 requires STARTTLS and 465 uses TLS. `MAIL_EMAIL` must be a verified sender; invitations go to the manager's email, not `ADMIN_EMAIL`. SMTP uses the SMTP password rather than an HTTP API integration.

Run `node --import tsx scripts/verify-invitation-smtp.ts` from this application directory to check the selected provider's SMTP connection, TLS and authentication without sending email. It loads Next.js environment files (development by default; production when `NODE_ENV=production`) and prints only safe diagnostics. To check ZeptoMail from PowerShell without sending mail, set `$env:POLICYCRAFT_MAIL_PROVIDER='zeptomail'` before running it; remove that temporary override with `Remove-Item Env:POLICYCRAFT_MAIL_PROVIDER` afterward. Shell environment variables take precedence over `.env` files.

`EAUTH; SMTP 535` means authentication was rejected before email content was submitted, so a localhost invitation URL cannot explain that failure. Check the selected provider's SMTP username/password pairing. For ZeptoMail, also check account status, credits, regional host and any configured IP restrictions: Zoho lists expired/blocked credits and a blocked account as causes of 535 ([error reference](https://www.zoho.com/zeptomail/help/api/smtp-error-codes.html)). A generated shorter SMTP password requires its generated username or the From address ([SMTP setup](https://www.zoho.com/cpaas/help/smtp-home.html)). Restart the dev server after updating the environment. Passing verification does not establish sender or recipient acceptance. Resend responses contain `delivery.sent`; HTTP 200 alone does not mean mail delivery succeeded. See the [provider investigation](../docs/invitation-mail-providers-research.md) for evidence and remaining live checks.

Run `npm run test:access` for the isolated access, invitation, storage, and export tests. The repeatable browser smoke check is `node --import tsx scripts/verify-access-ui.mjs`; start a development server first and set `POLICYCRAFT_UI_URL` to its origin. It mocks API responses and does not touch database records or send mail. Screenshots default to `output/playwright`; use `POLICYCRAFT_UI_OUTPUT` to choose another writable directory. `node scripts/verify-access-anonymous.mjs` checks that the generation, import, and export handlers reject requests without cookies before processing content.

## PolicyCraft-only organizations

The main `/admin/organizations` page lists normal ESG organizations. The separate PolicyCraft organizations module at `/admin/organizations/policycraft` lists organizations that exist only in PolicyCraft and provides company-profile creation. Profiles require company name, sector/sub-sector, country, website, FY/CY reporting period, logo and operating sites. Assign existing managers from either list, or add a new manager separately; creation grants no manager access automatically. Admins and assigned managers can edit PolicyCraft profiles. New policies inherit the latest profile; saved policies retain their existing company details and logos.

These records are stored in PolicyCraft-owned tables and never added to the shared ESG organization or site tables. Regular client users cannot access them. ESG organizations remain available through a separate source mapping with their existing master details.

Before deploying this feature, the database owner must apply the additive `migrations/2026_10_create_policycraft_organizations.sql` migration during the cutover described in [the organization rollout guide](../docs/policycraft-organizations-rollout.md). Existing organization IDs are retained at initial seeding; subsequent registry IDs are allocated independently. Missing registry tables fail closed. Follow the guide's acceptance and rollback constraints after new organizations have been created.

Run `npm run test:organizations` for profile, logo, authorization, company mapping and task integration checks. With the app running locally, `node scripts/verify-organizations-anonymous.mjs` verifies that cookie-free requests cannot use the new organization APIs. Real-account and rendered-output acceptance remains manual as described in the rollout guide.

## Tasks and manager progress

Administrators assign policy work at `/admin/tasks` and monitor manager-only saved progress in the Manager Work tab. Managers start and resume their assignments at `/manager/tasks`; completion saves the current policy first and requires acknowledgement when sections remain empty. Deadlines are due at the end of the chosen day in India Standard Time.

The database owner must apply `migrations/2026_10_create_policycraft_tasks.sql` before using assignments. Follow the [task rollout guide](../docs/policycraft-tasks-rollout.md) for migration checks, independently evidenced historical backfill, and live-account acceptance. Existing policy saves remain available without the task migration; task endpoints report that the migration is required.

Run `npm run test:tasks` for progress and transactional task checks. With the app running locally, `npm run tasks:verify-ui` runs desktop/mobile/short-height browser fixtures with all APIs mocked, without changing live data. Use `POLICYCRAFT_UI_URL` and `POLICYCRAFT_UI_OUTPUT` to override the origin and screenshot directory.

`node scripts/verify-tasks-anonymous.mjs` checks that all task/admin-progress operations reject callers without cookies before processing mutation bodies.

## Add administrators

Additional administrators can be added at **Administration → New administrator email → Find account → Add administrator**. Review the account, enter your current administrator password, and confirm. An existing active manager is eligible and becomes an administrator. The account must have a working password login; a new person can accept a manager invitation first. You remain an administrator and stay signed in. Existing passwords, shared ESG account fields, manager assignment records and policy attribution are preserved. This uses the existing access tables and requires no additional migration after the access migration.

Add-administrator browser fixtures (all application APIs mocked, no live account changes): `node scripts/verify-admin-add-ui.mjs`. Set `POLICYCRAFT_UI_URL` and `POLICYCRAFT_UI_OUTPUT` for your local server and writable screenshot directory.

Follow the [add-administrator steps](migrations/README_policycraft_access.md#add-administrators-after-setup). Implementation evidence and pending live checks are recorded in [the administrator validation report](../docs/admin-add-validation.md).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
