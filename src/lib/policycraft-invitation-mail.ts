import nodemailer from "nodemailer";
import type { SendMailOptions } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const SMTP_TIMEOUT_MS = 15_000;
const MAILTRAP_SANDBOX_HOST = "sandbox.smtp.mailtrap.io";

type InvitationMailEnvironment = Record<string, string | undefined>;
type InvitationDeliveryResult = { accepted?: Array<string | { address: string }> };
type InvitationTransport = {
  sendMail(message: SendMailOptions): Promise<InvitationDeliveryResult>;
  close(): void;
};
type InvitationTransportFactory = (options: SMTPTransport.Options) => InvitationTransport;
type InvitationMailProvider = "mailtrap" | "zeptomail";
type SmtpConfig = {
  provider: InvitationMailProvider;
  fromAddress: string;
  transportOptions: SMTPTransport.Options;
};

export function createPolicyCraftInvitationSender(
  env: InvitationMailEnvironment = process.env,
  transportFactory: InvitationTransportFactory = (options) => nodemailer.createTransport(options),
): (email: string, name: string, invitationUrl: string) => Promise<void> {
  return async (email, name, invitationUrl) => {
    const config = readSmtpConfig(env);
    const escapedName = escapeHtml(name);
    const escapedInvitationUrl = escapeHtml(invitationUrl);
    const message: SendMailOptions = {
      from: { name: "PolicyCraft", address: config.fromAddress },
      to: { name, address: email },
      subject: "Your PolicyCraft manager invitation",
      text: [
        `Hello ${name},`,
        "",
        "An administrator invited you to help manage policies in PolicyCraft.",
        "",
        "Accept invitation:",
        invitationUrl,
        "",
        "This invitation expires in 72 hours.",
        "",
        "If the button does not work, copy and paste this address into your browser:",
        invitationUrl,
        "",
        "This email was sent by PolicyCraft because an administrator invited you.",
        "If you were not expecting this message, you can ignore it.",
      ].join("\n"),
      html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your PolicyCraft manager invitation</title>
</head>
<body style="margin:0;padding:0;background-color:#faf7f1;color:#2d3a32;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#faf7f1;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    An administrator invited you to help manage policies in PolicyCraft.
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#faf7f1" style="width:100%;background-color:#faf7f1;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#fffefa" style="width:100%;max-width:600px;background-color:#fffefa;border:1px solid #e7e2d4;border-collapse:separate;border-spacing:0;">
          <tr>
            <td height="6" bgcolor="#1a5c3a" style="height:6px;background-color:#1a5c3a;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:30px 36px 0;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0;color:#1a5c3a;font-size:15px;font-weight:700;letter-spacing:0.04em;line-height:22px;">PolicyCraft</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 36px 8px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 12px;color:#526158;font-size:15px;line-height:24px;">Hello ${escapedName},</p>
              <h1 style="margin:0 0 16px;color:#103822;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;line-height:1.2;">You’re invited to manage policies</h1>
              <p style="margin:0;color:#2d3a32;font-size:16px;line-height:26px;">An administrator invited you to help manage policies in PolicyCraft. Accept your invitation to get started.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:26px 36px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                <tr>
                  <td align="center" bgcolor="#1a5c3a" style="background-color:#1a5c3a;border-radius:4px;">
                    <a href="${escapedInvitationUrl}" style="display:inline-block;padding:16px 30px;border:1px solid #1a5c3a;border-radius:4px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:20px;text-align:center;text-decoration:none;">Accept invitation</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px 28px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0;text-align:center;color:#526158;font-size:14px;line-height:22px;">This invitation expires in <strong style="color:#2d3a32;">72 hours</strong>.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px;">
              <div style="height:1px;background-color:#e7e2d4;font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 36px 26px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 8px;color:#526158;font-size:13px;line-height:20px;">If the button does not work, copy and paste this address into your browser:</p>
              <p style="margin:0;color:#1a5c3a;font-size:13px;line-height:20px;overflow-wrap:anywhere;word-break:break-all;"><a href="${escapedInvitationUrl}" style="color:#1a5c3a;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all;">${escapedInvitationUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td bgcolor="#f3eee3" style="padding:18px 36px;background-color:#f3eee3;border-top:1px solid #e7e2d4;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 4px;color:#526158;font-size:12px;line-height:18px;">This email was sent by PolicyCraft because an administrator invited you.</p>
              <p style="margin:0;color:#526158;font-size:12px;line-height:18px;">If you were not expecting this message, you can ignore it.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    };

    let transport: InvitationTransport | undefined;
    try {
      transport = transportFactory(config.transportOptions);
      const result = await transport.sendMail(message);
      const acceptedAddresses: unknown[] = result.accepted ?? [];
      const accepted = acceptedAddresses.some((recipient) => {
        if (typeof recipient === "string") return recipient.toLowerCase() === email.toLowerCase();
        if (recipient && typeof recipient === "object" && "address" in recipient) {
          return String(recipient.address).toLowerCase() === email.toLowerCase();
        }
        return false;
      });
      if (!accepted) throw new Error("recipient was not accepted");
    } catch (error) {
      throw safeSmtpError(error, config.provider);
    } finally {
      try { transport?.close(); } catch { /* Closing must not expose SMTP internals or mask delivery status. */ }
    }
  };
}

export async function sendPolicyCraftManagerInvitation(email: string, name: string, invitationUrl: string): Promise<void> {
  await createPolicyCraftInvitationSender()(email, name, invitationUrl);
}

// Checks connection, TLS and authentication only. No message or recipient is submitted.
export async function verifyPolicyCraftInvitationSmtp(env: InvitationMailEnvironment = process.env): Promise<void> {
  const config = readSmtpConfig(env);
  const transport = nodemailer.createTransport(config.transportOptions);
  try {
    await transport.verify();
  } catch (error) {
    throw safeSmtpError(error, config.provider);
  } finally {
    try { transport.close(); } catch { /* Keep provider internals out of logs. */ }
  }
}

function safeSmtpError(error: unknown, provider: InvitationMailProvider): Error {
  const isMailtrap = provider === "mailtrap";
  const variables = isMailtrap
    ? { host: "MAILTRAP_HOST", port: "MAILTRAP_PORT", username: "MAILTRAP_USERNAME", password: "MAILTRAP_PASSWORD", sender: "MAILTRAP_EMAIL" }
    : { host: "MAIL_HOST", port: "MAIL_PORT", username: "MAIL_USERNAME", password: "MAIL_PASSWORD", sender: "MAIL_EMAIL" };
  const reasons: Record<string, string> = {
    EAUTH: isMailtrap
      ? `SMTP authentication failed. Check ${variables.username} and ${variables.password}, sandbox account status and credentials.`
      : `SMTP authentication failed. Check ${variables.username} and ${variables.password}, account status and sending credits in ZeptoMail.`,
    ETIMEDOUT: `SMTP connection timed out. Check ${variables.host}, ${variables.port} and network access.`,
    ECONNECTION: `SMTP connection failed. Check ${variables.host}, ${variables.port} and network access.`,
    ESOCKET: "SMTP socket connection failed. Check network access and TLS settings for the selected provider.",
    EDNS: `SMTP hostname lookup failed. Check ${variables.host} and DNS access.`,
    ETLS: `SMTP TLS connection failed. Check ${variables.host} and ${variables.port}.`,
    EENVELOPE: isMailtrap
      ? "SMTP rejected the sender or recipient. Check the sender address syntax, recipient address and sandbox restrictions."
      : `SMTP rejected the sender or recipient. Check ${variables.sender} verification and the recipient address.`,
    EMESSAGE: "SMTP rejected the invitation message. Check the selected provider's sending restrictions.",
  };
  const details = error && typeof error === "object" ? error as { code?: unknown; responseCode?: unknown } : {};
  const code = typeof details.code === "string" && Object.hasOwn(reasons, details.code) ? details.code : undefined;
  if (!code) return new Error("Unable to send the PolicyCraft invitation email.");
  const responseCode = typeof details.responseCode === "number" && Number.isInteger(details.responseCode)
    && details.responseCode >= 400 && details.responseCode <= 599 ? details.responseCode : undefined;
  // Only static text, an allowlisted code and a numeric status survive. Never retain a cause,
  // raw message, SMTP response, AUTH command, addresses, invitation URL or credentials.
  return new Error(`Unable to send the PolicyCraft invitation email. ${reasons[code]} (${code}${responseCode ? `; SMTP ${responseCode}` : ""})`);
}

function readSmtpConfig(env: InvitationMailEnvironment): SmtpConfig {
  const providerSetting = env.POLICYCRAFT_MAIL_PROVIDER?.trim().toLowerCase();
  const provider = providerSetting || (env.NODE_ENV === "production" ? "zeptomail" : "mailtrap");
  if (provider !== "mailtrap" && provider !== "zeptomail") {
    throw new Error("POLICYCRAFT_MAIL_PROVIDER must be mailtrap or zeptomail.");
  }
  return provider === "mailtrap" ? readMailtrapConfig(env) : readZeptoMailConfig(env);
}

function readZeptoMailConfig(env: InvitationMailEnvironment): SmtpConfig {
  const host = env.MAIL_HOST?.trim();
  const portValue = env.MAIL_PORT?.trim();
  const username = env.MAIL_USERNAME?.trim();
  // Preserve password bytes exactly; whitespace can be part of an SMTP credential.
  const password = env.MAIL_PASSWORD;
  const fromAddress = env.MAIL_EMAIL?.trim();

  if (!host || !portValue || !username || !password || !fromAddress) {
    throw new Error("ZeptoMail SMTP invitations are not configured. Set MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, and MAIL_EMAIL.");
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || (port !== 465 && port !== 587)) {
    throw new Error("MAIL_PORT must be 465 or 587.");
  }

  return {
    provider: "zeptomail",
    fromAddress,
    transportOptions: smtpOptions(host, port, username, password),
  };
}

function readMailtrapConfig(env: InvitationMailEnvironment): SmtpConfig {
  const host = env.MAILTRAP_HOST?.trim();
  const username = env.MAILTRAP_USERNAME?.trim();
  // Preserve password bytes exactly; whitespace can be part of an SMTP credential.
  const password = env.MAILTRAP_PASSWORD;
  const fromAddress = env.MAILTRAP_EMAIL?.trim();
  const portValue = env.MAILTRAP_PORT?.trim();
  if (!host || !username || !password || !fromAddress || !portValue) {
    throw new Error("Mailtrap sandbox invitations are not configured. Set MAILTRAP_HOST, MAILTRAP_PORT, MAILTRAP_USERNAME, MAILTRAP_PASSWORD, and MAILTRAP_EMAIL.");
  }
  if (host !== MAILTRAP_SANDBOX_HOST) {
    throw new Error("MAILTRAP_HOST must be sandbox.smtp.mailtrap.io.");
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || ![2525, 465, 587].includes(port)) {
    throw new Error("MAILTRAP_PORT must be 2525, 465, or 587.");
  }

  return {
    provider: "mailtrap",
    fromAddress,
    transportOptions: smtpOptions(host, port, username, password),
  };
}

function smtpOptions(host: string, port: number, username: string, password: string): SMTPTransport.Options {
  return {
    host,
    port,
    secure: port === 465,
    ...(port !== 465 ? { requireTLS: true } : {}),
    auth: { user: username, pass: password },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    tls: { minVersion: "TLSv1.2" },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}
