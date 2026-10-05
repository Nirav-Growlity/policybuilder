// Render a synthetic invitation through the real sender seam. No SMTP, tokens or accounts.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import type { SendMailOptions } from "nodemailer";
import { createPolicyCraftInvitationSender } from "../lib/policycraft-invitation-mail";

async function main() {
  const output = resolve(process.env.POLICYCRAFT_UI_OUTPUT || "output/playwright");
  const email = "avery@example.test";
  const invitationUrl = "https://policycraft.example.test/accept-invitation?token=preview-only&source=invitation";
  let captured: SendMailOptions | undefined;
  const sender = createPolicyCraftInvitationSender({
    POLICYCRAFT_MAIL_PROVIDER: "mailtrap",
    MAILTRAP_HOST: "sandbox.smtp.mailtrap.io",
    MAILTRAP_PORT: "587",
    MAILTRAP_USERNAME: "preview-only",
    MAILTRAP_PASSWORD: "preview-only",
    MAILTRAP_EMAIL: "invites@policycraft.test",
  }, () => ({
    async sendMail(message) { captured = message; return { accepted: [email] }; },
    close() {},
  }));
  await sender(email, "Avery Manager", invitationUrl);
  assert.equal(typeof captured?.html, "string");
  const html = String(captured?.html);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "invitation-email.html"), html);
  await writeFile(resolve(output, "invitation-email.txt"), String(captured?.text));

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext();
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    for (const [label, viewport] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["mobile", { width: 390, height: 844 }],
    ] as const) {
      await page.setViewportSize(viewport);
      await page.setContent(html);
      const accept = page.getByRole("link", { name: "Accept invitation", exact: true });
      await accept.waitFor();
      assert.equal(await accept.getAttribute("href"), invitationUrl);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label} email must fit the viewport`);
      await page.screenshot({ path: resolve(output, `invitation-email-${label}.png`), fullPage: true });
    }
    console.log(`PASS: synthetic invitation rendered on desktop and mobile; preview saved to ${output}. No email sent.`);
  } finally {
    await browser.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
