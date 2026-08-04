export type PolicyType = "environmental";

export interface Site {
  id?: string;
  location?: string;
  address: string;
  primaryFunction?: string;
}

export interface Company {
  name: string;
  industry: string;
  site?: string;
  sites?: Site[];
  docNum: string;
  revNum: string;
  effectiveDate: string;
  reviewDate: string;
  approver: string;
}

export function getCompanySites(company?: Company): Site[] {
  if (!company) return [];
  if (Array.isArray(company.sites) && company.sites.length > 0) {
    return company.sites;
  }
  const legacyAddr = company.site || (company as any)?.address;
  if (legacyAddr && String(legacyAddr).trim()) {
    return [
      {
        location: company.name || "Main Site",
        address: String(legacyAddr).trim(),
        primaryFunction: "Operating Facility",
      },
    ];
  }
  return [];
}

export interface Declaration {
  preface: string;
  declaration: string;
  scope: string;
}

export interface QuantitativeTarget {
  target: string;
  baseline: string;
  deadline: string;
}

export interface QuantitativeArea {
  area: string;
  targets: QuantitativeTarget[];
}

export interface Responsibility {
  role: string;
  duty: string;
}

export type StepId =
  | "setup"
  | "declaration"
  | "focus"
  | "qualitative"
  | "quantitative"
  | "sdg"
  | "responsibilities"
  | "export";

export type PresentationTemplate =
  | "standard"
  | "executive"
  | "comprehensive";

export type VisualStyle = "corporate" | "modern";

export interface Policy {
  policyType: PolicyType;
  presentationTemplate?: PresentationTemplate;
  visualStyle?: VisualStyle;
  company: Company;
  standards: string[];
  declaration: Declaration;
  focusAreas: string[];
  qualitative: Record<string, string[]>;
  quantitative: QuantitativeArea[];
  sdgs: number[];
  responsibilities: Responsibility[];
  monitoring: string;
  reviewMechanism: string;
}

export interface StepDef {
  id: StepId;
  label: string;
  desc: string;
  icon: string;
}
