"use client";

import type { AIContext, AIResponse } from "./prompts";

export async function callAI(ctx: AIContext): Promise<AIResponse> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ctx),
  });
  if (!res.ok) throw new Error(`AI request failed: ${res.status}`);
  return res.json();
}

/** Proofread user-authored text without changing its meaning. */
export async function correctGrammar(text: string): Promise<string> {
  const res = await fetch("/api/grammar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Grammar request failed: ${res.status}`);
  const data = await res.json() as { text?: string };
  return typeof data.text === "string" ? data.text : text;
}
