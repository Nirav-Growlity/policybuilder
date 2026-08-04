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
