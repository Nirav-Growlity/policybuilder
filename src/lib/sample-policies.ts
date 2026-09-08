import { getPolicyProfile } from "./constants";
import { normalizePolicyStructure } from "./sections";
import { makeSamplePolicy } from "./store";
import { getDocumentThemePatch, upgradeDocumentThemeId } from "./document-themes";
import type { DocumentTemplateId, Policy, PolicyType } from "./types";

export const PREVIEW_POLICY_TYPES: PolicyType[] = [
  "environmental",
  "ethics",
  "living-wage",
  "labour-human-rights",
  "sustainable-procurement",
];

export function isPreviewPolicyType(value: unknown): value is PolicyType {
  return typeof value === "string" && (PREVIEW_POLICY_TYPES as string[]).includes(value);
}

/** Build sample content for a policy type rendered inside a visual template. Template controls presentation only. */
export function makeSamplePolicyForType(policyType: PolicyType, templateId?: string | null): Policy {
  const base = makeSamplePolicy();
  if (policyType === "environmental") {
    return normalizePolicyStructure({
      ...base,
      ...(templateId ? getDocumentThemePatch(upgradeDocumentThemeId(templateId)) : {}),
    });
  }
  const profile = getPolicyProfile(policyType);
  const focusAreas = [...profile.focusAreas].slice(0, 5);
  const qualitative: Record<string, string[]> = Object.fromEntries(
    focusAreas.map((area) => [
      area,
      [
        `Assign accountable ownership and approved procedures for ${area.toLowerCase()}.`,
        `Identify material risks and improvement opportunities related to ${area.toLowerCase()}.`,
        `Define measures, evidence sources and review frequency for ${area.toLowerCase()}.`,
      ],
    ]),
  );
  return normalizePolicyStructure({
    ...base,
    policyType,
    focusAreas,
    qualitative,
    quantitative: focusAreas.slice(0, 3).map((area) => ({
      area,
      targets: [{ target: `Achieve the approved ${area.toLowerCase()} target`, baseline: "FY 2024-25", deadline: "FY 2028-29", reportingFrequency: "Target period" as const }],
    })),
    sdgs: [...profile.sdgs],
    responsibilities: profile.responsibilities.map((r) => ({ ...r })),
    standards: [...profile.standards],
    declaration: {
      preface: `${profile.label} provides a consistent framework for Acme Specialty Chemicals Pvt. Ltd. to define responsibilities, make decisions, and review performance across its activities and locations.`,
      declaration: `Acme Specialty Chemicals affirms its commitment to implementing this ${profile.label} in line with applicable requirements, proportionate controls, and regular management review.`,
      scope: `This ${profile.label} applies to the operations, workers, business relationships, and locations identified by Acme Specialty Chemicals Pvt. Ltd., including manufacturing, R&D, warehousing, logistics, and corporate functions.`,
    },
    ...(templateId ? getDocumentThemePatch(upgradeDocumentThemeId(templateId)) : {}),
  });
}

export function templatePreviewPolicy(templateId: string, policyType?: string | null): Policy {
  const type: PolicyType = isPreviewPolicyType(policyType) ? policyType : "environmental";
  return makeSamplePolicyForType(type, templateId as DocumentTemplateId);
}
