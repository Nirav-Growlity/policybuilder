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
] as const;

export const DEFAULT_TYPOGRAPHY: DocumentTypography = {
  fontFamily: "Arial",
  headingSize: 16,
  subheadingSize: 14,
  paragraphSize: 12,
  lineSpacing: 1.5,
};
