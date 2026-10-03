"use client";

import type { AIContext, AIResponse } from "./prompts";
import { useBuilder } from "../store";
import { policyCraftScopeKey, policyCraftUrl, usePolicyCraftScope } from "../policycraft-client-scope";

export async function callAI(ctx: AIContext): Promise<AIResponse> {
  const scope = usePolicyCraftScope.getState().scope;
  if (!scope) throw new Error("Select an organization before generating policy content.");
  const res = await fetch(policyCraftUrl("/api/ai", scope), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...ctx,
      referencePolicy: useBuilder.getState().importedPolicy,
    }),
  });
  if (!res.ok) throw new Error(`AI request failed: ${res.status}`);
  const result = await res.json();
  if (policyCraftScopeKey(scope) !== policyCraftScopeKey(usePolicyCraftScope.getState().scope)) throw new Error("The workspace changed during generation. Generate again in the current organization.");
  return result;
}

/** Proofread user-authored text without changing its meaning. */
export async function correctGrammar(text: string): Promise<string> {
  const scope = usePolicyCraftScope.getState().scope;
  if (!scope) throw new Error("Select an organization before checking policy content.");
  const res = await fetch(policyCraftUrl("/api/grammar", scope), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Grammar request failed: ${res.status}`);
  const data = await res.json() as { text?: string };
  if (policyCraftScopeKey(scope) !== policyCraftScopeKey(usePolicyCraftScope.getState().scope)) throw new Error("The workspace changed during grammar checking.");
  return typeof data.text === "string" ? data.text : text;
}
