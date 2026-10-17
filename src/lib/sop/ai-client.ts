/**
 * Browser-side client for the SOP AI route. The UI imports only these
 * functions; their bodies are implemented with the route
 * (app/api/documents/sop/ai) and the generation queue.
 */
import type { SopAiRequest, SopAiResult, SopGenerationState } from "./ai-contract";
import type { SopManual } from "./types";

export type StreamSopOptions = {
  orgId: number;
  manualId: string;
  signal?: AbortSignal;
  /** Called with the partial result parsed so far. */
  onPartial?: (partial: unknown) => void;
};

/** Streams one AI request and resolves with its final result. */
export async function streamSopAi(request: SopAiRequest, options: StreamSopOptions): Promise<SopAiResult> {
  void request;
  void options;
  throw new Error("SOP AI is not wired up yet.");
}

export type GenerationQueueHandle = {
  /** Stops all running and queued SOPs. */
  cancel(): void;
  /** Retries one failed SOP. */
  retry(sopId: string): void;
};

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
}): GenerationQueueHandle {
  void options;
  throw new Error("SOP generation is not wired up yet.");
}
