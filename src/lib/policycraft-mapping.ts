import type { Policy, Site } from "./types";
import type { CompanyMasterSnapshot } from "./policycraft-types";

type OrganizationRow = {
  id: number;
  org_code: string;
  company_name: string;
  address: string;
  country: string;
  city: string;
  website: string;
  sector: string | null;
  sub_sector: string | null;
};

type SiteRow = {
  id: number;
  site_code: string;
  name: string;
  address: string;
  type: string;
};

export function mapCompanyMaster(organization: OrganizationRow, siteRows: SiteRow[]): CompanyMasterSnapshot {
  const sites: Site[] = siteRows.map((site) => ({
    id: String(site.id),
    location: site.name || "",
    address: site.address || "",
    primaryFunction: site.type || "",
  }));

  if (sites.length === 0 && organization.address.trim()) {
    sites.push({
      id: "organization-address",
      location: organization.city || organization.company_name || "",
      address: organization.address,
      primaryFunction: "",
    });
  }

  return {
    id: organization.id,
    code: organization.org_code,
    name: organization.company_name,
    industry: organization.sector || "",
    subCategory: organization.sub_sector || "",
    country: organization.country || "",
    websiteLink: organization.website || "",
    address: organization.address || "",
    city: organization.city || "",
    sites: sites.map((site) => ({
      id: site.id || "",
      location: site.location || "",
      address: site.address || "",
      primaryFunction: site.primaryFunction || "",
    })),
  };
}

export function applyCompanyMaster(policy: Policy, snapshot: CompanyMasterSnapshot): Policy {
  const firstAddress = snapshot.sites[0]?.address || "";
  return {
    ...policy,
    company: {
      ...policy.company,
      name: snapshot.name,
      industry: snapshot.industry,
      subCategory: snapshot.subCategory,
      country: snapshot.country,
      websiteLink: snapshot.websiteLink,
      site: firstAddress,
      sites: snapshot.sites.map((site) => ({ ...site })),
    },
  };
}

