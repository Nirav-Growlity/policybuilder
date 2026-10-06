import { visibleQualitativeEntries, visibleQuantitativeAreas } from "./focus-area-catalog";
import { getEnabledSections } from "./sections";
import { resolveRevisionHistory } from "./revision-history";
import type { Policy, PolicySection } from "./types";

export type PolicyProgressSection = {
  id: string;
  title: string;
  kind: PolicySection["kind"];
  filled: boolean;
};

export type PolicyProgress = {
  percentage: number;
  filledSections: number;
  totalSections: number;
  sections: PolicyProgressSection[];
};

export function calculatePolicyProgress(policy: Policy): PolicyProgress {
  const sections = getEnabledSections(policy).map((section) => ({
    id: section.id,
    title: section.title,
    kind: section.kind,
    filled: sectionHasMeaningfulContent(policy, section),
  }));
  const filledSections = sections.filter((section) => section.filled).length;
  const totalSections = sections.length;

  return {
    percentage: totalSections === 0 ? 0 : Math.round((filledSections / totalSections) * 100),
    filledSections,
    totalSections,
    sections,
  };
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sectionHasMeaningfulContent(policy: Policy, section: PolicySection): boolean {
  switch (section.kind) {
    case "preface": return hasText(policy.declaration.preface);
    case "declaration": return hasText(policy.declaration.declaration);
    case "scope": return hasText(policy.declaration.scope);
    case "definitions": return hasText(policy.definitions?.content);
    case "focus": return policy.focusAreas.some(hasText);
    case "qualitative": return visibleQualitativeEntries(policy)
      .some(([, objectives]) => objectives.some(hasText));
    case "quantitative": return visibleQuantitativeAreas(policy)
      .some((area) => area.targets.some((target) => hasText(target.target)));
    case "sdg": return policy.sdgs.some((goal) => Number.isInteger(goal) && goal >= 1 && goal <= 17);
    case "responsibilities": return policy.responsibilities.some((entry) => hasText(entry.role) && hasText(entry.duty));
    case "monitoring": return hasText(policy.monitoring);
    case "review": return hasText(policy.reviewMechanism);
    case "revision": return resolveRevisionHistory(
      policy.revisionHistory,
      policy.company.effectiveDate,
      policy.company.lastReviewDate,
      policy.company.reviewFrequency,
    ).some((entry) => hasText(entry.date) || hasText(entry.description));
    case "custom": return Boolean(section.blocks?.some((block) =>
      hasText(block.text) || (block.type === "table" && block.rows?.some((row) => row.some(hasText)))
    ));
  }
}
