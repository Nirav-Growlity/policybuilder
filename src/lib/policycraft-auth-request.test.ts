import assert from "node:assert/strict";
import test from "node:test";
// Importing this contract creates a pool; these tests never connect or query.
process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:1/policycraft_test";
const authContract = import("./policycraft-auth");

test("organization selectors require a positive decimal id and reject malformed values", async () => {
  const { parsePolicyCraftOrganizationSelector } = await authContract;
  assert.deepEqual(parsePolicyCraftOrganizationSelector(undefined), { provided: false });
  assert.deepEqual(parsePolicyCraftOrganizationSelector(""), { provided: true, valid: false });
  assert.deepEqual(parsePolicyCraftOrganizationSelector("1e2"), { provided: true, valid: false });
  assert.deepEqual(parsePolicyCraftOrganizationSelector("-4"), { provided: true, valid: false });
  assert.deepEqual(parsePolicyCraftOrganizationSelector("9007199254740992"), { provided: true, valid: false });
  assert.deepEqual(parsePolicyCraftOrganizationSelector("42"), { provided: true, valid: true, organizationId: 42 });
});

test("protected mutations reject a missing or untrusted Origin before body processing", async () => {
  const { policyCraftMutationFailure } = await authContract;
  const missingOrigin = new Request("http://localhost:3002/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const untrustedOrigin = new Request("http://localhost:3002/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.invalid" },
    body: "{}",
  });

  assert.equal(policyCraftMutationFailure(missingOrigin, "json")?.status, 403);
  assert.equal(policyCraftMutationFailure(untrustedOrigin, "json")?.status, 403);
});
