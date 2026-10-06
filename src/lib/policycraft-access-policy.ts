import type { PolicyCraftRole } from "./policycraft-access-types";

export type PolicyCraftAuthorizationActor = {
  role: PolicyCraftRole;
};

export type PolicyCraftOrganizationAvailability = {
  id: number;
  source?: "esg" | "standalone";
  deleted: boolean;
  expired: boolean;
};

export function normalizePolicyCraftEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export function canFallbackToLegacyOrganization(
  accessStatus: "active" | "pending" | "disabled" | "delivery_failed" | null,
  legacyOrganizationId: string | null | undefined,
): boolean {
  return accessStatus === null && Number.isInteger(Number(legacyOrganizationId)) && Number(legacyOrganizationId) > 0;
}

export function canAccessOrganization(
  actor: PolicyCraftAuthorizationActor,
  organization: PolicyCraftOrganizationAvailability,
  hasAssignment: boolean,
): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "user" && organization.source === "standalone") return false;
  if (!hasAssignment || organization.deleted || organization.expired) return false;
  return actor.role === "manager" || actor.role === "user";
}

export function canMutateOrganization(
  actor: PolicyCraftAuthorizationActor,
  organization: PolicyCraftOrganizationAvailability,
  hasAssignment = true,
): boolean {
  if (actor.role === "user" && organization.source === "standalone") return false;
  if (organization.deleted) return false;
  if (actor.role === "admin") return true;
  return hasAssignment && !organization.expired && (actor.role === "manager" || actor.role === "user");
}
