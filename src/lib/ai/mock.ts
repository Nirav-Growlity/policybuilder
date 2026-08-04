import type { AIContext, AIResponse } from "./prompts";
import type { Policy } from "../types";

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
  const t = ctx.type;
  const company = ctxText(p);

  switch (t) {
    case "preface":
      return {
        source: "mock",
        text: `${p.company.name || "The Company"} is committed to environmental stewardship across every facility, process and product. Operating in ${p.company.industry || "the manufacturing sector"}, the Company recognizes its responsibility to minimize ecological impact, conserve natural resources and align with internationally recognized environmental standards. This Environmental Policy establishes the framework through which the Company sets objectives, allocates resources and measures progress toward a more sustainable future.`,
      };
    case "declaration":
      return {
        source: "mock",
        text: `${p.company.name || "The Company"} affirms its unwavering commitment to protecting the environment, preventing pollution, and continually improving its environmental performance. The Company will comply with all applicable legal requirements, reduce its carbon and water intensity, manage waste responsibly, and integrate environmental considerations into every business decision.`,
      };
    case "scope":
      return {
        source: "mock",
        text: `This Environmental Policy applies to all operations, sites and activities of ${p.company.name || "the Company"}, including manufacturing, R&D, warehousing, logistics, and corporate functions. It covers all employees, contractors, suppliers and visitors acting on behalf of the Company, regardless of geography. Where local requirements are stricter than this Policy, the more stringent standard applies.`,
      };
    case "focus":
      return { source: "mock", areas: FOCUS_AREAS_POOL.slice(0, 8) };
    case "sdg":
      return { source: "mock", sdgs: [...SDGS_POOL] };
    case "qualitative": {
      const area = p.focusAreas[ctx.areaIndex ?? 0] || "this area";
      return {
        source: "mock",
        objectives: [
          `Establish governance, KPIs and accountability mechanisms to manage ${area.toLowerCase()} in line with leading international standards.`,
          `Engage employees, contractors and suppliers to embed ${area.toLowerCase()} into day-to-day operations and decision-making.`,
          `Track and publicly disclose performance against ${area.toLowerCase()} targets in the annual sustainability report.`,
        ],
      };
    }
    case "quantitative": {
      const area = p.quantitative[ctx.areaIndex ?? 0]?.area || "this focus area";
      return {
        source: "mock",
        targets: [
          { target: `Reduce ${area.toLowerCase()} intensity per unit of production by 20%`, baseline: "FY 2022-23", deadline: "FY 2029-30" },
          { target: `Achieve 100% compliance with applicable regulatory and voluntary standards related to ${area.toLowerCase()}`, baseline: "FY 2022-23", deadline: "Ongoing" },
          { target: `Engage 100% of strategic suppliers on ${area.toLowerCase()} requirements`, baseline: "FY 2024-25", deadline: "FY 2027-28" },
        ],
      };
    }
    case "responsibilities":
      return {
        source: "mock",
        responsibilities: [
          { role: "Board & Senior Management", duty: "Provide strategic direction, approve the policy, allocate resources, and review environmental performance at the highest level." },
          { role: "EHS / Sustainability Team", duty: "Maintain the environmental management system, ensure regulatory compliance, track KPIs, coordinate audits, and report progress to leadership." },
          { role: "Production & Operations", duty: "Implement energy, water and waste management initiatives on the shop floor, maintain pollution control equipment, and minimize process losses." },
          { role: "Procurement & Supply Chain", duty: "Engage suppliers on sustainability criteria, source environmentally responsible materials, and integrate ESG clauses into contracts." },
          { role: "All Employees", duty: "Follow environmental procedures, identify improvement opportunities, participate in training, and report incidents or concerns." },
        ],
      };
    case "monitoring":
      return {
        source: "mock",
        text: `Environmental performance is monitored continuously through a centralized EHS dashboard, with KPIs reviewed monthly by site leadership and quarterly by the Executive Committee. Independent third-party audits are conducted annually for ISO 14001 and as required by customers. Findings, progress against targets, and incidents are reported in the annual Sustainability Report prepared in line with GRI Standards and BRSR.`,
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
