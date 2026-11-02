/**
 * SOP manual design specs. Each template is defined once here and read by
 * both renderers: the Typst template (PDF and preview) and the DOCX
 * generator. Nothing about a template's look lives anywhere else.
 *
 * Every component variant below has a Word equivalent built from tables,
 * cell shading, borders, paragraph shading and header/footer tables. That is
 * what keeps the PDF and the Word file looking the same.
 */

export type SopDesignId = "controlled-manual" | "esg-pillars" | "sop-cards" | "compact-register" | "modern-banner" | "shop-floor" | "chapter-book";

export type SopFontPairId =
  | "caladea-carlito"
  | "montserrat-open-sans"
  | "poppins-lato"
  | "arimo"
  | "merriweather-pt-sans"
  | "tinos-arimo"
  | "ibm-plex-sans"
  | "source-serif-atkinson";

export type SopFontPair = { id: SopFontPairId; label: string; heading: string; body: string };

/** Families shipped as TTF in assets/typst-fonts and embedded in the DOCX. */
export const SOP_FONT_PAIRS: readonly SopFontPair[] = [
  { id: "ibm-plex-sans", label: "IBM Plex Sans", heading: "IBM Plex Sans", body: "IBM Plex Sans" },
  { id: "source-serif-atkinson", label: "Source Serif 4 and Atkinson Hyperlegible", heading: "Source Serif 4", body: "Atkinson Hyperlegible" },
  { id: "caladea-carlito", label: "Caladea and Carlito (Cambria and Calibri metrics)", heading: "Caladea", body: "Carlito" },
  { id: "montserrat-open-sans", label: "Montserrat and Open Sans", heading: "Montserrat", body: "Open Sans" },
  { id: "poppins-lato", label: "Poppins and Lato", heading: "Poppins", body: "Lato" },
  { id: "arimo", label: "Arimo (Arial metrics)", heading: "Arimo", body: "Arimo" },
  { id: "merriweather-pt-sans", label: "Merriweather and PT Sans", heading: "Merriweather", body: "PT Sans" },
  { id: "tinos-arimo", label: "Tinos and Arimo (Times and Arial metrics)", heading: "Tinos", body: "Arimo" },
];

export type SopPalette = {
  primary: string;
  primaryDark: string;
  /** Tint for table headers, cards and callouts. */
  soft: string;
  paper: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  onPrimary: string;
  /** Environmental, Social and Governance chapter colours. */
  pillars: { E: string; S: string; G: string };
};

export type SopDesign = {
  id: SopDesignId;
  name: string;
  description: string;
  /** Short phrases for the template picker. */
  descriptors: readonly [string, string, string];
  fontPair: SopFontPairId;
  sizes: { body: number; small: number; h1: number; h2: number; h3: number; coverTitle: number };
  /** Line height as a multiple of the font size (Word "multiple" spacing). */
  leading: number;
  /** Space after a paragraph, in points. */
  paragraphSpacing: number;
  palette: SopPalette;
  page: { marginTopMm: number; marginBottomMm: number; marginXMm: number; headerGapMm: number };
  cover: "control-sheet" | "pillar-bands" | "card-grid" | "register-plate" | "image-banner" | "hazard-band" | "book-cover";
  /** Optional so additional templates inherit the inset photo layout. */
  photoCover?: "inset-photo" | "pillar-photo" | "panel-photo" | "photo-strip" | "full-photo";
  contents: "dotted-leaders" | "pillar-index" | "numbered-cards" | "register-columns" | "banner-index" | "ruled-index";
  runningHeader: "control-table" | "pillar-rule" | "code-strip" | "register-line" | "banner-rule" | "plain-line" | "book-rule";
  runningFooter: "prepared-approved" | "outer-folio" | "centered-folio" | "register-folio" | "company-folio";
  chapterDivider: "none" | "pillar-page" | "label-band";
  sopOpener: "ruled-title" | "pillar-banner" | "header-card" | "register-head" | "title-banner" | "plain-title" | "chapter-numeral";
  sectionHeading: "numbered-rule" | "pillar-bar" | "number-chip" | "side-label" | "label-chip" | "hanging-number" | "serif-heading";
  procedure: "numbered-blocks" | "step-table" | "yellow-steps";
  table: { header: "primary-fill" | "soft-fill" | "rule-only"; zebra: boolean; borders: "grid" | "horizontal" };
  callout: "soft-panel" | "accent-rule" | "mint-panel" | "hazard-rule";
  approval: "signature-table" | "stamp-panel";
};

const pillars = { E: "#2E7D5B", S: "#2F6690", G: "#6A4C93" };

