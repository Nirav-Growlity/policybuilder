import { getPolicyProfile } from "./constants";
import { normalizePolicyStructure, sectionId } from "./sections";
import type { DocumentThemeId, Policy, PolicySection, PolicyType, StandardSectionKind } from "./types";

export type StarterProfile = "essential" | "standard" | "compliance" | "stakeholder" | "evidence-led";

export type StarterTemplate = {
  id: string;
  name: string;
  summary: string;
  policyType: PolicyType;
  profile: StarterProfile;
  profileLabel: string;
  intendedAudience: string;
  estimatedLength: string;
  recommendedThemes: readonly DocumentThemeId[];
  policy: Policy;
};

const PROFILE_CONFIG: Record<StarterProfile, {
  label: string;
  audience: string;
  length: string;
  description: string;
  theme: DocumentThemeId;
  recommendations: readonly DocumentThemeId[];
  focusLimit: number;
  visualStyle: "corporate" | "modern";
}> = {
  essential: { label: "Essential", audience: "Internal teams needing a concise policy baseline", length: "3–5 pages", description: "A concise internal policy with clear commitments, scope, ownership, and review.", theme: "plain-standard", recommendations: ["plain-standard", "accessible-standard", "leadership-memo"], focusLimit: 4, visualStyle: "corporate" },
  standard: { label: "Standard", audience: "Organizations building a balanced professional policy", length: "6–9 pages", description: "A balanced professional starting point with practical objectives and governance.", theme: "modern-standard", recommendations: ["modern-standard", "governance-manual", "institutional-report"], focusLimit: 6, visualStyle: "corporate" },
  compliance: { label: "Compliance", audience: "Audit, tender, customer, and governance reviewers", length: "8–12 pages", description: "An audit-oriented policy with controls, responsibilities, monitoring, and revision structure.", theme: "compliance-policy", recommendations: ["compliance-policy", "audit-dossier", "legal-register"], focusLimit: 8, visualStyle: "corporate" },
  stakeholder: { label: "Stakeholder", audience: "Employees, customers, investors, and communities", length: "8–12 pages", description: "A public-facing ESG policy emphasizing accessibility, outcomes, and engagement.", theme: "sustainability-report", recommendations: ["sustainability-report", "community-brief", "editorial-report"], focusLimit: 8, visualStyle: "modern" },
  "evidence-led": { label: "Evidence-led", audience: "Technical teams, assessors, and evidence owners", length: "12–18 pages", description: "A detailed framework with definitions, measurement methods, and annex placeholders.", theme: "evidence-review", recommendations: ["evidence-review", "research-paper", "technical-standard"], focusLimit: 10, visualStyle: "corporate" },
};

const POLICY_TYPES: readonly PolicyType[] = ["environmental", "labour-human-rights", "living-wage", "ethics", "sustainable-procurement"];
const PROFILES: readonly StarterProfile[] = ["essential", "standard", "compliance", "stakeholder", "evidence-led"];

export const STARTER_TEMPLATES: readonly StarterTemplate[] = POLICY_TYPES.flatMap((policyType) =>
  PROFILES.map((profile) => createStarter(policyType, profile)),
);

export function getStarterTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((starter) => starter.id === id);
}

export function queryStarterTemplates(filters: { policyType?: string | null; profile?: string | null; q?: string | null } = {}): StarterTemplate[] {
  const query = filters.q?.trim().toLocaleLowerCase() || "";
  return STARTER_TEMPLATES.filter((starter) => {
    if (filters.policyType && starter.policyType !== filters.policyType) return false;
    if (filters.profile && starter.profile !== filters.profile) return false;
    if (!query) return true;
    return [starter.name, starter.summary, starter.profileLabel, starter.intendedAudience, getPolicyProfile(starter.policyType).label]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });
}

