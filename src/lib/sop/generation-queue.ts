/**
 * Writes many SOPs of one manual with a fixed concurrency. Each SOP has its
 * own AbortController and one automatic retry; partial JSON is turned into
 * sections for live display; the front matter runs alongside the SOPs.
 *
 * The first SOP starts alone and the others follow as soon as its first text
 * arrives (or after `warmupMs`): by then its prompt prefix (system text and
 * manual context) is in Claude's cache, so the parallel calls read it instead
 * of each writing it again.
 */
import type { SopAiRequest, SopAiResult, SopGenerationState } from "./ai-contract";
import { partialSectionsFromGenerated } from "./apply-ai-result";
import type { SopManual, SopSection } from "./types";

export const DEFAULT_SOP_CONCURRENCY = 5;
/** One automatic retry per SOP. */
const MAX_ATTEMPTS = 2;

export type SopStreamFn<Request = SopAiRequest, Result = SopAiResult> = (
  request: Request,
  options: { signal: AbortSignal; onPartial: (partial: unknown) => void },
) => Promise<Result>;

/**
 * How the queue talks to one document kind: the request for one item and for
 * the front matter, how to recognise their results, and how to read the
 * sections out of a partial answer. Items are SOPs by default; the employee
 * handbook passes chapters (lib/handbook/ai-client.ts). States keep the field
 * name `sopId` for either kind.
 */
export type GenerationAdapter<Manual, Request, Result, ItemResult extends Result, FrontResult extends Result> = {
  itemRequest: (manual: Manual, itemId: string) => Request;
  frontMatterRequest: (manual: Manual) => Request;
  isItemResult: (result: Result) => result is ItemResult;
  isFrontMatterResult: (result: Result) => result is FrontResult;
  partialSections: (partial: unknown, manual: Manual, itemId: string) => SopSection[];
};

type SopItemResult = Extract<SopAiResult, { type: "sop" }>;
type SopFrontResult = Extract<SopAiResult, { type: "front-matter" }>;

export const SOP_GENERATION_ADAPTER: GenerationAdapter<SopManual, SopAiRequest, SopAiResult, SopItemResult, SopFrontResult> = {
  itemRequest: (manual, sopId) => ({ type: "sop", manual, sopId }),
  frontMatterRequest: (manual) => ({ type: "front-matter", manual }),
  isItemResult: (result): result is SopItemResult => result.type === "sop",
  isFrontMatterResult: (result): result is SopFrontResult => result.type === "front-matter",
  partialSections: (partial, manual, sopId) => {
    // Live sections show the user's headings, as the finished ones will.
    const titles = Object.fromEntries((manual.sops.find((sop) => sop.id === sopId)?.sections ?? []).map((section) => [section.kind, section.title]));
    return partialSectionsFromGenerated(partial, titles);
  },
};

export type ManualGenerationOptions<Manual = SopManual, ItemResult = SopItemResult, FrontResult = SopFrontResult> = {
  getManual: () => Manual;
  sopIds: string[];
  includeFrontMatter: boolean;
  concurrency?: number;
  onState: (state: SopGenerationState) => void;
  onSopDone: (sopId: string, result: ItemResult) => void;
  onFrontMatterDone?: (result: FrontResult) => void;
  /** Called when the front matter failed twice or was cancelled. */
  onFrontMatterError?: (message: string) => void;
};

export type GenerationQueueHandle = {
  /** Stops all running and queued SOPs. */
  cancel(): void;
  /** Retries one failed SOP. */
  retry(sopId: string): void;
};

type Job = {
  sopId: string;
  attempts: number;
  status: SopGenerationState["status"];
  controller?: AbortController;
};

const CANCELLED = "Stopped.";

function messageOf(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Generation failed.";
}

export function createGenerationQueue<
  Manual = SopManual,
  Request = SopAiRequest,
  Result extends { type: string } = SopAiResult,
  ItemResult extends Result = Result & SopItemResult,
  FrontResult extends Result = Result & SopFrontResult,
