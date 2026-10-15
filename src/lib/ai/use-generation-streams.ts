"use client";

import * as React from "react";
import { createTextReveal, type TextReveal, type TextRevealOptions } from "./text-reveal";

export interface GenerationRun {
  reveal: TextReveal;
  signal: AbortSignal;
}

/**
 * Tracks the AI generations running in a step, one per key (a section, a focus
 * area). Each run has a paced text reveal for the streaming surface and an
 * abort signal for the Stop action.
 */
export function useGenerationStreams() {
  type Run = { reveal: TextReveal; controller: AbortController };
  const [runs, setRuns] = React.useState<Record<string, Run>>({});
  // The same runs, readable synchronously from the callbacks below.
  const live = React.useRef<Record<string, Run>>({});

  React.useEffect(() => () => {
    Object.values(live.current).forEach((run) => { run.controller.abort(); run.reveal.dispose(); });
  }, []);

  const start = React.useCallback((key: string, options?: TextRevealOptions): GenerationRun => {
    live.current[key]?.controller.abort();
    const run = { reveal: createTextReveal(options), controller: new AbortController() };
    live.current = { ...live.current, [key]: run };
    setRuns(live.current);
    return { reveal: run.reveal, signal: run.controller.signal };
  }, []);

  const stop = React.useCallback((key: string) => { live.current[key]?.controller.abort(); }, []);

  const end = React.useCallback((key: string, reveal: TextReveal) => {
    if (live.current[key]?.reveal === reveal) {
      const next = { ...live.current };
      delete next[key];
      live.current = next;
      setRuns(next);
    }
    reveal.dispose();
  }, []);

  return {
    busy: (key: string) => Boolean(runs[key]),
    reveal: (key: string) => runs[key]?.reveal,
    start,
    stop,
    end,
  };
}

/** When a stream is stopped mid-sentence, keep only the sentences that finished. */
export function keepFinishedSentences(text: string) {
  const trimmed = text.trimEnd();
  if (/[.!?]["')\]]?$/.test(trimmed)) return trimmed;
  const lastEnd = Math.max(...[". ", "! ", "? ", ".\n", "!\n", "?\n"].map((mark) => trimmed.lastIndexOf(mark)));
  return lastEnd >= 0 ? trimmed.slice(0, lastEnd + 1) : trimmed;
}

/** Separates list items inside one paced reveal, so items appear one after another. */
export const ITEM_BREAK = "\u001e";
/** Separates the fields of one list item, such as a role and its duty. */
export const FIELD_BREAK = "\u001f";
