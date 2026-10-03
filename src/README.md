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

For release, production migration/bootstrap, deployment, smoke checks, rollback, and future handovers, follow the [PolicyCraft production rollout runbook](../docs/policycraft-production-rollout.md).

The same login now opens `/admin` for PolicyCraft administrators, `/manager` for managers, and `/drafts` for existing client users. Staff access is independent of shared ESG roles. Managers share policies within their assigned organizations; policy ownership and creator attribution stay attached to the original organization and account.

Before deploying this version, the database owner must follow [the access migration runbook](migrations/README_policycraft_access.md), apply the additive access migration, and designate an existing first administrator using [the bootstrap example](migrations/bootstrap_policycraft_admin.example.sql). Migration execution is manual. Missing access tables fail closed, so apply and verify them before switching application traffic.

Existing active accounts receive manager access directly after an administrator confirms the account. They sign in with their existing password; no email or SMTP configuration is needed. Adding an existing manager preserves their current organization assignments and adds the selected organizations.

Only people without an existing account receive an invitation to choose a password. Configure `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_EMAIL`, and `POLICYCRAFT_APP_URL` from `.env.example` before sending these invitations. Invitations use ZeptoMail SMTP: port 587 requires STARTTLS; port 465 uses TLS. `MAIL_EMAIL` is the verified sender address; invitations go to the manager's email, not `ADMIN_EMAIL`. No ZeptoMail API key is required. Public signup remains disabled; invitations expire after 72 hours.

For local invitation tests, set `POLICYCRAFT_APP_URL=http://localhost:3000` and load the SMTP settings into the local environment. The app connects outbound to ZeptoMail, so a hosted application is not required to send mail. Open a localhost invitation link on the computer running the app; use a reachable HTTPS app origin for invitees on another computer.

Run `npm run test:access` for the isolated access, invitation, storage, and export tests. The repeatable browser smoke check is `node --import tsx scripts/verify-access-ui.mjs`; start a development server first and set `POLICYCRAFT_UI_URL` to its origin. It mocks API responses and does not touch database records or send mail. Screenshots default to `output/playwright`; use `POLICYCRAFT_UI_OUTPUT` to choose another writable directory. `node scripts/verify-access-anonymous.mjs` checks that the generation, import, and export handlers reject requests without cookies before processing content.

## Administrator handover

Administrator handover is available at **Administration → New administrator email → Find account → Transfer admin access**. Review the recipient, enter your current password, and confirm. The recipient must have an existing active account with a working password login; a new person can accept a manager invitation first. This transfers PolicyCraft permissions without changing either shared ESG email/password. The outgoing account loses PolicyCraft access and is signed out. The new administrator should resend outstanding invitations sent by the outgoing administrator. This uses the existing access tables and requires no additional migration after the access migration.

Admin-transfer browser fixtures (all application APIs mocked, no live account changes): `node scripts/verify-admin-transfer-ui.mjs`. Set `POLICYCRAFT_UI_URL` and `POLICYCRAFT_UI_OUTPUT` for your local server and writable screenshot directory.

Follow the [manual handover steps](migrations/README_policycraft_access.md#transfer-administration-after-setup). Implementation evidence and pending live checks are recorded in [the handover validation report](../docs/admin-transfer-validation.md).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
