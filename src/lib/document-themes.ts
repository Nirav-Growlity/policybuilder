import type {
  DocumentThemeId,
  DocumentTypography,
  LogoPosition,
  Policy,
  SdgDisplayMode,
  StandardSectionKind,
  VisualStyle,
} from "./types";

export type DocumentThemeColors = {
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

export type DocumentSectionKind = StandardSectionKind | "custom";

export type DocumentSectionRecipe =
  | "charter-narrative"
  | "charter-ledger"
  | "charter-mosaic"
  | "dossier-narrative"
  | "dossier-columns"
  | "dossier-ledger"
  | "atlas-statement"
  | "atlas-modules"
  | "atlas-bands"
  | "atlas-mosaic"
  | "journal-narrative"
  | "journal-entries"
  | "journal-ledger";

export type DocumentThemeLayout = {
  archetype: "heritage-charter" | "boardroom-dossier" | "impact-atlas" | "field-journal";
  bestFor: string;
  descriptors: readonly [string, string, string];
  cover: "charter-frame" | "dossier-split" | "atlas-modular" | "journal-editorial";
  toc: "dotted-leaders" | "rail-index" | "tile-index" | "editorial-index";
  pageFrame: "single-folio" | "numbered-rail" | "modular-grid" | "editorial-margin";
  sectionOpener: "formal-ordinal" | "dossier-label" | "statement-band" | "chapter-number";
  bodyGrid: "narrow-single" | "rail-content" | "adaptive-modules" | "margin-led";
  dataLayout: "formal-grid" | "compact-ledger" | "target-bands" | "quiet-rules";
  acknowledgement: "legal-form" | "approval-block" | "signature-panel" | "affidavit";
  runningFurniture: "centered-folio" | "breadcrumb-bar" | "edge-folio" | "outer-folio";
  motif: "botanical-rule" | "precision-grid" | "orbit-blocks" | "contour-lines";
  sectionRecipes: Record<DocumentSectionKind, DocumentSectionRecipe>;
};

export type DocumentThemeDefinition = {
  id: DocumentThemeId;
  name: string;
  description: string;
  colors: DocumentThemeColors;
  layout: DocumentThemeLayout;
  defaults: {
    typography: DocumentTypography;
    visualStyle: VisualStyle;
    logoPosition: LogoPosition;
    sdgDisplay: SdgDisplayMode;
  };
};

export const DEFAULT_DOCUMENT_THEME_ID: DocumentThemeId = "evergreen-heritage";

const CHARTER_RECIPES: Record<DocumentSectionKind, DocumentSectionRecipe> = {
  preface: "charter-narrative",
  declaration: "charter-narrative",
  scope: "charter-narrative",
  definitions: "charter-narrative",
  focus: "charter-ledger",
  qualitative: "charter-ledger",
  quantitative: "charter-ledger",
  sdg: "charter-mosaic",
  responsibilities: "charter-ledger",
  monitoring: "charter-narrative",
  review: "charter-narrative",
  revision: "charter-ledger",
  custom: "charter-narrative",
};

const DOSSIER_RECIPES: Record<DocumentSectionKind, DocumentSectionRecipe> = {
  preface: "dossier-narrative",
  declaration: "dossier-narrative",
  scope: "dossier-narrative",
  definitions: "dossier-narrative",
  focus: "dossier-columns",
  qualitative: "dossier-columns",
  quantitative: "dossier-ledger",
  sdg: "dossier-columns",
  responsibilities: "dossier-columns",
  monitoring: "dossier-narrative",
  review: "dossier-narrative",
  revision: "dossier-ledger",
  custom: "dossier-narrative",
};

const ATLAS_RECIPES: Record<DocumentSectionKind, DocumentSectionRecipe> = {
  preface: "atlas-statement",
  declaration: "atlas-statement",
  scope: "atlas-statement",
  definitions: "atlas-statement",
  focus: "atlas-modules",
  qualitative: "atlas-modules",
  quantitative: "atlas-bands",
  sdg: "atlas-mosaic",
  responsibilities: "atlas-modules",
  monitoring: "atlas-statement",
  review: "atlas-statement",
  revision: "atlas-bands",
  custom: "atlas-modules",
};

const JOURNAL_RECIPES: Record<DocumentSectionKind, DocumentSectionRecipe> = {
  preface: "journal-narrative",
  declaration: "journal-narrative",
  scope: "journal-narrative",
  definitions: "journal-narrative",
  focus: "journal-entries",
  qualitative: "journal-entries",
  quantitative: "journal-ledger",
  sdg: "journal-entries",
  responsibilities: "journal-entries",
  monitoring: "journal-narrative",
  review: "journal-narrative",
  revision: "journal-ledger",
  custom: "journal-narrative",
};

export const DOCUMENT_THEMES: readonly DocumentThemeDefinition[] = [
  {
    id: "evergreen-heritage",
    name: "Evergreen Heritage",
    description: "Warm, established, and formal for enduring sustainability commitments.",
    colors: {
      primary: "#1A5C3A",
      primaryDark: "#103822",
      soft: "#E8F1EB",
      paper: "#FFFDF8",
      ink: "#0E1A14",
      muted: "#6B7971",
      line: "#D8E4DB",
      accent: "#9A7000",
      onPrimary: "#FFFFFF",
    },
    layout: {
      archetype: "heritage-charter",
      bestFor: "Formal commitments and audit-ready governance policies",
      descriptors: ["Framed", "Formal", "Single column"],
      cover: "charter-frame",
      toc: "dotted-leaders",
      pageFrame: "single-folio",
      sectionOpener: "formal-ordinal",
      bodyGrid: "narrow-single",
      dataLayout: "formal-grid",
      acknowledgement: "legal-form",
      runningFurniture: "centered-folio",
      motif: "botanical-rule",
      sectionRecipes: CHARTER_RECIPES,
    },
    defaults: {
      typography: { fontFamily: "Arial", headingFontFamily: "Georgia", headingSize: 16, subheadingSize: 14, paragraphSize: 12, lineSpacing: 1.5 },
      visualStyle: "corporate",
      logoPosition: "center",
      sdgDisplay: "tiles",
    },
  },
  {
    id: "executive-navy",
    name: "Executive Navy",
    description: "Board-ready precision with compact hierarchy and disciplined data tables.",
    colors: {
      primary: "#18324B",
      primaryDark: "#0E2233",
      soft: "#EAF0F5",
      paper: "#FFFFFF",
      ink: "#14202B",
      muted: "#5C6B78",
      line: "#CED8E1",
      accent: "#B3832F",
      onPrimary: "#FFFFFF",
    },
    layout: {
      archetype: "boardroom-dossier",
      bestFor: "Board review, concise governance, and dense operational detail",
      descriptors: ["Side rail", "Dense", "Executive"],
      cover: "dossier-split",
      toc: "rail-index",
      pageFrame: "numbered-rail",
      sectionOpener: "dossier-label",
      bodyGrid: "rail-content",
      dataLayout: "compact-ledger",
      acknowledgement: "approval-block",
      runningFurniture: "breadcrumb-bar",
      motif: "precision-grid",
      sectionRecipes: DOSSIER_RECIPES,
    },
    defaults: {
      typography: { fontFamily: "Calibri", headingFontFamily: "Cambria", headingSize: 16, subheadingSize: 13, paragraphSize: 10.5, lineSpacing: 1.25 },
      visualStyle: "corporate",
      logoPosition: "left",
      sdgDisplay: "names",
    },
  },
  {
    id: "modern-teal",
    name: "Modern Teal",
    description: "Clean, spacious, and contemporary with a confident asymmetric rhythm.",
    colors: {
      primary: "#0B7A75",
      primaryDark: "#075652",
      soft: "#E6F3F1",
      paper: "#FFFFFF",
      ink: "#102321",
      muted: "#5D706E",
      line: "#CDE0DD",
      accent: "#E09A4A",
      onPrimary: "#FFFFFF",
    },
    layout: {
      archetype: "impact-atlas",
      bestFor: "Impact storytelling, targets, SDGs, and modern stakeholder reports",
      descriptors: ["Modular", "Visual", "Spacious"],
      cover: "atlas-modular",
      toc: "tile-index",
      pageFrame: "modular-grid",
      sectionOpener: "statement-band",
      bodyGrid: "adaptive-modules",
      dataLayout: "target-bands",
      acknowledgement: "signature-panel",
      runningFurniture: "edge-folio",
      motif: "orbit-blocks",
      sectionRecipes: ATLAS_RECIPES,
    },
    defaults: {
      typography: { fontFamily: "Aptos", headingFontFamily: "Aptos", headingSize: 17, subheadingSize: 13, paragraphSize: 11, lineSpacing: 1.35 },
      visualStyle: "modern",
      logoPosition: "left",
      sdgDisplay: "tiles",
    },
  },
  {
    id: "earth-editorial",
    name: "Earth Editorial",
    description: "Expressive but composed, pairing natural warmth with editorial clarity.",
    colors: {
      primary: "#9B4E2D",
      primaryDark: "#5F2D1C",
      soft: "#F4E9DF",
      paper: "#FFFAF5",
      ink: "#2B211C",
      muted: "#74665D",
      line: "#E5D5C8",
      accent: "#C58B2A",
      onPrimary: "#FFFFFF",
    },
    layout: {
      archetype: "field-journal",
      bestFor: "Long-form policies that need editorial warmth and readability",
      descriptors: ["Editorial", "Wide margin", "Serif-led"],
      cover: "journal-editorial",
      toc: "editorial-index",
      pageFrame: "editorial-margin",
      sectionOpener: "chapter-number",
      bodyGrid: "margin-led",
      dataLayout: "quiet-rules",
      acknowledgement: "affidavit",
      runningFurniture: "outer-folio",
      motif: "contour-lines",
      sectionRecipes: JOURNAL_RECIPES,
    },
    defaults: {
      typography: { fontFamily: "Calibri", headingFontFamily: "Georgia", headingSize: 17, subheadingSize: 13, paragraphSize: 11, lineSpacing: 1.4 },
      visualStyle: "modern",
      logoPosition: "center",
      sdgDisplay: "names",
    },
  },
] as const;

const DOCUMENT_THEME_MAP = new Map(DOCUMENT_THEMES.map((theme) => [theme.id, theme]));

export function getDocumentTheme(id?: DocumentThemeId): DocumentThemeDefinition {
  return DOCUMENT_THEME_MAP.get(id || DEFAULT_DOCUMENT_THEME_ID) || DOCUMENT_THEMES[0];
}

export function getPolicyDocumentTheme(policy: Pick<Policy, "documentTheme">): DocumentThemeDefinition {
  return getDocumentTheme(policy.documentTheme);
}

export function getResolvedTypography(policy: Pick<Policy, "documentTheme" | "typography">): DocumentTypography {
  const themeTypography = getPolicyDocumentTheme(policy).defaults.typography;
  return {
    ...themeTypography,
    ...policy.typography,
    headingFontFamily: policy.typography?.headingFontFamily || themeTypography.headingFontFamily,
  };
}

export function getDocumentThemePatch(id: DocumentThemeId): Pick<Policy, "documentTheme" | "typography" | "visualStyle" | "logoPosition" | "sdgDisplay"> {
  const theme = getDocumentTheme(id);
  return {
    documentTheme: id,
    typography: { ...theme.defaults.typography },
    visualStyle: theme.defaults.visualStyle,
    logoPosition: theme.defaults.logoPosition,
    sdgDisplay: theme.defaults.sdgDisplay,
  };
}

export function isDocumentThemeCustomized(policy: Policy): boolean {
  const theme = getPolicyDocumentTheme(policy);
  const typography = getResolvedTypography(policy);
  const defaults = theme.defaults.typography;
  return policy.visualStyle !== theme.defaults.visualStyle
    || policy.logoPosition !== theme.defaults.logoPosition
    || policy.sdgDisplay !== theme.defaults.sdgDisplay
    || typography.fontFamily !== defaults.fontFamily
    || typography.headingFontFamily !== defaults.headingFontFamily
    || typography.headingSize !== defaults.headingSize
    || typography.subheadingSize !== defaults.subheadingSize
    || typography.paragraphSize !== defaults.paragraphSize
    || typography.lineSpacing !== defaults.lineSpacing;
}

export function documentThemeCssVariables(theme: DocumentThemeDefinition): Record<string, string> {
  return {
    "--doc-primary": theme.colors.primary,
    "--doc-primary-dark": theme.colors.primaryDark,
    "--doc-soft": theme.colors.soft,
    "--doc-paper": theme.colors.paper,
    "--doc-ink": theme.colors.ink,
    "--doc-muted": theme.colors.muted,
    "--doc-line": theme.colors.line,
    "--doc-accent": theme.colors.accent,
    "--doc-on-primary": theme.colors.onPrimary,
  };
}

export function documentHex(color: string): string {
  return color.replace(/^#/, "").toUpperCase();
}

export function pdfFontFamily(fontFamily?: string): "Helvetica" | "Times-Roman" | "Courier" {
  if (!fontFamily) return "Helvetica";
  if (/courier|mono/i.test(fontFamily)) return "Courier";
  if (/cambria|georgia|garamond|times/i.test(fontFamily)) return "Times-Roman";
  return "Helvetica";
}
