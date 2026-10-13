import type { SelectMenuOption } from "@/components/ui/select-menu";
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

/**
 * Dropdown options for organizations. Mixed lists are grouped by source instead of
 * repeating the source on every row; the code stays searchable.
 */
export function organizationSelectOptions(organizations: (OrganizationSource & { code?: string; deleted?: boolean; expired?: boolean })[]): SelectMenuOption[] {
  const mixed = new Set(organizations.map((organization) => isStandaloneOrganization(organization))).size > 1;
  return [...organizations]
    .sort((a, b) => (mixed ? Number(isStandaloneOrganization(a)) - Number(isStandaloneOrganization(b)) : 0))
    .map((organization) => ({
      value: String(organization.id),
      label: organization.name,
      description: organization.deleted ? "Deleted" : organization.expired ? "Subscription expired" : undefined,
      group: mixed ? `${organizationSourceName(organization)}s` : undefined,
      keywords: `${organization.code ?? ""} ${organizationSourceName(organization)}`,
    }));
}

/** Source shown as quiet secondary text beside an organization name, never as a pill. */
export function OrganizationSourceLabel({ organization, className = "" }: { organization: OrganizationSource; className?: string }) {
  return <span className={`text-[12px] font-medium leading-4 text-[var(--pc-muted,var(--color-muted))] ${className}`}>
    {isStandaloneOrganization(organization) ? "PolicyCraft" : "ESG"}
  </span>;
}
