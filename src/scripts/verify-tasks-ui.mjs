// All application APIs are intercepted. This fixture never changes live data.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { initialPolicy } from "../lib/store.ts";
import { calculatePolicyProgress } from "../lib/policycraft-progress.ts";

const base = process.env.POLICYCRAFT_UI_URL || "http://localhost:3000";
const output = process.env.POLICYCRAFT_UI_OUTPUT || "output/playwright/tasks";
const organizations = [
  { id: 11, code: "NORTH", name: "Northstar Manufacturing and Sustainable Supply Chain Operations", deleted: false, expired: false },
  { id: 22, code: "RIVER", name: "Riverside Group", deleted: false, expired: false },
  { id: 33, code: "EMPTY", name: "Organization without an assigned manager", deleted: false, expired: false },
];
const managers = [
  { id: "9", name: "Morgan Alexandra Manager", email: "morgan@example.test", status: "active", organizations: [organizations[0]], policyCount: 3 },
  { id: "10", name: "Taylor Manager", email: "taylor@example.test", status: "active", organizations: [organizations[0]], policyCount: 1 },
  { id: "12", name: "Riverside Manager", email: "river@example.test", status: "active", organizations: [organizations[1]], policyCount: 0 },
  { id: "13", name: "Disabled Manager", email: "disabled@example.test", status: "disabled", organizations: [organizations[0]], policyCount: 0 },
];
let role = "admin";
let failTasks = false;
let emptyTasks = false;
let failSaves = false;
let conflictSaves = false;
const requests = [];
const pageErrors = [];
const documents = new Map();

