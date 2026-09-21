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
  logoPalette?: LogoColorPalette;
  reportingPeriod?: "FY" | "CY";
  site?: string;
  sites?: Site[];
  docNum: string;
  revNum: string;
  effectiveDate: string;
  lastReviewDate?: string;
  reviewDate: string;
  approver: string;
  reviewerDesignations?: string[];
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

export interface FocusAreaSelectionItem {
  id: string;
  label: string;
  selected: boolean;
}

export type FocusAreaSelectionState =
  | { mode: "profile-default" }
  | {
      mode: "custom";
      /** Optional selectable rows for profile defaults and user-managed areas. */
      focusAreaItems?: FocusAreaSelectionItem[];
    }
  | {
      mode: "catalog";
      catalogKey: string;
      selectedFixedAreaIds: string[];
      manualAreas: string[];
      /** Includes unchecked manual rows so they remain available to reselect. */
      focusAreaItems?: FocusAreaSelectionItem[];
      /** Display labels chosen for fixed area IDs; IDs retain their workbook identity. */
      fixedAreaLabelOverrides?: Record<string, string>;
    };

export interface QuantitativeTarget {
  target: string;
  baseline: string;
  deadline: string;
  reportingFrequency?: "Annually" | "Target period";
  subtopics?: string[];
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

export type CanonicalDocumentTemplateId =
  | "standard-pack"
  | "executive-brief"
  | "controlled-manual"
  | "governance-register"
  | "operations-guide"
  | "sustainability-charter"
  | "people-charter"
  | "metrics-ledger";

/** Hidden aliases retained so saved policies can migrate without data loss. */
export type DocumentTemplateAliasId =
  | "corporate-standard-v1" | "executive-editorial-v1" | "governance-manual-v1"
  | "modern-minimal-v1" | "sustainability-report-v1" | "institutional-classic-v1"
  | "plain-standard" | "modern-standard" | "accessible-standard" | "monochrome-grid"
  | "board-paper" | "leadership-memo"
  | "governance-manual" | "compliance-policy" | "audit-dossier"
  | "public-sector-standard" | "institutional-report" | "legal-register"
  | "editorial-report" | "magazine-policy" | "field-report"
  | "sustainability-report" | "outcome-impact" | "community-brief"
  | "kpi-report" | "performance-review"
  | "research-paper" | "technical-standard" | "evidence-review"
  | "evergreen-heritage" | "executive-navy" | "modern-teal" | "earth-editorial" | "sdg-impact";

/**
 * Persisted template identifiers remain accepted at the type boundary while
 * the visible catalog exposes only CanonicalDocumentTemplateId values.
 */
export type DocumentTemplateId = CanonicalDocumentTemplateId | DocumentTemplateAliasId;

/** Deprecated alias: presentation was previously called DocumentTheme. */
export type DocumentThemeId = DocumentTemplateId | DocumentTemplateAliasId;

export type LegacyDocumentThemeId = DocumentTemplateAliasId;

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
export type BrandColorSource = "logo" | "template";
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
  subheading: string;
  soft: string;
  paper: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  onPrimary: string;
};

/** Persisted colors extracted from the uploaded company logo. */
export type LogoColorPalette = Pick<DocumentThemePalette, "primary" | "primaryDark" | "soft" | "accent" | "onPrimary">;

export type ThemeBackground =
  | { kind: "solid"; color: string }
  | {
      kind: "gradient";
      from: string;
      to: string;
      direction: "vertical" | "horizontal" | "diagonal";
    };

export type ThemeDensity = "compact" | "balanced" | "spacious";
/** Logo size as a percentage of the existing medium size; legacy labels remain readable. */
export type LogoScale = number | "small" | "medium" | "large";

export type PageBorder = { enabled: boolean; widthPt: number; insetMm: number; color?: string; scope: "all" | "cover" };

export type DocumentThemeOverrides = {
  pageBorder?: PageBorder;
  schemaVersion: 1;
  customThemeName?: string;
  colors?: Partial<DocumentThemePalette>;
  background?: ThemeBackground;
  density?: ThemeDensity;
  logoScale?: LogoScale;
};

