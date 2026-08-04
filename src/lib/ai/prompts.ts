import type { Policy } from "../types";

export type AIRequestType =
  | "preface"
  | "declaration"
  | "scope"
  | "focus"
  | "qualitative"
  | "quantitative"
  | "sdg"
  | "responsibilities"
  | "monitoring"
  | "review"
  | "all";

export interface AIContext {
  type: AIRequestType;
  policy: Policy;
  areaIndex?: number;
}

export interface AIResponse {
  text?: string;
  areas?: string[];
  objectives?: string[];
  targets?: { target: string; baseline: string; deadline: string }[];
  sdgs?: number[];
  responsibilities?: { role: string; duty: string }[];
  source: "mock" | "claude";
}
