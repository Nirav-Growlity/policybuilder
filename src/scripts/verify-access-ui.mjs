// API-mocked browser checks: no database, accounts, or emails are touched.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { initialPolicy } from "../lib/store.ts";

const base = process.env.POLICYCRAFT_UI_URL || "http://localhost:3014";
const output = process.env.POLICYCRAFT_UI_OUTPUT || "output/playwright";
const organizations = [
  { id: 11, code: "ACME", name: "Acme Industries", deleted: false, expired: false },
  { id: 22, code: "GREEN", name: "Greenfield Group", deleted: false, expired: false },
];
let role = "admin";
let patch;
let inviteCount = 0;
let savedState;
let failSave = false;
let includeDocument = false;
const policy = initialPolicy();
policy.company.name = "Greenfield Group";
const document = { id: "mock-policy", title: "Shared environmental policy", policyType: "environmental", currentStep: "declaration", lockVersion: 1, updatedAt: "2026-10-01T10:00:00Z", createdAt: "2026-10-01T10:00:00Z", archivedAt: null, organization: organizations[1], createdBy: { id: "9", name: "Morgan Manager", email: "morgan@example.test" }, state: { step: "declaration", policy, importedPolicy: null } };
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: "better-auth.session_token", value: "mock-ui-only", url: base }]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let navigationDialogs = 0;
page.on("dialog", async (dialog) => { navigationDialogs++; await dialog.dismiss(); });
await context.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  let data;
  let status = 200;
  if (path === "/api/policycraft/access") data = { actor: { id: "7", name: "Alex Administrator", email: "alex@example.test", role }, organizations, homeHref: role === "admin" ? "/admin" : "/manager" };
  else if (path === "/api/policycraft/admin/managers" && route.request().method() === "POST") {
    inviteCount++;
    data = inviteCount === 1 ? { code: "ACCOUNT_EXISTS", existingAccount: { id: "9", name: "Morgan Manager", email: "morgan@example.test" } } : { manager: { email: "morgan@example.test" }, delivery: { sent: true } };
    status = inviteCount === 1 ? 409 : 200;
  } else if (path === "/api/policycraft/admin/managers") data = { managers: [{ id: "9", name: "Morgan Manager", email: "morgan@example.test", status: "active", organizations, policyCount: 3 }], organizations };
  else if (path === "/api/policycraft/admin/managers/9") { patch = route.request().postDataJSON(); data = { success: true }; }
  else if (path === "/api/policycraft/documents" || path === "/api/policycraft/admin/documents") data = { documents: includeDocument ? [document] : [], creators: [document.createdBy] };
  else if (path === "/api/policycraft/documents/mock-policy") {
    if (route.request().method() === "PATCH") {
      savedState = route.request().postDataJSON().state;
      status = failSave ? 403 : 200;
    }
    data = { document: { ...document, state: savedState || document.state, lockVersion: 2 } };
  }
  else if (path.startsWith("/api/invitations/")) data = { mode: "new", email: "morgan@example.test", name: "Morgan Manager", expiresAt: "2026-10-04T10:00:00Z" };
  else if (path.startsWith("/api/auth/")) data = { user: { id: "7", name: "Alex Administrator", email: "alex@example.test" }, session: {} };
  else data = {};
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
});
await mkdir(output, { recursive: true });
try {
  await page.goto(`${base}/admin`);
  await page.getByRole("heading", { name: "Managers", exact: true }).waitFor();
  await page.getByRole("button", { name: "Assignments", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").getByRole("checkbox").first().focus();
  await page.keyboard.press("Shift+Tab");
  assert(await page.getByRole("dialog").evaluate((dialog) => dialog.contains(document.activeElement)));
  await page.screenshot({ path: `${output}/admin-assignments-desktop.png`, fullPage: true });
  for (const checkbox of await page.getByRole("dialog").getByRole("checkbox").all()) await checkbox.uncheck();
  await page.getByRole("button", { name: "Save assignments" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.deepEqual(patch.organizationIds, []);
  await page.goto(`${base}/admin/managers/new`);
  await page.getByLabel("Full name", { exact: true }).fill("Morgan Manager");
  await page.getByLabel("Work email", { exact: true }).fill("morgan@example.test");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await page.getByRole("button", { name: "Link existing account", exact: true }).waitFor();
  await page.getByRole("button", { name: "Link existing account", exact: true }).click();
  await page.getByRole("heading", { name: "Invitation sent", exact: true }).waitFor();
  includeDocument = true;
  await page.goto(`${base}/admin/policies`);
  await page.getByRole("heading", { name: "All policies" }).waitFor();
  await page.getByText(document.title, { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/admin-policies-desktop.png`, fullPage: true });
  includeDocument = false;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/admin`);
  await page.getByRole("button", { name: "Assignments", exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: `${output}/admin-mobile.png`, fullPage: true });
  role = "manager";
  await page.goto(`${base}/manager?orgId=11`);
  await page.getByRole("heading", { name: "Acme Industries", exact: true }).waitFor();
  await page.getByLabel("Organization", { exact: true }).selectOption("22");
  await page.getByRole("heading", { name: "Greenfield Group", exact: true }).waitFor();
  await page.screenshot({ path: `${output}/manager-mobile.png`, fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.goto(`${base}/accept-invitation?token=mock-token`);
  await page.getByRole("heading").first().waitFor();
  await page.screenshot({ path: `${output}/invitation-mobile.png`, fullPage: true });
  includeDocument = true;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/manager?orgId=22`);
  await page.getByRole("link", { name: "Open", exact: true }).waitFor();
  const managerHistory = await page.evaluate(() => history.state);
  await page.getByRole("link", { name: "Open", exact: true }).click();
  await page.locator("textarea").first().waitFor();
  await page.screenshot({ path: `${output}/builder-before-history.png`, fullPage: true });
  await page.locator("textarea").first().click();
  await page.locator("textarea").first().fill("Pending shared policy change.");
  failSave = true;
  // Preserve Next's history metadata and create a same-document Back target.
  // API-mocked RSC navigation can otherwise exercise a full document reload.
  await page.evaluate((managerState) => {
    const builder = location.href;
    const state = history.state;
    history.replaceState(managerState, "", "/manager?orgId=22");
    history.pushState(state, "", builder);
  }, managerHistory);
  await page.getByRole("link", { name: "Workspace", exact: true }).click();
  await page.getByText("Could not save this policy.", { exact: true }).waitFor();
  assert(new URL(page.url()).pathname === "/builder", "failed saves must block history navigation");
  failSave = false;
  await page.evaluate(() => history.back());
  await page.getByRole("heading", { name: "Organizations & policies", exact: true }).waitFor();
  assert(savedState && JSON.stringify(savedState).includes("Pending shared policy change."));
  assert.equal(navigationDialogs, 0, "same-document navigation uses the save guard");
  await page.getByRole("link", { name: "Open", exact: true }).click();
  await page.locator("textarea").first().click();
  await page.locator("textarea").first().fill("Another pending change.");
  failSave = true;
  const reloadDialog = page.waitForEvent("dialog");
  await page.evaluate(() => location.assign("/manager?orgId=22"));
  assert.equal((await reloadDialog).type(), "beforeunload");
  assert.equal(new URL(page.url()).pathname, "/builder", "dismissed reload must keep the unsaved policy open");
  assert.deepEqual(errors, []);
  console.log("PASS: desktop/mobile workspaces, assignment revocation, modal keyboard containment, existing-account invite link, organization selection, pending-save history and reload guards, no page errors.");
} catch (error) {
  await page.screenshot({ path: `${output}/access-ui-failure.png`, fullPage: true });
  console.error((await page.locator("body").innerText()).slice(-2500));
  throw error;
} finally { await browser.close(); }