/** Branding overrides kept separately from visual-template composition. */
export type TemplateBrandOverrides = DocumentThemeOverrides;

export type TemplateComposition = {
  coverScene: string;
  contentsScene: string;
  pageZones: string;
  sectionHeading: string;
  narrativeTreatment: string;
  listTreatment: string;
  targetTreatment: string;
  tableTreatment: string;
  runningFurniture: string;
  approvalTreatment: string;
  controlTreatment: string;
  imageSlots: readonly ("cover" | "section")[];
  fallbackArtwork: string;
  densityRule: ThemeDensity;
  overflowRule: string;
};

export type SavedDocumentTheme = {
  schemaVersion: 1;
  id: string;
  name: string;
  baseThemeId: DocumentThemeId;
  baseTemplateId?: DocumentTemplateId;
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

export type CoverBinding = "policyTitle" | "companyName" | "documentNumber" | "effectiveDate" | "revision" | "nextReview";

export type CoverElementGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Media defaults to true; text defaults to false when omitted by older saves. */
  aspectLocked?: boolean;
  rotation: number;
  opacity: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
};

export type CoverTextElement = CoverElementGeometry & {
  id: string;
  type: "text";
  content: { kind: "literal"; text: string } | { kind: "binding"; binding: CoverBinding };
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
};

export type CoverImageElement = CoverElementGeometry & {
  id: string;
  type: "image";
  assetId: string;
  fit: "contain" | "cover";
  focalPoint: { x: number; y: number };
  altText: string;
};

export type CoverLogoElement = CoverElementGeometry & {
  id: string;
  type: "logo";
  /** Optional cover-local replacement; omitted means use the company logo. */
  assetId?: string;
  fit: "contain";
  focalPoint: { x: number; y: number };
  altText: string;
};

export type CoverElement = CoverTextElement | CoverImageElement | CoverLogoElement;

export type CoverComposition = {
  schemaVersion: 1;
  sourceTemplateId: string;
  background: {
    color: string;
    assetId?: string;
    fit: "contain" | "cover";
    focalPoint: { x: number; y: number };
  };
  elements: CoverElement[];
};

export type CoverLibrarySource = "ai" | "manual";

export type CoverLibraryItem = {
  id: string;
  name: string;
  policyType?: PolicyType;
  composition: CoverComposition;
  previewAssetId: string | null;
  lockVersion: number;
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
  source: CoverLibrarySource;
  isActive?: boolean;
  canDelete?: boolean;
};

export interface RevisionEntry {
  revisionNo: string;
  date: string;
  description: string;
  /** Scheduled rows are kept in sync with the policy metadata dates. */
  source?: "scheduled" | "custom";
  /** Scheduled row index that a custom revision follows. */
  scheduleAnchor?: number;
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
  documentTemplate?: DocumentTemplateId;
  documentTheme?: DocumentThemeId;
  documentThemeOverrides?: DocumentThemeOverrides;
  templateBrandOverrides?: TemplateBrandOverrides;
  /** Logo is the default brand source; template keeps the selected template palette. */
  brandColorSource?: BrandColorSource;
  visualStyle?: VisualStyle;
  sections?: PolicySection[];
  showTableOfContents?: boolean;
  showAcknowledgement?: boolean;
  showRevisionHistory?: boolean;
  sdgDisplay?: SdgDisplayMode;
  logoPosition?: LogoPosition;
  typography?: DocumentTypography;
  featureImage?: PolicyFeatureImage;
  coverComposition?: CoverComposition;
  /** The manually edited cover remains in coverComposition for compatibility. */
  aiCoverComposition?: CoverComposition;
  activeCoverVariant?: "manual" | "ai";
  company: Company;
  standards: string[];
  declaration: Declaration;
  definitions?: PolicyDefinitions;
  focusAreas: string[];
  /** Distinguishes the applied sector catalog from legacy and profile-default focus lists. */
  focusAreaSelection?: FocusAreaSelectionState;
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
