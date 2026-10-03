import nodemailer from "nodemailer";
import type { SendMailOptions } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const SMTP_TIMEOUT_MS = 15_000;

type InvitationMailEnvironment = Record<string, string | undefined>;
type InvitationDeliveryResult = { accepted?: Array<string | { address: string }> };
type InvitationTransport = {
  sendMail(message: SendMailOptions): Promise<InvitationDeliveryResult>;
  close(): void;
};
type InvitationTransportFactory = (options: SMTPTransport.Options) => InvitationTransport;

export function createPolicyCraftInvitationSender(
  env: InvitationMailEnvironment = process.env,
  transportFactory: InvitationTransportFactory = (options) => nodemailer.createTransport(options),
): (email: string, name: string, invitationUrl: string) => Promise<void> {
  return async (email, name, invitationUrl) => {
    const config = readSmtpConfig(env);
    const message: SendMailOptions = {
      from: { name: "PolicyCraft", address: config.fromAddress },
      to: { name, address: email },
      subject: "Your PolicyCraft manager invitation",
      text: `Hello ${name},\n\nYou have been invited to manage policies in PolicyCraft. Accept your invitation within 72 hours:\n${invitationUrl}\n\nIf you were not expecting this message, you can ignore it.`,
      html: `<p>Hello ${escapeHtml(name)},</p><p>You have been invited to manage policies in PolicyCraft.</p><p><a href="${escapeHtml(invitationUrl)}">Accept invitation</a></p><p>This invitation expires in 72 hours. If you were not expecting this message, you can ignore it.</p>`,
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
    } catch {
      // SMTP errors may include server responses or configuration details. Keep them out of API logs.
      throw new Error("Unable to send the PolicyCraft invitation email.");
    } finally {
      try { transport?.close(); } catch { /* Closing must not expose SMTP internals or mask delivery status. */ }
    }
  };
}

export async function sendPolicyCraftManagerInvitation(email: string, name: string, invitationUrl: string): Promise<void> {
  await createPolicyCraftInvitationSender()(email, name, invitationUrl);
}

function readSmtpConfig(env: InvitationMailEnvironment): { fromAddress: string; transportOptions: SMTPTransport.Options } {
  const host = env.MAIL_HOST?.trim();
  const portValue = env.MAIL_PORT?.trim();
  const username = env.MAIL_USERNAME?.trim();
  // Preserve password bytes exactly; whitespace can be part of an SMTP credential.
  const password = env.MAIL_PASSWORD;
  const fromAddress = env.MAIL_EMAIL?.trim();

  if (!host || !portValue || !username || !password || !fromAddress) {
    throw new Error("SMTP invitation mail is not configured. Set MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, and MAIL_EMAIL.");
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || (port !== 465 && port !== 587)) {
    throw new Error("MAIL_PORT must be 465 or 587.");
  }

  return {
    fromAddress,
    transportOptions: {
      host,
      port,
      secure: port === 465,
      ...(port === 587 ? { requireTLS: true } : {}),
      auth: { user: username, pass: password },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      tls: { minVersion: "TLSv1.2" },
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}
