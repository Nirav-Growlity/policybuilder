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
  const legacyAddr = company.site || (company as Company & { address?: string }).address;
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

export type DocumentLayoutId =
  | "clean-essentials"
  | "executive"
  | "governance"
  | "institutional"
  | "editorial"
  | "impact"
  | "data"
  | "technical";

export type DocumentThemeId =
  | "plain-standard" | "modern-standard" | "accessible-standard"
  | "executive-brief" | "board-paper" | "leadership-memo"
  | "governance-manual" | "compliance-policy" | "audit-dossier"
  | "public-sector-standard" | "institutional-report" | "legal-register"
  | "editorial-report" | "magazine-policy" | "field-report"
  | "sustainability-report" | "sdg-impact" | "community-brief"
  | "kpi-report" | "metrics-ledger" | "performance-review"
  | "research-paper" | "technical-standard" | "evidence-review";

export type LegacyDocumentThemeId =
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

export type DocumentThemePalette = {
  primary: string;
  primaryDark: string;
  soft: string;
  paper: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  onPrimary: string;
};

export type ThemeBackground =
  | { kind: "solid"; color: string }
  | {
      kind: "gradient";
      from: string;
      to: string;
      direction: "vertical" | "horizontal" | "diagonal";
    };

export type ThemeDensity = "compact" | "balanced" | "spacious";
export type LogoScale = "small" | "medium" | "large";

export type DocumentThemeOverrides = {
  schemaVersion: 1;
  customThemeName?: string;
  colors?: Partial<DocumentThemePalette>;
  background?: ThemeBackground;
  density?: ThemeDensity;
  logoScale?: LogoScale;
};

export type SavedDocumentTheme = {
  schemaVersion: 1;
  id: string;
  name: string;
  baseThemeId: DocumentThemeId;
  overrides: DocumentThemeOverrides;
  typography: DocumentTypography;
  visualStyle: VisualStyle;
  logoPosition: LogoPosition;
  sdgDisplay: SdgDisplayMode;
  createdAt: string;
  updatedAt: string;
};

export type FeatureImagePlacement = "cover" | "section";

export type PolicyFeatureImage = {
  dataUrl: string;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  placement: FeatureImagePlacement;
  focalPosition: { x: number; y: number };
  altText: string;
};

export interface RevisionEntry {
  revisionNo: string;
  date: string;
  description: string;
}

export type ImportedPolicyBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; rows: string[][] };

export interface ImportedPolicySection {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  kind: StandardSectionKind | "custom";
  blocks: ImportedPolicyBlock[];
}

/** A DOCX reference used by AI generation. It is intentionally separate from Policy. */
export interface ImportedPolicyContext {
  fileName: string;
  policyType: PolicyType;
  title: string;
  text: string;
  sections: ImportedPolicySection[];
  importedAt: string;
}

export interface Policy {
  policyType: PolicyType;
  presentationTemplate?: PresentationTemplate;
  documentTheme?: DocumentThemeId;
  documentThemeOverrides?: DocumentThemeOverrides;
  visualStyle?: VisualStyle;
  sections?: PolicySection[];
  showTableOfContents?: boolean;
  showAcknowledgement?: boolean;
  showRevisionHistory?: boolean;
  sdgDisplay?: SdgDisplayMode;
  logoPosition?: LogoPosition;
  typography?: DocumentTypography;
  featureImage?: PolicyFeatureImage;
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
