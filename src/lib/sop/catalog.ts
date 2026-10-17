/**
 * The SOP catalog: canonical topics a manual can include, with their pillar,
 * owning department and how common they are across the reference manuals.
 * Data lives in data/sop-catalog.json; scripts/import-sop-seeds.ts refreshes it.
 */
import catalog from "../../data/sop-catalog.json";
import type { Company } from "../types";
import type { SopPillar } from "./types";

export type SopCatalogTopic = {
  id: string;
  title: string;
  pillar: SopPillar;
  department: string;
  owner: string;
  /** "esg" topics come from the ESG reference manuals; "operational" are department procedures. */
  kind: "esg" | "operational";
  /** Number of reference manuals that include this topic. */
  frequency: number;
  /** Industry tags the topic suits; "*" means every industry. */
  industries: string[];
  aliases: string[];
  description: string;
};

export const SOP_CATALOG: readonly SopCatalogTopic[] = catalog.topics as SopCatalogTopic[];

const BY_ID = new Map(SOP_CATALOG.map((topic) => [topic.id, topic]));

export function getCatalogTopic(id: string | undefined): SopCatalogTopic | undefined {
  return id ? BY_ID.get(id) : undefined;
}

const normalize = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Best catalog topic for a free-text SOP title (for imports and custom SOPs).
 * Scores exact title or alias matches first, then shared significant words.
 */
export function matchCatalogTopic(title: string): SopCatalogTopic | undefined {
  const text = normalize(title.replace(/^(sop|standard operating procedure)\s*(for|on)?\s*/i, ""));
  if (!text) return undefined;
  let best: { topic: SopCatalogTopic; score: number } | undefined;
  const words = new Set(text.split(" ").filter((word) => word.length > 3));
  for (const topic of SOP_CATALOG) {
    const names = [topic.title, ...topic.aliases].map(normalize);
    let score = 0;
    for (const name of names) {
      if (text === name) score = Math.max(score, 100);
      // A longer matching phrase is more specific: "it security incident" beats "security".
      else if (text.includes(name) || name.includes(text)) score = Math.max(score, Math.min(95, 40 + Math.min(name.length, text.length)));
      else {
        const shared = name.split(" ").filter((word) => word.length > 3 && words.has(word)).length;
        score = Math.max(score, shared * 15);
      }
    }
    if (score > (best?.score ?? 0)) best = { topic, score };
  }
  return best && best.score >= 30 ? best.topic : undefined;
}

/** Industry tags inferred from the company's ISIC sector, subsector and description. */
export function companyIndustryTags(company: Pick<Company, "industry" | "subCategory" | "industryDetail">): string[] {
  const text = normalize([company.industry, company.subCategory, company.industryDetail].filter(Boolean).join(" "));
  const tags = new Set<string>();
  const rules: Array<[string, RegExp]> = [
    ["manufacturing", /manufactur|factory|plant|production|industr|mill|processing|fabricat/],
    ["chemicals", /chemic|petro|agro|fertili|dye|paint|resin|polymer|plastic|rubber/],
    ["pharma", /pharma|drug|api|medic|health|laborator|biotech/],
    ["textiles", /textile|garment|apparel|fashion|jute|yarn|fabric|knit|cotton/],
    ["consumer", /consumer|cosmetic|food|retail|footwear|packag|furniture|interior/],
    ["electronics", /electronic|solar|photovolt|electrical|battery|semiconductor/],
    ["services", /service|consult|software|it |financ|bank|insur|travel|hospitality|hotel|logistic|transport/],
    ["logistics", /logistic|transport|warehous|freight|shipping/],
  ];
  for (const [tag, pattern] of rules) if (pattern.test(text)) tags.add(tag);
  if (tags.has("chemicals") || tags.has("pharma") || tags.has("textiles") || tags.has("electronics")) tags.add("manufacturing");
  return [...tags];
}

/**
 * Topics recommended for a company: ESG topics that suit its industry,
 * ranked by how often the reference manuals include them.
 */
export function recommendSops(company: Pick<Company, "industry" | "subCategory" | "industryDetail">, limit = 14): SopCatalogTopic[] {
  const tags = new Set(companyIndustryTags(company));
  const services = tags.has("services") && !tags.has("manufacturing");
  return SOP_CATALOG
    .filter((topic) => topic.kind === "esg")
    .map((topic) => {
      const suits = topic.industries.includes("*") || topic.industries.some((tag) => tags.has(tag));
      // Plant-only topics are a poor fit for service companies.
      const penalty = services && !topic.industries.includes("*") ? 0.3 : 1;
      return { topic, score: (suits ? 1 : 0.35) * penalty * topic.frequency };
    })
    .sort((a, b) => b.score - a.score || a.topic.title.localeCompare(b.topic.title))
    .slice(0, limit)
    .map((entry) => entry.topic);
}
