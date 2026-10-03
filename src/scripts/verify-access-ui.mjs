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
const managerRequests = [];
const invitationRequests = [];
let newInviteAccepted = false;
let sessionCleared = false;
let signOutCalls = 0;
let signOutFailuresRemaining = 0;
let invitationPostCount = 0;
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
  if (path === "/api/policycraft/access") {
    if (newInviteAccepted && sessionCleared) { status = 401; data = { error: "Unauthorized" }; }
    else data = { actor: { id: "7", name: "Alex Administrator", email: "alex@example.test", role }, organizations, homeHref: role === "admin" ? "/admin" : "/manager" };
  }
  else if (path === "/api/policycraft/admin/managers" && route.request().method() === "POST") {
    inviteCount++;
    const request = route.request().postDataJSON();
    managerRequests.push(request);
    if (inviteCount === 1) {
      data = { code: "ACCOUNT_EXISTS", existingAccount: { id: "9", name: "Morgan Manager", email: "morgan@example.test" } };
      status = 409;
    } else if (request.linkExisting === true) {
      data = { mode: "existing", manager: { id: "9", name: "Morgan Manager", email: "morgan@example.test", status: "active", organizations, policyCount: 3 }, delivery: { sent: false } };
    } else {
      data = { mode: "new", manager: { id: "19", name: request.name, email: request.email, status: "pending", organizations: [], policyCount: 0 }, invitation: { id: "invite-19" }, delivery: { sent: true } };
      status = 201;
    }
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
  else if (path.startsWith("/api/invitations/")) {
    invitationRequests.push({ method: route.request().method(), body: route.request().postDataJSON() });
    if (route.request().method() === "GET") {
      data = { invitation: { mode: "new", email: "avery@example.test", name: "Avery New Manager", expiresAt: "2026-10-04T10:00:00Z" } };
    } else {
      invitationPostCount++;
      newInviteAccepted = true;
      data = { accepted: true, mode: "new", userId: "19", next: "/login" };
    }
  }
  else if (path === "/api/auth/sign-out") {
    signOutCalls++;
    if (signOutFailuresRemaining > 0) {
      signOutFailuresRemaining--;
      status = 500;
      data = { message: "Could not sign out." };
    } else {
      sessionCleared = true;
      data = { success: true };
    }
  }
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
  await page.getByRole("button", { name: "Add manager", exact: true }).click();
  await page.getByRole("button", { name: "Grant manager access", exact: true }).waitFor();
  await page.getByText("No invitation or new password email will be sent.", { exact: false }).waitFor();
  await page.screenshot({ path: `${output}/existing-account-confirmation-desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "Grant manager access", exact: true }).click();
  await page.getByRole("heading", { name: "Manager access granted", exact: true }).waitFor();
  await page.screenshot({ path: `${output}/manager-access-granted-desktop.png`, fullPage: true });
  assert.equal(managerRequests[1].linkExisting, true);
  assert.equal(managerRequests[1].confirmedExistingAccountId, "9", "confirmation stays bound to the reviewed shared account");
  assert.equal(managerRequests[1].name, "Morgan Manager", "existing account name remains canonical");
  assert.equal(managerRequests[1].email, "morgan@example.test");
  assert.equal(invitationRequests.length, 0, "existing account access does not create or send an invitation");

  await page.goto(`${base}/admin/managers/new`);
  await page.getByLabel("Full name", { exact: true }).fill("Avery New Manager");
  await page.getByLabel("Work email", { exact: true }).fill("avery@example.test");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Add manager", exact: true }).click();
  await page.getByRole("heading", { name: "Invitation sent", exact: true }).waitFor();
  assert.equal(managerRequests[2].linkExisting, undefined, "new accounts use the invitation path");

  await page.goto(`${base}/accept-invitation?token=mock-token`);
  await page.getByLabel("Create password", { exact: true }).waitFor();
  await page.getByLabel("Confirm password", { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/new-manager-password-desktop.png`, fullPage: true });
  await page.getByLabel("Create password", { exact: true }).fill("valid-test-password");
  await page.getByLabel("Confirm password", { exact: true }).fill("valid-test-password");
  await page.getByRole("button", { name: "Create account & accept", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("next") === "/manager");
  await page.getByRole("heading", { name: "Sign in to your workspace", exact: true }).waitFor();
  assert.deepEqual(invitationRequests.map(({ method }) => method), ["GET", "POST"]);
  assert.deepEqual(invitationRequests[1].body, { password: "valid-test-password" });
  assert.equal(signOutCalls, 1, "new account acceptance clears the previous signed-in account");
  assert.equal(sessionCleared, true);

  newInviteAccepted = false;
  sessionCleared = false;
  role = "admin";
  signOutFailuresRemaining = 1;
  await page.goto(`${base}/accept-invitation?token=mock-token-cleanup-retry`);
  await page.getByLabel("Create password", { exact: true }).waitFor();
  await page.getByLabel("Create password", { exact: true }).fill("another-test-password");
  await page.getByLabel("Confirm password", { exact: true }).fill("another-test-password");
  await page.getByRole("button", { name: "Create account & accept", exact: true }).click();
  await page.getByRole("heading", { name: "Manager account created", exact: true }).waitFor();
  await page.getByRole("button", { name: "Retry sign in", exact: true }).waitFor();
  assert.equal(invitationPostCount, 2, "the accepted invitation is not posted again after sign-out fails");
  await page.screenshot({ path: `${output}/new-manager-accepted-signout-retry.png`, fullPage: true });
  await page.getByRole("button", { name: "Retry sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("next") === "/manager");
  await page.getByRole("heading", { name: "Sign in to your workspace", exact: true }).waitFor();
  assert.equal(invitationPostCount, 2, "sign-in retry does not repost the consumed invitation");
  assert.equal(signOutCalls, 3, "retry repeats only the session cleanup step");
  newInviteAccepted = false;
  sessionCleared = false;
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
  role = "admin";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/admin/managers/new`);
  await page.getByRole("heading", { name: "Add manager", exact: true }).waitFor();
  await page.screenshot({ path: `${output}/manager-add-mobile.png`, fullPage: true });
  includeDocument = true;
  await page.setViewportSize({ width: 1440, height: 1000 });
  role = "manager";
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
  console.log("PASS: direct existing-account grant without invitation; new-account acceptance clears the prior session; sign-out failure retries without reposting the consumed invitation; desktop/mobile workspaces, assignment revocation, modal keyboard containment, organization selection, pending-save guards, and no page errors.");
} catch (error) {
  await page.screenshot({ path: `${output}/access-ui-failure.png`, fullPage: true });
  console.error((await page.locator("body").innerText()).slice(-2500));
  throw error;
} finally { await browser.close(); }
