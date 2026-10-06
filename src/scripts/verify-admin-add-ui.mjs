// Browser fixture: all application APIs are intercepted; no live roles or accounts change.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.POLICYCRAFT_UI_URL || "http://localhost:3000";
const output = process.env.POLICYCRAFT_UI_OUTPUT || "output/playwright";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: "better-auth.session_token", value: "mock-admin-add-only", url: base }]);
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
let addCount = 0;
let successfulPayloads = [];
let authenticationCalls = 0;
let holdLookup = false;
let releaseLookup;
let lookupStarted;
const started = new Promise((resolve) => { lookupStarted = resolve; });
const pausedLookup = new Promise((resolve) => { releaseLookup = resolve; });
await context.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  let status = 200;
  let result = {};
  if (path === "/api/policycraft/access") {
    result = { actor: { id: "7", name: "Alex Administrator", email: "alex@example.test", role: "admin" }, organizations: [], homeHref: "/admin" };
  } else if (path === "/api/policycraft/admin/administrator") {
    const body = route.request().postDataJSON();
    const recipients = {
      "taylor@example.test": { id: "10", name: "Taylor Recipient", email: body.email, role: "manager" },
      "morgan@example.test": { id: "9", name: "Morgan Manager", email: body.email, role: "manager" },
      "jamie@example.test": { id: "11", name: "Jamie Manager", email: body.email, role: "manager" },
      "admin@example.test": { id: "7", name: "Existing Admin", email: body.email, role: "admin" },
    };
    const recipient = recipients[body.email] || { id: "12", name: "Manager", email: body.email, role: "manager" };
    if (body.action === "lookup") {
      if (holdLookup) { holdLookup = false; lookupStarted(); await pausedLookup; }
      if (body.email === "missing@example.test") { status = 404; result = { error: "No active account matches this email." }; }
      else if (body.email === "admin@example.test") { status = 409; result = { code: "ALREADY_ADMIN", error: "That account already has active PolicyCraft administrator access." }; }
      else result = { recipient };
    } else if (body.action === "add") {
      addCount++;
      if (body.password !== "valid-test-password") { status = 403; result = { error: "Your password is incorrect. Try again." }; }
      else {
        successfulPayloads.push(body);
        result = { added: true, recipient };
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } else {
      status = 400;
      result = { error: "Unsupported action." };
    }
  } else if (path.startsWith("/api/auth/")) authenticationCalls++;
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result) }).catch(() => undefined);
});
await mkdir(output, { recursive: true });
try {
  await page.goto(`${base}/admin/administration`);
  await page.getByRole("heading", { name: "Administration", exact: true }).waitFor();
  const email = page.getByLabel("New administrator email", { exact: true });
  const find = page.getByRole("button", { name: "Find account", exact: true });
  await email.fill("missing@example.test");
  await find.click();
  await page.getByText("No active account matches this email.", { exact: true }).waitFor();
  assert(await email.evaluate((element) => element === document.activeElement));
  holdLookup = true;
  await email.fill("morgan@example.test");
  await find.click();
  await started;
  await email.fill("taylor@example.test");
  await find.click();
  await page.getByText("Taylor Recipient", { exact: true }).waitFor();
  releaseLookup();
  assert.equal(await page.getByText("Morgan Manager", { exact: true }).count(), 0);
  await page.screenshot({ path: `${output}/admin-add-desktop.png`, fullPage: true, animations: "disabled" });

  await page.getByRole("button", { name: "Add administrator", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Your password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Confirm add", exact: true }).click();
  await page.getByText("Your password is incorrect. Try again.", { exact: true }).waitFor();
  assert(await page.getByLabel("Your password", { exact: true }).evaluate((element) => element === document.activeElement));
  assert.equal(addCount, 1);
  assert.equal(new URL(page.url()).pathname, "/admin/administration");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await email.fill("morgan@example.test");
  assert.equal(await page.getByRole("heading", { name: "Review administrator access", exact: true }).count(), 0);
  await find.click();
  await page.getByText("Morgan Manager", { exact: true }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.getByRole("button", { name: "Add administrator", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Your password", { exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  assert(await page.getByRole("dialog").evaluate((dialog) => dialog.contains(document.activeElement)));
  await page.screenshot({ path: `${output}/admin-add-mobile-confirmation.png`, animations: "disabled" });
  await page.getByLabel("Your password", { exact: true }).fill("valid-test-password");
  const add = page.getByRole("button", { name: "Confirm add", exact: true });
  await add.click();
  await add.click({ force: true }).catch(() => undefined);
  await page.getByRole("status").filter({ hasText: "Morgan Manager now has PolicyCraft administrator access." }).waitFor();
  assert.equal(addCount, 2);
  assert.equal(new URL(page.url()).pathname, "/admin/administration");
  assert.equal(await email.inputValue(), "");
  assert.equal(await page.getByRole("heading", { name: "Administration", exact: true }).count(), 1);
  assert.equal(await page.getByText("Alex Administrator", { exact: true }).count(), 1);
  assert.equal(authenticationCalls, 0);
  assert.equal(successfulPayloads[0].recipientId, "9");
  assert.equal(successfulPayloads[0].email, "morgan@example.test");
  assert.equal(successfulPayloads[0].confirmed, true);

  await email.fill("admin@example.test");
  await find.click();
  await page.getByText("This account is already a PolicyCraft administrator. Search for another account to add.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Add administrator", exact: true }).count(), 0);
  assert.equal(await page.getByRole("heading", { name: "Review administrator access", exact: true }).count(), 0);

  await email.fill("jamie@example.test");
  await find.click();
  await page.getByText("Jamie Manager", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add administrator", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Your password", { exact: true }).fill("valid-test-password");
  await page.getByRole("button", { name: "Confirm add", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Jamie Manager now has PolicyCraft administrator access." }).waitFor();
  assert.equal(addCount, 3);
  assert.equal(successfulPayloads[1].recipientId, "11");
  assert.equal(successfulPayloads[1].email, "jamie@example.test");
  assert.equal(authenticationCalls, 0);
  assert.deepEqual(pageErrors, []);
  console.log("PASS: admin add desktop/mobile, lookup failure and stale response, edited recipient invalidation, keyboard password entry and dialog focus/cancel, wrong-password recovery, duplicate-click protection, existing-admin guidance, retained admin session, add-another flow, no auth/signout requests, and no page errors.");
} catch (error) {
  await page.screenshot({ path: `${output}/admin-add-failure.png`, fullPage: true });
  console.error((await page.locator("body").innerText()).slice(-1800));
  throw error;
} finally { releaseLookup(); await browser.close(); }
