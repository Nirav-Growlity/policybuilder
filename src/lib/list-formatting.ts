import type { ListMarkerStyle, Policy, PolicyListFormatting } from "./types";

export const DEFAULT_POLICY_LIST_FORMATTING: Required<PolicyListFormatting> = {
  outline: "number",
  focusAreas: "number",
  qualitativeGroups: "number",
  qualitativeItems: "bullet",
  quantitativeGroups: "number",
  quantitativeItems: "bullet",
  responsibilities: "number",
};

const isListMarkerStyle = (value: unknown): value is ListMarkerStyle => value === "bullet" || value === "number";

export function resolvePolicyListFormatting(policy: Pick<Policy, "listFormatting">): Required<PolicyListFormatting> {
  const value = policy.listFormatting;
  return Object.fromEntries(
    Object.entries(DEFAULT_POLICY_LIST_FORMATTING).map(([key, fallback]) => {
      const configured = value?.[key as keyof PolicyListFormatting];
      return [key, isListMarkerStyle(configured) ? configured : fallback];
    }),
  ) as Required<PolicyListFormatting>;
}

export function listMarkerText(style: ListMarkerStyle, index: number, padded = true): string {
  return style === "bullet" ? "•" : padded ? String(index).padStart(2, "0") : String(index);
}
