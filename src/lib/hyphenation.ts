import { hyphenateSync } from "hyphen/en-us";
import type { DocumentTextAlignment } from "./types";

export const SOFT_HYPHEN = "­";

// Imported and AI-drafted text carries stray double spaces and tabs. HTML
// collapses them, so the editor and PDF hide them, but Word keeps every space
// and prints a visibly wider gap. Single non-breaking or thin spaces are kept.
export function collapseSpaces(text: string): string {
  return text.replace(/[^\S\n]{2,}|\t/g, " ").replace(/[^\S\n]+\n/g, "\n");
}

// A justified line stretches its word gaps to fill the measure, and in a narrow
// table column a few long words per line leave very wide gaps. Soft hyphens give
// the line breaker more places to break. They are inserted here because headless
// Chrome ships no hyphenation dictionaries, so CSS `hyphens: auto` does nothing
// in the PDF. A soft hyphen stays invisible unless a line breaks on it.
export function typesetProse(text: string, alignment: DocumentTextAlignment): string {
  const spaced = collapseSpaces(text);
  if (alignment !== "justify" || !spaced) return spaced;
  return hyphenateSync(spaced, { minWordLength: 6 })
    // Breaking an address with a hyphen would change what the reader copies.
    .replace(/\S*(?:@|:\/\/|www\.)\S*/g, (token) => token.replaceAll(SOFT_HYPHEN, ""));
}
