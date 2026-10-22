/**
 * Browser-side client for the SOP AI route. The UI imports only these
 * functions; their bodies are implemented with the route
 * (app/api/documents/sop/ai) and the generation queue.
 */
import { parsePartialJson } from "../ai/partial-json";
import type { SopAiEvent, SopAiRequest, SopAiResult, SopGenerationState } from "./ai-contract";
import { createGenerationQueue, type GenerationQueueHandle } from "./generation-queue";
import type { SopManual } from "./types";

export type { GenerationQueueHandle } from "./generation-queue";

export type StreamSopOptions = {
  orgId: number;
  manualId: string;
  signal?: AbortSignal;
  /** Called with the partial result parsed so far. */
  onPartial?: (partial: unknown) => void;
};

const NDJSON = "application/x-ndjson";
/** Partial parsing is O(length); at most this often while text streams in. */
const PARTIAL_PARSE_INTERVAL_MS = 80;

/** True when the server has no AI to call (no Anthropic key), so the UI can say so plainly. */
export function isAiUnavailable(cause: unknown): boolean {
  return cause instanceof Error && /not wired up|API key is not configured/i.test(cause.message);
}

export function sopAiUrl(orgId: number, manualId: string) {
  return `/api/documents/sop/ai?orgId=${encodeURIComponent(String(orgId))}&manualId=${encodeURIComponent(manualId)}`;
}

/** Streams one AI request and resolves with its final result. */
export async function streamSopAi(request: SopAiRequest, options: StreamSopOptions): Promise<SopAiResult> {
  const response = await fetch(sopAiUrl(options.orgId, options.manualId), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: NDJSON },
    body: JSON.stringify(request),
    signal: options.signal,
    cache: "no-store",
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({})) as { error?: unknown };
    throw new Error(typeof body.error === "string" && body.error ? body.error : "The AI request failed.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let lastParse = 0;
  let parsedLength = 0;
  let result: SopAiResult | undefined;

  const emitPartial = (force: boolean) => {
    if (!options.onPartial || text.length === parsedLength) return;
    const now = Date.now();
    if (!force && now - lastParse < PARTIAL_PARSE_INTERVAL_MS) return;
    lastParse = now;
    parsedLength = text.length;
    const partial = parsePartialJson(text);
    if (partial !== undefined) options.onPartial(partial);
  };

  const handle = (line: string) => {
    if (!line.trim()) return;
    let event: SopAiEvent;
    try {
      event = JSON.parse(line) as SopAiEvent;
    } catch {
      return;
    }
    if ("delta" in event) {
      text += event.delta;
      // The first text always reports, so the queue knows the request is under way.
      emitPartial(parsedLength === 0);
    } else if ("error" in event) {
      throw new Error(event.error);
    } else if ("done" in event) {
      result = event.result;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        handle(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    handle(buffer + decoder.decode());
  } finally {
    reader.releaseLock();
  }
  if (!result) {
    if (options.signal?.aborted) throw new DOMException("The request was stopped.", "AbortError");
    throw new Error("The AI response ended early. Please try again.");
  }
  emitPartial(true);
  return result;
}

/**
 * Writes the given SOPs (and the front matter, when asked) with a fixed
 * concurrency, reporting progress per SOP and applying each finished SOP
 * through `onSopDone`.
 */
export function startManualGeneration(options: {
  orgId: number;
  manualId: string;
  getManual: () => SopManual;
  sopIds: string[];
  includeFrontMatter: boolean;
  concurrency?: number;
  onState: (state: SopGenerationState) => void;
  onSopDone: (sopId: string, result: Extract<SopAiResult, { type: "sop" }>) => void;
  onFrontMatterDone?: (result: Extract<SopAiResult, { type: "front-matter" }>) => void;
  /** Called when the front matter could not be written (after one retry) or was stopped. */
  onFrontMatterError?: (message: string) => void;
}): GenerationQueueHandle {
  const { orgId, manualId, ...queue } = options;
  return createGenerationQueue({
    ...queue,
    stream: (request, { signal, onPartial }) => streamSopAi(request, { orgId, manualId, signal, onPartial }),
  });
}
