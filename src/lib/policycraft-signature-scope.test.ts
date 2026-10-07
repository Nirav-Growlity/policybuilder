import assert from "node:assert/strict";
import test from "node:test";
import type { PolicyCraftWorkspaceScope } from "./policycraft-access-types";
import { isCurrentPolicyCraftSignatureScope, policyCraftSignatureScopeKey, policyCraftSignatureUrl } from "./policycraft-signature-scope";

const scope: PolicyCraftWorkspaceScope = {
  userId: "user-1",
  role: "admin",
  organizationId: 12,
  organizationName: "Northwind",
  documentId: "policy-1",
};

test("signature scope requires a persisted document and includes user, organization, and document", () => {
  assert.equal(policyCraftSignatureScopeKey({ ...scope, documentId: undefined }), null);
  assert.equal(policyCraftSignatureScopeKey({ ...scope, organizationId: 0 }), null);
  assert.equal(policyCraftSignatureScopeKey({ ...scope, organizationId: -1 }), null);
  assert.equal(policyCraftSignatureUrl(null), null);
  assert.notEqual(policyCraftSignatureScopeKey(scope), policyCraftSignatureScopeKey({ ...scope, documentId: "policy-2" }));
  assert.notEqual(policyCraftSignatureScopeKey(scope), policyCraftSignatureScopeKey({ ...scope, organizationId: 13 }));
  assert.notEqual(policyCraftSignatureScopeKey(scope), policyCraftSignatureScopeKey({ ...scope, userId: "user-2" }));
  assert.equal(policyCraftSignatureUrl(scope), "/api/policycraft/signatures/me?orgId=12&documentId=policy-1");
});

test("delayed signature results are rejected after same-organization or cross-organization policy switches", () => {
  const requestKey = policyCraftSignatureScopeKey(scope);
  assert.equal(isCurrentPolicyCraftSignatureScope(requestKey, { ...scope, documentId: "policy-2" }), false);
  assert.equal(isCurrentPolicyCraftSignatureScope(requestKey, { ...scope, organizationId: 13, documentId: "policy-1" }), false);
  assert.equal(isCurrentPolicyCraftSignatureScope(requestKey, scope), true);
  assert.equal(isCurrentPolicyCraftSignatureScope(requestKey, { ...scope, documentId: undefined }), false);
});
