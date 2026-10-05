// API-mocked workspace regressions. Every API request is intercepted; no live data changes.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { initialPolicy } from "../lib/store.ts";

const base = process.env.POLICYCRAFT_UI_URL || "http://localhost:3000";
const output = process.env.POLICYCRAFT_UI_OUTPUT || "output/playwright/workspace-polish";
const organizations = [
  { id: 11, code: "NORTH", name: "Northstar Manufacturing and Sustainable Supply Chain Operations", deleted: false, expired: false },
  { id: 22, code: "RIVER", name: "Riverside Group", deleted: false, expired: false },
];
const creator = { id: "9", name: "Morgan Alexandra Manager", email: "morgan.alexandra@example.test" };
const compactOrganizations = [
  { id: 501, code: "REALTY", name: "Growlity_Realty" },
  { id: 502, code: "ESG", name: "ESGCare 2.0" },
  { id: 503, code: "TEST-A", name: "Growlity - Testing" },
  { id: 504, code: "GROW", name: "Growlity Private Limited" },
  { id: 505, code: "TEST-B", name: "Growlity - Testing" },
  { id: 506, code: "NIR", name: "Nirav" },
];
const managers = [
  { ...creator, status: "active", organizations, policyCount: 12 },
  { id: "12", name: "Dev", email: "dev@example.test", status: "active", organizations: compactOrganizations, policyCount: 0 },
  { id: "13", name: "Nirav Surati", email: "nirav@example.test", status: "active", organizations: compactOrganizations.slice(0, 5), policyCount: 0 },
  { id: "10", name: "Taylor Disabled Manager", email: "taylor@example.test", status: "disabled", organizations: [organizations[1]], policyCount: 0 },
  { id: "pending:invite-19", name: "Avery Invited Manager", email: "avery@example.test", status: "pending", organizations: [organizations[0]], policyCount: 0, invitationId: "invite-19", expiresAt: "2099-10-05T10:00:00Z" },
];
function document(id, title, type, organization) {
  const policy = initialPolicy(type);
  policy.title = title;
  policy.company.name = organization.name;
  return { id, title, policyType: type, currentStep: "declaration", lockVersion: 1, updatedAt: "2026-10-05T10:00:00Z", createdAt: "2026-10-01T10:00:00Z", archivedAt: null, organization, createdBy: creator, coverPreview: { ...policy, company: policy.company }, state: { step: "declaration", policy, importedPolicy: null } };
}
let documents = [
  document("environmental", "Environmental stewardship and responsible resource management policy", "environmental", organizations[0]),
  document("social", "Social responsibility policy", "labour-human-rights", organizations[0]),
  document("riverside", "Riverside environmental policy", "environmental", organizations[1]),
];
documents[2].updatedAt = "2026-10-05T11:00:00Z";
const additionalAdminDocuments = Array.from({ length: 20 }, (_, index) => document(
  `admin-fixture-${index}`,
  `Growlity Private Limited ${index % 2 ? "labour and human rights" : "environmental"} policy — supply chain standards and responsible operations ${index + 1}`,
  index % 2 ? "labour-human-rights" : "environmental",
  organizations[index % 2],
));
let role = "admin";
let failManagers = false;
let failAssignment = false;
let failPolicies = false;
let failedOrganization = null;
let singleOrganization = false;
let failMutation = false;
let failSignOut = false;
let failRefreshAfterDelete = false;
let pausedOrganization = null;
let releaseOrganization;
let organizationRequestStarted;
let emptyOrganizations = false;
const mutations = [];
const managerListRequests = [];
const errors = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
await context.addCookies([{ name: "better-auth.session_token", value: "mock-workspace-polish", url: base }]);
await context.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const method = route.request().method();
  let status = 200;
  let data = {};
  if (method !== "GET") mutations.push({ path, method, orgId: url.searchParams.get("orgId"), body: route.request().postDataJSON() });
  if (path === "/api/policycraft/access") data = { actor: { id: "7", name: "Alex Administrator With A Long Account Name", email: "alex@example.test", role }, organizations: emptyOrganizations ? [] : singleOrganization ? [organizations[0]] : role === "manager" ? [...organizations, { id: 33, code: "DEL", name: "Deleted organization", deleted: true, expired: false }, { id: 44, code: "EXP", name: "Expired organization", deleted: false, expired: true }] : organizations, homeHref: role === "admin" ? "/admin" : "/manager" };
  else if (path === "/api/policycraft/admin/managers") { status = failManagers ? 503 : 200; data = { managers, organizations }; }
  else if (path.startsWith("/api/policycraft/admin/managers/")) {
    status = failAssignment ? 503 : 200;
    data = failAssignment ? { error: "Assignment could not be saved. Try again." } : { success: true };
    if (!failAssignment) {
      const manager = managers.find((item) => item.id === path.split("/").at(-1));
      const body = route.request().postDataJSON();
      if (typeof body.active === "boolean") manager.status = body.active ? "active" : "disabled";
      if (body.organizationIds) manager.organizations = organizations.filter((item) => body.organizationIds.includes(item.id));
    }
  }
  else if (path === "/api/policycraft/documents" || path === "/api/policycraft/admin/documents") {
    if (path === "/api/policycraft/documents" && role === "manager") {
      managerListRequests.push(url.searchParams.get("orgId"));
      assert(organizations.some((item) => String(item.id) === url.searchParams.get("orgId")), "manager list requests require an assigned concrete organization");
    }
    if (pausedOrganization !== null && url.searchParams.get("orgId") === pausedOrganization) {
      pausedOrganization = null;
      organizationRequestStarted?.();
      await new Promise((resolve) => { releaseOrganization = resolve; });
    }
    status = failPolicies || (failedOrganization !== null && url.searchParams.get("orgId") === failedOrganization) ? 503 : 200;
    const org = url.searchParams.get("orgId");
    const archived = url.searchParams.get("view") === "archived";
    const type = url.searchParams.get("policyType");
    const candidates = path === "/api/policycraft/admin/documents" ? [...documents, ...additionalAdminDocuments] : documents;
    const matching = candidates.filter((item) => Boolean(item.archivedAt) === archived && (!org || String(item.organization.id) === org) && (!type || item.policyType === type));
    data = { documents: path === "/api/policycraft/documents" && role === "manager" ? matching.map((entry) => { const item = { ...entry }; delete item.organization; return item; }) : matching, creators: [creator] };
  } else if (path.startsWith("/api/policycraft/documents/")) {
    const id = decodeURIComponent(path.split("/").at(-1));
    const item = documents.find((entry) => entry.id === id);
    if (method === "GET") data = { document: item };
    else if (failMutation) { status = 503; data = { error: "Policy update failed. Try again." }; }
    else if (method === "PATCH") {
      const body = route.request().postDataJSON();
      item.archivedAt = body.action === "archive" || body.archived === true ? "2026-10-05T10:00:00Z" : null;
      data = { success: true, document: item };
    } else if (method === "DELETE") { documents = documents.filter((entry) => entry.id !== id); data = { success: true }; if (failRefreshAfterDelete) failPolicies = true; }
  } else if (path.startsWith("/api/export/")) {
    await route.fulfill({ status: 200, contentType: "application/octet-stream", headers: { "content-disposition": 'attachment; filename="mock-policy.pdf"' }, body: "mock export, UI validation only" });
    return;
  } else if (path.startsWith("/api/invitations/")) data = { invitation: { mode: "new", email: "avery@example.test", name: "Avery Invited Manager", expiresAt: "2099-10-05T10:00:00Z" } };
  else if (path === "/api/auth/sign-out" && failSignOut) { status = 503; data = { message: "Could not sign out. Try again." }; }
  else if (path.startsWith("/api/auth/")) data = { success: true, user: { id: "7", name: "Alex", email: "alex@example.test" }, session: {} };
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(12000);
await mkdir(output, { recursive: true });
async function open(path, heading) {
  await page.goto(`${base}${path}`);
  await page.getByRole("heading", { name: heading, exact: true }).waitFor();
}
function policyTitle(title) { return page.getByText(title, { exact: true }).filter({ visible: true }); }
function policyRecord(title) { return page.locator("tr, article").filter({ has: page.getByText(title, { exact: true }) }).filter({ visible: true }); }
async function moreActions(name) { await page.getByRole("button", { name: `More actions for ${name}`, exact: true }).click(); }
async function checkAdminRecords() {
  await page.locator("main").evaluate((main) => {
    for (const table of main.querySelectorAll("table")) {
      if (table.getClientRects().length && table.scrollWidth > table.clientWidth + 1) throw new Error("Admin table requires horizontal scrolling");
    }
    for (const button of main.querySelectorAll('button[aria-label^="More actions for"]')) {
      if (!button.getClientRects().length) continue;
      const bounds = button.getBoundingClientRect();
      if (bounds.left < 0 || bounds.right > window.innerWidth + 1) throw new Error("Record actions are clipped");
    }
    for (const cell of main.querySelectorAll("table td:last-child")) {
      if (!cell.getClientRects().length) continue;
      const bounds = cell.getBoundingClientRect();
      for (const action of cell.querySelectorAll("a, button")) {
        if (!action.getClientRects().length) continue;
        const actionBounds = action.getBoundingClientRect();
        if (actionBounds.left < bounds.left - 1 || actionBounds.right > bounds.right + 1) throw new Error("Actions overlap a neighboring table cell");
      }
    }
  });
}
async function screenshot(name) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: page overflow`);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
}
try {
  const visualSizes = process.env.POLICYCRAFT_UI_FLOW_ONLY ? [] : [{ width: 1440, height: 1000 }, { width: 1024, height: 800 }, { width: 768, height: 900 }, { width: 390, height: 844 }, { width: 720, height: 450 }];
  for (const viewport of visualSizes) {
    await page.setViewportSize(viewport);
    role = "admin";
    for (const [path, heading, name] of [["/admin", "Managers", "managers"], ["/admin/managers/new", "Add manager", "add-manager"], ["/admin/policies", "All policies", "admin-policies"], ["/admin/administration", "Administration", "administration"]]) {
      await open(path, heading);
      if (name === "managers") await page.getByRole("button", { name: "Assignments", exact: true }).first().waitFor();
      if (name === "admin-policies") {
        await policyTitle(documents[0].title).waitFor();
        await page.getByRole("img", { name: `Cover preview for ${documents[0].title}`, exact: true }).filter({ visible: true }).waitFor();
        assert.equal(await page.getByRole("img", { name: `Cover preview for ${documents[0].title}`, exact: true }).filter({ visible: true }).evaluate((preview) => {
          const frame = preview.getBoundingClientRect();
          const canvas = preview.firstElementChild.getBoundingClientRect();
          return canvas.left >= frame.left && canvas.top >= frame.top && canvas.right <= frame.right && canvas.bottom <= frame.bottom;
        }), true, "entire cover preview fits its frame");
        assert.equal(await policyTitle(documents[0].title).evaluate((element) => element.scrollHeight <= element.clientHeight + 1 && getComputedStyle(element).textOverflow !== "ellipsis"), true, "full policy title is readable without truncation");
      }
      if (name === "admin-policies" || name === "managers") await checkAdminRecords();
      if (name === "managers" && viewport.width >= 1280) {
        const compactRow = page.getByRole("row").filter({ has: page.getByText("Dev", { exact: true }) });
        const bounds = await compactRow.boundingBox();
        assert(bounds && bounds.height <= 160, "six organization assignments stay compact instead of creating a giant row");
        await compactRow.getByText("TEST-A", { exact: false }).waitFor();
        await compactRow.getByText("TEST-B", { exact: false }).waitFor();
      }
      await screenshot(`${name}-${viewport.width}x${viewport.height}`);
      if (name === "admin-policies" || name === "managers") await page.screenshot({ path: `${output}/${name}-${viewport.width}x${viewport.height}-viewport.png`, fullPage: false, animations: "disabled" });
      if (name === "admin-policies" && viewport.width < 1024) {
        const filters = page.getByRole("button", { name: /^Filters/ });
        await filters.click();
        await page.getByLabel("Organization").filter({ visible: true }).waitFor();
        await screenshot(`admin-policies-expanded-filters-${viewport.width}`);
        await filters.click();
        assert.equal(await filters.getAttribute("aria-expanded"), "false");
      }
    }
    await open("/accept-invitation?token=mock-ui-only", "Accept your invitation");
    await screenshot(`invitation-${viewport.width}x${viewport.height}`);
    role = "manager";
    await open("/manager", "Organizations & policies");
    await page.getByRole("heading", { name: documents[0].title, exact: true }).waitFor();
    await page.getByRole("heading", { name: documents[2].title, exact: true }).waitFor();
    assert.equal(await page.getByLabel("Organization", { exact: true }).inputValue(), "all", "All organizations is the default manager view");
    await screenshot(`manager-${viewport.width}x${viewport.height}`);
  }

  if (process.env.POLICYCRAFT_UI_LAYOUT_ONLY) {
    assert.deepEqual(errors, []);
    console.log("PASS: six workspace/invitation routes at five viewport sizes; complete policy titles, no horizontal table overflow or clipped secondary actions; no page errors; all APIs mocked.");
  } else {
  await page.setViewportSize({ width: 390, height: 844 });
  role = "admin";
  failManagers = true;
  await open("/admin", "Managers");
  await page.locator("main").getByRole("alert").waitFor();
  assert.equal(await page.getByRole("heading", { name: "No managers yet", exact: true }).count(), 0, "load failure is not empty roster");
  failManagers = false;
  await page.locator("main").getByRole("alert").getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByRole("button", { name: "Assignments", exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Assignments", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const organizationSearch = dialog.getByLabel("Search organizations", { exact: true });
  await organizationSearch.pressSequentially("north", { delay: 15 });
  assert.equal(await organizationSearch.inputValue(), "north", "dialog search keeps focus and every typed character through parent renders");
  assert.equal(await organizationSearch.evaluate((input) => document.activeElement === input), true);
  await organizationSearch.fill("");
  await dialog.getByRole("checkbox").first().uncheck();
  failAssignment = true;
  await dialog.getByRole("button", { name: "Save assignments", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  assert.equal(await dialog.getByRole("checkbox").first().isChecked(), false, "failed save retains selection");
  await screenshot("assignment-error-mobile");
  await page.setViewportSize({ width: 720, height: 450 });
  await dialog.getByRole("button", { name: "Save assignments", exact: true }).scrollIntoViewIfNeeded();
  const saveBounds = await dialog.getByRole("button", { name: "Save assignments", exact: true }).boundingBox();
  assert(saveBounds && saveBounds.y >= 0 && saveBounds.y + saveBounds.height <= 450, "dialog footer remains reachable in a short viewport");
  await screenshot("assignment-error-short-height");
  await page.setViewportSize({ width: 390, height: 844 });
  failAssignment = false;
  await dialog.getByRole("button", { name: "Save assignments", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const managerSearch = page.getByLabel("Search managers", { exact: true });
  await managerSearch.pressSequentially("morgan.alexandra", { delay: 15 });
  assert.equal(await managerSearch.inputValue(), "morgan.alexandra", "fast manager search typing keeps every character");
  await page.waitForURL((url) => url.searchParams.get("q") === "morgan.alexandra");
  await page.getByLabel("Status").selectOption("disabled");
  await page.getByRole("heading", { name: "No managers match these filters", exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  const beforeDisable = mutations.length;
  await moreActions("Morgan Alexandra Manager");
  await page.getByRole("button", { name: "Disable access", exact: true }).click();
  await dialog.waitFor();
  assert.equal(mutations.length, beforeDisable, "disabling access requires explicit confirmation");
  await dialog.getByRole("button", { name: "Keep access", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(mutations.length, beforeDisable, "canceling disable sends no mutation");

  failPolicies = true;
  await open("/admin/policies", "All policies");
  await page.locator("main").getByRole("alert").waitFor();
  assert.equal(await page.getByRole("heading", { name: /No policies/ }).count(), 0, "policy load error is not a filtered empty result");
  failPolicies = false;
  await page.locator("main").getByRole("alert").getByRole("button", { name: /Retry|Refresh policies/ }).click();
  await policyTitle(documents[0].title).waitFor();
  const policyFilters = page.getByRole("button", { name: /^Filters/ });
  await policyFilters.click();
  await page.getByLabel("Policy type").selectOption("environmental");
  await page.waitForURL((url) => url.searchParams.get("policyType") === "environmental");
  assert.equal(await policyTitle("Social responsibility policy").count(), 0);
  await page.getByLabel("Policy type").selectOption("all");
  await page.waitForURL((url) => !url.searchParams.has("policyType"));
  await policyFilters.click();
  await page.getByLabel("Search policies", { exact: true }).pressSequentially("environmental", { delay: 15 });
  assert.equal(await page.getByLabel("Search policies", { exact: true }).inputValue(), "environmental", "fast admin policy search typing keeps every character");
  await page.waitForURL((url) => url.searchParams.get("q") === "environmental");
  await page.getByLabel("Search policies", { exact: true }).fill("unmatched policy");
  await page.getByRole("heading", { name: "No policies match these filters", exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.waitForURL((url) => !url.searchParams.has("q"));
  await policyTitle(documents[0].title).waitFor();
  const environmentalRow = policyRecord(documents[0].title);
  const more = environmentalRow.getByRole("button", { name: `More actions for ${documents[0].title}`, exact: true });
  await more.focus();
  await more.press("Enter");
  await page.getByRole("button", { name: "Download PDF", exact: true }).waitFor();
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("button", { name: "Download PDF", exact: true }).evaluate((button) => button === document.activeElement), true, "disclosed actions participate in normal keyboard navigation");
  await page.keyboard.press("Escape");
  assert.equal(await more.getAttribute("aria-expanded"), "false");
  assert.equal(await more.evaluate((button) => button === document.activeElement), true, "Escape returns focus to the action trigger");
  await moreActions(documents[0].title);
  await page.getByRole("heading", { name: "All policies", exact: true }).click();
  assert.equal(await more.getAttribute("aria-expanded"), "false", "outside click dismisses actions");
  for (const [format, label] of [["pdf", "Download PDF"], ["docx", "Download Word"]]) {
    await moreActions(documents[0].title);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    await download;
    const exportRequest = mutations.findLast((mutation) => mutation.path === `/api/export/${format}`);
    assert.equal(exportRequest.body.orgId, 11, "downloads retain organization scope");
    assert.equal(exportRequest.body.documentId, "environmental", "downloads retain the selected document");
  }
  const beforeAdminArchive = mutations.length;
  await environmentalRow.getByRole("button", { name: `More actions for ${documents[0].title}`, exact: true }).click();
  await page.getByRole("button", { name: "Archive policy", exact: true }).click();
  await dialog.waitFor();
  assert.equal(mutations.length, beforeAdminArchive, "admin archive matches manager confirmation flow");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await more.evaluate((button) => button === document.activeElement), true, "confirmation returns focus to a visible disclosure trigger");
  assert.equal(mutations.length, beforeAdminArchive);

  role = "manager";
  await open("/manager", "Organizations & policies");
  await page.getByRole("heading", { name: documents[2].title, exact: true }).waitFor();
  const organizationSelect = page.getByLabel("Organization", { exact: true });
  assert.equal(await organizationSelect.inputValue(), "all");
  await page.getByRole("button", { name: "New policy", exact: true }).click();
  await dialog.getByRole("heading", { name: "Choose an organization", exact: true }).waitFor();
  await dialog.getByLabel("Organization", { exact: true }).selectOption("22");
  assert.equal(await dialog.getByRole("button", { name: "Continue to builder", exact: true }).isEnabled(), true);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await organizationSelect.locator("option").count(), 3, "deleted and expired organizations are excluded");
  assert.deepEqual(await page.locator('main article > div h3').allTextContents(), [documents[2].title, documents[0].title, documents[1].title], "all organizations sort policies globally by updated time");
  const riversideRecord = page.locator("main article").filter({ has: page.getByRole("heading", { name: documents[2].title, exact: true }) }).first();
  const riversideHref = new URL(await riversideRecord.getByRole("link", { name: "Open", exact: true }).getAttribute("href"), base);
  assert.equal(riversideHref.searchParams.get("orgId"), "22", "aggregate Open uses the document organization");
  await riversideRecord.getByRole("button", { name: `Archive ${documents[2].title}`, exact: true }).click();
  await dialog.getByRole("button", { name: /Archive policy/ }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(mutations.at(-1).orgId, "22", "aggregate archive uses the document organization");
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await page.getByRole("heading", { name: documents[2].title, exact: true }).waitFor();
  documents[2].archivedAt = null;
  failedOrganization = "22";
  await open("/manager", "Organizations & policies");
  await page.locator("main").getByRole("alert").waitFor();
  assert.equal(await page.getByRole("heading", { name: documents[0].title, exact: true }).count(), 0, "failed aggregate load does not show a partial all-organizations list");
  failedOrganization = null;
  await page.getByRole("button", { name: "Retry loading policies", exact: true }).click();
  await page.getByRole("heading", { name: documents[2].title, exact: true }).waitFor();
  await screenshot("manager-all-organizations-mobile");
  singleOrganization = true;
  await open("/manager", "Organizations & policies");
  await page.getByRole("heading", { name: documents[0].title, exact: true }).waitFor();
  assert.equal(await organizationSelect.inputValue(), "all", "All organizations stays default with one assignment");
  assert.equal(await page.getByRole("heading", { name: documents[2].title, exact: true }).count(), 0);
  singleOrganization = false;
  assert(managerListRequests.every((id) => id === "11" || id === "22"), "only assigned active organizations are queried");
  await open("/manager?orgId=11&type=environmental", "Organizations & policies");
  await page.getByRole("heading", { name: documents[0].title, exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Social responsibility policy", exact: true }).count(), 0);
  await page.getByLabel("Search policies by title", { exact: true }).fill("unmatched policy title");
  await page.waitForURL((url) => url.searchParams.get("q") === "unmatched policy title");
  assert.equal(await page.locator("article").count(), 0);
  await page.getByLabel("Search policies by title", { exact: true }).fill("");
  await page.getByRole("heading", { name: documents[0].title, exact: true }).waitFor();
  await page.getByLabel("Search policies by title", { exact: true }).pressSequentially("environmental", { delay: 15 });
  assert.equal(await page.getByLabel("Search policies by title", { exact: true }).inputValue(), "environmental", "fast policy search typing keeps every character");
  await page.waitForURL((url) => url.searchParams.get("q") === "environmental");
  await page.getByLabel("Search policies by title", { exact: true }).fill("");
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("view") === "archived" && !url.searchParams.has("q"));
  await page.getByRole("heading", { name: "No archived policies", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("view"), "archived", "a pending cleared search cannot overwrite a view change");
  await page.getByRole("button", { name: "Active", exact: true }).click();
  await page.getByRole("heading", { name: documents[0].title, exact: true }).waitFor();
  const beforeArchive = mutations.length;
  await page.getByRole("button", { name: `Archive ${documents[0].title}`, exact: true }).click();
  await dialog.waitFor();
  assert.equal(mutations.length, beforeArchive, "archive requires confirmation before request");
  failMutation = true;
  await dialog.getByRole("button", { name: /Archive policy/ }).click();
  await dialog.getByRole("alert").waitFor();
  failMutation = false;
  await dialog.getByRole("button", { name: /Archive policy/ }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(mutations.at(-1).orgId, "11", "archive uses selected organization scope");
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await page.getByRole("heading", { name: documents[0].title, exact: true }).waitFor();
  await screenshot("manager-archived-mobile");
  await page.getByLabel("Organization", { exact: true }).selectOption("22");
  await page.getByRole("heading", { name: "No archived policies", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("orgId"), "22");
  await page.goBack();
  await page.getByRole("heading", { name: documents[0].title, exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("orgId"), "11", "back restores organization and archive view");

  await open("/manager?orgId=11", "Organizations & policies");
  await page.getByRole("heading", { name: "Social responsibility policy", exact: true }).waitFor();
  const requestStarted = new Promise((resolve) => { organizationRequestStarted = resolve; });
  pausedOrganization = "22";
  await page.getByLabel("Organization", { exact: true }).selectOption("22");
  await requestStarted;
  assert.equal(await page.getByRole("heading", { name: "Social responsibility policy", exact: true }).count(), 0, "old organization rows are hidden during a switch");
  await page.goBack();
  await page.getByRole("heading", { name: "Social responsibility policy", exact: true }).waitFor();
  const lateResponse = page.waitForResponse((response) => response.url().includes("orgId=22") && response.url().includes("/documents"));
  releaseOrganization();
  await lateResponse;
  assert.equal(await page.getByRole("heading", { name: "Riverside environmental policy", exact: true }).count(), 0, "late old response cannot replace current organization data");

  failSignOut = true;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Retry sign out", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/manager", "failed sign out stays in workspace with visible recovery");
  failSignOut = false;
  await page.getByRole("button", { name: "Retry sign out", exact: true }).click();
  await page.waitForURL("**/login");

  role = "admin";
  await open("/admin/policies?view=archived", "All policies");
  const deletedTitle = documents[0].title;
  await policyTitle(deletedTitle).waitFor();
  await moreActions(deletedTitle);
  await page.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await dialog.waitFor();
  failMutation = true;
  await dialog.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  failMutation = false;
  failRefreshAfterDelete = true;
  await dialog.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.locator("main").getByRole("alert").waitFor();
  await screenshot("delete-refresh-recovery-mobile");
  failPolicies = false;
  failRefreshAfterDelete = false;
  await page.locator("main").getByRole("alert").getByRole("button", { name: /Retry/ }).click();
  await page.getByRole("heading", { name: "No archived policies", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Clear filters", exact: true }).count(), 0, "a genuinely empty list does not offer redundant filter recovery");
  assert.equal(await policyTitle(deletedTitle).count(), 0);

  role = "user";
  await open("/dashboard", "Your policy drafts");
  await page.getByRole("heading", { name: "Social responsibility policy", exact: true }).waitFor();
  await screenshot("user-dashboard-adjacent-mobile");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await dialog.getByLabel("Draft name", { exact: true }).fill("Unsaved draft title");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Social responsibility policy", exact: true }).waitFor();

  role = "manager";
  emptyOrganizations = true;
  await open("/manager", "No organizations assigned");
  await screenshot("manager-no-organizations");
  assert.deepEqual(errors, []);
  console.log(`PASS: ${visualSizes.length ? "all admin/manager/invitation pages at 1440, 1024, 768, 390 and compact 720x450; " : "interaction checks; "}long content contained; load vs empty states; modal save/delete errors and refresh recovery; rapid admin/manager search input; URL org/type/history and stale response isolation; confirmed tenant-scoped archive retry; sign-out failure/retry; adjacent user drafts; no page errors; all APIs mocked.`);
  }
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => undefined);
  console.error((await page.locator("body").innerText()).slice(-3500));
  throw error;
} finally { await browser.close(); }
