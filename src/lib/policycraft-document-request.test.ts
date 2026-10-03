import test from "node:test";
import assert from "node:assert/strict";
import { canPerformPolicyCraftDocumentAction, policyCraftDocumentAction, policyCraftDocumentMutationResponse } from "./policycraft-document-request";

test("existing archive flags and admin action payloads resolve to the same operation", () => {
  assert.equal(policyCraftDocumentAction({ archived: true }), "archive");
  assert.equal(policyCraftDocumentAction({ archived: false }), "restore");
  assert.equal(policyCraftDocumentAction({ action: "archive" }), "archive");
  assert.equal(policyCraftDocumentAction({ action: "restore" }), "restore");
  assert.equal(policyCraftDocumentAction({ action: "delete" }), "delete");
  assert.equal(policyCraftDocumentAction({ archived: "false" }), null);
});

test("client archive rights remain intact and managers cannot restore or permanently delete", () => {
  for (const action of ["archive", "restore", "delete"] as const) {
    assert.equal(canPerformPolicyCraftDocumentAction("admin", action), true);
    assert.equal(canPerformPolicyCraftDocumentAction("user", action), true);
    assert.equal(canPerformPolicyCraftDocumentAction("manager", action), action === "archive");
  }
});

test("saved document responses supply the next lock version and conflicts never read as success", async () => {
  const saved = { id: "policy-one", lockVersion: 2 };
  assert.deepEqual(await (await policyCraftDocumentMutationResponse("updated", async () => saved)).json(), { document: saved });
  for (const result of ["conflict", "not_found"] as const) {
    const response = await policyCraftDocumentMutationResponse(result, async () => { throw new Error("must not load on failure"); });
    assert.equal(response.status, result === "conflict" ? 409 : 404);
  }
});