>(
  options: ManualGenerationOptions<Manual, ItemResult, FrontResult> & {
    stream: SopStreamFn<Request, Result>;
    /** Defaults to SOPs. */
    adapter?: GenerationAdapter<Manual, Request, Result, ItemResult, FrontResult>;
    /** How long the first SOP runs alone before the rest start anyway. */
    warmupMs?: number;
    /** Minimum time between partial-section updates for one SOP. */
    partialIntervalMs?: number;
  },
): GenerationQueueHandle {
  const adapter = options.adapter ?? (SOP_GENERATION_ADAPTER as unknown as GenerationAdapter<Manual, Request, Result, ItemResult, FrontResult>);
  const limit = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_SOP_CONCURRENCY));
  const partialInterval = options.partialIntervalMs ?? 120;
  const jobs = new Map<string, Job>();
  const pending: string[] = [];
  let running = 0;
  let gateOpen = false;
  let gateTimer: ReturnType<typeof setTimeout> | undefined;
  let frontMatter: { controller: AbortController; attempts: number } | undefined;

  const report = (job: Job, extra: Partial<SopGenerationState> = {}) => {
    options.onState({ sopId: job.sopId, status: job.status, ...extra });
  };

  const openGate = () => {
    if (gateOpen) return;
    gateOpen = true;
    if (gateTimer) clearTimeout(gateTimer);
    if (options.includeFrontMatter) void runFrontMatter();
    pump();
  };

  const pump = () => {
    while (running < limit && pending.length) {
      // Until the cache is warm only one SOP runs.
      if (!gateOpen && running > 0) return;
      const job = jobs.get(pending.shift()!);
      if (job && job.status === "queued") void runJob(job);
    }
  };

  async function runJob(job: Job) {
    running += 1;
    const controller = new AbortController();
    job.controller = controller;
    job.attempts += 1;
    job.status = "writing";
    report(job);
    if (!gateOpen && !gateTimer) gateTimer = setTimeout(openGate, options.warmupMs ?? 2_500);
    let lastPartial = 0;
    const manual = options.getManual();
    try {
      const result = await options.stream(
        adapter.itemRequest(manual, job.sopId),
        {
          signal: controller.signal,
          onPartial: (partial) => {
            openGate();
            const now = Date.now();
            if (controller.signal.aborted || now - lastPartial < partialInterval) return;
            lastPartial = now;
            report(job, { partialSections: adapter.partialSections(partial, manual, job.sopId) });
          },
        },
      );
      if (controller.signal.aborted) return;
      if (!adapter.isItemResult(result)) throw new Error("Unexpected result type.");
      job.status = "done";
      report(job);
      // Applying the SOP is the caller's job; if it throws, the AI call must not be retried.
      try { options.onSopDone(job.sopId, result); }
      catch (error) { console.error("Applying a written SOP failed", error); }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (job.attempts < MAX_ATTEMPTS) {
        job.status = "queued";
        pending.unshift(job.sopId);
        report(job);
      } else {
        job.status = "failed";
        report(job, { error: messageOf(error) });
      }
    } finally {
      if (job.controller === controller) job.controller = undefined;
      running -= 1;
      openGate();
      pump();
    }
  }

  async function runFrontMatter() {
    const state = { controller: new AbortController(), attempts: 0 };
    frontMatter = state;
    while (state.attempts < MAX_ATTEMPTS && !state.controller.signal.aborted) {
      state.attempts += 1;
      try {
        const result = await options.stream(
          adapter.frontMatterRequest(options.getManual()),
          { signal: state.controller.signal, onPartial: () => {} },
        );
        if (state.controller.signal.aborted) break;
        if (!adapter.isFrontMatterResult(result)) throw new Error("Unexpected result type.");
        options.onFrontMatterDone?.(result);
        return;
      } catch (error) {
        if (state.controller.signal.aborted) break;
        if (state.attempts >= MAX_ATTEMPTS) options.onFrontMatterError?.(messageOf(error));
      }
    }
    if (state.controller.signal.aborted) options.onFrontMatterError?.(CANCELLED);
  }

  for (const sopId of options.sopIds) {
    if (jobs.has(sopId)) continue;
    const job: Job = { sopId, attempts: 0, status: "queued" };
    jobs.set(sopId, job);
    pending.push(sopId);
    report(job);
  }
  if (!pending.length) openGate();
  pump();

  return {
    cancel() {
      if (gateTimer) clearTimeout(gateTimer);
      gateTimer = undefined;
      pending.length = 0;
      frontMatter?.controller.abort();
      for (const job of jobs.values()) {
        if (job.status !== "queued" && job.status !== "writing") continue;
        job.controller?.abort();
        job.status = "failed";
        report(job, { error: CANCELLED });
      }
    },
    retry(sopId: string) {
      const job = jobs.get(sopId);
      if (!job || job.status !== "failed") return;
      job.attempts = 0;
      job.status = "queued";
      pending.push(sopId);
      report(job);
      pump();
    },
  };
}
