import type { Policy, PolicySection, StandardSectionKind, StepId } from "./types";
import { DEFAULT_TYPOGRAPHY } from "./typography";

export const STANDARD_SECTIONS: { kind: StandardSectionKind; title: string }[] = [
  { kind: "preface", title: "Preface" },
  { kind: "declaration", title: "Policy Declaration" },
  { kind: "scope", title: "Scope" },
  { kind: "definitions", title: "Definitions" },
  { kind: "focus", title: "Key Focus Areas" },
  { kind: "qualitative", title: "Qualitative Objectives" },
  { kind: "quantitative", title: "Quantitative Targets" },
  { kind: "sdg", title: "SDG Alignment" },
  { kind: "responsibilities", title: "Roles & Responsibilities" },
  { kind: "monitoring", title: "Monitoring, Reporting & Transparency" },
  { kind: "review", title: "Review Mechanism & Continuous Improvement" },
];

export const sectionId = (kind: StandardSectionKind) => `standard-${kind}`;

function usesPreviousTypographyDefaults(policy: Policy) {
  const typography = policy.typography;
  return typography?.fontFamily === "Arial"
    && typography.headingSize === 14
    && typography.subheadingSize === 11
    && typography.paragraphSize === 10.5
    && typography.lineSpacing === 1.5;
}

export function defaultSections(policy?: Partial<Policy>): PolicySection[] {
  const templateKinds: Record<string, StandardSectionKind[]> = {
    standard: ["preface", "declaration", "scope", "focus", "quantitative", "responsibilities", "monitoring", "review"],
    executive: ["preface", "declaration", "scope", "quantitative", "sdg", "review"],
    comprehensive: STANDARD_SECTIONS.map((section) => section.kind),
  };
  const allowed = policy?.presentationTemplate ? new Set(templateKinds[policy.presentationTemplate] || templateKinds.comprehensive) : null;
  return STANDARD_SECTIONS
    .filter(({ kind }) => (!allowed || allowed.has(kind)) && (kind !== "definitions" || Boolean(policy?.definitions?.content)))
    .map(({ kind, title }) => ({ id: sectionId(kind), kind, title: kind === "definitions" ? policy?.definitions?.title || title : title, enabled: true }));
}

/** Makes old templates and imported documents behave as a fully configurable policy. */
export function normalizePolicyStructure<T extends Policy>(policy: T): T {
  const incoming = Array.isArray(policy.sections) ? policy.sections : defaultSections(policy);
  const requiredPreface = incoming.find((s) => s.kind === "preface") || { id: sectionId("preface"), kind: "preface" as const, title: "Preface", enabled: true };
  const remaining = incoming.filter((s) => s.kind !== "preface").map((s) => ({ ...s, blocks: s.kind === "custom" ? (s.blocks || []) : s.blocks }));
  return {
    ...policy,
    sections: [{ ...requiredPreface, enabled: true }, ...remaining],
    showTableOfContents: policy.showTableOfContents ?? true,
    showAcknowledgement: policy.showAcknowledgement ?? true,
    sdgDisplay: policy.sdgDisplay ?? "tiles",
    logoPosition: policy.logoPosition ?? "center",
    typography: !policy.typography || usesPreviousTypographyDefaults(policy)
      ? DEFAULT_TYPOGRAPHY
      : policy.typography,
    visualStyle: policy.visualStyle ?? "corporate",
  };
}

export function getEnabledSections(policy: Policy) {
  return normalizePolicyStructure(policy).sections!.filter((section) => section.enabled);
}

export function getSection(policy: Policy, kind: StandardSectionKind) {
  return normalizePolicyStructure(policy).sections!.find((section) => section.kind === kind);
}

export function sectionHasContent(policy: Policy, section: PolicySection) {
  switch (section.kind) {
    case "preface": return Boolean(policy.declaration.preface);
    case "declaration": return Boolean(policy.declaration.declaration);
    case "scope": return Boolean(policy.declaration.scope);
    case "definitions": return Boolean(policy.definitions?.content);
    case "focus": return policy.focusAreas.some(Boolean);
    case "qualitative": return Object.values(policy.qualitative).some((v) => v.length);
    case "quantitative": return policy.quantitative.some((q) => q.targets.some((t) => t.target));
    case "sdg": return policy.sdgs.length > 0;
    case "responsibilities": return policy.responsibilities.length > 0;
    case "monitoring": return Boolean(policy.monitoring);
    case "review": return Boolean(policy.reviewMechanism);
    case "custom": return Boolean(section.blocks?.some((b) => b.text.trim()));
  }
}

export function getWorkflowSteps(policy: Policy): StepId[] {
  const enabled = new Set(getEnabledSections(policy).map((s) => s.kind));
  const result: StepId[] = ["structure"];
  if (["preface", "declaration", "scope", "definitions"].some((k) => enabled.has(k as StandardSectionKind))) result.push("declaration");
  if (enabled.has("focus") || enabled.has("qualitative") || enabled.has("quantitative")) result.push("focus");
  if (enabled.has("qualitative")) result.push("qualitative");
  if (enabled.has("quantitative")) result.push("quantitative");
  if (enabled.has("sdg")) result.push("sdg");
  if (["responsibilities", "monitoring", "review"].some((k) => enabled.has(k as StandardSectionKind))) result.push("responsibilities");
  if (enabled.has("custom")) result.push("custom");
  result.push("export");
  return result;
}
