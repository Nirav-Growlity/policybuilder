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

export function OrganizationSourceBadge({ organization, className = "" }: { organization: OrganizationSource; className?: string }) {
  const standalone = organization.source === "standalone";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-4 ${standalone ? "border-[var(--color-forest)]/20 bg-[var(--color-forest-soft)] text-[var(--color-forest)]" : "border-[var(--color-line)] bg-[var(--color-cream-2)] text-[var(--color-muted)]"} ${className}`}>
    {organizationSourceName(organization)}
  </span>;
}
