import assert from "node:assert/strict";
import test from "node:test";
import { policyCraftExportContext, policyCraftScopeKey, policyCraftUrl, usePolicyCraftScope } from "./policycraft-client-scope";
import type { PolicyCraftWorkspaceScope } from "./policycraft-access-types";

const scope: PolicyCraftWorkspaceScope = { userId: "7", role: "manager", organizationId: 23, organizationName: "Client A", documentId: "draft-a" };

test("explicit row scope overrides selected org for mixed admin policy thumbnails", () => {
  usePolicyCraftScope.getState().setScope(scope);
  assert.equal(policyCraftUrl("/api/policycraft/cover-assets/artwork?orgId=23", { ...scope, organizationId: 24 }), "/api/policycraft/cover-assets/artwork?orgId=24");
  assert.deepEqual(policyCraftExportContext(), { orgId: 23, documentId: "draft-a" });
  usePolicyCraftScope.getState().setScope(null);
});

test("logout clears organization selectors and cache identities separate accounts and organizations", () => {
  usePolicyCraftScope.getState().setScope(scope);
  assert.notEqual(policyCraftScopeKey(scope), policyCraftScopeKey({ ...scope, userId: "8" }));
  assert.notEqual(policyCraftScopeKey(scope), policyCraftScopeKey({ ...scope, organizationId: 24 }));
  usePolicyCraftScope.getState().setScope(null);
  assert.deepEqual(policyCraftExportContext(), {});
  assert.equal(policyCraftScopeKey(usePolicyCraftScope.getState().scope), "unbound");
  assert.equal(policyCraftUrl("/api/policycraft/documents?view=archived"), "/api/policycraft/documents?view=archived");
});