export function starterTemplateMeta(starter: StarterTemplate) {
  return {
    id: starter.id,
    name: starter.name,
    summary: starter.summary,
    policyType: starter.policyType,
    profile: starter.profile,
    profileLabel: starter.profileLabel,
    intendedAudience: starter.intendedAudience,
    estimatedLength: starter.estimatedLength,
    recommendedThemes: starter.recommendedThemes,
  };
}

function createStarter(policyType: PolicyType, starterProfile: StarterProfile): StarterTemplate {
  const policyProfile = getPolicyProfile(policyType);
  const config = PROFILE_CONFIG[starterProfile];
  const focusAreas = policyProfile.focusAreas.slice(0, Math.min(config.focusLimit, policyProfile.focusAreas.length));
  const sections = starterSections(starterProfile, policyType === "living-wage");
  const policy = normalizePolicyStructure({
    policyType,
    presentationTemplate: starterProfile === "essential" ? "standard" : "comprehensive",
    documentTheme: config.theme,
    visualStyle: config.visualStyle,
    showTableOfContents: starterProfile !== "essential",
    showAcknowledgement: starterProfile === "compliance",
    showRevisionHistory: starterProfile !== "essential",
    sdgDisplay: "names",
    logoPosition: "left",
    sections,
    company: {
      name: "[Organization Name]",
      industry: "[Industry]",
      subCategory: "",
      country: "[Country]",
      websiteLink: "",
      reportingPeriod: "FY",
      sites: [],
      docNum: "[Document Number]",
      revNum: "[Revision]",
      effectiveDate: "",
      lastReviewDate: "",
      reviewDate: "",
      approver: "[Approving Role]",
    },
    standards: [],
    declaration: {
      preface: `${policyProfile.label} provides a consistent framework for [Organization Name] to define responsibilities, make decisions, and review performance. This starter must be tailored to the organization’s activities, locations, risks, and applicable requirements before approval.`,
      declaration: declarationFor(policyProfile.label, starterProfile),
      scope: "This policy applies to the operations, workers, business relationships, and locations identified by [Organization Name]. The final scope should state any exclusions, responsible entities, and the process used to review applicability.",
    },
    definitions: starterProfile === "evidence-led" || policyType === "living-wage"
      ? { title: "Definitions and Measurement Boundaries", content: "Define the material terms, organizational boundary, reporting period, calculation method, data owner, evidence source, and any exclusions used by this policy. Replace every placeholder with an approved organization-specific definition." }
      : undefined,
    focusAreas,
    qualitative: Object.fromEntries(focusAreas.map((area) => [area, objectivesFor(area, starterProfile)])),
    quantitative: starterProfile === "essential" ? [] : focusAreas.slice(0, starterProfile === "standard" ? 3 : 5).map((area) => ({
      area,
      targets: [{ target: `[Define a measurable ${area.toLocaleLowerCase()} target]`, baseline: "", deadline: "", reportingFrequency: "Target period" as const }],
    })),
    sdgs: [],
    responsibilities: policyProfile.responsibilities.map((entry) => ({ ...entry })),
    monitoring: monitoringFor(starterProfile),
    reviewMechanism: "The policy owner will review this policy at the approved interval and when material changes occur. Revisions will be documented, approved by the designated authority, communicated to affected stakeholders, and retained in accordance with the organization’s document-control process.",
    revisionHistory: [{ revisionNo: "[Revision]", date: "[Approval Date]", description: "Initial approved issue" }],
  });

  return {
    id: `${policyType}-${starterProfile}`,
    name: `${policyProfile.label} — ${config.label}`,
    summary: config.description,
    policyType,
    profile: starterProfile,
    profileLabel: config.label,
    intendedAudience: config.audience,
    estimatedLength: config.length,
    recommendedThemes: config.recommendations,
    policy,
  };
}

