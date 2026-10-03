"use client";

import { create } from "zustand";
import type { PolicyCraftWorkspaceScope } from "./policycraft-access-types";
import { policyCraftScopedUrl } from "./policycraft-scope-utils";
export { policyCraftScopeKey } from "./policycraft-scope-utils";

/** Ephemeral, shared context for requests made by nested builder controls. */
export const usePolicyCraftScope = create<{
  scope: PolicyCraftWorkspaceScope | null;
  setScope: (scope: PolicyCraftWorkspaceScope | null) => void;
}>((set) => ({ scope: null, setScope: (scope) => set({ scope }) }));

export function policyCraftUrl(path: string, scope = usePolicyCraftScope.getState().scope): string {
  return policyCraftScopedUrl(path, scope?.organizationId);
}

export function policyCraftExportContext(scope = usePolicyCraftScope.getState().scope) {
  return scope ? { orgId: scope.organizationId, ...(scope.documentId ? { documentId: scope.documentId } : {}) } : {};
}

