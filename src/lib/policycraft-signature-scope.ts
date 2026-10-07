import type { PolicyCraftWorkspaceScope } from "./policycraft-access-types";

const SIGNATURE_ENDPOINT = "/api/policycraft/signatures/me";

/** Saved signature operations are valid only inside a persisted policy scope. */
export function policyCraftSignatureScopeKey(scope: PolicyCraftWorkspaceScope | null): string | null {
  if (!scope?.userId || !Number.isSafeInteger(scope.organizationId) || scope.organizationId <= 0 || !scope.documentId?.trim()) return null;
  return JSON.stringify([scope.userId, scope.organizationId, scope.documentId]);
}

export function policyCraftSignatureUrl(scope: PolicyCraftWorkspaceScope | null): string | null {
  if (!policyCraftSignatureScopeKey(scope)) return null;
  const query = new URLSearchParams({ orgId: String(scope!.organizationId), documentId: scope!.documentId! });
  return `${SIGNATURE_ENDPOINT}?${query.toString()}`;
}

export function isCurrentPolicyCraftSignatureScope(
  expectedKey: string | null,
  currentScope: PolicyCraftWorkspaceScope | null,
): boolean {
  return expectedKey !== null && policyCraftSignatureScopeKey(currentScope) === expectedKey;
}
