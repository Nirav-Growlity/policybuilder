export type PolicyType = "environmental" | "labour-human-rights" | "living-wage" | "ethics" | "sustainable-procurement";

export interface Site {
  id?: string;
  location?: string;
  address: string;
  primaryFunction?: string;
}

export interface Company {
  name: string;
  industry: string;
  subCategory?: string;
  country?: string;
  websiteLink?: string;
  companyLogo?: string;
  reportingPeriod?: "FY" | "CY";
  site?: string;
  sites?: Site[];
  docNum: string;
  revNum: string;
  effectiveDate: string;
  lastReviewDate?: string;
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

export interface PolicyDefinitions {
  title: string;
  content: string;
}

export interface QuantitativeTarget {
  target: string;
  baseline: string;
  deadline: string;
  reportingFrequency?: "Annually" | "Target period";
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
  | "structure"
  | "declaration"
  | "focus"
  | "qualitative"
  | "quantitative"
  | "sdg"
  | "responsibilities"
  | "custom"
  | "export";

export type PresentationTemplate =
  | "standard"
  | "executive"
  | "comprehensive";

export type VisualStyle = "corporate" | "modern";

export type DocumentThemeId =
  | "evergreen-heritage"
  | "executive-navy"
  | "modern-teal"
  | "earth-editorial";

export type StandardSectionKind =
  | "preface" | "declaration" | "scope" | "definitions"
  | "focus" | "qualitative" | "quantitative" | "sdg" | "responsibilities"
  | "monitoring" | "review" | "revision";

export type RichTextBlock = {
  id: string;
  type: "paragraph" | "bullets" | "numbered" | "table";
  text: string;
  columns?: string[];
  rows?: string[][];
};

export interface PolicySection {
  id: string;
  kind: StandardSectionKind | "custom";
  title: string;
  enabled: boolean;
  blocks?: RichTextBlock[];
}

export type SdgDisplayMode = "names" | "tiles";
export type LogoPosition = "left" | "center" | "right";
export type DocumentTypography = {
  fontFamily: string;
  headingFontFamily?: string;
  headingSize: number;
  subheadingSize: number;
  paragraphSize: number;
  lineSpacing: number;
};

export interface RevisionEntry {
  revisionNo: string;
  date: string;
  description: string;
}

export interface Policy {
  policyType: PolicyType;
  presentationTemplate?: PresentationTemplate;
  documentTheme?: DocumentThemeId;
  visualStyle?: VisualStyle;
  sections?: PolicySection[];
  showTableOfContents?: boolean;
  showAcknowledgement?: boolean;
  showRevisionHistory?: boolean;
  sdgDisplay?: SdgDisplayMode;
  logoPosition?: LogoPosition;
  typography?: DocumentTypography;
  company: Company;
  standards: string[];
  declaration: Declaration;
  definitions?: PolicyDefinitions;
  focusAreas: string[];
  qualitative: Record<string, string[]>;
  quantitative: QuantitativeArea[];
  sdgs: number[];
  responsibilities: Responsibility[];
  monitoring: string;
  reviewMechanism: string;
  revisionHistory?: RevisionEntry[];
}

export interface StepDef {
  id: StepId;
  label: string;
  desc: string;
  icon: string;
}
