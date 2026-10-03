import assert from "node:assert/strict";
import test from "node:test";
import { createPolicyCraftInvitationToken, hashPolicyCraftInvitationToken } from "./policycraft-invitation-tokens";

test("invitation links are high entropy and only their SHA-256 hash is persisted", () => {
  const first = createPolicyCraftInvitationToken();
  const resent = createPolicyCraftInvitationToken();
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.tokenHash, hashPolicyCraftInvitationToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
  assert.notEqual(resent.tokenHash, first.tokenHash);
  assert.notEqual(hashPolicyCraftInvitationToken(first.token), hashPolicyCraftInvitationToken(resent.token));
});
