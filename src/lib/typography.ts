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
  // Self-hosted OFL document fonts, embedded in Word exports and drawn from
  // the same files in PDFs (see scripts/build-document-fonts.py).
  "Roboto",
  "Open Sans",
  "Lato",
  "Noto Sans",
  "PT Sans",
  "Montserrat",
  "Nunito Sans",
  "Poppins",
  "Libre Franklin",
  "Merriweather",
  "Lora",
  "Noto Serif",
  "PT Serif",
  "Libre Baskerville",
  "EB Garamond",
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

// Still valid on saved policies, but no longer offered: no open look-alike
// exists, so the PDF cannot draw them the way Word does.
const HIDDEN_PICKER_FONTS: readonly string[] = ["Tahoma", "Trebuchet MS", "Verdana"];

/** Fonts the picker offers, keeping a hidden font visible while it is the current choice. */
export function pickerFontFamilies(current?: string): string[] {
  return FONT_FAMILY_OPTIONS.filter((font) => !HIDDEN_PICKER_FONTS.includes(font) || font === current);
}

export const DEFAULT_TYPOGRAPHY: DocumentTypography = {
  fontFamily: "Arial",
  headingFontFamily: "Georgia",
  headingSize: 16,
  subheadingSize: 14,
  paragraphSize: 12,
  lineSpacing: 1.5,
};
