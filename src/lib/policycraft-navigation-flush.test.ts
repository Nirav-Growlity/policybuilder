import assert from "node:assert/strict";
import test from "node:test";
import { flushPendingNavigation, registerNavigationFlush } from "./policycraft-navigation-flush";

test("resolves immediately when no builder flush is registered", async () => {
  await flushPendingNavigation();
});

test("waits for the registered flush to finish before resolving", async () => {
  const events: string[] = [];
  let release!: () => void;
  const unregister = registerNavigationFlush(() => new Promise<void>((resolve) => {
    events.push("flush started");
    release = () => { events.push("flush finished"); resolve(); };
  }));

  const navigation = flushPendingNavigation().then(() => { events.push("navigate"); });
  await Promise.resolve();
  assert.deepEqual(events, ["flush started"]);
  release();
  await navigation;
  assert.deepEqual(events, ["flush started", "flush finished", "navigate"]);
  unregister();
});

test("propagates a failed flush so the caller can stay on the page", async () => {
  const unregister = registerNavigationFlush(async () => { throw new Error("draft conflict"); });
  await assert.rejects(flushPendingNavigation(), /draft conflict/);
  unregister();
});

test("a stale unregister does not remove a newer registration", async () => {
  let calls = 0;
  const unregisterOld = registerNavigationFlush(async () => undefined);
  const unregisterNew = registerNavigationFlush(async () => { calls += 1; });
  unregisterOld();
  await flushPendingNavigation();
  assert.equal(calls, 1);
  unregisterNew();
  await flushPendingNavigation();
  assert.equal(calls, 1);
});
