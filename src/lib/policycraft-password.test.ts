import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { hasUsablePolicyCraftPasswordHash, verifyPolicyCraftPasswordHash } from "./policycraft-password";

test("shared password verification accepts current bcrypt and legacy ESG SHA-256 credentials", async () => {
  const password = "existing-account-password";
  const bcryptHash = await bcrypt.hash(password, 4);
  const legacyHash = createHash("sha256").update(password).digest("hex");

  assert.equal(await verifyPolicyCraftPasswordHash(bcryptHash, password), true);
  assert.equal(await verifyPolicyCraftPasswordHash(legacyHash, password), true);
  assert.equal(await verifyPolicyCraftPasswordHash(bcryptHash, "wrong-password"), false);
  assert.equal(await verifyPolicyCraftPasswordHash("malformed-hash", password), false);
  assert.equal(hasUsablePolicyCraftPasswordHash(bcryptHash), true);
  assert.equal(hasUsablePolicyCraftPasswordHash(legacyHash), true);
  assert.equal(hasUsablePolicyCraftPasswordHash("malformed-hash"), false);
  assert.equal(hasUsablePolicyCraftPasswordHash(null), false);
});

test("credential eligibility rejects uppercase legacy hashes and unsupported bcrypt costs", () => {
  assert.equal(hasUsablePolicyCraftPasswordHash("A".repeat(64)), false);
  assert.equal(hasUsablePolicyCraftPasswordHash(`$2b$99$${"A".repeat(53)}`), false);
  assert.equal(hasUsablePolicyCraftPasswordHash(`$2b$03$${"A".repeat(53)}`), false);
});
