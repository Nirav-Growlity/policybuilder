// API-mocked invitation UI regression: no database changes or emails.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const base = process.env.POLICYCRAFT_UI_URL || "http://localhost:3000";
const outputRoot = process.env.POLICYCRAFT_UI_OUTPUT || "output/playwright";
const output = join(outputRoot, `invitation-ui-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const organizations = [{ id: 11, code: "ACME", name: "Acme Industries", deleted: false, expired: false }];
const pending = { id: "pending:invite-19", invitationId: "invite-19", name: "Avery Manager", email: "avery@example.test", status: "pending", organizations, policyCount: 0, expiresAt: "2099-10-05T10:00:00Z" };
const requests = [];
let cancelled = false;
let cancelFailuresRemaining = 1;
const errors = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: "better-auth.session_token", value: "mock-ui-only", url: base }]);
await context.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  let data = {};
  if (path === "/api/policycraft/access") data = { actor: { id: "7", name: "Alex Administrator", email: "alex@example.test", role: "admin" }, organizations, homeHref: "/admin" };
  else if (path === "/api/policycraft/admin/managers") data = { managers: cancelled ? [] : [pending], organizations };
  else if (path === "/api/policycraft/admin/invitations/invite-19") {
    const body = route.request().postDataJSON();
    requests.push({ method: route.request().method(), body });
    if (body?.action === "cancel" && cancelFailuresRemaining > 0) {
      cancelFailuresRemaining -= 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Could not cancel this invitation." }) });
      return;
    }
    if (body?.action === "cancel") {
      await new Promise((resolve) => setTimeout(resolve, 800));
      cancelled = true;
      data = { ok: true };
    } else if (body?.action === "resend") {
      data = { success: true, delivery: { sent: false } };
    }
  } else if (path.startsWith("/api/auth/")) data = { user: { id: "7", name: "Alex Administrator", email: "alex@example.test" }, session: {} };
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`${base}/admin`);

  await page.getByRole("button", { name: "Resend", exact: true }).click();
  await page.getByRole("alert").getByText("The invitation is still pending, but email delivery failed.").waitFor();
  assert.deepEqual(requests, [{ method: "PATCH", body: { action: "resend" } }], "resend must remain an independent action");
  await page.getByRole("alert").getByRole("button", { name: "Retry" }).click();

  await page.getByRole("button", { name: "Cancel invite", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Cancel manager invitation?" });
  await dialog.waitFor();
  assert.equal(requests.length, 1, "opening confirmation must not mutate the invitation");
  await dialog.getByRole("button", { name: "Keep invitation", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(requests.length, 1, "dismissing with Keep invitation must not mutate the invitation");

  await page.getByRole("button", { name: "Cancel invite", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Cancel manager invitation?" });
  await dialog.waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(requests.length, 1, "dismissing with Escape must not mutate the invitation");

  await page.getByRole("button", { name: "Cancel invite", exact: true }).click();
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(requests.length, 1, "dismissing with Close must not mutate the invitation");

  await page.getByRole("button", { name: "Cancel invite", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Cancel manager invitation?" });
  await dialog.getByRole("button", { name: "Cancel invitation", exact: true }).click();
  await dialog.getByRole("alert").getByText("Could not cancel this invitation.").waitFor();
  assert.deepEqual(requests.at(-1), { method: "PATCH", body: { action: "cancel" } }, "confirmation must submit cancellation once");
  assert.equal(await dialog.isVisible(), true, "a failed cancellation must leave confirmation open for retry");

  const confirm = dialog.getByRole("button", { name: "Cancel invitation", exact: true });
  await confirm.click();
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some((button) => button.disabled && /Canceling/.test(button.textContent || "")), undefined, { timeout: 1000 });
  assert.equal(await dialog.getByRole("button", { name: "Keep invitation", exact: true }).isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), true, "pending cancellation must not be dismissed");
  await page.getByRole("heading", { name: "No managers yet" }).waitFor();
  await dialog.waitFor({ state: "detached" });
  assert.equal(requests.filter((request) => request.body?.action === "cancel").length, 2, "retry and successful confirmation must submit once each");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}/invitation-cancelled.png`, fullPage: true, animations: "disabled" });

  cancelled = false;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "Cancel invite", exact: true }).click();
  await dialog.waitFor();
  await page.waitForFunction(() => {
    const confirmation = document.querySelector('[role="dialog"]');
    return confirmation && getComputedStyle(confirmation).opacity === "1" && confirmation.parentElement && getComputedStyle(confirmation.parentElement).opacity === "1";
  }, undefined, { timeout: 2000 });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.equal(mobileOverflow, false, "confirmation must not overflow horizontally at 390px");
  await page.screenshot({ path: `${output}/invitation-confirmation-mobile.png`, fullPage: true, animations: "disabled" });
  await dialog.getByRole("button", { name: "Cancel invitation", exact: true }).click();
  await page.getByRole("heading", { name: "No managers yet" }).waitFor();
  assert.equal(requests.filter((request) => request.body?.action === "cancel").length, 3, "mobile confirmation must submit once");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}/invitation-cancelled-mobile.png`, fullPage: true, animations: "disabled" });
  console.log("PASS: resend stays independent; dismissals send no cancellation; failure remains retryable; pending confirmation sends once; success removes the invitation; desktop/mobile layouts have no horizontal overflow.");
} catch (error) {
  await page.screenshot({ path: `${output}/invitation-cancel-failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
