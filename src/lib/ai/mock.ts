import type { AIContext, AIResponse } from "./prompts";
import type { Policy } from "../types";
import { normalizeQuantitativeTarget } from "../quantitative";
import { getPolicyProfile } from "../constants";

const FOCUS_AREAS_POOL = [
  "Energy Consumption & GHG Emissions",
  "Air Emissions Control",
  "Raw Materials & Resource Efficiency",
  "Waste Management & Circularity",
  "Water Stewardship",
  "Biodiversity & Land Use",
  "Climate Risk & Emergency Preparedness",
  "Product End-of-Life & Environmental Stewardship",
  "Chemical Stewardship & Pollution Prevention",
  "Sustainable Packaging",
];

const SDGS_POOL = [6, 7, 9, 11, 12, 13, 14, 15, 17];

function ctxText(p: Policy): string {
  const c = p.company;
  return `${c.name || "a manufacturing company"} in ${c.industry || "the industrial sector"}`;
}

export function mockGenerate(ctx: AIContext): AIResponse {
  const p = ctx.policy;
  const profile = getPolicyProfile(p.policyType);
  const t = ctx.type;
  const company = ctxText(p);

  switch (t) {
    case "preface":
      return {
        source: "mock",
        text: `${p.company.name || "The Company"} is committed to the principles set out in this ${profile.label}. Operating in ${p.company.industry || "its sector"}, the Company will align its practices with applicable laws, recognized standards, and the needs of people and stakeholders affected by its operations. This policy establishes the framework for clear commitments, accountable implementation, and continual improvement.`,
      };
    case "declaration":
      return {
        source: "mock",
        text: `${p.company.name || "The Company"} affirms its commitment to implement this ${profile.label} across its operations. The Company will comply with applicable legal requirements, prevent adverse impacts, provide clear accountability, and continually improve performance through transparent monitoring and engagement.`,
      };
    case "scope":
      return {
        source: "mock",
        text: `This ${profile.label} applies to all operations, sites and activities of ${p.company.name || "the Company"}, including employees, workers, contractors, suppliers and business partners acting on its behalf. Where local requirements are stricter than this policy, the more stringent standard applies.`,
      };
    case "focus":
      return { source: "mock", areas: profile.focusAreas };
    case "sdg":
      return { source: "mock", sdgs: [...profile.sdgs] };
    case "qualitative": {
      const area = p.focusAreas[ctx.areaIndex ?? 0] || "this area";
      const existing = Array.isArray(ctx.existingContent) ? ctx.existingContent : [];
      let count = 3;
      if (ctx.customPrompt) {
        const match = ctx.customPrompt.match(/\b([1-9])\b/);
        if (match) count = parseInt(match[1], 10);
      }
      const pool = [
        `Implement robust management procedures and continuous monitoring to optimize ${area.toLowerCase()}.`,
        `Engage key stakeholders, suppliers and employees to support ${area.toLowerCase()} goals.`,
        `Conduct regular internal and external audits to ensure compliance and best practices in ${area.toLowerCase()}.`,
        `Adopt innovative clean technology and resource-efficient solutions for ${area.toLowerCase()}.`,
        `Publish annual progress updates and performance indicators related to ${area.toLowerCase()}.`,
      ];
      const existingSet = new Set(existing.map((s: string) => String(s).toLowerCase().trim()));
      const available = pool.filter((item) => !existingSet.has(item.toLowerCase().trim()));
      return {
        source: "mock",
        objectives: (available.length > 0 ? available : pool).slice(0, count),
      };
    }
    case "quantitative":
    case "quantitative-topic":
    case "quantitative-refine": {
      const area = ctx.areaName || p.quantitative[ctx.areaIndex ?? 0]?.area || "this focus area";
      const reportingPeriod = p.company.reportingPeriod || "FY";
      const targets = [
        normalizeQuantitativeTarget({ target: `Reduce ${area.toLowerCase()} intensity per unit of production by 20%` }, reportingPeriod),
        normalizeQuantitativeTarget({ target: `Achieve 100% compliance with applicable regulatory and voluntary standards related to ${area.toLowerCase()}` }, reportingPeriod),
        normalizeQuantitativeTarget({ target: `Engage 100% of strategic suppliers on ${area.toLowerCase()} requirements` }, reportingPeriod),
      ];
      return {
        source: "mock",
        targets: t === "quantitative-refine" ? targets.slice(0, 1) : targets,
      };
    }
    case "responsibilities":
      return {
        source: "mock",
        responsibilities: profile.responsibilities,
      };
    case "monitoring":
      return {
        source: "mock",
        text: `Performance against this ${profile.label} is monitored through defined KPIs, worker and stakeholder feedback, internal reviews, and periodic management oversight. Findings, progress against targets, concerns, and corrective actions are documented and reported to leadership at least annually.`,
      };
    case "review":
      return {
        source: "mock",
        text: `This Policy is reviewed every two years or earlier if there are significant changes in operations, regulations, or stakeholder expectations. The EHS team initiates the review, the Executive Committee approves revisions, and updated versions are communicated to all employees and relevant stakeholders. Feedback collected through employee engagement, customer audits and investor dialogues is incorporated into each revision.`,
      };
    case "all":
      return {
        source: "mock",
        text: `Full policy draft ready for ${company}.`,
      };
  }
}