function draft(id, title) {
  const policy = initialPolicy("environmental");
  policy.company.name = organizations[0].name;
  const document = { id, title, policyType: "environmental", organization: organizations[0], currentStep: "declaration", lockVersion: 1, createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-05T10:00:00Z", archivedAt: null, state: { step: "declaration", policy, importedPolicy: null } };
  documents.set(id, document);
  return document;
}
function snapshot(document) {
  return { ...calculatePolicyProgress(document.state.policy), savedAt: document.updatedAt, documentVersion: document.lockVersion };
}
function task(id, title, status = "assigned") {
  const document = status === "assigned" ? null : draft(`draft-${id}`, title);
  return { id, title, instructions: "Prepare the policy for all operating facilities.", policyType: "environmental", organization: organizations[0], manager: managers[0], dueDate: "2026-11-30", status, version: 1, documentId: document?.id || null, documentVersion: document?.lockVersion || null, progress: document ? snapshot(document) : null, available: true, unavailableReason: null, createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-05T10:00:00Z", startedAt: document ? "2026-10-05T10:00:00Z" : null, completedAt: status === "completed" ? "2026-10-05T10:00:00Z" : null };
}
const tasks = [
  task("assigned", "Create an environmental policy for Northstar Manufacturing"),
  task("started", "Environmental stewardship and responsible resource management policy", "in_progress"),
  { ...task("blocked", "Task with revoked organization access"), available: false, unavailableReason: "The manager is no longer assigned to this organization.", dueDate: "2026-10-01" },
  task("completed", "Previously completed environmental policy", "completed"),
  { ...task("blocked-saved", "Saved policy with a disabled manager", "in_progress"), available: false, unavailableReason: "The assigned manager account is disabled." },
];
const independent = draft("independent", "Independent manager policy");
const work = [
  { documentId: independent.id, title: independent.title, policyType: independent.policyType, organization: organizations[0], manager: managers[0], progress: snapshot(independent), available: true, unavailableReason: null },
  { documentId: "legacy", title: "Legacy manager policy without reliable progress", policyType: "environmental", organization: organizations[0], manager: managers[0], progress: null, available: true, unavailableReason: null },
  { documentId: independent.id, title: independent.title, policyType: independent.policyType, organization: organizations[0], manager: managers[1], progress: snapshot(independent), available: true, unavailableReason: null },
];
const events = new Map(tasks.map((item) => [item.id, [{ id: `event-${item.id}`, taskId: item.id, eventType: "assigned", actor: { id: "7", name: "Alex Administrator", role: "admin" }, details: {}, createdAt: item.createdAt }]]));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
await context.addCookies([{ name: "better-auth.session_token", value: "mock-task-ui-only", url: base }]);
await context.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const method = request.method();
  if (method !== "GET" && path.startsWith("/api/policycraft/")) {
    assert(request.headers()["content-type"]?.startsWith("application/json"), `${method} ${path} must satisfy the JSON mutation guard`);
  }
  const body = method === "GET" ? null : request.postDataJSON();
  if (method !== "GET") requests.push({ path, method, body });
  let status = 200;
  let data = {};
  const ownTasks = emptyTasks ? [] : tasks.filter((item) => role === "admin" || item.manager.id === "9");
  if (path === "/api/policycraft/access") data = { actor: { id: role === "admin" ? "7" : "9", name: role === "admin" ? "Alex Administrator" : managers[0].name, email: role === "admin" ? "alex@example.test" : managers[0].email, role }, organizations, homeHref: role === "admin" ? "/admin" : "/manager" };
  else if (path === "/api/policycraft/admin/managers") data = { managers, organizations };
  else if (path === "/api/policycraft/admin/manager-work") data = { work };
  else if (path === "/api/policycraft/admin/tasks" || path === "/api/policycraft/tasks") {
    if (failTasks) { status = 503; data = { error: "Task storage unavailable. Apply the PolicyCraft tasks migration first." }; }
    else if (method === "POST") {
      const created = { ...task(`created-${tasks.length}`, body.title), organization: organizations.find((item) => item.id === body.organizationId), manager: managers.find((item) => item.id === String(body.managerId)), policyType: body.policyType, dueDate: body.dueDate, instructions: body.instructions };
      tasks.push(created); events.set(created.id, []); data = { task: created };
    } else data = { tasks: ownTasks.filter((item) => !url.searchParams.get("documentId") || item.documentId === url.searchParams.get("documentId")), managers, managerWork: emptyTasks ? [] : work, count: ownTasks.filter((item) => item.status === "assigned" || item.status === "in_progress").length };
  } else if (/\/tasks\/[^/]+(?:\/(start|complete))?$/.test(path)) {
    const pieces = path.split("/");
    const action = pieces.at(-1);
    const id = action === "start" || action === "complete" ? pieces.at(-2) : action;
    const item = tasks.find((entry) => entry.id === id);
    assert(item, `Unknown fixture task ${id}`);
    if (method === "GET") data = { task: item, events: events.get(id) || [] };
    else if (action === "start") {
      if (!item.documentId) { const document = draft(`draft-${id}`, item.title); item.documentId = document.id; item.documentVersion = document.lockVersion; item.progress = snapshot(document); item.status = "in_progress"; item.version++; }
      data = { task: item, documentId: item.documentId, organizationId: item.organization.id };
    } else if (action === "complete") {
      const document = documents.get(item.documentId);
      assert.equal(body.documentVersion, document.lockVersion, "completion must follow the latest successful save");
      assert.equal(body.version, item.version, "completion must use the current task version");
      assert.equal(body.confirmIncomplete, true, "partial-policy completion requires acknowledgement");
      item.status = "completed"; item.version++; item.completedAt = new Date().toISOString(); data = { task: item };
    } else {
      assert.equal(body.version, item.version);
      if (body.action === "reassign") { item.manager = managers.find((entry) => entry.id === String(body.managerId)); item.progress = null; }
      else if (body.action === "cancel") item.status = "cancelled";
      else if (body.action === "reopen") item.status = item.documentId ? "in_progress" : "assigned";
      else { Object.assign(item, { title: body.title, instructions: body.instructions, dueDate: body.dueDate }); }
      item.version++; events.get(id)?.push({ id: `event-${id}-${item.version}`, taskId: id, eventType: body.action, actor: { id: "7", name: "Alex Administrator", role: "admin" }, details: {}, createdAt: new Date().toISOString() }); data = { task: item };
    }
  } else if (path.startsWith("/api/policycraft/documents/")) {
    const document = documents.get(decodeURIComponent(path.split("/").at(-1)));
    assert(document, `Unknown fixture document ${path}`);
    if (method === "PATCH") {
      if (failSaves || conflictSaves || body.lockVersion !== document.lockVersion) { status = conflictSaves || body.lockVersion !== document.lockVersion ? 409 : 503; data = { error: status === 409 ? "Draft conflict" : "Save unavailable" }; }
      else { assert.equal(body.lockVersion, document.lockVersion); document.state = body.state; document.title = body.title; document.currentStep = body.state.step; document.lockVersion++; document.updatedAt = new Date().toISOString(); const linked = tasks.find((item) => item.documentId === document.id); if (linked) { linked.documentVersion = document.lockVersion; linked.progress = snapshot(document); } data = { document }; }
    } else data = { document };
  } else if (path === "/api/policycraft/documents") data = { documents: [...documents.values()] };
  else if (path === "/api/policycraft/signatures/me") data = { signature: null };
  else if (path === "/api/policycraft/bootstrap") data = { company: { id: 11, code: "NORTH", name: organizations[0].name, industry: "Manufacturing", subCategory: "", country: "India", websiteLink: "", address: "", city: "", sites: [] } };
  else if (path.includes("cover") || path.includes("template")) data = { templates: [] };
  else if (path.startsWith("/api/auth/")) data = { success: true };
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
});
const page = await context.newPage();
page.on("pageerror", (error) => pageErrors.push(error.message));
await mkdir(output, { recursive: true });
async function noOverflow() { assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Page overflows at ${JSON.stringify(page.viewportSize())}`); }
async function screenshot(name, fullPage = true) { await page.screenshot({ path: `${output}/${name}.png`, fullPage, animations: "disabled" }); }
async function taskLayout() {
  await noOverflow();
  const heading = page.getByRole("heading", { level: 1 });
  const typography = await heading.evaluate((element) => {
    const style = getComputedStyle(element);
    return { family: style.fontFamily, spacing: style.letterSpacing };
  });
  assert(typography.family.includes("Inter"), "task headings use the shared task font");
  assert(["normal", "0px"].includes(typography.spacing), "task headings have neutral letter spacing");
  for (const control of await page.locator('#workspace-main input, #workspace-main select').all()) {
    if (await control.isVisible()) assert((await control.boundingBox()).width > 100, "filters remain usable at narrow widths");
  }
  for (const label of await page.locator('dl[aria-label="Task summary"] dt').all()) {
    assert(await label.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), "summary labels fit their columns");
  }
  for (const count of await page.locator('dl[aria-label="Task summary"] dd').all()) {
    assert(await count.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), "summary values fit their columns");
  }
  for (const control of await page.locator('#workspace-main table td:last-child :is(button, a)').all()) {
    if (!await control.isVisible()) continue;
    const box = await control.boundingBox();
    const table = await control.locator("xpath=ancestor::table").boundingBox();
    assert(box.x + box.width <= table.x + table.width - 4, "row actions stay inside the table surface");
    const whiteSpace = await control.evaluate((element) => getComputedStyle(element).whiteSpace);
    assert.equal(whiteSpace, "nowrap", "action labels must not split across lines");
  }
  if (page.viewportSize().width >= 1440) {
    const search = await page.locator('#workspace-main input[name="q"]').boundingBox();
    const organization = await page.locator('#workspace-main select[name="orgId"]').boundingBox();
    assert(Math.abs(search.y - organization.y) <= 2, "search and select filters align on desktop");
  }
}
async function taskSummary(source) {
  const active = source.filter((item) => item.status === "assigned" || item.status === "in_progress").length;
  const count = page.locator('dl[aria-label="Task summary"] > div').filter({ has: page.locator("dt", { hasText: /^Active$/ }) }).locator("dd");
  assert.equal(await count.innerText(), String(active), "active summary includes assigned and in-progress tasks");
}
try {
  await page.goto(`${base}/admin/tasks`);
  await page.getByRole("heading", { name: "Tasks & manager work", exact: true }).waitFor();
  await page.getByText(tasks[0].title, { exact: true }).first().waitFor();
  await page.getByText("Unavailable: The assigned manager account is disabled.", { exact: true }).filter({ visible: true }).first().waitFor();
  await taskLayout();
  await taskSummary(tasks);
  const actionIcon = page.getByRole("button", { name: `Edit ${tasks[0].title}`, exact: true }).filter({ visible: true }).locator("svg");
  assert((await actionIcon.boundingBox()).width >= 13, "compact action icons must retain their intended size");
  await screenshot("admin-desktop");
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await taskLayout();
    await screenshot(`admin-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("tab", { name: /^Tasks/ }).focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForURL((url) => url.searchParams.get("tab") === "work");
  assert.equal(await page.getByRole("tab", { name: /Manager work/ }).getAttribute("aria-selected"), "true");
  await page.getByRole("tabpanel", { name: /Manager work/ }).waitFor();
  await screenshot("admin-manager-work");
  await page.keyboard.press("Home");
  await page.waitForURL((url) => !url.searchParams.has("tab"));
  await page.locator('select[name="status"]').selectOption("assigned");
  await page.waitForURL((url) => url.searchParams.get("status") === "assigned");
  await page.reload();
  assert.equal(await page.locator('select[name="status"]').inputValue(), "assigned", "filters persist in the URL across reloads");
  await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();
  await page.waitForURL((url) => !url.searchParams.has("status"));
  await page.getByRole("button", { name: "History", exact: true }).first().click();
  await page.getByText("Alex Administrator", { exact: true }).filter({ visible: true }).last().waitFor();
  await page.getByRole("tab", { name: /Manager work/ }).click();
  await page.getByText(work[1].title, { exact: true }).first().waitFor();
  assert.equal(await page.getByText(independent.title, { exact: true }).filter({ visible: true }).count(), 2, "shared policy work has one visible entry for each manager");
  await page.getByRole("tab", { name: /^Tasks/ }).click();
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  assert.equal(await dialog.evaluate((element) => getComputedStyle(element).borderRadius), "8px", "task-only dialogs share the compact surface style");
  assert.equal(await dialog.getByLabel("Organization", { exact: true }).inputValue(), "", "new tasks require choosing an organization");
  assert.equal(await dialog.getByLabel("Policy type", { exact: true }).inputValue(), "", "new tasks require choosing a policy type");
  assert.equal(await dialog.getByLabel("Organization", { exact: true }).getByRole("option", { name: "Choose organization", exact: true }).count(), 1);
  assert.equal(await dialog.getByLabel("Policy type", { exact: true }).getByRole("option", { name: "Choose policy", exact: true }).count(), 1);
  await dialog.getByLabel("Task title", { exact: true }).fill("New environmental policy assignment");
  await dialog.getByLabel("Organization", { exact: true }).selectOption("11");
  await dialog.getByLabel("Policy type", { exact: true }).selectOption("environmental");
  await dialog.getByLabel("Assign to", { exact: false }).selectOption("9");
  await dialog.getByLabel("Organization", { exact: true }).selectOption("22");
  assert.equal(await dialog.getByLabel("Assign to", { exact: false }).inputValue(), "", "organization change clears manager selection");
  assert.equal(await dialog.getByLabel("Assign to", { exact: false }).getByRole("option", { name: /Morgan/ }).count(), 0);
  await dialog.getByLabel("Organization", { exact: true }).selectOption("33");
  await dialog.getByText("Assign a manager to this organization before creating the task.").waitFor();
  assert(await dialog.getByRole("button", { name: "Create task", exact: true }).isDisabled());
  await dialog.getByLabel("Organization", { exact: true }).selectOption("11");
  await dialog.getByLabel("Assign to", { exact: false }).selectOption("9");
  await dialog.getByLabel(/Deadline/).fill("2026-11-30");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText("Create task", { exact: true }).first().waitFor();
  assert.equal(await dialog.getByLabel("Task title", { exact: true }).inputValue(), "New environmental policy assignment", "refresh preserves entered task data");
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(requests.filter((entry) => entry.path === "/api/policycraft/admin/tasks" && entry.method === "POST").length, 1);
  await page.getByRole("button", { name: `Reassign ${tasks[0].title}`, exact: true }).first().click();
  await page.getByRole("dialog").getByLabel("Manager", { exact: true }).selectOption("10");
  await page.getByRole("dialog").getByRole("button", { name: "Reassign task", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert(requests.some((entry) => entry.path.endsWith("/assigned") && entry.body?.action === "reassign"));
  await page.getByRole("button", { name: `Reopen ${tasks[3].title}`, exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Reopen task", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow();
  await screenshot("admin-mobile");
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot("admin-mobile-viewport", false);
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Task title", { exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  assert(await page.getByRole("dialog").evaluate((element) => element.contains(document.activeElement)));
  await screenshot("admin-mobile-dialog", false);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Task title", { exact: true }).fill("Short viewport task");
  await page.getByRole("dialog").getByLabel(/Deadline/).fill("2026-12-01");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).scrollIntoViewIfNeeded();
  await screenshot("admin-short-dialog", false);
  await page.keyboard.press("Escape");
  failTasks = true;
  await page.reload();
  await page.getByText("Task storage unavailable. Apply the PolicyCraft tasks migration first.", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Tasks unavailable", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: /No tasks found|No tasks match/ }).count(), 0, "a failed load must not claim the admin task list is empty");
  failTasks = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText(tasks[1].title, { exact: true }).filter({ visible: true }).first().waitFor();
  role = "manager";
  await page.setViewportSize({ width: 320, height: 844 });
  failTasks = true;
  await page.goto(`${base}/manager/tasks`);
  await page.getByRole("heading", { name: "Tasks unavailable", exact: true }).waitFor();
  await taskLayout();
  await screenshot("manager-unavailable-320");
  assert.equal(await page.getByRole("heading", { name: "No tasks assigned yet", exact: true }).count(), 0, "a failed load must not claim no manager assignments exist");
  failTasks = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/manager/tasks`);
  await page.getByRole("heading", { name: /tasks/i }).first().waitFor();
  await page.getByText(tasks[1].title, { exact: true }).filter({ visible: true }).first().waitFor();
  await noOverflow();
  await screenshot("manager-mobile");
  await screenshot("manager-mobile-viewport", false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await taskLayout();
  await page.getByText(/Manager saved/).filter({ visible: true }).first().waitFor();
  await screenshot("manager-desktop");
  await taskSummary(tasks.filter((item) => item.manager.id === "9"));
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await taskLayout();
    await screenshot(`manager-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const start = page.getByRole("button", { name: /Start task/ }).filter({ visible: true }).and(page.locator(":enabled"));
  await start.first().click();
  await page.waitForURL("**/builder?**");
  const linkedDocumentId = new URL(page.url()).searchParams.get("draft");
  assert(linkedDocumentId && documents.has(linkedDocumentId));
  await page.goto(`${base}/builder?draft=independent&orgId=11`);
  await page.getByPlaceholder("Mention your industry, your commitment, and the standards you align with.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Mark task complete", exact: true }).count(), 0, "independent manager work must not show an assignment strip");
  assert.equal(await page.getByText(/assignment.*no longer available/i).count(), 0);
  await page.goto(`${base}/builder?draft=draft-started&orgId=11`);
  await page.getByRole("button", { name: "Mark task complete", exact: true }).waitFor();
  await page.getByRole("button", { name: "Close controls", exact: true }).click();
  await noOverflow();
  await screenshot("builder-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const headingBox = await page.getByRole("region", { name: "Assigned task", exact: true }).getByRole("heading").boundingBox();
  assert(headingBox.width > 350, "builder assignment title must have readable space beside the design inspector");
  assert((await page.getByRole("region", { name: "Assigned task", exact: true }).getByRole("heading").evaluate((element) => getComputedStyle(element).fontFamily)).includes("Fraunces"), "task workspace styling must not leak into the builder");
  for (const failure of ["offline", "conflict", "stale"]) {
    await page.goto(`${base}/builder?draft=draft-started&orgId=11`);
    await page.getByRole("button", { name: "Mark task complete", exact: true }).waitFor();
    failSaves = failure === "offline";
    conflictSaves = failure === "conflict";
    if (failure === "stale") documents.get("draft-started").lockVersion++;
    await page.getByPlaceholder("Mention your industry, your commitment, and the standards you align with.", { exact: true }).fill(`Unsaved ${failure} changes`);
    await page.getByRole("button", { name: "Mark task complete", exact: true }).click();
    await page.getByText(/could not.*sav|conflict|save unavailable|offline|newer version|changed in another/i).filter({ visible: true }).first().waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0, `${failure} save must prevent completion confirmation`);
    assert.equal(requests.filter((entry) => entry.path.endsWith("/started/complete")).length, 0);
    failSaves = false;
    conflictSaves = false;
  }
  await page.goto(`${base}/builder?draft=draft-started&orgId=11`);
  await page.getByRole("button", { name: "Mark task complete", exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByPlaceholder("Mention your industry, your commitment, and the standards you align with.", { exact: true }).fill("Manager's latest unsaved environmental commitment.");
  await page.getByRole("button", { name: "Mark task complete", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.getByRole("dialog").evaluate((element) => getComputedStyle(element).borderRadius), "16px", "the existing builder completion dialog is unchanged");
  const latestSave = requests.filter((entry) => entry.path.endsWith("/documents/draft-started") && entry.method === "PATCH").at(-1);
  assert.equal(latestSave.body.state.policy.declaration.preface, "Manager's latest unsaved environmental commitment.");
  await screenshot("builder-complete-confirmation", false);
  const acknowledgement = page.getByRole("dialog").getByRole("checkbox");
  if (await acknowledgement.count()) await acknowledgement.check();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm completion", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(tasks.find((item) => item.id === "started").status, "completed");
  assert.equal(requests.filter((entry) => entry.path.endsWith("/started/complete")).length, 1);
  emptyTasks = true;
  await page.goto(`${base}/manager/tasks`);
  await page.getByRole("heading", { name: "No tasks assigned yet", exact: true }).waitFor();
  await screenshot("manager-empty");
  role = "admin";
  await page.goto(`${base}/admin/tasks`);
  await page.getByRole("heading", { name: "No tasks yet", exact: true }).waitFor();
  await screenshot("admin-empty");
  await page.getByRole("tab", { name: /Manager work/ }).click();
  await page.getByRole("heading", { name: "No manager-saved policies yet", exact: true }).waitFor();
  assert.deepEqual(pageErrors, []);
  console.log("PASS: task UI desktop/tablet/320px mobile/short-height, aligned controls, scoped fonts/dialogs, actual summary counts, URL filters/reset, keyboard tabs/dialogs, successful empty vs unavailable states, manager eligibility/reset, polling preserves forms, history, reassignment/reopen, migration retry, start/builder handoff, independent policies, offline/conflict/stale saves block completion, save-before-complete and explicit partial acknowledgement, no overflow or page errors. APIs fully mocked; no database changes.");
} catch (error) {
  await screenshot("failure");
  console.error((await page.locator("body").innerText()).slice(-2400));
  throw error;
} finally { await browser.close(); }
