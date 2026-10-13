"use client";

import type { AIContext, AIResponse } from "./prompts";
import { useBuilder } from "../store";
import { policyCraftScopeKey, policyCraftUrl, usePolicyCraftScope } from "../policycraft-client-scope";
import { parsePartialJson } from "./partial-json";

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

export interface StreamAIOptions {
  /** Called with the response as it is understood so far, each time new text arrives. */
  onPartial?: (partial: Partial<AIResponse>) => void;
  signal?: AbortSignal;
}

/**
 * Like callAI, but the answer arrives token by token. Partial results are
 * parsed from the model's unfinished JSON. Aborting resolves with whatever
 * had arrived, so a stopped generation can keep the text written so far.
 */
export async function streamAI(ctx: AIContext, { onPartial, signal }: StreamAIOptions = {}): Promise<AIResponse> {
  const scope = usePolicyCraftScope.getState().scope;
  if (!scope) throw new Error("Select an organization before generating policy content.");
  let raw = "";
  let partial: Partial<AIResponse> = {};
  const assertSameScope = () => {
    if (policyCraftScopeKey(scope) !== policyCraftScopeKey(usePolicyCraftScope.getState().scope)) throw new Error("The workspace changed during generation. Generate again in the current organization.");
  };
  try {
    const res = await fetch(policyCraftUrl("/api/ai", scope), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({ ...ctx, referencePolicy: useBuilder.getState().importedPolicy }),
      signal,
    });
    if (!res.ok) throw new Error(`AI request failed: ${res.status}`);
    if (!res.body || !res.headers.get("content-type")?.includes("ndjson")) {
      const result = await res.json() as AIResponse;
      assertSameScope();
      return result;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      let grew = false;
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as { delta?: string; done?: boolean; result?: AIResponse; error?: string };
        if (event.error) throw new Error(event.error);
        if (event.done && event.result) { assertSameScope(); return event.result; }
        if (event.delta) { raw += event.delta; grew = true; }
      }
      if (grew) {
        const parsed = parsePartialJson(raw);
        if (parsed && typeof parsed === "object") {
          partial = parsed as Partial<AIResponse>;
          assertSameScope();
          onPartial?.(partial);
        }
      }
    }
    throw new Error("The generation ended before it finished.");
  } catch (error) {
    if (signal?.aborted) return { ...partial, source: partial.source ?? "openai" } as AIResponse;
    throw error;
  }
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
