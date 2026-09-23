import type { PolicyDocumentSummary } from "./policycraft-types";
import { POLICY_PROFILES } from "./constants";
import type { PolicyType } from "./types";

export type PolicyDraftGroup = { policyType: PolicyType; documents: PolicyDocumentSummary[] };

const POLICY_TYPE_SLUGS = ["environmental", "labour-human-rights", "living-wage", "ethics", "sustainable-procurement"] as const;

export function alignGeneratedDraftTitle(title: string, policyType: PolicyType): string {
  const trimmed = title.trim();
  const typePattern = POLICY_TYPE_SLUGS.join("|");
  const generatedTitle = new RegExp(`^(.*\\s)(?:${typePattern}) policy(\\s+\\d+)?$`, "i").exec(trimmed);
  if (!generatedTitle) return trimmed;
  return `${generatedTitle[1]}${policyType} policy${generatedTitle[2] || ""}`;
}

export function nextUniqueDraftTitle(baseTitle: string, existingTitles: string[]): string {
  const normalizedBase = baseTitle.trim();
  const escapePattern = normalizedBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const numberedTitle = new RegExp(`^${escapePattern}\\s+(\\d+)$`, "i");
  let exactTitleCount = 0;
  let largestNumber = 0;

  for (const existingTitle of existingTitles) {
    const title = existingTitle.trim();
    if (title.toLocaleLowerCase() === normalizedBase.toLocaleLowerCase()) exactTitleCount += 1;
    const numberedMatch = numberedTitle.exec(title);
    if (numberedMatch) largestNumber = Math.max(largestNumber, Number(numberedMatch[1]));
  }

  if (exactTitleCount === 0 && largestNumber === 0) return normalizedBase;
  return `${normalizedBase} ${Math.max(exactTitleCount, largestNumber, 1) + 1}`;
}

export function groupDraftsByPolicyType(documents: PolicyDocumentSummary[], selected: "all" | PolicyType = "all"): PolicyDraftGroup[] {
  const types = selected === "all" ? Object.keys(POLICY_PROFILES) as PolicyType[] : [selected];
  return types
    .map((policyType) => ({ policyType, documents: documents.filter((document) => document.policyType === policyType) }))
    .filter((group) => selected !== "all" || group.documents.length > 0);
}

export function getDraftDisplayTitles(documents: PolicyDocumentSummary[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const document of documents) {
    const key = document.title.trim().toLocaleLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const seen = new Map<string, number>();
  return new Map(documents.map((document) => {
    const key = document.title.trim().toLocaleLowerCase();
    const number = (seen.get(key) || 0) + 1;
    seen.set(key, number);
    const title = document.title.trim();
    return [document.id, (counts.get(key) || 0) > 1 ? `${title} ${number}` : title];
  }));
}
