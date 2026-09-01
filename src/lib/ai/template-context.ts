import fs from "node:fs";
import path from "node:path";

import { POLICY_PROFILES } from "../constants";
import type { PolicyType } from "../types";
import type { AIRequestType } from "./prompts";

const MAX_CONTEXT_CHARS = 12_000;
const MAX_TEMPLATES = 12;
const MAX_TEXT_CHARS = 1_600;
const MAX_ITEM_CHARS = 600;

type SeedPolicy = {
  policyType?: string;
  declaration?: { preface?: unknown; declaration?: unknown; scope?: unknown };
  focusAreas?: unknown;
  qualitative?: unknown;
  quantitative?: unknown;
  sdgs?: unknown;
  responsibilities?: unknown;
  monitoring?: unknown;
  reviewMechanism?: unknown;
};

type SeedTemplate = {
  name?: unknown;
  policy?: SeedPolicy;
};

type ContextCandidate = {
  score: number;
  value: Record<string, unknown>;
};

type CompactTarget = {
  target: string;
  baseline: string;
  deadline: string;
  reportingFrequency?: string;
};

const templateCache = new Map<string, SeedTemplate[]>();

function compactText(value: unknown, maxChars = MAX_ITEM_CHARS): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars - 1).trimEnd()}…`;
}

function compactStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => compactText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !["and", "the", "for", "with", "this", "area"].includes(token))
  );
}

function relevanceScore(candidate: string, areaName?: string): number {
  if (!areaName) return 0;
  const query = tokens(areaName);
  if (query.size === 0) return 0;
  const candidateTokens = tokens(candidate);
  let overlap = 0;
  query.forEach((token) => {
    if (candidateTokens.has(token)) overlap += 1;
  });
  return overlap / query.size;
}

function bestQualitativeArea(value: unknown, areaName?: string): { area: string; objectives: string[]; score: number } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const areas = Object.entries(value as Record<string, unknown>)
    .map(([area, objectives]) => ({
      area,
      objectives: compactStringList(objectives, 5),
      score: relevanceScore(area, areaName),
    }))
    .filter((area) => area.objectives.length > 0)
    .sort((a, b) => b.score - a.score || a.area.localeCompare(b.area));
  return areas[0];
}

function bestQuantitativeArea(value: unknown, areaName?: string): { area: string; targets: CompactTarget[]; score: number } | undefined {
  if (!Array.isArray(value)) return undefined;
  const areas = value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
      const record = entry as Record<string, unknown>;
      const area = compactText(record.area, 240);
      if (!area || !Array.isArray(record.targets)) return undefined;
      const targets = record.targets.slice(0, 4).map((target): CompactTarget | undefined => {
        if (!target || typeof target !== "object" || Array.isArray(target)) return undefined;
        const item = target as Record<string, unknown>;
        const compactTarget = compactText(item.target);
        if (!compactTarget) return undefined;
        return {
          target: compactTarget,
          baseline: compactText(item.baseline, 100) || "",
          deadline: compactText(item.deadline, 100) || "",
          reportingFrequency: compactText(item.reportingFrequency, 100) || undefined,
        };
      }).filter((target): target is CompactTarget => Boolean(target));
      if (targets.length === 0) return undefined;
      return { area, targets, score: relevanceScore(area, areaName) };
    })
    .filter((area): area is { area: string; targets: CompactTarget[]; score: number } => Boolean(area))
    .sort((a, b) => b.score - a.score || a.area.localeCompare(b.area));
  return areas[0];
}

function buildCandidate(template: SeedTemplate, requestType: AIRequestType, areaName?: string): ContextCandidate | undefined {
  const policy = template.policy;
  if (!policy) return undefined;
  const templateName = compactText(template.name, 180) || "Reference policy";
  const base = { template: templateName };

  switch (requestType) {
    case "preface":
    case "declaration":
    case "scope": {
      const text = compactText(policy.declaration?.[requestType], MAX_TEXT_CHARS);
      return text ? { score: 0, value: { ...base, [requestType]: text } } : undefined;
    }
    case "focus": {
      const focusAreas = compactStringList(policy.focusAreas, 12);
      return focusAreas.length ? { score: 0, value: { ...base, focusAreas } } : undefined;
    }
    case "qualitative": {
      const selected = bestQualitativeArea(policy.qualitative, areaName);
      return selected ? {
        score: selected.score,
        value: { ...base, area: selected.area, objectives: selected.objectives },
      } : undefined;
    }
    case "quantitative":
    case "quantitative-topic":
    case "quantitative-refine": {
      const selected = bestQuantitativeArea(policy.quantitative, areaName);
      return selected ? {
        score: selected.score,
        value: { ...base, area: selected.area, targets: selected.targets },
      } : undefined;
    }
    case "sdg": {
      const sdgs = Array.isArray(policy.sdgs)
        ? policy.sdgs.filter((sdg): sdg is number => Number.isInteger(sdg) && Number(sdg) >= 1 && Number(sdg) <= 17).slice(0, 17)
        : [];
      return sdgs.length ? { score: 0, value: { ...base, sdgs } } : undefined;
    }
    case "responsibilities": {
      if (!Array.isArray(policy.responsibilities)) return undefined;
      const responsibilities = policy.responsibilities.slice(0, 7).map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
        const record = entry as Record<string, unknown>;
        const role = compactText(record.role, 180);
        const duty = compactText(record.duty);
        return role && duty ? { role, duty } : undefined;
      }).filter(Boolean);
      return responsibilities.length ? { score: 0, value: { ...base, responsibilities } } : undefined;
    }
    case "monitoring": {
      const monitoring = compactText(policy.monitoring, MAX_TEXT_CHARS);
      return monitoring ? { score: 0, value: { ...base, monitoring } } : undefined;
    }
    case "review": {
      const reviewMechanism = compactText(policy.reviewMechanism, MAX_TEXT_CHARS);
      return reviewMechanism ? { score: 0, value: { ...base, reviewMechanism } } : undefined;
    }
    case "all": {
      const declaration = compactText(policy.declaration?.declaration, 700);
      const focusAreas = compactStringList(policy.focusAreas, 6);
      return declaration || focusAreas.length
        ? { score: 0, value: { ...base, declaration, focusAreas } }
        : undefined;
    }
  }
}

function readTemplates(seedDirectory: string): SeedTemplate[] {
  const cached = templateCache.get(seedDirectory);
  if (cached) return cached;

  const templates = fs.readdirSync(seedDirectory)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .flatMap((file) => {
      try {
        return [JSON.parse(fs.readFileSync(path.join(seedDirectory, file), "utf8")) as SeedTemplate];
      } catch (error) {
        console.warn(`Skipping invalid policy template ${file}`, error);
        return [];
      }
    });
  templateCache.set(seedDirectory, templates);
  return templates;
}

export type TemplateContextInput = {
  policyType: PolicyType;
  requestType: AIRequestType;
  areaName?: string;
  seedDirectory?: string;
};

export function buildTemplateContext({
  policyType,
  requestType,
  areaName,
  seedDirectory = path.join(process.cwd(), "data", "seed-policies"),
}: TemplateContextInput): string {
  const profile = POLICY_PROFILES[policyType];
  if (!profile) throw new Error(`Unsupported policy type: ${policyType}`);

  const matchingTemplates = readTemplates(seedDirectory)
    .filter((template) => template.policy?.policyType === policyType);
  const candidates = matchingTemplates
    .map((template) => buildCandidate(template, requestType, areaName))
    .filter((candidate): candidate is ContextCandidate => Boolean(candidate))
    .sort((a, b) => b.score - a.score || String(a.value.template).localeCompare(String(b.value.template)));

  const preamble = `Reference templates scoped to ${profile.label} and the ${requestType} section only. Use them as drafting evidence; adapt language to the user's company and never copy template-specific company facts or targets without confirmation.\n`;
  const included: Record<string, unknown>[] = [];
  for (const candidate of candidates) {
    if (included.length >= MAX_TEMPLATES) break;
    const next = [...included, candidate.value];
    if ((preamble + JSON.stringify(next)).length <= MAX_CONTEXT_CHARS) included.push(candidate.value);
  }

  if (included.length === 0) {
    return `${preamble}No matching section examples were available; follow the selected policy profile and the user's supplied content.`;
  }
  return `${preamble}${JSON.stringify(included)}`;
}
