import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessOrganization,
  canFallbackToLegacyOrganization,
  canMutateOrganization,
  normalizePolicyCraftEmail,
} from "./policycraft-access-policy";

test("admins can review historical organizations but only write active records", () => {
  const admin = { role: "admin" as const };
  assert.equal(canAccessOrganization(admin, { id: 7, deleted: true, expired: true }, true), true);
  assert.equal(canMutateOrganization(admin, { id: 7, deleted: true, expired: false }), false);
  assert.equal(canMutateOrganization(admin, { id: 7, deleted: false, expired: true }), true);
});

test("managers need a current assignment and an available organization", () => {
  const manager = { role: "manager" as const };
  assert.equal(canAccessOrganization(manager, { id: 7, deleted: false, expired: false }, true), true);
  assert.equal(canAccessOrganization(manager, { id: 7, deleted: false, expired: false }, false), false);
  assert.equal(canAccessOrganization(manager, { id: 7, deleted: false, expired: true }, true), false);
  assert.equal(canAccessOrganization(manager, { id: 7, deleted: true, expired: false }, true), false);
});

test("legacy users can never access a standalone organization even when IDs collide", () => {
  const user = { role: "user" as const };
  const standalone = { id: 12, source: "standalone" as const, deleted: false, expired: false };
  assert.equal(canAccessOrganization(user, standalone, true), false);
  assert.equal(canMutateOrganization(user, standalone, true), false);
  assert.equal(canAccessOrganization(user, { ...standalone, source: "esg" }, true), true);
});

test("legacy single-organization fallback applies only when PolicyCraft access is absent", () => {
  assert.equal(canFallbackToLegacyOrganization(null, "12"), true);
  assert.equal(canFallbackToLegacyOrganization("disabled", "12"), false);
  assert.equal(canFallbackToLegacyOrganization("pending", "12"), false);
  assert.equal(canFallbackToLegacyOrganization(null, ""), false);
});

test("manager invitations canonicalize email before duplicate checks", () => {
  assert.equal(normalizePolicyCraftEmail("  Manager@Example.COM "), "manager@example.com");
});
