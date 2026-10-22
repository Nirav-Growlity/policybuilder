/**
 * Heading patterns for the narrative section kinds that reference manuals
 * name in many ways. Shared by the .docx import lexicon (lib/docx/sop-parse)
 * and the reference corpus reader (lib/ai/sop-template-context), whose older
 * seed files still hold these sections as `custom`. Patterns expect lower-case text.
 */
import type { SopSectionKind } from "./types";

export const INTRODUCTION_HEADING = /\b(introduction|overview|summary|background)\b/;
export const COMPLIANCE_HEADING = /\b(compliance)\b/;
export const CORRECTIVE_HEADING =
  /\b(corrective|capa|non[- ]?compliances?|non[- ]?conformit(y|ies)|enforcement|penalt(y|ies)|disciplinary|violations?)\b/;

const HEADINGS: ReadonlyArray<[Extract<SopSectionKind, "introduction" | "compliance" | "corrective">, RegExp]> = [
  ["introduction", INTRODUCTION_HEADING],
  ["compliance", COMPLIANCE_HEADING],
  ["corrective", CORRECTIVE_HEADING],
];

/**
 * The introduction, compliance or corrective kind a heading names, or
 * undefined. The earliest keyword wins, so "Non-compliance and Penalties" is
 * corrective and "Compliance and Corrective Action" is compliance. An
 * introduction must open the heading: "Procedure Overview" is not one.
 */
export function narrativeKindForHeading(heading: string): "introduction" | "compliance" | "corrective" | undefined {
  const text = heading.trim().toLowerCase();
  let best: { kind: "introduction" | "compliance" | "corrective"; at: number } | undefined;
  for (const [kind, pattern] of HEADINGS) {
    const match = pattern.exec(text);
    if (!match || (kind === "introduction" && match.index > 0)) continue;
    if (!best || match.index < best.at) best = { kind, at: match.index };
  }
  return best?.kind;
}
