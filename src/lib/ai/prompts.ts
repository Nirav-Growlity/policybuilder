import type { Policy } from "../types";

export type AIRequestType =
  | "preface"
  | "declaration"
  | "scope"
  | "focus"
  | "qualitative"
  | "quantitative"
  | "quantitative-topic"
  | "quantitative-refine"
  | "sdg"
  | "responsibilities"
  | "monitoring"
  | "review"
  | "all";

export interface AIContext {
  type: AIRequestType;
  policy: Policy;
  areaIndex?: number;
  areaName?: string;
  customPrompt?: string;
  existingContent?: any;
}

export interface AIResponse {
  text?: string;
  areas?: string[];
  objectives?: string[];
  targets?: { target: string; baseline: string; deadline: string; reportingFrequency?: "Annually" | "Target period" }[];
  sdgs?: number[];
  responsibilities?: { role: string; duty: string }[];
  source: "mock" | "claude";
}

export function parseRequestedCount(prompt?: string): number | null {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();
  const digitMatch = lower.match(/\b([1-9])\b/);
  if (digitMatch) return parseInt(digitMatch[1], 10);

  const wordMap: Record<string, number> = {
    one: 1,
    single: 1,
    two: 2,
    double: 2,
    three: 3,
    four: 4,
    five: 5,
  };
  for (const [word, num] of Object.entries(wordMap)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return num;
  }
  return null;
}
