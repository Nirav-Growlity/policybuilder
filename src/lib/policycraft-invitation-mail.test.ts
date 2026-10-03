import test from "node:test";
import assert from "node:assert/strict";
import type { SendMailOptions, Transporter } from "nodemailer";
import { createPolicyCraftInvitationSender } from "./policycraft-invitation-mail";

const validEnv = (): Record<string, string | undefined> => ({
  MAIL_HOST: "smtp.zeptomail.com",
  MAIL_PORT: "587",
  MAIL_USERNAME: "emailapikey",
  MAIL_PASSWORD: "  secret with preserved spaces  ",
  MAIL_EMAIL: "invites@example.test",
  ADMIN_EMAIL: "admin@example.test",
});

function mockTransport(
  onSend: (message: SendMailOptions) => Promise<{ accepted: Array<string | { address: string }> }> = async () => ({
    accepted: ["manager@example.test"],
  }),
) {
  const options: unknown[] = [];
  const messages: SendMailOptions[] = [];
  let closeCount = 0;
  const sender = createPolicyCraftInvitationSender(validEnv(), (config) => {
    options.push(config);
    return {
      sendMail: async (message: SendMailOptions) => {
        messages.push(message);
        return onSend(message);
      },
      close: () => { closeCount += 1; },
    } as unknown as Transporter;
  });
  return { sender, options, messages, get closeCount() { return closeCount; } };
}

test("sends through authenticated STARTTLS SMTP using the configured sender and escaped invitation content", async () => {
  const smtp = mockTransport();
  await smtp.sender("manager@example.test", "Morgan <Manager> & Co", "https://app.example.test/accept?token=a&other=1");

  assert.deepEqual(smtp.options[0], {
    host: "smtp.zeptomail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: "emailapikey", pass: "  secret with preserved spaces  " },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000,
    tls: { minVersion: "TLSv1.2" },
  });
  assert.deepEqual(smtp.messages[0]?.from, { name: "PolicyCraft", address: "invites@example.test" });
  assert.deepEqual(smtp.messages[0]?.to, { name: "Morgan <Manager> & Co", address: "manager@example.test" });
  assert.match(String(smtp.messages[0]?.html), /Morgan &lt;Manager&gt; &amp; Co/);
  assert.match(String(smtp.messages[0]?.html), /token=a&amp;other=1/);
  assert.match(String(smtp.messages[0]?.text), /72 hours/);
  assert.equal(smtp.closeCount, 1);
});

test("uses implicit TLS on port 465", async () => {
  const env = validEnv();
  env.MAIL_PORT = "465";
  let transportOptions: unknown;
  const sender = createPolicyCraftInvitationSender(env, (config) => {
    transportOptions = config;
    return {
      sendMail: async () => ({
        accepted: ["manager@example.test"],
      }),
      close: () => undefined,
    } as unknown as Transporter;
  });
  await sender("manager@example.test", "Morgan", "https://app.example.test/accept");
  assert.deepEqual(transportOptions, {
    host: "smtp.zeptomail.com",
    port: 465,
    secure: true,
    auth: { user: "emailapikey", pass: "  secret with preserved spaces  " },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000,
    tls: { minVersion: "TLSv1.2" },
  });
});

test("does not treat ADMIN_EMAIL as the sender when MAIL_EMAIL is missing", async () => {
  const env = validEnv();
  delete env.MAIL_EMAIL;
  let transportCreated = false;
  const sender = createPolicyCraftInvitationSender(env, () => {
    transportCreated = true;
    throw new Error("must not construct a transport");
  });
  await assert.rejects(sender("manager@example.test", "Morgan", "https://app.example.test/accept"), /MAIL_EMAIL/);
  assert.equal(transportCreated, false);
});

test("rejects missing and unsupported SMTP configuration before constructing a transport", async () => {
  for (const [key, value, expected] of [
    ["MAIL_HOST", "", /MAIL_HOST/],
    ["MAIL_USERNAME", "", /MAIL_USERNAME/],
    ["MAIL_PASSWORD", "", /MAIL_PASSWORD/],
    ["MAIL_PORT", "2525", /465 or 587/],
    ["MAIL_PORT", "not-a-port", /465 or 587/],
  ] as const) {
    const env = validEnv();
    env[key] = value;
    let transportCreated = false;
    const sender = createPolicyCraftInvitationSender(env, () => {
      transportCreated = true;
      throw new Error("must not construct a transport");
    });
    await assert.rejects(sender("manager@example.test", "Morgan", "https://app.example.test/accept"), expected);
    assert.equal(transportCreated, false);
  }
});

test("sanitizes SMTP errors and rejects a recipient the SMTP server did not accept", async () => {
  const smtpFailure = mockTransport(async () => { throw new Error("535 bad password secret-token"); });
  await assert.rejects(
    smtpFailure.sender("manager@example.test", "Morgan", "https://app.example.test/accept"),
    (error: Error) => error.message === "Unable to send the PolicyCraft invitation email." && !error.message.includes("secret-token"),
  );
  assert.equal(smtpFailure.closeCount, 1);

  const rejected = mockTransport(async () => ({
    accepted: [],
  }));
  await assert.rejects(rejected.sender("manager@example.test", "Morgan", "https://app.example.test/accept"), /Unable to send/);
  assert.equal(rejected.closeCount, 1);
});
