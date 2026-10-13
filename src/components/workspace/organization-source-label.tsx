import type { PolicyCraftOrganization } from "@/lib/policycraft-access-types";

type OrganizationSource = Pick<PolicyCraftOrganization, "id" | "name"> & {
  source?: "esg" | "standalone";
};

export function isStandaloneOrganization(organization: OrganizationSource): boolean {
  return organization.source === "standalone";
}

export function organizationSourceName(organization: OrganizationSource): string {
  return isStandaloneOrganization(organization) ? "PolicyCraft organization" : "ESG organization";
}

/** Source shown as quiet secondary text beside an organization name, never as a pill. */
export function OrganizationSourceLabel({ organization, className = "" }: { organization: OrganizationSource; className?: string }) {
  return <span className={`text-[12px] font-medium leading-4 text-[var(--pc-muted,var(--color-muted))] ${className}`}>
    {isStandaloneOrganization(organization) ? "PolicyCraft" : "ESG"}
  </span>;
}