export const SOP_DESIGNS: readonly SopDesign[] = [
  {
    id: "controlled-manual",
    name: "Controlled Manual",
    description: "ISO-style controlled document: a full document-control table on every page, Prepared and Approved in the footer, sober serif headings.",
    descriptors: ["Controlled", "Audit-ready", "ISO style"],
    fontPair: "caladea-carlito",
    sizes: { body: 10.5, small: 8.5, h1: 17, h2: 12.5, h3: 11, coverTitle: 30 },
    leading: 1.3,
    paragraphSpacing: 6,
    palette: {
      primary: "#183A5A", primaryDark: "#102840", soft: "#EAF1F8", paper: "#FFFFFF", ink: "#1C2732",
      muted: "#5E6E7E", line: "#C9D5E2", accent: "#B77A36", onPrimary: "#FFFFFF", pillars,
    },
    page: { marginTopMm: 34, marginBottomMm: 24, marginXMm: 20, headerGapMm: 6 },
    cover: "control-sheet",
    photoCover: "inset-photo",
    contents: "dotted-leaders",
    runningHeader: "control-table",
    runningFooter: "prepared-approved",
    chapterDivider: "none",
    sopOpener: "ruled-title",
    sectionHeading: "numbered-rule",
    procedure: "numbered-blocks",
    table: { header: "primary-fill", zebra: false, borders: "grid" },
    callout: "accent-rule",
    approval: "signature-table",
  },
  {
    id: "esg-pillars",
    name: "ESG Pillars",
    description: "Chaptered by Environmental, Social and Governance with a colour band per pillar, divider pages and full-width SOP banners.",
    descriptors: ["Pillar chapters", "Colour coded", "Sustainability"],
    fontPair: "montserrat-open-sans",
    sizes: { body: 10, small: 8, h1: 18, h2: 11.5, h3: 10.5, coverTitle: 32 },
    leading: 1.35,
    paragraphSpacing: 6,
    palette: {
      primary: "#2D685A", primaryDark: "#1B443A", soft: "#E8F2EE", paper: "#FFFFFF", ink: "#1D2925",
      muted: "#5F7069", line: "#CFE0D9", accent: "#B87834", onPrimary: "#FFFFFF", pillars,
    },
    page: { marginTopMm: 26, marginBottomMm: 22, marginXMm: 20, headerGapMm: 5 },
    cover: "pillar-bands",
    photoCover: "pillar-photo",
    contents: "pillar-index",
    runningHeader: "pillar-rule",
    runningFooter: "outer-folio",
    chapterDivider: "pillar-page",
    sopOpener: "pillar-banner",
    sectionHeading: "pillar-bar",
    procedure: "numbered-blocks",
    table: { header: "soft-fill", zebra: true, borders: "horizontal" },
    callout: "soft-panel",
    approval: "signature-table",
  },
  {
    id: "sop-cards",
    name: "SOP Cards",
    description: "Every SOP opens on a metadata card (SOP No., version, department, owner, dates, approvals) and procedures run as Step, Action, Responsible tables.",
    descriptors: ["Metadata cards", "Step tables", "Operational"],
    fontPair: "poppins-lato",
    sizes: { body: 10, small: 8, h1: 17, h2: 11.5, h3: 10.5, coverTitle: 30 },
    leading: 1.35,
    paragraphSpacing: 6,
    palette: {
      primary: "#244B59", primaryDark: "#17343E", soft: "#E8F0F2", paper: "#FFFFFF", ink: "#18262C",
      muted: "#5F7076", line: "#CFDDE1", accent: "#C98A2E", onPrimary: "#FFFFFF", pillars,
    },
    page: { marginTopMm: 26, marginBottomMm: 22, marginXMm: 19, headerGapMm: 5 },
    cover: "card-grid",
    photoCover: "panel-photo",
    contents: "numbered-cards",
    runningHeader: "code-strip",
    runningFooter: "centered-folio",
    chapterDivider: "label-band",
    sopOpener: "header-card",
    sectionHeading: "number-chip",
    procedure: "step-table",
    table: { header: "primary-fill", zebra: true, borders: "grid" },
    callout: "soft-panel",
    approval: "stamp-panel",
  },
  {
    id: "compact-register",
    name: "Compact Register",
    description: "Dense register layout with section labels in a left column, compact type and ruled tables, for the lowest page count.",
    descriptors: ["Dense", "Two-column labels", "Print-friendly"],
    fontPair: "arimo",
    sizes: { body: 9.5, small: 7.5, h1: 15, h2: 10.5, h3: 9.5, coverTitle: 26 },
    leading: 1.25,
    paragraphSpacing: 4,
    palette: {
      primary: "#26323D", primaryDark: "#18232B", soft: "#EEF1F3", paper: "#FFFFFF", ink: "#1D252B",
      muted: "#636E75", line: "#D3D9DD", accent: "#9A6A36", onPrimary: "#FFFFFF", pillars,
    },
    page: { marginTopMm: 22, marginBottomMm: 18, marginXMm: 16, headerGapMm: 4 },
    cover: "register-plate",
    photoCover: "photo-strip",
    contents: "register-columns",
    runningHeader: "register-line",
    runningFooter: "register-folio",
    chapterDivider: "label-band",
    sopOpener: "register-head",
    sectionHeading: "side-label",
    procedure: "numbered-blocks",
    table: { header: "rule-only", zebra: false, borders: "horizontal" },
    callout: "accent-rule",
    approval: "signature-table",
  },
  {
    id: "modern-banner",
    name: "Modern Banner",
    description: "Photo-led cover, wide shaded title banners and section label chips with a calm editorial serif.",
    descriptors: ["Image cover", "Bold banners", "Editorial"],
    fontPair: "merriweather-pt-sans",
    sizes: { body: 10, small: 8, h1: 19, h2: 11, h3: 10.5, coverTitle: 34 },
    leading: 1.4,
    paragraphSpacing: 6,
    palette: {
      primary: "#3B3F8C", primaryDark: "#272A63", soft: "#ECEDF7", paper: "#FFFFFF", ink: "#1F2033",
      muted: "#666A80", line: "#D7D9EA", accent: "#D07A4B", onPrimary: "#FFFFFF", pillars,
    },
    page: { marginTopMm: 26, marginBottomMm: 22, marginXMm: 20, headerGapMm: 5 },
    cover: "image-banner",
    photoCover: "full-photo",
    contents: "banner-index",
    runningHeader: "banner-rule",
    runningFooter: "outer-folio",
    chapterDivider: "label-band",
    sopOpener: "title-banner",
    sectionHeading: "label-chip",
    procedure: "numbered-blocks",
    table: { header: "soft-fill", zebra: false, borders: "grid" },
    callout: "soft-panel",
    approval: "stamp-panel",
  },
  {
    id: "shop-floor", name: "Shop Floor",
    description: "Clear operational typography, hazard-yellow step markers and horizontal rules.",
    descriptors: ["Operational", "High contrast", "Print friendly"], fontPair: "ibm-plex-sans",
    sizes: { body: 10, small: 8.5, h1: 18, h2: 12, h3: 11, coverTitle: 44 },
    leading: 1.4, paragraphSpacing: 6,
    palette: { primary: "#1E2A33", primaryDark: "#1E2A33", ink: "#1E2A33", accent: "#F2B705", line: "#D5DAE0", muted: "#5C6873", paper: "#FFFFFF", soft: "#F4F5F7", onPrimary: "#1E2A33", pillars },
    page: { marginTopMm: 24, marginBottomMm: 22, marginXMm: 20, headerGapMm: 6 },
    cover: "hazard-band", contents: "ruled-index", runningHeader: "plain-line", runningFooter: "company-folio",
    chapterDivider: "none", sopOpener: "plain-title", sectionHeading: "hanging-number", procedure: "yellow-steps",
    table: { header: "rule-only", zebra: false, borders: "horizontal" }, callout: "hazard-rule", approval: "signature-table",
  },
  {
    id: "chapter-book", name: "Chapter Book",
    description: "Serif chapter openings, generous reading space and quiet teal and mint details.",
    descriptors: ["Editorial", "Readable", "Chapter openings"], fontPair: "source-serif-atkinson",
    sizes: { body: 10, small: 8.5, h1: 20, h2: 13, h3: 11, coverTitle: 40 },
    leading: 1.45, paragraphSpacing: 6,
    palette: { primary: "#0F5257", primaryDark: "#0A3B3F", soft: "#E6F0EF", accent: "#E8A33D", ink: "#1F2430", muted: "#5B6470", line: "#CFDCDB", paper: "#FFFFFF", onPrimary: "#FFFFFF", pillars },
    page: { marginTopMm: 24, marginBottomMm: 22, marginXMm: 20, headerGapMm: 6 },
    cover: "book-cover", contents: "ruled-index", runningHeader: "book-rule", runningFooter: "company-folio",
    chapterDivider: "none", sopOpener: "chapter-numeral", sectionHeading: "serif-heading", procedure: "numbered-blocks",
    table: { header: "soft-fill", zebra: false, borders: "horizontal" }, callout: "mint-panel", approval: "signature-table",
  },

];

/** Handbook choices; saved documents can still resolve every SOP template. */
export const HANDBOOK_DESIGNS = SOP_DESIGNS.filter((design) => design.id !== "esg-pillars" && design.id !== "sop-cards");

const DESIGN_MAP = new Map(SOP_DESIGNS.map((design) => [design.id, design]));

export function getSopDesign(id: string | null | undefined): SopDesign {
  return DESIGN_MAP.get(id as SopDesignId) ?? SOP_DESIGNS[0];
}

export function getSopFontPair(id: string | null | undefined, fallback: SopFontPairId): SopFontPair {
  return SOP_FONT_PAIRS.find((pair) => pair.id === id) ?? SOP_FONT_PAIRS.find((pair) => pair.id === fallback)!;
}

/** Every font family the templates can use, for the PDF engine and the DOCX font embedder. */
export const SOP_FONT_FAMILIES = [...new Set(SOP_FONT_PAIRS.flatMap((pair) => [pair.heading, pair.body]))];
