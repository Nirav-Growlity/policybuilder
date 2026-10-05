# Manager invitation mail: localhost, ZeptoMail, and Mailtrap

Research date: 2026-10-05

## Finding

“Localhost” can refer to three separate things in this flow: the app making an SMTP connection, the sender address/domain in the message, and the destination URL in the invitation. The current PolicyCraft mailer connects to the configured `MAIL_HOST` with `MAIL_PORT`, `MAIL_USERNAME`, and `MAIL_PASSWORD`; it puts `MAIL_EMAIL` in the From header. Separately, the invitation repository constructs the accept URL from `POLICYCRAFT_APP_URL`. A localhost app URL therefore affects where the recipient’s invitation link points; it does not make the sender address `@localhost` or make the configured ZeptoMail SMTP host localhost. The SMTP client’s source network/IP can still matter if the provider has IP restrictions enabled. See the [mailer](../src/lib/policycraft-invitation-mail.ts) and [invitation URL builder](../src/lib/policycraft-access-repository.ts), and ZeptoMail’s [SMTP configuration](https://www.zoho.com/cpaas/help/smtp-home.html) and [IP restriction guide](https://www.zoho.com/cpaas/help/ip-restriction.html).

For this incident, a fresh local `node --import tsx scripts/verify-invitation-smtp.ts` invocation from `src/`, with network access, exited 1 with `EAUTH; SMTP 535` before submitting a message. This is evidence that the SMTP endpoint was reachable for that check; it is not evidence that a message was sent. ZeptoMail documents `535` as invalid Send API key/username, expired or blocked credits, or a blocked account. It documents `553` separately for an invalid From-address domain, and `530` for a connection that did not issue STARTTLS. So this observed `535` does not support the hypothesis that ZeptoMail refuses an app running on localhost. Since the check failed at authentication, it has not tested From-domain acceptance or recipient delivery. See [ZeptoMail SMTP error codes](https://www.zoho.com/cpaas/help/api/smtp-error-codes.html). The exact account/authentication condition remains unverified.

## Provider configuration options

### Local development: Mailtrap Email Sandbox over SMTP

Mailtrap Email Sandbox is intended to capture test messages in a private inbox so they do not reach real recipients. Its SMTP integration supplies a sandbox host and credentials; its documented host is `sandbox.smtp.mailtrap.io`, with ports including `465`, `587`, `2525` and `25`. SMTP fits PolicyCraft's existing Nodemailer adapter without an additional SDK. Use the credentials copied from the specific Mailtrap sandbox's SMTP integration, not the Mailtrap API token. See [Mailtrap SMTP sandbox setup](https://docs.mailtrap.io/email-sandbox/setup/sandbox-smtp-integration) and [sandbox overview](https://docs.mailtrap.io/email-sandbox/overview).

The implemented split uses separate `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USERNAME`, `MAILTRAP_PASSWORD`, and `MAILTRAP_EMAIL` settings for local testing, retaining `MAIL_*` for production. `NODE_ENV=production` defaults to ZeptoMail; other environments default to Mailtrap. `POLICYCRAFT_MAIL_PROVIDER=mailtrap|zeptomail` explicitly overrides selection, including for production-built local/staging tests. Missing sandbox credentials fail without falling back to live sending. Mailtrap supports 2525 and 587 with required STARTTLS, or 465 with implicit TLS; the host is restricted to the sandbox endpoint. See the [configuration example](../src/.env.example) and [application setup](../src/README.md). After the user configured Mailtrap and reported a verification timeout, two network-enabled invocations of the same verification command passed connection, TLS and authentication. A safe configuration summary confirmed Mailtrap's sandbox host on port 587. The reported Mailtrap timeout was not reproduced; its cause remains undetermined. No message was sent, so sandbox capture and invitation acceptance remain pending. Separately, the earlier restricted-network ZeptoMail diagnostic timed out; with network access it returned 535.

Mailtrap’s Email Sandbox is distinct from Mailtrap Email API/SMTP production sending. The sandbox API uses `https://sandbox.api.mailtrap.io/api/send/{inbox_id}` and an API token; it captures messages. Production transactional sending uses a different API endpoint (`https://send.api.mailtrap.io/api/send`) and requires a verified sending domain. Switching PolicyCraft from its current SMTP adapter to the Sandbox API would be an application integration change; SMTP avoids that change. See [Mailtrap Sandbox API](https://docs.mailtrap.io/developers/email-sandbox/send-test-emails) and [Mailtrap API overview](https://docs.mailtrap.io/developers).

### Production: ZeptoMail SMTP

Keep the production `MAIL_*` values on the ZeptoMail Agent SMTP configuration. ZeptoMail documents `smtp.zeptomail.com`, port 587 with TLS/STARTTLS or port 465 with SSL, and an Agent-specific SMTP username and password. Its setup page gives `emailapikey` as the username, while allowing the From address as an alternate username in some configurations; the Agent’s SMTP tab is the source of the active values. A verified sending domain is a prerequisite: associate it with the Agent and publish the required DKIM TXT and CNAME records. The `MAIL_EMAIL` From address must belong to a permitted verified sender domain. See [ZeptoMail SMTP setup](https://www.zoho.com/cpaas/help/smtp-home.html) and [domain verification](https://www.zoho.com/cpaas/help/domains.html).

If the same verified credentials continue to produce `535`, check that the local app is using the current username/password from the intended Agent and check the account/credit state and any IP allowlist. ZeptoMail says an IP restriction can limit SMTP/API sending to allowlisted source addresses. If authentication succeeds but the provider rejects the From address, use the returned sender-domain error (documented as `553`) to investigate the domain/Agent association. Only after SMTP accepts a message can delivery logs or recipient-side behavior distinguish acceptance from final delivery.

For production, `POLICYCRAFT_APP_URL` should be the public HTTPS application origin. A syntactically accepted `http://localhost` development URL produces a link that resolves only for a browser on that developer machine; a manager opening the invitation elsewhere cannot reach that local app. This link-host issue is independent of whether ZeptoMail accepts the SMTP transaction.

## What current PolicyCraft behavior tells us

- SMTP configuration is read server-side from the selected provider's independent environment variables. ZeptoMail retains ports 465 and 587; Mailtrap also accepts 2525. All non-465 connections require STARTTLS; TLS 1.2 is the configured minimum. No Mailtrap-specific SDK is needed for SMTP sandbox use.
- `verifyPolicyCraftInvitationSmtp()` checks connection, TLS, and authentication only. Its source comment explicitly says it submits no message or recipient. A successful verification still would not prove From acceptance or inbox delivery.
- New-account invitation persistence happens before email delivery. A delivery failure is recorded as failed and the creation route returns its delivery status; therefore a manager record may exist even when `delivery.sent` is false. A retry/resend response must be judged by its `delivery.sent` value, not HTTP success alone. See [manager creation route](../src/app/api/policycraft/admin/managers/route.ts) and [resend route](../src/app/api/policycraft/admin/invitations/%5Bid%5D/route.ts).
- ZeptoMail reproduction evidence stops at SMTP authentication (`535`). Subsequent Mailtrap sandbox authentication on port 587 passed twice. No real message was sent by either provider's verification checks. These results do not establish sender/recipient acceptance, message capture or invitation-link reachability.

## Suggested focused check sequence

1. In local development, configure only the local environment with Mailtrap Sandbox SMTP credentials and a supported port. Run the existing no-message SMTP verification from the same app runtime; if it times out, resolve the specific host/port network path before trying to send.
2. Once verification succeeds, send one controlled manager invitation through the normal authenticated admin flow. Confirm it is captured in the Mailtrap sandbox and inspect the From header and URL. This tests message submission and content capture without delivering a live message.
3. Open the link in the environment where the local app is running and confirm that `POLICYCRAFT_APP_URL` points to that environment. A link test is separate from a provider SMTP check.
4. Keep production on ZeptoMail's verified domain and Agent credentials. After its SMTP authentication and sender-domain configuration are known good, send a controlled invitation through the normal administrator flow and inspect ZeptoMail's message logs for provider acceptance/delivery status.

No credentials, environment files, DNS settings, database, or live email were accessed or changed for this research note.

## Sources

- [ZeptoMail SMTP configuration](https://www.zoho.com/cpaas/help/smtp-home.html) — host, ports, credentials and TLS.
- [ZeptoMail SMTP error codes](https://www.zoho.com/cpaas/help/api/smtp-error-codes.html) — `530`, `535`, and `553` meanings.
- [ZeptoMail domain addition and verification](https://www.zoho.com/cpaas/help/domains.html) — domain/Agent association and DNS verification requirements.
- [ZeptoMail IP restrictions](https://www.zoho.com/cpaas/help/ip-restriction.html) — allowlisting for SMTP/API sending.
- [Mailtrap Email Sandbox SMTP integration](https://docs.mailtrap.io/email-sandbox/setup/sandbox-smtp-integration) — sandbox-specific SMTP credentials and capture behavior.
- [Mailtrap Email Sandbox setup](https://docs.mailtrap.io/email-sandbox/setup) — sandbox SMTP host and supported ports.
- [Mailtrap Sandbox API send endpoint](https://docs.mailtrap.io/developers/email-sandbox/send-test-emails) — inbox-scoped sandbox API endpoint.
- [Mailtrap API overview](https://docs.mailtrap.io/developers) — distinction between sandbox capture and verified-domain sending.
- [Mailtrap sending-domain setup](https://docs.mailtrap.io/email-api-smtp/setup/sending-domain) — production sender domain verification and compliance.
