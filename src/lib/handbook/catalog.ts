/**
 * The handbook chapter catalog: canonical chapter topics, the part each sits
 * in, how common it is across the reference handbooks, and the sub-sections a
 * new chapter starts with. Data lives in data/handbook-catalog.json.
 */
import catalog from "../../data/handbook-catalog.json";
import { companyIndustryTags } from "../sop/catalog";
import type { SopSectionKind } from "../sop/types";
import type { Company } from "../types";
import type { HandbookPartId } from "./types";

export type HandbookOutlineEntry = { kind: SopSectionKind; title: string };

export type HandbookCatalogTopic = {
  id: string;
  title: string;
  part: HandbookPartId;
  owner: string;
  /** Number of reference handbooks with a chapter on this topic (of 53). */
  frequency: number;
  aliases: string[];
  description: string;
  outline: HandbookOutlineEntry[];
};

export const HANDBOOK_CATALOG: readonly HandbookCatalogTopic[] = catalog.topics as HandbookCatalogTopic[];

const BY_ID = new Map(HANDBOOK_CATALOG.map((topic) => [topic.id, topic]));

export function getHandbookTopic(id: string | undefined): HandbookCatalogTopic | undefined {
  return id ? BY_ID.get(id) : undefined;
}

const normalize = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Best catalog topic for a free-text chapter title (custom chapters and the reference corpus). */
export function matchHandbookTopic(title: string): HandbookCatalogTopic | undefined {
  const text = normalize(title.replace(/\b(policy|policies|guidelines?|procedure)\b/gi, " "));
  if (!text) return undefined;
  const words = new Set(text.split(" ").filter((word) => word.length > 3));
  let best: { topic: HandbookCatalogTopic; score: number } | undefined;
  for (const topic of HANDBOOK_CATALOG) {
    let score = 0;
    for (const name of [topic.title, ...topic.aliases].map(normalize)) {
      if (text === name) score = Math.max(score, 100);
      else if (name && (text.includes(name) || name.includes(text))) score = Math.max(score, Math.min(95, 40 + Math.min(name.length, text.length)));
      else score = Math.max(score, name.split(" ").filter((word) => word.length > 3 && words.has(word)).length * 15);
    }
    if (score > (best?.score ?? 0)) best = { topic, score };
  }
  return best && best.score >= 30 ? best.topic : undefined;
}

/** Chapters that only fit sites with a plant, security staff or a canteen. */
const PLANT_TOPICS = new Set(["facilities", "security-movement", "overtime"]);

/**
 * Chapters recommended for a company: the topics most reference handbooks
 * include. Service companies skip the plant-only chapters.
 */
export function recommendChapters(company: Pick<Company, "industry" | "subCategory" | "industryDetail">, limit = 22): HandbookCatalogTopic[] {
  const tags = new Set(companyIndustryTags(company));
  const services = tags.has("services") && !tags.has("manufacturing");
  return HANDBOOK_CATALOG
    .filter((topic) => !(services && PLANT_TOPICS.has(topic.id)))
    .slice()
    .sort((a, b) => b.frequency - a.frequency || a.title.localeCompare(b.title))
    .slice(0, limit);
}
