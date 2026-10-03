import test from "node:test";
import assert from "node:assert/strict";
import { sendPolicyCraftManagerInvitation } from "./policycraft-invitation-mail";

test("manager mail uses separately configured sender and endpoint without exposing provider failures", async () => {
  const keys = ["ZEPTOMAIL_API_URL", "ZEPTOMAIL_API_KEY", "ZEPTOMAIL_FROM_ADDRESS", "ZEPTOMAIL_FROM_NAME"];
  const previous = keys.map((key) => process.env[key]);
  const originalFetch = globalThis.fetch;
  const requests: { url: string; init?: RequestInit }[] = [];
  try {
    process.env.ZEPTOMAIL_API_URL = "https://mail.example.test/v1.1/email";
    process.env.ZEPTOMAIL_API_KEY = "test-mail-key";
    process.env.ZEPTOMAIL_FROM_ADDRESS = "invites@example.test";
    process.env.ZEPTOMAIL_FROM_NAME = "PolicyCraft";
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response("{}", { status: 200 });
    };
    await sendPolicyCraftManagerInvitation("manager@example.test", "Morgan <Manager>", "https://app.example.test/accept-invitation?token=test&x=1");
    assert.equal(requests[0].url, process.env.ZEPTOMAIL_API_URL);
    const headers = new Headers(requests[0].init?.headers);
    assert.equal(headers.get("Authorization"), "Zoho-enczapikey test-mail-key");
    const body = JSON.parse(String(requests[0].init?.body));
    assert.deepEqual(body.from, { address: "invites@example.test", name: "PolicyCraft" });
    assert.equal(body.to[0].email_address.address, "manager@example.test");
    assert.match(body.htmlbody, /Morgan &lt;Manager&gt;/);
    assert.match(body.htmlbody, /token=test&amp;x=1/);
    assert.match(body.textbody, /72 hours/);
    globalThis.fetch = async () => new Response("private-provider-response", { status: 403 });
    await assert.rejects(sendPolicyCraftManagerInvitation("manager@example.test", "Morgan", "https://app.example.test"), { message: "ZeptoMail rejected the invitation (403)." });
    process.env.ZEPTOMAIL_API_URL = "http://mail.example.test";
    await assert.rejects(sendPolicyCraftManagerInvitation("manager@example.test", "Morgan", "https://app.example.test"), /HTTPS endpoint/);
    delete process.env.ZEPTOMAIL_API_KEY;
    await assert.rejects(sendPolicyCraftManagerInvitation("manager@example.test", "Morgan", "https://app.example.test"), /ZeptoMail is not configured/);
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});
