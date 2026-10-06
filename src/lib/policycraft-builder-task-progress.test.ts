import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { calculatePolicyProgress } from "./policycraft-progress";
import { initialPolicy } from "./store";
import type { PolicyCraftDocumentState } from "./policycraft-types";

// Execute the production callbacks rather than copying their behavior. This
// avoids mounting the whole builder (CSS, PDF, and browser-only dependencies).
const filename = process.env.POLICYCRAFT_TASK_PROGRESS_SOURCE || path.resolve("app/builder/BuilderClient.tsx");
const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function callback<T>(name: "save" | "load", bindings: Record<string, unknown>): T {
  let expression: ts.ArrowFunction | undefined;
  function visit(node: ts.Node) {
    if (name === "save" && ts.isBinaryExpression(node) && node.left.getText(source) === "saveDraftRef.current" && ts.isArrowFunction(node.right)) expression = node.right;
    if (name === "load" && ts.isVariableDeclaration(node) && node.name.getText(source) === "loadTaskContext" && node.initializer && ts.isCallExpression(node.initializer)) {
      const argument = node.initializer.arguments[0];
      if (argument && ts.isArrowFunction(argument)) expression = argument;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(expression, `Find production ${name} callback`);
  const compiled = ts.transpileModule(`const productionCallback = ${expression.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(bindings), `${compiled}\nreturn productionCallback;`)(...Object.values(bindings)) as T;
}

type Progress = ReturnType<typeof calculatePolicyProgress> & { savedAt: string; documentVersion: number };
type ObservedTask = { id: string; manager: { id: string }; progress: Progress };
type Load = () => Promise<ObservedTask | null>;
type Save = (state: PolicyCraftDocumentState) => Promise<void>;

function harness() {
  const policy = initialPolicy("environmental");
  const initialProgress = { ...calculatePolicyProgress(policy), savedAt: "2026-10-06T10:00:00Z", documentVersion: 1 };
  const state = {
    visible: { id: "task-1", manager: { id: "manager-1" }, progress: initialProgress } as ObservedTask | null,
    stored: initialProgress,
    saveStatus: "saved",
    taskError: "",
    loading: false,
    reads: 0,
    failPatch: false,
    failRead: false,
  };
  const backendLockVersion = { current: 1 };
  const lastSavedState = { current: "" };
  const taskContextRequest = { current: 0 };
  const taskContextIdentityRef = { current: "draft-1:task-1:manager-1" };
  const workspaceAccess = { actor: { role: "manager", id: "manager-1" } };
  const fetchMock = async (_url: string, options?: { method?: string; body?: string }) => {
    if (options?.method === "PATCH") {
      if (state.failPatch) return { status: 503, ok: false };
      const body = JSON.parse(options.body || "{}") as { state: PolicyCraftDocumentState };
      state.stored = { ...calculatePolicyProgress(body.state.policy), savedAt: "2026-10-06T10:01:00Z", documentVersion: backendLockVersion.current + 1 };
      return { status: 200, ok: true, json: async () => ({ document: { lockVersion: state.stored.documentVersion } }) };
    }
    state.reads += 1;
    return { ok: !state.failRead, json: async () => state.failRead ? { error: "Task refresh unavailable. Retry." } : { tasks: [{ id: "task-1", manager: { id: "manager-1" }, progress: state.stored }] } };
  };
  const loadBindings = {
    backendDocumentId: "draft-1", taskId: "task-1", workspaceAccess,
    taskContextIdentity: taskContextIdentityRef.current, taskContextIdentityRef, taskContextRequest,
    setTaskContext: (task: ObservedTask | null) => { state.visible = task; },
    setTaskContextLoading: (value: boolean) => { state.loading = value; },
    setTaskContextError: (value: string) => { state.taskError = value; },
    fetch: fetchMock,
  };
  const load = callback<Load>("load", loadBindings);
  const save = callback<Save>("save", {
    backendDocumentId: "draft-1", workspaceScope: { role: "manager", organizationId: 11 }, workspaceAccess,
    backendTitle: "Environmental policy", backendLockVersion, lastSavedState,
    setSaveStatus: (value: string) => { state.saveStatus = value; },
    policyCraftUrl: (url: string) => url, push: () => undefined, fetch: fetchMock,
    refreshTaskContextRef: { current: load },
  });
  return { state, policy, save, load, loadBindings, backendLockVersion };
}

test("successful autosaves refresh filled-section progress, including cleared sections", async () => {
  const h = harness();
  const before = h.state.visible!.progress.filledSections;
  h.policy.declaration.preface = "Our organization commits to environmental stewardship.";
  await h.save({ step: "declaration", policy: h.policy, importedPolicy: null });
  assert.equal(h.state.stored.filledSections, before + 1);
  assert.equal(h.state.visible?.progress.filledSections, before + 1);
  assert.equal(h.state.visible?.progress.documentVersion, h.backendLockVersion.current);
  h.policy.declaration.preface = " \n ";
  await h.save({ step: "declaration", policy: h.policy, importedPolicy: null });
  assert.equal(h.state.visible?.progress.filledSections, before);
  assert.equal(h.state.visible?.progress.percentage, h.state.stored.percentage);
});

test("failed document saves do not refresh or advance task progress", async () => {
  const h = harness();
  const before = h.state.visible?.progress;
  h.state.failPatch = true;
  h.policy.monitoring = "We review environmental performance quarterly.";
  await assert.rejects(h.save({ step: "responsibilities", policy: h.policy, importedPolicy: null }), /Could not save/);
  assert.equal(h.state.reads, 0);
  assert.deepEqual(h.state.visible?.progress, before);
});

test("a task refresh error preserves successful document save and last confirmed progress", async () => {
  const h = harness();
  const before = h.state.visible?.progress;
  h.state.failRead = true;
  h.policy.monitoring = "We review environmental performance quarterly.";
  await h.save({ step: "responsibilities", policy: h.policy, importedPolicy: null });
  assert.equal(h.state.saveStatus, "saved");
  assert.equal(h.backendLockVersion.current, 2);
  assert.deepEqual(h.state.visible?.progress, before);
  assert.match(h.state.taskError, /Task refresh unavailable/);
});

test("older task responses cannot replace newer saved progress", async () => {
  const h = harness();
  const pending: Array<(response: unknown) => void> = [];
  const load = callback<Load>("load", { ...h.loadBindings, fetch: () => new Promise((resolve) => { pending.push(resolve); }) });
  const older = load();
  const newer = load();
  const response = (count: number) => ({ ok: true, json: async () => ({ tasks: [{ id: "task-1", manager: { id: "manager-1" }, progress: { ...h.state.stored, filledSections: count } }] }) });
  pending[1](response(5));
  await newer;
  pending[0](response(3));
  await older;
  assert.equal(h.state.visible?.progress.filledSections, 5);
  assert.equal(h.state.loading, false);
});

test("task responses from a previous document are ignored after switching documents", async () => {
  const h = harness();
  let resolve!: (response: unknown) => void;
  const load = callback<Load>("load", { ...h.loadBindings, fetch: () => new Promise((done) => { resolve = done; }) });
  const pending = load();
  h.loadBindings.taskContextIdentityRef.current = "draft-2:task-2:manager-1";
  h.state.visible = null;
  resolve({ ok: true, json: async () => ({ tasks: [{ id: "task-1", manager: { id: "manager-1" }, progress: h.state.stored }] }) });
  await pending;
  assert.equal(h.state.visible, null);
});
