/**
 * Shape of the extracted reference corpus in data/seed-sops/<company-slug>.json.
 * Written by scripts/import-sop-seeds.ts, read by lib/ai/sop-template-context.ts
 * to give the AI real examples of each SOP topic.
 */
import type { GeneratedSop } from "./schema";

export type SeedSop = GeneratedSop & {
  /** Catalog topic this SOP was mapped to (lib/sop/catalog.ts), or null when nothing fits. */
  catalogId: string | null;
  /** SOP code as printed in the source manual, if any. */
  code: string;
  /** Approximate word count of the source SOP, used to match length. */
  sourceWords: number;
};

export type SeedSopManual = {
  id: string;
  company: string;
  /** Free-text industry, e.g. "Textile dyeing and finishing". */
  industry: string;
  /** Industry tags as used by catalog.companyIndustryTags. */
  industryTags: string[];
  sourceFile: string;
  /** Front matter text found in the source, used as examples for the manual introduction. */
  frontMatter: { introduction: string; objective: string; scope: string; reviewMechanism: string };
  sops: SeedSop[];
  parsedAt: string;
};
