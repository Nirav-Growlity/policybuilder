import type { DocumentTypography } from "./types";

export const FONT_FAMILY_OPTIONS = [
  "Arial",
  "Aptos",
  "Calibri",
  "Cambria",
  "Georgia",
  "Garamond",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  // Self-hosted OFL document fonts (see public/fonts + app/document-fonts.css).
  "Inter",
  "Fraunces",
  "Space Grotesk",
  "Archivo",
  "Source Sans 3",
  "Source Serif 4",
  "IBM Plex Sans",
  "IBM Plex Serif",
  "IBM Plex Mono",
  "Libre Caslon Text",
  "Cormorant Garamond",
  "Playfair Display",
  "Atkinson Hyperlegible",
  "Caveat",
  "Public Sans",
  "JetBrains Mono",
] as const;

export const DEFAULT_TYPOGRAPHY: DocumentTypography = {
  fontFamily: "Arial",
  headingFontFamily: "Georgia",
  headingSize: 16,
  subheadingSize: 14,
  paragraphSize: 12,
  lineSpacing: 1.5,
};
