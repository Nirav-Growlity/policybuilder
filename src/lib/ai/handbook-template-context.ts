/**
 * Reference material for handbook writing: example chapters from the
 * extracted corpus (data/seed-handbooks/*.json, written by
 * scripts/extract-handbook-seeds.py). Rendered as plain text within a
 * character budget so a request stays well under the token ceiling.
 */
import fs from "node:fs";
import path from "node:path";

export type SeedHandbookChapter = { title: string; catalogId: string; part: string; text: string; sourceWords: number };
export type SeedHandbook = {
  id: string;
  company: string;
  sourceFile: string;
  frontMatter: { welcome: string; about: string; purpose: string };
  chapters: SeedHandbookChapter[];
};

export const HANDBOOK_REFERENCE_MAX_CHARS = 14_000;
export const DEFAULT_SEED_HANDBOOK_DIRECTORY = path.join(process.cwd(), "data", "seed-handbooks");
const MAX_EXAMPLES = 3;

const cache = new Map<string, SeedHandbook[]>();

function isSeed(value: unknown): value is SeedHandbook {
  const candidate = value as Partial<SeedHandbook> | null;
  return Boolean(candidate && typeof candidate.company === "string" && Array.isArray(candidate.chapters));
}

/** Reads the corpus once per directory; a missing folder is an empty corpus. */
export function loadSeedHandbooks(directory = DEFAULT_SEED_HANDBOOK_DIRECTORY): SeedHandbook[] {
  const cached = cache.get(directory);
  if (cached) return cached;
  let seeds: SeedHandbook[] = [];
  try {
    seeds = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort().flatMap((name) => {
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
        return isSeed(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    });
  } catch {
    seeds = [];
  }
  cache.set(directory, seeds);
  return seeds;
}

export function clearSeedHandbookCache() {
  cache.clear();
}

const words = (value: string) => new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !["policy", "procedure", "employee", "employees"].includes(word)));

function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const line = cut.lastIndexOf("\n");
  return `${(line > max * 0.6 ? cut.slice(0, line) : cut).trimEnd()}\n…`;
}

/**
 * Example chapters for one topic: same catalog topic first (from different
 * companies, longest first so the examples show depth), then title overlap.
 * Returns "" when the corpus has nothing relevant.
 */
export function buildHandbookReferenceContext(
  query: { catalogId?: string; title: string },
  options: { maxChars?: number; directory?: string } = {},
): string {
  const maxChars = options.maxChars ?? HANDBOOK_REFERENCE_MAX_CHARS;
  if (maxChars < 400) return "";
  const titleWords = words(query.title);
  const candidates = loadSeedHandbooks(options.directory).flatMap((seed) => seed.chapters.map((chapter) => {
    const same = Boolean(query.catalogId && chapter.catalogId === query.catalogId);
    const shared = [...words(chapter.title)].filter((word) => titleWords.has(word)).length;
    return { seed, chapter, score: (same ? 100 : 0) + shared * 12 + Math.min(chapter.sourceWords, 1500) / 150 };
  })).filter((candidate) => candidate.score >= 12);
  // Chapters on the same topic are the real examples; title overlap only stands in when there are none.
  if (candidates.some((candidate) => candidate.score >= 100)) candidates.splice(0, candidates.length, ...candidates.filter((candidate) => candidate.score >= 100));
  candidates.sort((a, b) => b.score - a.score || a.seed.company.localeCompare(b.seed.company));
  const picked: typeof candidates = [];
  const companies = new Set<string>();
  for (const candidate of candidates) {
    if (picked.length >= MAX_EXAMPLES) break;
    if (companies.has(candidate.seed.company)) continue;
    picked.push(candidate);
    companies.add(candidate.seed.company);
  }
  if (!picked.length) return "";
  const intro = "REFERENCE CHAPTERS (from other companies' handbooks; learn structure, depth and tone, never copy company names, figures or entitlements):";
  const per = Math.floor((maxChars - intro.length) / picked.length) - 80;
  const rendered = picked.map(({ chapter }, index) => clip(`### REFERENCE ${index + 1}: ${chapter.title} (about ${chapter.sourceWords} words)\n${chapter.text}`, per));
  return [intro, ...rendered].join("\n\n");
}

/** Welcome, about and purpose text from three handbooks, for the front matter. */
export function buildHandbookFrontMatterContext(options: { maxChars?: number; directory?: string } = {}): string {
  const maxChars = options.maxChars ?? 6_000;
  const seeds = loadSeedHandbooks(options.directory)
    .filter((seed) => seed.frontMatter.welcome.trim() || seed.frontMatter.about.trim())
    .sort((a, b) => (b.frontMatter.welcome.length + b.frontMatter.about.length) - (a.frontMatter.welcome.length + a.frontMatter.about.length))
    .slice(0, 3);
  if (!seeds.length) return "";
  const per = Math.floor(maxChars / seeds.length);
  const parts = seeds.map((seed, index) => clip(`### REFERENCE HANDBOOK ${index + 1}\n${(["welcome", "about", "purpose"] as const).filter((key) => seed.frontMatter[key].trim()).map((key) => `${key}: ${seed.frontMatter[key]}`).join("\n")}`, per));
  return ["REFERENCE HANDBOOK OPENINGS (other companies; learn tone and length only):", ...parts].join("\n\n");
}
