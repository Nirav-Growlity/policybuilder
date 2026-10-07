import assert from "node:assert/strict";
import test from "node:test";
import type { PolicyCraftActor } from "./policycraft-auth";
import { authorizePolicyCraftSignatureScope, parsePolicyCraftSignatureScope } from "./policycraft-signature-request";

const actor: PolicyCraftActor = { user: { id: "7", name: "Editor", email: "editor@example.test" }, role: "admin" };

test("signature request requires a positive organization id and saved document id", () => {
  for (const url of [
    "https://policycraft.test/api/policycraft/signatures/me",
    "https://policycraft.test/api/policycraft/signatures/me?orgId=&documentId=policy-a",
    "https://policycraft.test/api/policycraft/signatures/me?orgId=1e2&documentId=policy-a",
    "https://policycraft.test/api/policycraft/signatures/me?orgId=0&documentId=policy-a",
    "https://policycraft.test/api/policycraft/signatures/me?orgId=23",
    `https://policycraft.test/api/policycraft/signatures/me?orgId=23&documentId=${"x".repeat(129)}`,
  ]) {
    assert.ok("error" in parsePolicyCraftSignatureScope(new URL(url)), url);
  }
  assert.deepEqual(parsePolicyCraftSignatureScope(new URL("https://policycraft.test/api?orgId=23&documentId=%20policy-a%20")), {
    scope: { organizationId: 23, documentId: "policy-a" },
  });
});

test("signature authorization forwards exact document scope and read/write intent before returning canonical org", async () => {
  const calls: unknown[] = [];
  const authorize = async (_actor: PolicyCraftActor, request: { organizationId: number; documentId: string; operation: "read" | "write" }) => {
    calls.push(request);
    return { id: request.organizationId };
  };
  const read = await authorizePolicyCraftSignatureScope(actor, new URL("https://policycraft.test/api?orgId=23&documentId=policy-a"), "read", authorize);
  const write = await authorizePolicyCraftSignatureScope(actor, new URL("https://policycraft.test/api?orgId=24&documentId=policy-b"), "write", authorize);
  assert.deepEqual(read, { scope: { organizationId: 23, documentId: "policy-a" } });
  assert.deepEqual(write, { scope: { organizationId: 24, documentId: "policy-b" } });
  assert.deepEqual(calls, [
    { organizationId: 23, documentId: "policy-a", operation: "read" },
    { organizationId: 24, documentId: "policy-b", operation: "write" },
  ]);

  const denied = await authorizePolicyCraftSignatureScope(actor, new URL("https://policycraft.test/api?orgId=23&documentId=policy-b"), "write", async () => null);
  assert.deepEqual(denied, { error: "Organization access denied.", status: 403 });
});
