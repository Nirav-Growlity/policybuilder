import test from "node:test";
import assert from "node:assert/strict";
import type { SendMailOptions, Transporter } from "nodemailer";
import { createPolicyCraftInvitationSender } from "./policycraft-invitation-mail";

const validEnv = (): Record<string, string | undefined> => ({
  NODE_ENV: "production",
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

test("sends through authenticated STARTTLS SMTP with an escaped, complete invitation email", async () => {
  const smtp = mockTransport();
  const name = 'Morgan </td><img src=x onerror="alert(1)"> & Co';
  const invitationUrl = 'https://app.example.test/accept?token=a&next=" onclick="alert(1)&other=1';
  await smtp.sender("manager@example.test", name, invitationUrl);

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
  assert.deepEqual(smtp.messages[0]?.to, { name, address: "manager@example.test" });

  const html = String(smtp.messages[0]?.html);
  const text = String(smtp.messages[0]?.text);
  assert.match(html, /PolicyCraft/);
  assert.match(html, /Accept invitation/);
  assert.match(html, /Morgan &lt;\/td&gt;&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; Co/);
  assert.doesNotMatch(html, /<img src=x onerror=/);
  assert.match(html, /href="https:\/\/app\.example\.test\/accept\?token=a&amp;next=&quot; onclick=&quot;alert\(1\)&amp;other=1"/);
  assert.match(html, /This invitation expires in <strong[^>]*>72 hours<\/strong>/);
  assert.match(html, /If the button does not work, copy and paste this address into your browser/);
  assert.match(html, /https:\/\/app\.example\.test\/accept\?token=a&amp;next=&quot; onclick=&quot;alert\(1\)&amp;other=1/);
  assert.doesNotMatch(html, /<a href="https:\/\/app\.example\.test\/accept\?token=a&amp;next=" onclick=/);

  assert.match(text, /Hello Morgan <\/td><img src=x onerror="alert\(1\)"> & Co/);
  assert.match(text, /Accept invitation:\nhttps:\/\/app\.example\.test\/accept\?token=a&next=" onclick="alert\(1\)&other=1/);
  assert.match(text, /This invitation expires in 72 hours/);
  assert.match(text, /If the button does not work, copy and paste this address into your browser/);
  assert.equal((text.match(/https:\/\/app\.example\.test\/accept\?token=a&next=" onclick="alert\(1\)&other=1/g) ?? []).length, 2);
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

test("retains safe SMTP authentication diagnostics without provider text or credentials", async () => {
  const smtp = mockTransport(async () => {
    throw Object.assign(new Error("535 password secret-token manager@example.test"), {
      code: "EAUTH", responseCode: 535, response: "secret-token", command: "AUTH PLAIN secret-token",
    });
  });
  await assert.rejects(smtp.sender("manager@example.test", "Morgan", "https://app.example.test/accept"), (error: Error) => {
    assert.match(error.message, /SMTP authentication failed/);
    assert.match(error.message, /EAUTH; SMTP 535/);
    assert.match(error.message, /MAIL_USERNAME and MAIL_PASSWORD/);
    assert.doesNotMatch(JSON.stringify(error) + error.stack, /secret-token|manager@example\.test|AUTH PLAIN/);
    return true;
  });
  assert.equal(smtp.closeCount, 1);
});

test("distinguishes connection and envelope failures using only allowed diagnostics", async () => {
  for (const [code, responseCode, expected] of [
    ["ETIMEDOUT", undefined, /SMTP connection timed out/],
    ["EENVELOPE", 553, /SMTP rejected the sender or recipient/],
    ["ETLS", undefined, /SMTP TLS connection failed/],
  ] as const) {
    const smtp = mockTransport(async () => { throw { code, responseCode, response: "secret-token" }; });
    await assert.rejects(smtp.sender("manager@example.test", "Morgan", "https://app.example.test/accept"), (error: Error) => {
      assert.match(error.message, expected);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    });
  }
});

test("never copies unknown SMTP diagnostic fields", async () => {
  const smtp = mockTransport(async () => { throw { code: "secret-token", responseCode: "535 secret-token" }; });
  await assert.rejects(smtp.sender("manager@example.test", "Morgan", "https://app.example.test/accept"), (error: Error) =>
    error.message === "Unable to send the PolicyCraft invitation email.");
});

test("defaults non-production delivery to the isolated Mailtrap sandbox over STARTTLS on port 2525", async () => {
  const env = {
    ...validEnv(),
    NODE_ENV: "development",
    MAILTRAP_HOST: "sandbox.smtp.mailtrap.io",
    MAILTRAP_USERNAME: "sandbox-user",
    MAILTRAP_PASSWORD: "sandbox secret",
    MAILTRAP_EMAIL: "invites@policycraft.test",
    MAILTRAP_PORT: "2525",
  };
  let options: unknown;
  const sender = createPolicyCraftInvitationSender(env, (config) => {
    options = config;
    return { sendMail: async () => ({ accepted: ["manager@example.test"] }), close: () => undefined } as unknown as Transporter;
  });

  await sender("manager@example.test", "Morgan", "https://app.example.test/accept");
  assert.deepEqual(options, {
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    secure: false,
    requireTLS: true,
    auth: { user: "sandbox-user", pass: "sandbox secret" },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000,
    tls: { minVersion: "TLSv1.2" },
  });
});

test("does not fall back to production MAIL credentials when sandbox credentials are missing", async () => {
  const env = { ...validEnv(), NODE_ENV: "development" };
  let transportCreated = false;
  const sender = createPolicyCraftInvitationSender(env, () => {
    transportCreated = true;
    throw new Error("must not construct a transport");
  });
  await assert.rejects(sender("manager@example.test", "Morgan", "https://app.example.test/accept"), /MAILTRAP_USERNAME/);
  assert.equal(transportCreated, false);
});

test("supports an explicit Mailtrap provider in production without using ZeptoMail settings", async () => {
  const env = {
    ...validEnv(),
    POLICYCRAFT_MAIL_PROVIDER: "mailtrap",
    MAILTRAP_HOST: "sandbox.smtp.mailtrap.io",
    MAILTRAP_USERNAME: "sandbox-user",
    MAILTRAP_PASSWORD: "sandbox secret",
    MAILTRAP_EMAIL: "invites@policycraft.test",
    MAILTRAP_PORT: "587",
  };
  let options: unknown;
  const sender = createPolicyCraftInvitationSender(env, (config) => {
    options = config;
    return { sendMail: async () => ({ accepted: ["manager@example.test"] }), close: () => undefined } as unknown as Transporter;
  });
  await sender("manager@example.test", "Morgan", "https://app.example.test/accept");
  assert.equal((options as { host: string }).host, "sandbox.smtp.mailtrap.io");
  assert.deepEqual((options as { auth: unknown }).auth, { user: "sandbox-user", pass: "sandbox secret" });
});

test("rejects an unsupported provider before constructing a transport", async () => {
  const env = { ...validEnv(), POLICYCRAFT_MAIL_PROVIDER: "unknown-provider" };
  let transportCreated = false;
  const sender = createPolicyCraftInvitationSender(env, () => {
    transportCreated = true;
    throw new Error("must not construct a transport");
  });
  await assert.rejects(sender("manager@example.test", "Morgan", "https://app.example.test/accept"), /POLICYCRAFT_MAIL_PROVIDER/);
  assert.equal(transportCreated, false);
});

test("uses provider-safe diagnostics for Mailtrap authentication errors", async () => {
  const env = {
    ...validEnv(),
    NODE_ENV: "development",
    MAILTRAP_HOST: "sandbox.smtp.mailtrap.io",
    MAILTRAP_USERNAME: "sandbox-user",
    MAILTRAP_PASSWORD: "sandbox secret",
    MAILTRAP_EMAIL: "invites@policycraft.test",
    MAILTRAP_PORT: "2525",
  };
  const sender = createPolicyCraftInvitationSender(env, () => ({
    sendMail: async () => { throw Object.assign(new Error("535 leaked password"), { code: "EAUTH", responseCode: 535 }); },
    close: () => undefined,
  } as unknown as Transporter));
  await assert.rejects(sender("manager@example.test", "Morgan", "https://app.example.test/accept"), (error: Error) => {
    assert.match(error.message, /MAILTRAP_USERNAME and MAILTRAP_PASSWORD/);
    assert.doesNotMatch(error.message, /ZeptoMail|MAIL_USERNAME|MAIL_PASSWORD|leaked password/);
    return true;
  });
});

test("rejects the Mailtrap live SMTP endpoint so sandbox delivery stays isolated", async () => {
  const env = {
    NODE_ENV: "development",
    MAILTRAP_HOST: "smtp.mailtrap.io",
    MAILTRAP_PORT: "2525",
    MAILTRAP_USERNAME: "sandbox-user",
    MAILTRAP_PASSWORD: "sandbox secret",
    MAILTRAP_EMAIL: "invites@policycraft.test",
  };
  let transportCreated = false;
  const sender = createPolicyCraftInvitationSender(env, () => {
    transportCreated = true;
    throw new Error("must not construct a transport");
  });
  await assert.rejects(sender("manager@example.test", "Morgan", "https://app.example.test/accept"), /MAILTRAP_HOST must be sandbox/);
  assert.equal(transportCreated, false);
});

test("allows an explicit ZeptoMail selection in non-production", async () => {
  const env = { ...validEnv(), NODE_ENV: "development", POLICYCRAFT_MAIL_PROVIDER: "zeptomail" };
  let options: unknown;
  const sender = createPolicyCraftInvitationSender(env, (config) => {
    options = config;
    return { sendMail: async () => ({ accepted: ["manager@example.test"] }), close: () => undefined } as unknown as Transporter;
  });
  await sender("manager@example.test", "Morgan", "https://app.example.test/accept");
  assert.equal((options as { host: string }).host, "smtp.zeptomail.com");
});

test("supports an unset NODE_ENV as the Mailtrap default", async () => {
  const env = {
    MAILTRAP_HOST: "sandbox.smtp.mailtrap.io",
    MAILTRAP_PORT: "2525",
    MAILTRAP_USERNAME: "sandbox-user",
    MAILTRAP_PASSWORD: "sandbox secret",
    MAILTRAP_EMAIL: "invites@policycraft.test",
  };
  let host: string | undefined;
  const sender = createPolicyCraftInvitationSender(env, (config) => {
    host = config.host;
    return { sendMail: async () => ({ accepted: ["manager@example.test"] }), close: () => undefined } as unknown as Transporter;
  });
  await sender("manager@example.test", "Morgan", "https://app.example.test/accept");
  assert.equal(host, "sandbox.smtp.mailtrap.io");
});