function starterSections(profile: StarterProfile, includeDefinitions: boolean): PolicySection[] {
  const base: StandardSectionKind[] = ["preface", "declaration", "scope", ...(includeDefinitions || profile === "evidence-led" ? ["definitions" as const] : []), "focus", "qualitative", ...(profile === "essential" ? [] : ["quantitative" as const]), "responsibilities", "monitoring", "review", ...(profile === "essential" ? [] : ["revision" as const])];
  if (profile === "stakeholder") base.splice(base.indexOf("responsibilities"), 0, "sdg");
  const sections: PolicySection[] = base.map((kind) => ({ id: sectionId(kind), kind, title: sectionTitle(kind), enabled: true }));
  if (profile === "evidence-led") {
    sections.push({ id: "starter-methodology", kind: "custom", title: "Measurement Methodology", enabled: true, blocks: [{ id: "starter-methodology-block", type: "paragraph", text: "Document indicators, formulas, data sources, collection frequency, accountable owners, controls, limitations, and assurance arrangements." }] });
    sections.push({ id: "starter-annexes", kind: "custom", title: "References and Annexes", enabled: true, blocks: [{ id: "starter-annex-block", type: "bullets", text: "[Applicable legal and regulatory requirements]\n[Approved internal procedures and records]\n[Reference standards and source notes]\n[Evidence register and annex schedule]" }] });
  }
  return sections;
}

function sectionTitle(kind: StandardSectionKind): string {
  return ({ preface: "Preface", declaration: "Policy Declaration", scope: "Scope", definitions: "Definitions", focus: "Key Focus Areas", qualitative: "Commitments and Objectives", quantitative: "Measures and Targets", sdg: "SDG Alignment", responsibilities: "Roles and Responsibilities", monitoring: "Monitoring, Reporting and Evidence", review: "Review and Continuous Improvement", revision: "Revision History" } satisfies Record<StandardSectionKind, string>)[kind];
}

function declarationFor(label: string, profile: StarterProfile): string {
  const suffix = profile === "compliance" ? " It will maintain appropriate controls, evidence, escalation routes, and management oversight." : profile === "stakeholder" ? " It will communicate material commitments and progress in a clear, balanced, and accessible manner." : profile === "evidence-led" ? " It will define methods, evidence owners, review controls, and limitations for each material commitment." : "";
  return `[Organization Name] commits to implementing this ${label} in a manner proportionate to its activities, impacts, risks, and applicable requirements.${suffix}`;
}

function objectivesFor(area: string, profile: StarterProfile): string[] {
  const objectives = [
    `Assign accountable roles and approved procedures for ${area.toLocaleLowerCase()}.`,
    `Identify material risks, impacts, and improvement opportunities related to ${area.toLocaleLowerCase()}.`,
  ];
  if (profile !== "essential") objectives.push(`Define appropriate measures, evidence sources, and review frequency for ${area.toLocaleLowerCase()}.`);
  if (profile === "compliance" || profile === "evidence-led") objectives.push(`Retain verifiable records and address exceptions through documented corrective action.`);
  if (profile === "stakeholder") objectives.push(`Engage affected stakeholders and communicate material outcomes without unsupported claims.`);
  return objectives;
}

function monitoringFor(profile: StarterProfile): string {
  if (profile === "evidence-led") return "For each material commitment, define the indicator, calculation method, boundary, source system, evidence owner, collection frequency, validation control, limitation, and reporting audience. Findings and data-quality issues should be retained with corrective actions.";
  if (profile === "compliance") return "The policy owner will maintain a control and evidence register, review implementation at the approved frequency, escalate material exceptions, track corrective actions, and report significant findings to the designated governance body.";
  if (profile === "stakeholder") return "The policy owner will monitor implementation, seek relevant stakeholder input, and communicate material progress and limitations through approved channels. Public statements must be balanced and supported by reviewed evidence.";
  return "The policy owner will monitor implementation using organization-approved indicators and records, report material exceptions to management, and retain evidence appropriate to the nature and scale of the policy.";
}
