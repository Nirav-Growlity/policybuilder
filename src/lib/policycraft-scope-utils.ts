import type { PolicyCraftWorkspaceScope } from "./policycraft-access-types";

/** Works in server renderers as well as browser controls. */
export function policyCraftScopedUrl(path: string, organizationId?: number): string {
  if (organizationId === undefined) return path;
  const url = new URL(path, "https://policycraft.invalid");
  url.searchParams.set("orgId", String(organizationId));
  return `${url.pathname}${url.search}${url.hash}`;
}

export function policyCraftScopeKey(scope: PolicyCraftWorkspaceScope | null): string {
  return scope ? `${scope.userId}:${scope.organizationId}` : "unbound";
}
