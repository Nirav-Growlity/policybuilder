import assert from "node:assert/strict";
import test from "node:test";
import { createPolicyCraftBuilderStorage, policyCraftBuilderStorageKey } from "./policycraft-builder-storage";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test("builder storage stays inert until a validated user and organization scope is set", () => {
  const backing = memoryStorage();
  const controller = createPolicyCraftBuilderStorage(() => backing);

  assert.equal(controller.storage.getItem("policycraft-builder-v1"), null);
  controller.storage.setItem("policycraft-builder-v1", "unbound");
  assert.equal(backing.values.size, 0);
  assert.throws(() => controller.setScope("user-1", 0));
  assert.equal(backing.values.size, 0);
});

test("builder state is isolated by actor and organization and legacy ownerless state is untouched", () => {
  const backing = memoryStorage();
  const controller = createPolicyCraftBuilderStorage(() => backing);
  backing.setItem("policycraft-builder-v1", "legacy");

  controller.setScope("user/a", 42);
  controller.storage.setItem("policycraft-builder-v1", "org-42 state");
  controller.setScope("user/a", 73);
  assert.equal(controller.storage.getItem("policycraft-builder-v1"), null);
  controller.storage.setItem("policycraft-builder-v1", "org-73 state");
  controller.setScope("user/b", 42);
  assert.equal(controller.storage.getItem("policycraft-builder-v1"), null);

  controller.setScope("user/a", 42);
  assert.equal(controller.storage.getItem("policycraft-builder-v1"), "org-42 state");
  assert.equal(backing.getItem("policycraft-builder-v1"), "legacy");
  assert.equal(controller.getScopeKey(), "user/a:42");
});

test("storage keys escape actor/org scope and scope clearing disables reads and writes", () => {
  const backing = memoryStorage();
  const controller = createPolicyCraftBuilderStorage(() => backing);
  const key = policyCraftBuilderStorageKey("builder", "name:3/4");
  assert.equal(key, "builder:v2:name%3A3%2F4");

  controller.setScope("user-3", 4);
  controller.storage.setItem("draft", "saved");
  controller.clearScope();
  assert.equal(controller.getScopeKey(), null);
  assert.equal(controller.storage.getItem("draft"), null);
  controller.storage.removeItem("draft");
  controller.storage.setItem("draft", "unbound");
  assert.equal(backing.values.size, 1);
});
